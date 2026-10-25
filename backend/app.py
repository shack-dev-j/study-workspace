"""Server process: HTTP server + background jobs (backup, reminders, window watch)."""

import argparse
import datetime as dt
import json
import os
import socket
import sys
import threading
import time
import webbrowser
from http.server import ThreadingHTTPServer

from . import APP_NAME, VERSION, backup, reminders
from .files import FileStore
from .handler import Handler
from .paths import Paths, ensure_data
from .storage import atomic_write_json, Storage
from .windows import WindowTracker

DEFAULT_PORT = 8765


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = False if sys.platform.startswith("win") else True


class App:
    """Everything the request handler needs (passed as server.ctx)."""

    def __init__(self, paths, host="127.0.0.1", port=DEFAULT_PORT, exit_when_idle=False,
                 verbose=False, jobs=True):
        self.paths = paths
        self.host = host
        self.verbose = verbose
        self.check_host = host in ("127.0.0.1", "localhost", "::1")
        self.exit_when_idle = exit_when_idle
        self.jobs = jobs
        ensure_data(paths)
        self.storage = Storage(paths.data, paths.backups)
        self.files = FileStore(paths.files, paths.trash)
        self.windows = WindowTracker()
        self.stopping = threading.Event()
        self.httpd = self._bind(host, port)
        self.httpd.ctx = self
        self.port = self.httpd.server_address[1]

    # ----- setup -----
    def _bind(self, host, port):
        """Bind to port; if busy, try the next few ports."""
        last = None
        for p in ([port] + list(range(port + 1, port + 20)) if port else [0]):
            try:
                return Server((host, p), Handler)
            except OSError as e:
                last = e
        raise last

    @property
    def url(self):
        h = "127.0.0.1" if self.host in ("0.0.0.0", "::") else self.host
        return f"http://{h}:{self.port}/"

    def log(self, msg):
        line = time.strftime("%Y-%m-%d %H:%M:%S ") + msg
        if self.verbose:
            print(line, file=sys.stderr)
        try:
            with open(self.paths.log_file, "a", encoding="utf-8") as f:
                f.write(line + "\n")
        except OSError:
            pass

    def icon_png(self):
        p = self.paths.app / "desktop" / "icons" / "png" / "128x128" / "study-workspace.png"
        return p if p.exists() else self.paths.icon

    # ----- state file (lets the launcher find a running server) -----
    def write_state(self):
        atomic_write_json(self.paths.state_file, {
            "pid": os.getpid(), "port": self.port, "host": self.host, "url": self.url,
            "version": VERSION, "started": time.strftime("%Y-%m-%dT%H:%M:%S")})

    def clear_state(self):
        try:
            with open(self.paths.state_file, encoding="utf-8") as f:
                if json.load(f).get("pid") == os.getpid():
                    os.unlink(self.paths.state_file)
        except (OSError, ValueError):
            pass

    # ----- background jobs -----
    def _jobs_loop(self):
        last_backup_day = None
        last_reminder = 0.0
        time.sleep(1.0)
        while not self.stopping.is_set():
            try:
                today = dt.date.today()
                if today != last_backup_day:
                    backup.make_backup(self.paths.data, self.paths.backups, today)
                    last_backup_day = today
                if time.time() - last_reminder >= 3600:
                    last_reminder = time.time()
                    sent = reminders.check_and_send(self.storage, icon=self.icon_png())
                    if sent:
                        self.log(f"sent {len(sent)} reminder(s)")
            except Exception as e:
                self.log(f"job error: {e!r}")
            self.stopping.wait(60)

    def _watch_windows(self):
        while not self.stopping.wait(2):
            if self.windows.should_exit():
                self.request_shutdown("no windows left")
                return

    def request_shutdown(self, reason=""):
        if self.stopping.is_set():
            return
        self.log("stopping: " + reason)
        self.stopping.set()
        threading.Thread(target=self.httpd.shutdown, daemon=True).start()

    def serve(self):
        self.write_state()
        self.log(f"{APP_NAME} {VERSION} on {self.url} data={self.paths.data}")
        if self.jobs:
            threading.Thread(target=self._jobs_loop, daemon=True).start()
        if self.exit_when_idle:
            threading.Thread(target=self._watch_windows, daemon=True).start()
        try:
            self.httpd.serve_forever(poll_interval=0.5)
        finally:
            self.stopping.set()
            self.httpd.server_close()
            self.clear_state()


def parse_args(argv=None):
    ap = argparse.ArgumentParser(prog="server.py", description=f"{APP_NAME} local server")
    ap.add_argument("--host", default="127.0.0.1",
                    help="address to listen on (default 127.0.0.1 = this computer only)")
    ap.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"port (default {DEFAULT_PORT})")
    ap.add_argument("--data-root", help="folder that holds data/ and backups/")
    ap.add_argument("--no-browser", action="store_true", help="do not open a browser tab")
    ap.add_argument("--exit-when-idle", action="store_true",
                    help="stop when the last app window closes (used by the launcher)")
    ap.add_argument("--verbose", action="store_true")
    return ap.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    if args.host not in ("127.0.0.1", "localhost", "::1"):
        print("Warning: listening on", args.host, "- other devices on your network can open the app.",
              file=sys.stderr)
    paths = Paths(args.data_root)
    app = App(paths, args.host, args.port, exit_when_idle=args.exit_when_idle, verbose=args.verbose)
    print(f"{APP_NAME} is running at {app.url}  (data: {paths.data})", flush=True)
    print("Press Ctrl+C to stop.", flush=True)
    if not args.no_browser:
        threading.Timer(0.6, lambda: webbrowser.open(app.url)).start()
    try:
        app.serve()
    except KeyboardInterrupt:
        pass
    return 0


def port_free(port, host="127.0.0.1"):
    with socket.socket() as s:
        try:
            s.bind((host, port))
            return True
        except OSError:
            return False

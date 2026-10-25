"""Desktop launcher logic for `study-workspace`.

1. Find a running server (server.json + /api/health) or start one in the
   background with --exit-when-idle.
2. Open the app in its own window:
   a) pywebview (GTK or Qt backend), if installed
   b) Chromium / Brave / Chrome / Edge in --app mode (own profile folder)
   c) the default browser
3. The server stops by itself when the last window closes.

Kept free of GUI imports at module level so it can be tested headless.
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
from contextlib import contextmanager

from . import APP_ID, APP_NAME
from .paths import Paths

BROWSERS = ["chromium", "brave", "brave-browser", "google-chrome-stable", "google-chrome",
            "chromium-browser", "microsoft-edge-stable", "microsoft-edge", "vivaldi-stable"]


# ---------- server ----------
def read_state(paths):
    try:
        with open(paths.state_file, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def health(url, timeout=1.5):
    try:
        with urllib.request.urlopen(url.rstrip("/") + "/api/health", timeout=timeout) as r:
            return json.loads(r.read())
    except (OSError, ValueError):
        return None


def running_url(paths):
    """URL of a healthy server that uses this data folder, or None."""
    st = read_state(paths)
    if not st or not st.get("port"):
        return None
    url = f"http://127.0.0.1:{st['port']}/"
    h = health(url)
    if h and os.path.realpath(h.get("data", "")) == os.path.realpath(str(paths.data)):
        return url
    return None


def post(url, path, body=None, timeout=3):
    data = json.dumps(body or {}).encode()
    req = urllib.request.Request(url.rstrip("/") + path, data=data, method="POST",
                                 headers={"Content-Type": "application/json", "X-Requested-By": "study-workspace"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read() or b"{}")
    except (OSError, ValueError):
        return None


@contextmanager
def start_lock(paths):
    """Stop two launchers from starting two servers at the same moment."""
    paths.root.mkdir(parents=True, exist_ok=True)
    f = open(paths.root / ".launcher.lock", "w")
    try:
        try:
            import fcntl
            fcntl.flock(f, fcntl.LOCK_EX)
        except ImportError:  # Windows: no lock, small race is fine
            pass
        yield
    finally:
        f.close()


def start_server(paths, port=8765, timeout=20, exit_when_idle=True):
    """Start the server in the background. Returns its URL.

    exit_when_idle: the server stops when its last window closes.
    """
    paths.root.mkdir(parents=True, exist_ok=True)
    cmd = [sys.executable, str(paths.app / "server.py"), "--no-browser",
           "--port", str(port), "--data-root", str(paths.root)]
    if exit_when_idle:
        cmd.append("--exit-when-idle")
    log = open(paths.log_file, "a", encoding="utf-8")
    kw = {"stdout": log, "stderr": log, "stdin": subprocess.DEVNULL, "cwd": str(paths.app)}
    if os.name == "posix":
        kw["start_new_session"] = True
    else:
        kw["creationflags"] = getattr(subprocess, "CREATE_NO_WINDOW", 0) | getattr(subprocess, "DETACHED_PROCESS", 0)
    proc = subprocess.Popen(cmd, **kw)
    end = time.time() + timeout
    while time.time() < end:
        url = running_url(paths)
        if url:
            return url
        if proc.poll() is not None:
            break
        time.sleep(0.15)
    raise RuntimeError(f"The server did not start. See {paths.log_file}")


def ensure_server(paths, port=8765, exit_when_idle=True):
    with start_lock(paths):
        return running_url(paths) or start_server(paths, port, exit_when_idle=exit_when_idle)


def stop_server(paths):
    url = running_url(paths)
    if not url:
        return False
    post(url, "/api/shutdown")
    for _ in range(40):
        if not health(url, 0.5):
            return True
        time.sleep(0.1)
    return False


# ---------- windows ----------
def pywebview_available():
    try:
        import webview  # noqa: F401
        return True
    except Exception:
        return False


def find_browser(which=shutil.which):
    for name in BROWSERS:
        exe = which(name)
        if exe:
            return exe
    return None


def choose_backend(force_browser=False, has_webview=None, which=shutil.which):
    """Return ('webview', None) / ('app', exe) / ('browser', None)."""
    if not force_browser and (pywebview_available() if has_webview is None else has_webview):
        return ("webview", None)
    exe = find_browser(which)
    if exe:
        return ("app", exe)
    return ("browser", None)


def app_mode_command(exe, url, profile_dir):
    return [exe, f"--app={url}", f"--user-data-dir={profile_dir}", f"--class={APP_ID}",
            "--no-first-run", "--no-default-browser-check", "--disable-features=Translate"]


def new_window_id():
    return "w" + os.urandom(6).hex()


def open_webview(url, wid):
    """Open a pywebview window and block until it closes."""
    import webview
    try:  # app-id / WM class so Hyprland rules and the icon match
        from gi.repository import GLib
        GLib.set_prgname(APP_ID)
        GLib.set_application_name(APP_NAME)
    except Exception:
        pass
    stop = threading.Event()

    def pinger():
        while not stop.wait(15):
            post(url, "/api/window/ping", {"id": wid})

    post(url, "/api/window/open", {"id": wid})
    threading.Thread(target=pinger, daemon=True).start()
    webview.create_window(APP_NAME, f"{url}?wid={wid}", width=1280, height=840, min_size=(380, 500),
                          background_color="#0f1216", text_select=True)
    try:
        webview.start(private_mode=False)
    finally:
        stop.set()
        post(url, "/api/window/close", {"id": wid})


def open_window(url, paths, force_browser=False):
    kind, exe = choose_backend(force_browser)
    wid = new_window_id()
    if kind == "webview":
        try:
            open_webview(url, wid)
            return kind
        except Exception as e:  # e.g. GTK/WebKit libraries missing
            print(f"pywebview failed ({e}); trying a browser in app mode.", file=sys.stderr)
            kind, exe = choose_backend(force_browser=True)
    if kind == "app":
        profile = paths.root / "browser-profile"
        profile.mkdir(parents=True, exist_ok=True)
        subprocess.Popen(app_mode_command(exe, f"{url}?wid={wid}", profile),
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=os.name == "posix")
        return kind
    webbrowser.open(f"{url}?wid={wid}")
    return "browser"


def main(argv=None):
    ap = argparse.ArgumentParser(prog="study-workspace", description=f"Open {APP_NAME} in its own window.")
    ap.add_argument("--browser", action="store_true", help="skip pywebview, use a browser in app mode")
    ap.add_argument("--no-window", action="store_true", help="only start the server (it keeps running until --stop)")
    ap.add_argument("--serve", action="store_true",
                    help="run the server in the foreground for the background service (systemd); does nothing if one is running")
    ap.add_argument("--now", action="store_true", help="print what to do now (for bars and scripts)")
    ap.add_argument("--stop", action="store_true", help="stop the running server")
    ap.add_argument("--status", action="store_true", help="show whether the server is running")
    ap.add_argument("--port", type=int, default=8765)
    args = ap.parse_args(argv)
    paths = Paths()
    if args.serve:
        from .app import App
        with start_lock(paths):  # same lock as the window launcher: never two servers
            if running_url(paths):
                print("Already running.")
                return 0
            app = App(paths, port=args.port)
            app.write_state()
        print(f"{APP_NAME} running at {app.url} (data: {paths.data})", flush=True)
        try:
            app.serve()
        except KeyboardInterrupt:
            pass
        return 0
    if args.now:
        url = running_url(paths)
        if not url:
            print("Study Workspace is not running.")
            return 1
        try:
            with urllib.request.urlopen(url + "api/now", timeout=3) as r:
                print(json.loads(r.read()).get("text", ""))
            return 0
        except (OSError, ValueError):
            print("Could not reach Study Workspace.")
            return 1
    if args.stop:
        print("Stopped." if stop_server(paths) else "Not running.")
        return 0
    if args.status:
        url = running_url(paths)
        print(f"Running at {url} (data: {paths.data})" if url else "Not running.")
        print("Window: " + choose_backend(args.browser)[0])
        return 0
    try:
        url = ensure_server(paths, args.port, exit_when_idle=not args.no_window)
    except RuntimeError as e:
        print(e, file=sys.stderr)
        return 1
    if args.no_window:
        print(url)
        return 0
    open_window(url, paths, args.browser)
    return 0

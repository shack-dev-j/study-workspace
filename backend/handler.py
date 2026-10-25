"""HTTP request handler: static files + JSON API.

Security (the server only listens on 127.0.0.1 by default):
- The Host header must be a local name, which blocks DNS-rebinding attacks.
- Requests that change data must send the header "X-Requested-By:
  study-workspace". Other websites can't add that header without a CORS
  preflight, which this server never allows, so they can't change your data.
"""

import email.utils
import json
import os
import re
import tempfile
import time
import urllib.parse
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler
from pathlib import Path

from . import APP_NAME, VERSION, backup, exporter, linked, reminders
from .files import BadName, guess_type, inside
from .storage import MAX_JSON_BYTES, Conflict, UnknownModule

CSRF_HEADER = "X-Requested-By"
CSRF_VALUE = "study-workspace"
LOCAL_HOSTS = {"127.0.0.1", "localhost", "[::1]", "::1"}
# Beacon requests (sent while a page closes) can't carry custom headers.
NO_CSRF = {"/api/window/close"}


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


class Handler(BaseHTTPRequestHandler):
    server_version = "StudyWorkspace/" + VERSION
    protocol_version = "HTTP/1.1"

    # The server object carries `ctx` (see app.App).
    @property
    def ctx(self):
        return self.server.ctx

    def log_message(self, fmt, *args):  # quiet by default
        if self.ctx.verbose:
            super().log_message(fmt, *args)

    # ---------- helpers ----------
    def send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def read_body(self, limit=MAX_JSON_BYTES):
        length = self.headers.get("Content-Length")
        if length is None:
            raise ApiError(411, "Content-Length required")
        try:
            n = int(length)
        except ValueError:
            raise ApiError(400, "bad Content-Length")
        if n < 0 or n > limit:
            raise ApiError(413, "request too large")
        return self.rfile.read(n)

    def read_json(self):
        raw = self.read_body()
        if not raw:
            return {}
        try:
            return json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, ValueError):
            raise ApiError(400, "invalid JSON")

    def query(self):
        return urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)

    def route_path(self):
        return urllib.parse.unquote(urllib.parse.urlsplit(self.path).path)

    def host_ok(self):
        if not self.ctx.check_host:
            return True
        host = (self.headers.get("Host") or "").strip().lower()
        if host.startswith("["):
            name = host.split("]")[0] + "]"
        else:
            name = host.rsplit(":", 1)[0] if ":" in host else host
        return name in LOCAL_HOSTS

    # ---------- dispatch ----------
    def do_GET(self):
        self.dispatch("GET")

    def do_HEAD(self):
        self.dispatch("GET")

    def do_POST(self):
        self.dispatch("POST")

    def do_PUT(self):
        self.dispatch("PUT")

    def do_DELETE(self):
        self.dispatch("DELETE")

    def do_OPTIONS(self):
        # No CORS: other origins are never allowed.
        self.send_response(403)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def dispatch(self, method):
        try:
            if not self.host_ok():
                raise ApiError(403, "bad host")
            path = self.route_path()
            if path.startswith("/api/"):
                if method != "GET" and path not in NO_CSRF and self.headers.get(CSRF_HEADER) != CSRF_VALUE:
                    raise ApiError(403, "missing X-Requested-By header")
                self.api(method, path)
            elif method == "GET":
                self.static(path)
            else:
                raise ApiError(405, "method not allowed")
        except ApiError as e:
            self.close_connection = True
            self.send_json({"error": e.message}, e.status)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as e:  # keep the server alive, report the error
            self.ctx.log(f"error {method} {self.path}: {e!r}")
            try:
                self.send_json({"error": "server error: " + str(e)}, 500)
            except OSError:
                pass

    # ---------- static files ----------
    def static(self, path):
        if path in ("/", "/index.html"):
            target = self.ctx.paths.frontend / "index.html"
            base = self.ctx.paths.frontend
        elif path.startswith("/vendor/"):
            base = self.ctx.paths.vendor
            target = base / path[len("/vendor/"):]
        elif path.startswith("/research/"):
            base = self.ctx.paths.docs / "research"
            target = base / path[len("/research/"):]
        elif path == "/favicon.ico" or path == "/icon.svg":
            base = self.ctx.paths.icon.parent
            target = self.ctx.paths.icon
        else:
            base = self.ctx.paths.frontend
            target = base / path.lstrip("/")
        if ".." in Path(path).parts or not inside(base, target) or not target.is_file():
            raise ApiError(404, "not found")
        self.send_file(target, cache=True)

    def send_file(self, target, cache=False, download_name=None, ctype=None):
        """Send a file with Range support (needed for fast PDF loading)."""
        st = target.stat()
        size = st.st_size
        ctype = ctype or guess_type(target.name)
        if ctype.startswith("text/") or ctype in ("application/javascript", "application/json"):
            ctype += "; charset=utf-8"
        last_mod = email.utils.formatdate(st.st_mtime, usegmt=True)
        if cache and self.headers.get("If-Modified-Since") == last_mod:
            self.send_response(304)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        start, end = 0, size - 1
        status = 200
        rng = self.headers.get("Range")
        if rng and size:
            m = re.match(r"bytes=(\d*)-(\d*)$", rng.strip())
            if m and (m.group(1) or m.group(2)):
                if m.group(1):
                    start = int(m.group(1))
                    end = min(int(m.group(2)), size - 1) if m.group(2) else size - 1
                else:
                    start = max(0, size - int(m.group(2)))
                if start > end or start >= size:
                    self.send_response(416)
                    self.send_header("Content-Range", f"bytes */{size}")
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return
                status = 206
        length = end - start + 1 if size else 0
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(length))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Last-Modified", last_mod)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-cache" if cache else "private, no-cache")
        if status == 206:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        if download_name:
            q = urllib.parse.quote(download_name)
            self.send_header("Content-Disposition", f"attachment; filename*=UTF-8''{q}")
        self.end_headers()
        if self.command == "HEAD" or not length:
            return
        with open(target, "rb") as f:
            f.seek(start)
            left = length
            while left > 0:
                chunk = f.read(min(256 * 1024, left))
                if not chunk:
                    break
                self.wfile.write(chunk)
                left -= len(chunk)

    # ---------- API ----------
    def api(self, method, path):
        ctx = self.ctx
        parts = path.strip("/").split("/")[1:]  # drop "api"
        head = parts[0] if parts else ""

        if head == "health" and method == "GET":
            return self.send_json({"app": APP_NAME, "version": VERSION, "pid": os.getpid(),
                                   "data": str(ctx.paths.data), "portable": ctx.paths.portable,
                                   "notify": reminders.notifier_available()})

        if head == "data" and len(parts) == 2:
            module = parts[1]
            try:
                if method == "GET":
                    return self.send_json(ctx.storage.read(module))
                if method == "PUT":
                    body = self.read_json()
                    if not isinstance(body, dict):
                        raise ApiError(400, "expected a JSON object")
                    rev = body.pop("_rev", None)
                    try:
                        new_rev = ctx.storage.write(module, body, expected_rev=rev)
                    except Conflict as c:
                        raise ApiError(409, f"changed in another window (rev {c.args[0]})")
                    return self.send_json({"ok": True, "_rev": new_rev})
            except UnknownModule:
                raise ApiError(404, "unknown module")
            raise ApiError(405, "method not allowed")

        if head == "files":
            return self.api_files(method, parts)

        if head == "backups":
            if method == "GET":
                return self.send_json({"backups": [p.name for p in backup.list_backups(ctx.paths.backups)]})
            if method == "POST":
                p = backup.make_backup(ctx.paths.data, ctx.paths.backups, force=True)
                return self.send_json({"ok": True, "name": p.name})

        if head == "export" and method == "GET":
            fd, tmp = tempfile.mkstemp(suffix=".zip", dir=ctx.paths.root)
            os.close(fd)
            try:
                exporter.write_export(ctx.paths, tmp)
                name = f"study-workspace-export-{time.strftime('%Y-%m-%d')}.zip"
                self.send_file(Path(tmp), download_name=name, ctype="application/zip")
            finally:
                os.unlink(tmp)
            return

        if head == "restore" and method == "POST":
            length = int(self.headers.get("Content-Length") or -1)
            if length <= 0 or length > exporter.MAX_TOTAL:
                raise ApiError(400, "empty or too large upload")
            fd, tmp = tempfile.mkstemp(suffix=".zip", dir=ctx.paths.root)
            try:
                with os.fdopen(fd, "wb") as f:
                    left = length
                    while left > 0:
                        chunk = self.rfile.read(min(1 << 20, left))
                        if not chunk:
                            raise ApiError(400, "upload ended early")
                        f.write(chunk)
                        left -= len(chunk)
                try:
                    result = exporter.restore(ctx.paths, ctx.storage, tmp)
                except exporter.BadArchive as e:
                    raise ApiError(400, str(e))
                return self.send_json({"ok": True, **result})
            finally:
                if os.path.exists(tmp):
                    os.unlink(tmp)

        if head == "library" and len(parts) == 2 and parts[1] == "scan" and method == "POST":
            body = self.read_json()
            folder = body.get("folder", "")
            folders = ctx.storage.read("settings").get("linkedFolders", [])
            if folder not in folders:
                raise ApiError(400, "add the folder in Settings first")
            try:
                return self.send_json({"folder": folder, "files": linked.scan(folder)})
            except FileNotFoundError:
                raise ApiError(404, "folder not found: " + folder)

        if head == "linked" and method == "GET":
            target = linked.allowed_path(self.query().get("path", [""])[0],
                                         ctx.storage.read("settings").get("linkedFolders", []))
            if not target:
                raise ApiError(404, "file not found in linked folders")
            dl = target.name if self.query().get("download") else None
            return self.send_file(target, download_name=dl)

        if head == "reminders":
            if method == "GET":
                return self.send_json({"items": reminders.collect(ctx.storage),
                                       "notify": reminders.notifier_available()})
            if method == "POST":
                sent = reminders.check_and_send(ctx.storage, icon=ctx.icon_png())
                return self.send_json({"sent": len(sent)})

        if head == "window" and len(parts) == 2 and method == "POST":
            body = self.read_json()
            wid = body.get("id")
            if parts[1] in ("open", "ping"):
                return self.send_json({"ok": ctx.windows.open(wid)})
            if parts[1] == "close":
                ctx.windows.close(wid)
                return self.send_json({"ok": True})

        if head == "import" and len(parts) == 2 and parts[1] == "universities" and method == "POST":
            from . import research_import
            body = self.read_json()
            result = research_import.import_into(ctx.storage, ctx.paths, dry_run=bool(body.get("dryRun")))
            return self.send_json(result)

        if head == "example" and len(parts) == 2 and method == "GET":
            # Built-in content shipped with the app (e.g. practice challenges),
            # so existing users can add new items without losing their data.
            try:
                ctx.storage.check(parts[1])
            except UnknownModule:
                raise ApiError(404, "unknown module")
            p = ctx.paths.example / f"{parts[1]}.json"
            if not p.is_file():
                raise ApiError(404, "no example data")
            return self.send_json(json.loads(p.read_text(encoding="utf-8")))

        if head == "samples" and method == "POST":
            from .samples import remove_samples
            return self.send_json({"removed": remove_samples(ctx.storage)})

        if head == "shutdown" and method == "POST":
            self.send_json({"ok": True})
            ctx.request_shutdown("shutdown requested")
            return

        raise ApiError(404, "not found")

    def api_files(self, method, parts):
        fs = self.ctx.files
        if len(parts) == 1 and method == "POST":
            name = urllib.parse.unquote(self.headers.get("X-Filename") or "")
            length = int(self.headers.get("Content-Length") or -1)
            if length < 0:
                raise ApiError(411, "Content-Length required")
            if length > fs.max_upload:
                raise ApiError(413, "file too large")
            try:
                meta = fs.save(self.rfile, length, name)
            except BadName as e:
                raise ApiError(400, "bad file name: " + str(e))
            except ValueError as e:
                raise ApiError(400, str(e))
            return self.send_json(meta, 201)
        if len(parts) >= 2:
            fid = parts[1]
            p = fs.find(fid)
            if not p:
                raise ApiError(404, "file not found")
            if len(parts) == 3 and parts[2] == "meta" and method == "GET":
                return self.send_json(fs.meta(fid))
            if len(parts) == 2 and method == "GET":
                dl = p.name if self.query().get("download") else None
                return self.send_file(p, download_name=dl)
            if len(parts) == 2 and method == "DELETE":
                fs.to_trash(fid)
                return self.send_json({"ok": True})
        raise ApiError(404, "not found")

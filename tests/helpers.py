"""Test helpers: run a real server on a free port with a temporary data folder."""

import json
import shutil
import tempfile
import threading
import urllib.error
import urllib.request
from pathlib import Path

from backend.app import App
from backend.paths import APP_ROOT, Paths


class TempApp:
    """Context manager: a running App with its own data root."""

    def __init__(self, copy_example=True, **kw):
        self.tmp = Path(tempfile.mkdtemp(prefix="sw-test-"))
        self.kw = kw
        self.copy_example = copy_example

    def __enter__(self):
        self.paths = Paths(self.tmp, app_root=APP_ROOT)
        if not self.copy_example:
            self.paths.example = self.tmp / "no-example"
        self.app = App(self.paths, port=0, jobs=False, **self.kw)
        self.thread = threading.Thread(target=self.app.serve, daemon=True)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.app.port}"
        return self

    def __exit__(self, *exc):
        self.app.request_shutdown("test done")
        self.thread.join(5)
        shutil.rmtree(self.tmp, ignore_errors=True)

    def req(self, method, path, body=None, headers=None, raw=False, csrf=True):
        h = dict(headers or {})
        if csrf:
            h.setdefault("X-Requested-By", "study-workspace")
        data = None
        if body is not None:
            if isinstance(body, (bytes, bytearray)):
                data = bytes(body)
            else:
                data = json.dumps(body).encode()
                h.setdefault("Content-Type", "application/json")
        r = urllib.request.Request(self.base + path, data=data, method=method, headers=h)
        try:
            with urllib.request.urlopen(r, timeout=10) as resp:
                content = resp.read()
                status, rh = resp.status, dict(resp.headers)
        except urllib.error.HTTPError as e:
            content, status, rh = e.read(), e.code, dict(e.headers)
        if raw:
            return status, content, rh
        try:
            return status, json.loads(content or b"null")
        except ValueError:
            return status, content

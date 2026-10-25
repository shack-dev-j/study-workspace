"""Track open app windows so the server can stop when the last one closes.

Each window has an id. The page calls open / ping (every 15 s) / close.
The pywebview launcher also pings for its own window from Python.
A window that has not pinged for STALE seconds counts as closed (browsers
slow down timers in hidden tabs, so this is generous).
"""

import threading
import time

STALE = 180
GRACE = 8          # wait this long after the last close (a reload re-opens fast)
FIRST_WINDOW_WAIT = 120


class WindowTracker:
    def __init__(self, clock=time.monotonic):
        self.clock = clock
        self.lock = threading.Lock()
        self.windows = {}
        self.ever_opened = False
        self.started = clock()
        self.empty_since = None

    def _valid(self, wid):
        return isinstance(wid, str) and 0 < len(wid) <= 64

    def open(self, wid):
        if not self._valid(wid):
            return False
        with self.lock:
            self.windows[wid] = self.clock()
            self.ever_opened = True
            self.empty_since = None
        return True

    ping = open

    def close(self, wid):
        with self.lock:
            self.windows.pop(wid, None)
            if not self.windows:
                self.empty_since = self.clock()

    def active(self):
        now = self.clock()
        with self.lock:
            for wid, t in list(self.windows.items()):
                if now - t > STALE:
                    del self.windows[wid]
                    if not self.windows:
                        self.empty_since = now
            return len(self.windows)

    def should_exit(self):
        """True when the server was started for windows and none are left."""
        n = self.active()
        now = self.clock()
        if n:
            return False
        if not self.ever_opened:
            return now - self.started > FIRST_WINDOW_WAIT
        return self.empty_since is not None and now - self.empty_since >= GRACE

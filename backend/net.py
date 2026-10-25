"""Tiny HTTPS JSON client for the optional online features (standard library only)."""

import json
import urllib.error
import urllib.parse
import urllib.request

TIMEOUT = 20


class NetError(Exception):
    """A request failed. str(e) is a short message for the user."""

    def __init__(self, message, status=None):
        super().__init__(message)
        self.status = status


def request(method, url, *, headers=None, params=None, body=None, timeout=TIMEOUT, opener=None):
    """Send a request and return the parsed JSON (or {} for an empty reply)."""
    if params:
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
    data = None
    headers = dict(headers or {})
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    headers.setdefault("User-Agent", "StudyWorkspace/2")
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    open_ = opener or urllib.request.urlopen
    try:
        with open_(req, timeout=timeout) as r:
            raw = r.read()
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = e.read().decode("utf-8", "replace")[:300]
        except Exception:
            pass
        msg = {401: "the key or token was refused (401)", 403: "access denied (403)",
               404: "not found (404)", 429: "too many requests, try again later (429)"}.get(e.code, f"HTTP {e.code}")
        raise NetError(f"{msg}{': ' + _short(detail) if detail and e.code not in (401, 403) else ''}", e.code)
    except (urllib.error.URLError, OSError) as e:
        raise NetError("no connection (are you online?)")
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except ValueError:
        raise NetError("the service sent an unexpected reply")


def _short(text):
    try:
        j = json.loads(text)
        if isinstance(j, dict):
            err = j.get("error")
            if isinstance(err, dict):
                return str(err.get("message", ""))[:200]
            if err:
                return str(err)[:200]
    except ValueError:
        pass
    return text[:200]

import json
import unittest

from tests.helpers import TempApp


class ServerTests(unittest.TestCase):
    def test_health_and_static(self):
        with TempApp() as t:
            s, body = t.req("GET", "/api/health")
            self.assertEqual(s, 200)
            self.assertEqual(body["app"], "Study Workspace")
            s, html, h = t.req("GET", "/", raw=True)
            self.assertEqual(s, 200)
            self.assertIn(b"<html", html.lower())
            self.assertTrue(h["Content-Type"].startswith("text/html"))

    def test_static_path_escape_blocked(self):
        with TempApp() as t:
            for p in ("/../server.py", "/%2e%2e/server.py", "/vendor/../../server.py", "/research/../../CLAUDE.md"):
                s, _, _ = t.req("GET", p, raw=True)
                self.assertEqual(s, 404, p)

    def test_listens_on_localhost_only(self):
        with TempApp() as t:
            self.assertEqual(t.app.httpd.server_address[0], "127.0.0.1")

    def test_bad_host_header_refused(self):
        with TempApp() as t:
            s, _ = t.req("GET", "/api/health", headers={"Host": "evil.example:80"})
            self.assertEqual(s, 403)

    def test_csrf_header_required_for_writes(self):
        with TempApp() as t:
            s, _ = t.req("PUT", "/api/data/homework", {"items": []}, csrf=False)
            self.assertEqual(s, 403)

    def test_data_round_trip_and_conflict(self):
        with TempApp() as t:
            s, d = t.req("GET", "/api/data/homework")
            self.assertEqual(s, 200)
            rev = d["_rev"]
            d["items"] = [{"id": "a", "title": "Read chapter 3"}]
            s, r = t.req("PUT", "/api/data/homework", d)
            self.assertEqual(s, 200)
            self.assertEqual(r["_rev"], rev + 1)
            s, d2 = t.req("GET", "/api/data/homework")
            self.assertEqual(d2["items"][0]["title"], "Read chapter 3")
            # Writing with the old rev is refused.
            d["_rev"] = rev
            s, _ = t.req("PUT", "/api/data/homework", d)
            self.assertEqual(s, 409)

    def test_unknown_module(self):
        with TempApp() as t:
            s, _ = t.req("GET", "/api/data/passwords")
            self.assertEqual(s, 404)
            s, _ = t.req("PUT", "/api/data/..%2fsettings", {})
            self.assertEqual(s, 404)

    def test_invalid_json(self):
        with TempApp() as t:
            s, _ = t.req("PUT", "/api/data/homework", b"{not json", headers={"Content-Type": "application/json"})
            self.assertEqual(s, 400)

    def test_window_tracking_endpoints(self):
        with TempApp() as t:
            s, r = t.req("POST", "/api/window/open", {"id": "w1"})
            self.assertTrue(r["ok"])
            self.assertEqual(t.app.windows.active(), 1)
            s, _ = t.req("POST", "/api/window/close", {"id": "w1"}, csrf=False)
            self.assertEqual(t.app.windows.active(), 0)


if __name__ == "__main__":
    unittest.main()

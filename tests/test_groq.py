"""Groq (OpenAI-compatible) provider: chat with tool calls, undo, confirm, model list, routes."""
import datetime as dt
import json
import unittest
from unittest import mock

from backend import ai, assistant, gemini, groq, net
from tests.helpers import TempApp
from tests.test_integrations import _Resp

TODAY = dt.date(2026, 10, 26)


class ScriptedGroq:
    """Answers /chat/completions calls from a list of replies, one per call."""

    def __init__(self, replies):
        self.replies = list(replies)
        self.requests = []

    def __call__(self, req, timeout=None):
        self.requests.append(req)
        r = self.replies.pop(0)
        if isinstance(r, Exception):
            raise r
        return _Resp(json.dumps(r).encode())

    def body(self, i):
        return json.loads(self.requests[i].data)


def tool(name, n=1, **args):
    return {"choices": [{"message": {"role": "assistant", "content": None, "reasoning": "thinking…", "tool_calls": [
        {"id": f"call_{n}", "type": "function", "function": {"name": name, "arguments": json.dumps(args)}}]}}]}


def text(t):
    return {"choices": [{"message": {"role": "assistant", "content": t}}]}


class GroqAssistantTests(unittest.TestCase):
    def test_add_then_undo(self):
        with TempApp() as t:
            st = t.app.storage
            g = ScriptedGroq([
                tool("add_item", module="homework", fields_json=json.dumps({"title": "Maths P1 w23", "subject": "Maths", "due": "2026-10-29", "minutes": 90})),
                tool("replan_day", 2, date="2026-10-26"),
                text("Added and planned."),
            ])
            chat = assistant.send(st, "gsk_test", "", "add maths p1", opener=g, today=TODAY, provider="groq")
            self.assertEqual(chat["messages"][-1]["text"], "Added and planned.")
            req = g.requests[0]
            self.assertTrue(req.full_url.endswith("/chat/completions"))
            self.assertEqual(req.get_header("Authorization"), "Bearer gsk_test")
            b0 = g.body(0)
            self.assertEqual(b0["model"], groq.DEFAULT_MODEL)
            self.assertEqual(b0["messages"][0]["role"], "system")
            names = [x["function"]["name"] for x in b0["tools"]]
            self.assertIn("add_item", names)
            self.assertEqual(b0["tools"][0]["function"]["parameters"]["type"], "object")
            # The tool result goes back as a "tool" message with the call id; "reasoning" is not sent back.
            b1 = g.body(1)
            self.assertEqual(b1["messages"][-1]["role"], "tool")
            self.assertEqual(b1["messages"][-1]["tool_call_id"], "call_1")
            self.assertNotIn("reasoning", b1["messages"][-2])
            self.assertEqual(b1["messages"][-2]["tool_calls"][0]["id"], "call_1")
            ch = chat["messages"][-1]["changes"]
            self.assertEqual((len(ch), ch[0]["action"]), (1, "add"))
            assistant.undo(st, ch[0]["id"])
            self.assertFalse([i for i in st.read("homework")["items"] if i["title"] == "Maths P1 w23"])

    def test_delete_needs_confirmation(self):
        with TempApp() as t:
            st = t.app.storage
            first = st.read("homework")["items"][0]
            g = ScriptedGroq([tool("delete_item", module="homework", id=first["id"]), text("Confirm please.")])
            chat = assistant.send(st, "k", "", "delete it", opener=g, today=TODAY, provider="groq")
            self.assertTrue(any(i["id"] == first["id"] for i in st.read("homework")["items"]))
            p = chat["messages"][-1]["pending"][0]
            assistant.confirm(st, p["id"], True)
            self.assertFalse(any(i["id"] == first["id"] for i in st.read("homework")["items"]))

    def test_bad_arguments_are_reported_to_the_model(self):
        with TempApp() as t:
            st = t.app.storage
            bad = {"choices": [{"message": {"role": "assistant", "content": "", "tool_calls": [
                {"id": "c1", "type": "function", "function": {"name": "add_item", "arguments": "{not json"}},
                {"id": "c2", "type": "function", "function": {"name": "add_item", "arguments": json.dumps({"module": "homework", "fields_json": '{"due": "soon"}'})}},
                {"id": "c3", "type": "function", "function": {"name": "rm_rf", "arguments": "{}"}}]}}]}
            before = len(st.read("homework")["items"])
            g = ScriptedGroq([bad, text("Sorry.")])
            chat = assistant.send(st, "k", "", "x", opener=g, today=TODAY, provider="groq")
            self.assertEqual(len(st.read("homework")["items"]), before)
            self.assertEqual(chat["messages"][-1]["changes"], [])
            results = [json.loads(m["content"]) for m in g.body(1)["messages"] if m["role"] == "tool"]
            self.assertEqual(len(results), 3)
            self.assertTrue(all("error" in r for r in results))

    def test_error_after_change_keeps_change(self):
        with TempApp() as t:
            st = t.app.storage
            g = ScriptedGroq([tool("add_item", module="deadlines", fields_json='{"title": "IELTS", "date": "2026-12-01"}'),
                              net.NetError("too many requests, try again later (429)", 429)])
            chat = assistant.send(st, "k", "", "add ielts", opener=g, today=TODAY, provider="groq")
            self.assertIn("Groq stopped with an error", chat["messages"][-1]["text"])
            self.assertEqual(len(chat["messages"][-1]["changes"]), 1)

    def test_broken_tool_call_is_retried_once(self):
        with TempApp() as t:
            err = net.NetError("HTTP 400: Failed to call a function. Please adjust your prompt.", 400)
            g = ScriptedGroq([err, text("Hi")])
            chat = assistant.send(t.app.storage, "k", "", "hi", opener=g, today=TODAY, provider="groq")
            self.assertEqual(chat["messages"][-1]["text"], "Hi")
            g = ScriptedGroq([err, err])
            with self.assertRaises(net.NetError):
                assistant.send(t.app.storage, "k", "", "hi", opener=g, today=TODAY, provider="groq")

    def test_generate_and_models(self):
        g = ScriptedGroq([text('{"steps": [{"step": "Read the question", "minutes": 10}]}'),
                          {"data": [{"id": "llama-3.3-70b-versatile"}, {"id": "whisper-large-v3"}, {"id": "openai/gpt-oss-120b"},
                                    {"id": "meta-llama/llama-prompt-guard-2-22m"}]}])
        steps = gemini.break_down("k", "Essay", opener=g, gen=groq.generate)
        self.assertEqual(steps, [{"step": "Read the question", "minutes": 10}])
        self.assertEqual(g.body(0)["response_format"], {"type": "json_object"})
        self.assertEqual(groq.list_models("k", opener=g), ["llama-3.3-70b-versatile", "openai/gpt-oss-120b"])
        with self.assertRaises(net.NetError):
            groq.generate("k", "hi", model="bad model; rm", opener=g)


def online(fake):
    """Send the server's outgoing requests to fake (the test client itself still uses the real urlopen)."""
    real = net.request
    return mock.patch.object(net, "request", lambda *a, **kw: real(*a, **{**kw, "opener": fake}))


class ProviderRouteTests(unittest.TestCase):
    def test_groq_is_default_and_used_by_routes(self):
        with TempApp() as t:
            s, st = t.req("GET", "/api/secrets")
            self.assertEqual((st["provider"], st["ai"]), ("groq", False))
            s, r = t.req("POST", "/api/ai/chat", {"message": "hi"})
            self.assertEqual(s, 400)
            self.assertIn("Groq API key", r["error"])
            t.req("PUT", "/api/secrets", {"groq_key": "gsk_abc", "gemini_key": "g"})
            s, st = t.req("GET", "/api/secrets")
            self.assertEqual((st["provider"], st["ai"], st["groq"]), ("groq", True, True))
            self.assertNotIn("gsk_abc", json.dumps(st))
            g = ScriptedGroq([text("Hello!")])
            with online(g):
                s, chat = t.req("POST", "/api/ai/chat", {"message": "hi"})
            self.assertEqual((s, chat["messages"][-1]["text"]), (200, "Hello!"))
            self.assertIn("api.groq.com", g.requests[0].full_url)
            # Choosing Gemini in settings switches the service.
            settings = t.app.storage.read("settings")
            settings["aiProvider"] = "gemini"
            t.app.storage.write("settings", settings)
            self.assertEqual(ai.active(t.app.storage.read("settings"), t.paths.data), "gemini")
            g2 = ScriptedGroq([{"candidates": [{"content": {"parts": [{"text": "Hi from Gemini"}]}}]}])
            with online(g2):
                s, chat = t.req("POST", "/api/ai/chat", {"message": "hi"})
            self.assertEqual(chat["messages"][-1]["text"], "Hi from Gemini")
            self.assertIn("generativelanguage", g2.requests[0].full_url)
            # Model list for one service on request.
            g3 = ScriptedGroq([{"data": [{"id": "llama-3.1-8b-instant"}]}])
            with online(g3):
                s, r = t.req("GET", "/api/ai/models?provider=groq")
            self.assertEqual((r["provider"], r["models"]), ("groq", ["llama-3.1-8b-instant"]))


if __name__ == "__main__":
    unittest.main()

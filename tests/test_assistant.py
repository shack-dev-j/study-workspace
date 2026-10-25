"""AI assistant: tool calls change data, every change can be undone, deletes need confirmation."""
import datetime as dt
import json
import unittest

from backend import assistant, net
from tests.helpers import TempApp
from tests.test_integrations import _Resp


class ScriptedGemini:
    """Answers generateContent calls from a list of replies, one per call."""

    def __init__(self, replies):
        self.replies = list(replies)
        self.bodies = []

    def __call__(self, req, timeout=None):
        self.bodies.append(json.loads(req.data))
        r = self.replies.pop(0)
        if isinstance(r, Exception):
            raise r
        return _Resp(json.dumps(r).encode())


def call(name, **args):
    return {"candidates": [{"content": {"role": "model", "parts": [{"functionCall": {"name": name, "args": args}}]}}]}


def text(t):
    return {"candidates": [{"content": {"role": "model", "parts": [{"text": t}]}}]}


TODAY = dt.date(2026, 10, 26)


class AssistantTests(unittest.TestCase):
    def test_add_homework_then_undo(self):
        with TempApp() as t:
            st = t.app.storage
            g = ScriptedGemini([
                call("add_item", module="homework", fields_json=json.dumps({"title": "Physics P2 s23", "subject": "Physics", "due": "2026-10-28", "minutes": 60})),
                call("replan_day", date="2026-10-26"),
                text("Added it and planned your day."),
            ])
            chat = assistant.send(st, "k", "", "Add Physics P2 s23 for Wednesday, 1 hour", opener=g, today=TODAY)
            self.assertEqual(chat["messages"][-1]["text"], "Added it and planned your day.")
            ch = chat["messages"][-1]["changes"]
            self.assertEqual((len(ch), ch[0]["action"], ch[0]["module"]), (1, "add", "homework"))
            hw = [i for i in st.read("homework")["items"] if i["title"] == "Physics P2 s23"]
            self.assertEqual((len(hw), hw[0]["minutes"], hw[0]["status"]), (1, 60, "todo"))
            # The function result was sent back to Gemini, with the key in a header (not the URL).
            self.assertIn("functionResponse", json.dumps(g.bodies[1]))
            self.assertTrue(list((st.backups / "assistant").glob("homework-*.json")))
            assistant.undo(st, ch[0]["id"])
            self.assertFalse([i for i in st.read("homework")["items"] if i["title"] == "Physics P2 s23"])
            with self.assertRaises(assistant.ToolError):
                assistant.undo(st, ch[0]["id"])
            # The chat is saved and listed.
            self.assertEqual(assistant.list_chats(st)[0]["id"], chat["id"])
            self.assertTrue(assistant.get_chat(st, chat["id"])["messages"][-1]["changes"][0]["undone"])

    def test_update_and_undo_restores_old_values(self):
        with TempApp() as t:
            st = t.app.storage
            first = st.read("homework")["items"][0]
            g = ScriptedGemini([call("update_item", module="homework", id=first["id"], fields_json='{"priority": "high", "due": "2026-10-30"}'),
                                text("Done.")])
            chat = assistant.send(st, "k", "", "make it high priority", opener=g, today=TODAY)
            now = next(i for i in st.read("homework")["items"] if i["id"] == first["id"])
            self.assertEqual((now["priority"], now["due"]), ("high", "2026-10-30"))
            assistant.undo(st, chat["messages"][-1]["changes"][0]["id"])
            back = next(i for i in st.read("homework")["items"] if i["id"] == first["id"])
            self.assertEqual((back.get("priority"), back.get("due")), (first.get("priority"), first.get("due")))

    def test_delete_needs_confirmation(self):
        with TempApp() as t:
            st = t.app.storage
            first = st.read("homework")["items"][0]
            g = ScriptedGemini([call("delete_item", module="homework", id=first["id"]), text("Please confirm.")])
            chat = assistant.send(st, "k", "", "delete it", opener=g, today=TODAY)
            self.assertIn(first["id"], [i["id"] for i in st.read("homework")["items"]])  # not deleted yet
            p = chat["messages"][-1]["pending"][0]
            assistant.confirm(st, p["id"], False)
            self.assertIn(first["id"], [i["id"] for i in st.read("homework")["items"]])
            g = ScriptedGemini([call("delete_item", module="homework", id=first["id"]), text("Please confirm.")])
            chat = assistant.send(st, "k", chat["id"], "yes delete it", opener=g, today=TODAY)
            p = chat["messages"][-1]["pending"][0]
            assistant.confirm(st, p["id"], True)
            self.assertNotIn(first["id"], [i["id"] for i in st.read("homework")["items"]])
            c = assistant.get_chat(st, chat["id"])["messages"][-1]
            self.assertTrue(c["resolved"][0]["deleted"])
            assistant.undo(st, c["changes"][-1]["id"])   # undo the delete
            self.assertIn(first["id"], [i["id"] for i in st.read("homework")["items"]])

    def test_bad_tool_input_is_reported_to_the_model(self):
        with TempApp() as t:
            st = t.app.storage
            g = ScriptedGemini([call("add_item", module="homework", fields_json='{"title": "x", "password": "y"}'),
                                call("add_item", module="secrets", fields_json='{}'),
                                call("add_item", module="homework", fields_json='{"title": "x", "due": "next week"}'),
                                text("Sorry.")])
            assistant.send(st, "k", "", "do bad things", opener=g, today=TODAY)
            sent = [json.dumps(b["contents"][-1]) for b in g.bodies[1:]]
            self.assertIn("has no field", sent[0])
            self.assertIn("unknown module", sent[1])
            self.assertIn("must be a date", sent[2])
            self.assertFalse([i for i in st.read("homework")["items"] if i.get("title") == "x"])

    def test_topic_level_and_list(self):
        with TempApp() as t:
            st = t.app.storage
            g = ScriptedGemini([call("list_items", module="pastpapers", query="9709 s24", limit=5),
                                call("set_topic_level", subject="maths", topic="quadratics", level=4),
                                text("ok")])
            chat = assistant.send(st, "k", "", "I am good at quadratics", opener=g, today=TODAY)
            listed = json.dumps(g.bodies[1]["contents"][-1])
            self.assertIn("9709", listed)
            maths = next(s for s in st.read("subjects")["items"] if s["id"] == "maths")
            self.assertEqual(next(tp for tp in maths["topics"] if "Quadratics" in tp["name"])["confidence"], 4)
            self.assertIn("level 4", chat["messages"][-1]["changes"][0]["title"])

    def test_network_error_keeps_changes_logged(self):
        with TempApp() as t:
            st = t.app.storage
            g = ScriptedGemini([call("add_item", module="deadlines", fields_json='{"title": "KAIST docs", "date": "2027-09-01"}'),
                                net.NetError("no connection")])
            chat = assistant.send(st, "k", "", "add deadline", opener=g, today=TODAY)
            self.assertIn("stopped with an error", chat["messages"][-1]["text"])
            self.assertEqual(len(chat["messages"][-1]["changes"]), 1)
            g = ScriptedGemini([net.NetError("no connection")])
            with self.assertRaises(net.NetError):
                assistant.send(st, "k", "", "hello", opener=g, today=TODAY)

    def test_api_routes(self):
        with TempApp() as t:
            s, r = t.req("GET", "/api/ai/chats")
            self.assertEqual((s, r["chats"]), (200, []))
            s, r = t.req("POST", "/api/ai/chat", {"message": "hi"})
            self.assertEqual(s, 400)   # no key yet
            s, r = t.req("POST", "/api/ai/undo", {"id": "nope"})
            self.assertEqual(s, 400)


if __name__ == "__main__":
    unittest.main()

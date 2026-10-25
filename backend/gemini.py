"""Gemini AI helper (optional, needs internet and a Google AI Studio API key).

Used for two small things:
- break_down(): split a big task into short steps.
- coach(): a short, honest comment on the day's plan.

The key lives in data/secrets.json. Get one at https://aistudio.google.com/apikey.
The app works fully without it.
"""

import json
import os
import re

from . import net

# SW_GEMINI_BASE lets the browser tests (scripts/e2e.js) use a local fake Gemini.
BASE = os.environ.get("SW_GEMINI_BASE") or "https://generativelanguage.googleapis.com/v1beta"
DEFAULT_MODEL = "gemini-2.5-flash"


def _model(name):
    name = (name or DEFAULT_MODEL).strip()
    if name.startswith("models/"):
        name = name[len("models/"):]
    if not re.fullmatch(r"[A-Za-z0-9._-]{1,80}", name):
        raise net.NetError("bad model name")
    return name


def generate(key, prompt, model=None, json_mode=False, opener=None, max_tokens=4096):
    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.6, "maxOutputTokens": max_tokens},
    }
    if json_mode:
        body["generationConfig"]["responseMimeType"] = "application/json"
    r = net.request("POST", f"{BASE}/models/{_model(model)}:generateContent",
                    headers={"x-goog-api-key": key}, body=body, opener=opener, timeout=45)
    try:
        parts = r["candidates"][0]["content"]["parts"]
        return "".join(p.get("text", "") for p in parts).strip()
    except (KeyError, IndexError, TypeError):
        reason = (r.get("promptFeedback") or {}).get("blockReason") if isinstance(r, dict) else None
        raise net.NetError("Gemini gave no answer" + (f" ({reason})" if reason else ""))


def call(key, contents, model=None, tools=None, system=None, opener=None, max_tokens=4096):
    """Raw generateContent call (used by the chat assistant with function calling)."""
    body = {"contents": contents, "generationConfig": {"temperature": 0.4, "maxOutputTokens": max_tokens}}
    if tools:
        body["tools"] = tools
    if system:
        body["systemInstruction"] = {"parts": [{"text": system}]}
    return net.request("POST", f"{BASE}/models/{_model(model)}:generateContent",
                       headers={"x-goog-api-key": key}, body=body, opener=opener, timeout=60)


def list_models(key, opener=None):
    r = net.request("GET", f"{BASE}/models", headers={"x-goog-api-key": key}, params={"pageSize": 200}, opener=opener)
    out = []
    for m in r.get("models", []):
        if "generateContent" in (m.get("supportedGenerationMethods") or []):
            out.append(m.get("name", "").replace("models/", ""))
    return sorted(out)


def _json(text):
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
    return json.loads(text)


def break_down(key, title, details="", minutes=None, model=None, opener=None):
    """Return a list of {step, minutes} for a task."""
    prompt = (
        "You help a 10th grade student (Cambridge AS Level, Digital SAT, cybersecurity olympiad) plan work.\n"
        f"Task: {title}\n" + (f"Details: {details}\n" if details else "")
        + (f"Time available: about {minutes} minutes\n" if minutes else "")
        + "Split it into 3 to 7 concrete steps that can each be done in 10 to 40 minutes. "
          'Reply only with JSON: {"steps": [{"step": "short imperative sentence", "minutes": 20}]}'
    )
    text = generate(key, prompt, model=model, json_mode=True, opener=opener)
    try:
        steps = _json(text).get("steps", [])
        return [{"step": str(s.get("step", ""))[:200], "minutes": int(s.get("minutes") or 15)}
                for s in steps if s.get("step")][:10]
    except (ValueError, AttributeError, TypeError):
        raise net.NetError("Gemini's answer could not be read")


def coach(key, plan, tone="strict", model=None, opener=None):
    """A short comment (max ~80 words) on the day's plan."""
    lines = [f"{b['start']}-{b['end']} {b['kind']}: {b['title']}" for b in plan.get("blocks", [])
             if b.get("kind") not in ("sleep",)][:40]
    must = [f"- {m['title']} ({m.get('why', '')})" for m in plan.get("must_do", []) if not m.get("done")][:15]
    style = {"strict": "direct and strict, like a tough but caring coach. No insults.",
             "angry": "blunt and a bit angry about wasted time, like a strict coach. No insults or swearing.",
             "calm": "calm and encouraging."}.get(tone, "direct")
    prompt = (
        "You are the study coach inside a planner app for a 10th grade student.\n"
        f"Today's plan:\n" + "\n".join(lines) + "\nMust do today:\n" + ("\n".join(must) or "- nothing urgent")
        + f"\nIn at most 80 words: say what matters most today, one risk in the plan, and one tip. Be {style} "
          "Plain text, no markdown."
    )
    return generate(key, prompt, model=model, opener=opener, max_tokens=2048)

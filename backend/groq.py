"""Groq AI helper (optional, needs internet and a Groq API key).

Groq has an OpenAI-compatible API: POST /chat/completions with
"Authorization: Bearer <key>". Tool calling uses the OpenAI format
(tools=[{type: function, function: {...}}], replies with message.tool_calls).

The key lives in data/secrets.json. Get one at https://console.groq.com/keys.
The app works fully without it.
"""

import os
import re

from . import net

# SW_GROQ_BASE lets the tests use a local fake Groq server.
BASE = os.environ.get("SW_GROQ_BASE") or "https://api.groq.com/openai/v1"
DEFAULT_MODEL = "openai/gpt-oss-120b"
# Models from /models that cannot chat (speech, audio, guard models).
NOT_CHAT = re.compile(r"whisper|orpheus|tts|guard|safeguard", re.I)


def _model(name):
    name = (name or DEFAULT_MODEL).strip()
    if not re.fullmatch(r"[A-Za-z0-9._/:-]{1,100}", name):
        raise net.NetError("bad model name")
    return name


def _headers(key):
    return {"Authorization": f"Bearer {key}"}


def call(key, messages, model=None, tools=None, opener=None, max_tokens=4096, json_mode=False, temperature=0.4):
    """Raw chat completion. messages: OpenAI format (system/user/assistant/tool)."""
    body = {"model": _model(model), "messages": messages, "temperature": temperature, "max_completion_tokens": max_tokens}
    if tools:
        body["tools"] = tools
        body["tool_choice"] = "auto"
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    return net.request("POST", f"{BASE}/chat/completions", headers=_headers(key), body=body, opener=opener, timeout=60)


def message_of(r):
    """The assistant message of a reply, or a NetError."""
    try:
        return r["choices"][0]["message"] or {}
    except (KeyError, IndexError, TypeError):
        raise net.NetError("Groq gave no answer")


def generate(key, prompt, model=None, json_mode=False, opener=None, max_tokens=4096):
    """Same shape as gemini.generate(): one prompt in, text out."""
    r = call(key, [{"role": "user", "content": prompt}], model=model, opener=opener,
             max_tokens=max_tokens, json_mode=json_mode, temperature=0.6)
    text = (message_of(r).get("content") or "").strip()
    if not text:
        raise net.NetError("Groq gave no answer")
    return text


def list_models(key, opener=None):
    r = net.request("GET", f"{BASE}/models", headers=_headers(key), opener=opener)
    out = [m.get("id", "") for m in r.get("data", []) if m.get("id") and m.get("active", True) is not False]
    return sorted(m for m in out if not NOT_CHAT.search(m))

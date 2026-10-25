"""Which AI service to use: Groq (default) or Gemini.

Settings:
- aiProvider: "groq" or "gemini". If it is not set, the app uses the first
  service that has a key (Groq first), so older installs with only a Gemini
  key keep working.
- groqModel / geminiModel: the model for each service.
"""

from . import gemini, groq, secrets_store

PROVIDERS = {
    # name: (module, secret key, label, settings key for the model)
    "groq": (groq, "groq_key", "Groq API key", "groqModel"),
    "gemini": (gemini, "gemini_key", "Gemini API key", "geminiModel"),
}
NAMES = {"groq": "Groq", "gemini": "Gemini"}
DEFAULT = "groq"


def active(settings, data_dir):
    """The provider name to use now."""
    chosen = (settings or {}).get("aiProvider")
    if chosen in PROVIDERS:
        return chosen
    keys = secrets_store.read(data_dir)
    for name, (_, secret, _, _) in PROVIDERS.items():
        if keys.get(secret):
            return name
    return DEFAULT


def model_of(name, settings):
    mod, _, _, setting = PROVIDERS[name]
    return (settings or {}).get(setting) or mod.DEFAULT_MODEL


def status(settings, data_dir):
    """Key flags plus the active provider, for GET /api/secrets."""
    s = secrets_store.status(data_dir)
    name = active(settings, data_dir)
    s["provider"] = name
    s["providerName"] = NAMES[name]
    s["ai"] = bool(s.get(name))
    return s

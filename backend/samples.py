"""Remove the fake sample items that come from data.example/ (marked "sample": true)."""

from .storage import MODULES


def _strip(obj):
    """Remove dicts with sample=True from every list inside obj. Returns count."""
    n = 0
    if isinstance(obj, dict):
        for v in obj.values():
            n += _strip(v)
    elif isinstance(obj, list):
        keep = [x for x in obj if not (isinstance(x, dict) and x.get("sample") is True)]
        n += len(obj) - len(keep)
        obj[:] = keep
        for x in obj:
            n += _strip(x)
    return n


def remove_samples(storage):
    total = 0
    for m in sorted(MODULES):
        if not storage.path(m).exists():
            continue
        data = storage.read(m)
        if _strip(data):
            count = [0]

            def fn(d, count=count):
                count[0] = _strip(d)
            storage.update(m, fn)
            total += count[0]
    return total

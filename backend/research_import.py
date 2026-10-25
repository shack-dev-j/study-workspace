"""Import universities from docs/research/universities.md (#31).

Reads the table under "## 3. University profiles". Only facts that are in
the table are stored. Ranks are kept as text exactly as written. Every
field the table does not give stays empty and is listed in "verify".

Merging is by name and only fills fields that are still empty, so the
user's own edits are never overwritten.
"""

import re
import uuid

SOURCE = "docs/research/universities.md"
SECTION = "## 3. University profiles"
COLUMNS = ["University", "QS 2027", "THE 2027", "QS CS 2026", "El-Yurt Umidi?"]
RANK_FIELDS = {"QS 2027": "qs_rank", "THE 2027": "the_rank", "QS CS 2026": "qs_cs_rank"}
# Fields the report table does not give: left empty and marked "verify".
OTHER_FIELDS = ["city", "program", "tuition", "living_cost", "scholarships", "alevel", "sat",
                "open_date", "deadline", "early_deadline"]
EMPTY = {"", "—", "-", "–"}
# Text in parentheses that is a place, not part of the name.
PLACES = {"Singapore", "Hong Kong", "China", "Korea", "South Korea", "Japan", "Switzerland",
          "Germany", "Netherlands", "Italy", "Hungary"}


def parse_table(text):
    """Return a list of dicts (one per row) from the table in section 3."""
    start = text.find(SECTION)
    if start < 0:
        raise ValueError(f"section '{SECTION}' not found in {SOURCE}")
    rows = []
    in_table = False
    for line in text[start:].splitlines()[1:]:
        s = line.strip()
        if s.startswith("## ") or (in_table and not s.startswith("|")):
            break
        if not s.startswith("|"):
            continue
        cells = [c.strip() for c in s.strip("|").split("|")]
        if not in_table:
            if cells[:len(COLUMNS)] != COLUMNS:
                raise ValueError(f"unexpected table header: {cells}")
            in_table = True
            continue
        if all(re.fullmatch(r":?-{3,}:?", c) for c in cells):
            continue
        if len(cells) < len(COLUMNS):
            continue
        rows.append(dict(zip(COLUMNS, cells)))
    return rows


def split_name(cell):
    """'NUS (Singapore)' -> ('NUS', 'Singapore'). Unknown brackets stay in the name."""
    m = re.fullmatch(r"(.*?)\s*\(([^()]*)\)\s*", cell)
    if m and m.group(2).strip() in PLACES:
        return m.group(1).strip(), m.group(2).strip()
    return cell.strip(), ""


def eyuf_value(cell):
    if cell.startswith("✅"):
        return "yes"
    if cell.startswith("❌"):
        return "no"
    return "check"


def row_to_item(row):
    """Build a university item from one table row (facts only)."""
    name, country = split_name(row["University"])
    item = {"name": name, "country": country, "eyuf": eyuf_value(row["El-Yurt Umidi?"]),
            "eyuf_note": row["El-Yurt Umidi?"], "sources": [SOURCE]}
    verify = []
    for col, key in RANK_FIELDS.items():
        v = row[col].strip()
        if v in EMPTY:
            item[key] = ""
            verify.append(key)
        else:
            item[key] = v
    if not country:
        verify.append("country")
    if item["eyuf"] == "check":
        verify.append("eyuf")
    for key in OTHER_FIELDS:
        item[key] = ""
        verify.append(key)
    item["verify"] = verify
    return item


def import_into(storage, paths, dry_run=False):
    """Merge the report's universities into storage. Returns {added, updated, preview}."""
    text = (paths.docs / "research" / "universities.md").read_text(encoding="utf-8")
    incoming = [row_to_item(r) for r in parse_table(text)]
    result = {"added": 0, "updated": 0, "preview": []}

    def merge(data):
        items = data.setdefault("items", [])
        by_name = {str(i.get("name", "")).strip().lower(): i for i in items}
        for new in incoming:
            old = by_name.get(new["name"].lower())
            if old is None:
                item = {"id": uuid.uuid4().hex[:10], **new, "status": "Researching", "priority": "",
                        "notes": "", "deadline_estimate": True, "docs": []}
                items.append(item)
                by_name[new["name"].lower()] = item
                result["added"] += 1
                result["preview"].append({"name": new["name"], "action": "add",
                                          "fields": [k for k in ("country", "qs_rank", "the_rank", "qs_cs_rank", "eyuf") if new.get(k)]})
                continue
            filled = []
            for k, v in new.items():
                if k in ("verify", "sources"):
                    continue
                if v not in ("", None) and old.get(k) in ("", None):
                    old[k] = v
                    filled.append(k)
            src = old.setdefault("sources", [])
            if SOURCE not in src:
                src.append(SOURCE)
            # A field still empty after the merge needs checking.
            ver = old.setdefault("verify", [])
            for k in new["verify"]:
                if old.get(k) in ("", None) and k not in ver:
                    ver.append(k)
            old["verify"] = [k for k in ver if old.get(k) in ("", None) or k == "eyuf" and old.get("eyuf") == "check"]
            if filled:
                result["updated"] += 1
                result["preview"].append({"name": new["name"], "action": "update", "fields": filled})

    if dry_run:
        data = storage.read("universities")
        merge(data)
    else:
        storage.update("universities", merge)
    return result

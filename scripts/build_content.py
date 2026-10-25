#!/usr/bin/env python3
"""Build the built-in study content in content/ (developer tool).

    python scripts/build_content.py

The app merges content/*.json into the user's data on start (backend/seed.py):
new items are added, nothing the user has is changed, and an item the user
deleted is not added again. Every link here was checked by hand on
2026-10-25 (see docs/research/sources.md). Past papers are LINKED, never
bundled: the PDFs stay on the websites that host them.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "content"
VERSION = 1

# ---------- past papers ----------
# pastpapers.co folders: YEAR-may-june (s), YEAR-oct-nov (w), YEAR-march (m; 2022 is "feb-march").
# March has one variant (2); June and November have variants 1-3.
SUBJECTS = {
    "Maths": ("mathematics-9709", "9709", [("1", "Pure Mathematics 1"), ("5", "Probability & Statistics 1")]),
    "Physics": ("physics-9702", "9702", [("1", "Multiple choice"), ("2", "AS structured questions")]),
    "Computer Science": ("computer-science-(for-first-examination-in-2021)-(9618)", "9618",
                         [("1", "Theory fundamentals"), ("2", "Problem-solving and programming")]),
}
YEARS = [2021, 2022, 2023, 2024, 2025]


def folder(year, s):
    if s == "s":
        return f"{year}-may-june"
    if s == "w":
        return f"{year}-oct-nov"
    return f"{year}-feb-march" if year == 2022 else f"{year}-march"


def pastpapers():
    items = []
    for subject, (slug, code, papers) in SUBJECTS.items():
        for year in YEARS:
            yy = str(year)[2:]
            for s, variants in (("m", ["2"]), ("s", ["1", "2", "3"]), ("w", ["1", "2", "3"])):
                for paper, pname in papers:
                    for v in variants:
                        base = f"https://pastpapers.co/caie/a-level/{slug}/{folder(year, s)}/{code}_{s}{yy}"
                        items.append({
                            "id": f"pp-{code}-{s}{yy}-{paper}{v}",
                            "subject": subject, "session": f"{s}{yy}", "paper": paper, "variant": v,
                            "title": f"{code} {pname}", "done": False, "date": "", "score": None, "max": None,
                            "qpUrl": f"{base}_qp_{paper}{v}.pdf", "msUrl": f"{base}_ms_{paper}{v}.pdf",
                            "notes": "",
                        })
    return items


# ---------- resources (links) ----------
def R(id_, area, subject, title, url, kind, note=""):
    return {"id": "res-" + id_, "area": area, "subject": subject, "title": title, "url": url, "kind": kind, "note": note}


RESOURCES = [
    # Maths 9709
    R("9709-home", "Study", "Maths", "Cambridge 9709 official page (syllabus, specimen papers)",
      "https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-international-as-and-a-level-mathematics-9709/", "official"),
    R("9709-syl", "Study", "Maths", "9709 syllabus 2026-2027 (PDF)", "https://www.cambridgeinternational.org/Images/697427-2026-2027-syllabus.pdf", "syllabus"),
    R("9709-pp", "Study", "Maths", "All 9709 past papers and mark schemes (pastpapers.co)", "https://pastpapers.co/caie/a-level/mathematics-9709", "past papers"),
    R("9709-pmt-p1", "Study", "Maths", "Pure 1 past papers by year (Physics & Maths Tutor)", "https://www.physicsandmathstutor.com/a-level-maths-papers/cie-paper-1/", "past papers"),
    R("9709-sme-p1", "Study", "Maths", "Pure 1 past papers and topic questions (Save My Exams)", "https://www.savemyexams.com/as/maths_pure-1/cie/-/pages/past-papers", "past papers"),
    R("9709-sme-p1q", "Study", "Maths", "Pure 1 practice questions by topic (Save My Exams)", "https://www.savemyexams.com/as/maths_pure-1/cie/20/practice-paper-questions/", "practice"),
    R("9709-sme-s1", "Study", "Maths", "Probability & Statistics 1 past papers (Save My Exams)", "https://www.savemyexams.com/a-level/maths_probability--statistics-1/cie/-/pages/past-papers/", "past papers"),
    R("9709-sme-s1q", "Study", "Maths", "Probability & Statistics 1 practice questions (Save My Exams)", "https://www.savemyexams.com/as/maths_probability--statistics-1/cie/20/practice-paper-questions", "practice"),
    # Physics 9702
    R("9702-home", "Study", "Physics", "Cambridge 9702 official page (syllabus, specimen papers)",
      "https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-international-as-and-a-level-physics-9702/", "official"),
    R("9702-syl", "Study", "Physics", "9702 syllabus 2025-2027 (PDF)", "https://www.cambridgeinternational.org/Images/664565-2025-2027-syllabus.pdf", "syllabus"),
    R("9702-pp", "Study", "Physics", "All 9702 past papers and mark schemes (pastpapers.co)", "https://pastpapers.co/caie/a-level/physics-9702", "past papers"),
    R("9702-sme", "Study", "Physics", "AS Physics past papers (Save My Exams)", "https://www.savemyexams.com/as/physics/cie/past-papers/", "past papers"),
    R("9702-sme-p2", "Study", "Physics", "AS Physics Paper 2 past papers (Save My Exams)", "https://www.savemyexams.com/as/physics/cie/past-papers/paper-2", "past papers"),
    R("9702-gt", "Study", "Physics", "Grade thresholds June 2025 (what mark gets an A)", "https://www.cambridgeinternational.org/Images/740343-physics-9702-june-2025-grade-threshold-table.pdf", "official"),
    # Computer Science 9618
    R("9618-syl", "Study", "Computer Science", "9618 syllabus 2026 (PDF)", "https://www.cambridgeinternational.org/Images/697372-2026-syllabus.pdf", "syllabus"),
    R("9618-upd", "Study", "Computer Science", "9618 syllabus update 2027-2029 (PDF)", "https://www.cambridgeinternational.org/Images/747147-2027-2029-syllabus-update.pdf", "syllabus"),
    R("9618-pmt1", "Study", "Computer Science", "Paper 1 past papers (Physics & Maths Tutor)", "https://www.physicsandmathstutor.com/past-papers/a-level-computer-science/caie-paper-1/", "past papers"),
    R("9618-pmt2", "Study", "Computer Science", "Paper 2 past papers (Physics & Maths Tutor)", "https://www.physicsandmathstutor.com/past-papers/a-level-computer-science/caie-paper-2/", "past papers"),
    R("9618-sme1", "Study", "Computer Science", "AS Paper 1 past papers (Save My Exams)", "https://www.savemyexams.com/as/computer-science/cie/past-papers/paper-1/", "past papers"),
    R("9618-sme2", "Study", "Computer Science", "AS Paper 2 past papers (Save My Exams)", "https://www.savemyexams.com/as/computer-science/cie/past-papers/paper-2/", "past papers"),
    R("9618-notes", "Study", "Computer Science", "AS Computer Science revision notes (Save My Exams)", "https://www.savemyexams.com/as/computer-science/cie/19/revision-notes/", "notes"),
    R("9618-hub", "Study", "Computer Science", "Your 9618 AS Revision Hub", "https://shack-dev-j.github.io/Claude/", "practice", "Export progress there, import it in Subjects → Computer Science."),
    # SAT
    R("sat-bb", "SAT", "SAT", "Bluebook: official full-length digital SAT practice tests", "https://bluebook.collegeboard.org/students/practice", "official"),
    R("sat-tests", "SAT", "SAT", "Full-length SAT practice tests (College Board)", "https://satsuite.collegeboard.org/practice/practice-tests", "official"),
    R("sat-prac", "SAT", "SAT", "SAT practice and preparation hub (College Board)", "https://satsuite.collegeboard.org/practice", "official"),
    R("sat-khan", "SAT", "SAT", "Official Digital SAT Prep (Khan Academy, free)", "https://en.khanacademy.org/digital-sat/start", "course"),
    R("sat-khan-math", "SAT", "SAT", "Get ready for SAT Math (Khan Academy)", "https://www.khanacademy.org/get-ready-for-sat-prep-math", "course"),
    R("sat-desmos", "SAT", "SAT", "Desmos graphing calculator (the one built into Bluebook)", "https://www.desmos.com/calculator", "tool"),
    # Cyber / ICO
    R("cy-thm-pre", "Cyber", "Cyber", "TryHackMe Pre Security path (start here)", "https://tryhackme.com/beginner-path", "course"),
    R("cy-pico", "Cyber", "Cyber", "picoCTF practice problems (free CTF training)", "https://play.picoctf.org/practice", "practice"),
    R("cy-otw", "Cyber", "Cyber", "OverTheWire Bandit (Linux wargame)", "https://overthewire.org/wargames/bandit/", "practice"),
    R("cy-chef", "Cyber", "Cyber", "CyberChef (encode, decode, crypto in the browser)", "https://gchq.github.io/CyberChef/", "tool"),
    R("cy-thm-crypto", "Cyber", "Cyber", "TryHackMe Cryptography module", "https://tryhackme.com/module/cryptography", "course"),
    R("cy-thm-web", "Cyber", "Cyber", "TryHackMe Web Hacking module", "https://tryhackme.com/module/web-hacking", "course"),
    R("cy-thm-net", "Cyber", "Cyber", "TryHackMe Network Fundamentals module", "https://tryhackme.com/module/network-fundamentals", "course"),
    R("cy-thm-priv", "Cyber", "Cyber", "TryHackMe Privilege Escalation module", "https://tryhackme.com/module/privilege-escalation", "course"),
    R("cy-thm-ws", "Cyber", "Cyber", "TryHackMe Wireshark module", "https://tryhackme.com/module/wireshark", "course"),
    R("cy-thm-nmap", "Cyber", "Cyber", "TryHackMe Nmap module", "https://tryhackme.com/module/nmap", "course"),
]

# ---------- TryHackMe rooms (topic names match the Cyber page) ----------
ROOMS = [
    ("whatisnetworking", "What is Networking?", "Networking"),
    ("introtonetworking", "Intro to Networking", "Networking"),
    ("packetsframes", "Packets & Frames", "Networking"),
    ("networkingconcepts", "Networking Concepts", "Networking"),
    ("nmap01", "Nmap: Live Host Discovery", "Networking"),
    ("nmap02", "Nmap: Basic Port Scans", "Networking"),
    ("wiresharktrafficanalysis", "Wireshark: Traffic Analysis", "Forensics"),
    ("trafficanalysisessentials", "Traffic Analysis Essentials", "Forensics"),
    ("linuxfundamentalspart1", "Linux Fundamentals Part 1", "Linux"),
    ("linuxstrengthtraining", "Linux Strength Training", "Linux"),
    ("linuxfilesystemanalysis", "Linux File System Analysis", "Forensics"),
    ("linprivbasics", "Linux Privilege Escalation basics", "Linux"),
    ("linprivesc", "Linux PrivEsc", "Linux"),
    ("owaspjuiceshop", "OWASP Juice Shop", "Web security"),
    ("owaspbrokenaccesscontrol", "OWASP Broken Access Control", "Web security"),
    ("vulnversity", "Vulnversity", "Web security"),
    ("rrootme", "RootMe", "Web security"),
    ("cryptographyintro", "Cryptography Basics", "Cryptography"),
    ("hashingbasics", "Hashing Basics", "Cryptography"),
    ("johntheripperbasics", "John the Ripper: The Basics", "Cryptography"),
    ("encryptioncrypto101", "Encryption - Crypto 101", "Cryptography"),
    ("breakingcryptothesimpleway", "Breaking Crypto the Simple Way", "Cryptography"),
    ("passwordcracking", "Password Cracking", "Cryptography"),
]


def thm():
    return [{"id": "thm-" + slug, "name": name, "url": f"https://tryhackme.com/room/{slug}", "topic": topic,
             "status": "todo", "finished": "", "notes": ""} for slug, name, topic in ROOMS]


# ---------- habits ----------
HABITS = [
    ("h-pp", "One past paper question set (30 min)"),
    ("h-sat", "SAT practice (30 min, Khan Academy or Bluebook)"),
    ("h-thm", "Cyber practice (one TryHackMe task or picoCTF problem)"),
    ("h-bag", "Pack the backpack the evening before"),
    ("h-sleep", "In bed by 22:30"),
]


def habits():
    return [{"id": i, "name": n, "days": {}} for i, n in HABITS]


def main():
    OUT.mkdir(exist_ok=True)
    packs = {
        "pastpapers": {"items": pastpapers()},
        "resources": {"items": RESOURCES},
        "thm": {"items": thm()},
        "habits": {"items": habits()},
    }
    for name, pack in packs.items():
        (OUT / f"{name}.json").write_text(json.dumps({"version": VERSION, **pack}, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
        print(name, len(pack["items"]))


if __name__ == "__main__":
    main()

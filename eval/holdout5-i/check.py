"""Checks for author i's cases: snippets (PDF.js + pdftotext), structure, and a word-level diff.

Usage: <venv>/bin/python check.py CASESDIR [--diff]
"""
import difflib
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TYPES = {"number", "replace", "insert", "delete", "move", "format", "graphic", "position", "overflow", "furniture"}
SAME = {"move", "format", "position", "graphic", "overflow"}


def pdfjs(path):
    out = subprocess.run(["node", os.path.join(HERE, "extract.mjs"), path], capture_output=True, text=True, check=True).stdout
    return [p["text"] for p in json.loads(out)]


def pdftotext(path, n, layout=True):
    mode = ["-layout"] if layout else []
    return [subprocess.run(["pdftotext", "-f", str(i), "-l", str(i)] + mode + [path, "-"], capture_output=True, text=True,
                           check=True).stdout for i in range(1, n + 1)]


def squash(s):
    return re.sub(r"\s+", "", s)


def count(hay, needle):
    h, n = squash(hay), squash(needle)
    return h.count(n) if n else 0


def check_case(d, show_diff):
    problems = []
    t = json.load(open(os.path.join(d, "truth.json"), encoding="utf-8"))
    for k in ("description", "synthetic", "set", "blind", "truth"):
        if k not in t:
            problems.append(f"missing key {k}")
    extra = set(t) - {"description", "synthetic", "set", "blind", "truth"}
    if extra:
        problems.append(f"extra keys {extra}")
    if t.get("synthetic") is not True or t.get("set") != "held-out-5" or t.get("blind") is not True:
        problems.append("synthetic/set/blind wrong")
    if not 5 <= len(t["truth"]) <= 9:
        problems.append(f"{len(t['truth'])} truth items")
    bj, aj = pdfjs(os.path.join(d, "before.pdf")), pdfjs(os.path.join(d, "after.pdf"))
    bt, at = pdftotext(os.path.join(d, "before.pdf"), len(bj)), pdftotext(os.path.join(d, "after.pdf"), len(aj))
    br, ar = pdftotext(os.path.join(d, "before.pdf"), len(bj), False), pdftotext(os.path.join(d, "after.pdf"), len(aj), False)
    for i, it in enumerate(t["truth"]):
        tag = f"#{i + 1} {it.get('type')}"
        if it.get("type") not in TYPES:
            problems.append(f"{tag}: bad type")
        if "oldPage" not in it and "newPage" not in it:
            problems.append(f"{tag}: no pages")
        for side in ("old", "new"):
            if side in it and it[side] == "":
                problems.append(f"{tag}: empty {side}")
        if it.get("type") == "graphic":
            if "oldPage" in it and "oldRect" not in it and "newRect" not in it:
                problems.append(f"{tag}: graphic without rect")
        if it.get("type") in ("insert",) and "old" in it:
            problems.append(f"{tag}: insert with old")
        if it.get("type") in ("delete",) and "new" in it:
            problems.append(f"{tag}: delete with new")
        for side, pages_js, pages_tt, pages_raw, other_js in (("old", bj, bt, br, aj), ("new", aj, at, ar, bj)):
            if side not in it:
                continue
            pg = it.get(side + "Page")
            if pg is None:
                problems.append(f"{tag}: {side} without page")
                continue
            s = it[side]
            cj = count(pages_js[pg - 1], s)
            ct = count(pages_tt[pg - 1], s)
            if cj == 0:
                problems.append(f"{tag}: {side} {s!r} NOT in PDF.js p{pg}")
            if ct == 0:
                problems.append(f"{tag}: {side} {s!r} NOT in pdftotext -layout p{pg}")
            if count(pages_raw[pg - 1], s) == 0:
                problems.append(f"{tag}: {side} {s!r} NOT in pdftotext (raw) p{pg}")
            if cj > 1:
                problems.append(f"{tag}: {side} {s!r} occurs {cj}x in PDF.js p{pg} (not unique)")
            if it["type"] not in SAME:
                opg = it.get(("new" if side == "old" else "old") + "Page")
                if opg is not None and count(other_js[opg - 1], s) > 0:
                    problems.append(f"{tag}: {side} {s!r} still present on the other version's p{opg}")
        if "oldRect" in it or "newRect" in it:
            for r in (it.get("oldRect"), it.get("newRect")):
                if r is not None and (len(r) != 4 or r[2] <= 0 or r[3] <= 0):
                    problems.append(f"{tag}: bad rect {r}")
    print(f"== {os.path.basename(d)}: before {len(bj)} p, after {len(aj)} p, {len(t['truth'])} items")
    for p in problems:
        print("   PROBLEM:", p)
    if show_diff:
        wb = " ".join(bj).split()
        wa = " ".join(aj).split()
        sm = difflib.SequenceMatcher(a=wb, b=wa, autojunk=False)
        for op, i1, i2, j1, j2 in sm.get_opcodes():
            if op == "equal":
                continue
            ctx = " ".join(wb[max(0, i1 - 3):i1])
            print(f"   {op:7s} [{ctx}] {' '.join(wb[i1:i2])!r} -> {' '.join(wa[j1:j2])!r}")
    return problems


def main():
    root = sys.argv[1]
    show = "--diff" in sys.argv
    only = [a for a in sys.argv[2:] if not a.startswith("--")]
    total = 0
    for name in sorted(os.listdir(root)):
        if only and not any(o in name for o in only):
            continue
        d = os.path.join(root, name)
        if os.path.isdir(d):
            total += len(check_case(d, show))
    print("TOTAL PROBLEMS:", total)


if __name__ == "__main__":
    main()

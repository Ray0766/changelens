#!/usr/bin/env python3
"""Check helper for author j's cases (not part of ChangeLens).

Usage: python check.py CASES_DIR [--diff]
  1. snippets: each old/new snippet is on its stated page in PDF.js getTextContent text (stream order and
     position-sorted lines) and in pdftotext; old not on the new page, new not on the old page.
  2. --diff: word-level diff of the PDF.js body text (position-sorted lines), headers/footers kept.
  3. structure: truth.json keys and types.
"""
import difflib
import json
import os
import re
import subprocess
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
TYPES = {"number", "replace", "insert", "delete", "move", "format", "graphic", "position", "overflow", "furniture"}
KEYS = {"type", "old", "new", "oldPage", "newPage", "oldRect", "newRect", "note", "maxItems"}


def ws(s):
    return re.sub(r"\s+", "", s)


def pdfjs(path):
    out = subprocess.run(["node", os.path.join(HERE, "pdfjs-text.mjs"), path], capture_output=True, text=True,
                         check=True).stdout
    pages = json.loads(out)
    res = []
    for p in pages:
        items = [i for i in p["items"] if i["str"].strip()]
        if p["rotate"] % 180 == 0:
            items.sort(key=lambda i: (round(i["y"]), i["x"]))
            lines, cur, cy = [], [], None
            for i in sorted(items, key=lambda i: i["y"]):
                if cy is None or abs(i["y"] - cy) > 2.5:
                    if cur:
                        lines.append(cur)
                    cur, cy = [i], i["y"]
                else:
                    cur.append(i)
            if cur:
                lines.append(cur)
            sorted_text = "\n".join(" ".join(x["str"] for x in sorted(l, key=lambda i: i["x"])) for l in lines)
        else:
            sorted_text = p["text"]
        res.append({"stream": p["text"], "sorted": sorted_text, "rotate": p["rotate"], "view": p["view"]})
    return res


def poppler(path, n):
    txt = []
    for i in range(1, n + 1):
        txt.append(subprocess.run(["pdftotext", "-f", str(i), "-l", str(i), path, "-"], capture_output=True,
                                  text=True, check=True).stdout)
    return txt


def main():
    root = sys.argv[1]
    show_diff = "--diff" in sys.argv
    bad = 0
    for case in sorted(os.listdir(root)):
        d = os.path.join(root, case)
        if not os.path.isdir(d):
            continue
        t = json.load(open(os.path.join(d, "truth.json"), encoding="utf-8"))
        assert set(t) == {"description", "synthetic", "set", "blind", "truth"}, t.keys()
        assert t["synthetic"] is True and t["set"] == "held-out-5" and t["blind"] is True
        B, A = pdfjs(os.path.join(d, "before.pdf")), pdfjs(os.path.join(d, "after.pdf"))
        Bp, Ap = poppler(os.path.join(d, "before.pdf"), len(B)), poppler(os.path.join(d, "after.pdf"), len(A))
        print(f"== {case}: {len(B)}->{len(A)} pages, {len(t['truth'])} items")
        assert 5 <= len(t["truth"]) <= 9
        for k, it in enumerate(t["truth"]):
            assert set(it) <= KEYS, it.keys()
            assert it["type"] in TYPES
            assert isinstance(it.get("oldPage"), int) and isinstance(it.get("newPage"), int), it
            assert 1 <= it["oldPage"] <= len(B) and 1 <= it["newPage"] <= len(A), it
            for side in ("old", "new"):
                if side in it:
                    assert isinstance(it[side], str) and it[side].strip(), it
            if it["type"] == "graphic":
                assert "oldRect" in it or "newRect" in it, it
            for side, docs, pop, pg, other, opg in (("old", B, Bp, it["oldPage"], A, it["newPage"]),
                                                    ("new", A, Ap, it["newPage"], B, it["oldPage"])):
                if side not in it:
                    continue
                s = ws(it[side])
                page = docs[pg - 1]
                f_stream = s in ws(page["stream"])
                f_sorted = s in ws(page["sorted"])
                f_pop_raw = s in ws(pop[pg - 1])
                f_pop = f_pop_raw or s in ws(unicodedata.normalize("NFKC", pop[pg - 1]))
                cnt = ws(page["sorted"]).count(s)
                same = it.get("old") == it.get("new")
                elsewhere = None
                if not same:
                    o = ws(other[opg - 1]["sorted"])
                    os_ = ws(it.get("new" if side == "old" else "old", ""))
                    # a snippet that is part of the other side's snippet (sign removed: -250.00 -> 250.00)
                    elsewhere = o.count(s) > (o.count(os_) if os_ and s in os_ else 0)
                flag = "OK " if (f_sorted and f_pop and not elsewhere) else "BAD"
                if flag == "BAD":
                    bad += 1
                print(f"  {flag} #{k + 1} {it['type']:9} {side} p{pg} stream={int(f_stream)} lines={int(f_sorted)} "
                      f"pdftotext={int(f_pop)}{'' if f_pop_raw or not f_pop else '(NFKC only)'} count={cnt} on-other-side={elsewhere} {it[side][:50]!r}")
            for side in ("oldRect", "newRect"):
                if side in it:
                    r = it[side]
                    pg = it["oldPage" if side == "oldRect" else "newPage"]
                    vw, vh = (B if side == "oldRect" else A)[pg - 1]["view"]
                    assert len(r) == 4 and r[2] > 0 and r[3] > 0 and r[0] >= -0.5 and r[1] >= -0.5 \
                        and r[0] + r[2] <= vw + 0.5 and r[1] + r[3] <= vh + 0.5, (side, r, vw, vh)
        if show_diff:
            wb = " ".join(p["sorted"] for p in B).split()
            wa = " ".join(p["sorted"] for p in A).split()
            sm = difflib.SequenceMatcher(None, wb, wa, autojunk=False)
            for op, i1, i2, j1, j2 in sm.get_opcodes():
                if op != "equal":
                    print(f"    {op:7} {' '.join(wb[i1:i2])[:110]!r} -> {' '.join(wa[j1:j2])[:110]!r}")
    print("BAD:", bad)
    return bad


if __name__ == "__main__":
    sys.exit(1 if main() else 0)

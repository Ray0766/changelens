#!/usr/bin/env python3
"""Checks for author h's cases (not part of the PDFs): snippets in PDF.js and pdftotext text,
absence of old/new snippets on the other side, a word-level body diff, renders with rects,
and truth.json structure.  Usage: python check-h.py <cases-folder> <work-folder>"""
import difflib
import glob
import json
import os
import re
import subprocess
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
TYPES = {"number", "replace", "insert", "delete", "move", "format", "graphic", "position", "overflow", "furniture"}
WS = re.compile(r"[\s   ​­]+")


def norm(s):
    return WS.sub("", s)


def pdfjs(path):
    out = subprocess.run(["node", os.path.join(HERE, "pdfjs-extract.mjs"), path], capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def pdftotext_pages(path, n, layout=False):
    pages = []
    for i in range(1, n + 1):
        cmd = ["pdftotext"] + (["-layout"] if layout else []) + ["-f", str(i), "-l", str(i), path, "-"]
        pages.append(subprocess.run(cmd, capture_output=True, text=True, check=True).stdout)
    return pages


def body_words(d):
    words = []
    for p in d["pages"]:
        h = p["height"]
        line = []
        for it in p["items"]:
            if it["y"] < 62 or it["y"] > h - 58:   # running header / footer band
                continue
            words.append(it["str"])
    return " ".join(words).split()


def find_pages(snip, pages):
    s = norm(snip)
    return [i + 1 for i, t in enumerate(pages) if s in norm(t)]


def main():
    cases_dir, work = sys.argv[1], sys.argv[2]
    os.makedirs(work, exist_ok=True)
    problems = 0
    for cdir in sorted(glob.glob(os.path.join(cases_dir, "holdout5-h-*"))):
        cid = os.path.basename(cdir)
        truth = json.load(open(os.path.join(cdir, "truth.json"), encoding="utf-8"))
        assert set(truth) == {"description", "synthetic", "set", "blind", "truth"}, set(truth)
        assert truth["synthetic"] is True and truth["blind"] is True and truth["set"] == "held-out-5"
        b = pdfjs(os.path.join(cdir, "before.pdf"))
        a = pdfjs(os.path.join(cdir, "after.pdf"))
        bj = [p["text"] for p in b["pages"]]
        aj = [p["text"] for p in a["pages"]]
        bt = pdftotext_pages(os.path.join(cdir, "before.pdf"), b["numPages"])
        at = pdftotext_pages(os.path.join(cdir, "after.pdf"), a["numPages"])
        btl = pdftotext_pages(os.path.join(cdir, "before.pdf"), b["numPages"], True)
        atl = pdftotext_pages(os.path.join(cdir, "after.pdf"), a["numPages"], True)
        # synthetic label on first page
        for side, pages in (("before", bj), ("after", aj)):
            if "syntheticsample" not in norm(pages[0]).lower():
                print(f"  !! {cid}: no 'synthetic sample' on page 1 of {side}"); problems += 1
        print(f"== {cid}: {b['numPages']} -> {a['numPages']} pages, {len(truth['truth'])} items")
        for k, it in enumerate(truth["truth"]):
            t = it["type"]
            assert t in TYPES, t
            assert "oldPage" in it or "newPage" in it
            msgs = []
            for side, key, pj, pt, ptl, other_pj, other_page_key in (("old", "oldPage", bj, bt, btl, aj, "newPage"), ("new", "newPage", aj, at, atl, bj, "oldPage")):
                if side in it:
                    snip = it[side]
                    assert snip, "empty snippet"
                    pg = it.get(key)
                    if pg is None:
                        msgs.append(f"{side}: snippet given but no {key}"); continue
                    fj = find_pages(snip, pj)
                    ft = find_pages(snip, pt)
                    ftl = find_pages(snip, ptl)
                    cnt = norm(pj[pg - 1]).count(norm(snip)) if pg <= len(pj) else 0
                    ok = pg in fj and (pg in ft or pg in ftl)
                    msgs.append(f"{side}@{pg}: pdfjs{fj} pdftotext{ft} pdftotext-layout{ftl} count={cnt}" + ("" if ok else "  <-- MISSING"))
                    if not ok:
                        problems += 1
                    # the snippet must not be at that place on the other side when the text changed
                    if t in ("number", "replace", "insert", "delete", "furniture") and it.get(other_page_key):
                        op = it[other_page_key]
                        if norm(snip) in norm(other_pj[op - 1]) and not (t == "furniture"):
                            msgs.append(f"   !! {side} snippet also on other side page {op}"); problems += 1
                    if t in ("insert",) and norm(snip) in norm("".join(other_pj)):
                        msgs.append("   !! inserted text exists in old doc"); problems += 1
                    if t in ("delete",) and norm(snip) in norm("".join(other_pj)):
                        msgs.append("   !! deleted text exists in new doc"); problems += 1
            if t == "graphic":
                for key in ("oldRect", "newRect"):
                    if key in it:
                        r = it[key]
                        assert isinstance(r, list) and len(r) == 4, (cid, key, r)
                msgs.append(f"rects old={it.get('oldRect')} new={it.get('newRect')}")
            print(f"  [{k}] {t:9s} " + " | ".join(msgs))
        # word-level diff of body text
        wb, wa = body_words(b), body_words(a)
        sm = difflib.SequenceMatcher(a=wb, b=wa, autojunk=False)
        print("  word diff (body, header/footer band excluded):")
        for op, i1, i2, j1, j2 in sm.get_opcodes():
            if op == "equal":
                continue
            print(f"    {op:7s} {' '.join(wb[i1:i2])[:110]!r} -> {' '.join(wa[j1:j2])[:110]!r}")
        # pdftotext vs pdfjs differences (normalised, per page, character level)
        for side, pj, pt in (("before", bj, bt), ("after", aj, at)):
            kinds = {}
            for x_page, y_page in zip(pj, pt):
                dj, dt = norm(x_page), norm(y_page)
                if dj == dt:
                    continue
                if sorted(dj) == sorted(dt):
                    kinds[("<same characters, different order>", "")] = kinds.get(("<same characters, different order>", ""), 0) + 1
                    continue
                sm2 = difflib.SequenceMatcher(a=dj, b=dt, autojunk=False)
                for op, i1, i2, j1, j2 in sm2.get_opcodes():
                    if op != "equal":
                        key = (dj[i1:i2][:20], dt[j1:j2][:20])
                        kinds[key] = kinds.get(key, 0) + 1
            if kinds:
                top = sorted(kinds.items(), key=lambda kv: -kv[1])[:8]
                print(f"  pdfjs vs pdftotext ({side}): most common differences {top}")
        # renders
        rd = os.path.join(work, "renders", cid)
        os.makedirs(rd, exist_ok=True)
        for f in glob.glob(os.path.join(rd, "*.png")):
            os.remove(f)
        for v in ("before", "after"):
            subprocess.run(["pdftoppm", "-r", "60", "-png", os.path.join(cdir, f"{v}.pdf"), os.path.join(rd, v)], check=True)
    print("PROBLEMS:", problems)


if __name__ == "__main__":
    main()

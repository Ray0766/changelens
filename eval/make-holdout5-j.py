#!/usr/bin/env python3
"""Blind held-out round 5, author j (PyMuPDF): regenerate all six cases.

Usage:  <venv>/bin/python make-holdout5-j.py OUT_DIR

Every case gets OUT_DIR/holdout5-j-<slug>/{before.pdf, after.pdf, truth.json}.
Base documents are written with Typst 0.15, fpdf2 2.9 or PyMuPDF 2.1; the "after" versions
are edited with PyMuPDF 2.1 the way PDF editors edit (redaction + re-inserted text, htmlbox
text, annotations, page operations, image replacement, incremental save). The Chinese case
is written from scratch with PyMuPDF insert_htmlbox in both versions.
All content is synthetic: fictitious organisations, places, people, numbers.
"""
import io
import json
import os
import shutil
import sys
import tempfile
from datetime import datetime, timezone

import pymupdf
import typst
from fpdf import FPDF
from fpdf.fonts import FontFace
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
HELP = os.path.join(HERE, "holdout5-j")
TS = 1793000000  # fixed Typst timestamp (2026-10-25) so rebuilds are stable

F_LIB_SERIF = "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf"
F_LIB_SANS = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"
F_LIB_SANS_B = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
F_DEJAVU = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
F_DEJAVU_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
F_CARLITO = "/usr/share/fonts/truetype/crosextra/Carlito-Regular.ttf"
F_INTER = "/usr/share/fonts/opentype/inter/Inter-Regular.otf"
WQY_DIR = "/usr/share/fonts/truetype/wqy"

A4 = (595.28, 841.89)
NO_IMG, NO_ART = pymupdf.PDF_REDACT_IMAGE_NONE, pymupdf.PDF_REDACT_LINE_ART_NONE


# ----------------------------------------------------------------------------- helpers

def xywh(r):
    r = pymupdf.Rect(r)
    return [round(r.x0, 1), round(r.y0, 1), round(r.width, 1), round(r.height, 1)]


def typst_pdf(src, out):
    typst.compile(os.path.join(HELP, src), output=out, timestamp=TS)


def save(doc, path, subset=False):
    # subset_fonts() would also rewrite the fonts of the original producer (it renames Typst's CFF fonts), so
    # edited files keep PyMuPDF's whole-font embedding; only the from-scratch Chinese case is subset.
    if subset:
        doc.subset_fonts()
    doc.save(path, garbage=3, deflate=True, no_new_id=True)


def chars_of(page):
    """All characters on the page as (line_index, char dict, span dict), in extraction order."""
    out = []
    li = 0
    for b in page.get_text("rawdict")["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]:
                for c in s["chars"]:
                    out.append((li, c, s))
            li += 1
    return out


def locate(page, needle, occurrence=0):
    """Find `needle` inside one extracted line; return dict with rect, origin, size, font."""
    cs = chars_of(page)
    lines = {}
    for li, c, s in cs:
        lines.setdefault(li, []).append((c, s))
    hits = []
    for li in sorted(lines):
        txt = "".join(c["c"] for c, _ in lines[li])
        start = 0
        while True:
            k = txt.find(needle, start)
            if k < 0:
                break
            hits.append(lines[li][k:k + len(needle)])
            start = k + 1
    if len(hits) <= occurrence:
        raise ValueError(f"not found on page {page.number + 1}: {needle!r} ({len(hits)} hits)")
    seq = hits[occurrence]
    r = pymupdf.Rect(seq[0][0]["bbox"])
    for c, _ in seq:
        r |= pymupdf.Rect(c["bbox"])
    return {"rect": r, "origin": pymupdf.Point(seq[0][0]["origin"]), "size": seq[0][1]["size"],
            "font": seq[0][1]["font"], "color": seq[0][1]["color"], "chars": seq}


def core(r, dx=0.4, fy=0.28):
    """Shrink a glyph-box rect so a redaction cannot touch neighbouring lines or words."""
    r = pymupdf.Rect(r)
    return pymupdf.Rect(r.x0 + dx, r.y0 + r.height * fy, r.x1 - dx, r.y1 - r.height * fy)


def redact(page, rect, **kw):
    kw.setdefault("fill", False)
    page.add_redact_annot(core(rect), **kw)


def apply(page):
    """Apply the page's redactions and check that every glyph outside the redaction boxes kept its place.

    MuPDF 1.28.6 shifts the rest of a Typst TJ string left by about one glyph when glyphs are removed from
    the middle of it, so edited tokens are placed at the start of a text run; this guard enforces that."""
    boxes = [a.rect for a in page.annots(types=[pymupdf.PDF_ANNOT_REDACT])]
    keep = [(c["c"], round(c["origin"][0], 1), round(c["origin"][1], 1)) for _, c, _ in chars_of(page)
            if c["c"].strip() and not any(pymupdf.Rect(c["bbox"]).intersects(b) for b in boxes)]
    page.apply_redactions(images=NO_IMG, graphics=NO_ART)
    after = {}
    for _, c, _ in chars_of(page):
        k = (c["c"], round(c["origin"][0], 1), round(c["origin"][1], 1))
        after[k] = after.get(k, 0) + 1
    moved = []
    for k in keep:
        if after.get(k, 0) > 0:
            after[k] -= 1
        else:
            moved.append(k)
    if moved:
        raise AssertionError(f"p{page.number + 1}: redaction moved/removed {len(moved)} glyphs, e.g. {moved[:6]}")


def text_len(text, size, fontname="helv", fontfile=None):
    if fontfile:
        return pymupdf.Font(fontfile=fontfile).text_length(text, fontsize=size)
    return pymupdf.get_text_length(text, fontname=fontname, fontsize=size)


def write_case(out_dir, slug, before_fn, after_fn, truth_fn):
    case = os.path.join(out_dir, f"holdout5-j-{slug}")
    os.makedirs(case, exist_ok=True)
    before, after = os.path.join(case, "before.pdf"), os.path.join(case, "after.pdf")
    before_fn(before)
    ctx = after_fn(before, after) or {}
    truth = truth_fn(ctx)
    truth.setdefault("synthetic", True)
    data = {"description": truth["description"], "synthetic": True, "set": "held-out-5", "blind": True,
            "truth": truth["truth"]}
    with open(os.path.join(case, "truth.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"{slug}: {pymupdf.open(before).page_count}->{pymupdf.open(after).page_count} pages, "
          f"{len(data['truth'])} truth items")


ANNOT_NOTE = ("This is a PDF annotation, not page content; the README does not claim annotation support. "
              "PDF.js, poppler and MuPDF all draw its appearance stream by default. Text inside an annotation "
              "appearance is not in PDF.js getTextContent, but poppler's pdftotext does output it.")


# ============================================================================ case 1: lease-redact (Typst)

def lease_before(path):
    typst_pdf("lease.typ", path)


def lease_after(before, after):
    doc = pymupdf.open(before)
    p1, p2, p3 = doc[0], doc[1], doc[2]
    ctx = {}

    # p1: rent amount, commencement date, index name
    rent = locate(p1, "1,850.00")
    date = locate(p1, "1 March 2027")
    cpi = locate(p1, "Consumer")
    for x in (rent, date, cpi):
        redact(p1, x["rect"])
    apply(p1)
    # rent: re-typed in Helvetica 9 pt (original: Liberation Serif 10.5 pt), baseline 0.7 pt low
    p1.insert_text(rent["origin"] + (0, 0.7), "1,975.00", fontname="helv", fontsize=9)
    # date: re-typed in the same face (Liberation Serif embedded again by PyMuPDF), same size and baseline
    p1.insert_text(date["origin"], "15 March 2027", fontname="LibSerif", fontfile=F_LIB_SERIF,
                   fontsize=date["size"])
    # index: Times-Roman (base-14, not embedded) instead of Liberation Serif
    p1.insert_text(cpi["origin"], "Retail", fontname="tiro", fontsize=cpi["size"])

    # p2: clause 6.3 deleted outright; the gap is left in place (no re-flow, as in a PDF editor)
    sent = ("6.3 The Tenant may sublet the whole of the Premises with the Landlord’s prior written consent, "
            "which shall not be unreasonably withheld.")
    rects = p2.search_for(sent)
    assert len(rects) == 2, rects
    for r in rects:
        redact(p2, r)
    apply(p2)
    ctx["del_rects"] = rects

    # p3: rent-free period replaced by the redaction annotation's own replacement text (MuPDF sets it in
    # Helvetica inside the redaction box, shrinking it to fit), the minus sign of the deposit adjustment removed
    per = locate(p3, "March to May 2027")
    box = pymupdf.Rect(per["rect"].x0, per["rect"].y0 - 1.2, per["rect"].x1 + 8, per["rect"].y1 + 1.2)
    p3.add_redact_annot(box, text="April to June 2027", fontname="helv", fontsize=10.5, fill=False)
    minus = locate(p3, "−250.00")
    mchar = pymupdf.Rect(minus["chars"][0][0]["bbox"])
    p3.add_redact_annot(pymupdf.Rect(mchar.x0 + 0.8, mchar.y0 + 3, mchar.x1 - 1.2, mchar.y1 - 3), fill=False)
    apply(p3)
    # p3: new clause 11.2 set with insert_htmlbox (MuPDF's default serif face) in the white space under 11.1
    last = locate(p3, "the recipient given in the Particulars.")
    sched = locate(p3, "Schedule: rent-free period")
    top = last["rect"].y1 + 6
    hb = pymupdf.Rect(last["rect"].x0 - 1, top, 524.5, sched["rect"].y0 - 4)
    spare, scale = p3.insert_htmlbox(
        hb, "<p>11.2 Notices may also be sent by e-mail to the address that the recipient last "
            "notified in writing.</p>", css="p {font-size: 10pt; margin: 0}")   # MuPDF default face: Charis SIL
    assert scale == 1 and spare > 0, (spare, scale)
    save(doc, after)
    return ctx


def lease_truth(ctx):
    return {
        "description": (
            "Three-page commercial lease (fictitious parties) typeset with Typst 0.15 (Liberation Serif 10.5 pt, "
            "justified, hyphenated, Liberation Sans headings) and then edited in PyMuPDF 2.1 the way a PDF editor "
            "does it, with no re-flow. All seven edits are content-stream edits; the after file contains no "
            "annotations. Each edit removes glyphs with a redaction (apply_redactions, no fill, images and line art "
            "kept) and, where text is replaced, writes new text on top. p. 1: the rent 1,850.00 is re-typed as "
            "1,975.00 in Helvetica 9 pt (base-14, not embedded) with its baseline 0.7 pt low; the commencement date "
            "is re-typed in Liberation Serif embedded again by PyMuPDF, same size and baseline; 'Consumer' becomes "
            "'Retail' in Times-Roman (base-14). p. 2: clause 6.3 is deleted and its two lines stay blank (6.4 is not "
            "renumbered). p. 3: the rent-free period cell 'March to May 2027' is replaced through the redaction "
            "annotation's own replacement text, which MuPDF sets in Helvetica shrunk to 7.5 pt inside the redaction "
            "box, about 1 pt above the old baseline; a new clause 11.2 is added in existing white space with "
            "insert_htmlbox (MuPDF's default face Charis SIL, 10 pt); only the minus glyph of the deposit adjustment "
            "−250.00 is redacted. Consequences, not listed: all replacement text is appended at the end of the page "
            "content stream, so the stream order of text differs from the visual order; shorter replacements leave "
            "small gaps in their lines; the deposit (3 x rent), the schedule's rent-free credit and the header "
            "'Draft 3' were left unchanged."),
        "truth": [
            {"type": "number", "old": "1,850.00", "new": "1,975.00", "oldPage": 1, "newPage": 1,
             "note": "Rent in the Particulars table; re-typed in Helvetica 9 pt instead of Liberation Serif 10.5 pt, baseline 0.7 pt lower. The font and size change is part of this edit, not a separate format item."},
            {"type": "number", "old": "1 March 2027", "new": "15 March 2027", "oldPage": 1, "newPage": 1,
             "note": "Commencement date (day number changed) re-typed in the same typeface at the same baseline."},
            {"type": "replace", "old": "Consumer", "new": "Retail", "oldPage": 1, "newPage": 1,
             "note": "Clause 3.1 'Consumer Prices Index' -> 'Retail Prices Index'; 'Retail' is Times-Roman (base-14) and leaves a gap before 'Prices'."},
            {"type": "delete", "old": "6.3 The Tenant may sublet the whole of the Premises", "oldPage": 2, "newPage": 2,
             "maxItems": 2,
             "note": "Whole sub-clause 6.3 redacted (two lines); the space is left blank. 6.4 keeps its number."},
            {"type": "replace", "old": "March to May 2027", "new": "April to June 2027", "oldPage": 3, "newPage": 3,
             "maxItems": 2, "note": "May be listed as 'March' -> 'April' and 'May' -> 'June'. Schedule, row 'Rent-free period, three months', column 'When'. Replacement text written by MuPDF's redaction (Helvetica 7.5 pt instead of Liberation Serif 10.5 pt). '2027' is unchanged but re-typed; the change is the months."},
            {"type": "insert", "new": "11.2 Notices may also be sent by e-mail", "oldPage": 3, "newPage": 3,
             "note": "New clause set with insert_htmlbox in MuPDF's default serif face (Charis SIL), in white space that existed before; nothing re-flows."},
            {"type": "number", "old": "\u2212250.00", "new": "250.00", "oldPage": 3, "newPage": 3,
             "note": "Schedule row 'Deposit adjustment': only the U+2212 minus glyph is redacted, so a credit becomes a charge; the digits are the original Typst glyphs at their old position, a blank remains where the sign was."},
        ],
    }


# ============================================================================ case 2: audit-annotations (fpdf2)

class AuditPDF(FPDF):
    def footer(self):
        self.set_y(-40)
        self.set_font("LS", size=8)
        self.set_text_color(90, 90, 90)
        self.cell(0, 10, "Synthetic sample: fictitious supplier, site and findings", align="L")
        self.set_x(self.l_margin)
        self.cell(0, 10, f"Page {self.page_no()} of {{nb}}", align="R")
        self.set_text_color(0, 0, 0)


def audit_before(path):
    pdf = AuditPDF(format="A4", unit="pt")
    pdf.set_creation_date(datetime(2026, 10, 23, 9, 0, tzinfo=timezone.utc))
    pdf.set_title("Supplier quality audit report (synthetic sample)")
    pdf.set_producer("fpdf2 2.9.0")
    pdf.add_font("LS", "", F_LIB_SANS)
    pdf.add_font("LS", "B", F_LIB_SANS_B)
    pdf.set_margins(56, 56, 56)
    pdf.set_auto_page_break(True, 64)
    pdf.add_page()
    W = pdf.epw

    def h(t, size=13, gap=14):
        pdf.ln(gap)
        pdf.set_font("LS", "B", size)
        pdf.cell(0, size + 4, t, new_x="LMARGIN", new_y="NEXT")
        pdf.ln(3)

    def para(t):
        pdf.set_font("LS", size=10.5)
        pdf.multi_cell(W * 0.78, 15, t, align="J", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(4)

    pdf.set_font("LS", "B", 19)
    pdf.cell(0, 24, "Supplier quality audit report", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("LS", size=10)
    pdf.cell(0, 14, "Audit reference SQA-2026-031", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(10)
    pdf.set_font("LS", size=10)
    with pdf.table(col_widths=(110, W * 0.78 - 110), width=W * 0.78, align="L", line_height=16,
                   borders_layout="HORIZONTAL_LINES", first_row_as_headings=False, text_align="LEFT") as t:
        for k, v in [("Supplier", "Marlow Precision Castings Ltd"),
                     ("Site", "Unit 9, Eastmere Industrial Estate"),
                     ("Audit date", "21 October 2026"),
                     ("Scope", "Machining, final inspection and calibration control"),
                     ("Overall score", "87 / 100")]:
            row = t.row()
            row.cell(k)
            row.cell(v)

    h("1 Summary")
    para("The supplier's process control is generally good. Machining cells run with documented set-up sheets, "
         "and first-off inspection is recorded for every batch. Calibration records for two torque wrenches were "
         "missing at the time of the audit, although both tools carried valid calibration labels. Operators knew "
         "the escalation route for non-conforming parts and could show recent examples.")
    h("2 Findings")
    pdf.set_font("LS", size=9.5)
    with pdf.table(col_widths=(34, 80, W * 0.78 - 34 - 80 - 70, 70), width=W * 0.78, align="L",
                   line_height=14, text_align="LEFT", headings_style=FontFace(emphasis="BOLD")) as t:
        for r in [("No.", "Area", "Finding", "Grade"),
                  ("F1", "Calibration", "Records for two torque wrenches not available", "Minor"),
                  ("F2", "Traceability", "Batch labels legible and complete on all sampled castings", "Observation"),
                  ("F3", "Training", "Two operators not yet trained on the new CMM program", "Minor")]:
            row = t.row()
            for v in r:
                row.cell(v)
    pdf.ln(10)
    para("Finding F1 has no effect on delivered parts, because both wrenches were checked against the reference "
         "tool on the day of the audit. The finding is considered minor.")

    pdf.add_page()
    h("3 Corrective actions", gap=0)
    para("The supplier shall submit a corrective action plan within 30 days of receiving this report. The plan "
         "must name an owner and a target date for each finding, and evidence of closure must be sent to the "
         "supplier quality team.")
    h("4 Conclusion")
    para("Approval for continued supply is recommended, subject to the closure of findings F1 and F3. The next "
         "routine audit is due in October 2027.")
    pdf.ln(36)
    pdf.set_font("LS", size=10)
    y = pdf.get_y()
    pdf.cell(80, 14, "Reviewed by")
    pdf.line(56 + 80, y + 12, 56 + 280, y + 12)
    pdf.ln(34)
    y = pdf.get_y()
    pdf.cell(80, 14, "Date")
    pdf.line(56 + 80, y + 12, 56 + 280, y + 12)
    pdf.output(path)


def audit_after(before, after):
    doc = pymupdf.open(before)
    p1, p2 = doc[0], doc[1]
    ctx = {}
    # content-stream edit 1 (p1): score 87 -> 82, redaction + Helvetica 10 pt at the same baseline
    sc = locate(p1, "87 / 100")
    d87 = pymupdf.Rect(sc["chars"][0][0]["bbox"]) | pymupdf.Rect(sc["chars"][1][0]["bbox"])
    redact(p1, d87)
    apply(p1)
    p1.insert_text(sc["origin"], "82", fontname="helv", fontsize=sc["size"])
    # content-stream edit 2 (p2): "October 2027" -> "April 2027", same face (Liberation Sans) re-embedded
    oc = locate(p2, "October 2027")
    octr = pymupdf.Rect(oc["chars"][0][0]["bbox"])
    for c, _ in oc["chars"][:7]:
        octr |= pymupdf.Rect(c["bbox"])
    redact(p2, octr)
    apply(p2)
    w_old = text_len("October", oc["size"], fontfile=F_LIB_SANS)
    w_new = text_len("April", oc["size"], fontfile=F_LIB_SANS)
    # the re-typed word is right-aligned to where "October" ended, as an editor's text box would leave it
    p2.insert_text(oc["origin"] + (w_old - w_new, 0), "April", fontname="LibSans", fontfile=F_LIB_SANS,
                   fontsize=oc["size"])

    # annotations (p1)
    stamp_r = pymupdf.Rect(400, 52, 540, 92)
    a = p1.add_stamp_annot(stamp_r, stamp=pymupdf.STAMP_ForComment)
    ctx["stamp"] = a.rect
    q = p1.search_for("Calibration records for two torque wrenches were missing", quads=True)
    assert q
    a = p1.add_highlight_annot(q)
    ctx["hl"] = a.rect
    q = p1.search_for("The finding is considered minor.", quads=True)
    assert q
    a = p1.add_strikeout_annot(q)
    ctx["so"] = a.rect
    # free-text note in the right-hand white space next to the findings table
    tbl = locate(p1, "Records for two torque wrenches")
    ft = pymupdf.Rect(56 + 0.78 * (595.28 - 112) + 8, tbl["rect"].y0 - 18, 580, tbl["rect"].y0 + 50)
    a = p1.add_freetext_annot(ft, "Reviewer: grade F1 as major? The records were missing for three weeks.",
                              fontsize=8.5, fontname="helv", text_color=(0.1, 0.1, 0.1),
                              fill_color=(1, 0.96, 0.7), border_width=0.8)
    ctx["ft"] = a.rect
    # annotations (p2)
    q = p2.search_for("within 30 days of receiving this report", quads=True)
    assert q
    a = p2.add_underline_annot(q)
    ctx["ul"] = a.rect
    line = locate(p2, "Reviewed by")
    x0, yb = line["rect"].x1 + 30, line["rect"].y1 - 1
    stroke = [(x0 + i * 3.2, yb - 6 + 7 * ((i * 37) % 11) / 11 - (3 if i % 4 == 1 else 0)) for i in range(28)]
    tail = [(x0 + 4, yb + 2), (x0 + 92, yb - 3)]
    a = p2.add_ink_annot([stroke, tail])
    a.set_colors(stroke=(0.05, 0.15, 0.55))
    a.set_border(width=1.3)
    a.update()
    ctx["ink"] = a.rect
    save(doc, after)
    return ctx


def audit_truth(c):
    return {
        "description": (
            "Two-page supplier audit report (fictitious supplier) written with fpdf2 2.9 (embedded Liberation Sans "
            "subsets, justified multi_cell paragraphs, fpdf2 tables), then reviewed in PyMuPDF 2.1. Six edits are "
            "PDF annotations with appearance streams and are not page content: a 'For Comment' rubber stamp, a "
            "highlight, a strike-out and a free-text note on p. 1, an underline and an ink scribble (initials on the "
            "'Reviewed by' line) on p. 2. Two edits are content-stream edits: on p. 1 the score '87' is redacted and "
            "'82' re-typed in Helvetica (base-14) at the same baseline, and on p. 2 'October' is redacted and 'April' "
            "re-typed in Liberation Sans embedded again by PyMuPDF, right-aligned to where 'October' ended, so a gap "
            "opens before it. The README does not claim annotation support. Consequences, not listed: the re-typed "
            "words are at the end of each page's content stream; nothing re-flows."),
        "truth": [
            {"type": "number", "old": "87", "new": "82", "oldPage": 1, "newPage": 1,
             "note": "Content-stream edit: 'Overall score 87 / 100' -> '82 / 100'. Old snippet context: '87 / 100' in the summary table."},
            {"type": "graphic", "oldPage": 1, "newPage": 1, "newRect": xywh(c["stamp"]),
             "note": "Annotation: rubber stamp 'FOR COMMENT' (/Stamp, PyMuPDF STAMP_ForComment) added at the top right. " + ANNOT_NOTE},
            {"type": "graphic", "oldPage": 1, "newPage": 1, "newRect": xywh(c["hl"]),
             "note": "Annotation: yellow /Highlight over 'Calibration records for two torque wrenches were missing' (one line). " + ANNOT_NOTE},
            {"type": "format", "old": "The finding is considered minor.", "new": "The finding is considered minor.",
             "oldPage": 1, "newPage": 1, "newRect": xywh(c["so"]),
             "note": "Annotation: red /StrikeOut over the sentence (two lines); the text itself is unchanged. " + ANNOT_NOTE},
            {"type": "graphic", "oldPage": 1, "newPage": 1, "newRect": xywh(c["ft"]),
             "note": "Annotation: /FreeText note 'Reviewer: grade F1 as major? The records were missing for three weeks.' on a pale yellow box in the white space right of the findings table. Its text is not part of the page content. " + ANNOT_NOTE},
            {"type": "format", "old": "within 30 days of receiving this report", "new": "within 30 days of receiving this report",
             "oldPage": 2, "newPage": 2, "newRect": xywh(c["ul"]),
             "note": "Annotation: green /Underline under the phrase (two lines); text unchanged. " + ANNOT_NOTE},
            {"type": "replace", "old": "October 2027", "new": "April", "oldPage": 2, "newPage": 2,
             "note": "Content-stream edit: next audit 'October 2027' -> 'April 2027'; only the month was re-typed, so the new snippet is the re-typed word."},
            {"type": "graphic", "oldPage": 2, "newPage": 2, "newRect": xywh(c["ink"]),
             "note": "Annotation: blue /Ink scribble (initials) on the 'Reviewed by' line. " + ANNOT_NOTE},
        ],
    }


# ============================================================================ case 3: handbook-pages (Typst)

def handbook_before(path):
    typst_pdf("handbook.typ", path)


LONE_WORKING_HTML = """
<h2>5A Lone working</h2>
<p>Lone working is allowed only for tasks listed as low risk in the job planning system, such as meter readings,
valve exercising in footways and visual inspections of reservoirs from the outside.</p>
<p>Before starting, the lone worker books the task in the check-in app and sets a check-in interval of no more than
sixty minutes. If a check-in is missed, the control room calls the worker twice and then sends the nearest crew.</p>
<ul>
<li>Carry a charged phone and the personal alarm issued by the depot.</li>
<li>Do not lift covers heavier than 25 kg without a second person.</li>
<li>Stop work and leave the site if a member of the public becomes aggressive.</li>
</ul>
<p>Confined spaces, work at height and work in live traffic lanes are never lone working tasks.</p>
"""


def handbook_after(before, after):
    doc = pymupdf.open(before)
    ctx = {"size": tuple(doc[0].rect)[2:]}
    # content-stream edits on old p. 3 (travel): allowance and mileage rate
    p = doc[2]
    a = locate(p, "48.00")
    m = locate(p, "0.32")
    redact(p, a["rect"])
    redact(p, m["rect"])
    apply(p)
    p.insert_text(a["origin"], "52.00", fontname="Carlito", fontfile=F_CARLITO, fontsize=a["size"])
    p.insert_text(m["origin"], "0.35", fontname="helv", fontsize=10)
    # page operations, in the order an editor would do them
    doc.delete_page(3)            # old p.4 "Legacy paper forms"      -> 1,2,3,5,6,7
    doc.move_page(5, 1)           # old p.7 appendix moved to 2nd     -> 1,7,2,3,5,6
    doc.fullcopy_page(2, 5)       # copy of old p.2 (PPE) before p.6  -> 1,7,2,3,5,2',6
    np_ = doc.new_page(6, width=A4[0], height=A4[1])   # new page      -> 1,7,2,3,5,2',N,6
    spare, scale = np_.insert_htmlbox(
        pymupdf.Rect(68, 74, 527, 780), LONE_WORKING_HTML,
        css="body {font-family: sans-serif; font-size: 10.5pt; line-height: 1.35} h2 {font-size: 14pt} "
            "p, li {margin-bottom: 6pt}")
    assert scale == 1, scale
    doc[7].set_rotation(90)       # old p.6 hydrant schedule, now shown landscape
    ctx["rot_size"] = (doc[7].rect.width, doc[7].rect.height)
    save(doc, after)
    return ctx


def handbook_truth(c):
    W, H = c["size"]
    return {
        "description": (
            "Seven-page field service handbook (fictitious water utility) typeset with Typst 0.15 (Carlito 11 pt, one "
            "section per page, running header, footer 'Page n of 7'), then reorganised in PyMuPDF 2.1 with page "
            "operations, which change the page tree and not any content stream: old p. 4 'Legacy paper forms' deleted (delete_page); the appendix of emergency contacts "
            "moved from the end (old p. 7) to new p. 2 (move_page); a full copy of the PPE page (old p. 2, still at "
            "new p. 3) inserted as new p. 6 (fullcopy_page); a new page '5A Lone working' created with new_page + "
            "insert_htmlbox (Nimbus Sans, no running header or footer) as new p. 7; the hydrant schedule (old p. 6, "
            "new p. 8) rotated by 90 degrees (a /Rotate 90 page attribute). Content-stream edits on the travel page (old p. 3, new "
            "p. 4): in the rates table the daily allowance 48.00 is redacted and re-typed as 52.00 in Carlito embedded "
            "again by PyMuPDF, and the mileage rate 0.32 is re-typed as 0.35 in Helvetica 10 pt (base-14). No "
            "annotations. Consequences, not "
            "listed: the Typst footers keep their old numbers, so new p. 2 says 'Page 7 of 7', new pp. 3 and 6 both "
            "say 'Page 2 of 7' and no page says 'Page 4'; the contents list on p. 1 still names section 4; all pages "
            "after the move shift position. 7 -> 8 pages."),
        "truth": [
            {"type": "delete", "old": "Until the tablet roll-out is complete", "oldPage": 4, "newPage": 4,
             "maxItems": 4,
             "note": "Whole page deleted (heading, a paragraph, a four-item list and a paragraph). Old p. 4 sat between old p. 3 (now new p. 4) and old p. 5 (now new p. 5); newPage 4 is the deletion point at the end of new p. 4."},
            {"type": "move", "old": "Call these numbers in the order shown", "new": "Call these numbers in the order shown",
             "oldPage": 7, "newPage": 2, "maxItems": 3,
             "note": "Whole page (Appendix A, emergency contacts table) moved from the end to second position, unchanged. Its footer still reads 'Page 7 of 7'."},
            {"type": "insert", "new": "Crews must wear the equipment listed below", "oldPage": 5, "newPage": 6,
             "maxItems": 4,
             "note": "Exact duplicate of the PPE page (old p. 2 = new p. 3, still in place) inserted after the confined-space page; oldPage 5 is the insertion point at the end of old p. 5. Expected to be described as repeating new p. 3 word for word."},
            {"type": "insert", "new": "5A Lone working", "oldPage": 5, "newPage": 7, "maxItems": 5,
             "note": "New page written with insert_htmlbox: heading, three paragraphs and a three-item list; inserted after the duplicate PPE page and before the hydrant page, i.e. at the end of old p. 5 in old terms. It has no running header or footer."},
            {"type": "graphic", "oldPage": 6, "newPage": 8, "oldRect": [0, 0, round(W, 1), round(H, 1)],
             "newRect": [0, 0, round(c["rot_size"][0], 1), round(c["rot_size"][1], 1)],
             "note": "Page rotation 0 -> 90 degrees: the hydrant schedule page is displayed landscape with its text running top to bottom; content unchanged. README lists page size or orientation changes under graphics. Rects are the whole page in display orientation."},
            {"type": "number", "old": "48.00", "new": "52.00", "oldPage": 3, "newPage": 4,
             "note": "Rates table, daily allowance '48.00 per day': re-typed in the same face (Carlito 11 pt) at the same baseline."},
            {"type": "number", "old": "0.32", "new": "0.35", "oldPage": 3, "newPage": 4,
             "note": "Rates table, private car '0.32 per kilometre': re-typed in Helvetica 10 pt instead of Carlito 11 pt; the font change is part of this edit."},
        ],
    }


# ============================================================================ case 4: invoice-incremental (fpdf2)

def chart_png(values, highlight=None):
    """Bar chart 'visits completed per week' as PNG bytes (Pillow, DejaVu Sans labels)."""
    w, h = 900, 380
    im = Image.new("RGB", (w, h), "white")
    d = ImageDraw.Draw(im)
    f = ImageFont.truetype(F_DEJAVU, 22)
    fb = ImageFont.truetype(F_DEJAVU_B, 24)
    d.text((20, 12), "Visits completed per week", font=fb, fill=(30, 30, 30))
    x0, y0, y1 = 90, 70, 320
    for k in range(4):
        y = y1 - k * (y1 - y0) / 3
        d.line((x0, y, w - 30, y), fill=(215, 215, 215), width=2)
        d.text((50, y - 13), str(k), font=f, fill=(80, 80, 80))
    bw = 110
    for i, v in enumerate(values):
        bx = x0 + 40 + i * 155
        col = (47, 111, 159) if i != highlight else (196, 98, 32)
        d.rectangle((bx, y1 - v * (y1 - y0) / 3, bx + bw, y1), fill=col)
        d.text((bx + 22, y1 + 12), f"wk {40 + i}", font=f, fill=(60, 60, 60))
    bio = io.BytesIO()
    im.save(bio, "PNG", optimize=True)
    return bio.getvalue()


class InvoicePDF(FPDF):
    def footer(self):
        self.set_y(-38)
        self.set_font("DV", size=7.5)
        self.set_text_color(100, 100, 100)
        self.cell(0, 10, "Synthetic sample: fictitious companies, account numbers and amounts", align="L")
        self.set_x(self.l_margin)
        self.cell(0, 10, f"Page {self.page_no()} of {{nb}}", align="R")
        self.set_text_color(0, 0, 0)


def invoice_before(path):
    pdf = InvoicePDF(format="A4", unit="pt")
    pdf.set_creation_date(datetime(2026, 10, 31, 16, 0, tzinfo=timezone.utc))
    pdf.set_title("Invoice INV-2026-0418 (synthetic sample)")
    pdf.add_font("DV", "", F_DEJAVU)
    pdf.add_font("DV", "B", F_DEJAVU_B)
    pdf.set_margins(54, 54, 54)
    pdf.set_auto_page_break(True, 60)
    pdf.add_page()
    W = pdf.epw
    pdf.set_font("DV", "B", 14)
    pdf.cell(W * 0.6, 18, "Kestrel Facility Services Ltd")
    pdf.set_font("DV", "B", 20)
    pdf.cell(W * 0.4, 18, "INVOICE", align="R", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("DV", size=8.5)
    pdf.cell(0, 12, "8 Ropewalk, Northbridge NB3 2LP · VAT no. ZZ 402 7781 15", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(18)
    top = pdf.get_y()
    pdf.set_font("DV", "B", 9)
    pdf.cell(0, 13, "Bill to", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("DV", size=9)
    for t in ["Brightwater Dental Practice", "22 Lantern Yard", "Eastmere EM4 9RS"]:
        pdf.cell(0, 13, t, new_x="LMARGIN", new_y="NEXT")
    pdf.set_xy(54 + W - 210, top)
    for k, v in [("Invoice no.", "INV-2026-0418"), ("Invoice date", "31 October 2026"),
                 ("Due date", "30 November 2026"), ("Customer ref.", "PO-77215")]:
        pdf.set_x(54 + W - 210)
        pdf.set_font("DV", "B", 9)
        pdf.cell(85, 13, k)
        pdf.set_font("DV", size=9)
        pdf.cell(125, 13, v, align="R", new_x="LMARGIN", new_y="NEXT")
    pdf.set_y(top + 70)
    pdf.ln(14)
    pdf.set_font("DV", size=9)
    rows = [("Window cleaning, external, monthly visits", "3", "180.00", "540.00"),
            ("Filter replacement, air handling unit AHU-2", "2", "620.00", "1,240.00"),
            ("Emergency call-out on 14 October, hours", "2.5", "86.00", "215.00"),
            ("Washroom consumables, October", "1", "312.40", "312.40"),
            ("Service credit, missed visit on 3 October", "1", "−95.00", "−95.00")]
    with pdf.table(col_widths=(W - 3 * 72, 72, 72, 72), text_align=("LEFT", "RIGHT", "RIGHT", "RIGHT"),
                   line_height=17, borders_layout="HORIZONTAL_LINES",
                   cell_fill_color=(240, 243, 247), cell_fill_mode="ROWS",
                   headings_style=FontFace(emphasis="BOLD")) as t:
        for r in [("Description", "Qty", "Unit price", "Amount (EUR)")] + rows:
            row = t.row()
            for v in r:
                row.cell(v)
    pdf.ln(8)
    for k, v, b in [("Subtotal", "2,212.40", ""), ("VAT 20 %", "442.48", ""), ("Total due (EUR)", "2,654.88", "B")]:
        pdf.set_x(54 + W - 216)
        pdf.set_font("DV", b, 9.5)
        pdf.cell(144, 16, k)
        pdf.cell(72, 16, v, align="R", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(34)
    pdf.set_font("DV", "B", 9.5)
    pdf.cell(0, 14, "Payment", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("DV", size=9)
    pdf.cell(0, 13, "Please pay by bank transfer to Kestrel Facility Services Ltd.", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 13, "Account ZZ41 7700 2045 1189 03", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 13, "Quote INV-2026-0418 as the payment reference.", new_x="LMARGIN", new_y="NEXT")

    pdf.add_page()
    pdf.set_font("DV", "B", 13)
    pdf.cell(0, 18, "Service report, October 2026", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)
    pdf.set_font("DV", size=9.5)
    pdf.multi_cell(W, 14, "During October our team completed 11 of 12 scheduled visits. The visit on 3 October was "
                          "missed because of a vehicle breakdown; a service credit for it is included on page 1.",
                   new_x="LMARGIN", new_y="NEXT")
    pdf.ln(10)
    pdf.image(io.BytesIO(chart_png([3, 2, 3, 2, 1])), x=54, w=360)
    pdf.ln(16)
    pdf.set_font("DV", "B", 10)
    pdf.cell(0, 15, "Notes", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("DV", size=9.5)
    for t in ["Queries must be raised within 14 days of the invoice date.",
              "Late payments may incur interest at 1.5 % per month.",
              "Consumables are invoiced at cost plus a 10 % handling charge."]:
        pdf.cell(12, 15, "•")
        pdf.cell(0, 15, t, new_x="LMARGIN", new_y="NEXT")
    pdf.output(path)


def invoice_after(before, after):
    shutil.copyfile(before, after)
    doc = pymupdf.open(after)
    p1, p2 = doc[0], doc[1]
    ctx = {}
    due = locate(p1, "30 November 2026")
    amt = locate(p1, "1,240.00")
    acc = locate(p1, "2045 1189 03")
    for x in (due, amt, acc):
        redact(p1, x["rect"])
    apply(p1)
    # due date: right-aligned cell, re-typed in DejaVu Sans (re-embedded) to the same right edge
    wn = text_len("18 November 2026", due["size"], fontfile=F_DEJAVU)
    p1.insert_text((due["rect"].x1 - wn, due["origin"].y), "18 November 2026", fontname="DejaVu",
                   fontfile=F_DEJAVU, fontsize=due["size"])
    # amount: Helvetica 9 pt, right-aligned to the old right edge (DejaVu digits are wider)
    wn = text_len("1,420.00", amt["size"])
    p1.insert_text((amt["rect"].x1 - wn, amt["origin"].y), "1,420.00", fontname="helv", fontsize=amt["size"])
    # account digits: Helvetica, left-aligned where the old digits started
    p1.insert_text(acc["origin"], "9932 0457 18", fontname="helv", fontsize=acc["size"])
    # annotation: APPROVED stamp in the white space between "Bill to" and the invoice details
    bill = locate(p1, "Bill to")
    st = pymupdf.Rect(186, bill["rect"].y0 + 2, 314, bill["rect"].y0 + 40)
    ctx["stamp"] = p1.add_stamp_annot(st, stamp=pymupdf.STAMP_Approved).rect

    # p2: chart image replaced (same size and position), first note deleted, notice added
    imgs = p2.get_images(full=True)
    assert len(imgs) == 1
    xref = imgs[0][0]
    ctx["img"] = p2.get_image_rects(xref)[0]
    p2.replace_image(xref, stream=chart_png([3, 2, 3, 3, 1], highlight=3))
    q = locate(p2, "Queries must be raised within 14 days of the invoice date.")
    bullet = locate(p2, "•")
    redact(p2, q["rect"])
    redact(p2, bullet["rect"], )
    apply(p2)
    last = locate(p2, "Consumables are invoiced at cost")
    hb = pymupdf.Rect(53, last["rect"].y1 + 14, 541, last["rect"].y1 + 60)
    spare, scale = p2.insert_htmlbox(
        hb, "<p><b>Our bank details changed on 1 November 2026.</b> Please update your supplier records "
            "before the next payment.</p>", css="p {font-family: sans-serif; font-size: 9.5pt; margin: 0}")
    assert scale == 1
    # incremental update (what saveIncr() does, plus compression): the original objects stay in the file
    doc.save(after, incremental=True, encryption=pymupdf.PDF_ENCRYPT_KEEP, deflate=True)
    return ctx


def invoice_truth(c):
    return {
        "description": (
            "Two-page invoice with a service report (fictitious companies) written with fpdf2 2.9 (embedded DejaVu "
            "Sans subsets, zebra-shaded line-item table, a PNG bar chart made with Pillow), then edited with PyMuPDF "
            "2.1 and saved as an incremental update (save(incremental=True), as saveIncr does, with compression): the "
            "original revision is still in the file byte for byte and the edits are appended. Content-stream edits: p. 1 the due date, the amount of line 2 and the last digit "
            "groups of the bank account are redacted (no fill, shading kept) and re-typed (due date in DejaVu Sans "
            "embedded again by PyMuPDF, amount and account digits in Helvetica base-14); p. 2 the first note and its "
            "bullet are redacted and a notice is added with insert_htmlbox (Nimbus Sans, drawn through a form "
            "XObject). Image edit: the chart image object is replaced in place (replace_image, same object number, "
            "size and position) by a chart in which the bar for week 43 is higher and orange. Annotation: an "
            "'APPROVED' rubber stamp (/Stamp) on p. 1; the README does not claim annotation support. Consequences, "
            "not listed: subtotal, VAT and total were deliberately left at their old values, so line 2 (2 x 620.00) "
            "no longer adds up; the text '11 of 12 scheduled visits' was not updated to match the new chart; "
            "re-typed text sits at the end of the content stream."),
        "truth": [
            {"type": "number", "old": "30 November 2026", "new": "18 November 2026", "oldPage": 1, "newPage": 1,
             "note": "Due date (day number) re-typed in the same face, right-aligned to the old right edge."},
            {"type": "number", "old": "1,240.00", "new": "1,420.00", "oldPage": 1, "newPage": 1,
             "note": "Amount of line 2 (filter replacement) with transposed digits; Helvetica instead of DejaVu Sans. Qty 2 and unit price 620.00 unchanged."},
            {"type": "replace", "old": "2045 1189 03", "new": "9932 0457 18", "oldPage": 1, "newPage": 1,
             "maxItems": 3,
             "note": "Bank account 'ZZ41 7700 2045 1189 03' -> 'ZZ41 7700 9932 0457 18' (an account identifier, not an amount; a tool may list the three digit groups as number changes)."},
            {"type": "graphic", "oldPage": 1, "newPage": 1, "newRect": xywh(c["stamp"]),
             "note": "Annotation: rubber stamp 'APPROVED' (/Stamp, PyMuPDF STAMP_Approved). " + ANNOT_NOTE},
            {"type": "graphic", "oldPage": 2, "newPage": 2, "oldRect": xywh(c["img"]), "newRect": xywh(c["img"]),
             "note": "Chart image replaced in place: week 43 bar 2 -> 3 visits and coloured orange instead of blue. The chart labels are pixels, not text."},
            {"type": "delete", "old": "Queries must be raised within 14 days of the invoice date.", "oldPage": 2,
             "newPage": 2, "note": "First note and its bullet redacted; the line stays blank."},
            {"type": "insert", "new": "Our bank details changed on 1 November 2026.", "oldPage": 2, "newPage": 2,
             "note": "Added with insert_htmlbox (Nimbus Sans, first sentence bold) below the notes; it continues 'Please update your supplier records before the next payment.'"},
        ],
    }


# ============================================================================ case 5: zh-quote-htmlbox (PyMuPDF from scratch)

ZH_CSS = """
@font-face {font-family: zh; src: url(wqy-zenhei.ttc);}
body {font-family: zh; font-size: 10.5pt; line-height: 1.65;}
h1 {font-size: 18pt; margin: 0 0 8pt 0; line-height: 1.3;}
h2 {font-size: 12.5pt; margin: 12pt 0 4pt 0; line-height: 1.3;}
p {margin: 0 0 5pt 0; text-align: justify;}
p.meta {font-size: 9.5pt; margin: 0 0 2pt 0;}
table {border-collapse: collapse; width: 100%; margin: 6pt 0 4pt 0;}
td, th {border: 0.6pt solid #666; padding: 2pt 5pt; font-size: 9.5pt;}
th {background-color: #eef1f5;}
td.n {text-align: right;}
ol {margin: 2pt 0 0 0;}
li {margin-bottom: 3pt;}
.u {text-decoration: underline;}
.foot {font-size: 8pt; color: #666;}
"""

ZH_TABLE = """
<table>
<tr><th>序号</th><th>设备及型号</th><th>数量</th><th>单价（元/年）</th><th>小计（元）</th></tr>
<tr><td>1</td><td>A3 彩色复印机 QX-5200</td><td class="n">3</td><td class="n">2,400.00</td><td class="n">7,200.00</td></tr>
<tr><td>2</td><td>激光打印机 LP-310</td><td class="n">6</td><td class="n">950.00</td><td class="n">5,700.00</td></tr>
<tr><td>3</td><td>投影仪 PJ-80</td><td class="n">2</td><td class="n">1,150.00</td><td class="n">2,300.00</td></tr>
<tr><td>4</td><td>碎纸机 SD-12</td><td class="n">1</td><td class="n">600.00</td><td class="n">600.00</td></tr>
<tr><td></td><td>合计</td><td class="n">12</td><td></td><td class="n">15,800.00</td></tr>
</table>
"""

ZH_MOVED = "<p>如需将服务扩展至分支机构，请提前一个月联系客户经理，我们将根据设备数量和上门距离另行报价。</p>"


def zh_pages(after):
    valid = "2026年12月31日" if after else "2026年11月30日"
    freq = "每月" if after else "每季度"
    hours = "6" if after else "4"
    lang = "in English and Chinese" if after else "in English"
    p1 = f"""
<h1>办公设备年度维护服务报价单</h1>
<p class="meta">报价编号：QH-2026-117　　报价日期：2026年11月4日　　有效期至：{valid}</p>
<p class="meta">致：临江设计工作室 行政部　　报价方：青禾办公服务有限公司</p>
<h2>一、服务内容</h2>
<p>本报价涵盖贵司 12 台办公设备的年度预防性维护、故障维修和耗材更换。我们{freq}上门巡检一次，每次巡检包括清洁、校准、固件检查和打印质量测试，并在巡检后两个工作日内提交书面报告。</p>
{ZH_MOVED if after else ""}
{ZH_TABLE}
<h2>二、响应时间</h2>
<p>工作日 8:30 至 17:30 报修的，我们在 2 小时内电话响应，{hours} 小时内派工程师上门。非工作时间报修的，响应时间顺延至下一个工作日。Remote support is available {lang} on weekdays.</p>
<h2>三、付款方式</h2>
<p>合同签订后 10 个工作日内支付全年服务费的 50%，余款于服务满六个月后 10 个工作日内付清。</p>
<h2>四、其他条款</h2>
<ol>
<li>{'<span class="u">逾期付款按每日 0.05% 计收违约金</span>' if after else '逾期付款按每日 0.05% 计收违约金'}。</li>
<li>本报价不含零配件费用，零配件按实际更换数量另行报价。</li>
{'' if after else '<li>报价含上门差旅费用。</li>'}
<li>双方对本报价的内容负有保密义务。</li>
{'<li>更换的零配件享有 12 个月质保。</li>' if after else ''}
</ol>
"""
    p2 = f"""
<h2>五、服务团队</h2>
<p>项目由一名客户经理和两名认证工程师负责。客户经理每月与贵司行政部沟通一次服务情况，工程师名单在合同签订后五个工作日内提供。</p>
{"" if after else ZH_MOVED}
<p>工程师上门时出示工作证，并在服务记录单上记录到达和离开时间、处理内容及更换的耗材。服务记录单一式两份，双方各执一份。</p>
<h2>六、双方确认</h2>
<p>贵司确认本报价后，我们将在三个工作日内提交正式服务合同。</p>
<table>
<tr><th>报价方（盖章）</th><th>客户确认（盖章）</th></tr>
<tr><td><br/><br/><br/>日期：</td><td><br/><br/><br/>日期：</td></tr>
</table>
"""
    return [p1, p2]


def zh_build(path, after):
    doc = pymupdf.open()
    arch = pymupdf.Archive(WQY_DIR)
    pages = zh_pages(after)
    for i, html in enumerate(pages):
        page = doc.new_page(width=A4[0], height=A4[1])
        spare, scale = page.insert_htmlbox(pymupdf.Rect(56, 52, 539, 790), html, css=ZH_CSS, archive=arch,
                                           scale_low=1)
        assert scale == 1 and spare >= 0, (i, spare, scale)
        page.insert_htmlbox(pymupdf.Rect(56, 800, 539, 822),
                            f'<p class="foot">合成样例（synthetic sample）：公司名称、型号与金额均为虚构 · 第 {i + 1} 页，共 {len(pages)} 页</p>',
                            css=ZH_CSS, archive=arch, scale_low=1)
    doc.set_metadata({"title": "办公设备年度维护服务报价单（合成样例）", "producer": "PyMuPDF 2.1 insert_htmlbox",
                      "creationDate": "D:20261104090000Z", "modDate": "D:20261104090000Z"})
    save(doc, path, subset=True)   # WenQuanYi Zen Hei would otherwise be embedded whole (about 25 MB)


def zh_truth(_):
    return {
        "description": (
            "Two-page Simplified Chinese quotation for office-equipment maintenance (fictitious companies, models "
            "and prices) with English phrases and a price table, written from scratch in both versions with PyMuPDF "
            "2.1 insert_htmlbox (MuPDF Story HTML/CSS layout; WenQuanYi Zen Hei embedded via @font-face; each page "
            "is its own htmlbox, so text re-flows within a page but never across pages). Both versions are regenerated "
            "from edited HTML, so every edit is a content-stream edit; there are no annotations. Edits: validity date, "
            "inspection frequency, on-site response hours, an English phrase extended, underline added to the "
            "late-payment clause, list item 3 deleted, a new last list item, and a paragraph moved from p. 2 "
            "(section 5) to p. 1 (end of section 1). Consequences, not listed: the rest of p. 1 re-flows downwards; "
            "the ordered list renumbers automatically (item 4 becomes 3); p. 2 closes the gap left by the moved "
            "paragraph."),
        "truth": [
            {"type": "number", "old": "有效期至：2026年11月30日", "new": "有效期至：2026年12月31日", "oldPage": 1, "newPage": 1,
             "maxItems": 2, "note": "Validity date: month 11 -> 12 and day 30 -> 31 in one date; may be listed as one or two number changes."},
            {"type": "replace", "old": "每季度上门巡检", "new": "每月上门巡检", "oldPage": 1, "newPage": 1,
             "note": "Inspection frequency quarterly -> monthly (每季度 -> 每月)."},
            {"type": "number", "old": "4 小时内派工程师", "new": "6 小时内派工程师", "oldPage": 1, "newPage": 1,
             "note": "On-site response time 4 -> 6 hours; the 2-hour phone response before it is unchanged."},
            {"type": "insert", "new": "and Chinese", "oldPage": 1, "newPage": 1,
             "note": "English sentence inside Chinese text: 'available in English on weekdays' -> 'available in English and Chinese on weekdays'."},
            {"type": "format", "old": "逾期付款按每日 0.05% 计收违约金", "new": "逾期付款按每日 0.05% 计收违约金", "oldPage": 1, "newPage": 1,
             "note": "Underline added (CSS text-decoration, drawn by MuPDF as line art in the content stream); text unchanged."},
            {"type": "delete", "old": "报价含上门差旅费用。", "oldPage": 1, "newPage": 1,
             "note": "Ordered-list item 3 deleted; the following item is renumbered automatically (not listed)."},
            {"type": "insert", "new": "更换的零配件享有 12 个月质保。", "oldPage": 1, "newPage": 1,
             "note": "New last list item (numbered 4 in the new version)."},
            {"type": "move", "old": "如需将服务扩展至分支机构", "new": "如需将服务扩展至分支机构", "oldPage": 2, "newPage": 1,
             "note": "Unchanged paragraph moved from section 5 on p. 2 to the end of section 1 on p. 1."},
        ],
    }


# ============================================================================ case 6: datasheet-overlay (Typst)

def ds_before(path):
    typst_pdf("datasheet.typ", path)


def ds_after(before, after):
    doc = pymupdf.open(before)
    p1, p2 = doc[0], doc[1]
    ctx = {}
    grey = (80 / 255,) * 3
    # p1: header revision, document-number line moved right, minus temperature, chart bar extended
    rv1 = locate(p1, "Rev. B")
    dn = locate(p1, "Document no. DS-UFM80-004")
    t20 = locate(p1, "−20")
    for x in (rv1, dn, t20):
        redact(p1, x["rect"])
    apply(p1)
    p1.insert_text(rv1["origin"], "Rev. C", fontname="helv", fontsize=rv1["size"], color=grey)
    wdn = text_len("Document no. DS-UFM80-004", dn["size"], fontfile=F_INTER)
    right = 595.28 - 22 * 72 / 25.4
    ctx["dn_old"] = dn["rect"]
    nx = right - wdn
    p1.insert_text((nx, dn["origin"].y), "Document no. DS-UFM80-004", fontname="InterR", fontfile=F_INTER,
                   fontsize=dn["size"])
    ctx["dn_new"] = pymupdf.Rect(nx, dn["rect"].y0, right, dn["rect"].y1)
    # Helvetica has no U+2212, so the editor types a hyphen-minus
    p1.insert_text(t20["origin"], "-10", fontname="helv", fontsize=t20["size"])
    bars = [d for d in p1.get_drawings() if d.get("fill") and abs(d["fill"][0] - 0x2f / 255) < 0.01]
    bars.sort(key=lambda d: d["rect"].y0)
    assert len(bars) == 5, len(bars)
    old = bars[2]["rect"]   # DN100, 1.6 s
    unit = 36 * 72 / 25.4
    ext = pymupdf.Rect(old.x0, old.y0, old.x0 + 2.1 * unit, old.y1)
    p1.draw_rect(ext, color=None, fill=bars[2]["fill"], width=0)
    ctx["bar_old"], ctx["bar_new"] = old, pymupdf.Rect(old.x0, old.y0, ext.x1, old.y1)

    # p2: header revision, heading font replaced, footnote text deleted, note added with insert_htmlbox
    rv2 = locate(p2, "Rev. B")
    hd = locate(p2, "3 Electrical connection")
    fn = p2.search_for("Use shielded twisted-pair cable and connect the shield at the transmitter end only.")
    assert len(fn) == 1
    fnum = None
    for li, c, s in chars_of(p2):
        if c["c"] == "1" and abs(c["bbox"][1] - fn[0].y0) < 6 and c["bbox"][2] <= fn[0].x0 + 0.5:
            fnum = pymupdf.Rect(c["bbox"])
    assert fnum is not None
    for r in (rv2["rect"], hd["rect"], fn[0] | fnum):
        redact(p2, r)
    apply(p2)
    p2.insert_text(rv2["origin"], "Rev. C", fontname="helv", fontsize=rv2["size"], color=grey)
    p2.insert_text(hd["origin"], "3 Electrical connection", fontname="tibo", fontsize=hd["size"])
    li4 = locate(p2, "spacing it displays.")
    oi = locate(p2, "5 Ordering information")
    hb = pymupdf.Rect(dn["rect"].x0 - 1, li4["rect"].y1 + 8, right + 1, oi["rect"].y0 - 6)
    spare, scale = p2.insert_htmlbox(
        hb, "<p><b>Note:</b> transmitter firmware 2.4 or later is required for the low-flow cut-off "
            "at 0.01 m/s.</p>", css="p {font-family: sans-serif; font-size: 9pt; margin: 0}")
    assert scale == 1, scale
    ctx["hd"] = hd["rect"]
    # the re-typed Times-Bold heading is narrower than the Inter Bold original (checker fix): same x0/y0/height,
    # width from the base-14 Times-Bold metrics
    ctx["hd_new"] = pymupdf.Rect(hd["rect"].x0, hd["rect"].y0,
                                 hd["rect"].x0 + text_len("3 Electrical connection", hd["size"], fontname="tibo"),
                                 hd["rect"].y1)
    save(doc, after)
    return ctx


def ds_truth(c):
    return {
        "description": (
            "Two-page product datasheet (fictitious flow meter) typeset with Typst 0.15 (Inter 9.5 pt, justified and "
            "hyphenated, shaded specification table, a bar chart drawn as Typst rectangles, a footnote), then edited "
            "with PyMuPDF 2.1. All edits are content-stream edits and none adds an annotation. The before file has "
            "Typst's two invisible /Link annotations for the footnote (marker to footnote and back); the redaction of "
            "the footnote text also removed the back-link, so the after file keeps only the link on the in-text marker. "
            "Redaction (no "
            "fill) + re-inserted text: the running header 'Rev. B' becomes 'Rev. C' on both pages (Helvetica 8 pt); "
            "the line 'Document no. DS-UFM80-004' is removed and set again in Inter (embedded again by PyMuPDF), "
            "right-aligned to the right margin; the minimum operating temperature '−20' (U+2212) is re-typed as '-10' "
            "with an ASCII hyphen-minus because Helvetica has no U+2212; the heading '3 Electrical connection' is "
            "re-typed with the same words in Times-Bold (base-14) instead of Inter Bold; the footnote text on p. 2 is "
            "redacted, leaving its separator rule and the superscript marker in the body text. Drawn: the DN100 bar "
            "of the response-time chart is lengthened from 1.6 s to 2.1 s by drawing a longer filled rectangle of the same "
            "colour over it. "
            "Added with insert_htmlbox: a firmware note in the white space under the installation list. "
            "Consequences, not listed: re-typed text sits at the end of each content stream; the dangling footnote "
            "marker '1' after 'motor cables' is left as it was."),
        "truth": [
            {"type": "furniture", "old": "Rev. B", "new": "Rev. C", "oldPage": 1, "newPage": 1,
             "note": "Running header revision letter, p. 1."},
            {"type": "furniture", "old": "Rev. B", "new": "Rev. C", "oldPage": 2, "newPage": 2,
             "note": "Running header revision letter, p. 2 (same edit as p. 1)."},
            {"type": "position", "old": "Document no. DS-UFM80-004", "new": "Document no. DS-UFM80-004",
             "oldPage": 1, "newPage": 1, "oldRect": xywh(c["dn_old"]), "newRect": xywh(c["dn_new"]),
             "note": "Same words, same typeface and size (Inter re-embedded by PyMuPDF, so the PDF font name differs from Typst's 'Inter-Regular-Identity-H' subset), moved from the left margin to the right margin, about %d pt to the right." % round(c["dn_new"].x0 - c["dn_old"].x0)},
            {"type": "number", "old": "−20", "new": "-10", "oldPage": 1, "newPage": 1,
             "note": "Operating temperature '−20 °C to +60 °C' -> '-10 °C to +60 °C'. Old sign is U+2212, new sign is ASCII '-'; both are negative."},
            {"type": "graphic", "oldPage": 1, "newPage": 1, "oldRect": xywh(c["bar_old"]), "newRect": xywh(c["bar_new"]),
             "note": "Chart bar DN100 longer (1.6 s -> 2.1 s); no value labels on the bars, the axis is unchanged."},
            {"type": "format", "old": "3 Electrical connection", "new": "3 Electrical connection", "oldPage": 2, "newPage": 2,
             "oldRect": xywh(c["hd"]), "newRect": xywh(c["hd_new"]),
             "note": "Font substitution on unchanged text: heading re-typed in Times-Bold instead of Inter Bold, same size and baseline. "
                     "newRect is the narrower Times-Bold text (ends at x %.1f; the Inter Bold original ended at x %.1f)."
                     % tuple(r[0] + r[2] for r in (xywh(c["hd_new"]), xywh(c["hd"])))},  # right edges of the rounded rects
            {"type": "delete", "old": "Use shielded twisted-pair cable and connect the shield", "oldPage": 2, "newPage": 2,
             "note": "Footnote text (with its number) removed at the page bottom; the in-text marker stays."},
            {"type": "insert", "new": "2.4 or later is required for the low", "oldPage": 2, "newPage": 2,
             "note": "Note added with insert_htmlbox (Nimbus Sans 9 pt, 'Note:' bold) between the installation list and section 5. "
                     "Snippet avoids 'firmware', 'flow' and 'off': PDF.js expands the htmlbox ligatures, pdftotext keeps "
                     "them as U+FB01/U+FB02/U+FB00."},
        ],
    }


# ----------------------------------------------------------------------------- main

def main():
    if len(sys.argv) != 2:
        sys.exit("usage: make-holdout5-j.py OUT_DIR")
    out = os.path.abspath(sys.argv[1])
    os.makedirs(out, exist_ok=True)
    write_case(out, "lease-redact", lease_before, lease_after, lease_truth)
    write_case(out, "audit-annotations", audit_before, audit_after, audit_truth)
    write_case(out, "handbook-pages", handbook_before, handbook_after, handbook_truth)
    write_case(out, "invoice-incremental", invoice_before, invoice_after, invoice_truth)
    write_case(out, "zh-quote-htmlbox",
               lambda p: zh_build(p, False), lambda b, a: zh_build(a, True), zh_truth)
    write_case(out, "datasheet-overlay", ds_before, ds_after, ds_truth)


if __name__ == "__main__":
    main()

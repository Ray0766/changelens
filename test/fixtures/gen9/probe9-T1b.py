#!/usr/bin/env python3
"""Fix round 9, area T1 (reading order), second pass: SYNTHETIC probe PDFs for the problems an
independent check of the first pass found. Typst 0.15, fpdf2 2.9 and PyMuPDF 2.1.

Usage:  <python with typst, fpdf2 and PyMuPDF 2.1> probe9-T1b.py OUT_DIR   (OUT_DIR: test/fixtures)

Every document is synthetic: fictitious parties, places and figures, marked SYNTHETIC on the page.

In reading order (the restore by position must change nothing):
  probe9-T1-cols-before.pdf / -after.pdf        Typst, two columns, footer drawn last; the last paragraph
                                                of column 1 starts in the bottom margin after a paragraph
                                                gap. Column 2: a figure changed, a paragraph inserted, a
                                                sentence deleted.
  probe9-T1-colsbare-before.pdf / -after.pdf    the same without a footer: nothing after column 2.
  probe9-T1-coltable-before.pdf / -after.pdf    a two-column table written column by column (PyMuPDF
                                                insert_text, all of column 1, then column 2), rows down into
                                                the bottom margin, footer last; three cells of column 2 edited.
Edited the way a PDF editor edits (redaction without fill, new text appended after the footer):
  probe9-T1-rowdel-before.pdf / -after.pdf      fpdf2 order: the first row of a table deleted (rows move up),
                                                the amount of the next row re-typed; -inorder.pdf: the same
                                                new version written by fpdf2 in reading order (control).
  probe9-T1-glue-before.pdf / -after.pdf        fpdf2 order: an amount re-typed in Helvetica at the same size,
                                                wider than the Times original, touching the next word; another
                                                amount re-typed unchanged next to a deleted word; -inorder.pdf:
                                                the same new version written in reading order (control).
  probe9-T1-stamp-before.pdf / -after.pdf       fpdf2, three pages with a running header (title left,
                                                revision right, on one baseline): a note written with
                                                insert_text on p. 1 only, on the header's baseline between its
                                                two parts; a word changed on p. 2.
"""
import os
import sys

import pymupdf
import typst
from fpdf import FPDF

NO_IMG, NO_ART = pymupdf.PDF_REDACT_IMAGE_NONE, pymupdf.PDF_REDACT_LINE_ART_NONE


def save(doc, path):
    doc.save(path, garbage=3, deflate=True, no_new_id=True)


def find(page, needle):
    """The glyph box and origin of `needle` within one extracted line."""
    for b in page.get_text("rawdict")["blocks"]:
        for l in b.get("lines", []):
            chars = [(c, s) for s in l["spans"] for c in s["chars"]]
            line = "".join(c["c"] for c, _ in chars)
            k = line.find(needle)
            if k < 0:
                continue
            seq = chars[k:k + len(needle)]
            r = pymupdf.Rect(seq[0][0]["bbox"])
            for c, _ in seq:
                r |= pymupdf.Rect(c["bbox"])
            return r, pymupdf.Point(seq[0][0]["origin"]), seq[0][1]["size"]
    raise ValueError(f"not found: {needle!r}")


def retype(page, edits):
    """Redact each old text (no fill) and write its new text at its origin with PyMuPDF's default font."""
    found = [(find(page, old), new) for old, new in edits]
    for (r, _, _), _ in found:
        page.add_redact_annot(pymupdf.Rect(r.x0 + 0.4, r.y0 + r.height * 0.28, r.x1 - 0.4, r.y1 - r.height * 0.28), fill=False)
    page.apply_redactions(images=NO_IMG, graphics=NO_ART)
    for (_, origin, size), new in found:
        if new:
            page.insert_text(origin, new, fontname="helv", fontsize=size)


# ------------------------------------------------------------- columns

def cols_source(edit, footer):
    items = [f"Item {k}: SYNTHETIC note on valve {k}, checked." for k in range(1, 32)]
    col2 = [
        "= Station report",
        "The SYNTHETIC inspection covered all pumping stations in the northern district during the spring campaign.",
        f"The flow rate at station 4 was {'1,320' if edit else '1,250'} litres per minute, within the design range.",
        "Crews replaced two worn seals and recorded the torque on each flange bolt.",
    ]
    if edit:
        col2.append("A new paragraph was added in the second column. It runs over several lines so that the insertion is one passage of text and not a single line.")
    col2 += [
        "No leaks were found at the outlet manifold." + ("" if edit else " The gauges were calibrated in March."),
        "The next inspection is planned for the autumn, when the reservoir level is lowest.",
        "Spare parts are held at the central depot and are counted every quarter.",
    ]
    foot = ", footer: context [SYNTHETIC probe T1 columns #h(1fr) Page #counter(page).display()]" if footer else ""
    return (
        f'#set page(paper: "a4", margin: 2cm{foot}, columns: 2)\n#set text(size: 11pt)\n#set par(spacing: 1.5em)\n'
        + "\n\n".join(items + col2)
        + "\n"
    )


def cols(out, name, footer):
    for side, edit in (("before", False), ("after", True)):
        src = os.path.join(out, f"probe9-T1-{name}-{side}.typ")
        with open(src, "w") as f:
            f.write(cols_source(edit, footer))
        typst.compile(src, output=os.path.join(out, f"probe9-T1-{name}-{side}.pdf"))
        os.remove(src)


def coltable(path, edit):
    doc = pymupdf.open()
    p = doc.new_page(width=595.28, height=841.89)
    p.insert_text((72, 60), "SYNTHETIC equipment register", fontname="hebo", fontsize=12)
    ys = [100 + 25 * k for k in range(28)]
    for k, y in enumerate(ys):
        p.insert_text((72, y), f"Asset A-{100 + k}", fontname="helv", fontsize=10)
    for k, y in enumerate(ys):
        v = f"Pump housing, checked {k + 1} times"
        if edit and k == 5:
            v = "Pump housing, checked 9 times"
        if edit and k == 12:
            v = "Pump housing"
        if edit and k == 20:
            v += ", seal replaced"
        p.insert_text((250, y), v, fontname="helv", fontsize=10)
    p.insert_text((72, 812), "SYNTHETIC probe T1 column-wise table · Page 1", fontname="helv", fontsize=8)
    save(doc, path)


# ------------------------------------------------- fpdf2 documents, edited

class Doc(FPDF):
    def __init__(self, title):
        super().__init__(format="A4")
        self.title_text = title
        self.set_auto_page_break(True, margin=20)

    def header(self):
        self.set_font("Helvetica", "", 9)
        self.cell(95, 6, self.title_text)
        self.cell(0, 6, "Revision 4", align="R", new_x="LMARGIN", new_y="NEXT")
        self.ln(4)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "", 8)
        self.cell(0, 6, f"SYNTHETIC sample, fictitious parties - Page {self.page_no()}")


def order_doc(path, items, rows):
    pdf = Doc("SYNTHETIC probe T1 - Service order")
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 13)
    pdf.cell(0, 8, "Order summary", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Times", "", 11)
    for label, value in rows:
        pdf.cell(45, 7, label)
        pdf.cell(0, 7, value, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(6)
    pdf.set_font("Helvetica", "B", 13)
    pdf.cell(0, 8, "Items", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Times", "", 11)
    for label, value in items:
        pdf.cell(60, 7, label)
        pdf.cell(25, 7, value, align="R", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(6)
    pdf.multi_cell(0, 7, "The SYNTHETIC service order covers the parts listed above and one visit by a technician.", new_x="LMARGIN", new_y="NEXT")
    pdf.output(path)


ROWS = [("Customer", "Harbourside Clinics Ltd"), ("Order no.", "SO-2026-0417")]
ITEMS = [("Filter cartridge", "45.00"), ("Pressure gauge", "60.00"), ("Hose set", "75.00"), ("Seal kit", "90.00")]
GLUE_ROWS = ROWS + [("Price (EUR)", "2,480.00 payable within 30 days"), ("Discount", "120.00 granted for early payment")]


def rowdel(out):
    o = lambda s: os.path.join(out, f"probe9-T1-rowdel-{s}.pdf")
    order_doc(o("before"), ITEMS, ROWS)
    mid = o("mid")
    order_doc(mid, ITEMS[1:], ROWS)
    doc = pymupdf.open(mid)
    retype(doc[0], [("60.00", "65.00")])
    save(doc, o("after"))
    os.remove(mid)
    order_doc(o("inorder"), [ITEMS[1][:1] + ("65.00",)] + ITEMS[2:], ROWS)


def glue(out):
    o = lambda s: os.path.join(out, f"probe9-T1-glue-{s}.pdf")
    order_doc(o("before"), ITEMS, GLUE_ROWS)
    doc = pymupdf.open(o("before"))
    # The price re-typed in Helvetica (wider than Times) at the same size; the discount re-typed
    # unchanged next to a deleted word.
    retype(doc[0], [("2,480.00", "2,840.00"), ("120.00", "120.00"), ("early ", "")])
    save(doc, o("after"))
    order_doc(o("inorder"), ITEMS, ROWS + [("Price (EUR)", "2,840.00 payable within 30 days"), ("Discount", "120.00 granted for payment")])


def stamp(out):
    o = lambda s: os.path.join(out, f"probe9-T1-stamp-{s}.pdf")

    def build(path, edit):
        pdf = Doc("SYNTHETIC probe T1 - Supply agreement")
        for n in range(3):
            pdf.add_page()
            pdf.set_font("Times", "", 11)
            for k in range(8):
                s = f"Clause {n + 1}.{k + 1}: the SYNTHETIC supplier keeps record {k + 1} of section {n + 1} for six years."
                if edit and n == 1 and k == 3:
                    s = s.replace("six years", "ten years")
                pdf.multi_cell(0, 7, s, new_x="LMARGIN", new_y="NEXT")
        pdf.output(path)

    build(o("before"), False)
    build(o("after"), True)
    doc = pymupdf.open(o("after"))
    p = doc[0]
    _, origin, _ = find(p, "Revision 4")
    p.insert_text((260, origin.y), "RECEIVED 3 Nov 2026", fontname="hebo", fontsize=9)
    doc.saveIncr()


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "."
    cols(out, "cols", True)
    cols(out, "colsbare", False)
    coltable(os.path.join(out, "probe9-T1-coltable-before.pdf"), False)
    coltable(os.path.join(out, "probe9-T1-coltable-after.pdf"), True)
    rowdel(out)
    glue(out)
    stamp(out)
    for f in sorted(os.listdir(out)):
        if f.startswith("probe9-T1-") and any(f.startswith(f"probe9-T1-{n}-") for n in ("cols", "colsbare", "coltable", "rowdel", "glue", "stamp")):
            print(f, os.path.getsize(os.path.join(out, f)))


if __name__ == "__main__":
    main()

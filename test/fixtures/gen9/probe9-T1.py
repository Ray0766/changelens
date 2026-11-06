#!/usr/bin/env python3
"""Fix round 9, area T1 (reading order): SYNTHETIC probe PDFs written and edited with PyMuPDF 2.1.

Usage:  <python with PyMuPDF 2.1> probe9-T1.py OUT_DIR   (OUT_DIR: test/fixtures)

Every document is synthetic: fictitious parties, places and figures, marked SYNTHETIC on the page.
The base documents are written with PyMuPDF insert_text in reading order (header, body, footer),
in base-14 fonts (not embedded) to keep the files small.
The edited versions are made the way a PDF editor edits, as in round 5's PyMuPDF cases: glyphs
removed with a redaction (no fill), new text written with insert_text or insert_htmlbox, which
PyMuPDF appends to the end of the page's content, after the footer.

  probe9-T1-lease-before.pdf / -after.pdf    re-typed rent, date, word and account number, an added
                                             clause in white space, a heading re-typed in another
                                             font; controls: a word only deleted next to a re-typed
                                             word, and a note added below the last line (not placed)
  probe9-T1-break-before.pdf / -after.pdf    a note added below the last line of p. 1 and the first
                                             heading of p. 2 deleted: two edits, not one rewrite
  probe9-T1-stranded-before.pdf / -after.pdf a line added below the last line of p. 1, drawn after the
                                             footer, and the first heading of p. 2 (set larger than the
                                             body) deleted: two edits, not one rewrite; -inorder.pdf is
                                             the same new version written in reading order (control)
  probe9-T1-firstrow-before.pdf / -after.pdf the amount of a table's first row re-typed under a short
                                             heading (no place found by position, joined in place);
                                             control: the second row's amount only deleted
  probe9-T1-columns-before.pdf / -after.pdf  a two-column page whose right column is drawn after
                                             the footer, beside a full-width paragraph (in order in
                                             "before"): nothing is put back by position
  probe9-T1-turned-before.pdf / -after.pdf   a re-typed amount on a page with a turned margin note:
                                             the amount is put back, the turned note is left alone
"""
import os
import sys

import pymupdf

A4 = (595.28, 841.89)
NO_IMG, NO_ART = pymupdf.PDF_REDACT_IMAGE_NONE, pymupdf.PDF_REDACT_LINE_ART_NONE


def text(page, x, y, s, size=10.5, bold=False, rotate=0):
    # Base-14 fonts (not embedded), so that the probes stay small: Times-Roman body, Helvetica-Bold headings.
    page.insert_text((x, y), s, fontname="hebo" if bold else "tiro", fontsize=size, rotate=rotate)


def header(page, n, total, title):
    text(page, 72, 50, f"{title} · SYNTHETIC sample", size=9)
    text(page, 480, 50, "Draft 3", size=9)


def footer(page, n, total):
    text(page, 72, 806, f"SYNTHETIC probe, fictitious parties and figures · Page {n} of {total}", size=9)


def save(doc, path):
    doc.save(path, garbage=3, deflate=True, no_new_id=True)


def find(page, needle, occurrence=0):
    """The glyph box and origin of `needle` within one extracted line."""
    for b in page.get_text("rawdict")["blocks"]:
        for l in b.get("lines", []):
            chars = [(c, s) for s in l["spans"] for c in s["chars"]]
            line = "".join(c["c"] for c, _ in chars)
            k = line.find(needle)
            if k < 0:
                continue
            if occurrence:
                occurrence -= 1
                continue
            seq = chars[k:k + len(needle)]
            r = pymupdf.Rect(seq[0][0]["bbox"])
            for c, _ in seq:
                r |= pymupdf.Rect(c["bbox"])
            return r, pymupdf.Point(seq[0][0]["origin"]), seq[0][1]["size"]
    raise ValueError(f"not found: {needle!r}")


def redact(page, rect):
    r = pymupdf.Rect(rect)
    page.add_redact_annot(pymupdf.Rect(r.x0 + 0.4, r.y0 + r.height * 0.28, r.x1 - 0.4, r.y1 - r.height * 0.28), fill=False)


# ------------------------------------------------------------------ lease

def lease_page1(page):
    header(page, 1, 2, "Probe T1 lease")
    text(page, 72, 100, "Lease particulars (SYNTHETIC)", size=16, bold=True)
    text(page, 72, 125, "This SYNTHETIC lease is made between the Landlord and the Tenant named in the")
    text(page, 72, 139, "particulars below. Every name and figure in it is fictitious.")
    rows = [
        ("Landlord", "Fenmoor Property Holdings Ltd, 3 Canal Row, Northbridge"),
        ("Start date", "1 March 2027"),
        ("Term", "Five years from and including the start date"),
        ("Monthly fee (EUR)", "1,850.00, payable monthly in advance"),
        ("Account", "ZZ41 7700 2045 1189 03"),
        ("Deposit (EUR)", "5,550.00, held in a separate client account"),
    ]
    for k, (label, value) in enumerate(rows):
        y = 165 + 16 * k
        text(page, 72, y, label)
        text(page, 200, y, value)
    text(page, 72, 280, "3 Rent review", size=12, bold=True)
    text(page, 72, 296, "3.1 The fee is reviewed on each third anniversary of the start date by reference to the")
    text(page, 72, 310, "Consumer Prices Index published for the preceding month, and the reviewed fee is")
    text(page, 72, 324, "payable from the review date onwards.")
    text(page, 72, 350, "4 Notices", size=12, bold=True)
    text(page, 72, 366, "4.1 Notices must be in writing and delivered by hand or by recorded post to the")
    text(page, 72, 380, "address of the recipient given in the particulars.")
    text(page, 72, 440, "5 Signatures", size=12, bold=True)
    text(page, 72, 460, "Signed for the Landlord")
    text(page, 320, 460, "Signed for the Tenant")
    footer(page, 1, 2)


def lease_page2(page):
    header(page, 2, 2, "Probe T1 lease")
    text(page, 72, 100, "6 Electrical connection", size=12, bold=True)
    text(page, 72, 118, "The Tenant may connect the unit to the building supply through the meter cupboard on")
    text(page, 72, 132, "the ground floor. Connections are made by an electrician approved by the Landlord.")
    text(page, 72, 150, "• Isolate the circuit before any work on the distribution board.")
    text(page, 72, 164, "• Label every new circuit at the board and at the outlet.")
    text(page, 72, 178, "• Keep the test certificate with the lease documents.")
    text(page, 72, 230, "7 Ordering information", size=12, bold=True)
    text(page, 72, 250, "Meter reading service, monthly 18.50")
    text(page, 72, 266, "Out-of-hours call-out, per visit 95.00")
    footer(page, 2, 2)


def lease_before(path):
    doc = pymupdf.open()
    lease_page1(doc.new_page(width=A4[0], height=A4[1]))
    lease_page2(doc.new_page(width=A4[0], height=A4[1]))
    doc.set_metadata({"title": "Probe T1 lease (SYNTHETIC)", "producer": "PyMuPDF 2.1"})
    save(doc, path)


def lease_after(before, path):
    doc = pymupdf.open(before)
    p1, p2 = doc[0], doc[1]
    rent = find(p1, "1,850.00")
    date = find(p1, "1 March 2027")
    cpi = find(p1, "Consumer")
    acct = find(p1, "2045 1189 03")
    onwards = find(p1, " onwards")
    for r, _, _ in (rent, date, cpi, acct, onwards):
        redact(p1, r)
    p1.apply_redactions(images=NO_IMG, graphics=NO_ART)
    # Re-typed values, appended after the footer: the rent in Helvetica 9 pt, 0.7 pt low.
    p1.insert_text(rent[1] + (0, 0.7), "1,975.00", fontname="helv", fontsize=9)
    p1.insert_text(date[1], "15 March 2027", fontname="tiro", fontsize=date[2])
    p1.insert_text(cpi[1], "Retail", fontname="cour", fontsize=cpi[2])
    p1.insert_text(acct[1], "9932 0457 18", fontname="helv", fontsize=acct[2])
    # A clause added in the white space under 4.1 (between two lines drawn before the footer).
    p1.insert_htmlbox(pymupdf.Rect(72, 386, 523, 410), "<p style='font-size:10pt'>4.2 Notices may also be sent by e-mail to the address that the recipient last notified.</p>")
    # Control: a note added below the last line of the page: it stays at the end of the page.
    p1.insert_htmlbox(pymupdf.Rect(72, 500, 523, 520), "<p style='font-size:10pt'>SYNTHETIC note: this copy replaces the draft of 1 October.</p>")
    # p2: the heading re-typed in Times-Bold at the same place.
    head = find(p2, "6 Electrical connection")
    redact(p2, head[0])
    p2.apply_redactions(images=NO_IMG, graphics=NO_ART)
    p2.insert_text(head[1], "6 Electrical connection", fontname="tibo", fontsize=head[2])
    save(doc, path)


# ------------------------------------------------------------------ break

def break_before(path):
    doc = pymupdf.open()
    p = doc.new_page(width=A4[0], height=A4[1])
    header(p, 1, 2, "Probe T1 break")
    text(p, 72, 100, "1 Scope (SYNTHETIC)", size=12, bold=True)
    for k, s in enumerate([
        "This SYNTHETIC handbook applies to every crew that works on the distribution network.",
        "Each section covers one topic, so that it can be printed and carried on its own.",
        "Where a site instruction differs, the site instruction applies.",
    ]):
        text(p, 72, 118 + 14 * k, s)
    footer(p, 1, 2)
    p = doc.new_page(width=A4[0], height=A4[1])
    header(p, 2, 2, "Probe T1 break")
    text(p, 72, 100, "2 Protective equipment", size=12, bold=True)
    for k, s in enumerate([
        "Crews wear high-visibility jackets and safety boots whenever they are on site.",
        "Hard hats are worn near open excavations and overhead loads.",
    ]):
        text(p, 72, 118 + 14 * k, s)
    footer(p, 2, 2)
    save(doc, path)


def break_after(before, path):
    doc = pymupdf.open(before)
    p1, p2 = doc[0], doc[1]
    # p1: a note added below the last line (appended after the footer, not between lines).
    p1.insert_htmlbox(pymupdf.Rect(72, 170, 523, 190), "<p style='font-size:10pt'>Contractors follow the same rules as employees.</p>")
    # p2: its first heading deleted.
    redact(p2, find(p2, "2 Protective equipment")[0])
    p2.apply_redactions(images=NO_IMG, graphics=NO_ART)
    save(doc, path)


# ------------------------------------------------------------------ stranded

def stranded_doc(path, note_in_order=False, heading=True):
    """p. 1 ends with a paragraph, p. 2 starts with a heading set larger than the body (its own paragraph)."""
    doc = pymupdf.open()
    p = doc.new_page(width=A4[0], height=A4[1])
    header(p, 1, 2, "Probe T1 stranded")
    text(p, 72, 100, "1 Scope (SYNTHETIC)", size=12, bold=True)
    text(p, 72, 118, "This SYNTHETIC datasheet applies to every transmitter of the series.")
    text(p, 72, 132, "Each section covers one topic, so that it can be printed on its own.")
    if note_in_order:
        p.insert_text((72, 160), "Document no. DS-004", fontname="helv", fontsize=10)
    footer(p, 1, 2)
    p = doc.new_page(width=A4[0], height=A4[1])
    header(p, 2, 2, "Probe T1 stranded")
    if heading:
        text(p, 72, 100, "3 Electrical connection", size=14, bold=True)
    text(p, 72, 118, "The transmitter has spring terminals for the supply.")
    text(p, 72, 132, "The pulse output is an open collector.")
    footer(p, 2, 2)
    save(doc, path)


def stranded_after(before, path):
    doc = pymupdf.open(before)
    p1, p2 = doc[0], doc[1]
    # p. 1: a line added below the last line, appended after the footer (no place found for it);
    # p. 2: its first heading deleted.
    p1.insert_text((72, 160), "Document no. DS-004", fontname="helv", fontsize=10)
    redact(p2, find(p2, "3 Electrical connection")[0])
    p2.apply_redactions(images=NO_IMG, graphics=NO_ART)
    save(doc, path)


# ------------------------------------------------------------------ first row

def firstrow_before(path):
    doc = pymupdf.open()
    p = doc.new_page(width=A4[0], height=A4[1])
    header(p, 1, 1, "Probe T1 first row")
    text(p, 72, 100, "Fees", size=14, bold=True)
    for k, (label, amount) in enumerate([("Annual inspection", "240.00"), ("Meter reading service", "18.50"), ("Out-of-hours call-out", "95.00")]):
        text(p, 72, 120 + 14 * k, label)
        text(p, 300, 120 + 14 * k, amount)
    text(p, 72, 176, "All fees are SYNTHETIC and exclude VAT at the standard rate.")
    footer(p, 1, 1)
    save(doc, path)


def firstrow_after(before, path):
    doc = pymupdf.open(before)
    p = doc[0]
    first = find(p, "240.00")
    second = find(p, "18.50")
    redact(p, first[0])
    # Control: the second row's amount only deleted, not re-typed.
    redact(p, second[0])
    p.apply_redactions(images=NO_IMG, graphics=NO_ART)
    # The first row's amount re-typed in Helvetica 9 pt: no line above it reaches across it (the
    # heading is short), so it is not put back by position, and is joined with the old amount by place.
    p.insert_text(first[1] + (0, 0.5), "260.00", fontname="helv", fontsize=9)
    save(doc, path)


# ------------------------------------------------------------------ columns

LEFT = [
    "The north depot opens a new",
    "store for pipe fittings in May.",
    "Crews collect fittings from the",
    "counter between 07:00 and 09:00.",
    "Orders placed by 15:00 are ready",
    "for collection the next morning.",
]
RIGHT = [
    "The hydrant flushing season",
    "starts in the east district on",
    "the first Monday of March and",
    "runs until the end of April.",
    "Customers are told by letter",
    "seven days before flushing.",
]


def columns(path, right_after_footer):
    doc = pymupdf.open()
    p = doc.new_page(width=A4[0], height=A4[1])
    header(p, 1, 1, "Probe T1 columns")
    text(p, 72, 100, "Depot news (SYNTHETIC)", size=16, bold=True)
    text(p, 72, 124, "This SYNTHETIC newsletter is set in two columns under a paragraph that runs across the whole")
    text(p, 72, 138, "width of the page, over both columns; the producer writes the right column last, after the footer.")
    for k, s in enumerate(LEFT):
        text(p, 72, 160 + 14 * k, s)
    if not right_after_footer:
        for k, s in enumerate(RIGHT):
            text(p, 310, 160 + 14 * k, s)
    footer(p, 1, 1)
    if right_after_footer:
        for k, s in enumerate(RIGHT):
            text(p, 310, 160 + 14 * k, s)
    save(doc, path)


# ------------------------------------------------------------------ turned

def turned_page(page, value):
    header(page, 1, 1, "Probe T1 turned")
    text(page, 72, 100, "Fee schedule (SYNTHETIC)", size=16, bold=True)
    text(page, 72, 124, "Fees are charged per visit or per month as shown below, plus VAT at the standard rate.")
    rows = [("Annual inspection", "240.00", "per visit"), ("Meter reading service", value, "per month"), ("Out-of-hours call-out", "95.00", "per visit")]
    for k, (label, amount, unit) in enumerate(rows):
        y = 146 + 14 * k
        text(page, 72, y, label)
        text(page, 300, y, amount)
        text(page, 360, y, unit)
    text(page, 72, 200, "Fees are reviewed every year in March.")
    # A margin note turned by a quarter turn, beside the body.
    text(page, 560, 400, "SYNTHETIC margin note", size=8, rotate=90)
    footer(page, 1, 1)


def turned_before(path):
    doc = pymupdf.open()
    turned_page(doc.new_page(width=A4[0], height=A4[1]), "18.50")
    save(doc, path)


def turned_after(before, path):
    doc = pymupdf.open(before)
    p = doc[0]
    r = find(p, "18.50")
    redact(p, r[0])
    p.apply_redactions(images=NO_IMG, graphics=NO_ART)
    p.insert_text(r[1], "19.75", fontname="helv", fontsize=r[2])
    save(doc, path)


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "."
    o = lambda name: os.path.join(out, f"probe9-T1-{name}.pdf")
    lease_before(o("lease-before"))
    lease_after(o("lease-before"), o("lease-after"))
    break_before(o("break-before"))
    break_after(o("break-before"), o("break-after"))
    stranded_doc(o("stranded-before"))
    stranded_after(o("stranded-before"), o("stranded-after"))
    stranded_doc(o("stranded-inorder"), note_in_order=True, heading=False)
    firstrow_before(o("firstrow-before"))
    firstrow_after(o("firstrow-before"), o("firstrow-after"))
    columns(o("columns-before"), False)
    columns(o("columns-after"), True)
    turned_before(o("turned-before"))
    turned_after(o("turned-before"), o("turned-after"))
    for f in sorted(os.listdir(out)):
        if f.startswith("probe9-T1-"):
            print(f, os.path.getsize(os.path.join(out, f)))


if __name__ == "__main__":
    main()

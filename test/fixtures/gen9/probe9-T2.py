#!/usr/bin/env python3
"""Fix round 9, area T2 (row numbers): SYNTHETIC probe PDFs written with fpdf2 2.9.

Usage:  <python with fpdf2 2.9> probe9-T2.py OUT_DIR   (OUT_DIR: test/fixtures)

Every document is synthetic: fictitious supplier, articles and figures, marked SYNTHETIC on the page.
The tables are drawn cell by cell in the core font Helvetica (not embedded), as in round 5's
holdout5-i-rechnung-eur: a right-aligned "Pos." column 10 mm wide, so that fpdf2's cell margins
(1 mm each side) set each row number 2 mm (0.67 em at 8.5 pt) before the article number.

  probe9-T2-insert-before / -after     12 rows; a row inserted as Pos. 4, and next to it the quantity
                                       and amount of the row below changed (real edits)
  probe9-T2-mixed-after                the insert, and the last row numbered "14" by hand (a shift of 2)
  probe9-T2-byhand-after               nothing inserted; Pos. 7 numbered "8" by hand
  probe9-T2-leftcol-before / -after    the Pos. column left-aligned; a row inserted as Pos. 2
  probe9-T2-qty-before / -after        a first column headed "Menge" (quantities 1, 2, 3 …); a row
                                       inserted on top and every quantity raised by one (N09's case)
  probe9-T2-days-before / -after       a first column headed "Tag" (1, 2, 3 …); every day moved on by
                                       one, nothing inserted
  probe9-T2-justified-before / -after  single lines that start with a count (1, 2, 3 …), set word by
                                       word with spaces of 0.8 em, as wide as the gap after the
                                       count; a line added on top and every count raised by one
  probe9-T2-lone-before / -after       a single line-start integer changed (no column)
  probe9-T2-crossing-before / -after   30 rows over 2 pages, a running header on p. 2 only; a row
                                       inserted as Pos. 5, so the last row of p. 1 crosses to p. 2
  probe9-T2-crossingx-after            the same, but the crossing row numbered "31" by hand
  probe9-T2-crossinge-after            the same as -crossing-after, and the crossing row's text edited
                                       ("(geeicht)" added)
  probe9-T2-crossing2-after            two rows inserted as Pos. 5 and 6: two rows cross to p. 2
  probe9-T2-crossing2x-after           the same, and the second crossing row numbered "40" by hand
"""
import os
import sys
from datetime import datetime, timezone

import fpdf
from fpdf import FPDF

FIXED_DATE = datetime(2026, 11, 6, 9, 0, 0, tzinfo=timezone.utc)
LEFT = 20
ROW_H = 6.0
BOTTOM = 272.0

ARTICLES = [
    ("10-2001", "Becherglas 250 ml, Borosilikat", 2, "Pkg.", 41.80),
    ("10-2004", "Becherglas 600 ml, Borosilikat", 1, "Pkg.", 36.20),
    ("10-3110", "Erlenmeyerkolben 500 ml", 6, "St.", 7.95),
    ("12-0150", "Messzylinder 100 ml, Klasse B", 4, "St.", 12.40),
    ("12-0155", "Messzylinder 500 ml, Klasse B", 2, "St.", 24.90),
    ("15-7720", "Petrischalen 90 mm, steril", 3, "Karton", 64.00),
    ("31-0412", "Pipettenspitzen 200 µl, 1000 St.", 5, "Beutel", 18.75),
    ("31-0920", "Mehrkanalpipette 8-Kanal", 1, "St.", 389.00),
    ("33-1001", "Reagenzglasständer, 40 Plätze", 6, "St.", 9.60),
    ("33-1015", "Reagenzgläser 16 × 160 mm", 2, "Karton", 47.30),
    ("40-0050", "Laborflasche 1000 ml, GL 45", 10, "St.", 8.45),
    ("40-0055", "Laborflasche 500 ml, GL 45", 10, "St.", 6.90),
    ("41-2210", "Spritzflasche 500 ml, LDPE", 8, "St.", 4.85),
    ("42-0310", "Trichter 100 mm, PP", 5, "St.", 3.20),
    ("44-1010", "Nitrilhandschuhe Gr. S", 5, "Karton", 48.90),
    ("44-1020", "Nitrilhandschuhe Gr. M", 10, "Karton", 48.90),
    ("44-1030", "Nitrilhandschuhe Gr. L", 6, "Karton", 48.90),
    ("46-0100", "Laborkittel Baumwolle, Gr. 50", 3, "St.", 29.50),
    ("46-0210", "Schutzbrille, beschlagfrei", 12, "St.", 6.40),
    ("50-1200", "Wägeschalen 100 ml, PS", 1, "Karton", 52.80),
    ("52-0040", "Spatel, Edelstahl, 150 mm", 10, "St.", 2.95),
    ("55-3300", "pH-Indikatorpapier 1–14", 3, "Pkg.", 11.20),
    ("58-0710", "Filterpapier Ø 125 mm", 6, "Pkg.", 5.85),
    ("60-2020", "Magnetrührstäbchen 25 mm", 10, "St.", 3.10),
    ("61-0005", "Magnetrührer mit Heizplatte", 1, "St.", 248.00),
    ("63-1100", "Laborthermometer -10 … +110 °C", 4, "St.", 14.70),
    ("65-0300", "Exsikkator 200 mm, mit Hahn", 1, "St.", 96.40),
    ("70-0120", "Kryoröhrchen 2 ml, 500 St.", 2, "Karton", 58.60),
    ("70-0450", "Gefrierboxen 81 Plätze", 1, "Pkg.", 42.00),
    ("72-1005", "Parafilm M, 100 mm × 38 m", 2, "Rolle", 39.90),
]
INSERTED = ("31-0458", "Pipettenspitzen 1000 µl, steril", 4, "Pkg.", 38.50)


def de(x):
    cents = round(abs(x) * 100)
    i, c = divmod(cents, 100)
    s = f"{i:,}".replace(",", ".") + f",{c:02d}"
    return "-" + s if x < 0 else s


class Doc(FPDF):
    running = False

    def header(self):
        if self.running and self.page_no() > 1:
            self.set_font("Helvetica", "", 7.5)
            self.set_xy(LEFT, 10)
            self.cell(175, 4, "Probe Laborbedarf · Rechnung RE-0000 (SYNTHETIC)")

    def footer(self):
        self.set_font("Helvetica", "", 6.5)
        self.set_xy(LEFT, 282)
        self.cell(140, 3.2, "SYNTHETIC probe document – no real invoice")
        self.set_font("Helvetica", "", 8)
        self.set_xy(155, 282)
        self.cell(40, 4, f"Seite {self.page_no()} von {{nb}}", align="R")


def new_doc(running=False):
    pdf = Doc(format="A4")
    pdf.running = running
    pdf.set_creation_date(FIXED_DATE)
    pdf.set_producer(f"fpdf2 {fpdf.__version__}")
    pdf.set_creator("ChangeLens probe9-T2 SYNTHETIC generator")
    pdf.set_auto_page_break(False)
    pdf.core_fonts_encoding = "windows-1252"
    pdf.set_margins(LEFT, 15, 15)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 14)
    pdf.set_xy(LEFT, 20)
    pdf.cell(150, 7, "Rechnung RE-0000 (SYNTHETIC)")
    return pdf


def table(pdf, cols, rows, y=34):
    """rows: lists of cell texts, the first being the row number (or the first column's value)."""

    def head(y):
        pdf.set_xy(LEFT, y)
        pdf.set_font("Helvetica", "B", 8)
        for name, w, al in cols:
            pdf.cell(w, 6.5, name, align=al)
        return y + 6.5

    y = head(y)
    pdf.set_font("Helvetica", "", 8.5)
    for cells in rows:
        if y + ROW_H > BOTTOM:
            pdf.add_page()
            y = head(17)
            pdf.set_font("Helvetica", "", 8.5)
        pdf.set_xy(LEFT, y)
        for (name, w, al), text in zip(cols, cells):
            pdf.cell(w, ROW_H, text, align=al)
        y += ROW_H
    return y


POS_COLS = [("Pos.", 10, "R"), ("Art.-Nr.", 18, "L"), ("Bezeichnung", 72, "L"), ("Menge", 13, "R"),
            ("Einh.", 15, "L"), ("Einzelpreis €", 22, "R"), ("Betrag €", 25, "R")]


def item_rows(items, numbers=None):
    numbers = numbers or [str(i + 1) for i in range(len(items))]
    return [[n, a, d, str(q), u, de(p), de(q * p)] for n, (a, d, q, u, p) in zip(numbers, items)]


def invoice(path, items, numbers=None, cols=POS_COLS, running=False, y0=34):
    pdf = new_doc(running)
    if y0 > 34:
        # An address block above the table, so that the table reaches p. 2.
        pdf.set_font("Helvetica", "", 10)
        pdf.set_xy(LEFT, 34)
        pdf.multi_cell(85, 5, "Probe Analytik AG (SYNTHETIC)\nEinkauf\nTeststraße 5\n54321 Neustadt", align="L")
    y = table(pdf, cols, item_rows(items, numbers), y0)
    total = sum(q * p for (_, _, q, _, p) in items)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_xy(125, y + 4)
    pdf.cell(42, 5.5, "Nettobetrag")
    pdf.cell(28, 5.5, de(total) + " €", align="R")
    pdf.output(path)


def main(out):
    p = lambda name: os.path.join(out, f"probe9-T2-{name}.pdf")
    base = ARTICLES[:12]
    # Insert as Pos. 4; the row below it (old Pos. 4, Messzylinder 100 ml) gets quantity 4 → 6.
    ins = base[:3] + [INSERTED] + base[3:]
    ins = [(a, d, 6 if a == "12-0150" else q, u, pr) for (a, d, q, u, pr) in ins]
    invoice(p("insert-before"), base)
    invoice(p("insert-after"), ins)
    # The same insert, and the last row (old Pos. 12, new 13) numbered 14 by hand.
    nums = [str(i + 1) for i in range(len(ins))]
    nums[-1] = "14"
    invoice(p("mixed-after"), ins, nums)
    # Nothing inserted; Pos. 7 numbered 8 by hand.
    nums = [str(i + 1) for i in range(len(base))]
    nums[6] = "8"
    invoice(p("byhand-after"), base, nums)
    # Left-aligned Pos. column: "1"–"9" stand an em or more before the next cell, "10"–"13" closer.
    left = [("Pos.", 5.5, "L")] + POS_COLS[1:]
    ins2 = base[:1] + [INSERTED] + base[1:]
    invoice(p("leftcol-before"), base, cols=left)
    invoice(p("leftcol-after"), ins2, cols=left)
    # A first column of quantities headed "Menge": 1, 2, 3 … ; a row added on top, every quantity + 1.
    qcols = [("Menge", 10, "R"), ("Art.-Nr.", 18, "L"), ("Bezeichnung", 72, "L"), ("Einh.", 15, "L"),
             ("Einzelpreis €", 22, "R"), ("Betrag €", 25, "R")]
    q = base[:8]
    qrows = lambda items, first: [[str(first + i), a, d, u, de(pr), de((first + i) * pr)] for i, (a, d, _, u, pr) in enumerate(items)]
    for name, rows in (("qty-before", qrows(q, 1)), ("qty-after", qrows([INSERTED] + q, 1))):
        pdf = new_doc()
        table(pdf, qcols, rows)
        pdf.output(p(name))
    # A first column of days headed "Tag": every day moved on by one, nothing inserted.
    dcols = [("Tag", 10, "R"), ("Art.-Nr.", 18, "L"), ("Lieferung", 72, "L"), ("Einh.", 15, "L"), ("Betrag €", 25, "R")]
    drows = lambda first: [[str(first + i), a, d, u, de(pr)] for i, (a, d, _, u, pr) in enumerate(q)]
    for name, rows in (("days-before", drows(1)), ("days-after", drows(2))):
        pdf = new_doc()
        table(pdf, dcols, rows)
        pdf.output(p(name))
    # Single lines that start with a count, set word by word as a justified line is: every word
    # space 0.8 em, as wide as the gap after the count; a line added on top and every count + 1.
    goods = ["Pumpen", "Ventile", "Filter", "Dichtungen", "Schläuche", "Kupplungen", "Manometer", "Sensoren"]
    lines = lambda first, items: [f"{first + i} {g} wurden am Montag geliefert und im Lager geprüft" for i, g in enumerate(items)]
    for name, text in (("justified-before", lines(1, goods)), ("justified-after", lines(1, ["Motoren"] + goods))):
        pdf = new_doc()
        pdf.set_font("Helvetica", "", 8.5)
        pdf.c_margin = 0
        space = 0.8 * 8.5 * 25.4 / 72
        y = 40
        for t in text:
            x = LEFT
            for word in t.split(" "):
                w = pdf.get_string_width(word)
                pdf.set_xy(x, y)
                pdf.cell(w, 6, word)
                x += w + space
            y += 6
        pdf.output(p(name))
    # A single line-start integer changed: no column.
    for name, n in (("lone-before", 5), ("lone-after", 6)):
        pdf = new_doc()
        pdf.set_font("Helvetica", "", 8.5)
        pdf.set_xy(LEFT, 40)
        pdf.cell(175, 6, "Lieferumfang laut Auftrag:")
        pdf.set_xy(LEFT, 46)
        pdf.cell(10, 6, str(n), align="R")
        pdf.cell(18, 6, "10-2001")
        pdf.cell(72, 6, "Becherglas 250 ml, Borosilikat")
        pdf.set_xy(LEFT, 58)
        pdf.cell(175, 6, "Die Ware bleibt bis zur vollständigen Bezahlung unser Eigentum.")
        pdf.output(p(name))
    # 30 rows over two pages, a running header on p. 2 only; a row inserted as Pos. 5.
    full = ARTICLES[:30]
    cross = full[:4] + [INSERTED] + full[4:]
    invoice(p("crossing-before"), full, running=True, y0=106)
    invoice(p("crossing-after"), cross, running=True, y0=106)
    # The crossing row: the first row of p. 2 in the new version (106 mm + 6.5 mm header, 6 mm rows,
    # bottom 272 mm: 26 rows on p. 1), old Pos. 26 Laborthermometer, new Pos. 27.
    k = int((BOTTOM - 106 - 6.5) // ROW_H)
    nums = [str(i + 1) for i in range(len(cross))]
    nums[k] = "31"
    invoice(p("crossingx-after"), cross, nums, running=True, y0=106)
    edited = [(a, d + " (geeicht)" if i == k else d, qq, u, pr) for i, (a, d, qq, u, pr) in enumerate(cross)]
    invoice(p("crossinge-after"), edited, running=True, y0=106)
    # Two rows inserted as Pos. 5 and 6: rows 25 and 26 cross to p. 2 together, as 27 and 28.
    second = ("31-0460", "Pipettenspitzen 5000 µl, steril", 2, "Pkg.", 44.90)
    two = full[:4] + [INSERTED, second] + full[4:]
    invoice(p("crossing2-after"), two, running=True, y0=106)
    # The same, and the second of the two crossing rows (new Pos. 28) numbered "40" by hand.
    nums = [str(i + 1) for i in range(len(two))]
    nums[k + 1] = "40"
    invoice(p("crossing2x-after"), two, nums, running=True, y0=106)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ".")

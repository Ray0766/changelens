#!/usr/bin/env python3
"""Fix round 9, area T2 (row numbers), second pass: SYNTHETIC probe PDFs written with reportlab.

Usage:  python3 probe9-T2b.py OUT_DIR   (OUT_DIR: test/fixtures; reportlab 5.0.1, invariant mode)

Every document is synthetic: fictitious supplier, articles and figures, marked SYNTHETIC on each page.
reportlab draws a platypus Table as one text block (its rows are not paragraphs of their own), so a
row number does not start a block, unlike fpdf2's cell-by-cell rows (probe9-T2.py). The "Pos."
column is right-aligned with 2.5 pt cell padding: each row number stands 7 pt (0.78 em at 9 pt)
before the article number.

  probe9-T2b-ins-before / -after     10 rows; a row inserted as Pos. 3, and the price (and amount) of
                                     the row below it changed (real edits next to the insert)
  probe9-T2b-cross-before / -after   40 rows over 2 pages, the header row repeated on p. 2, no running
                                     header; a row inserted as Pos. 3, so the last row of p. 1
                                     (Pos. 38, KX-9970) crosses to the top of p. 2 as Pos. 39
  probe9-T2b-crossx-after            the same, but the crossing row numbered "41" by hand
  probe9-T2b-crosse-after            the same as -cross-after, and the crossing row's description
                                     edited ("grau" added)
  probe9-T2b-move-before / -after    10 rows, the header row set 6 pt apart, so that it is a text block of
                                     its own (as Chromium's are); Pos. 10 moved to the top and Pos. 3
                                     deleted, all rows renumbered (the moved row becomes Pos. 1)
  probe9-T2b-movep-after             the same, and the moved row's price edited (2,35 -> 2,55)
  probe9-T2b-movex-after             the same as -move-after, but the moved row numbered "4" by hand
  probe9-T2b-dup-after               from -ins-before: Pos. 7 deleted, the next row keeps its old number "8"
                                     (typed by hand), the two after it are renumbered 8, 9: after the
                                     hand-typed number, too few rows to be a column of their own
"""
import os
import sys

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors

ITEMS = [
    ("KX-1001", "Kabelbinder 200 mm, schwarz", 5, 3.40),
    ("KX-1002", "Kabelbinder 300 mm, schwarz", 3, 4.10),
    ("KX-2210", "Schrumpfschlauch 6 mm, rot", 2, 7.95),
    ("KX-2215", "Schrumpfschlauch 9 mm, blau", 4, 8.25),
    ("KX-3100", "Aderendhuelsen 1,5 mm2", 10, 2.20),
    ("KX-3105", "Aderendhuelsen 2,5 mm2", 8, 2.60),
    ("KX-4400", "Klemmleiste 12-polig", 6, 5.75),
    ("KX-4410", "Verteilerdose IP65", 2, 11.90),
    ("KX-5001", "Installationsrohr 20 mm", 12, 1.85),
    ("KX-5002", "Installationsrohr 25 mm", 9, 2.35),
    ("KX-6010", "Luesterklemme 10er", 7, 1.20),
    ("KX-6020", "Wago-Klemme 3-fach", 20, 0.48),
    ("KX-7000", "Isolierband 15 m, gruen", 4, 1.99),
    ("KX-7100", "Kabelkanal 40 x 60 mm", 3, 9.40),
    ("KX-7200", "Kabelschelle 8 mm", 25, 0.22),
    ("KX-8000", "Schalter Aufputz", 2, 6.80),
    ("KX-8100", "Steckdose Aufputz", 4, 5.90),
    ("KX-8200", "Abzweigdose 85 mm", 5, 2.40),
    ("KX-8300", "Kabelverschraubung M20", 10, 0.95),
    ("KX-8400", "Gegenmutter M20", 10, 0.30),
    ("KX-9000", "Mantelleitung NYM 3x1,5, 50 m", 1, 39.90),
    ("KX-9010", "Mantelleitung NYM 5x2,5, 25 m", 1, 54.50),
    ("KX-9100", "Erdungsband 10 m", 2, 12.40),
    ("KX-9200", "Potentialschiene", 1, 18.70),
    ("KX-9300", "Hutschiene 1 m", 3, 3.15),
    ("KX-9400", "Leitungsschutzschalter B16", 6, 4.95),
    ("KX-9500", "FI-Schutzschalter 40 A", 1, 32.00),
    ("KX-9600", "Ueberspannungsschutz", 1, 64.50),
    ("KX-9700", "Zaehlerplatz", 1, 129.00),
    ("KX-9800", "Verteilerkasten 3-reihig", 1, 89.00),
    ("KX-9900", "Beschriftungsschilder", 2, 4.40),
    ("KX-9910", "Schraubensatz", 1, 6.60),
    ("KX-9920", "Duebelsatz", 1, 5.10),
    ("KX-9930", "Montageplatte", 2, 7.30),
    ("KX-9940", "Kabelmarkierer", 3, 3.80),
    ("KX-9950", "Pruefprotokoll", 1, 0.00),
    ("KX-9960", "Abdeckstreifen", 4, 1.10),
    ("KX-9970", "Blindabdeckung", 6, 0.70),
    ("KX-9980", "Endkappen", 8, 0.35),
    ("KX-9990", "Transportkiste", 1, 15.00),
]
NEW = ("KX-2212", "Schrumpfschlauch 4 mm, gelb", 3, 6.90)


def de(x):
    cents = round(abs(x) * 100)
    i, c = divmod(cents, 100)
    return ("-" if x < 0 else "") + f"{i:,}".replace(",", ".") + f",{c:02d}"


def build(path, items, numbers=None, spacer=0, head_gap=0):
    numbers = numbers or [str(i + 1) for i in range(len(items))]
    styles = getSampleStyleSheet()
    data = [["Pos.", "Art.-Nr.", "Bezeichnung", "Menge", "Preis", "Betrag"]]
    for n, (a, d, q, p) in zip(numbers, items):
        data.append([n, a, d, str(q), de(p), de(q * p)])
    t = Table(data, colWidths=[9 * mm, 20 * mm, 70 * mm, 14 * mm, 18 * mm, 20 * mm], rowHeights=[16 + head_gap] + [16] * (len(data) - 1), repeatRows=1)
    t.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 8),
        ("FONT", (0, 1), (-1, -1), "Helvetica", 9),
        ("LEFTPADDING", (0, 0), (-1, -1), 2.5), ("LEFTPADDING", (1, 0), (1, -1), 4.5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2.5),
        ("ALIGN", (0, 0), (0, -1), "RIGHT"),
        ("ALIGN", (3, 0), (-1, -1), "RIGHT"),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, colors.black),
    ] + ([("VALIGN", (0, 0), (-1, 0), "TOP")] if head_gap else [])))

    def footer(c, d):
        c.saveState()
        c.setFont("Helvetica", 7)
        c.drawString(20 * mm, 12 * mm, "SYNTHETIC test fixture - reportlab - no real delivery note")
        c.drawRightString(190 * mm, 12 * mm, f"Seite {d.page}")
        c.restoreState()

    doc = SimpleDocTemplate(path, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=18 * mm, bottomMargin=20 * mm,
                            title="SYNTHETIC test fixture", author="ChangeLens tests", creator="reportlab", invariant=1)
    story = [Paragraph("Lieferschein LS-0000 (SYNTHETIC)", styles["Heading2"])]
    if spacer:
        story.append(Spacer(1, spacer))
    story.append(t)
    story.append(Spacer(1, 8))
    story.append(Paragraph(f"Summe netto: {de(sum(q * p for (_, _, q, p) in items))} EUR", styles["Normal"]))
    doc.build(story, onFirstPage=footer, onLaterPages=footer)


def main(out):
    p = lambda name: os.path.join(out, f"probe9-T2b-{name}.pdf")
    base = ITEMS[:10]
    build(p("ins-before"), base)
    build(p("ins-after"), base[:2] + [NEW] + [(base[2][0], base[2][1], base[2][2], 8.95)] + base[3:])

    full = ITEMS[:40]
    cross = full[:2] + [NEW] + full[2:]
    build(p("cross-before"), full, spacer=60)
    build(p("cross-after"), cross, spacer=60)
    nums = [str(i + 1) for i in range(len(cross))]
    nums[38] = "41"
    build(p("crossx-after"), cross, nums, spacer=60)
    build(p("crosse-after"), [(a, d + " grau" if a == "KX-9970" else d, q, pr) for (a, d, q, pr) in cross], spacer=60)

    rest = [r for i, r in enumerate(base) if i not in (2, 9)]
    build(p("move-before"), base, head_gap=6)
    build(p("move-after"), [base[9]] + rest, head_gap=6)
    build(p("movep-after"), [base[9][:3] + (2.55,)] + rest, head_gap=6)
    build(p("movex-after"), [base[9]] + rest, ["4"] + [str(i + 2) for i in range(len(rest))], head_gap=6)
    build(p("dup-after"), base[:6] + base[7:], ["1", "2", "3", "4", "5", "6", "8", "8", "9"])


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ".")

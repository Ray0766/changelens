"""Case holdout5-i-rechnung-eur: German two-page invoice, fpdf2 core fonts (Helvetica, cp1252),
hand-drawn cell() table with zebra fill and a header row repeated on page 2, Code 39 barcode."""
from fpdf import FPDF
from fpdf_helpers import new_pdf, fmt_de

SLUG = "holdout5-i-rechnung-eur"

ITEMS = [
    ("10-2001", "Bechergläser 250 ml, Borosilikat, 12 St.", 2, "Pkg.", 41.80),
    ("10-2004", "Bechergläser 600 ml, Borosilikat, 6 St.", 1, "Pkg.", 36.20),
    ("10-3110", "Erlenmeyerkolben 500 ml, Enghals", 6, "St.", 7.95),
    ("12-0150", "Messzylinder 100 ml, Klasse B", 4, "St.", 12.40),
    ("12-0155", "Messzylinder 500 ml, Klasse B", 2, "St.", 24.90),
    ("15-7720", "Petrischalen 90 mm, steril, 500 St.", 3, "Karton", 64.00),
    ("31-0412", "Pipettenspitzen 200 µl, unsteril, 1000 St.", 5, "Beutel", 18.75),
    ("31-0920", "Mehrkanalpipette 8-Kanal, 10–100 µl", 1, "St.", 389.00),
    ("33-1001", "Reagenzglasständer, 40 Plätze, PP", 6, "St.", 9.60),
    ("33-1015", "Reagenzgläser 16 × 160 mm, 250 St.", 2, "Karton", 47.30),
    ("40-0050", "Laborflaschen 1000 ml, GL 45", 10, "St.", 8.45),
    ("40-0055", "Laborflaschen 500 ml, GL 45", 10, "St.", 6.90),
    ("41-2210", "Spritzflasche 500 ml, LDPE", 8, "St.", 4.85),
    ("42-0310", "Trichter 100 mm, PP", 5, "St.", 3.20),
    ("44-1010", "Nitrilhandschuhe Gr. S, puderfrei", 5, "Karton", 48.90),
    ("44-1020", "Nitrilhandschuhe Gr. M, puderfrei", 10, "Karton", 48.90),
    ("44-1030", "Nitrilhandschuhe Gr. L, puderfrei", 6, "Karton", 48.90),
    ("46-0100", "Laborkittel Baumwolle, Gr. 50", 3, "St.", 29.50),
    ("46-0210", "Schutzbrille, beschlagfrei", 12, "St.", 6.40),
    ("50-1200", "Wägeschalen 100 ml, PS, 500 St.", 1, "Karton", 52.80),
    ("52-0040", "Spatel, Edelstahl, 150 mm", 10, "St.", 2.95),
    ("55-3300", "pH-Indikatorpapier 1–14, 4 Rollen", 3, "Pkg.", 11.20),
    ("58-0710", "Filterpapier Ø 125 mm, 100 St.", 6, "Pkg.", 5.85),
    ("60-2020", "Magnetrührstäbchen 25 mm, PTFE", 10, "St.", 3.10),
    ("61-0005", "Magnetrührer mit Heizplatte, 1500 U/min", 1, "St.", 248.00),
    ("63-1100", "Laborthermometer -10 … +110 °C", 4, "St.", 14.70),
    ("65-0300", "Exsikkator 200 mm, mit Hahn", 1, "St.", 96.40),
    ("70-0120", "Kryoröhrchen 2 ml, 500 St.", 2, "Karton", 58.60),
    ("70-0450", "Gefrierboxen 81 Plätze, 10 St.", 1, "Pkg.", 42.00),
    ("72-1005", "Parafilm M, 100 mm × 38 m", 2, "Rolle", 39.90),
    ("75-0080", "Etiketten kryofest, 1000 St.", 1, "Rolle", 27.40),
    ("80-0500", "Flächendesinfektion, 1 l", 6, "Fl.", 8.20),
    ("80-0510", "Händedesinfektion, 500 ml", 6, "Fl.", 5.95),
    ("90-0001", "Versandkostenpauschale", 1, "pausch.", 14.50),
]
INSERTED = ("31-0458", "Pipettenspitzen 1000 µl, steril, 10 × 96 St.", 4, "Pkg.", 38.50)

COLS = [("Pos.", 10, "R"), ("Art.-Nr.", 18, "L"), ("Bezeichnung", 72, "L"), ("Menge", 13, "R"),
        ("Einh.", 15, "L"), ("Einzelpreis €", 22, "R"), ("Betrag €", 25, "R")]
LEFT = 20
ROW_H = 6.0
BOTTOM = 272.0


class Invoice(FPDF):
    def header(self):
        if self.page_no() > 1:
            self.set_font("Helvetica", "", 7.5)
            self.set_text_color(90)
            self.set_xy(LEFT, 10)
            self.cell(175, 4, "Muster Laborbedarf GmbH · Rechnung RE-2026-1187 vom 04.11.2026")
            self.set_text_color(0)

    def footer(self):
        self.set_draw_color(150)
        self.set_line_width(0.2)
        self.line(LEFT, 278.5, 195, 278.5)
        self.set_text_color(90)
        self.set_font("Helvetica", "", 6.5)
        self.set_xy(LEFT, 280)
        self.cell(140, 3.2, "Muster Laborbedarf GmbH · Geschäftsführer: M. Muster · Amtsgericht Musterstadt HRB 00000 · USt-IdNr. DE000000000")
        self.set_xy(LEFT, 283.5)
        self.cell(140, 3.2, "Synthetisches Muster – synthetic sample, keine echte Rechnung")
        self.set_font("Helvetica", "", 8)
        self.set_xy(155, 281)
        self.cell(40, 4, f"Seite {self.page_no()} von {{nb}}", align="R")
        self.set_text_color(0)


def _logo(pdf, x, y):
    pdf.set_fill_color(32, 82, 96)
    pdf.rect(x, y, 9, 9, "F")
    pdf.set_fill_color(86, 160, 170)
    pdf.rect(x + 5, y + 5, 9, 9, "F")
    pdf.set_fill_color(230, 170, 60)
    pdf.rect(x, y + 15.5, 14, 1.6, "F")


def _table_header(pdf, y):
    pdf.set_xy(LEFT, y)
    pdf.set_fill_color(32, 82, 96)
    pdf.set_text_color(255)
    pdf.set_font("Helvetica", "B", 8)
    for name, w, al in COLS:
        pdf.cell(w, 6.5, name, border=0, align=al, fill=True)
    pdf.set_text_color(0)
    return y + 6.5


def build(version):
    after = version == "after"
    items = list(ITEMS)
    if after:
        items.insert(6, INSERTED)
        items = [(a, d, 12 if a == "44-1020" else q, u, p) for (a, d, q, u, p) in items]
    credit = -185.00 if after else -150.00
    due = "02.12.2026" if after else "18.11.2026"

    pdf = new_pdf(Invoice, format="A4")
    pdf.core_fonts_encoding = "windows-1252"
    pdf.set_margins(LEFT, 15, 15)
    pdf.add_page()

    # Letterhead
    _logo(pdf, LEFT, 14)
    pdf.set_font("Helvetica", "B", 15)
    pdf.set_xy(LEFT + 18, 15)
    pdf.cell(90, 7, "Muster Laborbedarf GmbH")
    pdf.set_font("Helvetica", "", 8)
    pdf.set_xy(LEFT + 18, 22)
    pdf.cell(90, 4, "Laborbedarf und Verbrauchsmaterial")
    pdf.set_xy(140, 15)
    pdf.multi_cell(55, 3.8, "Beispielweg 12\n12345 Musterstadt\nTel. 0000 123456-0\nrechnung@laborbedarf.example", align="R")

    # Address window
    pdf.set_font("Helvetica", "U", 6.5)
    pdf.set_xy(LEFT, 47)
    pdf.cell(85, 3.5, "Muster Laborbedarf GmbH · Beispielweg 12 · 12345 Musterstadt")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_xy(LEFT, 53)
    pdf.multi_cell(85, 5, "Probe Analytik AG\nEinkauf / Frau E. Beispiel\nTeststraße 5\n54321 Neustadt", align="L")

    # Info block
    info = [("Rechnungsnummer", "RE-2026-1187"), ("Rechnungsdatum", "04.11.2026"), ("Kundennummer", "40219"),
            ("Ihre Bestellung", "PO-7781 vom 21.10.2026"), ("Lieferschein", "LS-5531"), ("Lieferdatum", "30.10.2026")]
    y = 50
    for k, v in info:
        pdf.set_font("Helvetica", "", 8.5)
        pdf.set_xy(125, y)
        pdf.cell(30, 4.6, k)
        pdf.set_font("Helvetica", "B", 8.5)
        pdf.cell(40, 4.6, v, align="R")
        y += 4.6

    pdf.set_font("Helvetica", "B", 14)
    pdf.set_xy(LEFT, 88)
    pdf.cell(120, 7, "Rechnung RE-2026-1187")
    pdf.set_font("Helvetica", "", 9)
    pdf.set_xy(LEFT, 97)
    pdf.cell(175, 5, "Sehr geehrte Frau Beispiel, vielen Dank für Ihre Bestellung. Wir berechnen Ihnen folgende Lieferung:")

    rows = []
    for (a, d, q, u, p) in items:
        rows.append([a, d, str(q), u, fmt_de(p), fmt_de(q * p)])
    rows.append(["RS-0412", "Gutschrift Rücksendung LS-5520 vom 28.10.2026", "", "", "", fmt_de(credit)])
    net = round(sum(q * p for (_, _, q, _, p) in items) + credit, 2)
    vat = round(net * 0.19, 2)
    gross = round(net + vat, 2)

    y = _table_header(pdf, 106)
    pdf.set_font("Helvetica", "", 8.5)
    for i, r in enumerate(rows):
        if y + ROW_H > BOTTOM:
            pdf.set_draw_color(32, 82, 96)
            pdf.set_line_width(0.3)
            pdf.line(LEFT, y, 195, y)
            pdf.add_page()
            y = _table_header(pdf, 17)
            pdf.set_font("Helvetica", "", 8.5)
        pdf.set_xy(LEFT, y)
        fill = i % 2 == 1
        pdf.set_fill_color(238, 243, 244)
        cells = [str(i + 1)] + r
        for (name, w, al), text in zip(COLS, cells):
            pdf.cell(w, ROW_H, text, border=0, align=al, fill=fill)
        y += ROW_H
    pdf.set_draw_color(32, 82, 96)
    pdf.set_line_width(0.3)
    pdf.line(LEFT, y, 195, y)

    # Totals
    y += 4
    for label, val, bold in [("Nettobetrag", net, False), ("zzgl. 19 % USt.", vat, False), ("Rechnungsbetrag", gross, True)]:
        pdf.set_font("Helvetica", "B" if bold else "", 9.5 if bold else 9)
        if bold:
            pdf.set_line_width(0.4)
            pdf.line(125, y + 0.5, 195, y + 0.5)
            pdf.line(125, y + 1.3, 195, y + 1.3)
            y += 2
        pdf.set_xy(125, y)
        pdf.cell(42, 5.5, label)
        pdf.cell(28, 5.5, fmt_de(val) + " €", align="R")
        y += 5.5

    y += 7
    pdf.set_font("Helvetica", "", 8.5)
    pdf.set_xy(LEFT, y)
    pdf.multi_cell(175, 4.4, f"Zahlungsbedingungen: Zahlbar bis {due} ohne Abzug. Bei Zahlung innerhalb von 10 Tagen ab "
                   "Rechnungsdatum gewähren wir 2 % Skonto auf den Nettowarenwert. Bitte geben Sie bei der Zahlung die "
                   "Rechnungsnummer RE-2026-1187 als Verwendungszweck an. Die Ware bleibt bis zur vollständigen Bezahlung "
                   "unser Eigentum.", align="J")
    y = pdf.get_y() + 4
    pdf.set_xy(LEFT, y)
    pdf.cell(175, 4.4, "Bankverbindung: Musterbank · IBAN DE00 1234 5678 9012 3456 78 · BIC MUSTDEXXXXX")
    y += 8
    pdf.set_fill_color(0)
    pdf.code39("*RE-2026-1187*", x=LEFT, y=y, w=0.33, h=9)
    pdf.set_font("Helvetica", "", 7)
    pdf.set_xy(LEFT, y + 9.5)
    pdf.cell(60, 3.5, "Zahlungsreferenz RE-2026-1187")
    return bytes(pdf.output()), {"pages": pdf.page_no(), "net": net, "vat": vat, "gross": gross}


def truth(mb, ma):
    return {
        "description": (
            "Two-page German invoice (Rechnung) for laboratory supplies with German number format (1.234,56 €), a "
            "credit line with a leading hyphen-minus (-150,00), dd.mm.yyyy dates, a logo made of filled rectangles "
            "and a Code 39 barcode. Produced with fpdf2 2.9.0 using the non-embedded core fonts Helvetica/Helvetica-Bold "
            "(cp1252/WinAnsi); the line-item table is drawn cell by cell with zebra shading, and its header row is "
            "repeated on page 2 below a running header. Edits: one line item inserted as position 7, the quantity of "
            "'Nitrilhandschuhe Gr. M' raised from 10 to 12 (its line amount changes), the return credit changed from "
            "-150,00 to -185,00, the due date moved; net, VAT and gross totals are recomputed. Consequences that are not "
            "listed: positions 7-35 renumber to 8-36, the zebra shading of every row after the insertion flips, the last "
            "row of page 1 (Laborthermometer) moves to the top of page 2, and everything on page 2 shifts down by one row. "
            "The page count stays 2 ('Seite 1 von 2')."
        ),
        "synthetic": True,
        "set": "held-out-5",
        "blind": True,
        "truth": [
            {"type": "insert", "new": "31-0458 Pipettenspitzen 1000", "newPage": 1,
             "note": "Whole new table row '31-0458 Pipettenspitzen 1000 µl, steril, 10 × 96 St. | 4 | Pkg. | 38,50 | 154,00' inserted as Pos. 7; the following positions renumber (consequence). Snippet stops before the micro sign: PDF.js extracts WinAnsi µ (0xB5) as Greek mu U+03BC, pdftotext as U+00B5."},
            {"type": "number", "old": "puderfrei 10 Karton", "new": "puderfrei 12 Karton", "oldPage": 1, "newPage": 1,
             "note": "Quantity of row 44-1020 Nitrilhandschuhe Gr. M (old Pos. 16, new Pos. 17)."},
            {"type": "number", "old": "489,00", "new": "586,80", "oldPage": 1, "newPage": 1,
             "note": "Line amount of the same row, recomputed from the quantity (12 × 48,90)."},
            {"type": "number", "old": "-150,00", "new": "-185,00", "oldPage": 2, "newPage": 2,
             "note": "Return credit RS-0412, negative with a leading ASCII hyphen-minus."},
            {"type": "number", "old": fmt_de(mb["net"]) + " €", "new": fmt_de(ma["net"]) + " €", "oldPage": 2, "newPage": 2,
             "note": "Nettobetrag."},
            {"type": "number", "old": fmt_de(mb["vat"]) + " €", "new": fmt_de(ma["vat"]) + " €", "oldPage": 2, "newPage": 2,
             "note": "zzgl. 19 % USt."},
            {"type": "number", "old": fmt_de(mb["gross"]) + " €", "new": fmt_de(ma["gross"]) + " €", "oldPage": 2, "newPage": 2,
             "note": "Rechnungsbetrag (gross total, bold, under a double rule)."},
            {"type": "number", "old": "18.11.2026", "new": "02.12.2026", "oldPage": 2, "newPage": 2,
             "note": "Due date inside the justified payment-terms paragraph (same width, no re-flow)."},
        ],
    }

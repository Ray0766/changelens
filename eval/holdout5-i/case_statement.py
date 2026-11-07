"""Case holdout5-i-statement-gbp: UK customer statement of account, fpdf2 core fonts (Courier rows,
Helvetica headings, cp1252), DR/CR amounts, aged balance, credit-use bar, remittance slip with an
Interleaved 2 of 5 barcode, 'Page X of Y'. The summary block moves to a new page after the edit."""
import random

from fpdf import FPDF
from fpdf_helpers import new_pdf, fmt_drcr, fmt_uk, rect_pt

SLUG = "holdout5-i-statement-gbp"
L = 15
COLS = [("Date", 22, "L"), ("Type", 12, "L"), ("Reference", 22, "L"), ("Details", 74, "L"), ("Due date", 24, "L"), ("Amount", 26, "R")]
ROW_H = 4.9
BOTTOM = 268.0
SUMMARY_H = 104.0
LIMIT = 10000.00
BF = 1240.00

PRODUCTS = ["Hinges, brass 75 mm", "Wood screws, assorted", "Paint brushes, trade pack", "Masking tape 25 mm",
            "Cabinet handles, satin", "Wall plugs, 500 pack", "Sandpaper rolls", "Padlocks 40 mm", "Door stops, rubber",
            "Extension leads 4-way", "Cable ties, 200 pack", "Silicone sealant, clear", "Tool boxes 19 in",
            "Light bulbs LED E27", "Garden hose fittings", "Shelf brackets 200 mm", "Drill bits HSS set",
            "Filler 1 kg tubs", "Wheelbarrow tyres", "Safety gloves, size 9"]


def transactions(after):
    rnd = random.Random(4170)
    rows = []
    inv = 40610
    pay = 88120
    crn = 7301
    months = [(8, 31, 20), (9, 30, 21), (10, 31, 21)]
    for (m, last, n) in months:
        days = sorted(rnd.sample(range(1, last + 1), n))
        for k, d in enumerate(days):
            date = f"{d:02d}/{m:02d}/2026"
            roll = rnd.random()
            if k in (6, 14):
                amt = round(rnd.uniform(600, 1400), 2)
                rows.append([date, "PAY", f"{pay}", "BACS payment - thank you", "", -amt])
                pay += 1
            elif roll < 0.12:
                amt = round(rnd.uniform(25, 160), 2)
                rows.append([date, "CRN", f"{crn}", "Goods returned - damaged" if m == 8 else "Price adjustment", "", -amt])
                crn += 1
            else:
                amt = round(rnd.uniform(70, 420), 2)
                dm, dd = (m + 1, d) if d <= 28 else (m + 1, 28)
                rows.append([date, "INV", f"{inv}", f"Delivery {7600 + inv % 100} - {PRODUCTS[inv % len(PRODUCTS)]}",
                             f"{dd:02d}/{dm:02d}/2026", amt])
                inv += 1
    # deliberate rows (same in both versions unless noted)
    rows.append(["20/10/2026", "PAY", "88213", "BACS payment - thank you", "", -150.00 if after else 150.00])
    rows.append(["23/10/2026", "CRN", "7344", "Goods returned - " + ("wrong size" if after else "damaged"), "", -64.80])
    if after:
        rows.append(["12/09/2026", "INV", "40871", "Delivery 7716 - Shelving brackets 300 mm", "12/10/2026", 1820.40])
    rows.sort(key=lambda r: (r[0][6:], r[0][3:5], r[0][:2], r[2]))
    for r in rows:
        if r[2] == "40626":
            r[4] = "15/10/2026" if after else "30/09/2026"
    return rows


class Statement(FPDF):
    def footer(self):
        self.set_font("Helvetica", "", 6.8)
        self.set_text_color(100)
        self.set_xy(L, 283)
        self.cell(140, 3.5, "Sample Wholesale Supplies Ltd (fictional) · Synthetic sample - not a real statement · Registered in England No. 00000000")
        self.set_font("Helvetica", "", 7.5)
        self.set_xy(160, 283)
        self.cell(35, 3.5, f"Page {self.page_no()} of {{nb}}", align="R")
        self.set_text_color(0)


def _head(pdf, y):
    pdf.set_font("Helvetica", "B", 7.8)
    pdf.set_fill_color(225, 225, 225)
    pdf.set_xy(L, y)
    for n, w, a in COLS:
        pdf.cell(w, 5.5, n, border="TB", align=a, fill=True)
    return y + 6.0


def build(version):
    after = version == "after"
    rows = transactions(after)
    pdf = new_pdf(Statement, format="A4")
    pdf.core_fonts_encoding = "windows-1252"
    pdf.add_page()

    # logo: three bars
    pdf.set_fill_color(150, 30, 45)
    for i, h in enumerate((6, 9, 12)):
        pdf.rect(L + i * 4.2, 26 - h, 3.2, h, "F")
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_xy(L + 15, 14)
    pdf.cell(110, 6, "Sample Wholesale Supplies Ltd")
    pdf.set_font("Helvetica", "", 7.5)
    pdf.set_xy(L + 15, 20)
    pdf.cell(110, 4, "Unit 9, Example Park, Testbury TB2 0ZZ · accounts@wholesale.example · VAT GB 000 0000 00")
    pdf.set_font("Helvetica", "B", 15)
    pdf.set_xy(120, 14)
    pdf.cell(75, 7, "STATEMENT OF ACCOUNT", align="R")

    pdf.set_font("Helvetica", "", 9.5)
    pdf.set_xy(L, 38)
    pdf.multi_cell(80, 4.8, "Demo Hardware Stores Ltd\nAccounts Payable\n12 Example Road\nTestbury\nTB1 0ZZ", align="L")
    info = [("Account no.", "DEM-00417"), ("Statement date", "31/10/2026"), ("Period", "01/08/2026 - 31/10/2026"),
            ("Terms", "30 days net"), ("Credit limit", f"£{fmt_uk(LIMIT)}")]
    pdf.set_draw_color(120)
    pdf.set_line_width(0.2)
    pdf.rect(120, 37, 75, len(info) * 5 + 3)
    y = 38.5
    for k, v in info:
        pdf.set_font("Helvetica", "", 8.5)
        pdf.set_xy(122, y)
        pdf.cell(30, 5, k)
        pdf.set_font("Helvetica", "B", 8.5)
        pdf.cell(41, 5, v, align="R")
        y += 5
    pdf.set_font("Helvetica", "", 8.5)
    pdf.set_xy(L, 70)
    pdf.multi_cell(180, 4.3, "Please find below all transactions on your account for the period. Payments received after the "
                   "statement date are not shown. Amounts marked DR are owed to us; CR are credits to your account.", align="L")

    y = _head(pdf, 82)
    pdf.set_font("Courier", "", 8)
    pdf.set_xy(L, y)
    pdf.cell(22, ROW_H, "01/08/2026")
    pdf.cell(12, ROW_H, "")
    pdf.cell(22, ROW_H, "")
    pdf.cell(74, ROW_H, "Balance brought forward")
    pdf.cell(24, ROW_H, "")
    pdf.cell(26, ROW_H, fmt_drcr(BF), align="R")
    y += ROW_H
    for r in rows:
        if y + ROW_H > BOTTOM:
            pdf.add_page()
            y = _head(pdf, 16)
            pdf.set_font("Courier", "", 8)
        pdf.set_xy(L, y)
        for (n, w, a), t in zip(COLS, r[:5] + [fmt_drcr(r[5])]):
            pdf.cell(w, ROW_H, t, align=a)
        y += ROW_H
    pdf.set_draw_color(0)
    pdf.set_line_width(0.3)
    pdf.line(L, y + 0.5, L + 180, y + 0.5)

    # aged balance by month of transaction
    buckets = {"Current": 0.0, "1 month": 0.0, "2 months": 0.0, "Older": BF}
    for r in rows:
        m = int(r[0][3:5])
        buckets[{10: "Current", 9: "1 month", 8: "2 months"}[m]] += r[5]
    buckets = {k: round(v, 2) for k, v in buckets.items()}
    total = round(sum(buckets.values()), 2)

    if y + 4 + SUMMARY_H > BOTTOM + 8:
        pdf.add_page()
        y = 16
    else:
        y += 5
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_xy(L, y)
    pdf.cell(180, 5, "Aged balance")
    y += 6
    heads = ["Current", "1 month", "2 months", "Older", "Total due"]
    vals = [buckets["Current"], buckets["1 month"], buckets["2 months"], buckets["Older"], total]
    pdf.set_draw_color(120)
    pdf.set_line_width(0.2)
    for i, (h, v) in enumerate(zip(heads, vals)):
        x = L + i * 36
        pdf.set_xy(x, y)
        pdf.set_fill_color(225, 225, 225) if i < 4 else pdf.set_fill_color(150, 30, 45)
        pdf.set_text_color(0 if i < 4 else 255)
        pdf.set_font("Helvetica", "B", 8)
        pdf.cell(36, 5.5, h, border=1, align="C", fill=True)
        pdf.set_text_color(0)
        pdf.set_xy(x, y + 5.5)
        pdf.set_font("Helvetica", "B" if i == 4 else "", 9)
        pdf.cell(36, 7, f"£{fmt_uk(v)}", border=1, align="C")
    y += 18

    # credit use bar
    pdf.set_font("Helvetica", "", 8)
    pdf.set_xy(L, y)
    pdf.cell(30, 5, "Credit used")
    bar_x, bar_y, bar_w, bar_h = L + 30, y + 0.5, 110.0, 4.0
    pdf.set_fill_color(235, 235, 235)
    pdf.rect(bar_x, bar_y, bar_w, bar_h, "F")
    pdf.set_fill_color(150, 30, 45)
    pdf.rect(bar_x, bar_y, round(bar_w * min(total / LIMIT, 1.0), 2), bar_h, "F")
    pdf.set_draw_color(90)
    pdf.rect(bar_x, bar_y, bar_w, bar_h)
    pdf.set_xy(bar_x + bar_w + 3, y)
    pdf.cell(37, 5, f"of £{fmt_uk(LIMIT)} limit")
    bar = (pdf.page_no(), (bar_x, bar_y, bar_w, bar_h))
    y += 12

    # remittance slip
    pdf.set_draw_color(0)
    pdf.set_dash_pattern(dash=1.5, gap=1.2)
    pdf.line(L, y, L + 180, y)
    pdf.set_dash_pattern()
    pdf.set_font("Helvetica", "", 7)
    pdf.set_xy(L, y + 1)
    pdf.cell(180, 4, "Please detach and return this slip with your payment", align="C")
    y += 7
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_xy(L, y)
    pdf.cell(100, 6, "REMITTANCE ADVICE")
    pdf.set_font("Helvetica", "", 8.5)
    for i, (k, v) in enumerate((("Customer", "Demo Hardware Stores Ltd"), ("Account no.", "DEM-00417"),
                                ("Statement date", "31/10/2026"), ("Amount enclosed", "£ ____________________"))):
        pdf.set_xy(L, y + 8 + i * 5.5)
        pdf.cell(32, 5, k)
        pdf.cell(70, 5, v)
    pdf.set_xy(L, y + 32)
    pdf.multi_cell(110, 4, "Pay by BACS to Example Bank plc, sort code 00-00-00, account 00000000. "
                   "Please quote DEM-00417 as the payment reference.", align="L")
    pdf.set_fill_color(0)
    pdf.interleaved2of5("00041731102026", x=135, y=y + 9, w=0.42, h=13)
    pdf.set_font("Courier", "", 7)
    pdf.set_xy(135, y + 23)
    pdf.cell(60, 4, "00041731102026")
    return bytes(pdf.output()), {"pages": pdf.page_no(), "buckets": buckets, "total": total, "bar": bar,
                                 "summary_page": pdf.page_no()}


def _row_page(version, ref):
    data, _ = build(version)
    import pymupdf
    doc = pymupdf.open(stream=data, filetype="pdf")
    pages = [i + 1 for i, p in enumerate(doc) if p.search_for(ref)]
    assert len(pages) == 1, (ref, pages)
    return pages[0]


def truth(mb, ma):
    ob, nb = mb["bar"], ma["bar"]
    return {
        "description": (
            "UK customer statement of account (Sample Wholesale Supplies Ltd, fictional) listing invoices, credit notes and "
            "payments for August-October 2026, produced with fpdf2 2.9.0 using non-embedded core fonts (Courier for the "
            "transaction rows, Helvetica for headings, cp1252). Amounts use the ledger convention 1,234.56 DR / 150.00 CR, "
            "dates dd/mm/yyyy, 'Page X of Y' footers, a header row repeated on each page, an aged-balance grid, a credit-use "
            "bar drawn with rectangles and a remittance slip with a dashed cut line and an Interleaved 2 of 5 barcode. "
            "Edits: a missing invoice INV 40871 inserted on page 1, the due date of INV 40626 extended, a payment that had "
            "been posted as DR corrected to CR, the reason text of credit note CRN 7344 changed; the aged balance and the "
            "credit-use bar are recomputed. Consequences not listed: the last row of page 1 (PAY 88123) moves to page 2, the whole "
            "summary block (aged balance, credit bar, remittance slip with barcode) no longer fits on page 2 and moves to a "
            "new page 3, and the footers change from 'Page n of 2' to 'Page n of 3'. The 2 months and Older buckets are unchanged."
        ),
        "synthetic": True,
        "set": "held-out-5",
        "blind": True,
        "truth": [
            {"type": "insert", "new": "INV 40871 Delivery 7716 - Shelving brackets", "newPage": _row_page("after", "40871"),
             "note": "Whole new row dated 12/09/2026, due 12/10/2026, 1,820.40 DR."},
            {"type": "number", "old": "Sandpaper rolls 30/09/2026", "new": "Sandpaper rolls 15/10/2026", "oldPage": _row_page("before", "40626"),
             "newPage": _row_page("after", "40626"), "note": "Due date of INV 40626 (30/08/2026, Delivery 7626 - Sandpaper rolls) extended; the description is in the snippet because another invoice is also due 15/10/2026."},
            {"type": "number", "old": "150.00 DR", "new": "150.00 CR", "oldPage": _row_page("before", "88213"),
             "newPage": _row_page("after", "88213"),
             "note": "Payment PAY 88213 (20/10/2026) corrected from debit to credit: a sign change written with the DR/CR suffix, which the README does not list among recognised sign notations. A report as a word change DR -> CR is equally correct."},
            {"type": "replace", "old": "Goods returned - damaged", "new": "Goods returned - wrong size",
             "oldPage": _row_page("before", "7344"), "newPage": _row_page("after", "7344"),
             "note": "Details of credit note CRN 7344 (23/10/2026); the August credit notes keep 'damaged'. Snippet unique on that page."},
            {"type": "number", "old": "£" + fmt_uk(mb["buckets"]["Current"]), "new": "£" + fmt_uk(ma["buckets"]["Current"]),
             "oldPage": mb["summary_page"], "newPage": ma["summary_page"], "note": "Aged balance, Current (October) bucket: -300.00 from the sign correction."},
            {"type": "number", "old": "£" + fmt_uk(mb["buckets"]["1 month"]), "new": "£" + fmt_uk(ma["buckets"]["1 month"]),
             "oldPage": mb["summary_page"], "newPage": ma["summary_page"], "note": "Aged balance, 1 month (September) bucket: +1,820.40 from the inserted invoice."},
            {"type": "number", "old": "£" + fmt_uk(mb["total"]), "new": "£" + fmt_uk(ma["total"]),
             "oldPage": mb["summary_page"], "newPage": ma["summary_page"], "note": "Total due."},
            {"type": "graphic", "oldPage": ob[0], "newPage": nb[0], "oldRect": rect_pt(*ob[1]), "newRect": rect_pt(*nb[1]),
             "note": f"Credit-use bar: filled part grows from {mb['total'] / LIMIT:.0%} to {ma['total'] / LIMIT:.0%} of the bar; rect is the whole bar outline. The bar is on a different page after the edit (summary block moved)."},
        ],
    }

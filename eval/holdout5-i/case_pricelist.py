"""Case holdout5-i-pricelist-gbp: UK trade price list, three pages, fpdf2 table() API with repeated
heading rows, coloured group bands (colspan rows), embedded DejaVu Sans (U+2212 minus), £ prices,
dd/mm/yyyy dates, a strikethrough cell."""
import pymupdf
from fpdf import FPDF
from fpdf.fonts import FontFace
from fpdf_helpers import new_pdf, FONT_DEJAVU, FONT_DEJAVU_B

SLUG = "holdout5-i-pricelist-gbp"
L = 15

GROUPS = [
    ("Watering", (214, 230, 245), [
        ("WT-3010", "Hose pipe 15 m, 12.5 mm", "each", 2, 21.50, ""),
        ("WT-3020", "Hose pipe 30 m, 12.5 mm", "each", 2, 36.90, ""),
        ("WT-3030", "Hose reel, wall-mounted", "each", 1, 44.80, ""),
        ("WT-3040", "Hose connector 1/2\", brass", "pack of 2", 10, 7.60, ""),
        ("WT-3050", "Spray gun, 7 patterns", "each", 6, 11.30, ""),
        ("WT-3060", "Watering can 10 l, galvanised", "each", 2, 27.90, ""),
        ("WT-3070", "Watering can 5 l, plastic", "each", 6, 8.40, ""),
        ("WT-3080", "Oscillating sprinkler", "each", 2, 19.50, ""),
        ("WT-3090", "Soaker hose 15 m", "each", 2, 16.80, ""),
        ("WT-3100", "Water butt 210 l with stand", "each", 1, 58.00, "Pallet delivery"),
        ("WT-3110", "Rain diverter kit", "each", 2, 14.20, ""),
        ("WT-3120", "Drip irrigation starter kit", "each", 2, 32.40, ""),
        ("WT-3130", "Tap timer, single outlet", "each", 2, 29.90, ""),
    ]),
    ("Hand tools", (220, 239, 217), [
        ("HT-1010", "Border fork, stainless steel", "each", 1, 32.90, ""),
        ("HT-1020", "Border spade, stainless steel", "each", 1, 34.50, ""),
        ("HT-1030", "Digging spade, carbon steel", "each", 1, 27.40, ""),
        ("HT-1040", "Hand trowel, ash handle", "each", 6, 6.85, ""),
        ("HT-1050", "Hand fork, ash handle", "each", 6, 6.85, ""),
        ("HT-1060", "Transplanting trowel, narrow", "each", 6, 7.20, ""),
        ("HT-1070", "Dutch hoe, 1.5 m handle", "each", 2, 18.60, ""),
        ("HT-1080", "Draw hoe, 1.5 m handle", "each", 2, 17.90, ""),
        ("HT-1090", "Soil rake, 14 teeth", "each", 2, 16.40, ""),
        ("HT-1100", "Leaf rake, adjustable", "each", 2, 14.75, ""),
        ("HT-1110", "Bulb planter, depth marked", "each", 6, 8.95, ""),
        ("HT-1120", "Dibber, hardwood", "each", 12, 3.40, ""),
        ("HT-1130", "Edging iron, half-moon", "each", 2, 24.30, ""),
        ("HT-1140", "Weeding knife", "each", 12, 4.10, ""),
        ("HT-1150", "Folding pruning saw 180 mm", "each", 6, 11.80, ""),
        ("HT-1160", "Garden line and reel, 30 m", "each", 6, 9.25, ""),
    ]),
    ("Garden care", (232, 224, 240), [
        ("GC-4710", "Lawn feed 2.5 kg (80 m²)", "each", 6, 11.90, ""),
        ("GC-4720", "Lawn seed 1 kg, hard-wearing", "each", 6, 13.60, ""),
        ("GC-4730", "Moss killer granules 5 kg", "each", 4, 15.80, ""),
        ("GC-4740", "Multipurpose compost 50 l", "bag", 60, 4.90, "Pallet delivery"),
        ("GC-4750", "Peat-free compost 50 l", "bag", 60, 5.60, "Pallet delivery"),
        ("GC-4760", "Bark mulch 70 l", "bag", 40, 6.30, "Pallet delivery"),
        ("GC-4770", "Bone meal 1.5 kg", "each", 6, 5.20, ""),
        ("GC-4780", "Slow-release fertiliser 1 kg", "each", 6, 8.70, ""),
        ("GC-4790", "Plant supports, galvanised", "pack of 10", 6, 6.40, ""),
        ("GC-4800", "Garden twine 150 m, jute", "each", 12, 2.90, ""),
        ("GC-4810", "Bamboo canes 1.2 m", "pack of 20", 6, 4.80, ""),
        ("GC-4820", "Horticultural fleece 2 × 10 m", "each", 6, 7.90, ""),
    ]),
    ("Pruning & cutting", (243, 224, 200), [
        ("PC-2110", "Bypass secateurs 20 mm", "each", 6, 19.90, ""),
        ("PC-2120", "Bypass secateurs 25 mm, ergonomic", "each", 6, 24.90, ""),
        ("PC-2130", "Anvil secateurs 25 mm", "each", 6, 18.40, ""),
        ("PC-2140", "Flower snips, stainless", "each", 12, 9.60, ""),
        ("PC-2150", "Hedge shears, wavy blade", "each", 2, 29.80, ""),
        ("PC-2160", "Bypass loppers 70 cm", "each", 2, 36.50, ""),
        ("PC-2170", "Anvil loppers 70 cm, ratchet", "each", 2, 42.90, "Last orders 31/03/2027"),
        ("PC-2180", "Telescopic tree pruner 2.4–4 m", "each", 1, 68.00, ""),
        ("PC-2190", "Pruning saw, fixed blade 330 mm", "each", 2, 22.60, ""),
        ("PC-2200", "Grass shears, swivel", "each", 2, 21.40, ""),
        ("PC-2210", "Sharpening stone, dual grit", "each", 12, 5.90, ""),
        ("PC-2220", "Replacement blade for PC-2160", "each", 6, 8.70, ""),
    ]),
    ("Protective wear", (226, 226, 226), [
        ("PW-5010", "Gardening gloves, size 8", "pair", 12, 3.95, ""),
        ("PW-5020", "Gardening gloves, size 9", "pair", 12, 3.95, ""),
        ("PW-5030", "Gardening gloves, size 10", "pair", 12, 3.95, ""),
        ("PW-5040", "Thorn-proof gauntlets", "pair", 6, 9.80, ""),
        ("PW-5050", "Knee pads, foam", "pair", 6, 7.40, ""),
        ("PW-5060", "Kneeler, folding", "each", 4, 14.90, ""),
        ("PW-5070", "Safety glasses, clear", "each", 12, 2.60, ""),
        ("PW-5080", "Ear defenders, SNR 27", "each", 6, 8.20, ""),
        ("PW-5090", "Garden apron, waxed cotton", "each", 4, 18.50, ""),
        ("PW-5100", "Wellington boots, sizes 7–11", "pair", 4, 22.00, ""),
    ]),
]
PW_AFTER_FILL = (250, 208, 160)
STRUCK = "PC-2170"


class PriceList(FPDF):
    def header(self):
        if self.page_no() > 1:
            self.set_font("DejaVu", "", 7)
            self.set_text_color(90)
            self.set_xy(L, 9)
            self.cell(180, 4, "Sample Garden Supply Ltd · Trade Price List 2027", align="R")
            self.set_text_color(0)

    def footer(self):
        self.set_font("DejaVu", "", 6.5)
        self.set_text_color(100)
        self.set_xy(L, 283)
        self.cell(130, 3.5, "Synthetic sample – not a real price list. Sample Garden Supply Ltd is fictional. E&OE.")
        self.set_xy(145, 283)
        self.cell(50, 3.5, f"Page {self.page_no()} of {{nb}}", align="R")
        self.set_text_color(0)


def _groups(after):
    gs = []
    for name, fill, rows in GROUPS:
        rows = list(rows)
        if after:
            if name == "Hand tools":
                rows = [r for r in rows if r[0] != "HT-1150"]
                rows = [(a, d, p, m, 36.80 if a == "HT-1020" else pr, n) for (a, d, p, m, pr, n) in rows]
            if name == "Garden care":
                rows = [r for r in rows if r[0] != "GC-4730"]
            if name == "Pruning & cutting":
                saw = [r for r in GROUPS[1][2] if r[0] == "HT-1150"][0]
                i = [r[0] for r in rows].index("PC-2190")
                rows.insert(i + 1, saw)
                rows = [(a, d, p, m, pr, "Promo £21.90 until 31/03/2027" if a == "PC-2120" else n) for (a, d, p, m, pr, n) in rows]
            if name == "Protective wear":
                fill = PW_AFTER_FILL
        gs.append((name, fill, rows))
    return gs


def build(version):
    after = version == "after"
    pdf = new_pdf(PriceList, format="A4")
    pdf.add_font("DejaVu", "", FONT_DEJAVU)
    pdf.add_font("DejaVu", "B", FONT_DEJAVU_B)
    pdf.set_margins(L, 15, 15)
    pdf.set_auto_page_break(True, margin=18)
    pdf.add_page()

    # logo: leaf made of squares
    pdf.set_fill_color(46, 125, 50)
    for (dx, dy, s) in ((0, 6, 6), (4, 2, 6), (8, 0, 5), (3, 9, 3)):
        pdf.rect(L + dx, 14 + dy, s, s, "F")
    pdf.set_font("DejaVu", "B", 14)
    pdf.set_xy(L + 17, 14)
    pdf.cell(120, 7, "Sample Garden Supply Ltd")
    pdf.set_font("DejaVu", "", 7.5)
    pdf.set_xy(L + 17, 21)
    pdf.cell(120, 4, "Unit 4, Example Trading Estate, Testford TF1 0ZZ · trade@garden-supply.example")
    pdf.set_font("DejaVu", "B", 18)
    pdf.set_xy(L, 34)
    pdf.cell(180, 9, "Trade Price List 2027")
    pdf.set_font("DejaVu", "", 8.5)
    pdf.set_xy(L, 44)
    valid = "01/02/2027" if after else "01/01/2027"
    pdf.cell(180, 5, f"Prices valid from {valid} until further notice. All prices in GBP per pack, excluding VAT.")
    pdf.set_xy(L, 49)
    pdf.cell(180, 5, "Min. qty is the minimum order quantity per item. Synthetic sample – fictional products and prices.")
    pdf.set_y(57)

    pdf.set_font("DejaVu", "", 7.8)
    pdf.set_fill_color(255, 255, 255)
    pdf.set_draw_color(150, 150, 150)
    head = FontFace(emphasis="B", color=255, fill_color=(46, 94, 62))
    with pdf.table(col_widths=(18, 60, 18, 14, 18, 52), width=180, align="LEFT",
                   text_align=("LEFT", "LEFT", "LEFT", "RIGHT", "RIGHT", "LEFT"), line_height=4.4,
                   borders_layout="HORIZONTAL_LINES", headings_style=head, repeat_headings=1,
                   padding=(0.9, 1.2)) as table:
        table.row(["Item no.", "Description", "Pack", "Min. qty", "Price", "Notes"])
        for name, fill, rows in _groups(after):
            r = table.row()
            r.cell(name, colspan=6, style=FontFace(emphasis="B", fill_color=fill))
            for (a, d, p, m, pr, n) in rows:
                r = table.row()
                r.cell(a)
                if after and a == STRUCK:
                    r.cell(d, style=FontFace(emphasis="S"))
                else:
                    r.cell(d)
                r.cell(p)
                r.cell(str(m))
                r.cell(f"£{pr:.2f}")
                r.cell(n)

    pdf.ln(6)
    pdf.set_font("DejaVu", "B", 9)
    pdf.cell(180, 5, "Quantity discounts (per order, goods value excluding VAT)", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("DejaVu", "", 8)
    pdf.set_fill_color(255, 255, 255)
    mid = "−10%" if after else "−8%"
    with pdf.table(col_widths=(50, 25), width=75, align="LEFT", text_align=("LEFT", "RIGHT"), line_height=4.6,
                   borders_layout="ALL", headings_style=FontFace(emphasis="B", fill_color=(235, 235, 235)),
                   padding=(0.8, 1.5)) as t2:
        t2.row(["Order value", "Discount"])
        t2.row(["£250.00 – £999.99", "−5%"])
        t2.row(["£1,000.00 – £2,499.99", mid])
        t2.row(["£2,500.00 and over", "−12%"])
    pdf.ln(4)
    pdf.set_font("DejaVu", "", 7.5)
    pdf.multi_cell(180, 4, "Carriage paid on orders over £250.00 to mainland UK addresses; otherwise £14.50 per order. "
                   "Pallet delivery items are sent on a separate vehicle. Payment terms: 30 days from invoice date.", align="L")
    data = bytes(pdf.output())
    return data, {"pages": pdf.page_no(), "pdf": data}


def _band_rect(data, fill):
    doc = pymupdf.open(stream=data, filetype="pdf")
    want = tuple(round(c / 255, 3) for c in fill)
    for pno, page in enumerate(doc):
        for dr in page.get_drawings():
            f = dr.get("fill")
            if f and tuple(round(c, 3) for c in f) == want:
                r = dr["rect"]
                return pno + 1, [round(r.x0, 1), round(r.y0, 1), round(r.width, 1), round(r.height, 1)]
    raise RuntimeError("band not found")


def _page_of(data, text):
    doc = pymupdf.open(stream=data, filetype="pdf")
    pages = [i + 1 for i, p in enumerate(doc) if p.search_for(text)]
    assert len(pages) == 1, (text, pages)
    return pages[0]


def truth(mb, ma):
    b, a = mb["pdf"], ma["pdf"]
    ob_page, ob_rect = _band_rect(b, GROUPS[4][1])
    nb_page, nb_rect = _band_rect(a, PW_AFTER_FILL)
    return {
        "description": (
            "Two-page UK trade price list for garden products, produced with fpdf2 2.9.0 using its table() API "
            "(horizontal rules, heading row repeated at the top of every page, coloured group bands as colspan rows) and "
            "embedded DejaVu Sans / DejaVu Sans Bold subsets (Identity-H). Prices in £ with two decimals, dd/mm/yyyy dates, "
            "quantity discounts written with U+2212 minus signs (−5%). Edits: validity date, one price, the item HT-1150 "
            "moved from the Hand tools group to the Pruning & cutting group, a promotion note added, one description struck "
            "through (fpdf2 'S' emphasis, drawn as a line over the text), one item deleted, the fill colour of the "
            "Protective wear group band changed from grey to orange, and the middle quantity-discount rate changed. "
            "Consequences not listed: rows between the move source and target shift up by one row and the page breaks "
            "move, so page 1 ends and page 2 starts with different rows; the repeated heading rows stay at the page tops."
        ),
        "synthetic": True,
        "set": "held-out-5",
        "blind": True,
        "truth": [
            {"type": "number", "old": "valid from 01/01/2027", "new": "valid from 01/02/2027", "oldPage": 1, "newPage": 1},
            {"type": "number", "old": "£34.50", "new": "£36.80", "oldPage": 1, "newPage": 1,
             "note": "Price of HT-1020 Border spade, stainless steel."},
            {"type": "move", "old": "HT-1150 Folding pruning saw 180 mm", "new": "HT-1150 Folding pruning saw 180 mm",
             "oldPage": _page_of(b, "HT-1150"), "newPage": _page_of(a, "HT-1150"),
             "note": "Whole table row (each, 6, £11.80) moved from Hand tools (between HT-1140 and HT-1160, page 1) to Pruning & cutting (after PC-2190, page 2); item number and all cells unchanged."},
            {"type": "insert", "new": "Promo £21.90 until 31/03/2027", "newPage": _page_of(a, "Promo £21.90"),
             "note": "New text in the Notes cell of PC-2120 Bypass secateurs 25 mm, ergonomic (price £24.90 unchanged)."},
            {"type": "format", "old": "Anvil loppers 70 cm, ratchet", "new": "Anvil loppers 70 cm, ratchet",
             "oldPage": _page_of(b, "Anvil loppers"), "newPage": _page_of(a, "Anvil loppers"),
             "note": "Description of PC-2170 struck through (fpdf2 strikethrough line); text unchanged."},
            {"type": "delete", "old": "GC-4730 Moss killer granules 5 kg", "oldPage": _page_of(b, "GC-4730"),
             "note": "Whole row (each, 4, £15.80) removed."},
            {"type": "graphic", "oldPage": ob_page, "newPage": nb_page, "oldRect": ob_rect, "newRect": nb_rect,
             "note": "Fill of the 'Protective wear' group band changed from light grey (226,226,226) to orange (250,208,160); band text unchanged."},
            {"type": "number", "old": "−8%", "new": "−10%", "oldPage": _page_of(b, "Quantity discounts"), "newPage": _page_of(a, "Quantity discounts"),
             "note": "Middle quantity-discount band; U+2212 minus sign in both versions."},
        ],
    }

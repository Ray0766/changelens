# SYNTHETIC probe PDFs for fix round 9, area V2-thin-light-lines (fpdf2 2.9,
# as the round-5 cases holdout5-i-pricelist-gbp and
# holdout5-j-audit-annotations; lines drawn over the page content with
# PyMuPDF, as the audit case's reviewer did with annotations).
#
# Two documents, all names and figures invented:
# - "table": a two-page trade price list made with fpdf2's table() API in
#   DejaVu Sans 7.8 pt (horizontal rules, a heading row repeated at each
#   page top, group bands). fpdf2 draws its strikethrough ('S' emphasis) and
#   underline ('U') as filled bars of the font's own thickness: 0.39 and
#   0.34 pt here, 0.6 and 0.5 px at the visual stage's 1.5 px/pt. In the
#   "after" versions a row near the top is deleted, so every later row moves
#   up by 17.6 pt (26.4 px: not a whole number of pixels).
# - "text": a short audit note in Liberation Sans 10 pt (justified
#   paragraphs), with lines drawn over it as page content in a light or
#   mid-tone colour (PyMuPDF draw_line), the text itself unchanged.
#
# Run with a Python that has the fpdf2 (2.9) and pymupdf (2.1) packages:
#   python v2-thin-lines.py <out-dir>
import sys
import pymupdf
from fpdf import FPDF
from fpdf.fonts import FontFace

OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
DEJAVU = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
DEJAVU_B = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
LIB = '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'

GROUPS = [
    ('Hand tools', [
        ('HT-1010', 'Digging spade, carbon steel', 'each', '6', '28.90', ''),
        ('HT-1020', 'Border spade, stainless steel', 'each', '6', '34.50', ''),
        ('HT-1030', 'Garden fork, four tines', 'each', '6', '26.40', ''),
        ('HT-1040', 'Hand trowel, ash handle', 'each', '12', '7.20', ''),
        ('HT-1050', 'Hand fork, ash handle', 'each', '12', '7.20', ''),
        ('HT-1060', 'Dutch hoe, long handle', 'each', '6', '18.60', ''),
        ('HT-1070', 'Soil rake, fourteen teeth', 'each', '6', '17.90', ''),
        ('HT-1080', 'Lawn rake, spring tines', 'each', '6', '15.40', ''),
        ('HT-1090', 'Edging iron, half moon', 'each', '6', '21.30', ''),
        ('HT-1100', 'Dibber, steel tip', 'each', '12', '6.80', ''),
    ]),
    ('Pruning & cutting', [
        ('PC-2110', 'Bypass secateurs 20 mm', 'each', '12', '19.90', ''),
        ('PC-2120', 'Bypass secateurs 25 mm, ergonomic', 'each', '12', '24.90', ''),
        ('PC-2130', 'Anvil secateurs 22 mm', 'each', '12', '18.40', ''),
        ('PC-2140', 'Hedge shears 230 mm', 'each', '6', '27.60', ''),
        ('PC-2150', 'Topiary shears 150 mm', 'each', '6', '22.10', ''),
        ('PC-2160', 'Bypass loppers 70 cm', 'each', '6', '33.80', ''),
        ('PC-2170', 'Anvil loppers 70 cm, ratchet', 'each', '6', '39.50', ''),
        ('PC-2180', 'Pruning saw 240 mm', 'each', '6', '16.70', ''),
        ('PC-2190', 'Bow saw 530 mm', 'each', '6', '14.20', ''),
        ('PC-2200', 'Tree pruner, telescopic', 'each', '4', '58.00', ''),
        ('PC-2210', 'Sharpening stone', 'each', '12', '5.60', ''),
        ('PC-2220', 'Replacement blade for PC-2160', 'each', '6', '8.70', ''),
    ]),
    ('Watering', [
        ('WA-3010', 'Watering can 10 l, rose', 'each', '6', '12.80', ''),
        ('WA-3020', 'Hose 25 m, reinforced', 'each', '4', '29.50', ''),
        ('WA-3030', 'Hose reel, wall mounted', 'each', '4', '36.90', ''),
        ('WA-3040', 'Spray gun, seven patterns', 'each', '12', '9.40', ''),
        ('WA-3050', 'Oscillating sprinkler', 'each', '6', '19.80', ''),
        ('WA-3060', 'Soaker hose 15 m', 'each', '6', '13.60', ''),
        ('WA-3070', 'Water butt 210 l', 'each', '2', '54.00', ''),
        ('WA-3080', 'Drip kit, twenty plants', 'kit', '4', '24.30', ''),
    ]),
    ('Compost & soil', [
        ('GC-4710', 'Peat-free compost 50 l bag', 'bag', '60', '6.90', 'Pallet delivery'),
        ('GC-4720', 'Topsoil 25 l bag', 'bag', '60', '4.20', 'Pallet delivery'),
        ('GC-4730', 'Moss killer granules 5 kg', 'each', '4', '15.80', ''),
        ('GC-4740', 'Multipurpose compost 50 l bag', 'bag', '60', '4.90', 'Pallet delivery'),
        ('GC-4750', 'Bark mulch 60 l bag', 'bag', '40', '7.40', 'Pallet delivery'),
        ('GC-4760', 'Grit, horticultural 20 kg', 'bag', '40', '5.30', ''),
        ('GC-4770', 'Seed compost 20 l', 'bag', '40', '5.90', ''),
        ('GC-4780', 'Lawn feed 2.5 kg', 'each', '12', '11.20', ''),
    ]),
]

BANDS = {'Hand tools': (226, 226, 226), 'Pruning & cutting': (226, 226, 226), 'Watering': (226, 226, 226), 'Compost & soil': (226, 226, 226)}


def table_pdf(path, drop=None, emph=None, edit=None, stripes=False):
    """emph: {item: (cell index, 'S' | 'U', words or None for the whole cell)}; edit: {item: (cell index, text)}."""
    pdf = FPDF(format='A4')
    pdf.set_title('Trade price list (SYNTHETIC probe)')
    pdf.set_creator('ChangeLens fix-9 probe generator (SYNTHETIC)')
    pdf.add_font('DejaVu', '', DEJAVU)
    pdf.add_font('DejaVu', 'B', DEJAVU_B)
    pdf.set_margins(15, 12, 15)
    pdf.set_auto_page_break(True, 15)
    pdf.add_page()
    pdf.set_font('DejaVu', 'B', 12)
    pdf.cell(0, 8, 'SYNTHETIC probe: trade price list 2027', new_x='LMARGIN', new_y='NEXT')
    pdf.set_font('DejaVu', '', 7.8)
    pdf.cell(0, 6, 'Prices in GBP excluding VAT, valid from 01/02/2027. All items and prices are invented.', new_x='LMARGIN', new_y='NEXT')
    pdf.ln(2)
    pdf.set_draw_color(150)
    emph = emph or {}
    edit = edit or {}
    with pdf.table(
        col_widths=(18, 66, 14, 10, 16, 30),
        borders_layout='HORIZONTAL_LINES',
        line_height=4.0,
        padding=(1.1, 1.5),
        text_align=('LEFT', 'LEFT', 'LEFT', 'RIGHT', 'RIGHT', 'LEFT'),
        headings_style=FontFace(emphasis='B'),
        repeat_headings=1,
    ) as t:
        head = t.row()
        for h in ('Item', 'Description', 'Unit', 'Qty', 'Price £', 'Notes'):
            head.cell(h)
        n = 0
        for group, rows in GROUPS:
            band = t.row()
            band.cell(group, colspan=6, style=FontFace(emphasis='B', fill_color=BANDS[group]))
            for row in rows:
                if row[0] == drop:
                    continue
                n += 1
                r = t.row()
                fill = (236, 242, 250) if stripes and n % 2 == 0 else None
                for k, v in enumerate(row):
                    if row[0] in edit and edit[row[0]][0] == k:
                        v = edit[row[0]][1]
                    style = FontFace(fill_color=fill) if fill else None
                    if row[0] in emph and emph[row[0]][0] == k:
                        style = FontFace(emphasis=emph[row[0]][1], fill_color=fill)
                    r.cell(v, style=style)
    pdf.output(path)


TEXT = [
    'Audit summary',
    'The supplier was audited on site over two days. The scope covered goods receipt, calibration of measuring equipment, storage of finished parts and the handling of customer complaints. The audit team reviewed records for the last twelve months and interviewed staff on both shifts.',
    'Calibration records for two torque wrenches were missing for three weeks in March. The wrenches were recalibrated during the audit and found within tolerance. The finding is considered minor. The supplier will add a reminder to its maintenance plan.',
    'Corrective actions',
    'The supplier shall submit a corrective action plan within 30 days of receiving this report. The plan shall name an owner and a target date for each action, and the supplier shall confirm closure in writing.',
    'The next audit is planned for October 2027. It will cover the same scope, with a closer look at the storage of parts that are sensitive to humidity.',
]


def text_pdf(path):
    pdf = FPDF(format='A4')
    pdf.set_title('Supplier audit note (SYNTHETIC probe)')
    pdf.set_creator('ChangeLens fix-9 probe generator (SYNTHETIC)')
    pdf.add_font('Liberation', '', LIB)
    pdf.set_margins(20, 20, 20)
    pdf.add_page()
    pdf.set_font('Liberation', '', 14)
    pdf.cell(0, 10, 'SYNTHETIC probe: supplier audit note', new_x='LMARGIN', new_y='NEXT')
    for k, p in enumerate(TEXT):
        if k in (0, 3):
            pdf.ln(3)
            pdf.set_font('Liberation', '', 12)
            pdf.cell(0, 8, p, new_x='LMARGIN', new_y='NEXT')
        else:
            pdf.set_font('Liberation', '', 10)
            pdf.multi_cell(0, 5.3, p, align='J', new_x='LMARGIN', new_y='NEXT')
            pdf.ln(2)
    pdf.output(path)


def words_of(page, phrase):
    """The word boxes (PyMuPDF) of the first occurrence of `phrase`, by line."""
    words = page.get_text('words')
    want = phrase.split()
    for i in range(len(words) - len(want) + 1):
        if [w[4].strip('.,') for w in words[i:i + len(want)]] == [w.strip('.,') for w in want]:
            lines = {}
            for w in words[i:i + len(want)]:
                lines.setdefault((w[5], w[6]), []).append(w)
            return list(lines.values())
    raise ValueError(phrase)


def draw(src, path, marks):
    """marks: (phrase, 'strike' | 'underline', rgb 0-1, width pt)."""
    doc = pymupdf.open(src)
    page = doc[0]
    for phrase, kind, colour, width in marks:
        for line in words_of(page, phrase):
            x0, x1 = line[0][0], line[-1][2]
            y0, y1 = line[0][1], line[0][3]
            # PyMuPDF word boxes span ascent to descent; Liberation Sans 10 pt:
            # a strike at 0.62 of the box (mid x-height), an underline at 0.84.
            y = y0 + (y1 - y0) * (0.62 if kind == 'strike' else 0.84)
            page.draw_line((x0, y), (x1, y), color=colour, width=width)
    doc.set_metadata({'title': 'Supplier audit note (SYNTHETIC probe, marked)', 'creator': 'ChangeLens fix-9 probe generator (SYNTHETIC)'})
    doc.save(path, garbage=3, deflate=True)


P = OUT + '/probe9-V2-thin-'
# Table: before, and after with a row deleted above (re-flow by 26.4 px).
table_pdf(P + 'table-before.pdf')
table_pdf(P + 'table-reflow.pdf', drop='HT-1030')
table_pdf(P + 'table-strike.pdf', drop='HT-1030', emph={'PC-2170': (1, 'S')})
table_pdf(P + 'table-strike-one.pdf', drop='HT-1030', emph={'PC-2210': (1, 'S')}, edit={'PC-2210': (1, 'Whetstone')})
table_pdf(P + 'table-one-before.pdf', edit={'PC-2210': (1, 'Whetstone')})
table_pdf(P + 'table-ul.pdf', drop='HT-1030', emph={'PC-2170': (1, 'U')})
table_pdf(P + 'table-strike-still.pdf', emph={'PC-2170': (1, 'S')})
table_pdf(P + 'table-strike-edit.pdf', drop='HT-1030', emph={'PC-2170': (1, 'S')}, edit={'PC-2180': (1, 'Pruning saw 260 mm'), 'PC-2170': (4, '41.50')})
table_pdf(P + 'table-stripes-before.pdf', stripes=True)
table_pdf(P + 'table-stripes-reflow.pdf', drop='HT-1030', stripes=True)
table_pdf(P + 'table-stripes-strike.pdf', drop='HT-1030', stripes=True, emph={'PC-2170': (1, 'S')})

# Text: lines drawn over unchanged text.
text_pdf(P + 'text-before.pdf')
T = P + 'text-before.pdf'
GREEN, RED = (0, 1, 0), (1, 0, 0)
draw(T, P + 'text-green-ul.pdf', [('within 30 days of receiving this report', 'underline', GREEN, 0.73)])
draw(T, P + 'text-red-strike.pdf', [('The finding is considered minor.', 'strike', RED, 0.73)])
draw(T, P + 'text-midtone.pdf', [
    ('two torque wrenches', 'strike', (0.5, 0.5, 0.5), 0.8),
    ('found within tolerance', 'strike', (0.5, 0.5, 0.5), 1.5),
    ('goods receipt', 'strike', (0x20 / 255, 0x50 / 255, 0xc0 / 255), 0.8),
    ('customer complaints', 'strike', (0, 0x80 / 255, 0), 0.8),
])
draw(T, P + 'text-yellow.pdf', [('storage of finished parts', 'strike', (1, 1, 0), 0.8), ('target date', 'underline', (1, 0.9, 0.2), 0.73)])
# One word each: mid-blue and green strikes at 0.8 pt (found since the lines
# are measured on the lowest channel), grey at 0.8 and 1.5 pt (too light on
# one word to tell: counted as compared in part).
draw(T, P + 'text-midtone-one.pdf', [
    ('audited', 'strike', (0x20 / 255, 0x50 / 255, 0xc0 / 255), 0.8),
    ('twelve', 'strike', (0, 0x80 / 255, 0), 0.8),
    ('interviewed', 'strike', (0.5, 0.5, 0.5), 0.8),
    ('humidity.', 'strike', (0.5, 0.5, 0.5), 1.5),
])

# SYNTHETIC probe PDFs for fix round 9, area V2-thin-light-lines, second
# pass (after the verifier's counter-probes). fpdf2 2.9 for the text and
# tables, PyMuPDF 2.1 for fills and lines drawn over the page content.
#
# - "hl": the audit note of v2-thin-lines.py with three phrases on a
#   highlighter's fill in both versions (pure yellow, bright green, cyan,
#   drawn behind the text); in the "marks" versions a black 1 pt strike, a
#   black 0.75 pt underline and a red 0.5 pt strike over them. "shift":
#   all text and fills 10.5 px lower (7 pt), as after a re-flow.
# - "fill": the trade price list of v2-thin-lines.py with every body row
#   filled (#fff2cc, an Office tint, and grey 208); in "U" PC-2170's
#   description has fpdf2's underline (a 0.34 pt bar); "reflow" deletes a
#   row above it.
# - "recol": the audit note with "finished" in red (200, 0, 0) in the
#   after versions, and a grey 0.8 pt strike, a #00ff00 0.73 pt underline
#   or a yellow 0.8 pt strike over "storage of finished parts"; "plain":
#   the grey strike without the recolour; "same": "finished" red and struck
#   in the same red (a word given the line's colour with it).
# - "arrow": a black 0.8 pt strike over one word, a red arrow (a stroke and
#   a head, drawn as page content) after it at the strike's height.
# - "were": "two" changed to "three", and a grey 0.8 pt strike over "three
#   torque wrenches were missing".
# - "wm": a grey "DRAFT" watermark turned 45° over the text, at 35 %
#   opacity, and in "wm-faint" at 15 % (nothing else changed).
#
# Run with a Python that has the fpdf2 (2.9) and pymupdf (2.1) packages:
#   python v2-thin-lines-refix.py <out-dir>
import sys
import pymupdf
from fpdf import FPDF
from fpdf.fonts import FontFace

OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
DEJAVU = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
DEJAVU_B = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
LIB = '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'
CREATOR = 'ChangeLens fix-9 probe generator (SYNTHETIC)'

TEXT = [
    'Audit summary',
    'The supplier was audited on site over two days. The scope covered goods receipt, calibration of measuring equipment, storage of finished parts and the handling of customer complaints. The audit team reviewed records for the last twelve months and interviewed staff on both shifts.',
    'Calibration records for two torque wrenches were missing for three weeks in March. The wrenches were recalibrated during the audit and found within tolerance. The finding is considered minor. The supplier will add a reminder to its maintenance plan.',
    'Corrective actions',
    'The supplier shall submit a corrective action plan within 30 days of receiving this report. The plan shall name an owner and a target date for each action, and the supplier shall confirm closure in writing.',
    'The next audit is planned for October 2027. It will cover the same scope, with a closer look at the storage of parts that are sensitive to humidity.',
]


def text_pdf(path, shift=0.0, colour=None, subs=None):
    """shift: points the text starts lower; colour: (word, rgb 0-255) set in that colour in the 2nd paragraph;
    subs: {old: new} text replacements."""
    pdf = FPDF(format='A4', unit='pt')
    pdf.set_title('Supplier audit note (SYNTHETIC probe)')
    pdf.set_creator(CREATOR)
    pdf.add_font('Liberation', '', LIB)
    pdf.set_margins(56.7, 56.7, 56.7)
    pdf.add_page()
    pdf.set_y(56.7 + shift)
    pdf.set_font('Liberation', '', 14)
    pdf.cell(0, 28, 'SYNTHETIC probe: supplier audit note', new_x='LMARGIN', new_y='NEXT')
    for k, p in enumerate(TEXT):
        for o, n in (subs or {}).items():
            p = p.replace(o, n)
        if k in (0, 3):
            pdf.ln(8)
            pdf.set_font('Liberation', '', 12)
            pdf.cell(0, 22, p, new_x='LMARGIN', new_y='NEXT')
            continue
        pdf.set_font('Liberation', '', 10)
        if colour and colour[0] in p:
            # Written word by word (fpdf2 has no inline colour in multi_cell).
            pre, post = p.split(colour[0], 1)
            pdf.write(15, pre)
            pdf.set_text_color(*colour[1])
            pdf.write(15, colour[0])
            pdf.set_text_color(0, 0, 0)
            pdf.write(15, post)
            pdf.ln(15)
        else:
            pdf.multi_cell(0, 15, p, align='J', new_x='LMARGIN', new_y='NEXT')
        pdf.ln(6)
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


def watermark(src, path, opacity):
    doc = pymupdf.open(src)
    page = doc[0]
    page.insert_text((150, 520), 'DRAFT', fontsize=130, fontname='helv', color=(0.53, 0.53, 0.53),
                     fill_opacity=opacity, morph=(pymupdf.Point(150, 520), pymupdf.Matrix(45)))
    doc.set_metadata({'title': 'Supplier audit note (SYNTHETIC probe, watermark)', 'creator': CREATOR})
    doc.save(path, garbage=3, deflate=True)


def mark(src, path, fills=(), lines=(), arrows=()):
    """fills: (phrase, rgb 0-1) drawn behind the text; lines: (phrase, 'strike' | 'underline', rgb, width);
    arrows: (phrase, rgb, width) a stroke 14 pt long from 2 pt after the phrase, at a strike's height, with a head."""
    doc = pymupdf.open(src)
    page = doc[0]
    for phrase, colour in fills:
        for line in words_of(page, phrase):
            r = pymupdf.Rect(line[0][0] - 0.5, line[0][1], line[-1][2] + 0.5, line[0][3])
            page.draw_rect(r, color=None, fill=colour, overlay=False)
    for phrase, kind, colour, width in lines:
        for line in words_of(page, phrase):
            x0, x1 = line[0][0], line[-1][2]
            y0, y1 = line[0][1], line[0][3]
            y = y0 + (y1 - y0) * (0.62 if kind == 'strike' else 0.84)
            page.draw_line((x0, y), (x1, y), color=colour, width=width)
    for phrase, colour, width in arrows:
        line = words_of(page, phrase)[-1]
        x, y0, y1 = line[-1][2] + 2, line[0][1], line[0][3]
        y = y0 + (y1 - y0) * 0.62
        page.draw_line((x, y), (x + 14, y), color=colour, width=width)
        page.draw_polyline([(x + 10, y - 3), (x + 14, y), (x + 10, y + 3)], color=colour, width=width)
    doc.set_metadata({'title': 'Supplier audit note (SYNTHETIC probe, marked)', 'creator': CREATOR})
    doc.save(path, garbage=3, deflate=True)


GROUPS = [
    ('Hand tools', [
        ('HT-1010', 'Digging spade, carbon steel', 'each', '6', '28.90', ''),
        ('HT-1020', 'Border spade, stainless steel', 'each', '6', '34.50', ''),
        ('HT-1030', 'Garden fork, four tines', 'each', '6', '26.40', ''),
        ('HT-1040', 'Hand trowel, ash handle', 'each', '12', '7.20', ''),
        ('HT-1050', 'Hand fork, ash handle', 'each', '12', '7.20', ''),
        ('HT-1060', 'Dutch hoe, long handle', 'each', '6', '18.60', ''),
    ]),
    ('Pruning & cutting', [
        ('PC-2110', 'Bypass secateurs 20 mm', 'each', '12', '19.90', ''),
        ('PC-2120', 'Bypass secateurs 25 mm, ergonomic', 'each', '12', '24.90', ''),
        ('PC-2160', 'Bypass loppers 70 cm', 'each', '6', '33.80', ''),
        ('PC-2170', 'Anvil loppers 70 cm, ratchet', 'each', '6', '39.50', ''),
        ('PC-2180', 'Pruning saw 240 mm', 'each', '6', '16.70', ''),
        ('PC-2210', 'Sharpening stone', 'each', '12', '5.60', ''),
    ]),
]


def table_pdf(path, fill, drop=None, emph=None):
    """fill: rgb 0-255 of every body row; emph: {item: (cell index, 'S' | 'U')}."""
    pdf = FPDF(format='A4')
    pdf.set_title('Trade price list (SYNTHETIC probe)')
    pdf.set_creator(CREATOR)
    pdf.add_font('DejaVu', '', DEJAVU)
    pdf.add_font('DejaVu', 'B', DEJAVU_B)
    pdf.set_margins(15, 12, 15)
    pdf.add_page()
    pdf.set_font('DejaVu', 'B', 12)
    pdf.cell(0, 8, 'SYNTHETIC probe: trade price list 2027', new_x='LMARGIN', new_y='NEXT')
    pdf.set_font('DejaVu', '', 7.8)
    pdf.cell(0, 6, 'Prices in GBP excluding VAT. All items and prices are invented.', new_x='LMARGIN', new_y='NEXT')
    pdf.ln(2)
    pdf.set_draw_color(150)
    emph = emph or {}
    with pdf.table(
        col_widths=(18, 66, 14, 10, 16, 30),
        borders_layout='HORIZONTAL_LINES',
        line_height=4.0,
        padding=(1.1, 1.5),
        text_align=('LEFT', 'LEFT', 'LEFT', 'RIGHT', 'RIGHT', 'LEFT'),
        headings_style=FontFace(emphasis='B'),
    ) as t:
        head = t.row()
        for h in ('Item', 'Description', 'Unit', 'Qty', 'Price £', 'Notes'):
            head.cell(h)
        for group, rows in GROUPS:
            band = t.row()
            band.cell(group, colspan=6, style=FontFace(emphasis='B', fill_color=(226, 226, 226)))
            for row in rows:
                if row[0] == drop:
                    continue
                r = t.row()
                for k, v in enumerate(row):
                    style = FontFace(fill_color=fill)
                    if row[0] in emph and emph[row[0]][0] == k:
                        style = FontFace(emphasis=emph[row[0]][1], fill_color=fill)
                    r.cell(v, style=style)
    pdf.output(path)


P = OUT + '/probe9-V2-refix-'
YELLOW, GREEN, CYAN, RED, BLACK = (1, 1, 0), (0, 1, 0), (0, 1, 1), (1, 0, 0), (0, 0, 0)

# Highlights in both versions; lines over them in "marks".
HL = [('storage of finished parts', YELLOW), ('within 30 days', GREEN), ('target date', CYAN)]
MARKS = [('storage of finished parts', 'strike', BLACK, 1.0), ('within 30 days', 'underline', BLACK, 0.75), ('target date', 'strike', RED, 0.5)]
for tag, shift in (('', 0.0), ('shift-', 7.0)):
    text_pdf(P + f'hl-{tag}text.pdf', shift)
    mark(P + f'hl-{tag}text.pdf', P + f'hl-{tag}before.pdf', fills=HL)
    mark(P + f'hl-{tag}text.pdf', P + f'hl-{tag}marks.pdf', fills=HL, lines=MARKS)

# Every body row filled; an fpdf2 underline on one row.
for name, fill in (('yel', (255, 242, 204)), ('g208', (208, 208, 208))):
    table_pdf(P + f'fill-{name}-before.pdf', fill)
    table_pdf(P + f'fill-{name}-U.pdf', fill, emph={'PC-2170': (1, 'U')})
    table_pdf(P + f'fill-{name}-reflow.pdf', fill, drop='HT-1030')
    table_pdf(P + f'fill-{name}-reflow-U.pdf', fill, drop='HT-1030', emph={'PC-2170': (1, 'U')})

# A recoloured word under a line drawn over its phrase.
text_pdf(P + 'recol-before.pdf')
text_pdf(P + 'recol-text.pdf', colour=('finished', (200, 0, 0)))
PH = 'storage of finished parts'
mark(P + 'recol-text.pdf', P + 'recol-grey.pdf', lines=[(PH, 'strike', (0.5, 0.5, 0.5), 0.8)])
mark(P + 'recol-text.pdf', P + 'recol-green.pdf', lines=[(PH, 'underline', GREEN, 0.73)])
mark(P + 'recol-text.pdf', P + 'recol-yellow.pdf', lines=[(PH, 'strike', YELLOW, 0.8)])
mark(P + 'recol-before.pdf', P + 'recol-plain.pdf', lines=[(PH, 'strike', (0.5, 0.5, 0.5), 0.8)])
mark(P + 'recol-text.pdf', P + 'recol-same.pdf', lines=[('finished', 'strike', (200 / 255, 0, 0), 0.8)])

# A red arrow after a struck word, at the strike's height.
mark(P + 'recol-before.pdf', P + 'arrow.pdf', lines=[('interviewed', 'strike', BLACK, 0.8)], arrows=[('interviewed', RED, 0.8)])
mark(P + 'recol-before.pdf', P + 'arrow-ctrl.pdf', lines=[('interviewed', 'strike', BLACK, 0.8)])

# A strike next to a text edit.
text_pdf(P + 'were-text.pdf', subs={'two torque wrenches': 'three torque wrenches'})
mark(P + 'were-text.pdf', P + 'were.pdf', lines=[('three torque wrenches were missing', 'strike', (0.5, 0.5, 0.5), 0.8)])

# A watermark made lighter, nothing else changed.
watermark(P + 'recol-before.pdf', P + 'wm.pdf', 0.35)
watermark(P + 'recol-before.pdf', P + 'wm-faint.pdf', 0.15)

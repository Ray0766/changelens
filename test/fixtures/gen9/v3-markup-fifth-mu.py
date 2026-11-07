# Fix round 9, fifth pass: generator of the second verifier of the visual fourth pass, kept as written.
# Run in this order: v3-markup-fifth-fp.py OUT, -mu.py OUT, -pp.py OUT (and -size.py OUT); the fixtures
# test/fixtures/probe9-V3-fifth-SYNTHETIC-<name>.pdf are OUT/SYNTHETIC-<name>.pdf renamed.
# SYNTHETIC: PyMuPDF 2.1 highlight annotations (multiply blend) on the fpdf2 inspection list.
# hl-<content>-<hl>: content variant <content> (base, dot-orange, ...) with highlight <hl>:
#   Y  = opaque yellow over the row (text, dot and bar),
#   Y50 / Y40 = yellow at opacity 0.5 / 0.4, G = opaque green (0.6, 1, 0.4).
import sys, json, pymupdf
OUT = sys.argv[1]
geo = json.load(open(f'{OUT}/hl-geo.json'))
HL = {'Y': ((1, 1, 0), 1.0), 'Y50': ((1, 1, 0), 0.5), 'Y40': ((1, 1, 0), 0.4), 'G': ((0.6, 1, 0.4), 1.0)}
def add(content, rows, hl):
    doc = pymupdf.open(f'{OUT}/SYNTHETIC-hl-{content}.pdf'); p = doc[0]
    colour, alpha = HL[hl]
    for r in rows:
        g = geo[r]
        rect = pymupdf.Rect(g['x0'], g['base'] - 10.5, g['x1'], g['base'] + 3.0)
        a = p.add_highlight_annot(rect)
        a.set_colors(stroke=colour)
        if alpha < 1: a.set_opacity(alpha)
        a.update()
    doc.set_metadata({'title': 'Inspection list (SYNTHETIC probe, highlight)'})
    doc.save(f'{OUT}/SYNTHETIC-hl-{content}-{hl}.pdf', garbage=3, deflate=True)
for hl in ('Y', 'Y40'):
    add('base', [0, 2], hl)
    add('dot-orange', [0], hl)
    add('dot-green', [0], hl)
    add('bar-darker', [2], hl)
    add('bar-lighter', [2], hl)
add('base', [0], 'G')
add('dot-orange', [0], 'G')
for hl in ('Y', 'Y50'):
    add('base', [3, 4, 5], hl)
    add('ink-red', [3], hl)
    add('ink-navy', [4], hl)
    add('ink-grey', [5], hl)
print('ok')

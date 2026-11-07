# Fix round 9, fifth pass: generator of the second verifier of the visual fourth pass, kept as written.
# Run in this order: v3-markup-fifth-fp.py OUT, -mu.py OUT, -pp.py OUT (and -size.py OUT); the fixtures
# test/fixtures/probe9-V3-fifth-SYNTHETIC-<name>.pdf are OUT/SYNTHETIC-<name>.pdf renamed.
# SYNTHETIC: pypdf 6 highlight annotations with no appearance stream (the viewer draws them)
# on the fpdf2 inspection list: yellow over row 0 (dot) and row 3 (text).
import sys, json
from pypdf import PdfReader, PdfWriter
from pypdf.annotations import Highlight
from pypdf.generic import ArrayObject, FloatObject
OUT = sys.argv[1]
geo = json.load(open(f'{OUT}/hl-geo.json'))
H = 841.89
def add(content, rows, name):
    w = PdfWriter(clone_from=PdfReader(f'{OUT}/SYNTHETIC-hl-{content}.pdf'))
    for r in rows:
        g = geo[r]
        x0, x1 = g['x0'], g['x1']
        y0, y1 = H - (g['base'] + 3.0), H - (g['base'] - 10.5)
        quad = ArrayObject([FloatObject(v) for v in (x0, y1, x1, y1, x0, y0, x1, y0)])
        a = Highlight(rect=(x0, y0, x1, y1), quad_points=quad, highlight_color='ffff00')
        w.add_annotation(page_number=0, annotation=a)
    w.add_metadata({'/Title': 'Inspection list (SYNTHETIC probe, pypdf highlight)'})
    w.write(f'{OUT}/SYNTHETIC-hl-{content}-{name}.pdf')
add('base', [0, 3], 'PP')
add('dot-orange', [0], 'PP')
add('ink-red', [3], 'PP')
print('ok')

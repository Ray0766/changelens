# Fix round 9, fifth pass: generator of the second verifier of the visual fourth pass, kept as written.
# The fixtures test/fixtures/probe9-V1-fifth-SYNTHETIC-rl-zw-*.pdf are OUT/SYNTHETIC-rl-zw-*.pdf (-rl.py: 'OUT build'
# with reportlab, then 'OUT mark' with PyMuPDF); -ty-yellow-25.pdf is OUT/SYNTHETIC-ty-ser-yellow-25.pdf (-typ.py, then -series.py).
# SYNTHETIC counter-probes for the closing-rule fold (second verification of the
# visual fourth pass). Base: the Typst 0.15 table of test/fixtures/gen9/v1-closing-rules.py
# ("before": the table breaks after January at the foot of page 1; "after": a paragraph
# inserted above moves the whole table to page 2). Marks drawn with PyMuPDF 2.1.
# Controls: the last row in red text, and the whole table in blue, in both versions.
import sys, importlib.util
OUT = sys.argv[1]
spec = importlib.util.spec_from_file_location('g', '/home/user/cl-fix9-visual/test/fixtures/gen9/v1-closing-rules.py')
g = importlib.util.module_from_spec(spec)
sys.argv = ['x', OUT]
spec.loader.exec_module(g)
import pymupdf

GAP = 450
def build(name, src):
    path = f'{OUT}/SYNTHETIC-ty-{name}.pdf'
    with open(path, 'wb') as f:
        f.write(g.typst.compile(src.encode('utf-8')))
    return path

def overlay(src, name, draw):
    doc = pymupdf.open(src)
    pg = doc[0]
    r = g.closing_rule(src)
    draw(pg, r)
    doc.set_metadata({'title': 'Monthly network figures (SYNTHETIC probe, mark)'})
    doc.save(f'{OUT}/SYNTHETIC-ty-{name}.pdf', garbage=3, deflate=True, no_new_id=True)

before = build('before', g.source(False, gap=GAP))
build('after', g.source(True, gap=GAP))
PALE = (1.0, 0.7, 0.4)      # pale orange, luminance about 192
LGREY = (0.72, 0.72, 0.72)  # light grey
K = (0, 0, 0)
# E1: pale-orange dash 20 pt, 0.8 pt, 2.5 pt and 3 pt below the rule
overlay(before, 'pale-dash25', lambda pg, r: pg.draw_line((300, r.y0 + 2.5), (320, r.y0 + 2.5), color=PALE, width=0.8))
overlay(before, 'pale-dash30', lambda pg, r: pg.draw_line((300, r.y0 + 3.0), (320, r.y0 + 3.0), color=PALE, width=0.8))
# E2: light-grey tick 3 pt tall across the rule, 0.6 pt
overlay(before, 'lgrey-tick3', lambda pg, r: pg.draw_line((310, r.y0 - 1.5), (310, r.y0 + 1.5), color=LGREY, width=0.6))
# E3: black tick hanging 2.5 pt below the rule only, 0.5 pt
overlay(before, 'hang25', lambda pg, r: pg.draw_line((310, r.y0 + 0.3), (310, r.y0 + 2.8), color=K, width=0.5))
# E4: black dot 1.2 pt across, 2.2 pt below the rule
overlay(before, 'dot22', lambda pg, r: pg.draw_circle((330, r.y0 + 2.2), 0.6, color=None, fill=K))
# E5: a blue 0.5 pt dash 2.2 pt below the rule, 12 pt long
overlay(before, 'blue-dash22', lambda pg, r: pg.draw_line((250, r.y0 + 2.2), (262, r.y0 + 2.2), color=(0.1, 0.3, 0.9), width=0.5))
# Controls (no change but the move): last row in red in both versions; the table in blue in both.
on_last = lambda f: (lambda r, k, v: f(v) if r == 0 else v)
build('redrow-before', g.source(False, gap=GAP, cell=on_last(lambda v: f'#text(fill: rgb("#c00000"))[{v}]')))
build('redrow-after', g.source(True, gap=GAP, cell=on_last(lambda v: f'#text(fill: rgb("#c00000"))[{v}]')))
blue = lambda r, k, v: f'#text(fill: rgb("#1f4fbf"))[{v}]'
build('blue-before', g.source(False, gap=GAP, cell=blue))
build('blue-after', g.source(True, gap=GAP, cell=blue))
# E6: with the red last row, a red 0.5 pt dash 2.5 pt below the rule (mark the colour of the text)
overlay(f'{OUT}/SYNTHETIC-ty-redrow-before.pdf', 'redrow-dash25', lambda pg, r: pg.draw_line((300, r.y0 + 2.5), (316, r.y0 + 2.5), color=(0.75, 0, 0), width=0.5))
print('ok')

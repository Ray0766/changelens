# Fix round 9, fifth pass: generator of the second verifier of the visual fourth pass, kept as written.
# The fixtures test/fixtures/probe9-V1-fifth-SYNTHETIC-rl-zw-*.pdf are OUT/SYNTHETIC-rl-zw-*.pdf (-rl.py: 'OUT build'
# with reportlab, then 'OUT mark' with PyMuPDF); -ty-yellow-25.pdf is OUT/SYNTHETIC-ty-ser-yellow-25.pdf (-typ.py, then -series.py).
# SYNTHETIC: a lightness series of 20 pt dashes 2.5 pt below the folded closing rule of the
# Typst table (SYNTHETIC-ty-before.pdf from cr_typ.py), drawn with PyMuPDF 2.1.
import sys, pymupdf
OUT = sys.argv[1]
src = f'{OUT}/SYNTHETIC-ty-before.pdf'
def rule(path):
    pg = pymupdf.open(path)[0]
    rs = [d for d in pg.get_drawings() if abs((d.get('width') or 0) - 0.9) < 0.01 and d['rect'].height < 0.5]
    return max(rs, key=lambda d: d['rect'].y0)['rect']
r = rule(src)
S = {'g50w5': ((0.5,) * 3, 0.5), 'g60w5': ((0.6,) * 3, 0.5), 'g70w5': ((0.7,) * 3, 0.5), 'g60w8': ((0.6,) * 3, 0.8), 'g75w8': ((0.75,) * 3, 0.8),
     'lblue': ((0.4, 0.67, 1.0), 0.8), 'yellow': ((1.0, 0.85, 0.0), 0.8), 'pink': ((1.0, 0.55, 0.7), 0.8), 'k03': ((0, 0, 0), 0.3), 'red05': ((0.9, 0.1, 0.1), 0.5)}
for name, (col, w) in S.items():
    for off in (2.5, 4.0):
        d = pymupdf.open(src); pg = d[0]
        pg.draw_line((300, r.y0 + off), (320, r.y0 + off), color=col, width=w)
        d.set_metadata({'title': 'Monthly network figures (SYNTHETIC probe, mark)'})
        d.save(f'{OUT}/SYNTHETIC-ty-ser-{name}-{int(off*10)}.pdf', garbage=3, deflate=True, no_new_id=True)
print('ok')

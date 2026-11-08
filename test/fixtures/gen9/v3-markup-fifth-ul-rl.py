# Fix round 9, fifth pass: generator of the second verifier of the visual fourth pass, kept as written.
# Run v3-markup-fifth-ul-rl.py OUT, then v3-markup-fifth-ul-mu.py OUT; the fixtures
# test/fixtures/probe9-V3-fifth-SYNTHETIC-ul-<name>.pdf are OUT/SYNTHETIC-ul-<name>.pdf renamed.
# SYNTHETIC counter-probes for sameBesideMarkup's rows beside an underline annotation's line.
# Base: reportlab 5.0, an invented maintenance note (Helvetica 11 pt). Content variant:
# a black 0.8 pt underline drawn by the page under "forklift scales were complete"
# (0.9 pt below the baseline), and a dark-red 0.6 pt one under "two closers remain".
import sys, json
from reportlab.pdfgen import canvas
from reportlab.pdfbase.pdfmetrics import stringWidth
OUT = sys.argv[1]
LINES = ['Maintenance note (SYNTHETIC probe). The checks of the forklift scales were complete',
         'by Friday, and the fire doors were inspected; two closers remain to be replaced.',
         'The loading ramp was resurfaced and the racking signs were renewed in April.']
F, S, X, Y0, L = 'Helvetica', 11, 72, 700, 17
def geo():
    out = {}
    for phrase, li in (('forklift scales were complete', 0), ('two closers remain', 1), ('racking signs were renewed', 2)):
        i = LINES[li].index(phrase)
        x0 = X + stringWidth(LINES[li][:i], F, S)
        out[phrase] = {'x0': x0, 'x1': x0 + stringWidth(phrase, F, S), 'base': Y0 - li * L}
    return out
def page(name, lines=()):
    c = canvas.Canvas(f'{OUT}/SYNTHETIC-ul-{name}.pdf', pagesize=(595, 842), invariant=1)
    c.setTitle('Maintenance note (SYNTHETIC probe)'); c.setFont(F, S)
    for li, t in enumerate(LINES): c.drawString(X, Y0 - li * L, t)
    G = geo()
    for phrase, col, wd, off in lines:
        g = G[phrase]; c.setStrokeColorRGB(*col); c.setLineWidth(wd); c.line(g['x0'], g['base'] - off, g['x1'], g['base'] - off)
    c.showPage(); c.save()
page('base')
page('k08', [('forklift scales were complete', (0, 0, 0), 0.8, 0.9)])
page('r06', [('two closers remain', (0.6, 0, 0), 0.6, 1.0)])
json.dump(geo(), open(f'{OUT}/ul-geo.json', 'w'))
print('ok')

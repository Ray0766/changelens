# Fix round 9, fifth pass: generator of the second verifier of the visual fourth pass, kept as written.
# Run in this order: v3-markup-fifth-fp.py OUT, -mu.py OUT, -pp.py OUT (and -size.py OUT); the fixtures
# test/fixtures/probe9-V3-fifth-SYNTHETIC-<name>.pdf are OUT/SYNTHETIC-<name>.pdf renamed.
# SYNTHETIC: how large a recoloured page graphic must be, under a new highlight, to be
# listed. fpdf2 2.9 base (an inspection row with a status dot of radius R pt and an icon
# square of S pt); PyMuPDF 2.1 highlight (multiply, opaque yellow) over the whole row
# (370 pt) or over 60 pt around the dot only.
import sys
from fpdf import FPDF
import pymupdf
OUT = sys.argv[1]
def page(name, R, colour, S=0, scol=(0.88, 0.1, 0.1)):
    pdf = FPDF(unit='pt', format='A4'); pdf.set_title('Inspection row (SYNTHETIC probe)'); pdf.add_page(); pdf.set_font('helvetica', size=11)
    pdf.text(72, 110, 'Site inspection list. SYNTHETIC probe: every name and value is invented.')
    for i, (a, b) in enumerate([('Dock B lighting', 'Checked by L. Brown on 4 May'), ('Forklift scales', 'Calibrated, certificate 2291')]):
        base = 140 + 26 * i
        pdf.set_text_color(0, 0, 0); pdf.text(72, base, a); pdf.text(222, base, b)
        c = colour if i == 0 else (0.88, 0.1, 0.1)
        pdf.set_fill_color(*[int(round(255 * v)) for v in c]); pdf.circle(202, base - 3.8, R, style='F')
        if S:
            c = scol if i == 0 else (0.88, 0.1, 0.1)
            pdf.set_fill_color(*[int(round(255 * v)) for v in c]); pdf.rect(410, base - 3.8 - S / 2, S, S, style='F')
    p = f'{OUT}/SYNTHETIC-hs-{name}.pdf'; pdf.output(p); return p
def hl(src, name, x0, x1):
    d = pymupdf.open(src); p = d[0]
    a = p.add_highlight_annot(pymupdf.Rect(x0, 140 - 12.5, x1, 140 + 4.5)); a.set_colors(stroke=(1, 1, 0)); a.update()
    d.set_metadata({'title': 'Inspection row (SYNTHETIC probe, highlight)'}); d.save(f'{OUT}/SYNTHETIC-hs-{name}.pdf', garbage=3, deflate=True)
RED, ORANGE, GREEN = (0.88, 0.1, 0.1), (1.0, 0.55, 0.0), (0.1, 0.6, 0.2)
for R in (3.2, 6.0):
    b = page(f'r{R}-base', R, RED, S=12)
    o = page(f'r{R}-orange', R, ORANGE, S=12)
    g = page(f'r{R}-green', R, GREEN, S=12)
    hl(b, f'r{R}-base-row', 70, 442); hl(o, f'r{R}-orange-row', 70, 442); hl(g, f'r{R}-green-row', 70, 442)
    hl(b, f'r{R}-base-near', 172, 232); hl(o, f'r{R}-orange-near', 172, 232); hl(g, f'r{R}-green-near', 172, 232)
# the 12 pt icon recoloured red -> green under the row highlight, dot unchanged
ic = page('icon-green', 3.2, RED, S=12, scol=GREEN); hl(ic, 'icon-green-row', 70, 442)
print('ok')

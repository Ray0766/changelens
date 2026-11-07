# Fix round 9, fifth pass: generator of the second verifier of the visual fourth pass, with the
# fixer's darker dots (dot-darkred, dot-black, dot-grey) added.
# Run in this order: v3-markup-fifth-fp.py OUT, -mu.py OUT, -pp.py OUT (and -size.py OUT); the fixtures
# test/fixtures/probe9-V3-fifth-SYNTHETIC-<name>.pdf are OUT/SYNTHETIC-<name>.pdf renamed.
# SYNTHETIC counter-probes for drawnByMarkup (multiply model) and seeThroughAlike (tri-state).
# Base: fpdf2 2.9, an invented inspection list whose rows carry a status dot and a grey bar
# (page graphics) next to their text. Content variants (fpdf2): a dot recoloured, a bar
# darkened, words recoloured. Highlights are added by hl_mu.py (PyMuPDF) and hl_pp.py (pypdf).
import sys, json
from fpdf import FPDF
OUT = sys.argv[1]
ROWS = [
    ('Dock B lighting', 'Checked by L. Brown on 4 May'),
    ('Forklift scales', 'Calibrated, certificate 2291'),
    ('Fire doors east', 'Two closers to be replaced'),
    ('Loading ramp 3', 'Surface repaired in April'),
    ('Racking bay 12', 'Load signs fitted and legible'),
    ('Eyewash station', 'Flushed weekly, log complete'),
]
X0, Y0, LEAD = 72.0, 140.0, 22.0
RED = (0.88, 0.1, 0.1)

def page(name, dot=None, bar=None, ink=None):
    """dot: {row: rgb}, bar: {row: rgb}, ink: {(row, col): rgb} for the text."""
    dot = dot or {}; bar = bar or {}; ink = ink or {}
    pdf = FPDF(unit='pt', format='A4')
    pdf.set_title('Inspection list (SYNTHETIC probe)')
    pdf.set_creator('fpdf2 (SYNTHETIC probe)')
    pdf.add_page()
    pdf.set_font('helvetica', size=11)
    pdf.text(X0, Y0 - 30, 'Site inspection list. SYNTHETIC probe: every name and value is invented.')
    geo = []
    for i, (a, b) in enumerate(ROWS):
        base = Y0 + i * LEAD
        for col, (x, s) in enumerate(((X0, a), (X0 + 150, b))):
            c = ink.get((i, col), (0, 0, 0))
            pdf.set_text_color(*[int(round(255 * v)) for v in c])
            pdf.text(x, base, s)
        pdf.set_text_color(0, 0, 0)
        c = dot.get(i, RED)
        pdf.set_fill_color(*[int(round(255 * v)) for v in c])
        pdf.set_draw_color(*[int(round(255 * v)) for v in c])
        pdf.circle(X0 + 130, base - 3.8, 3.2, style='F')
        c = bar.get(i, (0.78, 0.78, 0.78))
        pdf.set_fill_color(*[int(round(255 * v)) for v in c])
        pdf.rect(X0 + 330, base - 7, 36, 7, style='F')
        geo.append({'row': i, 'base': base, 'x0': X0 - 2, 'x1': X0 + 370, 'tx1': X0 + 150 + pdf.get_string_width(b)})
    pdf.output(f'{OUT}/SYNTHETIC-hl-{name}.pdf')
    return geo

geo = page('base')
json.dump(geo, open(f'{OUT}/hl-geo.json', 'w'))
page('dot-orange', dot={0: (1.0, 0.55, 0.0)})            # red -> orange in row 0
page('dot-green', dot={0: (0.1, 0.6, 0.2)})              # red -> green in row 0 (control edit)
page('bar-darker', bar={2: (0.55, 0.55, 0.55)})          # light grey bar darkened in row 2
page('bar-lighter', bar={2: (0.92, 0.92, 0.92)})         # light grey bar lightened in row 2
page('ink-red', ink={(3, 1): (0.55, 0.0, 0.0)})          # row 3 text black -> dark red
page('ink-navy', ink={(4, 1): (0.0, 0.0, 0.42)})         # row 4 text black -> navy
page('ink-grey', ink={(5, 1): (0.32, 0.32, 0.32)})       # row 5 text black -> dark grey
page('dot-darkred', dot={0: (0.45, 0.0, 0.0)})         # red -> dark red in row 0 (darker in every channel)
page('dot-black', dot={0: (0.0, 0.0, 0.0)})             # red -> black in row 0
page('dot-grey', dot={0: (0.35, 0.35, 0.35)})          # red -> dark grey in row 0
print('ok')

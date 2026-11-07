# Fix round 9, fifth pass: generator of the second verifier of the visual fourth pass, kept as written.
# The fixtures test/fixtures/probe9-V2-fifth-SYNTHETIC-stm-*.pdf are OUT/SYNTHETIC-stm-*.pdf.
# SYNTHETIC: reportlab 5.0 audit note with short figures mid-line ("30 days", "12 sites",
# "48 units", "18 crates"); straight hand strikes rising 3 pt over the figure that run on
# L pt to the right over the next word (L = 6, 10, 13, 16, 18), and to the left (L = 13, 16).
import sys
from reportlab.pdfgen import canvas
from reportlab.pdfbase.pdfmetrics import stringWidth
OUT = sys.argv[1]
FONT, SIZE, LEAD = 'Helvetica', 10.5, 15
LINES = ['Supplier audit note SYNTHETIC. Payment is due within 30 days of the invoice date.',
         'The auditors visited 12 sites in total and recorded one minor finding at each.',
         'Figures: 48 units, 7 pallets, 250 kg, 18 crates; returns 3 % and claims 0.',
         'Sign-off requires two signatures from the quality lead and the site manager.']
def layout():
    words, y = [], 760
    for line in LINES:
        x = 60
        for w in line.split(' '):
            wd = stringWidth(w, FONT, SIZE); words.append({'w': w, 'x0': x, 'x1': x + wd, 'base': y}); x += wd + stringWidth(' ', FONT, SIZE)
        y -= LEAD
    return words
def find(W, w): return [q for q in W if q['w'].strip('.,;:') == w][0]
def page(name, marks=None):
    c = canvas.Canvas(f'{OUT}/SYNTHETIC-stm-{name}.pdf', pagesize=(595, 842), invariant=1)
    c.setTitle('Audit note (SYNTHETIC probe)'); c.setFont(FONT, SIZE)
    y = 760
    for line in LINES: c.drawString(60, y, line); y -= LEAD
    if marks: marks(c, layout())
    c.showPage(); c.save()
def strike(c, q, rise, ol, orr):
    span = q['x1'] - q['x0']; m = rise / span; ym = q['base'] + 3.2
    c.setStrokeColorRGB(0, 0, 0); c.setLineWidth(0.9)
    c.line(q['x0'] - ol, ym - rise / 2 - m * ol, q['x1'] + orr, ym + rise / 2 + m * orr)
page('before')
for L in (6, 10, 13, 16, 18):
    page(f'r{L}', lambda c, W, L=L: [strike(c, find(W, w), 3.0, 1.0, L) for w in ('30', '12', '48', '18')])
for L in (13, 16):
    page(f'l{L}', lambda c, W, L=L: [strike(c, find(W, w), 3.0, L, 1.0) for w in ('30', '12', '48', '18')])
print('ok')

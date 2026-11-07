# Fix round 9, fifth pass: generator of the second verifier of the visual fourth pass (comments tidied).
# The fixtures test/fixtures/probe9-V2-fifth-SYNTHETIC-tint*.pdf are OUT/SYNTHETIC-tint*.pdf.
# SYNTHETIC: more light, saturated heading colours (reportlab 5.0, Helvetica-Bold 15 pt):
# #92d050, #00b050, #ffff00, #ff66cc, #66ccff and #ffc000 (reference), on paper.
# Variants: a grey (0.5) 0.6 pt strike on every heading; a black 0.4 pt strike on every heading.
import sys
from reportlab.pdfgen import canvas
from reportlab.pdfbase.pdfmetrics import stringWidth
OUT = sys.argv[1]
H = [('Passed', '#92d050'), ('Shipped', '#00b050'), ('Pending', '#ffff00'), ('Returned', '#ff66cc'), ('Booked', '#66ccff'), ('Delayed', '#ffc000')]
def rgb(h): return tuple(int(h[i:i + 2], 16) / 255 for i in (1, 3, 5))
def page(name, strike=None):
    c = canvas.Canvas(f'{OUT}/SYNTHETIC-tint2-{name}.pdf', pagesize=(595, 842), invariant=1)
    c.setTitle('Shipment status (SYNTHETIC probe)')
    c.setFont('Helvetica', 10); c.drawString(72, 790, 'Shipment status board. SYNTHETIC probe; every entry is invented.')
    y = 750
    for h, col in H:
        c.setFillColorRGB(*rgb(col)); c.setFont('Helvetica-Bold', 15); c.drawString(72, y, h)
        w = stringWidth(h, 'Helvetica-Bold', 15)
        if strike:
            c.setStrokeColorRGB(*strike[0]); c.setLineWidth(strike[1]); c.line(71, y + 5.0, 72 + w + 1, y + 5.0)
        c.setFillColorRGB(0, 0, 0); c.setFont('Helvetica', 10); c.drawString(72, y - 16, f'Status line for {h.lower()} consignments.')
        y -= 46
    c.showPage(); c.save()
page('before'); page('grey', ((0.5, 0.5, 0.5), 0.6)); page('k04', ((0, 0, 0), 0.4)); page('grey08', ((0.45, 0.45, 0.45), 0.8))
print('ok')

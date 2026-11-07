# Fix round 9, sixth pass: generator of the verifier of the visual fifth pass, kept as written.
# The fixtures test/fixtures/probe9-V2-sixth-SYNTHETIC-t4o-*.pdf are OUT/SYNTHETIC-t4o-*.pdf.
# SYNTHETIC: reportlab 5.0, bold 15 pt headings in mid/dark greens (#577c2f as Chromium writes #92d050, #70ad47, #548235),
# a grey (0.502) strike 1.5 pt thick at 8.4 pt above the baseline (Chromium's line-through geometry), and 0.6 pt.
import sys
from reportlab.pdfgen import canvas
from reportlab.pdfbase.pdfmetrics import stringWidth
OUT = sys.argv[1]
H = [('Passed', '#577c2f'), ('Cleared', '#70ad47'), ('Closed', '#548235')]
def rgb(h): return tuple(int(h[i:i + 2], 16) / 255 for i in (1, 3, 5))
def page(name, w=None, dy=4.8):
    c = canvas.Canvas(f'{OUT}/SYNTHETIC-t4o-{name}.pdf', pagesize=(595, 842), invariant=1); c.setTitle('Status (SYNTHETIC probe)')
    c.setFont('Helvetica', 10); c.drawString(72, 790, 'Status board. SYNTHETIC probe; every entry is invented.')
    y = 750
    for h, col in H:
        c.setFillColorRGB(*rgb(col)); c.setFont('Helvetica-Bold', 15); c.drawString(72, y, h)
        if w:
            c.setStrokeColorRGB(0.502, 0.502, 0.502); c.setLineWidth(w); c.line(72, y + dy, 72 + stringWidth(h, 'Helvetica-Bold', 15), y + dy)
        c.setFillColorRGB(0, 0, 0); c.setFont('Helvetica', 10); c.drawString(72, y - 16, f'Status line for {h.lower()}.'); y -= 46
    c.showPage(); c.save()
page('before'); page('w15', 1.5); page('w06', 0.6)
print('ok')

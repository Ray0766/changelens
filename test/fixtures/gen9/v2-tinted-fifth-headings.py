# Fix round 9, fifth pass: generator of the second verifier of the visual fourth pass, kept as written.
# The fixtures test/fixtures/probe9-V2-fifth-SYNTHETIC-tint*.pdf are OUT/SYNTHETIC-tint*.pdf.
# SYNTHETIC counter-probes for inkTinted (a line looked for by luminance on glyphs set in a
# light, saturated colour). reportlab 5.0: status headings in Helvetica-Bold 15 pt,
# #ffc000 / #00b0f0 / #ff8000 / #92d050, a short body line under each.
# Variants: a grey 0.6 pt strike through two headings ("Delayed", "Cleared"); a mid-grey
# 0.5 pt underline under one ("Queued"); controls: one heading recoloured (#ffc000 ->
# #ff8000), the whole page moved down 0.4 pt (re-flow), and a heading made non-bold.
import sys
from reportlab.pdfgen import canvas
from reportlab.pdfbase.pdfmetrics import stringWidth
OUT = sys.argv[1]
HEAD = [('Delayed', (1.0, 0.753, 0.0)), ('Cleared', (0.0, 0.69, 0.94)), ('Queued', (1.0, 0.5, 0.0)), ('Passed', (0.573, 0.816, 0.314))]
BODY = ['Two consignments wait for customs papers.', 'All pallets released on Tuesday.', 'Three trailers booked for the next slot.', 'Spot checks found no fault.']
def page(name, strike=(), under=(), recol=None, dy=0.0, light=()):
    c = canvas.Canvas(f'{OUT}/SYNTHETIC-tint-{name}.pdf', pagesize=(595, 842), invariant=1)
    c.setTitle('Shipment status (SYNTHETIC probe)')
    c.setFont('Helvetica', 10); c.drawString(72, 790 - dy, 'Shipment status board. SYNTHETIC probe; every entry is invented.')
    y = 750 - dy
    for (h, col), b in zip(HEAD, BODY):
        if recol and recol[0] == h: col = recol[1]
        font = 'Helvetica' if h in light else 'Helvetica-Bold'
        c.setFillColorRGB(*col); c.setFont(font, 15); c.drawString(72, y, h)
        w = stringWidth(h, font, 15)
        if h in strike:
            c.setStrokeColorRGB(0.5, 0.5, 0.5); c.setLineWidth(0.6); c.line(71, y + 5.0, 72 + w + 1, y + 5.0)
        if h in under:
            c.setStrokeColorRGB(0.45, 0.45, 0.45); c.setLineWidth(0.5); c.line(72, y - 1.8, 72 + w, y - 1.8)
        c.setFillColorRGB(0, 0, 0); c.setFont('Helvetica', 10); c.drawString(72, y - 16, b)
        y -= 46
    c.showPage(); c.save()
page('before')
page('grey-strike', strike=('Delayed', 'Cleared'))
page('grey-under', under=('Queued',))
page('recol', recol=('Delayed', (1.0, 0.5, 0.0)))
page('shift04', dy=0.4)
page('shift04-strike', dy=0.4, strike=('Passed',))
page('unbold', light=('Cleared',))
print('ok')

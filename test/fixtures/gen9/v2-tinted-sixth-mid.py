# Fix round 9, sixth pass. The fixtures test/fixtures/probe9-V2-sixth-SYNTHETIC-mid-*.pdf are OUT/SYNTHETIC-mid-*.pdf.
# SYNTHETIC counter-probes (reportlab): bold 15 pt headings and a 10 pt body line in mid colours
# whose luminance lift over the lowest channel is 48-77 (#577c2f, #548235, #70ad47, #2e75b6,
# #ff0000, #c00000, #008000), plus #000000 and #595959 references.
import sys
from reportlab.pdfgen import canvas
from reportlab.pdfbase.pdfmetrics import stringWidth
OUT = sys.argv[1]
H = [('Passed', '#577c2f'), ('Closed', '#548235'), ('Cleared', '#70ad47'), ('Booked', '#2e75b6'), ('Overdue', '#ff0000'), ('Blocked', '#c00000'), ('Settled', '#008000'), ('Filed', '#000000'), ('Parked', '#595959')]
DARK = {'#577c2f': '#3a5320', '#548235': '#385723', '#70ad47': '#548235', '#2e75b6': '#1f4e79', '#ff0000': '#c00000', '#c00000': '#800000', '#008000': '#005000', '#000000': '#404040', '#595959': '#262626'}
def rgb(h): return tuple(int(h[i:i + 2], 16) / 255 for i in (1, 3, 5))
def page(name, strike=None, dy=0.0, recol=None, under=None, light=False, size=15, body=True):
    c = canvas.Canvas(f'{OUT}/SYNTHETIC-mid-{name}.pdf', pagesize=(595, 842), invariant=1); c.setTitle('Status (SYNTHETIC probe)')
    c.setFont('Helvetica', 10); c.drawString(72, 800 - dy, 'Status board. SYNTHETIC probe; every entry is invented.')
    y = 770 - dy
    for h, col in H:
        if recol == 'dark': col = DARK[col]
        elif recol == 'black': col = '#000000'
        font = 'Helvetica' if light else 'Helvetica-Bold'
        c.setFillColorRGB(*rgb(col)); c.setFont(font, size); c.drawString(72, y, h)
        w = stringWidth(h, font, size)
        if strike:
            c.setStrokeColorRGB(*strike[0]); c.setLineWidth(strike[1]); c.line(72, y + strike[2], 72 + w, y + strike[2])
        if under:
            c.setStrokeColorRGB(*under[0]); c.setLineWidth(under[1]); c.line(72, y - 1.8, 72 + w, y - 1.8)
        if body:
            c.setFillColorRGB(*rgb(col)); c.setFont('Helvetica', 10); c.drawString(72, y - 15, f'Status line for {h.lower()} consignments in this colour.')
        y -= 40
    c.showPage(); c.save()
G = (0.502, 0.502, 0.502)
page('before'); page('g15', (G, 1.5, 4.8)); page('g06', (G, 0.6, 5.0)); page('k04', ((0, 0, 0), 0.4, 5.0)); page('r06', ((1, 0, 0), 0.6, 5.0))
page('dx03', dy=0.3); page('dx07', dy=0.7); page('dx15', dy=1.5); page('dark', recol='dark'); page('black', recol='black')
page('ul', under=(G, 0.5)); page('unbold', light=True); page('s145', size=14.5); page('dark-dx04', recol='dark', dy=0.4)
page('g15-dx04', (G, 1.5, 4.8), dy=0.4)
print('ok')

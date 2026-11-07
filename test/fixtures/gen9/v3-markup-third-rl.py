# SYNTHETIC probe PDFs for fix round 9, area V3-markup-annotations, third
# pass: the re-verifier's probes cp-base, cm-ul-X and cm-ul-black-ulgreen,
# made again. A one-page site inspection memo (all names and figures
# invented), page content by reportlab 5.0 (Liberation Sans 11 pt, lines
# 16 pt apart); annotations by PyMuPDF 2.1.
# - "base": the memo;
# - "ul-X": an underline annotation in green (0, 0.6, 0) over "forklift
#   scales were complete" (PyMuPDF's appearance stream);
# - "ul-black-ulgreen": a black 0.8 pt underline drawn in the page content
#   1.6 pt below the phrase's baseline, and the same annotation, whose line
#   lies right above it.
#
# Two steps, from test/fixtures: the page content with a Python that has
# reportlab, then the annotations with one that has PyMuPDF:
#   python3 gen9/v3-markup-third-rl.py content .
#   python gen9/v3-markup-third-rl.py annotations .
import sys

STEP, OUT = sys.argv[1], sys.argv[2]
P = f'{OUT}/probe9-V3-third-SYNTHETIC-'
X = 'forklift scales were complete'
FS = 11
LINES = [
    'The inspection covered the north and south loading docks on 14 May.',
    'Calibration records for the forklift scales were complete and current.',
    'Two fire doors were found wedged open during the morning shift.',
    'Staff training logs were signed by the shift supervisor in all cases.',
    'Pallet racking inspections are due again within ninety days.',
    'The drainage channel beside dock B was clear of debris and oil.',
]


def content(path, underline=False):
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    pdfmetrics.registerFont(TTFont('LS', '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'))
    pdfmetrics.registerFont(TTFont('LSB', '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'))
    W, H = A4
    c = canvas.Canvas(path, pagesize=A4)
    c.setTitle('Site inspection memo (SYNTHETIC)')
    c.setFont('LSB', 18)
    c.drawString(72, H - 100, 'Site inspection memo (SYNTHETIC)')
    y = H - 140
    c.setFont('LS', FS)
    for line in LINES:
        c.drawString(72, y, line)
        if underline and X in line:
            x0 = 72 + pdfmetrics.stringWidth(line[:line.index(X)], 'LS', FS)
            c.setStrokeColorRGB(0, 0, 0)
            c.setLineWidth(0.8)
            c.line(x0, y - 1.6, x0 + pdfmetrics.stringWidth(X, 'LS', FS), y - 1.6)
        y -= 16
    c.showPage()
    c.save()


def annotate(src, dst):
    import pymupdf
    d = pymupdf.open(src)
    p = d[0]
    a = p.add_underline_annot(p.search_for(X, quads=True))
    a.set_colors(stroke=(0, 0.6, 0))
    a.update()
    d.save(dst, garbage=4, deflate=True)
    d.close()


if STEP == 'content':
    content(P + 'base.pdf')
    content(P + 'ul-black.pdf', underline=True)
else:
    import os
    annotate(P + 'base.pdf', P + 'ul-X.pdf')
    annotate(P + 'ul-black.pdf', P + 'ul-black-ulgreen.pdf')
    os.remove(P + 'ul-black.pdf')
print('ok')

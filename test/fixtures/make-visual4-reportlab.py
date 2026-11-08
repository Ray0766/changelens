#!/usr/bin/env python3
# SYNTHETIC test fixtures for test/visual4-regressions.test.ts (reportlab):
#
#   rl4-logo-before.pdf / rl4-logo-after.pdf — a letterhead whose vector logo
#     (a disc and two bars) moves 1 pt to the right; nothing else changes
#   rl4-bars-before.pdf / rl4-bars-after.pdf — a bar chart on a light grey
#     panel with grid lines; one light bar without an outline grows by 3 pt
#
# Run: python3 test/fixtures/make-visual4-reportlab.py
import os
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor

OUT = os.path.dirname(os.path.abspath(__file__))
W, H = A4
LETTER = ['Dear Ms Okafor,', 'Thank you for your enquiry about the maintenance contract for the north building.',
          'Please find our offer attached. Routine inspections take place every quarter.', 'Kind regards,', 'Facilities team']


def logo(c, dx):
    x, y = 72 + dx, H - 110
    c.setFillColor(HexColor('#c82828')); c.circle(x + 22, y + 22, 20, fill=1, stroke=0)
    c.setFillColor(HexColor('#1e1e1e')); c.rect(x + 50, y + 25, 65, 10, fill=1, stroke=0)
    c.setFillColor(HexColor('#787878')); c.rect(x + 50, y + 12, 50, 7, fill=1, stroke=0)
    c.setFillColor(HexColor('#000000')); c.setFont('Helvetica', 11)
    yy = H - 200
    for line in LETTER:
        c.drawString(72, yy, line)
        yy -= 18


def bars(c, grow):
    c.setFont('Helvetica', 11)
    y = H - 72
    for line in ['Quarterly call-outs per site', 'The chart below shows the number of emergency call-outs per site in 2025.']:
        c.drawString(72, y, line)
        y -= 16
    x0, base, w, h = 90, H - 420, 390, 220
    c.setFillColor(HexColor('#f4f4f4')); c.rect(x0, base, w, h, stroke=0, fill=1)
    c.setStrokeColor(HexColor('#dddddd')); c.setLineWidth(0.3)
    for k in range(0, h + 1, 20):
        c.line(x0, base + k, x0 + w, base + k)
    for i, hv in enumerate([60, 110, 80, 140, 95]):
        c.setFillColor(HexColor('#dbe7f5')); c.rect(120 + i * 70, base, 40, hv + (grow if i == 2 else 0), fill=1, stroke=0)
    c.setFillColor(HexColor('#000000'))
    c.drawString(72, base - 30, 'Figure 2. Call-outs per site, 2025.')


for name, draw, arg in [('rl4-logo-before', logo, 0), ('rl4-logo-after', logo, 1), ('rl4-bars-before', bars, 0), ('rl4-bars-after', bars, 3)]:
    c = canvas.Canvas(os.path.join(OUT, name + '.pdf'), pagesize=A4, invariant=1)
    draw(c, arg)
    c.showPage()
    c.save()
    print('wrote', name + '.pdf')

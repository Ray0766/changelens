#!/usr/bin/env python3
"""Synthetic water-quality report drawn with reportlab (vector charts, a raster
photo plate and, in the "after" version, an extra vector map plate).

Usage: python3 lake_report.py before|after OUT.pdf
Prints a JSON object with the regions (PDF points, top-left origin) of the
graphic edits, so that the generator can write truth.json from the same
numbers that drew the page.

Everything in this document (lake, stations, measurements) is invented.
"""
import json
import math
import sys
from io import BytesIO

import numpy as np
from PIL import Image, ImageFilter
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph
from reportlab.pdfgen import canvas

VARIANT, OUT = sys.argv[1], sys.argv[2]
AFTER = VARIANT == 'after'
W, H = A4
FONT_DIR = '/usr/share/fonts/truetype/dejavu/'
pdfmetrics.registerFont(TTFont('DejaVu', FONT_DIR + 'DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('DejaVu-Bold', FONT_DIR + 'DejaVuSans-Bold.ttf'))

INK = HexColor('#1e2a33')
MUTED = HexColor('#5d6b76')
GRID = HexColor('#d3dbe1')
LM, RM = 62, W - 62
body = ParagraphStyle('body', fontName='DejaVu', fontSize=9.5, leading=14, textColor=INK, spaceAfter=6)
small = ParagraphStyle('small', parent=body, fontSize=8, leading=11, textColor=MUTED)

c = canvas.Canvas(OUT, pagesize=A4, invariant=1)
c.setTitle('Lake Arden water-quality monitoring, summer 2027 (synthetic sample)')
c.setAuthor('Synthetic sample')
page_no = [0]
regions = {}


def tl(x, y, w, h):
    """bottom-left rect -> [x, y, w, h] with top-left origin, rounded."""
    return [round(x, 1), round(H - y - h, 1), round(w, 1), round(h, 1)]


def new_page(footer=True):
    if page_no[0]:
        c.showPage()
    page_no[0] += 1
    if footer:
        c.setFont('DejaVu', 7.5)
        c.setFillColor(MUTED)
        c.drawString(LM, 30, 'Lake Arden monitoring · summer 2027 · Synthetic sample')
        c.drawRightString(RM, 30, f'Page {page_no[0]}')
        c.setStrokeColor(GRID)
        c.setLineWidth(0.5)
        c.line(LM, 42, RM, 42)


def heading(text, y, size=13):
    c.setFont('DejaVu-Bold', size)
    c.setFillColor(INK)
    c.drawString(LM, y, text)


def paras(texts, y, style=body, width=RM - LM):
    """Draw paragraphs from top y downwards; returns the new y."""
    for t in texts:
        p = Paragraph(t, style)
        _, h = p.wrap(width, 1000)
        p.drawOn(c, LM, y - h)
        y -= h + style.spaceAfter
    return y


# ---------------------------------------------------------------- page 1
new_page()
c.setFillColor(HexColor('#1d4f7a'))
c.rect(LM, H - 92, 6, 44, stroke=0, fill=1)
c.setFont('DejaVu-Bold', 21)
c.setFillColor(INK)
c.drawString(LM + 16, H - 70, 'Lake Arden water-quality monitoring')
c.setFont('DejaVu', 12)
c.setFillColor(MUTED)
c.drawString(LM + 16, H - 90, 'Summer 2027 · interim report of the lake management group')
y = paras([
    '<i>Synthetic sample: the lake, the monitoring stations and all measurements in this report are invented.</i>',
], H - 125, small)
heading('1 Summary', y - 12)
y = paras([
    'Lake Arden has been sampled every week since 1 June 2027 at six stations, from the inflow of Mill Brook in the north '
    'to the outflow weir in the south. This interim report covers the samples taken up to the end of August. It describes '
    'the algae indicator chlorophyll-a, the station averages of temperature, water clarity and phosphorus, and the oxygen '
    'conditions near the surface at station B.',
    'The summer was warmer than the long-term average at most stations. Algae concentrations increased through the season, '
    'most strongly near the brook inflow, where the nutrient load is highest. Water clarity was lowest at the shallow '
    'stations in the north-east bay.',
    'Dissolved oxygen at station B stayed above the target minimum until early August, fell below it for three weeks and '
    'recovered after a storm on 20 August mixed the water. No fish deaths were reported.',
    'The management group will decide in October whether the planned reduction of the phosphorus load from the brook '
    'catchment should be brought forward. The final report, with the autumn samples, follows in January 2028.',
], y - 24)
heading('Monitoring stations', y - 14, 11)
y = paras([
    '<b>A</b> outflow weir · <b>B</b> central basin, deepest point · <b>C</b> Mill Brook inflow · '
    '<b>D</b> western shore · <b>E</b> north-east bay · <b>F</b> boat harbour',
    'Samples are taken between 09:00 and 11:00 from a boat at 1 m depth, except where the table gives a different '
    'depth. All analyses were made by the same accredited laboratory.',
], y - 24)

# ---------------------------------------------------------------- page 2: grouped bar chart
new_page()
heading('2 Chlorophyll-a', H - 70)
paras([
    'Chlorophyll-a is used as a measure of the amount of algae in the water. Figure 1 shows the monthly mean of the '
    'weekly surface samples at the four stations in the open lake. Stations E and F are left out because several '
    'samples could not be taken when the bay was closed for works on the harbour wall.',
], H - 84)
x0, x1, base, per = 100, 520, 330, 10.0          # 0..30 ug/l -> 300 pt
values = {
    'A': [6.2, 8.9, 11.4],
    'B': [7.5, 10.8, 14.2],
    'C': [9.1, 13.6, 24.1 if AFTER else 18.6],
    'D': [5.4, 7.2, 9.8],
}
month_colours = [HexColor('#9cc3e4'), HexColor('#4a8fc7'), HexColor('#1d4f7a')]
c.setFont('DejaVu', 8)
c.setFillColor(MUTED)
c.drawString(x0, base + 30 * per + 14, 'Mean chlorophyll-a (µg/l)')
for t in range(0, 31, 5):
    yy = base + t * per
    c.setStrokeColor(HexColor('#7c8a95') if t == 0 else GRID)
    c.setLineWidth(0.8 if t == 0 else 0.5)
    c.line(x0, yy, x1, yy)
    c.setFillColor(MUTED)
    c.drawRightString(x0 - 6, yy - 3, str(t))
slot = (x1 - x0) / 4
bw = 26
for i, (st, vals) in enumerate(values.items()):
    gx = x0 + i * slot + (slot - 3 * bw - 8) / 2
    for m, v in enumerate(vals):
        bx = gx + m * (bw + 4)
        c.setFillColor(month_colours[m])
        c.rect(bx, base, bw, v * per, stroke=0, fill=1)
        if st == 'C' and m == 2:
            old_h, new_h = 18.6 * per, 24.1 * per
            regions['bar'] = tl(bx, base, bw, max(old_h, new_h))
    c.setFillColor(INK)
    c.setFont('DejaVu', 8.5)
    c.drawCentredString(x0 + (i + 0.5) * slot, base - 16, f'Station {st}')
    c.setFont('DejaVu', 8)
lx = x1 - 190
for m, name in enumerate(['June', 'July', 'August']):
    c.setFillColor(month_colours[m])
    c.rect(lx + m * 64, base + 30 * per + 12, 9, 9, stroke=0, fill=1)
    c.setFillColor(INK)
    c.drawString(lx + m * 64 + 13, base + 30 * per + 13, name)
paras([
    '<b>Figure 1.</b> Monthly mean chlorophyll-a concentration at stations A–D, surface samples, June to August 2027.',
], base - 34, small)
paras([
    'Concentrations rose at all four stations through the summer. The increase was largest at station C near the inflow '
    'of Mill Brook, which carries most of the phosphorus that enters the lake. The central basin (station B) followed the '
    'same pattern at a lower level, and the western shore (station D) remained the clearest part of the open lake.',
    'An algae bloom warning is issued when chlorophyll-a stays above the warning level for two consecutive weeks. This '
    'did not happen at any station this summer, but station C came close to it in the last week of August.',
], base - 70)

# ---------------------------------------------------------------- page 3: table with shading
new_page()
heading('3 Station summary', H - 70)
paras([
    'Table 1 gives the averages over all samples from June to August. The temperature anomaly is the difference from the '
    'mean of the summers 2012–2026 at the same station; a negative value means the water was cooler than usual.',
], H - 84)
cols = ['Station', 'Depth (m)', 'Mean temp. (°C)', 'Anomaly (°C)', 'Secchi depth (m)', 'Total P (µg/l)']
rows = [
    ['A', '12.5', '19.8', '+0.6', '3.4', '18'],
    ['B', '21.0', '19.1', '−0.2', '3.9', '15'],
    ['C', '6.5', '20.7', '+1.3', '1.8', '31'],
    ['D', '15.0', '19.4', '+0.4' if AFTER else '−0.4', '3.1', '22'],
    ['E', '4.0', '21.2', '+1.6', '1.2', '38'],
    ['F', '9.5', '20.1', '+0.9', '2.6', '27'],
]
widths = [70, 70, 90, 80, 90, 71]
top, rh = H - 150, 22
tx = LM
for r in range(len(rows) + 1):
    ry = top - (r + 1) * rh
    if r == 0:
        c.setFillColor(HexColor('#dfe8f0'))
        c.rect(tx, ry, sum(widths), rh, stroke=0, fill=1)
    elif r % 2 == 0:
        c.setFillColor(HexColor('#f3f6f9'))
        c.rect(tx, ry, sum(widths), rh, stroke=0, fill=1)
    cx = tx
    for k, w in enumerate(widths):
        if r > 0 and rows[r - 1][0] == 'E' and k == 5 and AFTER:
            c.setFillColor(HexColor('#f5c04a'))
            c.rect(cx, ry, w, rh, stroke=0, fill=1)
        if r > 0 and rows[r - 1][0] == 'E' and k == 5:
            regions['cell'] = tl(cx, ry, w, rh)
        text = cols[k] if r == 0 else rows[r - 1][k]
        c.setFont('DejaVu-Bold' if r == 0 else 'DejaVu', 8.5)
        c.setFillColor(INK)
        if k == 0:
            c.drawString(cx + 6, ry + 7, text)
        else:
            c.drawRightString(cx + w - 8, ry + 7, text)
        cx += w
c.setStrokeColor(HexColor('#7c8a95'))
c.setLineWidth(0.8)
c.line(tx, top, tx + sum(widths), top)
c.line(tx, top - rh, tx + sum(widths), top - rh)
c.line(tx, top - (len(rows) + 1) * rh, tx + sum(widths), top - (len(rows) + 1) * rh)
y = paras([
    '<b>Table 1.</b> Station averages, June to August 2027. Shaded cells: total phosphorus above the target of 35 µg/l.',
], top - (len(rows) + 1) * rh - 8, small)
paras([
    'The shallow stations C and E warmed most and had the lowest water clarity. Both are close to the brook inflow and '
    'to the reed beds of the north-east bay, where fine sediment is stirred up by wind and boats.',
    'Total phosphorus decreased from north to south. The outflow weir (station A) had the lowest value of the open-lake '
    'stations, which is consistent with phosphorus settling out with algae and sediment on the way through the lake.',
    'The depth column gives the depth of the water at the sampling point, not the sampling depth. Secchi depth is the '
    'depth at which a white disc lowered from the boat can no longer be seen.',
], y - 10)

# ---------------------------------------------------------------- page 4: raster photo plate (no text)
new_page(footer=False)
rng = np.random.default_rng(20270815)
pw, ph = 700, 1030
yy, xx = np.mgrid[0:ph, 0:pw]
ang = np.arctan2(yy - ph * 0.52, xx - pw * 0.5)
rad = np.hypot((xx - pw * 0.5) / (pw * 0.36), (yy - ph * 0.52) / (ph * 0.40))
edge = 1 + 0.12 * np.sin(3 * ang) + 0.07 * np.cos(5 * ang + 1)
lake = rad < edge
noise = np.array(Image.fromarray((rng.random((ph // 8, pw // 8)) * 255).astype('uint8')).resize((pw, ph), Image.BICUBIC), dtype=float) / 255
land = np.stack([70 + 60 * noise, 105 + 50 * noise, 55 + 30 * noise], -1)
depth = np.clip(1 - rad / edge, 0, 1)
water = np.stack([40 - 20 * depth + 10 * noise, 95 + 10 * depth, 120 + 60 * depth], -1)
img = np.where(lake[..., None], water, land).clip(0, 255).astype('uint8')
im = Image.fromarray(img).filter(ImageFilter.GaussianBlur(1.2))
buf = BytesIO()
im.save(buf, 'JPEG', quality=82)
buf.seek(0)
c.drawImage(ImageReader(buf), 40, 40, W - 80, H - 80)

# ---------------------------------------------------------------- after only: vector depth map plate (no text)
if AFTER:
    new_page(footer=False)
    cx0, cy0 = W / 2, H / 2 + 10
    shades = ['#e8f1f8', '#c9def0', '#a6c8e6', '#7eaed8', '#5791c6', '#3474ae', '#1d5791']
    c.setFillColor(HexColor('#f4f1e6'))
    c.rect(48, 48, W - 96, H - 96, stroke=0, fill=1)
    for k, col in enumerate(shades):
        scale = 1 - k * 0.13
        p = c.beginPath()
        for j in range(181):
            a = 2 * math.pi * j / 180
            rr = scale * (1 + 0.12 * math.sin(3 * a + k * 0.3) + 0.06 * math.cos(5 * a + 1 + k * 0.2))
            px, py = cx0 + 205 * rr * math.cos(a), cy0 + 300 * rr * math.sin(a)
            p.moveTo(px, py) if j == 0 else p.lineTo(px, py)
        p.close()
        c.setFillColor(HexColor(col))
        c.setStrokeColor(HexColor('#2b4a63'))
        c.setLineWidth(0.6)
        c.drawPath(p, stroke=1, fill=1)
    c.setFillColor(INK)                    # north arrow and scale bar, no lettering
    arrow = c.beginPath()
    arrow.moveTo(W - 90, H - 80)
    arrow.lineTo(W - 100, H - 110)
    arrow.lineTo(W - 80, H - 110)
    arrow.close()
    c.drawPath(arrow, stroke=0, fill=1)
    for k in range(4):
        c.setFillColor(INK if k % 2 == 0 else white)
        c.setStrokeColor(INK)
        c.rect(70 + k * 30, 70, 30, 6, stroke=1, fill=1)
    regions['plate'] = tl(48, 48, W - 96, H - 96)

# ---------------------------------------------------------------- dissolved oxygen line chart
new_page()
regions['oxygenPage'] = page_no[0]
heading('4 Dissolved oxygen', H - 70)
paras([
    'Oxygen is measured with a calibrated probe at 1 m depth in the central basin. Figure 2 shows the weekly values '
    'together with the target minimum of 6 mg/l that applies to lakes with a cold-water fish population.',
], H - 84)
do = [9.8, 9.5, 9.1, 8.7, 8.2, 7.6, 7.1, 6.6, 6.2, 4.1 if AFTER else 5.2, 5.1, 5.6, 6.6, 7.4]
labels = ['1 Jun', '15 Jun', '29 Jun', '13 Jul', '27 Jul', '10 Aug', '24 Aug']
gx0, gx1, gbase, gper = 100, 520, 370, 25.0      # 0..12 mg/l -> 300 pt
c.setFont('DejaVu', 8)
c.setFillColor(MUTED)
c.drawString(gx0, gbase + 12 * gper + 14, 'Dissolved oxygen (mg/l)')
for t in range(0, 13, 2):
    yy = gbase + t * gper
    c.setStrokeColor(HexColor('#7c8a95') if t == 0 else GRID)
    c.setLineWidth(0.8 if t == 0 else 0.5)
    c.line(gx0, yy, gx1, yy)
    c.setFillColor(MUTED)
    c.drawRightString(gx0 - 6, yy - 3, str(t))
step = (gx1 - gx0 - 20) / (len(do) - 1)
px = [gx0 + 10 + i * step for i in range(len(do))]
for i, lab in enumerate(labels):
    c.setFillColor(INK)
    c.drawCentredString(px[2 * i], gbase - 14, lab)
c.setStrokeColor(HexColor('#c0392b'))
c.setLineWidth(1)
c.setDash(5, 3)
c.line(gx0, gbase + 6 * gper, gx1, gbase + 6 * gper)
c.setDash()
c.setFillColor(HexColor('#c0392b'))
c.drawString(gx0 + 6, gbase + 6 * gper + 5, 'target minimum 6 mg/l')
path = c.beginPath()
for i, v in enumerate(do):
    path.moveTo(px[i], gbase + v * gper) if i == 0 else path.lineTo(px[i], gbase + v * gper)
c.setStrokeColor(HexColor('#1d4f7a'))
c.setLineWidth(1.6)
c.drawPath(path, stroke=1, fill=0)
c.setFillColor(HexColor('#1d4f7a'))
for i, v in enumerate(do):
    c.circle(px[i], gbase + v * gper, 2.8, stroke=0, fill=1)
lo, hi = min(do[8], do[10], 4.1, 5.2), max(do[8], do[10], 4.1, 5.2)   # both versions of point 9
regions['oxygen'] = tl(px[8] - 4, gbase + lo * gper - 4, px[10] - px[8] + 8, (hi - lo) * gper + 8)
y = paras([
    '<b>Figure 2.</b> Dissolved oxygen at 1 m depth, station B, weekly samples from 1 June to 31 August 2027.',
], gbase - 34, small)
paras([
    'The values fell steadily through July as the water warmed and algae decomposed in the deeper layers. They were below '
    'the target minimum in the three weeks from 3 to 17 August and returned above it after the storm of 20 August mixed '
    'the water column.',
    'The probe was checked against laboratory titration every fortnight. All checks were within the tolerance of the '
    'method, so no values had to be removed.',
], y - 10)

# ---------------------------------------------------------------- conclusions
new_page()
heading('5 Conclusions and next steps', H - 70)
paras([
    'The summer results confirm the pattern of earlier years: the northern part of the lake, fed by Mill Brook, carries '
    'the highest nutrient and algae levels, and the central basin is at risk of low oxygen in warm, calm weeks.',
    'The management group recommends three steps for the coming year:',
    '• continue weekly sampling at all six stations until the end of October;',
    '• add a second oxygen probe at 8 m depth in the central basin, so that the deeper water can be followed;',
    '• ask the farms in the Mill Brook catchment to report fertiliser use for the 2028 season.',
    'The cost of the extra probe and the additional laboratory work is covered by the existing monitoring budget. '
    'Comments on this interim report can be sent to the secretary of the lake management group until 30 November 2027.',
], H - 84)

c.save()
print(json.dumps({'pages': page_no[0], **regions}))

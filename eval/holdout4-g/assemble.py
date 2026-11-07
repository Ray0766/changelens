"""Builds the reportlab parts and assembles / post-processes the final PDFs of
the held-out-4 cases of author g with pypdf.

    python3 eval/holdout4-g/assemble.py <workdir> <casesdir>

<workdir> must already hold the LibreOffice and Chromium parts written by
eval/make-holdout4-g.mjs. Writes <casesdir>/holdout4-g-*/before.pdf and
after.pdf, and <workdir>/geometry.json with rectangles measured from the
generated geometry (used for the truth files). Everything is synthetic.
"""
import io
import json
import math
import os
import re
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from pypdf import PdfReader, PdfWriter, Transformation
from pypdf.generic import (ArrayObject, BooleanObject, DecodedStreamObject, DictionaryObject, FloatObject,
                           NameObject, NumberObject, RectangleObject, TextStringObject)
from reportlab.lib import colors
from reportlab.lib.enums import TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

FONTS = '/usr/share/fonts/truetype'
for name, path in [
    ('LibSans', 'liberation/LiberationSans-Regular.ttf'),
    ('LibSans-Bold', 'liberation/LiberationSans-Bold.ttf'),
    ('LibSerif', 'liberation/LiberationSerif-Regular.ttf'),
    ('LibSerif-Bold', 'liberation/LiberationSerif-Bold.ttf'),
    ('DejaVuSerif', 'dejavu/DejaVuSerif.ttf'),
    ('DejaVuSerif-Bold', 'dejavu/DejaVuSerif-Bold.ttf'),
    ('DejaVuSans', 'dejavu/DejaVuSans.ttf'),
]:
    pdfmetrics.registerFont(TTFont(name, os.path.join(FONTS, path)))
pdfmetrics.registerFont(TTFont('WQY', os.path.join(FONTS, 'wqy/wqy-zenhei.ttc'), subfontIndex=0))

GEOM = {}


def rl_doc(path, story, on_page=None, margins=(25 * mm, 22 * mm, 25 * mm, 22 * mm), pagesize=A4):
    top, right, bottom, left = margins
    doc = SimpleDocTemplate(path, pagesize=pagesize, topMargin=top, rightMargin=right,
                            bottomMargin=bottom, leftMargin=left, invariant=1,
                            title='synthetic sample', author='synthetic sample')
    cb = on_page or (lambda c, d: None)
    doc.build(story, onFirstPage=cb, onLaterPages=cb)


def style(font='LibSans', size=10.5, leading=None, **kw):
    return ParagraphStyle('s', fontName=font, fontSize=size, leading=leading or size * 1.35, **kw)


def words_bbox(pdf, page_no):
    """Words on a 1-based page with boxes [x0, y0, x1, y1], top-left origin (pdftotext -bbox)."""
    out = subprocess.run(['pdftotext', '-bbox', '-f', str(page_no), '-l', str(page_no), pdf, '-'],
                         capture_output=True, text=True, check=True).stdout
    words = []
    for m in re.finditer(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</word>', out):
        x0, y0, x1, y1 = map(float, m.groups()[:4])
        words.append((m.group(5).replace('&amp;', '&').replace('&#39;', "'"), [x0, y0, x1, y1]))
    return words


def phrase_lines(pdf, page_no, phrase):
    """Line boxes (top-left origin) covering the words of `phrase` on the page."""
    target = phrase.split()
    words = words_bbox(pdf, page_no)
    toks = [w for w, _ in words]
    for i in range(len(toks) - len(target) + 1):
        if toks[i:i + len(target)] == target:
            boxes = [b for _, b in words[i:i + len(target)]]
            lines = []
            for b in boxes:
                if lines and abs(lines[-1][1] - b[1]) < 3:
                    L = lines[-1]
                    lines[-1] = [min(L[0], b[0]), min(L[1], b[1]), max(L[2], b[2]), max(L[3], b[3])]
                else:
                    lines.append(list(b))
            return lines
    raise SystemExit(f'phrase not found on page {page_no} of {pdf}: {phrase!r}')


def rect_union(boxes):
    return [min(b[0] for b in boxes), min(b[1] for b in boxes),
            max(b[2] for b in boxes), max(b[3] for b in boxes)]


def xywh(b, pad=0.0):
    return [round(b[0] - pad, 1), round(b[1] - pad, 1), round(b[2] - b[0] + 2 * pad, 1),
            round(b[3] - b[1] + 2 * pad, 1)]


def render_gray(pdf, page_no, dpi):
    import tempfile
    with tempfile.TemporaryDirectory() as d:
        subprocess.run(['pdftoppm', '-cropbox', '-r', str(dpi), '-gray', '-png', '-singlefile', '-f', str(page_no),
                        '-l', str(page_no), pdf, f'{d}/p'], check=True)
        return np.asarray(Image.open(f'{d}/p.png').convert('L')).astype(np.int16)


def diff_rect(pdf_a, page_a, pdf_b, page_b, clip=None, dpi=144, thr=24):
    """Bounding box [x, y, w, h] (points, top-left origin) of the pixels that differ."""
    a, b = render_gray(pdf_a, page_a, dpi), render_gray(pdf_b, page_b, dpi)
    d = np.abs(a - b) > thr
    k = 72.0 / dpi
    if clip:
        m = np.zeros_like(d)
        x, y, w, h = [int(round(v / k)) for v in clip]
        m[y:y + h, x:x + w] = True
        d &= m
    ys, xs = np.nonzero(d)
    return [round(xs.min() * k, 1), round(ys.min() * k, 1), round((xs.max() + 1 - xs.min()) * k, 1),
            round((ys.max() + 1 - ys.min()) * k, 1)]


def overlay_pdf(size, draw):
    """One-page PDF of the given size drawn by `draw(canvas)`; returns a PageObject."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=size, invariant=1)
    draw(c)
    c.showPage()
    c.save()
    buf.seek(0)
    return PdfReader(buf).pages[0]


def page_size(page):
    mb = page.mediabox
    return float(mb.width), float(mb.height)


def write(writer, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    writer.add_metadata({'/Producer': 'pypdf (held-out-4 g, synthetic sample)'})
    with open(path, 'wb') as f:
        writer.write(f)


# ======================================================== case 1: tender pack

def c1_cover(path):
    h = style('DejaVuSerif', 10.5, alignment=TA_JUSTIFY, spaceAfter=7)
    small = style('DejaVuSerif', 8.5, textColor=colors.HexColor('#4b5563'))
    story = [
        Paragraph('<font name="DejaVuSerif-Bold" size="15">Brackwater Lighting Co.</font>', style('DejaVuSerif', 15, spaceAfter=3)),
        Paragraph('3 Ferry Road · Lowmoor LM4 2BX · bids@brackwater.example · synthetic sample', small),
        Spacer(1, 26),
        Paragraph('Procurement Office<br/>Town of Easthaven (fictitious)<br/>Town Hall, Market Square<br/>Easthaven EH1 1AA', style('DejaVuSerif', 10.5, spaceAfter=18)),
        Paragraph('14 October 2026', style('DejaVuSerif', 10.5, spaceAfter=14)),
        Paragraph('<b>Tender TR-0417 — Harbour Promenade Lighting Renewal</b>', style('DejaVuSerif-Bold', 11, spaceAfter=10)),
        Paragraph('Dear Sir or Madam,', h),
        Paragraph('We are pleased to submit our response to the above tender. Our offer covers the supply, '
                  'installation and commissioning of 48 LED column luminaires with a central control '
                  'system, as described in the tender documents and in our technical proposal.', h),
        Paragraph('The response consists of this letter, the technical proposal, the price schedule and the '
                  'following annexes: the product data sheet for the PL-60 luminaire, the maintenance plan, '
                  'the method statement for night works and the insurance summary. All documents are '
                  'combined in this file.', h),
        Paragraph('We have visited the site and read the tender documents, including the replies to bidders’ '
                  'questions published on 2 October 2026. We confirm that our offer complies with the '
                  'requirements of the tender without exceptions.', h),
        Paragraph('Our offer remains valid for 90 days from the closing date. Please address all questions '
                  'about this response to the bid manager named below.', h),
        Spacer(1, 10),
        Paragraph('Yours faithfully,', h),
        Spacer(1, 28),
        Paragraph('Dana Whitcombe<br/>Bid manager, Brackwater Lighting Co.', style('DejaVuSerif', 10.5)),
    ]
    rl_doc(path, story)


def c1_clarification(path):
    # A quick one-page note made with reportlab's default (non-embedded) Helvetica.
    body = style('Helvetica', 10.5, alignment=TA_JUSTIFY, spaceAfter=8)
    story = [
        Paragraph('Clarification No. 1', style('Helvetica-Bold', 17, spaceAfter=6)),
        Paragraph('Tender TR-0417 · Harbour Promenade Lighting Renewal · issued by Brackwater Lighting Co. '
                  'on 21 October 2026 · synthetic sample', style('Helvetica', 9, textColor=colors.HexColor('#4b5563'), spaceAfter=16)),
        Paragraph('Following the clarification meeting with the Town on 19 October 2026, we have revised two '
                  'parts of our response.', body),
        Paragraph('<b>Price schedule.</b> The amount for item 3 now includes the removal and disposal of the '
                  'existing lanterns and brackets. Night-time traffic management, which the Town will no '
                  'longer provide, has been added to the schedule as a new item.', body),
        Paragraph('<b>Order of the annexes.</b> As requested at the meeting, the insurance summary now follows '
                  'the price schedule directly.', body),
        Paragraph('All other parts of the response are unchanged, and the validity of our offer is not '
                  'affected by this clarification.', body),
        Spacer(1, 18),
        Paragraph('Dana Whitcombe, bid manager', body),
    ]
    rl_doc(path, story, margins=(30 * mm, 25 * mm, 30 * mm, 25 * mm))


def c1_insurance(path):
    body = style('LibSans', 10.5, alignment=TA_JUSTIFY, spaceAfter=8)
    data = [['Cover', 'Limit per claim', 'Insurer', 'Expires'],
            ['Public liability', 'EUR 10,000,000', 'Harbourline Mutual (fictitious)', '31 March 2027'],
            ["Employer's liability", 'EUR 5,000,000', 'Harbourline Mutual (fictitious)', '31 March 2027'],
            ['Contract works', 'full contract value', 'Northdeck Insurance (fictitious)', '30 June 2027'],
            ['Professional indemnity', 'EUR 2,000,000', 'Northdeck Insurance (fictitious)', '30 June 2027']]
    t = Table(data, colWidths=[38 * mm, 34 * mm, 62 * mm, 30 * mm])
    t.setStyle(TableStyle([
        ('FONT', (0, 0), (-1, -1), 'LibSans', 9.5),
        ('FONT', (0, 0), (-1, 0), 'LibSans-Bold', 9.5),
        ('LINEBELOW', (0, 0), (-1, 0), 1, colors.HexColor('#374151')),
        ('LINEBELOW', (0, 1), (-1, -1), 0.4, colors.HexColor('#cbd5e1')),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    story = [
        Paragraph('Insurance summary', style('LibSans-Bold', 17, spaceAfter=4)),
        Paragraph('Tender TR-0417 · Brackwater Lighting Co. · synthetic sample', style('LibSans', 9, textColor=colors.HexColor('#4b5563'), spaceAfter=16)),
        Paragraph('Brackwater Lighting Co. holds the insurance policies listed below. The policies will be '
                  'renewed for the duration of the contract and the defects liability period.', body),
        t,
        Spacer(1, 12),
        Paragraph('Certificates for each policy are available on request. The Town will be named as an '
                  'additional insured on the public liability policy from the order date.', body),
    ]
    rl_doc(path, story)


def stamp_pack_footer(writer, label):
    n = len(writer.pages)
    for i, page in enumerate(writer.pages, 1):
        w, h = page_size(page)

        def draw(c, i=i, w=w):
            c.setFont('Helvetica', 7)
            c.setFillColor(colors.HexColor('#6b7280'))
            c.drawRightString(w - 28, 14, f'{label} · page {i} of {n}')
        page.merge_page(overlay_pdf((w, h), draw))


def case1(work, out):
    c1_cover(f'{work}/c1-cover.pdf')
    c1_clarification(f'{work}/c1-clarification.pdf')
    c1_insurance(f'{work}/c1-insurance.pdf')
    parts_before = ['c1-cover', 'c1-technical', 'c1-price-before', 'c1-datasheet',
                    'c1-maintenance', 'c1-nightworks', 'c1-insurance']
    parts_after = ['c1-cover', 'c1-clarification', 'c1-technical', 'c1-price-after',
                   'c1-insurance', 'c1-datasheet', 'c1-maintenance', 'c1-nightworks']
    for which, parts in (('before', parts_before), ('after', parts_after)):
        w = PdfWriter()
        for p in parts:
            w.append(f'{work}/{p}.pdf')
        stamp_pack_footer(w, 'TR-0417 response · Brackwater Lighting Co.')
        write(w, f'{out}/holdout4-g-tender-pack-merge/{which}.pdf')


# ===================================================== case 2: crop and rotate

def c2_site_plan(path):
    W, H = A4
    c = canvas.Canvas(path, pagesize=A4, invariant=1)
    c.setTitle('synthetic sample')
    c.setFont('LibSans-Bold', 15)
    c.drawString(60, H - 70, 'Site plan — inspection zones')
    c.setFont('LibSans', 9.5)
    c.setFillColor(colors.HexColor('#4b5563'))
    c.drawString(60, H - 88, 'Northgate Footbridge FB-112 · Q3 2026 inspection · not to scale · synthetic sample')
    # river
    c.setFillColor(colors.HexColor('#cfe3f3'))
    c.rect(60, 330, W - 120, 170, stroke=0, fill=1)
    c.setFillColor(colors.HexColor('#2b6ca3'))
    c.setFont('LibSans', 9)
    c.drawCentredString(W / 2, 345, 'River Wend (fictitious) → flow')
    # banks / abutments
    c.setFillColor(colors.HexColor('#9ca3af'))
    c.rect(70, 500, 70, 60, stroke=0, fill=1)
    c.rect(W - 140, 500, 70, 60, stroke=0, fill=1)
    # deck
    c.setFillColor(colors.HexColor('#4b5563'))
    c.rect(100, 515, W - 200, 22, stroke=0, fill=1)
    # piers
    c.setFillColor(colors.HexColor('#6b7280'))
    c.rect(W / 2 - 6, 400, 12, 115, stroke=0, fill=1)
    # zone boundaries
    c.setStrokeColor(colors.HexColor('#b91c1c'))
    c.setDash(4, 3)
    c.setLineWidth(1)
    xs = [70, 150, W / 2, W - 150, W - 70]
    for x in xs:
        c.line(x, 480, x, 600)
    c.setDash()
    c.setFillColor(colors.HexColor('#b91c1c'))
    c.setFont('LibSans-Bold', 12)
    for z, (a, b) in zip(['Z1', 'Z2', 'Z3', 'Z4'], zip(xs, xs[1:])):
        c.drawCentredString((a + b) / 2, 580, z)
    # stairway
    c.setStrokeColor(colors.HexColor('#111827'))
    c.setLineWidth(0.8)
    for k in range(6):
        c.line(W - 130 + k * 8, 470, W - 130 + k * 8, 500)
    c.setFillColor(colors.HexColor('#111827'))
    c.setFont('LibSans', 8.5)
    c.drawString(W - 132, 458, 'east stairway')
    # north arrow and scale bar
    c.setLineWidth(1.2)
    c.line(W - 90, 680, W - 90, 720)
    c.line(W - 90, 720, W - 96, 708)
    c.line(W - 90, 720, W - 84, 708)
    c.setFont('LibSans-Bold', 11)
    c.drawCentredString(W - 90, 726, 'N')
    c.setFillColor(colors.black)
    c.rect(60, 290, 50, 5, stroke=0, fill=1)
    c.setFillColor(colors.white)
    c.setStrokeColor(colors.black)
    c.rect(110, 290, 50, 5, stroke=1, fill=1)
    c.setFillColor(colors.black)
    c.setFont('LibSans', 8)
    c.drawString(58, 280, '0')
    c.drawString(106, 280, '10')
    c.drawString(154, 280, '20 m')
    # legend
    c.setFont('LibSans-Bold', 10)
    c.drawString(60, 240, 'Legend')
    c.setFont('LibSans', 9.5)
    rows = [('#4b5563', 'Bridge deck, steel box girder, 46 m'), ('#9ca3af', 'Abutments'),
            ('#6b7280', 'Pier'), ('#b91c1c', 'Zone boundary (dashed)')]
    for k, (col, txt) in enumerate(rows):
        c.setFillColor(colors.HexColor(col))
        c.rect(60, 220 - k * 18, 14, 9, stroke=0, fill=1)
        c.setFillColor(colors.black)
        c.drawString(82, 221 - k * 18, txt)
    c.setFont('LibSans', 8.5)
    c.setFillColor(colors.HexColor('#6b7280'))
    c.drawCentredString(W / 2, 40, 'FB-112 · Q3 2026 inspection report · synthetic sample')
    c.showPage()
    c.save()


def as_rotated_portrait(page):
    """Same look, different structure: a landscape page re-written as a portrait
    MediaBox whose content is turned 90 degrees, displayed with /Rotate 90."""
    w, h = page_size(page)  # landscape: w > h
    from pypdf import PageObject
    new = PageObject.create_blank_page(width=h, height=w)
    # rotate content counter-clockwise by 90 and move it back into the box
    new.merge_transformed_page(page, Transformation().rotate(90).translate(h, 0))
    new.rotate(90)
    return new


def case2(work, out):
    c2_site_plan(f'{work}/c2-siteplan.pdf')
    reg = PdfReader(f'{work}/c2-register.pdf').pages[0]
    plan = PdfReader(f'{work}/c2-siteplan.pdf').pages[0]
    for which in ('before', 'after'):
        rep = PdfReader(f'{work}/c2-report-{which}.pdf')
        w = PdfWriter()
        w.add_page(rep.pages[0])
        w.add_page(plan)
        if which == 'before':
            w.add_page(reg)
        else:
            w.add_page(as_rotated_portrait(reg))
        w.add_page(rep.pages[1])
        if which == 'after':
            w.pages[1].rotate(90)  # site plan turned by mistake
            p4 = w.pages[3]
            pw, ph = page_size(p4)
            p4.cropbox = RectangleObject([0, 0, pw - 40, ph])  # cropped 40 pt on the right
            GEOM['c2_crop_width'] = round(pw - 40, 1)
            GEOM['c2_page_width'] = round(pw, 1)
        write(w, f'{out}/holdout4-g-crop-rotate/{which}.pdf')
    # the planned-works "Budget (EUR)" column on page 4 (words as in the source, before cropping)
    col = [b for t, b in words_bbox(f'{out}/holdout4-g-crop-rotate/before.pdf', 4)
           if t in ('Budget', '(EUR)', '4,800', '2,350', '6,900', '3,150')]
    GEOM['c2_budget_col'] = xywh(rect_union(col), pad=1.5)


# =========================================== case 3: watermark and stationery

def stationery(size, first, version):
    w, h = size
    band = colors.HexColor('#0F766E') if version == 1 else colors.HexColor('#1E3A5F')
    address = ('12 Quay Street, Portmere PM2 4QT' if version == 1 else '4 Mill Lane, Portmere PM1 7RS')

    def draw(c):
        if first:
            c.setFillColor(band)
            c.rect(0, h - 72, w, 72, stroke=0, fill=1)
            # logo mark: ring and two chevrons
            c.setStrokeColor(colors.white)
            c.setLineWidth(2.2)
            c.circle(52, h - 36, 17, stroke=1, fill=0)
            p = c.beginPath()
            p.moveTo(43, h - 30); p.lineTo(52, h - 42); p.lineTo(61, h - 30)
            c.drawPath(p, stroke=1, fill=0)
            p = c.beginPath()
            p.moveTo(43, h - 38); p.lineTo(52, h - 50); p.lineTo(61, h - 38)
            c.drawPath(p, stroke=1, fill=0)
            c.setFillColor(colors.white)
            c.setFont('LibSans-Bold', 16)
            c.drawString(82, h - 34, 'Orrin Vale Advisory')
            c.setFont('LibSans', 8.5)
            c.drawString(82, h - 48, 'Records · governance · information management')
        else:
            c.setFillColor(colors.HexColor('#6b7280'))
            c.setFont('LibSans', 8.5)
            c.drawString(68, h - 44, 'Orrin Vale Advisory')
            c.setStrokeColor(colors.HexColor('#9ca3af'))
            c.setLineWidth(0.5)
            c.line(68, h - 50, w - 68, h - 50)
        c.setStrokeColor(colors.HexColor('#9ca3af'))
        c.setLineWidth(0.5)
        c.line(68, 52, w - 68, 52)
        c.setFillColor(colors.HexColor('#4b5563'))
        c.setFont('LibSans', 8)
        c.drawCentredString(w / 2, 38, f'Orrin Vale Advisory LLP · {address} · synthetic sample')
    return overlay_pdf(size, draw)


def watermark(size):
    w, h = size

    def draw(c):
        c.saveState()
        c.setFillColor(colors.Color(0.45, 0.45, 0.45, alpha=0.18))
        c.translate(w / 2, h / 2)
        c.rotate(45)
        c.setFont('Helvetica-Bold', 140)
        c.drawCentredString(0, -50, 'DRAFT')
        c.restoreState()
    return overlay_pdf(size, draw)


def case3(work, out):
    for which, version in (('before', 1), ('after', 2)):
        content = PdfReader(f'{work}/c3-letter-{which}.pdf')
        w = PdfWriter()
        for i, page in enumerate(content.pages):
            size = page_size(page)
            base = stationery(size, i == 0, version)
            base.merge_page(page)
            if which == 'before':
                base.merge_page(watermark(size))
            w.add_page(base)
        if which == 'before':
            GEOM['c3_pages'] = len(content.pages)
        GEOM['c3_page_size'] = [round(v, 2) for v in page_size(content.pages[0])]
        write(w, f'{out}/holdout4-g-draft-watermark/{which}.pdf')
    o = f'{out}/holdout4-g-draft-watermark'
    GEOM['c3_band'] = diff_rect(f'{o}/before.pdf', 1, f'{o}/after.pdf', 1, clip=[0, 0, 600, 90])
    # page 2 differs only by the watermark (and the footer address below 780 pt)
    GEOM['c3_watermark'] = diff_rect(f'{o}/before.pdf', 2, f'{o}/after.pdf', 2, clip=[0, 60, 600, 720], thr=12)


# ===================================================== case 4: annotations

def _ap(writer, bbox, ops, resources=None):
    s = DecodedStreamObject()
    s.set_data(ops.encode('latin-1'))
    s.update({
        NameObject('/Type'): NameObject('/XObject'),
        NameObject('/Subtype'): NameObject('/Form'),
        NameObject('/BBox'): ArrayObject([FloatObject(v) for v in bbox]),
        NameObject('/Resources'): resources or DictionaryObject(),
    })
    return writer._add_object(s)


def _helv(writer, bold=False):
    f = DictionaryObject({
        NameObject('/Type'): NameObject('/Font'),
        NameObject('/Subtype'): NameObject('/Type1'),
        NameObject('/BaseFont'): NameObject('/Helvetica-Bold' if bold else '/Helvetica'),
        NameObject('/Encoding'): NameObject('/WinAnsiEncoding'),
    })
    return writer._add_object(f)


def _annot(writer, page_index, fields, rect, ap):
    d = DictionaryObject({NameObject('/Type'): NameObject('/Annot')})
    for k, v in fields.items():
        d[NameObject(k)] = v
    d[NameObject('/Rect')] = ArrayObject([FloatObject(v) for v in rect])
    d[NameObject('/F')] = NumberObject(4)
    d[NameObject('/AP')] = DictionaryObject({NameObject('/N'): ap})
    d[NameObject('/M')] = TextStringObject('D:20261102100000Z')
    writer.add_annotation(page_index, d)


def _esc(s):
    return s.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')


def tl_to_pdf(box, page_h):
    """[x0, y0, x1, y1] top-left origin -> PDF rect [x0, y0, x1, y1] bottom-left origin."""
    return [box[0], page_h - box[3], box[2], page_h - box[1]]


def free_text(writer, page_index, page_h, box_tl, lines, fill, border):
    x0, y0, x1, y1 = tl_to_pdf(box_tl, page_h)
    font = _helv(writer)
    res = DictionaryObject({NameObject('/Font'): DictionaryObject({NameObject('/Helv'): font})})
    ops = [f'q {fill} rg {border} RG 0.8 w {x0 + 0.4:.2f} {y0 + 0.4:.2f} {x1 - x0 - 0.8:.2f} {y1 - y0 - 0.8:.2f} re B Q',
           'BT /Helv 9 Tf 0.1 0.1 0.1 rg']
    ty = y1 - 13
    for ln in lines:
        ops.append(f'1 0 0 1 {x0 + 6:.2f} {ty:.2f} Tm ({_esc(ln)}) Tj')
        ty -= 11.5
    ops.append('ET')
    ap = _ap(writer, [x0, y0, x1, y1], '\n'.join(ops), res)
    _annot(writer, page_index, {
        '/Subtype': NameObject('/FreeText'),
        '/Contents': TextStringObject(' '.join(lines)),
        '/DA': TextStringObject('/Helv 9 Tf 0.1 0.1 0.1 rg'),
        '/T': TextStringObject('A. Kowal (reviewer)'),
    }, [x0, y0, x1, y1], ap)


def case4(work, out):
    before_src = f'{work}/c4-agreement-before.pdf'
    after_src = f'{work}/c4-agreement-after.pdf'
    ph = page_size(PdfReader(before_src).pages[0])[1]
    pw = page_size(PdfReader(before_src).pages[0])[0]
    note_box = [pw - 190, 26, pw - 24, 66]  # top margin of page 2, top-left origin

    # before: the reviewer's earlier FreeText note on page 2
    w = PdfWriter(clone_from=before_src)
    free_text(w, 1, ph, note_box, ['Draft for internal review', 'A. Kowal, 27 Oct 2026'],
              '1 0.97 0.80', '0.80 0.62 0.10')
    write(w, f'{out}/holdout4-g-annotated-agreement/before.pdf')

    w = PdfWriter(clone_from=after_src)
    # 1. edited FreeText note (same place)
    free_text(w, 1, ph, note_box, ['Reviewed 2 Nov 2026:', 'two questions open, see notes'],
              '0.88 0.95 1', '0.20 0.45 0.75')
    GEOM['c4_note'] = xywh(note_box)

    # 2. highlight over the liability limitation on page 1
    lines = phrase_lines(after_src, 1, 'The Supplier’s total liability under this agreement is limited to '
                                       'the fees paid in the twelve months before the claim.')
    quads, rects = [], []
    for (x0, y0, x1, y1) in lines:
        x0, y0, x1, y1 = x0 - 1, y0 - 1.5, x1 + 1, y1 + 1.5
        X0, Y0, X1, Y1 = tl_to_pdf([x0, y0, x1, y1], ph)
        quads += [X0, Y1, X1, Y1, X0, Y0, X1, Y0]
        rects.append((X0, Y0, X1, Y1))
    R = [min(r[0] for r in rects), min(r[1] for r in rects), max(r[2] for r in rects), max(r[3] for r in rects)]
    gs = DictionaryObject({NameObject('/Type'): NameObject('/ExtGState'),
                                       NameObject('/BM'): NameObject('/Multiply')})
    res = DictionaryObject({NameObject('/ExtGState'): DictionaryObject({NameObject('/GS0'): w._add_object(gs)})})
    ops = ['q /GS0 gs 1 0.90 0.25 rg'] + [f'{r[0]:.2f} {r[1]:.2f} {r[2] - r[0]:.2f} {r[3] - r[1]:.2f} re f' for r in rects] + ['Q']
    ap = _ap(w, R, '\n'.join(ops), res)
    _annot(w, 0, {
        '/Subtype': NameObject('/Highlight'),
        '/QuadPoints': ArrayObject([FloatObject(v) for v in quads]),
        '/C': ArrayObject([FloatObject(1), FloatObject(0.9), FloatObject(0.25)]),
        '/T': TextStringObject('A. Kowal (reviewer)'),
        '/Contents': TextStringObject('Cap seems low for a clinic system - check with legal.'),
    }, R, ap)
    GEOM['c4_highlight'] = xywh([R[0], ph - R[3], R[2], ph - R[1]])

    # 3. "RECEIVED" stamp in the top margin of page 1
    st_tl = [pw - 178, 22, pw - 40, 64]
    x0, y0, x1, y1 = tl_to_pdf(st_tl, ph)
    res = DictionaryObject({NameObject('/Font'): DictionaryObject({NameObject('/HelvB'): _helv(w, True)})})
    cx = (x0 + x1) / 2
    ops = (f'q 0.78 0.10 0.12 RG 2 w {x0 + 2:.2f} {y0 + 2:.2f} {x1 - x0 - 4:.2f} {y1 - y0 - 4:.2f} re S '
           f'0.6 w {x0 + 5:.2f} {y0 + 5:.2f} {x1 - x0 - 10:.2f} {y1 - y0 - 10:.2f} re S '
           f'BT 0.78 0.10 0.12 rg /HelvB 14 Tf 1 0 0 1 {cx - 38:.2f} {y1 - 22:.2f} Tm (RECEIVED) Tj '
           f'/HelvB 8.5 Tf 1 0 0 1 {cx - 27:.2f} {y0 + 9:.2f} Tm (02 NOV 2026) Tj ET Q')
    ap = _ap(w, [x0, y0, x1, y1], ops, res)
    _annot(w, 0, {
        '/Subtype': NameObject('/Stamp'),
        '/Name': NameObject('/Received'),
        '/T': TextStringObject('Contracts office'),
        '/Contents': TextStringObject('RECEIVED 02 NOV 2026'),
    }, [x0, y0, x1, y1], ap)
    GEOM['c4_stamp'] = xywh(st_tl)

    # 4. sticky note (comment icon) next to the termination clause
    term = phrase_lines(after_src, 2, 'Either party may terminate this agreement with three months’')
    ty = term[0][1]
    icon_tl = [pw - 62, ty - 4, pw - 42, ty + 16]
    x0, y0, x1, y1 = tl_to_pdf(icon_tl, ph)
    ops = (f'q 1 0.85 0.20 rg 0.35 0.28 0.05 RG 0.9 w {x0 + 0.5:.2f} {y0 + 4:.2f} 19 15.5 re B '
           f'{x0 + 4:.2f} {y0 + 4:.2f} m {x0 + 3:.2f} {y0 + 0.5:.2f} l {x0 + 8:.2f} {y0 + 4:.2f} l f '
           f'0.6 w {x0 + 4:.2f} {y0 + 15:.2f} m {x0 + 16:.2f} {y0 + 15:.2f} l S '
           f'{x0 + 4:.2f} {y0 + 11.5:.2f} m {x0 + 16:.2f} {y0 + 11.5:.2f} l S '
           f'{x0 + 4:.2f} {y0 + 8:.2f} m {x0 + 12:.2f} {y0 + 8:.2f} l S Q')
    ap = _ap(w, [x0, y0, x1, y1], ops)
    _annot(w, 1, {
        '/Subtype': NameObject('/Text'),
        '/Name': NameObject('/Comment'),
        '/T': TextStringObject('A. Kowal (reviewer)'),
        '/Contents': TextStringObject('Is three months enough for a data migration?'),
        '/Open': BooleanObject(False),
    }, [x0, y0, x1, y1], ap)
    GEOM['c4_sticky'] = xywh(icon_tl)
    write(w, f'{out}/holdout4-g-annotated-agreement/after.pdf')


# ========================================================= case 5: form values

FORM_FIELDS = [
    # (section, label EN, label ZH, field name, kind)
    ('1  Applicant  申请人', [
        ('Applicant name', '申请人姓名', 'applicant', 'text'),
        ('Department', '部门', 'department', 'text'),
        ('Phone extension', '分机号', 'phone', 'text'),
    ]),
    ('2  Equipment  设备', [
        ('Item', '设备名称', 'item', 'text'),
        ('Asset tag', '资产编号', 'asset_tag', 'text'),
        ('Accessories included', '含配件', 'accessories', 'check'),
    ]),
    ('3  Loan  借用', [
        ('Start date', '开始日期', 'start_date', 'text'),
        ('Loan period (days)', '借用天数', 'loan_days', 'text'),
        ('Deposit (EUR)', '押金（欧元）', 'deposit', 'text'),
        ('Insurance required', '需要保险', 'insurance', 'check'),
    ]),
    ('4  Purpose  用途', [
        ('Purpose of the loan', '借用用途', 'purpose', 'multiline'),
    ]),
    ('5  Collection  领取', [
        ('Collected by', '领取人', 'collected_by', 'text'),
        ('Approved by (store)', '批准人（库房）', 'approved_by', 'text'),
    ]),
]


def c5_template(path):
    W, H = A4
    c = canvas.Canvas(path, pagesize=A4, invariant=1)
    c.setTitle('Equipment loan request (synthetic sample)')
    c.setFont('LibSans-Bold', 18)
    c.drawString(50, H - 62, 'Equipment loan request')
    c.setFont('WQY', 14)
    c.drawString(50, H - 82, '设备借用申请表')
    c.setFont('LibSans', 8.5)
    c.setFillColor(colors.HexColor('#4b5563'))
    c.drawString(50, H - 98, 'Form EQ-7 rev. 3 · Equipment store, building B · synthetic sample')
    c.setFillColor(colors.black)
    form = c.acroForm
    y = H - 130
    boxes = {}
    for section, rows in FORM_FIELDS:
        c.setFillColor(colors.HexColor('#e5e7eb'))
        c.rect(50, y - 4, W - 100, 18, stroke=0, fill=1)
        c.setFillColor(colors.black)
        c.setFont('LibSans-Bold', 10.5)
        en, zh = section.split('  ', 1)[0], section.split('  ', 1)[1]
        c.drawString(56, y + 1, en + '  ' + zh.split('  ')[0])
        c.setFont('WQY', 10)
        c.drawString(56 + pdfmetrics.stringWidth(en + '  ' + zh.split('  ')[0], 'LibSans-Bold', 10.5) + 6, y + 1,
                     zh.split('  ')[1])
        y -= 30
        for en_l, zh_l, name, kind in rows:
            c.setFont('LibSans', 10)
            c.drawString(56, y + 4, en_l)
            c.setFont('WQY', 9.5)
            c.drawString(56 + pdfmetrics.stringWidth(en_l, 'LibSans', 10) + 6, y + 4, zh_l)
            if kind == 'text':
                form.textfield(name=name, x=235, y=y - 1, width=300, height=18, value='', fontName='Helvetica',
                               fontSize=10, borderWidth=0.8, borderColor=colors.HexColor('#6b7280'),
                               fillColor=colors.white, textColor=colors.black, forceBorder=True)
                boxes[name] = [235, H - (y - 1) - 18, 300, 18]
                y -= 27
            elif kind == 'check':
                form.checkbox(name=name, x=235, y=y, size=13, checked=False, buttonStyle='check',
                              borderWidth=0.8, borderColor=colors.HexColor('#6b7280'),
                              fillColor=colors.white, textColor=colors.black, forceBorder=True)
                boxes[name] = [235, H - y - 13, 13, 13]
                y -= 27
            else:
                form.textfield(name=name, x=235, y=y - 34, width=300, height=52, value='', fontName='Helvetica',
                               fontSize=10, borderWidth=0.8, borderColor=colors.HexColor('#6b7280'),
                               fillColor=colors.white, textColor=colors.black, fieldFlags='multiline',
                               forceBorder=True)
                boxes[name] = [235, H - (y - 34) - 52, 300, 52]
                y -= 62
        y -= 8
    # signature box (not a field)
    c.setFont('LibSans', 10)
    c.drawString(56, y + 4, 'Signature of the person collecting')
    c.setFont('WQY', 9.5)
    c.drawString(56 + pdfmetrics.stringWidth('Signature of the person collecting', 'LibSans', 10) + 6, y + 4, '签名')
    c.setStrokeColor(colors.HexColor('#6b7280'))
    c.setLineWidth(0.8)
    c.rect(235, y - 30, 300, 44, stroke=1, fill=0)
    c.setFont('LibSans', 8)
    c.setFillColor(colors.HexColor('#4b5563'))
    c.drawString(50, 50, 'Return this form to the equipment store before collection.')
    c.setFont('WQY', 8)
    c.drawString(50, 38, '领取设备前请将此表交回设备库房。')
    c.setFont('LibSans', 8)
    c.drawRightString(W - 50, 38, 'synthetic sample · page 1 of 1')
    c.showPage()
    c.save()
    return boxes


def c5_fill(template, values, path):
    w = PdfWriter(clone_from=template)
    text_vals = {k: v for k, v in values.items() if not isinstance(v, bool)}
    w.update_page_form_field_values(w.pages[0], text_vals, auto_regenerate=False)
    # checkboxes: set /V and /AS to the on state or /Off
    for a in w.pages[0]['/Annots']:
        a = a.get_object()
        name = a.get('/T')
        if name in values and isinstance(values[name], bool):
            on = [k for k in a['/AP']['/N'].keys() if k != '/Off'][0]
            state = NameObject(on if values[name] else '/Off')
            a[NameObject('/V')] = state
            a[NameObject('/AS')] = state
    write(w, path)


def case5(work, out):
    tpl = f'{work}/c5-template.pdf'
    boxes = c5_template(tpl)
    common = dict(applicant='Lena Marsh', department='Field Survey Unit', phone='4417',
                  item='Laser distance meter LD-40', asset_tag='EQ-20418', accessories=True,
                  start_date='9 Nov 2026',
                  purpose='Survey of the east car park extension.\nThe meter is returned to Store B\n'
                          'at the end of the loan.',
                  approved_by='K. Brandt')
    before = dict(common, loan_days='14', deposit='250.00', insurance=False, collected_by='Ana Duarte')
    after = dict(common, loan_days='21', deposit='400.00', insurance=True, collected_by='Tomas Reid')
    c5_fill(tpl, before, f'{out}/holdout4-g-form-values/before.pdf')
    c5_fill(tpl, after, f'{out}/holdout4-g-form-values/after.pdf')
    GEOM['c5_boxes'] = boxes


# ================================================ case 6: scanned schedule page

def c6_schedule_source(path):
    body = style('LibSerif', 11.5, spaceAfter=9, leading=15.5)
    rules = [
        'Cleaning staff enter the building only through the staff entrance on Orchard Row.',
        'Each member of staff signs in and out in the visitors’ book at the staff entrance.',
        'The alarm is set by the last person to leave. Alarm codes must not be written down.',
        'Contractors’ vans may park in bay C between 07:00 and 19:00 only.',
        'Consulting rooms are cleaned only when the door is unlocked. Locked rooms are left.',
        'Sharps containers and clinical waste bags are never handled by cleaning staff.',
        'Any damage, leak or unlocked medicine cabinet is reported to the practice manager.',
    ]
    story = [
        Paragraph('Schedule 2 — Site access rules', style('LibSerif-Bold', 16, spaceAfter=4)),
        Paragraph('Agreement CS-0912 · 7 Orchard Row · synthetic sample', style('LibSerif', 10, spaceAfter=18)),
    ]
    for i, r in enumerate(rules, 1):
        story.append(Paragraph(f'{i}.&nbsp;&nbsp;{r}', body))
    story += [Spacer(1, 30), Paragraph('Acknowledged for the Client:', body), Spacer(1, 50),
              Paragraph('______________________________', body),
              Paragraph('Dr Imke Sørensen, practice manager', body)]
    rl_doc(path, story, margins=(30 * mm, 25 * mm, 30 * mm, 25 * mm))


def _pen(draw, pts, width, fill):
    for a, b in zip(pts, pts[1:]):
        draw.line([a, b], fill=fill, width=width)
        r = width / 2
        draw.ellipse([b[0] - r, b[1] - r, b[0] + r, b[1] + r], fill=fill)


def c6_scans(work):
    src = f'{work}/c6-schedule-src.pdf'
    c6_schedule_source(src)
    dpi = 150
    subprocess.run(['pdftoppm', '-r', str(dpi), '-gray', '-png', '-singlefile', src, f'{work}/c6-scan-raw'],
                   check=True)
    raw = Image.open(f'{work}/c6-scan-raw.png').convert('L')
    s = dpi / 72.0
    # client's handwritten signature (in both versions) on the acknowledgement line
    sig_line = phrase_lines(src, 1, '______________________________')[0]
    hand = ImageDraw.Draw(raw)
    sx, sy = sig_line[0] * s + 20, sig_line[1] * s - 6
    pts = [(sx + t * 3.2, sy - 26 * math.sin(t / 9.0) * (1 - t / 140) - 8 * math.sin(t / 2.3)) for t in range(110)]
    _pen(hand, pts, 3, 40)
    raw_before = raw.copy()
    # after: the time in rule 4 is struck through by hand and corrected, with initials
    t07 = phrase_lines(src, 1, '07:00')[0]
    x0, y0, x1, y1 = [v * s for v in t07]
    raw_after = raw.copy()
    d = ImageDraw.Draw(raw_after)
    ym = (y0 + y1) / 2 + 1
    _pen(d, [(x0 - 6, ym + 3), (x0 + (x1 - x0) / 2, ym - 2), (x1 + 8, ym)], 4, 25)
    hf = ImageFont.truetype(f'{FONTS}/liberation/LiberationSans-Italic.ttf', 32)
    d.text((x0 - 4, y0 - 40), '06:30', font=hf, fill=25)
    d.text((x1 + 40, y0 - 34), 'IS', font=ImageFont.truetype(f'{FONTS}/liberation/LiberationSans-Italic.ttf', 24), fill=25)

    def scan(img, path):
        im = img.rotate(0.35, resample=Image.BICUBIC, fillcolor=255)
        a = np.asarray(im).astype(np.float32)
        a = 236 * (a / 255.0) + 6  # paper tone, toner not fully black
        rng = np.random.default_rng(20261030)
        a += rng.normal(0, 4.0, a.shape)
        a = np.clip(a, 0, 255).astype(np.uint8)
        im = Image.fromarray(a, 'L').filter(ImageFilter.GaussianBlur(0.5))
        im.save(path, quality=82)
        return np.asarray(im).astype(np.int16)

    A = scan(raw_before, f'{work}/c6-scan-before.jpg')
    B = scan(raw_after, f'{work}/c6-scan-after.jpg')
    diff = np.abs(A - B) > 40
    ys, xs = np.nonzero(diff)
    W, H = A4
    k = W / raw.width  # image pixels -> page points (the scan fills the page)
    GEOM['c6_scan_change'] = [round(xs.min() * k, 1), round(ys.min() * k, 1),
                              round((xs.max() - xs.min()) * k, 1), round((ys.max() - ys.min()) * k, 1)]
    for which in ('before', 'after'):
        c = canvas.Canvas(f'{work}/c6-scan-{which}.pdf', pagesize=A4, invariant=1)
        # an ImageReader keeps the XObject name independent of the work-dir path
        c.drawImage(ImageReader(f'{work}/c6-scan-{which}.jpg'), 0, 0, width=W, height=H)
        c.showPage()
        c.save()


def case6(work, out):
    c6_scans(work)
    for which in ('before', 'after'):
        agr = PdfReader(f'{work}/c6-agreement-{which}.pdf')
        scan = PdfReader(f'{work}/c6-scan-{which}.pdf')
        w = PdfWriter()
        w.add_page(agr.pages[0])
        w.add_page(agr.pages[1])
        w.add_page(scan.pages[0])
        w.add_page(agr.pages[2])
        write(w, f'{out}/holdout4-g-scanned-schedule/{which}.pdf')
    o = f'{out}/holdout4-g-scanned-schedule'
    GEOM['c6_sig'] = diff_rect(f'{o}/before.pdf', 2, f'{o}/after.pdf', 2)
    GEOM['c6_scan_change_rendered'] = diff_rect(f'{o}/before.pdf', 3, f'{o}/after.pdf', 3, thr=40)


def main(work, out):
    case1(work, out)
    case2(work, out)
    case3(work, out)
    case4(work, out)
    case5(work, out)
    case6(work, out)
    with open(f'{work}/geometry.json', 'w') as f:
        json.dump(GEOM, f, indent=1)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])

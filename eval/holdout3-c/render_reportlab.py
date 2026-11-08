#!/usr/bin/env python3
"""Render a held-out-3 (author c) document spec to PDF with reportlab.

Usage:  python3 -I eval/holdout3-c/render_reportlab.py SPEC.json OUT.pdf

The spec is written by eval/make-holdout3-c.mjs. It is a small block model:
title / h / p / bullets / table / space / pagebreak, plus running header and
footer strings in which {p} and {n} become the page number and page count.
Paragraph text uses reportlab's mini-markup (<b>, <i>); the generator escapes
'&', '<' and '>' in plain text before it gets here.

All content is synthetic. Output is reproducible (invariant=1: fixed dates
and document ID).
"""
import json
import sys

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import (KeepTogether, ListFlowable, ListItem, PageBreak,
                                Paragraph, SimpleDocTemplate, Spacer, Table,
                                TableStyle)
from reportlab.lib.fonts import addMapping

LIB = '/usr/share/fonts/truetype/liberation/'
FAMILIES = {
    'LiberationSans': ('LiberationSans-Regular.ttf', 'LiberationSans-Bold.ttf',
                       'LiberationSans-Italic.ttf', 'LiberationSans-BoldItalic.ttf'),
    'LiberationSerif': ('LiberationSerif-Regular.ttf', 'LiberationSerif-Bold.ttf',
                        'LiberationSerif-Italic.ttf', 'LiberationSerif-BoldItalic.ttf'),
}


def register_fonts():
    for fam, files in FAMILIES.items():
        names = [fam, fam + '-Bold', fam + '-Italic', fam + '-BoldItalic']
        for name, f in zip(names, files):
            pdfmetrics.registerFont(TTFont(name, LIB + f))
        addMapping(fam, 0, 0, names[0])
        addMapping(fam, 1, 0, names[1])
        addMapping(fam, 0, 1, names[2])
        addMapping(fam, 1, 1, names[3])


ALIGN = {'L': TA_LEFT, 'R': TA_RIGHT, 'C': TA_CENTER, 'J': TA_JUSTIFY}


def build(spec, out):
    register_fonts()
    font = spec.get('font', 'LiberationSerif')
    size = spec.get('size', 10.5)
    leading = spec.get('leading', size * 1.38)
    ink = colors.HexColor(spec.get('ink', '#1d2228'))
    muted = colors.HexColor('#5d646c')
    rule = colors.HexColor('#9aa3ab')
    m = spec.get('margins', [22, 22, 24, 24])  # left, right, top, bottom (mm)

    st = {
        'p': ParagraphStyle('p', fontName=font, fontSize=size, leading=leading,
                            alignment=TA_JUSTIFY, spaceAfter=size * 0.6, textColor=ink),
        'title': ParagraphStyle('title', fontName=font + '-Bold', fontSize=size * 1.75,
                                leading=size * 2.1, spaceAfter=size * 0.4, textColor=ink),
        'subtitle': ParagraphStyle('subtitle', fontName=font, fontSize=size * 1.05,
                                   leading=size * 1.4, spaceAfter=size * 1.1, textColor=muted),
        'h': ParagraphStyle('h', fontName=font + '-Bold', fontSize=size * 1.18,
                            leading=size * 1.5, spaceBefore=size * 0.9, spaceAfter=size * 0.35,
                            textColor=ink, keepWithNext=1),
        'small': ParagraphStyle('small', fontName=font, fontSize=size * 0.78,
                                leading=size * 1.05, spaceAfter=size * 0.4, textColor=muted),
        'li': ParagraphStyle('li', fontName=font, fontSize=size, leading=leading,
                             alignment=TA_LEFT, textColor=ink),
    }

    flow = []
    for b in spec['blocks']:
        t = b['t']
        if t in ('p', 'title', 'subtitle', 'h', 'small'):
            style = st[t]
            if b.get('align'):
                style = ParagraphStyle(t + '-a', parent=style, alignment=ALIGN[b['align']])
            text = b['text']
            if b.get('bold'):
                text = '<b>' + text + '</b>'
            flow.append(Paragraph(text, style))
        elif t == 'bullets':
            items = [ListItem(Paragraph(x, st['li']), leftIndent=14)
                     for x in b['items']]
            flow.append(ListFlowable(items, bulletType='bullet', start='•',
                                     leftIndent=14, bulletFontName=font,
                                     bulletFontSize=size, spaceAfter=size * 0.6))
            flow.append(Spacer(1, size * 0.4))
        elif t == 'space':
            flow.append(Spacer(1, b['h']))
        elif t == 'pagebreak':
            flow.append(PageBreak())
        elif t == 'table':
            fs = b.get('size', size * 0.9)
            aligns = b.get('align', 'L' * len(b['rows'][0]))
            header_rows = b.get('header', 1)
            bold_rows = set(b.get('bold', []))
            cells = []
            for ri, row in enumerate(b['rows']):
                out_row = []
                for ci, cell in enumerate(row):
                    bold = ri < header_rows or ri in bold_rows
                    ps = ParagraphStyle('c', fontName=font + ('-Bold' if bold else ''),
                                        fontSize=fs, leading=fs * 1.25, textColor=ink,
                                        alignment=ALIGN[aligns[ci]])
                    out_row.append(Paragraph(cell, ps))
                cells.append(out_row)
            widths = [w * mm for w in b['widths']]
            tbl = Table(cells, colWidths=widths, repeatRows=header_rows if b.get('repeat') else 0,
                        hAlign='LEFT')
            cmds = [
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('TOPPADDING', (0, 0), (-1, -1), 2.2),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 2.6),
                ('LEFTPADDING', (0, 0), (-1, -1), 4),
                ('RIGHTPADDING', (0, 0), (-1, -1), 4),
            ]
            if b.get('grid'):
                cmds.append(('GRID', (0, 0), (-1, -1), 0.5, rule))
            else:
                cmds.append(('LINEBELOW', (0, header_rows - 1), (-1, header_rows - 1), 0.9, ink))
                cmds.append(('LINEBELOW', (0, header_rows), (-1, -1), 0.35, rule))
            if b.get('shade_header', True) and header_rows:
                cmds.append(('BACKGROUND', (0, 0), (-1, header_rows - 1), colors.HexColor('#e8ecef')))
            for r in b.get('rule_above', []):
                cmds.append(('LINEABOVE', (0, r), (-1, r), 0.9, ink))
            tbl.setStyle(TableStyle(cmds))
            flow.append(tbl)
            flow.append(Spacer(1, b.get('after', size * 0.9)))
        else:
            raise ValueError('unknown block ' + t)

    header = spec.get('header', {})
    footer = spec.get('footer', {})
    fsize = spec.get('furnitureSize', 7.5)
    W, H = A4
    left, right, top, bottom = (x * mm for x in m)

    class Furnished(canvas.Canvas):
        """Two-pass canvas so that footers can say 'Page p of n'."""

        def __init__(self, *a, **k):
            super().__init__(*a, **k)
            self._pages = []

        def showPage(self):
            self._pages.append(dict(self.__dict__))
            self._startPage()

        def save(self):
            n = len(self._pages)
            for state in self._pages:
                self.__dict__.update(state)
                self._furniture(n)
                canvas.Canvas.showPage(self)
            canvas.Canvas.save(self)

        def _furniture(self, n):
            p = self._pageNumber
            fill = lambda s: s.replace('{p}', str(p)).replace('{n}', str(n))
            self.saveState()
            self.setFont(font, fsize)
            self.setFillColor(muted)
            y_head = H - top + 9 * mm
            y_foot = bottom - 11 * mm
            if header.get('left'):
                self.drawString(left, y_head, fill(header['left']))
            if header.get('right'):
                self.drawRightString(W - right, y_head, fill(header['right']))
            if header.get('rule', True) and header:
                self.setStrokeColor(rule)
                self.setLineWidth(0.4)
                self.line(left, y_head - 3, W - right, y_head - 3)
            if footer.get('left'):
                self.drawString(left, y_foot, fill(footer['left']))
            if footer.get('right'):
                self.drawRightString(W - right, y_foot, fill(footer['right']))
            self.restoreState()

    doc = SimpleDocTemplate(out, pagesize=A4, leftMargin=left, rightMargin=right,
                            topMargin=top, bottomMargin=bottom, invariant=1,
                            title=spec.get('title', ''), author='synthetic sample',
                            creator='reportlab (ChangeLens held-out-3 generator, author c)')
    doc.build(flow, canvasmaker=Furnished)


if __name__ == '__main__':
    with open(sys.argv[1], encoding='utf-8') as f:
        build(json.load(f), sys.argv[2])

"""Case holdout4-e-pptx-board-deck: a quarterly board deck revised in PowerPoint
(python-pptx deck with a native chart and tables, exported to PDF by LibreOffice Impress).

Usage: python3 deck.py <outdir>   -> writes before.pptx and after.pptx
Synthetic sample: the company, figures and people are invented.
"""

import copy
import os
import sys

from lxml import etree
from pptx import Presentation
from pptx.chart.data import CategoryChartData
from pptx.dml.color import RGBColor
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Emu, Inches, Pt

COMPANY = "Marrowgate Freight Group"
INK = RGBColor(0x1B, 0x26, 0x33)
MUTED = RGBColor(0x5B, 0x67, 0x75)
ACCENT = RGBColor(0x0F, 0x6E, 0x6A)
FONT = "Calibri"


def textbox(slide, x, y, w, h, paragraphs, size=18, color=INK, bold=False, align=None, anchor=MSO_ANCHOR.TOP):
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = Inches(0.05)
    for i, para in enumerate(paragraphs):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        if isinstance(para, str):
            para = {"text": para}
        r = p.add_run()
        r.text = para["text"]
        f = r.font
        f.name = FONT
        f.size = Pt(para.get("size", size))
        f.bold = para.get("bold", bold)
        f.color.rgb = para.get("color", color)
        if align:
            p.alignment = align
        p.space_after = Pt(para.get("space_after", 6))
    return tb


def bullets(slide, x, y, w, h, items, size=20):
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    for i, text in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        pPr = p._p.get_or_add_pPr()
        pPr.set("marL", str(Inches(0.32)))
        pPr.set("indent", str(-Inches(0.32)))
        bu = etree.SubElement(pPr, "{http://schemas.openxmlformats.org/drawingml/2006/main}buChar")
        bu.set("char", "•")
        r = p.add_run()
        r.text = text
        r.font.name = FONT
        r.font.size = Pt(size)
        r.font.color.rgb = INK
        p.space_after = Pt(10)
    return tb


def slide_number_field(paragraph, size):
    ns = "http://schemas.openxmlformats.org/drawingml/2006/main"
    fld = etree.SubElement(paragraph._p, f"{{{ns}}}fld")
    fld.set("id", "{B6F15528-21DE-4FAA-801E-634DDDAF4B2B}")
    fld.set("type", "slidenum")
    rpr = etree.SubElement(fld, f"{{{ns}}}rPr")
    rpr.set("lang", "en-GB")
    rpr.set("sz", str(int(size * 100)))
    fill = etree.SubElement(rpr, f"{{{ns}}}solidFill")
    clr = etree.SubElement(fill, f"{{{ns}}}srgbClr")
    clr.set("val", "5B6775")
    latin = etree.SubElement(rpr, f"{{{ns}}}latin")
    latin.set("typeface", FONT)
    t = etree.SubElement(fld, f"{{{ns}}}t")
    t.text = "1"


def furniture(slide, after):
    date = "21 October 2026" if after else "14 October 2026"
    textbox(slide, 0.6, 7.0, 9.0, 0.35, [f"{COMPANY} · Board meeting {date} · Synthetic sample · Confidential"], size=10, color=MUTED)
    tb = textbox(slide, 11.9, 7.0, 0.85, 0.35, [""], size=10, color=MUTED, align=PP_ALIGN.RIGHT)
    p = tb.text_frame.paragraphs[0]
    for r in list(p.runs):
        p._p.remove(r._r)
    slide_number_field(p, 10)
    line = slide.shapes.add_connector(1, Inches(0.6), Inches(6.9), Inches(12.73), Inches(6.9))
    line.line.color.rgb = RGBColor(0xC9, 0xD1, 0xD9)
    line.line.width = Pt(0.75)


def title(slide, text, kicker=None):
    if kicker:
        textbox(slide, 0.6, 0.35, 12, 0.4, [kicker], size=12, color=ACCENT, bold=True)
    textbox(slide, 0.6, 0.7, 12, 0.8, [text], size=30, bold=True)


def table(slide, x, y, w, rows, col_widths, size=16, header_fill="DCE6EA", bold_first_col=False):
    shape = slide.shapes.add_table(len(rows), len(rows[0]), Inches(x), Inches(y), Inches(w), Inches(0.5 * len(rows)))
    tbl = shape.table
    for j, cw in enumerate(col_widths):
        tbl.columns[j].width = Inches(cw)
    for i, row in enumerate(rows):
        tbl.rows[i].height = Inches(0.5)
        for j, val in enumerate(row):
            cell = tbl.cell(i, j)
            cell.fill.solid()
            cell.fill.fore_color.rgb = RGBColor.from_string(header_fill) if i == 0 else RGBColor(0xFF, 0xFF, 0xFF)
            cell.vertical_anchor = MSO_ANCHOR.MIDDLE
            tf = cell.text_frame
            p = tf.paragraphs[0]
            p.alignment = PP_ALIGN.RIGHT if j > 0 else PP_ALIGN.LEFT
            r = p.add_run()
            r.text = val
            r.font.name = FONT
            r.font.size = Pt(size)
            r.font.bold = i == 0 or (bold_first_col and j == 0 and False)
            r.font.color.rgb = INK
    return shape


def build(v):
    after = v == "after"
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank = prs.slide_layouts[6]
    prs.core_properties.author = "Synthetic sample generator"
    prs.core_properties.title = "Quarterly Board Update Q3 2026"

    # 1 title
    s = prs.slides.add_slide(blank)
    bar = s.shapes.add_shape(1, 0, 0, prs.slide_width, Inches(0.22))
    bar.fill.solid()
    bar.fill.fore_color.rgb = ACCENT
    bar.line.fill.background()
    textbox(s, 0.9, 2.3, 11.5, 1.2, ["Quarterly Board Update"], size=44, bold=True)
    textbox(s, 0.9, 3.4, 11.5, 0.8, ["Q3 2026 · July to September"], size=26, color=MUTED)
    textbox(s, 0.9, 4.4, 11.5, 0.8, [f"{COMPANY} · prepared by the Group Finance Director"], size=18, color=MUTED)
    furniture(s, after)

    # 2 agenda
    s = prs.slides.add_slide(blank)
    title(s, "Agenda")
    bullets(s, 0.9, 1.8, 11, 4.5, [
        "Q3 at a glance",
        "Revenue by region",
        "Cash and capital expenditure",
        "Principal risks",
        "Decisions requested and items for noting",
    ], size=24)
    furniture(s, after)

    # 3 KPIs
    s = prs.slides.add_slide(blank)
    title(s, "Q3 at a glance", kicker="PERFORMANCE")
    rows = [
        ["Measure", "Q3 2026", "Q3 2025", "Target"],
        ["Revenue, €m", "48.6", "44.1", "47.0"],
        ["EBITDA margin", "13.6%" if after else "14.2%", "13.1%", "14.0%"],
        ["Free cash flow, €m", "0.4" if after else "−1.8", "2.3", "1.0"],
        ["Net debt, €m", "12.4", "15.9", "13.0"],
        ["On-time delivery", "94.8%", "93.2%", "95.0%"],
        ["Lost-time injuries", "3", "5", "0"],
    ]
    table(s, 0.9, 1.75, 7.6, rows, [3.4, 1.4, 1.4, 1.4], size=16)
    textbox(s, 9.0, 1.75, 3.7, 4.0, [
        {"text": "Commentary", "bold": True, "size": 16},
        {"text": "Revenue ahead of target on contract wins in DACH.", "size": 15},
        {"text": "Margin held back by fuel and agency driver costs.", "size": 15},
        {"text": "Working capital improved after the invoicing backlog was cleared.", "size": 15},
    ], size=15)
    furniture(s, after)

    # 4 chart
    s = prs.slides.add_slide(blank)
    title(s, "Revenue by region", kicker="PERFORMANCE")
    data = CategoryChartData()
    data.categories = ["Nordics", "Benelux", "DACH", "UK & Ireland"]
    data.add_series("Q1 2026", (9.8, 10.4, 14.1, 8.9))
    data.add_series("Q2 2026", (10.1, 10.9, 15.0, 9.2))
    data.add_series("Q3 2026", (10.6, 12.6 if after else 11.2, 16.4, 9.0))
    gf = s.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(0.9), Inches(1.7), Inches(8.2), Inches(4.9), data)
    ch = gf.chart
    ch.has_legend = True
    ch.legend.position = XL_LEGEND_POSITION.BOTTOM
    ch.legend.include_in_layout = False
    ch.legend.font.size = Pt(12)
    ch.legend.font.name = FONT
    va = ch.value_axis
    va.minimum_scale = 0
    va.maximum_scale = 20
    va.major_unit = 5
    va.has_major_gridlines = True
    va.major_gridlines.format.line.color.rgb = RGBColor(0xDD, 0xE2, 0xE7)
    va.tick_labels.font.size = Pt(12)
    va.tick_labels.font.name = FONT
    ca = ch.category_axis
    ca.tick_labels.font.size = Pt(12)
    ca.tick_labels.font.name = FONT
    colors = [RGBColor(0xB8, 0xC9, 0xD6), RGBColor(0x6F, 0x9B, 0xB5), ACCENT]
    for series, colr in zip(ch.plots[0].series, colors):
        series.format.fill.solid()
        series.format.fill.fore_color.rgb = colr
    textbox(s, 9.5, 1.75, 3.2, 4.5, [
        {"text": "€m, by quarter", "bold": True, "size": 16},
        {"text": "DACH remains the largest region after the new retail contract.", "size": 15},
        {"text": "UK & Ireland flat; pricing review under way.", "size": 15},
    ], size=15)
    furniture(s, after)

    # 5 cash and capex
    s = prs.slides.add_slide(blank)
    title(s, "Cash and capital expenditure", kicker="CASH")
    rows = [
        ["Project", "Approved, €m", "Spent to date, €m", "Forecast, €m"],
        ["North hub cross-dock expansion", "6.8", "0.9", "6.8"],
        ["Fleet electrification, phase 1", "4.2", "2.6", "4.4"],
        ["Warehouse management system", "2.9", "2.1", "3.1"],
        ["Yard safety improvements", "0.7", "0.5", "0.7"],
        ["Total", "14.6", "6.1", "15.0"],
    ]
    table(s, 0.9, 1.75, 11.5, rows, [5.5, 2.0, 2.0, 2.0], size=16)
    textbox(s, 0.9, 5.2, 11.5, 1.2, [
        {"text": "Headroom on the revolving credit facility at 30 September: €21.5m. Covenant leverage 1.6x against a limit of 3.0x.", "size": 15},
    ])
    furniture(s, after)

    # 5b inserted slide (new version only)
    if after:
        s = prs.slides.add_slide(blank)
        title(s, "Cyber incident update", kicker="NEW SINCE THE LAST MEETING")
        bullets(s, 0.9, 1.8, 11.5, 4.5, [
            "Phishing attack on the Benelux customer portal detected on 2 October",
            "No customer data taken; portal restored within 9 hours",
            "External review of portal security due by 30 November",
        ], size=20)
        furniture(s, after)

    # 6 risks
    s = prs.slides.add_slide(blank)
    title(s, "Principal risks", kicker="RISK")
    bullets(s, 0.9, 1.8, 11.5, 4.8, [
        "Fuel price volatility: 60% of expected 2027 volume hedged",
        "Driver shortage in DACH: recruitment campaign " + ("extended to Q1 2027" if after else "launched in September"),
        "Customer concentration: top three customers are 31% of revenue",
        "Warehouse automation delivery: supplier milestones two weeks late",
    ], size=20)
    furniture(s, after)

    # 7 decisions
    decisions = [
        "Capex of €6.8m for the North hub cross-dock expansion (paper A)",
        "2027 budget timetable and planning assumptions (paper B)",
    ]
    noting = [
        "Insurance programme renewed on 1 October",
        "External audit tender: three firms shortlisted",
        "Health and safety report for Q3 (paper D)",
    ]
    moved = "Treasury policy review and new counterparty limits (paper C)"
    if after:
        noting.append(moved)
    else:
        decisions.append(moved)
    s = prs.slides.add_slide(blank)
    title(s, "Decisions requested", kicker="FOR DECISION")
    bullets(s, 0.9, 1.8, 11.5, 4.5, decisions, size=20)
    furniture(s, after)

    # 8 noting
    s = prs.slides.add_slide(blank)
    title(s, "Items for noting", kicker="FOR NOTING")
    bullets(s, 0.9, 1.8, 11.5, 4.5, noting, size=20)
    furniture(s, after)

    # 9 appendix
    s = prs.slides.add_slide(blank)
    title(s, "Appendix: definitions", kicker="APPENDIX")
    bullets(s, 0.9, 1.8, 11.5, 4.5, [
        "EBITDA margin: earnings before interest, tax, depreciation and amortisation, divided by revenue",
        "Free cash flow: cash from operations less capital expenditure and lease payments",
        "Net debt: borrowings and lease liabilities less cash",
        "On-time delivery: share of consignments delivered within the agreed slot",
    ], size=17)
    furniture(s, after)
    return prs


if __name__ == "__main__":
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    for v in ("before", "after"):
        build(v).save(os.path.join(out, f"{v}.pptx"))

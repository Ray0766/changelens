"""Small python-docx helpers shared by the LibreOffice cases of holdout4-f."""

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor


def set_run_fonts(run_or_style_element, ascii_font=None, east_asia=None, lang_ea=None):
    """Set w:rFonts (ascii/hAnsi/eastAsia) and w:lang on a run or style rPr."""
    rpr = run_or_style_element.get_or_add_rPr()
    rfonts = rpr.find(qn('w:rFonts'))
    if rfonts is None:
        rfonts = OxmlElement('w:rFonts')
        rpr.insert(0, rfonts)
    for attr in ('w:asciiTheme', 'w:hAnsiTheme', 'w:eastAsiaTheme', 'w:cstheme'):
        if rfonts.get(qn(attr)) is not None:
            del rfonts.attrib[qn(attr)]
    if ascii_font:
        rfonts.set(qn('w:ascii'), ascii_font)
        rfonts.set(qn('w:hAnsi'), ascii_font)
        rfonts.set(qn('w:cs'), ascii_font)
    if east_asia:
        rfonts.set(qn('w:eastAsia'), east_asia)
    if lang_ea:
        lang = rpr.find(qn('w:lang'))
        if lang is None:
            lang = OxmlElement('w:lang')
            rpr.append(lang)
        lang.set(qn('w:eastAsia'), lang_ea)


def style_fonts(style, ascii_font, east_asia, size=None, bold=None, color=None, lang_ea=None):
    style.font.name = ascii_font
    set_run_fonts(style.element, ascii_font, east_asia, lang_ea)
    if size:
        style.font.size = Pt(size)
    if bold is not None:
        style.font.bold = bold
    if color:
        style.font.color.rgb = RGBColor.from_string(color)


def a4(doc, top=2.0, bottom=2.0, left=2.0, right=2.0):
    for s in doc.sections:
        s.page_width = Cm(21.0)
        s.page_height = Cm(29.7)
        s.top_margin = Cm(top)
        s.bottom_margin = Cm(bottom)
        s.left_margin = Cm(left)
        s.right_margin = Cm(right)
        s.header_distance = Cm(1.0)
        s.footer_distance = Cm(1.0)


def add_field(paragraph, instr):
    """Append a simple field such as PAGE or NUMPAGES to a paragraph."""
    fld = OxmlElement('w:fldSimple')
    fld.set(qn('w:instr'), instr)
    r = OxmlElement('w:r')
    t = OxmlElement('w:t')
    t.text = '1'
    r.append(t)
    fld.append(r)
    paragraph._p.append(fld)


def repeat_header(row):
    trpr = row._tr.get_or_add_trPr()
    el = OxmlElement('w:tblHeader')
    el.set(qn('w:val'), 'true')
    trpr.append(el)


def cant_split(row):
    trpr = row._tr.get_or_add_trPr()
    el = OxmlElement('w:cantSplit')
    el.set(qn('w:val'), 'true')
    trpr.append(el)


def shade(cell, fill):
    tcpr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), fill)
    tcpr.append(shd)


def set_col_widths(table, widths_cm):
    table.autofit = False
    tbl = table._tbl
    grid = tbl.tblGrid
    for i, gc in enumerate(grid.findall(qn('w:gridCol'))):
        if i < len(widths_cm):
            gc.set(qn('w:w'), str(int(widths_cm[i] * 567)))
    for row in table.rows:
        for i, cell in enumerate(row.cells):
            if i < len(widths_cm):
                cell.width = Cm(widths_cm[i])


def page_break(doc):
    doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)


__all__ = [
    'Document', 'WD_SECTION', 'WD_ALIGN_PARAGRAPH', 'WD_BREAK', 'OxmlElement', 'qn', 'Cm', 'Pt', 'RGBColor',
    'set_run_fonts', 'style_fonts', 'a4', 'add_field', 'repeat_header', 'cant_split', 'shade', 'set_col_widths',
    'page_break',
]

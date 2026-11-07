"""Small helpers on top of python-docx for the held-out round 4 (author e) Word samples.

python-docx 1.2 has no API for footnotes, multi-level heading numbering,
tracked changes or page-number fields, so these helpers write the
WordprocessingML for them directly. Everything here is synthetic sample
content; nothing is read from outside this folder.
"""

from docx import Document
from docx.enum.section import WD_ORIENT, WD_SECTION
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.opc.constants import RELATIONSHIP_TYPE as RT
from docx.opc.packuri import PackURI
from docx.opc.part import Part
from docx.oxml import parse_xml
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor
from xml.sax.saxutils import escape

W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
REV_DATE = "2026-10-12T09:30:00Z"


def new_document(body_font="Calibri", body_size=11, heading_font="Cambria", east_asia=None):
    doc = Document()
    sec = doc.sections[0]
    sec.page_width, sec.page_height = Cm(21.0), Cm(29.7)
    sec.left_margin = sec.right_margin = Cm(2.3)
    sec.top_margin, sec.bottom_margin = Cm(2.4), Cm(2.2)
    sec.header_distance, sec.footer_distance = Cm(1.1), Cm(1.0)
    normal = doc.styles["Normal"]
    set_font(normal, body_font, body_size, east_asia)
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.08
    for name, size in (("Title", 20), ("Heading 1", 13), ("Heading 2", 11.5)):
        st = doc.styles[name]
        set_font(st, heading_font, size, east_asia)
        st.font.bold = True
        st.font.color.rgb = RGBColor(0x1F, 0x2F, 0x4A)
        st.paragraph_format.space_before = Pt(12 if name != "Title" else 0)
        st.paragraph_format.space_after = Pt(6)
    title_ppr = doc.styles["Title"].element.get_or_add_pPr()
    for bdr in title_ppr.findall(qn("w:pBdr")):
        title_ppr.remove(bdr)
    return doc


def set_font(style_or_run, name, size=None, east_asia=None):
    style_or_run.font.name = name
    if size is not None:
        style_or_run.font.size = Pt(size)
    rpr = style_or_run.element.get_or_add_rPr()
    fonts = rpr.find(qn("w:rFonts"))
    if fonts is None:
        fonts = parse_xml(f"<w:rFonts {W_NS}/>")
        rpr.insert(0, fonts)
    for attr in ("w:asciiTheme", "w:hAnsiTheme", "w:eastAsiaTheme", "w:cstheme"):
        if fonts.get(qn(attr)) is not None:
            del fonts.attrib[qn(attr)]
    fonts.set(qn("w:ascii"), name)
    fonts.set(qn("w:hAnsi"), name)
    fonts.set(qn("w:cs"), name)
    if east_asia:
        fonts.set(qn("w:eastAsia"), east_asia)


def add_paragraph_style(doc, name, base="Normal", size=None, bold=None, indent_cm=None):
    st = doc.styles.add_style(name, WD_STYLE_TYPE.PARAGRAPH)
    st.base_style = doc.styles[base]
    if size is not None:
        st.font.size = Pt(size)
    if bold is not None:
        st.font.bold = bold
    if indent_cm is not None:
        st.paragraph_format.left_indent = Cm(indent_cm)
    return st


def add_outline_numbering(doc, levels):
    """levels: list of (style_name, lvlText, indent_cm, hanging_cm).

    Creates one multi-level list and links each style to its level, the way
    Word's "Define new multilevel list -> link level to style" does.
    """
    numbering = doc.part.numbering_part.element
    abstract_id = 90
    num_id = 90
    lvls = []
    for i, (style_name, text, indent, hanging) in enumerate(levels):
        style_id = doc.styles[style_name].style_id
        lvls.append(
            f'<w:lvl w:ilvl="{i}"><w:start w:val="1"/><w:numFmt w:val="decimal"/>'
            f'<w:pStyle w:val="{style_id}"/><w:lvlText w:val="{text}"/><w:lvlJc w:val="left"/>'
            f'<w:pPr><w:ind w:left="{int(indent * 567)}" w:hanging="{int(hanging * 567)}"/></w:pPr></w:lvl>'
        )
    abstract = parse_xml(
        f'<w:abstractNum {W_NS} w:abstractNumId="{abstract_id}"><w:multiLevelType w:val="multilevel"/>'
        + "".join(lvls)
        + "</w:abstractNum>"
    )
    first_num = numbering.find(qn("w:num"))
    if first_num is not None:
        first_num.addprevious(abstract)
    else:
        numbering.append(abstract)
    numbering.append(
        parse_xml(f'<w:num {W_NS} w:numId="{num_id}"><w:abstractNumId w:val="{abstract_id}"/></w:num>')
    )
    for i, (style_name, *_rest) in enumerate(levels):
        ppr = doc.styles[style_name].element.get_or_add_pPr()
        for old in ppr.findall(qn("w:numPr")):
            ppr.remove(old)
        ppr.insert(0, parse_xml(f'<w:numPr {W_NS}><w:ilvl w:val="{i}"/><w:numId w:val="{num_id}"/></w:numPr>'))


def add_simple_list(doc, lvl_text="%1", num_id=91):
    """A single-level decimal list without a tab after the label, e.g. for a No. column."""
    numbering = doc.part.numbering_part.element
    abstract = parse_xml(
        f'<w:abstractNum {W_NS} w:abstractNumId="{num_id}"><w:multiLevelType w:val="singleLevel"/>'
        f'<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:suff w:val="nothing"/>'
        f'<w:lvlText w:val="{lvl_text}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="0" w:hanging="0"/></w:pPr>'
        f"</w:lvl></w:abstractNum>"
    )
    first_num = numbering.find(qn("w:num"))
    if first_num is not None:
        first_num.addprevious(abstract)
    else:
        numbering.append(abstract)
    numbering.append(
        parse_xml(f'<w:num {W_NS} w:numId="{num_id}"><w:abstractNumId w:val="{num_id}"/></w:num>')
    )
    return num_id


def number_paragraph(paragraph, num_id, size=None):
    ppr = paragraph._p.get_or_add_pPr()
    ppr.insert(0, parse_xml(f'<w:numPr {W_NS}><w:ilvl w:val="0"/><w:numId w:val="{num_id}"/></w:numPr>'))
    if size:
        # the label takes its size from the paragraph mark
        ppr.append(parse_xml(f'<w:rPr {W_NS}><w:sz w:val="{int(size * 2)}"/></w:rPr>'))


class Footnotes:
    """Collects footnotes and writes word/footnotes.xml on finish()."""

    def __init__(self, doc, size_half_points=17):
        self.doc = doc
        self.items = []
        self.size = size_half_points

    def add(self, paragraph, text):
        fid = len(self.items) + 1
        self.items.append((fid, text))
        run = paragraph.add_run()
        rpr = run._r.get_or_add_rPr()
        rpr.append(parse_xml(f'<w:vertAlign {W_NS} w:val="superscript"/>'))
        run._r.append(parse_xml(f'<w:footnoteReference {W_NS} w:id="{fid}"/>'))
        return run

    def finish(self, font):
        notes = []
        for fid, text in self.items:
            notes.append(
                f'<w:footnote w:id="{fid}"><w:p><w:pPr><w:spacing w:after="40"/></w:pPr>'
                f'<w:r><w:rPr><w:rFonts w:ascii="{font}" w:hAnsi="{font}" w:eastAsia="{font}"/>'
                f'<w:vertAlign w:val="superscript"/><w:sz w:val="{self.size}"/></w:rPr><w:footnoteRef/></w:r>'
                f'<w:r><w:rPr><w:rFonts w:ascii="{font}" w:hAnsi="{font}"/><w:sz w:val="{self.size}"/></w:rPr>'
                f'<w:t xml:space="preserve"> {escape(text)}</w:t></w:r></w:p></w:footnote>'
            )
        xml = (
            f"<w:footnotes {W_NS}>"
            '<w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>'
            '<w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>'
            + "".join(notes)
            + "</w:footnotes>"
        )
        part = Part(
            PackURI("/word/footnotes.xml"),
            "application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml",
            xml.encode("utf-8"),
            self.doc.part.package,
        )
        self.doc.part.relate_to(part, RT.FOOTNOTES)


_rev_id = [500]


def _next_rev():
    _rev_id[0] += 1
    return _rev_id[0]


def tracked_insert(paragraph, text, author="Policy Reviewer"):
    """Appends text as a tracked insertion (w:ins)."""
    el = parse_xml(
        f'<w:ins {W_NS} w:id="{_next_rev()}" w:author="{author}" w:date="{REV_DATE}">'
        f'<w:r><w:t xml:space="preserve">{escape(text)}</w:t></w:r></w:ins>'
    )
    paragraph._p.append(el)


def tracked_delete(paragraph, text, author="Policy Reviewer"):
    """Appends text as a tracked deletion (w:del), shown struck through when changes are shown."""
    el = parse_xml(
        f'<w:del {W_NS} w:id="{_next_rev()}" w:author="{author}" w:date="{REV_DATE}">'
        f'<w:r><w:delText xml:space="preserve">{escape(text)}</w:delText></w:r></w:del>'
    )
    paragraph._p.append(el)


def add_field(paragraph, instr, placeholder="1", size=None, font=None):
    run = paragraph.add_run()
    rpr = ""
    if size or font:
        rpr = "<w:rPr>"
        if font:
            rpr += f'<w:rFonts w:ascii="{font}" w:hAnsi="{font}"/>'
        if size:
            rpr += f'<w:sz w:val="{int(size * 2)}"/>'
        rpr += "</w:rPr>"
    r = run._r
    parent = r.getparent()
    idx = parent.index(r)
    parent.remove(r)
    pieces = [
        f'<w:r {W_NS}>{rpr}<w:fldChar w:fldCharType="begin"/></w:r>',
        f'<w:r {W_NS}>{rpr}<w:instrText xml:space="preserve"> {instr} </w:instrText></w:r>',
        f'<w:r {W_NS}>{rpr}<w:fldChar w:fldCharType="separate"/></w:r>',
        f'<w:r {W_NS}>{rpr}<w:t>{placeholder}</w:t></w:r>',
        f'<w:r {W_NS}>{rpr}<w:fldChar w:fldCharType="end"/></w:r>',
    ]
    for k, xml in enumerate(pieces):
        parent.insert(idx + k, parse_xml(xml))


def repeat_header_row(row):
    trpr = row._tr.get_or_add_trPr()
    trpr.append(parse_xml(f"<w:tblHeader {W_NS}/>"))


def cant_split(row):
    trpr = row._tr.get_or_add_trPr()
    trpr.append(parse_xml(f"<w:cantSplit {W_NS}/>"))


def shade(cell, hex_fill):
    tcpr = cell._tc.get_or_add_tcPr()
    tcpr.append(parse_xml(f'<w:shd {W_NS} w:val="clear" w:color="auto" w:fill="{hex_fill}"/>'))


def set_col_widths(table, widths_cm):
    table.autofit = False
    tbl = table._tbl
    grid = tbl.tblGrid
    for i, gc in enumerate(grid.findall(qn("w:gridCol"))):
        gc.set(qn("w:w"), str(int(widths_cm[i] * 567)))
    for row in table.rows:
        for i, cell in enumerate(row.cells):
            cell.width = Cm(widths_cm[i])


def table_borders(table, color="8A94A6", size=4):
    tblpr = table._tbl.tblPr
    tblpr.append(
        parse_xml(
            f"<w:tblBorders {W_NS}>"
            + "".join(
                f'<w:{side} w:val="single" w:sz="{size}" w:space="0" w:color="{color}"/>'
                for side in ("top", "left", "bottom", "right", "insideH", "insideV")
            )
            + "</w:tblBorders>"
        )
    )


def cell_text(cell, text, bold=False, size=None, align=None, font=None, color=None):
    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(0)
    p.paragraph_format.space_before = Pt(0)
    if align == "right":
        p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    elif align == "center":
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run(text)
    run.bold = bold
    if size:
        run.font.size = Pt(size)
    if font:
        run.font.name = font
    if color:
        run.font.color.rgb = RGBColor.from_string(color)
    return run


def landscape_section(doc):
    sec = doc.add_section(WD_SECTION.NEW_PAGE)
    sec.orientation = WD_ORIENT.LANDSCAPE
    sec.page_width, sec.page_height = Cm(29.7), Cm(21.0)
    return sec


def portrait_section(doc):
    sec = doc.add_section(WD_SECTION.NEW_PAGE)
    sec.orientation = WD_ORIENT.PORTRAIT
    sec.page_width, sec.page_height = Cm(21.0), Cm(29.7)
    return sec


def unlink_header_footer(section):
    section.header.is_linked_to_previous = False
    section.footer.is_linked_to_previous = False


def fixed_core_properties(doc, title):
    import datetime

    cp = doc.core_properties
    cp.title = title
    cp.author = "Synthetic sample generator"
    cp.last_modified_by = "Synthetic sample generator"
    stamp = datetime.datetime(2026, 10, 12, 9, 0, 0)
    cp.created = stamp
    cp.modified = stamp
    cp.revision = 1


__all__ = [name for name in dir() if not name.startswith("_")]

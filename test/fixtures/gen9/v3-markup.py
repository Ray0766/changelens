# SYNTHETIC probe PDFs for fix round 9, area V3-markup-annotations: the page
# content written with fpdf2 2.9 and the annotations added with PyMuPDF 2.1,
# as in the round-5 case holdout5-j-audit-annotations.
#
# One short two-page document, all names and figures invented: a supplier
# audit note in Liberation Sans 10.5 pt (justified paragraphs) with a running
# header and footer. Its "before" has no annotations; each "after" adds,
# changes or removes PDF annotations, the page content left as it is unless
# the name says so:
# - hl, strike, ul, squiggly: a highlight (yellow), a strike-out (red), an
#   underline (#00ff00) or a squiggly underline (blue) over a phrase;
# - hl-green: the highlight of "hl" in green (a recolour);
# - strike-next: "strike" plus a strike drawn in the page content over the
#   words right after the struck sentence (a real strike next to it);
# - red-before / red-plain / red-hl / red-hl-only: the highlighted phrase
#   printed in red in the page content, without and with "hl", against the
#   same layout in black (with and without "hl");
# - number-after: a figure changed in the page content inside a phrase
#   ("30" -> "45"), the phrase highlighted (number-after-plain: without);
# - ul-grey: an underline in grey (#999); ul-grey-strike: the same, and a
#   thin grey strike in the page content over one of its words ("this", at
#   the end of its first line);
# - noap: hl, strike and ul without appearance streams (a viewer draws
#   them from their QuadPoints and colour);
# - hidden: a highlight flagged Hidden and one flagged NoView;
# - quads-turned: hl and ul with their QuadPoints corners in another order;
# - header: a highlight and a strike-out on the running header of page 1;
# - rot90 / rot90-hl: the document turned with /Rotate 90, without and with
#   the highlight of "hl";
# - many: a highlight on each word (188 of them);
# - note-changed: a free-text note whose text changed between two versions
#   that both have it (before: note-before);
# - comment: "hl" plus a comment (sticky note) and an "Approved" stamp.
#
# Run with a Python that has fpdf2 (2.9) and pymupdf (2.1):
#   python v3-markup.py <out-dir>
import sys
import pymupdf
from fpdf import FPDF

OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
LIB = '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'
LIB_B = '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'

HL = 'Calibration records for two torque wrenches were missing'
SO = 'The finding is considered minor.'
UL = 'within 30 days of receiving this report'
SQ = 'evidence of closure must be sent to the supplier quality team'


class Note(FPDF):
    def header(self):
        self.set_font('LS', size=8)
        self.set_text_color(90, 90, 90)
        self.cell(0, 10, 'Supplier audit note SQA-2026-031 (SYNTHETIC)', align='L')
        self.ln(24)
        self.set_text_color(0, 0, 0)

    def footer(self):
        self.set_y(-40)
        self.set_font('LS', size=8)
        self.set_text_color(90, 90, 90)
        self.cell(0, 10, f'Page {self.page_no()} of {{nb}}', align='R')
        self.set_text_color(0, 0, 0)


def note(path, figure='30', red=None):
    """The note; `red`: print the highlighted phrase in this colour (its paragraph is then set flush left
    with write(), in every version compared with it)."""
    pdf = Note(format='A4', unit='pt')
    pdf.set_title('Supplier audit note (SYNTHETIC)')
    pdf.set_producer('fpdf2 2.9.0')
    pdf.add_font('LS', '', LIB)
    pdf.add_font('LS', 'B', LIB_B)
    pdf.set_margins(56, 40, 56)
    pdf.set_auto_page_break(True, 64)
    pdf.add_page()
    W = pdf.epw * 0.8

    def h(t):
        pdf.ln(10)
        pdf.set_font('LS', 'B', 13)
        pdf.cell(0, 17, t, new_x='LMARGIN', new_y='NEXT')
        pdf.ln(3)

    def para(t):
        pdf.set_font('LS', size=10.5)
        pdf.multi_cell(W, 15, t, align='J', new_x='LMARGIN', new_y='NEXT')
        pdf.ln(4)

    pdf.set_font('LS', 'B', 18)
    pdf.cell(0, 24, 'Supplier audit note', new_x='LMARGIN', new_y='NEXT')
    h('1 Summary')
    head = ('The supplier\'s process control is generally good. Machining cells run with documented set-up sheets, '
            'and first-off inspection is recorded for every batch. ')
    tail = (' at the time of the audit, although both tools carried valid calibration labels. Operators knew the '
            'escalation route for non-conforming parts and could show recent examples.')
    if red is None:
        para(head + HL + tail)
    else:
        pdf.set_font('LS', size=10.5)
        pdf.set_right_margin(pdf.w - pdf.l_margin - W)
        pdf.write(15, head.rstrip())
        pdf.ln(15)  # (write() would break the phrase inside a word)
        pdf.set_text_color(*red)
        pdf.write(15, HL)
        pdf.set_text_color(0, 0, 0)
        pdf.write(15, tail)
        pdf.set_right_margin(56)
        pdf.ln(19)
    h('2 Findings')
    para('Finding F1 has no effect on delivered parts, because both wrenches were checked against the reference '
         f'tool on the day of the audit. {SO} Finding F3 concerns training records for the new measuring program.')
    pdf.add_page()
    h('3 Corrective actions')
    para(f'The supplier shall submit a corrective action plan {UL.replace("30", figure)}. The plan must name an '
         f'owner and a target date for each finding, and {SQ}.')
    h('4 Conclusion')
    para('Approval for continued supply is recommended, subject to the closure of findings F1 and F3. The next '
         'routine audit is due in October 2027.')
    pdf.output(path)


def save(doc, path):
    doc.save(path, garbage=4, deflate=True, use_objstms=1)
    doc.close()


def quads(page, text):
    q = page.search_for(text, quads=True)
    assert q, text
    return q


def after(before, path, fn):
    doc = pymupdf.open(before)
    fn(doc)
    save(doc, path)


def add_hl(doc, colour=None):
    p = doc[0]  # (the page must outlive its annotations' updates)
    a = p.add_highlight_annot(quads(p, HL))
    if colour:
        a.set_colors(stroke=colour)
        a.update()


def add_so(doc):
    p = doc[0]
    a = p.add_strikeout_annot(quads(p, SO))
    a.set_colors(stroke=(1, 0, 0))
    a.update()


def add_ul(doc):
    p = doc[1]
    a = p.add_underline_annot(quads(p, UL))
    a.set_colors(stroke=(0, 1, 0))
    a.update()


def add_sq(doc):
    p = doc[1]
    a = p.add_squiggly_annot(quads(p, SQ))
    a.set_colors(stroke=(0, 0, 1))
    a.update()


def drop_ap(doc):
    for page in doc:
        for a in page.annots():
            doc.xref_set_key(a.xref, 'AP', 'null')


def main():
    o = lambda n: f'{OUT}/probe9-V3-markup-{n}.pdf'
    note(o('before'))
    B = o('before')
    after(B, o('hl'), add_hl)
    after(B, o('strike'), add_so)
    after(B, o('ul'), add_ul)
    after(B, o('squiggly'), add_sq)
    after(B, o('hl-green'), lambda d: add_hl(d, (0.3, 0.9, 0.3)))
    after(B, o('noap'), lambda d: (add_hl(d), add_so(d), add_ul(d), drop_ap(d)))

    def hidden(d):
        p, p2 = d[0], d[1]
        a = p.add_highlight_annot(quads(p, HL))
        a.set_flags(pymupdf.PDF_ANNOT_IS_HIDDEN)
        a.update()
        b = p2.add_highlight_annot(quads(p2, UL))
        b.set_flags(pymupdf.PDF_ANNOT_IS_NO_VIEW)
        b.update()
    after(B, o('hidden'), hidden)

    def turned_quads(d):
        add_hl(d)
        add_ul(d)
        for page in d:
            for a in page.annots():
                v = d.xref_get_key(a.xref, 'QuadPoints')[1].strip('[] ').split()
                n = [float(x) for x in v]
                out = []
                for i in range(0, len(n), 8):
                    p = [(n[i + 2 * k], n[i + 2 * k + 1]) for k in range(4)]
                    p = [p[3], p[2], p[0], p[1]]  # corners in another order
                    out += [c for xy in p for c in xy]
                d.xref_set_key(a.xref, 'QuadPoints', '[' + ' '.join(f'{x:.3f}' for x in out) + ']')
    after(B, o('quads-turned'), turned_quads)

    def header(d):
        p = d[0]
        p.add_highlight_annot(quads(p, 'Supplier audit note SQA-2026-031'))
        a = p.add_strikeout_annot(quads(p, '(SYNTHETIC)'))
        a.set_colors(stroke=(1, 0, 0))
        a.update()
    after(B, o('header'), header)

    # Controls: a real edit under or right next to the annotation.
    note(o('red-before'), red=(0, 0, 0))
    note(o('red-plain'), red=(220, 0, 0))
    after(o('red-plain'), o('red-hl'), add_hl)
    after(o('red-before'), o('red-hl-only'), add_hl)

    def strike_next(d):
        add_so(d)
        # A red strike drawn in the page content over the three words after the struck sentence.
        p = d[0]
        r = quads(p, 'Finding F3 concerns')[0].rect
        y = (r.y0 + r.y1) / 2 + 0.6
        p.draw_line((r.x0, y), (r.x1, y), color=(1, 0, 0), width=0.73)
    after(B, o('strike-next'), strike_next)

    # The figure in the underlined phrase changed in the page content, and the phrase highlighted.
    note(o('number-after-plain'), figure='45')
    after(o('number-after-plain'), o('number-after'), lambda d: (lambda p: p.add_highlight_annot(quads(p, 'within 45 days of receiving this report')))(d[1]))

    # A grey underline annotation, which the pixels find too faint to be sure of on one word; and the same
    # with a thin grey strike drawn in the page content over one of its words (a real edit).
    def ul_grey(d, strike=False):
        p = d[1]
        a = p.add_underline_annot(quads(p, UL))
        a.set_colors(stroke=(0.6, 0.6, 0.6))
        a.update()
        if strike:
            r = quads(p, 'this report')[0].rect  # (the phrase wraps: its first quad is "this")
            y = (r.y0 + r.y1) / 2 + 0.6
            p.draw_line((r.x0, y), (r.x1, y), color=(0.6, 0.6, 0.6), width=0.5)
    after(B, o('ul-grey'), ul_grey)
    after(B, o('ul-grey-strike'), lambda d: ul_grey(d, True))

    # Rotated pages.
    def rot(d):
        for page in d:
            page.set_rotation(90)
    after(B, o('rot90'), rot)
    after(o('rot90'), o('rot90-hl'), add_hl)

    def many(d):
        # A highlight on every word of both pages (header and footer included).
        for p in d:
            for w in p.get_text('words'):
                p.add_highlight_annot(pymupdf.Rect(w[:4]).quad)
    after(B, o('many'), many)

    def note_add(text):
        def f(d):
            p = d[1]
            p.add_freetext_annot(pymupdf.Rect(454, 120, 570, 170), text, fontsize=8.5, fontname='helv',
                                    text_color=(0.1, 0.1, 0.1), fill_color=(1, 0.96, 0.7), border_width=0.8)
        return f
    after(B, o('note-before'), note_add('Draft for internal review, SYNTHETIC'))
    after(B, o('note-changed'), note_add('Reviewed 2 Nov 2026: plan accepted, SYNTHETIC'))

    # A comment (sticky note) in the margin, and a stamp, added together with a highlight.
    def comment(d):
        add_hl(d)
        p = d[0]
        p.add_text_annot((540, 150), 'Ask for the calibration certificates. SYNTHETIC')
        p.add_stamp_annot(pymupdf.Rect(400, 30, 540, 70), stamp=pymupdf.STAMP_Approved)
    after(B, o('comment'), comment)


main()

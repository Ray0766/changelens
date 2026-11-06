# SYNTHETIC probe PDFs for fix round 9, area V3-markup-annotations, second
# pass: real edits of the page content under or beside an annotation that
# came with them, which must stay listed, and annotations that must give no
# item. Built on probe9-V3-markup-before.pdf (made by v3-markup.py: page
# content by fpdf2 2.9) with PyMuPDF 2.1, which draws the content edits into
# the page content stream (draw_line, draw_rect) and adds the annotations.
# All names and figures invented.
# - ulc: a black 0.8 pt underline drawn in the page content under the
#   highlight phrase of v3-markup.py (control: listed as "Underlined");
#   ulc-hl: the same, and a highlight annotation over the phrase;
# - ulc-so: a black 0.8 pt underline drawn in the page content under the
#   strike-out phrase, and a red strike-out annotation over it;
# - dot-red, dot-green: a status dot drawn in the page content in the right
#   margin of the highlight phrase's line, red or green; dot-red-hl,
#   dot-green-hl: the same, and a highlight annotation from the phrase to
#   the dot (an area highlight over the rest of the line too);
# - logo-blue, logo-red: a vector logo (a filled rounded box) at the top
#   right of page 1, blue or red; logo-blue-stamp, logo-red-stamp: the same,
#   and a "FOR COMMENT" stamp annotation over the logo; logo-red-near: the
#   red logo and an "APPROVED" stamp 10 pt to the left of it.
# - hl-baked: probe9-V3-markup-hl.pdf with its highlight flattened into the
#   page content (PyMuPDF bake): the same pixels, no annotation;
# - comment-b: probe9-V3-markup-comment.pdf with the comment's pop-up text
#   changed (its icon and place the same);
# - hl-normal, hl-normal-pink: the highlight of v3-markup.py's "hl" drawn in
#   normal blend at 40 % opacity, yellow or pink; red-hl-normal: the yellow
#   one over the phrase printed in red (the page content of v3-markup.py's
#   "red-plain", made here again with its note() and fpdf2 2.9, and not
#   kept).
#
# Run with a Python that has pymupdf (2.1) and fpdf2 (2.9), from
# test/fixtures:
#   python gen9/v3-markup-refix.py .
import os
import sys
import pymupdf

OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
HL = 'Calibration records for two torque wrenches were missing'
SO = 'The finding is considered minor.'


def save(doc, path):
    doc.save(path, garbage=4, deflate=True, use_objstms=1)
    doc.close()


def quads(page, text):
    q = page.search_for(text, quads=True)
    assert q, text
    return q


def make(name, fn, base='before'):
    doc = pymupdf.open(f'{OUT}/probe9-V3-markup-{base}.pdf')
    fn(doc)
    save(doc, f'{OUT}/probe9-V3-markup-{name}.pdf')


def underline(p, text, colour=(0, 0, 0), width=0.8):
    # Under the glyphs: 0.9 pt above the bottom of each line's box (its descender).
    for q in quads(p, text):
        r = q.rect
        p.draw_line((r.x0, r.y1 - 0.9), (r.x1, r.y1 - 0.9), color=colour, width=width)


def hl(p, text):
    p.add_highlight_annot(quads(p, text))


def so(p, text):
    a = p.add_strikeout_annot(quads(p, text))
    a.set_colors(stroke=(1, 0, 0))
    a.update()


def dot(p, colour, area=False):
    # A dot 3.6 pt in radius in the right margin of the phrase's line (the
    # paragraph is 0.8 of the text width, from 56 pt), on its middle.
    q = quads(p, HL)[-1].rect
    c = pymupdf.Point(56 + 0.8 * (p.rect.width - 112) + 12, (q.y0 + q.y1) / 2)
    p.draw_circle(c, 3.6, color=None, fill=colour)
    if area:
        # A highlight over the line's words and the dot, as one quadrilateral.
        p.add_highlight_annot(pymupdf.Rect(q.x0, q.y0, c.x + 8, q.y1))


def logo(p, colour):
    p.draw_rect(pymupdf.Rect(470, 74, 540, 108), color=None, fill=colour, radius=0.15)


def stamp(p, rect, kind):
    p.add_stamp_annot(pymupdf.Rect(*rect), stamp=kind)


RED, GREEN, BLUE = (0.8, 0.1, 0.1), (0.1, 0.65, 0.2), (0.1, 0.3, 0.7)
OVER = (440, 80, 560, 120)
NEAR = (330, 75, 460, 115)


def main():
    make('ulc', lambda d: underline(d[0], HL))
    make('ulc-hl', lambda d: (underline(d[0], HL), hl(d[0], HL)))
    make('ulc-so', lambda d: (underline(d[0], SO), so(d[0], SO)))
    make('dot-red', lambda d: dot(d[0], RED))
    make('dot-green', lambda d: dot(d[0], GREEN))
    make('dot-red-hl', lambda d: dot(d[0], RED, True))
    make('dot-green-hl', lambda d: dot(d[0], GREEN, True))
    make('logo-blue', lambda d: logo(d[0], BLUE))
    make('logo-red', lambda d: logo(d[0], RED))
    make('logo-blue-stamp', lambda d: (logo(d[0], BLUE), stamp(d[0], OVER, pymupdf.STAMP_ForComment)))
    make('logo-red-stamp', lambda d: (logo(d[0], RED), stamp(d[0], OVER, pymupdf.STAMP_ForComment)))
    make('logo-red-near', lambda d: (logo(d[0], RED), stamp(d[0], NEAR, pymupdf.STAMP_Approved)))
    make('hl-baked', lambda d: d.bake(), base='hl')

    def recomment(d):
        p = d[0]
        for a in p.annots(types=[pymupdf.PDF_ANNOT_TEXT]):
            a.set_info(content='Certificates received on 3 Nov. SYNTHETIC')
            a.update()
    make('comment-b', recomment, base='comment')

    def hl_normal(colour):
        def f(d):
            p = d[0]  # (the page must outlive its annotation's updates)
            a = p.add_highlight_annot(quads(p, HL))
            a.set_colors(stroke=colour)
            a.set_opacity(0.4)
            a.set_blendmode(pymupdf.PDF_BM_Normal)
            a.update()
        return f
    make('hl-normal', hl_normal((1, 1, 0)))
    make('hl-normal-pink', hl_normal((1, 0.4, 0.7)))
    # The phrase printed in red, as v3-markup.py does (its note(), without its main()).
    src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'v3-markup.py')).read()
    ns = {'__name__': 'v3_markup'}
    exec(compile(src.replace('\nmain()\n', '\n'), 'v3-markup.py', 'exec'), ns)
    ns['note'](f'{OUT}/probe9-V3-markup-red-plain.pdf', red=(220, 0, 0))
    make('red-hl-normal', hl_normal((1, 1, 0)), base='red-plain')
    os.remove(f'{OUT}/probe9-V3-markup-red-plain.pdf')


main()

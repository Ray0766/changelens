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
#   so-dark: the red strike-out alone, drawn with a 0.8 pt dark red line in
#   the page content over the phrase's words at the strike's height as
#   well (a content strike in another red under the annotation's).
#
# Run with a Python that has pymupdf (2.1), from test/fixtures:
#   python gen9/v3-markup-refix.py .
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


def make(name, fn):
    doc = pymupdf.open(f'{OUT}/probe9-V3-markup-before.pdf')
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


def main():
    make('ulc', lambda d: underline(d[0], HL))
    make('ulc-hl', lambda d: (underline(d[0], HL), hl(d[0], HL)))
    make('ulc-so', lambda d: (underline(d[0], SO), so(d[0], SO)))


main()

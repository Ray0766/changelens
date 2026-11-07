# SYNTHETIC probe PDFs for fix round 9, area V3-markup-annotations, third
# pass (after the re-verifier's counter-probes). Built like
# v3-markup-refix.py on probe9-V3-markup-before.pdf (page content by fpdf2
# 2.9, see v3-markup.py), with PyMuPDF 2.1 drawing the content edits and
# adding the annotations. All names and figures invented.
# - dot-amber-hl, dot-yellow-hl: v3-markup-refix.py's status dot in the
#   right margin of the highlight phrase's line drawn amber (1, 0.75, 0) or
#   yellow (1, 0.92, 0.1), under a highlight annotation from the phrase to
#   the dot (compared with dot-red: a dot recoloured toward the highlight's
#   own yellow, which a highlight in multiply blend cannot make);
# - hl-m50: a highlight annotation over the phrase at 50 % opacity in
#   multiply blend; navy-hl-m50: the same over the phrase printed in navy
#   (0, 0, 115), made here with v3-markup.py's note() and not kept.
#
# Run with a Python that has pymupdf (2.1) and fpdf2 (2.9), from
# test/fixtures (after v3-markup-refix.py, which makes dot-red):
#   python gen9/v3-markup-third.py .
import os
import sys
import pymupdf

OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
HL = 'Calibration records for two torque wrenches were missing'


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


def dot(p, colour):
    # As v3-markup-refix.py's dot(..., area=True).
    q = quads(p, HL)[-1].rect
    c = pymupdf.Point(56 + 0.8 * (p.rect.width - 112) + 12, (q.y0 + q.y1) / 2)
    p.draw_circle(c, 3.6, color=None, fill=colour)
    p.add_highlight_annot(pymupdf.Rect(q.x0, q.y0, c.x + 8, q.y1))


def hl_m50(d):
    p = d[0]
    a = p.add_highlight_annot(quads(p, HL))
    a.set_opacity(0.5)
    a.set_blendmode(pymupdf.PDF_BM_Multiply)
    a.update()


def main():
    make('dot-amber-hl', lambda d: dot(d[0], (1, 0.75, 0)))
    make('dot-yellow-hl', lambda d: dot(d[0], (1, 0.92, 0.1)))
    make('hl-m50', hl_m50)
    src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'v3-markup.py')).read()
    ns = {'__name__': 'v3_markup'}
    exec(compile(src.replace('\nmain()\n', '\n'), 'v3-markup.py', 'exec'), ns)
    ns['note'](f'{OUT}/probe9-V3-markup-navy-plain.pdf', red=(0, 0, 115))
    make('navy-hl-m50', hl_m50, base='navy-plain')
    os.remove(f'{OUT}/probe9-V3-markup-navy-plain.pdf')


main()

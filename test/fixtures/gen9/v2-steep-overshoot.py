# SYNTHETIC probe PDFs for fix round 9, area V2-thin-light-lines, fourth
# pass (after the verifier of the third pass): a strike drawn by hand over
# a short word that overshoots it, as the verifier's st-rise3-over8r and
# st-ink3-over9r did. Drawn with PyMuPDF 2.1 over the audit note
# probe9-V2-steep-SYNTHETIC-before.pdf (made by v2-steep-strikes.py):
# - over12: straight black 0.8 pt lines over "30" and "12", rising 3 pt
#   across the word from 1 pt before its glyphs, and going on at the same
#   slope to 12 pt past them (into the next word).
#
# Run with PyMuPDF installed, from test/fixtures (after v2-steep-strikes.py):
#   python gen9/v2-steep-overshoot.py .
import sys
import pymupdf

OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
P = f'{OUT}/probe9-V2-steep-SYNTHETIC-'


def words_of(page, w):
    return [[q] for q in page.get_text('words') if q[4].strip('.,') == w]


doc = pymupdf.open(P + 'before.pdf')
page = doc[0]
for w in ['30', '12']:
    for line in words_of(page, w):
        x0, x1 = line[0][0] - 1, line[-1][2]
        y0, y1 = line[0][1], line[0][3]
        yc = y0 + (y1 - y0) * 0.62
        slope = 3.0 / (x1 - x0)
        page.draw_line((x0, yc + 1.5), (x1 + 12, yc + 1.5 - slope * (x1 + 12 - x0)), color=(0, 0, 0), width=0.8)
doc.set_metadata({'title': 'Supplier audit note (SYNTHETIC probe, overshooting strikes)', 'creator': 'fourth-pass probe (SYNTHETIC)'})
doc.save(P + 'over12.pdf', garbage=3, deflate=True)
print('ok')

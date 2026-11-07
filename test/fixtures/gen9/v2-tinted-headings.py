# SYNTHETIC probe PDFs for fix round 9, area V2-thin-light-lines, third
# pass (the re-verifier's probes rc-before, rc-grey and rc-k04): headings
# in Liberation Sans Bold 16 pt set in light, saturated colours (#ffc000,
# #00b050, #ff8000, #00b0f0) by fpdf2 2.9, each heading's first word struck
# through with a line drawn by PyMuPDF 2.1 as page content:
# - "grey": a grey (#808080) 0.6 pt line;
# - "k04": a black 0.4 pt line.
#
# Run with fpdf2 and PyMuPDF installed:
#   python v2-tinted-headings.py <out-dir>
import sys
import pymupdf
from fpdf import FPDF

OUT = sys.argv[1]
P = f'{OUT}/probe9-V2-tint-SYNTHETIC-'
LIBB = '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'
LIB = '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'
WORDS = (('Approved', (255, 192, 0)), ('Pending', (0, 176, 80)), ('Blocked', (255, 128, 0)), ('Review', (0, 176, 240)))


def doc(path):
    pdf = FPDF(format='A4', unit='pt')
    pdf.set_title('Colour headings (SYNTHETIC probe)')
    pdf.add_font('L', '', LIB)
    pdf.add_font('L', 'B', LIBB)
    pdf.add_page()
    pdf.set_margins(56, 56, 56)
    pdf.set_y(60)
    pdf.set_font('L', '', 10)
    pdf.cell(0, 16, 'SYNTHETIC probe: status headings in colour', new_x='LMARGIN', new_y='NEXT')
    for name, rgb in WORDS:
        pdf.set_font('L', 'B', 16)
        pdf.set_text_color(*rgb)
        pdf.cell(0, 26, f'{name} suppliers list', new_x='LMARGIN', new_y='NEXT')
        pdf.set_font('L', '', 10)
        pdf.set_text_color(0, 0, 0)
        pdf.cell(0, 16, f'Entries in the {name.lower()} list are reviewed every quarter by the buyer.', new_x='LMARGIN', new_y='NEXT')
    pdf.output(path)


def strike(path, colour, width):
    d = pymupdf.open(P + 'before.pdf')
    p = d[0]
    ws = p.get_text('words')
    for word, _ in WORDS:
        x = [t for t in ws if t[4] == word][0]
        y = x[1] + (x[3] - x[1]) * 0.6
        p.draw_line((x[0], y), (x[2], y), color=colour, width=width)
    d.save(path, garbage=3, deflate=True)


doc(P + 'before.pdf')
strike(P + 'grey.pdf', (0.5, 0.5, 0.5), 0.6)
strike(P + 'k04.pdf', (0, 0, 0), 0.4)
print('ok')

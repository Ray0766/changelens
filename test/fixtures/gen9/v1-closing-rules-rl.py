# SYNTHETIC probe PDFs for fix round 9, area V1-closing-rules, second pass
# (reportlab 5.0.1 and pypdf, system python3).
# A short depot report with a table that breaks across pages 1 and 2, its
# header row repeated (repeatRows=1), a 0.9 pt rule above the header, 0.45 pt
# under it and 0.9 pt under the table's last row. In "after" an inserted
# paragraph moves the page break up by a few rows. Two producers:
# - "closed": the table closes each fragment with a 0.9 pt rule as well
#   ('splitlast'), as Typst does;
# - "open": it does not; in "open-drawn" a 0.9 pt black rule is drawn by hand
#   under the last row of page 1 of "open-before", where "closed" has it.
# All names and figures are invented.
#
#   python3 v1-closing-rules-rl.py <out-dir>
import io
import sys
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from pypdf import PdfReader, PdfWriter

OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
BODY = getSampleStyleSheet()['BodyText']
PARAS = [
    'SYNTHETIC probe. This invented depot report lists the weekly deliveries of a fictitious supplier; every name and value is made up to test a document comparison tool.',
    'Deliveries are counted per week at five depots. The figures are rounded to one decimal place, so the totals may differ slightly from the sum of the parts.',
]
INSERTED = 'This edition adds a paragraph above the table, which pushes the table further down the page, so that the page break inside the table falls a few rows earlier than before. The figures themselves are the same in both editions.'
HEAD = ['Week', 'Northgate', 'Southmere', 'Eastholm', 'Westfold', 'Midvale']
ROWS = [[f'Week {i}', f'{10 + i * 3.7 % 9:.1f}', f'{20 + i * 5.3 % 7:.1f}', f'{30 + i * 2.9 % 11:.1f}', f'{40 + i * 1.7 % 5:.1f}', f'{50 + i * 4.1 % 8:.1f}'] for i in range(1, 41)]
SPACER = 520


def build(name, inserted, closed):
    path = f'{OUT}/probe9-V1-closing-rules-rl-{name}.pdf'
    doc = SimpleDocTemplate(path, pagesize=A4, leftMargin=2.5 * cm, rightMargin=2.5 * cm, topMargin=2.5 * cm, bottomMargin=2.5 * cm, title='SYNTHETIC probe', author='Synthetic sample', invariant=1, pageCompression=0)
    story = [Paragraph(PARAS[0], BODY)]
    if inserted:
        story.append(Paragraph(INSERTED, BODY))
    story += [Paragraph(PARAS[1], BODY), Spacer(1, SPACER)]
    st = [('FONT', (0, 0), (-1, 0), 'Helvetica-Bold', 9), ('FONT', (0, 1), (-1, -1), 'Helvetica', 9), ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
          ('LINEABOVE', (0, 0), (-1, 0), 0.9, colors.black), ('LINEBELOW', (0, 0), (-1, 0), 0.45, colors.black), ('LINEBELOW', (0, -1), (-1, -1), 0.9, colors.black)]
    if closed:
        st.append(('LINEBELOW', (0, 'splitlast'), (-1, 'splitlast'), 0.9, colors.black))
    story.append(Table([HEAD] + ROWS, repeatRows=1, colWidths=[3 * cm] + [2.6 * cm] * 5, style=TableStyle(st)))
    story.append(Paragraph('The table above ends the depot report. The next issue will add the returns for each depot.', BODY))

    def footer(c, d):
        c.saveState()
        c.setFont('Helvetica', 8)
        c.drawString(2.5 * cm, 1.5 * cm, 'SYNTHETIC probe · V1-closing-rules')
        c.drawRightString(A4[0] - 2.5 * cm, 1.5 * cm, f'Page {d.page}')
        c.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return path


def closing_rule(path):
    """The rule under the last row of page 1 of a "closed" PDF (x0, x1, y in PDF space).

    reportlab draws the table in its own coordinates (a cm translation), the
    rule that closes the fragment along its local y = 0 across its width; the
    translation is the one the row texts are drawn under."""
    origin = []
    def visit(text, cm, tm, font, size):
        if text.strip().startswith('Week'):
            origin.append((cm[4], cm[5]))
    PdfReader(path).pages[0].extract_text(visitor_text=visit)
    x, y = origin[-1]
    return (x, x + 3 * cm + 5 * 2.6 * cm, y)


def draw_rule(src, name, rule):
    """A copy of `src` with a 0.9 pt black line drawn over page 1."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4, invariant=1)
    c.setLineWidth(0.9)
    c.line(rule[0], rule[2], rule[1], rule[2])
    c.save()
    reader = PdfReader(src)
    writer = PdfWriter(clone_from=reader)
    writer.pages[0].merge_page(PdfReader(io.BytesIO(buf.getvalue())).pages[0])
    path = f'{OUT}/probe9-V1-closing-rules-rl-{name}.pdf'
    with open(path, 'wb') as f:
        writer.write(f)
    return path


if __name__ == '__main__':
    closed = build('closed-before', False, True)
    build('closed-after', True, True)
    build('open-before', False, False)
    build('open-after', True, False)
    draw_rule(f'{OUT}/probe9-V1-closing-rules-rl-open-before.pdf', 'open-drawn', closing_rule(closed))

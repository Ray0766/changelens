# SYNTHETIC probe PDFs for fix round 9, area V1-closing-rules, fourth pass
# (after the verifier of the third pass): a depot report whose table
# splits across pages 1-2 with its header row repeated and a 0.9 pt rule
# closing each fragment (reportlab 5.0, Helvetica 9 pt; every name and
# figure invented). "after" adds a paragraph above the table, so that its
# page break falls a few rows earlier. Marks drawn right next to the rule
# that closes the first fragment of "before" with PyMuPDF 2.1, within the
# pixel row on each side of the rule that no check read:
# - dash2: a black 0.5 pt line, 30 pt long, 2 pt below the rule's centre;
# - tick2-red: a red 0.7 pt tick, 2 pt tall, across the rule;
# - tick3-grey: a grey (0.55) 0.5 pt tick, 3 pt tall, across the rule.
#
# Two steps, from test/fixtures: the pages with a Python that has
# reportlab, then the marks with one that has PyMuPDF:
#   python3 gen9/v1-closing-rules-fourth.py content .
#   python gen9/v1-closing-rules-fourth.py marks .
import sys

STEP, OUT = sys.argv[1], sys.argv[2]
P = f'{OUT}/probe9-V1-fourth-SYNTHETIC-'


def content():
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    body = getSampleStyleSheet()['BodyText']
    inserted = ('SYNTHETIC inserted paragraph. This edition adds a note above the table about the counting basis, '
                'which pushes the table down so that its page break falls a few rows earlier than before. '
                'The figures in the table are unchanged.')
    head = ['Depot', 'Pallets', 'Crates', 'Returns', 'Claims', 'Share']
    rows = [[f'Depot {chr(65 + i % 26)}{i}'] + [f'{(13 + i * k * 7) % 97}.{(i * k) % 10}' for k in range(1, 5)] + [f'{(i * 3) % 40}%'] for i in range(1, 46)]
    style = [('FONT', (0, 0), (-1, 0), 'Helvetica-Bold', 9), ('FONT', (0, 1), (-1, -1), 'Helvetica', 9), ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
             ('LINEABOVE', (0, 0), (-1, 0), 0.9, colors.black), ('LINEBELOW', (0, 0), (-1, 0), 0.45, colors.black),
             ('LINEBELOW', (0, -1), (-1, -1), 0.9, colors.black), ('LINEBELOW', (0, 'splitlast'), (-1, 'splitlast'), 0.9, colors.black)]

    def footer(c, d):
        c.saveState()
        c.setFont('Helvetica', 8)
        c.drawString(2.5 * cm, 1.5 * cm, 'SYNTHETIC probe · closing rules')
        c.drawRightString(A4[0] - 2.5 * cm, 1.5 * cm, f'Page {d.page}')
        c.restoreState()

    for name, extra in (('before', False), ('after', True)):
        doc = SimpleDocTemplate(f'{P}{name}.pdf', pagesize=A4, leftMargin=2.5 * cm, rightMargin=2.5 * cm, topMargin=2.5 * cm, bottomMargin=2.5 * cm, title='Depot report (SYNTHETIC probe)', invariant=1)
        story = [Paragraph('SYNTHETIC probe. An invented depot report; every name and value is made up to test a document comparison tool.', body)]
        if extra:
            story.append(Paragraph(inserted, body))
        story += [Spacer(1, 430), Table([head] + rows, repeatRows=1, colWidths=[3.2 * cm] + [2.4 * cm] * 5, style=TableStyle(style)), Paragraph('End of the SYNTHETIC report.', body)]
        doc.build(story, onFirstPage=footer, onLaterPages=footer)


def marks():
    import pymupdf

    def mark(name, fn):
        d = pymupdf.open(f'{P}before.pdf')
        p = d[0]
        # The rule closing the first fragment: the lowest full-width line on page 1 (its centre).
        y = max(r.y0 for r in (dr['rect'] for dr in p.get_drawings()) if r.height < 1.5 and r.width > 300)
        fn(p, y)
        d.set_metadata({'title': f'Depot report (SYNTHETIC probe, {name})'})
        d.save(f'{P}before-{name}.pdf', garbage=3, deflate=True)

    mark('dash2', lambda p, y: p.draw_line((200, y + 2.0), (230, y + 2.0), color=(0, 0, 0), width=0.5))
    mark('tick2-red', lambda p, y: p.draw_line((420, y - 1.0), (420, y + 1.0), color=(0.85, 0, 0), width=0.7))
    mark('tick3-grey', lambda p, y: p.draw_line((290, y - 1.5), (290, y + 1.5), color=(0.55, 0.55, 0.55), width=0.5))


content() if STEP == 'content' else marks()
print('ok')

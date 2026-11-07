# Fix round 9, fifth pass: generator of the second verifier of the visual fourth pass, kept as written.
# The fixtures test/fixtures/probe9-V1-fifth-SYNTHETIC-rl-zw-*.pdf are OUT/SYNTHETIC-rl-zw-*.pdf (-rl.py: 'OUT build'
# with reportlab, then 'OUT mark' with PyMuPDF); -ty-yellow-25.pdf is OUT/SYNTHETIC-ty-ser-yellow-25.pdf (-typ.py, then -series.py).
# SYNTHETIC closing-rule counter-probes (reportlab 5.0 base, PyMuPDF 2.1 marks).
# A depot table split across pages 1-2 with a repeated header and a 0.9 pt rule closing
# each fragment ('splitlast'); 'after' inserts a paragraph above so the break moves.
# Styles: 'zb' zebra rows (light blue / white) with a black closing rule; 'cv' blue
# vertical column rules with a black closing rule; 'gb' a grey closing rule with all body
# text in blue. Marks: a pale dash, a light-grey tick, a hanging tick below the rule.
import sys
if sys.argv[2] == 'build':
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
else:
    import pymupdf
OUT = sys.argv[1]
STEP = sys.argv[2]
BODY = getSampleStyleSheet()['BodyText'] if STEP == 'build' else None
INS = ('SYNTHETIC inserted paragraph. This edition adds a note above the table about the counting basis, '
       'which pushes the table down so that its page break falls a few rows earlier than before. '
       'The figures in the table are unchanged.')
H = ['Depot', 'Pallets', 'Crates', 'Returns', 'Claims', 'Share']
R = [[f'Depot {chr(65 + i % 26)}{i}'] + [f'{(13 + i * k * 7) % 97}.{(i * k) % 10}' for k in range(1, 5)] + [f'{(i * 3) % 40}%'] for i in range(1, 46)]
cm = 72 / 2.54
def table(style):
    st = [('FONT', (0, 0), (-1, 0), 'Helvetica-Bold', 9), ('FONT', (0, 1), (-1, -1), 'Helvetica', 9), ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
          ('LINEABOVE', (0, 0), (-1, 0), 0.9, colors.black), ('LINEBELOW', (0, 0), (-1, 0), 0.45, colors.black)]
    end = colors.Color(0.45, 0.45, 0.45) if style == 'gb' else colors.black
    wd = 0.6 if style == 'gb' else 0.9
    st += [('LINEBELOW', (0, -1), (-1, -1), wd, end), ('LINEBELOW', (0, 'splitlast'), (-1, 'splitlast'), wd, end)]
    if style == 'zb':
        st += [('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.Color(0.86, 0.92, 1.0), colors.white])]
    if style == 'zw':
        st += [('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.Color(0.86, 0.92, 1.0)])]
    if style == 'cv':
        st += [('LINEAFTER', (0, 0), (-2, -1), 0.5, colors.Color(0.1, 0.35, 0.85))]
    if style == 'gb':
        st += [('TEXTCOLOR', (0, 1), (-1, -1), colors.Color(0.12, 0.3, 0.75))]
    return Table([H] + R, repeatRows=1, colWidths=[3.2 * cm] + [2.4 * cm] * 5, style=TableStyle(st))
def build(name, style, inserted):
    path = f'{OUT}/SYNTHETIC-rl-{style}-{name}.pdf'
    doc = SimpleDocTemplate(path, pagesize=A4, leftMargin=2.5 * cm, rightMargin=2.5 * cm, topMargin=2.5 * cm, bottomMargin=2.5 * cm, title='Depot report (SYNTHETIC probe)', invariant=1)
    story = [Paragraph('SYNTHETIC probe. An invented depot report; every name and value is made up to test a document comparison tool.', BODY)]
    if inserted: story.append(Paragraph(INS, BODY))
    story += [Spacer(1, 430), table(style), Paragraph('End of the SYNTHETIC report.', BODY)]
    def footer(c, d):
        c.saveState(); c.setFont('Helvetica', 8)
        c.drawString(2.5 * cm, 1.5 * cm, 'SYNTHETIC probe · closing rules'); c.drawRightString(A4[0] - 2.5 * cm, 1.5 * cm, f'Page {d.page}')
        c.restoreState()
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return path
def rule_y(p):
    hs = [d['rect'] for d in p.get_drawings() if d['rect'].height < 1.5 and d['rect'].width > 300]
    return max(r.y0 for r in hs)
def mark(style, name, fn):
    d = pymupdf.open(f'{OUT}/SYNTHETIC-rl-{style}-before.pdf'); p = d[0]; y = rule_y(p)
    fn(p, y)
    d.set_metadata({'title': 'Depot report (SYNTHETIC probe, mark)'})
    d.save(f'{OUT}/SYNTHETIC-rl-{style}-{name}.pdf', garbage=3, deflate=True)
for st in ('zb', 'zw', 'cv', 'gb'):
    if STEP == 'build': build('before', st, False); build('after', st, True)
for st in ('zb', 'zw', 'cv', 'gb') if STEP == 'mark' else ():
    mark(st, 'pale-dash25', lambda p, y: p.draw_line((300, y + 2.5), (320, y + 2.5), color=(1.0, 0.7, 0.4), width=0.8))
    mark(st, 'lgrey-tick3', lambda p, y: p.draw_line((310, y - 1.5), (310, y + 1.5), color=(0.72, 0.72, 0.72), width=0.6))
    mark(st, 'hang25', lambda p, y: p.draw_line((310, y + 0.3), (310, y + 2.8), color=(0, 0, 0), width=0.5))
    mark(st, 'dash3k', lambda p, y: p.draw_line((300, y + 3.0), (318, y + 3.0), color=(0, 0, 0), width=0.6))
print('ok')

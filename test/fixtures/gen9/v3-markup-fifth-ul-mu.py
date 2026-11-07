# Fix round 9, fifth pass: generator of the second verifier of the visual fourth pass, kept as written.
# Run after v3-markup-fifth-ul-rl.py OUT (see there).
# SYNTHETIC: PyMuPDF 2.1 underline / strike-out annotations on the reportlab note.
import sys, json, pymupdf
OUT = sys.argv[1]
def add(src, name, items):
    doc = pymupdf.open(f'{OUT}/SYNTHETIC-ul-{src}.pdf'); p = doc[0]
    for phrase, kind, col in items:
        qs = p.search_for(phrase, quads=True)
        a = p.add_underline_annot(qs) if kind == 'ul' else p.add_strikeout_annot(qs)
        a.set_colors(stroke=col); a.update()
    doc.set_metadata({'title': 'Maintenance note (SYNTHETIC probe, annotation)'})
    doc.save(f'{OUT}/SYNTHETIC-ul-{name}.pdf', garbage=3, deflate=True)
GREEN, RED, BLUE = (0.1, 0.65, 0.2), (0.9, 0.1, 0.1), (0.1, 0.3, 0.9)
add('base', 'base-ulG', [('forklift scales were complete', 'ul', GREEN)])
add('k08', 'k08-ulG', [('forklift scales were complete', 'ul', GREEN)])
add('k08', 'k08-ulB', [('forklift scales were complete', 'ul', BLUE)])
add('base', 'base-soR', [('two closers remain', 'so', RED)])
add('r06', 'r06-soR', [('two closers remain', 'so', RED)])
add('r06', 'r06-ulG', [('two closers remain', 'ul', GREEN)])
add('base', 'base-ulG2', [('forklift scales were complete', 'ul', GREEN), ('racking signs were renewed', 'ul', GREEN)])
print('ok')

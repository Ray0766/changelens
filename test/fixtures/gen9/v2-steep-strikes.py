# SYNTHETIC probe PDFs for fix round 9, area V2-thin-light-lines, third
# pass: strikes drawn by hand across short words, which rise as steeply as
# a turned stamp's border (the re-verifier's probes rv-before, rv-m0-ink30
# and rv-m0-rise30). fpdf2 2.9 for the text (the audit note of
# v2-thin-lines.py, Liberation Sans 10 pt), PyMuPDF 2.1 for the marks.
#
# - "before": the audit note.
# - "ink30": PyMuPDF Ink annotations (with their appearance streams) over
#   "30", "12", "minor", "site" and "audited", each 1.5 pt past the word's
#   glyphs on both sides, rising 3 pt with a small wobble, black 1 pt.
# - "rise30": straight black 0.8 pt lines drawn as page content over "30",
#   "site", "minor" and "12", 1 pt past the glyphs, rising 3 pt.
#
# Run with fpdf2 and PyMuPDF installed:
#   python v2-steep-strikes.py <out-dir>
import sys
import pymupdf
from fpdf import FPDF

OUT = sys.argv[1]
P = f'{OUT}/probe9-V2-steep-SYNTHETIC-'
LIB = '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'
TEXT = [
    'Audit summary (SYNTHETIC probe)',
    'The supplier was audited on site over 2 days. The scope covered goods receipt, calibration of measuring equipment, storage of finished parts and the handling of customer complaints. The audit team reviewed records for the last 12 months and interviewed staff on both shifts.',
    'Calibration records for two torque wrenches were missing for three weeks in March. The wrenches were recalibrated during the audit and found within tolerance. The finding is considered minor. The supplier will add a reminder to its maintenance plan.',
    'Corrective actions',
    'The supplier shall submit a corrective action plan within 30 days of receiving this report. The plan shall name an owner and a target date for each action, and the supplier shall confirm closure in writing.',
    'The next audit is planned for October 2027. It will cover the same scope, with a closer look at the storage of parts that are sensitive to humidity.',
]


def text_pdf(path):
    pdf = FPDF(format='A4', unit='pt')
    pdf.set_title('Supplier audit note (SYNTHETIC probe)')
    pdf.set_creator('re-verifier probe (SYNTHETIC)')
    pdf.add_font('Liberation', '', LIB)
    pdf.set_margins(56.7, 56.7, 56.7)
    pdf.add_page()
    pdf.set_y(56.7)
    pdf.set_font('Liberation', '', 14)
    pdf.cell(0, 28, 'SYNTHETIC probe: supplier audit note', new_x='LMARGIN', new_y='NEXT')
    for k, p in enumerate(TEXT):
        if k in (0, 3):
            pdf.ln(8)
            pdf.set_font('Liberation', '', 12)
            pdf.cell(0, 22, p, new_x='LMARGIN', new_y='NEXT')
        else:
            pdf.set_font('Liberation', '', 10)
            pdf.multi_cell(0, 15, p, align='J', new_x='LMARGIN', new_y='NEXT')
            pdf.ln(6)
    pdf.output(path)


def words_of(page, phrase):
    words = page.get_text('words')
    want = phrase.split()
    for i in range(len(words) - len(want) + 1):
        if [w[4].strip('.,') for w in words[i:i + len(want)]] == [w.strip('.,') for w in want]:
            lines = {}
            for w in words[i:i + len(want)]:
                lines.setdefault((w[5], w[6]), []).append(w)
            return list(lines.values())
    raise ValueError(phrase)


def ink(path, rise):
    doc = pymupdf.open(P + 'before.pdf')
    page = doc[0]
    for w in ['30', '12', 'minor', 'site', 'audited']:
        for line in words_of(page, w):
            x0, x1 = line[0][0] - 1.5, line[-1][2] + 1.5
            y0, y1 = line[0][1], line[0][3]
            yc = y0 + (y1 - y0) * 0.6
            pts = []
            for k in range(7):
                t = k / 6
                wob = (0.25, -0.2, 0.3, -0.25, 0.2, -0.3, 0.1)[k]
                pts.append((x0 + (x1 - x0) * t, yc + rise / 2 - rise * t + wob))
            a = page.add_ink_annot([pts])
            a.set_colors(stroke=(0, 0, 0))
            a.set_border(width=1.0)
            a.update()
    doc.set_metadata({'title': 'Supplier audit note (SYNTHETIC probe, ink strikes)', 'creator': 're-verifier probe (SYNTHETIC)'})
    doc.save(path, garbage=3, deflate=True)


def lines(path, rise):
    doc = pymupdf.open(P + 'before.pdf')
    page = doc[0]
    for w in ['30', 'site', 'minor', '12']:
        for line in words_of(page, w):
            x0, x1 = line[0][0] - 1, line[-1][2] + 1
            y0, y1 = line[0][1], line[0][3]
            yc = y0 + (y1 - y0) * 0.62
            page.draw_line((x0, yc + rise / 2), (x1, yc - rise / 2), color=(0, 0, 0), width=0.8)
    doc.set_metadata({'title': 'Supplier audit note (SYNTHETIC probe, hand strikes)', 'creator': 're-verifier probe (SYNTHETIC)'})
    doc.save(path, garbage=3, deflate=True)


text_pdf(P + 'before.pdf')
ink(P + 'ink30.pdf', 3.0)
lines(P + 'rise30.pdf', 3.0)
print('ok')

# SYNTHETIC probe PDFs for fix round 9, area V1-closing-rules (Typst 0.15,
# as the round-5 case holdout5-h-annual-technical-report).
# A short report with a ruled table (0.9 pt rule above the header, 0.45 pt
# under it, 0.9 pt at the end: Typst draws the end rule at the foot of every
# fragment, and repeats the header with its rules at each page top). In
# "before" the table starts at the foot of page 1 with its header and one
# row, and goes on under a repeated header on page 2; in "after" a paragraph
# inserted above pushes the whole table onto page 2: the break, the repeated
# header and the rule that closes the fragment on page 1 go away.
# Variants put a real edit next to that rule. All figures are fictitious.
#
# Run with a Python that has the typst (0.15) and pymupdf packages:
#   python v1-closing-rules.py <out-dir>
import sys
import typst
import pymupdf

OUT = sys.argv[1] if len(sys.argv) > 1 else '.'

PRE = r'''
#set document(title: "Monthly network figures (SYNTHETIC probe)", author: "Synthetic sample", date: none)
#set page(paper: "a4", margin: (top: 2.8cm, bottom: 2.7cm, left: 3.0cm, right: 3.0cm),
  header: context [#set text(size: 8.5pt); SYNTHETIC probe: monthly network figures #h(1fr) Regional Water Supply Network],
  footer: context [#set text(size: 8.5pt); Synthetic sample · probe V1-closing-rules #h(1fr) Page #counter(page).display() of #counter(page).final().first()])
#set text(font: "Libertinus Serif", size: 11pt, lang: "en", region: "GB")
#set par(justify: true, leading: 0.64em, spacing: 0.9em)
#set heading(numbering: "1.1")
#show heading.where(level: 1): it => block(above: 1.8em, below: 0.9em)[#text(size: 14pt, weight: "bold")[#it]]
#show figure: set block(breakable: true)
'''

FILLER = [
    'This synthetic report sets out the monthly figures of a fictitious regional water supply network. It is written for the operating board and the customer panel, and every name and value in it is invented for the purpose of testing a comparison tool.',
    'The figures are taken from the operational database at the end of each month. Where a figure is provisional, this is stated in the text. Values are rounded for presentation, so totals in tables may differ slightly from the sum of their parts.',
    'Two boreholes at Yarrowby were rehabilitated by jetting, and pumping tests were repeated in October. The trend at Wexcombe reversed in May after the works described in the previous section. Results for Netherby were in line with the previous year.',
    'At Coldharbour the change compared with the previous year is within the uncertainty of the measurement. Groundwater levels in the chalk boreholes at Wexcombe were close to normal for the time of year, and blending continued at Thornby.',
    'The asset register entry for Gallow Hill was updated in October to reflect the equipment now installed. The observation borehole at Pellow Down showed a seasonal range slightly below average, and samples from Marlpit were analysed within a day of collection.',
    'A contractor carried out the work at Ravensgill under the framework agreement, finishing ahead of plan. The risk assessment for Thornby was reviewed in October, and the control measures were found to be adequate for the coming year.',
    'Staff from the Coastal depot supported the work at Saltcote during the busy period in June. The long-term trend at Longridge shows a gradual improvement, and the planned survey of the Eastgate main was brought forward by one month.',
]
INSERTED = 'This edition also changes the reporting basis. Values for the smaller sites are now taken from the telemetry archive instead of manual readings, and the monthly figures are given to one decimal place throughout, so that they can be compared directly with the regulator’s return for the same period.'
ROWS = [
    ('January', '88.6', '58.7', '37.7', '70.8', '62.9'), ('February', '73.9', '70.0', '39.0', '69.5', '38.8'),
    ('March', '36.6', '25.1', '67.7', '63.4', '16.9'), ('April', '94.4', '45.6', '22.5', '92.2', '34.3'),
    ('May', '55.6', '81.5', '63.7', '29.3', '17.4'), ('June', '67.5', '43.0', '47.8', '31.4', '20.3'),
    ('July', '38.5', '45.7', '87.7', '30.0', '37.4'), ('August', '55.6', '64.5', '35.6', '97.8', '40.3'),
    ('September', '92.8', '63.3', '60.9', '24.9', '86.4'), ('October', '91.5', '68.6', '47.4', '34.6', '62.5'),
    ('November', '74.4', '80.8', '97.1', '14.7', '48.3'), ('December', '11.7', '61.8', '74.8', '24.9', '12.5'),
]


def source(inserted, cell=lambda r, k, v: v, end_stroke='0.9pt', gap=0):
    out = [PRE, '= Network figures', '']
    paras = FILLER[:4]
    if inserted:
        paras = paras[:1] + [INSERTED] + paras[1:]
    out += [p + '\n' for p in paras]
    out.append(f'#v({gap}pt)\n')
    cells = ', '.join('[' + cell(r, k, v) + ']' for r, row in enumerate(ROWS) for k, v in enumerate(row))
    out.append(r'''#figure(kind: table, supplement: none, numbering: none, caption: [Table 1 – Monthly indicators for groundwater, further sites], {
  set text(size: 9pt)
  table(columns: (auto,) + (5 * (1fr,)), align: (left,) + (5 * (right,)), stroke: none, inset: (x: 5pt, y: 2.6pt),
    table.hline(stroke: 0.9pt),
    table.header([*Month*], [*Netherby*], [*Thornby*], [*Wexcombe*], [*Oakhanger*], [*Upwell*]),
    table.hline(stroke: 0.45pt),
    ''' + cells + ''',
    table.hline(stroke: ''' + end_stroke + '''),
  )
})
''')
    out += [p + '\n' for p in FILLER[4:]]
    return '\n'.join(out)


def build(name, src):
    path = f'{OUT}/probe9-V1-closing-rules-{name}.pdf'
    with open(path, 'wb') as f:
        f.write(typst.compile(src.encode('utf-8')))
    return path


def closing_rule(path):
    """The lowest 0.9 pt rule on page 1: the rule that closes the table's first fragment."""
    page = pymupdf.open(path)[0]
    rules = [d for d in page.get_drawings() if abs((d.get('width') or 0) - 0.9) < 0.01 and d['rect'].height < 0.5]
    return max(rules, key=lambda d: d['rect'].y0)['rect']


def overlay(src, name, draw):
    """A copy of `src` with lines drawn over its first page (pymupdf)."""
    doc = pymupdf.open(src)
    draw(doc[0], closing_rule(src))
    path = f'{OUT}/probe9-V1-closing-rules-{name}.pdf'
    doc.save(path, garbage=3, deflate=True, no_new_id=True)
    return path


if __name__ == '__main__':
    GAP = 450
    before = build('before', source(False, gap=GAP))
    build('after', source(True, gap=GAP))
    # A real edit on the fragment's last row (January), in one version only.
    build('before-ul', source(False, gap=GAP, cell=lambda r, k, v: f'#underline[{v}]' if (r, k) == (0, 5) else v))
    build('after-ul', source(True, gap=GAP, cell=lambda r, k, v: f'#underline[{v}]' if (r, k) == (0, 5) else v))
    build('before-num', source(False, gap=GAP, cell=lambda r, k, v: '86.6' if (r, k) == (0, 1) else v))
    on_last = lambda f: (lambda r, k, v: f(v) if (r, k) == (0, 5) else v)
    build('before-red-text', source(False, gap=GAP, cell=on_last(lambda v: f'#text(fill: rgb("#c00000"))[{v}]')))
    build('before-hl', source(False, gap=GAP, cell=on_last(lambda v: f'#highlight[{v}]')))
    build('before-strike', source(False, gap=GAP, cell=on_last(lambda v: f'#strike[{v}]')))
    # The closing rule itself changed: recoloured, thickened, doubled.
    overlay(before, 'before-red', lambda pg, r: pg.draw_line((r.x0, r.y0), (r.x1, r.y0), color=(0.85, 0, 0), width=0.9))
    overlay(before, 'before-thick', lambda pg, r: pg.draw_line((r.x0, r.y0), (r.x1, r.y0), color=(0, 0, 0), width=2.4))
    overlay(before, 'before-double', lambda pg, r: pg.draw_line((r.x0, r.y0 + 4.2), (r.x1, r.y0 + 4.2), color=(0, 0, 0), width=0.9))
    # Second pass: the closing rule changed over a part of it only: a 20 pt
    # red segment drawn over it between two columns, a 12 pt gap cut out of
    # it (a white segment), or the rule drawn 11 pt longer at each end.
    overlay(before, 'before-rule-red-seg', lambda pg, r: pg.draw_line((288, r.y0), (308, r.y0), color=(0.85, 0, 0), width=0.9))
    overlay(before, 'before-rule-gap', lambda pg, r: pg.draw_line((292, r.y0), (304, r.y0), color=(1, 1, 1), width=1.6))
    overlay(before, 'before-rule-wide', lambda pg, r: [pg.draw_line((x0, r.y0), (x1, r.y0), color=(0, 0, 0), width=0.9) for x0, x1 in ((r.x0 - 11, r.x0 + 1), (r.x1 - 1, r.x1 + 11))])
    # Second pass: a colour put on one word of the last row (70.8) and a
    # real line of another word's own, a 1.6 pt black segment centred on the
    # closing rule, under the next word (62.9) or two words away (58.7).
    red = build('before-red-70', source(False, gap=GAP, cell=lambda r, k, v: f'#text(fill: rgb("#c00000"))[{v}]' if (r, k) == (0, 4) else v))
    for name, word in (('before-red-ul', '62.9'), ('before-red-ul-far', '58.7')):
        overlay(red, name, lambda pg, r, word=word: [pg.draw_line((w[0], r.y0), (w[2], r.y0), color=(0, 0, 0), width=1.6) for w in pg.get_text('words') if w[4] == word and w[1] > 700])
    # A rule really added at a page foot where no page break moved: under the
    # last line of page 1 of "after", which keeps no table.
    build('after-rule', source(True, gap=GAP).replace('#v(450pt)', '#v(1fr)\n#line(length: 100%, stroke: 0.9pt)\n#pagebreak()'))
    # The table without its end rule, and a full-width 0.9 pt rule a
    # paragraph's space below the next paragraph: the other version closes
    # the table with no rule, so the rule at the foot of page 1 of "before"
    # is no rule that only moved.
    noend = source(True, gap=GAP, end_stroke='none')
    build('after-noend-rule', noend.replace(FILLER[4] + '\n', FILLER[4] + '\n\n#line(length: 100%, stroke: 0.9pt)\n', 1))

"""SYNTHETIC counter-probes (second verifier, fifth pass text), reportlab canvas: draw order explicit.
R1-<mk>: a wrapped paragraph (11 pt), a footnote list (9 pt), the footer, then the footnote markers (6.5 pt, raised)
   drawn last: in the text after words on consecutive lines and before each footnote line.
   Marker labels: d (1 2 3), a (a b c), dot (1. 2. 3.), r (i ii iii), big (121 122 123), s (* ** †).
   Edits: -add  adds a third footnote (marker + list line), -word  changes the word before marker 2,
          -ins  inserts 'and eastern' early in the paragraph (re-wrap).
R2: a note in 8 pt, two CJK characters per line, drawn last right-aligned left of a Chinese paragraph (STSong-Light CID),
   one line per paragraph baseline. Edits: -ins re-wraps the paragraph, -note changes one note character."""
import os, sys
from reportlab.pdfgen import canvas
from reportlab.pdfbase.pdfmetrics import stringWidth, registerFont
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.lib.utils import simpleSplit
from reportlab.lib.pagesizes import A4
out = sys.argv[1]
W, H = A4
FS, LEAD = 11, 15
FLOW = ("The SYNTHETIC water board inspected the northern {ed}stations in spring and logged the flow at station 4 as "
        "1,250 litres per minute on each visit. Crews replaced two worn seals on the dosing line and recorded the "
        "torque on each flange bolt, as the plan requires for the outlet manifold. No leaks were found at the outlet "
        "manifold, and the gauges were calibrated in March. The readings are kept by the district office for ten years.")
NOTES = ["Flow read on the SYNTHETIC meter at the outlet.", "Seals bought under the 2026 framework.", "Gauge certificates are held by the district office."]
MK = {'d': ['1', '2', '3'], 'a': ['a', 'b', 'c'], 'dot': ['1.', '2.', '3.'], 'r': ['i', 'ii', 'iii'], 'big': ['121', '122', '123'], 's': ['*', '**', '†']}
TARGET = ['litres', 'seals', 'manifold,']  # words that get markers (one per line, consecutive lines)

def r1(name, mk, n, ins=False, word=False):
    c = canvas.Canvas(os.path.join(out, f'SYNTHETIC-{name}.pdf'), pagesize=A4, invariant=1); c.setTitle('SYNTHETIC')
    y = H - 80
    c.setFont('Helvetica-Bold', 14); c.drawString(56, y, 'SYNTHETIC station report'); y -= 28
    text = FLOW.format(ed='and eastern ' if ins else '')
    if word: text = text.replace('two worn seals', 'two cracked seals')
    lines = simpleSplit(text, 'Helvetica', FS, 330)
    c.setFont('Helvetica', FS)
    pos = []
    for ln in lines:
        c.drawString(56, y, ln); pos.append((ln, y)); y -= LEAD
    y -= 10
    c.setFont('Helvetica', 9)
    npos = []
    for t in NOTES[:n]:
        c.drawString(66, y, t); npos.append(y); y -= 12
    c.setFont('Helvetica', 8); c.drawString(56, 40, 'SYNTHETIC sample, fictitious board')
    c.setFont('Helvetica', 6.5)
    for q in range(n):
        w = TARGET[q]
        for ln, yy in pos:
            ws = ln.split(' ')
            if w in ws:
                i = ws.index(w)
                pre = ' '.join(ws[: i + 1])
                c.drawString(56 + stringWidth(pre, 'Helvetica', FS) + 0.3, yy + 3.5, mk[q]); break
    for q in range(n):
        c.drawString(56, npos[q] + 2.5, mk[q])
    c.showPage(); c.save()

for tag, mk in MK.items():
    r1(f'R1-{tag}-before', mk, 2)
    r1(f'R1-{tag}-add', mk, 3)
    r1(f'R1-{tag}-word', mk, 2, word=True)
    r1(f'R1-{tag}-ins', mk, 2, ins=True)

registerFont(UnicodeCIDFont('STSong-Light'))
ZH = '本报告为合成样例，记录北区{ed}各泵站春季巡检的结果。巡检人员在每次到访时记录四号站的流量，并更换了加药管线上两处磨损的密封件。所有法兰螺栓的扭矩均按计划记录在案，出水总管未发现泄漏，各压力表已于三月完成校准。'
def zhwrap(s, width, size):
    lines, cur = [], ''
    for ch in s:
        if stringWidth(cur + ch, 'STSong-Light', size) > width: lines.append(cur); cur = ch
        else: cur += ch
    lines.append(cur); return lines
def r2(name, ins=False, note=False):
    c = canvas.Canvas(os.path.join(out, f'SYNTHETIC-{name}.pdf'), pagesize=A4, invariant=1); c.setTitle('SYNTHETIC')
    y = H - 80
    c.setFont('STSong-Light', 14); c.drawString(56, y, 'SYNTHETIC 合成样例 报告'); y -= 28
    c.setFont('STSong-Light', FS)
    top = y
    for ln in zhwrap(ZH.format(ed='和东区' if ins else ''), 300, FS):
        c.drawString(120, y, ln); y -= LEAD
    c.setFont('Helvetica', 8); c.drawString(56, 40, 'SYNTHETIC sample, fictitious board')
    c.setFont('STSong-Light', 8)
    y = top
    for ln in ['注明', '数据', '已经' if note else '暂时', '保存', '待审']:
        c.drawRightString(116, y, ln); y -= LEAD
    c.showPage(); c.save()
r2('R2-before'); r2('R2-ins', ins=True); r2('R2-note', note=True)
print('ok')

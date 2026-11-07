# SYNTHETIC probe PDFs for fix round 9, area V1-closing-rules, third pass
# (after the re-verifier's counter-probes): a mark drawn right next to the
# rule that closes the table's first fragment in
# probe9-V1-closing-rules-before.pdf (made by v1-closing-rules.py, Typst
# 0.15), drawn over the page with PyMuPDF 2.1:
# - before-dash-below: a red 0.8 pt line, 20 pt long, 4 pt below the rule;
# - before-tick: a black 0.6 pt tick, 3 pt tall, across the rule.
#
# Run with a Python that has the typst (0.15) and pymupdf packages, from
# test/fixtures (after v1-closing-rules.py):
#   python gen9/v1-closing-rules-third.py .
import importlib.util
import os
import sys
import pymupdf

OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
spec = importlib.util.spec_from_file_location('v1', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'v1-closing-rules.py'))
v1 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v1)
v1.OUT = OUT
before = f'{OUT}/probe9-V1-closing-rules-before.pdf'
v1.overlay(before, 'before-dash-below', lambda pg, r: pg.draw_line((300, r.y0 + 4), (320, r.y0 + 4), color=(0.85, 0, 0), width=0.8))
v1.overlay(before, 'before-tick', lambda pg, r: pg.draw_line((310, r.y0 - 1.5), (310, r.y0 + 1.5), color=(0, 0, 0), width=0.6))
print('ok')

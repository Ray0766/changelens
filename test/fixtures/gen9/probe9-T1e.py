#!/usr/bin/env python3
"""Fix round 9, area T1 (reading order), fifth pass: SYNTHETIC probe PDFs written with reportlab,
the same pages as the independent check of the fourth pass (its K8rl and K9 probes).

Usage:  python3 probe9-T1e.py OUT_DIR   (OUT_DIR: test/fixtures; reportlab, invariant output)

Every document is synthetic: a fictitious water board, marked SYNTHETIC on the page. Each page
draws its footer before the text named below, so that text follows the footer in the stream.

  probe9-T1-rlnote-before / -body   a paragraph at x = 200, then the footer, then a side note drawn
                                    right-aligned to x = 199 (drawRightString), one line on each
                                    baseline of the paragraph; -body inserts "and eastern" in the
                                    paragraph, which re-wraps it
  probe9-T1-rlfn-one / -two         a paragraph and a footnote list in 9 pt; the footnote markers
                                    (6.5 pt) are drawn after the footer, raised, the list's at x = 56
                                    before each footnote line; -two adds a second footnote and
                                    inserts a paragraph at the top
"""
import os
import sys

from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import simpleSplit
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

W, H = A4
FS, LEAD = 11, 15
FLOW = ("The SYNTHETIC water board inspected the northern {ed}stations in spring and logged the flow at station 4 as "
        "1,250 litres per minute on each visit. Crews replaced two worn seals on the dosing line and recorded the "
        "torque on each flange bolt, as the plan requires for the outlet manifold. No leaks were found at the outlet "
        "manifold, and the gauges were calibrated in March. The readings are kept by the district office for ten years.")
NOTE = ["Note: the SYNTHETIC", "readings for station 4 are", "provisional until the district", "office confirms the calibration", "certificate."]


def doc(out, name):
    c = canvas.Canvas(os.path.join(out, f"probe9-T1-{name}.pdf"), pagesize=A4, invariant=1)
    c.setCreator("ChangeLens probe9-T1e SYNTHETIC")
    return c


def rlnote(out, name, ed):
    c = doc(out, name)
    y = H - 80
    c.setFont("Helvetica-Bold", 14)
    c.drawString(56, y, "SYNTHETIC station report")
    y -= 28
    c.setFont("Helvetica", FS)
    top = y
    for line in simpleSplit(FLOW.format(ed="and eastern " if ed else ""), "Helvetica", FS, 330):
        c.drawString(200, y, line)
        y -= LEAD
    y -= 8
    for line in simpleSplit(FLOW.format(ed=""), "Helvetica", FS, 480):
        c.drawString(56, y, line)
        y -= LEAD
    c.setFont("Helvetica", 8)
    c.drawString(56, 40, "SYNTHETIC sample, fictitious board")
    c.setFont("Helvetica", FS)
    y = top
    for line in NOTE:
        c.drawRightString(199, y, line)
        y -= LEAD
    c.showPage()
    c.save()


LINES = ["The SYNTHETIC water board inspected the northern stations in spring and logged",
         "the flow at station 4 as 1,250 litres per minute. The gauges are checked twice a",
         "year. The hose sets are replaced every spring. Orders placed before noon ship the",
         "same day, and the district office keeps the records for ten years."]
NOTES = ["Calibration certificates are kept by the SYNTHETIC district office.", "Hose sets are sold in pairs only."]


def rlfn(out, name, two):
    c = doc(out, name)
    notes = NOTES if two else NOTES[:1]
    marks = [(2, "year.", "1"), (2, "spring.", "2")] if two else [(2, "year.", "1")]
    y = H - 80
    c.setFont("Helvetica-Bold", 14)
    c.drawString(56, y, "SYNTHETIC station report")
    y -= 28
    c.setFont("Helvetica", FS)
    if two:
        c.drawString(56, y, "Inserted paragraph: this SYNTHETIC report replaces the interim note sent in May.")
        y -= LEAD + 8
    pos = []
    for line in LINES:
        c.drawString(56, y, line)
        pos.append(y)
        y -= LEAD
    y -= 10
    c.setFont("Helvetica", 9)
    npos = []
    for n in notes:
        c.drawString(62, y, n)
        npos.append(y)
        y -= 12
    c.setFont("Helvetica", 8)
    c.drawString(56, 40, "SYNTHETIC sample, fictitious board")
    c.setFont("Helvetica", 6.5)
    for k, word, label in marks:
        c.drawString(56 + stringWidth(LINES[k][: LINES[k].index(word) + len(word)], "Helvetica", FS) + 0.3, pos[k] + 3.5, label)
    for j in range(len(notes)):
        c.drawString(56, npos[j] + 2.5, str(j + 1))
    c.showPage()
    c.save()


if __name__ == "__main__":
    out = sys.argv[1]
    rlnote(out, "rlnote-before", False)
    rlnote(out, "rlnote-body", True)
    rlfn(out, "rlfn-one", False)
    rlfn(out, "rlfn-two", True)

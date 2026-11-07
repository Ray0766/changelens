#!/usr/bin/env python3
"""Fix round 9, area T3 (dates in Chinese and Japanese), third pass: SYNTHETIC probe PDFs written with fpdf2.

Usage:  python3 probe9-T3d.py OUT_DIR   (OUT_DIR: test/fixtures; fpdf2 2.9, WenQuanYi Zen Hei)

Every document is synthetic: fictitious text marked SYNTHETIC. A 60 mm column wraps the line that
ends in "有效期至2026年" at its edge, so the date goes on with "11月30日止" on the next line; the
title above is set in 14 pt, the column in 10 pt.

  probe9-T3-wrapshort-before / -after   control: a title shorter than the column; the month
                                        changes (11 -> 12)
  probe9-T3-wrapwide-before / -after    a title wider than the column; the month changes
  probe9-T3-wrapcols-before / -after    the left column of two, under a title over both columns;
                                        the year and the month change (2026 -> 2027, 11 -> 12)
"""
import os
import sys
from datetime import datetime, timezone

from fpdf import FPDF

FIXED = datetime(2026, 11, 6, 9, 0, 0, tzinfo=timezone.utc)
WQY = "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"
TITLES = {
    "wrapshort": "RG1（SYNTHETIC）",
    "wrapwide": "跨行日期与宽标题（SYNTHETIC 合成样例 RG2）",
    "wrapcols": "两栏版式与跨行日期（SYNTHETIC 合成样例 RH3），标题占满两栏版心宽度",
}


def make(out, name, after):
    year = "2027" if after and name == "wrapcols" else "2026"
    month = "12" if after else "11"
    pdf = FPDF(format="A4")
    pdf.set_creation_date(FIXED)
    pdf.set_creator("ChangeLens probe9-T3d SYNTHETIC")
    pdf.set_auto_page_break(False)
    pdf.add_font("WQY", "", WQY, collection_font_number=0)
    pdf.add_page()
    pdf.set_font("WQY", "", 14)
    pdf.set_xy(18, 14)
    pdf.cell(174, 8, TITLES[name])
    pdf.set_font("WQY", "", 10)
    text = "甲" * 9 + f"有效期至{year}年{month}月30日止，期满前另行协商续签事宜，本段为合成文本。"
    filler = "本条款为合成文本，用于测试两栏版式中的换行与阅读顺序，请勿作为真实合同使用。" * 4
    pdf.set_xy(18, 30)
    pdf.multi_cell(60, 6, text, align="L")
    if name == "wrapcols":
        pdf.set_xy(18, pdf.get_y() + 4)
        pdf.multi_cell(60, 6, filler, align="L")
        pdf.set_xy(100, 30)
        pdf.multi_cell(60, 6, filler, align="L")
    pdf.output(os.path.join(out, f"probe9-T3-{name}-{'after' if after else 'before'}.pdf"))


if __name__ == "__main__":
    for n in TITLES:
        for af in (False, True):
            make(sys.argv[1], n, af)

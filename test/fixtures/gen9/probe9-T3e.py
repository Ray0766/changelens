#!/usr/bin/env python3
"""Fix round 9, area T3 (dates in Chinese and Japanese), fourth pass: SYNTHETIC probe PDFs written with fpdf2.

Usage:  python3 probe9-T3e.py OUT_DIR   (OUT_DIR: test/fixtures; fpdf2 2.9, WenQuanYi Zen Hei)

Every document is synthetic: fictitious text marked SYNTHETIC. A field block of two lines broken
by hand, "检定年度 2026年" and "11月 首次检定", stands under a 14 pt title; its first line is its
longest. The month changes (11 -> 12).

  probe9-T3-field-before / -after     the only 10 pt text on the page; an 8 pt note under it
  probe9-T3-fieldbody-before / -after control: a 10 pt body paragraph stands above the block
"""
import os
import sys
from datetime import datetime, timezone

from fpdf import FPDF

FIXED = datetime(2026, 11, 7, 9, 0, 0, tzinfo=timezone.utc)
WQY = "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"


def make(out, name, after):
    pdf = FPDF(format="A4")
    pdf.set_creation_date(FIXED)
    pdf.set_creator("ChangeLens probe9-T3e SYNTHETIC")
    pdf.set_auto_page_break(False)
    pdf.add_font("WQY", "", WQY, collection_font_number=0)
    pdf.add_page()
    pdf.set_font("WQY", "", 14)
    pdf.set_xy(18, 14)
    pdf.cell(174, 8, "计量器具检定记录（SYNTHETIC 合成样例）")
    if name == "fieldbody":
        pdf.set_font("WQY", "", 10)
        pdf.set_xy(18, 26)
        pdf.multi_cell(150, 6, "本记录为合成文本，用于测试字段换行。各字段单独成行，请勿作为真实记录使用。")
    pdf.set_font("WQY", "", 10)
    pdf.set_xy(18, 44)
    pdf.multi_cell(80, 6, "检定年度 2026年\n" + ("12月" if after else "11月") + " 首次检定", align="L")
    pdf.set_font("WQY", "", 8)
    pdf.set_xy(18, 70)
    pdf.multi_cell(150, 5, "注：本表为合成样例（SYNTHETIC），所列年度与月份均为虚构。")
    pdf.output(os.path.join(out, f"probe9-T3-{name}-{'after' if after else 'before'}.pdf"))


if __name__ == "__main__":
    for n in ("field", "fieldbody"):
        for af in (False, True):
            make(sys.argv[1], n, af)

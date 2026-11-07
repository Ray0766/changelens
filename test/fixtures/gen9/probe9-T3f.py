#!/usr/bin/env python3
"""Fix round 9, area T3 (Chinese and Japanese text), fourth pass: SYNTHETIC probe PDFs written with fpdf2.

Usage:  python3 probe9-T3f.py OUT_DIR   (OUT_DIR: test/fixtures; fpdf2 2.9, WenQuanYi Zen Hei)

Every document is synthetic: fictitious text marked SYNTHETIC. One sentence per pair, where a
full-width minus or plus stands right after a character, with no space before it.

  probe9-T3-minus-before / -after      "本期扣款－1,200元" -> "－1,500元", and 8,800 -> 8,500
  probe9-T3-minussign-before / -after  "低于－20℃" -> "低于＋20℃" (the sign itself changes)
  probe9-T3-minusrange-before / -after control: a range after a month, "3月－5月" -> "3月－6月"
Fifth pass, from the independent check of the fourth (its S1 probes): a mark after a unit of two
characters joins a range, and one after a word that names a numbered table is no sign:
  probe9-T3-minushours-before / -after "3小时－5小时" -> "3小时－6小时"
  probe9-T3-minusref-before / -after   "詳細は表－2" -> "表－3" (Japanese)
"""
import os
import sys
from datetime import datetime, timezone

from fpdf import FPDF

FIXED = datetime(2026, 11, 7, 9, 0, 0, tzinfo=timezone.utc)
WQY = "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"
TEXTS = {
    "minus": ("本期扣款－1,200元，实发金额为8,800元。", "本期扣款－1,500元，实发金额为8,500元。"),
    "minussign": ("冬季气温低于－20℃时，泵的启动时间为30秒。", "冬季气温低于＋20℃时，泵的启动时间为30秒。"),
    "minusrange": ("水泵的检修期为3月－5月，期间暂停供水。", "水泵的检修期为3月－6月，期间暂停供水。"),
    "minushours": ("单次停机时间为3小时－5小时，期间暂停供水。", "单次停机时间为3小时－6小时，期间暂停供水。"),
    "minusref": ("詳細は表－2を参照してください。", "詳細は表－3を参照してください。"),
}


def make(out, name, after):
    pdf = FPDF(format="A4")
    pdf.set_creation_date(FIXED)
    pdf.set_creator("ChangeLens probe9-T3f SYNTHETIC")
    pdf.add_font("WQY", "", WQY, collection_font_number=0)
    pdf.add_page()
    pdf.set_font("WQY", "", 14)
    pdf.cell(0, 10, "SYNTHETIC 合成样例", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("WQY", "", 11)
    pdf.multi_cell(0, 7, "第一段为合成文本，用于测试紧接汉字的正负号。")
    pdf.ln(3)
    pdf.multi_cell(0, 7, TEXTS[name][1 if after else 0])
    pdf.output(os.path.join(out, f"probe9-T3-{name}-{'after' if after else 'before'}.pdf"))


if __name__ == "__main__":
    for n in TEXTS:
        for af in (False, True):
            make(sys.argv[1], n, af)

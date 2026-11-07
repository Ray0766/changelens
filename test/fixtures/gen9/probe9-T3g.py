#!/usr/bin/env python3
"""Fix round 9, area T3 (Chinese and Japanese text), sixth pass: SYNTHETIC probe PDFs written with
fpdf2 and Typst, from the independent check of the fifth pass (its X7 and X8 probes).

Usage:  <python with fpdf2 2.9 and typst 0.15> probe9-T3g.py OUT_DIR   (OUT_DIR: test/fixtures;
        WenQuanYi Zen Hei)

Every document is synthetic: fictitious text marked SYNTHETIC. One sentence per pair, where a range
mark stands after a figure's unit set a space from its figure:
  probe9-T3-minushourssp-before / -after  fpdf2, typed spaces: "为 3 小时－5 小时" -> "3 小时－6 小时"
  probe9-T3-minushoursty-before / -after  Typst, no spaces typed: "为3小时－5小时" -> "3小时－6小时";
                                          Typst spaces the figures from the Chinese text
Control, where nothing points to a range:
  probe9-T3-minusty-before / -after       Typst: "本期扣款－1,200元" -> "－1,500元"
"""
import os
import sys
from datetime import datetime, timezone

import typst
from fpdf import FPDF

FIXED = datetime(2026, 11, 7, 9, 0, 0, tzinfo=timezone.utc)
WQY = "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"
FPDF_TEXTS = {
    "minushourssp": ("单次停机时间为 3 小时－5 小时，期间暂停供水。", "单次停机时间为 3 小时－6 小时，期间暂停供水。"),
}
TYPST_TEXTS = {
    "minushoursty": ("单次停机时间为3小时－5小时，期间暂停供水。", "单次停机时间为3小时－6小时，期间暂停供水。"),
    "minusty": ("本期扣款－1,200元，期间暂停供水。", "本期扣款－1,500元，期间暂停供水。"),
}


def name(out, n, after):
    return os.path.join(out, f"probe9-T3-{n}-{'after' if after else 'before'}.pdf")


def make_fpdf(out, n, after):
    pdf = FPDF(format="A4")
    pdf.set_creation_date(FIXED)
    pdf.set_creator("ChangeLens probe9-T3g SYNTHETIC")
    pdf.add_font("WQY", "", WQY, collection_font_number=0)
    pdf.add_page()
    pdf.set_font("WQY", "", 14)
    pdf.cell(0, 10, "SYNTHETIC 合成样例", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("WQY", "", 11)
    pdf.multi_cell(0, 7, "第一段为合成文本，用于测试范围符号。")
    pdf.ln(3)
    pdf.multi_cell(0, 7, FPDF_TEXTS[n][1 if after else 0])
    pdf.output(name(out, n, after))


def make_typst(out, n, after):
    src = (
        '#set document(date: none)\n#set page(paper: "a4")\n'
        '#set text(font: "WenQuanYi Zen Hei", size: 11pt, lang: "zh")\n'
        "= SYNTHETIC 合成样例\n第一段为合成文本，用于测试范围符号。\n\n"
        f"{TYPST_TEXTS[n][1 if after else 0]}\n\n第三段为合成文本，不作任何修改。\n"
    )
    path = name(out, n, after)[:-4] + ".typ"
    with open(path, "w", encoding="utf-8") as f:
        f.write(src)
    try:
        typst.compile(path, output=name(out, n, after))
    finally:
        os.remove(path)


if __name__ == "__main__":
    for n in FPDF_TEXTS:
        for af in (False, True):
            make_fpdf(sys.argv[1], n, af)
    for n in TYPST_TEXTS:
        for af in (False, True):
            make_typst(sys.argv[1], n, af)

#!/usr/bin/env python3
"""Fix round 9, area T3 (context and dates in Chinese and Japanese): SYNTHETIC probe PDFs.

Usage:  <python with fpdf2 2.9 and PyMuPDF 2.1> probe9-T3.py OUT_DIR   (OUT_DIR: test/fixtures)

Every document is synthetic: fictitious companies, amounts and dates, marked SYNTHETIC on the page.
They are written like round 5's cases: fpdf2 cells and multi_cells with an embedded subset of
WenQuanYi Zen Hei (holdout5-i-payslip-cny) or IPAGothic (holdout5-i-nouhinsho-jpy), and PyMuPDF
insert_htmlbox with WenQuanYi Zen Hei (holdout5-j-zh-quote-htmlbox).

  probe9-T3-ctx-before / -after          fpdf2, Chinese: the amount in words 陆 -> 柒; "4 小时内派工程师"
                                         4 -> 6; 每季度 -> 每月 after a sentence; an English late fee
                                         1.50% -> 1.05%; and two edits side by side (10% -> 5% and
                                         30 日内 -> 15 日内)
  probe9-T3-html-before / -after         PyMuPDF insert_htmlbox, Chinese: 有效期至 2026年11月30日 ->
                                         2026年12月31日, "4 小时内派工程师" 4 -> 6
  probe9-T3-jadate-before / -after       fpdf2, Japanese: dates and times with 年月日 and 時分 changed
                                         (納品日, 有効期限, full-width 契約期間, 午後６時, 14時30分), next
                                         to terms that keep their percentage (30日以内, 3年, 2時間, 200 枚),
                                         and a date followed by a changed word (納品 -> 出荷)
  probe9-T3-zhdate-before / -after       fpdf2, Chinese: 2026年11月20日下午3点 -> 下午5点, 17时30分 ->
                                         18时30分, 11月 -> 12月 in 2026年11月, next to 45 天内 and 3年; a
                                         date broken over two lines (2026年11 / 月30日 -> 2026年12 / 月31日);
                                         two dates side by side, both changed
"""
import os
import sys
from datetime import datetime, timezone

import fpdf
import pymupdf
from fpdf import FPDF

FIXED_DATE = datetime(2026, 11, 6, 9, 0, 0, tzinfo=timezone.utc)
FONT_WQY = "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"  # collection index 0 = WenQuanYi Zen Hei
WQY_DIR = "/usr/share/fonts/truetype/wqy"
FONT_IPAG = "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf"
L = 18


def new_pdf(font, path, **kw):
    pdf = FPDF(format="A4")
    pdf.set_creation_date(FIXED_DATE)
    pdf.set_producer(f"fpdf2 {fpdf.__version__}")
    pdf.set_creator("probe9-T3 SYNTHETIC generator")
    pdf.set_auto_page_break(False)
    pdf.add_font(font, "", path, **kw)
    pdf.add_page()
    return pdf


def para(pdf, font, y, text, size=10, w=174, h=6):
    pdf.set_font(font, "", size)
    pdf.set_xy(L, y)
    pdf.multi_cell(w, h, text, align="L")
    return pdf.get_y() + 4


def ctx(after):
    pdf = new_pdf("WQY", FONT_WQY, collection_font_number=0)
    pdf.set_font("WQY", "", 15)
    pdf.set_xy(L, 16)
    pdf.cell(174, 8, "服务报价与工资说明（SYNTHETIC 合成样例）")
    pdf.set_draw_color(0, 102, 153)
    pdf.set_line_width(0.6)
    pdf.rect(L, 30, 174, 19)
    pdf.set_font("WQY", "", 11)
    pdf.set_xy(L + 3, 32.5)
    pdf.cell(90, 7, "实发工资 Net pay")
    pdf.set_font("WQY", "", 15)
    pdf.cell(78, 7, "CNY 17,737.40" if after else "CNY 17,637.40", align="R")
    pdf.set_font("WQY", "", 8.5)
    pdf.set_xy(L + 3, 41)
    pdf.cell(40, 5, "金额大写 Amount in words")
    pdf.cell(128, 5, "人民币壹万柒仟柒佰叁拾柒元肆角整" if after else "人民币壹万柒仟陆佰叁拾柒元肆角整")
    y = 58
    y = para(pdf, "WQY", y, "本报价涵盖贵司 12 台办公设备的年度维护和耗材更换。我们" + ("每月" if after else "每季度")
             + "上门巡检一次，并在巡检后两个工作日内提交书面报告。")
    y = para(pdf, "WQY", y, "工作日 8:30 至 17:30 报修的，我们在 2 小时内电话响应，" + ("6" if after else "4")
             + " 小时内派工程师上门。非工作时间报修的，响应时间顺延至下一个工作日。")
    y = para(pdf, "WQY", y, "The late fee is " + ("1.05%" if after else "1.50%")
             + " of the amount due for each month of delay, as set out in the payment schedule.")
    y = para(pdf, "WQY", y, "合同总价的 " + ("5%" if after else "10%") + " 作为质量保证金，质保期满后 "
             + ("15" if after else "30") + " 日内无息退还。")
    return pdf


def jadate(after):
    pdf = new_pdf("IPAG", FONT_IPAG)
    pdf.set_font("IPAG", "", 16)
    pdf.set_xy(L, 16)
    pdf.cell(174, 8, "納品・保守条件（SYNTHETIC 合成サンプル）")
    grid = [("納品日", "2026年11月12日" if after else "2026年11月10日"),
            ("有効期限", "2026年12月31日" if after else "2026年11月30日"),
            ("数量", "250 枚" if after else "200 枚"),
            ("保証期間", "5年" if after else "3年")]
    pdf.set_draw_color(120)
    pdf.set_line_width(0.2)
    y = 30
    for k, v in grid:
        pdf.set_xy(L, y)
        pdf.set_font("IPAG", "", 8.5)
        pdf.cell(36, 7, k, border=1)
        pdf.cell(60, 7, v, border=1)
        y += 7
    y += 6
    y = para(pdf, "IPAG", y, "本契約の有効期間は、" + ("２０２７年５月１日" if after else "２０２７年４月１日") + "から２０２８年３月３１日までとする。")
    y = para(pdf, "IPAG", y, "乙は、営業日の午前９時から午後" + ("８時" if after else "６時") + "まで、甲からの問い合わせに対応する。")
    y = para(pdf, "IPAG", y, "集荷の締切は毎日" + ("15時30分" if after else "14時30分") + "とし、作業時間は1回あたり"
             + ("3時間" if after else "2時間") + "を上限とする。")
    y = para(pdf, "IPAG", y, "代金は納品後" + ("45日以内" if after else "30日以内") + "に指定口座へ振り込むものとする。")
    y = para(pdf, "IPAG", y, "試作品は2026年11月" + ("12日出荷" if after else "10日納品") + "の予定である。")
    return pdf


def zhdate(after):
    pdf = new_pdf("WQY", FONT_WQY, collection_font_number=0)
    pdf.set_font("WQY", "", 15)
    pdf.set_xy(L, 16)
    pdf.cell(174, 8, "会议与交货安排（SYNTHETIC 合成样例）")
    y = 30
    y = para(pdf, "WQY", y, "项目评审会定于 2026年11月20日下午" + ("5点" if after else "3点") + "在二楼会议室举行。")
    y = para(pdf, "WQY", y, "投标文件的递交截止时间为当日 " + ("18时30分" if after else "17时30分") + "，逾期不予受理。")
    y = para(pdf, "WQY", y, "首批设备计划于 2026年" + ("12月" if after else "11月") + "完成安装调试。")
    y = para(pdf, "WQY", y, "交货期：合同生效后 " + ("60" if after else "45") + " 天内交货，质保期 " + ("5年" if after else "3年") + "。")
    # A date broken over two lines between its month figure and 月 (fpdf2 wraps the line there).
    wrapped = ("本协议经双方授权代表签字并加盖公章后生效，并报送甲方合同管理部门及财务部门备案，有效期至"
               + ("2026年12月31日" if after else "2026年11月30日") + "止，期满前一个月双方协商续签。")
    pdf.set_font("WQY", "", 10)
    lines = pdf.multi_cell(174, 6, wrapped, dry_run=True, output="LINES")
    assert lines[0].endswith("2026年12" if after else "2026年11"), lines
    y = para(pdf, "WQY", y, wrapped)
    # Two dates side by side, both changed.
    y = para(pdf, "WQY", y, "培训于" + ("12月1日至12月3日" if after else "11月30日至12月2日") + "在总部举行。")
    return pdf


ZH_CSS = """
@font-face {font-family: zh; src: url(wqy-zenhei.ttc);}
body {font-family: zh; font-size: 10.5pt; line-height: 1.65;}
h1 {font-size: 16pt; margin: 0 0 8pt 0; line-height: 1.3;}
p {margin: 0 0 5pt 0; text-align: justify;}
p.meta {font-size: 9.5pt; margin: 0 0 2pt 0;}
"""


def html(path, after):
    valid = "2026年12月31日" if after else "2026年11月30日"
    hours = "6" if after else "4"
    body = f"""
<h1>办公设备维护服务报价单（SYNTHETIC 合成样例）</h1>
<p class="meta">报价编号：QH-2026-901　　报价日期：2026年11月4日　　有效期至：{valid}</p>
<p class="meta">致：示例设计工作室 行政部　　报价方：示例办公服务有限公司</p>
<p>工作日 8:30 至 17:30 报修的，我们在 2 小时内电话响应，{hours} 小时内派工程师上门。非工作时间报修的，响应时间顺延至下一个工作日。</p>
"""
    doc = pymupdf.open()
    page = doc.new_page(width=595.28, height=841.89)
    spare, scale = page.insert_htmlbox(pymupdf.Rect(56, 52, 539, 790), body, css=ZH_CSS, archive=pymupdf.Archive(WQY_DIR), scale_low=1)
    assert scale == 1 and spare >= 0, (spare, scale)
    doc.set_metadata({"title": "SYNTHETIC probe9-T3-html", "producer": "PyMuPDF 2.1 insert_htmlbox",
                      "creationDate": "D:20261106090000Z", "modDate": "D:20261106090000Z"})
    doc.subset_fonts()
    doc.save(path, garbage=3, deflate=True, no_new_id=True)


def main():
    out = sys.argv[1]
    for name, make in (("ctx", ctx), ("jadate", jadate), ("zhdate", zhdate)):
        for version in ("before", "after"):
            make(version == "after").output(os.path.join(out, f"probe9-T3-{name}-{version}.pdf"))
    for version in ("before", "after"):
        html(os.path.join(out, f"probe9-T3-html-{version}.pdf"), version == "after")


if __name__ == "__main__":
    main()

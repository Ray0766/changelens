#!/usr/bin/env python3
"""Fix round 9, area T3, second pass (dates in table cells and rows): SYNTHETIC probe PDFs.

Usage:  <python with fpdf2 2.9> probe9-T3b.py OUT_DIR   (OUT_DIR: test/fixtures; needs LibreOffice 24.2 `soffice`)

The fpdf2 files are byte-identical on each run; the LibreOffice files differ only in their creation time.

Every document is synthetic: fictitious leases, terms and dates, marked SYNTHETIC on the page.
A figure with 年 in one table cell (a term: "3年") stood next to a date in the next cell, column or
row ("11月1日"), and the two were read as one date ("3年 11月1日 → 5年 11月1日", no percentage; two
edits of one row listed twice as "2年 11月1日 → 4年 12月1日"). Each probe holds such rows, and
controls: dates in prose, dates broken over a full line, a spaced date, an era date and a ROC date.

  probe9-T3-cells-before / -after    fpdf2 cells and multi_cells, WenQuanYi Zen Hei / IPAGothic: a
                                     lease table whose row has 租期 | 起租日期 | 保证金 in cells on one
                                     line (3年 -> 5年; 2年 -> 4年 with 11月1日 -> 12月1日 and 10% -> 15%);
                                     a grid row 质保期限 | 3年 above 11月 | 设备巡检; a grid row 检定年度 |
                                     2026年 above 11月 | 首次检定 (2026 -> 2027); a schedule 11月 | 22日
                                     (22 -> 21 working days); prose "租期2年 1月1日起算" (2 -> 3); the year
                                     and the day of one date changed (2026年10月30日 -> 2027年10月31日);
                                     dates broken over a full line after 年 and after 月; a spaced date;
                                     令和8年11月30日; 114年12月18日
  probe9-T3-lotable-before / -after  LibreOffice 24.2 (HTML -> PDF), WenQuanYi Zen Hei: a lease table
                                     whose cells become lines of one block and whose date cell wraps
                                     ("11 月 1" / "日"); a paragraph broken after 年 at a full line with
                                     the year changed; a short line "检定年度 2026年" broken by <br>
                                     before "11月 首次检定" with the year changed
"""
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

import fpdf
from fpdf import FPDF

FIXED_DATE = datetime(2026, 11, 6, 9, 0, 0, tzinfo=timezone.utc)
FONT_WQY = "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"  # collection index 0 = WenQuanYi Zen Hei
FONT_IPAG = "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf"
L = 18


def new_pdf():
    pdf = FPDF(format="A4")
    pdf.set_creation_date(FIXED_DATE)
    pdf.set_producer(f"fpdf2 {fpdf.__version__}")
    pdf.set_creator("probe9-T3b SYNTHETIC generator")
    pdf.set_auto_page_break(False)
    pdf.add_font("WQY", "", FONT_WQY, collection_font_number=0)
    pdf.add_font("IPAG", "", FONT_IPAG)
    pdf.add_page()
    return pdf


def para(pdf, y, text, font="WQY", size=10, w=174, h=6):
    pdf.set_font(font, "", size)
    pdf.set_xy(L, y)
    pdf.multi_cell(w, h, text, align="L")
    return pdf.get_y() + 4


def grid(pdf, y, rows, widths):
    for r in rows:
        pdf.set_xy(L, y)
        for w, v in zip(widths, r):
            pdf.cell(w, 7, v, border=1)
        y += 7
    return y + 6


def wrapped(pdf, y, text, end):
    """A paragraph whose first line must end with `end` (fpdf2 breaks the line there)."""
    pdf.set_font("WQY", "", 10)
    lines = pdf.multi_cell(174, 6, text, dry_run=True, output="LINES")
    assert lines[0].endswith(end), lines
    return para(pdf, y, text)


def cells(after):
    pdf = new_pdf()
    pdf.set_font("WQY", "", 15)
    pdf.set_xy(L, 16)
    pdf.cell(174, 8, "租赁条件表（SYNTHETIC 合成样例）")
    pdf.set_draw_color(120)
    pdf.set_line_width(0.2)
    pdf.set_font("WQY", "", 10)
    y = grid(pdf, 30, [("仓库", "租期", "起租日期", "保证金"),
                       ("A 区", "5年" if after else "3年", "11月1日", "10%"),
                       ("B 区", "4年" if after else "2年", "12月1日" if after else "11月1日", "15%" if after else "10%")],
             (30, 30, 40, 30))
    y = grid(pdf, y, [("质保期限", "5年" if after else "3年"), ("11月", "设备巡检"), ("12月", "年度保养")], (40, 60))
    y = grid(pdf, y, [("检定年度", "2027年" if after else "2026年"), ("11月", "首次检定")], (40, 60))
    y = grid(pdf, y, [("月份", "工作日"), ("11月", "21日" if after else "22日"), ("12月", "23日")], (40, 60))
    y = para(pdf, y, "租期" + ("3年" if after else "2年") + " 1月1日起算，租金按季度支付。")
    y = para(pdf, y, "本合同于" + ("2027年10月31日" if after else "2026年10月30日") + "届满，届满前双方另行协商。")
    y = wrapped(pdf, y, "设备安装完成并经双方授权代表签字确认后，乙方应向甲方合同管理部门提交检定计划，首次检定应于"
                + ("2027年" if after else "2026年") + "11月30日前完成，逾期按日计收违约金。", "2027年" if after else "2026年")
    y = wrapped(pdf, y, "本协议经双方授权代表签字并加盖公章后生效，报送甲方合同管理部门及财务部门备案，检定应于2026年11月"
                + ("28日" if after else "30日") + "前完成，逾期按日计收违约金。", "2026年11月")
    y = para(pdf, y, "报价有效期至 2026 年 " + ("12 月 31 日" if after else "11 月 30 日") + "，逾期须重新报价。")
    y = para(pdf, y, "契約日は令和8年" + ("12月1日" if after else "11月30日") + "とする。", font="IPAG")
    y = para(pdf, y, "交貨日期為114年" + ("12月16日" if after else "12月18日") + "。")
    return pdf


def lotable(after):
    term = ("5年", "4年") if after else ("3年", "2年")
    year = "2027" if after else "2026"
    return f"""<!doctype html><html><head><meta charset=utf-8><style>
body{{font-family:'WenQuanYi Zen Hei';font-size:10.2pt}} td{{border:1px solid #888;padding:3px 8px}} table{{border-collapse:collapse}}
</style></head><body>
<p>租赁条件一览（SYNTHETIC 合成样例，LibreOffice）</p>
<table><tr><td>项目</td><td>租期</td><td>起租日</td><td>押金</td></tr>
<tr><td>A 区仓库</td><td>{term[0]}</td><td>11月1日</td><td>2个月</td></tr>
<tr><td>B 区仓库</td><td>{term[1]}</td><td>{"12月1日" if after else "11月1日"}</td><td>{"3个月" if after else "2个月"}</td></tr>
<tr><td>C 区仓库</td><td>1年</td><td>{"4月15日" if after else "3月15日"}</td><td>1个月</td></tr></table>
<p>说明：起租日后30日内支付首期租金。</p>
<p>本协议经双方授权代表签字并加盖公章后生效，并报送甲方合同管理部门及财务部门备案，首次检定应于{year}年11月30日前完成，逾期按日计收违约金。</p>
<p>检定年度 {year}年<br>11月 首次检定</p>
</body></html>
"""


def main():
    out = sys.argv[1]
    for version in ("before", "after"):
        cells(version == "after").output(os.path.join(out, f"probe9-T3-cells-{version}.pdf"))
    with tempfile.TemporaryDirectory() as tmp:
        for version in ("before", "after"):
            src = os.path.join(tmp, f"probe9-T3-lotable-{version}.html")
            with open(src, "w", encoding="utf-8") as f:
                f.write(lotable(version == "after"))
            subprocess.run(["soffice", "--headless", f"-env:UserInstallation=file://{tmp}/lo", "--convert-to", "pdf",
                            "--outdir", out, src], check=True, capture_output=True)
            text = subprocess.run(["pdftotext", os.path.join(out, f"probe9-T3-lotable-{version}.pdf"), "-"],
                                  check=True, capture_output=True, text=True).stdout
            # The paragraph breaks after 年 ("… 2026 年" / "11 月 30 日前完成"), as the probe needs.
            assert f"首次检定应于 {'2027' if version == 'after' else '2026'} 年\n11 月 30 日" in text, text


if __name__ == "__main__":
    main()

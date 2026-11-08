"""Case holdout5-i-payslip-cny: bilingual Chinese/English payslip, two pages, fpdf2 with embedded
WenQuanYi Zen Hei (font 0 of the .ttc, TTF subset, Identity-H). Deductions in parentheses,
ISO dates, net pay also written in Chinese capital numerals (金额大写)."""
from fpdf import FPDF
from fpdf_helpers import new_pdf, fmt_uk, fmt_paren, cny_in_words, FONT_WQY

SLUG = "holdout5-i-payslip-cny"
L = 15
BASE = 18000.00


class Payslip(FPDF):
    def footer(self):
        self.set_font("WQY", "", 7)
        self.set_text_color(110)
        self.set_xy(L, 283)
        self.cell(140, 4, "示例科技（上海）有限公司（虚构）· 合成样例 synthetic sample · 保密 Confidential")
        self.set_xy(155, 283)
        self.cell(40, 4, f"第 {self.page_no()} 页 / 共 {{nb}} 页", align="R")
        self.set_text_color(0)


def figures(after):
    earnings = [("基本工资 Basic salary", "21.75 天 days", BASE), ("岗位津贴 Position allowance", "固定 fixed", 2000.00),
                ("交通补贴 Transport allowance", "固定 fixed", 500.00), ("餐费补贴 Meal allowance", "按出勤 by attendance", 300.00),
                ("加班费 Overtime pay", "8.0 小时 h × 117.00", 936.00)]
    gross = round(sum(e[2] for e in earnings), 2)
    social = [("养老保险 Pension insurance", 0.08, "8%"), ("医疗保险 Medical insurance", 0.02, "2%"),
              ("失业保险 Unemployment insurance", 0.005, "0.5%"), ("住房公积金 Housing fund", 0.07, "7%")]
    ded = [(n, f"{lbl} × {fmt_uk(BASE)}", round(BASE * r, 2)) for n, r, lbl in social]
    special = 3000.00 if after else 2000.00
    taxable = gross - sum(d[2] for d in ded) - 5000.00 - special
    iit = round(taxable * 0.10 - 210.00, 2)
    ded.append(("个人所得税 Individual income tax", "累计预扣 withholding", iit))
    total_ded = round(sum(d[2] for d in ded), 2)
    net = round(gross - total_ded, 2)
    return earnings, gross, ded, total_ded, net, special, iit


def build(version):
    after = version == "after"
    earnings, gross, ded, total_ded, net, special, iit = figures(after)
    pdf = new_pdf(Payslip, format="A4")
    pdf.add_font("WQY", "", FONT_WQY, collection_font_number=0)
    pdf.add_page()

    pdf.set_fill_color(0, 102, 153)
    pdf.rect(L, 14, 10, 10, "F")
    pdf.set_fill_color(255, 153, 0)
    pdf.rect(L, 25.5, 10, 2, "F")
    pdf.set_font("WQY", "", 12)
    pdf.set_xy(L + 13, 14)
    pdf.cell(120, 6, "示例科技（上海）有限公司（虚构）")
    pdf.set_font("WQY", "", 7.5)
    pdf.set_xy(L + 13, 20.5)
    pdf.cell(120, 4, "Example Technology (Shanghai) Co., Ltd. – fictional company")
    pdf.set_font("WQY", "", 8)
    pdf.set_text_color(180, 0, 0)
    pdf.set_xy(150, 14)
    pdf.cell(45, 5, "保密 Confidential", align="R")
    pdf.set_text_color(0)

    pdf.set_font("WQY", "", 17)
    pdf.set_xy(L, 34)
    pdf.cell(180, 8, "工资单 Payslip", align="C")
    pdf.set_font("WQY", "", 9)
    pdf.set_xy(L, 42)
    pdf.cell(180, 5, "2026年10月 · October 2026", align="C")

    dept = "采购部 Procurement" if after else "财务部 Finance"
    paydate = "2026-11-12" if after else "2026-11-10"
    account = "6222 **** **** 8803" if after else "6222 **** **** 4471"
    grid = [("姓名 Name", "样例员工甲 Sample Employee A", "员工编号 Employee ID", "E-20417"),
            ("部门 Department", dept, "职位 Position", "会计主管 Senior accountant"),
            ("发薪日 Pay date", paydate, "银行账号 Bank account", account),
            ("计薪天数 Paid days", "21.75", "专项附加扣除 Special deductions", fmt_uk(special))]
    pdf.set_draw_color(120)
    pdf.set_line_width(0.2)
    y = 52
    for a, b, c, d in grid:
        pdf.set_xy(L, y)
        pdf.set_fill_color(236, 240, 244)
        pdf.set_font("WQY", "", 7.5)
        pdf.cell(36, 7, a, border=1, fill=True)
        pdf.set_font("WQY", "", 8.5)
        pdf.cell(52, 7, b, border=1)
        pdf.set_font("WQY", "", 7.5)
        pdf.cell(46, 7, c, border=1, fill=True)
        pdf.set_font("WQY", "", 8.5)
        pdf.cell(46, 7, d, border=1, align="R" if c.startswith("专项") else "L")
        y += 7

    def block(title, rows, total_label, total, y, paren):
        pdf.set_xy(L, y)
        pdf.set_fill_color(0, 102, 153)
        pdf.set_text_color(255)
        pdf.set_font("WQY", "", 8.5)
        pdf.cell(88, 6.5, title, fill=True)
        pdf.cell(52, 6.5, "说明 Basis", fill=True)
        pdf.cell(40, 6.5, "金额 Amount (CNY)", fill=True, align="R")
        pdf.set_text_color(0)
        y += 6.5
        pdf.set_font("WQY", "", 8.5)
        for n, basis, v in rows:
            pdf.set_xy(L, y)
            pdf.cell(88, 6, n, border="B")
            pdf.set_text_color(90)
            pdf.cell(52, 6, basis, border="B")
            pdf.set_text_color(0)
            pdf.cell(40, 6, fmt_paren(v) if paren else fmt_uk(v), border="B", align="R")
            y += 6
        pdf.set_xy(L, y)
        pdf.set_fill_color(236, 240, 244)
        pdf.set_font("WQY", "", 9)
        pdf.cell(140, 6.5, total_label, fill=True)
        pdf.cell(40, 6.5, fmt_paren(total) if paren else fmt_uk(total), fill=True, align="R")
        return y + 6.5

    y = block("收入项目 Earnings", earnings, "应发合计 Gross pay", gross, 87, False)
    y = block("扣除项目 Deductions", ded, "扣款合计 Total deductions", total_ded, y + 6, True)

    y += 7
    pdf.set_draw_color(0, 102, 153)
    pdf.set_line_width(0.6)
    pdf.rect(L, y, 180, 19)
    pdf.set_font("WQY", "", 11)
    pdf.set_xy(L + 3, y + 2.5)
    pdf.cell(90, 7, "实发工资 Net pay")
    pdf.set_font("WQY", "", 15)
    pdf.cell(84, 7, f"CNY {fmt_uk(net)}", align="R")
    pdf.set_font("WQY", "", 8.5)
    pdf.set_xy(L + 3, y + 11)
    pdf.cell(40, 5, "金额大写 Amount in words")
    pdf.cell(134, 5, cny_in_words(net))

    y += 27
    pdf.set_font("WQY", "", 7.8)
    pdf.set_xy(L, y)
    pdf.multi_cell(180, 4.4, "说明 Notes：社保与住房公积金缴费基数为 18,000.00 元；个人所得税按月预扣，基本减除费用 5,000.00 元。"
                   "括号内金额为扣款。如对本工资单有疑问，请于收到后 7 个工作日内联系人力资源部。"
                   "Amounts in parentheses are deductions. Please contact HR within 7 working days if anything is unclear. "
                   "本文件为合成样例（synthetic sample），不对应任何真实个人或公司。", align="L")

    # page 2: attendance
    pdf.add_page()
    pdf.set_font("WQY", "", 12)
    pdf.set_xy(L, 16)
    pdf.cell(180, 6, "考勤明细 Attendance details · 2026年10月")
    pdf.set_font("WQY", "", 8)
    pdf.set_xy(L, 23)
    pdf.cell(180, 5, "员工编号 Employee ID E-20417 · 样例员工甲 Sample Employee A")
    cols = [("日期 Date", 28), ("星期 Weekday", 26), ("上班 In", 24), ("下班 Out", 24), ("加班 OT (h)", 24), ("备注 Remarks", 54)]
    y = 31
    pdf.set_xy(L, y)
    pdf.set_fill_color(0, 102, 153)
    pdf.set_text_color(255)
    for n, w in cols:
        pdf.cell(w, 6.5, n, fill=True)
    pdf.set_text_color(0)
    y += 6.5
    wd = ["四 Thu", "五 Fri", "六 Sat", "日 Sun", "一 Mon", "二 Tue", "三 Wed"]
    ot = {15: "2.0", 22: "3.0", 28: "3.0"}
    pdf.set_draw_color(200)
    pdf.set_line_width(0.15)
    for day in range(1, 32):
        w = wd[(day - 1) % 7]
        weekend = w[0] in "六日"
        if day <= 7:
            row = [f"2026-10-{day:02d}", w, "", "", "", "国庆节假期 National Day holiday"]
        elif weekend:
            row = [f"2026-10-{day:02d}", w, "", "", "", "休息日 Rest day"]
        else:
            out = {15: "20:05", 22: "21:10", 28: "21:05"}.get(day, "18:0" + str(day % 6))
            row = [f"2026-10-{day:02d}", w, "08:5" + str(day % 7), out, ot.get(day, ""), "外勤 Field visit" if day == 20 else ""]
        pdf.set_xy(L, y)
        pdf.set_text_color(120 if (weekend or day <= 7) else 0)
        for (n, wdt), t in zip(cols, row):
            pdf.cell(wdt, 6, t, border="B")
        y += 6
    pdf.set_text_color(0)
    pdf.set_xy(L, y + 3)
    pdf.cell(180, 5, "加班合计 Overtime total: 8.0 小时 h · 计薪天数 Paid days: 21.75")
    return bytes(pdf.output()), {"pages": pdf.page_no(), "iit": iit, "total_ded": total_ded, "net": net, "special": special}


def truth(mb, ma):
    return {
        "description": (
            "Two-page bilingual Chinese/English monthly payslip (工资单) of a fictional company, produced with fpdf2 2.9.0 "
            "with an embedded subset of WenQuanYi Zen Hei (font 0 of wqy-zenhei.ttc, TrueType, Identity-H) for all text. "
            "Page 1: employee grid with bordered cells, earnings and deductions tables (deductions in parentheses, "
            "e.g. (1,440.00)), net pay in a framed box and in Chinese capital numerals (金额大写); page 2: daily attendance "
            "table, unchanged. Edits: department, pay date, the last four digits of the bank account, and the special "
            "additional deduction (2,000.00 -> 3,000.00), which lowers the income tax; total deductions, net pay and the "
            "amount in words are recomputed. Social-insurance amounts and gross pay do not change. No re-flow."
        ),
        "synthetic": True,
        "set": "held-out-5",
        "blind": True,
        "truth": [
            {"type": "replace", "old": "财务部 Finance", "new": "采购部 Procurement", "oldPage": 1, "newPage": 1,
             "note": "部门 Department; Chinese and English in one cell."},
            {"type": "number", "old": "2026-11-10", "new": "2026-11-12", "oldPage": 1, "newPage": 1, "note": "发薪日 Pay date (ISO date)."},
            {"type": "number", "old": "**** 4471", "new": "**** 8803", "oldPage": 1, "newPage": 1,
             "note": "Masked bank account number: payout account changed, which a reviewer must not miss."},
            {"type": "number", "old": "Special deductions " + fmt_uk(mb["special"]), "new": "Special deductions " + fmt_uk(ma["special"]),
             "oldPage": 1, "newPage": 1, "note": "专项附加扣除 in the employee grid; the same value 2,000.00 also appears as the position allowance, hence the label in the snippet."},
            {"type": "number", "old": fmt_paren(mb["iit"]), "new": fmt_paren(ma["iit"]), "oldPage": 1, "newPage": 1,
             "note": "个人所得税 Individual income tax, a deduction in parentheses."},
            {"type": "number", "old": fmt_paren(mb["total_ded"]), "new": fmt_paren(ma["total_ded"]), "oldPage": 1, "newPage": 1,
             "note": "扣款合计 Total deductions."},
            {"type": "number", "old": "CNY " + fmt_uk(mb["net"]), "new": "CNY " + fmt_uk(ma["net"]), "oldPage": 1, "newPage": 1,
             "note": "实发工资 Net pay."},
            {"type": "replace", "old": cny_in_words(mb["net"]), "new": cny_in_words(ma["net"]), "oldPage": 1, "newPage": 1,
             "note": "Net pay in Chinese capital numerals; only one character differs (陆 -> 柒, six -> seven hundred). Typed as replace because it is written in words; a report as a number change is equally correct."},
        ],
    }

"""Case holdout4-e-docx-zh-en-supply-annex: a bilingual (Chinese/English) equipment
supply annex revised in Word, with a price table that runs over several pages.

Usage: python3 supply_annex.py <outdir>   -> writes before.docx and after.docx
Synthetic sample: the buyer, seller, equipment and prices are invented.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from docxlib import *  # noqa: E402,F403

CJK = "SimSun"

ITEMS = [
    ("生物安全柜 Biosafety cabinet, class II", "BSC-1500A2", 4, 38600.00),
    ("二氧化碳培养箱 CO₂ incubator, 170 L", "CI-170", 6, 27400.00),
    ("超低温冰箱 Ultra-low freezer, −86 °C", "ULF-700", 2, 86500.00),
    ("高速冷冻离心机 Refrigerated centrifuge", "RC-21M", 2, 64200.00),
    ("台式离心机 Benchtop centrifuge", "BC-5", 6, 9800.00),
    ("倒置显微镜 Inverted microscope", "IM-310", 3, 52700.00),
    ("荧光显微镜 Fluorescence microscope", "FM-560", 1, 148000.00),
    ("PCR 仪 Thermal cycler, 96-well", "TC-96G", 4, 31500.00),
    ("实时荧光定量 PCR 仪 Real-time PCR system", "QP-480", 2, 189000.00),
    ("酶标仪 Microplate reader", "MR-900", 2, 46300.00),
    ("洗板机 Microplate washer", "MW-96", 2, 18900.00),
    ("紫外可见分光光度计 UV-Vis spectrophotometer", "UV-2800", 1, 39800.00),
    ("超微量分光光度计 Micro-volume spectrophotometer", "NV-1", 2, 24600.00),
    ("凝胶成像系统 Gel imaging system", "GI-40", 1, 57300.00),
    ("电泳仪 Electrophoresis power supply", "EP-300", 4, 4200.00),
    ("水平电泳槽 Horizontal gel tank", "HG-12", 6, 1650.00),
    ("垂直电泳槽 Vertical gel tank", "VG-4", 4, 2380.00),
    ("转印系统 Semi-dry transfer system", "ST-2", 2, 12900.00),
    ("恒温水浴锅 Water bath, 12 L", "WB-12", 6, 2950.00),
    ("金属浴 Dry block heater", "DB-2", 8, 3400.00),
    ("恒温摇床 Incubated shaker", "IS-200", 2, 33800.00),
    ("磁力搅拌器 Magnetic stirrer with heating", "MS-7", 10, 1280.00),
    ("涡旋混匀器 Vortex mixer", "VX-3", 12, 860.00),
    ("pH 计 pH meter, benchtop", "PH-850", 4, 5600.00),
    ("电子天平 Analytical balance, 0.1 mg", "AB-220", 3, 16800.00),
    ("精密天平 Precision balance, 0.01 g", "PB-2000", 3, 6900.00),
    ("纯水系统 Water purification system", "WP-30", 1, 72500.00),
    ("高压灭菌器 Autoclave, 75 L", "AC-75", 2, 46800.00),
    ("干燥箱 Drying oven, 136 L", "DO-136", 2, 8900.00),
    ("通风橱 Fume hood, 1.5 m", "FH-1500", 3, 29600.00),
    ("药品冷藏箱 Pharmacy refrigerator, 2–8 °C", "PR-400", 4, 11200.00),
    ("液氮罐 Liquid nitrogen dewar, 35 L", "LN-35", 2, 7400.00),
    ("移液器套装 Pipette set, 4 channels", "PS-4", 12, 3900.00),
    ("电动移液器 Electronic pipette controller", "EPC-1", 8, 2650.00),
    ("细胞计数仪 Automated cell counter", "CC-2", 1, 43500.00),
    ("超声波清洗器 Ultrasonic cleaner, 10 L", "UC-10", 2, 3100.00),
    ("真空泵 Vacuum pump, oil-free", "VP-40", 3, 4700.00),
    ("不间断电源 UPS, 10 kVA", "UPS-10K", 2, 21800.00),
    ("温湿度记录仪 Temperature and humidity logger", "TH-8", 16, 690.00),
    ("实验台 Laboratory bench, 3.0 m", "LB-30", 8, 9600.00),
]

INSERTED = ("小型离心机 Mini centrifuge", "MC-7", 10, 1350.00)
DELETED_MODEL = "UC-10"
PRICE_CHANGE = ("QP-480", 176500.00)

DIGITS = "零壹贰叁肆伍陆柒捌玖"


def rmb_upper(amount):
    """Chinese uppercase amount for whole yuan, e.g. 1234500 -> 壹佰贰拾叁万肆仟伍佰元整."""
    n = int(round(amount))
    assert abs(amount - n) < 0.005

    def four(x):
        units = ["仟", "佰", "拾", ""]
        s = ""
        zero = False
        for i, d in enumerate(f"{x:04d}"):
            d = int(d)
            if d == 0:
                zero = True
                continue
            if zero and s:
                s += "零"
            zero = False
            s += DIGITS[d] + units[i]
        return s

    parts = []
    yi, rest = divmod(n, 100000000)
    wan, ge = divmod(rest, 10000)
    if yi:
        parts.append(four(yi) + "亿")
    if wan:
        if yi and wan < 1000:
            parts.append("零")
        parts.append(four(wan) + "万")
    if ge:
        if (yi or wan) and ge < 1000:
            parts.append("零")
        parts.append(four(ge))
    return "".join(parts) + "元整"


def fmt(x):
    return f"{x:,.2f}"


def run(p, text, bold=False, size=None):
    r = p.add_run(text)
    r.bold = bold
    if size:
        r.font.size = Pt(size)
    return r


def build(v):
    after = v == "after"
    doc = new_document(body_font="Arial", body_size=10, heading_font="Arial", east_asia=CJK)
    fixed_core_properties(doc, "Equipment Supply Contract Annex 1")
    add_paragraph_style(doc, "Clause", base="Normal")
    add_outline_numbering(doc, [("Heading 1", "%1.", 0.9, 0.9), ("Clause", "%1.%2", 0.9, 0.9)])
    for name in ("Title", "Heading 1", "Heading 2"):
        doc.styles[name].font.color.rgb = RGBColor(0x7A, 0x1F, 0x1F)
    doc.styles["Title"].font.size = Pt(16)

    sec = doc.sections[0]
    hp = sec.header.paragraphs[0]
    hr = hp.add_run("设备供货合同 附件一 · Equipment Supply Contract, Annex 1 · 合同编号 Contract no. QL-2026-118")
    hr.font.size = Pt(8)
    fp = sec.footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = fp.add_run("合成样例 Synthetic sample · 第 ")
    r.font.size = Pt(8)
    add_field(fp, "PAGE", "1", size=8)
    r = fp.add_run(" 页 Page")
    r.font.size = Pt(8)

    doc.add_paragraph("附件一：供货清单、交货及付款\nAnnex 1: Delivery Schedule, Prices and Payment", style="Title")
    p = doc.add_paragraph()
    run(p, "买方 Buyer：", bold=True)
    run(p, "青岚医疗中心 Qinglan Medical Centre（以下简称“买方”）")
    p = doc.add_paragraph()
    run(p, "卖方 Seller：", bold=True)
    run(p, "栖桐实验设备有限公司 Qitong Laboratory Equipment Co., Ltd.（以下简称“卖方”）")

    def clause(zh, en):
        p = doc.add_paragraph(style="Clause")
        run(p, zh)
        p.add_run().add_break()
        r = run(p, en)
        r.font.color.rgb = RGBColor(0x40, 0x48, 0x55)
        return p

    doc.add_heading("供货范围 Scope of supply", level=1)
    clause(
        "卖方按本附件所列清单向买方提供设备，并负责运输、安装、调试及操作培训。",
        "The Seller shall supply the equipment listed in this Annex and is responsible for transport, installation, commissioning and operator training.",
    )
    clause(
        "设备应为全新、未使用过的产品，并附中文说明书、合格证及装箱单。",
        "All equipment shall be new and unused and shall be delivered with Chinese manuals, certificates of conformity and packing lists.",
    )

    doc.add_heading("交货 Delivery", level=1)
    days = 60 if after else 45
    clause(
        f"交货期：合同生效后 {days} 天内交货至买方东院区 3 号楼实验中心。",
        f"Delivery: within {days} days after the contract takes effect, to the laboratory centre in Building 3, East Campus.",
    )
    clause(
        "卖方应在发货前 3 个工作日书面通知买方，买方安排卸货场地及电梯。",
        "The Seller shall notify the Buyer in writing 3 working days before dispatch; the Buyer provides the unloading area and lift access.",
    )
    clause(
        "安装调试完成后，双方共同验收并签署验收报告。",
        "After installation and commissioning, both parties carry out the acceptance test together and sign the acceptance report.",
    )

    doc.add_heading("付款 Payment", level=1)
    clause(
        "合同签订后 15 个工作日内，买方支付合同总价的 30% 作为预付款。",
        "Within 15 working days after signing, the Buyer pays 30% of the total contract price as an advance payment.",
    )
    clause(
        "验收合格后 30 天内，买方支付合同总价的 60%。",
        "Within 30 days after acceptance, the Buyer pays 60% of the total contract price.",
    )
    clause(
        f"合同总价的 {'5%' if after else '10%'} 作为质量保证金，质保期满且无质量问题后 30 天内无息退还。",
        "10% of the total contract price is kept as a warranty retention and is repaid without interest within 30 days after the end of the warranty period, provided no defects remain.",
    )

    doc.add_heading("质保 Warranty", level=1)
    clause(
        "质保期为验收合格之日起 24 个月。质保期内卖方在接到通知后 4 小时内响应，48 小时内到场。",
        "The warranty period is 24 months from acceptance. During the warranty period the Seller responds within 4 hours of a call and attends on site within 48 hours.",
    )

    doc.add_heading("供货清单及价格 Delivery schedule and prices", level=1)
    doc.add_paragraph("价格单位：人民币元，含税、运输、安装及培训。Prices in CNY, including VAT, transport, installation and training.")

    items = []
    for name, model, qty, price in ITEMS:
        if after and model == DELETED_MODEL:
            continue
        if after and model == PRICE_CHANGE[0]:
            price = PRICE_CHANGE[1]
        items.append((name, model, qty, price))
        if after and model == "BC-5":
            items.append(INSERTED)

    t = doc.add_table(rows=1, cols=6)
    table_borders(t, color="A08C8C")
    heads = ("序号\nNo.", "设备名称\nDescription", "型号\nModel", "数量\nQty", "单价\nUnit price", "金额\nAmount")
    repeat_header_row(t.rows[0])
    for i, h in enumerate(heads):
        cell_text(t.rows[0].cells[i], h, bold=True, size=8.5, align="right" if i >= 3 else None)
        shade(t.rows[0].cells[i], "F1E4E1")
    list_id = add_simple_list(doc)
    total = 0.0
    for n, (name, model, qty, price) in enumerate(items, 1):
        amount = qty * price
        total += amount
        row = t.add_row()
        cant_split(row)
        # the No. column is a Word numbered list, so it renumbers itself
        first = row.cells[0].paragraphs[0]
        first.paragraph_format.space_after = Pt(0)
        number_paragraph(first, list_id, size=8.5)
        vals = (name, model, str(qty), fmt(price), fmt(amount))
        for i, val in enumerate(vals, 1):
            cell_text(row.cells[i], val, size=8.5, align="right" if i >= 3 else None)
    row = t.add_row()
    cant_split(row)
    merged = row.cells[0].merge(row.cells[4])
    cell_text(merged, "合计 Total", bold=True, size=8.5)
    cell_text(row.cells[5], fmt(total), bold=True, size=8.5, align="right")
    set_col_widths(t, [1.1, 7.0, 2.3, 1.3, 2.4, 2.4])
    for r_ in t.rows:
        r_.height = Cm(0.72)

    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(8)
    run(p, "合同总价（大写）：人民币" + rmb_upper(total), bold=True)

    doc.add_paragraph()
    p = doc.add_paragraph("买方代表 Buyer’s representative：____________　　卖方代表 Seller’s representative：____________")
    return doc, total


if __name__ == "__main__":
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    for v in ("before", "after"):
        doc, total = build(v)
        doc.save(os.path.join(out, f"{v}.docx"))
        print(v, fmt(total), rmb_upper(total))

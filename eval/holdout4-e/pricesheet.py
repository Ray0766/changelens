"""Case holdout4-e-xlsx-spare-parts-prices: a spare parts price list revised in Excel
(openpyxl workbook, landscape, printed to PDF by LibreOffice Calc).

Usage: python3 pricesheet.py <outdir>   -> writes before.xlsx and after.xlsx
Synthetic sample: the manufacturer, part numbers and prices are invented.
"""

import datetime
import os
import random
import sys

import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.properties import PageSetupProperties

FAMILIES = [
    ("IMP", "Impellers", ["Closed impeller", "Semi-open impeller", "Vortex impeller"], ["DN32", "DN40", "DN50", "DN65", "DN80", "DN100"]),
    ("SEA", "Seals and gaskets", ["Mechanical seal kit", "Cartridge seal", "Casing gasket set", "O-ring kit"], ["16 mm", "22 mm", "28 mm", "35 mm"]),
    ("BRG", "Bearings and shafts", ["Bearing set", "Shaft sleeve", "Drive shaft"], ["size 1", "size 2", "size 3", "size 4", "size 5"]),
    ("MOT", "Motors", ["IE3 motor", "IE4 motor"], ["1.5 kW", "2.2 kW", "4 kW", "5.5 kW", "7.5 kW", "11 kW", "15 kW"]),
    ("CTL", "Controls and sensors", ["Pressure transmitter", "Flow switch", "Level float", "Control panel", "Frequency drive"], ["standard", "ATEX"]),
    ("HSG", "Casings and covers", ["Pump casing", "Casing cover", "Base frame"], ["DN40", "DN50", "DN65", "DN80"]),
    ("SRV", "Service kits", ["Annual service kit", "Overhaul kit", "Commissioning kit"], ["series A", "series B", "series C"]),
]

UNIT = {"IMP": "each", "SEA": "kit", "BRG": "set", "MOT": "each", "CTL": "each", "HSG": "each", "SRV": "kit"}
BASE = {"IMP": 160, "SEA": 70, "BRG": 90, "MOT": 520, "CTL": 210, "HSG": 380, "SRV": 240}


def parts():
    rng = random.Random(8128)
    out = []
    for prefix, family, kinds, sizes in FAMILIES:
        rows = []
        n = 1000
        for ki, kind in enumerate(kinds):
            for si, size in enumerate(sizes):
                n += 10
                eur = BASE[prefix] * (1 + 0.35 * si) * (1 + 0.25 * ki) * rng.uniform(0.9, 1.1)
                eur = round(eur * 2) / 2
                gbp = round(eur * rng.uniform(0.84, 0.88) * 2) / 2
                lead = rng.choice([3, 5, 5, 10, 10, 15, 20, 30])
                group = rng.choice("AABBC")
                rows.append({
                    "part": f"{prefix}-{n}",
                    "desc": f"{kind}, {size}",
                    "unit": UNIT[prefix],
                    "eur": eur,
                    "gbp": gbp,
                    "group": group,
                    "lead": lead,
                    "valid": None,
                    "core": None,
                })
        out.append((prefix, family, rows))
    # remanufactured units carry a core refund (negative amount) when the old unit is returned
    rem = []
    for i, (name, eur, core) in enumerate([
        ("Remanufactured motor, 4 kW", 395.0, -120.0),
        ("Remanufactured motor, 7.5 kW", 610.0, -165.0),
        ("Remanufactured motor, 11 kW", 845.0, -210.0),
        ("Remanufactured frequency drive, 5.5 kW", 720.0, -180.0),
        ("Remanufactured frequency drive, 11 kW", 1090.0, -260.0),
        ("Remanufactured pump end, DN65", 980.0, -240.0),
        ("Remanufactured pump end, DN80", 1265.0, -300.0),
    ]):
        rem.append({
            "part": f"REM-{2010 + 10 * i}",
            "desc": name,
            "unit": "each",
            "eur": eur,
            "gbp": round(eur * 0.86 * 2) / 2,
            "group": "R",
            "lead": 10,
            "valid": None,
            "core": core,
        })
    out.append(("REM", "Remanufactured units (exchange)", rem))
    # a few parts have a later price date than the list date
    by_part = {r["part"]: r for _p, _f, rows in out for r in rows}
    by_part["SEA-1090"]["valid"] = datetime.date(2027, 2, 1)
    by_part["MOT-1050"]["valid"] = datetime.date(2027, 3, 1)
    by_part["MOT-1120"]["valid"] = datetime.date(2027, 4, 1)
    by_part["CTL-1030"]["valid"] = datetime.date(2027, 6, 1)
    by_part["REM-2040"]["valid"] = datetime.date(2027, 5, 1)
    return out


def apply_edits(families):
    by_part = {r["part"]: r for _p, _f, rows in families for r in rows}
    # 1. price increase on a seal kit (page 1)
    by_part["SEA-1010"]["eur"] = 89.00
    # 2. GBP price of a casing changed (later page)
    by_part["HSG-1040"]["gbp"] = by_part["HSG-1040"]["gbp"] + 46.0
    # 3. valid-from date moved for one motor
    by_part["MOT-1120"]["valid"] = datetime.date(2027, 7, 1)
    # 4. core refund for one remanufactured unit increased
    by_part["REM-2070"]["core"] = -335.0
    # 5. a new impeller added after IMP-1060
    for prefix, _f, rows in families:
        if prefix == "IMP":
            i = [r["part"] for r in rows].index("IMP-1060")
            rows.insert(i + 1, {
                "part": "IMP-1065", "desc": "Closed impeller, DN125", "unit": "each", "eur": 468.00, "gbp": 402.50,
                "group": "B", "lead": 20, "valid": None, "core": None,
            })
        # 6. a control panel discontinued
        if prefix == "CTL":
            rows[:] = [r for r in rows if r["part"] != "CTL-1080"]
    return families


def build(v):
    after = v == "after"
    families = parts()
    if after:
        families = apply_edits(families)
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Price list 2027"
    base = Font(name="Arial", size=9)
    bold = Font(name="Arial", size=9, bold=True)
    thin = Side(style="thin", color="A7B1BC")
    widths = {"A": 11, "B": 38, "C": 6, "D": 12, "E": 12, "F": 10, "G": 11, "H": 13, "I": 13}
    for col, w in widths.items():
        ws.column_dimensions[col].width = w

    ws["A1"] = "Aldermoor Pump Systems — Spare parts price list 2027"
    ws["A1"].font = Font(name="Arial", size=13, bold=True, color="17324D")
    ws["A2"] = "Prices per unit, excluding VAT and freight. Synthetic sample: the company, parts and prices are invented."
    ws["A2"].font = base
    ws["A3"] = "* Blank means the list date. Core refunds are credited when the old unit is returned and are shown as negative amounts."
    ws["A3"].font = Font(name="Arial", size=8, italic=True)
    info = [
        ("Metal surcharge on casings and impellers", 0.06 if after else 0.045, "0.0%"),
        ("Dealer discount, group A / B / C", "30% / 25% / 15%", "@"),
        ("Price list valid from", datetime.date(2027, 1, 1), "dd.mm.yyyy"),
    ]
    r = 3
    for label, value, fmt in info:
        r += 1
        ws.cell(r, 2, label).font = base
        c = ws.cell(r, 4, value)
        c.number_format = fmt
        c.font = base
        c.alignment = Alignment(horizontal="right")
    r += 2
    header_row = r
    heads = ["Part no.", "Description", "Unit", "Price EUR", "Price GBP", "Discount group", "Lead time (days)", "Price valid from*", "Core refund EUR"]
    for col, text in enumerate(heads, 1):
        c = ws.cell(r, col, text)
        c.font = Font(name="Arial", size=9, bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="2E5A7F")
        c.alignment = Alignment(horizontal="right" if col in (4, 5, 7, 9) else "left", vertical="center", wrap_text=True)
    ws.row_dimensions[r].height = 26

    for prefix, family, rows in families:
        r += 1
        ws.cell(r, 1, family).font = bold
        for col in range(1, 10):
            ws.cell(r, col).fill = PatternFill("solid", fgColor="E8EEF4")
        for row in rows:
            r += 1
            vals = [row["part"], row["desc"], row["unit"], row["eur"], row["gbp"], row["group"], row["lead"], row["valid"], row["core"]]
            for col, val in enumerate(vals, 1):
                c = ws.cell(r, col, val)
                c.font = base
                c.border = Border(bottom=thin)
            ws.cell(r, 4).number_format = '[$€-x-euro2] #,##0.00'
            ws.cell(r, 5).number_format = '[$£-809]#,##0.00'
            ws.cell(r, 6).alignment = Alignment(horizontal="center")
            ws.cell(r, 7).number_format = "0"
            ws.cell(r, 8).number_format = "dd.mm.yyyy"
            ws.cell(r, 9).number_format = '[$€-x-euro2] #,##0.00;[Red]-[$€-x-euro2] #,##0.00'

    ws.print_title_rows = f"{header_row}:{header_row}"
    ws.page_setup.orientation = "landscape"
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.page_margins.left = ws.page_margins.right = 0.5
    ws.page_margins.top = 0.75
    ws.page_margins.bottom = 0.7
    ws.oddHeader.left.text = "Aldermoor Pump Systems"
    ws.oddHeader.left.size = 8
    ws.oddHeader.right.text = "Spare parts price list 2027"
    ws.oddHeader.right.size = 8
    ws.oddFooter.left.text = "Synthetic sample"
    ws.oddFooter.left.size = 8
    ws.oddFooter.right.text = "Page &P of &N"
    ws.oddFooter.right.size = 8
    wb.properties.creator = "Synthetic sample generator"
    wb.properties.created = datetime.datetime(2026, 10, 20, 9, 0, 0)
    wb.properties.modified = datetime.datetime(2026, 10, 20, 9, 0, 0)
    return wb


if __name__ == "__main__":
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    for v in ("before", "after"):
        build(v).save(os.path.join(out, f"{v}.xlsx"))

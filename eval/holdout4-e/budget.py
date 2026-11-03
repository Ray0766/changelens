"""Case holdout4-e-xlsx-facilities-budget: an operating budget revised in Excel
(openpyxl workbook with formulas, printed to PDF by LibreOffice Calc).

Usage: python3 budget.py <outdir>   -> writes before.xlsx and after.xlsx
Synthetic sample: the department, lines and amounts are invented.
"""

import datetime
import os
import random
import sys

import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.properties import PageSetupProperties

SECTIONS = [
    ("1", "Utilities", [
        ("Electricity", 170), ("Gas", 96), ("Water and sewerage", 24), ("District heating, North site", 58),
        ("Metering and data services", 6), ("Utility bill validation service", 4), ("Trade effluent charges", 9),
        ("Standby generator fuel", 7), ("Solar panel maintenance", 5), ("EV charger electricity", 12),
    ]),
    ("2", "Planned maintenance", [
        ("Mechanical services contract", 142), ("Electrical services contract", 88), ("Fire alarm servicing", 14),
        ("Sprinkler servicing", 11), ("Lift maintenance", 26), ("Automatic doors", 6),
        ("Roller shutters and dock levellers", 18), ("Building management system support", 21), ("Roof inspections", 5),
        ("Gutter clearance", 4), ("Water hygiene (legionella) monitoring", 9), ("Emergency lighting tests", 7),
        ("Lightning protection testing", 3), ("Pressure systems inspection", 4), ("Air handling filter changes", 12),
        ("Fire door inspections", 8), ("Kitchen equipment servicing", 6), ("Cold store maintenance", 15),
    ]),
    ("3", "Reactive maintenance", [
        ("Reactive repairs, building fabric", 64), ("Reactive repairs, mechanical", 52), ("Reactive repairs, electrical", 41),
        ("Glazing repairs", 9), ("Locksmith call-outs", 5), ("Drainage call-outs", 8), ("Out-of-hours engineer cover", 23),
        ("Flood and leak response", 11), ("Damage from vehicle impacts", 7),
    ]),
    ("4", "Cleaning and hygiene", [
        ("Daily cleaning contract", 312), ("Periodic deep cleaning", 28), ("Window cleaning", 19), ("Washroom consumables", 34),
        ("Sanitary waste service", 8), ("Pest control", 7), ("Kitchen deep cleans", 6), ("Carpet cleaning", 5),
        ("Cleaning materials", 13),
    ]),
    ("5", "Security", [
        ("Manned guarding, 3 sites", 286), ("Alarm monitoring", 9), ("CCTV maintenance", 14), ("Access control licences", 11),
        ("Key holding service", 4), ("Visitor management system", 6), ("Security patrols, weekends", 22),
        ("ID badge printing", 3),
    ]),
    ("6", "Grounds and external areas", [
        ("Grounds maintenance contract", 74), ("Winter gritting", 16), ("Car park resurfacing reserve", 45), ("Tree surveys", 4),
        ("External lighting repairs", 9), ("Line marking", 6), ("Planters and seasonal planting", 5),
    ]),
    ("7", "Waste and recycling", [
        ("General waste collection", 48), ("Mixed recycling", 22), ("Confidential waste", 9), ("Hazardous waste", 6),
        ("Skip hire", 12), ("Waste compliance audit", 3), ("Food waste collection", 7), ("WEEE disposal", 4),
    ]),
    ("8", "Insurance and compliance", [
        ("Property insurance premium", 118), ("Engineering inspection insurance", 15), ("Fire risk assessments", 12),
        ("Asbestos re-inspection", 8), ("Statutory compliance software", 10), ("Accessibility audits", 6),
    ]),
    ("9", "Fleet and transport", [
        ("Van leases (6 vehicles)", 41), ("Fuel cards", 23), ("Vehicle servicing", 9), ("Tracking subscriptions", 3),
        ("Pool car hire", 6), ("Shuttle bus contract", 68), ("Bicycle shelters maintenance", 2),
    ]),
    ("10", "Office and workplace services", [
        ("Reception service", 96), ("Post room and couriers", 31), ("Printer and copier leasing", 15), ("Furniture repairs", 8),
        ("Meeting room equipment", 12), ("Water coolers", 4), ("Workplace occupancy sensors", 7), ("Signage", 5),
        ("Archive storage, off site", 18), ("Office moves and reconfigurations", 26),
    ]),
    ("11", "Health, safety and wellbeing", [
        ("First aid supplies", 3), ("Defibrillator servicing", 2), ("PPE for facilities staff", 9),
        ("Occupational health checks", 7), ("Safety training", 14), ("Accident reporting system", 4),
        ("Contractor induction programme", 5),
    ]),
    ("12", "Recoveries and income", [
        ("Service charge recoveries from tenants", 184), ("Car park permit income", 62), ("Energy efficiency grant", 25),
        ("Recharges to other departments", 141), ("Conference room hire income", 18),
    ]),
]

INCOME = {name for name, _ in SECTIONS[-1][2]}

NOTES = {
    "Electricity": "Fixed tariff to Sep 2027",
    "Gas": "Tracker tariff",
    "Lift maintenance": "8 lifts; 2 due for overhaul",
    "Manned guarding, 3 sites": "3-year contract, CPI-linked",
    "Property insurance premium": "Renewal 1 April",
    "Van leases (6 vehicles)": "Two vans replaced by EVs",
    "Printer and copier leasing": "Lease ends Mar 2028",
    "Service charge recoveries from tenants": "Per lease schedules",
    "Energy efficiency grant": "Second tranche",
    "Daily cleaning contract": "Retendered 2026",
}


def amounts(rng, name, base_k):
    a = base_k * 1000 + rng.randrange(0, 10) * 100
    f = int(round(a * rng.uniform(0.95, 1.08), -2))
    b = int(round(f * rng.uniform(0.97, 1.07), -2))
    if name == "Electricity":
        a, f, b = 169_800, 175_400, 184_000
    if name == "Service charge recoveries from tenants":
        a, f, b = 184_800, 178_800, 183_600
    if name in INCOME:
        return -a, -f, -b
    return a, f, b


def build(v):
    after = v == "after"
    rng = random.Random(2027)
    values = {name: amounts(rng, name, k) for _code, _title, lines in SECTIONS for name, k in lines}
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Budget FY2027"
    base = Font(name="Calibri", size=10)
    bold = Font(name="Calibri", size=10, bold=True)
    thin = Side(style="thin", color="9AA5B1")
    head_fill = PatternFill("solid", fgColor="DDE6EE")
    sec_fill = PatternFill("solid", fgColor="F2F5F8")
    amt_fmt = '#,##0;[Red](#,##0);"–"'
    pct_fmt = '0.0%;[Red]-0.0%;0.0%'

    widths = {"A": 6, "B": 34, "C": 11, "D": 11, "E": 11, "F": 8, "G": 26}
    for col, w in widths.items():
        ws.column_dimensions[col].width = w

    ws["A1"] = "Facilities Department — Operating Budget FY2027"
    ws["A1"].font = Font(name="Calibri", size=14, bold=True, color="1F3A5A")
    ws["A2"] = "All amounts in EUR, excluding VAT. Negative amounts are income or recoveries and are shown in brackets."
    ws["A2"].font = base

    r = 4
    ws.cell(r, 1, "Planning assumptions").font = bold
    assumptions = [
        ("Energy price inflation", 0.065 if after else 0.08, "0.0%"),
        ("Pay award in contracted services", 0.035, "0.0%"),
        ("General inflation (CPI)", 0.024, "0.0%"),
        ("Contingency held centrally", 0.02, "0.0%"),
        ("Budget period starts", datetime.date(2027, 1, 1), "d mmm yyyy"),
        ("Budget submitted to the finance committee", datetime.date(2026, 11, 18), "d mmm yyyy"),
    ]
    for label, value, fmt in assumptions:
        r += 1
        ws.cell(r, 2, label).font = base
        c = ws.cell(r, 3, value)
        c.number_format = fmt
        c.font = base
        c.alignment = Alignment(horizontal="right")

    r += 2
    header_row = r
    for col, text in enumerate(["Code", "Line item", "FY2025 actual", "FY2026 forecast", "FY2027 budget", "Change", "Notes"], 1):
        c = ws.cell(r, col, text)
        c.font = bold
        c.fill = head_fill
        c.border = Border(top=thin, bottom=thin)
        c.alignment = Alignment(horizontal="right" if 3 <= col <= 6 else "left", vertical="center", wrap_text=True)
    ws.row_dimensions[r].height = 27
    first_line = r + 1

    for code, title, lines in SECTIONS:
        r += 1
        account_base = 6000 + int(code) * 100
        ws.cell(r, 1, str(account_base)).font = bold
        ws.cell(r, 2, title).font = bold
        for col in range(1, 8):
            ws.cell(r, col).fill = sec_fill
        # account codes are fixed per line; a new line takes the next free code
        coded = [(account_base + k, name) for k, (name, _k) in enumerate(lines, 1)]
        if after:
            coded = [(c, n) for c, n in coded if n != "Office moves and reconfigurations"]
            if title == "Planned maintenance":
                pos = [n for _c, n in coded].index("Lift maintenance") + 1
                coded.insert(pos, (account_base + len(lines) + 1, "Lift modernisation feasibility study"))
        for account, name in coded:
            if name == "Lift modernisation feasibility study":
                a, f, b = 0, 0, 22_000
            elif name == "Office moves and reconfigurations":
                a, f, b = 0, 0, 26_000
            else:
                a, f, b = values[name]
            if after and name == "Electricity":
                b = 171_500
            r += 1
            ws.cell(r, 1, str(account)).font = base
            ws.cell(r, 2, name).font = base
            for col, val in ((3, a), (4, f), (5, b)):
                c = ws.cell(r, col, val)
                c.number_format = amt_fmt
                c.font = base
            c = ws.cell(r, 6, f'=IF(D{r}=0,"new",E{r}/D{r}-1)')
            c.number_format = pct_fmt
            c.font = base
            c.alignment = Alignment(horizontal="right")
            note = NOTES.get(name, "")
            if name == "Manned guarding, 3 sites" and after:
                note = "3-year contract, fixed price"
            if name == "Lift modernisation feasibility study":
                note = "One-off; project brief FM-27-04"
            if name == "Office moves and reconfigurations":
                note = "One-off; second-floor refit"
            ws.cell(r, 7, note).font = Font(name="Calibri", size=9, color="4A5563")
    last_line = r
    r += 1
    ws.cell(r, 2, "Total net budget").font = bold
    for col, letter in ((3, "C"), (4, "D"), (5, "E")):
        c = ws.cell(r, col, f"=SUM({letter}{first_line}:{letter}{last_line})")
        c.number_format = amt_fmt
        c.font = bold
        c.border = Border(top=thin, bottom=Side(style="double", color="1F3A5A"))
    c = ws.cell(r, 6, f"=E{r}/D{r}-1")
    c.number_format = pct_fmt
    c.font = bold
    c.alignment = Alignment(horizontal="right")
    c.border = Border(top=thin, bottom=Side(style="double", color="1F3A5A"))

    ws.print_title_rows = f"{header_row}:{header_row}"
    ws.page_setup.orientation = "portrait"
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.print_options.gridLines = False
    ws.page_margins.left = ws.page_margins.right = 0.6
    ws.page_margins.top = 0.8
    ws.page_margins.bottom = 0.8
    ws.oddHeader.left.text = "Facilities Department"
    ws.oddHeader.left.size = 8
    ws.oddHeader.right.text = "Operating Budget FY2027"
    ws.oddHeader.right.size = 8
    ws.oddFooter.left.text = "Synthetic sample, not real budget data"
    ws.oddFooter.left.size = 8
    ws.oddFooter.right.text = "Page &P of &N"
    ws.oddFooter.right.size = 8
    wb.properties.creator = "Synthetic sample generator"
    wb.properties.created = datetime.datetime(2026, 10, 14, 9, 0, 0)
    wb.properties.modified = datetime.datetime(2026, 10, 14, 9, 0, 0)
    return wb


if __name__ == "__main__":
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    for v in ("before", "after"):
        build(v).save(os.path.join(out, f"{v}.xlsx"))

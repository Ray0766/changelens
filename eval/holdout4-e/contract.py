"""Case holdout4-e-docx-services-agreement: a services agreement revised in Word.

Usage: python3 contract.py <outdir>   -> writes before.docx and after.docx
Synthetic sample: the parties, sites and figures are invented.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from docxlib import *  # noqa: E402,F403

SUPPLIER = "Halberd Fieldworks Ltd"
CUSTOMER = "Orrin Valley Distribution Ltd"


def clause(doc, text, defined=None):
    p = doc.add_paragraph(style="Clause")
    if defined:
        for part, bold in defined:
            r = p.add_run(part)
            r.bold = bold
    else:
        p.add_run(text)
    return p


def build(v):
    after = v == "after"
    doc = new_document(body_font="Calibri", body_size=11, heading_font="Cambria")
    fixed_core_properties(doc, "Master Services Agreement")
    add_paragraph_style(doc, "Clause", base="Normal")
    doc.styles["Clause"].paragraph_format.space_after = Pt(6)
    add_outline_numbering(doc, [("Heading 1", "%1.", 0.9, 0.9), ("Clause", "%1.%2", 0.9, 0.9)])
    fn = Footnotes(doc)

    sec = doc.sections[0]
    hp = sec.header.paragraphs[0]
    hp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    hr = hp.add_run(
        "Master Services Agreement · Draft for signature · 12 October 2026"
        if after
        else "Master Services Agreement · Draft for discussion · 2 October 2026"
    )
    hr.font.size = Pt(8.5)
    hr.font.color.rgb = RGBColor(0x55, 0x5E, 0x6E)
    fp = sec.footer.paragraphs[0]
    r = fp.add_run("Synthetic sample, not a real agreement · Page ")
    r.font.size = Pt(8.5)
    add_field(fp, "PAGE", "1", size=8.5)
    r = fp.add_run(" of ")
    r.font.size = Pt(8.5)
    add_field(fp, "NUMPAGES", "1", size=8.5)

    doc.add_paragraph("Master Services Agreement", style="Title")
    p = doc.add_paragraph()
    p.add_run("This agreement is made between ")
    p.add_run(SUPPLIER).bold = True
    p.add_run(", Unit 4, Saltmarsh Business Park (the “Supplier”), and ")
    p.add_run(CUSTOMER).bold = True
    p.add_run(", Dock Road 17 (the “Customer”), for facility and grounds services at the Customer’s distribution sites.")

    doc.add_heading("Definitions and interpretation", level=1)
    p = clause(doc, None, [("“Business Day”", True), (" means a day other than a Saturday, Sunday or public holiday at the site where the Services are performed.", False)])
    fn.add(p, "Public holidays are taken from the regional calendar that applies to each site on 1 January of the contract year.")
    clause(doc, None, [("“Business Hours”", True), (" means 07:00 to 19:00 on a Business Day.", False)])
    clause(doc, None, [("“Core Services”", True), (" means the planned cleaning, grounds maintenance and minor repair services described in Part A of Schedule 1.", False)])
    clause(doc, None, [("“Charges”", True), (" means the monthly charge and the rates set out in clause 5 and Schedule 1.", False)])
    clause(doc, "Headings are for convenience only and do not affect the interpretation of this Agreement. A reference to a clause or a schedule is a reference to a clause of, or a schedule to, this Agreement.")

    doc.add_heading("Term", level=1)
    clause(doc, "This Agreement starts on 1 February 2027 and continues for an initial term of 36 months, unless it is terminated earlier under clause 10.")
    clause(doc, "Either party may end this Agreement at the end of the initial term by giving the other party not less than three months’ written notice. If no notice is given, the Agreement continues until terminated by either party on three months’ written notice.")

    doc.add_heading("Services", level=1)
    clause(doc, "The Supplier shall provide the Core Services at the sites listed in Schedule 1 and, on request, the additional services listed in Part B of Schedule 1.")
    clause(doc, "The Supplier shall perform the Services with reasonable skill and care, in line with good industry practice and with all laws and site rules that apply to the Services.")
    clause(doc, "The Customer shall give the Supplier’s personnel safe access to its premises during Business Hours and at other times agreed in advance for urgent work.")
    subcontracting = (
        "Subcontracting. The Supplier may subcontract the cleaning of external areas and car parks only to a subcontractor "
        "approved in writing by the Customer. The Supplier remains responsible for the acts and omissions of its "
        "subcontractors as if they were its own."
    )
    if after:
        clause(doc, subcontracting)

    doc.add_heading("Personnel and site security", level=1)
    clause(doc, "The Supplier shall make sure that all personnel working at the sites hold a valid site induction certificate and wear the identity badge issued by the Customer.")
    clause(doc, "The Supplier shall comply with the Customer’s site security policy as notified to the Supplier from time to time, including the rules on visitors, vehicles and restricted areas.")
    if after:
        clause(doc, "The Supplier shall maintain cyber insurance with a limit of not less than EUR 2,000,000 per claim for the whole term and shall provide the certificate on request.")
    clause(doc, "Before a person first works at a site, the Supplier shall carry out the background checks described in the Customer’s security policy and keep a record of the results for the term.")
    clause(doc, "The Supplier shall not replace the account manager named in Schedule 1 without first consulting the Customer, except in the case of illness or the end of employment.")

    doc.add_heading("Charges and payment", level=1)
    clause(doc, f"The Customer shall pay a fixed monthly charge of EUR {'19,750' if after else '18,400'} excluding VAT for the Core Services, invoiced in arrears on the first Business Day of each month.")
    clause(doc, "Call-outs and additional services are charged at the rates in Part B of Schedule 1. The Supplier shall obtain a purchase order number before starting any additional service.")
    p = clause(doc, "The Charges are adjusted on each anniversary of the start date by the annual change in the index.")
    fn.add(p, f"Harmonised index of consumer prices for the euro area, as first published; any increase is capped at {'2.5%' if after else '3.0%'} per contract year.")
    clause(doc, "The Customer shall pay each undisputed invoice within 30 days of receipt. The Customer shall notify the Supplier of any disputed amount, with reasons, within 10 Business Days of receipt.")

    doc.add_heading("Service levels", level=1)
    clause(doc, "The Supplier shall meet the response and completion times in Part C of Schedule 1 and shall report its performance against them in a monthly service report.")
    clause(doc, "If the Supplier misses a service level, the Customer is entitled to the service credit stated in Schedule 1. Service credits in any month shall not exceed 10% of the monthly charge for that month.")
    clause(doc, "The parties shall meet at least once each quarter to review the service reports, open actions and any proposed changes to the Services.")

    doc.add_heading("Assignment and subcontracting", level=1)
    clause(doc, "Neither party may assign or transfer this Agreement, or any of its rights under it, without the prior written consent of the other party, which shall not be unreasonably withheld.")
    if not after:
        clause(doc, subcontracting)

    doc.add_heading("Liability", level=1)
    clause(doc, "Nothing in this Agreement limits or excludes liability for death or personal injury caused by negligence, for fraud, or for any other liability that cannot be limited by law.")
    clause(doc, "Subject to clause 8.1, the total liability of each party in each contract year is limited to 125% of the Charges paid and payable in that contract year.")
    p = clause(doc, None, [("Neither party is liable for loss of profit, loss of revenue, loss of goodwill or any indirect or consequential loss", after), (", however arising.", False)])
    clause(doc, "The Supplier shall hold public liability insurance with a limit of not less than EUR 5,000,000 for any one event and employer’s liability insurance as required by law.")

    doc.add_heading("Confidentiality and personal data", level=1)
    clause(doc, "Each party shall keep the other party’s confidential information secret and use it only for the purposes of this Agreement. This obligation survives for three years after the end of this Agreement.")
    if after:
        clause(doc, "The Supplier shall process personal data only on the Customer’s documented instructions and shall notify the Customer of any personal data breach without undue delay.")
    else:
        clause(doc, "The Supplier shall process personal data only on the Customer’s documented instructions and shall notify the Customer of any personal data breach without undue delay. The Supplier shall delete all personal data at the end of the Agreement unless the law requires it to be kept.")
    clause(doc, "The parties shall sign a data processing agreement in the form attached as Schedule 2 before any personal data is processed.")

    doc.add_heading("Termination", level=1)
    clause(doc, "Either party may terminate this Agreement with immediate effect by written notice if the other party commits a material breach and, where the breach can be remedied, fails to remedy it within 30 days after being asked to do so.")
    clause(doc, "Either party may terminate this Agreement with immediate effect by written notice if the other party becomes insolvent or ceases to carry on business.")
    clause(doc, "On termination the Supplier shall return all keys, badges and equipment belonging to the Customer and remove its own equipment from the sites within 10 Business Days.")

    doc.add_heading("Governing law and disputes", level=1)
    clause(doc, f"This Agreement is governed by the laws of the Netherlands. The courts of {'Utrecht' if after else 'Rotterdam'} have exclusive jurisdiction over any dispute arising out of or in connection with it.")
    clause(doc, "Before starting court proceedings, the parties shall try in good faith to settle the dispute through a meeting of senior managers within 20 Business Days of a written request.")

    p = doc.add_paragraph("Signed by the parties on the dates below.")
    p.paragraph_format.space_before = Pt(10)
    sig = doc.add_table(rows=4, cols=2)
    for i, who in enumerate((SUPPLIER, CUSTOMER)):
        cell_text(sig.cell(0, i), f"For {who}", bold=True, size=10)
        cell_text(sig.cell(1, i), "Signature: ____________________", size=10)
        cell_text(sig.cell(2, i), "Name and title: ________________", size=10)
        cell_text(sig.cell(3, i), "Date: ____________", size=10)
    for row in sig.rows:
        cant_split(row)

    doc.add_page_break()
    doc.add_paragraph("Schedule 1 — Services, service levels and rates", style="Heading 2")
    doc.add_paragraph("Part A covers the Core Services included in the monthly charge. Part B lists additional services charged per unit. Part C lists the service levels. Account manager: J. Okafor. Rates are in EUR excluding VAT.")
    rows = [
        ("A1", "Daily cleaning of offices and welfare areas", "Daily", "Included"),
        ("A2", "Warehouse floor scrubbing, aisles 1–24", "Weekly", "Included"),
        ("A3", "Washroom hygiene and consumables", "Daily", "Included"),
        ("A4", "Window cleaning, ground floor", "Monthly", "Included"),
        ("A5", "Grass cutting and edging", "Fortnightly, Apr–Oct", "Included"),
        ("A6", "Hedge and shrub maintenance", "Quarterly", "Included"),
        ("A7", "Litter picking, yards and car parks", "Twice weekly", "Included"),
        ("A8", "Gully and drain inspection", "Quarterly", "Included"),
        ("A9", "Minor repairs up to 2 hours per job", "On request", "Included"),
        ("A10", "Pest control inspection", "Monthly", "Included"),
        ("A11", "Waste compactor cleaning", "Monthly", "Included"),
        ("A12", "Loading bay door seal check", "Quarterly", "Included"),
        ("A13", "Kitchen extract filter cleaning", "Quarterly", "Included"),
        ("A14", "Fire exit route inspection", "Weekly", "Included"),
        ("A15", "Car park line marking touch-up", "Yearly", "Included"),
        ("A16", "Reception floor polishing", "Monthly", "Included"),
    ] + ([("A17", "Solar panel cleaning, roof arrays", "Twice yearly", "Included")] if after else []) + [
        ("B1", "Additional cleaning hour, Business Hours", "Per hour", "38.50"),
        ("B2", "Additional cleaning hour, evenings", "Per hour", "46.00"),
        ("B3", "Additional cleaning hour, weekends", "Per hour", "57.50"),
        ("B4", "Deep clean of a welfare block", "Per block", "420.00"),
        ("B5", "High-level window cleaning with lift", "Per day", "980.00"),
        ("B6", "Carpet extraction cleaning", "Per m²", "4.80"),
        ("B7", "Pressure washing of yards", "Per m²", "2.10"),
        ("B8", "Winter gritting of yards", "Per visit", "260.00"),
        ("B9", "Snow clearance with loader", "Per hour", "118.00"),
        ("B10", "Graffiti removal", "Per m²", "24.00"),
        ("B11", "Bulky waste removal", "Per load", "310.00"),
        ("B12", "Confidential waste shredding", "Per bin", "16.00"),
        ("B13", "Replacement of ceiling tiles", "Per tile", "19.50"),
        ("B14", "Replacement of LED panel", "Per panel", "64.00"),
        ("B15", "Emergency spill response", "Per incident", "540.00"),
        ("B16", "Out-of-hours call-out, first hour", "Per call-out", "165.00" if after else "145.00"),
        ("B17", "Out-of-hours call-out, each further hour", "Per hour", "72.00"),
        ("B18", "Temporary barrier hire", "Per week", "35.00"),
        ("B19", "Supervisor attendance at audits", "Per hour", "54.00"),
        ("B20", "Event set-up and clear-down", "Per event", "690.00"),
        ("C1", "Emergency call-out response", "Within 2 hours", "Credit 2%"),
        ("C2", "Urgent repair response", "Within 8 hours", "Credit 1%"),
        ("C3", "Routine repair completion", "Within 5 Business Days", "Credit 1%"),
        ("C4", "Missed scheduled clean, re-visit", "Same Business Day", "Credit 0.5%"),
        ("C5", "Monthly service report delivered", "By the 5th Business Day", "Credit 0.5%"),
        ("C6", "Quarterly review meeting held", "Each quarter", "Credit 0.5%"),
        ("C7", "Washroom consumables restocked", "Within 4 hours", "Credit 0.5%"),
        ("C8", "Gritting before 06:00 when frost forecast", "Each forecast day", "Credit 1%"),
        ("C9", "Spill response on site", "Within 1 hour", "Credit 2%"),
        ("C10", "Complaints acknowledged", "Within 1 Business Day", "Credit 0.5%"),
    ]
    t = doc.add_table(rows=1, cols=4)
    table_borders(t)
    hdr = t.rows[0]
    repeat_header_row(hdr)
    for i, h in enumerate(("Item", "Service", "Frequency or unit", "Rate (EUR)")):
        cell_text(hdr.cells[i], h, bold=True, size=9.5, align="right" if i == 3 else None)
        shade(hdr.cells[i], "DCE3EC")
    for item in rows:
        row = t.add_row()
        cant_split(row)
        for i, val in enumerate(item):
            cell_text(row.cells[i], val, size=9.5, align="right" if i == 3 else None)
    set_col_widths(t, [1.4, 8.4, 4.4, 2.2])
    for row in t.rows:
        row.height = Cm(0.62)

    fn.finish("Calibri")
    return doc


if __name__ == "__main__":
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    for v in ("before", "after"):
        build(v).save(os.path.join(out, f"{v}.docx"))

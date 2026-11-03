"""Case holdout4-e-docx-retention-redline: a records retention policy revised in Word.

The new version is the draft as circulated with tracked changes shown (LibreOffice
renders them as underlined / struck-through coloured text with a change bar), and
it also contains edits that were made with tracking switched off.

Usage: python3 retention.py <outdir>   -> writes before.docx and after.docx
Synthetic sample: the organisation and the schedule are invented.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from docxlib import *  # noqa: E402,F403

ORG = "Fenmore Housing Association"


def build(v):
    after = v == "after"
    doc = new_document(body_font="Arial", body_size=10.5, heading_font="Arial")
    fixed_core_properties(doc, "Records Retention Policy")
    add_paragraph_style(doc, "Policy Text", base="Normal")
    add_outline_numbering(doc, [("Heading 1", "%1", 0.9, 0.9), ("Policy Text", "%1.%2", 0.9, 0.9)])
    for name in ("Title", "Heading 1", "Heading 2"):
        doc.styles[name].font.color.rgb = RGBColor(0x0B, 0x4F, 0x45)

    sec = doc.sections[0]
    hp = sec.header.paragraphs[0]
    hr = hp.add_run(f"{ORG} · Records Retention Policy")
    hr.font.size = Pt(8)
    hr.font.color.rgb = RGBColor(0x4A, 0x55, 0x60)
    fp = sec.footer.paragraphs[0]
    r = fp.add_run(
        ("Version 3.2 · Draft with tracked changes · 12 October 2026" if after else "Version 3.1 · Approved 14 May 2025")
        + " · Synthetic sample · Page "
    )
    r.font.size = Pt(8)
    add_field(fp, "PAGE", "1", size=8)

    def para(text):
        p = doc.add_paragraph(style="Policy Text")
        if text:
            p.add_run(text)
        return p

    doc.add_paragraph("Records Retention Policy", style="Title")
    info = doc.add_table(rows=4, cols=2)
    table_borders(info, color="B5C2BF")
    meta = [
        ("Policy owner", "Head of Information Governance"),
        ("Approved by", "Audit and Risk Committee"),
        ("Applies to", "All staff, board members, contractors and volunteers"),
        ("Next review", "May 2027"),
    ]
    for i, (k, val) in enumerate(meta):
        cell_text(info.cell(i, 0), k, bold=True, size=9.5)
        shade(info.cell(i, 0), "E6EFED")
        cell_text(info.cell(i, 1), val, size=9.5)
    set_col_widths(info, [4.0, 12.4])
    doc.add_paragraph()

    doc.add_heading("Purpose", level=1)
    para(f"This policy sets out how long {ORG} keeps its records and how records are disposed of when their retention period ends.")
    para("Keeping records for the right length of time helps us meet our legal duties, answer questions from tenants and regulators, and avoid keeping personal data for longer than we need it.")

    doc.add_heading("Scope", level=1)
    para("This policy applies to records in every format, including paper files, email, case management systems, shared drives, voice recordings and CCTV footage.")
    para("It does not apply to historical material transferred to the county archive, which is governed by the deposit agreement with the archive service.")

    doc.add_heading("Roles and responsibilities", level=1)
    para("The Head of Information Governance owns this policy, maintains the retention schedule in Appendix A and reports on compliance to the Audit and Risk Committee once a year.")
    para("Each Information Asset Owner makes sure that the records in their area are listed in the retention schedule, that the retention periods are applied and that disposal is recorded.")
    p = para("All staff must file records in the agreed systems, must not keep personal copies of records and must ask the Information Governance team when they are unsure how long to keep something.")
    if after:
        tracked_insert(p, " Staff must complete the records management e-learning module within 30 days of joining.")
    para("Contractors who hold records on our behalf must follow this policy or an equivalent policy agreed in their contract.")

    doc.add_heading("Retention principles", level=1)
    para("Records are kept for the period shown in the retention schedule. The period starts from the trigger event stated in the schedule, such as the end of a tenancy or the date a case was closed.")
    para("Where a record is subject to a legal hold, a complaint or an open request from a regulator, it must not be destroyed until the Information Governance team confirms that the hold has been lifted.")
    scan_rule = "Paper records may be scanned and the paper copy destroyed after a quality check of a sample of the scanned batch."
    p = para(None if after else scan_rule)
    if after:
        tracked_delete(p, scan_rule)
    para("Duplicate and working copies are kept only for as long as they are needed for day-to-day work and never for longer than the master record.")

    doc.add_heading("Disposal", level=1)
    para("Paper records that contain personal data are shredded on site or collected in locked bins by an approved contractor, who provides a certificate of destruction for each collection.")
    para(f"Electronic records are deleted from live systems at the end of the retention period and are removed from backups within {'180' if after else '90'} days by the normal backup rotation.")
    para("Each disposal is recorded in the disposal log with the record class, the date range, the method used and the name of the person who approved it.")

    doc.add_heading("Monitoring and review", level=1)
    para("The Information Governance team checks a sample of disposal logs each quarter and reports exceptions to the Information Asset Owners concerned.")
    para("This policy is reviewed every two years, or earlier if the law or our systems change.")

    # Appendix A: landscape section with the retention schedule
    sec2 = landscape_section(doc)
    sec2.left_margin = sec2.right_margin = Cm(2.0)
    sec2.top_margin, sec2.bottom_margin = Cm(2.0), Cm(2.0)
    doc.add_paragraph("Appendix A — Retention schedule", style="Heading 2")
    doc.add_paragraph("Periods run from the trigger event. Where two periods apply, the longer one is used. Disposal methods are described in section 5.")
    sched = [
        ("R01", "Tenancy files", "Tenancy agreement, sign-up documents, correspondence", "Lettings Team", "6 years", "End of tenancy", "Confidential shredding"),
        ("R02", "Rent accounts", "Rent statements, arrears letters, payment plans", "Income Team", "6 years", "End of financial year", "Delete from system"),
        ("R03", "Housing applications, unsuccessful", "Application form, evidence, decision letter", "Lettings Team", "2 years", "Date of decision", "Delete from system"),
        ("R04", "Repairs records", "Job tickets, inspection photos, completion notes", "Property Services", "6 years", "Job completion", "Delete from system"),
        ("R05", "Gas safety certificates", "Landlord gas safety records", "Compliance Team", "3 years", "Date of check", "Delete from system"),
        ("R06", "Asbestos surveys", "Survey reports, register entries, removal records", "Compliance Team", "40 years", "Date of survey", "Review, then archive"),
        ("R07", "Anti-social behaviour cases", "Case notes, witness statements, legal action", "Tenancy Enforcement", "6 years", "Case closed", "Confidential shredding"),
        ("R08", "Complaints", "Complaint, investigation notes, response letters", "Customer Experience", "3 years", "Complaint closed", "Delete from system"),
        ("R09", "CCTV footage", "Recordings from estate cameras", "Community Safety Officer" if after else "Neighbourhood Team", "31 days", "Date of recording", "Automatic overwrite"),
        ("R10", "Staff personnel files", "Contract, appraisals, training records", "People Team", "6 years", "End of employment", "Confidential shredding"),
        ("R11", "Recruitment, unsuccessful candidates", "Applications, interview notes", "People Team", "6 months", "Date of decision", "Delete from system"),
        ("R12", "Payroll records", "Payslips, tax forms, pension contributions", "Finance Team", "6 years", "End of tax year", "Delete from system"),
        ("R13", "Board papers and minutes", "Agendas, papers, signed minutes", "Governance Officer", "Permanent", "Date of meeting", "Transfer to archive"),
        ("R14", "Contracts with suppliers", "Signed contracts, variations, tender documents", "Procurement Team", "12 years", "Contract end", "Review, then delete"),
        ("R15", "Accident and incident reports", "Report forms, investigation notes", "Health and Safety Lead", "15 years" if after else "10 years", "Date of incident", "Review, then delete"),
        ("R16", "Call recordings", "Customer service call recordings", "Customer Experience", "90 days", "Date of call", "Automatic deletion"),
    ]
    t = doc.add_table(rows=1, cols=7)
    table_borders(t, color="9DB0AC")
    heads = ("Ref", "Record class", "Examples", "Owner", "Retention", "Trigger", "Disposal")
    repeat_header_row(t.rows[0])
    for i, h in enumerate(heads):
        cell_text(t.rows[0].cells[i], h, bold=True, size=9)
        shade(t.rows[0].cells[i], "D5E4E1")
    for row_vals in sched:
        row = t.add_row()
        cant_split(row)
        for i, val in enumerate(row_vals):
            cell_text(row.cells[i], val, size=9)
    set_col_widths(t, [1.2, 4.4, 6.6, 3.8, 2.4, 3.4, 3.9])

    # Appendix B: back to portrait for document control
    sec3 = portrait_section(doc)
    sec3.left_margin = sec3.right_margin = Cm(2.3)
    doc.add_paragraph("Appendix B — Document control", style="Heading 2")
    hist = [
        ("2.0", "9 March 2021", "Full rewrite after the systems migration"),
        ("3.0", "2 June 2023", "Retention schedule moved to Appendix A; CCTV and call recordings added"),
        ("3.1", "14 May 2025", "Review dates updated; asbestos period corrected"),
    ]
    if after:
        hist.append(("3.2", "12 October 2026", "Draft for the Audit and Risk Committee"))
    t2 = doc.add_table(rows=1, cols=3)
    table_borders(t2, color="9DB0AC")
    for i, h in enumerate(("Version", "Date", "Summary of changes")):
        cell_text(t2.rows[0].cells[i], h, bold=True, size=9.5)
        shade(t2.rows[0].cells[i], "D5E4E1")
    for vals in hist:
        row = t2.add_row()
        for i, val in enumerate(vals):
            cell_text(row.cells[i], val, size=9.5)
    set_col_widths(t2, [2.0, 3.6, 10.8])
    doc.add_paragraph()
    doc.add_paragraph("Questions about this policy go to the Information Governance team, extension 4410.")
    return doc


if __name__ == "__main__":
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    for v in ("before", "after"):
        build(v).save(os.path.join(out, f"{v}.docx"))

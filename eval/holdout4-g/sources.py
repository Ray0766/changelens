"""Writes the Office sources (.docx, .xlsx) and the PNG images for the
held-out-4 cases of author g into a work directory.

    python3 eval/holdout4-g/sources.py <workdir>

LibreOffice converts the .docx/.xlsx files to PDF afterwards (see
eval/make-holdout4-g.mjs). Everything is synthetic.
"""
import math
import os
import random
import sys

from docx import Document
from docx.enum.table import WD_ROW_HEIGHT_RULE, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from PIL import Image, ImageDraw, ImageFont

FONT_DIR = '/usr/share/fonts/truetype'


# ---------------------------------------------------------------- docx helpers

def new_doc(font='Calibri', size=11, margins=(2.5, 2.2, 2.5, 2.2)):
    """A4 document with the given base font and margins (top, right, bottom, left) in cm."""
    d = Document()
    s = d.sections[0]
    s.page_width, s.page_height = Cm(21), Cm(29.7)
    s.top_margin, s.right_margin, s.bottom_margin, s.left_margin = [Cm(m) for m in margins]
    s.footer_distance = Cm(1.2)
    st = d.styles['Normal']
    st.font.name = font
    st.element.rPr.rFonts.set(qn('w:eastAsia'), font)
    st.font.size = Pt(size)
    st.paragraph_format.space_after = Pt(6)
    st.paragraph_format.line_spacing = 1.1
    for name in ('Heading 1', 'Heading 2', 'Title'):
        hs = d.styles[name]
        hs.font.name = font
        rfonts = hs.element.rPr.find(qn('w:rFonts'))
        if rfonts is not None:
            for a in list(rfonts.attrib):
                del rfonts.attrib[a]
            rfonts.set(qn('w:ascii'), font)
            rfonts.set(qn('w:hAnsi'), font)
        hs.font.color.rgb = RGBColor(0x1F, 0x2A, 0x37)
    d.styles['Heading 1'].font.size = Pt(14)
    d.styles['Heading 1'].paragraph_format.space_before = Pt(12)
    d.styles['Heading 1'].paragraph_format.space_after = Pt(4)
    d.styles['Heading 2'].font.size = Pt(11.5)
    d.styles['Heading 2'].paragraph_format.space_before = Pt(8)
    d.styles['Heading 2'].paragraph_format.space_after = Pt(2)
    d.styles['Title'].font.size = Pt(20)
    return d


def footer(d, text, page_field=False, size=8.5):
    p = d.sections[0].footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(text)
    r.font.size = Pt(size)
    r.font.color.rgb = RGBColor(0x55, 0x5B, 0x66)
    if page_field:
        fld = OxmlElement('w:fldSimple')
        fld.set(qn('w:instr'), 'PAGE')
        rr = OxmlElement('w:r')
        rpr = OxmlElement('w:rPr')
        sz = OxmlElement('w:sz')
        sz.set(qn('w:val'), str(int(size * 2)))
        rpr.append(sz)
        rr.append(rpr)
        t = OxmlElement('w:t')
        t.text = '1'
        rr.append(t)
        fld.append(rr)
        p._p.append(fld)


def para(d, text, bold_prefix=None, size=None, align=None, space_after=None, italic=False):
    p = d.add_paragraph()
    if bold_prefix:
        r = p.add_run(bold_prefix)
        r.bold = True
        if size:
            r.font.size = Pt(size)
    r = p.add_run(text)
    r.italic = italic
    if size:
        r.font.size = Pt(size)
    if align == 'center':
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    elif align == 'justify':
        p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    if space_after is not None:
        p.paragraph_format.space_after = Pt(space_after)
    return p


def page_break(d):
    d.add_paragraph().add_run().add_break(WD_BREAK.PAGE)


def set_cell_shading(cell, hex_fill):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), hex_fill)
    tcPr.append(shd)


def table(d, header, rows, widths_cm, size=10, header_fill='E5E7EB', align_right=()):
    t = d.add_table(rows=1, cols=len(header))
    t.style = 'Table Grid'
    t.alignment = WD_TABLE_ALIGNMENT.LEFT
    t.autofit = False
    # fixed layout so that LibreOffice keeps the column widths
    tblPr = t._tbl.tblPr
    layout = OxmlElement('w:tblLayout')
    layout.set(qn('w:type'), 'fixed')
    tblPr.append(layout)
    tblW = tblPr.find(qn('w:tblW'))
    if tblW is None:
        tblW = OxmlElement('w:tblW')
        tblPr.append(tblW)
    tblW.set(qn('w:type'), 'dxa')
    tblW.set(qn('w:w'), str(int(sum(widths_cm) * 567)))
    grid = t._tbl.tblGrid
    for gc, w in zip(grid.findall(qn('w:gridCol')), widths_cm):
        gc.set(qn('w:w'), str(int(w * 567)))

    def fill(row, values, bold=False):
        for i, (cell, v) in enumerate(zip(row.cells, values)):
            cell.width = Cm(widths_cm[i])
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(1)
            r = p.add_run(v)
            r.font.size = Pt(size)
            r.bold = bold
            if i in align_right:
                p.alignment = WD_ALIGN_PARAGRAPH.RIGHT

    fill(t.rows[0], header, bold=True)
    for c in t.rows[0].cells:
        set_cell_shading(c, header_fill)
    for row in rows:
        fill(t.add_row(), row)
    d.add_paragraph().paragraph_format.space_after = Pt(2)
    return t


# ------------------------------------------------------ case 1: tender pack

def tender_technical(path):
    d = new_doc('Calibri', 11)
    footer(d, 'Brackwater Lighting Co. — Technical proposal — page ', page_field=True)
    d.add_paragraph('Technical proposal', style='Title')
    para(d, 'Tender TR-0417 · Harbour Promenade Lighting Renewal · '
            'Brackwater Lighting Co. (synthetic sample)', italic=True, space_after=10)

    d.add_heading('1 Scope of works', 1)
    para(d, 'The works cover the renewal of street lighting along the 1.2 km harbour promenade '
            'between the ferry terminal and the lifeboat station. Forty-eight existing sodium '
            'lanterns on 6 m columns will be replaced with LED column luminaires of the type '
            'described in the product data sheet. Where a column fails the structural test '
            'described in section 2.3, the column is replaced as well. The existing feeder '
            'pillars are retained; their protective devices are checked and replaced where '
            'necessary.', align='justify')
    para(d, 'The scope includes the supply of all luminaires, brackets and cabling, the '
            'installation and connection of the luminaires, a central control system with one '
            'node per luminaire, commissioning, and the documentation required for handover. '
            'Civil works outside the column bases, such as resurfacing of the promenade, are '
            'not included and are priced by others.', align='justify')

    d.add_heading('2 Approach and method', 1)
    d.add_heading('2.1 Survey and setting-out', 2)
    para(d, 'Before any work starts, we survey every column position, record the condition of '
            'each column and photograph its base. The survey is completed within the first two '
            'weeks and is shared with the Town’s engineer as a marked-up plan, together with '
            'a list of the columns we expect to replace.', align='justify')
    d.add_heading('2.2 Sequence of works', 2)
    para(d, 'Works proceed in four sections of twelve columns each, starting at the ferry '
            'terminal. In each section the new luminaires are installed and connected before '
            'the old lanterns are switched off, so that no part of the promenade is left without '
            'lighting for more than one night. Each section takes about two weeks, including '
            'the reinstatement of the column bases.', align='justify')
    d.add_heading('2.3 Column testing', 2)
    para(d, 'Each column is tested with a non-destructive ultrasonic method at ground level and '
            'just below the bracket. Columns with a wall loss of more than 25 per cent are '
            'recorded as failed and replaced during the same visit, so that the promenade is not '
            'disturbed twice. Test results are recorded per column and handed over with the '
            'documentation.', align='justify')
    d.add_heading('2.4 Working at night', 2)
    para(d, 'Work on the carriageway side of the promenade is carried out between 20:00 and '
            '05:00 under the method statement for night works, which is attached to this '
            'response. Noisy operations such as cutting and drilling stop at 23:00. Residents '
            'along the promenade receive a letter one week before work starts in their section.',
         align='justify')

    d.add_heading('3 Programme', 1)
    para(d, 'The works take eleven weeks from the order date. The programme below assumes an '
            'order date of 1 December 2026 and a two-week break over the holidays, which is not '
            'counted. It will be adjusted if the order is placed later.', align='justify')
    table(d, ['Weeks', 'Activity', 'Columns'],
          [['1–2', 'Survey, setting-out and ordering of luminaires', '—'],
           ['3–4', 'Section 1, ferry terminal to the fish market', '1–12'],
           ['5–6', 'Section 2, fish market to the bandstand', '13–24'],
           ['7–8', 'Section 3, bandstand to the boatyard', '25–36'],
           ['9–10', 'Section 4, boatyard to the lifeboat station', '37–48'],
           ['11', 'Commissioning of the control system and handover', '—']],
          [2.2, 10.0, 3.0], size=10)

    d.add_heading('4 Team', 1)
    para(d, 'The contract manager is responsible for the works from order to handover and is the '
            'single point of contact for the Town. She is supported by a site supervisor, two '
            'installation crews of three electricians each, and a commissioning engineer who '
            'joins the team for the last three weeks.', align='justify')
    table(d, ['Role', 'Responsibility', 'Years of experience'],
          [['Contract manager', 'Programme, reporting, contact with the Town', '14'],
           ['Site supervisor', 'Daily site management, permits, safety briefings', '11'],
           ['Electricians (6)', 'Installation, connection, column testing', '4–19'],
           ['Commissioning engineer', 'Control system, test certificates, training', '9']],
          [4.2, 8.0, 3.0], size=10)

    d.add_heading('5 Quality, safety and environment', 1)
    para(d, 'All installation crews hold the qualifications required by the national wiring '
            'rules and have completed training for work next to live traffic. Every working day '
            'starts with a short safety briefing at the site cabin. Our quality plan defines '
            'hold points at the end of each section, where the Town’s engineer can inspect '
            'the work before the next section starts.', align='justify')
    para(d, 'Old lanterns and brackets are returned to a licensed recycler. The recycling '
            'certificates are handed over with the documentation. Deliveries are combined to '
            'keep the number of vehicle movements on the promenade low, and no materials are '
            'stored on the promenade overnight.', align='justify')

    d.add_heading('6 Handover', 1)
    para(d, 'At handover we provide the as-built drawings, the test certificates for every '
            'column, the configuration of the control system and two days of training for the '
            'Town’s maintenance staff. The defects liability period starts on the date of '
            'the handover certificate.', align='justify')
    d.save(path)


def tender_maintenance(path):
    d = new_doc('Calibri', 11)
    footer(d, 'Brackwater Lighting Co. — Maintenance plan')
    d.add_paragraph('Maintenance plan', style='Title')
    para(d, 'Tender TR-0417 · Harbour Promenade Lighting Renewal (synthetic sample)',
         italic=True, space_after=10)
    para(d, 'This plan covers the first five years after handover. All intervals are counted '
            'from the date of the handover certificate. Tasks marked “by others” are '
            'not part of our offer and are listed only so that the plan is complete.',
         align='justify')
    table(d, ['Task', 'Interval', 'Carried out by'],
          [['Visual inspection of luminaires and columns', 'every 6 months', 'Bidder'],
           ['Cleaning of luminaire optics', 'every 12 months', 'Bidder'],
           ['Check of control nodes and firmware updates', 'every 12 months', 'Bidder'],
           ['Electrical test of feeder pillars', 'every 24 months', 'Bidder'],
           ['Structural test of columns', 'every 60 months', 'Town (by others)']],
          [8.6, 3.4, 3.6], size=10)
    para(d, 'Faults reported through the control system are attended within 48 hours. A '
            'luminaire that has failed is replaced from the spare stock of four units held by '
            'the Town, and the spare stock is topped up at the next scheduled visit.',
         align='justify')
    para(d, 'After each visit we send a short report listing the work done, the faults found '
            'and the luminaires replaced. Once a year we meet the Town’s maintenance staff '
            'to review the reports and agree any changes to the plan.', align='justify')
    d.save(path)


def tender_night_works(path):
    d = new_doc('Calibri', 11)
    footer(d, 'Brackwater Lighting Co. — Method statement for night works')
    d.add_paragraph('Method statement for night works', style='Title')
    para(d, 'Tender TR-0417 · Harbour Promenade Lighting Renewal (synthetic sample)',
         italic=True, space_after=10)
    para(d, 'This statement applies to all work on the carriageway side of the promenade '
            'between 20:00 and 05:00. It is read out at the start of every night shift.',
         align='justify')
    steps = [
        'The site supervisor confirms the traffic management layout with the Town’s duty '
        'officer before 19:30.',
        'Signs and cones are placed in the order shown in the traffic management plan, starting '
        'with the advance warning signs.',
        'The lane is closed only after the last cone is in place and the supervisor has walked '
        'the closure.',
        'Each crew works within the closed lane only. Lighting towers are pointed away from '
        'houses and from oncoming traffic.',
        'Cutting and drilling stop at 23:00. Work after 23:00 is limited to connection, testing '
        'and clearing up.',
        'The closure is removed in the reverse order by 05:00, and the supervisor reports the '
        'end of the shift to the duty officer.',
    ]
    for i, s in enumerate(steps, 1):
        para(d, s, bold_prefix=f'{i}.  ')
    para(d, 'If wind speeds exceed 18 m/s or visibility falls below 100 m, the supervisor stops '
            'the work and makes the site safe. Stopped shifts are recorded in the site diary.',
         align='justify')
    d.save(path)


# ------------------------------------------------- case 2: inspection report

def inspection_report(path, deflection):
    d = new_doc('Calibri', 11, margins=(2.5, 2.0, 2.5, 2.0))
    footer(d, 'FB-112 · Q3 2026 inspection report · synthetic sample')
    d.add_paragraph('Quarterly inspection report — Q3 2026', style='Title')
    para(d, 'Northgate Footbridge (structure ref. FB-112) · synthetic sample', italic=True,
         space_after=10)
    d.add_heading('1 Summary', 1)
    para(d, 'The footbridge was inspected on 22 September 2026 by a team of two engineers, '
            'working from the deck and from a boat. The structure remains in fair condition. '
            'Eight defects were recorded; none of them requires the bridge to be closed or a '
            'weight limit to be imposed. Three defects are new since the last inspection.',
         align='justify')
    d.add_heading('2 Load test', 1)
    para(d, 'A static load test was carried out at midspan with a uniformly distributed test '
            f'load of 5.0 kN/m². The maximum deflection under the test load was {deflection} '
            'mm, against a calculated value of 13.5 mm and a limit of 18.0 mm. The residual '
            'deflection after unloading was 0.4 mm, which is within the expected range.',
         align='justify')
    d.add_heading('3 Inspection zones', 1)
    para(d, 'The bridge is divided into four inspection zones, shown on the site plan: Z1 west '
            'abutment, Z2 west span, Z3 east span and Z4 east abutment. The defect register '
            'lists each defect with its zone, the element concerned and the action we '
            'recommend.', align='justify')
    d.add_heading('4 Access and weather', 1)
    para(d, 'The inspection took place in dry weather with a light westerly wind. The river '
            'level was 0.6 m below the normal summer level, so that the lower parts of both '
            'abutments could be inspected from the boat. The east stairway was closed to the '
            'public for two hours while the load test was carried out.', align='justify')
    d.add_heading('Previous inspections', 2)
    table(d, ['Inspection', 'Date', 'Defects', 'Condition'],
          [['Q4 2025', '9 December 2025', '5', 'Fair'],
           ['Q1 2026', '17 March 2026', '6', 'Fair'],
           ['Q2 2026', '23 June 2026', '5', 'Fair'],
           ['Q3 2026', '22 September 2026', '8', 'Fair']],
          [3.5, 5.0, 3.0, 3.5], size=10)
    page_break(d)
    d.add_heading('5 Recommendations', 1)
    para(d, 'We recommend that the works below are carried out in the order shown. Works '
            'marked for Q4 2026 should be ordered now, so that they can be completed before the '
            'winter. The budget figures are estimates at today’s prices and do not include '
            'traffic management on the river.', align='justify')
    # The planned-works table is deliberately wider than the text area (17 cm):
    # it extends 1.4 cm into the right margin, as tables pasted from a
    # spreadsheet often do.
    table(d, ['Ref', 'Work', 'Quarter', 'Budget (EUR)'],
          [['PW-1', 'Re-seal the expansion joint at the east abutment', 'Q4 2026', '4,800'],
           ['PW-2', 'Replace two corroded handrail posts in zone Z2', 'Q4 2026', '2,350'],
           ['PW-3', 'Clean and repaint the bearing shelf at the west abutment', 'Q1 2027', '6,900'],
           ['PW-4', 'Repair spalled concrete on the east stairway', 'Q2 2027', '3,150']],
          [1.6, 10.2, 2.4, 4.2], size=10, align_right=(3,))
    para(d, 'The total budget for the planned works is EUR 17,200. Works PW-1 and PW-2 can be '
            'carried out by the maintenance contractor under the existing framework agreement.',
         align='justify')
    d.add_heading('6 Next inspection', 1)
    para(d, 'The next quarterly inspection is planned for December 2026. The next principal '
            'inspection, with access to all parts of the structure, is due in March 2028.',
         align='justify')
    d.add_heading('7 Sign-off', 1)
    para(d, 'Inspected by: R. Albrecht, chartered engineer, and S. Adeyemi, inspector. '
            'Checked by: L. Varga, bridge manager.', align='justify')
    d.save(path)


def defect_register(path):
    wb = Workbook()
    ws = wb.active
    ws.title = 'Defect register'
    ws.page_setup.orientation = 'landscape'
    ws.page_setup.paperSize = 9  # A4
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_margins.left = ws.page_margins.right = 0.6
    ws.page_margins.top = ws.page_margins.bottom = 0.7
    ws.oddHeader.center.text = 'FB-112 Northgate Footbridge — defect register Q3 2026'
    ws.oddFooter.center.text = 'synthetic sample'
    header = ['Ref', 'Zone', 'Element', 'Defect', 'Severity', 'Recommended action', 'Due']
    rows = [
        ['D-01', 'Z1', 'Abutment wall', 'Vertical crack, 0.3 mm wide, 1.1 m long', 'Low', 'Monitor; measure at next inspection', 'Q4 2026'],
        ['D-02', 'Z1', 'Expansion joint', 'Seal torn over 40 cm, water ingress', 'Medium', 'Re-seal joint (PW-1)', 'Q4 2026'],
        ['D-03', 'Z2', 'Handrail post', 'Corrosion at base, section loss about 15 %', 'Medium', 'Replace post (PW-2)', 'Q4 2026'],
        ['D-04', 'Z2', 'Handrail post', 'Corrosion at base, section loss about 10 %', 'Medium', 'Replace post (PW-2)', 'Q4 2026'],
        ['D-05', 'Z2', 'Deck surfacing', 'Worn anti-slip coating, 2 m²', 'Low', 'Patch at next resurfacing', 'Q3 2027'],
        ['D-06', 'Z3', 'Drainage outlet', 'Blocked by leaves and silt', 'Low', 'Clear outlet', 'Q4 2026'],
        ['D-07', 'Z4', 'Bearing shelf', 'Debris and surface rust on bearing plates', 'Medium', 'Clean and repaint (PW-3)', 'Q1 2027'],
        ['D-08', 'Z4', 'East stairway', 'Spalled concrete on two treads, rebar exposed', 'Medium', 'Repair concrete (PW-4)', 'Q2 2027'],
    ]
    ws.append(header)
    for r in rows:
        ws.append(r)
    widths = [7, 6, 16, 44, 10, 34, 10]
    for i, w in enumerate(widths):
        ws.column_dimensions[chr(65 + i)].width = w
    thin = Side(style='thin', color='9CA3AF')
    for row in ws.iter_rows(min_row=1, max_row=len(rows) + 1, max_col=len(header)):
        for c in row:
            c.border = Border(left=thin, right=thin, top=thin, bottom=thin)
            c.alignment = Alignment(vertical='top', wrap_text=True)
            c.font = Font(name='Liberation Sans', size=10, bold=(c.row == 1))
            if c.row == 1:
                c.fill = PatternFill('solid', fgColor='DCE3EA')
    ws.print_title_rows = '1:1'
    ws.print_area = f'A1:G{len(rows) + 1}'
    wb.save(path)


# ---------------------------------------------------- case 4: annotated agreement

def support_agreement(path, payment_days):
    d = new_doc('Calibri', 11, margins=(2.6, 3.0, 2.5, 2.5))
    footer(d, 'Support agreement SA-2027-08 · synthetic sample · page ', page_field=True)
    d.add_paragraph('Software support agreement', style='Title')
    para(d, 'Renewal for the contract year 2027 · agreement SA-2027-08 · synthetic sample',
         italic=True, space_after=10)
    d.add_heading('1 Parties and term', 1)
    para(d, 'This agreement is made between Fenwick Row Software Ltd (“the Supplier”) and '
            'Tallis Brook Clinic (“the Customer”), both fictitious. It runs from '
            '1 January 2027 to 31 December 2027 and renews for one further year unless it is '
            'terminated under clause 8.', align='justify')
    d.add_heading('2 Services', 1)
    para(d, 'The Supplier supports the appointment scheduling software licensed to the Customer, '
            'including the web portal and the reminder service. Support covers the correction '
            'of faults, minor releases and security updates, and advice to the Customer’s '
            'staff by telephone and e-mail on working days between 08:00 and 18:00.',
         align='justify')
    d.add_heading('3 Liability', 1)
    para(d, 'Neither party excludes liability for death or personal injury caused by its '
            'negligence. The Supplier’s total liability under this agreement is limited to '
            'the fees paid in the twelve months before the claim. Neither party is liable for '
            'loss of profit or for indirect loss.', align='justify')
    d.add_heading('4 Service levels', 1)
    para(d, 'Faults are classified by the Customer when they are reported. The Supplier '
            'responds within the times below, counted in working hours.', align='justify')
    table(d, ['Priority', 'Example', 'Response', 'Target fix'],
          [['P1', 'Scheduling unavailable for all users', '1 hour', '8 hours'],
           ['P2', 'Reminder service not sending messages', '4 hours', '2 days'],
           ['P3', 'Error in a report or a single screen', '1 day', 'next release']],
          [1.8, 7.2, 2.4, 2.9], size=10)
    d.add_heading('5 Customer obligations', 1)
    para(d, 'The Customer names two members of staff who may report faults and who have been '
            'trained in the use of the software. The Customer gives the Supplier remote access to '
            'the test system and keeps the operating system of its server within the versions '
            'supported by the current release.', align='justify')
    d.add_heading('6 Maintenance windows', 1)
    para(d, 'Releases are installed in a maintenance window on the first Tuesday of each month '
            'between 19:00 and 22:00. The Supplier announces each release at least five working '
            'days in advance and describes the changes in release notes. Urgent security updates '
            'may be installed outside the window after the Customer has been informed.',
         align='justify')
    d.add_heading('7 Fees and payment', 1)
    para(d, 'The annual support fee is EUR 14,200, invoiced in advance on 1 January. Invoices '
            f'are payable within {payment_days} days of the invoice date. Work outside the scope '
            'of this agreement is charged at EUR 115 per hour after written approval by the '
            'Customer.', align='justify')
    d.add_heading('8 Termination', 1)
    para(d, 'Either party may terminate this agreement with three months’ written notice to '
            'the end of a contract year. Either party may terminate it with immediate effect if '
            'the other party commits a material breach and does not remedy it within one month of '
            'being asked to do so.', align='justify')
    d.add_heading('9 Data protection', 1)
    para(d, 'The Supplier processes personal data only on the Customer’s documented '
            'instructions and under the data processing terms in the annex. The Supplier keeps '
            'support data within the European Economic Area.', align='justify')
    d.add_heading('10 Governing law', 1)
    para(d, 'This agreement is governed by the law of the place where the Customer has its '
            'registered office.', align='justify')
    t = d.add_table(rows=3, cols=2)
    for row, (a, b) in zip(t.rows, [('For the Supplier', 'For the Customer'),
                                    ('Signature: ____________________', 'Signature: ____________________'),
                                    ('Date: ____________', 'Date: ____________')]):
        row.cells[0].paragraphs[0].add_run(a)
        row.cells[1].paragraphs[0].add_run(b)
        for c in row.cells:
            c.paragraphs[0].paragraph_format.space_before = Pt(10)
    d.save(path)


# ------------------------------------------------ case 6: cleaning agreement

def cleaning_agreement(path, img_dir, after):
    d = new_doc('Cambria', 10.5, margins=(2.5, 2.4, 2.4, 2.4))
    footer(d, 'Cleaning services agreement CS-0912 · synthetic sample')
    d.add_paragraph('Cleaning services agreement', style='Title')
    para(d, 'Agreement CS-0912 between Lowmoor Facility Services (“the Supplier”) and '
            'Tallis Brook Clinic (“the Client”), both fictitious · synthetic sample',
         italic=True, space_after=10)
    d.add_heading('1 Services', 1)
    para(d, 'The Supplier cleans the Client’s premises at 7 Orchard Row as described in '
            'Schedule 1 (service specification). Cleaning takes place on working days between '
            '18:00 and 22:00, unless the Client asks for a different time at least two working '
            'days in advance.', align='justify')
    p = ('The Supplier provides all cleaning materials and equipment. Window cleaning is carried '
         'out every eight weeks, inside and outside, at all floors that can be reached from the '
         'ground or from a ladder.')
    if not after:
        p += ' The Supplier may subcontract window cleaning above 4 m to a specialist firm.'
    para(d, p, align='justify')
    d.add_heading('2 Staff and access', 1)
    para(d, 'The Supplier names a supervisor who is responsible for the work and who can be '
            'reached by telephone during the cleaning hours. Cleaning staff wear the Supplier’s '
            'identity badge and follow the site access rules in Schedule 2. Keys and access cards '
            'are signed for and are returned when a member of staff leaves.', align='justify')
    d.add_heading('3 Quality', 1)
    para(d, 'The Client and the Supplier inspect a sample of rooms together once a month and '
            'record the result on the inspection form. If the result is below the agreed '
            'standard in two consecutive months, the Supplier presents an improvement plan within '
            'ten working days.', align='justify')
    d.add_heading('4 Prices and payment', 1)
    para(d, 'The Client pays the monthly price in Schedule 3. The Supplier invoices at the end of '
            'each month, and invoices are payable within 30 days. Prices are fixed until '
            '31 December 2027 and are then adjusted once a year by the change in the national '
            'index of labour costs.', align='justify')
    d.add_heading('5 Term and termination', 1)
    para(d, 'This agreement starts on 1 December 2026 and runs for two years. Either party may '
            'terminate it with three months’ written notice to the end of a calendar month. The '
            'Client may terminate it with one month’s notice if the Supplier fails to present '
            'or carry out an improvement plan under clause 3.', align='justify')
    d.add_heading('6 Insurance', 1)
    para(d, 'The Supplier holds public liability insurance of at least EUR 5,000,000 per claim and '
            'shows the certificate to the Client on request. The Supplier is responsible for '
            'damage caused by its staff during the cleaning hours.', align='justify')
    d.add_heading('7 Confidentiality', 1)
    para(d, 'Cleaning staff may see patient information left in rooms. The Supplier instructs its '
            'staff not to read, copy or remove any documents, and reports any breach to the Client '
            'on the same day.', align='justify')
    page_break(d)
    d.add_heading('8 Signatures', 1)
    para(d, 'Signed in two copies, one for each party.', align='justify')
    t = d.add_table(rows=4, cols=2)
    t.autofit = False
    for gc in t._tbl.tblGrid.findall(qn('w:gridCol')):
        gc.set(qn('w:w'), str(int(8.0 * 567)))
    labels = [('For the Supplier', 'For the Client'),
              None,
              ('Name: Dana Whitfield, operations director', 'Name: Dr Imke Sørensen, practice manager'),
              ('Date: 29 October 2026', 'Date: 30 October 2026')]
    for i, row in enumerate(t.rows):
        for j, c in enumerate(row.cells):
            c.width = Cm(8.0)
            pp = c.paragraphs[0]
            pp.paragraph_format.space_after = Pt(2)
            if labels[i] is not None:
                r = pp.add_run(labels[i][j])
                r.bold = (i == 0)
    sig = t.rows[1]
    sig.height = Cm(2.9)
    sig.height_rule = WD_ROW_HEIGHT_RULE.EXACTLY
    # one image per party: signature with the company stamp over its end, as
    # inserted by e-signing tools; the Client's cell stays empty until it signs
    sig.cells[0].paragraphs[0].add_run().add_picture(
        os.path.join(img_dir, 'sigstamp-supplier.png'), width=Cm(6.0))
    if after:
        sig.cells[1].paragraphs[0].add_run().add_picture(
            os.path.join(img_dir, 'sigstamp-client.png'), width=Cm(6.0))
    d.add_paragraph()
    para(d, 'Schedules: 1 Service specification · 2 Site access rules (scanned copy, signed by '
            'the Client) · 3 Prices', italic=True)
    d.add_heading('Schedule 1 — Service specification', 1)
    table(d, ['Area', 'Task', 'Frequency'],
          [['Waiting room and reception', 'Vacuum floors, wipe seats and counters', 'daily'],
           ['Consulting rooms (6)', 'Empty bins, wipe surfaces, mop floors', 'daily'],
           ['Toilets (3)', 'Clean and disinfect, refill consumables', 'daily'],
           ['Staff kitchen', 'Clean surfaces and sink, empty fridge on Fridays', 'daily'],
           ['Corridors and stairs', 'Vacuum and mop', 'twice a week'],
           ['All windows', 'Clean inside and outside', 'every eight weeks']],
          [5.2, 7.6, 3.2], size=9.5)
    page_break(d)
    d.add_heading('Schedule 3 — Prices', 1)
    fee = '3,640.00' if after else '3,480.00'
    table(d, ['Item', 'Price (EUR)'],
          [['Regular cleaning, monthly price', fee],
           ['Window cleaning, per visit', '420.00'],
           ['Additional cleaning hour, on request', '34.50'],
           ['Deep clean after building works, per room', '95.00']],
          [11.0, 4.0], size=10.5, align_right=(1,))
    para(d, 'Prices exclude VAT. Additional work is ordered in writing by the Client and invoiced '
            'with the next monthly invoice.', align='justify')
    d.save(path)


# --------------------------------------------------------------- images (PNG)

def _ink_path(draw, pts, fill, width):
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        draw.line([(x0, y0), (x1, y1)], fill=fill, width=width)
        r = width / 2
        draw.ellipse([x1 - r, y1 - r, x1 + r, y1 + r], fill=fill)


def signature(path, seed, ink=(20, 40, 120, 255)):
    """A synthetic handwritten-looking signature stroke (not a real person's)."""
    rnd = random.Random(seed)
    W, H = 840, 300
    img = Image.new('RGBA', (W, H), (255, 255, 255, 0))
    dr = ImageDraw.Draw(img)
    # a chain of loops with random size and slant, then a flourish
    pts = []
    x, base = 50.0, 175.0
    loops = rnd.randint(5, 8)
    for k in range(loops):
        h = rnd.uniform(45, 110)
        w = rnd.uniform(40, 90)
        slant = rnd.uniform(0.2, 0.6)
        for i in range(40):
            a = i / 39 * 2 * math.pi
            px = x + w * (i / 39) + slant * h * math.sin(a) * 0.6
            py = base - h * (0.5 - 0.5 * math.cos(a)) + rnd.uniform(-1.5, 1.5)
            pts.append((px, py))
        x += w
        base += rnd.uniform(-12, 12)
    _ink_path(dr, pts, ink, 7)
    fl0 = rnd.uniform(80, 160)
    fl = [(fl0 + i * 5.5, 240 + 18 * math.sin(i / 119 * math.pi * rnd.choice([1, 2]))) for i in range(120)]
    _ink_path(dr, fl, ink, 5)
    img.save(path)


def stamp(path, lines, color, round_=False, angle=-8):
    W, H = 520, 520
    img = Image.new('RGBA', (W, H), (255, 255, 255, 0))
    dr = ImageDraw.Draw(img)
    font_b = ImageFont.truetype(f'{FONT_DIR}/dejavu/DejaVuSans-Bold.ttf', 44)
    font_s = ImageFont.truetype(f'{FONT_DIR}/dejavu/DejaVuSans.ttf', 34)
    if round_:
        dr.ellipse([20, 20, W - 20, H - 20], outline=color, width=14)
        dr.ellipse([60, 60, W - 60, H - 60], outline=color, width=5)
    else:
        dr.rounded_rectangle([20, 110, W - 20, H - 110], radius=24, outline=color, width=14)
        dr.rounded_rectangle([46, 136, W - 46, H - 136], radius=14, outline=color, width=4)
    y = H / 2 - (len(lines) - 1) * 30
    for i, ln in enumerate(lines):
        f = font_b if i == 0 else font_s
        w = dr.textlength(ln, font=f)
        dr.text(((W - w) / 2, y - 24), ln, font=f, fill=color)
        y += 60
    img = img.rotate(angle, resample=Image.BICUBIC, expand=False)
    img.save(path)


def sig_with_stamp(sig_path, stamp_path, out):
    sig = Image.open(sig_path)
    st = Image.open(stamp_path)
    W, H = 1400, 600
    img = Image.new('RGBA', (W, H), (255, 255, 255, 0))
    img.alpha_composite(sig, (0, 200))
    img.alpha_composite(st, (760, 40))
    img.save(out)


def images(img_dir):
    os.makedirs(img_dir, exist_ok=True)
    j = lambda f: os.path.join(img_dir, f)
    signature(j('sig-supplier.png'), seed=4)
    signature(j('sig-client.png'), seed=11, ink=(15, 15, 35, 255))
    stamp(j('stamp-supplier.png'), ['LOWMOOR', 'FACILITY SERVICES', 'synthetic'], (40, 70, 160, 230),
          round_=False, angle=6)
    stamp(j('stamp-client.png'), ['TALLIS BROOK', 'CLINIC', 'synthetic'], (185, 30, 40, 230),
          round_=True, angle=-10)
    sig_with_stamp(j('sig-supplier.png'), j('stamp-supplier.png'), j('sigstamp-supplier.png'))
    sig_with_stamp(j('sig-client.png'), j('stamp-client.png'), j('sigstamp-client.png'))


def main(work):
    os.makedirs(work, exist_ok=True)
    img = os.path.join(work, 'img')
    images(img)
    tender_technical(os.path.join(work, 'c1-technical.docx'))
    tender_maintenance(os.path.join(work, 'c1-maintenance.docx'))
    tender_night_works(os.path.join(work, 'c1-nightworks.docx'))
    inspection_report(os.path.join(work, 'c2-report-before.docx'), '11.2')
    inspection_report(os.path.join(work, 'c2-report-after.docx'), '12.6')
    defect_register(os.path.join(work, 'c2-register.xlsx'))
    support_agreement(os.path.join(work, 'c4-agreement-before.docx'), 30)
    support_agreement(os.path.join(work, 'c4-agreement-after.docx'), 45)
    cleaning_agreement(os.path.join(work, 'c6-agreement-before.docx'), img, after=False)
    cleaning_agreement(os.path.join(work, 'c6-agreement-after.docx'), img, after=True)


if __name__ == '__main__':
    main(sys.argv[1])

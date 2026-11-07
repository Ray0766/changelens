"""Builds the Typst source of the long case (holdout5-h-annual-technical-report).

The text is synthetic and generated deterministically from a fixed seed, so the
source is identical on every run. Paragraphs that carry an edit are written by
hand below; the filler paragraphs around them come from per-chapter sentence
banks with slot values (sites, figures) drawn from a seeded RNG.
"""
import random

SITES = ["Ashby Weir", "Coldharbour", "Fenwick Moor", "Gallow Hill", "Hartsfield", "Kestrel Mere",
         "Longridge", "Marlpit", "Netherby", "Oakhanger", "Pellow Down", "Quarry Lane", "Ravensgill",
         "Saltcote", "Thornby", "Upwell", "Wexcombe", "Yarrowby"]
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
          "October", "November", "December"]
ZONES = ["North Vale", "Riverside", "Upland", "Coastal", "Central", "Eastgate", "Westmoor"]

GENERAL = [
    "Results for {site} were in line with the previous year, with no change in the operating regime after {month}.",
    "The figures for {site} include an estimate for {month}, when the meter at the outlet was out of service for {n1} days.",
    "A review of the data for {site} found no evidence of drift in the {n2} instruments used for the returns.",
    "Operational staff at {site} reported that the procedures revised in {month} were easy to apply on night shifts.",
    "At {site} the change compared with the previous year, {val} per cent, is within the uncertainty of the measurement.",
    "Detail for {site} and the other sites in the {zone} zone is held in the operational database.",
    "The values reported for {site2} are provisional for {month} and will be confirmed in the first quarterly return.",
    "Seasonal variation at {site} was more pronounced than usual because of the dry spell in late {month}.",
    "{site} and {site2} together account for {pct} per cent of the total for the network.",
    "The trend at {site2} reversed in {month} after the works described in the previous section.",
    "No adjustment has been made for the transfer of the {zone} zone boundary, which affects fewer than {n2} properties.",
    "The planning assumption for {site} is unchanged at {val} per cent above the long-term average.",
    "Data from {site} for the first {n1} days of {month} were rejected by the validation rules and infilled.",
    "The control room logged {n2} alarms from {site} in {month}, most of them cleared without a site visit.",
    "A contractor carried out the work at {site2} under the framework agreement, finishing {n1} days ahead of plan.",
    "The method used for {site} differs from that used for {site2}, so the two values are not directly comparable.",
    "Staff from the {zone} depot supported the work at {site} during the busy period in {month}.",
    "The budget for this activity at {site} was underspent by {pct} per cent because of delays in procurement.",
    "An independent check of the {zone} zone returns in {month} found {n1} minor transcription errors, now corrected.",
    "The site visit to {site} in {month} confirmed that the readings match the local display.",
    "Spare parts for the equipment at {site2} are now held at the {zone} depot to shorten repair times.",
    "The risk assessment for {site} was reviewed in {month} and the control measures were found to be adequate.",
    "{n2} work orders were raised for {site} during the year, compared with {n3} across the network.",
    "Training on the new procedure was given to {n1} operators from {site} and {site2}.",
    "Performance at {site} was affected for {n1} days by a power failure on the distribution network in {month}.",
    "The standby generator at {site} was tested monthly and ran for {val} hours during the year.",
    "Following a near miss at {site2} in {month}, the access arrangements were changed.",
    "The long-term trend at {site} shows a gradual improvement of about {val} per cent a year.",
    "The value for {site} is the highest in the {zone} zone, reflecting the size of the area it serves.",
    "Results for {site2} have been restated for {month} after a meter calibration error was found.",
    "A study of options for {site} is planned, with a report due to the operating board in {month}.",
    "The local authority was informed of the work at {site} in advance, and no objections were received.",
    "Night work at {site} was limited to {n1} shifts to reduce noise for neighbouring residents.",
    "Samples from {site2} were analysed by the accredited laboratory within {n1} hours of collection.",
    "The asset register entry for {site} was updated in {month} to reflect the equipment now installed.",
    "Two inspections at {site} found no defects, and the next inspection is scheduled for {month}.",
    "Demand from the {zone} zone was {val} per cent higher in {month} than in the same month a year earlier.",
    "Remote access to the controls at {site2} was enabled in {month} after the security review.",
    "The supplier of the equipment at {site} confirmed that support will continue for at least {n1} years.",
    "Improvements at {site} are expected to save about {n3} pounds a year in operating costs.",
]
ACTIONS = [
    "complete the review of operating procedures at {site} by the end of {month};",
    "extend the monitoring programme to {n1} further sites in the {zone} zone;",
    "replace the obsolete controller at {site2} under the asset programme;",
    "report progress on the actions to the operating board every quarter;",
    "agree the revised targets for {site} with the regulator before {month};",
    "train {n1} additional operators in the procedures introduced at {site};",
    "carry out a condition survey of the equipment at {site2} in {month};",
    "publish a summary of the results for the {zone} zone on the website;",
    "close the {n2} outstanding work orders recorded for the {zone} zone;",
    "review the spare parts held at the {zone} depot for {site} and {site2};",
]

CHAPTERS = [
    ("Raw Water Resources", [
        ("Rainfall and inflows", [
            "Rainfall over the catchments totalled {n3} mm, which is {pct} per cent of the long-term average.",
            "Inflows to the impounding reservoirs at {site} peaked in {month} after a period of prolonged frontal rain.",
            "The upland gauges recorded the wettest {month} since the current network of gauges was installed.",
            "Snowmelt contributed little to inflows this year, as lying snow was recorded on only {n1} days.",
            "The catchment model was recalibrated against the flows recorded at {site2} weir during the spring.",
        ]),
        ("Reservoir storage", [
            "Combined storage fell to a minimum of {pct} per cent of capacity in {month} before recovering in the autumn.",
            "Storage at {site} remained above the drought trigger curve throughout the year.",
            "Compensation releases from {site2} were maintained at the licensed rate of {val} megalitres per day.",
            "The drawdown at {site} was slower than forecast because demand in the {zone} zone stayed low.",
        ]),
        ("Abstraction licences", [
            "Total abstraction was {pct} per cent of the combined annual licensed quantity.",
            "The daily licence limit at {site} was approached on {n1} days during the hot spell in {month}.",
            "A licence variation for {site2} was granted in {month}, with a reduced peak daily quantity.",
            "Abstraction returns were submitted to the environmental regulator on time for every source.",
        ]),
        ("Groundwater", [
            "Groundwater levels in the chalk boreholes at {site} were close to normal for the time of year.",
            "The observation borehole at {site2} showed a seasonal range of {val} metres, slightly below average.",
            "Nitrate concentrations in the borehole sources remained stable, and blending continued at {site}.",
            "Two boreholes at {site2} were rehabilitated by jetting and pumping tests were repeated in {month}.",
        ]),
    ]),
    ("Treatment Works Performance", [
        ("Throughput", [
            "The treatment works supplied an average of {n3} megalitres per day, with a peak week in {month}.",
            "{site} treated {pct} per cent of the total volume and remained the largest works in the network.",
            "Throughput at {site2} was reduced for {n1} days while the clarifier drive was replaced.",
            "Night-time throughput was lowered at {site} to make better use of the off-peak electricity tariff.",
        ]),
        ("Chemical dosing", [
            "Coagulant consumption averaged {val} milligrams per litre, a small reduction on the previous year.",
            "The new dosing control loop at {site} reduced the variation in residual coagulant in the treated water.",
            "Phosphate dosing for plumbosolvency control continued at all works serving the {zone} zone.",
            "A short interruption to the chlorine supply at {site2} in {month} was covered by the standby system.",
        ]),
        ("Filter performance", [
            "Rapid gravity filters were backwashed on average every {n1} hours, in line with the design interval.",
            "Media top-up was carried out on {n2} filters at {site} after the annual bed depth survey.",
            "Filtered water turbidity at {site2} exceeded the internal alert level on {n1} occasions in {month}.",
            "The filter run times at {site} improved after the inlet weir was raised to even out the flow split.",
        ]),
        ("Sludge handling", [
            "Sludge production amounted to {n3} tonnes of dry solids, most of which was recycled to agricultural land.",
            "The thickener at {site} was emptied and inspected in {month}, and no structural defects were found.",
            "Sludge cake at {site2} was stored on site for {n1} days during the wet weather before removal.",
        ]),
    ]),
    ("Distribution Network", [
        ("Mains and service reservoirs", [
            "The network comprises {n3} kilometres of mains and {n2} service reservoirs and water towers.",
            "{n1} kilometres of cast iron main were replaced in the {zone} zone during the year.",
            "The service reservoir at {site} was taken out of service in {month} for cleaning and inspection.",
            "Average residence time in the service reservoirs fell after the inlet controls at {site2} were adjusted.",
        ]),
        ("Pressure management", [
            "Pressure reducing valves were optimised in {n2} district metered areas in the {zone} zone.",
            "Average zone night pressure fell by {val} metres head, with no increase in low-pressure contacts.",
            "Two pressure reducing valves at {site} were fitted with flow modulation controllers in {month}.",
            "Pressure logging at {site2} showed transients after pump starts, and the start ramp was lengthened.",
        ]),
        ("Bursts and repairs", [
            "There were {n3} mains bursts, of which {pct} per cent occurred on cast iron mains.",
            "The burst rate peaked in {month}, when a cold snap followed a period of mild weather.",
            "Average repair time for reported bursts was {val} hours from notification to completion.",
            "A trunk main burst at {site} in {month} was isolated within two hours by rezoning supplies.",
        ]),
        ("Valve maintenance", [
            "{n3} valves were exercised under the planned programme, compared with a target of {n2}.",
            "Inoperable valves found during the programme were recorded and {pct} per cent were repaired by year end.",
            "Hydrant inspections in the {zone} zone were completed in {month} together with the fire service.",
        ]),
    ]),
    ("Leakage and Non-Revenue Water", [
        ("Method", [
            "Leakage is calculated from the minimum night flows in district metered areas, adjusted for legitimate night use.",
            "Night use allowances were updated in {month} using the results of the household consumption monitor.",
            "The water balance closes within {val} per cent, which is inside the tolerance set by the regulator.",
            "District metered area meters at {site} were verified in situ with an insertion probe.",
        ]),
        ("Results by zone", [
            "Leakage in the {zone} zone fell to {val} megalitres per day, the lowest value since metering began.",
            "The {zone} zone remains the main contributor to total leakage because of its older mains.",
            "Leakage per property in the {zone} zone is now below the network average for the first time.",
            "The rise in leakage at {site} in {month} was traced to a failed joint on a trunk main.",
        ]),
        ("Active leakage control", [
            "Detection teams surveyed {n3} kilometres of main and found {n2} leaks that had not been reported.",
            "Acoustic loggers were deployed permanently in {n2} district metered areas around {site}.",
            "Correlator surveys in {month} located several small leaks on communication pipes in the {zone} zone.",
            "Average time from detection to repair of non-visible leaks was {n1} days.",
        ]),
        ("Customer metering", [
            "Meter penetration among household customers reached {pct} per cent at the end of the year.",
            "{n3} meters were replaced at the end of their service life under the planned programme.",
            "Smart meter trials in the {zone} zone identified continuous flows at {n2} properties.",
        ]),
    ]),
    ("Energy Use and Carbon", [
        ("Pumping energy", [
            "Total electricity consumption was {n3} megawatt hours, most of it for raw water and booster pumping.",
            "The pump refurbishment at {site} restored the efficiency of the duty pump to near its design value.",
            "Energy use at {site2} rose in {month} because the gravity transfer was out of service.",
            "Variable speed drives were fitted to the booster pumps serving the {zone} zone.",
        ]),
        ("Renewable generation", [
            "The hydro turbine at {site} generated {n3} megawatt hours, slightly less than in the previous year.",
            "Solar panels on the roof of the {site2} works produced {pct} per cent of the site consumption.",
            "The turbine at {site} was out of service for {n1} days in {month} for bearing replacement.",
        ]),
        ("Energy intensity", [
            "The energy intensity of treated water supplied was {val} kilowatt hours per cubic metre.",
            "Intensity is highest at the borehole sources, where water is pumped from depth before treatment.",
            "The intensity at {site} fell after the transfer main to {site2} was brought back into service.",
        ]),
        ("Carbon accounting", [
            "Operational emissions were estimated at {n3} tonnes of carbon dioxide equivalent.",
            "Emission factors for purchased electricity follow the national reporting guidance for the year.",
            "Process emissions from sludge treatment at {site} were estimated from the volume of sludge produced.",
            "Fleet emissions fell by {pct} per cent after electric vans were introduced in the {zone} depot.",
        ]),
    ]),
    ("Asset Condition and Maintenance", [
        ("Inspection programme", [
            "{n3} asset inspections were completed, {pct} per cent of the planned number for the year.",
            "Inspections at {site} were rescheduled to {month} to avoid the period of peak demand.",
            "Condition grades are recorded on a five-point scale and stored in the asset register.",
        ]),
        ("Service reservoirs", [
            "The internal inspection of the service reservoir at {site} found minor spalling of the roof slab.",
            "Roof membranes were renewed at {n1} service reservoirs, including the two cells at {site2}.",
            "Access hatches at {site} were replaced with lockable covers fitted with intruder alarms.",
        ]),
        ("Pumps and motors", [
            "Vibration monitoring was extended to {n2} pumps, and alarms are now reported to the control room.",
            "The duty pump at {site} was rewound in {month} after an insulation fault was detected.",
            "Mean time between failures for booster pumps improved to {n3} hours.",
        ]),
        ("Maintenance backlog", [
            "The planned maintenance backlog was reduced to {n2} work orders by the end of the year.",
            "Most outstanding work orders relate to minor civil repairs at small booster stations.",
            "Reactive work fell to {pct} per cent of total maintenance hours, compared with the previous year.",
        ]),
    ]),
    ("Customer Service", [
        ("Customer contacts", [
            "The contact centre handled {n3} customer contacts, most of them about billing and meter readings.",
            "Contacts about water quality fell by {pct} per cent compared with the previous year.",
            "Calls peaked in {month} after the burst at {site} interrupted supplies to part of the {zone} zone.",
        ]),
        ("Supply interruptions", [
            "The average supply interruption per property was {val} minutes, below the internal target.",
            "{n2} properties experienced an unplanned interruption of more than three hours.",
            "Bottled water was distributed at {site} during the interruption in {month}.",
        ]),
        ("Complaints", [
            "Written complaints totalled {n2}, and {pct} per cent were resolved at the first response.",
            "The most common cause of complaint was the time taken to reinstate footpaths after repairs.",
            "No complaint was referred to the independent consumer body during the year.",
        ]),
    ]),
]

# Hand-written paragraphs that carry edits or are moved; all other text is generated.
EARLY_INSERT = [
    "Three changes affect the comparison of the figures in this edition with those published for earlier years. They are summarised here and referred to where they apply in the later chapters.",
    "From this edition, leakage and energy figures are reported for the financial year from April to March instead of the calendar year, so that they can be compared directly with the regulatory returns. Figures for earlier years in this report have been restated on the same basis, and the restated values differ from those published previously by less than two per cent.",
    "The boundary of the Riverside zone was also redrawn in October to include the new housing at the former brickworks site. Zone-level comparisons with earlier years therefore use the old boundary, while network totals include all properties supplied at the end of the year.",
    "Finally, energy intensity is now calculated on the volume of water put into supply rather than the volume abstracted. The new definition matches the industry benchmark and removes the effect of process losses at the treatment works, which varied between sites and from year to year.",
]

MOVED = "The telemetry upgrade at the outstations will continue with the replacement of the remaining radio links by fibre or cellular connections. The work is planned zone by zone, starting with the Upland zone, where radio coverage is poorest and data gaps are most frequent."

DELETED = "A separate condition survey of the Eastgate service reservoir roof was commissioned after water was seen pooling on the membrane. The survey found no breach of the waterproofing, but recommended that the drainage outlets be cleared twice a year and that the parapet joints be resealed within two years."


def esc(s):
    for ch in "#$*_<>@[]\\`~":
        s = s.replace(ch, "\\" + ch)
    return s


class Gen:
    def __init__(self, seed):
        self.r = random.Random(seed)

    def slots(self):
        r = self.r
        s1, s2 = r.sample(SITES, 2)
        return dict(site=s1, site2=s2, month=r.choice(MONTHS), zone=r.choice(ZONES),
                    n1=r.randint(2, 19), n2=r.randint(21, 240), n3=f"{r.randint(1100, 48000):,}",
                    pct=r.randint(11, 96), val=f"{r.uniform(0.2, 9.8):.1f}")

    def para(self, bank, k, ngen=None):
        r = self.r
        picks = r.sample(bank, min(k, len(bank)))
        extra = r.sample(GENERAL, ngen if ngen is not None else r.randint(1, 2))
        sents = picks + extra
        r.shuffle(sents)
        out = []
        for t in sents:
            out.append(t.format(**self.slots()))
        return " ".join(out)

    def table(self, caption, cols, lo, hi, dec, row_override=None):
        r = self.r
        rows = []
        for m in MONTHS:
            vals = [f"{r.uniform(lo, hi):.{dec}f}" for _ in cols]
            if row_override and m in row_override:
                vals = row_override[m](vals)
            rows.append((m, vals))
        return rows


def table_typst(caption, cols, rows, unit_note):
    cells = []
    for m, vals in rows:
        cells.append(f"[{m}], " + ", ".join(f"[{v}]" for v in vals))
    n = len(cols)
    header = ", ".join(f"[*{c}*]" for c in cols)
    return f"""
#figure(kind: table, supplement: none, numbering: none, caption: [{caption}], {{
  set text(size: 9pt)
  table(columns: (auto,) + ({n} * (1fr,)), align: (left,) + ({n} * (right,)), stroke: none, inset: (x: 5pt, y: 2.6pt),
    table.hline(stroke: 0.9pt),
    table.header([*Month*], {header}),
    table.hline(stroke: 0.45pt),
    {", ".join(cells)},
    table.hline(stroke: 0.9pt),
  )
}})
#text(size: 8.5pt)[{unit_note}]
"""


def build(path):
    g = Gen(20251)
    out = []
    out.append(r'''// Case holdout5-h-annual-technical-report: long English technical report (synthetic sample).
// Generated by longdoc.py; do not edit by hand.
#import "common.typ": *
#set document(title: "Annual Technical Report 2025 (synthetic sample)", author: "Synthetic sample")
#set page(paper: "a4", margin: (top: 2.8cm, bottom: 2.7cm, left: 3.0cm, right: 3.0cm),
  header: context [#set text(size: 8.5pt); Annual Technical Report 2025 #h(1fr) Regional Water Supply Network],
  footer: context [#set text(size: 8.5pt); Synthetic sample · report RWSN-ATR-2025 #h(1fr) Page #counter(page).display() of #counter(page).final().first()])
#set text(font: "Libertinus Serif", size: 11pt, lang: "en", region: "GB")
#set par(justify: true, leading: 0.64em, spacing: 0.9em)
#set heading(numbering: "1.1")
#show heading.where(level: 1): it => block(above: 1.8em, below: 0.9em)[#text(size: 14pt, weight: "bold")[#it]]
#show heading.where(level: 2): it => block(above: 1.1em, below: 0.55em)[#text(size: 11pt, weight: "bold")[#it]]
#set footnote.entry(separator: line(length: 30%, stroke: 0.5pt))
#let bold-if-after(x) = if AFTER { strong(x) } else { x }
#show figure: set block(breakable: true)

#align(center)[
  #v(0.6cm)
  #text(size: 20pt, weight: "bold")[Annual Technical Report 2025]
  #v(0.2em)
  #text(size: 13pt)[Regional Water Supply Network]
  #v(0.2em)
  #text(size: 10pt)[Report RWSN-ATR-2025 · prepared by the Network Performance Group · synthetic sample]
]
#v(0.8cm)
''')

    # Chapter 1: Introduction (hand-written, with the early insertion)
    out.append("= Introduction\n")
    out.append("== Purpose of this report\n")
    out.append(esc("This report describes the technical performance of the regional water supply network in 2025. It covers raw water resources, treatment, distribution, leakage, energy use, asset condition, customer service, water quality, monitoring, health and safety, and the investment programme for the coming years. It is written for the operating board, the regulator and the customer panel, and it supports the annual performance return.") + "\n")
    out.append(esc("The figures in this report are taken from the operational database at the end of January. Where a figure is provisional, this is stated in the text. Values are rounded for presentation, so totals in tables may differ slightly from the sum of their parts.") + "\n")
    out.append("== The network at a glance\n")
    out.append(esc("The network supplies drinking water to about 412,000 properties through four surface water treatment works, nine groundwater sources, 61 service reservoirs and roughly 6,900 kilometres of mains. Average demand in 2025 was 118 megalitres per day, with a peak week demand of 141 megalitres per day in July. The network is divided into seven supply zones, each with its own control strategy and a set of district metered areas.") + "\n")
    out.append(esc("The largest sources are the impounding reservoirs in the upland catchments, which provide about two thirds of the water supplied. The groundwater sources supply the coastal and eastern zones, and are blended with surface water where nitrate levels require it. Bulk transfers between zones are possible through three strategic mains, which were used for planned outages and during the summer peak.") + "\n")
    out.append("#if AFTER [\n== Changes to the reporting basis\n\n" + "\n\n".join(esc(p) for p in EARLY_INSERT) + "\n]\n")
    out.append("== Structure of the report\n")
    out.append(esc("Chapters 2 to 8 describe the operation of the network from source to tap. Chapter 9 reports on drinking water quality compliance, and chapter 10 on monitoring and telemetry. Chapter 11 covers health, safety and the environment, and chapter 12 sets out the outlook and the investment programme. Each chapter starts with a short summary and ends with the main actions for the coming year.") + "\n")

    # Chapters 2-8: generated
    for ci, (title, sections) in enumerate(CHAPTERS, start=2):
        out.append(f"= {title}\n")
        allb = sum((b for _, b in sections), [])
        out.append(esc(g.para(allb, 3)) + "\n")
        out.append(esc(g.para(GENERAL, 4)) + "\n")
        for si, (stitle, bank) in enumerate(sections):
            out.append(f"== {stitle}\n")
            for _ in range(g.r.randint(4, 5)):
                out.append(esc(g.para(bank, g.r.randint(2, 3), 3)) + "\n")
            if si == 1:
                cols = g.r.sample(SITES, 4)
                rows = g.table("", cols, 1.0, 60.0, 1)
                out.append(table_typst(f"Table {ci}.1 – Monthly values for {title.lower()}, selected sites", cols, rows,
                                       "Values are monthly averages from the operational database; provisional values are included for December."))
            if si == 3:
                cols = g.r.sample(SITES, 5)
                rows = g.table("", cols, 10.0, 99.0, 1)
                out.append(table_typst(f"Table {ci}.2 – Monthly indicators for {stitle.lower()}, further sites", cols, rows,
                                       "Indicator values as reported in the monthly performance pack."))
            if si == 2 and ci in (3, 5, 7):
                out.append(esc(g.para(GENERAL, 2)) + "#footnote[" + esc(g.para(GENERAL, 1)) + "]\n")
        out.append(f"== Actions for the coming year\n")
        out.append(esc(f"The main actions for {title.lower()} in the coming year are to:") + "\n")
        for a in g.r.sample(ACTIONS, 4):
            out.append("- " + esc(a.format(**g.slots())))
        out.append("\n" + esc(g.para(GENERAL, 3)) + "\n")

    # Chapter 9: Water quality compliance (edit L2 in the turbidity table)
    out.append("= Water Quality Compliance\n")
    out.append(esc("Drinking water quality is monitored at treatment works, service reservoirs and customer taps according to the sampling plan agreed with the drinking water regulator. This chapter summarises the results for 2025 and describes the events that required investigation.") + "\n")
    out.append("== Sampling programme\n")
    out.append(esc("A total of 31,840 samples were taken and analysed for microbiological and chemical parameters. Sampling at customer taps follows a random daytime method, and the addresses are drawn each month by the laboratory information system. Samples at treatment works and service reservoirs are taken at fixed points that are checked for representativeness every year.") + "\n")
    out.append(esc(g.para(GENERAL, 3)) + "\n")
    out.append("== Turbidity at the treatment works\n")
    out.append(esc("Turbidity of the final water is a key indicator of the performance of the treatment process. Table 9.1 gives the monthly mean turbidity in nephelometric turbidity units for the four surface water works. All monthly means are well below the standard of 1 NTU at the works outlet.") + "\n")
    tcols = ["Ashby Weir", "Kestrel Mere", "Longridge", "Ravensgill"]
    trows = g.table("", tcols, 0.12, 0.39, 2)
    trows[9] = ("October", ["0.38", "#ed[0.42][0.48]", "0.29", "0.31"])
    out.append(table_typst("Table 9.1 – Monthly mean turbidity of final water (NTU)", tcols, trows,
                           "Mean of continuous online measurements, validated against daily laboratory samples."))
    out.append(esc("The higher value at Kestrel Mere in October followed a period of algal growth in the raw water reservoir, which was controlled by adjusting the draw-off level and the coagulant dose. Turbidity returned to its usual range within three weeks.") + "\n")
    out.append("== Compliance results\n")
    for _ in range(5):
        out.append(esc(g.para(GENERAL, 4)) + "\n")
    out.append(esc("Overall compliance with the chemical and microbiological standards at customer taps was 99.96 per cent. Of the 14 failures, nine were at single properties and were traced to domestic plumbing, and the remaining five were cleared on resampling.") + "\n")
    out.append("== Events and investigations\n")
    for _ in range(5):
        out.append(esc(g.para(GENERAL, 4)) + "\n")

    # Chapter 10: Monitoring and telemetry (L3 formula, L4 replace, L6 move source)
    out.append("= Monitoring and Telemetry\n")
    out.append(esc("The network is monitored by about 2,300 instruments connected to the central control system through outstations at sites and in the distribution network. This chapter describes the availability of the telemetry, the calibration programme and the main improvements made in 2025.") + "\n")
    out.append("== Telemetry availability\n")
    out.append(esc("Telemetry availability, defined as the share of expected readings received by the control system, was 98.7 per cent across the year. Most data gaps were caused by radio links at remote outstations, which are affected by heavy rain and by vegetation growth along the radio path.") + "\n")
    out.append("#del[" + esc(MOVED) + "]\n")
    for _ in range(4):
        out.append(esc(g.para(GENERAL, 4)) + "\n")
    out.append("== Calibration of online instruments\n")
    out.append(esc("Online chlorine, turbidity and pH monitors at the treatment works are verified weekly against laboratory measurements and recalibrated when the difference exceeds the tolerance in the instrument procedure. Conductivity probes in the distribution network are") + " #ed[sampled quarterly][sampled monthly] " + esc("at the reference points and replaced when the deviation cannot be corrected.") + "\n")
    out.append(esc("Conductivity readings are corrected to a reference temperature of 25 °C. The correction uses a linear temperature coefficient,") + "\n$ kappa_25 = kappa_T / (1 + alpha (T - 25)) , $\n" + esc("where the coefficient for the network water was determined from laboratory tests as") + " $alpha = #ed[$-0.35$][$-0.53$]$ " + esc("per cent per kelvin relative to the uncorrected reading. The sign convention follows the instrument manufacturer and is applied by the control system before the data are stored.") + "\n")
    for _ in range(4):
        out.append(esc(g.para(GENERAL, 4)) + "\n")
    out.append("== Network sensors\n")
    for _ in range(5):
        out.append(esc(g.para(GENERAL, 4)) + "\n")
    cols = ["North Vale", "Riverside", "Upland", "Coastal"]
    rows = g.table("", cols, 91.0, 99.9, 1)
    out.append(table_typst("Table 10.1 – Monthly telemetry availability by zone (per cent)", cols, rows,
                           "Share of expected readings received by the control system."))
    for _ in range(4):
        out.append(esc(g.para(GENERAL, 4)) + "\n")

    # Chapter 11: Health, safety and environment (L5 delete, L7 footnote)
    out.append("= Health, Safety and Environment\n")
    out.append(esc("The health and safety of staff, contractors and the public, and the protection of the environment, are reported to the operating board every month. This chapter gives the results for the year and the main lessons learned.") + "\n")
    out.append("== Safety performance\n")
    out.append(esc("There were three reportable injuries during the year, all to contractor staff, and none resulted in absence of more than two weeks. The lost time injury rate fell to 0.21 per 100,000 hours worked.") + "#footnote[" + esc("The injury rate is calculated on hours recorded in the time sheet system and") + " #ed[verified by the external auditor][verified by the internal audit team] " + esc("before publication.") + "]\n")
    for _ in range(5):
        out.append(esc(g.para(GENERAL, 4)) + "\n")
    out.append("== Environmental compliance\n")
    for _ in range(4):
        out.append(esc(g.para(GENERAL, 4)) + "\n")
    out.append("== Structural safety of reservoirs\n")
    out.append(esc("All service reservoirs and impounding reservoirs were inspected by the supervising engineer as required. No measures in the interests of safety were recommended for the impounding reservoirs, and the statutory reports were filed on time.") + "\n")
    out.append("#del[" + esc(DELETED) + "]\n")
    for _ in range(5):
        out.append(esc(g.para(GENERAL, 4)) + "\n")

    # Chapter 12: Outlook and investment (L6 move target, L8 format, L9 summary table)
    out.append("= Outlook and Investment Programme\n")
    out.append(esc("The investment programme for the next five years focuses on mains renewal, leakage reduction, resilience of supplies to the coastal zone, and the replacement of ageing telemetry. This chapter summarises the programme and the targets for the coming year.") + "\n")
    out.append("== Investment programme\n")
    out.append(esc("The programme for the coming year includes the renewal of 48 kilometres of mains, a second transfer main to the coastal zone, and the refurbishment of the filters at two treatment works.") + " #bold-if-after[" + esc("Capital expenditure remains subject to board approval") + "] " + esc("of the detailed business cases, which are expected in the spring.") + "\n")
    out.append("#ins[" + esc(MOVED) + "]\n")
    for _ in range(4):
        out.append(esc(g.para(GENERAL, 4)) + "\n")
    out.append("== Targets for the coming year\n")
    out.append(esc("Table 12.1 summarises the main performance indicators for 2025 and the targets for the coming year. Negative changes indicate an improvement for leakage and interruptions.") + "\n")
    out.append(r'''
#figure(kind: table, supplement: none, numbering: none, caption: [Table 12.1 – Summary of performance indicators], {
  set text(size: 9pt)
  table(columns: (1fr, auto, auto, auto), align: (left, right, right, right), stroke: none, inset: (x: 5pt, y: 3pt),
    table.hline(stroke: 0.9pt),
    table.header([*Indicator*], [*2025*], [*Target*], [*Change (%)*]),
    table.hline(stroke: 0.45pt),
    [Leakage (megalitres per day)], [21.4], [20.8], [#ed[−1.8][−2.6]],
    [Mains bursts per 1,000 km], [118], [112], [−5.1],
    [Supply interruptions (minutes per property)], [6.2], [5.5], [−11.3],
    [Water quality compliance (per cent)], [99.96], [99.97], [+0.01],
    [Energy intensity (kWh per cubic metre)], [0.47], [0.46], [−2.1],
    table.hline(stroke: 0.9pt),
  )
})
''')
    for _ in range(4):
        out.append(esc(g.para(GENERAL, 4)) + "\n")
    out.append("== Risks\n")
    out.append(esc("The main risks to delivery are the availability of specialist contractors for trunk main work, the lead time for electrical equipment, and the weather in the summer peak. Each risk has an owner and a mitigation plan, which are reviewed by the programme board every quarter.") + "\n")

    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(out))


if __name__ == "__main__":
    import sys
    build(sys.argv[1])

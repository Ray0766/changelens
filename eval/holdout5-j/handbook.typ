// Holdout round 5, author j — case "handbook-pages", base document (before.pdf).
// Synthetic sample: fictitious organisation, places, phone numbers and rates.
#set document(title: "Field Service Handbook (synthetic sample)")
#set page(
  paper: "a4",
  margin: (x: 24mm, top: 26mm, bottom: 24mm),
  header: text(8.5pt, fill: luma(90))[Field Service Handbook, edition 2026/2 #h(1fr) Northbridge water network crews],
  footer: context text(8.5pt, fill: luma(90))[Synthetic sample: fictitious organisation and data #h(1fr) Page #counter(page).display() of #counter(page).final().first()],
)
#set text(font: "Carlito", size: 11pt, lang: "en", hyphenate: false)
#set par(justify: false, leading: 0.6em, spacing: 1.0em)
#show heading.where(level: 1): set text(size: 17pt)
#show heading.where(level: 2): set text(size: 13pt)
#show heading: set block(above: 1.2em, below: 0.8em)

= Field Service Handbook

#text(12pt)[Edition 2026/2 for maintenance crews of the Northbridge water network.]

== 1 Scope and how to use this handbook

This handbook applies to every employee and contractor who works on the distribution network, at pumping stations or at reservoirs operated by the network maintenance department.

Each section covers one topic and starts on a new page, so that a section can be printed and carried in a vehicle on its own. Where a procedure in this handbook differs from a site instruction, the site instruction applies and the difference must be reported to the duty supervisor.

The handbook is reviewed twice a year. Proposed changes are collected by the health and safety coordinator and agreed at the crew leaders' meeting in March and September.

=== Contents

- 2 Personal protective equipment
- 3 Travel and allowances
- 4 Legacy paper forms
- 5 Confined space entry
- 6 Hydrant flushing schedule
- Appendix A Emergency contacts

#pagebreak()

== 2 Personal protective equipment

Crews must wear the equipment listed below whenever they are on site, including during short visits to a valve chamber or a meter pit.

- High-visibility jacket or vest, class 2 or above
- Safety boots with steel toe caps and midsole protection
- Hard hat when working near open excavations or overhead loads
- Gloves suitable for the task: chemical gloves for chlorination work
- Hearing protection at pumping stations and when using breakers
- Full-body harness and lanyard for any work at height above two metres

Inspect harnesses and lanyards before each use. Withdraw any harness with cut, burnt or stretched webbing and report it to the stores team the same day.

Replacement equipment is issued by the depot stores on presentation of the damaged item. Lost items are replaced once per year without charge.

#pagebreak()

== 3 Travel and allowances

Crews who work away from their home depot for a full day receive a daily allowance for meals and incidental costs. A full day means at least ten hours away from the depot, including travel.

Where a pool vehicle is not available and a private car is used with the supervisor's approval, mileage is reimbursed for the shortest practical route.

#table(
  columns: (1.7fr, 1fr),
  stroke: 0.5pt + luma(140),
  inset: 5pt,
  table.header([*Allowance*], [*Rate (EUR)*]),
  [Daily allowance, full day away from the depot], [48.00 per day],
  [Private car, with the supervisor's approval], [0.32 per kilometre],
  [Overnight stay, booked through the travel desk], [up to 95.00 per night],
)

Overnight stays must be booked through the travel desk. The travel desk books rooms within the agreed hotel rate; higher rates need the written approval of the area manager.

Claims are submitted in the expenses app within thirty days of the trip, with receipts for every item except the daily allowance.

#pagebreak()

== 4 Legacy paper forms

Until the tablet roll-out is complete, the following paper forms remain valid at depots that have not yet switched to the field app.

- Form WN-12, daily vehicle check sheet
- Form WN-17, permit to dig, with the utility plans attached
- Form WN-21, chlorination record for new mains
- Form WN-30, customer contact card

Completed paper forms are scanned at the depot within two working days and the originals are kept for six months. From 1 January 2027 these forms will no longer be accepted.

#pagebreak()

== 5 Confined space entry

A valve chamber, meter pit, wet well or tank is treated as a confined space. Nobody enters a confined space alone or without a valid entry permit.

+ Check the permit and the rescue plan with the supervisor before leaving the depot.
+ Set up the tripod and winch over the entry point before opening the cover fully.
+ Test the atmosphere at three levels for oxygen, flammable gas, hydrogen sulphide and carbon monoxide.
+ Ventilate the space for at least ten minutes and test again before entry.
+ Keep a top person at the entry point for the whole time that anyone is inside.
+ Leave the space immediately if the gas monitor alarms, and do not re-enter until the cause is known.

Gas monitors are bump-tested at the start of every shift. A monitor that fails the bump test is returned to stores and must not be used.

#pagebreak()

== 6 Hydrant flushing schedule

Hydrants are flushed once a year to remove sediment and to check that each hydrant opens, closes and drains correctly. Flushing is done at night in residential streets.

#table(
  columns: (1fr, 1fr, 1fr, 1fr),
  stroke: 0.5pt + luma(140),
  inset: 5pt,
  table.header([*District*], [*Hydrants*], [*Month*], [*Crew*]),
  [Old Town], [146], [February], [North 1],
  [Harbour], [212], [March], [North 2],
  [Millfield], [98], [April], [North 1],
  [Eastmere], [175], [May], [East 1],
  [Riverside], [133], [September], [East 2],
  [Hillcrest], [87], [October], [East 1],
)

Customers in each district are notified by letter at least seven days before flushing starts.

#pagebreak()

== Appendix A Emergency contacts

Call these numbers in the order shown. If nobody answers within five minutes, call the next number.

#table(
  columns: (1.6fr, 1fr),
  stroke: 0.5pt + luma(140),
  inset: 5pt,
  table.header([*Who*], [*Number*]),
  [Network control room, 24 hours], [0100 555 0142],
  [Duty supervisor, north area], [0100 555 0178],
  [Duty supervisor, east area], [0100 555 0193],
  [Health and safety coordinator], [0100 555 0116],
  [Water quality laboratory], [0100 555 0127],
)

In a medical emergency, call the public emergency number first and then the network control room.

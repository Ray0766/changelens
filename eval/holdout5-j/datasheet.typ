// Holdout round 5, author j — case "datasheet-overlay", base document (before.pdf).
// Synthetic sample: fictitious product, values and document numbers.
#set document(title: "UFM-80 datasheet (synthetic sample)")
#set page(
  paper: "a4",
  margin: (x: 22mm, top: 26mm, bottom: 24mm),
  header: text(8pt, fill: luma(80))[UFM-80 clamp-on ultrasonic flow meter · Datasheet · Rev. B #h(1fr) Synthetic sample: fictitious product],
  footer: context text(8pt, fill: luma(80))[Specifications are typical values unless stated otherwise. #h(1fr) #counter(page).display() / #counter(page).final().first()],
)
#set text(font: "Inter", size: 9.5pt, lang: "en", hyphenate: true)
#set par(justify: true, leading: 0.62em, spacing: 1.0em)
#show heading.where(level: 1): set text(size: 18pt, weight: "bold")
#show heading.where(level: 2): set text(size: 11.5pt, weight: "bold")
#show heading: set block(above: 1.3em, below: 0.75em)

= UFM-80 clamp-on ultrasonic flow meter

Document no. DS-UFM80-004

The UFM-80 measures the flow of clean liquids in full pipes from the outside, with two transducers clamped onto the pipe wall. Installation needs no cutting, no shutdown and no pressure-rated fittings, which makes the instrument well suited to retrofitting in existing pumping stations, irrigation networks and building services. The transmitter calculates the volume flow from the difference in transit time between the upstream and the downstream ultrasonic pulse.

== 1 Specifications

#table(
  columns: (52mm, 1fr),
  stroke: 0.5pt + luma(150),
  inset: (x: 6pt, y: 4.6pt),
  fill: (x, y) => if calc.odd(y) { luma(246) },
  [Pipe sizes], [DN15 to DN300, steel, stainless steel, PVC and PE],
  [Flow velocity range], [0.03 to 12 m/s, bidirectional],
  [Accuracy], [±1.0 % of reading above 0.3 m/s],
  [Repeatability], [±0.2 % of reading],
  [Operating temperature], [−20 °C to +60 °C (transmitter)],
  [Liquid temperature], [0 °C to +90 °C],
  [Ingress protection], [IP67 transmitter, IP68 transducers],
  [Supply voltage], [24 V DC ±10 %, 3 W],
  [Outputs], [4–20 mA, pulse, Modbus RTU],
  [Display], [128 × 64 graphic LCD with backlight],
)

== 2 Response time

The response time depends on the pipe size, because larger pipes need longer averaging to suppress turbulence. The chart shows the typical time to reach 90 % of a step change.

#let bar(label, secs) = (
  align(right + horizon, text(8.5pt)[#label]),
  align(left + horizon, rect(width: secs * 36mm, height: 9pt, fill: rgb("#2f6f9f"), stroke: none)),
)
#block(inset: (left: 4mm, top: 4pt, bottom: 4pt))[
  #grid(
    columns: (16mm, 120mm),
    row-gutter: 6pt,
    column-gutter: 4pt,
    ..bar("DN25", 0.6),
    ..bar("DN50", 1.0),
    ..bar("DN100", 1.6),
    ..bar("DN200", 2.4),
    ..bar("DN300", 3.0),
    [], grid(columns: (36mm, 36mm, 36mm), text(7.5pt)[0 s], text(7.5pt)[1 s], text(7.5pt)[2 s #h(1fr) 3 s]),
  )
]

#pagebreak()

== 3 Electrical connection

The transmitter has spring terminals for the supply, the analogue output and the RS-485 bus. The current output is passive and needs an external loop supply of 12 to 30 V DC. Route the transducer cables separately from mains and motor cables#footnote[Use shielded twisted-pair cable and connect the shield at the transmitter end only.] and keep them as short as the installation allows.

The pulse output is an open collector rated for 30 V and 50 mA. It can be configured as a volume pulse or as an alarm output for low flow, reverse flow or signal loss.

== 4 Installation

- Choose a straight pipe run of at least ten diameters upstream and five downstream of the transducers.
- Avoid the top of horizontal pipes, where air collects, and the bottom, where sediment settles.
- Clean the pipe surface down to bare metal or plastic and apply the coupling gel evenly.
- Enter the pipe data in the transmitter and mount the transducers at the spacing it displays.

#v(36pt)

== 5 Ordering information

#table(
  columns: (34mm, 1fr),
  stroke: 0.5pt + luma(150),
  inset: (x: 6pt, y: 4.6pt),
  table.header([*Order code*], [*Description*]),
  [UFM80-T1], [Transmitter, wall mounting, 24 V DC],
  [UFM80-S15], [Transducer pair for DN15 to DN50],
  [UFM80-S50], [Transducer pair for DN50 to DN300],
  [UFM80-KIT], [Mounting rails, coupling gel and 10 m cable],
)

#v(18pt)
#text(8.5pt)[Prepared by: product documentation team · Checked by: application engineering]

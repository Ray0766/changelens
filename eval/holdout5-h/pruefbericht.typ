// Case holdout5-h-pruefbericht: German dimensional inspection report for a shaft (synthetic sample).
#import "common.typ": *

#set document(title: "Prüfbericht PB-2026-0147 (synthetisches Beispiel)", author: "Synthetic sample")
#set page(
  paper: "a4",
  margin: (top: 2.6cm, bottom: 2.6cm, left: 2.5cm, right: 2.5cm),
  header: context [
    #set text(size: 8.5pt)
    Prüfbericht Nr. PB-2026-0147 #h(1fr) Maßprüfung Antriebswelle AW-32
    #v(-0.5em)
    #line(length: 100%, stroke: 0.4pt)
  ],
  footer: context [
    #set text(size: 8.5pt)
    Synthetic sample – fiktive Prüfstelle und fiktive Messwerte
    #h(1fr) Seite #counter(page).display() von #counter(page).final().first()
  ],
)
#set text(font: "Libertinus Serif", size: 10.5pt, lang: "de", region: "DE")
#set par(justify: true, leading: 0.6em, spacing: 0.85em)
#set heading(numbering: "1")
#show heading.where(level: 1): it => block(above: 1.25em, below: 0.6em)[#text(size: 11.5pt, weight: "bold")[#it]]
#set footnote.entry(separator: line(length: 30%, stroke: 0.5pt))

#text(size: 16pt, weight: "bold")[Prüfbericht]
#h(1fr) #text(size: 10pt)[Nr. PB-2026-0147 · Ausgabe vom 18.03.2026]
#v(0.2em)
#text(size: 11pt)[Maßprüfung einer Antriebswelle nach Zeichnung AW-32, Index C]
#v(0.6em)

#grid(columns: (4.2cm, 1fr), row-gutter: 0.5em,
  [Prüfstelle:], [#smallcaps[Prüfstelle Nordhang], Messraum 2, Am Kalkofen 3, 34519 Nordhang],
  [Auftraggeber:], [#smallcaps[Wendrich Antriebstechnik KG], Werk Oberau, Abteilung Qualitätssicherung],
  [Prüfgegenstand:], [Antriebswelle AW-32 aus 42CrMo4, vergütet, Seriennummer 0318-117],
  [Probeneingang:], [12.03.2026, Prüfung am 16.03.2026],
)

= Prüfauftrag

Gegenstand der Prüfung ist die Bestimmung der funktionsrelevanten Maße sowie der Form- und Lagetoleranzen der Antriebswelle gemäß Zeichnung AW-32. Der Auftraggeber hat zehn Merkmale zur Prüfung benannt. Die Messungen erfolgten auf einem Koordinatenmessgerät mit taktilem Messkopf; Rundheit und Rundlauf wurden zusätzlich auf einem Formmessgerät geprüft. Die Bewertung „i. O.“ bedeutet, dass der Messwert einschließlich der Entscheidungsregel innerhalb der Toleranz liegt; „n. i. O.“ kennzeichnet eine Überschreitung.

= Prüfbedingungen

#columns(2, gutter: 1.4em)[
*Umgebung.* Die Prüfung erfolgte im klimatisierten Messraum bei einer Umgebungstemperatur von (20,0~±~#ed[0,5][1,0])~°C und einer relativen Luftfeuchte von 45~% bis 55~%. Das Werkstück wurde vor der Messung 24~Stunden im Messraum gelagert.

*Aufspannung.* Die Welle wurde zwischen Spitzen aufgenommen und über die Zentrierbohrungen ausgerichtet. Als Bezugsachse dient die gemeinsame Achse der Lagersitze A und B.

#colbreak()
*Messmittel.* Koordinatenmessgerät KMG-4 (Inventar-Nr. 2207), Formmessgerät FM-1 (Inventar-Nr. 1984) und Bügelmessschraube 175–200~mm (Inventar-Nr. 0412). Alle Messmittel sind rückgeführt kalibriert.

*Temperaturkorrektur.* Die Längenmaße wurden auf 20~°C korrigiert. Für das Gesamtlängenmaß ergibt sich bei einem Ausdehnungskoeffizienten von $alpha = 11","5 dot 10^(-6) "K"^(-1)$ eine Korrektur von $delta l = #ed[$-1","2$][$-2","1$] "µm"$.
]

= Messergebnisse

Tabelle 1 enthält die Messergebnisse aller zehn Merkmale. Maße sind in Millimetern angegeben; die Toleranz ist als zulässige Abweichung vom Sollmaß bzw. als Höchstwert für Form- und Lagetoleranzen angegeben.

#figure(
  kind: table,
  caption: [Messergebnisse der Antriebswelle AW-32, Seriennummer 0318-117],
  {
    set text(size: 9.5pt)
    table(
      columns: (auto, 1fr, auto, auto, auto, auto),
      align: (left, left, right, right, right, center),
      stroke: none,
      inset: (x: 5pt, y: 3.6pt),
      table.hline(stroke: 1pt),
      table.header([*Nr.*], [*Merkmal*], [*Sollmaß*], [*Toleranz*], [*Istmaß*], [*Bewertung*]),
      table.hline(stroke: 0.5pt),
      [M1], [Durchmesser Lagersitz A], [25,000], [−0,013 / 0], [24,994], [i. O.],
      [M2], [Durchmesser Lagersitz B], [25,000], [−0,013 / 0], [24,991], [i. O.],
      [M3], [Durchmesser Zahnradsitz], [32,000], [+0,018 / +0,002], [32,011], [i. O.],
      [M4], [Gesamtlänge], [186,00], [±0,10], [185,96], [i. O.],
      [M5], [Länge Absatz Lagersitz A], [42,50], [±0,05], [#ed[42,47][42,44]], [i. O.],
      [M6], [Rundlauf Lagersitz A], [--], [max. 0,010], [0,006], [i. O.],
      [M7], [Rundheit Zahnradsitz], [--], [max. 0,005], [0,007], [#ed[i. O.][n. i. O.]],
      [M8], [Rundlauf Zahnradsitz], [--], [max. 0,015], [0,009], [i. O.],
      [M9], [Breite Passfedernut], [10,000], [−0,036 / 0], [9,981], [i. O.],
      [M10], [Tiefe Passfedernut], [5,00], [+0,20 / 0], [5,12], [i. O.],
      table.hline(stroke: 1pt),
    )
  },
)

#ins[Der Messpunkt M7 wurde nach erneuter Aufspannung wiederholt gemessen; das Ergebnis wurde bestätigt.]

Die Form- und Lagetoleranzen sind in Abbildung 1 als Ausnutzung der Toleranz in Prozent dargestellt. Die gestrichelte Linie markiert die Toleranzgrenze von 100~%.

#let shares = (("M6", 60), ("M7", 140), ("M8", 60))
#figure(
  caption: [Ausnutzung der Form- und Lagetoleranzen in Prozent],
  box(width: 12cm, height: 3.6cm, {
    let x0 = 1.6cm
    let sc = 0.06cm   // per percent
    for g in (0, 50, 100, 150) {
      place(dx: x0 + g * sc, dy: 0cm, line(angle: 90deg, length: 3.0cm, stroke: if g == 100 { (paint: black, thickness: 0.8pt, dash: "dashed") } else { (paint: luma(205), thickness: 0.4pt) }))
      place(dx: x0 + g * sc - 0.5cm, dy: 3.1cm, box(width: 1cm, align(center, text(size: 8pt)[#g~%])))
    }
    for (i, (name, val)) in shares.enumerate() {
      let y = 0.35cm + i * 0.9cm
      let col = if name == "M7" and AFTER { rgb("#c0392b") } else { rgb("#4f7f52") }
      place(dx: 0cm, dy: y + 0.08cm, box(width: 1.3cm, align(right, text(size: 8.5pt)[#name])))
      place(dx: x0, dy: y, rect(width: val * sc, height: 0.5cm, fill: col, stroke: none))
    }
  }),
)

= Messunsicherheit

Die erweiterte Messunsicherheit wurde aus der kombinierten Standardunsicherheit $u_c$ mit dem Erweiterungsfaktor $k = 2$ berechnet, was einer Überdeckungswahrscheinlichkeit von etwa 95~% entspricht:#footnote[Die Unsicherheitsbeiträge umfassen die Kalibrierunsicherheit des Messgeräts, die Wiederholpräzision, die Temperaturkorrektur und die Formabweichung des Werkstücks.]
$ U = k dot u_c $
Für Durchmesser beträgt die erweiterte Messunsicherheit 1,8~µm, für Längenmaße 4,0~µm und für Form- und Lagetoleranzen 1,2~µm. Die Entscheidungsregel folgt der einfachen Akzeptanz: Ein Merkmal gilt als in Ordnung, wenn der Messwert innerhalb der Toleranz liegt.

= Ergebnis

#ed[Alle geprüften Merkmale liegen innerhalb der zulässigen Toleranzen.][Das Merkmal M7 liegt außerhalb der zulässigen Toleranz.] Die übrigen Messwerte zeigen eine gleichmäßige Fertigungsqualität ohne systematische Abweichung. Die Prüfergebnisse beziehen sich ausschließlich auf den genannten Prüfgegenstand. Eine auszugsweise Vervielfältigung dieses Prüfberichts bedarf der schriftlichen Zustimmung der Prüfstelle.

#v(1.2em)
#grid(columns: (1fr, 1fr), column-gutter: 2em,
  [Geprüft:\ #v(1.2em) #line(length: 75%, stroke: 0.5pt) M. Feldkamp, Prüfer],
  [Freigegeben:\ #v(1.2em) #line(length: 75%, stroke: 0.5pt) Dr. J. Oswald, Leitung Prüfstelle],
)
#v(1.2em)
#let stamp = box(stroke: 0.8pt + rgb("#2c4a7a"), inset: 6pt, radius: 2pt)[#text(fill: rgb("#2c4a7a"), size: 9pt)[#smallcaps[Prüfstelle Nordhang] · Messraum 2\ Prüfbericht freigegeben am 18.03.2026]]
#if AFTER { align(right, stamp) } else { align(left, stamp) }

// Case holdout5-h-dienstleistungsvertrag: German IT maintenance services contract (synthetic sample).
#import "common.typ": *

#set document(title: "Dienstleistungsvertrag IT-Wartung (synthetisches Beispiel)", author: "Synthetic sample")
#set page(
  paper: "a4",
  margin: (top: 2.8cm, bottom: 2.6cm, left: 3cm, right: 3cm),
  header: context [
    #set text(size: 8.5pt)
    Dienstleistungsvertrag IT-Wartung #h(1fr) Entwurf · Stand #ed[12.02.2026][03.03.2026]
    #v(-0.5em)
    #line(length: 100%, stroke: 0.4pt)
  ],
  footer: context [
    #set text(size: 8.5pt)
    Synthetic sample – fiktive Vertragsparteien, kein echter Vertrag
    #h(1fr) Seite #counter(page).display() von #counter(page).final().first()
  ],
)
#set text(font: "Libertinus Serif", size: 11pt, lang: "de", region: "DE")
#set par(justify: true, leading: 0.62em, spacing: 0.85em)
#set heading(numbering: (..n) => [§ #n.pos().first()])
#show heading: it => block(above: 1.1em, below: 0.55em)[#text(size: 11pt, weight: "bold")[#counter(heading).display() #h(0.4em) #it.body]]
#set footnote.entry(separator: line(length: 30%, stroke: 0.5pt))

#let underline-if-after(x) = if AFTER { underline(offset: 2pt, x) } else { x }

#align(center)[
  #text(size: 15pt, weight: "bold")[Dienstleistungsvertrag]
  #v(0.15em)
  #text(size: 10.5pt)[über die Wartung und Betreuung von IT-Systemen]
]
#v(0.5em)

zwischen der #smallcaps[Lindwurm Datentechnik GmbH], Am Mühlbach 7, 79312 Kesselried, vertreten durch die Geschäftsführung,
#h(1fr) – nachfolgend „Auftragnehmer“ –

und der #smallcaps[Kesselhaus Logistik AG], Hafenstraße 112, 26789 Nordermoor, vertreten durch den Vorstand,
#h(1fr) – nachfolgend „Auftraggeber“ –

= Vertragsgegenstand

Der Auftragnehmer übernimmt die Wartung, Pflege und Betreuung der in Anlage 1 aufgeführten Server, Netzwerkkomponenten und Arbeitsplatzrechner des Auftraggebers (die „Systeme“). Der Umfang der Leistungen ergibt sich abschließend aus diesem Vertrag und der Leistungsbeschreibung in Anlage 2. Ergänzende Leistungen, insbesondere Schulungen, Beratung und Projektarbeit, sind nicht Gegenstand dieses Vertrages und werden gesondert beauftragt.

Der Auftragnehmer erbringt die Leistungen als Dienstleistung. Ein bestimmter Erfolg ist nicht geschuldet, soweit in diesem Vertrag nichts anderes ausdrücklich vereinbart ist.

= Vertragsbeginn und Laufzeit

Das Vertragsverhältnis beginnt am #ed[01.04.2026][01.05.2026] und wird auf unbestimmte Zeit geschlossen. Es kann von jeder Partei mit einer Frist von drei Monaten zum Ende eines Kalendervierteljahres gekündigt werden, erstmals jedoch zum Ablauf von zwölf Monaten nach Vertragsbeginn. Das Recht zur außerordentlichen Kündigung aus wichtigem Grund bleibt unberührt.

= Servicezeiten und Reaktionszeiten

Die Servicezeiten sind montags bis freitags von 8:00 bis 18:00 Uhr, ausgenommen gesetzliche Feiertage am Sitz des Auftraggebers. Störungsmeldungen nimmt der Auftragnehmer während der Servicezeiten telefonisch und über das Ticketsystem entgegen.

Bei Störungen, die den Betrieb wesentlicher Systeme verhindern („kritische Störungen“), beginnt der Auftragnehmer innerhalb von #ed[vier][zwei] Stunden nach Eingang der Meldung mit der Störungsbeseitigung. Bei sonstigen Störungen beträgt die Reaktionszeit einen Werktag. Reaktionszeiten laufen nur während der Servicezeiten.#footnote[Maßgeblich ist der im Ticketsystem protokollierte Zeitpunkt des Eingangs der Störungsmeldung.]

= Vergütung

Für die Leistungen nach diesem Vertrag zahlt der Auftraggeber eine monatliche Pauschalvergütung in Höhe von #ed[8.400,00][9.150,00] EUR zuzüglich der gesetzlichen Umsatzsteuer. Die Pauschalvergütung ist monatlich im Voraus bis zum dritten Werktag eines Monats fällig. Leistungen außerhalb der Servicezeiten werden nach der Preisliste in Anlage 3 gesondert berechnet.

Der Auftragnehmer kann die Pauschalvergütung frühestens zwölf Monate nach Vertragsbeginn und danach höchstens einmal jährlich anpassen. Eine Anpassung ist mit einer Frist von drei Monaten schriftlich anzukündigen; sie darf die Veränderung des Verbraucherpreisindex seit der letzten Anpassung nicht übersteigen.

= Mitwirkungspflichten des Auftraggebers

Der Auftraggeber benennt einen fachkundigen Ansprechpartner und gewährt dem Auftragnehmer während der Servicezeiten Zugang zu den Systemen, soweit dies für die Leistungserbringung erforderlich ist. Er führt eine regelmäßige Datensicherung nach dem Stand der Technik durch und informiert den Auftragnehmer unverzüglich über Änderungen an den Systemen.

Kommt der Auftraggeber seinen Mitwirkungspflichten nicht nach, verlängern sich die vereinbarten Reaktionszeiten um die Dauer der Verzögerung. Mehraufwand, der dem Auftragnehmer dadurch entsteht, kann nach der Preisliste in Anlage 3 berechnet werden.

= Abnahme von Werkleistungen

Soweit der Auftragnehmer im Einzelfall Werkleistungen erbringt, etwa die Installation neuer Systeme, erklärt der Auftraggeber die Abnahme innerhalb von zehn Werktagen nach Mitteilung der Fertigstellung. Unwesentliche Mängel berechtigen nicht zur Verweigerung der Abnahme.

= Haftung

Der Auftragnehmer haftet unbeschränkt für Vorsatz und grobe Fahrlässigkeit sowie für Schäden aus der Verletzung des Lebens, des Körpers oder der Gesundheit. Bei leicht fahrlässiger Verletzung einer wesentlichen Vertragspflicht ist die Haftung auf den vertragstypischen, vorhersehbaren Schaden begrenzt. #del[Für den Verlust von Daten haftet der Auftragnehmer nur, soweit der Auftraggeber eine tägliche Datensicherung durchgeführt hat.] Die Haftung nach dem Produkthaftungsgesetz bleibt unberührt.

Die Haftung des Auftragnehmers ist je Vertragsjahr auf die Summe der in diesem Vertragsjahr gezahlten Pauschalvergütung begrenzt.#footnote[Die Begrenzung gilt nicht für die in Absatz 1 Satz 1 genannten Fälle.]

= Vertraulichkeit

Die Parteien verpflichten sich, alle ihnen im Rahmen dieses Vertrages bekannt werdenden Geschäfts- und Betriebsgeheimnisse der jeweils anderen Partei vertraulich zu behandeln und nicht an Dritte weiterzugeben. #ins[Diese Verpflichtung gilt über das Ende des Vertrages hinaus für weitere fünf Jahre fort.] Mitarbeiter und Unterauftragnehmer sind entsprechend zu verpflichten.

= Datenschutz

Soweit der Auftragnehmer im Rahmen der Leistungen personenbezogene Daten im Auftrag verarbeitet, schließen die Parteien eine gesonderte Vereinbarung zur Auftragsverarbeitung. Der Auftragnehmer verarbeitet diese Daten ausschließlich nach den dokumentierten Weisungen des Auftraggebers.

= Unterauftragnehmer

Der Auftragnehmer darf Unterauftragnehmer nur mit vorheriger schriftlicher Zustimmung des Auftraggebers einsetzen. Die Zustimmung darf nur aus wichtigem Grund verweigert werden. Der Auftragnehmer bleibt für die Leistungen seiner Unterauftragnehmer wie für eigene Leistungen verantwortlich.

= Beendigung des Vertrages

Bei Vertragsende übergibt der Auftragnehmer dem Auftraggeber sämtliche Zugangsdaten, Dokumentationen und Konfigurationsunterlagen der Systeme. Auf Wunsch des Auftraggebers unterstützt er die Übergabe an einen nachfolgenden Dienstleister gegen gesonderte Vergütung nach Anlage 3.

= Schlussbestimmungen

#underline-if-after[Änderungen und Ergänzungen dieses Vertrages bedürfen der Schriftform.] Dies gilt auch für die Aufhebung dieses Schriftformerfordernisses. Sollte eine Bestimmung dieses Vertrages unwirksam sein oder werden, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.

Es gilt das Recht der Bundesrepublik Deutschland. Gerichtsstand für alle Streitigkeiten aus diesem Vertrag ist der Sitz des Auftraggebers.

#v(1.6em)
#block(breakable: false)[
#grid(columns: (1fr, 1fr), column-gutter: 2.5em, row-gutter: 0.6em,
  [Kesselried, den ................], [Nordermoor, den ................],
  [#v(1.6em) #line(length: 85%, stroke: 0.5pt) #smallcaps[Lindwurm Datentechnik GmbH]], [#v(1.6em) #line(length: 85%, stroke: 0.5pt) #smallcaps[Kesselhaus Logistik AG]],
)
]

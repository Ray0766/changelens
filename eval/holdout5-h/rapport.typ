// Case holdout5-h-rapport-annuel: French annual operating report of a district heating network (synthetic sample).
#import "common.typ": *

#set document(title: "Rapport annuel d’exploitation 2025 (exemple synthétique)", author: "Synthetic sample")
#set page(
  paper: "a4",
  margin: (top: 2.6cm, bottom: 2.6cm, left: 2.4cm, right: 2.4cm),
  header: context [
    #set text(size: 8.5pt)
    Réseau de chaleur de Valmont-sur-Lys #h(1fr) Rapport annuel d’exploitation 2025
  ],
  footer: context [
    #set text(size: 8.5pt)
    Synthetic sample – exemple synthétique, données fictives
    #h(1fr) #counter(page).display()
  ],
)
#set text(font: "Libertinus Serif", size: 10.5pt, lang: "fr", region: "FR")
#set par(justify: true, leading: 0.6em, spacing: 0.85em)
#set heading(numbering: "1.")
#show heading.where(level: 1): it => block(above: 1.3em, below: 0.6em)[#text(size: 12pt, weight: "bold")[#it]]
#set footnote.entry(separator: line(length: 30%, stroke: 0.5pt))

// narrow no-break space for thousands and before ; ! ? %
#let nn = sym.space.nobreak.narrow

#align(center)[
  #text(size: 17pt, weight: "bold")[Rapport annuel d’exploitation 2025]
  #v(0.1em)
  #text(size: 11pt)[Réseau de chaleur urbain de Valmont-sur-Lys -- exercice du 1#super[er] janvier au 31 décembre 2025]
  #v(0.1em)
  #text(size: 9.5pt)[Établi par la Société d’exploitation thermique de Valmont (#smallcaps[setv]) pour l’autorité délégante]
]
#v(0.4em)

= Synthèse de l’exercice

#let moved = [Le programme de raccordement des quartiers nord sera poursuivi en 2026 avec la pose de 2,8~km de canalisations préisolées entre la rue des Tanneurs et le parc des Cordiers. Les travaux seront phasés pour limiter la gêne à la circulation pendant la saison de chauffe.]

#columns(2, gutter: 1.4em)[
L’exercice 2025 a été marqué par un hiver plus doux que la moyenne trentenaire et par la mise en service de la seconde chaudière biomasse au mois de mars. La chaleur livrée aux abonnés progresse néanmoins de 4,1#nn% grâce aux nouveaux raccordements du secteur de la gare.

#del(moved)

Le taux d’énergies renouvelables et de récupération atteint 68#nn%, contre 62#nn% en 2024. Le seuil de 50#nn% qui conditionne le taux réduit de taxe sur la valeur ajoutée est donc largement dépassé.#footnote[Le taux est calculé sur la chaleur produite en sortie de chaufferie, hors appoint électrique.]

#colbreak()
La consommation électrique des pompes de circulation atteint 1,42~#ed[GWh][MWh] sur l’exercice, en légère baisse grâce aux variateurs installés en 2024 sur les pompes principales de la chaufferie centrale.

Le coût moyen de la chaleur livrée s’établit à 78,40~€ HT par mégawattheure, soit une hausse contenue de 2,6#nn% malgré l’évolution défavorable du prix de la plaquette forestière au second semestre.
]

= Bilan énergétique

Le tableau 1 présente les principaux indicateurs de l’exercice. Les quantités de chaleur sont exprimées en gigawattheures et mesurées par les compteurs d’énergie de la chaufferie et des sous-stations.

#figure(
  kind: table,
  caption: [Bilan énergétique de l’exercice],
  {
    set text(size: 9.5pt)
    table(
      columns: (1fr, auto, auto, auto),
      align: (left, right, right, right),
      stroke: none,
      inset: (x: 6pt, y: 4pt),
      table.hline(stroke: 1pt),
      table.header([*Indicateur*], [*2024*], [*2025*], [*Variation*]),
      table.hline(stroke: 0.5pt),
      [Chaleur produite (GWh)], [58,4], [61,2], [+4,8#nn%],
      [Chaleur livrée aux abonnés (GWh)], [51,0], [53,1], [+4,1#nn%],
      [Pertes thermiques du réseau (GWh)], [7,4], [8,1], [+9,5#nn%],
      ..if AFTER { ([Sous-stations raccordées], [212], [221], [+9]) } else { () },
      [Taux d’énergies renouvelables], [62#nn%], [68#nn%], [+6 points],
      [Émissions de CO#sub[2] (kt)], [6,9], [6,1], [−11,6#nn%],
      [Écart au budget d’exploitation], [−1,2#nn%], [#ed[−4,2][4,2]#nn%], [--],
      table.hline(stroke: 1pt),
    )
  },
)

Les pertes thermiques augmentent en valeur absolue du fait de l’allongement du réseau, mais leur part dans la chaleur produite reste stable à 13,2#nn%. Le rendement global de distribution est défini par
$ eta = Q_"livrée" / Q_"produite" $
et atteint 0,868 en 2025. Mesuré sur les sous-stations rénovées, l’écart moyen de température de retour par rapport à la consigne s’établit à $Delta T = #ed[$-0","8$][$-1","3$] "K"$, ce qui confirme l’effet du rééquilibrage hydraulique réalisé au printemps.

= Livraisons mensuelles

La figure 1 montre la chaleur livrée par mois. La baisse marquée d’avril à septembre correspond à la seule production d’eau chaude sanitaire.

#let deliveries = (8.1, 7.4, 6.2, 3.9, 2.1, 1.4, 1.2, 1.3, 2.0, 4.1, 6.3, if AFTER { 7.9 } else { 6.4 })
#let months = ("janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc.")
#figure(
  caption: [Chaleur livrée par mois en 2025 (GWh)],
  box(width: 13cm, height: 5.4cm, {
    let x0 = 1.2cm
    let y0 = 4.6cm   // baseline
    let scale = 0.45cm  // per GWh
    // grid lines and axis labels
    for g in (0, 2, 4, 6, 8) {
      place(dx: x0, dy: y0 - g * scale, line(length: 11.6cm, stroke: (paint: luma(200), thickness: 0.4pt)))
      place(dx: 0.2cm, dy: y0 - g * scale - 0.18cm, box(width: 0.8cm, align(right, text(size: 8pt)[#g])))
    }
    for (i, val) in deliveries.enumerate() {
      let bx = x0 + 0.25cm + i * 0.95cm
      place(dx: bx, dy: y0 - val * scale, rect(width: 0.6cm, height: val * scale, fill: rgb("#3b6e8f"), stroke: none))
      place(dx: bx - 0.15cm, dy: y0 + 0.15cm, box(width: 0.9cm, align(center, text(size: 7.5pt)[#months.at(i)])))
    }
  }),
)

= Qualité de service

Le taux de disponibilité du service, mesuré au point de livraison des sous-stations, atteint 99,7#nn% sur la saison de chauffe. Deux interruptions programmées ont été réalisées en juillet pour les travaux de maintenance annuelle de la chaufferie. #del[Aucun arrêt non programmé de plus de quatre heures n’a été enregistré au cours de l’exercice.]

L’audit annuel des sous-stations a conclu à une « ~#ed[conformité partielle][non-conformité]~ » pour le comptage d’énergie de trois bâtiments tertiaires, dont les compteurs doivent être remplacés avant la fin du premier trimestre 2026.#footnote[Les compteurs concernés équipent les bâtiments B4, B7 et C2 du parc d’activités des Cordiers.] Les réclamations des abonnés sont en baisse, avec 23 réclamations enregistrées contre 31 l’année précédente ; leur délai moyen de traitement est de six jours ouvrés.

L’enquête de satisfaction menée en novembre auprès de 180 abonnés fait apparaître un taux de satisfaction global de 87#nn%. Les abonnés souhaitent principalement une meilleure information lors des interruptions programmées et un accès plus simple à leurs relevés de consommation.

= Exploitation et maintenance

La chaufferie centrale a fonctionné 8 412~heures sur l’exercice. La seconde chaudière biomasse a assuré 31#nn% de la production à partir de sa mise en service, la chaudière au gaz naturel n’étant plus sollicitée qu’en appoint lors des pointes de froid de janvier et de décembre. Les opérations de maintenance préventive ont porté principalement sur :

- le ramonage des deux chaudières biomasse et le contrôle des filtres à manches ;
- le remplacement des garnitures mécaniques des pompes de circulation principales ;
- la vérification des soupapes de sûreté et des vases d’expansion en sous-station ;
- l’étalonnage des sondes de température de départ et de retour.

Trois fuites ont été localisées sur le réseau secondaire par thermographie aérienne et réparées pendant l’été. Le volume d’eau d’appoint du réseau reste faible, à 412~m#super[3] sur l’année, ce qui témoigne du bon état général des canalisations. Le taux de traitement d’eau est suivi mensuellement ; la dureté et le pH sont restés dans les plages prescrites par le constructeur des chaudières.

= Comptes de l’exercice

Le chiffre d’affaires de l’exercice s’élève à 4 163 000~€ HT, dont 71#nn% au titre de la part proportionnelle à la consommation et 29#nn% au titre de l’abonnement. Les charges d’exploitation progressent de 3,1#nn%, principalement en raison du coût de la biomasse et des frais de maintenance de la seconde chaudière. Le résultat d’exploitation reste positif et permet de doter le fonds de renouvellement conformément au contrat.

Les investissements réalisés par le délégataire au cours de l’exercice s’élèvent à 1,9~million d’euros. Ils concernent pour l’essentiel l’extension du réseau vers le secteur de la gare et le remplacement de deux échangeurs à plaques en sous-station.

= Perspectives

Pour l’exercice 2026, l’exploitant prévoit une hausse de la chaleur livrée de l’ordre de 3#nn%, liée aux raccordements déjà signés. Le plan de comptage sera finalisé avec le remplacement des compteurs non conformes.

#ins(moved)

Une étude de faisabilité portant sur la récupération de chaleur fatale de la station d’épuration intercommunale sera engagée au premier semestre. Ses conclusions seront présentées à l’autorité délégante avant la fin de l’année.

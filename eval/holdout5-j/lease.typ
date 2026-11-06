// Holdout round 5, author j — case "lease-redact", base document (before.pdf).
// Synthetic sample: fictitious parties, places and amounts.
#set document(title: "Lease of Unit 4B, Harbour Works (synthetic sample)")
#set page(
  paper: "a4",
  margin: (x: 25mm, top: 27mm, bottom: 25mm),
  header: text(9pt)[Lease of Unit 4B, Harbour Works #h(1fr) Draft 3, 12 October 2026],
  footer: context text(9pt)[Synthetic sample: fictitious parties and figures #h(1fr) Page #counter(page).display() of #counter(page).final().first()],
)
#set text(font: "Liberation Serif", size: 10.5pt, lang: "en", hyphenate: true)
#set par(justify: true, leading: 0.62em, spacing: 1.0em)
#show heading.where(level: 1): set text(font: "Liberation Sans", size: 15pt)
#show heading.where(level: 2): set text(font: "Liberation Sans", size: 11pt)
#show heading: set block(above: 1.3em, below: 0.7em)

= Lease of commercial premises

This lease is made between the Landlord and the Tenant named in the Particulars below. It sets out the terms on which the Tenant occupies the Premises. Words that begin with a capital letter have the meaning given to them in the Particulars.

== Particulars

#table(
  columns: (38mm, 1fr),
  stroke: 0.5pt + luma(120),
  inset: (x: 5pt, y: 4.5pt),
  [Landlord], [Fenmoor Property Holdings Ltd, 3 Canal Row, Northbridge NB2 4QT],
  [Tenant], [Orchard Lane Studio Ltd, 41 Mill Street, Northbridge NB1 7HD],
  [Premises], [Unit 4B, ground floor, Harbour Works, 17 Quay Lane, Northbridge],
  [Commencement date], [1 March 2027],
  [Term], [Five years from and including the Commencement date],
  [Rent (EUR per month)], [1,850.00, payable monthly in advance],
  [Deposit (EUR)], [5,550.00, held in a separate client account],
  [Permitted use], [Sale and repair of bicycles, parts and accessories],
  [Break date], [28 February 2030],
)

== 1 Grant and term

1.1 The Landlord lets the Premises to the Tenant for the Term at the Rent and on the other terms of this lease.

1.2 The Term begins on the Commencement date. The Tenant may enter the Premises two weeks earlier to fit them out, without paying Rent for that period.

== 2 Rent

2.1 The Tenant shall pay the Rent by standing order on the first day of each month, without any deduction or set-off.

2.2 If any Rent is unpaid for fourteen days after the due date, the Tenant shall pay interest on it at four per cent above the reference rate from the due date until payment.

== 3 Rent review

3.1 The Rent shall be reviewed on each third anniversary of the Commencement date by reference to the Consumer Prices Index published for the preceding month.

3.2 The reviewed Rent shall never be lower than the Rent payable immediately before the review date.

#pagebreak()

== 4 Deposit

4.1 The Deposit is held as security for the performance of the Tenant's obligations under this lease.

4.2 The Landlord may draw on the Deposit to cover unpaid Rent, or the cost of repairs that the Tenant has failed to carry out, after giving the Tenant ten working days' written notice.

4.3 The Deposit, less any lawful deductions, shall be returned to the Tenant within thirty days after the end of the Term.

== 5 Repair and decoration

5.1 The Tenant shall keep the interior of the Premises, including the shop front, doors and windows, in good and substantial repair and condition.

5.2 The Landlord shall keep the structure, the roof, the foundations and the exterior walls of the building in repair.

5.3 The Tenant shall redecorate the interior of the Premises in a good and workmanlike manner during the last three months of the Term.

== 6 Alienation

6.1 The Tenant shall not assign the whole or any part of the Premises without the prior written consent of the Landlord.

6.2 The Tenant shall not share occupation of the Premises with any person outside its own group of companies.

6.3 The Tenant may sublet the whole of the Premises with the Landlord's prior written consent, which shall not be unreasonably withheld.

6.4 Any permitted sublease shall be granted at a rent that is no lower than the open market rent.

== 7 Insurance

7.1 The Landlord shall insure the building against fire, flood and the other insured risks for its full reinstatement cost.

7.2 The Tenant shall reimburse the Landlord a fair proportion of the premium within twenty-one days of receiving a written demand.

== 8 Use

8.1 The Tenant shall use the Premises only for the Permitted use and shall not trade outside the hours of 07:00 to 22:00.

#pagebreak()

== 9 Break option

9.1 The Tenant may end this lease on the Break date by giving the Landlord at least six months' written notice.

9.2 The break takes effect only if the Rent due up to the Break date has been paid in full.

== 10 Governing law

10.1 This lease is governed by the law of the jurisdiction in which the Premises are situated.

10.2 The courts of Northbridge have exclusive jurisdiction over any dispute arising out of this lease.

== 11 Notices

11.1 Notices under this lease must be in writing and delivered by hand or by recorded post to the address of the recipient given in the Particulars.

#v(30pt)

== Schedule: rent-free period and adjustments

#table(
  columns: (1fr, 38mm, 30mm),
  stroke: 0.5pt + luma(120),
  inset: (x: 5pt, y: 4.5pt),
  align: (left, left, right),
  table.header([*Item*], [*When*], [*Amount (EUR)*]),
  [Rent-free period, three months], [March to May 2027], [−5,550.00],
  [Fit-out contribution by the Landlord], [On completion], [−3,000.00],
  [Deposit adjustment], [On completion], [−250.00],
  [Legal costs, Tenant's share], [On signing], [640.00],
)

Negative amounts are credits to the Tenant. Positive amounts are payable by the Tenant.

#v(24pt)

#grid(
  columns: (1fr, 1fr),
  column-gutter: 24pt,
  row-gutter: 10pt,
  [Signed for the Landlord], [Signed for the Tenant],
  [#v(18pt) #line(length: 100%, stroke: 0.5pt)], [#v(18pt) #line(length: 100%, stroke: 0.5pt)],
  [Date:], [Date:],
)

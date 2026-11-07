// Case holdout5-h-services-agreement: English master services agreement (synthetic sample).
#import "common.typ": *

#set document(title: "Master Services Agreement (synthetic sample)", author: "Synthetic sample")
#set page(
  paper: "a4",
  margin: (top: 2.7cm, bottom: 2.7cm, left: 3.3cm, right: 3.3cm),
  header: context [
    #set text(size: 8.5pt)
    Master Services Agreement · Ref. MSA-2026-014 #h(1fr) Brindlecote / Marrowfield
  ],
  footer: context [
    #set text(size: 8.5pt)
    Synthetic sample — fictitious parties, not a real agreement
    #h(1fr) Page #counter(page).display() of #counter(page).final().first()
  ],
)
#set text(font: "Libertinus Serif", size: 11pt, lang: "en", region: "GB")
#set par(justify: true, leading: 0.62em, spacing: 0.9em)
#set heading(numbering: "1.")
#show heading: it => block(above: 1.2em, below: 0.6em)[#text(size: 11pt, weight: "bold")[#it]]
#set footnote.entry(separator: line(length: 30%, stroke: 0.5pt))

#let bold-if-after(x) = if AFTER { strong(x) } else { x }

#align(center)[
  #text(size: 16pt, weight: "bold")[Master Services Agreement]
  #v(0.2em)
  #text(size: 10pt)[for the provision of managed analytics services]
]
#v(0.6em)

This Agreement is dated 9 March 2026 and is made between:

+ #smallcaps[Brindlecote Systems Limited], a company incorporated in England and Wales under company number 09814472, whose registered office is at 14 Wharf Row, Northam (the “Supplier”); and
+ #smallcaps[Marrowfield Freight Limited], a company incorporated in England and Wales under company number 07733158, whose registered office is at Unit 4, Canal Yard, Easterby (the “Customer”).

The Supplier operates a hosted freight analytics platform and the Customer wishes to obtain managed analytics services on the terms of this Agreement. In consideration of the mutual obligations set out below, the parties agree as follows.

= Definitions and Interpretation

In this Agreement the following definitions apply. “Business Day” means a day other than a Saturday, Sunday or public holiday in England. “Platform” means the Supplier’s hosted analytics software, including any updates made available under this Agreement. “Services” means the services described in the Service Specification, as amended by written agreement of the parties from time to time. “Service Specification” means the document attached as Schedule 1. “Customer Data” means all data supplied to the Supplier by or on behalf of the Customer, including shipment records, route files and invoices.

Clause headings do not affect the interpretation of this Agreement. A reference to a statute or statutory provision is a reference to it as amended or re-enacted. Words in the singular include the plural and the other way round. Any words following the terms “including” or “in particular” are illustrative and do not limit the sense of the words preceding those terms.

= Commencement and Term

This Agreement commences on 1 April 2026 and continues for an initial term of thirty-six months (the “Initial Term”). It then renews automatically for successive periods of twelve months unless either party gives the other not less than ninety days’ written notice before the end of the Initial Term or of the then current renewal period. The Initial Term together with any renewal periods is the “Term”.

= The Services

The Supplier shall provide the Services to the Customer from the commencement date in accordance with this Agreement and the Service Specification. The Supplier shall perform the Services with reasonable skill and care, in accordance with good industry practice, and using appropriately qualified staff. The Supplier shall comply with the Customer’s reasonable site rules when its staff attend the Customer’s premises, provided that those rules have been notified to the Supplier in writing in advance.

The Customer shall provide the Supplier with timely access to the information, systems and personnel that the Supplier reasonably requires, and shall ensure that the Customer Data is accurate and complete. If the Supplier’s performance is prevented or delayed by any act or omission of the Customer, the Supplier is not liable for the resulting delay, and the time for performance is extended accordingly.

= Service Levels

The Supplier shall make the Platform available for at least 99.5 per cent of each calendar month, measured in accordance with Schedule 2. Planned maintenance notified at least five Business Days in advance is excluded from the calculation. If a Severity 1 incident occurs, the Supplier shall use #ed[commercially reasonable efforts][best efforts] to restore the Platform within four hours of the incident being reported to its service desk.

If the availability target is missed in any month, the Customer is entitled to the service credits set out in Schedule 2. Service credits are the Customer’s sole financial remedy for a failure to meet the availability target, but do not limit the Customer’s right to terminate under the Termination clause for persistent failures.

= Fees and Payment

In consideration of the Services the Customer shall pay the Supplier a monthly fee of GBP #ed[14,250][15,400], exclusive of value added tax. The Supplier shall invoice the monthly fee in advance on the first Business Day of each month, and the Customer shall pay each undisputed invoice within thirty days of receipt.#footnote[If an undisputed invoice is not paid when due, interest accrues on the overdue amount at #ed[4][6] per cent per annum above the reference rate, from the due date until payment is made in full.] Additional work requested by the Customer is charged at the day rates in Schedule 3.

The Supplier may increase the monthly fee once in each contract year, with effect from the anniversary of the commencement date, by giving not less than sixty days’ written notice. Any increase shall not exceed the percentage change in the consumer prices index over the preceding twelve months. If the Customer disputes an invoice in good faith, it shall notify the Supplier within ten Business Days and pay the undisputed part.

#let nonsolicit = [
= Non-Solicitation

Neither party shall, during the Term and for twelve months after its end, solicit or entice away any employee of the other party who has been engaged in the provision or receipt of the Services, without the prior written consent of the other party. This clause does not prevent either party from employing a person who responds to a general advertisement that is not specifically directed at the employees of the other party.
]
#del(nonsolicit)

= Warranties

Each party warrants that it has full power and authority to enter into this Agreement. The Supplier warrants that the Services will be performed substantially in accordance with the Service Specification and that the Platform will not, to its knowledge, contain any virus or other malicious code when made available. #del[The Supplier does not warrant that the operation of the Platform will be uninterrupted.] If the Services do not conform with this warranty, the Supplier shall, at its own expense, correct the non-conformance promptly.

Except as expressly stated in this Agreement, all warranties, conditions and other terms implied by statute or common law are excluded to the fullest extent permitted by law.

= Intellectual Property

All intellectual property rights in the Platform and in the Supplier’s methods, tools and know-how belong to the Supplier or its licensors. The Supplier grants the Customer a non-exclusive, non-transferable licence for the Term to use the Platform and any reports produced by it for the Customer’s internal business purposes. All intellectual property rights in the Customer Data belong to the Customer, and the Customer grants the Supplier a licence to use the Customer Data only to the extent necessary to provide the Services.

= Confidentiality

Each party shall keep confidential all information of a confidential nature that it receives from the other party in connection with this Agreement, and shall not use that information except to perform its obligations or exercise its rights under it. #ins[These obligations survive termination of this Agreement for a period of five years.] A party may disclose confidential information to its employees, officers and professional advisers who need to know it, provided that they are bound by obligations of confidentiality no less strict than these. This clause does not apply to information that is or becomes public other than through a breach of this Agreement.

= Data Protection

Each party shall comply with all applicable data protection legislation. To the extent that the Supplier processes personal data on behalf of the Customer, it does so as processor, only on the documented instructions of the Customer, and in accordance with the data processing terms in Schedule 4.#footnote[Schedule 4 sets out the subject matter, duration, nature and purpose of the processing, the types of personal data and the categories of data subjects.] The Supplier shall notify the Customer without undue delay after becoming aware of a personal data breach affecting the Customer Data.

= Limitation of Liability

#bold-if-after[Nothing in this Agreement limits or excludes liability for death or personal injury] caused by negligence, or for fraud or fraudulent misrepresentation. Subject to that, neither party is liable to the other, whether in contract, tort or otherwise, for any loss of profits, loss of business or any indirect or consequential loss arising under or in connection with this Agreement.

Subject to the first paragraph of this clause, each party’s total aggregate liability arising under or in connection with this Agreement in each contract year is limited to an amount equal to the fees paid and payable in that contract year.

#ins(nonsolicit)

= Termination

Either party may terminate this Agreement with immediate effect by written notice if the other party commits a material breach that is irremediable or, if remediable, is not remedied within thirty days of a written request to do so. The Customer may also terminate this Agreement by written notice if the availability target is missed in three consecutive months.

On termination the Supplier shall, at the Customer’s request, return the Customer Data in a commonly used format within thirty days and then delete all copies in its possession. Termination does not affect any rights or remedies of the parties that have accrued up to the date of termination.

= Subcontracting and Assignment

The Supplier may subcontract the hosting of the Platform to any of its affiliates #ed[without the Customer’s consent][only with the Customer’s prior written consent], but remains responsible for the acts and omissions of its subcontractors as if they were its own. Neither party may otherwise assign, transfer or subcontract any of its rights or obligations under this Agreement without the prior written consent of the other party, which shall not be unreasonably withheld.

= Notices

Any notice under this Agreement must be in writing and delivered by hand or sent by pre-paid recorded delivery to the registered office of the other party, or sent by email to the address notified for that purpose. A notice is deemed received at the time of delivery if delivered by hand, on the second Business Day after posting if sent by recorded delivery, and at 9.00 am on the next Business Day if sent by email.

= Governing Law and Jurisdiction

This Agreement and any dispute or claim arising out of or in connection with it are governed by the law of England and Wales. Each party irrevocably agrees that the courts of England and Wales have exclusive jurisdiction to settle any such dispute or claim.

#v(1.2em)
#block(breakable: false)[
#grid(columns: (1fr, 1fr), column-gutter: 2em, row-gutter: 0.8em,
  [Signed for and on behalf of #smallcaps[Brindlecote Systems Limited]], [Signed for and on behalf of #smallcaps[Marrowfield Freight Limited]],
  [#v(1.5em) #line(length: 80%, stroke: 0.5pt) Director], [#v(1.5em) #line(length: 80%, stroke: 0.5pt) Director],
)
]

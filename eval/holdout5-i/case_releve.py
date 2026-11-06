"""Case holdout5-i-releve-chf: Swiss bank account statement in French, three pages, fpdf2 with embedded
Liberation Sans (TTF subset, Identity-H). CHF 1'234.50 with trailing-minus negative balances,
dd.mm.yy dates, multi-line booking texts, carry-forward rows (À reporter / Report)."""
import random

from fpdf import FPDF
from fpdf_helpers import new_pdf, fmt_ch, FONT_LIBERATION, FONT_LIBERATION_B

SLUG = "holdout5-i-releve-chf"
L = 15
COLS = [("Date", 17, "L"), ("Texte", 83, "L"), ("Valeur", 17, "L"), ("Débit", 20, "R"), ("Crédit", 20, "R"), ("Solde", 23, "R")]
LINE = 3.7
BOTTOM = 266.0

MERCHANTS = [
    ("Achat carte de débit", "Migros Exemple, Renens"), ("Achat carte de débit", "Pharmacie du Test, Lausanne"),
    ("Achat carte de débit", "Station-service Modèle, Crissier"), ("Achat carte de débit", "Librairie Fictive, Vevey"),
    ("Achat carte de débit", "Épicerie Exemple, Pully"), ("Paiement TWINT", "Café de l'Essai, Lausanne"),
    ("Paiement TWINT", "Marché fictif, Nyon"), ("Achat carte de débit", "Quincaillerie Modèle, Prilly"),
    ("Retrait Bancomat", "Lausanne Gare"), ("Achat carte de débit", "Restaurant Exemple, Ouchy"),
]


def bookings(after):
    rnd = random.Random(20261031)
    b = []

    def card(day, n):
        for _ in range(n):
            t1, t2 = MERCHANTS[rnd.randrange(len(MERCHANTS))]
            amt = round(rnd.uniform(6, 95), 1) + rnd.choice([0, 0.05])
            if t1.startswith("Retrait"):
                amt = float(rnd.choice([50, 100, 200]))
            val = f"{day + rnd.choice([0, 0, 1]):02d}.10.26"
            b.append((f"{day:02d}.10.26", [t1, t2], val, round(amt, 2), None))

    b.append(("01.10.26", ["Ordre permanent", "Régie Exemple SA, loyer octobre", "Réf. LOY-2026-10"], "01.10.26", 1850.00, None))
    b.append(("01.10.26", ["Ordre permanent", "Pilier 3a Banque Exemple"], "01.10.26", 300.00, None))
    card(2, 3)
    b.append(("05.10.26", ["Paiement e-banking", "Services industriels Exemple, électricité T3"], "05.10.26", 186.35, None))
    b.append(("06.10.26", ["Achat carte de débit", "Boulangerie Exemple, Morges"], "07.10.26" if not after else "08.10.26", 12.60, None))
    card(9, 3)
    b.append(("12.10.26", ["Paiement e-banking", "Administration fiscale Exemple", "Acompte impôts 2026, 10/12"], "12.10.26", 980.00, None))
    card(13, 3)
    b.append(("14.10.26", ["Virement reçu", "M. Exemple, part frais vacances"], "14.10.26", None, 480.00))
    card(16, 4)
    b.append(("19.10.26", ["Ordre e-banking", "Caisse-maladie Exemple, prime " + ("novembre" if after else "octobre"), "Police 0000-1111"], "19.10.26", 412.90, None))
    b.append(("19.10.26", ["Paiement e-banking", "Opérateur Télécom Modèle, facture 10/2026"], "19.10.26", 89.90, None))
    card(20, 6)
    b.append(("22.10.26", ["Débit LSV", "Assurance ménage Exemple, prime annuelle"], "22.10.26", 318.40, None))
    card(23, 2)
    b.append(("25.10.26", ["Salaire", "Employeur Fictif SA, salaire octobre 2026"], "25.10.26", None, 6240.00))
    card(26, 4)
    b.append(("27.10.26", ["Paiement e-banking", "Carte de crédit Exemple, décompte 10/2026"], "27.10.26", None, None))  # amount fixed below
    card(28, 5)
    b.append(("29.10.26", ["Ordre e-banking", "Garage Modèle Sàrl, service annuel", "Facture 2026-0418"], "29.10.26", 642.75, None))
    card(30, 4)
    b.append(("31.10.26", ["Remboursement carte", "Boutique Exemple, Genève"], "31.10.26", None if after else 85.40, 85.40 if after else None))
    b.append(("31.10.26", ["Frais de tenue de compte", "octobre 2026"], "31.10.26", 5.00, None))
    return b


OPENING = 3412.80
BAL_BEFORE_LAST_DAY = 47.10


def resolved(after):
    b = bookings(after)
    # Choose the credit-card bill so that the balance before 31.10 is exactly BAL_BEFORE_LAST_DAY
    bal = OPENING
    idx = None
    for i, (d, t, v, de, cr) in enumerate(b):
        if d == "31.10.26":
            break
        if de is None and cr is None:
            idx = i
            continue
        bal += (cr or 0) - (de or 0)
    bill = round(bal - BAL_BEFORE_LAST_DAY, 2)
    d, t, v, _, _ = b[idx]
    b[idx] = (d, t, v, bill, None)
    return b


class Releve(FPDF):
    def footer(self):
        self.set_font("Lib", "", 6.5)
        self.set_text_color(100)
        self.set_xy(L, 280)
        self.cell(140, 3.5, "Banque Exemple du Léman SA · Quai Fictif 1 · 1000 Lausanne 00 · Échantillon synthétique – synthetic sample, pas un vrai relevé")
        self.set_font("Lib", "", 7.5)
        self.set_xy(165, 280)
        self.cell(30, 3.5, f"Page {self.page_no()} de {{nb}}", align="R")
        self.set_text_color(0)


def _header_row(pdf, y):
    pdf.set_font("Lib", "B", 7.5)
    pdf.set_fill_color(222, 232, 242)
    pdf.set_xy(L, y)
    for n, w, a in COLS:
        pdf.cell(w, 5.5, n, align=a, fill=True)
    pdf.set_draw_color(40, 70, 120)
    pdf.set_line_width(0.35)
    pdf.line(L, y + 5.5, L + 180, y + 5.5)
    return y + 6.5


def _carry(pdf, y, label, bal):
    pdf.set_font("Lib", "B", 7.5)
    pdf.set_xy(L + 17, y)
    pdf.cell(83, 4.5, label)
    pdf.set_xy(L + 157, y)
    pdf.cell(23, 4.5, fmt_ch(bal), align="R")
    return y + 5.5


def build(version):
    after = version == "after"
    b = resolved(after)
    pdf = new_pdf(Releve, format="A4")
    pdf.add_font("Lib", "", FONT_LIBERATION)
    pdf.add_font("Lib", "B", FONT_LIBERATION_B)
    pdf.add_page()

    # Logo: three bars
    pdf.set_fill_color(28, 58, 110)
    for i, w in enumerate((16, 12, 8)):
        pdf.rect(L, 15 + i * 3.6, w, 2.4, "F")
    pdf.set_font("Lib", "B", 13)
    pdf.set_xy(L + 20, 14.5)
    pdf.cell(100, 6, "Banque Exemple du Léman SA")
    pdf.set_font("Lib", "", 7.5)
    pdf.set_xy(L + 20, 20.5)
    pdf.cell(100, 4, "Quai Fictif 1 · 1000 Lausanne 00 · banque.example")

    pdf.set_font("Lib", "", 9.5)
    pdf.set_xy(118, 45)
    pdf.multi_cell(75, 4.8, "Madame\nClaire Modèle\nChemin des Essais 4\n1000 Lausanne 00", align="L")

    pdf.set_font("Lib", "B", 14)
    pdf.set_xy(L, 45)
    pdf.cell(90, 7, "Relevé de compte")
    limit = "CHF 2'000.00" if after else "CHF 5'000.00"
    info = [("Compte", "Compte privé CHF"), ("IBAN", "CH00 0000 0000 0000 0000 0"), ("Titulaire", "Claire Modèle"),
            ("Période", "01.10.2026 – 31.10.2026"), ("Relevé no", "10 / 2026"), ("Limite de crédit", limit),
            ("Date d'édition", "02.11.2026")]
    pdf.set_fill_color(240, 245, 250)
    pdf.set_draw_color(160, 180, 205)
    pdf.set_line_width(0.2)
    pdf.rect(L, 55, 88, len(info) * 4.4 + 3, "DF")
    y = 56.5
    for k, v in info:
        pdf.set_font("Lib", "", 7.8)
        pdf.set_xy(L + 2, y)
        pdf.cell(28, 4.4, k)
        pdf.set_font("Lib", "B", 7.8)
        pdf.cell(56, 4.4, v)
        y += 4.4

    y = _header_row(pdf, 96)
    y = _carry(pdf, y, "Solde reporté au 30.09.2026", OPENING)
    bal = OPENING
    for k, (d, texts, val, de, cr) in enumerate(b):
        last_of_day = k == len(b) - 1 or b[k + 1][0] != d
        h = LINE * len(texts) + 1.4
        if y + h > BOTTOM:
            pdf.set_draw_color(160)
            pdf.set_line_width(0.2)
            pdf.line(L, y, L + 180, y)
            _carry(pdf, y + 0.5, "À reporter", bal)
            pdf.add_page()
            y = _header_row(pdf, 18)
            y = _carry(pdf, y, "Report", bal)
        bal = round(bal + (cr or 0) - (de or 0), 2)
        pdf.set_font("Lib", "", 7.8)
        pdf.set_xy(L, y)
        pdf.cell(17, LINE, d)
        pdf.cell(83, LINE, texts[0])
        pdf.cell(17, LINE, val)
        pdf.cell(20, LINE, fmt_ch(de) if de is not None else "", align="R")
        pdf.cell(20, LINE, fmt_ch(cr) if cr is not None else "", align="R")
        pdf.cell(23, LINE, fmt_ch(bal) if last_of_day else "", align="R")
        pdf.set_text_color(70)
        pdf.set_font("Lib", "", 7.2)
        for j, t in enumerate(texts[1:]):
            pdf.set_xy(L + 17, y + LINE * (j + 1))
            pdf.cell(83, LINE, t)
        pdf.set_text_color(0)
        y += h
        pdf.set_draw_color(215)
        pdf.set_line_width(0.1)
        pdf.line(L, y - 0.5, L + 180, y - 0.5)

    closing = bal
    pdf.set_draw_color(40, 70, 120)
    pdf.set_line_width(0.35)
    pdf.line(L, y, L + 180, y)
    y += 1.5
    favour = "en votre faveur" if closing >= 0 else "en notre faveur"
    pdf.set_font("Lib", "B", 8.5)
    pdf.set_xy(L, y)
    pdf.cell(120, 5.5, f"Solde {favour} au 31.10.2026")
    pdf.cell(60, 5.5, f"CHF {fmt_ch(abs(closing))}", align="R")
    y += 12
    pdf.set_font("Lib", "", 7.5)
    pdf.set_xy(L, y)
    rate = "8.75 %" if after else "9.50 %"
    pdf.multi_cell(180, 3.8, f"Taux d'intérêt débiteur: {rate} p.a. sur le découvert; les intérêts sont débités trimestriellement. "
                   "Veuillez vérifier ce relevé. Sans réclamation écrite dans les 30 jours, il est considéré comme approuvé. "
                   "Un signe moins (-) après un montant de la colonne Solde signale un découvert. Le solde est indiqué après la dernière opération de chaque jour.", align="L")
    return bytes(pdf.output()), {"pages": pdf.page_no(), "closing": closing}


def truth(mb, ma):
    return {
        "description": (
            "Three-page Swiss private-account statement in French (Relevé de compte) with Swiss number format "
            "(CHF 1'234.50), negative running balances written with a trailing minus (1'204.35-), dd.mm.yy dates, "
            "two- and three-line booking texts and carry-forward rows (À reporter / Report). Produced with fpdf2 2.9.0, "
            "embedded Liberation Sans Regular/Bold subsets (TrueType, Identity-H with ToUnicode), drawn cell by cell. "
            "Edits: credit limit lowered, one value date corrected, one booking text corrected, and on the last day a card "
            "refund that had been posted as a debit is now posted as a credit, so the amount 85.40 moves from the Débit to "
            "the Crédit column; as a result the final running balance and the closing balance change sign "
            "(43.30- / en notre faveur -> 127.50 / en votre faveur), and the overdraft interest rate in the footnote changes. "
            "Page breaks and all other balances (including the carry-forward rows) are unchanged."
        ),
        "synthetic": True,
        "set": "held-out-5",
        "blind": True,
        "truth": [
            {"type": "number", "old": "CHF 5'000.00", "new": "CHF 2'000.00", "oldPage": 1, "newPage": 1,
             "note": "Limite de crédit in the account info box."},
            {"type": "number", "old": "07.10.26", "new": "08.10.26", "oldPage": 1, "newPage": 1,
             "note": "Valeur (value date) of the 06.10.26 card purchase at Boulangerie Exemple, Morges."},
            {"type": "replace", "old": "prime octobre", "new": "prime novembre", "oldPage": 2, "newPage": 2,
             "note": "Second line of the 19.10.26 booking 'Ordre e-banking, Caisse-maladie Exemple'."},
            {"type": "position", "old": "85.40", "new": "85.40", "oldPage": 3, "newPage": 3,
             "note": "Card refund 'Remboursement carte, Boutique Exemple, Genève': the unchanged amount moves sideways from the Débit column to the Crédit column (about 57 pt to the right), which reverses its sign. The README claims sideways moves of unchanged lines; here only one cell of the line moves. A report as a number/sign change would also be correct."},
            {"type": "number", "old": fmt_ch(mb["closing"]), "new": "5.00 " + fmt_ch(ma["closing"]), "oldPage": 3, "newPage": 3,
             "note": "Running balance (Solde column) after the last booking, the account fee 5.00: the trailing-minus negative becomes positive (the README does not list a trailing minus among recognised sign notations). The new snippet includes the fee because 127.50 also appears in the closing line."},
            {"type": "replace", "old": "en notre faveur", "new": "en votre faveur", "oldPage": 3, "newPage": 3,
             "note": "Closing line wording: balance in the bank's favour (overdrawn) becomes balance in the customer's favour."},
            {"type": "number", "old": "CHF " + fmt_ch(abs(mb["closing"])), "new": "CHF " + fmt_ch(abs(ma["closing"])), "oldPage": 3, "newPage": 3,
             "note": "Closing balance amount on the same line; the sign is expressed by the wording, not by a minus."},
            {"type": "number", "old": "9.50 %", "new": "8.75 %", "oldPage": 3, "newPage": 3,
             "note": "Overdraft interest rate in the footnote."},
        ],
    }

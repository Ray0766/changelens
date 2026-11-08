"""Synthetic PDF pairs for the web app tests (test/web4-ui.test.ts).

    python3 test/fixtures/make-web4-fixtures.py

Needs reportlab (pip install reportlab). invariant=1 makes the output
byte-for-byte reproducible. All text is made up.

- web4-long-*.pdf: 36 A4 pages; one word changed on p. 6 and on p. 30
  (zooming and selecting far down a long document).
- web4-minor-*.pdf: one word edit, plus a rule line and a box that move
  2.5 pt (listed only under "Show" as slight shifts).
- web4-furniture-*.pdf: 3 pages whose header and footer change, and one
  edited clause (the "headers and footers ignored" notice with "Show").
"""
import os
import random
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

HERE = os.path.dirname(os.path.abspath(__file__))
WORDS = ("alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike "
         "november oscar papa quebec romeo sierra tango uniform victor whiskey xray yankee zulu").split()


def words(rng, n):
    return " ".join(rng.choice(WORDS) for _ in range(n))


def doc(name):
    return canvas.Canvas(os.path.join(HERE, name), pagesize=A4, invariant=1)


def long_doc(variant):
    c = doc(f"web4-long-{variant}.pdf")
    _, H = A4
    for p in range(36):
        rng = random.Random(1000 + p)
        c.setFont("Helvetica-Bold", 14)
        c.drawString(72, H - 80, f"Section {p + 1}")
        c.setFont("Helvetica", 11)
        y = H - 110
        for ln in range(14):
            text = f"{p + 1}.{ln + 1} " + words(rng, 7)
            if variant == "after" and p in (5, 29) and ln == 6:
                text += " amended"
            c.drawString(72, y, text)
            y -= 20
        c.showPage()
    c.save()


def minor_doc(variant):
    c = doc(f"web4-minor-{variant}.pdf")
    _, H = A4
    c.setFont("Helvetica", 12)
    c.drawString(72, H - 80, "Service agreement between the parties named below.")
    c.drawString(72, H - 110, "The fee is payable within thirty days of the invoice date.")
    c.drawString(72, H - 140, "Either party may " + ("end" if variant == "before" else "terminate") + " this agreement with notice in writing.")
    dy = 2.5 if variant == "after" else 0
    c.setLineWidth(1.5)
    c.line(72, H - 400 - dy, 400, H - 400 - dy)
    c.rect(72, H - 600 - dy, 200, 100)
    c.drawString(72, H - 650, "Signed for and on behalf of the client.")
    c.showPage()
    c.save()


def furniture_doc(variant):
    c = doc(f"web4-furniture-{variant}.pdf")
    _, H = A4
    for p in range(3):
        c.setFont("Helvetica", 9)
        c.drawString(72, H - 40, "Example Ltd - Services agreement - " + ("Draft 3 of 1 May 2026" if variant == "before" else "Draft 4 of 9 June 2026"))
        c.drawString(72, 40, f"Confidential - page {p + 1} of 3 - " + ("rev A" if variant == "before" else "rev B"))
        c.setFont("Helvetica", 12)
        rng = random.Random(50 + p)
        y = H - 100
        for ln in range(20):
            text = f"Clause {p + 1}.{ln + 1} " + words(rng, 8)
            if variant == "after" and p == 1 and ln == 5:
                text += " amended"
            c.drawString(72, y, text)
            y -= 22
        c.showPage()
    c.save()


for v in ("before", "after"):
    long_doc(v)
    minor_doc(v)
    furniture_doc(v)

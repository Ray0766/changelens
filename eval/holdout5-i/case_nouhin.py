"""Case holdout5-i-nouhinsho-jpy: Japanese delivery note (納品書), two pages, fpdf2 with embedded
IPAGothic (TTF subset, Identity-H), full grid table with header row repeated on page 2,
Code 39 barcode, red company seal drawn with rectangles, △ for the negative discount."""
from fpdf import FPDF
from fpdf_helpers import new_pdf, fmt_jpy, FONT_IPAG

SLUG = "holdout5-i-nouhinsho-jpy"
L = 15

ITEMS = [
    ("B-M6-20", "六角ボルト M6×20（ステンレス）", 500, "本", 9),
    ("B-M6-30", "六角ボルト M6×30（ステンレス）", 500, "本", 11),
    ("B-M8-25", "六角ボルト M8×25（ステンレス）", 300, "本", 16),
    ("B-M8-40", "六角ボルト M8×40（ステンレス）", 300, "本", 21),
    ("B-M10-40", "六角ボルト M10×40（亜鉛めっき）", 200, "本", 26),
    ("B-M10-60", "六角ボルト M10×60（ステンレス）", 100, "本", 38),
    ("N-M6", "六角ナット M6（ステンレス）", 1000, "個", 4),
    ("N-M8", "六角ナット M8（ステンレス）", 600, "個", 6),
    ("N-M10", "六角ナット M10（ステンレス）", 300, "個", 9),
    ("W-M6", "平座金 M6（ステンレス）", 1600, "枚", 3),
    ("W-M8", "平座金 M8（ステンレス）", 500, "枚", 5),
    ("SW-M8", "スプリングワッシャー M8（ステンレス）", 200, "枚", 12),
    ("SC-M4-10", "なべ小ねじ M4×10（十字穴）", 2000, "本", 3),
    ("SC-M5-12", "なべ小ねじ M5×12（十字穴）", 1000, "本", 4),
    ("HB-M6-16", "六角穴付きボルト M6×16", 400, "本", 14),
    ("HB-M8-20", "六角穴付きボルト M8×20", 300, "本", 19),
    ("TS-4-25", "タッピンねじ 4×25", 1000, "本", 2),
    ("AN-M10", "アンカーボルト M10×100", 50, "本", 145),
    ("EB-M8", "アイボルト M8", 20, "個", 260),
    ("U-50A", "Uボルト 50A", 30, "個", 180),
    ("SP-6-30", "スプリングピン 6×30", 500, "本", 7),
    ("RV-4-10", "ブラインドリベット 4×10", 2000, "本", 1),
    ("CL-20", "ホースバンド 20mm", 100, "個", 48),
    ("CL-32", "ホースバンド 32mm", 100, "個", 57),
    ("BR-L40", "L字金具 40×40", 80, "個", 62),
    ("BR-L60", "L字金具 60×60", 60, "個", 84),
    ("PL-100", "平プレート 100mm", 40, "枚", 95),
    ("ST-M8", "寸切りボルト M8×1000", 30, "本", 210),
    ("ST-M10", "寸切りボルト M10×1000", 30, "本", 290),
    ("CP-M8", "長ナット M8×24", 100, "個", 32),
    ("CAP-M8", "袋ナット M8", 200, "個", 18),
    ("WN-M6", "蝶ナット M6", 200, "個", 15),
    ("FN-M8", "フランジナット M8", 400, "個", 8),
    ("LK-M8", "ロックナット M8（ナイロン付）", 300, "個", 13),
    ("OR-P20", "Oリング P20（NBR）", 200, "個", 22),
    ("GR-400", "グリス 400g（リチウム系）", 6, "缶", 980),
    ("TP-13", "シールテープ 13mm×10m", 50, "巻", 75),
    ("BX-S10", "部品収納ケース 小（10個入）", 4, "箱", 1250),
    ("PK-01", "梱包・運送費", 1, "式", 3500),
]
COLS = [("No.", 9, "C"), ("品番", 21, "L"), ("品名・規格", 66, "L"), ("数量", 15, "R"), ("単位", 10, "C"),
        ("単価", 17, "R"), ("金額", 22, "R"), ("備考", 20, "L")]
ROW_H = 6.2
BOTTOM = 268


class Nouhin(FPDF):
    def footer(self):
        self.set_font("IPAG", "", 7)
        self.set_text_color(90)
        self.set_xy(L, 282)
        self.cell(130, 4, "架空精工株式会社　納品書 DN-2026-0582　※合成サンプル（synthetic sample）")
        self.set_xy(160, 282)
        self.cell(35, 4, f"{self.page_no()} / {{nb}} ページ", align="R")
        self.set_text_color(0)


def _head(pdf, y):
    pdf.set_font("IPAG", "", 8)
    pdf.set_fill_color(225, 225, 225)
    pdf.set_draw_color(60)
    pdf.set_line_width(0.25)
    pdf.set_xy(L, y)
    for n, w, a in COLS:
        pdf.cell(w, 6.5, n, border=1, align="C", fill=True)
    return y + 6.5


def build(version):
    after = version == "after"
    items = list(ITEMS)
    if after:
        items = [(a, d.replace("（亜鉛めっき）", "（三価クロメート）"), 250 if a == "SW-M8" else q, u, p) for (a, d, q, u, p) in items]
    discount = -2000 if after else -1500
    delivery = "2026年11月12日" if after else "2026年11月10日"

    pdf = new_pdf(Nouhin, format="A4")
    pdf.add_font("IPAG", "", FONT_IPAG)
    pdf.add_page()

    pdf.set_font("IPAG", "", 20)
    pdf.set_xy(L, 14)
    pdf.cell(180, 10, "納　品　書", align="C")
    pdf.set_draw_color(0)
    pdf.set_line_width(0.3)
    pdf.line(80, 25, 130, 25)
    pdf.line(80, 26, 130, 26)

    # right: slip number, date, barcode
    pdf.set_font("IPAG", "", 8.5)
    for i, (k, v) in enumerate((("伝票番号", "DN-2026-0582"), ("発行日", "2026年11月4日"))):
        pdf.set_xy(140, 31 + i * 5)
        pdf.cell(20, 5, k)
        pdf.cell(35, 5, v, align="R")
    pdf.set_fill_color(0)
    pdf.code39("*DN-2026-0582*", x=141, y=42, w=0.42, h=8)

    # customer
    pdf.set_font("IPAG", "", 13)
    pdf.set_xy(L, 33)
    pdf.cell(95, 7, "見本工業株式会社　御中")
    pdf.set_line_width(0.4)
    pdf.line(L, 40.5, L + 95, 40.5)
    pdf.set_font("IPAG", "", 8.5)
    pdf.set_xy(L, 43)
    pdf.multi_cell(95, 4.4, "資材部　ご担当者様\n〒000-0000　神奈川県見本市試験区１－２－３", align="L")

    # supplier block with logo and seal
    pdf.set_fill_color(0, 84, 147)
    pdf.rect(118, 57, 6, 6, "F")
    pdf.set_fill_color(0, 160, 200)
    pdf.rect(121, 60, 6, 6, "F")
    pdf.set_font("IPAG", "", 11)
    pdf.set_xy(129, 57)
    pdf.cell(60, 6, "架空精工株式会社")
    pdf.set_font("IPAG", "", 7.8)
    pdf.set_xy(129, 63.5)
    pdf.multi_cell(60, 3.9, "〒000-0001　東京都見本区試験町1-2-3\nTEL 03-0000-0000　FAX 03-0000-0001\n担当：営業一課", align="L")
    # company seal (角印): red square frame with two characters
    pdf.set_draw_color(200, 30, 30)
    pdf.set_line_width(0.6)
    pdf.rect(180, 57, 14, 14)
    pdf.set_line_width(0.25)
    pdf.rect(181.2, 58.2, 11.6, 11.6)
    pdf.set_text_color(200, 30, 30)
    pdf.set_font("IPAG", "", 9)
    pdf.set_xy(181.2, 59)
    pdf.cell(11.6, 5, "架空", align="C")
    pdf.set_xy(181.2, 64)
    pdf.cell(11.6, 5, "精工", align="C")
    pdf.set_text_color(0)

    pdf.set_font("IPAG", "", 9)
    pdf.set_xy(L, 58)
    pdf.cell(95, 5, "下記のとおり納品いたしました。")
    pdf.set_xy(L, 63)
    pdf.cell(95, 5, "ご査収のほどよろしくお願い申し上げます。")

    # info grid
    info = [("納品日", delivery), ("注文番号", "PO-33107"), ("納品場所", "第二工場 資材倉庫"), ("支払条件", "月末締め翌月末払い")]
    pdf.set_draw_color(60)
    pdf.set_line_width(0.25)
    pdf.set_fill_color(240, 240, 240)
    x = L
    for k, v in info:
        pdf.set_xy(x, 77)
        pdf.set_font("IPAG", "", 7.5)
        pdf.cell(45, 5, k, border=1, align="C", fill=True)
        pdf.set_xy(x, 82)
        pdf.set_font("IPAG", "", 8.5)
        pdf.cell(45, 6.5, v, border=1, align="C")
        x += 45

    rows = [(str(i + 1), a, d, f"{q:,}", u, f"{p:,}", fmt_jpy(q * p), "") for i, (a, d, q, u, p) in enumerate(items)]
    rows.append(("", "", "値引き（端数調整）", "", "", "", fmt_jpy(discount), "特別値引"))
    subtotal = sum(q * p for (_, _, q, _, p) in items) + discount
    tax = subtotal // 10
    total = subtotal + tax

    y = _head(pdf, 95)
    pdf.set_font("IPAG", "", 8)
    for r in rows:
        if y + ROW_H > BOTTOM:
            pdf.add_page()
            pdf.set_font("IPAG", "", 8)
            pdf.set_xy(L, 15)
            pdf.cell(180, 5, "納品書（続き）　伝票番号 DN-2026-0582　見本工業株式会社 御中")
            y = _head(pdf, 22)
            pdf.set_font("IPAG", "", 8)
        pdf.set_xy(L, y)
        for (n, w, a), t in zip(COLS, r):
            pdf.cell(w, ROW_H, t, border=1, align=a)
        y += ROW_H

    # totals
    y += 4
    for k, v in (("小計", subtotal), ("消費税（10%）", tax), ("合計", total)):
        pdf.set_xy(128, y)
        pdf.set_font("IPAG", "", 9 if k != "合計" else 10.5)
        pdf.set_fill_color(240, 240, 240)
        pdf.cell(28, 7, k, border=1, align="C", fill=True)
        pdf.cell(39, 7, "¥" + fmt_jpy(v), border=1, align="R")
        y += 7
    # remarks and receipt box
    pdf.set_xy(L, y - 21)
    pdf.set_font("IPAG", "", 7.5)
    pdf.cell(100, 5, "備考", border="LTR", fill=True)
    pdf.set_xy(L, y - 16)
    pdf.multi_cell(100, 4.2, "※ 本書は合成サンプル（synthetic sample）です。実在の企業・製品とは関係ありません。\n"
                   "※ 数量・規格に相違がある場合は、7日以内にご連絡ください。", border="LBR", align="L")
    y += 8
    pdf.set_xy(166, y)
    pdf.cell(28, 5, "受領印", border=1, align="C", fill=True)
    pdf.set_xy(166, y + 5)
    pdf.cell(28, 22, "", border=1)
    return bytes(pdf.output()), {"pages": pdf.page_no(), "subtotal": subtotal, "tax": tax, "total": total}


def truth(mb, ma):
    return {
        "description": (
            "Two-page Japanese delivery note (納品書) for fasteners from a fictional supplier, produced with fpdf2 2.9.0 "
            "with an embedded IPAGothic subset (TrueType, Identity-H) for all text, drawn cell by cell as a full grid with "
            "the header row repeated on page 2, a Code 39 barcode of the slip number, a logo of two squares and a red square "
            "company seal (角印) drawn with rectangles. Amounts are whole yen with commas, the discount row uses the "
            "Japanese triangle convention for negatives (△1,500), dates are written 2026年11月10日. Edits: the delivery date, "
            "the plating of one bolt (亜鉛めっき → 三価クロメート), the quantity of the M8 spring washers (200 → 250, its "
            "amount follows), the discount (△1,500 → △2,000), and the recomputed subtotal, consumption tax and total. "
            "No re-flow: page breaks are unchanged."
        ),
        "synthetic": True,
        "set": "held-out-5",
        "blind": True,
        "truth": [
            {"type": "number", "old": "2026年11月10日", "new": "2026年11月12日", "oldPage": 1, "newPage": 1,
             "note": "納品日 (delivery date) in the info grid."},
            {"type": "replace", "old": "亜鉛めっき", "new": "三価クロメート", "oldPage": 1, "newPage": 1,
             "note": "Plating in the description of B-M10-40 六角ボルト M10×40; CJK text compared character by character."},
            {"type": "number", "old": "200 枚", "new": "250 枚", "oldPage": 1, "newPage": 1,
             "note": "Quantity of SW-M8 スプリングワッシャー M8（ステンレス）; snippet includes the unit cell 枚."},
            {"type": "number", "old": "2,400", "new": "3,000", "oldPage": 1, "newPage": 1,
             "note": "Amount of the same row (quantity × 12)."},
            {"type": "number", "old": "△1,500", "new": "△2,000", "oldPage": 2, "newPage": 2,
             "note": "Discount row 値引き（端数調整）; negative written with the Japanese triangle △ instead of a minus sign. The README does not list △ as a recognised sign."},
            {"type": "number", "old": "¥" + fmt_jpy(mb["subtotal"]), "new": "¥" + fmt_jpy(ma["subtotal"]), "oldPage": 2, "newPage": 2, "note": "小計"},
            {"type": "number", "old": "¥" + fmt_jpy(mb["tax"]), "new": "¥" + fmt_jpy(ma["tax"]), "oldPage": 2, "newPage": 2, "note": "消費税（10%）"},
            {"type": "number", "old": "¥" + fmt_jpy(mb["total"]), "new": "¥" + fmt_jpy(ma["total"]), "oldPage": 2, "newPage": 2, "note": "合計"},
        ],
    }

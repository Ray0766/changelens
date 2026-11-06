"""Shared helpers for the held-out round 5 cases of author i (fpdf2 business documents).

All content is synthetic. Units inside fpdf2 are millimetres; truth rects are PDF points,
top-left origin ([x, y, w, h]).
"""
from datetime import datetime, timezone

MM = 72 / 25.4
FIXED_DATE = datetime(2026, 11, 4, 9, 0, 0, tzinfo=timezone.utc)

FONT_LIBERATION = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"
FONT_LIBERATION_B = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
FONT_DEJAVU = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_DEJAVU_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_WQY = "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"  # collection index 0 = WenQuanYi Zen Hei
FONT_IPAG = "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf"


def rect_pt(x, y, w, h):
    """mm rect -> [x, y, w, h] in PDF points (top-left origin), rounded to 0.1 pt."""
    return [round(x * MM, 1), round(y * MM, 1), round(w * MM, 1), round(h * MM, 1)]


def _group3(intpart, sep):
    s = str(intpart)
    out = []
    while len(s) > 3:
        out.insert(0, s[-3:])
        s = s[:-3]
    out.insert(0, s)
    return sep.join(out)


def _split(x):
    cents = round(abs(x) * 100)
    return cents // 100, cents % 100


def fmt_de(x):
    """German: 1.234,56 ; negative with leading hyphen-minus -150,00."""
    i, c = _split(x)
    s = f"{_group3(i, '.')},{c:02d}"
    return "-" + s if x < 0 else s


def fmt_ch(x):
    """Swiss: 1'234.50 ; negative with trailing minus 1'234.50-."""
    i, c = _split(x)
    s = f"{_group3(i, chr(39))}.{c:02d}"
    return s + "-" if x < 0 else s


def fmt_uk(x):
    """UK: 1,234.56 (no sign)."""
    i, c = _split(x)
    return f"{_group3(i, ',')}.{c:02d}"


def fmt_drcr(x):
    """UK ledger: 1,234.56 DR / 150.00 CR."""
    return f"{fmt_uk(x)} {'CR' if x < 0 else 'DR'}"


def fmt_paren(x):
    """Deductions in parentheses: (1,440.00)."""
    return f"({fmt_uk(x)})"


def fmt_jpy(n):
    """Japanese yen integer with comma; negative with the triangle convention: △1,500."""
    s = _group3(abs(int(n)), ",")
    return "△" + s if n < 0 else s


def new_pdf(cls, *args, **kwargs):
    import fpdf

    pdf = cls(*args, **kwargs)
    pdf.set_creation_date(FIXED_DATE)
    pdf.set_producer(f"fpdf2 {fpdf.__version__}")
    pdf.set_creator("holdout5-i synthetic sample generator")
    pdf.set_auto_page_break(False)
    return pdf


CN_DIGITS = "零壹贰叁肆伍陆柒捌玖"


def cny_in_words(amount):
    """Chinese capital-numeral amount (金额大写) for amounts below 100 million, e.g. 壹万柒仟陆佰叁拾柒元肆角整."""
    cents = round(amount * 100)
    yuan, rest = divmod(cents, 100)
    jiao, fen = divmod(rest, 10)

    def four(n):
        units = ["仟", "佰", "拾", ""]
        digits = f"{n:04d}"
        out, zero = "", False
        for d, u in zip(digits, units):
            if d == "0":
                zero = True
            else:
                if zero and out:
                    out += "零"
                out += CN_DIGITS[int(d)] + u
                zero = False
        return out

    wan, low = divmod(yuan, 10000)
    s = ""
    if wan:
        s += four(wan) + "万"
        if 0 < low < 1000:
            s += "零"
    if low:
        s += four(low)
    s = (s or "零") + "元"
    if jiao == 0 and fen == 0:
        return "人民币" + s + "整"
    if jiao:
        s += CN_DIGITS[jiao] + "角"
    elif fen:
        s += "零"
    if fen:
        s += CN_DIGITS[fen] + "分"
    else:
        s += "整"
    return "人民币" + s

"""Check helper: render before/after pages side by side (PyMuPDF), optionally with truth rects drawn.
Usage: python montage.py case_dir out.png [dpi]"""
import sys, json, pymupdf

def render(pdf, dpi, rects_by_page, color):
    doc = pymupdf.open(pdf)
    pixes = []
    for i, page in enumerate(doc):
        pix = page.get_pixmap(dpi=dpi)
        pixes.append((pix, page.rect if page.rotation == 0 else pymupdf.Rect(0, 0, page.rect.width, page.rect.height), rects_by_page.get(i + 1, [])))
    return pixes

def main():
    case, out = sys.argv[1], sys.argv[2]
    dpi = int(sys.argv[3]) if len(sys.argv) > 3 else 60
    truth = json.load(open(f"{case}/truth.json"))["truth"]
    old_r, new_r = {}, {}
    for t in truth:
        if "oldRect" in t: old_r.setdefault(t["oldPage"], []).append(t["oldRect"])
        if "newRect" in t: new_r.setdefault(t["newPage"], []).append(t["newRect"])
    sides = [render(f"{case}/before.pdf", dpi, old_r, (1, 0, 0)), render(f"{case}/after.pdf", dpi, new_r, (0, 0, 1))]
    z = dpi / 72
    cols = max(len(sides[0]), len(sides[1]))
    W = sum(max((s[i][0].width if i < len(s) else 0) for i in range(cols)) for s in [sides[0]]) 
    colw = [max((s[i][0].width if i < len(s) else 0) for s in sides) for i in range(cols)]
    rowh = [max(p[0].height for p in s) if s else 0 for s in sides]
    total = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, sum(colw) + 10 * cols, sum(rowh) + 10), 0)
    total.clear_with(200)
    y = 0
    for si, s in enumerate(sides):
        x = 0
        for i in range(cols):
            if i < len(s):
                pix = s[i][0]
                if pix.alpha: pix = pymupdf.Pixmap(pix, 0)
                pix.set_origin(x, y)
                total.copy(pix, pix.irect)
                for r in s[i][2]:
                    x0, y0, w, h = [v * z for v in r]
                    for xx in range(int(x0), int(x0 + w) + 1):
                        for yy in (int(y0), int(y0 + h)):
                            if 0 <= xx < pix.width and 0 <= yy < pix.height: total.set_pixel(x + xx, y + yy, (255, 0, 0) if si == 0 else (0, 0, 255))
                    for yy in range(int(y0), int(y0 + h) + 1):
                        for xx in (int(x0), int(x0 + w)):
                            if 0 <= xx < pix.width and 0 <= yy < pix.height: total.set_pixel(x + xx, y + yy, (255, 0, 0) if si == 0 else (0, 0, 255))
            x += colw[i] + 10
        y += rowh[si] + 10
    total.save(out)

if __name__ == "__main__":
    main()

"""Check helper: draw truth rects (red) on 60-dpi renders and paste before/after side by side."""
import json, sys, os, glob
from PIL import Image, ImageDraw
cdir, rdir, out = sys.argv[1], sys.argv[2], sys.argv[3]
truth = json.load(open(os.path.join(cdir, "truth.json")))
def pages(v):
    fs = sorted(glob.glob(os.path.join(rdir, v + "-*.png")), key=lambda s: int(s.rsplit("-", 1)[1][:-4]))
    return [Image.open(f).convert("RGB") for f in fs]
b, a = pages("before"), pages("after")
k = 60 / 72
for it in truth["truth"]:
    for key, pg, ims in (("oldRect", "oldPage", b), ("newRect", "newPage", a)):
        if it.get(key):
            x, y, w, h = it[key]
            d = ImageDraw.Draw(ims[it[pg] - 1])
            d.rectangle([x * k, y * k, (x + w) * k, (y + h) * k], outline=(255, 0, 0), width=2)
sel = [int(x) for x in sys.argv[4].split(",")] if len(sys.argv) > 4 else None
n = max(len(b), len(a))
rows = sel or list(range(1, n + 1))
w, h = b[0].size
img = Image.new("RGB", (2 * w + 20, len(rows) * (h + 10)), "gray")
for r, pn in enumerate(rows):
    if pn <= len(b): img.paste(b[pn - 1], (0, r * (h + 10)))
    if pn <= len(a): img.paste(a[pn - 1], (w + 20, r * (h + 10)))
img.save(out)

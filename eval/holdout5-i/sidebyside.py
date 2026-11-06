"""Render before/after pages (pdftoppm -r DPI) and paste them side by side: sidebyside.py CASEDIR OUTPREFIX [DPI]"""
import glob, os, subprocess, sys
from PIL import Image
case, prefix = sys.argv[1], sys.argv[2]
dpi = sys.argv[3] if len(sys.argv) > 3 else "60"
imgs = {}
for v in ("before", "after"):
    subprocess.run(["pdftoppm", "-r", dpi, "-png", os.path.join(case, v + ".pdf"), f"{prefix}-{v}"], check=True)
    imgs[v] = sorted(glob.glob(f"{prefix}-{v}-*.png"), key=lambda p: int(p.rsplit("-", 1)[1].split(".")[0]))
n = max(len(imgs["before"]), len(imgs["after"]))
for i in range(n):
    ims = [Image.open(imgs[v][i]) if i < len(imgs[v]) else None for v in ("before", "after")]
    w = max(im.width for im in ims if im) ; h = max(im.height for im in ims if im)
    out = Image.new("RGB", (2 * w + 10, h), "red")
    for j, im in enumerate(ims):
        if im: out.paste(im, (j * (w + 10), 0))
    out.save(f"{prefix}-sbs-{i+1}.png")
    print(f"{prefix}-sbs-{i+1}.png")

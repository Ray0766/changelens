"""Compare PDF.js getTextContent with pdftotext (raw and -layout) per page: report characters that differ."""
import collections, json, os, re, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
root = sys.argv[1]
for name in sorted(os.listdir(root)):
    for v in ("before", "after"):
        f = os.path.join(root, name, v + ".pdf")
        js = [p["text"] for p in json.loads(subprocess.run(["node", os.path.join(HERE, "extract.mjs"), f], capture_output=True, text=True, check=True).stdout)]
        for i, t in enumerate(js):
            pt = subprocess.run(["pdftotext", "-f", str(i + 1), "-l", str(i + 1), f, "-"], capture_output=True, text=True).stdout
            a, b = collections.Counter(re.sub(r"\s", "", t)), collections.Counter(re.sub(r"\s", "", pt))
            da, db = a - b, b - a
            same_order = re.sub(r"\s", "", t) == re.sub(r"\s", "", pt)
            if da or db or not same_order:
                print(f"{name} {v} p{i+1}: only PDF.js {dict(da)} only pdftotext {dict(db)} same order: {same_order}")

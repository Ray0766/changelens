#!/usr/bin/env python3
"""Regenerate the six held-out round 5 cases of author i (fpdf2 business documents).

Usage: <venv>/bin/python make-holdout5-i.py OUTDIR
Writes OUTDIR/holdout5-i-<slug>/{before.pdf, after.pdf, truth.json}. All content is synthetic.
"""
import json
import logging
import os
import sys
import warnings

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "holdout5-i"))
warnings.filterwarnings("ignore", message=".*NOT subset.*")
logging.getLogger("fontTools").setLevel(logging.ERROR)

import case_rechnung  # noqa: E402
import case_releve  # noqa: E402
import case_pricelist  # noqa: E402
import case_nouhin  # noqa: E402
import case_payslip  # noqa: E402
import case_statement  # noqa: E402

CASES = [case_rechnung, case_releve, case_pricelist, case_nouhin, case_payslip, case_statement]


def main():
    if len(sys.argv) != 2:
        sys.exit("usage: make-holdout5-i.py OUTDIR")
    out = os.path.abspath(sys.argv[1])
    for mod in CASES:
        d = os.path.join(out, mod.SLUG)
        os.makedirs(d, exist_ok=True)
        pb, mb = mod.build("before")
        pa, ma = mod.build("after")
        with open(os.path.join(d, "before.pdf"), "wb") as f:
            f.write(pb)
        with open(os.path.join(d, "after.pdf"), "wb") as f:
            f.write(pa)
        t = mod.truth(mb, ma)
        with open(os.path.join(d, "truth.json"), "w", encoding="utf-8") as f:
            json.dump(t, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print(f"{mod.SLUG}: {mb['pages']}→{ma['pages']} pages, {len(t['truth'])} truth items")


if __name__ == "__main__":
    main()

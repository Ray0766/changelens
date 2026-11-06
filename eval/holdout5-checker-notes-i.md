# Blind checker notes: author i (held-out round 5)

Checker tools and outputs: /tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/blind5/check-i/
(tools/pjs.mjs, tools/snip.py, tools/wdiff.py, tools/pxdiff.py, tools/drawcmp.py, tools/fmt.py, tools/bars.py, tools/hidden.py; renders in r60/, r144/, side-by-sides in sbs/; regen/ is the regenerated set).

## Fixes to truth.json

None. No truth.json was changed. All six cases passed every check, so the generator's truth() output and the case files are still the same.

## Checks run (all six cases)

1. Structure: all keys and flags are present (`synthetic: true`, `set: "held-out-5"`, `blind: true`), all types are valid, pages are explicit, no snippet is empty, both graphics have two-sided rects, inserts have no old side and deletes have no new side.
2. Snippets: each snippet occurs exactly once on its stated page in PDF.js `getTextContent` and at least once in `pdftotext -layout` and in raw `pdftotext`. No old snippet of a non-move/format/position item is in the new version on the stated page, and no new snippet is in the old version there. Two occur on another page, both harmless and both already noted by the author: nouhinsho `3,000` is the unchanged WN-M6 amount on old p2, and statement `Goods returned - damaged` is the August CRN 7301 on new p1.
3. Word diff (PDF.js items, whole document): only the listed edits show up, plus the consequences each description names: renumbering, the zebra flip, rows crossing page breaks, the summary block moving to p3, and "Page n of 2→3". I checked the arithmetic of every recomputed total against the ledger rows (invoice, payslip tax brackets, statement aged buckets, running balances, yen totals).
4. Pixel diff at 144 dpi on the no-reflow cases (nouhinsho, payslip, releve): every changed region matches a truth item, with nothing extra. Drawing signatures (PyMuPDF) on the reflow cases: the only changes are the listed band fill, the listed credit bar, the strike line, and row count and zebra changes from the listed inserts and deletes. Barcode bar patterns are the same in both versions (rechnung, nouhinsho, statement). Fonts, sizes and colours of unchanged strings do not change.
5. Rects: the pricelist band rects [42.5,459.8/442.2,510.2,17.6] and the statement credit bar [127.6,548.8/114.8,311.8,11.3] are exactly the drawn rectangles, and I checked them on 60 dpi overlays. The bar fill grows from 214.4 to 261.8 of 311.8 pt (68.8% to 84.0%).
6. Regeneration into check-i/regen: all 18 files are byte-identical to the case files.

## Observation for the author (not a truth defect, no change made)

- holdout5-i-pricelist-gbp, page 2 of both versions: the running header "Sample Garden Supply Ltd · Trade Price List 2027" (case_pricelist.py, PriceList.header, set_xy(L, 9)) is drawn at y≈28–35 pt. The repeated table heading row (fill 46,94,62, y 25.5–55.5) is then drawn on top of it, so the text is invisible in the render but still extracted. It is the same in both versions, so it creates no difference and the truth is unaffected. It is cosmetic hidden text: to fix it, move the table start below the header (e.g. set y to the top margin after the header cell). That would change the PDFs, so I leave it to the author.

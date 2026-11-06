# Blind checker notes: author h, held-out round 5

Checker scripts and output are in `/tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/blind5/check-h/`:
- `scripts/`: `pdfjs-dump.mjs`, `snippets.py`, `wdiff.py`, `stylediff.py`, `sbs.py`, `pair.py`
- `out/`: text extracts
- `renders/`, `sbs/`: 60-dpi renders and side-by-side images
- `regen/`: the generator re-run
- `truth-orig/`: the truth files as delivered

The PDFs were not changed.

## Results of the checks

1. **Structure.** All six truth.json files parse. They have only the brief's keys, `synthetic: true`, `set: "held-out-5"` and `blind: true`. Every item has explicit pages, and there are no empty snippets. Both graphic items have rects on both sides, which is correct because both graphics are two-sided.
2. **Snippets.**
   - The 49 text items carry 87 snippets. All 87 are found whitespace-insensitively on their stated page in PDF.js `getTextContent`, and exactly once there.
   - In pdftotext, 79 are found in plain mode. The other eight are the old and new snippets of four table items, and they are found only with `-layout`: ATR "October 0.38 0.42/0.48" and "20.8 −1.8/−2.6", and Prüfbericht "±0,05 42,47/42,44" and "0,007 i. O./n. i. O.".
   - No old snippet occurs on its old or new page in the new version, and no new snippet occurs on either page in the old version. Format and position items are exempt because their text does not change. Moved text occurs exactly once in each version.
3. **Text diff.** A word-level PDF.js diff of the whole document (line-end hyphens joined) shows only the listed edits plus the consequences each description names:
   - clause renumbering 6–10 and the move of the Non-Solicitation clause in the MSA;
   - the governing-law paragraph moving from p3 to p2 in the Dienstleistungsvertrag;
   - header/footer and footnote reading-order shifts, and repeated table header rows appearing or disappearing at page breaks, in the ATR.

   A PyMuPDF style diff of the matched words finds only the two intended bold changes. A drawing diff finds only:
   - the two underlines;
   - the December bar;
   - the M7 bar colour;
   - the stamp border;
   - table rules and signature lines that moved with re-flow.

   Every `ed`, `ins` and `del` switch, and every `AFTER` switch, in the six Typst sources maps to exactly one truth item. No edit is missing and no item is spurious.
4. **Renders.** I looked at every page of the five short cases side by side, with a pixel-diff panel, and at the edited ATR pages in pairs (27→28, 29, 30→30/31, 33, 34, 35, 36). The two graphic rects match the drawn bars within 2 pt:
   - Rapport: the December bar is (450.7, 122.5, 17.0, 81.6) before and (450.7, 103.3, 17.0, 100.8) after; the rect is [448.7, 101.3, 21.0, 104.8].
   - Prüfbericht: the M7 bar is (172.9, 109.1, 238.1, 14.2); the rect is [170.9, 107.1, 242.1, 18.2].
5. **Generator.** I ran `make-holdout5-h.py` into the empty folder `check-h/regen/`. All 12 PDFs and the 6 truth files came out byte-identical to the delivered ones. The run also rewrites `holdout5-h/atr.typ`, and its content was identical (same sha256).

## Fixes made in truth.json

None of these fixes changes a type, snippet, page or rect.

| Case | Item | What was wrong | Change | Evidence |
|---|---|---|---|---|
| holdout5-h-dienstleistungsvertrag | 5 (format, underline) | The note said the underline is "drawn as a filled rule". It is a stroked line. | The note now says: five stroked 0.44 pt line segments, with gaps at the descenders of 'g'. | The p2 content stream has `0.44 w … 0 0 m 39.63412 0 l S` (×5). PyMuPDF `get_drawings` gives type `s`. The SLA underline is also stroked (0.498 pt). |
| holdout5-h-services-agreement, holdout5-h-dienstleistungsvertrag | description | The producer sentence said "Libertinus Serif and New Computer Modern Math embedded by Typst", but these PDFs embed no math font. | It now says the PDF embeds Libertinus Serif Regular and Bold (bundled with Typst). | `pdffonts` lists only LibertinusSerif-Regular/Bold. |
| holdout5-h-bilingual-sla | description | The same producer sentence. This PDF has no math font but does embed WenQuanYi Zen Hei. | It now lists Libertinus Serif Regular/Bold and WenQuanYi Zen Hei (via font_paths). | `pdffonts` lists LibertinusSerif-Regular/Bold and WenQuanYiZenHei. |
| holdout5-h-rapport-annuel | 0 (GWh→MWh), 7 (move) | The brief asks for a note when an item tests something the README does not claim. These items sit in a two-column layout, and multi-column reading-order reconstruction is only on the README roadmap. | A sentence saying so was added to each note. PDF.js order shows Typst writes the left column first. | README "Roadmap"; PDF.js items on p1 run x=68 (left), then x=305 (right). |
| holdout5-h-pruefbericht | 0 (±0,5→±1,0), 1 (−1,2→−2,1) | The same two-column point. Item 1 is also inline math, which the README does not mention. | Sentences added to both notes. | README. |
| holdout5-h-rapport-annuel 3, holdout5-h-annual-technical-report 3 | inline-math numbers | Formulas are not mentioned in the README. | A sentence added to each note. | README. |

**Generator follow-up:** `make-holdout5-h.py` still has the old description and note strings in `CASES`. A regeneration would undo these fixes, so the author should copy the new strings into `CASES`, or not regenerate the truth files.

## Not changed, but worth knowing

- **Author's quirk list:** the claim "Underline: it is drawn as a filled rectangle, not stroked" is wrong for these PDFs (see above). I confirmed the micro-sign claim: PDF.js gives U+03BC and pdftotext gives U+00B5. I also confirmed that literal hyphens extract as "-" in all twelve PDFs, that math glyphs are separate items, and that no U+FB0x, U+FFFD or private-use characters appear.
- **Number words typed as `replace`:** "vier→zwei", the Chinese capital-numeral amount, and the unit-only change "GWh→MWh" are typed `replace`, not `number`. These are defensible author judgements, and each one has a note.
- **Furniture items:** the README says running headers and footers are ignored by default and only counted. The three header-date items in the Dienstleistungsvertrag therefore test the hidden-by-default path. The brief lists `furniture` as a reportable type, so I left them as they are.
- **No unintended edit was found in any PDF.**

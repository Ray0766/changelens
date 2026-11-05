# Evaluation

What was measured, how, and what it does — and does not — show. Reproduce with:

```bash
npx playwright install chromium   # only to regenerate the PDFs
node eval/make-cases.mjs          # optional: the PDFs are committed
node eval/run.ts --json eval/results.json
```

- `node eval/run.ts` scores every case that is not marked blind: 31 pairs, 117 truth items.
- Add `--blind` to include the cases marked blind (rounds 3 and 4), and `--cases 'holdout3-*'` or `--cases 'holdout4-*'` to score only one set.
- `--strict-snippets --strict-carets` applies the rules the round 1–3 blind runs were recorded with, and `--registered-rules` the rules registered for round 4 (see Scoring).
- `--rescore <items.json>` scores saved items without running the engine. This reproduces the recorded round-3 run exactly:

  ```bash
  node eval/run.ts --cases 'holdout3-*' --blind --rescore test/fixtures/holdout3-recorded-items.json --strict-snippets --strict-carets
  ```
- `npm test` runs the non-blind evaluation as a regression check (`test/eval.test.ts`).

## Corpus

All documents are **synthetic**, written for this test. Each case has a `truth.json` that lists the edits made on purpose. A truth item gives:
- the kind (number, replace, insert, delete, move, format, position, graphic, overflow, furniture);
- the text that must appear in the reported change;
- the pages, and for items without text a region (`oldRect` / `newRect`);
- optionally `maxItems`, how many reported items one edit may explain (a rename in six places).

Producers:
- the first 29 pairs: headless Chromium, plus one LibreOffice 24.2 pair;
- round 3: Chromium, LibreOffice Writer and Impress 24.2, and reportlab 5;
- round 4: Word, Excel and PowerPoint files (python-docx, openpyxl, python-pptx) rendered by LibreOffice 24.2, Chromium, reportlab, and PDFs assembled or post-processed with pypdf 6.

| Case | What was changed |
|---|---|
| identical | nothing |
| reflow-only | wider margins: every line break and page break moves, text unchanged (1 → 2 pages) |
| numbers | 8,000 → 9,500; 500 → −500 (U+2212); −1,200 → 1,200; 1.50 % → 1.05 %; November → December; days → weeks; US dollars → euros; one digit in 6.5 pt text |
| inserted-page | a new page after page 2 (4 → 5 pages) |
| duplicate-page | page 2 appears twice |
| move-and-edits | a paragraph moved from page 1 to the end of page 2; one phrase changed; one sentence deleted |
| move-beside-deletion | as above, but the paragraph lands right after the deleted sentence |
| font-swap | body font serif → sans-serif (everything re-flows) |
| graphic-moved | an approval stamp (frame plus the word APPROVED) moves 106 mm to the right |
| small-graphics, small-graphics-second-box | a tick added inside a 9 pt checkbox (the first, or the second of two); a 0.75 pt rule added |
| mixed-zh-en | Chinese with English terms: WCAG 2.2 → 2.1, React → Vue, 10 → 12 weeks, one paragraph deleted |
| demo-en / demo-zh | the bundled demos (8 → 9 pages): 13 / 12 edits across text, numbers, chart, colour, bold, move, overflow |
| libreoffice | justified text from LibreOffice: a word replaced, a paragraph inserted, a sentence moved up with a changed amount, a paragraph deleted |
| holdout-* (4) | **held-out round 1**: written by the engine's author after tuning, run once before any further change (see below) |
| holdout2-a-* (6), holdout2-b-* (6) | **held-out round 2**: written by two *independent* authors who did not read the engine, the tests or earlier results (`eval/make-holdout2-{a,b}.mjs`); run once (see below) |
| holdout3-c-* (6), holdout3-d-* (6) | **held-out round 3**: two more independent authors, business/legal documents and producer variety (`eval/make-holdout3-{c,d}.mjs`, brief in `eval/holdout3-brief.md`); run once (see below). Marked `"blind": true`, so `npm test` does not score them |
| holdout4-e-* (6), holdout4-f-* (6), holdout4-g-* (6) | **held-out round 4**: three more independent authors, Office files, long and Japanese/Traditional Chinese documents, PDFs assembled with pypdf (`eval/make-holdout4-{e,f,g}.mjs`, brief in `eval/holdout4-brief.md`); rules registered before one recorded run (see below), since used for fixes. Also marked blind |

## Methods compared

- **ChangeLens**: this repository, default settings (headers/footers ignored, visual comparison on, minor shifts hidden).
- **Text line diff**: text extracted line by line (headers and footers included, as `pdftotext` would), then a line diff over the whole document. This is the usual "extract and diff" approach.
- **Pixel page diff**: page N of the old file against page N of the new file at 72 dpi, with differing pixels (channel difference > 40) clustered into regions. This emulates the approach of diff-pdf; diff-pdf itself was not run.

**Scoring** (per truth item; code in `eval/score.ts`):

- **found**: some reported item covers the truth item. One item may cover several truth items.
  - **ChangeLens**: the change must be of the same kind (a deletion reported as a move is a miss) and contain the text. A truth item without text must instead be on its page and overlap its region.
  - **Line diff**: the hunk must contain the text.
  - **Pixel diff**: any region on the expected page counts. This rule is deliberately generous to that baseline: its regions have no text.
- **located**: found, and on the expected page in both files.
  - Pages must be explicit when a snippet is not unique.
  - An insertion has only a caret on the other side. A caret right at the start of a page also counts for the end of the page before it, and vice versa; `--strict-carets` turns this off.
- **separate**: the largest one-to-one assignment of items to truth items, i.e. found as an item of its own.
- **extra**: reported items that no truth item explains. This is what a reviewer reads for nothing. A truth item explains at most `maxItems` items (default 1).
- **Snippet rule**: a snippet also matches when the reported changed text lies inside it, and it lies inside what the reader sees around that change. For ChangeLens that is the excerpt's context; for the line diff, the lines around the hunk. This way `For 7 → For 6` matches a reported `7 → 6` in "For 7 Against 2". The rule was added after the blind round-3 run (see below). `--strict-snippets` restores plain containment, which the recorded blind runs used.
- **Rules decided after the round-4 run** (on by default, off with `--registered-rules` or either strict flag). The round-4 analysis found correct reports that the registered rules did not credit:
  - **one-sided regions**: a side where the change has no region (the old side of an added stamp) is not checked against the truth's region there; the other side must still overlap;
  - **part of a replace**: `每年 → 每半年` is met by an insertion of `半` when the excerpt shows both texts around it, and likewise for a deletion;
  - **overflow by region**: an overflow truth with a region is matched by page and region, because the cut-off text is partly missing from the text layer;
  - **header/footer lines**: a header or footer edit counts as disclosed when its texts lie in header/footer lines that differ, decided line by line, and not only when one hunk holds them.

  Re-scored from the recorded round-4 items, these rules alone move ChangeLens from 104 / 104 / 175 to 114 / 114 / 168. They change no number of the other sets.

These rules replaced a greedy one-to-one scorer on 2026-11-03 (see [DECISIONS D10](DECISIONS.md)). Under the old rule the baselines got too little credit. On the original 17 pairs:
- text line diff: 29 / 60 before, 42 / 60 now;
- pixel diff: 51 / 60 before, 60 / 60 now;
- ChangeLens: 60 / 60 under both.

## Results

Every case not marked blind (31 pairs, 117 truth items), on 2026-11-03 (`eval/results.json`). Found / located / extra, with separate in brackets:

| Set | Cases | Truth | ChangeLens | Text line diff | Pixel page diff |
|---|---|---|---|---|---|
| Tuning set | 12 | 25 | 25 / 25 / 0 (25) | 18 / 18 / 13 (10) | 25 / 23 / 16 (23) |
| Held-out round 1 (since used for fixes) | 4 | 9 | 9 / 9 / 0 (9) | 9 / 9 / 2 (6) | 9 / 9 / 27 (6) |
| Held-out round 2 (since used for fixes) | 12 | 53 | 53 / 53 / 0 (53) | 45 / 45 / 17 (41) | 53 / 52 / 44 (48) |
| Extra pairs (demos, LibreOffice) | 3 | 30 | 30 / 30 / 0 (30) | 17 / 17 / 24 (15) | 30 / 22 / 30 (26) |
| **All** | 31 | 117 | **117 / 117 / 0 (117)** | 89 / 89 / 56 (72) | 117 / 106 / 117 (103) |

Items to read: ChangeLens 117, text line diff 132 hunks, pixel diff 222 regions.

**These numbers are not evidence of generalisation.** Every case in this table was used to tune or fix the engine. The evidence that is not tuned is the first run of each held-out round, below.

Where the baselines lose:
- **Text line diff**:
  - It finds no graphics, colours or bold.
  - A changed number becomes "this line differs", with no type and no percentage.
  - Several edits in one line become one hunk: separate is 72 against 89 found.
  - Page numbers and re-wrapped lines create extra hunks: 11 in each demo, 3 for an inserted page.
- **Pixel page diff**: it finds that *something* changed on a page, but after an insertion every later page differs. That gives 31 extra regions in the Chinese price list and 12–16 in the demos, and in the demos many changes land on the wrong page (9 of 13 located in demo-en).

### Held-out round 4: registered before the run, then run once

**Setup.** Three independent authors wrote 18 cases (119 truth items) from [`eval/holdout4-brief.md`](../eval/holdout4-brief.md):
- author E: Office files (python-docx, openpyxl, python-pptx) rendered to PDF by LibreOffice. That is not Microsoft Office's own rendering.
- author F: long (41–85 pages) and multilingual documents (Japanese, Traditional Chinese, mixed scripts).
- author G: PDFs assembled or post-processed with pypdf (merged parts, rotated or cropped pages, watermarks, annotations, form fields, a scanned page).

The engine was frozen at `6cd041b`, and the rules were registered in `b5cee6f` before the run. The cases were committed together with the output of one run (`7c1a078`, files `eval/results-holdout4-blind*`). Truth files were not edited.

| Default rules (registered) | Found | Located | Extra | Separate |
|---|---|---|---|---|
| ChangeLens | 104 / 119 | 104 | 175 | 104 |
| Text line diff | 89 / 119 | 89 | 263 | 81 |
| Pixel page diff | 117 / 119 | 97 | 404 | 109 |

With the strict rules, rescored from the same run's items, ChangeLens is 88 / 87 / 191.

**Causes.** Every miss and extra item was classified by one agent per group of cases, and each classification was re-checked by a second agent. The second agent re-ran the CLI and looked at the renders; all counts reconcile with the table.

- **15 misses**:
  - **11 are scorer or truth issues.** ChangeLens reported the change, but the scorer did not credit it:
    - a header/footer change split into two hunks;
    - a one-sided graphic, such as an added stamp, signature or tick, whose truth gave a region on both sides;
    - "每年 → 每半年" reported as "Added 半";
    - the overflow of a cropped page.
  - **1 is a wrong kind**: "V2.3 → V2.4" is reported as a text change, not as a number.
  - **3 are not compared and not disclosed**: the values of PDF form fields. They are outside what the README claims, but nothing tells the reviewer that form fields were not compared. This breaks "nothing hidden silently".
- **175 extra items**:
  - **154 are noise**:
    - **62** are table header bands and pale table rules that came or went with the page breaks. The repeated header text itself is already hidden as a consequence; its fill and rules are not.
    - **39** are automatic numbering. This includes a Word numbered list in a table column (28 row numbers shifted by one), multi-level clause numbers (8.4 → 8.5), and LibreOffice's redline display of renumbered labels ("[4.3]").
    - **45** are colour, weight, strikethrough or underline reported on unchanged glyphs that only moved. Examples are CJK characters whose horizontal stroke reads as a line (一, 主, 年), small Japanese katakana, and words that a removed DRAFT watermark had covered.
    - **8** are other page-break artefacts, such as a repeated header row reported as a move that goes nowhere, or a group heading split across a page break.
  - **13** are correct reports that the scorer did not credit (see above).
  - **7** are misleading descriptions. Glyphs clipped by a new CropBox read as "Number changed: 4,800 → 4,8", and a rotated page gave two items.
  - **1** is a form field change reported only as a pixel change.

**What this shows.** ChangeLens reported 116 of the 119 edits, 115 of them with the right kind on the right pages. The only edits it missed are the three form field values, and it missed them silently. But on long, re-paginated and CJK-heavy documents it lists far more noise than on earlier rounds: 59 extra items in the 85-page plan, 33 in the 41-page trilingual manual, 32 in the Chinese/English annex. That noise is what a reviewer would have to read.

**Analysis file.** The per-item analysis, with examples, causes in the code and fix ideas, is in [`eval/results-holdout4-analysis.md`](../eval/results-holdout4-analysis.md). It is agent-written working material; the paths in it point to scratch folders that are not kept.

#### Round 4 after fix rounds 5 and 6 (no longer held out)

**Fix round 5** (commits `00517e0` to `82aa23a`) took the causes in this order:
1. **Form fields.** AcroForm text and choice field values are drawn by widget annotations, which PDF.js `getTextContent()` does not return. They are now read with `page.getAnnotations()` and compared as text, marked "(form field)". Check boxes, radio buttons and signatures stay visual. Password fields, rotated widgets and values that cannot be read as text are counted in a warning notice and compared only as images (since fix round 8, widgets turned by a quarter turn are compared as text).
2. **Header bands.** The fill and rules of a table row belong to that row's change, or to a header row repeated at a page top only because a page break moved. They are no longer separate graphic items.
3. **Renumbering.** Multi-level clause numbers, a column of row numbers, and tracked-change displays of labels (`4.3[4.4]`) are recognised. A shift explained by an added, removed or moved numbered item is hidden but counted.
4. **Appearance checks.** Strike, underline, colour and weight compare a glyph with itself in the other version, resampled at the sub-pixel position it moved to. CJK strokes no longer read as lines.
5. **Scorer.** The four rules above, kept apart from the registered ones.

**Adversarial probes.** These rules hide things, so three probe authors then built about 80 PDF pairs with real edits placed next to each suppressed pattern. Independent verifiers re-ran each one.
- 17 defects of medium or high severity were confirmed, 8 of them high. In each, a real edit was hidden as a consequence, or folded into another change. Examples:
  - labels renumbered by hand, with nothing added or removed, counted as automatic renumbering;
  - times and dates (`09.00`) taken for clause numbers;
  - amounts re-set beside a narrower CropBox folded into the "cut off" item;
  - strikes on 二 and 三 missed after a re-flow;
  - a word struck through or recoloured under a removed DRAFT watermark or an added PAID stamp.
- 7 defects of low severity were confirmed as well, mostly labels and noise.
- In the other probes the rule held: the edit was listed and the noise stayed hidden.

**Fix round 6** (commits `8a43eb8` to `1d349b6`) made each suppression need positive evidence that the item is a consequence of something already listed. A missing counter-example is no longer enough. For example:
- a renumbered label is hidden only when numbered siblings at the same level were added, removed or moved, and the shift equals their net count;
- cut-off text is folded only when the old text reached past the new edge and the visible glyphs kept their place;
- a word under a removed watermark is compared outside the watermark's ink.

All 17 are fixed. Each has a regression test built from the probe PDF (`test/engine6-*`, `test/visual6-probes.test.ts`), and the probes' controls are kept as tests, so the noise they cover stays hidden.

| Round 4, same 18 cases | ChangeLens | Text line diff | Pixel page diff |
|---|---|---|---|
| Recorded run (`6cd041b`), registered rules | 104 / 104 / 175 (104) | 89 / 89 / 263 (81) | 117 / 97 / 404 (109) |
| Recorded run, strict rules | 88 / 87 / 191 (88) | — | — |
| Recorded run, rules decided after the run | 114 / 114 / 168 (114) | — | — |
| Current engine, strict rules | 93 / 92 / 26 (93) | — | — |
| Current engine, registered rules | 108 / 108 / 10 (108) | 92 / 92 / 263 (83) | 117 / 97 / 404 (109) |
| Current engine, current rules | 118 / 118 / 4 (118) | 92 / 92 / 263 (83) | 117 / 97 / 404 (109) |

**This is not a blind result.** The engine was fixed with these cases in view, and the scorer rules were decided after seeing the run. The 10 edits that only the later rules credit are of the kinds the analysis classified as scorer issues:
- 4 header or footer edits, disclosed in differing header/footer lines but not in one hunk. One of them, the running line "Draft for discussion · 2 October 2026" of the services agreement, counted under the registered rules until fix round 8 (109 / 109 / 10). The comparison with headers and footers included then listed it inside a false "Moved and edited" passage that held the whole line. It is now an edit in place that holds only the changed words ("discussion · 2" → "signature · 12");
- 4 one-sided regions: an added stamp annotation and a sticky-note icon, an added signature image, the removed watermark;
- "每年 → 每半年" reported as "Added 半";
- the overflow of a cropped page.

The text line diff rose from 89 to 92 because its extraction now also reads form field values, as poppler's `pdftotext` does.

What remains:
- **1 miss**, a correct report. "10% → 5%" in clause 3.3 of the supply annex is listed on the right page. Its excerpt shows six characters after the figure (作为质量保证), while the truth snippet runs to 金.
- **4 extra items:**
  - **Supply annex, 2 items.** The cell counter row moved across a page break and took the repeated header cell along: "35 → 金额Amount 36", plus a deleted row that starts with 金额Amount. This is noise and a misleading description.
  - **85-page plan, 1 item.** "“alternative sources” moved 6 mm to the right" (p. 60). The risk register's columns were re-sized by the browser when row R-16 was added, so this is a consequence, not an edit.
  - **Watermark case, 1 item.** The second "Deleted “DRAFT”" (p. 2) is correct, but the truth item names page 1 only.

Known limits that the probes left open are listed in [`docs/PROGRESS.md`](PROGRESS.md):
- a 3/2 dash on a 0.75 pt rule;
- a fill removed from one copy of a repeated header row;
- a turned page with fewer than 3 matched words;
- times without a leading zero, which get a percentage (`12.00 → 13.00 (+8.3%)`).

### Held-out round 3: independent authors, other producers, first run

Two new agents wrote twelve cases (73 truth items) from a brief that forbade reading `src/`, `test/`, the scorer, earlier results and these docs, and running ChangeLens (the brief: [`eval/holdout3-brief.md`](../eval/holdout3-brief.md)). The coordinator chose the two focus areas:
- **Author C**: business and legal documents in English and Chinese, from Chromium, LibreOffice Writer and reportlab. The set covers a supply agreement with a clause moved to another page and a header change, a Chinese quotation with an inserted page and amounts in Chinese capital numerals, interim financial statements (`−£7.4m`, `(312)`), bilingual board minutes with a duplicated page, a Chinese purchase contract with re-flow, and a retention policy with a rename in five places.
- **Author D**: production variety. It includes a LibreOffice Impress deck, a Writer report with dot leaders, footnotes and a struck-through sentence, a reportlab report with vector charts and an inserted page without text, a 30-page Chromium A5 manual with one early insertion, a Chinese two-column layout, and a Writer rate card where the font is substituted.

The cases were committed together with the result of one run of the unchanged engine (commit `622d2db`, engine as of `ca101c0`, files `eval/results-holdout3-blind.{json,txt}`). Found / located / extra (separate):

| | Found | Located | Extra | Separate |
|---|---|---|---|---|
| ChangeLens | 55 / 73 | 54 | 38 | 55 |
| Text line diff | 57 / 73 | 56 | 57 | 49 |
| Pixel page diff | 73 / 73 | 65 | 38 | 66 |

**On this set ChangeLens found fewer edits than the plain text line diff.** The reasons, from the run's own output:

- **13 misses: the truth snippet is wider than what ChangeLens reports.** For uniqueness, the authors wrote snippets like `For 7 → For 6`, `14 November → 28 November`, `30个日历日 → 45个日历日` and `DAP (Delivered at Place) → FCA (Free Carrier)`. ChangeLens reports the changed tokens (`7 → 6`, `14 → 28`) and shows the rest only as context. The line-diff baseline reports whole lines, so it contains such snippets by construction. Each of these reported changes was on the right page, but the scorer requires the reported text to contain the snippet.
- **5 misses: real engine defects.**
  - An inserted sentence started at the previous sentence's full stop (`. The lenders … 2026`).
  - A second insertion was shifted by a word in the same way.
  - A Chinese clause rewrite was split into two items (`提 → 向` and the rest).
  - A deleted Chinese sentence from LibreOffice got a space at a line break (`签 订`).
  - A struck-through sentence over two lines became two items.
- **1 wrong page**: a duplicated page reported as inserted before old p. 3, where the truth says after old p. 2. Both describe the same boundary.
- **Of the 38 extra items, 20 are the reported counterparts of the misses above.** They are the right change, but did not match the snippet. The other **18 are noise a reviewer would also see**:
  - 6 repeated table header rows, which moved with the page breaks and were reported as added or deleted text;
  - 8 "graphic added/removed" regions from table borders and rules on LibreOffice pages whose content re-flowed;
  - 3 lines that re-flowed into the other column of a two-column page, reported as "moved 94 mm to the right";
  - 1 footnote marker that the truth meant to cover but whose snippet did not match.

**After the run**, the snippet rule above was added to the scorer, and the engine was fixed for the defects and the noise. Fixes:
- repeated header rows at the top of a page are hidden but counted, like renumbered list items;
- sentence-boundary sliding;
- paragraph continuation across loose line spacing, which fixes the Chinese split and the space;
- magnitude suffixes;
- running-header rules compared in place;
- decorations merged across a line break;
- no position change for lines that changed column.

With these, the same 12 cases score as follows. **This is not a blind result: the set has now been used for fixes.**

| Round 3, after fixes | ChangeLens | Text line diff | Pixel page diff |
|---|---|---|---|
| Recorded blind run (strict rules) | 55 / 54 / 38 (55) | 57 / 56 / 57 (49) | 73 / 65 / 38 (66) |
| Current engine, strict rules | 61 / 60 / 13 (61) | 57 / 56 / 57 (49) | 73 / 65 / 38 (66) |
| Current engine, current rules | 73 / 73 / 1 (73) | 57 / 56 / 57 (49) | 73 / 65 / 38 (66) |

The snippet rule changed no baseline number. The one remaining extra item is the added footnote marker “7”. The truth item for the new footnote is meant to cover both the marker and the note (`maxItems: 2`), but its snippet only matches the note text.

### Held-out round 2: independent authors, first run

Two separate agents wrote twelve new cases (53 truth items). They worked from the acceptance list in the quality brief and were not allowed to read `src/`, `test/`, the scorer or any results. Author A covered business documents: invoices with bank details, a lease with an added clause, a supplier renamed six times, Chinese price lists, a Chinese policy footnote, and a zh/en schedule. Author B covered layout stressors: repeated table header rows, list renumbering, justified re-wrap, a landscape page with a replaced logo, a footnote with duplicated content, and Chinese text with changed margins. Each author also recorded the judgement calls they made, for example that auto-renumbered list items are consequences rather than edits.

The cases were committed together with the result of a single run of the unchanged engine (commit `3a15a7f`, files `eval/results-holdout2-blind.{json,txt}`). That run counts as **found / extra**:

| Case | Pages | Truth | ChangeLens | Text line diff | Pixel page diff |
|---|---|---|---|---|---|
| a-invoice-bank-details | 1→1 | 6 | 5 / 1 | 5 / 0 | 5 / 0 |
| a-lease-clause-added | 3→4 | 4 | 4 / 0 | 4 / 4 | 4 / 4 |
| a-services-supplier-renamed | 3→3 | 5 | 4 / 1 | 2 / 6 | 1 / 0 |
| a-zh-en-project-schedule | 2→2 | 5 | 4 / 1 | 3 / 0 | 5 / 0 |
| a-zh-policy-footnote | 2→2 | 5 | 5 / 0 | 4 / 1 | 4 / 0 |
| a-zh-price-list | 3→3 | 5 | 4 / 1 | 3 / 2 | 5 / 31 |
| b-footnote-duplicate | 3→3 | 4 | 4 / 0 | 4 / 0 | 4 / 0 |
| b-justified-rewrap | 2→2 | 4 | 4 / 0 | 2 / 0 | 3 / 0 |
| b-landscape-logo | 3→3 | 4 | 4 / 0 | 3 / 0 | 4 / 0 |
| b-list-renumber | 2→2 | 4 | 4 / 5 | 3 / 0 | 3 / 0 |
| b-thead-pricelist | 3→3 | 4 | 4 / 0 | 4 / 2 | 4 / 7 |
| b-zh-margins | 3→3 | 3 | 3 / 0 | 3 / 2 | 3 / 2 |
| **Total** | | **53** | **49 / 9** | **40 / 17** | **45 / 44** |

Every ChangeLens item that was found was also located on the right page (49 / 49). The four misses and nine extra items have four causes:

1. **`−€62.40 → €62.40`**: a sign in front of a currency symbol was not attached to the number, so the change was reported as "Deleted «−»".
2. **`4% → 8%`, `60% → 75%`, `5% → 3%`**: the percent sign was left out of the reported number. The description lost the "%", and the truth snippet did not match.
3. **List renumbering**: inserting a step renumbered items 4–8 to 5–9, which produced five number changes. These are consequences, not edits.
4. **The same rename in six places**: this was reported as six items. It was not counted as wrong (the truth item covers all six), but it was noisy.

All four were fixed: signs before currency symbols, units kept with numbers, renumbering hidden but counted, and repeated replacements merged ("in N places"). After the fixes the round-2 cases score 53 / 53 with 0 extra, **but they are no longer held out**.

### Held-out round 1: first run, unchanged

These four cases were written after the engine had been tuned on the others, and run once before any further change:

| Case | Truth | Found | Extra | What went wrong |
|---|---|---|---|---|
| holdout-header-change | 1 | 0 → **scorer bug** | 1 | ChangeLens did report "DRAFT → FINAL"; the scorer only accepted the "ignored header" disclosure. The scorer was fixed, not the engine. |
| holdout-long-table | 3 | 2 | 4 | `(1,200)` (accounting negative) was split into "(" and ")" deletions; 2 graphic items came from table borders around the page break |
| holdout-two-columns | 1 | 1 | 0 | — |
| holdout-zh-letter | 4 | 4 | 0 | — |
| **Total** | 9 | 7 | 5 | |

The fixes made afterwards:
- accounting negatives parsed as numbers;
- each pixel row assigned to its nearest anchor;
- 3 × 3 blur against anti-aliasing phase;
- minor shifts by a common offset;
- a 9 pt "explained by text change" margin.

The held-out cases now score 9 / 9 with 0 extra, but **they are no longer held out**. New held-out cases are needed for the next claim.

### Earlier snapshot

Before the fixes of this round (first 12 cases, 49 truth items), ChangeLens scored 46 found, 46 located and 3 extra. The misses were:
- signs (`−500`) not treated as numbers;
- a header counted as deleted when a one-page document became two pages;
- a font substitution reported as 9 separate items.

## Performance

Measured with `node eval/perf.ts`, which generates the 24 → 24 page pair itself (`eval/make-cases.mjs --perf-pair`) and times one fresh process per run (wall time, peak RSS, no report). The demo row times `node eval/perf.ts public/samples/proposal-{before,after}.pdf` three times. Machine: 4-core Intel Xeon @ 2.10 GHz, 15 GB RAM, Node 22.23, measured on 2026-11-03 with no other job running:

| Pair | Text only | Text + visual |
|---|---|---|
| Demo, 8 → 9 A4 pages | 0.5–0.6 s · 189 MB | 5.4–5.7 s · 353 MB |
| Generated 24 → 24 A4 pages (15 changes), median of 3 | 0.8 s · 197 MB | 11.7 s · 376 MB |

**The visual stage got slower in the review round.** Same machine, same demo pair:
- 3.3–3.7 s at commit 158e537;
- 4.9–5.1 s after the first fix round;
- 5.4–5.7 s at the end of that round.

**Fix rounds 5 and 6, A/B on one machine.** On 2026-11-04 the session ran on a different VM: 4-core Intel Xeon @ 2.80 GHz, Node 22.23. Absolute times there are about twice those above, also for the old code, so the two machines are not comparable. Runs alternated between `5398f2b` (before fix round 5) and `a722e40`:

| Pair | `5398f2b` | `a722e40` |
|---|---|---|
| Demo, text + visual, 3 runs | 9.8–10.9 s · 314–329 MB | 10.4–11.6 s · 320–334 MB |
| 24 → 24 pages, text only, median of 3 | 1.5 s · 195 MB | 1.5 s · 198 MB |
| 24 → 24 pages, text + visual, median of 3 | 21.1 s · 343 MB | 23.0 s · 366 MB |

The checks added in fix rounds 5 and 6 cost about 5–10 % in the visual stage, and nothing measurable in the text stage.

The extra time comes from the checks that were added for missed changes: strikethrough and underline, faint fills and hairlines, ink balance for shifts, and re-checking regions against neighbouring pages. Most of the time is spent in the per-pixel comparison (`unmatched`, 23 %), the 3 × 3 min/max planes (13 %) and the blur (10 %). Text comparison takes about 0.6 s of the total.

**Memory.**
- Report crops used to keep every rendered page: 6.8 GB peak for a 151-page pair with `-o`, 0.74 GB after the fix.
- Pages are rendered within a pixel budget (8 M pixels for comparison). Pages too large to compare (above about 14 M pt², e.g. 2A0) are skipped, and a notice names them.
- A 14 400 × 14 400 pt page now takes about 230 MB instead of being killed above 10 GB.

The browser app runs the same pipeline; it was not timed separately.

## What this does not show

- **The corpus is small and synthetic.**
  - Most cases were written by the same author as the engine and used for tuning.
  - Four first runs exist:
    - four cases by the engine's author: 7 / 9 found, 5 extra;
    - twelve cases by two independent authors: 49 / 53 found, 9 extra;
    - twelve more by two other independent authors: 55 / 73 found, 38 extra, fewer found than the text line diff (57);
    - eighteen by three other independent authors, with rules registered before the run: 104 / 119 found, 175 extra.
  - All four sets have since been used for fixes, so the next claim needs new held-out cases.
- **The probes are not independent evidence.** The round-6 probes were written knowing the rules they attack, and the fixes were tested on them. They show that those cases work, not that over-suppression is gone.
- **The round-3 analysis matters as much as the number.**
  - Most misses there were correct changes whose reported text was narrower than the truth snippet. The rule now credits them, but it was added after the run.
  - The real defects and noise it exposed were fixed only for the kinds of documents in that set.
- **Producers.** Tested: Chromium, LibreOffice Writer, Calc and Impress (24.2, also from .docx/.xlsx/.pptx files), reportlab, and PDFs assembled with pypdf. Untested: Microsoft Office's own PDF export, InDesign, LaTeX, encrypted files, XFA forms, vertical CJK writing, and documents of more than about 150 pages. A scanned page (one round-4 case) is compared only as an image and named as a page without text; there is no OCR.
  - Rotated pages and simple two-column layouts are only covered by synthetic tests and one round-3 case.
- **Baselines.** The pixel baseline emulates diff-pdf's idea; it is not diff-pdf. Neither Acrobat nor Draftable was compared.
- **Scope of the result.** Passing this corpus proves this corpus. It does not prove correct behaviour on arbitrary PDFs, and the tool's output is not a professional review.

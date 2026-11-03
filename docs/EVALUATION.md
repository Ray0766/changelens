# Evaluation

What was measured, how, and what it does — and does not — show. Reproduce with:

```bash
npx playwright install chromium   # only to regenerate the PDFs
node eval/make-cases.mjs          # optional: the PDFs are committed
node eval/run.ts --json eval/results.json
```

`npm test` runs the same evaluation as a regression check (`test/eval.test.ts`).

## Corpus

All documents are **synthetic**, written for this test. The PDFs were produced by headless Chromium, plus one pair by LibreOffice 24.2. Each case has a `truth.json` that lists the edits made on purpose. Truth items give the kind (number, replace, insert, delete, move, format, position, graphic, overflow, header) and the text that must appear in the reported change. Expected pages are derived from where that text sits in each file, or given explicitly.

| Case | What was changed |
|---|---|
| identical | nothing |
| reflow-only | wider margins: every line break and page break moves, text unchanged (1 → 2 pages) |
| numbers | 8,000 → 9,500; 500 → −500 (U+2212); −1,200 → 1,200; 1.50 % → 1.05 %; November → December; days → weeks; US dollars → euros; one digit in 6.5 pt text |
| inserted-page | a new page after page 2 (4 → 5 pages) |
| duplicate-page | page 2 appears twice |
| move-and-edits | a paragraph moved from page 1 to page 2; one phrase changed; one sentence deleted |
| font-swap | body font serif → sans-serif (everything re-flows) |
| graphic-moved | an approval stamp (frame plus the word APPROVED) moves 106 mm to the right |
| small-graphics | a tick added inside a 9 pt checkbox; a 0.75 pt rule added |
| mixed-zh-en | Chinese with English terms: WCAG 2.2 → 2.1, React → Vue, 10 → 12 weeks, one paragraph deleted |
| demo-en / demo-zh | the bundled demos (8 → 9 pages): 13 / 12 edits across text, numbers, chart, colour, bold, move, overflow |
| libreoffice | justified text from LibreOffice: a word replaced, a paragraph inserted, a sentence moved up with a changed amount, a paragraph deleted |
| holdout-* (4) | **held-out round 1**: written by the engine's author after tuning, run once before any further change (see below) |
| holdout2-a-* (6), holdout2-b-* (6) | **held-out round 2**: written by two *independent* authors who did not read the engine, the tests or earlier results (`eval/make-holdout2-{a,b}.mjs`); run once (see below) |

## Methods compared

- **ChangeLens**: this repository, default settings (headers/footers ignored, visual comparison on, minor shifts hidden).
- **Text line diff**: text extracted line by line (headers and footers included, as `pdftotext` would), then a line diff over the whole document. This is the usual "extract and diff" approach.
- **Pixel page diff**: page N of the old file against page N of the new file at 72 dpi, with differing pixels (channel difference > 40) clustered into regions. This emulates the approach of diff-pdf; diff-pdf itself was not run.

**Scoring** (per truth item):
- *found*: some reported item covers it.
  - ChangeLens must have a compatible type and contain the text.
  - The line diff must contain the text.
  - The pixel diff counts if it has any region on the expected page; this rule is deliberately generous to that baseline.
- *located*: found, and on the expected page in both files where applicable.
- *extra*: reported items that match no truth item. This is what a reviewer reads for nothing.

## Results

Run on 2026-11-03 after the fixes listed below (`eval/results.json`):

| | Found | Located | Extra items | Items to read |
|---|---|---|---|---|
| **ChangeLens** | **60 / 60** | **60 / 60** | **0** | 60 |
| Text line diff | 29 / 60 | 27 / 60 | 37 | 66 |
| Pixel page diff | 51 / 60 | 41 / 60 | 74 | 125 |

Where the baselines lose:
- **Text line diff**: it finds no graphics, colours or bold. A changed number becomes "this line differs", with no type. Page numbers and re-wrapped lines create extra items: 11 in each demo, and 3 for an inserted page.
- **Pixel page diff**: it finds that *something* changed on a page, but after an insertion every later page is different. That gives 27 regions in the long-table case and 12–16 in the demos, and in the demos the changes land on the wrong page (7 of 13 located).

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

These causes are being fixed, and **after that this set is no longer held out either**. Re-scored numbers are reported separately below, and are not a blind result.

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

Measured with `node eval/perf.ts`: one process per run, wall time, peak RSS. Machine: 4-core Intel Xeon @ 2.10 GHz, 16 GB RAM, Node 22.23.

| Pair | Text only | Text + visual |
|---|---|---|
| Demo, 8 → 9 A4 pages | 0.52 s · 188 MB | 3.1 s · 333 MB |
| Generated 24 → 24 A4 pages | 1.4 s · 233 MB | 10.3 s · 451 MB |

The visual stage costs about 0.4 s per page pair at 1.5× scale and dominates the total. The browser app runs the same pipeline; it was not timed separately.

## What this does not show

- The corpus is small and synthetic. Most cases were written by the same author as the engine and used for tuning. Two blind runs exist: four cases by the engine's author (7 / 9 found, 5 extra), and twelve cases by independent authors (49 / 53 found, 9 extra). Both sets have since been used for fixes, so the next claim needs new held-out cases.
- Only Chromium and LibreOffice PDFs were tested. Word, InDesign, LaTeX, scanned, encrypted, rotated, multi-column-flow and very large (> 100 pages) documents are untested.
- The pixel baseline emulates diff-pdf's idea; it is not diff-pdf. Neither Acrobat nor Draftable was compared.
- Passing this corpus proves this corpus. It does not prove correct behaviour on arbitrary PDFs.

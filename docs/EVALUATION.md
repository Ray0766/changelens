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
| holdout-* (4) | **held-out**: written after tuning, run once before any further change (see below) |

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

### Held-out cases: first run, unchanged

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

- The corpus is small, synthetic, and **written by the same author as the engine**. Most cases were used for tuning; only the four held-out cases were run blind, once.
- Only Chromium and LibreOffice PDFs were tested. Word, InDesign, LaTeX, scanned, encrypted, rotated, multi-column-flow and very large (> 100 pages) documents are untested.
- The pixel baseline emulates diff-pdf's idea; it is not diff-pdf. Neither Acrobat nor Draftable was compared.
- Passing this corpus proves this corpus. It does not prove correct behaviour on arbitrary PDFs.

# Evaluation

What was measured, how, and what it does — and does not — show. Reproduce with:

```bash
npx playwright install chromium   # only to regenerate the PDFs
node eval/make-cases.mjs          # optional: the PDFs are committed
node eval/run.ts --json eval/results.json
```

- `node eval/run.ts` scores every case that is not marked blind: 31 pairs, 117 truth items.
- Add `--blind` to include the blind round-3 set, and `--cases 'holdout3-*'` to score only that set.
- `--strict-snippets --strict-carets` applies the rules the blind runs were recorded with (see Scoring).
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
- round 3: Chromium, LibreOffice Writer and Impress 24.2, and reportlab 5.

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
- 5.4–5.7 s now.

The extra time comes from the checks that were added for missed changes: strikethrough and underline, faint fills and hairlines, ink balance for shifts, and re-checking regions against neighbouring pages. Most of the time is spent in the per-pixel comparison (`unmatched`, 23 %), the 3 × 3 min/max planes (13 %) and the blur (10 %). Text comparison takes about 0.6 s of the total.

**Memory.**
- Report crops used to keep every rendered page: 6.8 GB peak for a 151-page pair with `-o`, 0.74 GB after the fix.
- Pages are rendered within a pixel budget (8 M pixels for comparison). Pages too large to compare (above about 14 M pt², e.g. 2A0) are skipped, and a notice names them.
- A 14 400 × 14 400 pt page now takes about 230 MB instead of being killed above 10 GB.

The browser app runs the same pipeline; it was not timed separately.

## What this does not show

- **The corpus is small and synthetic.**
  - Most cases were written by the same author as the engine and used for tuning.
  - Three first runs exist:
    - four cases by the engine's author: 7 / 9 found, 5 extra;
    - twelve cases by two independent authors: 49 / 53 found, 9 extra;
    - twelve more by two other independent authors: 55 / 73 found, 38 extra, fewer found than the text line diff (57).
  - All three sets have since been used for fixes, so the next claim needs new held-out cases.
- **The round-3 analysis matters as much as the number.**
  - Most misses there were correct changes whose reported text was narrower than the truth snippet. The rule now credits them, but it was added after the run.
  - The real defects and noise it exposed were fixed only for the kinds of documents in that set.
- **Producers.** Tested: Chromium, LibreOffice Writer and Impress (24.2), reportlab. Untested: Word, InDesign, LaTeX, scanned, encrypted, vertical CJK writing, and documents of more than about 150 pages.
  - Rotated pages and simple two-column layouts are only covered by synthetic tests and one round-3 case.
- **Baselines.** The pixel baseline emulates diff-pdf's idea; it is not diff-pdf. Neither Acrobat nor Draftable was compared.
- **Scope of the result.** Passing this corpus proves this corpus. It does not prove correct behaviour on arbitrary PDFs, and the tool's output is not a professional review.

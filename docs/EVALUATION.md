# Evaluation

What was measured, how, and what it does — and does not — show. Reproduce with:

```bash
npx playwright install chromium   # only to regenerate the PDFs
node eval/make-cases.mjs          # optional: the PDFs are committed
node eval/run.ts --json eval/results.json
```

- `node eval/run.ts` scores every case that is not marked blind: 31 pairs, 117 truth items.
- Add `--blind` to include the cases marked blind (rounds 3, 4 and 5), and `--cases 'holdout3-*'`, `--cases 'holdout4-*'` or `--cases 'holdout5-*'` to score only one set.
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

Fix round 8 (below) left every figure in this table unchanged; the run on the merged branch is in [Review round 7 and fix round 8](#review-round-7-and-fix-round-8-probes-not-held-out). Fix round 9 left them unchanged too (run on the merged engine `b5332f4`, 2026-11-07; [Held-out round 5 after fix round 9](#held-out-round-5-after-fix-round-9-no-longer-held-out)).

Where the baselines lose:
- **Text line diff**:
  - It finds no graphics, colours or bold.
  - A changed number becomes "this line differs", with no type and no percentage.
  - Several edits in one line become one hunk: separate is 72 against 89 found.
  - Page numbers and re-wrapped lines create extra hunks: 11 in each demo, 3 for an inserted page.
- **Pixel page diff**: it finds that *something* changed on a page, but after an insertion every later page differs. That gives 31 extra regions in the Chinese price list and 12–16 in the demos, and in the demos many changes land on the wrong page (9 of 13 located in demo-en).

### Held-out round 5: registered before the run

- **Authors and focus**: three independent authors wrote 18 cases (144 truth items) from [`eval/holdout5-brief.md`](../eval/holdout5-brief.md). Each used a PDF producer not used in earlier rounds:
  - author H: Typst 0.15 (contracts and reports in English, German and French, one long report, one English/Chinese agreement);
  - author I: fpdf2 2.9 (invoices, statements, a price list, a payslip, a delivery note; currencies and negative-amount conventions; Chinese and Japanese TrueType fonts);
  - author J: PyMuPDF 2.1 (edits as PDF editors make them: redact and re-insert, HTML boxes, annotations, page operations, an incremental save; Chinese and Japanese HTML boxes).

  The brief forbade the authors to read the engine's code, its tests, the docs other than the quality brief and the earlier held-out rounds, or to run ChangeLens; they could read the README, including its limits. The cases stayed outside the repository, and every fixer and verifier of fix round 8 was told not to open them, until this registration.
- **Checked before the run**: a separate blind checker per author re-checked every truth file against the PDF.js and pdftotext text, the renders and a regenerated copy, and could change only truth files. Their notes are in `eval/holdout5-checker-notes-{h,i,j}.md`. They changed notes and descriptions in H, a region, a snippet and a description in one J case, and nothing in I. All 18 truth files pass the scorer's `validate()` at registration.
- **Engine**: frozen at `f1053f3` until the run. Its engine is that of the merged fix round 8 (`2af63c3`); the commits after the merge change only docs, and the registration commit adds only the cases, their sources and notes, this text and the set label in `eval/run.ts`.
- **Rules, fixed before seeing any result**:
  - The headline number uses the default rules of `eval/score.ts` at `f1053f3`: the context rule for snippets, carets at a page boundary counting for both pages, and the four rules decided after round 4.
  - Reported next to it: the rules registered for round 4 (`--registered-rules`) and the strict rules (`--strict-snippets --strict-carets`), both rescored from the same run's items.
  - The cases are committed with this registration, before the run. Truth files are not edited after the run, except to fix a structural error that stops the scorer from reading them; any such fix is listed with the result.
- **What is published**: the output of one run, committed unchanged whatever it shows, then a classification of every miss and extra item, each re-checked by a second agent. The run is:

  ```
  node eval/run.ts --cases 'holdout5-*' --blind --verbose --json eval/results-holdout5-blind.json --items eval/results-holdout5-blind-items.json
  ```
- **Reproducing the PDFs**: `eval/make-holdout5-{h,i,j}.py` with the producers in `eval/requirements-holdout5.txt` and the helpers in `eval/holdout5-{h,i,j}/`. They use system fonts (Inter, IPA Gothic, Carlito, DejaVu, Liberation, WenQuanYi Zen Hei). The brief names the authors' session paths, and the authors' check scripts (`*.mjs`) import PDF.js from `/home/user/changelens/node_modules`; change those paths to run them elsewhere. The committed PDFs are what was scored.

### Held-out round 5 after fix round 9 (no longer held out)

**Fix round 9** used the 18 cases of round 5, and their first-run analysis, to fix causes 1–4 and 6 below and to read PDF markup annotations. Round 5 is therefore no longer held out, and nothing in this section is a blind result. The round ran in two streams, each through five or six passes of fix and independent verification, merged in `7fbce04`:
- **Text** (`b35fcaf` to `29ec513`):
  - Lines drawn after the page footer are put back in reading order by their position on the page (`restoreReadingOrder` in `src/core/tokenize.ts`) and compared there. PDF editors store re-typed text that way, and so do browsers for positioned text. An info notice names the pages ("New version p. 1, 3: 5 lines of text are stored after the page footer, out of reading order …"), and the JSON coverage has `outOfOrder`. This is done only where the footer is drawn after the body.
  - Row numbers set closer than one em to the next cell are recognised as row numbers (cause 2).
  - The excerpt context in Chinese and Japanese is sized by a character budget instead of six characters, and dates written with 年, 月 and 日 are compared as one date, without a percentage (cause 4).
  - A full-width minus right after a Chinese character is read as the sign of its figure, with exceptions for range dashes.
- **Visual** (`a10bc75` to `823b442`):
  - A rule that closes a table at a moved page break is counted with the table header rows repeated at a page top, with **Show** (cause 3).
  - Thin and light lines are measured by their colour distance from the paper, not by how much darker they make the word (cause 6).
  - Highlight, strike-out, underline and squiggly annotations are read from the file with PDF.js `getAnnotations` (`src/pdf/extract.ts`) and listed by name on the words they cover ("Highlighted (annotation): …"). Stamps and free-text notes are named with their text ("Stamp added (annotation): “FOR COMMENT”"). A notice counts a file's annotations by kind.
- After the merge: `b5332f4` corrects one test expectation, `e275c10` fixes two web layout problems the final check found (below), and `107364f` corrects the wording of the annotation notice.

The fixes come with regression tests built from SYNTHETIC probe PDFs (`test/engine9-*`, `test/visual9-*`, fixtures `test/fixtures/probe9-*`). In passes 5 and 6 the fixers followed one rule for every new problem a verifier found: fix it narrowly or restore the behaviour of the published engine (`25e9ffe`), and hide an item only with evidence that it follows from a listed change (DECISIONS D13).

Run on 2026-11-07 on the merged engine (`b5332f4`, whose `src/` equals the merge `7fbce04`). `107364f` changes only one notice text and the web layout; the 12 cases with residuals, re-run on it, give the same items. Found / located / extra (separate):

| Round 5, same 18 cases | ChangeLens | Text line diff | Pixel page diff |
|---|---|---|---|
| First run (`f1053f3`), default rules | 115 / 115 / 78 (114) | 98 / 96 / 112 (73) | 144 / 132 / 59 (118) |
| First run, `--registered-rules` | 111 / 111 / 79 (110) | — | — |
| First run, strict rules | 72 / 70 / 118 (71) | — | — |
| After fix round 9, default rules | **139 / 139 / 16 (138)** | 110 / 109 / 95 (85) | 144 / 132 / 59 (118) |
| After fix round 9, `--registered-rules` | 133 / 133 / 17 (132) | 110 / 109 / 95 (85) | 144 / 132 / 59 (118) |
| After fix round 9, strict rules | 89 / 86 / 61 (88) | 110 / 109 / 95 (85) | 144 / 132 / 59 (118) |

**The text line diff moved** from 98 / 96 / 112 to 110 / 109 / 95. That baseline diffs the lines of ChangeLens's own text model (`lineItems` in `eval/run.ts`), and that model now has re-typed text in reading order. The pixel page diff did not change.

By producer, default rules:

| Producer | Truth | ChangeLens now | First run | Text line diff now | Pixel page diff |
|---|---|---|---|---|---|
| Typst 0.15 (H) | 51 | 48 / 48 / 9 (48) | 48 / 48 / 19 (48) | 37 / 36 / 85 (34), unchanged | 51 / 46 / 31 (38) |
| fpdf2 2.9 (I) | 48 | 46 / 46 / 6 (46) | 44 / 44 / 36 (44) | 43 / 43 / 7 (25), unchanged | 48 / 47 / 24 (40) |
| PyMuPDF 2.1 (J) | 45 | 45 / 45 / 1 (44) | 23 / 23 / 23 (22) | 30 / 30 / 3 (26), was 18 / 17 / 20 (14) | 45 / 39 / 4 (40) |
| **All** | 144 | **139 / 139 / 16 (138)** | 115 / 115 / 78 (114) | 110 / 109 / 95 (85) | 144 / 132 / 59 (118) |

**The twelve causes** of the first run (numbered as below, under "Held-out round 5: first run"), misses / extra items:

| # | Cause | First run | Now | Status |
|---|---|---|---|---|
| 1 | Re-typed text after the footer (PyMuPDF); same-place join too narrow | 18 / 20 | 0 / 0, plus 1 new related extra item | fixed |
| 2 | Row numbers set close to the next cell | 0 / 28 | 0 / 0 | fixed |
| 3 | Closing rules of table fragments at moved page breaks | 0 / 10 | 0 / 0 | fixed |
| 4 | Six characters of CJK context; 年月日 date not read as a number | 3 / 3 | 0 / 0 | fixed |
| 5 | Rewrite split around an unchanged phrase; context from the new side only | 2 / 4 | 2 / 4 | not fixed (outside the round) |
| 6 | Thin or light lines judged by luminance | 3 / 1 | 0 / 0 | fixed |
| 7 | Moves across page breaks past a footnote or a later-pages-only running header | 0 / 4 | 0 / 4 | not fixed (outside the round) |
| 8 | Background changes under unchanged text | 0 / 4 | 0 / 3 | partly (not a target) |
| 9 | Visual items carry no context and skip punctuation | 1 / 1 | 1 / 1 | scoring only, unchanged |
| 10 | Sideways moves checked per whole line only | 1 / 1 | 1 / 1 | not fixed; the miss is now documented |
| 11 | DR/CR not read as a sign | 1 / 1 | 1 / 1 | scoring only; the engine part is not fixed either |
| 12 | Re-justified line fails the in-place test of a footnote edited in place | 0 / 1 | 0 / 1 | not fixed (outside the round) |
| | **All** | **29 / 78** | **5 / 16** | |

Notes on the table:
- **Cause 1.** The six PyMuPDF cases give 45 of 45 found, 44 of them as items of their own, with 1 extra item. The new extra item is in the lease: "“2027” size 10.5 → 7.5 pt, font LiberationSerif → Helvetica" beside "Changed “March to May” → “April to June”". It is true (PyMuPDF's spans show the font and size), but the truth file counts a font change of re-typed text as part of the edit. It appears because the re-typed text is now compared in place. The two scoring-only header misses of the first run ("Rev. B → Rev. C") are now credited.
- **Cause 2.** The invoice gives the notice "29 list numbers changed only because numbered items were added, removed or moved; they are not listed." and no number change per row.
- **Cause 3.** The 37-page report gives "5 lines repeated at the top of a page…, and 5 rules closing a table at the foot of the page before, came or went only because page breaks moved; they are not listed."
- **Cause 4.** The payslip's "陆 → 柒" is credited, and the delivery note reads "Number changed: 2026年11月10日 → 2026年11月12日" with no percentage (first run: "10 → 12 (+20%)").
- **Cause 6.** The 0.4 pt strike on the re-flowed price-list row is listed ("Struck through: “Anvil loppers 70 cm, ratchet”"), and the red strike-out and the #00ff00 underline of the audit case are credited, read as annotations.
- **Cause 8.** The false "Underlined: “L”" is gone. It went as a side effect, either of the colour-distance line test or of the renumbering fold; which one was not traced.

**What remains.**
- **5 misses** (144 − 139):
  - 4 correct reports the scorer does not credit: the underline item of the German service contract stops before the final full stop of the truth snippet (cause 9); two rewrites are listed as two adjacent items each, split around an unchanged phrase (Prüfbericht #7, services agreement #8; cause 5); "DR → CR" is listed as a word change, not as a number (cause 11).
  - 1 not checked: the amount 85.40 moved from the Débit to the Crédit column of an unchanged row (relevé #4, cause 10). Nothing is listed or disclosed, and the result counts as complete. The README now states this case under Sideways moves.
  - Not counted as a miss: the handbook's new page "5A Lone working" is found and placed, but inside one insertion with the duplicated page next to it ("Added 7 paragraphs"), so it is not an item of its own, and the "repeats p. 3 word for word" note is missing. The README names this under Descriptions and excerpts.
- **16 extra items**:
  - 7 true consequences: 4 moves across page breaks (cause 7: a footnote that followed its reference, the governing-law paragraph of the German contract, a price-list row and an invoice row below a running header printed only on later pages), 2 flipped zebra shadings in the invoice (cause 8) and the lease's "2027" format item (cause 1).
  - 7 correct items the scorer cannot credit (causes 5, 9, 10 and 11): the pieces of the misses above, and the first line of a moved two-line stamp, listed as its own position item.
  - 2 false items: "Moved and edited a paragraph" for a footnote edited in place on a justified line (cause 12), and "Text colour or weight changed" on unchanged text under a re-tinted band in the price list (cause 8).

**Credited items that still mislead**, without changing a count:
- "+44%" and "+51%" on changes between two negative values;
- "4471 → 8803 (+97%)" on the digits of an account number in the payslip;
- △1,500 → △2,000 shown as "1,500 → 2,000 (+33%)", without the △;
- "+194%" on the relevé's closing balance across a sign change written in words;
- new: "Number changed: 1 → 15 (+1400%)" on the day of a date in the lease, now that the re-typed day is compared in place.

**How the residuals were checked.** The CLI was re-run on `107364f` for the 12 cases with misses, extra items or notes to check; in each case the changes (kind, old and new text) equal the items of the evaluation run. The extra items were assigned per item with `assign()` of `eval/score.ts` under the current rules, by a script that reproduces 139 / 139 / 16 (138) on these items and 115 / 115 / 78 (114) on the recorded first-run items. Unlike the first run's, this classification has had no second, independent check.

**The merged engine** was verified as a whole by an independent verifier, against the published engine `25e9ffe` and the two stream branches:
- the CLI on all 79 evaluation pairs on four trees (316 runs): in every case the merged result equals the published engine's plus the text stream's changes plus the visual stream's changes, and nothing appears that neither stream produces;
- 1,782 text probe pairs identical between the merged engine and the text stream, and 473 visual probe pairs whose visual items are identical between the merged engine and the visual stream;
- 58 SYNTHETIC counter-probes where the streams meet (re-typed text under or next to annotations, closing rules beside re-typed cells, CJK dates and signed figures under a highlight). Every real edit is listed. One false item was found: "Text colour or weight changed" on an unchanged CJK date that a PDF editor re-typed under an unchanged highlight (low; the text stream gives it too, the published engine does not);
- the web app (en and zh, at 1280 px, 390 px and 200 % zoom, keyboard order, reduced motion) and 12 HTML reports. Its two problems were fixed after this check, in `e275c10`. At 200 % zoom (640 × 400) the new notices had squeezed the change list of an annotated file to 16 px (published engine: 142 px); the summary panel now scrolls on its own past 40 % of the sidebar, and the list keeps 100 px, measured after the fix. On the landing page at 391–900 px, the arrow between the drop zones covered the centre of the BEFORE zone and of the Compare button and took their clicks (also in the published engine); it no longer does.

`npm run typecheck` passes on the merged engine, and `npm test` passes 576 of 576 on `107364f`. The other sets: 31 non-blind pairs 117 / 117 / 0; round 3 73 / 73 / 1; round 4 119 / 119 / 3 (119), and 109 / 109 / 9 with the registered rules (see the round-4 section). Speed: [Performance](#performance).

**What this does not show.**
- **These are not blind results.** The fixes were made with these 18 cases and with probes built for them, by the same kind of agent that verified them. Most of the gain is on the causes that were fixed; the causes outside the round are where they were.
- **All the documents are synthetic.** The PyMuPDF cases imitate what PDF editors do; no file from a real editor such as Acrobat was tested.
- **Re-typed text is placed only where the footer is drawn after the body.** Where the footer is drawn first (a reportlab canvas, office suites) the text is compared in stream order as before, with no notice (README: Reading order).
- **Annotations were tested only as written by PyMuPDF 2.1 and pypdf.**
- A claim about new documents needs a new held-out round.

### Held-out round 5: first run

Run once on 2026-11-06 with the registered command, recorded unchanged in `1768e2d` (`eval/results-holdout5-blind.{txt,json}`, items in `eval/results-holdout5-blind-items.json`). Rescored from the same items in `cfa9bc5` (`eval/results-holdout5-blind-registered.*`, `eval/results-holdout5-blind-strict.*`).

Found / located / extra (separate), default rules (the headline as registered):

| Producer | Cases | Truth | ChangeLens | Text line diff | Pixel page diff |
|---|---|---|---|---|---|
| Typst 0.15 (H) | 6 | 51 | 48 / 48 / 19 | 37 / 36 / 85 | 51 / 46 / 31 |
| fpdf2 2.9 (I) | 6 | 48 | 44 / 44 / 36 | 43 / 43 / 7 | 48 / 47 / 24 |
| PyMuPDF 2.1 (J) | 6 | 45 | 23 / 23 / 23 | 18 / 17 / 20 | 45 / 39 / 4 |
| **All** | 18 | 144 | **115 / 115 / 78 (114)** | 98 / 96 / 112 (73) | 144 / 132 / 59 (118) |

ChangeLens under the other registered rules, from the same items:
- `--registered-rules` (round 4's rules): 111 / 111 / 79;
- `--strict-snippets --strict-carets` (rounds 1–3): 72 / 70 / 118.

What the numbers say, before any classification:
- **Fewer found than the pixel page diff.** ChangeLens found 115 of 144 edits; the pixel page diff marks some region on 144 pages, 132 of them the right page, but does not say what changed. ChangeLens found more than the text line diff (98).
- **More extra items than the pixel page diff**: 78 against 59 (text line diff: 112).
- **The PyMuPDF cases account for most misses.** ChangeLens found 23 of 45 there, against 48 of 51 with Typst and 44 of 48 with fpdf2. These are the edits PDF editors make: redacted text with new text inserted, annotations, overlays, page operations and an incremental save. The datasheet with an overlay gave 1 of 8 and the redacted lease 3 of 7.
- **One fpdf2 invoice gave 32 of the 78 extra items** (`holdout5-i-rechnung-eur`), most of them listed as "Number changed: 8 → 9", "9 → 10", and so on (`eval/results-holdout5-blind.txt`).

**Causes.** Every miss and extra item was classified by one analyst agent per group of three cases, and each classification was re-checked by an independent verifier agent. Each verifier re-ran its cases from a git archive whose `src/` equals `f1053f3` and got items identical to the recorded ones. The six verifiers agreed with all 64 entries. A synthesis agent then summed the categories and grouped the causes. The counts add up: 29 misses (144 − 115) and 78 extra items.

| Category (verified) | Misses | Extra items |
|---|---|---|
| Missed silently, within the documented scope | 2 | 0 |
| Shown, but in a misleading form | 18 | 22 |
| Correct report, not credited by the scorer or the truth file | 8 | 9 |
| True consequence the truth names, which the engine should fold or count | 0 | 44 |
| Not an edit (noise) | 0 | 3 |
| Not checked and not disclosed, outside what the README claimed | 1 | 0 |
| **All** | **29** | **78** |

The causes, ordered by the number of items they affect:
1. **Re-typed text after the footer (PyMuPDF)**: 18 misses and 20 extra items, in 5 of the 6 PyMuPDF cases.
   - Text that PyMuPDF writes after redacting, and its HTML boxes, come after the page footer in the content stream, and ChangeLens keeps stream order.
   - `compare.ts` `inPlaceTokens` joins a deletion and an insertion at the same place only for hunks that a same-key pairing already touched.
   - So the reviewer gets "Deleted X" in place and the new value inside a separate "Added …", highlighted in place but with the text at the end of the page as its excerpt. Several values are merged ("1,975.00 15 March 2027 Retail"), and false rewrites cross pages ("Rewrote 86 words").
   - 2 of the 18 misses are scoring only: the header "Rev. B → Rev. C", which the header count discloses.
2. **Row numbers set close to the next cell**: 28 extra items in one fpdf2 invoice.
   - The Pos. column stands 0.67 em before the next cell, and the row-number rule needs a gap of one em.
   - So the +1 shift after an inserted row is listed row by row, each with a percentage.
   - Round 4 had the same class of problem, blocked by a different rule.
3. **Closing rules of table fragments at moved page breaks**: 10 extra items in the 37-page Typst report. Each rule is listed as an underline added or removed on the last row, and again as a graphic.
4. **Six characters of context in Chinese and Japanese, and a 年月日 date change that takes in 月 (11月30 → 12月31) not read as a number**: 3 misses and 3 extra items. Round 4's `zh-en-supply-annex` #3 had the same cause, and it was not fixed before the freeze.
5. **A rewrite split around an unchanged phrase, with context taken from the new side only**: 2 misses and 4 extra items.
6. **Thin or light lines judged by luminance**: 3 misses and 1 extra item.
   - 2 misses are silent and within the documented scope: a 0.4 pt black strike on a re-flowed row and a 0.73 pt #00ff00 underline.
   - 1 is a red strike-out annotation listed as a colour change.
   - The README claimed that strikes in black and red are found.
7. **Moves across page breaks past a footnote, or past a running header printed only on later pages**: 4 extra items.
8. **Background changes under unchanged text**: 4 extra items. They are flipped zebra shading, a false underline on an "L", and a false colour change under a re-tinted band.
9. **Visual items carry no context and skip punctuation**: 1 miss and 1 extra item, scoring only.
10. **Sideways moves checked per whole line only**: 1 miss and 1 extra item.
    - The miss: an amount moved from the Débit to the Crédit column of an unchanged row. It is not listed and not disclosed.
    - The extra item: a two-line stamp moved and gave one item per line (scoring).
11. **DR/CR not read as a sign**: 1 miss and 1 extra item, scoring only. The word change DR → CR was listed.
12. **A re-justified line fails the in-place test of a footnote edited in place**: 1 extra item, a false "Moved and edited" for a footnote that did not move.

Some credited items mislead too, without changing a count:
- "+44%" for −1.8 → −2.6 in a "Change (%)" column;
- "+20%" on a day of the month;
- "+97%" on the digits of an account number;
- 1,500 → 2,000 for △1,500 → △2,000;
- "+194%" on the closing balance 43.30 → 127.50, whose sign change is written in words ("en notre faveur" → "en votre faveur"); the running balance 43.30- → 127.50, written with a trailing minus, gets no note at all.

The README then listed all of these under "Scope and limitations". Some function-level traces (logged values in `crossingBack`, `overlayInk` and `addedLine`, and one analyst's experimental patch) were made by the analysts only. The verifiers re-checked the facts they rest on (PDF.js text order, spans, fills, renders) but not those logged values.

**Against the baselines.**
- **Overall.** ChangeLens found more edits than the text line diff (115 against 98) and listed fewer extra items (78 against 112). It found fewer than the pixel page diff, which marks a region on an expected page (old or new) for all 144 edits and on the expected page in both files for 132, with 59 extra regions.
- **Per case.** ChangeLens found fewer than the pixel diff in 13 of 18 cases, and fewer than the text line diff in 2: the payslip and the datasheet with an overlay.
- **Typst.** ChangeLens beats the text line diff on every count and has fewer extra items than the pixel diff (19 against 31). Its 3 misses there are all scoring only.
- **fpdf2.**
  - ChangeLens found 44 against 43 for the text line diff, but with 36 extra items against 7; 32 of them are in one invoice.
  - Of its 4 misses, 2 are scoring only, 1 is the silent 0.4 pt strike and 1 is the Débit/Crédit move.
- **PyMuPDF.** ChangeLens is weakest here: 23 of 45 found. The pixel diff found all 45 (39 on the right page) with 4 extra regions.

**What this shows.** ChangeLens had not seen PDFs from Typst or fpdf2 before. On them it found 92 of 99 edits; 5 of the 7 misses were correct reports that the scorer did not credit. Most of its extra items there are consequences of re-flow and renumbering that it should fold or count: 44 of 55.

On PDFs edited the way PDF editors edit them (PyMuPDF redaction, re-inserted text, annotations), the engine at `f1053f3` was not fit for review. It found 23 of 45 edits. Many of the rest are split into deletions and insertions elsewhere, and no notice warns about this. The pixel page diff did better on these cases on every count.

No fix was made before this classification was published: the engine of the run is `f1053f3`. Fix round 9 has since used these cases, so they are no longer held out; the results after it are in [Held-out round 5 after fix round 9](#held-out-round-5-after-fix-round-9-no-longer-held-out).

**Analysis file.** The per-item analysis, with evidence, causes in the code and fix ideas, is in [`eval/results-holdout5-analysis.md`](../eval/results-holdout5-analysis.md). A scratch script (`write-analysis.py`, not kept in the repository) arranged it from the agents' structured output and checked the sums. They can be recounted from the `xN` counts and `verified` tags of its entries. It is agent-written working material; the paths in it point to scratch folders that are not kept.

### Review round 7 and fix round 8 (probes, not held out)

**Review round 7** probed the engine at `a722e40` (after fix round 6). It used seven lenses: renumbering, page edges and numbers, form fields, appearance (strike, underline, colour), page structure, robustness, and the diff itself.
- Seven review agents built about 1,970 SYNTHETIC probe PDFs. Each put a real edit next to a pattern that a rule hides, folds or relabels, with a control that lacks the edit.
- Independent verifiers re-ran every finding: 86 were confirmed and 9 partly confirmed, and the verifiers found 11 more.
- Of these 106 findings, 27 were high severity: 13 real edits missing, 8 folded into another change, and 6 hidden as a consequence of another rule. 58 were medium and 21 low; most of those were noise (48) or wrong labels (19).
- 26 findings were regressions new in fix rounds 5 and 6; 80 were already in the engine before them (`82aa23a`).

**Fix round 8** (commits `e58d50b` to `251a4f3`, merged as `2af63c3`) worked in three streams:
- text: renumbering, page edges and numbers, form fields;
- visual structure and decorations;
- overlays and colour.

Each fix got a regression test from the probe PDFs that fails before it (`test/engine8-*`, `test/visual8-*`, fixtures `test/fixtures/probe8-*`, all SYNTHETIC). An independent verifier then re-ran the findings and built new counter-probes against every changed rule. Problems those verifiers found went back to the fixers, up to four fix passes in one area (form fields). The merged engine was verified once more as a whole: once for the text side and twice for the visual side, with about 400 further counter-probes and a full diff of about 1,400 probe pairs against `b3de0f4`.

Latest verifier status of the 106 findings:

| Severity | Fixed | Partly fixed | Deferred, verifier agreed | Open |
|---|---|---|---|---|
| High (27) | 23 | 2 | 2 | 0 |
| Medium (58) | 42 | 7 | 9 | 0 |
| Low (21) | 16 | 0 | 5 | 0 |

The four high findings not fully fixed:
- **R4-10, partly.** Word boxes in Carlito text printed by Chromium drift 2–3 pt off the glyphs. A page of 20 struck figures gave "No differences found."; the same pages now list 15 or 16 of 16. Single-glyph strikes can still be missed, with no notice (README: Strikethrough, underline and small marks).
- **R5-07, partly.** A strike or highlight on running-header text is counted with the ignored header and footer differences, not listed. A strike on a header line drawn along a rule is neither listed nor counted (README: Marks on headers and footers).
- **R3-03, deferred.** A form page turned by `/Rotate 90`: the text side is fixed, and a real value edit is now listed. A false "Graphic or image added" for the widget frames remains.
- **R4-09, deferred.** A strike under an unchanged semi-opaque watermark in front of the text: one of six is still not listed, but it is counted in the "compared only in part" notice.

Problems the verifiers of fix round 8 found beyond the 106, still open:
- **Medium, also in `b3de0f4`:**
  - A thin strike in a mid-tone colour over black text gives "No differences found.": grey at 0.8 and 1.5 pt, and mid-blue or green at 0.8 pt. This is now a README limit.
  - A strike or recolour under an unchanged translucent image stamp, which gave nothing before, is now counted in the "compared only in part" notice but not listed.
- **Low:**
  - pale highlights next to bands or changed graphics;
  - a vector seal drawn across lines;
  - false items from a rotated stamp frame;
  - the notice on a striped table re-flowed by a row;
  - a 4 × 4 pt sliver inside an added stamp;
  - a multiline field re-laid on one line.

  All of these are in the README limits.
- **Speed:** pages with a large slanted watermark take about 1.7 times as long as at `b3de0f4`; see [Performance](#performance).

On the evaluation sets nothing moved. Run on 2026-11-06 on the merged branch (`c2b3353`):
- 31 non-blind pairs: 117 / 117 / 0;
- round 3: 73 / 73 / 1;
- round 4: 118 / 118 / 4, and 108 / 108 / 10 with the registered rules (one fewer found than before, explained under round 4 below).

The `--items` output of all 61 cases is identical to the last independent verifier's run, and to the runs before the last two fix passes. The fixes were made for the probes, so they say nothing new about other documents; a fifth blind round is the test of that.

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
| After fix round 6, strict rules | 93 / 92 / 26 (93) | — | — |
| Before fix round 9 (`25e9ffe`), registered rules | 108 / 108 / 10 (108) | 92 / 92 / 263 (83) | 117 / 97 / 404 (109) |
| Before fix round 9, current rules | 118 / 118 / 4 (118) | 92 / 92 / 263 (83) | 117 / 97 / 404 (109) |
| After fix round 9 (`b5332f4`), registered rules | 109 / 109 / 9 (109) | 92 / 92 / 263 (83) | 117 / 97 / 404 (109) |
| After fix round 9, current rules | 119 / 119 / 3 (119) | 92 / 92 / 263 (83) | 117 / 97 / 404 (109) |

**This is not a blind result.** The engine was fixed with these cases in view, and the scorer rules were decided after seeing the run. The 10 edits that only the later rules credit are of the kinds the analysis classified as scorer issues:
- 4 header or footer edits, disclosed in differing header/footer lines but not in one hunk. One of them, the running line "Draft for discussion · 2 October 2026" of the services agreement, counted under the registered rules until fix round 8 (109 / 109 / 10). The comparison with headers and footers included then listed it inside a false "Moved and edited" passage that held the whole line. It is now an edit in place that holds only the changed words ("discussion · 2" → "signature · 12");
- 4 one-sided regions: an added stamp annotation and a sticky-note icon, an added signature image, the removed watermark;
- "每年 → 每半年" reported as "Added 半";
- the overflow of a cropped page.

The text line diff rose from 89 to 92 because its extraction now also reads form field values, as poppler's `pdftotext` does.

What remained before fix round 9 (`25e9ffe`):
- **1 miss**, a correct report. "10% → 5%" in clause 3.3 of the supply annex is listed on the right page. Its excerpt showed six characters after the figure (作为质量保证), while the truth snippet runs to 金.
- **4 extra items:**
  - **Supply annex, 2 items.** The cell counter row moved across a page break and took the repeated header cell along: "35 → 金额Amount 36", plus a deleted row that starts with 金额Amount. This is noise and a misleading description.
  - **85-page plan, 1 item.** "“alternative sources” moved 6 mm to the right" (p. 60). The risk register's columns were re-sized by the browser when row R-16 was added, so this is a consequence, not an edit.
  - **Watermark case, 1 item.** The second "Deleted “DRAFT”" (p. 2) is correct, but the truth item names page 1 only.

After fix round 9 (`b5332f4`), the round-4 cases give 119 / 119 / 3 (119), and 109 / 109 / 9 with the registered rules. The miss is credited: the Chinese and Japanese excerpt is now sized by a character budget, and its context after the figure runs to 金. The supply annex keeps 1 extra item, an insertion of the repeated header cell "金额Amount" on p. 3, beside the deleted row that starts with it (credited). The other two extra items are unchanged. Fix round 9 used round-5 cases, not these, but round 4 was not held out before either.

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

**Fix round 8, A/B on one machine.** On 2026-11-06, on the 2.10 GHz machine of the first table (Node 22.23, load 0.5–1.4), runs alternated between `b3de0f4` (before fix round 8) and the merged branch (`c2b3353`). The 34-page memo is the SYNTHETIC review-7 robustness probe with a large slanted DRAFT watermark on every page (not in the repository).

| Pair | `b3de0f4` | `c2b3353` |
|---|---|---|
| Demo, text + visual, 3 runs | 5.0–5.2 s · 345–362 MB | 5.7–5.9 s · 342–359 MB |
| 24 → 24 pages, text only, median of 3 | 0.8 s · 199 MB | 0.8 s · 203 MB |
| 24 → 24 pages, text + visual, median of 3 | 11.0 s · 369 MB | 12.4 s · 378 MB |
| 34-page watermark memo, text + visual, 1 run | 22.4 s · 396 MB | 37.4 s · 423 MB |

Fix round 8 costs about 12–15 % in the visual stage on ordinary pages, and nothing measurable in the text stage. On watermark pages the visual stage takes about 1.7 times as long. A profile of the memo found no single hot spot: the appearance checks (8.1 → 18.4 s) and the line tests (2.7 → 8.3 s) are now run for each overlay, each nearby graphic and each slanted text, and the new watermark letter maps add about 6 s. A cache of ink per box gained nothing measurable and was not kept. The independent verifiers measured much the same on this machine: 1–17 % on the demo pair (median about 11 %) and 37.7 s against 22.5 s on the memo.

**Fix round 9, A/B on one machine.** On 2026-11-07, on the 2.10 GHz machine of the first table (Node 22.23), with no other job running (1-minute load 0.2–1.5), runs alternated between `25e9ffe` (before fix round 9) and the merged engine (`b5332f4`; `107364f` changes only the web layout and one notice text). 3 runs each:

| Pair | `25e9ffe` | `b5332f4` |
|---|---|---|
| Demo, text only | 0.54–0.57 s · 190–196 MB | 0.53–0.64 s · 196 MB |
| Demo, text + visual | 5.80–6.33 s (median 5.93) · 341–368 MB | 6.13–6.24 s (median 6.22) · 330–371 MB |
| 24 → 24 pages, text only | 0.73–0.82 s · 198–203 MB | 0.77–0.86 s · 202–207 MB |
| 24 → 24 pages, text + visual | 12.25–12.66 s (median 12.35) · 356–385 MB | 12.84–13.39 s (median 13.16) · 366–396 MB |

Fix round 9 costs about 5 % (demo) and 6.5 % (24 pages) in the visual stage, by the medians. In the text stage the ranges overlap (medians 0.57 → 0.62 s and 0.75 → 0.79 s), too close to tell apart in three runs. An earlier A/B run of the same pairs, while another agent was running (1-minute load 4–6), gave +9.7 % and +6.8 %; its absolute times are higher and not comparable. In that run the 2-page audit case with annotations took about 0.27 s (13 %) longer. The slanted-watermark memo was not re-measured.

The extra time comes from the checks that were added for missed changes: strikethrough and underline, faint fills and hairlines, ink balance for shifts, and re-checking regions against neighbouring pages. Most of the time is spent in the per-pixel comparison (`unmatched`, 23 %), the 3 × 3 min/max planes (13 %) and the blur (10 %). Text comparison takes about 0.6 s of the total.

**Memory.**
- Report crops used to keep every rendered page: 6.8 GB peak for a 151-page pair with `-o`, 0.74 GB after the fix.
- Pages are rendered within a pixel budget (8 M pixels for comparison). Pages too large to compare (above about 14 M pt², e.g. 2A0) are skipped, and a notice names them.
- A 14 400 × 14 400 pt page now takes about 230 MB instead of being killed above 10 GB.

The browser app runs the same pipeline; it was not timed separately.

## What this does not show

- **The corpus is small and synthetic.**
  - Most cases were written by the same author as the engine and used for tuning.
  - Five first runs exist:
    - four cases by the engine's author: 7 / 9 found, 5 extra;
    - twelve cases by two independent authors: 49 / 53 found, 9 extra;
    - twelve more by two other independent authors: 55 / 73 found, 38 extra, fewer found than the text line diff (57);
    - eighteen by three other independent authors, with rules registered before the run: 104 / 119 found, 175 extra;
    - eighteen more by three other independent authors, with rules registered before the run: 115 / 144 found, 78 extra, fewer found and more extra than the pixel page diff (144, 59).
  - All five sets have since been used for fixes; round 5 by fix round 9, after which it gives 139 / 144 found and 16 extra. The next claim about new documents needs new held-out cases.
- **The probes are not independent evidence.** The round-6 probes were written knowing the rules they attack, and the fixes were tested on them. They show that those cases work, not that over-suppression is gone.
- **The round-3 analysis matters as much as the number.**
  - Most misses there were correct changes whose reported text was narrower than the truth snippet. The rule now credits them, but it was added after the run.
  - The real defects and noise it exposed were fixed only for the kinds of documents in that set.
- **Producers.** Tested: Chromium, LibreOffice Writer, Calc and Impress (24.2, also from .docx/.xlsx/.pptx files), reportlab, and PDFs assembled with pypdf. Tried in one blind round only, then used for fixes: Typst 0.15, fpdf2 2.9 and PyMuPDF 2.1. Text that PyMuPDF re-types after the footer was handled poorly in that round and is now compared in place where the footer is drawn after the body; annotations were tested only as written by PyMuPDF 2.1 and pypdf. Untested: Microsoft Office's own PDF export, InDesign, LaTeX, encrypted files, XFA forms, vertical CJK writing, and documents of more than about 150 pages. A scanned page (one round-4 case) is compared only as an image and named as a page without text; there is no OCR.
  - Rotated pages and simple two-column layouts are only covered by synthetic tests and one round-3 case.
- **Baselines.** The pixel baseline emulates diff-pdf's idea; it is not diff-pdf. Neither Acrobat nor Draftable was compared.
- **Scope of the result.** Passing this corpus proves this corpus. It does not prove correct behaviour on arbitrary PDFs, and the tool's output is not a professional review.

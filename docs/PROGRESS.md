# Progress

Short running notes for whoever continues (people or agents). Newest first.

## 2026-11-05 and 06 (review round 7, fix round 8)

- **Review round 7** probed `a722e40` with seven lenses and about 1,970 SYNTHETIC probe PDFs. After independent verification there were 106 findings, 27 of them high. Details are in EVALUATION, Review round 7 and fix round 8.
- **Fix round 8** (`e58d50b`..`251a4f3`, merged as `2af63c3`) ran in a text stream and two visual streams. Each verifier's new problems went back to its fixer, and the merged engine was verified again as a whole.
  - Status of the 106: high 23 fixed, 2 partly, 2 deferred; medium 42 / 7 / 9; low 16 / 0 / 5.
  - New: the "compared only in part" warning and exit code 3 for words under overlays (DECISIONS D12); form field values on header and footer lines compared page by page; quarter-turned fields read as text; `partlyCompared` and `fieldsUnread` in the JSON coverage.
- **Now** (merged branch `c2b3353`, 2026-11-06):
  - typecheck passes; `npm test` passes 459 of 459;
  - 31 non-blind pairs: 117 / 117 / 0;
  - round 3: 73 / 73 / 1;
  - round 4: 118 / 118 / 4, and 108 / 108 / 10 with the registered rules;
  - CI green on Node 22 and 24;
  - visual stage about 12–15 % slower than `b3de0f4`, and about 1.7 times as slow on watermark pages (EVALUATION, Performance).
- **Open, as facts** (all in the README limits):
  - a thin mid-tone strike (grey, mid-blue or green) over black text is not detected (also in `b3de0f4`);
  - a strike or recolour under an unchanged translucent image stamp is counted, not listed;
  - R4-10: single-glyph strikes in drifting Carlito word boxes;
  - R5-07: a strike on a header line drawn along a rule;
  - pages with a large slanted watermark take about 1.7 times as long as at `b3de0f4`.
- **Blind round 5**, registered in `90471a8` (18 cases, 144 truth items, engine frozen at `f1053f3`), run once and recorded unchanged in `1768e2d`:
  - default rules: 115 / 115 / 78; registered round-4 rules 111 / 111 / 79; strict 72 / 70 / 118;
  - baselines: text line diff 98 / 96 / 112, pixel page diff 144 / 132 / 59;
  - by producer, ChangeLens found 48 of 51 (Typst), 44 of 48 (fpdf2) and 23 of 45 (PyMuPDF).
- **Round 5 classified** (`eval/results-holdout5-analysis.md`): six analyst agents, six verifiers (all 64 entries agreed, counts add up), one synthesis.
  - 29 misses: 18 shown in a misleading form (16 of them PyMuPDF re-typed text after the footer), 8 scoring only, 2 silent (0.4 pt black strike, 0.73 pt #00ff00 underline), 1 undisclosed (amount moved from Débit to Crédit).
  - 78 extra items: 44 consequences (28 items from renumbered rows in one invoice, 10 table rules at moved page breaks, 4 moves across page breaks, 2 flipped stripes), 22 misleading pieces of real edits, 9 scoring only, 3 false.
  - Twelve causes, ranked in EVALUATION ("Held-out round 5: first run"); the README limits now name the eleven that affect a reviewer (cause 9 is scoring only).
- **Next, proposed** (not started; fixing with these cases would end round 5's status as held out):
  1. PyMuPDF re-typed text: merge runs drawn after the footer into the body line they share a baseline with; widen the same-place join; add a notice for text out of reading order.
  2. Row numbers closer than one em to the next cell; never a percentage on a row number.
  3. Table closing rules at moved page breaks folded into the page-break count.
  4. Thin and light lines measured by colour distance, not luminance; strike-out, underline and highlight annotations read from `getAnnotations`; a notice that a file has annotations.
  5. CJK context by a character budget; 年月日 date changes that take in 月 read as numbers.
  6. The smaller causes (split rewrites, moves past footnotes, zebra shading, per-cell sideways moves, DR/CR and trailing-minus signs, the justified-line footnote).

## 2026-11-04 (fix rounds 5 and 6, after blind round 4)

- **Fix round 5** (`00517e0`..`82aa23a`), in the agreed order:
  1. form field values read and compared;
  2. header bands and row rules belong to their row's change;
  3. renumbering generalised;
  4. appearance checks compare a glyph with itself;
  5. four scorer rules decided after the run, off with `--registered-rules`.
- **Adversarial probes** of those rules: about 80 PDF pairs with real edits next to each hidden pattern, each re-checked by a verifier. 17 medium/high defects were confirmed, where a real edit was hidden or folded (8 high). Working files are in the session scratchpad, not in the repository.
- **Fix round 6** (`8a43eb8`..`1d349b6`): a suppression now needs positive evidence. All 17 are fixed, with tests from the probe PDFs (`test/engine6-*`, `test/visual6-probes.test.ts`, fixtures `test/fixtures/probe6-*`).
- **Also fixed**: the context after a figure that absorbed its unit repeated the unit ("1.50% → 1.05% % of …").
- **Now**:
  - 31 non-blind pairs: 117 / 117 / 0;
  - round 3: 73 / 73 / 1;
  - round 4: 118 / 118 / 4 with the current rules, 109 / 109 / 10 with the registered ones (108 / 108 / 10 after fix round 8, see EVALUATION).

  Rounds 3 and 4 are no longer held out.
- **Open, as facts**:
  - Probes not fixed:
    - V05: a 3/2 dash on a 0.75 pt rule is missed;
    - N16: a move is attributed to the other block;
    - N18: bracketed reference labels are not recognised;
    - N10: a row number listed after a hand edit broke the run gets a percentage (`6 → 7 (+17%)`).
  - Visual limits:
    - a fill or rule removed from one copy of a repeated header row is not detected;
    - a word fully under an opaque overlay is not checked, and no notice says so;
    - a turned page with fewer than 3 matched words folds everything into the page-size item.
  - Numbering limits:
    - times without a leading zero get a percentage (`12.00 → 13.00 (+8.3%)`);
    - a column of figures that starts at 1 and steps by one can be taken for row numbers.
- **Next**:
  - a fifth blind set, written before any further tuning, with Word/InDesign/LaTeX producers;
  - the per-pixel speed of the visual stage;
  - a notice for words that could not be checked under an overlay.

## 2026-11-03 (blind round 4)

- **What was run**: 18 cases (119 edits) by three new independent authors (`eval/make-holdout4-{e,f,g}.mjs`, brief `eval/holdout4-brief.md`): Office files via LibreOffice, long and Japanese/Traditional Chinese documents, and PDFs assembled with pypdf. The rules were registered before the run (`b5cee6f`); the engine was frozen at `6cd041b`; the run was recorded once (`7c1a078`).
- **Result**: ChangeLens 104 / 104 / 175 found / located / extra; text line diff 89 / 89 / 263; pixel diff 117 / 97 / 404.
- **Causes**, each classified and re-checked (`eval/results-holdout4-analysis.md`):
  - 11 of 15 misses are scorer issues;
  - 3 are form field values, which are not read and not disclosed;
  - 154 of 175 extras are noise: header bands and rules after re-pagination, automatic renumbering, and false colour/strike/underline on glyphs that moved.
- **Next, proposed** (not started; it would end round 4's status as held out):
  1. Read AcroForm field values as text, or at least disclose that a PDF has form fields.
  2. Hide graphics that belong to a repeated header row hidden as a consequence.
  3. Generalise renumbering: multi-level labels, numbered-list columns, redline brackets.
  4. Make decoration and appearance checks compare a glyph with itself in the other version, so CJK strokes and moved glyphs stop reading as lines or colour changes.
  5. Scorer: per-line furniture disclosure, one-sided graphic regions, and insert-for-replace when the old text lies inside the new.

## 2026-11-03 (round 4: review, fixes, blind round 3)

- **First code review**: 72 findings (9 high), each reproduced by a second agent, fixed in five areas with a regression test for every fix. Scoring moved to `eval/score.ts`: coverage plus one-to-one, strict kinds, regions for items without text, `maxItems`. See DECISIONS D10.
- **Blind held-out round 3**: twelve cases by two new independent authors, from Chromium, LibreOffice Writer/Impress and reportlab (`eval/make-holdout3-{c,d}.mjs`, brief in `eval/holdout3-brief.md`).
  - The single recorded run gave **55 / 73 found, 38 extra**, fewer found than the text line diff (57). It is kept in `eval/results-holdout3-blind.*`, and `--rescore test/fixtures/holdout3-recorded-items.json --strict-snippets --strict-carets` reproduces it.
  - Causes:
    - 13 snippets wider than the reported change;
    - 5 engine defects;
    - noise from repeated table headers, running-header rules, and lines that changed column.
- **Second code review** of the fixed code: 43 findings, all confirmed. Several are regressions from the first fixes, e.g.:
  - a figure at a page break split into delete + add;
  - the list-label rule dropping sign checks;
  - bitmaps flagged after re-flow.

  Fixed together with the round-3 causes. Now: 31 non-blind pairs 117 / 117 / 0; round 3 (no longer blind) 73 / 73 / 1 with the context snippet rule, 61 / 60 / 13 with the strict rules.
- **Cost**: the visual stage is about 60 % slower than at 158e537 (demo 3.3–3.7 s → 5.4–5.7 s), because of the added checks.
- **Next**:
  - a fourth blind set, especially Word/InDesign/LaTeX producers;
  - speeding up the per-pixel comparison;
  - a screen-reader pass and a full WCAG 2.2 audit;
  - PDF.js 6.5.x;
  - a change only of sub- or superscript form, which is not reported (see README limits).

## 2026-11-03 (round 3)

- **Blind held-out round 2**: twelve cases by two independent authors (`eval/make-holdout2-{a,b}.mjs`). The first run with the unchanged engine scored 49 / 53 found and 9 extra, and is kept verbatim in `eval/results-holdout2-blind.*`. Four causes were found and fixed: signs before currency symbols, units on numbers, list renumbering (now hidden but counted), and repeated replacements (now merged).
- **Manual page pairing**: page map and form in the web app, `--pair` in the CLI, listed in the report. See DECISIONS D6.
- **Page map**: squares are now clickable over their whole area.
- **Multi-agent code review**: findings verified by reproduction and fixed; see the commit log and the PR description.
- **Next** (at the time): a third set of held-out cases; pairing text-less pages automatically by image similarity; a full WCAG 2.2 audit; testing other PDF producers; PDF.js 6.5.x.

## 2026-11-03

**State**: v0.1 complete: web app, CLI, report, evaluation. Work is on branch `feat/changelens-v0.1`, in PR #1 (draft).

**Done in this round** (following AGENTS.md and docs/QUALITY_BRIEF.md):
- Evaluation corpus with ground truth (`eval/cases`, `eval/extra-cases.json`), text and pixel baselines, and the scorer (`eval/run.ts`). Results and caveats are in `docs/EVALUATION.md`; the regression guard is in `test/eval.test.ts`.
- Engine fixes found by the evaluation:
  - signs and accounting negatives as numbers;
  - header/footer detection shared across both versions;
  - one entry for a font replaced everywhere;
  - duplicate detection;
  - position changes;
  - visual noise: blur against anti-aliasing, nearest-anchor rows at page breaks, minor shifts by a common offset.
- Nothing hidden silently: notices for ignored headers/footers and minor shifts (with Show), pages without a text layer, unreadable glyphs, and mostly-new pages, in the UI, CLI, report and JSON.
- UI:
  - the landing page shows one real example and the scope instead of feature cards;
  - change bars in the page margin and a colour legend;
  - a document-first toggle;
  - reduced-motion support.
- Report: a summary sentence instead of stat cards, plus a method section (file SHA-256, version, settings, coverage) and a disclaimer.
- Decisions, sources and references: `docs/DECISIONS.md`.

**Open / next**:
- New held-out cases. The current ones were used for fixes and are no longer blind.
- Producers not yet tested: Word, InDesign, LaTeX. Damaged, password-protected and image-only files give a plain message (checked with the CLI); rotated pages and very large files (> 100 pages) are untested.
- A full WCAG 2.2 audit (keyboard and reduced motion are done; screen reader and contrast are not measured).
- Upgrade PDF.js to 6.5.x after testing (canvas drawing moved to a worker).

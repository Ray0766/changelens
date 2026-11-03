# Progress

Short running notes for whoever continues (people or agents). Newest first.

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

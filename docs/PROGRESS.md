# Progress

Short running notes for whoever continues (people or agents). Newest first.

## 2026-11-03 (round 3)

- **Blind held-out round 2**: twelve cases by two independent authors (`eval/make-holdout2-{a,b}.mjs`). The first run with the unchanged engine scored 49 / 53 found and 9 extra, and is kept verbatim in `eval/results-holdout2-blind.*`. Four causes were found and fixed: signs before currency symbols, units on numbers, list renumbering (now hidden but counted), and repeated replacements (now merged).
- **Manual page pairing**: page map and form in the web app, `--pair` in the CLI, listed in the report. See DECISIONS D6.
- **Page map**: squares are now clickable over their whole area.
- **Multi-agent code review**: findings verified by reproduction and fixed; see the commit log and the PR description.
- **Next**: a third set of held-out cases; pairing text-less pages automatically by image similarity; a full WCAG 2.2 audit; testing other PDF producers; PDF.js 6.5.x.

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

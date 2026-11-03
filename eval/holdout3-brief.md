# Blind held-out round 3: brief for independent test authors

ChangeLens compares two versions of a text-based PDF and lists what changed: text (added, deleted, replaced, moved), numbers, and layout/visual changes (formatting, graphics, colour, overflow, position). Each change must be located on the right page and region in both versions, after re-pagination too. Reviewers use it to check contracts, quotes, reports. See `/home/user/changelens/README.md` and `docs/QUALITY_BRIEF.md` for what it claims.

You are an **independent test author**. You write a new blind evaluation set. The engine's author runs it **once, unchanged**, and publishes the result, whatever it is. Your cases are good if they are realistic review tasks with unambiguous ground truth — not if they are easy or hard for this particular engine.

## What you must not read or run

- Not: `src/`, `test/`, `eval/run.ts`, `eval/score.ts`, `eval/results*`, `docs/EVALUATION.md`, `docs/PROGRESS.md`, `docs/DECISIONS.md`, `git log` / `git diff` / `git show` output, other authors' `holdout3-*` folders, and anything in `/tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/` outside your own subfolder `blind3-<you>/`.
- Do not run ChangeLens in any form (CLI, web app, `npm test`, `eval/run.ts`).
- You may read: `README.md`, `README.zh-CN.md`, `AGENTS.md`, `docs/QUALITY_BRIEF.md`, existing `eval/cases/*/truth.json` files and `eval/make-holdout2-a.mjs` / `make-holdout2-b.mjs` as format examples.

## What to produce

Six cases. Each case is a folder `eval/cases/holdout3-<you>-<slug>/` in `/home/user/changelens` with `before.pdf`, `after.pdf` and `truth.json`, plus one generator script `eval/make-holdout3-<you>.mjs` (it may call Python/LibreOffice helpers you also commit under `eval/holdout3-<you>/`) that regenerates all six. Do **not** commit anything (no git commands at all); just leave the files.

All content is **synthetic** and labelled: put "synthetic sample" in a footer or on the first page, and `"synthetic": true` in truth.json. No real company names, people or logos.

Tools: Chromium via Playwright (`require('/opt/node-tools/node_modules/playwright')`, `chromium.launch()` needs no options; `NODE_PATH=/opt/node-tools/node_modules`), LibreOffice (`soffice --headless --convert-to pdf`, from .odt/.docx/.html/.odp), Python `reportlab` 5 and `pypdf` 6, `pdftoppm`, `pdftotext`, PDF.js at `/home/user/changelens/node_modules/pdfjs-dist/legacy/build/pdf.mjs`. Fonts: `fc-list`.

## truth.json format

```json
{
  "description": "One paragraph: what the document is and what was edited (and what was deliberately NOT edited but changes as a consequence).",
  "synthetic": true,
  "set": "held-out-3",
  "blind": true,
  "truth": [
    { "type": "number", "old": "8,000", "new": "9,500", "oldPage": 3, "newPage": 3 },
    { "type": "delete", "old": "The deposit is refundable", "oldPage": 2 },
    { "type": "insert", "new": "Pets are not allowed", "newPage": 2 },
    { "type": "replace", "old": "Hamburg", "new": "Bremen", "oldPage": 1, "newPage": 1 },
    { "type": "move", "old": "Subcontracting.", "new": "Subcontracting.", "oldPage": 1, "newPage": 3 },
    { "type": "format", "old": "limitation of liability", "new": "limitation of liability", "oldPage": 2, "newPage": 2, "note": "made bold" },
    { "type": "graphic", "oldPage": 1, "newPage": 1, "oldRect": [72, 400, 200, 120], "newRect": [72, 400, 200, 120], "note": "bar for Q3 longer" },
    { "type": "furniture", "old": "DRAFT", "new": "FINAL", "oldPage": 1, "newPage": 1 }
  ]
}
```

- `type`: `number` (a figure, amount, percentage, date number changed; include the sign), `replace` (words changed), `insert` (new text only), `delete` (old text only), `move` (an unchanged passage moved; old and new give its first words), `format` (bold/italic/size/font of unchanged text), `graphic` (image, chart, line, shading, colour), `position` (unchanged text moved sideways), `overflow` (content cut off at a page edge or sticking into the margin), `furniture` (a header/footer text change).
- Pages are **1-based**. Give `oldPage`/`newPage` explicitly for every item.
- `oldRect`/`newRect` = `[x, y, w, h]` in PDF points, top-left origin, on that single page. Required for items without text (graphics); optional otherwise.
- `old`/`new` snippets: the **minimal** changed text, verbatim as extracted (whitespace-insensitive), present on the stated page. Prefer snippets that occur once on that page. Never an empty string — leave the side out.
- `maxItems`: when one edit legitimately shows up as several items (a rename in 6 places → `"maxItems": 6`). Default 1.
- `note`: your judgement calls (why something is or is not an item).
- List only **deliberate edits a reviewer must see**. Do not list consequences: re-flow, page breaks moving, page-number changes, list items renumbered automatically, a total that you deliberately left unchanged, etc. Say in the description what consequences exist.
- Keep edits separated by unchanged text, so each truth item is clearly one change.

## Checks before you finish

1. Every snippet is found (whitespace-insensitive) on its stated page in the extracted text (PDF.js or pdftotext), and the old snippet is not at that place in the new version (and vice versa).
2. A word-level diff of the extracted body text shows only your intended edits plus re-flow.
3. Render every page (`pdftoppm -r 60`) and look at before/after side by side; check rects against the render.
4. The generator reproduces the files.

## Final answer

Return: the generator path; for each case `{id, pages ("3→4"), truthItems, producer, description}`; and notes on your design choices and any producer quirks you saw.

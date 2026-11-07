# Blind held-out round 4: brief for independent test authors

ChangeLens compares two versions of a text-based PDF and lists what changed: text (added, deleted, replaced, moved), numbers, and layout/visual changes (formatting, graphics, colour, overflow, position). Each change must be located on the right page and region in both versions, after re-pagination too. Reviewers use it to check contracts, quotes, reports and similar documents. See `/home/user/changelens/README.md` and `docs/QUALITY_BRIEF.md` for what it claims.

You are an **independent test author**. You write a new blind evaluation set. The engine's author runs it **once, unchanged**, and publishes the result, whatever it is. Good cases are realistic review tasks with unambiguous ground truth. Whether they are easy or hard for this particular engine does not matter.

## What you must not read or run

- **Not**:
  - `src/`, `test/`, `eval/run.ts`, `eval/score.ts`, `eval/results*`;
  - `docs/` (except `docs/QUALITY_BRIEF.md`);
  - the folders of earlier held-out rounds (`eval/cases/holdout*`, `eval/holdout3-*`, `eval/make-holdout*.mjs`);
  - `git log` / `git diff` / `git show` output;
  - other authors' `holdout4-*` folders;
  - anything in `/tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/` outside your own subfolder `blind4-<you>/`.
- **Do not run ChangeLens** in any form: CLI, web app, `npm test`, `eval/run.ts`.
- **Do not run** `npm install`, `npm ci` or anything that writes to `/home/user/changelens/node_modules` (it is shared). **No git commands at all.**
- **You may read**:
  - `README.md`, `README.zh-CN.md`, `AGENTS.md`, `docs/QUALITY_BRIEF.md`;
  - the truth files of the *first* corpus as format examples: `eval/cases/numbers/truth.json`, `eval/cases/move-and-edits/truth.json`, `eval/cases/small-graphics/truth.json`.

## What to produce

Six cases. Each case is a folder `eval/cases/holdout4-<you>-<slug>/` in `/home/user/changelens` with `before.pdf`, `after.pdf` and `truth.json`. One generator script `eval/make-holdout4-<you>.mjs` regenerates all six. It may call Python or LibreOffice helpers that you put under `eval/holdout4-<you>/`. Leave the files uncommitted.

All content is **synthetic** and labelled: put "synthetic sample" in a footer or on the first page, and `"synthetic": true` in truth.json. No real company names, people or logos.

**Tools** (all installed):
- Chromium via Playwright: `require('/opt/node-tools/node_modules/playwright')`; `chromium.launch()` needs no options; set `NODE_PATH=/opt/node-tools/node_modules`.
- LibreOffice 24.2: `soffice --headless --convert-to pdf --outdir <dir> <file>`. Give every run its own profile with `-env:UserInstallation=file:///tmp/lo-<you>-<n>`, because other authors run LibreOffice at the same time.
- Python 3 with `python-docx` 1.2, `openpyxl` 3.1, `python-pptx` 1.0, `reportlab` 5 and `pypdf` 6.
- `pandoc`, which writes .docx/.odt/.html but not PDF directly.
- `pdftoppm`, `pdftotext`, and PDF.js at `/home/user/changelens/node_modules/pdfjs-dist/legacy/build/pdf.mjs`.
- Fonts (`fc-list`): Liberation, DejaVu, Carlito/Caladea (metric-compatible with Calibri/Cambria), Inter, WenQuanYi Zen Hei (Chinese), IPAGothic (Japanese).

## truth.json format

```json
{
  "description": "One paragraph: what the document is, how it was produced, what was edited, and what changes only as a consequence.",
  "synthetic": true,
  "set": "held-out-4",
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

- **`type`**:
  - `number`: a figure, amount, percentage or date number changed; include the sign;
  - `replace`: words changed;
  - `insert`: new text only;
  - `delete`: old text only;
  - `move`: an unchanged passage moved; old and new give its first words;
  - `format`: bold, italic, size or font of unchanged text, or text struck through or underlined;
  - `graphic`: image, chart, line, shading or colour;
  - `position`: unchanged text moved sideways;
  - `overflow`: content cut off at a page edge or sticking into the margin;
  - `furniture`: a header or footer text change.
- **Pages** are 1-based. Give `oldPage`/`newPage` explicitly for every item.
- **`oldRect`/`newRect`** = `[x, y, w, h]` in PDF points, top-left origin, on that single page. They are required for items without text (graphics) and optional otherwise.
- **`old`/`new` snippets**: verbatim as extracted (whitespace-insensitive), present on the stated page. Prefer snippets that occur only once on that page. Never use an empty string; leave that side out instead.
- **`maxItems`**: when one edit legitimately shows up as several items, e.g. a rename in 6 places gives `"maxItems": 6`. The default is 1.
- **`note`**: record your judgement calls. Also note when an item tests something the README does not claim to support.
- **What to list**: only **deliberate edits a reviewer must see**. Do not list consequences: re-flow, page breaks moving, page-number changes, automatically renumbered list items, a total you deliberately left unchanged. Name those consequences in the description instead.
- **Separation**: keep edits apart, with unchanged text between them, so each truth item is clearly one change.

## Checks before you finish

1. **Snippets**: every snippet is found (whitespace-insensitive) on its stated page in the extracted text, using PDF.js or pdftotext. The old snippet is not at that place in the new version, and vice versa.
2. **Text diff**: a word-level diff of the extracted body text shows only your intended edits plus re-flow.
3. **Renders**: render every page (`pdftoppm -r 60`) and look at before and after side by side. Check every rect against the render.
4. **Generator**: re-running it reproduces the files. Timestamps may differ.
5. **Structure**: every truth.json parses and follows the format above.

## Final answer

Return:
- the generator path;
- for each case: `{id, pages ("3→4"), truthItems, producer, description}`;
- notes on your design choices and any producer quirks you saw.

# Blind held-out round 5: brief for independent test authors

ChangeLens compares two versions of a text-based PDF and lists what changed: text (added, deleted, replaced, moved), numbers, and layout/visual changes (formatting, graphics, colour, overflow, position). Each change must be located on the right page and region in both versions, after re-pagination too. Reviewers use it to check contracts, quotes, reports and similar documents. See `/home/user/changelens/README.md` and `docs/QUALITY_BRIEF.md` for what it claims.

You are an **independent test author**. You write a new blind evaluation set. The engine's author will freeze the engine, register the scoring rules, run your set **once, unchanged**, and publish the result, whatever it is. Good cases are realistic review tasks with unambiguous ground truth. Whether they are easy or hard for this particular engine does not matter.

This round is about **PDF producers that have not been tested yet**. All earlier rounds used Chromium, LibreOffice, reportlab and pypdf. This round uses three other PDF writers, each with its own text layout, font embedding and content-stream style:
- **Typst** 0.15 (Python package `typst`): a typesetting system in the LaTeX tradition, with justified text, hyphenation, ligatures, kerning, footnotes, columns, math, tables and its own PDF writer.
- **fpdf2** 2.9 (Python package `fpdf`): a lightweight PDF generator used by many business applications for invoices, statements and reports.
- **PyMuPDF** 2.1 (Python package `pymupdf`): MuPDF's writer. It can place text (`insert_text`, `insert_textbox`, `insert_htmlbox`), draw shapes, add annotations and widgets, and edit existing PDFs (redact and re-insert text, which is how many "PDF editors" change a document).

Use them from the prepared virtual environment: `/tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/r5venv/bin/python` (do not install anything else into it, and do not create other environments).

## What you must not read or run

- **Not**:
  - `src/`, `test/`, `eval/run.ts`, `eval/score.ts`, `eval/results*`, `eval/*analysis*`;
  - `docs/` (except `docs/QUALITY_BRIEF.md`);
  - the folders and generators of earlier held-out rounds (`eval/cases/holdout*`, `eval/holdout*`, `eval/make-holdout*`);
  - `git log` / `git diff` / `git show` output (no git commands at all);
  - other authors' folders;
  - anything in the scratchpad (`/tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/`) outside your own folder `blind5/<you>/`, except running the venv's python.
- **Do not run ChangeLens** in any form: CLI, web app, `npm test`, `eval/run.ts`.
- **Do not run** `npm install`, `npm ci` or anything that writes to `/home/user/changelens/node_modules` (it is shared). Do not write anything under `/home/user/changelens`.
- **You may read**:
  - `README.md`, `README.zh-CN.md`, `AGENTS.md`, `docs/QUALITY_BRIEF.md`;
  - the truth files of the *first* corpus as format examples: `eval/cases/numbers/truth.json`, `eval/cases/move-and-edits/truth.json`, `eval/cases/small-graphics/truth.json`.

## What to produce

Six cases in your own folder. Each case is a folder `blind5/<you>/cases/holdout5-<you>-<slug>/` with `before.pdf`, `after.pdf` and `truth.json`. One generator script `blind5/<you>/make-holdout5-<you>.py` (run with the venv's python) regenerates all six into a folder given as its first argument. Put helpers (Typst sources, fonts lists, data) under `blind5/<you>/holdout5-<you>/`.

All content is **synthetic** and labelled: put "synthetic sample" in a footer or on the first page, and `"synthetic": true` in truth.json. No real company names, people or logos.

**Other tools** (installed): Chromium via Playwright (`NODE_PATH=/opt/node-tools/node_modules`), LibreOffice 24.2 (`soffice --headless`, always with `-env:UserInstallation=file:///tmp/lo-<you>-<n>`), Python 3 with `reportlab`, `pypdf`, `python-docx` in the system python, `pandoc`, `pdftoppm`, `pdftotext`, PDF.js at `/home/user/changelens/node_modules/pdfjs-dist/legacy/build/pdf.mjs`. Use them only for checks, or for at most one case where an assembly step needs them (say so in the description). Fonts (`fc-list`): Liberation, DejaVu, Carlito/Caladea, Inter, WenQuanYi Zen Hei (Chinese), IPAGothic (Japanese). With Typst, pass `font_paths` or use installed fonts by name; check that `pdffonts`-style output (PDF.js `getTextContent`) gives real text, not missing glyphs.

## truth.json format

```json
{
  "description": "One paragraph: what the document is, how it was produced (producer and version), what was edited, and what changes only as a consequence.",
  "synthetic": true,
  "set": "held-out-5",
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
- **Pages** are 1-based. Give `oldPage`/`newPage` explicitly for every item. If one edit appears on several pages (a watermark, a footer), list one item per page, or explain in a note.
- **`oldRect`/`newRect`** = `[x, y, w, h]` in PDF points, top-left origin, on that single page. Required for items without text (graphics). For a graphic that exists on one side only (an added stamp), give the rect only on that side.
- **`old`/`new` snippets**: verbatim as extracted (whitespace-insensitive), present on the stated page. Keep them short: the changed words plus at most a few words of context. Prefer snippets that occur only once on that page. Never use an empty string; leave that side out instead.
- **`maxItems`**: when one edit legitimately shows up as several items, e.g. a rename in 6 places gives `"maxItems": 6`. The default is 1.
- **`note`**: record your judgement calls. Also note when an item tests something the README does not claim to support.
- **What to list**: only **deliberate edits a reviewer must see**. Do not list consequences: re-flow, page breaks moving, page-number changes, automatically renumbered list items, hyphenation that moved, a total you deliberately left unchanged. Name those consequences in the description instead.
- **Separation**: keep edits apart, with unchanged text between them, so each truth item is clearly one change.

## Checks before you finish

1. **Snippets**: every snippet is found (whitespace-insensitive) on its stated page in the text extracted by PDF.js (`getTextContent`), which is what ChangeLens uses, and also by `pdftotext`. Note any difference between the two (ligatures, hyphenation, missing spaces). The old snippet is not at that place in the new version, and vice versa.
2. **Text diff**: a word-level diff of the extracted body text shows only your intended edits plus re-flow.
3. **Renders**: render every page (`pdftoppm -r 60`) and look at before and after side by side. Check every rect against the render.
4. **Generator**: re-running it into an empty folder reproduces the files (timestamps may differ; byte-identical is not required, but the text and layout must be).
5. **Structure**: every truth.json parses and follows the format above.

## Final answer

Return:
- the generator path;
- for each case: `{id, pages ("3→4"), truthItems, producer, description}`;
- notes on your design choices and any producer quirks you saw (text extraction oddities, ligatures, hyphenation, font embedding).

<p align="center">
  <img src="docs/logo.svg" width="64" height="64" alt="">
</p>

<h1 align="center">ChangeLens</h1>

<p align="center">
  <b>See exactly what changed between two versions of a PDF.</b><br>
  Text, numbers and layout — clearly located, with irrelevant noise removed, in a report anyone can open.
</p>

<p align="center">
  <a href="https://ray0766.github.io/changelens/"><b>Open the web app</b></a> ·
  <a href="#command-line">CLI</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="README.zh-CN.md">中文说明</a>
</p>

<p align="center">
  <a href="https://github.com/Ray0766/changelens/actions/workflows/ci.yml"><img src="https://github.com/Ray0766/changelens/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT licence"></a>
</p>

![ChangeLens comparing two versions of a proposal: the price on old page 3 changed from 8,000 to 9,500 on new page 4](docs/screenshot.png)

> “The price on page 3 went from 8,000 to 9,500; a paragraph is missing on page 6; the table on page 8 no longer fits on the page.”

That is the kind of answer ChangeLens gives you. Drop in the old and the new version of a document and get a plain-language list of what changed. Each change is highlighted in both versions, side by side, and the two views scroll together.

## Why another PDF diff?

Tools like [diff-pdf](https://github.com/vslavik/diff-pdf) compare page 1 with page 1, page 2 with page 2, and so on. That works until someone adds a paragraph near the start. Then every later page shifts, and every later page shows up as "different".

ChangeLens is built for the person who has to **review** the changes: a lawyer checking a contract, a buyer checking a quote, an editor checking proofs.

- **It survives repagination.** Content is matched across the whole document, not page by page. An inserted paragraph is one change, not eight red pages. The page map shows how old pages correspond to new ones (old p. 3 → new p. 4).
- **It reduces noise.** Running headers, footers and page numbers are recognised and ignored. So are re-flowed line breaks and hyphenation, ligatures, curly versus straight quotes, and full-width versus half-width characters. Small coincidental matches inside a rewritten sentence are merged, so you see one coherent edit.
- **It speaks plainly.** "Number changed: 8,000 → 9,500 (+19%)", "Deleted a paragraph", "Moved a paragraph", "Content is cut off at the right edge of the page", "“30 days” now bold".
- **It separates text from layout.** Text edits (added, deleted, changed and moved text, and numbers) are listed apart from visual changes: charts and images, colour, bold or size, content overflowing the page.
- **It produces a report you can share.** One self-contained HTML file with before/after snippets for every change, your review marks (✓ / ⚠) and notes. It opens in any browser, prints cleanly, and contains no scripts.
- **It is private.** The web app runs entirely in your browser. Your files are never uploaded.

## Features

| | |
|---|---|
| Side-by-side viewer | Synchronised scrolling that follows matched content, not page numbers; zoom; keyboard navigation (`j` / `k`) |
| Change list | Filter by *All / Text / Numbers / Layout*; each entry has a description, location (`p. 3 → p. 4`) and a context excerpt |
| Numbers | Amounts, prices and percentages are detected, with the relative change |
| Paragraph-level wording | Whole inserted / deleted / moved paragraphs are described as such |
| Moves | A paragraph that moved is shown once as a move, not as a deletion plus an insertion |
| Formatting | Bold, italic, font size and font family changes of unchanged text |
| Graphics and colour | Pixel comparison of charts, images and lines, with text masked out and each region aligned to where its text moved |
| Overflow | Text cut off at the page edge, or sticking out into the margin |
| Review | Mark each change as OK or needing attention and add notes; progress is saved locally |
| Export | HTML report (with crops) and JSON (for automation) |
| Languages | English and 简体中文 UI and reports; CJK text is compared character by character |

## Using it

### In the browser

Open **<https://ray0766.github.io/changelens/>**. Drop the old PDF on the left and the new one on the right, or try one of the built-in demos. To run it locally:

```bash
git clone https://github.com/Ray0766/changelens.git
```

```bash
cd changelens && npm install && npm run dev
```

The static build (`npm run build:web`, output in `dist/`) can be hosted anywhere, including an intranet server.

### Command line

```bash
npm install -g github:Ray0766/changelens
```

```bash
changelens contract-v1.pdf contract-v2.pdf -o review.html
```

```
contract-v1.pdf (8) → contract-v2.pdf (9)
13 changes — 8 text · 3 numbers · 5 layout
   1  Changed   Changed “30 November” → “15 December”  p. 1
   2  Number    Number changed: 24,500 → 26,000 (+6.1%)  p. 1
   3  Added     Added a paragraph  p. 2
   4  Number    Number changed: 8,000 → 9,500 (+19%)  p. 3 → p. 4
   …
→ review.html
```

| Option | |
|---|---|
| `-o, --out <file>` | Write the HTML review report |
| `--json <file>` | Write all changes as JSON |
| `--lang en\|zh` | Language of descriptions (default: from `$LANG`) |
| `--no-visual` | Skip the graphics/colour comparison (faster) |
| `--no-format` | Don't report bold/size/font changes |
| `--include-furniture` | Also compare headers, footers and page numbers |
| `--ignore-case`, `--ignore-punctuation` | Looser text comparison |
| `--fail-on-change` | Exit with code 1 if anything changed (useful in CI) |

The CLI needs Node.js 22.13 or newer. Page images for the report are rendered with [`@napi-rs/canvas`](https://github.com/Brooooooklyn/canvas), which is installed automatically as an optional dependency. Without it the CLI still compares text, but skips the graphics comparison and the report images.

<details>
<summary>Report example</summary>

![An exported report: each change with old/new crops](docs/report.png)

</details>

## How it works

1. **Extraction.** [PDF.js](https://mozilla.github.io/pdf.js/) reads the text runs of every page with their position, size and real font name. Runs are split into words, with per-character widths estimated from standard font metrics. CJK text is split into single characters, and numbers like `8,000.50` stay whole.
2. **Structure.** Runs are grouped into lines and paragraphs. Words hyphenated at a line break are re-joined. Running headers, footers and page numbers are detected: a line counts if it repeats in the top or bottom margin on most pages, or if its number follows the page number.
3. **Document-level diff.** Both documents become one continuous word stream each, so page breaks no longer matter. The streams are diffed with *patience* anchoring on unique words, with Myers' O(ND) algorithm for small segments; the anchored result is kept unless it loses too many matches. A semantic clean-up pass then removes coincidental one-word matches inside rewritten passages.
4. **Interpretation.** The edit script is turned into changes: inserted, deleted or replaced words; numeric changes with their values; whole paragraphs; moves (a deleted and an inserted block that are ≥ 80 % identical); formatting changes of matched words; text crossing the page edge. Nearby insertions on consecutive lines, such as new table cells, are merged.
5. **Page map and scrolling.** Matched words give a monotonic set of anchors between the two documents. They produce the page correspondence (old p. 3 → new p. 4) and drive the synchronised scrolling.
6. **Visual comparison.** Matched page pairs are rendered. Text is masked out, because it has already been compared. Every region of the old page is then compared with where its neighbouring text moved in the new page, trying the offsets of the anchor above and below, with a 1-pixel and colour tolerance. Remaining differences are clustered into regions. Matched words are also checked for changes of colour or stroke weight.

Everything in `src/core` is plain TypeScript without DOM or Node dependencies, so the browser app and the CLI share exactly the same engine.

## Scope and limitations

This first version focuses on **text-based PDFs**, as exported by Word, LibreOffice, Google Docs, LaTeX, browsers, InDesign and similar tools.

- **Scanned PDFs** (images of text) have no text layer and are not supported yet; OCR is on the roadmap.
- **Reading order** comes from the PDF content stream. This is right for almost all generated documents. Unusual producers that write text out of order can produce noisy diffs.
- **Word boxes** are estimated from the width of each text run, so highlights may be off by a few points with unusual fonts.
- **Fonts without a bold face.** When a font has no bold variant, PDF generators fake bold by stroking the glyphs. The visual check can catch this if the weight change is strong enough, but not reliably.
- **Very large documents** work: a 300-page text diff takes about a second. The visual stage renders every matched page, so it takes longer; switch it off with `--no-visual` or in Settings.

## Roadmap

- [ ] Images (PNG/JPEG) and slide decks (PPTX via PDF export)
- [ ] OCR for scanned PDFs
- [ ] Word-level diff inside moved paragraphs
- [ ] Multi-column reading-order reconstruction
- [ ] Shareable report as a single PDF
- [ ] Published npm package (`npx changelens`)

Ideas and use cases are welcome. Please open an issue, ideally with a small synthetic sample pair.

## Development

```bash
npm install
```

```bash
npm run dev
```

| Script | |
|---|---|
| `npm run dev` | Web app with hot reload |
| `npm test` | Unit and end-to-end tests (Node's built-in test runner; no extra framework) |
| `npm run typecheck` | TypeScript |
| `npm run build` | Static web app in `dist/` and CLI in `dist-cli/` |
| `npm run cli -- a.pdf b.pdf` | Run the CLI from source |
| `npm run samples` | Regenerate the demo PDFs (needs Playwright's Chromium) |

```
src/core/     diff engine (environment-agnostic): tokenize, furniture, diff, compare,
              overflow, visual, describe, report, i18n
src/pdf/      PDF.js text extraction (shared)
src/web/      browser app: viewer, sidebar, export
src/node/     Node PDF loading and rendering
src/cli/      command-line interface
test/         node:test suites and fixture PDFs
```

Development requires Node.js 22.18+ (tests run TypeScript directly via type stripping). See [CONTRIBUTING.md](CONTRIBUTING.md).

## Privacy

The web app is a static site. PDFs are read with the File API and processed in your browser, and nothing is sent anywhere. Review marks and notes are kept in your browser's local storage, keyed by a hash of the two files.

## Licence

[MIT](LICENSE). ChangeLens uses [PDF.js](https://github.com/mozilla/pdf.js) (Apache-2.0) and optionally [@napi-rs/canvas](https://github.com/Brooooooklyn/canvas) (MIT).

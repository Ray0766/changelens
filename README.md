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

- **It is built for re-pagination.** Content is matched across the whole document, not page by page. An inserted paragraph is one change, not eight red pages. The page map shows how old pages correspond to new ones (old p. 3 → new p. 4). Re-pagination can still leave a few items, listed under [Scope and limitations](#scope-and-limitations).
- **It reduces noise without hiding it.** Running headers, footers and page numbers are recognised and ignored by default; form field values on those lines are still compared, page by page. Re-flowed line breaks and hyphenation, ligatures, curly versus straight quotes and full-width versus half-width characters are read as the same text, so they are not differences and are not counted. These ignored differences are counted on screen and in the report: header and footer differences, lines that only shift by a few points, automatic renumbering, and table header rows repeated at a page top or rules closing a table at a page foot that came or went only because page breaks moved, each with a **Show** button, and upper/lower-case differences when you choose to ignore them. On pages whose footer is drawn after the body (tested with PyMuPDF's edits), text that a PDF editor re-typed and stored after the page footer is put back where it stands on the page and compared there, and a notice names those pages. Pages without readable text are named, so "no differences" is never a blind all-clear.
- **It speaks plainly.** "Number changed: 8,000 → 9,500 (+19%)", "Number changed: 500 → −500 (sign changed)", "Number changed: 4% → 8% (+4 pp)", "Deleted a paragraph", "Moved and edited a paragraph" (with the edits inside it listed), "Added content that repeats p. 2 word for word", "“APPROVED” moved 106 mm to the right", "Stamp added (annotation): “FOR COMMENT”", "Content is cut off at the right edge of the page".
- **It separates text from layout.** Text edits (added, deleted, changed and moved text, and numbers) are listed apart from visual changes: charts and images, colour, bold or size, highlight, strike-out and underline annotations, content overflowing the page.
- **It produces a report you can share.** One self-contained HTML file with before/after snippets for every change, your review marks (✓ / ⚠) and notes. It opens in any browser, prints cleanly, and contains no scripts.
- **It is private.** The web app runs entirely in your browser. Your files are never uploaded.

## Features

| | |
|---|---|
| Side-by-side viewer | Synchronised scrolling that follows matched content, not page numbers; change bars in the page margin; zoom; keyboard navigation (`j` / `k`); colour legend |
| Change list | Filter by *All / Text / Numbers / Layout*; each entry has a description, location (`p. 3 → p. 4`) and a context excerpt; can be hidden for a document-first view |
| Numbers | Amounts, prices, percentages and signs (`−500`, `(1,200)`, `−€62.40`, `１２，０００`, `－1,200元`) are detected, with the relative change, the change in percentage points for rates, or "sign changed"; Chinese and Japanese dates written with 年, 月 and 日 are compared as dates, without a percentage; several revised figures get one entry each |
| Paragraphs, moves, duplicates | Whole inserted / deleted / moved paragraphs are described as such; edits inside a moved paragraph are listed as their own changes; content repeated word for word says where it repeats |
| Formatting and position | Bold, italic, size and font changes of unchanged text (one entry when a font is replaced everywhere), also of text a PDF editor re-typed, on pages whose footer is drawn after the body (tested with PyMuPDF's edits); unchanged lines that moved sideways |
| Graphics and colour | Pixel comparison of charts, images, lines, shading and text colour, with text masked out and each region aligned to where its text moved; strikethrough and underline added or removed; highlight, strike-out and underline annotations listed on the words they cover, and stamps and free-text notes named with their text (not a note whose text fills less than about a quarter of its box); pages without text paired by position and look, or reported as added or removed; page size or orientation changes |
| Overflow | Text cut off at the page edge, or sticking out into the margin |
| Form fields | Values of PDF text and choice fields are compared as text and marked "(form field)"; check boxes and radio buttons are compared as graphics |
| Nothing hidden silently | Counts of ignored header/footer differences, minor shifts, renumbered list items, and table header rows and closing rules that came or went with page breaks (with **Show**); pages without a text layer, pages not compared visually, unreadable glyphs, form fields that could not be read as text, pages that are mostly new, text stored after the page footer and placed by its position, a file's annotations and what of them is not compared, words under or next to a stamp, watermark or fill, or under a line too thin or light to tell from the glyphs, whose colour, weight, strikethrough and underline could be compared only in part |
| Manual page pairing | Pair an old page with a new page by hand (page map or keyboard form) when automatic pairing is not possible, e.g. a chart page after an inserted page |
| Review | Mark each change as OK or needing attention and add notes; progress is saved locally |
| Export | HTML report (crops, review notes, file SHA-256, method and settings) and JSON |
| Languages | English and 简体中文 UI and reports; Chinese and Japanese text is compared character by character, Korean word by word (Chinese and Japanese are in the PDF test set; Korean has unit tests only) |

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
| `--lang en\|zh` | Language of descriptions (default: from `$LANG`; `zh-CN`, `en_US` etc. are accepted) |
| `--no-visual` | Skip the graphics/colour comparison (faster) |
| `--no-format` | Don't report bold/size/font changes |
| `--include-furniture` | Also compare headers, footers and page numbers |
| `--ignore-case`, `--ignore-punctuation` | Looser text comparison |
| `--pair OLD:NEW` | Treat old page OLD and new page NEW as the same page (repeatable), e.g. for pages without text |
| `--fail-on-change` | Exit with code 1 if anything changed, or 3 if nothing changed in what was compared but something could not be compared (useful in CI) |

Exit codes: `0` done (with `--fail-on-change`: no differences and everything compared), `1` differences found (`--fail-on-change`), `2` error (bad option, unreadable PDF, or an output path that cannot be written or would overwrite an input), `3` no differences in what was compared, but not everything was compared (`--fail-on-change`): pages without a text layer, unreadable characters, form field values that could not be read as text, pages whose pairing is uncertain, words compared only in part, or graphics. The JSON export (schema version 2) includes the tool version, whether graphics were compared, the notices and the coverage with 1-based page numbers, including the words compared only in part (`partlyCompared`) and the form field values that could not be read (`fieldsUnread`).

The CLI needs Node.js 22.13 or newer. Page images for the report are rendered with [`@napi-rs/canvas`](https://github.com/Brooooooklyn/canvas), which is installed automatically as an optional dependency. Without it the CLI still compares text, but skips the graphics comparison and the report images.

<details>
<summary>Report example</summary>

![An exported report: each change with old/new crops](docs/report.png)

</details>

## Evaluation

ChangeLens is scored on synthetic PDF pairs with known edits, against a text line diff (extract + `diff`) and a page-by-page pixel diff (the diff-pdf approach). Details and every number: [docs/EVALUATION.md](docs/EVALUATION.md).

The numbers that were **not tuned** are the first runs of held-out sets written by independent authors who did not see the engine:

| First run of a held-out set | ChangeLens found · extra | Text line diff | Pixel page diff |
|---|---|---|---|
| Round 2: 12 pairs, 53 edits, Chromium | 49 · 9 | 40 · 17 | 45 · 44 |
| Round 3: 12 pairs, 73 edits, Chromium, LibreOffice, reportlab | 55 · 38 | 57 · 57 | 73 · 38 |
| Round 4: 18 pairs, 119 edits, Office files via LibreOffice, 40–85-page and Japanese/Traditional Chinese documents, PDFs assembled with pypdf | 104 · 175 | 89 · 263 | 117 · 404 |
| Round 5: 18 pairs, 144 edits, Typst, fpdf2 and PyMuPDF (edits as PDF editors make them: redaction, re-inserted text, annotations, overlays), German, French, Chinese and Japanese | 115 · 78 | 98 · 112 | 144 · 59 |

Round 2 was scored with the rules of that time. Rounds 4 and 5 use the rules registered before their runs. The pixel diff "finds" 117 of 119 edits in round 4 but places only 97 of them on the right page, and 144 of 144 in round 5, 132 of them on the right page.

In round 3, ChangeLens found fewer edits than the text line diff. Most of those misses were correct changes, reported narrower than the truth snippet ("7 → 6" for "For 7 → For 6"). The rest, and most of the extra items, were real problems:
- repeated table header rows reported as text;
- lines that changed column reported as moved;
- table rules on re-flowed pages reported as graphic changes;
- a Chinese rewrite split in two.

These were fixed afterwards.

In round 4, ChangeLens reported 116 of 119 edits, and the scorer credited 104 of them. It missed the three values of PDF form fields, which it did not read then, and it did not say so. Its main weakness was noise: 154 extra items on long, re-paginated and CJK documents. These were table header bands and rules that came and went with page breaks, automatically renumbered lists and clauses, and colour, strike or underline wrongly reported on glyphs that only moved.

These causes were fixed afterwards. Form field values are now compared. The new rules that hide noise were then probed adversarially, with real edits placed next to each hidden pattern. That found 17 cases of medium or high severity where a real edit was hidden. They were fixed too, so that a rule now hides an item only with evidence that it follows from a listed change. On the same 18 cases ChangeLens now finds 119 of 119 edits with 3 extra items. That is not a blind result. Details: [EVALUATION.md](docs/EVALUATION.md#round-4-after-fix-rounds-5-and-6-no-longer-held-out).

In the first run of round 5, ChangeLens found 115 of 144 edits, fewer than the pixel diff, with 78 extra items, more than the pixel diff's 59. It found 48 of 51 edits in the Typst cases and 44 of 48 in the fpdf2 cases, but only 23 of 45 in the PyMuPDF cases, which were edited the way PDF editors do it: text redacted and new text inserted, annotations, overlays, page operations, an incremental save. Every miss and extra item was classified, and each classification re-checked by a second agent ([EVALUATION.md](docs/EVALUATION.md#held-out-round-5-first-run), per item in [eval/results-holdout5-analysis.md](eval/results-holdout5-analysis.md)):
- **29 misses.** 18 were listed in a misleading form, 16 of them because PyMuPDF writes re-typed text after the footer in the content stream. 8 were correct reports the scorer did not credit, 2 were silent misses within the documented scope (a 0.4 pt black strike and a 0.73 pt bright-green underline), and 1 was not checked and not disclosed (an amount moved into the other column of an unchanged row).
- **78 extra items.** 44 were consequences the truth names (renumbered invoice rows, table rules at moved page breaks, moves across page breaks, flipped row stripes), 22 misleading pieces of real edits, 9 correct items the scorer could not credit, and 3 false.

**Round 5 after fix round 9 (no longer held out).** Fix round 9 then worked on these causes with the same 18 cases: re-typed text, row numbers set close to the next cell, closing rules at moved page breaks, Chinese and Japanese excerpts and dates, thin and light lines, and markup annotations. So round 5 is no longer held out, and these are not blind results. On the same cases ChangeLens now finds 139 of 144 edits with 16 extra items (133 / 17 with the registered rules):
- **Typst**: 48 of 51, 9 extra (first run: 19).
- **fpdf2**: 46 of 48, 6 extra (first run: 44 of 48, 36 extra).
- **PyMuPDF**: 45 of 45, 1 extra (first run: 23 of 45, 23 extra).

The 5 misses left are four correct reports the scorer does not credit and the amount moved into the other column, which is still not checked (see Sideways moves). Of the 16 extra items, 7 are true consequences (moves across page breaks, zebra stripes, a re-typed word's font change), 7 are correct items the scorer cannot credit, and 2 are false. The pixel page diff is unchanged (144 / 132 found, 59 extra). The text line diff now scores 110 found, 95 extra (first run: 98, 112): it diffs the lines of ChangeLens's own text model, which now has re-typed text in reading order. Of the twelve causes, five are fixed (all those the round worked on), one partly, four not fixed and two are scoring only; the remaining limits are listed under [Scope and limitations](#scope-and-limitations). Details: [EVALUATION.md](docs/EVALUATION.md#held-out-round-5-after-fix-round-9-no-longer-held-out).

On all 31 pairs that are not blind (117 edits), ChangeLens finds and places every edit with no extra item:

| All 31 pairs, used for tuning and fixes | Found | On the right page | Extra items to read |
|---|---|---|---|
| ChangeLens | 117 / 117 | 117 / 117 | 0 |
| Text line diff | 89 / 117 | 89 / 117 | 56 |
| Page-by-page pixel diff | 117 / 117 | 106 / 117 | 117 |

The pixel diff "finds" an edit when it marks any region on the right page, without saying what changed. That table, the re-scored rounds 3 (73 / 73 found, 1 extra) and 4 (119 / 119 found, 3 extra) and round 5 after fix round 9 describe sets that were used for fixes, so they are not evidence of how ChangeLens does on new documents. They describe this test set, not PDFs in general.

## How it works

1. **Extraction.** [PDF.js](https://mozilla.github.io/pdf.js/) reads the text runs of every page with their position, size and real font name. Runs are split into words, with per-character widths estimated from standard font metrics. CJK text is split into single characters, and numbers like `8,000.50` stay whole.
2. **Structure.** Runs are grouped into lines and paragraphs. Words hyphenated at a line break are re-joined. Running headers, footers and page numbers are detected: a line counts if it repeats in the top or bottom margin on most pages, or if its number follows the page number. A number alone in the margin counts as a page number only if it is a small integer or roman numeral set apart from the body text, so a table row or an amount that ends a page is still compared. Form field values on header and footer lines are taken out of the word stream and compared page by page at their place; a value on a page left over by re-pagination is hidden only when the same value stands at the same place on another page of that version, or when the same old → new change is listed for another page, and it is then counted with the ignored header/footer differences.
3. **Document-level diff.** Both documents become one continuous word stream each, so page breaks no longer matter. The streams are diffed with *patience* anchoring on unique words, with Myers' O(ND) algorithm for small segments; the anchored result is kept unless it loses too many matches. When a long, heavily revised segment defeats the exact diff, unique words without a matching neighbour and then words that occur equally often on both sides are used as anchors; what still cannot be aligned is flagged in a notice. A semantic clean-up pass then removes coincidental one- or two-word matches inside rewritten passages, but never folds away structure a reader uses to locate edits: headings, row labels, or labels between revised figures.
4. **Interpretation.** The edit script is turned into changes: inserted, deleted or replaced words; numeric changes with their values; whole paragraphs; moves (a deleted and an inserted block whose words match ≥ 80 % in order; the two texts are then diffed, and edits inside the moved block are listed as their own changes); formatting changes of matched words; text crossing the page edge. Nearby insertions on consecutive lines, such as new table cells, are merged.
5. **Page map and scrolling.** Matched words give a monotonic set of anchors between the two documents. They produce the page correspondence (old p. 3 → new p. 4) and drive the synchronised scrolling.
6. **Visual comparison.** Matched page pairs are rendered and slightly blurred, so that thin lines drawn at different sub-pixel positions look alike. Text is masked out, because it has already been compared. Every region of the old page is compared with where its neighbouring text moved in the new page; rows whose nearest text went to another page are left to that page's comparison. Differences that one common offset of up to 4 pt explains are "minor shifts", hidden but counted. The rest are clustered into regions. Matched words are also checked for changes of colour or stroke weight, and intact lines for sideways moves.

Everything in `src/core` is plain TypeScript without DOM or Node dependencies, so the browser app and the CLI share exactly the same engine.

## Scope and limitations

This first version focuses on **text-based PDFs**. It has been tested with PDFs produced by Chromium (browser "Print to PDF"), LibreOffice (also Word, Excel and PowerPoint files rendered by LibreOffice) and reportlab, and with PDFs assembled with pypdf. Typst, fpdf2 and PyMuPDF were tried in one blind round of 18 synthetic pairs ([Evaluation](#evaluation)), which was then used for fixes. Text that a PDF editor redacts and re-types, as PyMuPDF does, is now compared in place on pages whose footer is drawn after the body (see Reading order below). Annotations were tested only as written by PyMuPDF 2.1 and pypdf. Other producers (Microsoft Word's own PDF export, InDesign, LaTeX, Acrobat and other annotating tools…) are **untested**.

- **Scanned PDFs** (images of text) have no text layer and are not supported. ChangeLens says which pages have no text; OCR is on the roadmap.
- **Reading order** comes from the PDF content stream. This is right for typical generated documents. Producers that write text out of order can produce noisy diffs. PDF editors that redact text and write the new text at the end of the page's content (seen with PyMuPDF's redaction, text insertion and HTML boxes), and browsers that write positioned text last, put that text after the footer. Where the footer is drawn after the body, ChangeLens puts such lines back by their position, compares them in place and says so in a notice; a word re-typed together with an edit is listed as its own format change beside it ("“2027” size 10.5 → 7.5 pt, font LiberationSerif → Helvetica"). The rest:
  - Where the footer is drawn first (seen with a reportlab canvas probe; LibreOffice Writer draws it last, and Microsoft Office's own export is untested), or where a line has no clear place (a re-typed value in the last row of a table with nothing below it, a table with uneven rows), the text is compared in stream order: the edit is listed as a deletion plus an insertion at the end of the page, several values can share one insertion ("Added “2,520.00 150.00”"), and no notice says so.
  - Placement is decided in each version on its own. Positioned text placed in one version and not the other (a badge word, a one-line side note a word space from a paragraph, footnote markers set near text size or stacked one under the other, a marker right before punctuation) can be listed as deleted and added again, or read into the paragraph line beside it. Nothing is hidden.
  - A phrase re-typed next to the word it replaces is listed as an insertion plus a deletion, not as one change, and re-typing inside a number with a glued unit splits it ("45kg" → "45 kg" reads as a text change).
  - A line added at the end of a page next to text deleted at the top of the next page can still be listed as one rewrite.

  In the first run of blind round 5 this caused 18 of the 29 misses and 20 of the 78 extra items. After fix round 9, the six PyMuPDF cases of that round give 45 of 45 edits with 1 extra item (not a blind result).
- **PDF annotations.** Highlight, strike-out and underline annotations are read from the file and listed on the words they cover ("Highlighted (annotation): …"); stamps and free-text notes are named with their text ("Stamp added (annotation): “FOR COMMENT”"), unless the text fills less than about a quarter of the note's box; a notice counts a file's annotations by kind. The limits:
  - This happens only in the visual check, and only on matched words of pages it compares. With `--no-visual`, on pages not compared visually, or on inserted or deleted text, the mark itself is not listed (the notice still counts it), and a highlight added on a re-typed number that also changed gives only the number change.
  - Annotation text (a stamp's or note's words, pop-up comments) is not compared word by word: a small edit inside a larger note can read only "Graphic or image changed"; a stamp or free-text note moved on blank paper gave no item at all in the probes ("No differences found", exit 0 with `--fail-on-change`, as before fix round 9), and elsewhere a moved note can read as removed and added, or as changed; pop-up texts swapped between annotations give no warning. Ink, shapes, lines and other kinds are compared as images only. A note whose text fills less than about a quarter of its box, added or edited, reads only "Graphic or image added" or "Graphic or image changed", without its text. Annotations flattened into the page give no annotation item.
  - Marks in the page content under a markup annotation are only partly seen: a strike or underline of the same kind and colour, or one touching an underline annotation, is not listed apart from it; a strike added under a strike-out annotation is not reported; an underline under a strike-out reads "Text colour or weight changed"; a graphic smaller than 2 × 2 pt recoloured under a highlight is not reported; under an opaque highlight a colour change that the tint hides is not seen.
  - Tested only with annotations written by PyMuPDF 2.1 and pypdf.
- **Word boxes** are estimated from the width of each text run, so highlights may be off by a few points with unusual fonts.
- **Fonts without a bold face.** When a font has no bold variant, PDF generators fake bold by stroking the glyphs. The visual check catches this only if the weight change is strong enough. Text drawn both filled and stroked counts as bold only for telling list labels apart; a stroke added or removed is left to the visual check.
- **Small shifts.** Lines or graphics that move by 4 pt or less are listed only after **Show**.
- **Strikethrough, underline and small marks.** These are found in the pixels around each word's glyphs, so they depend on where the glyphs are estimated to be:
  - a strike or underline on a single character or figure can be missed where the word boxes drift a few points off the glyphs (seen with Carlito and with small LibreOffice text);
  - in CJK text made bold by stroking, a strike over a two-character word can be found on its first character only;
  - a sloped strike that runs on, within a point or two, into a graphic of the same colour on the same slope counts as that graphic's stroke; the graphic is listed. A single stroke rising 10° or more across a phrase is not taken for a strike (no item, no count), and a steep stroke that runs on 10 pt or more past a short figure is only counted as compared in part (the engine before fix round 9 listed it as "Struck through");
  - lines are measured by their colour distance from the paper (by luminance on a light, saturated fill such as a highlight). Over neighbouring words, thin or light lines are listed: mid-blue (#2050c0) and green (#008000) at 0.8 pt, a 0.73 pt #00ff00 underline, a 0.4 pt black bar on a moved row. Over a single word such a line can be counted in the "compared only in part" warning instead of listed (grey #808080 at 0.8 and 1.5 pt, a 0.4 pt bar on a one-word table cell). Still partial or missed: grey strikes after a re-flow by a fraction of a pixel (some listed, some counted, some missed); thin grey strikes through bold headings in mid, saturated colours (counted, where the engine before fix round 9 listed them; on #70ad47 after a re-flow, missed); a thin grey line-through on bold 12 px text in a ruled table cell (missed); a grey strike on bold red text (listed as a colour change); a thin red strike on a bright-green highlight fill (missed). Strikes and underlines in black, navy, pure blue, dark grey, red or the text's own colour were found in the probes;
  - on a word whose bold, italic or size changed, a change of colour or highlight is not listed;
  - a dot of about 2.5 pt or less, a small mark (about 5 pt) drawn over the first letter of a longer word, and a thin dashed rule (0.75 pt) made solid are not detected.
- **Watermarks, stamps and fills.** Where a stamp, seal, watermark or fill lies over or under a word, the word's colour, weight, strikethrough and underline are compared outside the overlay's ink. Where the two cannot be told apart and the pixels there differ, the word is counted in a warning ("compared only in part", with the page and example words), and the result does not count as fully compared: `--fail-on-change` exits with 3. Some changes are only in that count, not listed:
  - a strike or colour change under a watermark or an image stamp that both versions draw in front of the text (under a stamp of about 35 % opacity or less it is listed);
  - a word made lighter, grey or heavier under the letters of a translucent watermark or stamp drawn in front of it (red or blue there is listed);
  - a strike on a figure under an unmoved translucent stamp.

  A grey or black image stamp over black text is not told apart from the glyphs, so a change under it can be missed without a count. A vector seal drawn across lines of text, its rings mostly between the words, can give only a colour item on one word and no graphic item, and a strike under its rings is not found. A word next to a changed graphic is judged, not counted, when its box is as dark in both versions within a tenth, so a very faint mark there is not counted either. The count can also include words that are fine, for example in a striped table re-flowed by an inserted row; there the shading that flips with the rows is listed as changed graphics, and a short word that moved onto a band can get a false underline. A watermark that moved or changed colour, or a rotated stamp frame drawn across lines, can still give a few false colour, strike or underline items on unchanged words. An unchanged Chinese or Japanese date re-typed by a PDF editor under an unchanged highlight annotation can get a false "Text colour or weight changed".
- **Marks on headers and footers.** A strike, highlight or mark on running header or footer text is counted with the ignored header and footer differences (shown with **Show**), not listed, and a strike on a header line drawn along a rule can be missed. `--include-furniture` (or turning off **Ignore headers, footers and page numbers** in Settings) compares these lines as body text.
- **Cut-off text.** Text that a smaller page box hides is listed as cut off, not as deleted, when the words around it kept their place. A word deleted beyond the new edge of an unchanged layout looks the same and is listed as cut off too; after a figure on the same line was re-set shorter, a deleted word that would stand inside the new page is listed as deleted. On a page whose text was scaled to fit other paper, nothing is taken for cut off.
- **Form fields.** Values of text and choice fields are compared as text, also in fields turned by a quarter turn; the same value turned the other way in its field is listed as a turn (“reads bottom to top → top to bottom”). Check boxes and radio buttons are compared only as graphics. Password fields, fields turned by other angles and values that cannot be read as text are counted in a notice and compared only as images. The size of an auto-sized value is compared only when the value reads the same, and its weight only when its box kept its size within a tenth (a viewer refits the value to a changed box). In a form flattened with its widgets kept, each value is drawn twice; there a weight change of less than about 30 % is not found, while colour and stronger weight changes are. A multiline field drawn on one line in the new version can give a false underline and colour item. A form font is resolved as PDF.js draws the field: a font missing from the form's resources falls back to Helvetica. When a header or footer value changes and a page is added, the change says "in N places" for the paired pages, and the copy on the added page is counted, not listed.
- **Renumbering.** A list or clause number is hidden as automatic renumbering only when numbered items at the same level were added, removed or moved above it. A first column of figures that starts at 1 and counts up by one, under no quantity header (Qty, Menge, Stück …; "Count", "Nb" or "Uds" do not count as one), can still be taken for row numbers, also when set close to the next cell: its changes lose their percentage, and where rows added above explain the shift they are counted as renumbering instead of listed. A heading numbered on from the steps above it (steps “1.”, “2.”, then a heading “3.”), or set like them (bold the PDF does not draw), reads as part of their list, and a column of measures such as 2.1–2.4 at the line starts under a heading or item numbered “2.” reads as its sub-clauses. A number changed by hand there can be counted as renumbering (in the notice, shown with **Show**) instead of listed. The opposite also happens: row numbers in a table column are recognised when at least three rows leave a clear gap after the number. Columns set closer than about 0.4 em, columns of fewer than three rows, and rows whose narrowest gap is a column gap (seen in CJK-style tables) are not recognised, so after an inserted row each renumbered row is listed as a number change with a percentage. A row number typed by hand breaks the column: the correctly renumbered rows after it are listed (without a percentage), and one typed above the column keeps its percentage ("10 → 1 (-90%)").
- **Numbers.** Percentage points are given only when the figure itself ends in %; a rate written "4 per cent" or a figure in a "Change (%)" column gets a relative change. When both values are negative, the relative change is that of the magnitude (−1.8 → −2.6 reads "+44%"). A percentage is also shown on figures that are not amounts, such as the day of a date ("30 → 18 (-40%)" for 30 → 18 November) or the last digits of an account number. A leading △, a trailing minus ("43.30-") and DR/CR are not read as signs, so a balance that changed sign this way is not marked "sign changed"; a sign written in words ("en notre faveur" → "en votre faveur") gives a relative change ("43.30 → 127.50 (+194%)"). In Chinese and Japanese, a date written with 年, 月 and 日 is compared as one date, without a percentage, when the month is written with its year or day and the parts stand together. A month, year or day alone (6月, 2026年, 每月1日), a two-digit year, a date in Chinese numerals, or a date spread over table cells or broken after a short line is read figure by figure (with a percentage) or as text; neighbouring cells within about 1 em can be read as one date. A full-width minus right after a Chinese or Japanese character is read as the sign of its figure, but a range dash after a unit of four or more characters ("3个工作日－5个工作日") or after a reference word other than 表, 図, 图, 圖, 式 or 第 is read as a minus too, and a real minus with a figure up to three characters before it ("2023年同比－5%") is read without its sign, so the stated direction can be wrong ("5% → 6% (+1 pp)").
- **Re-pagination** can still leave items:
  - a rule that closes a table fragment at a page break that moved is counted with the repeated header rows (shown with **Show**) when the other version closes the same table on that page with a matching rule. Anything drawn like such a rule is counted with it, not listed: a rule drawn by hand under the last row before the break, a closing rule made slightly heavier (by less than about a quarter) or a different grey, a faint line along it, or a light grey dash just below it. Where the rules do not match, or the last cell before the break was edited, the rule is listed;
  - a footnote that follows its reference onto the next page, a paragraph that crosses a footnote onto the previous page, and a table row that crosses a page break below a running header printed only on later pages are listed as moved.

  In round 5, one early insertion in a 37-page report gave 11 such items in the first run; after fix round 9 it gives 1 (the footnote that followed its reference onto the next page). The case's second extra item is the false "Moved and edited" footnote under Descriptions and excerpts below.
- **Sideways moves** are checked for whole lines only. A value moved into another column of an otherwise unchanged row (from Débit to Crédit, which reverses a booking) is not listed, and nothing says it was not checked. A block of several lines moved sideways gives one item per line.
- **Descriptions and excerpts:**
  - an excerpt's context comes from the new version (for a change joined with re-typed text, from the old version), so beside a changed word it can show words of the other version;
  - a sentence rewritten around an unchanged phrase can be listed as two adjacent changes;
  - in Chinese and Japanese the excerpt shows up to 18 characters on each side and stops at the end of a sentence, but at no other boundary, so in forms and bilingual tables it can run into the neighbouring field or cell or start in the middle of a word;
  - a footnote edited on a justified line can be listed as "Moved and edited" although it did not move;
  - a page turned with /Rotate is described as "Page size changed: 595 × 842 pt → 842 × 595 pt", not as a rotation;
  - content repeated word for word is marked as such only when the repeat is a change of its own: a duplicated page inserted next to a new page is listed as one insertion, without the note.
- **Sub- and superscript.** A change only of script form ("CO2" → "CO₂", a raised "rd") is not named as such. Raised digits that read as the same characters give no item; in reportlab output the same change was listed as misleading text changes ("Changed “CO2” → “CO”" plus "Added “2”").
- **Pages without text** (a chart, a scanned page) are paired automatically only from the pages around them. When that is not possible, ChangeLens says so, and you can pair the pages by hand: **Pair pages** in the page map, or `--pair OLD:NEW` in the CLI.
- **Speed.** On a 4-core Xeon VM (2.1 GHz), 8 → 9 pages take about 0.6 s for text and about 6.2 s with the visual check; 24 pages take about 0.8 s and about 13.2 s. Fix round 9 added about 5–7 % to the visual stage, measured A/B on the same idle VM. Fix round 8 had added about 12–15 %, and on pages with a large slanted watermark about 1.7 times as long (a 34-page memo: 37.4 s against 22.4 s; not re-measured since). See [EVALUATION.md](docs/EVALUATION.md#performance). The visual stage can be switched off with `--no-visual` or in Settings.
- **Very large pages.** Pages are rendered within a pixel budget. Pages larger than about 2A0 are not compared visually, and a notice names them.
- **Faint graphics.** Fills lighter than about #f9f9f9 (fewer than 6 levels from white) and hairlines fainter than about 12 levels are not detected. Faint graphics are only checked between matched lines of text. A pale highlight drawn close around a word (in the page content; a highlight annotation is listed as such) lies inside the text and is listed on the word as "Text colour or weight changed" from about 12 levels of difference. Within about 40 levels it is not listed in the middle of a highlighted paragraph whose lines touch, where a band across a whole row was re-tinted, where the other version has a band, panel or stripes of that colour within about two lines, where a graphic of that colour changed on the same rows, or where any graphic changed within about 3 pt of the word. A row band re-tinted by more (grey to orange, 66 levels in the blue channel) gave that item on its unchanged black text, beside the listed graphic.

## Roadmap

- [ ] Images (PNG/JPEG) and slide decks (PPTX via PDF export)
- [ ] OCR for scanned PDFs
- [ ] Multi-column reading-order reconstruction
- [ ] Pairing pages without text across larger reorderings (today: by position and coarse look between paired pages)
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

## Contributor and agent guidance / 开发规范

Before implementing anything, read [AGENTS.md](AGENTS.md) and the [project quality brief](docs/QUALITY_BRIEF.md). They cover research, differentiation, design references and acceptance criteria. Decisions and evaluation evidence are recorded in [docs/DECISIONS.md](docs/DECISIONS.md) and [docs/EVALUATION.md](docs/EVALUATION.md).

后续开发（包括 Agent）请先阅读上述工作规范与项目 brief：先验证技术选择和核心亮点，再完成设计、实现与验收。

## Privacy

The web app is a static site. PDFs are read with the File API and processed in your browser, and nothing is sent anywhere. Review marks and notes are kept in your browser's local storage, keyed by a hash of the two files.

## Licence

[MIT](LICENSE). ChangeLens uses [PDF.js](https://github.com/mozilla/pdf.js) (Apache-2.0) and optionally [@napi-rs/canvas](https://github.com/Brooooooklyn/canvas) (MIT).

# Decisions

Short records of the choices that shape ChangeLens. Sources were consulted on 2026-11-03 unless noted. From this session only github.com was reachable. The following sites could not be opened, so nothing here relies on them: helpx.adobe.com (Acrobat "Compare files"), docling-project.github.io, draftable.com, liquidtext.net, design-system.service.gov.uk. Where a project's content also exists in its GitHub repository, that copy was read instead.

## D1 · Parse and render with PDF.js, in the browser and in Node

- **Decision**: [PDF.js](https://github.com/mozilla/pdf.js) via `pdfjs-dist` **6.4.299** (released 2026-10-03), legacy build, pinned.
- **Why**: one engine covers browser and CLI. Files never leave the device. It provides text runs with position, size and the real font name (with `fontExtraProperties`), and it renders pages for the visual check. For PDFs with a text layer, the text is exact; no model is needed.
- **Version**: 6.5.438 (2026-11-01) was less than two weeks old when this was written, so it was not adopted. Its notes mention moving canvas drawing to a worker (api-minor), which is worth testing before upgrading. 6.0.227 was a major release: it removed `PDFDocumentProxy.destroy` (we use `loadingTask.destroy()`) and raised the minimum browsers. The legacy build is used because the modern build calls `Map.prototype.getOrInsertComputed` natively.
- **Limits**: there are no per-glyph boxes, so word boxes are estimated from the run width with Helvetica/Times advance widths (`src/core/fontwidths.ts`). Reading order is the content-stream order.
- **Alternatives**:
  - Poppler/pdftotext: native and CLI-only, with no in-browser path.
  - PDFium compiled to WASM: a heavier build, with no clear benefit for text PDFs.
  - [Docling](https://github.com/docling-project/docling) (MIT, Python ≥ 3.10, layout/table models and VLM support, from its README): kept as a candidate for scanned or complex layouts only (see D6).
- **Source**: release list at github.com/mozilla/pdf.js/releases; API checked against the bundled `types/` of the installed version.

## D2 · Render in Node with @napi-rs/canvas

- **Decision**: `@napi-rs/canvas` (^1.0.10, optional; PDF.js already lists it as an optional dependency).
- **Why**: a Skia binding with prebuilt binaries ("Zero system dependencies", per its README), so `npm install` works without a C toolchain. Without it, the CLI still compares text and says that graphics were not compared.
- **Source**: github.com/Brooooooklyn/canvas README.

## D3 · Compare one word stream per document, not page by page

- **Problem**: one inserted paragraph shifts every later page. Page-by-page methods then flag every later page. The brief names "插页与重排不会让后续所有页面失配" as an acceptance check.
- **Decision**: each document becomes one stream of words (CJK: characters; numbers stay whole, with sign). The diff runs across the whole stream. Page correspondence (old p. 3 → new p. 4) and synchronised scrolling are then derived from the matched words.
- **Algorithm**: these are classic methods, not new research.
  - Patience anchoring on unique words, after Bram Cohen's patience diff.
  - Myers' O(ND) diff (1986) for small segments. For small segments, the anchored and the minimal result are compared, and the one whose matches form longer unbroken runs wins.
  - Semantic clean-up of tiny coincidental matches, following diff-match-patch's `cleanupSemantic` ("so that the diff is more human-readable", from its wiki on github.com/google/diff-match-patch).
  - Sliding insertions and deletions to paragraph boundaries, and turning "delete X / insert …X" back into pure insertions.
- **Baselines**: a line diff of extracted text, and a page-N-vs-page-N pixel diff (the approach of [diff-pdf](https://github.com/vslavik/diff-pdf), whose README says it "is provided as-is and the code is not being actively developed").
- **Evidence**: [EVALUATION.md](EVALUATION.md).

## D4 · What counts as a change, and what is only disclosed

- **Shown as changes**: text edits; numbers, including signs (`500 → −500`, `(1,200) → 1,200`, described as "sign changed"); moves (≥ 80 % identical blocks); duplicates ("repeats p. 2 word for word"); formatting (bold/italic/size/font, merged when the same change repeats in ≥ 3 places); position (an intact line moved sideways > 12 pt, given in mm); text cut off at the page edge; graphics and colour.
- **Hidden but stated** (the brief asks that filtering never be silent): headers, footers and page numbers; graphics displaced by ≤ 4 pt ("minor shifts"); list numbers that change only because an item was inserted or removed above them (added after blind round 2); case-only differences when case is ignored. Every hidden category shows a count and a "Show" action.
- **Merged**: the same replacement in three or more places (a party renamed throughout) is one change "in N places", with every place highlighted.
- **Stated as not covered**: pages without a text layer, glyphs without a Unicode mapping, and new pages whose text is mostly unmatched (< 50 %), which say "check in full". "No differences found" is never printed without these notes.

## D5 · Visual comparison that survives repagination and anti-aliasing

- **Region alignment**: each old region is compared with where its surrounding text moved, trying the anchors above and below it. A pixel row belongs to its nearest anchor line. If that line went to another page, the row is not compared in this page pair. This fixed noise at page breaks in long tables.
- **Text is masked**: the text diff already covers it.
- **3 × 3 box blur before comparing**: a 0.75 pt border at a different sub-pixel phase is one dark row versus two light rows. The blur makes these look alike while keeping total ink, so additions and removals remain visible. Found through the held-out table case.
- **Minor shifts**: a region counts as a minor shift only if *one common offset* within ±4 pt explains at least 85 % of its differing pixels. A per-pixel "anything nearby" rule wrongly hid a tick added inside a checkbox; the `small-graphics` case now guards against this.
- **Explained regions**: a graphic difference within 9 pt of a reported text change (cell borders around inserted cells), or within 36 pt of moved text (a stamp's frame), is attributed to that change.
- **Trade-off, stated in the UI**: a line or bar that moves by less than 4 pt is listed only after "Show".

## D6 · Manual page pairing (added 2026-11-03)

- **Who and when**: a reviewer sees a page flagged as "no text layer" or "mostly new content". They know which page it corresponds to, for example a chart page that follows an inserted page.
- **Why the automatic pairing is not enough**: pages are paired from matched text. A text-less page between pages that moved by different amounts cannot be paired by interpolation, so it was not compared visually, and its change was missed. `test/fixtures/textless-*` reproduces this.
- **Decision**: the reviewer can pair pages, either in the page map (click the old page, then the new page) or with two selects, which also works by keyboard. A pair overrides the automatic mapping for visual comparison and synchronised scrolling, and text anchors that contradict it are dropped. Pairs are kept per file pair in local storage, listed with a remove button, shown as dashed links in the page map, and listed in the report and JSON. The CLI takes `--pair OLD:NEW`. The text comparison is document-wide and does not use page pairs.
- **Not done**: automatic pairing of text-less pages by image similarity, a possible next step that could reduce how often manual pairing is needed.
- **Verification**: a fixture test (the change is missed without the pair and found with it), plus a browser run covering the notice, map clicks, the keyboard form, reload persistence, removal and the report.

## D7 · Not adopted (for now)

- **Docling / VLM layout parsing**: it solves layout and reading order for complex or scanned pages, at the cost of a Python runtime, model downloads and no in-browser path. Text-layer PDFs don't need it. It is a candidate for the OCR/complex-layout milestone, to be compared against the PDF.js baseline on our corpus first.
- **OmniDocBench** ([repo](https://github.com/opendatalab/OmniDocBench), CVPR 2025): it measures *parsing*: text edit distance, table TEDS, reading order, with English, Chinese and mixed documents. It does not measure *diff* correctness, and its README says the dataset "is for research purposes only and not for commercial use". So it is used only as inspiration for per-category reporting; we built our own diff ground truth.
- **Competitors not compared first-hand**: Adobe Acrobat "Compare files" and Draftable. Their documentation could not be opened from this session, and we make no claims about them.

## D8 · Interface: references and what was taken from them

Each reference was viewed as a real screenshot or as source text.

| Reference (what was viewed) | Principle taken | How ChangeLens applies it | Not applicable |
|---|---|---|---|
| GitHub rendered prose diff: `rendered-prose-changes.png` and "Rendering differences in prose documents" in github/docs | A margin bar marks the changed block; inline strikethrough for old and highlight for new; a tooltip for changes that are invisible in the rendered text (attributes) | Change bars in the page margin next to every highlight (visible even at fit-width zoom); del/ins excerpts with context; tooltips for format and position changes | The source/rendered toggle (a PDF has no source); line comments |
| GitHub pull request "Viewed" checkbox: `viewed-checkbox.png` | One explicit review state per item, plus overall progress | ✓ / ⚠ per change, a note, "Reviewed n of N", saved locally and exported in the report | Binary only. Documents need "needs attention" too, so there are two states |
| GOV.UK Design System error message guidance (`src/components/error-message/index.md` in alphagov/govuk-design-system) | Say what went wrong and how to fix it; plain words; be specific; no "please", "sorry" or "invalid" | Errors and notices name the cause and the consequence, e.g. "no text layer, so the text there could not be compared"; scanned PDFs are named as unsupported | Form-field-specific patterns |

**Two layouts were considered**: (A) document first, with large pages and the list collapsed; (B) list first, with the change list beside synchronised pages. B is the default, because a review starts from "what changed" and the long-table and demo cases have 3–13 changes spread over many pages. A is available as "Hide change list". This choice is a judgement, not the result of a user study.

**Visual language**:
- System UI fonts with CJK fallbacks (PingFang SC, Hiragino Sans GB, Microsoft YaHei, Noto Sans CJK SC).
- Type sizes 12–17 px for UI, 26–38 px for the single landing heading.
- Colour semantics: red removed, green added, blue moved, purple layout, amber number. Colour is never used alone: every badge has a text label, there is a legend, and every highlight has a written description.
- Motion only locates (a pulse on the selected change) and is turned off under `prefers-reduced-motion`.
- The landing page shows one real result from the bundled demo, plus an honest scope list, instead of feature cards.

## D9 · Accessibility status

- **Done**: keyboard navigation (`j`/`k`, Enter/Space on list items, focus outlines), text labels alongside colour, reduced motion, layout down to 390 px wide.
- **Done in the review round (2026-11-03)**:
  - The page map is keyboard-operable: one tab stop, arrow keys, Up/Down to the other version, Enter/Space. Tiles are named ("New version, page 6, has changes").
  - Focus stays in place after filter tabs and review buttons.
  - The off-canvas list is inert while closed; the menu button has a name and `aria-expanded`; the comparison overlay makes the page inert and has a Cancel button.
  - Measured contrast (computed styles, Chromium): change badges 5.2–7.3 : 1, drop-zone tags 5.35–5.57 : 1, error text 5.15 : 1, resting review icons 3.40 : 1 (light) / 4.46 : 1 (dark). WCAG 2.2 needs 4.5 : 1 for text (1.4.3) and 3 : 1 for icons (1.4.11).
- **Not done**: a full WCAG 2.2 audit. The screen-reader flow, the 3 px review status bar and the page-map tiles were not measured, and only Chromium was tested. No compliance is claimed.

## D10 · Code review round and what it changed (2026-11-03)

**Decision**: before claiming the core highlight, review the code adversarially and fix what a second, independent agent reproduces.

- **How**: six reviewers (diff, text extraction, visual, web, CLI, evaluation) wrote findings with a scenario; six verifiers reproduced each one independently. 72 findings were confirmed, 9 of them high. Each was fixed with a regression test that fails before the fix, in five separate branches that were then merged. The full list with repro scripts stays out of the repository (it is working material); the tests are the durable record.
- **High-severity examples**:
  - A moved paragraph hid edits inside it ("Moved a paragraph" while 100 became 900).
  - A fully revised table collapsed into "Rewrote N words".
  - Amounts at the top or bottom of a page were treated as page numbers and hidden.
  - Inserted pages without text were never compared.
  - The text mask hid strikethrough and underline.
  - The web app's file cache key hashed only the first 4 MB.
  - Report crops kept every rendered page in memory: 6.8 GB on 151 pages, 0.74 GB after.
- **Scoring changed with it** (`eval/score.ts`):
  - *found* now follows the documented rule: one reported item may cover several truth items.
  - A *separate* count keeps the stricter one-to-one view.
  - Kinds must match (a deletion reported as a move is a miss).
  - Truth items without text need a region.
  - Pages must be explicit when a snippet is ambiguous.
  - `maxItems` caps how many reported items one edit may explain.

  Under the old greedy one-to-one rule the baselines had too little credit: on the original 17 pairs the text line diff goes from 29 to 42 of 60 found, and the pixel diff from 51 to 60. ChangeLens stays at 60.
- **Rejected alternative**: fixing only the high findings. Most medium findings were wrong numbers or misplaced highlights in common documents (percent rates, several figures in one row, centred lines after a font change), which is exactly what the brief asks to verify.
- **Limits**: every finding came from synthetic documents written by agents. The fixes were tuned on the same scenarios they were found with, so they are evidence that those cases work, not that the class of problem is gone.

**Second review and blind round 3 (same day).**
- **What happened**:
  - A second review of the fixed code found 43 further defects, all reproduced by a verifier. Several were regressions introduced by the first fixes.
  - The blind round 3, run once before those fixes, found fewer edits than the text line diff (55 against 57 of 73).
  - Both were fixed together.
- **Decision on the scorer**: a truth snippet also matches a change whose reported text lies inside it, when the snippet lies inside what the reader sees around that change (the excerpt's context).
  - Why: ChangeLens reports the changed tokens and shows the rest as context, whereas the line diff always reports whole lines.
  - This was decided **after** seeing the blind result. So the recorded numbers are kept and reproducible with `--strict-snippets --strict-carets`, and every table shows which rules it uses.
  - Rejected: changing the truth files. They are the independent authors' record.
- **Cost**: the added visual checks make the visual stage about 60 % slower (EVALUATION, Performance). That is accepted for now, because the checks remove misses (strikethrough, pages without text, light fills) without adding noise on the corpus. Speeding up the per-pixel loop is open work.

## D11 · After blind round 4: read form fields, and hide only with evidence (2026-11-04)

**Form field values.**
- **Decision**: read AcroForm text and choice field values from the widget annotations, and compare them as page text marked "(form field)". The calls are PDF.js `page.getAnnotations({ intent: 'display' })` and the widget data fields `fieldValue`, `comb`, `maxLen` and `password`, checked in the installed `pdfjs-dist` 6.4.299 (`types/src/display/api.d.ts` and the legacy worker build). Check boxes, radio buttons and signatures stay with the visual comparison. Values that cannot be read as text are counted in a notice: password fields, widgets turned by an angle other than a quarter turn (since fix round 8, widgets turned by /MK /R 90, 180 or 270 are compared as text), and pages whose annotations fail to load.
- **Why**: round 4 missed all three form field edits, silently. `getTextContent()` does not return widget values. Poppler's `pdftotext` does print them, checked on `holdout4-g-form-values`, so a reviewer comparing text would see them.
- **Alternatives**:
  - Rejected: comparing fields only as images, as in the round-4 run. A changed value then reads "Graphic or image changed", without the old and new text.
  - Rejected: only a notice that the PDF has form fields. It discloses, but it does not compare.
- **Limits**:
  - A value that is also printed in the page content is not added twice.
  - Comb fields are read as one value.
  - XFA forms are untested.

**Suppression needs positive evidence.**
- **Decision**: a rule may hide or fold an item only when something already listed explains it. Examples:
  - numbered siblings were added, removed or moved, and their net count equals the shift;
  - the old text reached past a narrower page edge, and the visible glyphs kept their place;
  - an overlay's own ink accounts for the pixels that differ around a word.

  A missing counter-example is not enough.
- **Why**: fix round 5 took round 4 from 168 extra items to 4 (current scorer rules), but adversarial probes then showed 17 medium or high cases where a real edit was hidden as a consequence. Examples: labels renumbered by hand, times read as clause numbers, an amount edit folded into a cut-off item, strikes under a removed watermark.
- **How it was checked**:
  - About 80 probe PDF pairs (synthetic, by three probe authors), each re-run by an independent verifier.
  - Every confirmed medium or high probe is now a regression test asserting what the reviewer must see, next to its control.
  - The evals did not move: 117 / 117 / 0, 73 / 73 / 1, and 118 / 118 / 4.
- **Rejected alternative**: removing the round-5 rules. The noise would come back, and noise is what made round 4 hard to review.
- **Limits**: the probes were written knowing the rules, by the same kind of agent that wrote the fixes. They show that these cases work, not that the class of problem is gone. A fifth blind set is the next independent check.

**Scorer rules decided after the run.**
- **Decision**: four rules credit correct reports that the registered rules missed (EVALUATION, Scoring). They are on by default and off with `--registered-rules`. Every round-4 table says which rules it uses.
- **Rejected**: editing the round-4 truth files. They are the independent authors' record.

## D12 · Fix round 8: count what could be compared only in part (2026-11-06)

- **Decision**: where a stamp, seal, watermark or fill lies over or under a word, compare the word's colour, weight, strikethrough and underline outside the overlay's ink. Where the overlay and a change cannot be told apart and the pixels there differ, count the word in a warning instead of listing or hiding it. The warning reads "compared only in part" and gives the page and example words. The words are also in the JSON coverage (`partlyCompared`), and `--fail-on-change` then exits with 3, not 0.
- **Why**: review round 7 and the verifiers of fix round 8 found opposite failures on the same kind of page:
  - strikes under an unchanged watermark missed silently (R4-09);
  - dozens of false colour items on unchanged words under a translucent watermark.

  D11 says a rule may hide an item only with positive evidence. Under an overlay there is often no evidence either way, so the honest result is a count.
- **Alternatives**:
  - Rejected: listing every word whose pixels differ under an overlay. That brings back the noise of round 4.
  - Rejected: skipping such words, as before fix round 8. The result then read "No differences found." when it was not fully compared.
- **How it was checked**:
  - Probe pairs with real strikes, colour and weight changes under watermarks, image stamps and fills, each with its control (fixtures `test/fixtures/probe8-F2-*`, `probe8-T-V2-*`, `probe8-V-V2-*`, all SYNTHETIC).
  - The same documents compared with themselves give "No differences found." and exit 0: words whose pixels are identical in both versions are not counted.
  - Verified twice on the merged engine by independent verifiers (EVALUATION, Review round 7 and fix round 8).
- **Limits** (also in the README):
  - The count can include words that are fine, for example in a striped table re-flowed by an inserted row.
  - A grey or black image stamp over black text is not told apart from the glyphs, so a change under it can be missed without a count.
  - The visual stage takes about 1.7 times as long on pages with a large slanted watermark.

## D13 · Fix round 9: read re-typed text in place, and read markup annotations (2026-11-07)

**Text stored after the page footer.**
- **Decision**: lines drawn after a page's footer are put back in reading order by their position on the page (`restoreReadingOrder` in `src/core/tokenize.ts`) and compared there. An info notice names the pages and the number of lines, and the JSON coverage has `outOfOrder`. This is done only for upright lines on pages without form field values whose footer is drawn after the body, and only where a line has a clear place: on the baseline of a line drawn before the footer (filling a gap in it, set against one of its words, or with the lines around it reaching across), in a row of the same table, or between two lines it fits between. Everything else keeps stream order (the rules are in the comment on `restoreReadingOrder`).
- **Why**: in the first run of round 5, text that PyMuPDF writes after redacting, and its HTML boxes, caused 18 of the 29 misses and 20 of the 78 extra items. Each edit became a deletion in place plus an insertion at the end of the page, several values were merged into one insertion, and false rewrites crossed pages ("Rewrote 86 words"). Browsers store positioned text the same way.
- **Alternatives**:
  - Rejected: keep stream order and only add a notice. The reviewer would be warned, but each edit would still be split, and the false rewrites would stay.
  - Rejected: geometric reading order for every page. It would re-order pages that are already in reading order, where stream order is right and the evaluation sets pass; multi-column reading-order reconstruction is still on the roadmap.
  - Not adopted: layout analysis of the rendered page, as OCR tools do it. It would need a model or a large dependency for what the positions in the file already give, and its result would not be deterministic.
- **Limits** (also in the README, Reading order): footer-first pages (a reportlab canvas, office suites) are not restored and get no notice; placement is decided in each version on its own, so positioned text placed in one version only can be listed as deleted and added again; a phrase re-typed next to the word it replaces is an insertion plus a deletion.

**Markup annotations.**
- **Decision**: read annotations with PDF.js `page.getAnnotations({ intent: 'display' })` (installed `pdfjs-dist` 6.4.299; the method is typed `Promise<Array<any>>` in `types/src/display/api.d.ts`, and the fields used, `subtype`, `annotationFlags`, `rect`, `quadPoints`, `color`, `contentsObj`, `textContent` and `hasAppearance`, are those the legacy worker build sets). Highlight, StrikeOut, Underline and Squiggly annotations (ISO 32000 text markup annotations) are listed by name on the words their quadrilaterals cover ("Highlighted (annotation): …"). Stamp, FreeText and Text annotations are named with their text; a stamp's text is read from its appearance in the page's operator list. Annotations flagged Invisible, Hidden or NoView are left out. A notice counts a file's annotations by kind and says that their own text is not compared as text.
- **Why**: in the first run, markup was compared only as the pixels PDF.js draws. A red strike-out annotation was listed as a colour change, a highlight as "Text colour or weight changed", and nothing said that a file had annotations.
- **Alternative**: pixel-only comparison, as before. Rejected for text markup, because the file says exactly which words are marked and how. Kept for ink, shapes, lines and other kinds, which are compared as images only.
- **Limits** (also in the README, PDF annotations): marks are listed only in the visual check and only on matched words of compared pages; annotation text is not compared word by word; marks in the page content under a markup annotation are only partly seen; tested only with annotations written by PyMuPDF 2.1 and pypdf.

**Also in this round**: row numbers set closer than one em to the next cell, closing rules of table fragments at moved page breaks counted with the repeated header rows, thin and light lines measured by colour distance from the paper, the Chinese and Japanese excerpt sized by a character budget, and 年月日 dates compared as dates (EVALUATION, Held-out round 5 after fix round 9).

**How it converged.** Each stream went through five or six passes of fix and independent verification. A verifier re-ran the fixer's probes, built counter-probes with a real edit next to each new rule and a control without it, and compared every output with the published engine `25e9ffe`. In passes 5 and 6 the fixers took every new problem by one rule: fix it narrowly, or restore the published engine's behaviour for that case and list the case as a limit. A new rule that hides or folds an item still needs evidence that the item follows from a listed change (D11). Where neither was possible without a new heuristic, the behaviour was left and documented.

**How it was checked**:
- Round 5, same 18 cases, no longer held out: 139 / 139 / 16 (138) with the default rules, against 115 / 115 / 78 (114) in the first run; the six PyMuPDF cases 45 of 45 with 1 extra item, against 23 of 45 with 23.
- The other sets: 117 / 117 / 0 on the 31 non-blind pairs, 73 / 73 / 1 on round 3, 119 / 119 / 3 on round 4.
- The merged engine was verified as a whole: on all 79 evaluation pairs it equals the published engine plus the two streams' changes; 1,782 text and 473 visual probe pairs are unchanged from the streams; 58 SYNTHETIC counter-probes where the streams meet list every real edit, with one false low item. `npm test` passes 576 of 576.
- The visual stage takes about 5–7 % longer (EVALUATION, Performance).

**Limits**: the fixes were made with the round-5 cases and with probes written for them, so they say nothing new about other documents. Several regressions against `25e9ffe` remain, all low or medium and listed in the README: thin grey strikes through bold headings in mid, saturated colours are counted instead of listed; a strike on a figure under an unmoved translucent stamp is counted; look-alikes of a closing rule at a moved break are counted with it; a first column counting up from 1 set close to the next cell can be read as row numbers; a CJK range dash after a long unit is read as a minus; an unchanged CJK date re-typed under a highlight can get a false colour item; positioned text placed in one version only reads as deleted and added.

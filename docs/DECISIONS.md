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
- **Not done**: a full WCAG 2.2 audit (screen-reader flow and contrast of every state have not been measured), so no compliance is claimed.

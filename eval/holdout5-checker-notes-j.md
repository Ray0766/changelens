# Checker notes: author j, held-out round 5

Checker: independent blind checker. Date: 2026-11-04.
Checker scripts and outputs: `/tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/blind5/check-j/` (`tools/`, `out/`, `png/`, `pjs/`, `side/`, `regen/`).

## Fixes made (truth.json only; no PDF was changed)

### holdout5-j-datasheet-overlay

1. **Item 6 (`format`, "3 Electrical connection", p. 2): `newRect` too wide.**
   - Wrong: `newRect` was a copy of the old Inter Bold glyph box, `[62.4, 70.9, 128.7, 13.9]`, which ends at x 191.1. The re-typed Times-Bold heading is narrower. MuPDF's span bbox is x 62.4–174.2, and the rendered ink runs from x 62.5 to 174.0. So the right edge was about 17 pt off.
   - Changed: `newRect` is now `[62.4, 70.9, 111.8, 13.9]`. `oldRect` is unchanged. I added a sentence to the note.
   - Evidence: `page.get_text('dict')` span, `Times-Bold 11.5`, bbox `[62.4, 70.1, 174.2, 86.0]`; the ink bbox of a 4× MuPDF render; overlay `check-j/side/ds-fixed-1.png`.

2. **Item 8 (`insert`, firmware note, p. 2): snippet not found by `pdftotext`.**
   - Wrong: the snippet "transmitter firmware 2.4 or later is required" matches PDF.js but not `pdftotext`. `pdftotext` keeps the htmlbox ligature (U+FB01 in "ﬁrmware"), so the snippet matched only after NFKC normalisation. A text-diff baseline built on `pdftotext` would miss it unless the scorer normalises.
   - Changed: `new` is now "2.4 or later is required for the low". It has no ligatures and occurs once in the after p. 2 text, in both PDF.js (stream order and position-sorted) and `pdftotext`. It is absent from before p. 2. I added a sentence to the note.

3. **Description: "the after file has no annotations" was not accurate.**
   - Wrong: Typst writes two /Link annotations for the footnote, marker → footnote and footnote → marker. Both are in before p. 2. The redaction of the footnote text removed the back-link, so after p. 2 still has one /Link, the one on the in-text marker. Links have no appearance, so nothing visible changes and no truth item is needed.
   - Changed: the sentence now says that no edit adds an annotation, and explains the remaining link.
   - Evidence: `page.links()` and PDF.js `getAnnotations()`. Before p. 2 has links at `[242.8,113.4,245.7,126.2]` and `[70.4,766.0,72.9,775.9]`; after p. 2 has only the first.

**Generator follow-up for the author:**
- `ds_truth()` in `make-holdout5-j.py` still produces the old values. A rerun would overwrite these three fixes.
- Suggested changes:
  - newRect: build it from the Times-Bold text width, `pymupdf.get_text_length(..., "tibo", size)`.
  - Snippet: change it to the new one.
  - Description: change it to the new sentence.

## Checked and found correct (no change)

- **Structure:** all six files parse. Each has `synthetic: true`, `set: "held-out-5"` and `blind: true`; every item has valid types and explicit integer pages; there are no empty snippets.
  - Each graphic has a rect.
  - One-sided rects are used only for additions that exist on one side: annotations (stamp, highlight, strike-out, free text, underline, ink) and the APPROVED stamp.
- **Snippets:**
  - All 45 snippets are found on their stated page in PDF.js 6.4.299 `getTextContent`, both in stream order and in position-sorted lines, and in `pdftotext` 24.02.
  - Every snippet occurs once on its page.
  - The old snippet is absent at the new place and the new snippet is absent at the old place.
  - The one exception is the lease item `−250.00 → 250.00`, where the new snippet is a substring of the old one. This is inherent to a sign-only change and matches the convention in `eval/cases/numbers/truth.json` (`-1,200 → 1,200`).
- **Text diff:**
  - The word-level diffs (PDF.js sorted and stream order, and `pdftotext`) show only the listed edits.
  - In the Chinese case they also show the named reflow and list renumbering.
  - In `pdftotext` they also show the annotation texts ("FOR COMMENT", "APPROVED", the free-text note), which PDF.js does not return.
  - The handbook pages were diffed along the page mapping 1→1, 7→2, 2→3, 3→4, 5→5, 2→6, 6→8. Only 48.00→52.00 and 0.32→0.35 differ. Old p. 4 text appears nowhere in after.
- **Renders:** I rendered every page with `pdftoppm -r 60` and pixel-diffed each mapped pair; I also rendered the key pages with PDF.js at 60 dpi.
  - Every changed region corresponds to a truth item.
  - Every rect agrees with the render within a few points, except datasheet item 6 (fixed above).
  - Two diff regions belong to listed items, not to extra edits:
    - The lease p. 1 poppler-only diff at about (248, 496) is a hinting artefact. Glyph origins are identical and MuPDF shows no diff there.
    - The PDF.js edge pixel at the start of the datasheet DN100 bar is part of the bar edit.
- **Generator:** I reran it into the empty folder `check-j/regen/`.
  - All files are byte-identical except `invoice-incremental/after.pdf`.
  - That file differs only in the second trailer /ID. Its characters, their positions and its 60-dpi pixels are identical.
  - The incremental property holds: `before.pdf` is a byte prefix of `after.pdf`, which has 2 `%%EOF` markers.

## Minor remark (not a truth defect)

- The author's report says that every page carries a "synthetic sample" label.
- Handbook new p. 7 (the htmlbox "5A Lone working" page) has no label, because it has no footer.
- The brief only requires the label on the first page or in a footer, and p. 1 of every file has it.

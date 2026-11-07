# Blind round 5: classification of every miss and extra item

Written by six analyst agents (one per group of three cases) and re-checked by six verifier agents, after the single recorded run (commit 1768e2d; engine frozen at f1053f3; rescores in cfa9bc5). A synthesis agent then summed the categories and grouped the causes. Each verifier re-ran its cases from a git archive whose `src/` is identical to f1053f3 and got items equal to `eval/results-holdout5-blind-items.json`. "verified" is the verifier's category. The text below is the agents' own, arranged by `write-analysis.py` from their structured output; it was not edited. Paths under /tmp are scratch folders that are not kept. Nothing here changes the recorded numbers.

Categories:
- **missed**: a real edit within the documented scope (README, "Scope and limitations") that the reviewer is not shown in any listed item, count or notice. Silent.
- **missed-documented**: a real edit that is not listed, where a README limit already states this exact case, or a notice or count discloses it.
- **engine-description**: the edit is surfaced, but the item misleads: wrong kind, wrong or over-broad text, split into delete + insert in different places, wrong page, a percentage on a non-amount, a false claim.
- **scorer-or-truth**: the engine's report is correct and adequate for a reviewer, and only the scoring rules (eval/score.ts) or the truth file block the credit.
- **noise**: an extra item that is not an edit at all (false colour, false line, an unchanged passage listed as moved, etc.).
- **consequence**: an extra item that is a true but derivative change the truth description names as a consequence (automatic renumbering, re-flow) and that the engine should fold or count.
- **out-of-scope-silent**: an edit of a kind the README does not claim to support, with no notice.
- **out-of-scope-disclosed**: the same, with a notice or count that tells the reviewer.

## Totals (verified categories)

144 truth items, 115 found, so 29 misses; 78 extra items. The sums below are checked by the script against the per-case rows of `eval/results-holdout5-blind.txt`.

| Category | Misses | Extra items |
|---|---|---|
| missed | 2 | 0 |
| engine-description | 18 | 22 |
| scorer-or-truth | 8 | 9 |
| noise | 0 | 3 |
| consequence | 0 | 44 |
| out-of-scope-silent | 1 | 0 |
| **all** | **29** | **78** |

The totals come from the 64 entries, using the verifier's category for each. All six verifiers agreed with every analyst category. The tally is reproducible with /tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/blind5/analysis/synthesis/tally.py.

MISSES: 18 engine-description + 8 scorer-or-truth + 2 missed + 1 out-of-scope-silent = 29 = 144 − 115.
- Typst (1 + 2 = 3, all scorer-or-truth): DV #6, Prüfbericht #7, MSA #8.
- fpdf2 (4): payslip #8 scorer-or-truth, pricelist #5 missed, relevé #4 out-of-scope-silent, statement #3 scorer-or-truth.
- PyMuPDF annot/overlay/pages (14):
  - audit: #1, #4, #7 engine-description; #6 missed.
  - datasheet: #1, #2 scorer-or-truth; #3, #4, #6, #7, #8 engine-description.
  - handbook: #1, #6, #7 engine-description. #4 is found but 'not a separate item', so it counts 0.
- PyMuPDF incremental/redact/htmlbox (8):
  - invoice: #2, #3 engine-description.
  - lease: #1, #2, #3, #5 engine-description.
  - zh: #1 engine-description; #3 scorer-or-truth.
- Engine-description: 3 + 5 + 3 + 2 + 4 + 1 = 18. Scorer-or-truth: 3 + 2 + 2 + 1 = 8.

EXTRAS: 44 consequence + 22 engine-description + 9 scorer-or-truth + 3 noise = 78.
- Typst long/bilingual (14):
  - annual: 10 table-rule items and footnote 2, all consequence (11); footnote 4 noise (1).
  - DV: underline item scorer-or-truth (1); governing-law move consequence (1).
- Typst reports/contract (5, all scorer-or-truth): Prüfbericht c7, c8, c9; MSA c8, c9.
- fpdf2 CJK/lists (3): payslip item 7 scorer-or-truth; pricelist GC-4740 move consequence; 'Protective wear' noise.
- fpdf2 statements (33):
  - rechnung: 26 + 1 + 2 + 2 = 31 consequence; 'Underlined: L' noise.
  - statement: DR→CR scorer-or-truth.
- PyMuPDF annot/overlay/pages (13, all engine-description): audit 5, datasheet 5, handbook 3.
- PyMuPDF incremental/redact/htmlbox (10): invoice 3 and lease 5 engine-description; zh c1 engine-description and c4 scorer-or-truth.
- Per category:
  - Consequence: 12 + 1 + 31 = 44.
  - Engine-description: 13 + 9 = 22.
  - Scorer-or-truth: 1 + 5 + 1 + 1 + 1 = 9.
  - Noise: 1 + 1 + 1 = 3.

Per-case arithmetic. Each case's truth − found and items − explained match the recorded row in eval/results-holdout5-blind.txt. Every verifier re-ran eval/run.ts on a git archive with src identical to f1053f3 and got items deep-equal to eval/results-holdout5-blind-items.json.

## Causes, as the synthesis grouped them

### 1. Re-typed text that PyMuPDF appends after the footer is not put back in place; the same-place join is too narrow

Misses 18, extra items 20. Cases: holdout5-j-audit-annotations (#1, #7; c2, c3, c7, c8), holdout5-j-datasheet-overlay (#1–#4, #6–#8; c1, c2, c3, c5, c6), holdout5-j-handbook-pages (#1, #6, #7; c2, c3, c4), holdout5-j-invoice-incremental (#2, #3; c3, c4, c5), holdout5-j-lease-redact (#1, #2, #3, #5; c1, c2, c3, c4, c7)

Facts (PDF.js getTextContent dumps from the analysts and verifiers):
- In 5 of the 6 PyMuPDF cases, the redact-and-reinsert text and the insert_htmlbox text come after the page footer in the content stream. Examples: audit '82' is item 70, after 'Page 1 of 2'; handbook '52.00' and '0.35' come after 'Page 3 of 7'. In zh-quote the stream is in reading order.
- src/core/tokenize.ts groupLines/buildDocModel keep stream order.

Why no replace is formed (traced with instrumented copies by both the analyst and the verifier). compare.ts inPlaceTokens joins a deletion and an insertion at the same place only when:
- (a) the hunk was 'touched' by a same-key pairing;
- (b) each side is on one line;
- (c) at least one pair exists. It returns early otherwise: lease 'pairs accepted 0', because 'March 2027' shifted 5.2 pt after '1'→'15'.

What the reviewer gets instead:
- 'Deleted X' in place, and the new value inside an 'Added …' at the page end with page-end context.
- Several values merged into one insertion: '1,975.00 15 March 2027 Retail'.
- Because headers and footers are left out of the diff stream, the appended tail is paired with the next page's head, with a deleted page or with an unrelated footnote:
  - datasheet c2 'Changed “3 Electrical connection” → “Document no. … -10”' p. 2 → p. 1;
  - handbook 'Rewrote 86 words';
  - datasheet 'Rewrote 16 words'.
- The re-typed font change on the datasheet heading is never named.

Two of the 18 misses are scoring-only: datasheet #1 and #2 'Rev. B → Rev. C'. The header count discloses them, and Show lists 'B → C' on both pages. The scorer misses them only because the appended 'Rev. C' forms a furniture line of its own (score.ts furnitureLinesDisclosed).

The analyst's CL_EXP experiment (per-line split, no early return; invoice 6/7, lease 5/7) was not reproduced by the verifier.

Fix (proposed, not made): Engine:
- Merge a run drawn after the page's last body line or footer into the body line whose baseline it shares, at its x. Otherwise insert it by y between the lines above and below.
- In inPlaceTokens:
  - split inserted runs per line;
  - allow the same-place join without the 'touched' and pairs>0 preconditions, at least for a single short or numeric token group whose box overlaps on paired pages;
  - re-diff joined pairs at word level, so '1 March 2027 → 15 March 2027' reads '1 → 15' with the numeric flag.
- Keep header and footer tokens as page separators in the diff stream even when they are not compared.
- Do not form a replace whose two sides share no words and lie on different pages or far apart on one page.
- Add a page notice: 'text drawn out of reading order on p. N; edits there may be listed as a deletion and an insertion'.

Scorer: decide furniture disclosure per page, without requiring one line-diff run.

README at f1053f3: Named only as a general condition. README Scope and limitations says: 'Reading order comes from the PDF content stream. This is right for typical generated documents. Producers that write text out of order can produce noisy diffs.' It does not describe this outcome: deletion in place plus insertion elsewhere, merged values, cross-page false replaces. No notice tells the reviewer either. All entries stay engine-description because every edit is listed in some form.

### 2. Row numbers in a table column are not recognised as labels, so automatic renumbering is listed

Misses 0, extra items 28. Cases: holdout5-i-rechnung-eur (items 3–11, 15–23, 28–35 'Number changed: n → n+1 (+x%)'; items 25 'Deleted “26”' and 27 'Added “28”' inside the false move)

Facts:
- fpdf2 sets the right-aligned Pos. column 5.66 pt (0.67 em at 8.5 pt) before the Art.-Nr. cell (PyMuPDF spans, analyst and verifier).
- compare.ts labelAt() and rowNumberAt() need a gap of at least one em (gap >= t.size). So labelSequences() finds no labels, and extractRenumbering() never folds the constant +1 shift below the inserted Pos. 7.
- ignored.renumbered = 0, and there is no notice. All 26 renumbered rows get a percentage on a position number.
- The renumbering 26→27 and 27→28 also comes out as a delete and an insert inside the false move. That move is counted under the page-break cause.

This repeats round 4. In zh-en-supply-annex, 28 renumbered row numbers were listed for a different blocking rule (no '.' after the number). The class of problem was not closed.

Fix (proposed, not made): Engine: accept a line-start integer as a row number when it heads a column of integers that counts on by one over consecutive rows, with the same right or left edge, a gap of about 0.4 em or more (or wider than the line's word spacing), and no quantity header above it. Then fold the constant shift below an inserted or deleted row into the renumbered count ('Row numbers 8–36 shift by +1', Show). Never put a percentage on a row number. When the only edits in a moved passage are its own row labels, say 'Moved', not 'Moved and edited'.

README at f1053f3: Not named. The Renumbering bullet covers the opposite failure: 'A column of figures that starts at 1 and counts up by one can still be taken for row numbers.' It also says renumbering is hidden 'only when numbered items at the same level were added, removed or moved above it', which is the situation here, so it implies these would be hidden.

### 3. A table's closing rule at a moved page break is listed as an underline and as a graphic

Misses 0, extra items 10. Cases: holdout5-h-annual-technical-report (items 1, 3, 5, 7, 9 'Underline removed/Underlined' on the last table row before a moved break; items 2, 4, 6, 8, 10 'Graphic or image added/removed' on the same rules)

Facts (PyMuPDF get_drawings, renders; both analyst and verifier):
- 0.9 pt full-width rules close each table fragment at a page foot, 0.3 pt below the row named in the item.
- The other version continues the table on that page and has no rule.
- These are exactly the 5 moved breaks that the accurate notice '5 lines repeated at the top of a page … are not listed' counts.
- The --no-visual run has none of these items.

Cause, traced to function level:
- visual.ts appearanceChanges reads the rule under the row's glyphs as an underline.
- zones() does not let that appearance item explain the region, so the rule's pixels are listed a second time as a graphic.
- keep() folds rules only into repeated header rows (consequence 'repeatedLine').

One further detail: item 10's region also covers the footnote separator that arrived with footnote 2.

Not traced: why the graphic region does not start at the rule's own x.

Fix (proposed, not made): Engine:
- When repeatedAtPageTop finds a header row that came or went at the top of page p+1, treat a full-width rule under the last body row of page p, present in one version only, as that fragment's closing rule. Fold its underline hit and its region into the page-break consequence and its notice count.
- Let an underline item explain a graphic region in its own row band.
- Fold a footnote separator together with its footnote.

README at f1053f3: Not named. README line 36 claims: 'It is built for repagination. … An inserted paragraph is one change, not eight red pages.' Here one early insertion gave 12 re-pagination extras in one document (10 here and 2 under the page-break cause), and no count covers them.

### 4. The context in Chinese and Japanese is 6 characters, and a date written with 年月日 is not a number

Misses 3, extra items 3. Cases: holdout5-i-payslip-cny (#8 miss and item 7, scorer-or-truth), holdout5-j-zh-quote-htmlbox (#3 miss and c4, scorer-or-truth; #1 miss and c1, engine-description)

Facts (scorer probes by both the analyst and the verifier):
- compare.ts context() takes 6 tokens, and a CJK character is one token.
- The truth snippets reach 7–8 characters beyond the change: 人民币壹万柒仟陆佰叁拾柒元肆角整 and 4 小时内派工程师. coversInContext therefore fails, although the items are correct and in place: '陆 → 柒' and '4 → 6 (+50%)'. With a 7-character context both are credited.
- zh #1 has two blockers, and fixing either alone does not credit it.
  - The folded date '11月30 → 12月31' has no numeric flag, because numbers.ts isNumericPhrase rejects 月. It is therefore missing from the Numbers filter and the summary count, while Latin dates get the flag.
  - Its context also falls one character short.

This repeats round 4: zh-en-supply-annex #3 had the same cause, with the fix 'Size the context by a character budget for CJK'. That fix was not made before the freeze.

Fix (proposed, not made): Engine:
- Give CJK context a character budget, for example 12–20 characters or up to the next punctuation mark.
- In textChange, when two sides differ only in figures between the same CJK date or time units (年月日时分秒), set numeric with fromValue and toValue null: a number change with no percentage.

Scorer: let a number truth be met by a numeric item on the snippet's line and page whose figures equal the snippet's figures.

Truth convention: keep CJK snippets within 6 characters of the change.

README at f1053f3: Not named. The Languages row says only 'Chinese and Japanese text is compared character by character'. Nothing in the README says excerpts are shorter for CJK or that 年月日 dates are listed as text changes.

### 5. A sentence rewritten around an unchanged phrase is split into two adjacent items, and the context comes from the new side only

Misses 2, extra items 4. Cases: holdout5-h-pruefbericht (#7; c7, c8), holdout5-h-services-agreement (#8; c8, c9)

Facts (instrumented diff.ts and compare.ts, analyst and verifier):
- diff.ts cleanupSemantic offers an equality to foldRule only when its weight is no larger than both neighbouring edits. 'der zulässigen' weighs 13 against 36 and 10; 'the Customer’s' 13 against 8 and 12.
- In the Prüfbericht, foldRule's big() check would refuse as well. In the MSA, foldRule would accept, and only the weight gate blocks the fold.

The two items are correct, adjacent and give the exact edit when read together.

The scorer needs one item to cover each side's snippet. compare.ts textChange takes context(B…), and report.ts shownExcerpt uses that one context for both sides, so the old-side snippet can never be covered.

A reviewer-facing weakness (seen in the HTML reports): each piece's excerpt shows the other piece's new words as plain context, e.g. 'Toleranz.' and 'prior written consent'.

Fix (proposed, not made): Engine:
- Compute and show context per side.
- Fold an equality of 1–2 words inside one sentence between two word-level edits into one replace, both at the weight gate and in big().

Scorer: match a replace truth against a run of adjacent text items in one block, with the unchanged tokens between them joined in.

README at f1053f3: Not named. No README sentence says that a rewrite can be split, or that excerpt context is taken from the new version.

### 6. Thin or light strikes and underlines are judged by luminance and missed or mislabelled

Misses 3, extra items 1. Cases: holdout5-i-pricelist-gbp (#5, missed), holdout5-j-audit-annotations (#4 and c6, engine-description; #6, missed)

Pricelist #5 (facts):
- A 0.4 pt black strike, drawn by fpdf2 as a filled rectangle over a row that re-flowed 35.15 pt, is not listed.
- No notice or count covers it: the 13 'compared only in part' words are on other rows (instrumented notePartly, analyst and verifier).
- visual.ts lineIn: the added darkness is 0.24–0.39, below the 0.45 threshold, and the share across is 0.47–0.78, below 0.85. The samePixels path is closed because the shift is not a whole number of pixels.

Audit #4:
- A 0.73 pt red StrikeOut annotation is listed in place as 'Text colour or weight changed', not 'Struck through'.
- Its truth snippet's final '.' would also block credit.

Audit #6:
- A 0.73 pt #00ff00 Underline over two lines is not listed and not counted. At full coverage pure green has a luminance darkness of only 0.41.
- Verifier probes: the same lines drawn as page content are still missed, so the annotation is not the cause. #008000 at 0.73 pt is found, and #00ff00 at 1.5 pt is found. So the failure needs a hairline together with a light colour.

Fix (proposed, not made): Engine:
- Measure a line's gain as colour distance from the background (largest channel deviation or ΔE), not luminance alone.
- Treat 'part' results on consecutive words at the same rows as a run-level seed, or re-test them at a higher render scale.
- Use vector evidence: a filled rectangle or stroke under 1 pt spanning a word run in one version only.
- Read StrikeOut, Underline and Highlight annotations from getAnnotations.
- At minimum, count a line-shaped gain below threshold under a word in the 'compared only in part' notice instead of dropping it.

README at f1053f3: Contradicted. README Strikethrough bullet says: 'Strikes in black, navy, pure blue, dark grey, red or the text's own colour are found, and so are underlines in all of these colours'. Its only thin-line limit is 'a thin strike in a mid-tone colour over black text is not detected: grey at 0.8 and 1.5 pt, mid-blue (#2050c0) and green (#008000) at 0.8 pt'. A 0.4 pt black strike, a 0.73 pt red strike and a 0.73 pt #00ff00 underline are not covered.

### 7. Passages that cross a page break past a footnote or a later-pages-only running header are listed as moved

Misses 0, extra items 4. Cases: holdout5-h-annual-technical-report (item 11, footnote 2), holdout5-h-dienstleistungsvertrag (item 6, governing-law paragraph), holdout5-i-pricelist-gbp (item 2, GC-4740 row), holdout5-i-rechnung-eur (item 24, Laborthermometer row 'Moved and edited')

Typst cases (facts: PDF.js order and instrumented compare.ts):
- Typst writes each footnote after its page's body text.
- When a break moves, a footnote that follows its reference to the next page fails detectMoves.inPlace's page test: 'page-fail "2The" oldPage 14 newPage 15'.
- A paragraph that crosses the footnote onto the previous page is split and paired as a move: 'Moved … p. 3 → p. 2'.

fpdf2 cases:
- compare.ts crossedPageBreak/crossingBack folds a row that crossed a break only when the material between its two places consists of lines repeated on an earlier page.
- In both cases a running header printed only on page 2 stands between. It is on 1 of 2 pages, so it is not furniture.
- The pricelist also has the deleted GC-4730 row between. In the rechnung, the off-by-one row labels (row-number cause) also stand in the way.
- In statement-gbp, where neither stands between, the same function folds the crossing row correctly.

All four are re-flow that the truth descriptions name. The crossingBack internals were traced by the analysts; the verifiers confirmed the facts but not the logged values.

Fix (proposed, not made): Engine:
- Compare footnote blocks (marker plus small text under the page-foot separator) as a page-anchored stream of their own, anchored to their reference marker.
- In crossingBack, accept page-top lines that stand at the same place in both versions (a running header on later pages only), and skip whole-line deleted or inserted hunks between.
- Drop a move whose neighbours, ignoring footnote and page-top material, are the same in both versions, and count it as re-flow.

README at f1053f3: Not named. The 'page breaks moved' notice covers only repeated header-row text. README line 36 ('It is built for repagination') implies such re-flow is not listed.

### 8. Background changes under unchanged text are read as row graphics, underlines or text colour

Misses 0, extra items 4. Cases: holdout5-i-rechnung-eur (items 2 and 26, flipped zebra shading, consequence; item 14 'Underlined: “L”', noise), holdout5-i-pricelist-gbp (item 7 'Text colour or weight changed' on 'Protective wear', noise)

Rechnung zebra (facts: PyMuPDF drawings, renders):
- The bands are shaded by row index and stay at fixed page positions while the rows move down one pitch.
- The visual stage compares each region with where its text moved, so the flipped stripes are listed as two large graphic changes.

Rechnung 'L':
- A capital L moved from white paper onto a band.
- An instrumented addedLine returns an underline at the glyph's baseline, i.e. the L's foot stroke.
- Not traced: the exact threshold that lets it through.

Pricelist 'Protective wear':
- The black bold text is unchanged. Only the band fill changed, from (226,226,226) to (250,208,160), and that change is already listed and credited.
- overlayInk takes the overlay colour from 105 anti-aliased pixels of the grey rule instead of 1300 orange fill pixels, so the background cannot be explained and a colour change is claimed.
- The verifier did not re-trace this path.

Fix (proposed, not made): Engine:
- Recognise alternating row striping (bands of one colour, one row pitch high, alternating) whose phase flips after an inserted or deleted row. Count it as one minor consequence, and leave its words out of the 'compared only in part' count.
- Normalise each word box against its own background before line tests.
- For words of 1–2 characters, require an underline row below the baseline.
- In overlayInk, use onFill colours when they outnumber the paper samples by a wide margin.
- Fold a colour hit whose glyph chroma did not change into the listed graphic.

README at f1053f3: Partly named:
- The Watermarks bullet says: 'The count can also include words that are fine, for example in a striped table re-flowed by an inserted row'. That covers only the count, not the listed graphic items or a false underline.
- The Faint graphics bullet suppresses word-level 'Text colour or weight changed' 'where a band across a whole row was re-tinted' only 'Within about 40 levels'. This re-tint is 66 levels in blue, so the README partly foresees the item, but it does not say the item is a false claim beside the listed graphic.

### 9. Visual items carry no context and skip punctuation, so a format snippet ending in a full stop cannot match

Misses 1, extra items 1. Cases: holdout5-h-dienstleistungsvertrag (#6 and item 5, scorer-or-truth). Audit #4 has the same blocker but is counted under the thin-lines cause.

Facts:
- 'Underlined: “Änderungen und Ergänzungen dies…”' p. 2 is correct; the render shows the whole sentence underlined.
- appearanceChanges skips punctuation tokens (visual.ts line 2951), so the item text ends at 'Schriftform'.
- shownExcerpt gives empty before and after context for visual items, so the snippet's final '.' is never covered.
- Dropping the '.' gives 9/9/1 (both analyst and verifier).

Fix (proposed, not made): Scorer: trim leading and trailing punctuation from snippet and item text for format and graphic truths matched against visual items. Truth: leave out the final full stop. Engine (optional): include punctuation under the same found line in the item text.

README at f1053f3: Not a README matter (scoring). The report is adequate for a reviewer.

### 10. Sideways moves are detected per whole line only

Misses 1, extra items 1. Cases: holdout5-i-releve-chf (#4, out-of-scope-silent), holdout5-h-pruefbericht (c9, scorer-or-truth)

Relevé (facts):
- The unchanged amount 85.40 moved from the Débit to the Crédit column, x 408.5 → 465.2, which reverses the booking.
- compare.ts detectPositions looks at intact whole lines and uses the edge that moved least. The left edge did not move, so the line is skipped.
- No item, count or notice, and complete=true.
- The consequences (balance 43.30- → 127.50, notre → votre) are listed, so the reviewer sees that the sign changed but not which booking caused it.

Prüfbericht:
- A two-line bordered stamp moved 107 mm and gives one position item per line.
- The truth snippet covers only the second line, so the first line is extra.
- The verifier showed that maxItems 2 alone still gives 7/7/3. Only a region-based truth, or an engine merge, removes the extra.

Fix (proposed, not made): Engine:
- Add a cell-level pass over intact lines: a run separated by a column gap that moved more than 12 pt while the line's other cells stayed is a position change. Name the column headers at both places, and mark a debit/credit switch as a sign change.
- Merge consecutive position changes in one block or frame whose displacement agrees within about 1.5 pt.

Truth: give Prüfbericht #8 a region covering both lines, plus maxItems 2.

README at f1053f3: Not named. Features claims 'unchanged lines that moved sideways' and How it works says 'intact lines for sideways moves'. Neither says that a single cell moving inside an unchanged row is not checked. That is why relevé #4 is out-of-scope-silent, a borderline case.

### 11. A DR/CR suffix is not read as the amount's sign

Misses 1, extra items 1. Cases: holdout5-i-statement-gbp (#3 and item 3, scorer-or-truth)

Facts:
- The engine reports 'Changed “DR” → “CR”' at the right row, with 150.00 in the context. The truth note allows this: 'A report as a word change DR -> CR is equally correct.'
- score.ts typeOk('number') requires c.numeric, so the correct item cannot meet the 'number' truth.
- The engine (numbers.ts) does not read DR/CR, a trailing minus ('43.30-' in the relevé) or △ (nouhinsho) as signs, so these changes get no 'sign changed' note.

Fix (proposed, not made): Truth: type 'replace', as its own note allows, or a scorer rule for a sign word next to an unchanged figure. Engine (optional): read a trailing DR/CR, a trailing minus and a leading △ as the amount's sign, and list the item under Numbers with 'sign changed'.

README at f1053f3: Not named as a limit. The Numbers row lists only `−500`, `(1,200)`, `−€62.40`, `１２，０００`.

### 12. On a justified line, the edit re-spaces unchanged words, so an unchanged footnote is listed as moved

Misses 0, extra items 1. Cases: holdout5-h-annual-technical-report (item 15, 'Moved and edited a paragraph p. 33', noise)

Facts:
- Footnote 4 is at the same place on p. 33 in both versions. Its one edit is already item 16, credited.
- detectMoves.inPlace requires matched words before the first edit on their line to keep x within 2 pt. Typst re-justifies the line: 'on' moves 207.7 → 210.3.
- Skipping that per-word x check on lines holding an edit removes the false move in a text-only run. Both the analyst (CL_RELAX) and the verifier (VRELAX) did this independently. It is a diagnostic only, not checked on other cases.

Fix (proposed, not made): Engine: on a line that holds an edit, check only y and the line's start (and end, for a justified line), or allow drift growing linearly along the line. Suppress a 'move' whose only difference is its edits when it stays in place.

README at f1053f3: Not named.

## Baselines

This uses the per-case table in eval/results-holdout5-blind.txt, default rules, summed per producer by a script over eval/results-holdout5-blind.json. Format: found / located / extra (separate). The baselines were scored only under the default rules; the registered and strict rescores cover ChangeLens only. The pixel page diff counts a truth item as found when any changed region is on the expected page (run.ts calls this 'a generous rule for that baseline'), so its found count does not mean it said what changed.

Typst 0.15 (6 cases, 51 truth):
- ChangeLens 48 / 48 / 19 (48). Text line diff 37 / 36 / 85 (34). Pixel page diff 51 / 46 / 31 (38).
- ChangeLens beats the text line diff on every count.
- Against the pixel page diff, ChangeLens finds 3 fewer: DV, Prüfbericht and MSA, all scorer-or-truth here. It locates 2 more, has 12 fewer extras and 10 more separate.
- Annual report: ChangeLens 12 extras, pixel 29, text 73. Its 12 are 10 table-rule items and 2 footnote moves.
- Prüfbericht: ChangeLens 3 extras, against 0 for the text diff and 1 for the pixel diff.
- Registered rules: ChangeLens 44 / 44 / 20. Strict: 25 / 25 / 39.

fpdf2 2.9 (6 cases, 48 truth):
- ChangeLens 44 / 44 / 36 (44). Text 43 / 43 / 7 (25). Pixel 48 / 47 / 24 (40).
- ChangeLens finds 1 more than the text diff, but has 29 more extras. 32 of its 36 extras are in rechnung-eur, where the text diff has 0 extras but only 2 separate.
- Payslip: ChangeLens finds 7 against 8 for the text diff.
- Against the pixel diff, ChangeLens finds 4 fewer: payslip and statement scorer-or-truth, pricelist strike missed, relevé column move out of scope. It locates 3 fewer and has 12 more extras, but 4 more separate.
- Registered: 44 / 44 / 36. Strict: 26 / 26 / 54.

PyMuPDF 2.1 (6 cases, 45 truth):
- ChangeLens 23 / 23 / 23 (22). Text 18 / 17 / 20 (14). Pixel 45 / 39 / 4 (40).
- ChangeLens finds 5 more than the text diff but has 3 more extras.
- Datasheet-overlay: ChangeLens finds 1 against 4 for the text diff.
- Audit-annotations: ChangeLens finds 4 against 0 for the text diff.
- The pixel diff beats ChangeLens by 22 found, 16 located and 19 fewer extras, and by 18 separate. This is the producer where ChangeLens is weakest: it finds 23 of 45. 18 misses and 20 extras come from re-typed text appended after the footer.
- Registered: 23 / 23 / 23. Strict: 21 / 19 / 25.

Totals:
- ChangeLens 115 / 115 / 78 (114). Text 98 / 96 / 112 (73). Pixel 144 / 132 / 59 (118).
- Per case, ChangeLens found fewer than the pixel diff in 13 of 18 cases and located fewer in 10.
- It listed more extras than the pixel diff in 11 cases and more than the text diff in 6: Prüfbericht, payslip, rechnung, audit, datasheet, zh-quote.
- It found fewer than the text diff in 2 cases: payslip and datasheet.

## Disagreements and corrections

No category disagreements. All six verifiers agreed with every one of the 64 analyst entries, so the totals use those categories unchanged. I did not re-run any case myself; no disagreement needed settling. I re-derived the counts (tally.py in the synthesis scratch folder) and the per-producer sums (from eval/results-holdout5-blind.json and the registered/strict .txt files).

Points the verifiers refined or corrected. None changes a category or a count.

1. **Prüfbericht c9** (scorer-or-truth). The analyst's fix 'maxItems 2 on #8' does not remove the extra. c9 has no edge to #8, whose snippet holds only the stamp's second line, and position items carry no context. The verifier's what-if shows 7/7/3 with maxItems 2, and 7/7/2 only with a region-based #8.
2. **MSA #8 cause.** foldRule would accept 'the Customer’s'; only diff.ts cleanupSemantic's weight gate blocks the fold. In the Prüfbericht, big() also refuses.
3. **Pricelist 'Protective wear'** (noise). The README Faint graphics bullet suppresses word-level colour items for a re-tinted whole-row band only 'within about 40 levels', and this re-tint is 66. So the README partly foresees the item. It stays noise: the claim is false and the graphic is already listed.
4. **Audit #6** (missed). The verifier weighed 'out-of-scope-silent', since annotations are not claimed. Its probes show the result does not depend on the annotation: the same lines drawn as page content are missed, while #008000 at 0.73 pt and #00ff00 at 1.5 pt are found. So it stays an in-scope silent miss.
5. **Annual item 15** (noise). The verifier considered 'consequence', but nothing moved on the page, so the 'Moved' claim is false.
6. **zh #1** (engine-description, borderline). The item text is right, but it is not flagged numeric and is missing from the Numbers filter. Its 6-character context is also a scorer-side blocker. It stays engine-description, following the round-4 V2.3→V2.4 precedent.
7. **Relevé #4** (out-of-scope-silent, borderline). The README never says 'whole lines only', and a ledger reviewer would expect this. It stays out-of-scope-silent, with a README sentence proposed.
8. **The 18 PyMuPDF engine-description misses.** They are not 'missed-documented', because every edit is listed, in pieces. The README stream-order sentence names the condition, not the outcome.
9. **Factual corrections by verifiers:**
   - inPlaceTokens does join same-place delete and insert, but only for 'touched' hunks. It is not a pure 'same key' rule.
   - The datasheet Show view also lists a false 'Moved a paragraph p. 2' for the heading.
   - The pricelist page 1 does have the letterhead and title, as separate lines.
   - Relevé item 6 reads 'Number changed: 43.30 → 127.50 (+194%)', without 'CHF'.
   - Some PDF.js item indices differ by 1–2.
   - The lease 'March 2027' shift is a fact: 191.5 → 196.7, more than the 2 pt tolerance.
   - The payslip and zh context cause repeats round 4 (zh-en-supply-annex #3) and was not fixed.
10. **Not reproduced by any verifier:**
    - the analyst's CL_EXP experiment (invoice 6/7, lease 5/7);
    - the internal values logged in crossedPageBreak/crossingBack, overlayInk and addedLine. The verifiers checked the underlying facts (PDF.js order, spans, fills, renders), but not those logged numbers.
11. **Repository state.** HEAD is now 9ba0c7d, a docs-only commit after cfa9bc5. src is identical to f1053f3, and README 'Scope and limitations' is unchanged.

Engine-description notes on credited items, which do not affect any count:
- annual '−1.8 → −2.6 (+44%)' and '−0.35 → −0.53 (+51%)';
- nouhinsho '10 → 12 (+20%)' on a day, and '1,500 → 2,000 (+33%)' with △ dropped;
- payslip '4471 → 8803 (+97%)' on account digits.

Further weak descriptions the analysts noted:
- invoice '-40%' on a date;
- MSA '4 → 6 (+50%)' for 'per cent';
- relevé '+194%' across a sign change;
- the handbook duplicate page not marked;
- /Rotate described as a page size change;
- a highlight annotation described as a colour change;
- lease 'Added 2 paragraphs' hiding the month change.

# group typst-long-bilingual

RECONCILE: I agree with all 7 of the analyst's entries. All three cases add up against eval/results-holdout5-blind.txt under CURRENT_RULES.

Reruns:
- I re-ran eval/run.ts --blind --verbose --items from a git archive of HEAD in my scratch folder (/tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/blind5/analysis/typst-long-bilingual-verify/head). It gives the same rows: annual 9 / 9 / 12 (9), SLA 9 / 9 / 0 (9), Dienstleistungsvertrag 8 / 8 / 2 (8).
- Its items JSON is identical to eval/results-holdout5-blind-items.json for all three cases (sorted-key compare of exp, disclosed, furniture and items).
- git diff --stat f1053f3 HEAD -- src is empty, so the engine is the frozen one.
- The default CLI runs list the same 21, 9 and 7 changes. --no-visual on the annual report gives 11 items; --include-furniture on the Dienstleistungsvertrag adds 'Number changed: 12.02.2026 → 03.03.2026 (in 3 places) p. 1–3'.

Per case (eval/vcheck.ts in my scratch folder, which calls rescoreCase, changeLensMatch and assign):
- holdout5-h-annual-technical-report: misses 9 − 9 = 0. The 9 explained items are 0→#1, 12→#2, 13→#3, 14→#4, 19→#5, 16→#6, 17→#7, 18→#8 and 20→#9. That leaves 21 − 9 = 12 extras: 5 underline items + 5 graphic items + item 11 + item 15.
- holdout5-h-bilingual-sla: misses 9 − 9 = 0. Item k explains truth #k+1, so extras are 9 − 9 = 0.
- holdout5-h-dienstleistungsvertrag: misses 9 − 8 = 1 (#6). #1–#5 match items 0–4, and #7–#9 count as disclosed through furnitureLinesDisclosed. Extras are 7 − 5 = 2: item 5 (the underline) and item 6 (the move).

Group total: 1 miss and 14 extras.
- Scorer-or-truth: 1 miss + 1 extra (the same underline).
- Consequence: 12 extras.
- Noise: 1 extra.

I add two checks on found items whose description misleads (engine-description). They do not change any count.

## holdout5-h-annual-technical-report

truth 9, found 9, extra 12

rerun: Yes. node eval/run.ts --cases holdout5-h-annual-technical-report --blind --verbose --items <scratch>/out/items-annual.json gives the same row (9 / 9 / 12 (9), text 6/6/73, pixel 9/6/29). Its items JSON is identical to eval/results-holdout5-blind-items.json for this case (sorted-key JSON compare: exp, disclosed, furniture and all 21 items). The CLI run (out/cli-annual.json/.txt) lists the same 21 changes in the same order. git diff f1053f3 HEAD -- src is empty, so the engine is the frozen one.

counts: Misses: truth 9 - found 9 = 0. Extras: the assignment (assign.ts, changeLensMatch under CURRENT_RULES) explains items 0, 12, 13, 14, 16, 17, 18, 19 and 20, one per truth item. That leaves 21 - 9 = 12 unexplained: items 1, 3, 5, 7, 9 (5 underline items) + items 2, 4, 6, 8, 10 (5 graphic items) + item 11 (1 footnote move) + item 15 (1 footnote move-with-edit). 5 + 5 + 1 + 1 = 12, the recorded extra.

notices: One notice: '5 lines repeated at the top of a page (such as a table's header row) came or went only because page breaks moved; they are not listed.' (ignored.repeatedLines = 5; minor m1-m5 on p5, p9, p11, p12->13, p16->17). It is accurate: these are exactly the 5 table breaks that moved. Each of them also produced 2 unfolded visual extras, see below. furniture 0 and renumbered 0 are both right: the header and the 'Page N of 37' footer are unchanged, and the renumbering 1.3 -> 1.4 is absorbed into the insertion. complete = true; no textless, unreadable or uncertain pages. Footnotes 1 and 3, which also change place in the stream, are correctly treated as unchanged. There is no notice for the footnote shifts that were listed as moves. The page map is identity except newToOld for new p37 = old p36 (old p37 -> new p37). New p37 holds the end of old p36 plus old p37, so this is plausible; the cause was not traced and it does not affect any item.

found items: (1) Item 20, truth #9, 'Number changed: −1.8 → −2.6 (+44%)': the cells are in Table 12.1's 'Change (%)' column, under 'Negative changes indicate an improvement for leakage' (PDF.js new p36 #54-#64). The values are already percentages, so the honest note is -0.8 pp. '+44%' reads as leakage up 44 %. Cause: describe.ts numberNote shows the relative change of the magnitude when both values are negative (percentChange(-a, -b)), and percentUnit only looks for a '%' in the cell, not in the column header. This is the 'percentage on a non-amount' pattern, on a credited item. (2) Item 14, truth #4, 'Number changed: −0.35 → −0.53 (+51%)': α is in 'per cent per kelvin' (new p31). The '+51%' is the same magnitude rule, on a rate whose value fell. (3) Item 0, truth #1, 'Added 189 words p. 1 → p. 1–2' is adequate. The shown text is '[1.3] Changes to the reporting basis … year to year. 1.4 [Structure of the report]', so the renumbered '1.4' of the next heading sits inside the insertion instead of being named as renumbering. (4) Item 16, truth #6, is correct, but item 15 lists the same footnote as 'Moved and edited a paragraph p. 33', a false claim (see entry). The other credited items (0.42→0.48, quarterly→monthly, delete of 49 words, bold phrase, telemetry move p29→p35) are accurate.

- EXTRA x5 items 1, 3, 5, 7, 9: 'Underline removed: January 88.6 58.7 37.7 70.8 62.9' p4→5; 'Underline removed: September 45.4 67.7 91.8 16.6 13.5' p8→9; 'Underline removed: March 50.6 32.7 51.1 3.3' p10→11; 'Underlined: March 22.5 30.8 81.2 29.0 76.2' p12; 'Underlined: August 12.0 67.4 50.6 84.7 34.4' p16: The closing rule of a table fragment, which moved with a page break, is reported as an underline added to or removed from the last row's text. [consequence -> verified consequence]
  evidence: Renders (pdftoppm -r 100): scratch r/annual/cmp-old4-new5.png shows old p4 ending the table after the header and January, with a bottom rule; on new p5 January is followed by February and there is no rule. r/annual/cmp-p16-p12.png shows new p16 ending the table after August with a rule (old p16 runs on to October), and new p12 ending after March with a rule (old p12 runs on). PyMuPDF get_drawings (scratch draw.py) gives the 0.9 pt rules, x 84.6-510.7: old p4 y=754.4, old p8 y=726.3, old p10 y=762.4, new p12 y=762.4, new p16 y=718.1. Each lies right under the row named in the item (row y + 10.3). There are no drawings below y=690 on new p5, p9, p11 or on old p12, p16. These are the 5 moved table breaks that the repeated-header notice counts (m1-m5). A --no-visual run (out/annual-novis-orig.txt, 11 items) has none of these items. The truth description names 'table breaks and repeated header rows move' as consequences, and the checker notes (holdout5-checker-notes-h.md) list 'table rules … that moved with re-flow'. The wording misleads: a table border is called an underline of the row's figures.
  cause: Visual stage, src/core/visual.ts appearanceChanges (line 2581; per-word Hit loop around 2911-2951). It compares the matched row across the pages, finds a line under its glyphs in one version only, and reports it as underline added or removed. Only the repeated header row text is known to be a page-break consequence (compare.ts repeatedAtPageTop, line 3452, consequence 'repeatedLine'; visual.ts keep() folds fills and rules into such rows, around 4990-5030). Nothing ties the closing rule on the page before the moved break to that consequence.
  fix: Engine: when repeatedAtPageTop finds a header row that came or went at the top of page p+1, treat a full-width rule right under the last body row of page p, present in one version only, as that table fragment's closing rule. Fold both its underline hit and its region into the consequence and count it in the existing 'page breaks moved' notice (Show). Scorer: none needed.
- EXTRA x5 items 2, 4, 6, 8, 10: 'Graphic or image removed' p4 [148,752,364,4], p8 [84,724,428,4], p10 [84,760,420,4]; 'Graphic or image added' p12 [132,760,380,4], p16 [88,716,424,20]: The same closing rules are listed a second time, as a graphic added or removed beside each underline item: two items per moved table break. [consequence -> verified consequence]
  evidence: The rects lie on the rules listed above: y 752/724/760/760/716 against rule y 754.4/726.3/762.4/762.4/718.1 (draw.py), on the same pages as the paired underline items. Item 10 (h=20) also covers the 0.5 pt footnote separator at y=732.0 (x 85-212.6) on new p16. That separator came with footnote 2, which followed its reference to p16; old p16 has no drawing below y=690. The --no-visual run has none of these items.
  cause: visual.ts zones() (line 4874) counts a leftover difference region as explained only by text changes, overflow and position changes, not by appearance changes such as the underline item. keep()'s row rule applies only when the row's text is a change or a repeated header row (consequence 'repeatedLine'). So the rule's pixels come out again as a graphic item. Not traced: why the region does not stop exactly where the underline item's word boxes end.
  fix: Fold together with the entry above (closing rule of a table fragment at a moved break -> consequence count). Let an underline appearance change explain a graphic region in its own row band, so that one rule gives one item. Fold a footnote separator that moves with its footnote together with that footnote.
- EXTRA x1 item 11: move '2The asset register entry for Longridge was updated in Decem…', 'Moved a paragraph p. 15 → p. 16': Footnote 2 followed its reference marker from p15 to p16 when the pages re-flowed, and is listed as a moved paragraph. [consequence -> verified consequence]
  evidence: PDF.js getTextContent order (scratch tc.mjs). Old p15 has the reference '…reflecting the size of the area it serves.2' (#79, y=615.0) and the footnote '2The asset register…' at the page foot (#94, y=743.7). In the new version the reference is on p16 and the footnote sits at the foot of p16 (#186, y=743.7, after the August table row #174), at the same x/y. A debug print in a scratch copy of compare.ts (scratch src-head, CL_DBG=register) shows 'INPLACE fail page/rects 2The 14 15 14': the old page index is 14, the new one 15, and the page map pairs 14->14. The pdftotext -raw word diff (worddiff.py) shows the same shift for footnotes 1-4. Only footnote 2 changed page; footnotes 1 and 3 are folded as in place. The checker notes list 'footnote reading-order shifts' in the ATR as consequences. The item's text fuses the marker with the first word ('2The').
  cause: src/core/compare.ts detectMoves -> inPlace (around line 1230) keeps a passage that only changed its place in the content stream as no change only when every matched word is on the page the page map pairs (oldToNew[a.page] === b.page). A footnote that went to the next page with its reference fails this test and is reported as a move.
  fix: Engine: anchor a footnote block (marker plus small text below the short separator rule at the page foot) to its reference marker. If the marker token is matched and the footnote is on the marker's page in both versions, count it as moved with the page break (page-break notice) instead of listing a move.
- EXTRA x1 item 15: move with moveEdits 1, '4The injury rate is calculated on hours…', 'Moved and edited a paragraph p. 33': Footnote 4 stands at the same place on p33 in both versions, yet it is listed as moved and edited. Its one edit is already item 16. [noise -> verified noise]
  evidence: PDF.js: the footnote 4 lines are at x=94.4/85.0, y=754.5/765.4 on p33 in both files (before #96-#100, after #93-#97). Only the p33/p34 break moved: in the old file the footnote follows 'the access arrangements were changed.' and p34 starts 'The planning assumption…'; in the new file it follows '…is planned, with a' and p34 starts 'report due to the operating board'. The edit is listed separately as item 16, 'Changed “external auditor” → “internal audit team”', which is credited to truth #6. In the scratch copy, CL_DBG=injury shows the in-place check failing first on 'on': old x 207.7 -> new 210.3, on line 1, before the edit. CL_TRACE shows the same justified line re-spaced by up to 8 pt ('the' 435.3 -> 443.4). With the per-word x check skipped on lines that hold an edit (scratch env CL_RELAX), the move item is gone and the replace stays (out/annual-relax-only.json, text-only run, 10 items). This was a diagnostic only and was not checked on other cases.
  cause: src/core/compare.ts detectMoves.inPlace: matched words before the first edit on their line must keep their x within 2 pt. Typst justifies the footnote line, so the edit re-spaces every word on it, the check fails, and the unchanged footnote becomes a 'move' with the edit inside it.
  fix: Engine: on a line that holds an edit, check only y and the line's start (and its end, for a justified line), not each word's x. Alternatively, allow a sideways drift that grows linearly along a justified line. Suppress a move whose edits are its only difference when it stays at the same place.

## holdout5-h-bilingual-sla

truth 9, found 9, extra 0

rerun: Yes. node eval/run.ts --cases 'holdout5-h-bilingual-sla,holdout5-h-dienstleistungsvertrag' --blind --verbose --items <scratch>/out/items-sla-dv.json gives the row 9 / 9 / 0 (9) (text 7/7/1, pixel 9/9/0). Its items JSON is identical to the recorded one (exp, disclosed, furniture, 9 items). The CLI (out/cli-sla.txt) lists the same 9 changes.

counts: Misses: 9 - 9 = 0. Extras: 9 items, each explained by one truth item (item k -> truth #k+1, assign.ts), so 9 - 9 = 0, the recorded extra. No entries.

notices: No notices; every ignored count is 0. complete = true; no coverage gaps. This is accurate: the header ('Agreement No. SLA-2026-0219 …') and the footer ('… 1 / 2') are unchanged. The independent pdftotext -raw word diff (worddiff.py) shows only the 9 truth edits, plus one re-flow spacing artefact ('分钟 向' -> '分钟向') that is correctly not listed. Text order: PDF.js order follows the reading order on both pages; the signature block is written column by column, left then right. There is no re-inserted or appended text.

found items: All adequate. 'Number changed: 99.5% → 99.9% (+0.4 pp)' and '−5% → −10% (-5 pp)' use percentage points correctly. The pp note uses an ASCII hyphen-minus ('-5 pp') while the values use U+2212, a cosmetic point (describe.ts signed()). 'Changed “贰万捌仟” → “叁万陆仟伍佰”' covers only the differing characters of the 大写 amount. The context '：人民币壹拾 … 元整' shows the whole amount, but the item is not marked as a number and is not cross-checked against the total 136,500.00; the truth note leaves that check to the reviewer. 'Deleted 14 words' (the English maintenance sentence) has the right count. The Chinese insertion is shown in full. 'Changed 工作 → 自然' has the context '月结束后五个|日内提交'. 'Underlined: 以中文文本为准' matches the render (scratch r/sla/cmp-underline.png: the underline spans exactly those 7 characters). The English 'business days' and the Chinese '99.5%' stay unchanged and are correctly not listed.

## holdout5-h-dienstleistungsvertrag

truth 9, found 8, extra 2

rerun: Yes. The same run.ts invocation as for the SLA gives 8 / 8 / 2 (8) (text 8/7/2, pixel 9/9/1), the same miss (#6 not found), and items JSON identical to the recorded one: exp, disclosed [all false], the 3 furniture runs, 7 items. The CLI (out/cli-dv.txt) lists the same 7 changes. With --include-furniture (out/cli-dv-furn.txt) it adds 'Number changed: 12.02.2026 → 03.03.2026 (in 3 places) p. 1–3'.

counts: Misses: 9 - 8 = 1 (#6). Truth #7-#9 (header dates) are credited as disclosed by furnitureLinesDisclosed, which returns true for each in check-score.ts. Extras: 7 items, of which items 0-4 are explained by truth #1-#5, so 7 - 5 = 2: item 5 (the underline, unmatched because of the final full stop) + item 6 (the move of the governing-law paragraph). 1 + 1 = 2, the recorded extra.

notices: '3 differences in headers, footers or page numbers are ignored.' (ignored.furniture = 3). It is accurate: the three header lines 'Dienstleistungsvertrag IT-Wartung Entwurf · Stand 12.02.2026' -> '… 03.03.2026', one per page, are the recorded furniture runs, and --include-furniture lists them as one change 'in 3 places'. Under the rules registered for round 4, the recorded disclosed flags are false: no change of the comparison with headers and footers holds the whole 'Stand 12.02.2026' (the change is just the date), so the registered rescore gives 5/9 for this case. complete = true. The hyphenation moves ('fahrläs-siger' -> 'fahrlässiger', 'vorhersehbaren' -> 'vor-hersehbaren' in pdftotext) are correctly not listed. They are also not counted anywhere (there is no hyphenation entry in ignored), whereas README line 37 says 'Every ignored category is counted on screen'. This is a small wording overstatement, not a miss. No notice says that the governing-law paragraph only re-flowed.

found items: Adequate. 'Number changed: 01.04.2026 → 01.05.2026' (a date, correctly without a percentage). 'Changed “vier” → “zwei”'. 'Number changed: 8.400,00 → 9.150,00 (+8.9%)' (750/8400 = 8.93 %, German format parsed right). 'Deleted 17 words' and 'Added 14 words' (both counts checked by hand) are on p2, with the right context. 'Underlined: “Änderungen und Ergänzungen dies…”' is right on the page, but its text leaves out the underlined full stop, which is why it is not credited (see entry). 'Moved “Es gilt das Recht der Bundesrep…” p. 3 → p. 2' tells a contract reviewer that a clause was relocated, when it only flowed onto the previous page.

- MISS x1 truth #6 format 'Änderungen und Ergänzungen dieses Vertrages bedürfen der Schriftform.' (reported as item 5): The underline is reported ('Underlined: “Änderungen und Ergänzungen dies…”' p. 2), but the item's text stops at 'Schriftform' while the truth snippet ends with '.', and a visual item has no context to cover the full stop. [scorer-or-truth -> verified scorer-or-truth]
  evidence: Render (pdftoppm -r 150, scratch r/dv/cmp-p2.png): the new p2 underlines the whole first sentence of § 12, full stop included; the old p2 has no underline. Recorded item 5: kind graphic, decoration underline added, old p2 y=680.8 / new p2 y=652.7, text '…bedürfen der Schriftform'. check-score.ts (imports eval/score.ts) gives typeOk true, textMatch(context) false, changeLensMatch false. shownExcerpt gives {before:'', new:'Änderungen … Schriftform', after:''}, so coversInContext cannot reach the '.'. A rescore with the same truth minus the final '.' on #6 (rescoreCase, CURRENT_RULES) gives found 9 and extra 1.
  cause: Scorer: textMatch/sideMatch (eval/score.ts) need the snippet inside the reported text, or inside text plus context, and visual items carry no context. Engine side: appearanceChanges skips punctuation tokens (src/core/visual.ts line 2951, `a.kind === 'punct') continue`), so a decoration item's text never includes the punctuation under the line.
  fix: Scorer: for format/graphic truth items, trim leading and trailing punctuation from both the snippet and the reported text before comparing (or the truth drops the full stop). Optional engine change: include punctuation tokens that lie under the same found line in the item's text.
- EXTRA x1 item 5: graphic 'Underlined: “Änderungen und Ergänzungen dies…”' p. 2: This is the same item as miss #6: left unassigned only because the snippet's full stop blocks the match. [scorer-or-truth -> verified scorer-or-truth]
  evidence: As for miss #6. assign.ts shows that truth #6 has no matching item and that item 5 is unassigned. Dropping the final '.' from #6 makes item 5 explained (extra 2 -> 1).
  cause: Same as miss #6: eval/score.ts textMatch with an empty context for visual items, plus the punctuation skip in visual.ts appearanceChanges.
  fix: Same as miss #6.
- EXTRA x1 item 6: move 'Es gilt das Recht der Bundesrepublik Deutschland. Gerichtsst…', 'Moved … p. 3 → p. 2': The governing-law paragraph flowed from the top of p3 to the end of p2 when § 7/§ 8 got shorter. Because footnote 2 sits between the pages in the content stream, the paragraph is listed as moved. [consequence -> verified consequence]
  evidence: PDF.js getTextContent order (scratch tc.mjs). Old: p2 '…bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.' (#100, y=718.8) -> footnote '2Die Begrenzung gilt nicht für die…' (#102, y=768.2) -> footer, then the p3 header -> 'Es gilt das Recht…' (p3 #3, y=86.6). New: p2 '…unberührt.' (#98, y=690.7) -> 'Es gilt das Recht…' (#100, y=707.3) -> footnote (#104, y=768.2). So the body text keeps its order and only the footnote changes place in the stream. Renders (r/dv/cmp-p2.png) show the same picture. The pdftotext -raw word diff (worddiff.py) shows only this footnote swap besides the truth edits. The truth description names it as a consequence: 'the governing-law paragraph moves from the top of page 3 to the end of page 2', and so do the checker notes. Debug in the scratch copy (CL_DBG=Bundesrepublik): 'INPLACE fail page/rects Es 2 1 2'.
  cause: src/core/compare.ts: the footnote at the page foot sits between the two pages' body text in the stream. The diff keeps the footnote matched and splits the paragraph into a deletion and an insertion, which detectMoves pairs. inPlace rejects the pair because the page differs (p3 -> p2), so the paragraph is listed as Moved.
  fix: Engine: compare footnote blocks as a stream of their own, as is done for furniture, or in detectMoves drop a move whose body-text neighbours, ignoring footnote blocks, are the same in both versions. Count it as re-flow instead.

## verifier checks
- holdout5-h-annual-technical-report | EXTRA items 1, 3, 5, 7, 9 (CLI #2, #4, #6, #8, #10): 'Underline removed/Underlined' on the January, September, March, March and August table rows, p4→5, p8→9, p10→11, p12, p16 | consequence -> agree=True -> consequence | Checked by me: - My draw.py (PyMuPDF get_drawings) finds 0.9 pt black rules, x 84.6–510.7, at old p4 y 754.4, old p8 726.3, old p10 762.4, new p12 762.4 and new p16 718.1. - Each rule lies 0.3 pt below the bottom of the row rect named in the item. Examples: January 743.8 + 10.3 = 754.1; August 707.4 + 10.3 = 717.7. - There are no drawings below y 650 on new p5, p9 and p11, or on old p12 and p16. - The 100 dpi crops (r/annual/feet.png) show a table fragment that ends at the page foot with its closing rule, while the other version continues the table on that page. - PDF.js text shows the same breaks: old p4 has the header plus January only; old p10 has the header plus January to March. - These are the 5 moved breaks behind the notice '5 lines repeated at the top of a page…' (minor m1–m5). - The --no-visual run (out/cli-annual-novis.txt, 11 items) has none of these items. - The truth description names 'table breaks and repeated header rows move' as consequences. - The appearanceChanges, zones and keep functions exist where the analyst says (visual.ts lines 2581, 4874, 4964), and so does repeatedAtPageTop (compare.ts 3452).  The change is real but derivative. The wording is wrong: a table border is called an underline of the row.
- holdout5-h-annual-technical-report | EXTRA items 2, 4, 6, 8, 10: 'Graphic or image removed/added' p4, p8, p10, p12, p16 | consequence -> agree=True -> consequence | - The rects are on the same pages as the paired underline items, and their y ranges contain the rules: old p4 [148,752,364,4] (rule at 754.4), old p8 [84,724,428,4] (726.3), old p10 [84,760,420,4] (762.4), new p12 [132,760,380,4] (762.4), new p16 [88,716,424,20] (718.1). - Item 10's 20 pt height also takes in the 0.5 pt footnote separator, x 85–212.6 at y 732.0, on new p16. That separator arrived with footnote 2; old p16 has no drawing below y 650. - The --no-visual run lists none of these items. - Each moved break thus gives 2 items, both derivative of the table breaks that the truth names. - Not traced by me: why the region starts at x 148 or 132 instead of the rule's 84.6.
- holdout5-h-annual-technical-report | EXTRA item 11: 'Moved a paragraph p. 15 → p. 16' (footnote 2, '2The asset register entry for Longridge…') | consequence -> agree=True -> consequence | - My PDF.js dump (tc.mjs) shows that the reference marker followed the sentence to the next page. It is old p15 #81, x 257.1, y 615.0, after '…reflecting the size of the area it serves.', and new p16 #17, the same x, y 175.1. - The footnote text moved from the old p15 foot (#96–#100, y 743.7–765.4) to the new p16 foot (#188–#192, the same y). - The old and new item text is identical. - My instrumented copy of compare.ts (VDBG, scratch head/src/core) prints 'page-fail "2The" oldPage 14 newPage 15 oldToNew 14'. So inPlace rejects the pair on the page test (compare.ts line 1256). - A real, derivative move from re-pagination. The checker notes name 'footnote reading-order shifts' in the ATR as consequences. - Small description point: 'Moved a paragraph' does not say that the text is a footnote.
- holdout5-h-annual-technical-report | EXTRA item 15: 'Moved and edited a paragraph p. 33' (footnote 4, moveEdits 1) | noise -> agree=True -> noise | - PDF.js puts footnote 4 at y 754.5 and 765.4 on p33 in both files. The item's old and new rects are the same, [94.4,746.2] and [85,757]. - Only its neighbours in the content stream changed: old '…arrangements were changed.' | footnote | p34; new '…is planned, with a' | footnote | p34. - Justification re-spaces the line. My PyMuPDF word positions show 'on' 207.4→210.0 and 'calculated' 166.6→168.7. - VDBG prints 'rect-fail "4The" word "on" along true x 207.7 -> 210.3', which is the 2 pt x tolerance in inPlace. - With that per-word x check skipped on lines that hold an edit (my env VRELAX, text-only), the move disappears and the 'external auditor → internal audit team' replace stays (out/relax-annual.json, 10 items). This reproduces the analyst's diagnostic independently. - I considered 'consequence', but nothing moved on the page, so the 'Moved' claim is false. The edit is already item 16, which is credited to truth #6.
- holdout5-h-dienstleistungsvertrag | MISS truth #6 format 'Änderungen und Ergänzungen dieses Vertrages bedürfen der Schriftform.' (item 5) | scorer-or-truth -> agree=True -> scorer-or-truth | - The render (r/dv/cmp-p2.png) shows the whole first sentence of § 12 underlined on new p2, full stop included. Old p2 has no underline. - PyMuPDF gives 5 stroked 0.44 pt segments at y 664.6 covering x 85.0–414.3, and the word 'Schriftform.' spans 360.5–414.3. - The item text ends at 'Schriftform', and its new rect covers x 85–411.5, so only the 2.8 pt full stop is left out. - vcheck.ts (DBG=6): typeOk true, textMatch false; shownExcerpt has an empty before and after. - vtrim.ts: the same truth without the final '.' gives found 9, extra 1 under CURRENT_RULES (registered 6/1). - The engine skips punctuation tokens at visual.ts line 2951 ('a.kind === 'punct') continue'). - The item 'Underlined: “Änderungen und Ergänzungen dies…” p. 2' is correct and adequate for a reviewer.
- holdout5-h-dienstleistungsvertrag | EXTRA item 5: 'Underlined: “Änderungen und Ergänzungen dies…”' p. 2 | scorer-or-truth -> agree=True -> scorer-or-truth | This is the same item as miss #6. The assignment leaves it unexplained (5:-), and it becomes explained once the snippet's final '.' is dropped (extra 2→1, vtrim.ts).
- holdout5-h-dienstleistungsvertrag | EXTRA item 6: 'Moved “Es gilt das Recht der Bundesrep…” p. 3 → p. 2' | consequence -> agree=True -> consequence | - PDF.js, old: p2 #101 '…unberührt.' (y 718.8), then footnote 2 (#103–#104, y 768.2), the footer, the p3 header, then p3 #4 'Es gilt das Recht…' (y 86.6). - PDF.js, new: p2 #99 '…unberührt.' (y 690.7), then #101 'Es gilt…' (y 707.3), then footnote 2 (#106, y 768.2). - So the body order is unchanged; the paragraph crossed the footnote and the page break. My pdftotext -raw word diff (wd.py) shows the same. - VDBG prints 'page-fail "Es" oldPage 2 newPage 1 oldToNew 2'. - The truth description names it: 'the governing-law paragraph moves from the top of page 3 to the end of page 2'. - Derivative re-flow. A contract reviewer could read 'Moved' as a relocated clause, which the engine should fold or count.
- holdout5-h-annual-technical-report | Found item 20 (truth #9): 'Number changed: −1.8 → −2.6 (+44%)' p. 36 | not classified (noted under foundItemsQuality) -> agree=True -> engine-description | - No count effect: the item is credited. - PDF.js new p36: the column header is 'Change (%)' (#63), and the text above says 'Negative changes indicate an improvement for leakage and interruptions.' (#55). The value cell is '−2.6' (#71). - describe.ts line 78 (numberNote: if a < 0 and b < 0, percentChange(-a, -b)) and line 55 (percentUnit tests only the cell for a trailing %) produce '+44%'. The honest note would be −0.8 pp. - '+44%' reads as 'leakage up 44 %' on a value that went down, i.e. a percentage on a non-amount.
- holdout5-h-annual-technical-report | Found item 14 (truth #4): 'Number changed: −0.35 → −0.53 (+51%)' p. 30 → p. 31 | not classified (noted under foundItemsQuality) -> agree=True -> engine-description | - No count effect: the item is credited. - The value is the coefficient α, followed by 'per cent per kelvin' (PDF.js new p31 #16). - The same numberNote rule (describe.ts line 78) shows a '+51%' growth in magnitude on a rate whose value fell. This is milder than item 20, but the same pattern.

verifier, anything the analyst missed: The analyst did not miss any edit:
- An independent pdftotext word diff of all three cases shows only the truth edits plus the named consequences: re-pagination, the 1.3→1.4 renumbering, footnote stream shifts 1–4, repeated header rows, the DV hyphenation moves and the DV header dates.
- eval/holdout5-h/atr.typ contains exactly the 9 ATR edits (#ed, #ins, #del, the AFTER block and bold-if-after).

Points to add:
1. Two credited items have misleading number notes: '−1.8 → −2.6 (+44%)' in a 'Change (%)' column, and '−0.35 → −0.53 (+51%)' on a coefficient in per cent per kelvin. The analyst described both but made no entries; I give them engine-description checks with no count effect.
2. README line 36 ('It is built for repagination … An inserted paragraph is one change, not eight red pages') is the claim this case tests. One early insertion still gives 12 re-pagination extras, and no notice covers them. The analyst said only that no README limit covers them.
3. Under the registered rules, the DV header-date items #7–#9 become misses, so the case scores 5/9 (eval/results-holdout5-blind-registered.txt). If that table is analysed, they are scorer-or-truth: the notice '3 differences in headers, footers or page numbers are ignored.' discloses them, and --include-furniture lists them as one change. The strict rescore (DV 2/9, ATR 5/9) is not the headline and was not classified.
4. The footnote moves are described as 'Moved a paragraph' or 'Moved and edited a paragraph'; neither says 'footnote', so a reviewer has to find the text.
5. The analyst's README point is confirmed: the CLI JSON 'ignored' has only furniture, caseOnly, minorShifts, renumbered and repeatedLines, with no count for hyphenation or re-flowed line breaks, while README line 37 says every ignored category is counted. I did not check the HTML report.
6. Cosmetic: some of the analyst's PDF.js item numbers are 1–2 lower than in my getTextContent dump (DV new p2 'Es gilt' is #101 for me, #100 for them; the footnote is #106, not #104). The positions agree.
7. Not an extra: the footnote separator on old p15 (x 85–212.6, y 732.0), which left with footnote 2, gives no item of its own.

Scratch evidence is all under /tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/blind5/analysis/typst-long-bilingual-verify/:
- out/: run-*.txt, items-*.json, cli-*.txt/json, dbg-*.json, relax-annual.json, tc-*.txt
- r/annual/feet.png, r/dv/cmp-p2.png
- tc.mjs, draw.py, wd.py, wd2.py
- head/eval/vcheck.ts and head/eval/vtrim.ts
- head/src/core/compare.ts, carrying the env-gated VDBG/VRELAX instrumentation, for analysis only

Nothing under /home/user/changelens was changed.

# group typst-reports-contract

RECONCILE: I agree with the analyst on all five entries, and every count adds up. I reran everything myself in my scratch folder /tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/blind5/analysis/typst-reports-contract-verify/.

How I reran:
- git archive of HEAD into repo/. `git diff --stat f1053f3 HEAD -- src` is empty, so the engine is the frozen one.
- eval run: `node eval/run.ts --cases holdout5-h-pruefbericht,holdout5-h-rapport-annuel,holdout5-h-services-agreement --blind --verbose --json out/rerun.json --items out/rerun-items.json`. It gives 7/7/3 (7), 8/8/0 (8) and 7/7/2 (7); the group total is 22/22/5. The items JSON of all three cases equals eval/results-holdout5-blind-items.json (Python == check).
- Default CLI runs (out/pruef.txt, out/rapport.txt, out/msa.txt) print the same item lists and summary lines.
  - The only notice is the MSA one: '6 list numbers changed only because numbered items were added, removed or moved; they are not listed.' Its minor list is m1–m6.
  - Prüfbericht and Rapport have no notices. In all three, ignored.furniture is 0, complete and visualCompared are true, and the page maps are the identity.
- My own rescore of the recorded items (out/edges.txt, from repo/eval/vfy/edges.ts) gives:
  - CURRENT_RULES: 7/7/3, 8/8/0, 7/7/2.
  - REGISTERED_ROUND4_RULES: 6/6/4 for Prüfbericht (misses #4 and #7), 8/8/0 and 7/7/2. This matches eval/results-holdout5-blind-registered.txt.

Per case:
- **Prüfbericht:**
  - Misses: truth 8 − found 7 = 1 (#7).
  - Extras: 10 items − 7 explained = 3 (c7, c8, c9).
  - Edges: #1→c1, #2→c2, #3→c3, #4→c4, #5→c5, #6→c6, #7→none, #8→c10.
- **Rapport:**
  - Misses: 8 − 8 = 0.
  - Extras: 8 − 8 = 0.
  - Edges are one to one, #k→ck.
- **MSA:**
  - Misses: 8 − 7 = 1 (#8).
  - Extras: 9 − 7 = 2 (c8, c9).
  - Edges: #1→c1, #2→c2, #3→c5, #4→c7, #5→c3, #6→c4, #7→c6, #8→none.

Group: 2 misses and 5 extras, all scorer-or-truth.

What the edits are:
- pdftotext -layout diffs (txt/) and the 100 dpi renders (r/, r/sbs-holdout5-h-pruefbericht-2.png) show exactly the truth edits plus the consequences each description names.
- Per-page pixel-difference bands show no other changed region. MSA pages 1 and 4 are pixel-identical.
- holdout5-checker-notes-h.md also reports no unintended edit.

One correction, to a proposed fix rather than to a category; see the c9 check.

## holdout5-h-pruefbericht

truth 8, found 7, extra 3

rerun: Yes. I made a git archive of HEAD in the scratch folder (src is unchanged since the freeze: `git diff --stat f1053f3 HEAD -- src` is empty) and ran `node eval/run.ts --cases holdout5-h-pruefbericht,holdout5-h-rapport-annuel,holdout5-h-services-agreement --blind --verbose --json rerun.json --items rerun-items.json`. It scores 7/7/3 (7). Its items JSON for this case (exp, disclosed, furniture, items with rects and contexts) is JSON-identical to eval/results-holdout5-blind-items.json. A default CLI run (`node src/cli/cli.ts before.pdf after.pdf --json cli-pruefbericht.json --lang en`) gives the same 10 changes in the same order, with the same kinds, texts and rects (compared item by item in a script).

counts: Misses: truth 8 − found 7 = 1, which is #7 (1 entry). Extras: 2 (c7, c8, the two pieces of #7) + 1 (c9, the first stamp line) = 3, which equals the recorded 3. Check: 10 items − 7 explained (c1→#1, c2→#2, c3→#3, c4→#4, c5→#5, c6→#6, c10→#8) = 3.

notices: There are no notices. ignored = {furniture 0, caseOnly 0, minorShifts 0, renumbered 0, repeatedLines 0}, visualCompared true, complete true, no textless, unreadable or uncertain pages, and the page map is the identity [1,2]. Summary line: '10 changes — 7 text · 3 numbers · 3 layout' (c1–c5, c7, c8 text; c1–c3 numbers; c6, c9, c10 layout). This is accurate. A pdftotext -layout diff shows that the header and footer are unchanged. The one-line shift below the table (a consequence) produced no item. Nothing says that the producer (Typst) is untested (README: 'Other producers ... are untested') or that there is a two-column section (multi-column reading order is on the README roadmap). No notice was needed here, because the content stream is in reading order (see the PDF.js order below), and both two-column truth items (#1, #2) were found and located.

found items: - #2 (c2) 'Number changed: −1,2 → −2,1 (+75%)': the correction value fell by 0.9 µm, yet the note reads '+75%'. describe.ts numberNote gives the relative change in magnitude when both values are negative. That is by design in the code but not explained in the README, and a reader can take '+' to mean the value went up.
- #3 (c3) '42,47 → 42,44 (-0.1%)': the percentage uses a decimal point in a decimal-comma document. Cosmetic.
- #4 (c4) 'Added “n.”': technically right, and the excerpt '…max. 0,005 0,007 [n.] i. O. M8 Rundlauf' shows it. But the list line does not say that the M7 rating flipped from pass to fail. It is credited only through the partReplaced rule decided after round 4; under the registered rules #4 is 'not found' (results-holdout5-blind-registered.txt).
- #6 (c6) 'Graphic or image changed p. 2' for the M7 bar recoloured green → red: the label does not say colour. The rect [172,108,240,16] is on the bar (truth [170.9,107.1,242.1,18.2]).
- #8 (c10) is accurate ('moved 106 mm to the right'; old x 76.9 → new 378.2 = 301.3 pt), but the stamp is split per line (see the c9 extra). The stamp border was correctly not listed: visual.ts lets a sideways-moved line explain a frame that moved with it.
- c5 'Added 13 words' (#5) is placed correctly: context '…AW-32, Seriennummer 0318-117' (the table caption) | 'Die Form- und Lagetoleranzen sind'.

Text order: in PDF.js getTextContent for after.pdf p1 (scratch scripts/tc.mjs), the left column items #52–#83 (x=70.9, y 324–432) come before the right column #85–#142 (x=305, y 324–446). The inserted sentence (#288, y 700.3) follows the caption (#286) and precedes 'Die Form-…' (#290). The stream order equals the reading order. There is no re-inserted or appended text.

- MISS x1 truth #7 replace 'Alle geprüften Merkmale liegen innerhalb der zulässigen Toleranzen.' → 'Das Merkmal M7 liegt außerhalb der zulässigen Toleranz.' (p2): The rewritten conclusion sentence is reported as two adjacent replaces on the same line: c7 'Changed “Alle geprüften Merkmale liegen innerhalb” → “Das Merkmal M7 liegt außerhalb”' and c8 'Changed “Toleranzen” → “Toleranz”'. They are split at the unchanged 'der zulässigen'. Neither item alone covers the truth, so it is not credited. [scorer-or-truth -> verified scorer-or-truth]
  evidence: - Recorded item 6 (c7): p2 old rect [70.9,338,190.2,12], new [70.9,338,139.8,12], context before '5 Ergebnis', after 'der zulässigen Toleranz. Die übrigen'.
  - Item 7 (c8): old [330.8,338,50.7,12], new [275.3,338,37.1,12], context before '…M7 liegt außerhalb der zulässigen', after '. Die übrigen Messwerte zeigen eine'.
  - The pdftotext -layout diff (lines 83–86) and the render r/sbs-pruef-2.png confirm the one-sentence rewrite.
  - Edge matrix (scratch repo/eval/edges.ts on the recorded items, CURRENT_RULES): #7 matches no item. typeOk is true and textMatch false for c7 and c8.
  - coversInContext(old snippet, '5 Ergebnis', c7.old, 'der zulässigen Toleranz. Die übrigen') = false. The new side = true.
  - With an old-side after-context 'der zulässigen Toleranzen. Die übrigen', the old side = true.
  - A merged item ('Alle … innerhalb der zulässigen Toleranzen' → 'Das … außerhalb der zulässigen Toleranz') passes textMatch under the context rule (scratch repo/eval/merged.ts).
  - A reviewer reading c7 and c8 together gets the exact edit.
  cause: Engine (traced):
  - diff.ts cleanupSemantic offers an equality to foldRule only when its weight is no larger than both neighbouring edits. An instrumented copy logged 'SEM eq len=13 lb=36 la=10': 'der zulässigen' weighs 13 characters, more than 'Toleranzen'/'Toleranz' (10), so the sentence stays two hunks.
  - compare.ts foldRule would refuse as well, by code reading: big(before), with orig 10 > 8, differs from big(after), with orig 2.

  Scorer (traced):
  - score.ts changeLensMatch/textMatch need one item to cover the whole snippet on each side.
  - The shown excerpt's context comes only from the new version: compare.ts textChange calls context(B, …), and report.ts shownExcerpt uses it for both sides. So the old-side snippet ('…Toleranzen.') can never be covered.
  - maxItems defaults to 1.
  fix: Scorer: match a replace truth against a run of adjacent text items in one block, joining their old and new texts with the unchanged tokens between them, and let the run count against that truth. Alternatively, record an old-side context and match each side against its own context; then c7 alone would be credited.

  Engine (reviewer-facing):
  - Compute and show the context per side in textChange.
  - Optionally, fold an equality of 1–2 words inside one sentence between two word-level edits regardless of scale (the weight gate in cleanupSemantic and the big() check in foldRule), so that a rewritten clause is one replace.

  Truth: maxItems 2 alone would not help, because of the old-side context.
- EXTRA x2 items 6–7 (c7 'Changed “Alle geprüften Merkmale liegen innerhalb” → “Das Merkmal M7 liegt außerhalb”', c8 'Changed “Toleranzen” → “Toleranz”'), p2: These are the two correct pieces of truth #7. They are counted as extra only because the scorer cannot assign either of them to #7. [scorer-or-truth -> verified scorer-or-truth]
  evidence: These are the same items as miss #7. In the recorded assignment (own and explained) both are -1. They match no other truth item: the edges for #1–#8 contain neither index. The texts and rects are correct (render r/sbs-pruef-2.png, line '5 Ergebnis'). A small presentation point: c7's excerpt shows the new-side 'Toleranz.' as plain context next to the struck old text.
  cause: See miss #7: cleanupSemantic's weight gate (diff.ts) splits the sentence; the scorer needs a single item, and the context is from the new side only (compare.ts textChange, report.ts shownExcerpt).
  fix: See miss #7: credit a run of adjacent items in one block, or use per-side context. Engine: per-side context, or fold a short equality inside one sentence.
- EXTRA x1 item 8 (c9 Position '“Prüfstelle Nordhang · Messraum 2” moved 107 mm to the right', p2): This is the first line of the two-line release stamp. Its second line (c10) is credited to truth #8, which explains one item (maxItems 1), so this line counts as extra. [scorer-or-truth -> verified scorer-or-truth]
  evidence: - c9 old rect p2 [76.9,478.2,138.8,10.3] → new [379.6,478.2,138.8,10.3]. c10 is [76.9,489.5] → [378.2,489.5].
  - The render r/sbs-pruef-2.png shows one bordered box with two lines moved together from the left to the right margin.
  - The truth #8 note says 'Bordered release stamp (two lines of text in a box) moved…', but maxItems is not set.
  - The 107 mm is accurate: 302.7 pt.
  cause: Engine (traced): compare.ts detectPositions pushes one 'position' Change per intact line that moved sideways ('out.push' inside the loop over lines), with no grouping of consecutive lines of one block or frame with the same displacement. Truth: the default maxItems of 1 for a two-line item. The report is accurate and not misleading.
  fix: Truth: maxItems 2 on #8. Engine: merge consecutive position changes in the same block or frame whose displacement agrees within a few points into one entry ('2 lines moved 107 mm to the right').

## holdout5-h-rapport-annuel

truth 8, found 8, extra 0

rerun: Yes. The same eval/run.ts rerun from the HEAD archive gives 8/8/0 (8), and the items JSON is identical to the recorded one. The CLI rerun (cli-rapport-annuel.json) gives the same 8 changes, with the same kinds, texts and rects.

counts: Misses: truth 8 − found 8 = 0. Extras: 0, which equals the recorded 0. Check: 8 items − 8 explained (c1→#1, c2→#2, c3→#3, c4→#4, c5→#5, c6→#6, c7→#7, c8→#8) = 0.

notices: There are no notices. ignored = {furniture 0, caseOnly 0, minorShifts 0, renumbered 0, repeatedLines 0}, visualCompared true, complete true, and the page map is the identity [1,2,3]. Summary line: '8 changes — 7 text · 2 numbers · 1 layout'. This is accurate: the header and footer are identical on all three pages (renders r/sbs-rapport-1..3.png). The column re-balance, the table shifting up, and the re-flow on pages 1–3 (consequences) produced no item. Nothing mentions Typst being untested or the two-column summary. None was needed: both two-column truth items, #1 (GWh → MWh, right column, rect x 373.1) and #8 (move out of the left column, old rects x 68 w 222.3 → new p3 full width), were found and located.

found items: - #4 (c4) 'Number changed: −0,8 → −1,3 (+63%)': ΔT became more negative, yet it reads '+63%'. describe.ts numberNote shows the change in magnitude for two negative values, the same pattern as Prüfbericht c2.
- #1 (c1) 'Changed “GWh” → “MWh”': a factor-1000 unit change shown as a word change, not as a number. That is acceptable, and the truth types it replace. The excerpt '…atteint 1,42 [GWh→MWh] sur l’exercice' is clear.
- #5 (c5) 'Graphic or image changed p. 2': it does not say that the December bar grew. The rect [448,100,24,24] covers only the top of the bar, where the pixels differ; it overlaps the truth rect.
- #3 (c3) '−4,2 % → 4,2 % (sign changed)' and #8 (c8) 'Moved “Le programme de raccordement de…” p. 1 → p. 3' are good.
- c6 'Deleted 16 words' is correct (16 words).

Text order: in PDF.js getTextContent for before.pdf p1 (scratch scripts/lines.mjs), the header is followed by the title, then the left column (#18–#49, x=68, y 170.8–374.2, including the paragraph to be moved at #31–#41), then the right column (#52–#67, x=305), then section 2 (#69). In after.pdf p3, the moved paragraph (#12–#17) sits between the two Perspectives paragraphs. The stream is in reading order (column-major), with no re-inserted or appended text.

## holdout5-h-services-agreement

truth 8, found 7, extra 2

rerun: Yes. The same eval/run.ts rerun gives 7/7/2 (7), and the items JSON is identical to the recorded one. The CLI rerun (cli-services-agreement.json) gives the same 9 changes, with the same kinds, texts and rects, plus the same notice and minor list.

counts: Misses: truth 8 − found 7 = 1, which is #8 (1 entry). Extras: 2 (c8, c9, the two pieces of #8), which equals the recorded 2. Check: 9 items − 7 explained (c1→#1, c2→#2, c5→#3, c7→#4, c3→#5, c4→#6, c6→#7) = 2.

notices: There is one notice: '6 list numbers changed only because numbered items were added, removed or moved; they are not listed.' (ignored.renumbered 6, action minor). The minor list is m1–m5 'List renumbered: 7 → 6 … 11 → 10' and m6 '6 → 11 p. 2 → p. 3' (the moved clause's own number). This is accurate: in PDF.js order, the old clauses 6 Non-Solicitation and 7–11 become 6 Warranties to 10 Limitation of Liability and 11 Non-Solicitation in the new version, while 12 and 13 are unchanged. That is exactly the consequence the truth description names, and it is correctly kept out of the list. Other values: furniture 0 (the header and 'Page n of 4' footer are unchanged), complete true, visualCompared true, and the page map is the identity. Summary line: '9 changes — 8 text · 2 numbers · 1 layout'. This is accurate.

found items: - #3 (c5) 'Number changed: 4 → 6 (+50%)': the late-payment interest rate is written 'at 4 per cent per annum'. The README says rates get 'the change in percentage points', but describe.ts percentUnit only recognises a trailing '%'/'％', so 'per cent' spelled out gives a relative '+50%' instead of '+2 pp'. A reviewer could misread this rate rise.
- #4 (c7) 'Moved a paragraph p. 2 → p. 3': the moved unit is the heading '6. Non-Solicitation' plus its paragraph (6 old rects, the first being the heading line). 'a paragraph' undercounts slightly. The 6 → 11 label change is correctly folded into the renumbering notice (m6), not shown as an edit.
- #6 (c4) 'Added 13 words p. 3 → p. 2' is correct: the old insertion point lies on old p3 (PDF.js before p3 #15 'exercise its rights under it. A party may disclose confi-'), and the new text is on p2 (after p2 #94–#96).
- c8's excerpt shows 'prior written' (new text, listed separately as c9) as unmarked context. Taken alone, it could suggest that the old text already said 'prior written consent'.
- #1 (c1), #2 (c2, with 'GBP' in the context), #5 (c3 'Deleted 14 words') and #7 (c6 '“Nothing in this Agreement limit…” now bold') are good.

Text order: in PDF.js getTextContent for before p2–p3 and after p2–p3 (scratch scripts/lines.mjs), each page runs header (#0), body, footnote (#98/#100 at y 754.5), footer (last). The inserted sentence sits in sequence at after p2 #94–#96. The stream is in reading order, with no re-inserted or appended text.

- MISS x1 truth #8 replace 'affiliates without the Customer’s consent' → 'affiliates only with the Customer’s prior written consent' (p3): The subcontracting consent edit is reported as two adjacent items: c8 'Changed “without” → “only with”' and c9 'Added “prior written”'. They are split at the unchanged 'the Customer’s'. Neither covers the truth alone, so it is not credited. [scorer-or-truth -> verified scorer-or-truth]
  evidence: - c8: p3 old rect [451.1,641.8,34.2,12.5], new [458.3,627.6,43.4,12.5], context 'Platform to any of its affiliates' | 'the Customer’s prior written consent,'.
  - c9: insert, new rect [166.1,641.7,56.1,12.5], context 'its affiliates only with the Customer’s' | 'consent, but remains responsible for'.
  - PDF.js lines: old p3 #87/#89 '…to any of its affiliates without the / Customer’s consent, but remains…'; new p3 #84/#86 '…affiliates only with / the Customer’s prior written consent, but…'.
  - Edge matrix: #8 matches no item. coversInContext(old snippet, 'Platform to any of its affiliates', 'without', 'the Customer’s prior written consent,') = false; the new side = true. With an old-side after-context ('the Customer’s consent, but remains') the old side = true.
  - oneInsertion(old, new) = false, so partReplaced cannot credit c9.
  - A merged item ('without the Customer’s' → 'only with the Customer’s prior written') passes textMatch (scratch repo/eval/merged.ts).
  - Read together, c8 and c9 give the exact legal change.
  cause: Engine (traced): diff.ts cleanupSemantic weight gate. The instrumented copy logged 'SEM eq a=[1622,1624) len=13 lb=8 la=12': 'the Customer’s' (13 characters) weighs more than 'only with' (8) and 'prior written' (12), so the equality is never offered to foldRule and the edit stays two hunks.

  Scorer (traced):
  - score.ts textMatch needs one item to cover each side's snippet.
  - The context is new-side only (compare.ts textChange context(B, …)), so the old-side snippet is never covered.
  - partReplaced handles only a single insertion.
  - maxItems defaults to 1.
  fix: Same as Prüfbericht #7:
  - Scorer: credit a run of adjacent text items in one block, with joined old and new texts and the run counted against the truth; or use per-side context, which would credit c8 alone and leave c9 as 1 extra.
  - Engine: show the old-side context for the old text, and fold a ≤2-word equality inside one sentence between two word-level edits into one replace ('Changed “without the Customer’s” → “only with the Customer’s prior written”').
- EXTRA x2 items 7–8 (c8 'Changed “without” → “only with”', c9 'Added “prior written”'), p3: These are the two correct pieces of truth #8. They are counted as extra because no truth item can be assigned to them. [scorer-or-truth -> verified scorer-or-truth]
  evidence: These are the same items as miss #8. In the recorded assignment (own and explained) both are -1, and they match no other truth item. The texts, rects and pages are correct (PDF.js new p3 #84/#86).
  cause: See miss #8: the cleanupSemantic weight gate (diff.ts), single-item matching with new-side context (score.ts textMatch, compare.ts textChange), and partReplaced limited to one insertion.
  fix: See miss #8.

## verifier checks
- holdout5-h-pruefbericht | MISS truth #7 replace 'Alle geprüften Merkmale liegen innerhalb der zulässigen Toleranzen.' → 'Das Merkmal M7 liegt außerhalb der zulässigen Toleranz.' (p2) | scorer-or-truth -> agree=True -> scorer-or-truth | The edit is real and is shown to the reviewer as two adjacent items: - pdftotext diff, before l.83 → after l.84 (scratch txt/). - The render r/sbs-holdout5-h-pruefbericht-2.png shows the sentence under '5 Ergebnis' rewritten. - CLI items 7–8 are 'Changed “Alle geprüften Merkmale liegen innerhalb” → “Das Merkmal M7 liegt außerhalb”' and 'Changed “Toleranzen” → “Toleranz”', both p. 2, on the same line (y 338). - Read together they give the exact edit, and item 7 alone already carries the change of meaning (all features within tolerance → M7 outside). Round-4 precedent: a footer edit split at an unchanged word was classed scorer-or-truth.  Scorer (my scratch scripts repo/eval/vfy/edges.ts, out/edges.txt): - typeOk is true for both items; textMatch(context) is false for both. - c7: coversInContext of the old snippet is false and of the new snippet true. - With an old-side after-context 'der zulässigen Toleranzen. Die übrigen', the old side becomes true. - A merged item passes textMatch. - No item matches #7. - Context is new-side only. In compare.ts textChange (l.518), context(B.length ? B : A, …) takes the new side whenever B has tokens, and report.ts shownExcerpt returns that one before/after for both sides of a replace.  Engine cause, confirmed by instrumentation. In my instrumented copy (inst/, out/semlog.txt), the equality 'der zulässigen' has len 13, lb 36, la 10. cleanupSemantic's gate (len ≤ lb && len ≤ la) fails, so foldRule is never consulted. Calling foldRule directly also returns false: before.orig is 10, after.orig is 2, and big() differs.  Presentation weakness, seen in the HTML report out/pruef.html: - c7's excerpt shows '…<del>…innerhalb</del> <ins>…außerhalb</ins> der zulässigen Toleranz. Die übrigen'. Read alone, the old sentence seems to end 'Toleranz.'. - c8's before-context '…M7 liegt außerhalb der zulässigen' is new wording. - The two items correct each other, so the report stays adequate.
- holdout5-h-pruefbericht | EXTRA items 7–8 (c7 'Alle geprüften Merkmale liegen innerhalb' → 'Das Merkmal M7 liegt außerhalb', c8 'Toleranzen' → 'Toleranz'), p2 | scorer-or-truth -> agree=True -> scorer-or-truth | These are the same two items as miss #7, and neither has an edge to any truth item (out/edges.txt). Their texts and rects are correct: - Old [70.9,338,190.2,12] and [330.8,338,50.7,12]. - New [70.9,338,139.8,12] and [275.3,338,37.1,12]. - These match the line '5 Ergebnis' in the render.  What a fix would recover (my what-if checks): - Per-side context alone credits c7 for #7; c8 stays extra, so the case goes 8/8/2. - Folding or crediting a run credits both items.
- holdout5-h-pruefbericht | EXTRA item 8 (c9 '“Prüfstelle Nordhang · Messraum 2” moved 107 mm to the right'), p2 | scorer-or-truth -> agree=True -> scorer-or-truth | The category holds, but the cause and fix are incomplete.  The report is correct and adequate: - c9 old [76.9,478.2,138.8,10.3] → new [379.6,478.2]; c10 [76.9,489.5] → [378.2,489.5]. - The render shows one bordered two-line stamp moved from the left to the right margin, and the border is not listed. - compare.ts detectPositions (l.2503–2585) pushes one position change per intact line, with no grouping. - Not traced by me: why the frame was explained in visual.ts. I only saw the comment at l.4836, 'a frame or stamp around it only if that moved along with it'.  Correction to the analyst. The analyst's fix 'Truth: maxItems 2 on #8' and cause 'the default maxItems of 1' do not explain the extra: - c9 has no edge to #8 at all. Edges: #8→[c10] only. - #8's snippet is only the second line, 'Prüfbericht freigegeben am 18.03.2026'. - Position items show no context: shownExcerpt's default branch gives before = after = ''. - My rescore with maxItems 2 on #8 (repo/eval/vfy/whatif.ts, out/whatif.txt) still gives 7/7/3. - A region-only #8 (old [70,470,155,32], new [370,470,155,32], maxItems 2) gives 7/7/2. - So the truth fix needs a region or a snippet that covers both lines, plus maxItems 2. The alternative is the engine merge the analyst proposes.  Small extra fact: the two lines report 107 vs 106 mm. In holdout5-h/pruefbericht.typ l.128, `align(right, stamp)` also right-aligns the text inside the box: both new lines end at x 518.4, and both old lines start at 76.9. A merge rule should therefore tolerate about 1.4 pt.
- holdout5-h-services-agreement | MISS truth #8 replace 'affiliates without the Customer’s consent' → 'affiliates only with the Customer’s prior written consent' (p3) | scorer-or-truth -> agree=True -> scorer-or-truth | The edit is real (pdftotext diff, before l.153 → after l.152) and is shown as two adjacent items on p. 3: - c8 'Changed “without” → “only with”': old [451.1,641.8], new [458.3,627.6]. - c9 'Added “prior written”': new [166.1,641.7], on the next line 'the Customer’s prior written consent'. - Read together they give the exact legal change.  Scorer (out/edges.txt): - c8: typeOk true, textMatch false; coversInContext old false, new true. With an old-side after-context 'the Customer’s consent, but remains', the old side becomes true. - c9: the after-round-4 branch goes to partReplaced, which is false because oneInsertion(old, new) is false. - A merged item 'without the Customer’s' → 'only with the Customer’s prior written' passes textMatch.  Engine (instrumented, out/semlog.txt): - The equality 'the Customer’s' has len 13, lb 8, la 12, so the cleanupSemantic gate fails. - Addition to the analyst: foldRule called directly returns TRUE here (orig 3 and 2, neither big, a 2-word equality). So for this case only the weight gate in diff.ts blocks the fold. For Prüfbericht both the gate and big() block it.  Presentation, seen in out/msa.html: c8's after-context shows 'the Customer’s prior written consent,'. Read alone, it would suggest the old text already said 'prior written consent'.
- holdout5-h-services-agreement | EXTRA items 7–8 (c8 'Changed “without” → “only with”', c9 'Added “prior written”'), p3 | scorer-or-truth -> agree=True -> scorer-or-truth | These are the same two items as miss #8. Neither has an edge to any truth item (out/edges.txt), and they are the only unexplained items: 9 − 7 = 2.  Texts, pages and rects are correct (pdftotext of after p3, l.43–44). The PDF.js dump (scripts/tc.mjs) confirms that the stream is in reading order.  What per-side context would do: c8 would be credited, giving 8/8/1.

verifier, anything the analyst missed: No misses or extras are left unclassified, and no notice was misread. Additions and corrections:

1. **Prüfbericht c9 fix (correction).** maxItems 2 on #8 alone does not remove the extra. c9 does not match #8, whose snippet is the stamp's second line only, and position items carry no context. Verified: still 7/7/3, and 7/7/2 only with a region-based #8 (out/whatif.txt).

2. **MSA fold cause (addition).** In MSA, foldRule would accept the 'the Customer’s' equality; only cleanupSemantic's weight gate (diff.ts, len ≤ both neighbours) blocks it. In Prüfbericht, foldRule also refuses, because big() differs (orig 10 vs 2). So relaxing only the gate would merge the MSA edit but not the Prüfbericht one (out/semlog.txt).

3. **Context in the HTML report (detail).** The context is always new-side. In the report (out/pruef.html, out/msa.html) each piece of the two split edits shows the other piece's new words as plain context. A cosmetic point: excerptHtml always puts a space before the after-context, giving 'Toleranz . Die übrigen'.

4. **Found-item description weaknesses: the analyst's list checks out.**
   - '−1,2 → −2,1 (+75%)' and '−0,8 → −1,3 (+63%)': describe.ts numberNote takes the magnitude when both values are negative. The README (l.49) promises only 'the relative change' and does not explain this.
   - '4 → 6 (+50%)' for 'at 4 per cent per annum': percentUnit is /[%％]$/, so a rate spelled out with words gets no percentage points, contrary to the README's 'change in percentage points for rates'.
   - '42,47 → 42,44 (-0.1%)' in a decimal-comma document, with an ASCII hyphen.
   - 'Added “n.”' for the M7 pass → fail rating flip.
   - 'Graphic or image changed' for a colour-only bar change.
   - 'Moved a paragraph' for a heading plus its paragraph.

   None of these changes a count.

5. **Rapport table columns (nothing missed).** The added row and the narrower '4,2 %' shift some table cells about 5 pt sideways (old x 445.5 → new 450.7), while the whole table moves up with the column re-flow. The engine lists no position item for this, which is correct: it is re-flow, not an edit.

6. **Scope.** No notice says that Typst is an untested producer (README: 'Other producers … are untested') or that two-column reading order is only on the Roadmap. This does not matter here: PDF.js order is column-major in reading order (out/tc-pruef-after-1.txt: left column #52–#81 at x 70.9, then right column from #88; out/tc-rapport-before-1.txt: x 68 first, then x 305), and all four two-column truth items were found.

# group fpdf2-cjk-lists

RECONCILE: I agree with all five of the analyst's entries and with all three case-level claims. My scratch folder is V = /tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/blind5/analysis/fpdf2-cjk-lists-verify.

Rerun (checked): I took a git archive of HEAD into V/tree; `git diff --stat f1053f3 HEAD -- src` is empty. In it I ran `node eval/run.ts --cases <3 ids> --blind --verbose --json V/rerun.json --items V/rerun-items.json`. For all three cases, Python == between my rerun-items.json and eval/results-holdout5-blind-items.json is True. The rows are the same: nouhinsho 8/8/0 (8), payslip 7/7/1 (7), pricelist 7/7/2 (7), group total 22/22/3 (22). The misses are the same (payslip #8, pricelist #5). Separate CLI runs (V/cli-*.json) give the same kinds, texts, pages and rects (the CLI JSON has no context fields). The rescores in the repo give the same rows under the registered rules (8/8/0, 7/7/1, 7/7/2).

Counts (checked with my probe V/tree/vprobe/matrix.ts, which uses eval/score.ts changeLensMatch and assign on the recorded items):
- nouhinsho: truth 8 − found 8 = 0 misses. 8 items − 8 explained (item k → truth #k+1) = 0 extra. No entries, which is correct.
- payslip: 8 − 7 = 1 miss (#8). 8 items − 7 explained (items 0–6 → #1–#7) = 1 extra (item 7). That is 1 miss entry + 1 extra entry.
- pricelist: 8 − 7 = 1 miss (#5). 9 items − 7 explained (0→#1, 1→#2, 5→#3, 4→#4, 3→#6, 6→#7, 8→#8) = 2 extras: item 2 (GC-4740 move) and item 7 ('Protective wear' colour). That is 1 miss entry + 2 extra entries. Truth #7 matches items 6 and 7, with maxItems 1, and assign gives it item 6.

Every count adds up. I add three engine-description checks on credited items. The analyst raised all three in foundItemsQuality without a category, and they do not change the counts.

## holdout5-i-nouhinsho-jpy

truth 8, found 8, extra 0

rerun: Yes. I ran `node eval/run.ts --cases <3 ids> --blind --verbose --json <S>/rerun.json --items <S>/rerun-items.json` from a git archive of HEAD in <S>/tree. Its src is identical to the frozen f1053f3: `git diff --stat f1053f3 HEAD -- src eval/score.ts` shows only comment and SETS lines in eval/run.ts. The whole recorded case object in results-holdout5-blind-items.json (exp, disclosed, furniture, items) compares equal (Python ==) to the rerun. The table row is the same: 8 / 8 / 0 (8). A CLI run (<S>/cli-nouhinsho-jpy.json) gives the same 8 changes. S = /tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/blind5/analysis/fpdf2-cjk-lists.

counts: Truth 8 − found 8 = 0 misses. 8 items, all explained one-to-one: item k goes to truth #k+1 (eval/score.ts changeLensMatch plus assign on the recorded items, script <S>/tree/probe/edges.ts). 8 − 8 = 0 extra, as recorded. No entries.

notices: There are no notices. complete=true, ignored counts are all 0, coverage is clean, and the page map is 1→1, 2→2. This is accurate. The PDF.js item sequences of the two versions differ only in the 8 edited items (<S>/order-nouhinsho-jpy-{before,after}.txt, diff), and the checker's 144 dpi pixel diff finds nothing beyond the truth. So nothing was compared only in part and nothing is hidden. Text order: there is no re-inserted or appended text. PDF.js order is fpdf2's cell-by-cell drawing order, identical in both versions. Its only upward steps come from side-by-side boxes drawn one after the other (p1: 6 steps, e.g. 見本工業株式会社 after 2026年11月4日 and 注文番号 after the delivery date row; p2: 1 step, 備考 after ¥191,378).

found items: Two credited items have misleading descriptions. (1) c1 "Number changed: 10 → 12 (+20%)" is the delivery date 2026年11月10日 → 12日, so it puts a percentage on a day of the month. The excerpt shows '2026年11月 [10→12] 日', so the reader can tell it is a date, but '+20%' is meaningless. The payslip's ISO date gets no percentage (fromValue null). Here the CJK date is split into tokens 2026/年/11/月/10/日, and from code reading (not instrumented), compare.ts referenceNumber() has a rule for 条款项章节 after a figure but none for 日/月/年, so a value and percentage are computed. (2) c5 "Number changed: 1,500 → 2,000 (+33%)" drops the Japanese negative sign △. The discount went from △1,500 to △2,000 (more negative), and the description reads as a positive amount rising. △ appears only in the context ('端数調整） △'). The README Numbers row lists −, ( ) and −€ but not △, as the truth note says. The other six are accurate (200 → 250 with 枚 in context; ¥ kept on the totals).

## holdout5-i-payslip-cny

truth 8, found 7, extra 1

rerun: Yes. In the same rerun (eval/run.ts --blind --items, from the HEAD archive), the recorded case object compares equal to the rerun, with 8 items, and the row is 7 / 7 / 1 (7) with the same miss (#8). The CLI JSON <S>/cli-payslip-cny.json gives the same 8 changes. The registered rescore is the same (7/7/1); the strict rescore is 4/4/4.

counts: Truth 8 − found 7 = 1 miss (#8), in 1 entry. Items 8; explained 7 (items 0–6 go to truths #1–#7, assign in <S>/tree/probe/edges.ts); 8 − 7 = 1 extra = item 7 ('陆' → '柒'), in 1 entry. Misses 1 + extras 1, as recorded.

notices: There are no notices; complete=true, ignored counts are all 0. This is accurate. The PDF.js item sequences of the two versions differ only in the 8 edited items (<S>/order-payslip-cny-{before,after}.txt). Page 2 (attendance) is unchanged, and the checker's pixel diff shows only the truth regions. Text order: there is no re-inserted or appended text. PDF.js order equals drawing order in both versions; the only upward step is '保密 Confidential' (y 49.2), drawn after the company name (y 66.0) on p1.

found items: (1) c3 "Number changed: 4471 → 8803 (+97%)" puts a percentage on the last four digits of a masked bank account. It is the payout-account change the truth note says a reviewer must not miss. The excerpt shows '6222 **** **** [4471→8803]', so the place is clear, but '+97%' frames an identifier as an amount. From code reading, not instrumented: compare.ts referenceNumber() has no rule for a digit group after masked groups or an account label. (2) c7 '17,637.40 → 17,737.40 (+0.6%)' leaves the currency code CNY out of the figure (it is in the context; UNIT in compare.ts takes symbols only). This is minor. (3) The uncredited c8 '陆 → 柒' is not flagged as a number change, although it is 600 → 700 in the amount in words. The truth note accepts a replace. The others (department, ISO date with no percentage, (948.60) → (848.60) −11%, (4,098.60) → (3,998.60) −2.4%) are accurate.

- MISS x1 truth #8 replace "人民币壹万柒仟陆佰叁拾柒元肆角整" → "人民币壹万柒仟柒佰叁拾柒元肆角整" (p1): The one-character change in the amount in words (陆 → 柒, six → seven hundred) is reported correctly as c8 "Changed “陆” → “柒”" on p. 1 at the 金额大写 line. The scorer does not credit it because the truth snippet (16 characters) is longer than the context the engine shows (6 characters on each side). [scorer-or-truth -> verified scorer-or-truth]
  evidence: Recorded item 7: old '陆' and new '柒', page 1, rect [226.7,559.9,8.5,10.7] on the amount-in-words line (render crop <S>/pair-payslip-words.png shows the only differing character there). Its context is before '民币壹万柒仟' and after '佰叁拾柒元肆'. The HTML report shows '<ctx>民币壹万柒仟</ctx> <del>陆</del> <ins>柒</ins> <ctx>佰叁拾柒元肆</ctx>' (<S>/cli-payslip-cny.html). Scorer probe <S>/tree/probe/ctx.ts: coversInContext(truth old, shown) is false on both the old and the new side, and sideMatch(context) is false. typeOk(replace) is true and regionOk is true for every item (<S>/tree/probe/edges.ts), so the snippet is the only blocker. The snippet needs 7 characters before the change (人民币壹万柒仟) and 8 after (佰叁拾柒元肆角整). With those contexts coversInContext is true on both sides. A trimmed snippet '民币壹万柒仟陆佰叁拾柒元肆' / '…柒佰…' is also true on both sides. The brief (eval/holdout5-brief.md line 71) asks for 'the changed words plus at most a few words of context'.
  cause: Engine: compare.ts context() collects 6 tokens on each side, and a CJK character is one token (tokenize splits CJK into single characters). So the context is 6 characters, while a Latin context is 6 words. describe.ts excerpt() (truncate at 40 characters) does not bind here. Scorer: score.ts coversInContext requires the whole truth snippet to lie inside before + text + after. Truth: the snippet is the full 16-character phrase, longer than the brief asks for.
  fix: Any one of these would credit it. (a) Scorer: for CJK, accept a reported change when its old → new equals the character diff of the truth's old → new at the same place, and the shown context is a substring of the truth snippet around that place. (b) Engine: count CJK context in characters (for example 12–16 characters instead of 6 tokens), which also gives the reader more of the phrase. (c) Truth: trim the snippet as the brief asks. Optional engine improvement: flag a change of Chinese capital numerals (陆 → 柒 inside 人民币…元…整) as a number change.
- EXTRA x1 item 7: replace '陆' → '柒' (p1, context 民币壹万柒仟 | 佰叁拾柒元肆): This is the correct report of truth #8 itself. It counts as extra only because the snippet and context rule did not assign it to #8. [scorer-or-truth -> verified scorer-or-truth]
  evidence: This is the same item as miss #8. In <S>/tree/probe/edges.ts no truth item matches it (owner −1). Truths #1–#7 have other texts, and #8 is blocked by coversInContext, as above.
  cause: Same as miss #8: score.ts coversInContext against a 6-character CJK context from compare.ts context().
  fix: The same fix as miss #8. Once it is credited to #8, the case would be 8 / 8 / 0.

## holdout5-i-pricelist-gbp

truth 8, found 7, extra 2

rerun: Yes. In the same rerun, the recorded case object (9 items, exp, disclosed, furniture) compares equal to the rerun, and the row is 7 / 7 / 2 (7) with the same miss (#5). The CLI JSON <S>/cli-pricelist-gbp.json has the same 9 changes and 1 notice. An instrumented copy (<S>/inst, logging only) gives the same 9 changes (checked in Python).

counts: Truth 8 − found 7 = 1 miss (#5), in 1 entry. Items 9; explained 7 (assign in <S>/tree/probe/edges.ts): item 0 → #1, 1 → #2, 5 → #3, 4 → #4, 3 → #6, 6 → #7, 8 → #8. Truth #7 (graphic, maxItems 1) matches both item 6 and item 7, and item 6 takes it. The extras are 9 − 7 = 2: item 2 (move GC-4740, consequence, 1) + item 7 ('Protective wear' text colour, noise, 1) = 2, as recorded.

notices: There is one warning: 'New version p. 2: 13 words lie under or next to a stamp, a watermark, a fill or another graphic that changed … (such as “PC-2220”, “Replacement”, “blade”)'. complete=false, so --fail-on-change would exit 3. The notice is accurate. An instrumented notePartly logged the 13 words: the PC-2220 row (8 words, y 428.5) and the PW-5010 row (5 words, y 463.7), directly above and below the recoloured Protective wear band. Nothing changed in those rows, so it is a correct 'compared in part' disclosure. It does not cover the struck PC-2170 row (y 323.1), so miss #5 is not disclosed by it (<S>/trace-pricelist.log, lines '[partly]'). There is no repeated-row count (ignored.repeatedLines 0), although the heading row repeats at the top of p2. Text order: there is no re-inserted or appended text. PDF.js order is top to bottom in both versions; the only upward steps are inside the two-line 'Min. qty' heading cell (2 per page). One relevant detail: item #0 of p2 in both versions is the running header 'Sample Garden Supply Ltd · Trade Price List 2027' (y 33.3). It is drawn first and then hidden under the heading band (checker note), and it is extracted only on p2 (page 1 has no header), so it is body text and not furniture.

found items: Credited items are adequate. c1 '01/01/2027 → 01/02/2027' (no percentage), c2 '£34.50 → £36.80 (+6.7%)', c4 delete GC-4730, c5 add 'Promo …', and c9 '−8% → −10% (-2 pp)' are accurate. Two are weak in wording only: c6 (HT-1150) says 'Moved a paragraph p. 1 → p. 2' for a table row, and c7 'Graphic or image changed p. 2' does not say it is a fill colour, although its region is the band.

- MISS x1 truth #5 format 'Anvil loppers 70 cm, ratchet' struck through (p2 → p2): A black strikethrough added over the PC-2170 description is not reported, and no notice or count covers that row. The strike is fpdf2's 'S' emphasis: a filled 0.4 pt rectangle. [missed -> verified missed]
  evidence: PyMuPDF get_drawings on after p2 finds a black fill 're' at [96.9,328.3]–[207.4,328.7]: 110.5 × 0.4 pt, across the word run at y 323.1–332.2. It is not in the before PDF. The 150 dpi crop <S>/crop-anvil-after.png shows the strike; <S>/crop-anvil-before.png is the unstruck row. The row moved up 35.15 pt between versions (before y 358.2 → after 323.1, re-flow), and the text colour and font are the same. I traced visual.ts appearanceChanges and lineIn on Anvil, loppers, 70, cm and ratchet (<S>/trace-pricelist.log). For each word: skip(b)=false, cover [null,null], near=null, not partly compared; lineIn returns 'part' unshifted and null on every sideways shift, so there is no hit, and the 'followed along the line' pass has no seed. At the strike rows (y 327.7–329.0, scale 1.5 px/pt) the values are: added 0.30–0.35 (the threshold is 0.45); across (share of columns dark ≥ 0.6) 0.58–0.78 (the threshold is 0.85); gained 0.53–0.73; still=false, because the 35.15 pt shift is not a whole number of pixels, so the samePixels path is closed. The README (Scope and limitations, Strikethrough) states that 'Strikes in black, navy, pure blue, dark grey, red or the text's own colour are found'. Its only thin-line limit is for mid-tone colours ('grey at 0.8 and 1.5 pt, mid-blue … green … at 0.8 pt'). No README sentence covers a 0.4 pt black strike.
  cause: src/core/visual.ts lineIn (the line(k) test called by addedLine from appearanceChanges): a 0.4 pt line is 0.6 px at the visual stage's 1.5 px/pt. Over the three-row window it adds about 0.3 of a line's darkness, and fewer than 85 % of the columns reach darkness 0.6. Both the 'added ≥ 0.45' and the 'across ≥ 0.85' tests fail. The samePixels fallback (added ≥ 0.2 plus filled) needs the word at the same pixel phase, which a re-flowed row does not have.
  fix: (a) Treat 'part' results on consecutive words of one line at the same rows (as here: all five words at y 327.7–329.0) as a thin line across the run. This is a run-level seed for the existing 'followed along the line' pass. (b) When lineIn returns 'part', re-render the word's band at a higher scale (for example 4 px/pt) and test again. (c) Use vector evidence: a filled rectangle under 1 pt high spanning the word run at mid x-height in one version only (from the PDF.js operator list) is a strike. Also state in the README the thinnest line tested.
- EXTRA x1 item 2: move 'GC-4740 Multipurpose compost 50 l bag 60 £4.90 Pallet delivery' p. 2 → p. 1 ('Moved a paragraph'): A row that flowed back from the top of p2 to the foot of p1 (because HT-1150 left p1 and GC-4730 was deleted) is reported as moved. The truth description names this re-flow as an unlisted consequence: 'page breaks move, so page 1 ends and page 2 starts with different rows'. [consequence -> verified consequence]
  evidence: PDF.js order (<S>/scripts/pjs.mjs). Before: p1 ends with GC-4720 (y 782.7), then the footer; p2 #0 is the hidden header 'Sample Garden Supply Ltd · Trade Price List 2027', #1–13 the heading row, then GC-4730 and GC-4740 (y 66.7, 84.3). After: p1 ends with GC-4720, then GC-4740 (y 782.7); p2 has the hidden header, the heading row, then GC-4750. In the item, the new side's contextAfter is 'Sample Garden Supply Ltd · Trade' (the hidden p2 header). I instrumented compare.ts crossedPageBreak (<S>/trace-pricelist.log, '[hunk]' and '[crossBack?]'). Hunks: insert B 'GC-4740 …' at A 390, delete A 'GC-4730 …' [409,419), delete A 'GC-4740 …' [419,430). crossingBack(ins GC-4740, del GC-4740) is false: between them stand the hidden header, the heading row and the deleted GC-4730 row, only 19 of 29 between-tokens are matched, and repeatedEarlier(A, between) is false. Against del GC-4730 the texts differ.
  cause: src/core/compare.ts crossedPageBreak / crossingBack folds a row that flowed back across a page break only when the material between its two places is matched word for word and repeats as whole lines on an earlier page. Here (1) the deleted row GC-4730 lies between, and (2) the p2-only running header (hidden under the heading band, not furniture because it is on 1 of 2 pages) precedes the heading row and is not on page 1. detectMoves then pairs the two copies as a move.
  fix: In crossingBack, skip over deleted (or inserted) hunks of whole lines between the repeated line and the row. Accept as page-top material any lines that stand at the top of that page at the same place in both versions, not only lines repeated on an earlier page. Alternatively, do not report a move whose only displacement is across a page break with the same neighbours on both sides apart from page-top material.
- EXTRA x1 item 7: graphic/format 'Text colour or weight changed' on 'Protective wear' p. 2 (old [45.9,463.7] → new [45.9,446.1]): This is a false colour claim on the band text. The text stayed black DejaVu Sans Bold 7.8 pt, and only the band fill behind it changed from grey to orange. That fill change is already listed (item 6, credited to truth #7). [noise -> verified noise]
  evidence: PyMuPDF spans: 'Protective wear' has color 0x0 and DejaVuSansBold 7.8 in both versions. The fills are (226,226,226) at [42.5,459.8,552.8,477.4] before and (250,208,160) at [42.5,442.2,552.8,459.8] after. Crop <S>/pair-band.png. I traced appearanceChanges (covers path) for Protective and wear (<S>/trace-pricelist.log). Glyph chroma is old [0,0,0] and new [3.9,−0.8,−6.1]; beyondOverlays = 7.3 and 8.9 (< 30), so there is no ink colour change. colour=true comes from the background test: bgA = [226,226,226], bgB = [250,208,160], and the new-side cover's colour is [216,216,216]. overlayInk (new side) logged 105 'samples' over the other side's paper, which are anti-aliased pixels of the grey row rule at the band's top edge (216/216/216 at px row 662 ≈ 441.3 pt), and 1300 'onFill' pixels of orange over the old grey band. Because there are at least 8 samples, overlayColours uses them only, so the cover is the rule's grey. ownedBy(orange, grey226, ob) then fails, owned() fails (gap 66 > 40), and colour=true. The scorer also matches the item to truth #7 (graphic, region overlaps), but maxItems is 1.
  cause: src/core/visual.ts overlayInk takes the overlay colours from the pixels over the other side's paper whenever there are ≥ 8 of them, and ignores the much larger set over the other side's fill. Here that set is the recoloured band. appearanceChanges then cannot explain the word's new background by any overlay colour and reports 'Text colour or weight changed'. The no-overlay branch has an exemption (filled()) only for a paper → fill background.
  fix: In overlayInk, derive colours from onFill as well when it outnumbers the samples by a wide margin (here 1300 vs 105), or from both sets. In appearanceChanges, accept a background equal to the fill colour of a graphic change listed on the word's rows, also when the other version's background is that graphic's old fill (fill → fill), and fold a 'colour' hit whose glyph chroma did not change into the graphic item.

## verifier checks
- holdout5-i-payslip-cny | MISS truth #8 replace 人民币壹万柒仟陆佰叁拾柒元肆角整 → …柒佰… (p1) | scorer-or-truth -> agree=True -> scorer-or-truth | Checked. Recorded item 7 is replace 陆 → 柒, p1, rect [226.7,559.9,8.5,10.7]. My 150 dpi pixel diff of p1 (V/scripts/pixdiff.py at threshold 6) has one band there, y 560.6–569.3, x 226.6–235.2, and none elsewhere on that line. The PDF.js items differ only in that one character. Shown context: before 民币壹万柒仟, after 佰叁拾柒元肆 (6 characters each).  Matrix probe: typeOk is T and regionOk is R for #8, but changeLensMatch is false.  V/tree/vprobe/ctx.ts runs eval/score.ts coversInContext: - as recorded: false, old and new; - only the 7-character head 人民币壹万柒仟: false; - only the 8-character tail 佰叁拾柒元肆角整: false; - both: true; - trimmed snippet 民币壹万柒仟陆佰叁拾柒元肆: true.  The brief (eval/holdout5-brief.md) asks for 'the changed words plus at most a few words of context'. The truth note accepts a replace. A reviewer sees the exact changed numeral in place, next to the net-pay item that changed by the same 100. That is adequate, so the snippet and context rule are the only blocker.  Cause (checked in code): compare.ts context() collects up to 6 tokens (line 475, `before.length < 6`), and a CJK character is one token. This exact cause and fix were already reported in round 4 (results-holdout4-analysis.md, zh-en-supply-annex #3: 'Size the context by a character budget for CJK') and were still in the frozen engine.
- holdout5-i-payslip-cny | EXTRA item 7 replace 陆 → 柒 (p1) | scorer-or-truth -> agree=True -> scorer-or-truth | Checked. This is the same item as miss #8. In my matrix probe its owner is −1, and it matches no truth item. Truths #1–#7 have other texts, and #8 is blocked by coversInContext as above. Once the context issue is fixed it would be credited, and the case would be 8/8/0.
- holdout5-i-pricelist-gbp | MISS truth #5 format 'Anvil loppers 70 cm, ratchet' struck through (p2) | missed -> agree=True -> missed | The strike (checked): - PyMuPDF drawings (V/scripts/draw.py and spans.py) show a black fill rectangle in after p2 only, at [96.9,328.3]–[207.4,328.7], 110.5 × 0.4 pt. It lies across the description span at [96.9,323.1,207.4,332.2]. In before, the row is at y 358.2, unstruck. - The span keeps DejaVuSansBook 7.8 pt and colour 0x0. - The 150 dpi crop V/crop-anvil.png shows the strike clearly.  No item covers the row: none of the 9 items has a rect on it.  The notice does not cover it. My own instrumented copy (V/inst, logging only in notePartly; the same 9 changes, Python ==) logs exactly 13 words (V/inst-pricelist.log). Eight are in the PC-2220 row (y 428.5) and five in the PW-5010 row (y 463.7), next to the recoloured band. None is in the PC-2170 row (y 323.1). complete=false and exit 3 come from those other rows.  README, Strikethrough: 'Strikes in black, navy, pure blue, dark grey, red or the text's own colour are found'. Its only thin-line limit is for mid-tone colours at 0.8/1.5 pt. Nothing covers a 0.4 pt black strike, so the edit is in scope and silent.  Cause (re-measured): my trace of lineIn line(k) on the struck row (V/inst-line.log) gives added 0.24–0.39 (below 0.45), across 0.47–0.77 (below 0.85) and still=false, for every word and every sideways shift. The ranges are a bit wider than the analyst's, but the conclusion is the same.
- holdout5-i-pricelist-gbp | EXTRA item 2 move 'GC-4740 Multipurpose compost 50 l bag 60 £4.90 Pallet delivery' p2 → p1 | consequence -> agree=True -> consequence | Checked with PDF.js order (V/scripts/pjs.mjs, V/pjs-pricelist-*.txt): - Before: p1 ends with GC-4720 (y 782.7). p2 has #0 the hidden header 'Sample Garden Supply Ltd · Trade Price List 2027' (y 33.3), #1–7 the heading row, then GC-4730 (y 66.7) and GC-4740 (y 84.3). - After: p1 ends with GC-4720 (y 765.1) and GC-4740 (y 782.7). p2 has the hidden header, the heading row, then GC-4750.  The pdftotext word diff shows GC-4740's words unchanged, and no other differences beyond the truth edits. The truth description names this: 'page breaks move, so page 1 ends and page 2 starts with different rows'. The move is true but derivative, and it should be folded.  Not re-traced: the crossedPageBreak/crossingBack internals. I rely on the analyst's trace there. The recorded contextAfter 'Sample Garden Supply Ltd · Trade' does confirm that the hidden p2 header is next to it in the body stream.
- holdout5-i-pricelist-gbp | EXTRA item 7 'Text colour or weight changed' on 'Protective wear' p2 (old [45.9,463.7] → new [45.9,446.1]) | noise -> agree=True -> noise | Checked: - PyMuPDF spans: 'Protective wear' is DejaVuSansBold 7.8 pt, colour 0x0, in both versions. - Only the band fill changed: (226,226,226) at [42.5,459.8,552.8,477.4] → (250,208,160) at [42.5,442.2,552.8,459.8]. - The 150 dpi crop V/crop-band.png shows black bold text on grey, then on orange. - Item 6 (credited to #7) already lists the fill. Item 7 carries format.appearanceChanged and the word's own boxes.  The truth #7 note says 'band text unchanged'. So the claim that the text colour or weight changed is false, and the item adds nothing → noise.  Nuance the analyst did not mention: the README Faint graphics bullet says a highlight around a word is listed on the word as 'Text colour or weight changed', and is suppressed for a re-tinted whole-row band or a same-colour graphic on those rows only 'within about 40 levels'. This re-tint is 66 levels in the blue channel (226 → 160). The README therefore partly foresees such an item. That does not change the category, because no extra category is documented.  Not re-traced: the analyst's overlayInk / ownedBy path.
- holdout5-i-nouhinsho-jpy | FOUND c1 (truth #1) 'Number changed: 10 → 12 (+20%)' for 2026年11月10日 → 12日 | none (foundItemsQuality note) -> agree=True -> engine-description | Checked. CLI JSON numeric is {from 10, to 12, fromValue 10, toValue 12}, and the excerpt is '2026年11月 [10→12] 日'. A percentage on a day of the month is meaningless; 'a percentage on a non-amount' is engine-description. By comparison, the ISO date on the payslip (c2) and the dd/mm/yyyy date on the pricelist (c1) get fromValue null.  Code reading only, not instrumented: compare.ts referenceNumber() (line 686 on) has a rule for 条款项章节 after a figure (line 711), and none for 年/月/日. This matches the analyst's inference. It is credited, so the counts do not change.
- holdout5-i-nouhinsho-jpy | FOUND c5 (truth #5) 'Number changed: 1,500 → 2,000 (+33%)' for △1,500 → △2,000 | none (foundItemsQuality note) -> agree=True -> engine-description | Checked. PDF.js gives one item '△1,500' → '△2,000' (p2 y 320.4). The engine leaves △ in the context ('端数調整） △'), and computes fromValue 1500, toValue 2000, +33%. Parenthesised negatives in the same group are signed instead: payslip (948.60) → (848.60) gets −948.6 → −848.6 (−11%). So the description reads as a positive amount that rose, while the discount actually became more negative.  The README Numbers row lists −500, (1,200), −€62.40 and １２，０００, not △, as the truth note says. Sign support for △ is therefore not claimed. The item is still listed, and it misleads. It is credited, so the counts do not change.
- holdout5-i-payslip-cny | FOUND c3 (truth #3) 'Number changed: 4471 → 8803 (+97%)' (masked bank account) | none (foundItemsQuality note) -> agree=True -> engine-description | Checked. PDF.js item '6222 **** **** 4471' → '…8803' (p1 y 199.6). The CLI numeric has fromValue 4471, toValue 8803, so +97% is put on an identifier. The truth note calls this the payout-account change 'a reviewer must not miss'. The place is correct (rect [490.8,191.4], my pixel band x 493.9–514.1), but the percentage frames it as an amount.  Code reading only: referenceNumber() has no rule for digits after masked groups or an account label. It is credited, so the counts do not change.

verifier, anything the analyst missed: Nothing the analyst left unclassified changes the counts. My pixel diffs (150 dpi, threshold 6) of nouhinsho p1/p2 and payslip p1/p2 show only the truth regions; payslip p2 has 0 bands. The pricelist drawing diff (y ignored) shows only:
- the strike;
- the band recolour;
- one table row fewer on p2;
- the re-flowed band positions.
pdftotext shows only the truth edits plus the GC-4740 re-flow. So there are no other silent edits in this group.

Small corrections and additions:
1. Three credited items deserve explicit engine-description checks (added above): nouhinsho c1 (+20% on a date), nouhinsho c5 (△ dropped, '+33%' for a discount that grew more negative), and payslip c3 (+97% on account digits).
2. The payslip #8 cause, compare.ts context() at 6 tokens (one CJK character per token), is the same cause named in round 4 (results-holdout4-analysis.md, zh-en-supply-annex #3, with the fix 'size the context by a character budget for CJK'). It was not fixed before the frozen engine f1053f3, so this is a recurrence, not a new finding.
3. Pricelist: the analyst wrote 'page 1 has no header'. Page 1 does have the letterhead 'Sample Garden Supply Ltd' (y 53.8) and the title 'Trade Price List 2027' (y 114.5) as separate lines. Only the combined running-header line is on p2 alone (PDF.js check). The conclusion that it is body text and not furniture stands; the recorded contextAfter of item 2 includes it.
4. Pricelist strike trace: my re-measurement gives somewhat wider ranges (added 0.24–0.39, across 0.47–0.77, still=false on every shift) than the analyst's (0.30–0.35 and 0.58–0.78). The conclusion is the same.
5. Pricelist 'Protective wear' noise: the README Faint graphics bullet limits its suppression of word-level 'Text colour or weight changed' items for a re-tinted whole-row band to 'within about 40 levels'. This re-tint is 66 levels (blue 226 → 160), so the README partly foresees this item. The category remains noise.
6. Payslip c8 (陆 → 柒) counts as text, not as a number, in the summary line ('8 text · 6 numbers'). This is minor; the analyst noted it as an optional engine improvement.

Not re-traced by me: crossedPageBreak/crossingBack for the GC-4740 move, and overlayInk/ownedBy for the band colour item. I confirmed their facts (PDF.js order, spans, fills, renders) but not the internal values the analyst logged.

# group fpdf2-statements

RECONCILE: I agree with all 8 entries, and the counts add up per case. To check them, I made git-archive copies of f1053f3 and of the current HEAD 9ba0c7d in my scratch folder. src/ is identical in the two copies (diff -r). Between them, score.ts is unchanged and run.ts gains only 3 set-label lines. I reran the CLI on the three cases and checked my output by script against results-holdout5-blind-items.json: kinds, texts, pages and rects match for every item. I also reran eval/run.ts --blind in the HEAD copy. Its items deep-equal the recorded entries (sorted-key JSON), and its scores are rechnung 8/8/32, releve 7/7/0 and statement 7/7/1. My probe (head/eval/vprobe.ts, which applies score.ts changeLensMatch and assign to the recorded items) gives the same assignments as the analyst.

- **rechnung-eur:** misses 8 − 8 = 0. Extras 26 + 1 + 2 + 2 + 1 = 32, which is the recorded extra count. The unassigned items are 2, 3–11, 14, 15–23 and 24–35.
- **releve-chf:** misses 8 − 7 = 1 (#4). Extras 0: all 7 items are assigned.
- **statement-gbp:** misses 8 − 7 = 1 (#3). Extras 1 (item 3, the only unassigned item).
- **Group:** 24 truth items, 22 found, 33 extras. Of the 33, 31 are consequences, 1 is noise and 1 is scorer-or-truth. Of the 2 misses, 1 is scorer-or-truth and 1 is out-of-scope-silent.

/home/user/changelens is untouched (git status is clean).

## holdout5-i-rechnung-eur

truth 8, found 8, extra 32

rerun: Yes. I reran `node eval/run.ts --cases holdout5-i-rechnung-eur,holdout5-i-releve-chf,holdout5-i-statement-gbp --blind --verbose --json rerun.json --items rerun-items.json` in a git-archive copy of HEAD 9ba0c7d, with node_modules symlinked. In that copy src/ and eval/score.ts are the same as at f1053f3; run.ts differs only by the held-out-5 set label. The case's entry in rerun-items.json deep-equals (sorted-key JSON) its entry in results-holdout5-blind-items.json. Scores (8/8/32, separate 8), the 'reported' list and the misses equal results-holdout5-blind.json. The CLI `--json` run with default options gives the same 40 changes (kinds, texts and pages compared by script). Scratch: rerun.txt, rerun-items.json, cli-holdout5-i-rechnung-eur.json.

counts: Misses: truth 8 − found 8 = 0. Extras: 26 (renumbered Pos. labels) + 1 (move) + 2 (label edits inside the move) + 2 (zebra graphics) + 1 (false underline) = 32 = recorded extra. As a cross-check: 40 items − 8 explained (items 1, 12, 13, 36, 37, 38, 39, 40, from probe.ts with assign()) = 32 unassigned. Those are items 2, 3–11, 14, 15–23, 24, 25, 26, 27, 28–35.

notices: One warning: "New version p. 1–2: 7 words lie under or next to a stamp, a watermark, a fill or another graphic that changed … compared only in part (such as “200”, “1000”, “500”)". In coverage.partlyCompared these are 3 words on p.1 (200, 1000, 500) and 4 on p.2 (1, St, 96,40). All 7 are unchanged words on rows whose zebra shading flipped. The README documents this ("The count can also include words that are fine, for example in a striped table re-flowed by an inserted row"), so the notice is accurate as a caution but false-positive here, and it sets complete=false. No renumbering count (ignored.renumbered=0): the 29 renumbered positions are listed, not hidden, so nothing is silent. repeatedLines=0 is correct because both versions have the header row on p.2. furniture=0. visualCompared=true. Text order (PDF.js getTextContent): it follows the reading order and is the same in both versions. The only jumps are layout jumps: on p.1 the letterhead's right block comes after the left block (item 3 "Beispielweg 12" y 50.3 follows y 70.4), and the info box comes after the address (item 15 "Rechnungsnummer" y 150.8 follows y 202.8). "Seite n von 2" comes after the second footer line. There is no re-inserted or appended text.

found items: Truth #1, item 1 "Added 13 words" p.1: the text is "31-0458 Pipettenspitzen 1000 μl, steril, 10 × 96 St. 4 Pkg. 38,50 154,00 8". It ends with the next row's new label "8". The new row's own label "7" is shown as context, because the diff matched it with old row 7's label. The boundary is slightly wrong, and the description is generic ("13 words", not "a table row"). PDF.js gives the WinAnsi µ as Greek mu (μl); this is harmless. #2 "10 → 12 (+20%)" with context "puderfrei … Karton": fine. #3 "489,00 → 586,80 (+20%)": fine. #4 "-150,00 → -185,00 (+23%)": the percentage is of the magnitude (describe.ts: both values negative → percentChange(-a,-b)), so it reads as "credit up 23 %"; acceptable. #5–#7 totals (+6.6%): fine. #8 due date with no percentage: fine. The extras carry percentages on position numbers (+13% … +2.9%), which is misleading (see the first entry).

- EXTRA x26 items 3–11, 15–23 (p.1) and 28–35 (p.2): "Number changed: 8 → 9 (+13%)" … "25 → 26 (+4%)", "28 → 29 (+3.6%)" … "35 → 36 (+2.9%)": The Pos. column is renumbered automatically after the row inserted as Pos. 7. The 26 renumbered positions are listed one by one, each with a percentage. [consequence -> verified consequence]
  evidence: CLI JSON: each item is old n → new n+1 one row (17 pt) lower, at x 72.8/77.5, on a row whose content is unchanged (PDF.js text of both versions). The truth description names "positions 7-35 renumber to 8-36" as a consequence that is not listed. ignored.renumbered=0 and there is no notice. The generator writes the labels as cells = [str(i + 1)] + r (holdout5-i/case_rechnung.py). Scratch repo/eval/gaps.ts shows that every Pos. label has font size 8.50 pt and a gap of 5.66 pt to the Art.-Nr. cell. The rest of the 29 renumberings are folded elsewhere: 7→8 into the insert's text, and 26→27 and 27→28 into the move (see the next two entries).
  cause: compare.ts labelAt() accepts a bare integer only when it starts a block and has a gap of at least one em after it (`gap >= t.size`). rowNumberAt() returns null when the next cell is closer than t.size. The right-aligned Pos. column stands 0.67 em before the Art.-Nr. column, so labelSequences() finds no labels and extractRenumbering() never has candidates. Its last loop, which removes the percentage from 'cell' row numbers, does not apply either.
  fix: Engine: accept a line-start integer as a row number when it heads a column of integers that number on from 1 over consecutive rows (same right or left edge, every row), with a gap of at least about 0.4 em or wider than the line's word spacing, and no QUANTITY_HEADER above it. The existing net-shift rule in extractRenumbering then folds 7→8 … 35→36 into the renumbered count, with no percentages. README, until this is fixed: say that row numbers set closer than an em to the next cell are not recognised as renumbering.
- EXTRA x1 item 24: "Moved and edited “63-1100 Laborthermometer -10 … …”" p. 1 → p. 2: The last row of page 1 flowed to the top of page 2, below the page-2 running header and the repeated table header. It is listed as moved and edited. [consequence -> verified consequence]
  evidence: Engine line model: old p1 L45 "26 63-1100 Laborthermometer …" (y 747.5); new p2 L51 "27 63-1100 Laborthermometer …" (y 70.0), under L49 "Muster Laborbedarf GmbH · Rechnung RE-2026-1187 vom 04.11.2026" and the header row L50, which both versions have. The truth description names this row move as a consequence. Instrumented scratch copy of crossedPageBreak (repo/src/core/compare.ts.debug-cpb) gives: del "26 63-1100 … 58,80", ins "63-1100 … 58,80 28", between "Muster Laborbedarf GmbH · Rechnung … Betrag € 27", first keys 26/63-1100, renumbered=false, repeatedEarlier(A)=false, crossing=false. For contrast, in holdout5-i-statement-gbp the same function pairs the PAY 88123 row: the block between is only the repeated header row, crossing=true, and no item is listed.
  cause: compare.ts crossedPageBreak() fails for two reasons. (a) The alignment matched the old "27" (Exsikkator) with the new "27" (Laborthermometer), so the hunks are one label off. renumbered() cannot excuse that, because the row numbers are not labels (see the first entry). (b) The block between the hunks must be lines repeated on an earlier page. It starts with the running header, which the generator prints only for page_no() > 1, so in a 2-page document it appears once and is not furniture. It also ends with the label "27". detectMoves() then pairs the deletion and the insertion (≥ 80 % in order) as a move with 2 edits.
  fix: Engine: in crossedPageBreak, allow the block between to include page-top lines above the repeated header row that are not body text elsewhere (a running header that appears on page 2 only), and drop an equal pair of labels at its end. With the row-number fix the off-by-one goes away. As a fallback, treat a move from the last body line(s) of page p to the first body line(s) after the page-top block of page p+1, in the same order relative to its neighbours, as re-pagination: list nothing.
- EXTRA x2 items 25 "Deleted “26”" and 27 "Added “28”" (p. 1 → p. 2): These are the two edits inside the false move: the moved row's own renumbered label (26→27) and the next row's renumbered label (27→28), listed as changes of their own. [consequence -> verified consequence]
  evidence: Recorded item 24 has moveEdits: 2. Item 25 old "26", p1 [72.8,747.5,9.5,9.5], is the first token of the move's old text. Item 27 new "28", p2 [72.8,87,9.5,9.5], is the last token of the move's new text, and its contextBefore is "C 4 St. 14,70 58,80". Both are automatic renumbering, which the truth description names.
  cause: This follows from the two entries above. detectMoves() lists the edits inside a moved passage as their own changes. extractRenumbering()'s rule for the label at the head of a move does not take them, because labelAt() finds no label.
  fix: The fixes for the first two entries remove these items. In addition, when the only edits inside a move are row or list labels at its ends, do not list them separately and call it "Moved", not "Moved and edited".
- EXTRA x2 items 2 and 26: "Graphic or image changed" p.1 (old [56,420,500,312] → new [56,436,500,312]) and p.2 (old [56,64,500,156] → new [56,84,500,152]): The zebra shading flips on every row after the insertion. It is reported as two large graphic changes. [consequence -> verified consequence]
  evidence: PyMuPDF get_drawings: the fill (238,243,244) bands lie at the same page positions in both versions on p.1 (13 bands, 335.9–352.9 … 744.1–761.1). p.2 goes from 4 to 5 bands. The generator shades by row index (fill = i % 2 == 1), and the text rows after row 6 moved 17 pt down, so each row's shading flips. Renders at 150 dpi (r150/L-old.png, L-new.png) show the "Gr. L" row white in the old version and shaded in the new one. The truth description names "the zebra shading of every row after the insertion flips".
  cause: visual.ts compares each region of the old page with the place its neighbouring text moved to (README, How it works, step 6). Bands fixed to page positions under text that moved by one row pitch therefore look like changed fills. No rule recognises alternating row shading.
  fix: Recognise row striping: bands of one colour, one row pitch high, alternating. When the band rects are the same in page coordinates in both versions, or the phase flips with an odd number of rows inserted or deleted above, count it as one minor consequence (shown with Show) instead of listing it. Leave the words on such bands out of the "compared only in part" count.
- EXTRA x1 item 14: "Underlined: “L”" p.1 (old [218.7,594.4,4.7,9.5] → new [218.7,611.4,4.7,9.5]): A false underline on the size letter "L" of "Nitrilhandschuhe Gr. L, puderfrei". The word only moved from a white row onto a shaded one. [noise -> verified noise]
  evidence: 150 dpi crops (r150/L-old.png, L-new.png) show no underline in either version. PyMuPDF finds no line or rule under the word, only the zebra band 608–625 behind it in the new version. Instrumented scratch visual.ts (repo/src/core/visual.ts.debug-ul): for "L", addedLine() returns {line:'underline', rows:[929,929]}. At render scale 1.5 that is 619.3 pt, the glyph's baseline (PDF.js y 619.1), so the line found is the foot stroke of the L. rowEdge() and framed() keep it. The same calls return null for "Nitrilhandschuhe", "Gr" and "puderfrei" on that row, and the result for "L" is the same with few=true and few=false.
  cause: The visual.ts appearance check (the hit loop near line 2987, framed(rowEdge(addedLine(...)))) reads the horizontal foot stroke of a capital L, on the baseline, as a line added under the word when the word's background changes from paper to a band. Which threshold inside addedLine() lets it through: not traced.
  fix: When a word's background differs between the versions, normalise both boxes against their own background before the line test. For words of one or two characters, require an underline row to lie below the baseline, not on it, since glyphs such as L, E, Z, 1 and 2 have strokes there. Add a regression case: a striped table re-flowed by one row, with cells "Gr. L", "E" and "Z".

## holdout5-i-releve-chf

truth 8, found 7, extra 0

rerun: Yes. In the same scratch eval rerun (git-archive copy of HEAD 9ba0c7d, engine identical to f1053f3), the case's entry in rerun-items.json deep-equals its entry in results-holdout5-blind-items.json (7 items). Scores (7/7/0, separate 7), the misses (#4 not found) and the 'reported' list equal the recorded ones. The CLI `--json` run gives the same 7 changes (kinds, texts and pages compared by script).

counts: Misses: truth 8 − found 7 = 1 (#4, classified below). Extras: 0 = 7 items − 7 explained (truth 1→item 1, 2→2, 3→3, 5→4, 6→5, 7→6, 8→7, from probe.ts).

notices: There are no notices. ignored furniture, caseOnly, minorShifts, renumbered and repeatedLines are all 0, minor is [], coverage has no gaps, visualCompared=true and complete=true. As a coverage statement this is accurate: every page has text and was compared. But the move of 85.40 into the other column is neither listed nor counted, and complete=true gives no hint of it (README does not claim it; see the miss). The repeated column header "Date Texte Valeur Débit Crédit Solde" is classified as furniture on pages 2–3. It did not change, so nothing was hidden. Text order (PDF.js getTextContent): reading order, row by row and cell by cell, the same in both versions. The only jump is on p.1, where "Relevé de compte" (y 141.7) comes after the address block (y 178.0). The changed amount keeps its place in the order (p.3 item 63 "85.40", x 408.5 → 465.2). There is no re-inserted or appended text.

found items: #1 "5'000.00 → 2'000.00 (-60%)": fine. #2 "07.10.26 → 08.10.26" with no percentage: fine. #3 "octobre → novembre" with context "Caisse-maladie Exemple, prime": fine. #5 (item 4) "Number changed: 43.30- → 127.50": fromValue is null because the trailing minus is not parsed, which the README does not claim. So the item gives neither a percentage nor "sign changed", and the fact that matters, an overdraft turned into a credit balance, is left for the reviewer to read from "43.30-". #7 (item 6) "CHF 43.30 → CHF 127.50 (+194%)" is misleading: the closing balance went from −43.30 (en notre faveur, overdrawn) to +127.50 (en votre faveur), and the +194 % treats both as positive. The sign appears only in the separate item #6 "notre → votre". #8 "9.50 % → 8.75 % (-0.75 pp)": fine.

- MISS x1 truth #4 position "85.40" → "85.40" (p.3): The card refund's unchanged amount 85.40 moved from the Débit column to the Crédit column, about 57 pt to the right, which reverses the booking. No item, count or notice reports it. [out-of-scope-silent -> verified out-of-scope-silent]
  evidence: PDF.js p.3 item 63 "85.40": x 408.5 in the old version, 465.2 in the new, y 192.4 in both, same text order (scratch releve-b3.txt / releve-a3.txt). The render r150/releve-p3-sbs.png shows the amount under "Débit" in the old version and under "Crédit" in the new. In the engine line model, line L120 "31.10.26 Remboursement carte 31.10.26 85.40" has old rect x 45.4, w 382.7. The new line has the same left edge, and its right edge is 57 pt further right. The CLI JSON has 7 changes, none on this row, with minor [], minorShifts 0 and no notices. The scorer finds no item of kind 'position' at all. The truth note itself says: "The README claims sideways moves of unchanged lines; here only one cell of the line moves." The edit's consequences are listed (43.30- → 127.50, notre → votre, CHF 43.30 → 127.50), so a reviewer sees that the balance changed sign, but not which booking caused it.
  cause: compare.ts detectPositions() looks only at intact whole lines, and uses the edge that moved least (nearest(m, typical), meant to cope with font substitution). The left edge did not move (dl = 0), so rel = 0 ≤ 12 and the line is skipped. The token "85.40" is matched text, so the text diff says nothing, and the visual stage masks text. Out of scope: the README claims only "unchanged lines that moved sideways" (Features) and "intact lines for sideways moves" (How it works, step 6). It does not claim a single cell moving within an otherwise unchanged row, and a debit/credit column is not among the sign notations it lists (−500, (1,200), −€62.40). This is a borderline case: a reviewer of ledgers would expect it.
  fix: Engine: add a pass over the cells of intact lines (runs separated by a column gap). A cell that moved more than 12 pt while the line's other cells stayed is a position change; name the column headers above both places ("“85.40” moved from column Débit to column Crédit"). In a ledger with debit and credit columns, mark it as a sign change. README, until then: "Only whole lines are checked for sideways moves; a value that moved into another column of an unchanged row is not listed."

## holdout5-i-statement-gbp

truth 8, found 7, extra 1

rerun: Yes. In the same scratch eval rerun, the case's entry in rerun-items.json deep-equals its entry in results-holdout5-blind-items.json (8 items). Scores (7/7/1, separate 7), the misses (#3 not found) and the 'reported' list equal results-holdout5-blind.json. The CLI `--json` run gives the same 8 changes (kinds, texts and pages compared by script).

counts: Misses: truth 8 − found 7 = 1 (#3). Extras: 1 (item 3, DR→CR) = 8 items − 7 explained (truth 1→item 2, 2→1, 4→4, 5→5, 6→6, 7→7, 8→8, from probe.ts; item 3 is the only unassigned item).

notices: One notice: "3 differences in headers, footers or page numbers are ignored." It is accurate. The recorded furniture run holds the old footers "… Page 1 of 2" and "… Page 2 of 2" and the new ones "Page 1 of 3", "Page 2 of 3" and "Page 3 of 3": 2 changed page counts plus 1 footer on the added page. No truth item is a header or footer item. The page map new→old [1,2,2] is correct, since the whole summary block moved from old p.2 to new p.3. ignored.repeatedLines=0 is correct (the header row is on p.1–2 in both versions). complete=true and visualCompared=true. The PAY 88123 row that crossed from p.1 to p.2, past the repeated header row, was correctly given no item (crossedPageBreak, confirmed by instrumentation). Neither did the moved remittance slip and barcode. Text order (PDF.js getTextContent): reading order, the same in both versions, with two layout jumps. The aged-balance grid is drawn column by column ("Current" y 506.5, "£1,496.34" y 524.6, "1 month" y 506.5 …; on new p.3 y 72.6 / 90.6). The barcode digits "00041731102026" (y 674.2 old, 240.2 new) come after the slip's last line (y 711.5 / 277.5). There is no re-inserted or appended text.

found items: #1 "Number changed: 30/09/2026 → 15/10/2026" with context "Sandpaper rolls": fine. #2 "Added 12 words": generic, but its text is exactly the new row "12/09/2026 INV 40871 … 1,820.40 DR". #4 "damaged → wrong size": fine. #5–#7 aged-balance figures (-20%, +98%, +22%), p.2 → p.3: fine. #8 "Graphic or image changed" p.2 → p.3: the rect covers only the grown part of the bar (x 340–392). Computed from the generator's figures (bar fill 214.4 → 261.8 of 311.8 pt, from x 127.6), the grown part is 342.0–389.4. The description does not say that the bar got longer, but the place is right. The uncredited DR→CR item is listed as a text change, not under Numbers, and does not say "sign changed".

- MISS x1 truth #3 number "150.00 DR" → "150.00 CR" (p.2): Payment PAY 88213 was corrected from debit to credit. The engine reports it correctly as Changed “DR” → “CR” with 150.00 in the context, but the truth's type 'number' blocks the credit. [scorer-or-truth -> verified scorer-or-truth]
  evidence: Item 3: replace "DR" → "CR" p.2, old rect p2 [540,301,10,8], new [540,315,10,8]. Shown excerpt: before "BACS payment - thank you 150.00", after "21/10/2026 INV 40652 Delivery 7652 -". Scratch probe.ts (score.ts functions on the recorded items): typeOk=false, textMatch(context)=true, regionOk=true. The truth note says: "A report as a word change DR -> CR is equally correct." The README does not list DR/CR among the sign notations.
  cause: eval/score.ts typeOk(): case 'number' returns !!c.numeric. The engine (numbers.ts) does not read the DR/CR suffix as part of the amount, so the change is a word replace, and a 'number' truth cannot be met by it.
  fix: Truth: type "replace" with the same snippets, as the note itself allows. Or scorer: let a 'number' truth whose old and new texts differ only in a non-numeric sign word next to an unchanged figure be met by a replace of that word, with the figure in the shown context. Engine (optional): in ledgers, read a trailing DR/CR, and a trailing minus, as the amount's sign, so the item reads "Number changed: 150.00 DR → 150.00 CR (sign changed)" and appears under Numbers.
- EXTRA x1 item 3: "Changed “DR” → “CR”" p.2: This is the engine's correct report of truth #3. It counts as extra only because no truth item can explain it. [scorer-or-truth -> verified scorer-or-truth]
  evidence: The same item as miss #3: right place, right text in context. probe.ts lists it as the only unassigned item.
  cause: eval/score.ts typeOk() for type 'number' (see miss #3).
  fix: Same as miss #3.

## verifier checks
- holdout5-i-rechnung-eur | EXTRA x26: items 3–11, 15–23, 28–35 "Number changed: n → n+1 (+x%)" | consequence -> agree=True -> consequence | Checked: - My CLI JSON (cli-rechnung.json): every one of these items is old n → new n+1 at x 72.8/77.5, with dy +17 pt (one row pitch). contextAfter is the same row's unchanged Art.-Nr. and text, e.g. item 3 "8→9" sits before "31-0920 Mehrkanalpipette" and item 35 "35→36" before "RS-0412". - A pdftotext -layout diff shows every row after the insert with an unchanged body and its label +1. - The generator writes the labels as cells = [str(i + 1)] + r. - The truth description names "positions 7-35 renumber to 8-36" as a consequence that is not listed. - ignored.renumbered = 0 and there is no notice. - PyMuPDF spans: the label '7' ends at x 82.2 and '31-0458' starts at 87.9. That is a gap of 5.7 pt at 8.5 pt type. - compare.ts labelAt() needs blockStart && gap >= t.size for a 'cell' label, and rowNumberAt() returns null when gap < t.size, so no label sequence forms. - The engine line model (repo/vtools/lines.ts) puts each row in its own block (blk 33, 34, …), so the gap is what fails. That last step is an inference from the code; I did not instrument it. - The 29 renumberings add up: 1 (7→8, inside the insert's text) + 18 + 2 (the move's edits) + 8. - README "Renumbering": "hidden as automatic renumbering only when numbered items at the same level were added … above it". Here a row was added above, so this is a consequence the engine should fold.  The percentages on row numbers are a further defect in the descriptions, which the analyst also notes.
- holdout5-i-rechnung-eur | EXTRA item 24 "Moved and edited “63-1100 Laborthermometer -10 … …”" p.1 → p.2 | consequence -> agree=True -> consequence | Checked: - pdftotext per page: "26 63-1100 Laborthermometer" is the last row of old p.1, and "27 63-1100 Laborthermometer" the first row of new p.2. In both versions it sits under "Muster Laborbedarf GmbH · Rechnung RE-2026-1187 vom 04.11.2026" and the table header row. - The truth description names this move. - Engine line model: on p.2, L49 (the running header) and L50 (the header row) have furn=0. The generator prints the running header only when page_no() > 1, so it is not on p.1. - The recorded item has moveEdits 2. - PDF.js order (difflib on getTextContent): old [26 63-1100 … 58,80] is deleted, the new row is inserted after the equal "27", so the hunks are one label off.  Reading compare.ts crossedPageBreak(), the move fails because the first keys "26" and "63-1100" differ and renumbered() relies on labelAt/rowNumberAt, and because repeatedEarlier() fails on L49. This is consistent with the analyst, but I did not instrument it.
- holdout5-i-rechnung-eur | EXTRA items 25 "Deleted “26”" and 27 "Added “28”" p.1 → p.2 | consequence -> agree=True -> consequence | Checked: - Recorded rects: item 25 old "26" at p1 [72.8, 747.5] is the Laborthermometer's old label. Item 27 new "28" at p2 [72.8, 87], with contextAfter "65-0300 Exsikkator", is the Exsikkator's new label (pdftotext, new p.2 second row: "28 65-0300 Exsikkator"). - The old "27" (Exsikkator) is matched with the new "27" (Laborthermometer), so the renumberings 26→27 and 27→28 come out as a delete and an insert inside the move. - Both are automatic renumbering, which the truth description names.
- holdout5-i-rechnung-eur | EXTRA items 2 and 26 "Graphic or image changed" p.1 [56,420→436,500,312] and p.2 [56,64→84,500,156/152] | consequence -> agree=True -> consequence | Checked: - PyMuPDF get_drawings with fill (238,243,244): p.1 has 13 bands at identical page positions in both versions (335.9–352.9 … 744.1–761.1). p.2 has 4 bands in the old version and 5 in the new (the extra one at 219.7–236.7). - The generator sets fill = i % 2 == 1 per row index. - 80 dpi renders of p.2 (r/re2-old-2.png, r/re2-new-2.png) show that every row's shading flipped relative to its content. - The truth description names "the zebra shading of every row after the insertion flips".  On p.1 the band layer is the same in page coordinates. The item exists because the visual stage compares each region with where its text moved (README, How it works, step 6). It is a derivative change the engine should fold, not a real edit.
- holdout5-i-rechnung-eur | EXTRA item 14 "Underlined: “L”" p.1 (old [218.7,594.4] → new [218.7,611.4]) | noise -> agree=True -> noise | Checked: - 300 dpi crops (r/L-old-1.png, r/L-new-1.png): "Gr. L, puderfrei" has no underline or other line in either version. The row is white in the old version and shaded in the new one. - PyMuPDF drawings within 210–230 × the word box: only fill bands (old: neighbouring bands at 574–591 and 608–625; new: the band 608–625 behind the word), no stroke or line. - The recorded format is {appearanceChanged, decoration: underline added}.  Not traced: I did not re-trace the cause in visual.ts addedLine() (the analyst's foot-stroke explanation).
- holdout5-i-releve-chf | MISS truth #4 position "85.40" → "85.40" p.3 | out-of-scope-silent -> agree=True -> out-of-scope-silent | Checked: - pdftotext diff: only the refund row's amount moved columns. PyMuPDF puts '85.40' at x 408.5 in the old version and 465.2 in the new, at the same y (185.3). The headers are Débit at 409.3–428.0 and Crédit at 463.1–484.7. - Render r/rel3-after-3.png shows the amount under Crédit. - Arithmetic: 47.10 − 85.40 − 5.00 = −43.30 and 47.10 + 85.40 − 5.00 = 127.50. The statement has no column totals that would also change. - Engine line model: L120 "31.10.26 Remboursement carte 31.10.26 85.40" is intact, with old x 45.4, w 382.7 and new x 45.4, w 439.4. - detectPositions() takes the edge that moved least (nearest(); dl = 0), so the line is skipped. - CLI JSON: 7 changes, none on this row. notices [], minor [] and minorShifts 0, with complete=true.  README: - It claims only "unchanged lines that moved sideways" (Features) and "intact lines for sideways moves" (How it works, step 6). - The Numbers row lists the sign notations −500, (1,200) and −€62.40, not debit/credit columns. - No Scope sentence mentions a cell moving inside a line.  So it is not claimed and not disclosed. It is borderline: the README does not say "whole lines only", and the brief defines type position as "unchanged text moved sideways". I agree with the analyst's proposed README sentence.
- holdout5-i-statement-gbp | MISS truth #3 number "150.00 DR" → "150.00 CR" p.2 | scorer-or-truth -> agree=True -> scorer-or-truth | Checked: - CLI item c3 is "Changed “DR” → “CR”" on p.2, old rect y 301.4 and new y 315.3. pdftotext shows this is the 20/10/2026 PAY 88213 row, followed by 21/10/2026 INV 40652. - Its shown excerpt is before "BACS payment - thank you 150.00", after "21/10/2026 INV 40652 Delivery 7652 -". The other BACS rows have different amounts, so the reviewer can tell which row it is. - My probe with the score.ts functions gives typeOk = false (case 'number' returns !!c.numeric, and the item's numeric is null), textMatch(context) = true, textMatch(strict) = false and regionOk = true. - The truth note says: "A report as a word change DR -> CR is equally correct."  Only the truth's type blocks the credit.
- holdout5-i-statement-gbp | EXTRA item 3 "Changed “DR” → “CR”" p.2 | scorer-or-truth -> agree=True -> scorer-or-truth | This is the same item as miss #3. In my probe it is the only unassigned item: truth items 1, 2, 4, 5, 6, 7 and 8 take items 2, 1, 4, 5, 6, 7 and 8. It is correct and adequate, and it counts as extra only because of typeOk('number').

verifier, anything the analyst missed: None of these changes a category or a count:

1. **Misquote.** The analyst quotes releve item 6 as "CHF 43.30 → CHF 127.50 (+194%)". The engine's actual description is "Number changed: 43.30 → 127.50 (+194%)", with the texts "43.30" and "127.50". The point that +194 % across a sign change only the wording expresses is misleading still stands.

2. **PDF.js index.** The analyst gives the PDF.js index of "85.40" as item 63. I get index 32 when I count non-empty items only. It is the same index in both versions, so the claim that the text order is the same holds either way.

3. **No other unlisted edits.**
   - My pdftotext diffs and PDF.js order diffs show only the listed edits plus the consequences the descriptions name. The checker notes (holdout5-checker-notes-i.md, items 3–4) say the same, including identical barcodes.
   - The statement's slip barcode digits (00041731102026) are unchanged.
   - The relevé has no Débit/Crédit totals that would change.
   - In the statement, the Amount column looks shifted in pdftotext -layout, but PyMuPDF positions are identical; it is only pdftotext spacing.

4. **Weak descriptions on credited items** that the analyst accepts or mentions:
   - rechnung #4 "-150,00 → -185,00 (+23%)" is a percentage of the magnitude, while the line amount fell by 35. It is arguable, but both signed values are shown.
   - rechnung #1's highlighted insert takes the next row's label "8" and leaves out its own "7".
   - Both are noted only as quality issues.

5. **The fourth "compared only in part" word.** coverage.partlyCompared for p.2 has count 4 but lists 3 example words (1, St, 96,40). I did not identify the fourth word. That it is the second 96,40 in the same Exsikkator row is an inference. The README sentence the analyst cites ("The count can also include words that are fine, for example in a striped table re-flowed by an inserted row") is in Scope and limitations, which has not changed since f1053f3.

6. **HEAD.** The task names cfa9bc5, but the repo HEAD is now 9ba0c7d, which only adds docs. As the analyst says, src/ and score.ts are unchanged since f1053f3.

7. **Not re-traced by me:** the analyst's instrumented internals, i.e. the crossedPageBreak debug values and the visual.ts addedLine rows [929,929]. My conclusions there rest on reading the code and on the renders.

The scratch evidence is in /tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/blind5/analysis/fpdf2-statements-verify/, in the files cli-*.json, rerun*.json/txt, head/eval/vprobe.ts, repo/vtools/lines.ts, py/*.py, pjs/*.tsv, txt/*.txt and r/*.png.

# group pymupdf-annot-overlay-pages

RECONCILE: I agree with all 25 analyst entries. Every category holds after re-checking, and the counts add up in each case.

Rerun: I made a git archive of cfa9bc5 into my scratch repo/. HEAD is now 9ba0c7d, but that commit is docs only, and `git diff --stat f1053f3 HEAD -- src` is empty. There I ran `node eval/run.ts --cases <3 ids> --blind --verbose --json rerun.json --items rerun-items.json`. Each case entry in rerun-items.json deep-equals the one in eval/results-holdout5-blind-items.json. The scores and miss lines in rerun.txt equal results-holdout5-blind.txt:
- audit 4 / 4 / 5 (4)
- datasheet 1 / 1 / 5 (1)
- handbook 4 / 4 / 3 (3)

The CLI runs (cli-*.txt/json) give the same 9, 6 and 6 changes and the same notices.

Per case:
- **audit-annotations.** Misses: truth 8 − found 4 = 4 (#1, #4, #6, #7). Extras: 9 items − 4 explained = 5 (c2, c3, c6, c7, c8). My scorer probe repo/scratch/scorecheck.ts gives these matches: c1→#2, c4→#3, c5→#5, c9→#8.
- **datasheet-overlay.** Misses: truth 8 − 1 = 7 (#1, #2, #3, #4, #6, #7, #8). Extras: 6 − 1 = 5 (c1, c2, c3, c5, c6). The only match is c4→#5.
- **handbook-pages.** Misses: truth 7 − 4 = 3 (#1, #6, #7). #4 is found but 'not a separate item' (count 0). Extras: 6 − 3 = 3 (c2, c3, c4). Matches: c1→#2, c5→#3 (it also covers #4), c6→#5.

Group totals: 14 misses (11 engine-description, 2 scorer-or-truth, 1 missed) and 13 extras, all engine-description. These match the analyst.

## holdout5-j-audit-annotations

truth 8, found 4, extra 5

rerun: Yes. I made a fresh git archive of HEAD in scratch (repo/). Its src/ is identical to the frozen engine f1053f3: `git diff --stat f1053f3 HEAD -- src` prints nothing. I ran `node eval/run.ts --cases <3 ids> --blind --verbose --json rerun.json --items rerun-items.json` there. The rerun-items.json entry deep-equals the recorded results-holdout5-blind-items.json entry, and the changelens scores (except ms), misses and reported lists equal results-holdout5-blind.json. The CLI JSON (cli-audit-annotations.json) gives the same 9 changes c1–c9. Both runs were made before I instrumented the scratch copy.

counts: Misses: truth 8 - found 4 = 4 (#1, #4, #6, #7), classified 1 + 1 + 1 + 1 = 4. Extras: 9 items - 4 explained (c1 -> #2 stamp, c4 -> #3 highlight, c5 -> #5 free text, c9 -> #8 ink) = 5, classified c2+c3 (2) + c6 (1) + c7+c8 (2) = 5.

notices: No notices. ignored: all 0. complete=true, visualCompared=true, no coverage gaps. What it says is accurate: no header or footer changed and every page has text. But nothing tells the reviewer that the new file carries six markup annotations (Stamp, Highlight, StrikeOut, FreeText on p.1; Underline, Ink on p.2; see PyMuPDF annots() and PDF.js getAnnotations()), or that annotation text is not compared as text: the stamp's 'FOR COMMENT' and the free-text note are missing from PDF.js getTextContent. The README says nothing about annotations. The green underline (#6) is missed without any count or notice.

found items: c1 (#2, stamp) 'Graphic or image added p. 1': right place, but the stamp text 'FOR COMMENT' is not named. c4 (#3) is a saturated yellow (#ffff00) highlight, listed as 'Text colour or weight changed' on 'Calibration records for two torque wrenches were missing'. The glyph colour did not change. The README documents this naming only for a 'pale highlight drawn close around a word'. c5 (#5, FreeText note) 'Graphic or image added': the note's words ('Reviewer: grade F1 as major? The records were missing for three weeks.') appear only in the crop, never as text. c9 (#8, ink initials) 'Graphic or image changed p. 2': acceptable; the scribble overlaps the 'Reviewed by' rule, which is why it reads as changed.

- MISS x1 truth #1 number "87" -> "82" (p.1): The score edit is listed as two unrelated items: 'Deleted "87"' in the table and 'Added "82"' placed at the end of page 1. Neither is a number change. [engine-description -> verified engine-description]
  evidence: Recorded c2: delete '87', p.1, rect [168.8,169.9,11.1,11.2], context '…Overall score' / '/ 100'. Recorded c3: insert '82', p.1, the same rect [168.8,169.9,11.1,11.2], but context 'The finding is considered minor.' / '3 Corrective actions', with the old-side caret on the 1/2 page boundary. Both have numeric=false. My scorer probe (repo/scratch/scorecheck.ts) shows typeOk('number') false for every item. PDF.js getTextContent order, after p.1: '82' is item 70 (font g_d0_f3, Helvetica), after the footer items 66–68 ('Page 1 of 2'). In before p.1, '87' sits in the table between 'Overall score' and '/ 100'. The render (png/pjs-audit-after-1.png) shows '82 / 100' in place.
  cause: PyMuPDF redacts the old run and appends the new one at the end of the page's content stream. src/core/tokenize.ts groupLines()/buildDocModel() keep stream order, with no geometric re-sorting. So '82' becomes its own line after the last body line of p.1, and the document-level diff in compare.ts gives a deletion in the table plus an insertion at the page end. compare.ts inPlaceTokens() joins tokens at the same place but at another stream point only when they have the same key, so the different texts '87' and '82' at one box are never made one replace. README (general limit): 'Reading order comes from the PDF content stream… Producers that write text out of order can produce noisy diffs.'
  fix: Engine: before line grouping, re-insert runs that are out of order. A run that follows the page's last line or footer in the stream, but whose baseline lies on an existing line, is merged into that line at its x. Or, in compare.ts inPlaceTokens(), pair a deleted and an inserted token group whose boxes overlap on paired pages (same baseline within 2 pt, x overlap of 50 % or more) as one replace, numeric when both sides are numbers ('87 -> 82, -5.7 %'). Scorer: none needed.
- EXTRA x2 items 1, 2 (c2 'Deleted "87"' p.1, c3 'Added "82"' p.1): The two halves of truth #1, left over because no number change was formed. [engine-description -> verified engine-description]
  evidence: Same as the #1 miss. Both rects are [168.8,169.9,11.1,11.2]. c3's excerpt reads 'The finding is considered minor. 82 3 Corrective actions', which is not where 82 stands.
  cause: Stream order of re-typed text (tokenize.ts groupLines). compare.ts inPlaceTokens() requires the same key.
  fix: As for truth #1: position-based re-insertion, or pairing at the same place as one numeric replace.
- MISS x1 truth #7 replace "October 2027" -> "April" (p.2): The month edit is listed as 'Deleted "October"' in the sentence and 'Added "April"' placed after 'Date' at the document end. [engine-description -> verified engine-description]
  evidence: Recorded c7: delete 'October', p.2, [298.1,175.1,37.3,11.7], context 'next routine audit is due in' / '2027.'. Recorded c8: insert 'April', p.2, [314.5,175.1,21,11.7], right-aligned where 'October' ended, context 'Date' / '' (end of document). PDF.js after p.2: 'April' is item 40 (g_d0_f4, Liberation Sans embedded again), after the footer item 38. In the scorer, a replace truth matches an insert or delete only through partReplaced(), and oneInsertion('October 2027','April') is false. A replace 'October' -> 'April' with c7's context would match under the context rule: 'next routine audit is due in October 2027.' covers the snippet.
  cause: Same as #1: the appended run is out of stream order (tokenize.ts), and inPlaceTokens() pairs only identical keys. The boxes overlap from x 314.5 to 335.4.
  fix: Same as #1. Merging the run into the line 'findings F1 and F3 … due in … 2027.' would give 'October -> April' in place. The 16-pt gap before 'April' could then also show as a position note.
- EXTRA x2 items 6, 7 (c7 'Deleted "October"' p.2, c8 'Added "April"' p.2): The two halves of truth #7. [engine-description -> verified engine-description]
  evidence: See the #7 miss. c8's excerpt 'Date April' places the word under the date line, while its rect is in the sentence.
  cause: Stream order of re-typed text (tokenize.ts). Same-key rule in inPlaceTokens().
  fix: As for truth #1.
- MISS x1 truth #4 format strike-out 'The finding is considered minor.' (p.1): The red strike-out is listed in the right place, but as 'Text colour or weight changed', not 'Struck through'. The scorer also rejects it over the snippet's final period. [engine-description -> verified engine-description]
  evidence: Recorded c6: graphic, label Format, 'Text colour or weight changed' on 'The finding is considered minor', p.1, rects [361,455.1,69.1,11.7] and [58.8,470.1,80.5,11.7], which overlap truth newRect [58.1,454.4,372.8,28.2]. The StrikeOut appearance stream is '1 0 0 RG .7330322 w' (red, 0.73 pt). The render crop png/crop-audit-a1-strike.png shows the strike. I instrumented lineIn in a scratch copy (dbg-audit-strike.txt). On 'The', 'finding', 'is', 'considered' and 'minor', the share of dark columns across is 0.87–1.00 (passes 0.85), but the darkness added is 0.30–0.38, below the required 0.45. So no line is found, and the colour test fires (ink chroma 0,0,0 -> about 29,-12,-12). Probe: I drew the same four red lines as page content on before.pdf (probe/audit-lines-as-content.pdf). The engine then gives 'Struck through: "The finding is"', but 'considered minor' is still 'Text colour or weight changed'. Detection is borderline at 0.73 pt. README claims: 'Strikes in black, navy, pure blue, dark grey, red or the text's own colour are found'. Scorer: textMatch fails only on the trailing '.', because appearanceChanges() skips punct tokens and visual items carry no context. In my probe, the same truth without the period gives changeLensMatch true against c6.
  cause: src/core/visual.ts lineIn(), line(k): the gain in luminance darkness over 3 rows must be 0.45 or more (or pass the still/filled path; I did not instrument filled(), but it evidently failed). A 0.73-pt red line is about 1.1 px at 1.5 px/pt. Red has luminance 76 (darkness 0.70), and in the glyph columns the line adds nothing, so it averages 0.30–0.38 across a word. appearanceChanges() then reports the hue shift as a colour change. Also eval/score.ts textMatch: a format snippet with punctuation can never match a visual item.
  fix: Engine: measure a line's gain as a colour distance from the background (for example the maximum channel deviation, or ΔE), not luminance alone, or in units of the line's own ink. Also read markup annotations (getAnnotations: subtype StrikeOut/Underline/Highlight, quadPoints) and list them directly, for example 'Struck through (annotation)'. Scorer: for format truths matched against a visual appearance item, compare with punctuation stripped, or give visual items context.
- EXTRA x1 item 5 (c6 Format 'Text colour or weight changed' 'The finding is considered minor' p.1): The strike-out item of truth #4 itself, uncredited and misnamed. [engine-description -> verified engine-description]
  evidence: Same item as the #4 miss: right rects, wrong kind of formatting, and it counts as extra only because #4 did not take it.
  cause: Luminance thresholds in lineIn(). Trailing period in the truth snippet.
  fix: As for truth #4.
- MISS x1 truth #6 format underline 'within 30 days of receiving this report' (p.2): The pure-green underline annotation over two lines is not listed at all, and no notice or count mentions it. [missed -> verified missed]
  evidence: p.2 has only c7, c8 and c9 (y 175 and 228). Nothing lies in y 76–105. The Underline appearance stream is '0 1 0 RG .7330322 w' (#00ff00, 0.73 pt). The PDF.js render crop png/crop-audit-a2-underline.png shows the green underline under 'within 30 days of receiving' and 'this report'. Instrumented lineIn (dbg-audit-underline.txt): on 'within', '30', 'days', 'of', 'receiving', 'this' and 'report', the darkness added is 0.32–0.41 (needs 0.45) and the share across is 0.11–0.65 (needs 0.85). The colour test sees a chroma change of about 16 (needs over 30), so there is no hit and no count of words compared only in part. Probe: the same green lines drawn as page content (probe/audit-lines-as-content.pdf) are missed too, so the miss does not depend on the annotation mechanism. README: 'underlines in all of these colours are found' (black, navy, pure blue, dark grey, red, grey, mid-blue #2050c0, green #008000). #00ff00 (luminance 150) is not covered, and no limit names it. The README is silent on annotations in general; PDF.js draws this one, and the engine found the four other annotations.
  cause: src/core/visual.ts lineIn() tests darkness from luminance() (0.299R+0.587G+0.114B). At full coverage, pure green has darkness 0.41, so a line of 1.1 px gives column sums below 0.6 and a gain below 0.45, and it is never a line. appearanceChanges() needs a chroma change over 30, and here it is about 16. I did not trace why the graphics comparison did not list it as a graphic; it is probably inside the text mask under the glyph boxes (inference).
  fix: Engine: measure line darkness as colour distance from paper, so that #00ff00 counts as a full line, or read Underline annotations from getAnnotations. At least count a line-shaped gain below threshold under a word in the 'compared only in part' notice instead of dropping it silently. README: name coloured hairlines of high luminance if the threshold stays.

## holdout5-j-datasheet-overlay

truth 8, found 1, extra 5

rerun: Yes. The eval/run.ts rerun on the HEAD archive (src identical to f1053f3) gives an items entry that deep-equals the recorded results-holdout5-blind-items.json entry, and the scores, misses and reported list equal results-holdout5-blind.json. The CLI JSON (cli-datasheet-overlay.json) gives the same 6 changes c1–c6 and the notice '4 differences in headers, footers or page numbers are ignored.'

counts: Misses: truth 8 - found 1 = 7: #1 and #2 (scorer-or-truth, one entry of 2) + #3, #4, #6, #7, #8 (engine-description, 5) = 7. Extras: 6 items - 1 explained (c4 -> #5 bar) = 5: c1 (1) + c2 (1) + c3 (1) + c5 (1) + c6 (1) = 5.

notices: One notice: '4 differences in headers, footers or page numbers are ignored.' (ignored.furniture=4). The count matches the recorded furniture runs: on each page, the header line lost 'Rev. B', and the re-typed 'Rev. C' at the end of the stream is a furniture line of its own, so 2 edits show as 4 differences. With --include-furniture (the Show view; run with --no-visual) the edits appear correctly: 'Changed "B" -> "C"' on p.1 and p.2, plus a true font change '"Rev." font Inter-Regular -> Helvetica'. The body list also changes completely in that run: 'Moved a paragraph p. 1' for Document no., '"3 Electrical connection" font Inter-Bold -> Times-Bold p. 2', 'Deleted "−20"' + 'Added "-10"', and 'Added a paragraph' / 'Deleted a paragraph' p.2. So ignoring headers and footers is what produces the misleading cross-page pairing in the default run. No notice for the removed /Link back-link (invisible, rightly not listed).

found items: c4 (#5) 'Graphic or image changed p. 1' covers the lengthened DN100 bar (old [284,460,56,12], new [284,460,56,16]). It is accurate in place but generic; with no value labels on the chart, nothing more could be said.

- MISS x2 truth #1 and #2 furniture "Rev. B" -> "Rev. C" (p.1 and p.2): Both header edits are disclosed by the header/footer count, and the Show view lists 'B -> C' on each page. The scorer's disclosure rule misses them because the re-typed 'Rev. C' forms its own furniture line. [scorer-or-truth -> verified scorer-or-truth]
  evidence: Notice: '4 differences in headers, footers or page numbers are ignored.' The --include-furniture run (cli-ds-furn.txt) lists 'Changed "B" -> "C" p. 1' and 'p. 2'. Recorded furniture runs:
  - run 1: old [[1,'…Datasheet · Rev. B Synthetic sample…']], new [[1,'…Datasheet · Synthetic sample…']];
  - run 2: old [[2,'…Rev. B…']], new [[1,'Rev. C'],[2,'…Datasheet · Synthetic sample…']];
  - run 3: new [[2,'Rev. C']].
  furnitureLinesDisclosed() gives false for #1 and #2; with the three runs merged into one it gives true for both (repo/scratch/scorecheck.ts). PDF.js after p.1: 'Rev. C' is item 86 (Helvetica), after the footer '1 / 2' (item 84). After p.2 it is item 63, after '2 / 2' (item 61). The recorded disclosed flags (rule registered for round 4) are false: the hunk there is 'B' -> 'C', which does not hold 'Rev. B' strictly.
  cause: eval/score.ts furnitureLinesDisclosed() needs the old line and the new line in the same run of differing lines (furnitureRuns(), a line diff over the furniture lines of the whole document). The appended 'Rev. C' run is a line of its own (tokenize.ts keeps stream order). So the line diff groups p.1's 'Rev. C' with p.2's header, and puts p.2's 'Rev. C' in a run of its own.
  fix: Scorer: decide per page. An old furniture line on the expected old page that holds the old text and differs, plus any differing new furniture line on the expected new page that holds the new text, counts as disclosed, without requiring one run. Engine: merge an out-of-order run into the line whose baseline it shares (the header), so the notice counts 2 and Show reads 'Rev. B -> Rev. C'.
- MISS x1 truth #3 position 'Document no. DS-UFM80-004' (p.1, left -> right margin): The line that moved sideways is listed as 'Deleted' at its old place. Its new copy sits inside a false cross-page replace of the p.2 heading. [engine-description -> verified engine-description]
  evidence: c1: 'Deleted "Document no. DS-UFM80-004"' p.1, old rect [62.4,98,138.5,11.5]. The new copy at [394.4,98,138.4,11.5] is the first part of c2: 'Changed "3 Electrical connection" -> "Document no. DS-UFM80-004 -10"', p. 2 -> p. 1. PDF.js after p.1: 'Document no. …' is item 88 (g_d0_f4, Inter embedded again), after the footer and 'Rev. C'. In before p.1 it is item 6, right after the title. With --include-furniture the engine reports 'Moved a paragraph p. 1'. The scorer needs type position, which c1 and c2 are not.
  cause: The re-typed text is appended to the stream (tokenize.ts groupLines keeps stream order). With headers and footers excluded, nothing separates p.1's appended tail ('Document no. … -10') from p.2's first body text ('3 Electrical connection'), so the diff pairs them as one replace across the page break. I infer this from the default and --include-furniture runs. compare.ts detectMoves() pairs a short whole-line deletion only with a short whole-line pure insertion (d.short && ins.short), so c1 is not matched with the new side of c2. README general limit: 'Producers that write text out of order can produce noisy diffs.'
  fix: Engine: re-insert appended runs by position. A run with no line at its baseline goes between the lines above and below it by y; here it is then matched and reported as a sideways shift. Do not form a replace whose two sides lie on different pages with no shared words; split it into a delete and an insert so that move detection sees them. Keep furniture tokens as separators at page boundaries even when they are not compared.
- MISS x1 truth #4 number "−20" -> "-10" (p.1): The temperature edit is a 'Deleted "−20"' plus '-10' buried at the end of the false cross-page replace c2. There is no number change and no sign check. [engine-description -> verified engine-description]
  evidence: c3: 'Deleted "−20"', p.1, [215.8,273.5,16.7,11.5]. '-10' is the tail of c2's new text, rect [215.8,274.1,13.7,10.6], the same place. PDF.js after p.1: '-10' is item 90, the last item (Helvetica). '°C to +60 °C (transmitter)' (item 36) starts at x 236.2, after the gap left by the redaction. The --include-furniture run still splits it: 'Deleted "−20"' + 'Added "-10"'.
  cause: Stream order of re-typed text (tokenize.ts). compare.ts inPlaceTokens() pairs only equal keys, so '−20' and '-10' at the same box stay apart. Without furniture separators, the insert is also absorbed into c2.
  fix: Same-place pairing of a deleted and an inserted number into a numeric replace: '−20 -> -10', both negative, with the U+2212 and ASCII minus told as the same sign. Position-based re-insertion of the appended run.
- MISS x1 truth #6 format '3 Electrical connection' Inter Bold -> Times-Bold (p.2): The font substitution is never named. The old heading is the old side of the false replace c2, and the new heading is listed as added text. [engine-description -> verified engine-description]
  evidence: c2: old '3 Electrical connection' (p.2, [62.4,70.9,128.7,13.9]) is said to become 'Document no. DS-UFM80-004 -10' on p.1, which is false. c5: 'Added "3 Electrical connection"' p.2, [62.4,72.9,111.8,11.5], context '· Checked by: application engineering' / 'Note: transmitter firmware 2.4 or', i.e. at the end of p.2. PDF.js after p.2: item 65 (g_d0_f5, serif), after the footer and 'Rev. C'. With --include-furniture the engine reports '"3 Electrical connection" font Inter-Bold -> Times-Bold p. 2', the truth edit.
  cause: Stream order, with furniture tokens excluded (see #3). compare.ts inPlaceTokens() needs every box within 2 pt. Times-Bold is narrower, so 'Electrical' and 'connection' shift left by several points and the heading cannot be matched in place.
  fix: Position-based re-insertion. In inPlaceTokens, accept a whole line re-typed at the same baseline and start x with the same words, even when later boxes drift with the font width, so detectFormatting sees the font change.
- MISS x1 truth #7 delete footnote 'Use shielded twisted-pair cable and connect the shield' (p.2): The footnote deletion at the page foot and the unrelated new note in mid-page are merged into one 'Rewrote 16 words'. [engine-description -> verified engine-description]
  evidence: c6: replace, 'Rewrote 16 words' p.2. Old '1Use shielded … end only' at [70.4,766,314.6,9.8] (the page foot). New 'Note: transmitter firmware 2.4 … 0.01 m/s' at y 239.4, 527 pt higher. Scorer: '-XR' (text and region match, type replace is not delete). The --include-furniture run lists them correctly as 'Deleted a paragraph p. 2' and 'Added a paragraph p. 2'. PDF.js: before p.2 has the footnote as items 61–62, just before the footer (items 63–66). After p.2 has the htmlbox note as items 66–68, after the footer (items 58–61), 'Rev. C' and the re-typed heading.
  cause: Both are the last body text of p.2 in stream order. With the footer excluded, the diff sees one gap and textChange() makes one replace of two unrelated passages.
  fix: Do not pair the two sides of a rewrite when they share no words and their boxes lie far apart on the page; list a delete and an insert instead. Position-based re-insertion would put the note between the list and section 5.
- MISS x1 truth #8 insert '2.4 or later is required for the low' (p.2): The note added with insert_htmlbox is only the new side of the 'Rewrote 16 words' replace c6. [engine-description -> verified engine-description]
  evidence: Same as #7. The text and place of c6's new side are right, but the kind (replace) makes it look like a rewrite of the footnote. typeOk(insert) is false for c6.
  cause: As for #7: stream order (the htmlbox content is appended to the stream) plus furniture exclusion.
  fix: As for #7.
- EXTRA x1 item 0 (c1 'Deleted "Document no. DS-UFM80-004"' p.1): The old side of the moved line (#3), listed as a deletion. [engine-description -> verified engine-description]
  evidence: See the #3 miss.
  cause: Stream order. detectMoves() does not pair it with c2's new side.
  fix: As for #3.
- EXTRA x1 item 1 (c2 'Changed "3 Electrical connection" -> "Document no. DS-UFM80-004 -10"' p.2 -> p.1): A false cross-page replace that joins pieces of #3, #4 and #6. [engine-description -> verified engine-description]
  evidence: Old side: the p.2 heading. New side: the appended p.1 tail. Not in the --include-furniture run. See #3, #4 and #6.
  cause: Appended runs plus page-boundary furniture removed from the diff stream.
  fix: As for #3.
- EXTRA x1 item 2 (c3 'Deleted "−20"' p.1): The old half of the temperature edit (#4). [engine-description -> verified engine-description]
  evidence: See the #4 miss.
  cause: Stream order. Same-key rule in inPlaceTokens().
  fix: As for #4.
- EXTRA x1 item 4 (c5 'Added "3 Electrical connection"' p.2): The re-typed heading of #6, listed as added text at the end of p.2. [engine-description -> verified engine-description]
  evidence: See the #6 miss.
  cause: Stream order. inPlaceTokens() 2-pt box test fails with the narrower font.
  fix: As for #6.
- EXTRA x1 item 5 (c6 'Rewrote 16 words' p.2): The merged footnote deletion (#7) and note insertion (#8). [engine-description -> verified engine-description]
  evidence: See the #7 miss.
  cause: Both are last in p.2's body stream once the footer is excluded.
  fix: As for #7.

## holdout5-j-handbook-pages

truth 7, found 4, extra 3

rerun: Yes. The eval/run.ts rerun on the HEAD archive gives an items entry that deep-equals the recorded entry, and the scores (4 / 4 / 3, separate 3), misses and reported list equal results-holdout5-blind.json. The CLI JSON (cli-handbook-pages.json) gives the same 6 changes and the notice '8 differences in headers, footers or page numbers are ignored.' pageMap oldToNew is [1,3,4,null,5,8,null].

counts: Misses: truth 7 - found 4 = 3 (#1, #6, #7), classified 1 + 1 + 1 = 3. #4 is credited as found but listed as 'not a separate item'; I classify it in an entry of count 0 so that the sum stays 3. Extras: 6 items - 3 explained (c1 -> #2 move, c5 -> #3/#4 insert, c6 -> #5 rotation) = 3: c2 (1) + c3 (1) + c4 (1) = 3.

notices: One notice: '8 differences in headers, footers or page numbers are ignored.' It agrees with the 8 differing furniture lines in the recorded runs:
- new p.2 footer 'Page 7 of 7' and new p.3 header;
- old p.4 footer and old p.5 header;
- new p.6 footer 'Page 2 of 7' and new p.8 header;
- old p.7 header and footer.
All are consequences of the page operations (stale Typst footers, no header or footer on the htmlbox page), which the truth names as consequences. Accurate as a count, but nothing says that the footers now carry wrong page numbers. No notice on the deletion of old p.4 or on the page map: pageMap leaves old p.4 and old p.7 unpaired, although p.7's text was matched as a move. No coverage issue (complete=true).

found items: c1 (#2) 'Moved 4 paragraphs p. 7 -> p. 2' is accurate. c5 (#3 and #4) 'Added 7 paragraphs p. 6 -> p. 6–7' merges the duplicated PPE page with the new '5A Lone working' page. It does not say that new p.6 repeats p.3 word for word, although the README claims 'content repeated word for word says where it repeats'. Cause: compare.ts markDuplicates() checks the whole inserted hunk, and the PPE copy plus the new page are one hunk. c6 (#5) 'Page size changed: 595 × 842 pt -> 842 × 595 pt p. 6 -> p. 8' is shown for a /Rotate 90 with the MediaBox unchanged. This is by design (pipeline.ts: quarter turns 'read alike ("Page size changed: W × H -> H × W")'), but the reviewer is not told that the page was rotated and that its text now runs top to bottom.

- MISS x1 truth #1 delete page 'Until the tablet roll-out is complete' (old p.4): The deleted page is described as 'Rewrote 86 words' into '52.00 0.35', the two re-typed rates on the travel page. [engine-description -> verified engine-description]
  evidence: c3: replace, 'Rewrote 86 words' p.4. Old side: the whole old p.4 ('4 Legacy paper forms Until the tablet roll-out is complete … no longer be accepted.'). New side: '52.00 0.35' with rects [362.2,174.7,25,13.4] and [362.2,193.2,19.5,11.2] in the rates table of new p.4. Scorer: '-XR' (text and region match, type replace is not delete). PDF.js, new p.4: '52.00' is item 42 (g_d0_f3, Carlito embedded again) and '0.35' item 44 (g_d0_f4, Helvetica), both after the footer 'Page 3 of 7' (item 40). In the old stream, old p.4's text follows old p.3's footer at that same point.
  cause: The rates re-typed by PyMuPDF are appended to new p.4's stream (tokenize.ts keeps stream order), exactly where the deleted page's text stood in the old stream. compare.ts makes one replace hunk of the gap.
  fix: Pair the re-typed numbers with '48.00'/'0.32' at their places first (same-place pairing in inPlaceTokens, or position-based re-insertion); the deleted page is then a pure delete. Also split a replace whose new side is a few tokens in another region and shares no words with a long old side.
- MISS x1 truth #6 number "48.00" -> "52.00" (old p.3 -> new p.4): The edit appears as 'Deleted "48.00"' plus '52.00' inside the page-deletion replace c3. [engine-description -> verified engine-description]
  evidence: c2: 'Deleted "48.00"', p.3 -> p.4, old rect [362.2,174.7,24.9,13.4]. '52.00' has new rect [362.2,174.7,25,13.4], the same box, and is part of c3's new text. Neither is numeric.
  cause: Stream order of re-typed text. compare.ts inPlaceTokens() pairs only identical keys.
  fix: Same-place numeric pairing: '48.00 -> 52.00 (+8.3 %)'.
- MISS x1 truth #7 number "0.32" -> "0.35" (old p.3 -> new p.4): The edit appears as 'Deleted "0.32"' plus '0.35' inside c3. The change to Helvetica 10 pt is not named either. [engine-description -> verified engine-description]
  evidence: c4: 'Deleted "0.32"', p.3 -> p.4, [362.2,191.7,20.1,13.4]. '0.35' is at [362.2,193.2,19.5,11.2] (Helvetica 10 pt, PDF.js item 44), inside c3.
  cause: As for #6. The y offset of 1.5 pt (another font size at the same baseline) would also fail inPlaceTokens' box test.
  fix: As for #6. Pair by baseline and x-overlap rather than by box top, and report the font change with the number change.
- MISS x0 truth #4 insert '5A Lone working' (new p.7): found, but 'not a separate item': Credited through c5, which also carries the duplicated PPE page (#3). Count 0: it is not one of truth - found. [engine-description -> verified engine-description]
  evidence: c5: insert, 'Added 7 paragraphs' p. 6 -> p. 6–7. New pages [6,7]; its text is the whole PPE copy followed by the whole 5A page. Under the one-to-one assignment, c5 goes to #3, so #4 is not separate.
  cause: The duplicated page and the new page are adjacent insertions in the reading order, so they form one hunk. compare.ts markDuplicates() looks for the whole hunk text elsewhere, so the PPE copy is not marked duplicateOf p.3 (inference from the code; not instrumented).
  fix: Split insert hunks at page boundaries (or at blocks that repeat earlier text) before markDuplicates and description: 'p. 6 repeats p. 3 word for word' and 'Added page 7: 5A Lone working'.
- EXTRA x1 item 1 (c2 'Deleted "48.00"' p.3 -> p.4): The old half of truth #6. [engine-description -> verified engine-description]
  evidence: See the #6 miss.
  cause: Stream order. Same-key rule in inPlaceTokens().
  fix: As for #6.
- EXTRA x1 item 3 (c4 'Deleted "0.32"' p.3 -> p.4): The old half of truth #7. [engine-description -> verified engine-description]
  evidence: See the #7 miss.
  cause: Stream order. Same-key rule.
  fix: As for #7.
- EXTRA x1 item 2 (c3 'Rewrote 86 words' p.4: old page 4 -> '52.00 0.35'): The deleted page (#1) merged with the new halves of #6 and #7 into one false rewrite. [engine-description -> verified engine-description]
  evidence: See the #1 miss.
  cause: Appended rates plus the deleted page fall in one diff gap.
  fix: As for #1.

## verifier checks
- holdout5-j-audit-annotations | MISS truth #1 number "87" -> "82" (p.1) | engine-description -> agree=True -> engine-description | The edit is shown, but as two unrelated items, so it is not 'missed'. The README stream-order limit does not make it 'missed-documented' either.  - **Items.** cli-audit-annotations.json lists c2 'Deleted "87"' and c3 'Added "82"'. Both are on p.1 with the same rect [168.8,169.9,11.1,11.2], and neither is numeric. - **Excerpt.** shownExcerpt places c3 after 'The finding is considered minor.' and before '3 Corrective actions', which is on the next page. - **Stream order.** pjs-audit-after.txt (my PDF.js dump) has '82' as item 70, after 'Page 1 of 2' (item 68). In before, '87 / 100' is item 17, right after 'Overall score'. - **Render.** png/crop-score.png shows '82 / 100' in place. - **Scorer.** scorecheck.ts gives typeOk false for all 9 items. - **Cause in code.** tokenize.ts groupLines keeps stream order. compare.ts inPlaceTokens (lines ~1510–1537) does join a delete and an insert at the same place, but only for hunks 'touched' by a same-key pairing. A lone re-typed value with a different key is therefore never joined.
- holdout5-j-audit-annotations | EXTRA items 1, 2 (c2 Deleted "87", c3 Added "82") | engine-description -> agree=True -> engine-description | These are the two halves of #1, a real edit. They are not noise and not a consequence. The rects and context are as stated: both rects are [168.8,169.9,11.1,11.2], and c3's old caret has boundary [1,2] in the recorded items.
- holdout5-j-audit-annotations | MISS truth #7 replace "October 2027" -> "April" (p.2) | engine-description -> agree=True -> engine-description | - **Items.** c7 is 'Deleted "October"' [298.1,175.1,37.3,11.7], with context 'due in' / '2027.'. c8 is 'Added "April"' [314.5,175.1,21,11.7], with context 'Date' / ''. - **Stream order.** pjs-audit-after.txt has 'April' as item 40, after 'Page 2 of 2' (item 38). - **Render.** png/crop-date.png shows 'due in      April 2027.' with the gap. - **Scorer.** scorecheck.ts gives partReplaced false for c7 and c8. A hypothetical replace October→April with c7's context would match (true). - **Why not scorer-or-truth.** The report itself splits the edit, so it is an engine issue, not a scorer or truth issue.
- holdout5-j-audit-annotations | EXTRA items 6, 7 (c7 Deleted "October", c8 Added "April") | engine-description -> agree=True -> engine-description | These are the two halves of #7. c8's excerpt 'Date April' places the word at the end of the document, but its rect is inside the sentence. Checked against the recorded items and shownExcerpt.
- holdout5-j-audit-annotations | MISS truth #4 format strike-out 'The finding is considered minor.' (p.1) | engine-description -> agree=True -> engine-description | The edit is shown in the right place, under the wrong kind of change.  - **Annotation.** PyMuPDF (tools/annots.py) shows a StrikeOut with appearance stream '1 0 0 RG .7330322 w'. It has three per-word segments on line 1 and one segment over 'considered minor.' on line 2. png/crop-strike.png shows the red strike. - **Item.** c6 is Format 'Text colour or weight changed', on rects [361,455.1,…] and [58.8,470.1,…]. The glyph colour did not change, so the kind is wrong. - **README.** It says 'Strikes in … red … are found'. - **Probe.** I drew the same red lines as page content into before.pdf (probe/lines-as-content.pdf). The engine gives 'Struck through: "The finding is"' plus 'Text colour or weight changed', which reproduces the analyst's result. The same lines at 1.5 pt (probe/strike-thick) give 'Struck through: "The finding is considered minor"'. Line width and colour are the cause, not the annotation mechanism. - **Scorer.** scorecheck.ts gives changeLensMatch true for the truth without its final period, so the period also blocks credit. Even so, the report is not correct, so engine-description is the right category, not scorer-or-truth. - **Not re-checked.** I did not re-instrument the analyst's darkness figures (0.30–0.38 against 0.45). The thresholds 0.85 and 0.45 are at visual.ts:1947–1948, and the chroma threshold of 30 is at visual.ts:3076.
- holdout5-j-audit-annotations | EXTRA item 5 (c6 Format 'Text colour or weight changed' p.1) | engine-description -> agree=True -> engine-description | This is the same item as the #4 miss: a real edit with the wrong kind. Its rects do not overlap any graphic truth item (#2, #3, #5, #8 all show 'T--' in scorecheck.ts), so it is unassigned. It is extra only because #4 did not take it.
- holdout5-j-audit-annotations | MISS truth #6 format green underline 'within 30 days of receiving this report' (p.2) | missed -> agree=True -> missed | The underline is silent, and the README's underline claim covers this case.  - **Annotation.** PyMuPDF shows an Underline with AP '0 1 0 RG .7330322 w' (#00ff00). Its segments are x 300.9–430.1 at top y 87.2 and x 58.8–106.7 at y 102.2. png/crop-underline.png shows it. - **Nothing reported.** p.2 has only c7, c8 and c9 (y 175–244). The CLI JSON has no notice, minor [] and no partlyCompared, and ignored is all 0. That makes it silent. - **Probe: page content.** The same #00ff00 0.73-pt lines drawn as page content (probe/lines-as-content.pdf) are also missed. So the annotation mechanism is not the cause. - **Probe: other colour and width.** At #008000 and 0.73 pt (probe/underline-008000), the engine reports 'Underlined: "within 30 days of receiving thi…"'. At #00ff00 and 1.5 pt (probe/underline-thick), it is found too. - **README.** It says 'underlines in all of these colours are found', and #008000 is one of those colours. No limit names a light colour such as #00ff00 at hairline width.  This makes it an in-scope silent miss. 'Out-of-scope-silent' would apply only if annotations as such were held to be unclaimed, as the truth note says. The probe shows the result does not depend on that.
- holdout5-j-datasheet-overlay | MISS truth #1 and #2 furniture 'Rev. B' -> 'Rev. C' (p.1, p.2) | scorer-or-truth -> agree=True -> scorer-or-truth | The engine discloses both edits in the usual way. Only the scorer's run rule blocks the credit.  - **Notice.** cli-datasheet-overlay.json has '4 differences in headers, footers or page numbers are ignored.' with action 'furniture'. - **What Show does.** In src/web/app.ts:505–516, Show sets ignoreFurniture=false and re-runs, which is the same as --include-furniture. My run of that (cli-ds-furn.txt) lists 'Changed "B" → "C"' on p.1 and on p.2, plus '"Rev." font Inter-Regular → Helvetica' on each page. - **Recorded runs.** In the recorded furniture runs, p.1's 'Rev. C' is a line of its own inside run 2, and p.2's is in run 3. This matches PDF.js, where 'Rev. C' is item 86 after '1 / 2' (item 84), and item 63 after '2 / 2' (item 61). - **Scorer.** scorecheck.ts gives furnitureLinesDisclosed false for both items, and true for both once the runs are merged. - **Precedent.** Round 4 classified footer edits disclosed this way as scorer-or-truth (results-holdout4-analysis.md:17, :146).
- holdout5-j-datasheet-overlay | MISS truth #3 position 'Document no. DS-UFM80-004' (left -> right margin) | engine-description -> agree=True -> engine-description | - **Default view.** c1 is 'Deleted "Document no. DS-UFM80-004"' at old [62.4,98,…]. The new copy, at [394.4,98,138.4,11.5], is the first part of c2, the false 'Changed "3 Electrical connection" → "Document no. DS-UFM80-004 -10"' with location 'p. 2 → p. 1'. - **Render.** png/ds-p1-top-after.png shows the line right-aligned. - **Stream order.** PDF.js has it as item 88, after the footer. - **Why the two sides are not paired.** compare.ts detectMoves (lines 1177–1196) pairs a passage of fewer than 6 words only as whole-line pure deletion with whole-line pure insertion. c2's side is a replace, so c1 is not paired with it. - **Show view.** Even with headers and footers included, the line reads 'Moved a paragraph p. 1', not a sideways position change.
- holdout5-j-datasheet-overlay | MISS truth #4 number '−20' -> '-10' (p.1) | engine-description -> agree=True -> engine-description | - **Items.** c3 is 'Deleted "−20"' at [215.8,273.5,16.7,11.5]. '-10' is the tail of c2's new text at [215.8,274.1,13.7,10.6], the same place. - **Stream order.** PDF.js has '-10' as item 90, the last item, and '°C to +60 °C' as item 36 at x 236.2. - **Show view.** It still splits the edit into 'Deleted "−20"' and 'Added "-10"' (cli-ds-furn.txt c4/c5). - **Result.** There is no number change and no sign check.
- holdout5-j-datasheet-overlay | MISS truth #6 format '3 Electrical connection' Inter Bold -> Times-Bold (p.2) | engine-description -> agree=True -> engine-description | - **Default view.** The old heading is the old side of the false cross-page replace c2. c5 'Added "3 Electrical connection"' is at [62.4,72.9,111.8,11.5], with the context of p.2's end. - **Render.** png/ds-p2-top-after.png shows the heading in place, in the serif face. - **Show view.** It gives the right '"3 Electrical connection" font Inter-Bold → Times-Bold' (c10). It also gives a false 'Moved a paragraph p. 2' (c9) for the same heading, which did not move. The analyst does not mention c9. - **Not traced.** I did not trace why inPlaceTokens does not pair the heading, whether by the 2-pt box test or the share ≥ 0.5 rule.
- holdout5-j-datasheet-overlay | MISS truth #7 delete footnote 'Use shielded twisted-pair cable…' (p.2) | engine-description -> agree=True -> engine-description | - **Item.** c6 is 'Rewrote 16 words', with old text '1Use shielded … end only' at [70.4,766,…] and new text 'Note: transmitter firmware …' at y 239.4, about 527 pt higher. - **Scorer.** scorecheck.ts gives '-XR': text and region match, type fails. - **Show view.** cli-ds-furn.txt gives the correct 'Deleted a paragraph p. 2' and 'Added a paragraph p. 2'. - **Effect.** The default description suggests the footnote was rewritten into the note.
- holdout5-j-datasheet-overlay | MISS truth #8 insert '2.4 or later is required for the low' (p.2) | engine-description -> agree=True -> engine-description | The note is shown only as the new side of the replace c6. Its text and place are right, but its kind is not: typeOk(insert) is false for c6 (scorecheck.ts '-XR'). Render: png/ds-p2-top-after.png shows the note under the installation list. PDF.js has it as items 66–68, after the footer.
- holdout5-j-datasheet-overlay | EXTRA item 0 (c1 Deleted 'Document no. DS-UFM80-004') | engine-description -> agree=True -> engine-description | This is the old side of the moved line (#3), listed as a deletion. Checked in the recorded items and the CLI output.
- holdout5-j-datasheet-overlay | EXTRA item 1 (c2 Changed '3 Electrical connection' -> 'Document no. DS-UFM80-004 -10', p.2 -> p.1) | engine-description -> agree=True -> engine-description | This is a false cross-page replace built from pieces of #3, #4 and #6.  - **Context.** Before is '1 s 2 s 3 s', the end of p.1's chart axis. After is 'The transmitter has spring terminals for', the start of p.2's body once the appended heading is gone. - **Show view.** It is absent from the --include-furniture run, which supports the analyst's inference that the ignored header and footer tokens would otherwise separate the pages.
- holdout5-j-datasheet-overlay | EXTRA item 2 (c3 Deleted '−20') | engine-description -> agree=True -> engine-description | This is the old half of #4, checked in the recorded items.
- holdout5-j-datasheet-overlay | EXTRA item 4 (c5 Added '3 Electrical connection' p.2) | engine-description -> agree=True -> engine-description | This is the re-typed heading of #6. PDF.js has it as item 65 (font g_d0_f5), after '2 / 2' and 'Rev. C'. The excerpt places it at the end of p.2.
- holdout5-j-datasheet-overlay | EXTRA item 5 (c6 Rewrote 16 words p.2) | engine-description -> agree=True -> engine-description | This item merges the footnote deletion (#7) and the note insertion (#8). Checked in the CLI output and scorecheck.ts.
- holdout5-j-handbook-pages | MISS truth #1 delete page 'Until the tablet roll-out is complete' (old p.4) | engine-description -> agree=True -> engine-description | - **Item.** c3 is 'Rewrote 86 words' on p.4. Its old side is the whole of old p.4. Its new side is '52.00 0.35', at rects [362.2,174.7,25,13.4] and [362.2,193.2,19.5,11.2] in new p.4's rates table. - **Stream order.** pjs-hb-after.txt has '52.00' as item 42 and '0.35' as item 44, after 'Page 3 of 7' (item 40). - **Render.** png/hb-rates-after.png shows 52.00 and 0.35 in place. - **Scorer.** scorecheck.ts gives '-XR' for c3: text and region match, type fails.
- holdout5-j-handbook-pages | MISS truth #6 number '48.00' -> '52.00' | engine-description -> agree=True -> engine-description | c2 is 'Deleted "48.00"' p.3 → p.4, at old [362.2,174.7,24.9,13.4]. '52.00' is at the same box, inside c3. Neither item is numeric. The two values are at the same baseline: before '48.00 per day' and after '52.00' both have y 185.2 in PDF.js.
- holdout5-j-handbook-pages | MISS truth #7 number '0.32' -> '0.35' | engine-description -> agree=True -> engine-description | c4 is 'Deleted "0.32"' at [362.2,191.7,20.1,13.4]. '0.35' is at [362.2,193.2,19.5,11.2], inside c3. Both are at baseline y 202.2 in PDF.js, with a different font (g_d0_f4). The font change is not named.
- holdout5-j-handbook-pages | MISS truth #4 insert '5A Lone working': found, not a separate item (count 0) | engine-description -> agree=True -> engine-description | - **Item.** c5 is 'Added 7 paragraphs' p. 6 → p. 6–7. Its text is the whole PPE copy followed by the whole 5A page. scorecheck.ts gives TXR! for both #3 and #4 on c5, and the one-to-one assignment gives c5 to #3. - **Duplicate marking, confirmed from code.** compare.ts markDuplicates (lines 3523–3548) looks for the whole inserted hunk as one needle. The merged hunk never matches p.3, and the CLI JSON has no duplicateOf. This contradicts the README claim 'content repeated word for word says where it repeats', which is about the credited #3. - **Count.** Count 0 is right: it is not part of truth − found.
- holdout5-j-handbook-pages | EXTRA item 1 (c2 Deleted '48.00' p.3 -> p.4) | engine-description -> agree=True -> engine-description | This is the old half of #6, checked in the recorded items.
- holdout5-j-handbook-pages | EXTRA item 3 (c4 Deleted '0.32' p.3 -> p.4) | engine-description -> agree=True -> engine-description | This is the old half of #7, checked in the recorded items.
- holdout5-j-handbook-pages | EXTRA item 2 (c3 Rewrote 86 words p.4) | engine-description -> agree=True -> engine-description | This is the deleted page (#1) merged with the new values of #6 and #7. Its context is 'item except the daily allowance.' / '5 Confined space entry': the deleted page's text and the appended values fall in the same gap of the body stream.

verifier, anything the analyst missed: There are no unclassified misses or extras. These are details the analyst got slightly imprecise or did not mention:

1. **inPlaceTokens.** The analyst says compare.ts inPlaceTokens() pairs same-place tokens 'only with the same key'. That is a simplification. The function does join a deletion and an insertion on one line at the same place into one replacement (compare.ts ~1510–1537), but only for hunks marked `touched`, that is, left over from a same-key pairing. That is why 87/82, October/April, −20/-10, 48.00/52.00 and 0.32/0.35 are never joined. The narrowest engine fix is to relax that `touched` precondition, with a guard, for example both sides numeric or a single short token.
2. **Datasheet Show view.** The analyst's list of the Show (--include-furniture) items for the datasheet leaves one out. Besides the correct font change (c10), Show also lists a false 'Moved a paragraph p. 2' (c9) for the '3 Electrical connection' heading, which did not move. Show also calls the Document no. line 'Moved a paragraph', not a sideways shift. So even the Show view would not be clean for #3 and #6 (cli-ds-furn.txt).
3. **Underline: extra probe evidence.** Two probes the analyst did not run make the #6 'missed' case firmer and point to a README fix:
   - #008000 at 0.73 pt is found ('Underlined', probe/underline-008000.txt);
   - #00ff00 at 1.5 pt is found (probe/underline-thick.txt).

   So the silent miss depends on hairline width together with a light colour. That combination is not documented, and the README limit list could name it if the threshold stays.
4. **Underline: text mask.** The underline lies at y 87.2 and 102.2, inside the word boxes (quads 77.1–88.9 and 92.1–103.9). This fits the analyst's inference that the graphics stage masks it as text. I did not trace this.
5. **Credited items that mislead.** These do not change any count:
   - audit c4 calls a saturated #ffff00 Highlight annotation 'Text colour or weight changed';
   - audit c9 calls added ink initials 'Graphic or image changed';
   - handbook c6 calls a /Rotate 90 'Page size changed'.

   The analyst noted all three.
6. **Not re-checked.** I did not re-instrument visual.ts. The analyst's darkness and coverage figures (0.30–0.38 against 0.45; 0.11–0.65 against 0.85) are unverified by me, but the thresholds exist at visual.ts:1947–1948 and the probes are consistent with them.
7. **HEAD.** HEAD is now 9ba0c7d, a docs-only commit on top of cfa9bc5. I archived cfa9bc5, and src is identical to f1053f3.

All my outputs are in /tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/blind5/analysis/pymupdf-annot-overlay-pages-verify/:
- rerun.txt, rerun.json, rerun-items.json;
- cli-*.json and cli-*.txt;
- cli-ds-furn.* and cli-hb-furn.*;
- pjs-*.txt;
- png/;
- probe/;
- tools/;
- repo/scratch/scorecheck.ts.

Nothing under /home/user/changelens was modified.

# group pymupdf-incremental-redact-htmlbox

RECONCILE: I agree with all 14 entries. The counts add up in each case, and I checked them with my own runs. I re-ran `node eval/run.ts --dir /home/user/changelens/eval/cases --cases <3 ids> --blind --verbose --json ... --items ...` in a git-archive copy of the current HEAD at /tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/blind5/analysis/pymupdf-incremental-redact-htmlbox-verify/repo, whose src is identical to f1053f3. Its items (/tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/blind5/analysis/pymupdf-incremental-redact-htmlbox-verify/rerun-items.json) are deep-equal to eval/results-holdout5-blind-items.json for all three cases. All three tools' scores (ignoring ms), the misses and the reported lists also equal eval/results-holdout5-blind.json. Separate CLI runs give the same changes, notices and summaries: /tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/blind5/analysis/pymupdf-incremental-redact-htmlbox-verify/inv.cli.json, /tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/blind5/analysis/pymupdf-incremental-redact-htmlbox-verify/lease.cli.json and /tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/blind5/analysis/pymupdf-incremental-redact-htmlbox-verify/zh.cli.json.

My scorer probe (/tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/blind5/analysis/pymupdf-incremental-redact-htmlbox-verify/repo/eval/vprobe.ts) runs rescoreCase with CURRENT_RULES on the recorded items. It gives:
- invoice: found 5, extra 3, misses [2,3]. Explained items: 0→#4, 1→#1, 5→#5, 6→#6, 7→#7. 7 − 5 = 2 misses; 8 − 5 = 3 extras (c3, c4, c5).
- lease: found 3, extra 5, misses [1,2,3,5]. Explained: 4→#4, 5→#6, 7→#7. 7 − 3 = 4 misses; 8 − 3 = 5 extras (c1, c2, c3, c4, c7).
- zh: found 6, extra 2, misses [1,3]. Explained: 1→#2, 2→#8, 4→#4, 5→#5, 6→#6, 7→#7. 8 − 6 = 2 misses; 8 − 6 = 2 extras (c1, c4).

Group totals: 22 truth, 14 found, 8 misses (7 engine-description, 1 scorer-or-truth), 10 extras (9 engine-description, 1 scorer-or-truth). These match the analyst.

One factual correction: the branch HEAD is now 9ba0c7d, not cfa9bc5. The commits after cfa9bc5 change only README.md, README.zh-CN.md, docs/EVALUATION.md and docs/PROGRESS.md. The README "Scope and limitations" section is unchanged, so nothing here depends on it.

## holdout5-j-invoice-incremental

truth 7, found 5, extra 3

rerun: Yes. I ran `node eval/run.ts --cases holdout5-j-invoice-incremental,holdout5-j-lease-redact,holdout5-j-zh-quote-htmlbox --blind --verbose --json ... --items ...` in a git-archive copy of HEAD at /tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/blind5/analysis/pymupdf-incremental-redact-htmlbox/repo. Its src is identical to the frozen f1053f3: `git diff --stat f1053f3 HEAD -- src` is empty. The written items, /tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/blind5/analysis/pymupdf-incremental-redact-htmlbox/rerun-items.json, are deep-equal (Python ==) to eval/results-holdout5-blind-items.json for this case. The scores (all three tools, ignoring ms), the misses and the reported list are also equal to eval/results-holdout5-blind.json. The CLI run (/tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/blind5/analysis/pymupdf-incremental-redact-htmlbox/holdout5-j-invoice-incremental.cli.json) gives the same 8 changes, c1–c8.

counts: Misses: truth 7 − found 5 = 2, which are #2 and #3. Extras: the 8 items minus the 5 explained ones (item 0→#4, 1→#1, 5→#5, 6→#6, 7→#7) leave 3. They are items 2 and 4 (2 deletions) and item 3 (1 merged insertion): 2 + 1 = 3, the recorded extra count. rescoreCase in my probe gives found 5, extra 3, misses [2,3].

notices: Notices: none. Summary: "8 changes — 6 text · 1 number · 2 layout". complete=true, visualCompared=true, all ignored counts 0, no coverage gaps. The counts match the items listed, but "1 number" (30→18) undercounts. The amount edit and the account edit appear only as deletions and an insertion. Missing notices: (a) Nothing warns that p. 1 has text drawn out of reading order. PDF.js getTextContent of after p. 1 returns the re-typed runs "18 November 2026" (items 87–88, y 137), "1,420.00" (89–90, y 248) and "9932 0457 18" (91, y 431) after the footer "Page 1 of 2" (items 84–86, y 811) (/tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/blind5/analysis/pymupdf-incremental-redact-htmlbox/inv-after-p1.order.txt). In before p. 1 the same values sit in place: items 22, 50 and 86. This is the condition the README names ("Producers that write text out of order can produce noisy diffs"), and it split two edits. (b) The APPROVED stamp is a /Stamp annotation (PyMuPDF: Stamp 'Approved' at [186,107,314,140.7]). It is compared only as pixels, and no notice says the new file adds an annotation or that its text was not compared as text. The README does not claim annotation support. (c) after.pdf is an incremental update: it has 2 %%EOF markers, and `cmp -n 42533` shows before.pdf is a byte prefix of after.pdf. Nothing is said about this. That is acceptable because no such support is claimed.

found items: c2 (#1) "Number changed: 30 → 18 (-40%)": the percentage is put on a day of the month, which is not an amount. compare.ts textChange computes a value for any single figure, and referenceNumber() has no date guard for a figure followed by a month name. The excerpt's context before, "INV-2026-0418 as the payment reference.", is wrong. context() reads the new file in stream order, where the re-typed due date follows the payment line. On the page the due date sits in the header block at y 137. The rects are right (451.5,128.8). c1 (#4) "Graphic or image added" p. 1 [184,104,132,40] is at the right place. It does not say that this is an annotation, and it does not show the word APPROVED: PDF.js getTextContent has no annotation text, though pdftotext does. c6 (#5) "Graphic or image changed" p. 2 [288,140,52,104] covers exactly the week-43 bar (render /tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/blind5/analysis/pymupdf-incremental-redact-htmlbox/renders/inv-p2-pair.png). It is adequate but generic: it does not say the bar changed colour from blue to orange or got taller. c7 "Deleted 11 words" and c8 "Added a paragraph" are adequate. c8's context "a 10 % handling charge." is right: the htmlbox is appended after the footer, but on the page it is also the last body text.

- MISS x1 truth #2 number "1,240.00" → "1,420.00": The re-typed amount is listed as "Deleted 1,240.00" (c3) at its place, plus the first half of an insertion "Added 1,420.00 9932 0457 18" (c4). c4 merges it with the re-typed account digits and shows it with the context of the page end. [engine-description -> verified engine-description]
  evidence: Recorded items 2 and 3. c3 old [498.4,239.8] has context "…AHU-2 2 620.00 | Emergency call-out…", which is right. c4 has new rects [503.4,240.1] and [148.6,423.1]. Its context is "18 November 2026 | Service report, October 2026" and its old caret is at the p. 1/2 boundary. The render (/tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/blind5/analysis/pymupdf-incremental-redact-htmlbox/renders/inv-p1-pair.png) shows 1,420.00 in smaller Helvetica at the old place. PDF.js order: "1,420.00" is item 90 of after p. 1, after the footer (inv-after-p1.order.txt). Scorer probe (/tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/blind5/analysis/pymupdf-incremental-redact-htmlbox/repo/eval/probe-match.ts): #2 matches no item. typeOk(number) is false for c3 and c4, which have no numeric flag, and true only for item 1, whose textMatch is false. The README sentence "Reading order comes from the PDF content stream. … Producers that write text out of order can produce noisy diffs." describes the general condition. The edit is listed, so this is not a silent miss. Instrumented copy of inPlaceTokens (CL_DEBUG_INPLACE=1 in the scratch repo): pairs accepted 2 ("November" and "2026" of the due date, at the same x/y). The rest hunk "1,420.00 9932 0457 18" is TOUCHED with oneLineB=false. "1,240.00" is a one-line deletion. No join is made.
  cause: Traced. tokenize.ts groupLines() builds lines in content-stream order, so the two re-typed values, appended one after the other after the footer, form one inserted run. compare.ts inPlaceTokens() is the step that turns "a deletion and an insertion on one line each, at the same place" into a replacement. Its oneLine(B, …) test fails because the run covers two lines (y 240 and y 423). The due date succeeded only because its unchanged words "November 2026" were re-typed at the same positions and paired, which split off "18".
  fix: Engine: in inPlaceTokens, split the unmatched runs left after pairing (and inserted hunks in general) at line changes before the same-place join, so each re-typed line meets the deletion under it. A scratch experiment (/tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/blind5/analysis/pymupdf-incremental-redact-htmlbox/exp, CL_EXP=1; not a fix) then lists "Number changed: 1,240.00 → 1,420.00 (+15%)" and the case scores 6/7. Add a page notice when text runs come after the page's last line or footer but lie inside its body area ("text drawn out of reading order on p. 1; edits there may be listed as a deletion and an insertion"). No scorer change: the scorer correctly refuses a deletion or insertion for a number truth.
- MISS x1 truth #3 replace "2045 1189 03" → "9932 0457 18": The new account digits are listed as "Deleted 2045 1189 03" (c5) plus the second half of the merged insertion c4. No item joins old and new. [engine-description -> verified engine-description]
  evidence: Recorded item 4. c5 old [149,422.8,62.6,10.5] has context "Services Ltd. Account ZZ41 7700 | Quote INV-2026-0418…", which is right. c4's second rect [148.6,423.1,55,10.1] is at the same place. PDF.js after p. 1 item 91 "9932 0457 18" (x 148.6, y 431.2) comes after the footer. The old line was one run, "Account ZZ41 7700 2045 1189 03" (item 86 of before p. 1). The new line is cut to "Account ZZ41 7700" (item 81). Probe: #3 matches no item, because typeOk(replace) needs kind replace and partReplaced fails since oneInsertion is false. Debug output: "2045 1189 03" is a one-line deletion that is not touched, and its partner run is the two-line "1,420.00 9932 0457 18".
  cause: Traced. This is the same mechanism as #2: compare.ts inPlaceTokens() rejects the two-line inserted run (oneLine). Both re-typed values are adjacent at the end of the p. 1 content stream (tokenize.ts groupLines keeps stream order).
  fix: Engine: the same per-line split in inPlaceTokens. Then guard identifiers. In the scratch experiment the join produced three number items, "2045 → 9932 (+386%)", "1189 → 0457" and "03 → 18". A percentage on account digit groups is meaningless. Treat runs of digit groups after a word like Account/IBAN, or after letters such as "ZZ41", as one reference value with no percentage. Scorer, only if the engine splits the groups: coversInContext reads one shared context taken from the new side (context() uses B), so the old snippet "2045 1189 03" cannot be covered by the first group. Keep old-side context, or let maxItems 3 combine adjacent items.
- EXTRA x2 items 2 and 4: c3 Deleted "1,240.00", c5 Deleted "2045 1189 03": The deletion halves of the two re-typed values. They are at the right place, but they read as if the amount and the account digits were removed. [engine-description -> verified engine-description]
  evidence: Both are real removals of the old glyphs: redaction with no fill, as the render shows. The new values are drawn at the same places, so "Deleted" without a partner misleads. No truth item explains them: #6 (delete) needs the snippet "Queries must be raised…", and #2 and #3 need kind number or replace (probe output).
  cause: compare.ts inPlaceTokens() same-place join not reached for these hunks (oneLine on the insertion side), see #2 and #3.
  fix: Same as #2 and #3: per-line split before the same-place join, and a notice about out-of-order text.
- EXTRA x1 item 3: c4 Added "1,420.00 9932 0457 18": One insertion joins two unrelated re-typed values (an amount at y 240 and account digits at y 423). Its context is the end of page 1 and the start of page 2, where neither value is. [engine-description -> verified engine-description]
  evidence: c4 has two new rects 183 pt apart and context "18 November 2026 | Service report, October 2026" (the p. 2 heading). The PDF.js order shows why: items 89–91 follow the re-typed due date (87–88) after the footer. #7 (insert) needs "Our bank details changed…", so c4 is unexplained.
  cause: tokenize.ts groupLines stream-order lines plus compare.ts inPlaceTokens oneLine restriction (see #2).
  fix: As #2. Also, when an inserted hunk's lines lie in different places on the page, split it into one change per place instead of one change with scattered rects.

## holdout5-j-lease-redact

truth 7, found 3, extra 5

rerun: Yes. In the same eval/run.ts rerun as above, the items are deep-equal to eval/results-holdout5-blind-items.json for this case, and the scores, misses and reported list are equal. The CLI run (/tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/blind5/analysis/pymupdf-incremental-redact-htmlbox/holdout5-j-lease-redact.cli.json) gives the same 8 changes, c1–c8.

counts: Misses: truth 7 − found 3 (#4 by item 4, #6 by item 5, #7 by item 7) = 4, which are #1, #2, #3 and #5. Extras: 8 items − 3 explained = 5. They are items 0, 2, 3 and 6 (4 deletions) and item 1 (1 merged insertion): 4 + 1 = 5, the recorded extra count. rescoreCase in the probe gives found 3, extra 5, misses [1,2,3,5].

notices: Notices: none. Summary: "8 changes — 8 text · 1 number · 0 layout". complete=true, all ignored counts 0, no coverage gaps. "1 number" (−250.00 → 250.00) undercounts: the rent and the commencement date appear only as deletions plus one insertion. Missing: a warning that text is drawn out of reading order. PDF.js after p. 1 returns "1,975.00" (items 77–78, y 252), "15 March 2027" (79–80, y 219.6) and "Retail" (81–82, y 501) after the footer "Page 1 of 3" (items 74–76, y 798). After p. 3 returns "April to June 2027" (65–66, y 305.5) and "11.2 Notices may also be sent…" (67, y 238) after the footer "Page 3 of 3" (62–64) (/tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/blind5/analysis/pymupdf-incremental-redact-htmlbox/lease-after.order.txt). In the before file each value sits in its line: items 28, 36, 72, 32 and 46. No false colour or graphic items come from the unfilled redactions, which is correct.

found items: c6 (#6) "Added 2 paragraphs" p. 3 is credited but over-broad and misplaced. Its text starts with "April to June 2027", the replacement months in the schedule's When cell (rect [336.7,298.7,60.4,8.4], in the table under clause 11). So the months change is hidden inside an "added" item, and "2 paragraphs" is wrong: one is a table cell value. Its context before, "Date: Date:", is the last body text of p. 3 in the stream, not the place of 11.2 (after 11.1 at y 206–226). c8 (#7) "Number changed: −250.00 → 250.00 (sign changed)" is good: the new rect starts at x 490.5, where the digits are, after the blank where the minus was. c5 (#4) "Deleted 22 words" p. 2 is good: it covers both lines of 6.3, and 6.4 keeps its number, so nothing is falsely renumbered.

- MISS x1 truth #1 number "1,850.00" → "1,975.00": The rent is listed as "Deleted 1,850.00" (c3) at its place, plus the first word of "Added 1,975.00 15 March 2027 Retail" (c2). c2 is one insertion that merges three re-typed values and carries the context of the page end. [engine-description -> verified engine-description]
  evidence: c3 old [183.6,242,36.7,11.6] has context "Rent (EUR per month) | , payable monthly in advance Deposit", which is right. c2 new rects are [183.6,210.2] (date), [183.6,243.9] (rent) and [70.9,492.7] (Retail). Its context is "immediately before the review date. | 4 Deposit 4.1 The Deposit is", which is the end of p. 1 and the start of p. 2. The render (/tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/blind5/analysis/pymupdf-incremental-redact-htmlbox/renders/lease-p1-particulars.png) shows 1,975.00 in Helvetica 9 pt in the rent cell. Probe: #1 matches no item. Only item 7 has typeOk(number), and its text does not match. README: "Producers that write text out of order can produce noisy diffs." The edit is listed (in pieces), so this is not a silent miss. Instrumented inPlaceTokens: hunks "1 March 2027", "1,850.00", "Consumer" (one-line deletions) and "1,975.00 15 March 2027 Retail" (bLines 3), then "pairs accepted 0".
  cause: Traced. tokenize.ts groupLines() keeps content-stream order, so the three appended runs form one inserted hunk at the end of p. 1. compare.ts inPlaceTokens() returns early, `if (!pairs.length) return { rest: hunks, … }`, when no unchanged word was re-typed at the same place. Here none was: "March 2027" moved about 5 pt right because "15" is wider than "1" (the old box is 58.9 wide, the new 64.1, both starting at x 183.6), beyond TOL 2. So the same-place join of a deletion and an insertion is never tried. Even if it were, the inserted hunk spans 3 lines (oneLine) and no hunk is touched.
  fix: Engine: run the same-place join in inPlaceTokens even when nothing was paired. Split inserted runs per line. Let an insertion that is out of stream order (drawn after the page's last body line or footer, inside the body area) count as eligible in place of "touched". Then re-diff each joined pair at word level, so "1 March 2027 → 15 March 2027" becomes "1 → 15" and figures get their numeric flag. In the scratch experiment (CL_EXP=1, crude out-of-order test), the case gives "Number changed: 1,850.00 → 1,975.00 (+6.8%)", "Changed March to May 2027 → April to June 2027" and "Changed 1 March 2027 → 15 March 2027" (whole line, not numeric), and scores 5/7. Add the out-of-order page notice.
- MISS x1 truth #2 number "1 March 2027" → "15 March 2027": The commencement date is listed as "Deleted 1 March 2027" (c1) at its place, plus the middle of the merged insertion c2. [engine-description -> verified engine-description]
  evidence: c1 old [183.6,210.2,58.9,11.6] has context "…Commencement date | Term Five years…", which is right. c2's first rect [183.6,210.2,64.1,11.6] is at the same place. PDF.js after p. 1 item 80 "15 March 2027" (Liberation Serif re-embedded, f4) comes after the footer. Probe: no item matches #2.
  cause: Traced. The cause is the same as #1: compare.ts inPlaceTokens() made 0 pairs (the "March" and "2027" glyphs moved more than 2 pt), returned early, and the inserted run spans 3 lines.
  fix: As #1, with a word-level re-diff of the joined pair so the change reads "1 → 15" with "March 2027" kept, and is flagged as a number.
- MISS x1 truth #3 replace "Consumer" → "Retail": Clause 3.1 reads "Deleted Consumer" (c4), and "Retail" is only the last word of the merged insertion c2. A reviewer must work out that CPI became RPI. [engine-description -> verified engine-description]
  evidence: c4 old [70.9,491.7,43.2,11.6] has context "…by reference to the | Prices Index published…", which is right. c2's third rect [70.9,492.7,25.1,10.5] is at the same place. PDF.js after p. 1 item 82 "Retail" (Times-Roman, f5) comes after the footer. The new line 3.1 continues at x 116.7 (item 70, "Prices Index…"), which leaves the gap. Probe: partReplaced is false ("Retail" is not "Consumer" with something inserted), and typeOk(replace) is false for both pieces.
  cause: Traced. compare.ts inPlaceTokens(): early return with 0 pairs, and a 3-line inserted run (see #1). Even with the scratch per-line experiment, "Retail" was not joined. My out-of-order test (the first token lies above the token before it) does not flag it, because it comes after "15 March 2027" and lies below it. A test against all lines already drawn on the page would be needed.
  fix: As #1. Decide out-of-order by comparing against the page's body area or the lines already emitted (any earlier line below it), not only the previous token.
- MISS x1 truth #5 replace "March to May 2027" → "April to June 2027": The schedule cell is listed as "Deleted March to May 2027" (c7). Its new text is folded into the credited insertion c6, "Added 2 paragraphs", together with the new clause 11.2. [engine-description -> verified engine-description]
  evidence: c7 old [336.7,297.2,83.7,11.6] has context "Rent-free period, three months | −5,550.00…", which is right. c6's second rect [336.7,298.7,60.4,8.4] is at the same place. The render (/tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/blind5/analysis/pymupdf-incremental-redact-htmlbox/renders/lease-p3.png) shows "April to June 2027" in small Helvetica in the When cell. PDF.js after p. 3: items 65–66 "April to June 2027" and 67 "11.2 …" come after the footer. Debug: the inserted hunk has bLines 2, and pairs accepted is 0 for the document. Probe: #5 matches no item.
  cause: Traced. compare.ts inPlaceTokens(): no pairs (the unchanged "2027" was re-set in Helvetica 7.5 pt at another x), early return, and a 2-line inserted run that also holds the htmlbox clause appended right after it in the stream.
  fix: As #1: a per-line split would separate "April to June 2027" from clause 11.2 and join it with c7 (the scratch experiment gives "Changed March to May 2027 → April to June 2027" and "Added a paragraph" for 11.2).
- EXTRA x4 items 0, 2, 3, 6: c1 Deleted "1 March 2027", c3 Deleted "1,850.00", c4 Deleted "Consumer", c7 Deleted "March to May 2027": The deletion halves of four in-place replacements. Each is at the right place, but each reads as a removed date, rent, word or period, while a new value stands in the same spot. [engine-description -> verified engine-description]
  evidence: In all four, the old glyphs were removed by redaction and new text was written at the same box (renders lease-p1-particulars.png and lease-p3.png). Only #4 (delete) has a deletion truth, and its snippet "6.3 The Tenant may sublet…" matches only item 4 (probe).
  cause: compare.ts inPlaceTokens() early return and oneLine restriction (see #1 and #5).
  fix: As #1.
- EXTRA x1 item 1: c2 Added "1,975.00 15 March 2027 Retail": One insertion joins three re-typed values from three places on p. 1 (rent, date, clause 3.1). Its context comes from the page break. [engine-description -> verified engine-description]
  evidence: There are three new rects at y 210, 244 and 493, and the context is "immediately before the review date. | 4 Deposit 4.1 The Deposit is". The PDF.js order shows the three runs consecutive after the footer (items 77–82). No insert truth has these snippets (#6 is clause 11.2 on p. 3).
  cause: tokenize.ts groupLines in stream order plus compare.ts inPlaceTokens (see #1).
  fix: As #1. Also never let one inserted change carry rects from places that are not contiguous in the layout; split it per place.

## holdout5-j-zh-quote-htmlbox

truth 8, found 6, extra 2

rerun: Yes. In the same eval/run.ts rerun, the items are deep-equal to the recorded items for this case, and the scores, misses and reported list are equal. The CLI run (/tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/blind5/analysis/pymupdf-incremental-redact-htmlbox/holdout5-j-zh-quote-htmlbox.cli.json) gives the same 8 changes and the same notice.

counts: Misses: truth 8 − found 6 = 2, which are #1 and #3. Extras: the 8 items minus the 6 explained ones (item 1→#2, 2→#8, 4→#4, 5→#5, 6→#6, 7→#7) leave 2. They are item 0 (11月30→12月31) and item 3 (4→6): 1 + 1 = 2, the recorded extra count. rescoreCase in the probe gives found 6, extra 2, misses [1,3].

notices: One info notice: "1 list number changed only because numbered items were added, removed or moved; it is not listed." Minor m1 is "List renumbered: 4 → 3" p. 1. It is accurate: pdftotext shows old "4. 双方对本报价的内容负有保密义务。" becoming new "3. …" after item 3 was deleted, the consequence the truth names. Summary: "8 changes — 7 text · 1 number · 1 layout". "1 number" leaves out the validity-date change (c1 has no numeric flag). The re-flow of p. 1 and the closing of the gap on p. 2 produce no items, which is correct. Here the text order equals the reading order: the PDF.js order of after p. 1 runs top to bottom, with the moved paragraph as item 15 between section 1 (items 13–14) and the table header (items 16–25) (/tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/blind5/analysis/pymupdf-incremental-redact-htmlbox/zh-after.order.txt).

found items: The found items are adequate. c2 "Changed 季度 → 月" has context "更换。我们每 | 上门巡检一次". c3 is "Moved a paragraph p. 2 → p. 1" (old [57,125.6] on p. 2, new [57,191.4] on p. 1). c5 is "Added and Chinese" inside the English sentence. c6 "Underlined: 逾期付款按每日 0.05% 计收违约金" has rects that follow the re-flow (y 463 → 485.4). c7 is "Deleted 3. 报价含上门差旅费用。" and c8 "Added 4. 更换的零配件享有 12 个月质保。"; both include their list labels, which is fine. Among the uncredited items, c4 "Number changed: 4 → 6 (+50%)" is correct, and a percentage on hours is acceptable for a duration. c1 is labelled "Changed", not "Number" (see the entries).

- MISS x1 truth #1 number "有效期至：2026年11月30日" → "有效期至：2026年12月31日": The validity date is listed as "Changed 11月30 → 12月31" (c1) at the right place. It has no numeric flag, so it is not a Number change: it is left out of the Numbers filter and the "1 number" count. Its 6-character context also does not reach the snippet's first character. [engine-description -> verified engine-description]
  evidence: Recorded item 0: kind replace, no numeric, old and new rect [396.7,85.9,31.5,12], shown "效期至：2026年 | 11月30 → 12月31 | 日致：临江设". Scorer probe (/tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/blind5/analysis/pymupdf-incremental-redact-htmlbox/repo/eval/probe-zh.ts). As recorded: typeOk=false, textMatch=false. Numeric set, same context: typeOk=true, textMatch=false. Not numeric, 7-token context "有效期至：2026年": typeOk=false, textMatch=true. Both changed: match=true. So both blockers apply. The web Numbers filter is src/web/sidebar.ts:12, `changes.filter((c) => c.numeric)`. The same kind of edit in Latin script (invoice due date "30 → 18") is flagged as a number.
  cause: Traced. compare.ts foldRule() folds the parts of a date on purpose (comment: 'the parts of a date ("11 月 30 日") are folded into one'). textChange() then sets numeric only if isNumericPhrase() (numbers.ts) accepts every token, and 月 is neither a figure nor numeric punctuation. Second blocker (scorer and truth): compare.ts context() takes 6 tokens, and in CJK each character is a token, so the context before is "效期至：2026年", one character short of the snippet's "有". This is the same context limit as round 4 zh-en-supply-annex miss #3.
  fix: Engine: in textChange, when two sides differ only in figures separated by the same CJK date or time units (年月日时分秒), at the same positions, set numeric with fromValue and toValue null (a number change with no percentage, as numberedIdentifier does). Give CJK context a character budget, for example 12–20 characters or up to the next punctuation, instead of 6 tokens. Scorer and truth: until then, keep CJK truth snippets within 6 characters of the changed text, or let a number truth match a numeric item on the snippet's line whose figures equal the snippet's figures.
- MISS x1 truth #3 number "4 小时内派工程师" → "6 小时内派工程师": This is correctly reported as "Number changed: 4 → 6 (+50%)" (c4) at the right place. Only the 6-character context after it (小时内派工程) stops one character short of the truth snippet's "师". [scorer-or-truth -> verified scorer-or-truth]
  evidence: Recorded item 3: numeric replace, old [340.8,346.6], new [340.8,368.9] (re-flowed by the moved paragraph), shown "内电话响应， | 4 → 6 | 小时内派工程". pdftotext line 24/26 shows the change and nothing else on the line. Probe: typeOk=true, textMatch=false as recorded. With a 7-token context after ("小时内派工程师"), textMatch=true and match=true. coversInContext('4 小时内派工程师', '内电话响应，', '4', '小时内派工程') = false.
  cause: Traced. eval/score.ts textMatch/coversInContext (context rule) can only use what the engine shows, and compare.ts context() shows 6 tokens, which is 6 characters for CJK. The truth snippet adds 7 characters after the figure. The brief allows 'a few words of context', which the author read as Chinese words, not characters.
  fix: Engine: a character budget for the CJK context (see #1), which also helps the reviewer. Scorer: for number truths, accept a numeric item whose from/to equal the snippet's figures and that lies on the snippet's line and page. Truth convention: CJK snippets of at most 6 characters on each side of the figure.
- EXTRA x1 item 0: c1 Changed "11月30" → "12月31": This is the validity-date item itself. It counts as extra only because it is not credited to #1. [engine-description -> verified engine-description]
  evidence: It is the same item as miss #1: right place and right text, no numeric flag, and short context. No other truth item can take it (#2's snippet is 每季度上门巡检).
  cause: compare.ts textChange/isNumericPhrase (no numeric flag on a folded CJK date) and compare.ts context() 6-token limit (see #1).
  fix: As #1.
- EXTRA x1 item 3: c4 Number changed "4" → "6" (+50%): This is the response-hours item itself. It is correct, and counts as extra only because the context rule did not assign it to #3. [scorer-or-truth -> verified scorer-or-truth]
  evidence: It is the same item as miss #3. The probe shows it matches #3 once the context after reaches "师".
  cause: eval/score.ts coversInContext together with compare.ts context() 6-token CJK context (see #3).
  fix: As #3.

## verifier checks
- holdout5-j-invoice-incremental | MISS truth #2 number "1,240.00" → "1,420.00" | engine-description -> agree=True -> engine-description | Facts I checked: - Recorded item 2 (c3) is "Deleted 1,240.00", old [498.4,239.8,40.1,10.5]. Its context, "air handling unit AHU-2 2 620.00 | Emergency call-out on 14 October,", is right. - Item 3 (c4) is "Added 1,420.00 9932 0457 18" with new rects [503.4,240.1] and [148.6,423.1]. Its context is "18 November 2026 | Service report, October 2026", and its old side has boundary [1,2] (caret at the end of old p. 1). - The render /tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/blind5/analysis/pymupdf-incremental-redact-htmlbox-verify/renders/inv-p1-pair.png shows 1,420.00 in smaller Helvetica in the old cell. - PDF.js order (/tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/blind5/analysis/pymupdf-incremental-redact-htmlbox-verify/inv-after.order.txt): after p. 1 items 87–91 ("18 November 2026" y137, "1,420.00" y248, "9932 0457 18" y431) follow the footer items 84–86 (y811). In before p. 1 the values are items 22, 50 and 86, in place. - My instrumented copy of inPlaceTokens (/tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/blind5/analysis/pymupdf-incremental-redact-htmlbox-verify/compare.instrumented.ts, CL_VDEBUG=1) shows:   - one inserted hunk "18 November 2026 1,420.00 9932 0457 18" with bLines 3;   - 2 pairs accepted (November, 2026);   - the rest run "1,420.00 9932 0457 18" is touched but oneLineB=false;   - "1,240.00" is a one-line deletion, not touched;   - only "30"→"18" is joined. - Probe: #2 matches no item. typeOk(number) holds only for item 1, whose text does not match.  The edit is listed, but split into a deletion and a merged insertion, so it is not a silent miss. The README sentence on out-of-order producers ("Producers that write text out of order can produce noisy diffs.") names the condition, not this outcome, and it does not apply to an edit that is listed. Redaction with re-typed text is still a text-based PDF, so the edit is in scope.
- holdout5-j-invoice-incremental | MISS truth #3 replace "2045 1189 03" → "9932 0457 18" | engine-description -> agree=True -> engine-description | Facts I checked: - Recorded item 4 (c5) is "Deleted 2045 1189 03", old [149,422.8,62.6,10.5], context "Services Ltd. Account ZZ41 7700 | Quote INV-2026-0418 as the payment reference". - The new digits appear only as the tail of c4, with rect [148.6,423.1,55,10.1] at the same place. - PDF.js: before p. 1 item 86 is one run, "Account ZZ41 7700 2045 1189 03". After p. 1 has item 81 "Account ZZ41 7700" and item 91 "9932 0457 18" (x148.6, y431.2), which comes after the footer. - pdftotext diff (/tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/blind5/analysis/pymupdf-incremental-redact-htmlbox-verify/invoice-before.txt vs invoice-after.txt) shows the account line as the only change there. - Debug: the deletion "2045 1189 03" is not touched, and its only candidate insertion run spans two lines (oneLineB=false), so it is not joined. - Probe: #3 matches nothing. partReplaced is false for c5 and c4, and typeOk(replace) is true only for item 1.  The edit is surfaced in pieces, and a reviewer must put them together. Engine-description is right.
- holdout5-j-invoice-incremental | EXTRA items 2 and 4 (c3 Deleted "1,240.00", c5 Deleted "2045 1189 03") | engine-description -> agree=True -> engine-description | Both items are real removals of the old glyphs: redaction with no fill (render inv-p1-pair.png). New values are drawn at the same boxes, so "Deleted" alone misreads them as removals. The probe shows no truth item takes them: #6 (delete) matches only item 6, and #2 and #3 need number or replace. They are neither noise nor a consequence: they are halves of the two edits above. The cause is the same as in #2: no join in inPlaceTokens, as the CL_VDEBUG output confirms.
- holdout5-j-invoice-incremental | EXTRA item 3 (c4 Added "1,420.00 9932 0457 18") | engine-description -> agree=True -> engine-description | Facts I checked: - Two new rects 183 pt apart on p. 1 (y240 and y423). - Context from B in stream order: before "18 November 2026" (the re-typed due date), after "Service report, October 2026" (the p. 2 heading). - compare.ts textChange takes context from B (`context(B.length ? B : A, …)`), so the context follows the content stream, not the page. - The probe shows #7 (insert) matches only item 7.  One item merging two unrelated values with a page-break context misleads. Engine-description is right.
- holdout5-j-lease-redact | MISS truth #1 number "1,850.00" → "1,975.00" | engine-description -> agree=True -> engine-description | Facts I checked: - Recorded item 2 (c3) is "Deleted 1,850.00" [183.6,242,36.7,11.6], context "Rent (EUR per month) | , payable monthly in advance Deposit". - Item 1 (c2) is "Added 1,975.00 15 March 2027 Retail" with rects at y210.2, 243.9 and 492.7, context "immediately before the review date. | 4 Deposit 4.1 The Deposit is". - Render /tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/blind5/analysis/pymupdf-incremental-redact-htmlbox-verify/renders/lease-p1-pair.png: 1,975.00 is set in a smaller sans face in the rent cell. - PDF.js (/tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/blind5/analysis/pymupdf-incremental-redact-htmlbox-verify/lease-after.order.txt): after p. 1 items 77–82 ("1,975.00" y252, "15 March 2027" y219.6, "Retail" y501.1) follow the footer items 74–76 (y798). - CL_VDEBUG run: hunks "1 March 2027", "1,850.00" and "Consumer" are one-line deletions, and the inserted hunk has bLines 3. Then "groups 0 pairs accepted 0": the early return `if (!pairs.length) return { rest: hunks, … }` fires, so the same-place join is never tried. - Probe: only item 7 has typeOk(number), and its text does not match.  The edit is listed in pieces. Engine-description is right.
- holdout5-j-lease-redact | MISS truth #2 number "1 March 2027" → "15 March 2027" | engine-description -> agree=True -> engine-description | Facts I checked: - c1 "Deleted 1 March 2027" sits at [183.6,210.2,58.9,11.6], with context "Quay Lane, Northbridge Commencement date | Term Five years from and including". - c2's first rect [183.6,210.2,64.1,11.6] is at the same place. - I upgraded the analyst's inference to a fact. The engine token boxes in my debug output show old "1" 183.6, "March" 191.5, "2027" 221.5 against new "15" 183.6, "March" 196.7, "2027" 226.7. That is a 5.2 pt shift, more than TOL 2, so no pair is formed. - Probe: no item matches #2.  Engine-description is right.
- holdout5-j-lease-redact | MISS truth #3 replace "Consumer" → "Retail" | engine-description -> agree=True -> engine-description | Facts I checked: - c4 "Deleted Consumer" [70.9,491.7,43.2,11.6] has context "Commencement date by reference to the | Prices Index published for the preceding". Read as a deletion, this suggests the index type was simply dropped. - "Retail" is only the last word of c2 (rect [70.9,492.7,25.1,10.5]). - PDF.js: before item 72 is one run, "Consumer Prices Index published…". After has item 70 "Prices Index…" at x116.7 and item 82 "Retail" (font f5), which comes after the footer. - Render lease-p1-pair.png shows the gap after Retail. - Probe: partReplaced is false, and typeOk(replace) is false for both pieces.  I agree it is surfaced but misleading.
- holdout5-j-lease-redact | MISS truth #5 replace "March to May 2027" → "April to June 2027" | engine-description -> agree=True -> engine-description | Facts I checked: - c7 "Deleted March to May 2027" [336.7,297.2,83.7,11.6] has context ") Rent-free period, three months | −5,550.00 Fit-out contribution by the Landlord". - The new text is the first part of c6, "Added 2 paragraphs" (rect [336.7,298.7,60.4,8.4]), which is credited to #6. - Render /tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/blind5/analysis/pymupdf-incremental-redact-htmlbox-verify/renders/lease-p3-pair.png: "April to June 2027" is set small in the When cell. - PDF.js after p. 3: items 65–66 "April to June 2027" (y305.5) and item 67 "11.2 …" (y238.2) come after the footer items 62–64. - Debug: the inserted hunk has bLines 2. Old "to" 366.7 and "2027" 399.3 against new 353.7 and 380.4, so no pair is formed. - Probe: no match.  Engine-description is right.
- holdout5-j-lease-redact | EXTRA items 0, 2, 3, 6 (c1, c3, c4, c7 deletions) | engine-description -> agree=True -> engine-description | All four are real glyph removals by redaction, with a replacement drawn in the same box (renders lease-p1-pair.png and lease-p3-pair.png). They are deletion halves of the replacements #1, #2, #3 and #5, so they are not noise. The probe shows the only delete truth, #4, matches only item 4. Count: 4.
- holdout5-j-lease-redact | EXTRA item 1 (c2 Added "1,975.00 15 March 2027 Retail") | engine-description -> agree=True -> engine-description | c2 has three new rects at y210.2, 243.9 and 492.7. Its context comes from the stream position at the page break ("immediately before the review date. | 4 Deposit 4.1 The Deposit is"). The debug output shows its tokens contiguous in B after the footer. The only insert truth, #6, matches item 5. Count: 1. Lease extras total 4 + 1 = 5, the recorded count.
- holdout5-j-zh-quote-htmlbox | MISS truth #1 number "有效期至：2026年11月30日" → "有效期至：2026年12月31日" | engine-description -> agree=True -> engine-description | Facts I checked: - Recorded item 0 (c1) is "Changed 11月30 → 12月31", kind replace, with no numeric flag, rect [396.7,85.9,31.5,12] on both sides. Its context is "效期至：2026年 | 日致：临江设". - numbers.ts isNumericPhrase(['11','月','30']) returns false (/tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/blind5/analysis/pymupdf-incremental-redact-htmlbox-verify/repo/eval/vnum.ts). - src/web/sidebar.ts applyFilter 'numbers' keeps only c.numeric changes, and the CLI summary reads "7 text · 1 number · 1 layout". - My probe variants on the recorded items:   - as recorded: typeOk false, text false;   - numeric set: typeOk true, text false;   - 7-character context before: typeOk false, text true;   - both: found 7.  Both blockers are real. This is borderline: the date reads correctly on the item. Still, the item is filed as a text change rather than a number change, in the product's own text/number split, and it drops out of the Numbers filter and count. The Latin due date in the invoice, by contrast, is flagged as a number. This matches the round-4 precedent (V2.3→V2.4 with no numeric flag, verified engine-description). Note that the numeric flag alone would not earn credit while the 6-token CJK context stays (a scorer-or-truth part).
- holdout5-j-zh-quote-htmlbox | MISS truth #3 number "4 小时内派工程师" → "6 小时内派工程师" | scorer-or-truth -> agree=True -> scorer-or-truth | Facts I checked: - Recorded item 3 (c4) is "Number changed: 4 → 6 (+50%)", numeric. Old rect [340.8,346.6] and new [340.8,368.9]; the 22 pt shift is re-flow from the moved paragraph. Context "内电话响应， | 小时内派工程". - pdftotext diff (/tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/blind5/analysis/pymupdf-incremental-redact-htmlbox-verify/zh-before.txt vs zh-after.txt) shows only 4→6 changed on that line. - Render /tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/blind5/analysis/pymupdf-incremental-redact-htmlbox-verify/renders/zh-p1-pair.png confirms the change. - Probe: typeOk is true and text false as recorded. With contextAfter "小时内派工程师", text is true and the case finds 7. - compare.ts context() takes 6 tokens, and each CJK character is one token.  The report is correct and adequate (+50% on hours is meaningful). Only the snippet versus context length blocks the credit.
- holdout5-j-zh-quote-htmlbox | EXTRA item 0 (c1 Changed "11月30" → "12月31") | engine-description -> agree=True -> engine-description | This is the same item as miss #1. It is extra only because it is not credited to #1. The probe confirms #2 (每季度) matches only item 1, so no other truth item takes it. Its category follows miss #1.
- holdout5-j-zh-quote-htmlbox | EXTRA item 3 (c4 Number changed "4" → "6") | scorer-or-truth -> agree=True -> scorer-or-truth | This is the same item as miss #3. In the probe it is credited to #3 once the context after reaches 师, and the extra count then drops from 2 to 1. Its category follows miss #3.

verifier, anything the analyst missed: Nothing material is missing.

pdftotext diffs of all three pairs (/tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/blind5/analysis/pymupdf-incremental-redact-htmlbox-verify/{invoice,lease,zh}-{before,after}.txt) show no text edit beyond the truth items. The engine also lists no item beyond those classified. PyMuPDF finds one /Stamp 'Approved' at [186,107,314,140.7] on invoice after p. 1 and no annotations elsewhere. after.pdf has 2 %%EOF markers, and the first 42,533 bytes equal before.pdf (cmp). zh stream order equals reading order: no upward jumps in the PDF.js order (/tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/blind5/analysis/pymupdf-incremental-redact-htmlbox-verify/zh-after.order.txt). The zh renumber notice and minor m1 \"List renumbered: 4 → 3\" are accurate.

Precision notes:
1. The analyst listed one cause as an inference: that \"March 2027\" shifted by the width difference between \"15\" and \"1\". It is a fact. The engine token boxes show old \"March\" at 191.5 and new at 196.7, and \"2027\" at 221.5 and 226.7. On p. 3, \"to\" moved 366.7→353.7 and \"2027\" 399.3→380.4. All exceed TOL 2, giving \"groups 0 pairs accepted 0\" (/tmp/claude-0/-home-user-changelens/04cea7fc-2ce2-5363-a090-9a47ee0ad105/scratchpad/blind5/analysis/pymupdf-incremental-redact-htmlbox-verify/compare.instrumented.ts, run with CL_VDEBUG=1).\n2. I did not reproduce the analyst's CL_EXP experiment (invoice 6/7, lease 5/7, account split into three number items with +386%). Those figures rest on the analyst's scratch run only.\n3. The context shown to reviewers comes from the new document in stream order: textChange calls `context(B.length ? B : A, …)`, and B.length is the whole new document. The web list and report show it (report.ts excerptHtml). So the misleading contexts the analyst lists under found-item quality do reach a reviewer:\n   - invoice c2: \"INV-2026-0418 as the payment reference.\" before the due date;\n   - lease c6: \"Date: Date:\" before clause 11.2.\n   The analyst covers both, so no new entry is needed.\n4. Two credited items have weak descriptions, both noted by the analyst. Invoice c2 puts \"-40%\" on a day of the month: compare.ts has no month guard, and referenceNumber has no date rule. Lease c6, \"Added 2 paragraphs\", hides the schedule months.\n5. HEAD is 9ba0c7d (docs-only after cfa9bc5). This does not change any finding.

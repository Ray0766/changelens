#!/usr/bin/env node
// Regenerates the six blind held-out-4 cases of author g:
//   eval/cases/holdout4-g-*/{before.pdf, after.pdf, truth.json}
//
// Focus: PDFs that were assembled or post-processed after export, as happens
// in real review workflows (merging parts from different producers, page
// rotation and CropBox changes, stationery underlays and watermarks,
// annotations, filled AcroForm fields, an image-only scanned page).
//
// Usage:  NODE_PATH=/opt/node-tools/node_modules node eval/make-holdout4-g.mjs [--keep]
//
// Needs: Python 3 with python-docx, openpyxl, reportlab, pypdf, Pillow, numpy;
// LibreOffice (soffice); Playwright's Chromium; poppler-utils (pdftotext,
// pdftoppm). Helpers live in eval/holdout4-g/. All content is synthetic.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as html from './holdout4-g/html.mjs';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const helpers = path.join(here, 'holdout4-g');
const casesDir = path.join(here, 'cases');
const keep = process.argv.includes('--keep');

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'holdout4-g-'));
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'], ...opts });

// 1. Office sources (.docx/.xlsx) and images
run('python3', [path.join(helpers, 'sources.py'), work]);

// 2. LibreOffice: one conversion run with its own profile
const office = fs.readdirSync(work).filter(f => /\.(docx|xlsx)$/.test(f)).map(f => path.join(work, f));
const profile = `file:///tmp/lo-g-${process.pid}`;
run('soffice', [`-env:UserInstallation=${profile}`, '--headless', '--convert-to', 'pdf', '--outdir', work, ...office]);
fs.rmSync(new URL(profile), { recursive: true, force: true });

// 3. Chromium parts
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node-tools/node_modules/playwright'); }
const browser = await playwright.chromium.launch();
const page = await browser.newPage();
const chromiumParts = {
  'c1-price-before': html.priceSchedule({ revised: false }),
  'c1-price-after': html.priceSchedule({ revised: true }),
  'c1-datasheet': html.dataSheet(),
  'c3-letter-before': html.engagementLetter({ final: false }),
  'c3-letter-after': html.engagementLetter({ final: true }),
};
for (const [name, doc] of Object.entries(chromiumParts)) {
  await page.setContent(doc, { waitUntil: 'load' });
  await page.pdf({ path: path.join(work, `${name}.pdf`), format: 'A4', preferCSSPageSize: true, printBackground: true });
}
await browser.close();

// 4. reportlab parts, pypdf assembly and post-processing
run('python3', [path.join(helpers, 'assemble.py'), work, casesDir]);
const geom = JSON.parse(fs.readFileSync(path.join(work, 'geometry.json'), 'utf8'));

// 5. truth files. Rectangles are [x, y, w, h] in PDF points, top-left origin;
// those of drawn or pasted graphics are measured by assemble.py.
const pad = ([x, y, w, h], p) => [x - p, y - p, w + 2 * p, h + 2 * p].map(v => Math.round(v * 10) / 10);
const r1 = a => a.map(v => Math.round(v * 10) / 10);
const A4W = 595.3, A4H = 841.9;
const NO_ANNOT = 'The README does not claim support for PDF annotations.';
const NO_FORMS = 'The README does not claim support for PDF form fields.';

const cases = {
  'holdout4-g-tender-pack-merge': {
    description: 'Tender response pack assembled with pypdf from parts made by three producers: the cover letter, the insurance summary and (after only) a clarification note made with reportlab (the note in reportlab\'s non-embedded Helvetica); the technical proposal (2 pages), maintenance plan and method statement for night works made with python-docx and LibreOffice Writer; the price schedule and the product data sheet printed by Chromium. pypdf stamps a pack footer "TR-0417 response · Brackwater Lighting Co. · page X of N" on every page. Edits in the after version: a one-page "Clarification No. 1" inserted after the cover letter; the price schedule part replaced by a revised export (amount of item 3 changed, a new item 6 row, total recalculated); the insurance summary page moved from the end of the pack to directly after the price schedule. Consequences, not listed: the technical proposal and the price schedule shift by one page (old p. 2-4 → new p. 3-5) and the other three annexes by two (old p. 5-7 → new p. 7-9), and the stamped "page X of N" changes on every page (N 8 → 9); the parts\' own footers ("Technical proposal — page 1") do not change. The cover letter still lists the annexes in the old order (unchanged text).',
    truth: [
      { type: 'insert', new: 'Clarification No. 1', oldPage: 1, newPage: 2, maxItems: 7,
        note: 'Inserted after old page 1. Whole inserted page (reportlab, Helvetica): heading, reference line, four paragraphs and a signature line; one item per paragraph is acceptable.' },
      { type: 'number', old: '18,400.00', new: '21,150.00', oldPage: 4, newPage: 5,
        note: 'Price schedule item 3 "Installation and connection of luminaires".' },
      { type: 'insert', new: 'Night-time traffic management 6 nights 4,200.00', oldPage: 4, newPage: 5,
        note: 'New table row, item 6, in the replaced price schedule part.' },
      { type: 'number', old: '91,100.00', new: '98,050.00', oldPage: 4, newPage: 5,
        note: 'Total (excl. VAT), recalculated by the bidder for the two price edits; listed because a reviewer must check the new total.' },
      { type: 'move', old: 'Insurance summary', new: 'Insurance summary', oldPage: 8, newPage: 6, maxItems: 5,
        note: 'The whole one-page insurance summary (heading, reference line, paragraph, 5-row table, paragraph) moved from the last page to directly after the price schedule, unchanged. Moving it past the three other annex pages (3 pages) is the smaller description. One move item per block of the page is acceptable.' },
    ],
  },
  'holdout4-g-crop-rotate': {
    description: 'Quarterly footbridge inspection report (4 pages) assembled with pypdf: pages 1 and 4 come from one python-docx / LibreOffice Writer document, page 2 is a site plan drawn with reportlab, page 3 a landscape defect register exported by LibreOffice Calc from an openpyxl workbook. In the after version one figure on page 1 was revised in the Writer source, and the assembled file was then post-processed: page 2 was rotated by 90° by mistake (/Rotate 90, now displayed 842 × 595 pt with sideways text), and page 4 was cropped by 40 pt on the right (CropBox 595.3 → 555.3 pt wide), which cuts into the planned-works table that extends 1.4 cm into the right margin. Not a change: page 3 was re-written in the after version as a portrait MediaBox with its content turned by 90° and /Rotate 90, so it displays exactly as before (842 × 595 pt, same text, renders differ only by anti-aliasing); nothing is listed for it. Nothing re-flows. Consequence of the rotation, not listed separately: the site plan\'s footer line, which repeats the report footer, now runs vertically along the left edge.',
    truth: [
      { type: 'number', old: '11.2', new: '12.6', oldPage: 1, newPage: 1,
        note: 'Maximum deflection under the test load, in mm.' },
      { type: 'graphic', oldPage: 2, newPage: 2, oldRect: [0, 0, A4W, A4H], newRect: [0, 0, A4H, A4W],
        note: 'Whole site-plan page rotated by 90° clockwise (/Rotate 90): portrait page now displayed as landscape, drawing and labels turned. Page orientation change; content unchanged.' },
      { type: 'graphic', oldPage: 4, newPage: 4, oldRect: [0, 0, A4W, A4H], newRect: [0, 0, geom.c2_crop_width, A4H],
        note: `Page size changed by a CropBox: width ${geom.c2_page_width} → ${geom.c2_crop_width} pt, height unchanged. Same edit as the cut-off item below, but a separate finding for a reviewer (the page format changed).` },
      { type: 'overflow', old: 'Budget (EUR)', new: 'Budget (EUR)', oldPage: 4, newPage: 4, maxItems: 5,
        oldRect: geom.c2_budget_col,
        newRect: [geom.c2_budget_col[0], geom.c2_budget_col[1], r1([geom.c2_crop_width - geom.c2_budget_col[0]])[0], geom.c2_budget_col[3]],
        note: 'The right-aligned "Budget (EUR)" column (header and the amounts 4,800 / 2,350 / 6,900 / 3,150) is cut by the new right page edge; the text itself is unchanged in the content stream. pdftotext still returns the full words on the after page; PDF.js returns only the visible part ("Budget (EU", "4,8"). One item per cut line is acceptable.' },
    ],
  },
  'holdout4-g-draft-watermark': {
    description: 'Engagement letter (2 pages) printed by Chromium and post-processed with pypdf: every page is merged onto a reportlab stationery page (page 1: coloured letterhead band with logo and firm name; page 2: grey firm name and rule; both pages: footer rule with the firm\'s address line), and the draft additionally has a "DRAFT" watermark stamped over both pages (reportlab text, Helvetica-Bold 140 pt, 18 % grey, rotated 45°). The final version has no watermark, uses the updated stationery (band colour teal #0F766E → navy #1E3A5F; new office address in the footer) and has two body edits (status line, fee). Nothing re-flows; the line breaks of the body text are identical.',
    truth: [
      { type: 'delete', old: 'DRAFT', oldPage: 1, newPage: 1, maxItems: 2,
        oldRect: geom.c3_watermark, newRect: geom.c3_watermark,
        note: 'Diagonal watermark removed from both pages (same place on page 2). It is real text in the content stream, so it is listed as deleted text; it is also a visible graphic change.' },
      { type: 'graphic', oldPage: 1, newPage: 1, oldRect: geom.c3_band, newRect: geom.c3_band,
        note: 'Letterhead band colour changed from teal #0F766E to navy #1E3A5F (stationery underlay); the white logo and firm name inside are unchanged.' },
      { type: 'furniture', old: '12 Quay Street, Portmere PM2 4QT', new: '4 Mill Lane, Portmere PM1 7RS', oldPage: 1, newPage: 1, maxItems: 2,
        note: 'Address in the stationery footer line, repeated on both pages.' },
      { type: 'replace', old: 'Draft v3 for discussion', new: 'Issued for signature', oldPage: 1, newPage: 1,
        note: 'Status line in the letter heading.' },
      { type: 'number', old: '18,500', new: '19,800', oldPage: 1, newPage: 1,
        note: 'Fixed fee in EUR, section 4.' },
    ],
  },
  'holdout4-g-annotated-agreement': {
    description: 'Software support agreement (2 pages, python-docx → LibreOffice Writer) with reviewer annotations added by pypdf; every annotation has its own appearance stream (/AP) and the Print flag, so viewers draw it on the page. The draft already carried one FreeText note in the top margin of page 2. The after version is a re-export of the document with one payment term changed, plus annotation changes: a "RECEIVED 02 NOV 2026" stamp and a yellow highlight over the liability-cap sentence on page 1, a comment (sticky-note) icon next to the termination clause and new text in the FreeText note on page 2. Annotation text is drawn by the annotations\' appearance streams and is not part of the page content stream. ' + NO_ANNOT,
    truth: [
      { type: 'graphic', oldPage: 1, newPage: 1, oldRect: geom.c4_stamp, newRect: geom.c4_stamp,
        note: 'Stamp annotation added in the top margin: red double frame with "RECEIVED" and "02 NOV 2026". ' + NO_ANNOT },
      { type: 'graphic', oldPage: 1, newPage: 1, oldRect: geom.c4_highlight, newRect: geom.c4_highlight,
        note: 'Highlight annotation (yellow, multiply) added over the three lines "The Supplier\'s total liability under this agreement is limited to the fees paid in the twelve months before the claim."; the text itself is unchanged. ' + NO_ANNOT },
      { type: 'number', old: '30', new: '45', oldPage: 2, newPage: 2,
        note: 'Payment term: "Invoices are payable within 30 days of the invoice date" → 45 days (document text, clause 7).' },
      { type: 'graphic', oldPage: 2, newPage: 2, oldRect: geom.c4_sticky, newRect: geom.c4_sticky,
        note: 'Text (sticky-note) annotation icon added in the right margin next to clause 8; its pop-up text "Is three months enough for a data migration?" is not drawn on the page. ' + NO_ANNOT },
      { type: 'graphic', oldPage: 2, newPage: 2, oldRect: geom.c4_note, newRect: geom.c4_note,
        note: 'FreeText annotation in the top margin edited: "Draft for internal review / A. Kowal, 27 Oct 2026" (yellow box) → "Reviewed 2 Nov 2026: / two questions open, see notes" (blue box). ' + NO_ANNOT },
    ],
  },
  'holdout4-g-form-values': {
    description: 'Bilingual (English / Chinese) one-page equipment loan request form made with reportlab as an AcroForm (11 text fields, 2 checkboxes) and filled with pypdf; pypdf writes the appearance streams of the text fields, and the checkbox states are set through /V and /AS. The form is not flattened: the filled values are drawn by the widget annotations, not by the page content stream. The after version is the same template filled again with four values changed. ' + NO_FORMS,
    truth: [
      { type: 'number', old: '14', new: '21', oldPage: 1, newPage: 1,
        oldRect: geom.c5_boxes.loan_days, newRect: geom.c5_boxes.loan_days,
        note: 'Text field "Loan period (days)". Field value, not page content. ' + NO_FORMS },
      { type: 'number', old: '250.00', new: '400.00', oldPage: 1, newPage: 1,
        oldRect: geom.c5_boxes.deposit, newRect: geom.c5_boxes.deposit,
        note: 'Text field "Deposit (EUR)". Field value, not page content. ' + NO_FORMS },
      { type: 'graphic', oldPage: 1, newPage: 1,
        oldRect: geom.c5_boxes.insurance, newRect: geom.c5_boxes.insurance,
        note: 'Checkbox "Insurance required" changed from unticked to ticked. ' + NO_FORMS },
      { type: 'replace', old: 'Ana Duarte', new: 'Tomas Reid', oldPage: 1, newPage: 1,
        oldRect: geom.c5_boxes.collected_by, newRect: geom.c5_boxes.collected_by,
        note: 'Text field "Collected by". Field value, not page content. ' + NO_FORMS },
    ],
  },
  'holdout4-g-scanned-schedule': {
    description: 'Cleaning services agreement (4 pages) assembled with pypdf: pages 1, 2 and 4 come from one python-docx / LibreOffice Writer document (clauses; signature block with signature-and-stamp images and Schedule 1; Schedule 3 prices); page 3 is an image-only page without a text layer: a simulated grey-scale scan (150 dpi JPEG, 0.35° skew, paper tone and noise) of the signed "Schedule 2 — Site access rules" sheet. After: one sentence deleted on page 1; the Client\'s signature-and-stamp image added in the signature block on page 2 (the row has a fixed height, so nothing moves); the scan on page 3 replaced by a scan of the same sheet with a handwritten correction in rule 4 ("07:00" struck through, "06:30" and initials written above); the monthly price on page 4 changed. Consequence, not listed: the rest of the paragraph with the deleted sentence re-flows on page 1. Apart from the handwritten correction the two scan images are identical (same skew and noise).',
    truth: [
      { type: 'delete', old: 'The Supplier may subcontract window cleaning above 4 m to a specialist firm.', oldPage: 1, newPage: 1,
        note: 'Last sentence of the second paragraph of clause 1.' },
      { type: 'graphic', oldPage: 2, newPage: 2, oldRect: pad(geom.c6_sig, 2), newRect: pad(geom.c6_sig, 2),
        note: 'Signature-and-stamp image added in the "For the Client" column of the signature block (raster image in the Writer document); the cell was empty before.' },
      { type: 'graphic', oldPage: 3, newPage: 3, oldRect: pad(geom.c6_scan_change_rendered, 3), newRect: pad(geom.c6_scan_change_rendered, 3),
        note: 'Handwritten correction on the scanned, image-only page: "07:00" in rule 4 struck through, "06:30" and the initials "IS" written above. The page has no text layer; the README says scanned pages are not supported (no OCR) and that pages without text are named.' },
      { type: 'number', old: '3,480.00', new: '3,640.00', oldPage: 4, newPage: 4,
        note: 'Schedule 3, regular cleaning, monthly price (EUR).' },
    ],
  },
};

for (const [id, c] of Object.entries(cases)) {
  const truth = { description: c.description, synthetic: true, set: 'held-out-4', blind: true, truth: c.truth };
  fs.writeFileSync(path.join(casesDir, id, 'truth.json'), JSON.stringify(truth, null, 2) + '\n');
}
console.log(`wrote ${Object.keys(cases).length} cases to ${casesDir}`);

if (keep) console.log(`work files kept in ${work}`);
else fs.rmSync(work, { recursive: true, force: true });

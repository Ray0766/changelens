#!/usr/bin/env node
// Blind held-out evaluation set 3, author "c": business and legal review
// documents in English, Chinese and mixed Chinese/English (supply agreement,
// quotation, interim financial statements, board minutes, purchase contract,
// records-retention policy), with re-pagination stress: a clause moved to
// another page, an inserted page, a duplicated page, a paragraph that re-flows
// across a page break, and running header/footer changes.
//
// Written without looking at the engine, its tests or its evaluation results.
// Every company, person, address, account and amount is invented; each PDF
// carries the words "synthetic sample" in its footer.
//
// Producers (two cases each):
//   Chromium (Playwright page.pdf)            zh-av-quote-inserted-page, zh-en-board-minutes-dup-page
//   LibreOffice Writer (flat ODT -> PDF)      en-supply-agreement-move, zh-purchase-contract-reflow
//   reportlab (eval/holdout3-c/render_reportlab.py)  en-interim-financials, en-retention-policy
//
// Run:  NODE_PATH=/opt/node-tools/node_modules node eval/make-holdout3-c.mjs
// Needs: Playwright's Chromium, soffice (LibreOffice 24.x), python3 with
// reportlab, and the fonts Liberation Sans/Serif and WenQuanYi Zen Hei.
//
// truth.json: { description, synthetic, set: "held-out-3", blind, author,
// producer, truth: [{ type, old?, new?, oldPage, newPage, maxItems?, note? }] }
// Pages are 1-based. A page given as an array means "any of these pages"
// (an edit that legitimately appears on several pages). Only deliberate edits
// are listed; re-flow, page breaks moving, page numbers and page counts that
// change as a consequence are not.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, 'cases');
const helpers = join(here, 'holdout3-c');
const AUTHOR = 'c';
const only = process.argv.slice(2); // optional: case ids (without prefix) to build

const cases = [];
const add = (c) => cases.push({ ...c, id: `holdout3-${AUTHOR}-${c.id}` });

// ---------------------------------------------------------------------------
// Shared helpers
const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const rl = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const money = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const thou = (n) => (n < 0 ? `(${(-n).toLocaleString('en-US')})` : n.toLocaleString('en-US'));
const sum = (a) => a.reduce((x, y) => x + y, 0);

// Amount in Chinese capital numerals (大写), whole yuan, below 10^8.
function rmbUpper(n) {
  const d = '零壹贰叁肆伍陆柒捌玖';
  const unit = ['', '拾', '佰', '仟'];
  const big = ['', '万'];
  const groups = [n % 10000, Math.floor(n / 10000)];
  let out = '';
  for (let gi = 1; gi >= 0; gi--) {
    const g = groups[gi];
    if (g === 0) continue;
    if (out && g < 1000) out += '零';
    let gs = '';
    let zero = false;
    for (let k = 3; k >= 0; k--) {
      const dig = Math.floor(g / 10 ** k) % 10;
      if (dig === 0) { if (gs) zero = true; continue; }
      if (zero) { gs += '零'; zero = false; }
      gs += d[dig] + unit[k];
    }
    out += gs + big[gi];
  }
  return `人民币${out}元整`;
}

// --- Flat ODT (LibreOffice Writer) ------------------------------------------
// A tiny writer for .fodt files: paragraphs, run-in bold leads, tables,
// header and footer with page fields.
function makeOdt({ latin, asian = 'WenQuanYi Zen Hei', size = '11pt', lh = '130%', lang = 'en', country = 'GB', margins = '2.3cm 2.5cm 2.0cm 2.5cm', header, footer, body, tables }) {
  const [mt, mr, mb, ml] = margins.split(' ');
  const colStyles = tables.map((t) => t.widths.map((w, i) => `<style:style style:name="${t.name}.c${i}" style:family="table-column"><style:table-column-properties style:column-width="${w}cm"/></style:style>`).join('') +
    `<style:style style:name="${t.name}" style:family="table"><style:table-properties style:width="${sum(t.widths).toFixed(2)}cm" table:align="left" fo:margin-top="0.08cm" fo:margin-bottom="0.3cm"/></style:style>`).join('\n');
  const fontDecl = [latin, asian, 'Liberation Sans'].filter((v, i, a) => a.indexOf(v) === i)
    .map((f) => `<style:font-face style:name="${f}" svg:font-family="'${f}'"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" office:version="1.3" office:mimetype="application/vnd.oasis.opendocument.text">
<office:meta><dc:title>Synthetic sample</dc:title><meta:initial-creator>synthetic sample (ChangeLens held-out-3, author c)</meta:initial-creator></office:meta>
<office:font-face-decls>${fontDecl}</office:font-face-decls>
<office:styles>
 <style:default-style style:family="paragraph">
  <style:paragraph-properties fo:orphans="2" fo:widows="2" style:line-break="strict"/>
  <style:text-properties style:font-name="${latin}" fo:font-size="${size}" style:font-name-asian="${asian}" style:font-size-asian="${size}" fo:language="${lang}" fo:country="${country}" style:language-asian="zh" style:country-asian="CN" fo:color="#1d2228"/>
 </style:default-style>
 <style:style style:name="Standard" style:family="paragraph" style:class="text"/>
 <style:style style:name="Body" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0.2cm" fo:text-align="justify" fo:line-height="${lh}"/></style:style>
 <style:style style:name="BodyL" style:family="paragraph" style:parent-style-name="Body"><style:paragraph-properties fo:text-align="start" fo:margin-bottom="0.05cm"/></style:style>
 <style:style style:name="Hang" style:family="paragraph" style:parent-style-name="Body"><style:paragraph-properties fo:margin-left="0.9cm" fo:text-indent="-0.9cm"/></style:style>
 <style:style style:name="Title" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:margin-bottom="0.35cm" fo:text-align="center"/><style:text-properties fo:font-size="18pt" fo:font-weight="bold" style:font-size-asian="18pt" style:font-weight-asian="bold"/></style:style>
 <style:style style:name="H" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:margin-top="0.32cm" fo:margin-bottom="0.14cm" fo:keep-with-next="always"/><style:text-properties fo:font-weight="bold" style:font-weight-asian="bold" fo:font-size="12pt" style:font-size-asian="12pt"/></style:style>
 <style:style style:name="Cell" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:text-align="start"/><style:text-properties fo:font-size="9.5pt" style:font-size-asian="9.5pt"/></style:style>
 <style:style style:name="CellR" style:family="paragraph" style:parent-style-name="Cell"><style:paragraph-properties fo:text-align="end"/></style:style>
 <style:style style:name="CellB" style:family="paragraph" style:parent-style-name="Cell"><style:text-properties fo:font-weight="bold" style:font-weight-asian="bold"/></style:style>
 <style:style style:name="CellBR" style:family="paragraph" style:parent-style-name="CellB"><style:paragraph-properties fo:text-align="end"/></style:style>
 <style:style style:name="Header" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:text-align="start" fo:padding-bottom="0.08cm" fo:border-bottom="0.4pt solid #9aa3ab"/><style:text-properties style:font-name="Liberation Sans" fo:font-size="8pt" style:font-size-asian="8pt" fo:color="#5d646c"/></style:style>
 <style:style style:name="Footer" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:text-align="end"/><style:text-properties style:font-name="Liberation Sans" fo:font-size="8pt" style:font-size-asian="8pt" fo:color="#5d646c"/></style:style>
</office:styles>
<office:automatic-styles>
 <style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm" fo:margin-top="${mt}" fo:margin-right="${mr}" fo:margin-bottom="${mb}" fo:margin-left="${ml}"/>
  <style:header-style><style:header-footer-properties fo:min-height="0cm" fo:margin-bottom="0.45cm"/></style:header-style>
  <style:footer-style><style:header-footer-properties fo:min-height="0cm" fo:margin-top="0.45cm"/></style:footer-style>
 </style:page-layout>
 <style:style style:name="Rkeep" style:family="table-row"><style:table-row-properties fo:keep-together="always"/></style:style>
 <style:style style:name="B" style:family="text"><style:text-properties fo:font-weight="bold" style:font-weight-asian="bold"/></style:style>
 <style:style style:name="Cbox" style:family="table-cell"><style:table-cell-properties fo:padding="0.09cm" fo:border="0.5pt solid #7f8790"/></style:style>
 <style:style style:name="Chead" style:family="table-cell"><style:table-cell-properties fo:padding="0.09cm" fo:border="0.5pt solid #7f8790" fo:background-color="#e8ecef"/></style:style>
 <style:style style:name="Cnone" style:family="table-cell"><style:table-cell-properties fo:padding-top="0.05cm" fo:padding-bottom="0.12cm" fo:padding-left="0cm" fo:padding-right="0.3cm" fo:border="none"/></style:style>
 ${colStyles}
</office:automatic-styles>
<office:master-styles>
 <style:master-page style:name="Standard" style:page-layout-name="pm1">
  <style:header><text:p text:style-name="Header">${header}</text:p></style:header>
  <style:footer><text:p text:style-name="Footer">${footer}</text:p></style:footer>
 </style:master-page>
</office:master-styles>
<office:body><office:text>
${body}
</office:text></office:body>
</office:document>
`;
}
const pageField = '<text:page-number text:select-page="current">1</text:page-number>';
const countField = '<text:page-count>1</text:page-count>';
const oP = (style, inner) => `<text:p text:style-name="${style}">${inner}</text:p>`;
const oB = (t) => `<text:span text:style-name="B">${xml(t)}</text:span>`;
// rows: array of arrays of cell strings (plain text); opts.head rows count,
// opts.align string like 'LLRR', opts.bold set of row indexes, opts.border.
function oTable(def, rows, { head = 1, align = '', bold = [], border = true } = {}) {
  const cols = def.widths.map((_, i) => `<table:table-column table:style-name="${def.name}.c${i}"/>`).join('');
  const trs = rows.map((r, ri) => {
    const isB = ri < head || bold.includes(ri);
    const cellStyle = !border ? 'Cnone' : ri < head ? 'Chead' : 'Cbox';
    const tds = r.map((c, ci) => {
      const right = align[ci] === 'R';
      const ps = isB ? (right ? 'CellBR' : 'CellB') : right ? 'CellR' : 'Cell';
      const lines = String(c).split('\n').map((l) => oP(ps, xml(l))).join('');
      return `<table:table-cell table:style-name="${cellStyle}" office:value-type="string">${lines}</table:table-cell>`;
    }).join('');
    return `<table:table-row table:style-name="Rkeep">${tds}</table:table-row>`;
  }).join('');
  const headRows = head ? `<table:table-header-rows>${trs.split('</table:table-row>').slice(0, head).map((x) => x + '</table:table-row>').join('')}</table:table-header-rows>` : '';
  const bodyRows = trs.split('</table:table-row>').slice(head, -1).map((x) => x + '</table:table-row>').join('');
  return `<table:table table:name="${def.name}" table:style-name="${def.name}">${cols}${headRows}${bodyRows}</table:table>`;
}

// --- Chromium ----------------------------------------------------------------
const html = (css, body) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`;
const tpl = (text, font, align = 'left') =>
  `<div style="font-size:7.5pt;width:100%;padding:0 18mm;color:#5d646c;font-family:${font};text-align:${align}">${text}</div>`;
const pageOf = (fmt) => fmt.replace(/\{p\}/g, '<span class="pageNumber"></span>').replace(/\{n\}/g, '<span class="totalPages"></span>');

// ===========================================================================
// 1. Master supply agreement (EN, LibreOffice Writer).
// The force-majeure paragraph moves from section 5 to section 14 on the last
// page; delivery Incoterm, payment days and liability cap change; a warranty
// sentence is added; the survival sentence is removed; the running header
// changes from the discussion draft to the execution version on every page.
{
  const lead = (l, t) => oP('Body', `${oB(l)} ${xml(t)}`);
  const H = (t) => oP('H', xml(t));
  const fm = lead('Force majeure.', 'Neither party is liable for any delay or failure in performing its obligations under this Agreement to the extent that it is caused by an event beyond its reasonable control, including fire, flood, storm, epidemic, war, terrorism, riot, a strike not limited to its own workforce, failure of a public utility or an act of a government authority. The affected party must notify the other party promptly, describe the event and its likely duration, and use reasonable endeavours to limit its effects. If the event continues for more than ninety days, either party may terminate this Agreement by giving thirty days’ written notice.');
  const sig = { name: 'Sig', widths: [8, 8] };
  const doc = (v) => makeOdt({
    latin: 'Liberation Serif', size: '10.5pt', lh: '124%',
    header: xml(`Brindlemoor Packaging Ltd / Orrinvale Polymers B.V. · Master Supply Agreement · ${v.status}`),
    footer: `Synthetic sample · Page ${pageField} of ${countField}`,
    tables: [sig],
    body: [
      oP('Title', 'Master Supply Agreement'),
      oP('Body', xml('This Master Supply Agreement (the “Agreement”) is made on 3 November 2026 between:')),
      oP('Hang', xml('(1)\tBrindlemoor Packaging Ltd, a company registered in England and Wales under number 11904372, whose registered office is at Unit 6, Quarry Lane Trading Estate, Leeds LS11 8QD (the “Customer”); and').replace('\t', '<text:tab/>')),
      oP('Hang', xml('(2)\tOrrinvale Polymers B.V., a company registered in the Netherlands under number 73519046, whose registered office is at Havenweg 41, 3133 KM Vlaardingen (the “Supplier”).').replace('\t', '<text:tab/>')),
      oP('Body', xml('The Supplier manufactures recycled polyethylene films and granulates. The Customer wishes to buy these products for its food-packaging lines, and the parties have agreed the following terms for all supplies made during the term of this Agreement.')),
      H('1. Definitions'),
      oP('Body', xml('In this Agreement: “Products” means the recycled polyethylene films and granulates described in Schedule 1; “Order” means a purchase order issued by the Customer under section 2; “Specification” means the technical specification for each Product in Schedule 2, as amended in writing by the parties; “Business Day” means a day other than a Saturday, Sunday or public holiday in England or the Netherlands; and “Contract Year” means each period of twelve months starting on the Effective Date or an anniversary of it.')),
      oP('Body', xml('Headings do not affect the interpretation of this Agreement. A reference to a section is to a section of this Agreement, and the words “including” and “in particular” do not limit the words before them.')),
      H('2. Supply and ordering'),
      lead('Framework.', 'This Agreement sets the terms on which the Supplier will sell and the Customer may buy the Products. It does not oblige the Customer to place any minimum volume of Orders, except as stated in Schedule 3.'),
      lead('Orders.', 'Each Order must state the Products, quantities, delivery dates and delivery address. An Order is accepted when the Supplier confirms it in writing or, if earlier, when the Supplier starts to deliver it. The Supplier will not unreasonably reject an Order that is consistent with the latest forecast.'),
      lead('Forecasts.', 'By the tenth Business Day of each month the Customer will give the Supplier a non-binding rolling forecast of its requirements for the next six months. The Supplier will plan its production capacity on the basis of these forecasts.'),
      H('3. Delivery'),
      lead('Delivery terms.', `The Supplier will deliver the Products ${v.incoterm}, Incoterms 2020, at the delivery address stated in the Order. Risk in the Products passes on delivery; ownership passes when the Customer has paid for them in full.`),
      lead('Delivery dates.', 'The Supplier will deliver each Order on the date stated in it, or within fifteen Business Days of acceptance if no date is stated. Each delivery must include a delivery note showing the Order number, the batch numbers and the quantity of each Product.'),
      lead('Late delivery.', 'If a delivery is more than five Business Days late, the Customer may cancel the affected part of the Order without liability, or claim a service credit of two per cent of the value of the late Products for each further week of delay, up to a maximum of ten per cent.'),
      H('4. Prices and payment'),
      lead('Prices.', 'The prices of the Products are set out in Schedule 3. They are exclusive of VAT and are fixed until 31 December 2027. After that date the Supplier may change them once per Contract Year by giving at least ninety days’ written notice, and any increase may not exceed the change in the published index for recycled polymer prices over the previous twelve months.'),
      lead('Invoices.', `The Supplier may invoice each delivery on or after the date of delivery. The Customer will pay each undisputed invoice within ${v.days} days of the date of receipt, by bank transfer to the account stated on the invoice.`),
      lead('Disputed invoices.', 'The Customer must notify the Supplier of any disputed amount within ten Business Days of receiving the invoice, giving its reasons, and pay the undisputed part on time. The parties will try in good faith to resolve the dispute within thirty days.'),
      lead('Late payment.', 'Interest on overdue amounts accrues at four per cent per year above the main refinancing rate of the European Central Bank, from the due date until the date of payment.'),
      H('5. Supply security'),
      lead('Capacity.', 'The Supplier will keep available sufficient production capacity to supply at least 120 per cent of the Customer’s most recent six-month forecast, and will tell the Customer at once if it expects not to be able to do so.'),
      v.fmEarly ? fm : '',
      lead('Allocation.', 'If the Supplier cannot meet all of its customers’ demand for a Product, it will allocate its available output fairly and will give the Customer at least the same share of that output as the Customer bought in the previous six months.'),
      H('6. Quality and inspection'),
      lead('Specification.', 'All Products must conform to the Specification, be manufactured under the Supplier’s certified quality management system and be fit for use in contact with food in accordance with applicable law.'),
      lead('Inspection.', 'The Customer may inspect and test each delivery within ten Business Days of receipt. The Customer is not deemed to have accepted Products that it has not had a reasonable opportunity to inspect.'),
      lead('Rejected Products.', 'The Customer may reject any Products that do not conform to the Specification by notice to the Supplier. The Supplier will collect rejected Products at its own cost within five Business Days and, at the Customer’s option, replace them or refund the price paid for them.'),
      H('7. Warranty'),
      lead('Warranty.', `The Supplier warrants that for twelve months from delivery the Products will conform to the Specification and will be free from defects in materials and workmanship.${v.warrantyRestart ? ' Replacement Products carry a new warranty period starting on their own date of delivery.' : ''} The warranty does not cover defects caused by the Customer’s storage or processing of the Products contrary to the Supplier’s written instructions.`),
      lead('Remedies.', 'If Products do not comply with the warranty, the Supplier will, at the Customer’s option, repair or replace them or refund the price paid, and will reimburse the Customer’s reasonable costs of removing and disposing of the defective Products.'),
      H('8. Intellectual property'),
      oP('Body', xml('Each party keeps all intellectual property rights it owned before the Effective Date. The Supplier grants the Customer a non-exclusive, royalty-free licence to use any intellectual property in the Products to the extent necessary for the Customer to use, process and resell them. The Supplier will indemnify the Customer against any claim that the Products infringe a third party’s rights.')),
      H('9. Confidentiality'),
      oP('Body', xml('Each party will keep confidential all information about the other party’s business that it receives under this Agreement, use it only to perform this Agreement and disclose it only to its employees, advisers and subcontractors who need to know it and are bound by equivalent obligations. This section does not apply to information that is or becomes public other than through a breach of this Agreement, and it continues for five years after this Agreement ends.')),
      H('10. Liability'),
      lead('Exclusions.', 'Nothing in this Agreement limits either party’s liability for death or personal injury caused by negligence, for fraud, or for any liability that cannot be limited by law. Neither party is liable for loss of profit, loss of business or any indirect or consequential loss.'),
      lead('Cap.', `Subject to the exclusions above, the total liability of each party under or in connection with this Agreement in each Contract Year is limited to EUR ${v.cap}.`),
      lead('Insurance.', 'The Supplier will maintain product liability insurance with a reputable insurer for at least EUR 5,000,000 per claim and will provide a certificate of insurance on request.'),
      H('11. Term and termination'),
      lead('Term.', 'This Agreement starts on 1 January 2027 (the “Effective Date”) and continues for three years. It then continues until either party ends it by giving at least six months’ written notice.'),
      lead('Termination for cause.', 'Either party may terminate this Agreement with immediate effect by written notice if the other party commits a material breach that is not remedied within thirty days of being notified of it, or if the other party becomes insolvent or ceases to carry on business.'),
      lead('Consequences.', `On termination the Customer will pay for all Products delivered and for Orders already accepted, unless the Agreement was terminated because of the Supplier’s breach.${v.survival ? ' Sections 8, 9, 10 and 13 survive termination.' : ''} Termination does not affect any rights that accrued before it.`),
      H('12. Data protection'),
      oP('Body', xml('Each party will process any personal data it receives from the other, such as the names and contact details of employees, only for the purpose of managing this Agreement and in accordance with applicable data protection law.')),
      H('13. Notices'),
      oP('Body', xml('Notices under this Agreement must be in writing and sent to the address of the receiving party set out above, marked for the attention of its company secretary, with a copy by email. A notice is received on delivery if delivered by hand, and on the second Business Day after posting if sent by recorded delivery.')),
      H('14. General'),
      lead('Assignment.', 'Neither party may assign or transfer this Agreement without the prior written consent of the other party, which may not be unreasonably withheld.'),
      lead('Entire agreement.', 'This Agreement and its Schedules form the entire agreement between the parties and replace any earlier arrangements about its subject matter.'),
      lead('Variation.', 'A variation of this Agreement is valid only if it is in writing and signed by both parties.'),
      v.fmEarly ? '' : fm,
      lead('Third parties.', 'No one other than the parties has a right to enforce any term of this Agreement.'),
      lead('Governing law.', 'This Agreement is governed by the law of England and Wales, and the courts of England have exclusive jurisdiction over any dispute arising from it.'),
      oP('Body', ''),
      oTable(sig, [[
        'Signed for and on behalf of\nBrindlemoor Packaging Ltd\n\nName: ____________________________\nTitle: _____________________________\nDate: _____________________________',
        'Signed for and on behalf of\nOrrinvale Polymers B.V.\n\nName: ____________________________\nTitle: _____________________________\nDate: _____________________________',
      ]], { head: 0, border: false }),
    ].join('\n'),
  });
  add({
    id: 'en-supply-agreement-move',
    producer: 'LibreOffice Writer 24.2 (flat ODT converted with soffice --convert-to pdf)',
    description: 'Synthetic sample. Master supply agreement between two invented companies (EN, LibreOffice Writer, 4 → 4 pages). Edits: the running header changes from “DRAFT 3 FOR DISCUSSION” to “EXECUTION VERSION” on every page; the unchanged force-majeure paragraph moves from section 5 (page 2) to section 14 (page 4); the Incoterm changes from DAP to FCA; the payment term changes from 45 to 60 days; a sentence about the warranty of replacement products is added; the liability cap changes from EUR 2,500,000 to EUR 1,500,000; and the survival sentence in the termination section is deleted. Consequences that are not edits: the text of pages 2–4 re-flows and page breaks move, because the moved paragraph leaves page 2 and lands on page 4 (section 7, for example, starts on old page 3 but on new page 2). Section numbers do not change (clauses inside sections are unnumbered run-in headings).',
    kind: 'odt',
    before: doc({ status: 'DRAFT 3 FOR DISCUSSION', incoterm: 'DAP (Delivered at Place)', days: '45', cap: '2,500,000', fmEarly: true, warrantyRestart: false, survival: true }),
    after: doc({ status: 'EXECUTION VERSION', incoterm: 'FCA (Free Carrier)', days: '60', cap: '1,500,000', fmEarly: false, warrantyRestart: true, survival: false }),
    truth: [
      { type: 'furniture', old: 'DRAFT 3 FOR DISCUSSION', new: 'EXECUTION VERSION', oldPage: [1, 2, 3, 4], newPage: [1, 2, 3, 4], maxItems: 4, note: 'Running header, same change on every page; one aggregated item or one per page are both fine.' },
      { type: 'replace', old: 'DAP (Delivered at Place)', new: 'FCA (Free Carrier)', oldPage: 1, newPage: 1 },
      { type: 'number', old: '45', new: '60', oldPage: 2, newPage: 2, note: 'Payment term in days (section 4, Invoices).' },
      { type: 'move', old: 'Neither party is liable for any delay or failure', new: 'Neither party is liable for any delay or failure', oldPage: 2, newPage: 4, note: 'Whole force-majeure paragraph, text unchanged, from section 5 to section 14.' },
      { type: 'insert', new: 'Replacement Products carry a new warranty period starting on their own date of delivery.', oldPage: 3, newPage: 2, note: 'Section 7 is on old page 3 and, after the force-majeure paragraph left page 2, on new page 2.' },
      { type: 'number', old: '2,500,000', new: '1,500,000', oldPage: 3, newPage: 3 },
      { type: 'delete', old: 'Sections 8, 9, 10 and 13 survive termination.', oldPage: 3, newPage: 3 },
    ],
  });
}

// ===========================================================================
// 2. Chinese quotation for an AV integration project (ZH, Chromium, 3 -> 4).
// A full optional-maintenance page is inserted between the price summary and
// the commercial terms; the quotation date, the discount and therefore the
// total (in figures and in Chinese capital numerals) change; three commercial
// terms change on the page that moves from 3 to 4.
{
  const equipment = [
    ['LED小间距显示屏（P1.5）', 'LM-P15', 13, '平方米', 9850],
    ['显示屏视频控制器', 'LM-VC4', 1, '台', 18600],
    ['数字音频处理器', 'DA-1616', 1, '台', 21400],
    ['线阵列扬声器', 'LA-210', 4, '只', 8900],
    ['超低频扬声器', 'SW-18', 2, '只', 7350],
    ['四通道功率放大器', 'PA-4800', 3, '台', 6200],
    ['无线手持话筒（一拖二）', 'WM-H2', 4, '套', 3980],
    ['会议发言单元', 'CU-30', 12, '只', 1650],
    ['高清视频会议终端', 'VC-900', 1, '套', 26800],
    ['4K云台摄像机', 'PTZ-4K20', 2, '台', 9200],
    ['中央控制主机', 'CC-8', 1, '台', 12500],
    ['无线触控面板', 'TP-10', 2, '台', 3600],
    ['标准机柜及配电单元', 'RK-42', 1, '套', 8450],
    ['线材及安装辅材', '—', 1, '批', 15800],
  ];
  const services = [
    ['系统深化设计及施工图', 9800],
    ['设备安装、布线及机柜集成', 24600],
    ['系统联合调试', 12000],
    ['操作培训（2次，每次半天）', 3000],
    ['竣工资料及验收配合', 2000],
  ];
  const eqTotal = sum(equipment.map((r) => r[2] * r[4]));
  const svTotal = sum(services.map((r) => r[1]));
  const css = `
    @page { size: A4; }
    body { font-family: 'WenQuanYi Zen Hei', sans-serif; font-size: 9.5pt; line-height: 1.55; color: #1d2228; margin: 0; padding: 0 18mm; }
    h1 { font-size: 20pt; letter-spacing: 6pt; text-align: center; margin: 0 0 10pt; }
    h2 { font-size: 12pt; margin: 12pt 0 6pt; padding-left: 6pt; border-left: 3pt solid #33506e; }
    p { margin: 0 0 7pt; text-align: justify; }
    .page { break-before: page; }
    table { border-collapse: collapse; width: 100%; margin: 4pt 0 10pt; }
    th, td { border: 0.6pt solid #98a2ac; padding: 3.2pt 5pt; text-align: left; vertical-align: top; }
    th { background: #e7ecf1; font-weight: 700; }
    td.n, th.n { text-align: right; white-space: nowrap; }
    tr.sum td { font-weight: 700; background: #f4f6f8; }
    table.info td:nth-child(odd) { background: #f4f6f8; width: 16%; font-weight: 700; }
    ol { margin: 0 0 8pt; padding-left: 18pt; } li { margin: 0 0 6pt; text-align: justify; }
    .stamp { display: flex; gap: 14mm; margin-top: 18pt; } .stamp div { flex: 1; border-top: 0.6pt solid #1d2228; padding-top: 5pt; line-height: 2; }
    .note { font-size: 8.5pt; color: #4b525a; }
  `;
  const doc = (v) => {
    const total = eqTotal + svTotal - v.discount;
    return html(css, `
      <h1>报价单</h1>
      <table class="info">
        <tr><td>报价编号</td><td>QT-2026-1187</td><td>报价日期</td><td>${v.date}</td></tr>
        <tr><td>客户名称</td><td>杭州云岫湾文化发展有限公司</td><td>客户联系人</td><td>孟晓岚 女士</td></tr>
        <tr><td>项目名称</td><td colspan="3">云岫湾艺术中心多功能厅音视频系统集成</td></tr>
        <tr><td>报价单位</td><td>上海澄屿视听工程有限公司</td><td>销售联系人</td><td>唐一鸣　021-5480 7719</td></tr>
      </table>
      <p>感谢贵司对我司的信任。根据贵司提供的《多功能厅音视频系统需求说明》（2026年10月版）及我司现场勘察结果，现将设备、服务费用及商务条款报价如下。所列单价均为人民币含税单价。</p>
      <h2>设备清单</h2>
      <table>
        <tr><th>序号</th><th>设备名称</th><th>型号</th><th class="n">数量</th><th>单位</th><th class="n">单价（元）</th><th class="n">金额（元）</th></tr>
        ${equipment.map((r, i) => `<tr><td>${i + 1}</td><td>${r[0]}</td><td>${r[1]}</td><td class="n">${r[2]}</td><td>${r[3]}</td><td class="n">${money(r[4])}</td><td class="n">${money(r[2] * r[4])}</td></tr>`).join('')}
        <tr class="sum"><td colspan="6">设备小计</td><td class="n">${money(eqTotal)}</td></tr>
      </table>
      <p class="note">注：LED显示屏面积按 4.8 m × 2.7 m 计算并向上取整；最终数量以深化设计图纸为准。</p>
      <div class="page">
        <h2>安装、调试与培训服务</h2>
        <table>
          <tr><th>序号</th><th>服务内容</th><th class="n">数量</th><th class="n">金额（元）</th></tr>
          ${services.map((r, i) => `<tr><td>${i + 1}</td><td>${r[0]}</td><td class="n">1 项</td><td class="n">${money(r[1])}</td></tr>`).join('')}
          <tr class="sum"><td colspan="3">服务小计</td><td class="n">${money(svTotal)}</td></tr>
        </table>
        <h2>报价汇总</h2>
        <table>
          <tr><th>项目</th><th class="n">金额（元）</th></tr>
          <tr><td>设备小计</td><td class="n">${money(eqTotal)}</td></tr>
          <tr><td>服务小计</td><td class="n">${money(svTotal)}</td></tr>
          <tr><td>项目优惠</td><td class="n">-${money(v.discount)}</td></tr>
          <tr class="sum"><td>报价合计（含税）</td><td class="n">${money(total)}</td></tr>
          <tr><td>合计大写</td><td>${rmbUpper(total)}</td></tr>
        </table>
        <p>以上价格均为含税价，含13%增值税。如需开具增值税专用发票，请于签约时提供开票信息。报价不含土建、强电改造及装饰工程，如需我司配合，费用另行协商。</p>
      </div>
      ${v.maintenance ? `<div class="page">
        <h2>可选项目：年度维保服务</h2>
        <p>质保期满后，贵司可选择购买我司年度维保服务。维保服务费用不计入上述报价合计，可在签约时或质保期满前单独选择。</p>
        <table>
          <tr><th>服务内容</th><th>标准维保</th><th>高级维保</th></tr>
          <tr><td>定期巡检</td><td>每季度1次</td><td>每月1次</td></tr>
          <tr><td>远程技术支持</td><td>工作日 9:00–18:00</td><td>每天 24 小时</td></tr>
          <tr><td>现场故障响应</td><td>8小时内到场</td><td>2小时内到场</td></tr>
          <tr><td>备品备件</td><td>按成本价提供</td><td>常用备件免费更换</td></tr>
          <tr><td>重大活动保障</td><td>不含</td><td>每年4次现场值守</td></tr>
          <tr><td>系统健康报告</td><td>每年1份</td><td>每季度1份</td></tr>
          <tr class="sum"><td>年度费用（含税）</td><td>28,000.00元/年</td><td>46,000.00元/年</td></tr>
        </table>
        <p>维保合同期限为一年，到期前三十日内双方可协商续签。维保范围仅限本报价单所列设备，不含因人为损坏、雷击、进水或电源异常造成的故障，此类故障的维修费用另行报价。</p>
        <p>选择高级维保的，我司将指定一名驻场工程师作为固定联系人，并在每次重大活动前完成系统全面检查和备份。</p>
      </div>` : ''}
      <div class="page">
        <h2>商务条款</h2>
        <ol>
          <li><b>付款方式：</b>合同签订后七个工作日内预付合同总额的30%；${v.payTrigger}支付60%；系统验收合格满12个月后支付剩余10%。</li>
          <li><b>交货期：</b>合同签订并收到预付款后${v.delivery}个日历日内完成供货，安装调试周期约15个工作日。</li>
          <li><b>质保：</b>设备自验收合格之日起质保${v.warranty}个月（LED显示屏灯珠质保5年），质保期内非人为损坏免费维修或更换。</li>
          <li><b>售后响应：</b>接到报修后2小时内电话响应，24小时内派工程师到达现场。</li>
          <li><b>报价有效期：</b>本报价自报价日期起30日内有效；超过有效期的，以我司重新确认的价格为准。</li>
          <li><b>其他：</b>本报价单经双方盖章确认后，可作为合同附件。未尽事宜由双方在合同中另行约定。</li>
        </ol>
        <div class="stamp">
          <div>报价单位（盖章）：上海澄屿视听工程有限公司<br>经办人：<br>日期：</div>
          <div>客户确认（盖章）：<br>经办人：<br>日期：</div>
        </div>
      </div>
    `);
  };
  const v0 = { date: '2026年11月3日', discount: 5000, maintenance: false, payTrigger: '设备到货后', delivery: '30', warranty: '36' };
  const v1 = { date: '2026年11月10日', discount: 8000, maintenance: true, payTrigger: '安装调试验收合格后', delivery: '45', warranty: '24' };
  const t0 = eqTotal + svTotal - v0.discount;
  const t1 = eqTotal + svTotal - v1.discount;
  add({
    id: 'zh-av-quote-inserted-page',
    producer: 'Chromium (Playwright page.pdf)',
    description: `合成样例 synthetic sample. 中文音视频系统集成报价单（Chromium，3 → 4 页）。修改：第1页报价日期 3日 → 10日；第2页项目优惠 -5,000.00 → -8,000.00，因此报价合计 ${money(t0)} → ${money(t1)}，合计大写同步修改；在报价汇总页与商务条款页之间插入一整页“可选项目：年度维保服务”（不计入合计）；商务条款页（旧第3页 → 新第4页）中付款节点、交货期和质保期修改。未修改但随之变化的：商务条款页的页码、页脚“共 n 页”。设备清单和服务费用未改。`,
    kind: 'chromium',
    before: doc(v0),
    after: doc(v1),
    pdfOpts: {
      headerTemplate: tpl('上海澄屿视听工程有限公司 · 报价单 QT-2026-1187', "'WenQuanYi Zen Hei', sans-serif"),
      footerTemplate: tpl(pageOf('合成样例 synthetic sample · 第 {p} 页 / 共 {n} 页'), "'WenQuanYi Zen Hei', sans-serif", 'right'),
    },
    totals: { t0, t1, u0: rmbUpper(t0), u1: rmbUpper(t1) },
    truth: [
      { type: 'number', old: '2026年11月3日', new: '2026年11月10日', oldPage: 1, newPage: 1, note: 'Quotation date; only the day changes.' },
      { type: 'number', old: '-5,000.00', new: '-8,000.00', oldPage: 2, newPage: 2, note: 'Discount, negative sign kept.' },
      { type: 'number', old: money(t0), new: money(t1), oldPage: 2, newPage: 2, note: 'Quotation total follows the new discount (deliberately recalculated).' },
      { type: 'replace', old: '__U0__', new: '__U1__', oldPage: 2, newPage: 2, note: 'The same total in Chinese capital numerals (大写); a word change, may also be reported as a number change.' },
      { type: 'insert', new: '可选项目：年度维保服务', newPage: 3, note: 'Whole inserted page (optional maintenance service with a table); one item expected.' },
      { type: 'replace', old: '设备到货后', new: '安装调试验收合格后', oldPage: 3, newPage: 4, note: 'Payment milestone for the 60% instalment.' },
      { type: 'number', old: '30个日历日', new: '45个日历日', oldPage: 3, newPage: 4, note: 'Delivery period.' },
      { type: 'number', old: '36个月', new: '24个月', oldPage: 3, newPage: 4, note: 'Warranty period.' },
    ],
  });
}

// ===========================================================================
// 3. Interim financial statements (EN, reportlab, 3 -> 3).
// Corrections between the audit-committee draft and the approved version:
// two highlight figures (signed, with currency and percent), the sign of one
// income-statement line in parentheses notation, a reclassification between
// two balance-sheet lines, and in the notes a currency code, a covenant ratio
// and a new waiver sentence; the footer status changes on every page.
{
  const reportSpec = (v) => {
    const is = [
      ['', 'Note', 'H1 2026', 'H1 2025'],
      ['Revenue', '3', '148,236', '139,604'],
      ['Cost of sales', '', '(97,415)', '(90,118)'],
      ['Gross profit', '', '50,821', '49,486'],
      ['Administrative expenses', '', '(31,904)', '(29,377)'],
      ['Other gains/(losses)', '4', v.otherGains, '1,045'],
      ['Operating profit', '', '18,605', '21,154'],
      ['Finance income', '', '486', '211'],
      ['Finance costs', '5', '(6,927)', '(5,390)'],
      ['Profit before tax', '', '12,164', '15,975'],
      ['Income tax expense', '6', '(3,041)', '(3,834)'],
      ['Profit for the period', '', '9,123', '12,141'],
      ['Attributable to owners of the parent', '', '8,876', '11,902'],
      ['Attributable to non-controlling interests', '', '247', '239'],
      ['Basic earnings per share (pence)', '7', '7.42', '9.95'],
      ['Diluted earnings per share (pence)', '7', '7.38', '9.89'],
    ];
    const soci = [
      ['', 'H1 2026', 'H1 2025'],
      ['Profit for the period', '9,123', '12,141'],
      ['Exchange differences on translation of foreign operations', '(1,286)', '2,034'],
      ['Cash flow hedges: fair value movements', '(842)', '615'],
      ['Other comprehensive (expense)/income', '(2,128)', '2,649'],
      ['Total comprehensive income for the period', '6,995', '14,790'],
    ];
    // Balance sheet (£000). Current liabilities are negative.
    const nca = [['Property, plant and equipment', 312480, 305912], ['Right-of-use assets', 46215, 48903], ['Intangible assets', 18760, 19334], ['Deferred tax assets', 2145, 1987]];
    const ca = [['Inventories', 4318, 4027], ['Trade and other receivables', 15902, 13486], ['Cash and cash equivalents', 14208, 17526]];
    const cl = [['Trade and other payables', -v.payables, -24115], ['Provisions', -v.provisions, -2874], ['Current tax liabilities', -1408, -1962], ['Lease liabilities', -6512, -6390]];
    const ncl = [['Borrowings', -110400, -106200], ['Lease liabilities', -44018, -46857], ['Deferred tax liabilities', -9326, -9018]];
    const tot = (rows, k) => sum(rows.map((r) => r[k]));
    const netAssets = (k) => tot(nca, k) + tot(ca, k) + tot(cl, k) + tot(ncl, k);
    const eqFixed = [['Share capital', 12400, 12400], ['Share premium', 48615, 48615], ['Hedging and translation reserves', 3182, 5310]];
    const nci = [1862, 1615];
    const retained = [1, 2].map((k) => netAssets(k) - tot(eqFixed, k) - nci[k - 1]);
    const r3 = (label, a, b) => [label, thou(a), thou(b)];
    const bs = [
      ['', '30 Jun 2026', '31 Dec 2025'],
      ['Non-current assets', '', ''],
      ...nca.map((r) => r3(r[0], r[1], r[2])),
      r3('Total non-current assets', tot(nca, 1), tot(nca, 2)),
      ['Current assets', '', ''],
      ...ca.map((r) => r3(r[0], r[1], r[2])),
      r3('Total current assets', tot(ca, 1), tot(ca, 2)),
      r3('Total assets', tot(nca, 1) + tot(ca, 1), tot(nca, 2) + tot(ca, 2)),
      ['Current liabilities', '', ''],
      ...cl.map((r) => r3(r[0], r[1], r[2])),
      r3('Total current liabilities', tot(cl, 1), tot(cl, 2)),
      ['Non-current liabilities', '', ''],
      ...ncl.map((r) => r3(r[0], r[1], r[2])),
      r3('Total non-current liabilities', tot(ncl, 1), tot(ncl, 2)),
      r3('Net assets', netAssets(1), netAssets(2)),
      ['Equity', '', ''],
      ...eqFixed.map((r) => r3(r[0], r[1], r[2])),
      r3('Retained earnings', retained[0], retained[1]),
      r3('Equity attributable to owners of the parent', netAssets(1) - nci[0], netAssets(2) - nci[1]),
      r3('Non-controlling interests', nci[0], nci[1]),
      r3('Total equity', netAssets(1), netAssets(2)),
    ];
    const boldBs = bs.map((r, i) => (/^(Total|Net assets|Equity attributable|Non-current assets$|Current assets$|Current liabilities$|Non-current liabilities$|Equity$)/.test(r[0]) ? i : -1)).filter((i) => i > 0);
    const cf = [
      ['', 'H1 2026', 'H1 2025'],
      ['Cash generated from operations', '27,914', '31,206'],
      ['Income tax paid', '(3,595)', '(3,402)'],
      ['Net cash from operating activities', '24,319', '27,804'],
      ['Purchase of property, plant and equipment', '(18,906)', '(15,271)'],
      ['Purchase of intangible assets', '(1,148)', '(962)'],
      ['Interest received', '486', '211'],
      ['Net cash used in investing activities', '(19,568)', '(16,022)'],
      ['Drawdown of borrowings', '4,200', '–'],
      ['Interest paid', '(5,804)', '(4,517)'],
      ['Repayment of lease liabilities', '(3,640)', '(3,388)'],
      ['Dividends paid', '(2,825)', '(2,480)'],
      ['Net cash used in financing activities', '(8,069)', '(10,385)'],
      ['Net (decrease)/increase in cash and cash equivalents', '(3,318)', '1,397'],
      ['Cash and cash equivalents at 1 January', '17,526', '15,140'],
      ['Cash and cash equivalents at 30 June', '14,208', '16,537'],
    ];
    const seg = [
      ['Revenue by segment (£000)', 'H1 2026', 'H1 2025'],
      ['Hotels, United Kingdom', '96,412', '92,118'],
      ['Hotels, Ireland', '31,580', '28,976'],
      ['Venues and events', '20,244', '18,510'],
      ['Total revenue', '148,236', '139,604'],
    ];
    return {
      title: 'Glenmarrow Hospitality Group plc: interim results H1 2026 (synthetic sample)',
      font: 'LiberationSans', size: 9.5, leading: 12.6,
      margins: [20, 20, 24, 24],
      header: { left: 'Glenmarrow Hospitality Group plc', right: 'Interim results for the six months ended 30 June 2026' },
      footer: { left: 'Synthetic sample · all figures invented · unaudited', right: `${v.status} · Page {p} of {n}` },
      blocks: [
        { t: 'title', text: 'Condensed consolidated interim financial statements' },
        { t: 'subtitle', text: 'Glenmarrow Hospitality Group plc · six months ended 30 June 2026 · unaudited' },
        { t: 'h', text: 'Financial highlights' },
        { t: 'table', widths: [62, 34, 74], align: 'LRL', header: 1, size: 9, rows: [
          ['Measure', 'H1 2026', 'Change on H1 2025'],
          ['Revenue', '£148.2m', `${v.revGrowth} (H1 2025: £139.6m)`],
          ['Operating profit', '£18.6m', '−12.0% (H1 2025: £21.2m)'],
          ['Profit before tax', '£12.2m', '−23.9% (H1 2025: £16.0m)'],
          ['Basic earnings per share', '7.42p', '−25.4% (H1 2025: 9.95p)'],
          ['Free cash flow', v.fcf, 'H1 2025: £2.7m'],
          ['Net debt', '£96.2m', '31 December 2025: £88.7m'],
        ] },
        { t: 'small', text: 'Free cash flow and net debt are alternative performance measures; they are defined and reconciled in the full interim report. Net debt excludes lease liabilities.' },
        { t: 'h', text: 'Condensed consolidated income statement (£000)' },
        { t: 'table', widths: [86, 16, 34, 34], align: 'LCRR', header: 1, rows: is, bold: [3, 6, 9, 11], rule_above: [3, 6, 9, 11] },
        { t: 'pagebreak' },
        { t: 'h', text: 'Condensed consolidated statement of comprehensive income (£000)' },
        { t: 'table', widths: [102, 34, 34], align: 'LRR', header: 1, rows: soci, bold: [5], rule_above: [4, 5] },
        { t: 'small', text: 'All items of other comprehensive income may be reclassified subsequently to profit or loss.' },
        { t: 'h', text: 'Condensed consolidated balance sheet (£000)' },
        { t: 'table', widths: [102, 34, 34], align: 'LRR', header: 1, size: 8.8, rows: bs, bold: boldBs, rule_above: bs.map((r, i) => (/^(Total|Net assets)/.test(r[0]) ? i : -1)).filter((i) => i > 0) },
        { t: 'pagebreak' },
        { t: 'h', text: 'Condensed consolidated cash flow statement (£000)' },
        { t: 'table', widths: [102, 34, 34], align: 'LRR', header: 1, size: 8.8, rows: cf, bold: [3, 7, 12, 13, 15], rule_above: [3, 7, 12, 13] },
        { t: 'h', text: 'Notes' },
        { t: 'p', text: rl('1. Basis of preparation. These condensed consolidated interim financial statements have been prepared in accordance with IAS 34 Interim Financial Reporting. They do not include all the information required for full annual financial statements and should be read together with the Group’s annual report for the year ended 31 December 2025, whose comparative figures are taken from the audited financial statements.') },
        { t: 'p', text: rl(`2. Going concern. The Group’s principal borrowing facility is a revolving credit facility of ${v.ccy} 40.0 million, of which 24.6 million was drawn at 30 June 2026, together with a term loan of £85.8 million maturing in March 2029. The facilities include a covenant that net debt must not exceed ${v.covenant} times EBITDA, tested every six months.${v.waiver ? ' The lenders have agreed to waive the covenant test at 31 December 2026.' : ''} Having considered cash flow forecasts to 31 December 2027, including a severe but plausible downside scenario with revenue 15% below plan, the directors expect the Group to have adequate resources to continue in operation, and the statements have been prepared on a going concern basis.`) },
        { t: 'p', text: rl('3. Segment information. The Group has three operating segments, reported to the board on the same basis as in the annual report.') },
        { t: 'table', widths: [102, 34, 34], align: 'LRR', header: 1, size: 8.8, rows: seg, bold: [4], rule_above: [4] },
        { t: 'p', text: rl('4. Other gains/(losses) comprise a loss of £1,104,000 on the disposal of the Cobble Wynd hotel and a foreign exchange gain of £792,000 on intra-group balances.') },
        { t: 'p', text: rl('5–7. Finance costs include interest on lease liabilities of £1,123,000 (H1 2025: £1,175,000). The effective tax rate for the period is 25.0% (H1 2025: 24.0%). Earnings per share are based on 119.6 million weighted average shares in issue (H1 2025: 119.6 million).') },
      ],
    };
  };
  const v0 = { status: 'Draft for Audit Committee review', revGrowth: '+5.8%', fcf: '−£7.4m', otherGains: '312', payables: 21736, provisions: 3120, ccy: 'GBP', covenant: '3.0', waiver: false };
  const v1 = { status: 'Approved by the Board on 28 July 2026', revGrowth: '+6.2%', fcf: '−£4.7m', otherGains: '(312)', payables: 22236, provisions: 2620, ccy: 'EUR', covenant: '3.5', waiver: true };
  add({
    id: 'en-interim-financials',
    producer: 'reportlab 5 (eval/holdout3-c/render_reportlab.py, Liberation Sans)',
    description: 'Synthetic sample. Condensed interim financial statements of an invented hotel group (EN, reportlab, 3 → 3 pages); amounts in £000 with negatives in parentheses, highlights with U+2212 minus signs and currency symbols. Edits between the audit-committee draft and the approved version: footer status “Draft for Audit Committee review” → “Approved by the Board on 28 July 2026” on every page; page 1 highlights: revenue growth +5.8% → +6.2% and free cash flow −£7.4m → −£4.7m; page 1 income statement: Other gains/(losses) 312 → (312) (sign change; the draft did not add up, the operating profit was already right and is unchanged); page 2 balance sheet: £500k reclassified from provisions to trade payables, (21,736) → (22,236) and (3,120) → (2,620) (subtotals unchanged); page 3 going-concern note: facility currency GBP → EUR, covenant 3.0 → 3.5 times EBITDA, and a new sentence about a covenant waiver. Everything else, including all totals, is unchanged.',
    kind: 'reportlab',
    before: reportSpec(v0),
    after: reportSpec(v1),
    truth: [
      { type: 'furniture', old: 'Draft for Audit Committee review', new: 'Approved by the Board on 28 July 2026', oldPage: [1, 2, 3], newPage: [1, 2, 3], maxItems: 3, note: 'Running footer, same change on every page.' },
      { type: 'number', old: '+5.8%', new: '+6.2%', oldPage: 1, newPage: 1 },
      { type: 'number', old: '−£7.4m', new: '−£4.7m', oldPage: 1, newPage: 1, note: 'U+2212 minus kept; digits swapped.' },
      { type: 'number', old: '312', new: '(312)', oldPage: 1, newPage: 1, note: 'Sign change in parentheses notation: gain 312 becomes loss (312). As a separate figure, 312 occurs only in this cell on page 1.' },
      { type: 'number', old: '(21,736)', new: '(22,236)', oldPage: 2, newPage: 2 },
      { type: 'number', old: '(3,120)', new: '(2,620)', oldPage: 2, newPage: 2 },
      { type: 'replace', old: 'GBP', new: 'EUR', oldPage: 3, newPage: 3, note: 'Currency code of the revolving credit facility; the amount 40.0 is unchanged.' },
      { type: 'number', old: '3.0', new: '3.5', oldPage: 3, newPage: 3, note: 'Covenant ratio (times EBITDA).' },
      { type: 'insert', new: 'The lenders have agreed to waive the covenant test at 31 December 2026.', newPage: 3, oldPage: 3 },
    ],
  });
}

// ===========================================================================
// 4. Bilingual board minutes with a duplicated page (ZH/EN, Chromium, 3 -> 4).
// The page with resolutions 3-5 and the key-figure table is pasted twice; on
// page 1 a vote count is corrected and an English sentence is removed; on
// the action-item page (3 -> 4) an owner and a due date change and a sentence
// is added.
{
  const css = `
    @page { size: A4; }
    body { font-family: 'Liberation Sans', 'WenQuanYi Zen Hei', sans-serif; font-size: 9.5pt; line-height: 1.55; color: #1d2228; margin: 0; padding: 0 19mm; }
    h1 { font-size: 15.5pt; margin: 0 0 3pt; line-height: 1.35; }
    .sub { color: #4b525a; margin: 0 0 10pt; }
    h2 { font-size: 11pt; margin: 11pt 0 4pt; }
    p { margin: 0 0 6pt; text-align: justify; }
    .vote { margin: 0 0 8pt; padding: 3pt 7pt; background: #f1f4f7; border-left: 2.5pt solid #5a7896; }
    .page { break-before: page; }
    table { border-collapse: collapse; width: 100%; margin: 4pt 0 10pt; }
    th, td { border: 0.6pt solid #a1aab3; padding: 3pt 5pt; text-align: left; vertical-align: top; }
    th { background: #e7ecf1; }
    td.n, th.n { text-align: right; white-space: nowrap; }
    table.meta td:first-child { width: 27%; background: #f4f6f8; font-weight: 700; }
    ol { margin: 0 0 8pt; padding-left: 16pt; } li { margin-bottom: 2pt; }
    table.sign td { height: 30pt; border: none; border-bottom: 0.6pt solid #1d2228; width: 25%; vertical-align: bottom; font-size: 8.5pt; color: #4b525a; }
  `;
  const vote = (f, a, x) => `<p class="vote">表决结果 Vote：同意 For ${f}，反对 Against ${a}，弃权 Abstain ${x}。</p>`;
  const page2 = `
    <div class="page">
      <h2>决议三　关于设立华南全资子公司的议案 Resolution 3: South China subsidiary</h2>
      <p>同意公司以自有资金出资人民币 5,000 万元，在广东省佛山市设立全资子公司“澄岭新材料（佛山）有限公司”（暂定名，以登记机关核准为准），主要从事改性塑料的研发、生产与销售。The board approved a wholly owned subsidiary in Foshan, Guangdong, with registered capital of RMB 50 million, and authorised the general manager to complete the registration.</p>
      ${vote(8, 0, 0)}
      <h2>决议四　关于申请银行综合授信额度的议案 Resolution 4: Bank credit facilities</h2>
      <p>同意公司向合作银行申请总额不超过人民币 3.5 亿元的综合授信额度，期限一年，授信品种包括流动资金贷款、银行承兑汇票及信用证。The credit lines total no more than RMB 350 million for one year; the chairman is authorised to sign the related agreements.</p>
      ${vote(8, 0, 0)}
      <h2>决议五　关于聘任副总经理的议案 Resolution 5: Appointment of a deputy general manager</h2>
      <p>经总经理提名、董事会提名委员会审核，同意聘任吴泓先生为公司副总经理，任期自本次会议审议通过之日起至第三届董事会任期届满之日止。The independent directors expressed their agreement with the appointment of Mr Wu Hong.</p>
      ${vote(8, 0, 0)}
      <h2>主要财务数据 Key figures（未经审计 unaudited，人民币万元 RMB 10,000）</h2>
      <table>
        <tr><th>项目 Item</th><th class="n">2026年1–9月 Jan–Sep 2026</th><th class="n">2025年1–9月 Jan–Sep 2025</th><th class="n">变动 Change</th></tr>
        <tr><td>营业收入 Revenue</td><td class="n">68,412</td><td class="n">61,465</td><td class="n">+11.3%</td></tr>
        <tr><td>归母净利润 Net profit attributable</td><td class="n">5,126</td><td class="n">5,379</td><td class="n">−4.7%</td></tr>
        <tr><td>经营活动现金流量净额 Operating cash flow</td><td class="n">−1,832</td><td class="n">2,947</td><td class="n">—</td></tr>
        <tr><td>资产负债率 Debt-to-asset ratio</td><td class="n">46.2%</td><td class="n">43.8%</td><td class="n">+2.4 pp</td></tr>
      </table>
    </div>`;
  const doc = (v) => html(css, `
    <h1>澄岭新材料科技股份有限公司第三届董事会第七次会议纪要</h1>
    <p class="sub">Minutes of the seventh meeting of the third Board of Directors of Chengling New Materials Technology Co., Ltd.</p>
    <table class="meta">
      <tr><td>会议时间 Time</td><td>2026年10月28日 14:00–17:30</td></tr>
      <tr><td>会议地点 Venue</td><td>公司总部三楼第一会议室（另设视频会场）Meeting Room 1, 3/F, head office, with video link</td></tr>
      <tr><td>主持人 Chair</td><td>董事长 林启恒 Lin Qiheng, Chairman</td></tr>
      <tr><td>出席 Present</td><td>应到董事 8 人，实到 8 人，其中 2 人以视频方式出席。All 8 directors attended, 2 of them by video.</td></tr>
      <tr><td>列席 In attendance</td><td>监事会主席 宋嘉禾；财务总监 李文博 Li Wenbo (CFO)；董事会秘书 何韵 He Yun</td></tr>
      <tr><td>记录 Minutes</td><td>何韵 He Yun</td></tr>
    </table>
    <p>会议的召集、召开和表决程序符合《公司法》及《公司章程》的规定。The meeting was duly convened and quorate. 会议审议了以下议案 The board considered the following items:</p>
    <ol>
      <li>2026年前三季度财务报告 Financial report for the first three quarters of 2026</li>
      <li>2027年度经营预算 Operating budget for 2027</li>
      <li>关于设立华南全资子公司的议案 Proposal to set up a wholly owned subsidiary in South China</li>
      <li>关于申请银行综合授信额度的议案 Proposal to apply for bank credit facilities</li>
      <li>关于聘任副总经理的议案 Proposal to appoint a deputy general manager</li>
    </ol>
    <h2>决议一　2026年前三季度财务报告 Resolution 1: Financial report, Q1–Q3 2026</h2>
    <p>财务总监李文博汇报了公司前三季度经营情况：实现营业收入 6.84 亿元，同比增长 11.3%；归属于母公司股东的净利润 5,126 万元，同比下降 4.7%。The CFO reported revenue of RMB 684 million, up 11.3% year on year, and net profit attributable to shareholders of RMB 51.26 million, down 4.7%. 董事会同意该报告，并要求管理层就存货跌价准备的计提依据作出专项说明。</p>
    ${vote(v.forVotes, 0, v.abstain)}
    <h2>决议二　2027年度经营预算 Resolution 2: Operating budget 2027</h2>
    <p>总经理赵承泽汇报了2027年度经营预算：计划营业收入 9.60 亿元，资本性支出 1.25 亿元，主要用于南通基地二期产线建设。The board approved the budget, subject to the capital expenditure being released in two tranches.${v.capexSentence ? ' The CFO will circulate a revised capital expenditure schedule before 30 November 2026.' : ''} 董事会要求管理层每季度报告预算执行情况。</p>
    ${vote(8, 0, 0)}
    ${page2}
    ${v.duplicate ? page2 : ''}
    <div class="page">
      <h2>后续行动 Action items</h2>
      <table style="table-layout:fixed">
        <colgroup><col style="width:9%"><col style="width:51%"><col style="width:24%"><col style="width:16%"></colgroup>
        <tr><th>编号 No.</th><th>事项 Action</th><th>负责人 Owner</th><th>完成时限 Due</th></tr>
        <tr><td>A1</td><td>完成佛山子公司登记注册 Register the Foshan subsidiary</td><td>赵承泽 Zhao Chengze</td><td>2026-12-31</td></tr>
        <tr><td>A2</td><td>与合作银行签署授信协议 Sign the credit facility agreements</td><td>林启恒 Lin Qiheng</td><td>2026-11-30</td></tr>
        <tr><td>A3</td><td>提交存货跌价准备专项说明 Report on inventory impairment provisions</td><td>${v.a3owner}</td><td>2026-11-20</td></tr>
        <tr><td>A4</td><td>修订信息披露管理制度 Revise the disclosure management policy</td><td>何韵 He Yun</td><td>${v.a4due}</td></tr>
        <tr><td>A5</td><td>组织新任副总经理入职培训 Induction for the new deputy general manager</td><td>吴泓 Wu Hong</td><td>2026-11-13</td></tr>
      </table>
      <h2>其他事项 Other matters</h2>
      <p>董事会秘书报告了近期监管动态及投资者关系工作情况。下次董事会会议定于2027年1月下旬召开，具体时间另行通知。The next board meeting will be held in late January 2027; the board secretary will confirm the date.</p>
      ${v.videoSentence ? '<p>以视频方式出席的董事将以电子签名方式签署本纪要。Directors who attended by video will sign these minutes electronically.</p>' : ''}
      <h2>出席董事签字 Signatures of the directors present</h2>
      <table class="sign">
        <tr><td>林启恒 Lin Qiheng</td><td>赵承泽 Zhao Chengze</td><td>韩书亭 Han Shuting</td><td>周曼 Zhou Man</td></tr>
        <tr><td>陆远舟 Lu Yuanzhou</td><td>钟毓 Zhong Yu</td><td>范可为 Fan Kewei</td><td>白若溪 Bai Ruoxi</td></tr>
      </table>
      <p style="margin-top:14pt">记录人 Minutes taken by：何韵 He Yun　　　　日期 Date：2026年10月28日</p>
    </div>
  `);
  add({
    id: 'zh-en-board-minutes-dup-page',
    producer: 'Chromium (Playwright page.pdf)',
    description: '合成样例 synthetic sample. 中英双语董事会会议纪要 Bilingual board minutes of an invented company (Chromium, 3 → 4 pages). Edits: on page 1 the vote on resolution 1 is corrected (For 7 → 6, Abstain 1 → 2) and the English sentence about the revised capital expenditure schedule is deleted from resolution 2; page 2 (resolutions 3–5 and the key-figure table, with negative numbers) is pasted twice, so it appears as new pages 2 and 3 with identical content; on the action-item page (old 3 → new 4) the owner of A3 and the due date of A4 change and a sentence about electronic signatures is added. Consequences, not edits: the page count and the page numbers in the footer change; the action-item page moves from 3 to 4.',
    kind: 'chromium',
    before: doc({ forVotes: 7, abstain: 1, capexSentence: true, duplicate: false, a3owner: '李文博 Li Wenbo', a4due: '2026-12-15', videoSentence: false }),
    after: doc({ forVotes: 6, abstain: 2, capexSentence: false, duplicate: true, a3owner: '郑雅琳 Zheng Yalin', a4due: '2027-01-15', videoSentence: true }),
    pdfOpts: {
      headerTemplate: tpl('澄岭新材料科技股份有限公司 · 第三届董事会第七次会议纪要 · Board minutes 2026-BM-07', "'Liberation Sans', 'WenQuanYi Zen Hei', sans-serif"),
      footerTemplate: tpl(pageOf('合成样例 synthetic sample · 第 {p} 页 / 共 {n} 页 · Page {p} of {n}'), "'Liberation Sans', 'WenQuanYi Zen Hei', sans-serif", 'right'),
    },
    truth: [
      { type: 'number', old: 'For 7', new: 'For 6', oldPage: 1, newPage: 1, note: 'Vote on resolution 1 (the only vote on page 1 that is not 8/0/0).' },
      { type: 'number', old: 'Abstain 1', new: 'Abstain 2', oldPage: 1, newPage: 1 },
      { type: 'delete', old: 'The CFO will circulate a revised capital expenditure schedule before 30 November 2026.', oldPage: 1, newPage: 1 },
      { type: 'insert', new: '澄岭新材料（佛山）有限公司', oldPage: 2, newPage: [2, 3], note: 'Old page 2 appears twice (new pages 2 and 3, word for word identical). One insert of a whole page; either copy may be reported as the added one.' },
      { type: 'replace', old: '李文博 Li Wenbo', new: '郑雅琳 Zheng Yalin', oldPage: 3, newPage: 4, note: 'Owner of action item A3. 李文博 also appears on page 1 (in attendance), which is unchanged.' },
      { type: 'number', old: '2026-12-15', new: '2027-01-15', oldPage: 3, newPage: 4, note: 'Due date of action item A4.' },
      { type: 'insert', new: 'Directors who attended by video will sign these minutes electronically.', oldPage: 3, newPage: 4, note: 'New bilingual paragraph; the Chinese half (以视频方式出席的董事将以电子签名方式签署本纪要。) belongs to the same insertion.' },
    ],
  });
}

// ===========================================================================
// 5. Chinese equipment purchase contract (ZH, LibreOffice Writer, 3 -> 3).
// A sentence added in section 1 pushes the text down, so the long warranty
// paragraph re-flows across the page break; the warranty period inside it
// changes. Payment percentages, the dispute-resolution forum and a sentence
// in the final section change; the running header changes from the draft for
// comments to the signing version.
{
  const items = [
    ['六轴工业机器人', 'QC-R620，负载20 kg', '4台', 186500],
    ['视觉定位系统', 'QC-V300，含相机及光源', '4套', 38200],
    ['柔性上料台', 'QC-F120', '2台', 64800],
    ['安全围栏及光栅', '按甲方车间图纸定制', '1批', 57300],
    ['中央控制柜', 'QC-C900，含PLC及触摸屏', '1台', 92600],
  ];
  const qty = (s) => parseInt(s, 10);
  const total = sum(items.map((r) => qty(r[2]) * r[3]));
  const goods = { name: 'Goods', widths: [1.1, 3.4, 4.6, 1.5, 2.5, 2.9] };
  const sign = { name: 'Sign', widths: [8, 8] };
  const P = (t) => oP('Body', xml(t));
  const H = (t) => oP('H', xml(t));
  const L = (t) => oP('BodyL', xml(t));
  const doc = (v) => makeOdt({
    latin: 'Liberation Serif', asian: 'WenQuanYi Zen Hei', size: '10.5pt', lh: '150%', lang: 'zh', country: 'CN',
    margins: '2.2cm 2.4cm 2.0cm 2.4cm',
    header: xml(`苏州澜汀精密机械有限公司 · 设备采购合同（${v.status}）`),
    footer: `合同编号：LT-CG-2026-0417　·　合成样例 synthetic sample　·　第 ${pageField} 页 共 ${countField} 页`,
    tables: [goods, sign],
    body: [
      oP('Title', '设备采购合同'),
      L('合同编号：LT-CG-2026-0417'),
      L('签订地点：江苏省苏州市吴中区'),
      L('签订日期：2026年11月20日'),
      P(''),
      L('甲方（买方）：苏州澜汀精密机械有限公司'),
      L('住所：苏州市吴中区澜汀路18号　法定代表人：陶景川'),
      L('联系人：钱思远　电话：0512-6655 0418'),
      P(''),
      L('乙方（卖方）：宁波栖川自动化设备有限公司'),
      L('住所：宁波市北仑区栖川路96号　法定代表人：严立群'),
      L('联系人：方嘉怡　电话：0574-8620 3371'),
      P(''),
      P('根据《中华人民共和国民法典》及有关法律法规的规定，甲乙双方在平等、自愿、诚实信用的基础上，就甲方向乙方采购自动化装配设备事宜，经协商一致，订立本合同，以资共同遵守。'),
      H('第一条　合同标的'),
      P('1.1　甲方向乙方采购下列设备（以下简称“设备”）：'),
      oTable(goods, [
        ['序号', '设备名称', '型号规格', '数量', '单价（元）', '金额（元）'],
        ...items.map((r, i) => [String(i + 1), r[0], r[1], r[2], money(r[3]), money(qty(r[2]) * r[3])]),
        ['合计', '', '', '', '', money(total)],
      ], { head: 1, align: 'LLLRRR', bold: [items.length + 1] }),
      P(`合同总价：${rmbUpper(total)}（¥${money(total)}）。`),
      P('1.2　上述价格为含税价，包含13%增值税以及设备的包装、运输、保险、安装、调试和操作培训费用。除本合同另有约定外，甲方无需另行支付其他任何费用。'),
      v.manuals ? P('1.3　乙方应随设备提供中文操作手册和维修保养手册各两套、随机备品备件清单、产品合格证及原产地证明文件，并在最终验收前提交全部电气原理图、气路图和可编程控制器程序的备份；上述资料应同时提供纸质版和可编辑的电子版。') : '',
      H('第二条　付款方式'),
      P(`2.1　本合同生效后七个工作日内，甲方向乙方支付合同总价的${v.advance}%作为预付款。`),
      P(`2.2　设备运抵甲方指定地点并经初步验收合格后十五个工作日内，甲方向乙方支付合同总价的${v.delivery}%。`),
      P('2.3　合同总价的10%作为质量保证金，在质保期届满且设备无质量争议后十五个工作日内无息支付。'),
      P('2.4　乙方在每次收款前，应向甲方开具与收款金额相等的增值税专用发票；乙方未开具发票的，甲方有权顺延付款，且不承担逾期付款责任。'),
      H('第三条　交货'),
      P('3.1　交货时间：本合同生效之日起六十日内。'),
      P('3.2　交货地点：甲方位于苏州市吴中区澜汀路18号的二号厂房。'),
      P('3.3　乙方负责设备的运输及装卸，运输过程中的风险由乙方承担。设备毁损、灭失的风险自甲方签收之日起转移至甲方。'),
      P('3.4　乙方应在发货前三个工作日书面通知甲方发货时间、车辆信息及装箱清单。'),
      H('第四条　安装调试与验收'),
      P('4.1　乙方应在设备运抵后十个工作日内完成安装调试，并对甲方指定的操作人员进行不少于三天的现场培训。'),
      P('4.2　设备连续无故障运行七十二小时且各项技术指标符合附件一《技术协议》要求的，视为最终验收合格，双方签署最终验收报告。'),
      P('4.3　验收不合格的，乙方应在十五日内免费整改并重新组织验收；经两次整改仍不合格的，甲方有权解除本合同，乙方应退还甲方已支付的全部款项。'),
      H('第五条　质量保证'),
      P(`5.1　乙方保证所提供的设备是全新的、未曾使用过的，其质量、规格及性能符合国家标准、行业标准及本合同附件的约定。设备在正常使用条件下应能连续稳定运行，主要部件的设计寿命不低于十年。乙方保证设备所配软件为正版软件，并在设备使用期内提供免费升级服务；软件升级不得降低设备原有性能，也不得要求甲方另行购买硬件。在质保期内，因设备本身质量问题发生的故障，乙方应在接到甲方通知后四小时内响应，二十四小时内派技术人员到达现场，免费维修或更换有关零部件；因此造成甲方停产的，乙方应赔偿甲方由此遭受的直接损失。同一部件在质保期内维修两次以上仍不能正常使用的，乙方应免费更换新部件，更换后的部件重新计算质保期。本条所称质保期为自最终验收合格之日起${v.warranty}个月；质保期满后，乙方应继续提供有偿维修服务及备品备件供应，期限不少于八年。`),
      H('第六条　知识产权与保密'),
      P('6.1　乙方保证甲方使用设备及其软件不侵犯任何第三方的知识产权，否则由乙方承担全部责任。'),
      P('6.2　双方对履行本合同过程中知悉的对方商业秘密负有保密义务，本条款在合同终止后三年内继续有效。'),
      H('第七条　违约责任'),
      P('7.1　乙方逾期交货的，每逾期一日，应按逾期交付设备金额的万分之五向甲方支付违约金；逾期超过三十日的，甲方有权解除合同。'),
      P('7.2　甲方逾期付款的，每逾期一日，应按逾期付款金额的万分之五向乙方支付违约金。'),
      H('第八条　不可抗力'),
      P('因地震、台风、洪水等不可抗力不能履行本合同的，受影响的一方应在五日内书面通知对方，并在十五日内提供有关证明。双方可根据不可抗力的影响，部分或全部免除责任。'),
      H('第九条　争议解决'),
      P(`因本合同引起的或与本合同有关的任何争议，双方应友好协商解决；协商不成的，任何一方均可${v.forum}。`),
      H('第十条　其他'),
      P('10.1　本合同自双方法定代表人或授权代表签字并加盖公章或合同专用章之日起生效。'),
      P('10.2　附件一《技术协议》和附件二《设备配置清单》为本合同不可分割的组成部分。'),
      P(`10.3　本合同一式肆份，甲乙双方各执贰份，具有同等法律效力。${v.supplement ? '本合同未尽事宜，双方可另行签订补充协议，补充协议与本合同具有同等法律效力。' : ''}`),
      oTable(sign, [
        ['甲方（盖章）：苏州澜汀精密机械有限公司', '乙方（盖章）：宁波栖川自动化设备有限公司'],
        ['法定代表人或授权代表：', '法定代表人或授权代表：'],
        ['日期：　　年　　月　　日', '日期：　　年　　月　　日'],
      ], { head: 0, border: false }),
    ].join('\n'),
  });
  add({
    id: 'zh-purchase-contract-reflow',
    producer: 'LibreOffice Writer 24.2 (flat ODT converted with soffice --convert-to pdf)',
    description: '合成样例 synthetic sample. 中文设备采购合同（LibreOffice Writer，3 → 3 页）。修改：页眉“征求意见稿”改为“签署稿”（每页）；第一条末尾新增 1.3 条（随机资料，旧版插入位置在第1页末，新版因三行不可拆分排在第2页顶部）；第二条预付款比例 30% → 20%、到货款比例 60% → 70%；第五条质量保证长段落中质保期 12个月 → 24个月；第九条争议解决由仲裁改为法院诉讼；第十条删除“本合同未尽事宜……”一句。未修改但随之变化的：新增 1.3 条使后文整体下移，第二条从第1页末移到第2页；第五条长段落在旧版完整位于第2页，新版跨第2、3页断开（质保期一句从旧第2页移到新第3页），这是重排，不是修改。合同编号、金额表及其余条款未改。',
    kind: 'odt',
    before: doc({ status: '征求意见稿', manuals: false, advance: '30', delivery: '60', warranty: '12', forum: '提交苏州仲裁委员会仲裁', supplement: true }),
    after: doc({ status: '签署稿', manuals: true, advance: '20', delivery: '70', warranty: '24', forum: '向甲方所在地有管辖权的人民法院提起诉讼', supplement: false }),
    truth: [
      { type: 'furniture', old: '征求意见稿', new: '签署稿', oldPage: [1, 2, 3], newPage: [1, 2, 3], maxItems: 3, note: 'Running header, same change on every page.' },
      { type: 'insert', new: '乙方应随设备提供中文操作手册和维修保养手册各两套', oldPage: 1, newPage: 2, note: 'New clause 1.3 (one sentence, three lines). It follows 1.2 at the foot of old page 1, but Writer keeps the three lines together and sets them at the top of new page 2.' },
      { type: 'number', old: '30%', new: '20%', oldPage: 1, newPage: 2, note: 'Advance payment share (2.1); clause 2.1 is pushed from page 1 to page 2 by the new clause 1.3.' },
      { type: 'number', old: '60%', new: '70%', oldPage: 2, newPage: 2, note: 'Payment on delivery (2.2).' },
      { type: 'number', old: '12个月', new: '24个月', oldPage: 2, newPage: 3, note: 'Warranty period inside the long paragraph 5.1, which straddles the page break; the sentence is on old page 2 and new page 3 only because of re-flow.' },
      { type: 'replace', old: '提交苏州仲裁委员会仲裁', new: '向甲方所在地有管辖权的人民法院提起诉讼', oldPage: 3, newPage: 3, note: 'Dispute resolution forum: arbitration → court.' },
      { type: 'delete', old: '本合同未尽事宜，双方可另行签订补充协议，补充协议与本合同具有同等法律效力。', oldPage: 3, newPage: 3 },
    ],
  });
}

// ===========================================================================
// 6. Records management and data retention policy (EN, reportlab, 3 -> 3).
// The policy owner is renamed in all five places, the version number and the
// CCTV retention period change, a sentence is added to the scope, a row is
// removed from the retention schedule (a table that runs across a page break
// with a repeated header), and the legal-hold sentence becomes bold.
{
  const schedule = [
    ['Tenancy files', 'Tenancy agreement, sign-up documents, correspondence', '6 years', 'End of tenancy', 'Confidential shredding'],
    ['Rent accounts', 'Rent statements, arrears letters, payment plans', '6 years', 'End of financial year', 'Secure deletion'],
    ['Housing applications (unsuccessful)', 'Application form, supporting evidence', '1 year', 'Date of decision', 'Secure deletion'],
    ['Anti-social behaviour cases', 'Incident logs, witness statements, injunction papers', '6 years', 'Case closure', 'Confidential shredding'],
    ['Safeguarding referrals', 'Referral forms, case notes, agency correspondence', '10 years', 'Case closure', 'Confidential shredding'],
    ['Repairs records', 'Job tickets, inspection notes, contractor invoices', '6 years', 'Completion of repair', 'Secure deletion'],
    ['Disability adaptations', 'Occupational therapy referrals, works orders', '6 years', 'End of tenancy', 'Secure deletion'],
    ['Gas safety records', 'Annual landlord gas safety certificates', '3 years', 'Date of check', 'Secure deletion'],
    ['Fire risk assessments', 'Assessments, action plans, fire door inspections', '10 years', 'Date of assessment', 'Review before disposal'],
    ['Asbestos surveys', 'Survey reports, register entries', '40 years', 'Date of survey', 'Review before disposal'],
    ['Property deeds', 'Title documents, transfers, leases', 'Permanent', '–', 'Not applicable'],
    ['Shared ownership sales', 'Applications, valuations, completion documents', '12 years', 'Completion of sale', 'Secure deletion'],
    ['Service charge accounts', 'Annual statements, certified accounts', '6 years', 'End of financial year', 'Secure deletion'],
    ['CCTV recordings', 'Footage from estate and office cameras', '__CCTV__', 'Date of recording', 'Automatic overwrite'],
    ['Call recordings', 'Customer contact centre recordings', '90 days', 'Date of call', 'Automatic deletion'],
    ['Complaints', 'Complaint form, investigation notes, response', '6 years', 'Case closure', 'Secure deletion'],
    ['Tenant satisfaction surveys', 'Survey responses, panel notes', '2 years', 'End of survey year', 'Secure deletion'],
    ['Personnel files', 'Contract, appraisals, training records', '6 years', 'End of employment', 'Confidential shredding'],
    ['Grievance and disciplinary records', 'Investigation notes, hearing notes, outcome letters', '6 years', 'Case closure', 'Confidential shredding'],
    ['Unsuccessful job applicants', 'CV, application form, interview notes', '6 months', 'Date of decision', 'Secure deletion'],
    ['Payroll records', 'Payslips, tax and pension records', '6 years', 'End of tax year', 'Secure deletion'],
    ['Accident records', 'Accident book entries, near-miss reports', '3 years', 'Date of entry', 'Secure deletion'],
    ['Visitor sign-in sheets', 'Paper and tablet logs at office receptions', '1 year', 'Date of visit', 'Confidential shredding'],
    ['Board papers', 'Agendas, minutes, reports, declarations of interest', 'Permanent', '–', 'Transfer to archive'],
    ['Supplier contracts', 'Contracts, variations, tender documents', '6 years', 'End of contract', 'Secure deletion'],
    ['Contracts executed as deeds', 'Development and building contracts', '12 years', 'End of contract', 'Secure deletion'],
    ['Insurance policies', 'Employers’ liability policies and certificates', '40 years', 'End of policy', 'Review before disposal'],
    ['Data protection requests', 'Subject access requests and responses', '2 years', 'Date of response', 'Secure deletion'],
    ['Website and app analytics', 'Aggregated usage statistics', '26 months', 'Date of collection', 'Automatic deletion'],
  ];
  const spec = (v) => {
    const owner = v.owner;
    const rows = schedule.filter((r) => v.visitorRow || r[0] !== 'Visitor sign-in sheets')
      .map((r) => r.map((c) => (c === '__CCTV__' ? v.cctv : rl(c))));
    return {
      title: 'Records Management and Data Retention Policy (synthetic sample)',
      font: 'LiberationSerif', size: 10.5, leading: 14.2,
      margins: [24, 24, 26, 24],
      header: { left: 'Ashcombe Vale Housing Association · Records Management and Data Retention Policy', right: 'POL-IG-04' },
      footer: { left: 'Synthetic sample · for internal use', right: 'Page {p} of {n}' },
      blocks: [
        { t: 'title', text: 'Records Management and Data Retention Policy' },
        { t: 'subtitle', text: 'Ashcombe Vale Housing Association' },
        { t: 'table', widths: [42, 120], align: 'LL', header: 0, size: 9.5, shade_header: false, grid: true, rows: [
          ['<b>Policy owner</b>', owner],
          ['<b>Approved by</b>', 'Audit and Risk Committee, 14 October 2026'],
          ['<b>Version</b>', v.version],
          ['<b>Next review</b>', 'October 2028'],
          ['<b>Applies to</b>', 'All staff, board members, volunteers and contractors'],
        ] },
        { t: 'h', text: '1. Purpose' },
        { t: 'p', text: rl('Ashcombe Vale Housing Association (“the Association”) creates and receives records about tenants, applicants, staff, properties and its own governance. This policy sets out how long those records are kept, who is responsible for them and how they are destroyed when they are no longer needed. Keeping records for the right length of time helps the Association to meet its legal obligations, to defend legal claims and to protect the privacy of the people it serves.') },
        { t: 'h', text: '2. Scope' },
        { t: 'p', text: rl(`This policy applies to all records created, received or held by the Association in any format, including paper files, emails, case management systems, shared drives, photographs and CCTV recordings.${v.contractors ? ' It also covers records that contractors hold on the Association’s behalf, such as repair reports and gas safety certificates.' : ''} It applies wherever the records are held, including at home and on mobile devices.`) },
        { t: 'h', text: '3. Roles and responsibilities' },
        { t: 'bullets', items: [
          rl('The Board has overall accountability for compliance with data protection law and approves this policy.'),
          rl(`The ${owner} owns this policy, maintains the retention schedule and advises managers on how to apply it.`),
          rl('Heads of service make sure that records in their area are kept, reviewed and destroyed in line with the schedule.'),
          rl('All staff must file records in the approved systems and must not keep personal copies of records about tenants or colleagues.'),
          rl('The IT service manages backups and makes sure that deleted records are removed from backups within the backup cycle.'),
        ] },
        { t: 'h', text: '4. Principles' },
        { t: 'bullets', items: [
          rl('Records are kept only for as long as there is a business or legal reason to keep them.'),
          rl('The retention period starts from the trigger event shown in the schedule, not from the date the record was created.'),
          rl('Where a record falls under more than one category, the longest retention period applies.'),
          rl('Personal data must never be stored on removable media unless the media are encrypted.'),
          rl('Records of continuing historical value may be transferred to the county record office instead of being destroyed.'),
        ] },
        { t: 'h', text: '5. Retention schedule' },
        { t: 'p', text: rl(`The following schedule applies to the main categories of records. Records that are not listed are kept for six years after the last action on them, unless the ${owner} agrees a different period in writing.`) },
        { t: 'table', widths: [36, 52, 22, 26, 26], align: 'LLLLL', header: 1, size: 8.8, repeat: true, grid: true, rows: [
          ['Record type', 'Examples', 'Retention', 'Trigger', 'Disposal'],
          ...rows,
        ] },
        { t: 'h', text: '6. Disposal' },
        { t: 'p', text: rl('Records must be destroyed securely when their retention period ends. Paper records containing personal data are placed in locked confidential waste bins and shredded by the approved contractor, who provides a certificate of destruction. Electronic records are deleted from live systems and drop out of backups within ninety days. A disposal log records the record category, the date range, the method and the name of the person who authorised the destruction.') },
        { t: 'h', text: '7. Legal holds' },
        { t: 'p', text: `${rl(`When the Association is aware of litigation, a regulatory investigation or a complaint to the housing ombudsman, the ${owner} may place a legal hold on the relevant records.`)} ${v.boldHold ? '<b>' : ''}Records subject to a legal hold must not be destroyed, even if their retention period has expired.${v.boldHold ? '</b>' : ''} ${rl('The hold is lifted in writing when the matter has been concluded.')}` },
        { t: 'h', text: '8. Breaches of this policy' },
        { t: 'p', text: rl('Destroying records early, or keeping them longer than necessary, may breach data protection law. Staff who become aware of such a breach must report it to the information governance mailbox at once. Deliberate breaches may lead to disciplinary action.') },
        { t: 'h', text: '9. Review' },
        { t: 'p', text: rl(`This policy is reviewed every two years, or sooner if the law or the Association’s systems change. The ${owner} reports on compliance with the retention schedule to the Audit and Risk Committee once a year.`) },
      ],
    };
  };
  add({
    id: 'en-retention-policy',
    producer: 'reportlab 5 (eval/holdout3-c/render_reportlab.py, Liberation Serif)',
    description: 'Synthetic sample. Records management and data retention policy of an invented housing association (EN, reportlab, 3 → 3 pages). Edits: the policy owner “Head of Compliance” is renamed “Data Protection Officer” in all five places (document-control table, section 3 and the section 5 introduction, which is on old page 1 and new page 2; sections 7 and 9 on page 3); the version changes from 2.3 to 2.4; a sentence about contractors is added to the scope; in the retention schedule (a table that runs from page 2 onto page 3 with a repeated header row) the CCTV retention changes from 31 days to 14 days and the row “Visitor sign-in sheets” is deleted; the legal-hold sentence in section 7 becomes bold. Consequences, not edits: lines re-wrap where the longer title appears, section 5 starts on new page 2 instead of old page 1, and the page break inside the table moves (the row “Contracts executed as deeds” goes from old page 2 to new page 3).',
    kind: 'reportlab',
    before: spec({ owner: 'Head of Compliance', version: '2.3', contractors: false, cctv: '31 days', visitorRow: true, boldHold: false }),
    after: spec({ owner: 'Data Protection Officer', version: '2.4', contractors: true, cctv: '14 days', visitorRow: false, boldHold: true }),
    truth: [
      { type: 'replace', old: 'Head of Compliance', new: 'Data Protection Officer', oldPage: [1, 3], newPage: [1, 2, 3], maxItems: 5, note: 'One rename in five places: old pages 1 (document control, section 3, section 5 intro) and 3 (sections 7 and 9); new pages 1 (document control, section 3), 2 (section 5 intro, pushed over by the new scope sentence) and 3 (sections 7 and 9). One aggregated item or up to five items are fine.' },
      { type: 'number', old: '2.3', new: '2.4', oldPage: 1, newPage: 1, note: 'Version in the document-control table.' },
      { type: 'insert', new: 'It also covers records that contractors hold on the Association’s behalf', oldPage: 1, newPage: 1 },
      { type: 'number', old: '31 days', new: '14 days', oldPage: 2, newPage: 2, note: 'CCTV retention period in the schedule table.' },
      { type: 'delete', old: 'Visitor sign-in sheets', oldPage: 2, newPage: 2, note: 'Whole table row removed (record type, examples, 1 year, date of visit, confidential shredding).' },
      { type: 'format', old: 'Records subject to a legal hold must not be destroyed', new: 'Records subject to a legal hold must not be destroyed', oldPage: 3, newPage: 3, note: 'Sentence made bold; text unchanged.' },
    ],
  });
}

// ===========================================================================
// Build
const work = mkdtempSync(join(tmpdir(), 'holdout3-c-'));
const loProfile = `file://${join(work, 'lo-profile')}`;
let browser = null;
const needsChromium = cases.some((c) => c.kind === 'chromium' && (only.length === 0 || only.some((o) => c.id.endsWith(o))));
if (needsChromium) {
  const { chromium } = await import('playwright').catch(() => createRequire(import.meta.url)('playwright'));
  browser = await chromium.launch();
}
try {
  for (const c of cases) {
    if (only.length && !only.some((o) => c.id.endsWith(o))) continue;
    const dir = join(root, c.id);
    mkdirSync(dir, { recursive: true });
    for (const v of ['before', 'after']) {
      const out = join(dir, `${v}.pdf`);
      if (c.kind === 'chromium') {
        const page = await browser.newPage();
        await page.setContent(c[v], { waitUntil: 'load' });
        await page.evaluate(async () => { await document.fonts.ready; });
        const pdf = await page.pdf({ format: 'A4', printBackground: true, displayHeaderFooter: true, margin: { top: '20mm', bottom: '18mm', left: '0', right: '0' }, ...c.pdfOpts });
        await page.close();
        writeFileSync(out, pdf);
      } else if (c.kind === 'odt') {
        const sub = join(work, c.id);
        mkdirSync(sub, { recursive: true });
        const src = join(sub, `${v}.fodt`);
        writeFileSync(src, c[v]);
        execFileSync('soffice', [`-env:UserInstallation=${loProfile}`, '--headless', '--norestore', '--convert-to', 'pdf:writer_pdf_Export', '--outdir', sub, src], { stdio: 'pipe' });
        copyFileSync(join(sub, `${v}.pdf`), out);
      } else if (c.kind === 'reportlab') {
        const specPath = join(work, `${c.id}-${v}.json`);
        writeFileSync(specPath, JSON.stringify(c[v]));
        execFileSync('python3', ['-I', join(helpers, 'render_reportlab.py'), specPath, out], { stdio: 'pipe' });
      }
    }
    const truth = c.truth.map((t) => {
      if (!c.totals) return t;
      // Snippet of the capital-numeral total: the differing part plus context.
      const { u0, u1 } = c.totals;
      let a = 0;
      while (u0[a] === u1[a]) a++;
      let b = 0;
      while (u0[u0.length - 1 - b] === u1[u1.length - 1 - b]) b++;
      const s0 = u0.slice(Math.max(0, a - 2), u0.length - b + 1);
      const s1 = u1.slice(Math.max(0, a - 2), u1.length - b + 1);
      return { ...t, old: t.old === '__U0__' ? s0 : t.old, new: t.new === '__U1__' ? s1 : t.new };
    });
    writeFileSync(join(dir, 'truth.json'), JSON.stringify({ description: c.description, synthetic: true, set: 'held-out-3', blind: true, author: AUTHOR, producer: c.producer, truth }, null, 2) + '\n');
    console.log('wrote', c.id);
  }
} finally {
  if (browser) await browser.close();
  rmSync(work, { recursive: true, force: true });
}

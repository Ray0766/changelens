#!/usr/bin/env node
// Blind held-out set "holdout2-b" (author b): layout and typography stressors.
// Writes eval/cases/holdout2-b-<id>/{before.pdf,after.pdf,truth.json}.
// Every document, company, person and amount here is SYNTHETIC (invented).
// Written without looking at the engine, its tests or its evaluation results.
//
// Run:  NODE_PATH=/opt/node-tools/node_modules node eval/make-holdout2-b.mjs
//
// truth.json items follow eval/make-cases.mjs:
//   { type, old?, new?, oldPage?, newPage?, many? }
// Only deliberate edits are listed. Consequences of an edit (re-wrapped lines,
// rows pushed to the next page, list numbers that renumber automatically,
// page numbers) are NOT edits and are deliberately left out.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import('playwright').catch(() => createRequire(import.meta.url)('playwright'));
const root = join(dirname(fileURLToPath(import.meta.url)), 'cases');
const AUTHOR = 'b';

const SANS = "'Liberation Sans', sans-serif";
const SERIF = "'Liberation Serif', serif";
const ZH = "'WenQuanYi Zen Hei', sans-serif";

const css = ({ font = SERIF, size = '11.5pt', lh = 1.5, extra = '' } = {}) => `
  @page { size: A4; }
  @page wide { size: A4 landscape; }
  body { font-family: ${font}; font-size: ${size}; line-height: ${lh}; color: #1d232b; margin: 0; padding: 0 20mm; }
  h1 { font-size: 21pt; margin: 0 0 10pt; line-height: 1.2; }
  h2 { font-size: 14pt; margin: 14pt 0 7pt; line-height: 1.25; }
  p { margin: 0 0 9pt; text-align: justify; }
  ul, ol { margin: 0 0 10pt; padding-left: 7mm; }
  li { margin: 0 0 3pt; }
  .page { break-before: page; }
  table { border-collapse: collapse; width: 100%; margin: 6pt 0 12pt; }
  th, td { border: 0.75pt solid #9aa7b3; padding: 3pt 6pt; text-align: left; vertical-align: top; }
  th { background: #eef2f5; }
  td.n, th.n { text-align: right; white-space: nowrap; }
  tr { break-inside: avoid; }
  ${extra}
`;
const html = (body, opts) => `<!doctype html><html><head><meta charset="utf-8"><style>${css(opts)}</style></head><body>${body}</body></html>`;
const P = (t) => `<p>${t}</p>`;

// Running header and footer with page numbers, like real exported documents.
const furniture = (headerText, zh = false) => ({
  headerTemplate: `<div style="font-size:7.5pt;width:100%;padding:0 18mm;color:#777;font-family:${zh ? ZH : 'sans-serif'}">${headerText}</div>`,
  footerTemplate: zh
    ? `<div style="font-size:7.5pt;width:100%;padding:0 18mm;color:#777;font-family:${ZH};display:flex;justify-content:space-between"><span>合成样例</span><span>第 <span class="pageNumber"></span> 页，共 <span class="totalPages"></span> 页</span></div>`
    : `<div style="font-size:7.5pt;width:100%;padding:0 18mm;color:#777;font-family:sans-serif;display:flex;justify-content:space-between"><span>Synthetic sample</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
});

const cases = [];
const add = (id, description, before, after, truth, pdfOpts) => cases.push({ id: `holdout2-${AUTHOR}-${id}`, description, before, after, truth, pdfOpts });

// ---------------------------------------------------------------------------
// 1. Price list: a table over three pages whose header row (<thead>) is
//    repeated by the browser at the top of every page. A row is inserted on
//    page 1 (pushing one row over the page 1/2 boundary), a row is deleted on
//    page 2 (pulling it back), and on page 3 one unit price and one word in a
//    description change. The repeated header rows are identical furniture and
//    must not be reported as inserted/moved.
{
  const products = [
    ['Centrifuge tube', ['1.5 ml, flat cap', '2.0 ml, screw cap', '15 ml, conical', '50 ml, conical', '50 ml, self-standing', '5 ml, round bottom', '0.5 ml, thin wall']],
    ['Pipette tip', ['10 µl, filtered', '200 µl, bevelled', '1000 µl, extended', '20 µl, low retention', '300 µl, racked', '5 ml, bulk', '50 µl, filtered']],
    ['Petri dish', ['90 mm, vented', '90 mm, triple vent', '55 mm, contact', '140 mm, vented', '35 mm, tissue culture', '60 mm, tissue culture', '100 mm, square']],
    ['Microplate', ['96 well, flat bottom', '96 well, U bottom', '384 well, black', '24 well, sterile', '48 well, sterile', '96 well, deep well 2 ml', '6 well, sterile']],
    ['Serological pipette', ['1 ml, individually wrapped', '2 ml, individually wrapped', '5 ml, individually wrapped', '10 ml, individually wrapped', '25 ml, bulk', '50 ml, bulk', '100 ml, bulk']],
    ['Syringe filter', ['0.22 µm PES, 25 mm', '0.45 µm PES, 25 mm', '0.22 µm nylon, 13 mm', '0.45 µm PTFE, 13 mm', '0.2 µm cellulose acetate, 30 mm', '1.0 µm glass fibre, 25 mm', '0.1 µm PVDF, 33 mm']],
    ['Culture flask', ['25 cm², vented cap', '75 cm², vented cap', '175 cm², vented cap', '25 cm², plug seal', '75 cm², plug seal', '225 cm², vented cap', '300 cm², vented cap']],
    ['Weighing boat', ['small, 7 ml', 'medium, 100 ml', 'large, 250 ml', 'hexagonal, 20 ml', 'diamond, 4 ml', 'anti-static, 100 ml', 'aluminium, 50 ml']],
    ['Cryogenic vial', ['1.2 ml, internal thread', '2.0 ml, internal thread', '5.0 ml, external thread', '1.8 ml, coded cap', '4.0 ml, external thread', '0.5 ml, internal thread', '2.0 ml, self-standing']],
    ['Sample bag', ['100 ml, wire closure', '400 ml, wire closure', '1500 ml, filter', '3500 ml, filter', '710 ml, write-on strip', '207 ml, write-on strip', '5000 ml, tear-off']],
    ['Reagent reservoir', ['25 ml, divided', '50 ml, single', '100 ml, single', '200 ml, 8 channel', '300 ml, 12 channel', '25 ml, sterile', '50 ml, sterile']],
    ['Cell scraper', ['18 mm blade, 25 cm', '25 mm blade, 39 cm', '13 mm blade, 18 cm', '20 mm blade, 30 cm', '30 mm blade, 45 cm', '16 mm blade, 23 cm', '22 mm blade, 32 cm']],
  ];
  const packs = [10, 20, 25, 50, 100, 200, 250, 500, 1000];
  // 53 is coprime with 97, so every price below is distinct.
  const price = (i) => (2.4 + ((i * 53) % 97) * 0.65).toFixed(2);
  const rows = [];
  products.forEach(([name, variants]) => variants.forEach((v) => {
    const i = rows.length;
    rows.push([`HL-${3001 + i}`, `${name}, ${v}`, String(packs[(i * 7) % 9]), price(i)]);
  }));
  const table = (rs) => `<table><thead><tr><th>Item no.</th><th>Description</th><th class="n">Pack</th><th class="n">Unit price (EUR)</th></tr></thead><tbody>${rs.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td class="n">${r[2]}</td><td class="n">${r[3]}</td></tr>`).join('')}</tbody></table>`;
  const doc = (rs) => html(`<h1>Price list 2027 — laboratory consumables</h1>
    ${P('Prices apply to orders placed between 1 January and 31 December 2027 and are quoted per pack. Pack sizes are fixed; part packs are not supplied. Items marked sterile are supplied in sealed inner bags with a lot certificate.')}
    ${table(rs)}
    ${P('All prices are in euros and exclude VAT. Orders below EUR 150 carry a handling charge. Delivery within the mainland is free for orders above that amount.')}`,
  { font: SANS, size: '10pt', lh: 1.35 });

  const a = rows.map((r) => [...r]);
  const b = rows.map((r) => [...r]);
  const priceRow = 73; // Reagent reservoir, page 3
  const oldPrice = b[priceRow][3];
  const newPrice = (Number(oldPrice) + 1.15).toFixed(2);
  if (rows.some((r) => r[3].includes(oldPrice) && r !== rows[priceRow]) || rows.some((r) => r[3].includes(newPrice))) throw new Error('price snippet not unique');
  b[priceRow][3] = newPrice;
  b[69][1] = b[69][1].replace('tear-off', 'zip closure'); // Sample bag, 5000 ml (page 3)
  const deleted = b[40][0]; // a Syringe filter row on page 2
  b.splice(40, 1);
  b.splice(4, 0, ['HL-3085', 'Centrifuge tube rack, 50 places, autoclavable', '1', '9.75']);
  add('thead-pricelist',
    'Synthetic. Three-page price list whose table header row repeats on every page (<thead>). A row is inserted on page 1 (one row spills to page 2), a row is deleted on page 2, a unit price and one word in a description change on page 3. The repeated header rows and the shifted page-1/2 boundary are not edits.',
    doc(a), doc(b),
    [
      { type: 'insert', new: 'Centrifuge tube rack', newPage: 1 },
      { type: 'delete', old: deleted, oldPage: 2 },
      { type: 'number', old: oldPrice, new: newPrice, oldPage: 3, newPage: 3 },
      { type: 'replace', old: 'tear-off', new: 'zip closure', oldPage: 3, newPage: 3 },
    ],
    furniture('Halvorsen Labware GmbH — Price list 2027'));
}

// ---------------------------------------------------------------------------
// 2. Procedure with a bulleted and a numbered list. A step is inserted as
//    step 3, so the browser renumbers old steps 3–8 to 4–9: that renumbering
//    is a consequence, not an edit. The author did update the one written
//    cross-reference on page 2 ("step 3" -> "step 4"), which IS an edit.
//    One bullet is deleted, and one heading changes from regular to bold.
{
  const doc = (v) => html(`<h1>Confined-space entry procedure</h1>
    ${P('This procedure applies to every entry into valve chambers, wet wells and storage tanks at the Marlow Basin pumping stations. It must be read together with the site permit-to-work rules. Nobody enters a confined space alone, and nobody enters without a valid permit.')}
    <h2${v.boldHeading ? '' : ' style="font-weight:400"'}>Equipment to check before entry</h2>
    <ul>
      <li>Four-gas detector with a valid calibration label</li>
      <li>Full-body harness and retrieval tripod</li>
      <li>Portable blower with five metres of ducting</li>
      <li>Two-way radios, one for each team member</li>
      ${v.torch ? '<li>Intrinsically safe torch with spare batteries</li>' : ''}
      <li>First-aid kit and eye-wash bottle</li>
    </ul>
    <h2>Entry steps</h2>
    <ol>
      <li>Obtain a signed entry permit from the shift supervisor.</li>
      <li>Isolate and lock out all pumps and valves that feed the chamber.</li>
      ${v.ventilate ? '<li>Ventilate the chamber with the portable blower for at least fifteen minutes.</li>' : ''}
      <li>Test the atmosphere at the top, middle and bottom of the chamber.</li>
      <li>Record the readings on the permit and sign them.</li>
      <li>Put on the harness and clip the retrieval line to the tripod.</li>
      <li>Enter the chamber only while the standby person is at the opening.</li>
      <li>Call the standby person by radio every ten minutes.</li>
      <li>Leave the chamber immediately if the detector alarm sounds.</li>
    </ol>
    <div class="page">
      <h2>If the alarm sounds</h2>
      ${P(`Everyone leaves the chamber at once. The standby person does not go in to help; the casualty is lifted out with the retrieval line and the emergency services are called. Before anyone goes back in, repeat the atmosphere test described in step ${v.step} and record the new readings on the permit.`)}
      <h2>Records</h2>
      ${P('Completed permits are kept at the station office for five years. The site supervisor reviews them each month and reports any alarm events to the safety committee.')}
      <h2>Training</h2>
      ${P('Entrants and standby persons must hold a current confined-space certificate and take part in a rescue drill at least once a year.')}
    </div>`, { font: SANS, size: '11pt' });
  add('list-renumber',
    'Synthetic. Two-page procedure. A numbered step is inserted as step 3 (old steps 3–8 renumber to 4–9 automatically: not edits), the written cross-reference on page 2 is updated from step 3 to step 4, one bullet is deleted, and one heading changes from regular to bold weight.',
    doc({ boldHeading: false, torch: true, ventilate: false, step: 3 }),
    doc({ boldHeading: true, torch: false, ventilate: true, step: 4 }),
    [
      { type: 'insert', new: 'Ventilate the chamber with the portable blower', newPage: 1 },
      { type: 'delete', old: 'Intrinsically safe torch', oldPage: 1 },
      { type: 'format', old: 'Equipment to check before entry', new: 'Equipment to check before entry', oldPage: 1, newPage: 1 },
      { type: 'number', old: '3', new: '4', oldPage: 2, newPage: 2 },
    ],
    furniture('Marlow Basin Utilities — Procedure CS-07'));
}

// ---------------------------------------------------------------------------
// 3. Justified serif text. One word inserted near the start of a long
//    justified paragraph re-wraps every following line of it; one sentence
//    changes only its colour (dark grey -> red); on page 2 a word is replaced
//    and a sentence deleted inside another justified paragraph.
{
  const doc = (v) => html(`<h1>Community energy grant — conditions of award</h1>
    ${P('To: Harrow Lane Community Solar Cooperative, Mill Row, Fenwick Valley')}
    ${P('The council has awarded your cooperative a capital grant of £48,500 towards the installation of rooftop solar panels on the community hall and the primary school. The grant is offered on the conditions below, which form part of the funding agreement signed by both parties.')}
    <h2>Use of the grant</h2>
    ${P('The grant may be spent only on the equipment, installation work and connection fees listed in the approved budget. Any change to the budget of more than ten per cent of a single line needs the written consent of the project officer before the money is committed.')}
    <h2>Accounts and claims</h2>
    ${P(`Recipients must submit ${v.word}audited annual accounts for each year in which grant money is spent, together with a statement that lists every payment made from the grant, the supplier, the date and the purpose of the payment. The statement must be signed by two members of the board, one of whom is the treasurer, and must reach the council within four months of the end of the financial year. Where the accounts show that part of the grant has not been used for the approved purpose, the council may ask for that part to be repaid or may deduct it from any later instalment.`)}
    ${P(`Claims are paid within thirty days of receiving a complete claim form with copies of the supplier invoices. <span style="color:${v.colour}">Claims received after 15 May 2027 will not be paid.</span>`)}
    ${P('The cooperative must keep all invoices, contracts and bank statements relating to the project for six years after the final payment and make them available to the council’s auditors on request.')}
    <div class="page">
      <h2>Reporting</h2>
      ${P(`Progress reports are due ${v.freq} and describe the work completed, the energy generated and any problems that may delay the project.${v.late ? ' Late reports may delay the second instalment.' : ''} The council’s project officer may visit the site with reasonable notice to check that the equipment has been installed as described in the application.`)}
      <h2>Publicity</h2>
      ${P('The cooperative will acknowledge the council’s support on its website and on a plaque at each installation. The wording of the plaque is agreed with the council’s communications team before it is ordered.')}
      <h2>Ending the agreement</h2>
      ${P('The council may withhold or recover the grant if the cooperative breaks these conditions, gives false information or stops operating the installations within five years of the final payment. Before doing so, the council will explain its concerns in writing and allow at least twenty-eight days for a response.')}
    </div>`, { font: SERIF, size: '11.5pt' });
  add('justified-rewrap',
    'Synthetic. Two-page letter in justified serif text. One word inserted at the start of a long justified paragraph re-wraps all its lines; one sentence changes only its text colour to red; on page 2 a word is replaced and a sentence deleted in a justified paragraph.',
    doc({ word: '', colour: '#1d232b', freq: 'quarterly', late: true }),
    doc({ word: 'independently ', colour: '#c62828', freq: 'every six months', late: false }),
    [
      { type: 'insert', new: 'independently', newPage: 1 },
      { type: 'graphic', oldPage: 1, newPage: 1 },
      { type: 'replace', old: 'quarterly', new: 'every six months', oldPage: 2, newPage: 2 },
      { type: 'delete', old: 'Late reports may delay the second instalment', oldPage: 2 },
    ],
    furniture('Fenwick Valley District Council — Grant ref. CE-2027-114'));
}

// ---------------------------------------------------------------------------
// 4. A landscape page between two portrait pages (CSS named page). The logo
//    on page 1 (inline SVG, shapes only, no text) is replaced by a different
//    one; on the landscape page a budget in the right-most column and a name
//    change; one word changes on the portrait page after it.
{
  const logoOld = '<svg width="58" height="58" viewBox="0 0 58 58" style="flex:none"><circle cx="29" cy="29" r="27" fill="#1565c0"/><path d="M8 33 q7 -8 14 0 t14 0 t14 0" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/><path d="M10 42 q6 -6 12 0 t12 0 t12 0" fill="none" stroke="#bbdefb" stroke-width="3" stroke-linecap="round"/></svg>';
  const logoNew = '<svg width="58" height="58" viewBox="0 0 58 58" style="flex:none"><rect x="2" y="2" width="54" height="54" rx="10" fill="#2e7d32"/><rect x="13" y="26" width="7" height="20" fill="#fff"/><rect x="25.5" y="14" width="7" height="32" fill="#fff"/><rect x="38" y="20" width="7" height="26" fill="#c8e6c9"/></svg>';
  const assets = [
    ['Raw water pump P-01', 'R. Okafor'], ['Raw water pump P-02', 'R. Okafor'], ['Flocculator F-1', 'M. Lindqvist'],
    ['Sand filter bank A', 'T. Haddad'], ['Sand filter bank B', 'T. Haddad'], ['UV reactor U-1', 'S. Ivanova'],
    ['Chlorine dosing skid', 'S. Ivanova'], ['Sludge press SP-1', 'J. Moreau'], ['Backwash blower B-2', 'M. Lindqvist'],
    ['Clear-water tank CW-1', 'P. Garrido'], ['Standby generator G-1', 'P. Garrido'], ['SCADA cabinet C-3', 'R. Okafor'],
  ];
  const budgets = ['3,180', '3,260', '2,940', '5,710', '5,630', '7,240', '4,415', '9,860', '2,275', '1,690', '6,320', '3,905'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const hours = (r, m) => ((r * 5 + m * 3) % 7 === 0 ? '' : String(((r * 7 + m * 11) % 9) + 4));
  const doc = (v) => {
    const table = `<table style="font-size:9pt"><thead><tr><th>Asset</th><th>Responsible</th>${months.map((m) => `<th class="n">${m}</th>`).join('')}<th class="n">Budget (EUR)</th></tr></thead><tbody>${assets.map(([name, who], r) => `<tr><td>${name}</td><td>${r === 7 ? v.who : who}</td>${months.map((_, m) => `<td class="n">${hours(r, m)}</td>`).join('')}<td class="n">${r === 5 ? v.budget : budgets[r]}</td></tr>`).join('')}</tbody></table>`;
    return html(`<div style="display:flex;align-items:center;gap:6mm;margin-bottom:10pt">${v.logo}<div><h1 style="margin:0">Maintenance programme 2027</h1><div style="font-size:12pt;color:#4a5560">Kestrel Bay Water Treatment Works</div></div></div>
      ${P('This programme sets out the planned maintenance hours for the main process equipment at Kestrel Bay in 2027. Hours are planned per month so that work on duplicate equipment never overlaps and at least one unit of each process stage stays in service.')}
      <h2>How to read the schedule</h2>
      ${P('The schedule on the next page lists one row per asset. Monthly figures are planned hours of maintenance work; an empty cell means that no work is planned. The budget column covers labour, parts and contractor costs for the whole year.')}
      ${P('Unplanned repairs are not included. They are recorded in the maintenance log and reported each quarter together with the variance against this programme.')}
      <h2>Changes during the year</h2>
      ${P('Requests to move planned work to another month are sent to the maintenance planner at least two weeks in advance. The planner checks the effect on plant availability and confirms the new date in writing.')}
      <div style="page:wide"><h2 style="margin-top:0">Planned maintenance hours by month</h2>${table}
        ${P('Hours are planned staff hours on site. Contractor visits are included in the budget column only.')}</div>
      <div class="page"><h2 style="margin-top:0">Approval</h2>
        ${P(`This programme was prepared by the maintenance planner and approved by the ${v.title} of Operations on behalf of the plant management team. It replaces the previous programme from the first working day of January.`)}
        ${P('Questions about the programme should be sent to the maintenance planner, who keeps the master copy and the record of approved changes.')}</div>`,
    { font: SANS, size: '11pt' });
  };
  add('landscape-logo',
    'Synthetic. Three pages: portrait, landscape (wide monthly table), portrait. The logo on page 1 (drawn shapes, no text) is replaced by a different logo; on the landscape page one budget in the right-most column and one responsible person change; on page 3 one word in a job title changes.',
    doc({ logo: logoOld, budget: '7,240', who: 'J. Moreau', title: 'Director' }),
    doc({ logo: logoNew, budget: '8,150', who: 'A. Brennan', title: 'Head' }),
    [
      { type: 'graphic', oldPage: 1, newPage: 1 },
      { type: 'number', old: '7,240', new: '8,150', oldPage: 2, newPage: 2 },
      { type: 'replace', old: 'Moreau', new: 'Brennan', oldPage: 2, newPage: 2 },
      { type: 'replace', old: 'Director', new: 'Head', oldPage: 3, newPage: 3 },
    ],
    furniture('Kestrel Bay Water Treatment Works — Maintenance programme 2027'));
}

// ---------------------------------------------------------------------------
// 5. Data sheet with fixed-height sheets so that a footnote can sit at the
//    bottom of page 2. The new version adds a footnote (marker in the body
//    text + note at the page foot), pastes the storage paragraph from page 1
//    a second time on page 3 (duplicate content, the original stays), and
//    changes an overlap width on page 3.
{
  const storage = 'Store rolls upright on a flat, dry surface, away from direct sunlight and sources of heat. Do not stack pallets. Rolls taken from a cold store must be kept at room temperature for one day before they are unrolled.';
  const data = [
    ['Thickness', '4.0 mm'], ['Mass per unit area', '4.8 kg/m²'], ['Reinforcement', 'polyester fleece, 160 g/m²'],
    ['Tensile strength, length / width', '900 / 700 N per 50 mm'], ['Elongation at break', '45 %'],
    ['Cold flexibility', '−25 °C'], ['Heat resistance', '+110 °C'], ['Roll size', '1 m × 7.5 m'],
  ];
  const doc = (v) => html(`
    <div class="sheet">
      <h1>PM-40 reinforced bitumen membrane</h1>
      ${P('PM-40 is an elastomeric bitumen membrane with a polyester reinforcement, used as the cap sheet of two-layer roofing systems on flat and low-slope roofs. The upper face is covered with grey mineral granules; the lower face has a thin film that is melted with a torch during installation.')}
      <h2>Applications</h2>
      ${P('Cap sheet on concrete, timber and metal decks; renovation of existing bitumen roofs after the surface has been cleaned and primed; detailing around roof lights, upstands and outlets.')}
      <h2>Storage and handling</h2>
      ${P(storage)}
      <h2>Packaging</h2>
      ${P('Rolls are wrapped in a printed sleeve and delivered on returnable pallets of twenty-five rolls. Each sleeve shows the production batch and the date of manufacture.')}
    </div>
    <div class="sheet">
      <h2 style="margin-top:0">Technical data</h2>
      <table><thead><tr><th>Property</th><th>Typical value</th></tr></thead><tbody>${data.map(([k, x]) => `<tr><td>${k}</td><td>${x}</td></tr>`).join('')}</tbody></table>
      ${P(`The membrane stays flexible at low temperatures${v.fn ? '<sup>1</sup>' : ''} and can be installed when the air temperature is above freezing. Below that, rolls must be warmed before use and the substrate must be free of frost and condensation.`)}
      ${P('Values are typical results from factory production control and are given for guidance only. They do not form a specification.')}
      ${v.fn ? '<div class="fn"><sup>1</sup> Cold-bend test on samples conditioned for one day at the stated temperature; see the cold flexibility value in the table above.</div>' : ''}
    </div>
    <div class="sheet">
      <h2 style="margin-top:0">Installation notes</h2>
      ${P(`Side laps are at least ${v.lap} mm wide and end laps at least 150 mm wide. Laps are sealed by heating both surfaces until the bitumen flows and pressing them together with a roller, leaving a small bead of bitumen along the edge.`)}
      ${v.dup ? P(storage) : ''}
      ${P('Install the cap sheet on the same day as the underlayer where possible. Joints in the cap sheet are offset from the joints of the underlayer by at least a third of the roll width.')}
      <h2>Disposal</h2>
      ${P('Offcuts and damaged rolls are collected separately and returned to a recycling scheme for bitumen products. Empty sleeves and pallets are taken back by the supplier.')}
    </div>`,
  { font: SANS, size: '11pt', extra: '.sheet { height: 250mm; position: relative; } .sheet + .sheet { break-before: page; } .fn { position: absolute; left: 0; right: 0; bottom: 0; font-size: 8.5pt; line-height: 1.35; }' });
  add('footnote-duplicate',
    'Synthetic. Three-page data sheet. A footnote is added (superscript marker in the body text and the note at the foot of page 2), the storage paragraph of page 1 is pasted again on page 3 (the original stays on page 1), and a lap width changes on page 3.',
    doc({ fn: false, dup: false, lap: '80' }),
    doc({ fn: true, dup: true, lap: '100' }),
    [
      { type: 'insert', new: 'Cold-bend test on samples conditioned', newPage: 2 },
      { type: 'insert', new: '1', newPage: 2 },
      { type: 'insert', new: 'Store rolls upright', newPage: 3 },
      { type: 'number', old: '80', new: '100', oldPage: 3, newPage: 3 },
    ],
    furniture('Pellacott Membranes Ltd — Technical data sheet PM-40'));
}

// ---------------------------------------------------------------------------
// 6. Chinese lease agreement (justified CJK text). Page 1: a two-character
//    word inserted near the start of a long justified paragraph re-wraps it.
//    Page 2: text unchanged, but its side margins are 11 mm wider in the new
//    version, so every line breaks differently (not an edit; the shift stays
//    below 15 mm). Page 3: a number and a word change.
{
  const doc = (v) => html(`<h1>设备租赁协议</h1>
    ${P('甲方（承租方）：青禾物流有限公司')}
    ${P('乙方（出租方）：远山设备租赁有限公司')}
    <h2>第一条 租赁设备</h2>
    ${P('乙方向甲方出租电动叉车六台、手动液压搬运车十二台及配套充电设备一批，设备型号、出厂编号和随机附件以本协议附件一所列清单为准。设备在交付时应处于完好可用状态，并附有有效的年检合格证明。')}
    <h2>第二条 交付与验收</h2>
    ${P(`乙方应在交付前三日${v.word}通知甲方交付时间和地点，并安排技术人员随车到场。双方在交付现场共同清点设备数量、核对出厂编号并逐台试机，验收合格后由双方代表在交付单上签字确认。设备存在外观损伤或功能故障的，甲方有权拒收，乙方应在约定期限内更换同型号设备，由此产生的运输费用由乙方承担。甲方签收后即视为设备已按约定交付，但设备存在交付时无法发现的隐蔽缺陷的除外。`)}
    <h2>第三条 使用与保管</h2>
    ${P('甲方应按照设备使用说明书操作和保管设备，不得超载使用，不得擅自拆改设备结构或更换主要部件。甲方因经营需要将设备转移至其他仓库使用的，应提前告知乙方新的存放地址。')}
    <div class="page"${v.wide ? ' style="padding:0 11mm"' : ''}>
      <h2 style="margin-top:0">第四条 租金与支付</h2>
      ${P('每台电动叉车的月租金为人民币三千二百元，每台手动液压搬运车的月租金为人民币四百五十元，充电设备不另行收费。租金按月结算，甲方应于每月五日前将上月租金汇入乙方指定的银行账户。')}
      ${P('乙方收到租金后应向甲方开具合法有效的增值税专用发票。因甲方提供的开票信息有误导致发票无法使用的，乙方应予以重新开具，但由此造成的迟延不视为乙方违约。')}
      <h2>第五条 维修与保养</h2>
      ${P('租赁期内，设备的日常检查由甲方负责，定期保养和非人为原因造成的故障维修由乙方负责。乙方接到甲方报修后应在二十四小时内派员到场，无法当场修复的，应在三日内提供同型号的备用设备。')}
      ${P('因甲方操作不当或保管不善造成设备损坏的，维修费用由甲方承担；设备灭失的，甲方应按附件一所列的设备残值予以赔偿。')}
    </div>
    <div class="page">
      <h2 style="margin-top:0">第六条 违约责任</h2>
      ${P('甲方逾期支付租金的，每逾期一日，应按逾期金额的万分之五向乙方支付违约金。乙方未按约定时间交付设备或提供备用设备的，每逾期一日，应按相应设备月租金的百分之三向甲方支付违约金。')}
      <h2>第七条 租期届满与设备返还</h2>
      ${P(`租期届满后，甲方应在${v.days}个工作日内将设备返还至乙方指定的仓库，返还时设备应保持交付时的状态，正常损耗除外。`)}
      <h2>第八条 通知与送达</h2>
      ${P(`本协议项下的通知应以${v.via}方式送达对方在本协议首页载明的联系地址，发出之日起第二日视为送达。`)}
      <h2>第九条 其他</h2>
      ${P('本协议一式两份，双方各执一份，自双方签字盖章之日起生效。')}
    </div>`, { font: ZH, size: '11pt', lh: 1.7 });
  add('zh-margins',
    'Synthetic. 合成样例：三页中文设备租赁协议（两端对齐）。第 1 页在长段落开头插入“书面”二字导致整段重新换行；第 2 页文字未改，仅左右页边距各加宽 11 mm（换行全部变化，不算修改）；第 3 页修改一个天数和一种送达方式。',
    doc({ word: '', wide: false, days: '15', via: '电子邮件' }),
    doc({ word: '书面', wide: true, days: '10', via: '挂号信' }),
    [
      { type: 'insert', new: '书面', newPage: 1 },
      { type: 'number', old: '15', new: '10', oldPage: 3, newPage: 3 },
      { type: 'replace', old: '电子邮件', new: '挂号信', oldPage: 3, newPage: 3 },
    ],
    furniture('青禾物流有限公司 · 设备租赁协议', true));
}

const browser = await chromium.launch();
const page = await browser.newPage();
for (const c of cases) {
  const dir = join(root, c.id);
  mkdirSync(dir, { recursive: true });
  for (const v of ['before', 'after']) {
    await page.setContent(c[v], { waitUntil: 'load' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      margin: { top: '20mm', bottom: '20mm', left: '0', right: '0' },
      ...c.pdfOpts,
    });
    writeFileSync(join(dir, `${v}.pdf`), pdf);
  }
  writeFileSync(join(dir, 'truth.json'), JSON.stringify({ description: c.description, synthetic: true, holdout: true, author: AUTHOR, truth: c.truth }, null, 2) + '\n');
  console.log('wrote', c.id);
}
await browser.close();

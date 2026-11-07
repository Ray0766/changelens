// HTML sources for the parts of the held-out-4 (author g) cases that are
// printed with Chromium. Each export returns a complete HTML document.
// Everything is synthetic.

const base = (extra = '') => `
  <style>
    @page { size: A4; margin: 20mm 20mm 22mm 20mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Liberation Sans', sans-serif; font-size: 10.5pt; line-height: 1.38; color: #1d232b; margin: 0; }
    h1 { font-size: 19pt; margin: 0 0 4pt; font-weight: 700; letter-spacing: -0.2pt; }
    h2 { font-size: 12pt; margin: 16pt 0 5pt; }
    p { margin: 0 0 7pt; }
    table { border-collapse: collapse; width: 100%; }
    th, td { padding: 4pt 6pt; text-align: left; vertical-align: top; }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .muted { color: #5b6470; }
    ${extra}
  </style>`;

// ------------------------------------------------------------ case 1 parts

export function priceSchedule({ revised }) {
  const rows = [
    ['1', 'Site establishment and setting-out', 'lump sum', '6,250.00'],
    ['2', 'Supply of LED column luminaires, type PL-60', '48 no.', '52,800.00'],
    ['3', 'Installation and connection of luminaires', '48 no.', revised ? '21,150.00' : '18,400.00'],
    ['4', 'Control system and commissioning', '1 system', '9,750.00'],
    ['5', 'Testing, documentation and handover', 'lump sum', '3,900.00'],
  ];
  if (revised) rows.push(['6', 'Night-time traffic management', '6 nights', '4,200.00']);
  const total = revised ? '98,050.00' : '91,100.00';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">${base(`
    .sched th { background: #22313f; color: #fff; font-weight: 600; font-size: 9.5pt; }
    .sched td { border-bottom: 0.75pt solid #c7ced6; }
    .sched tr.total td { border-top: 1.5pt solid #22313f; border-bottom: none; font-weight: 700; }
    .ref { font-size: 9pt; }
  `)}</head><body>
  <p class="muted ref">Tender TR-0417 · Harbour Promenade Lighting Renewal · Brackwater Lighting Co. · synthetic sample</p>
  <h1>Price schedule</h1>
  <p>All amounts in euros, excluding VAT. The amounts cover the scope described in the technical proposal.</p>
  <table class="sched">
    <thead><tr><th style="width:9%">Item</th><th>Description</th><th style="width:16%">Basis</th><th class="num" style="width:20%">Amount (EUR)</th></tr></thead>
    <tbody>
      ${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td class="num">${r[3]}</td></tr>`).join('\n      ')}
      <tr class="total"><td></td><td>Total (excl. VAT)</td><td></td><td class="num">${total}</td></tr>
    </tbody>
  </table>
  <h2>Conditions</h2>
  <p>Prices are fixed until 31 December 2027. Columns that fail the structural test described in section 2.3 of the technical proposal are replaced at EUR 1,380.00 per column, including foundation work and disposal of the old column.</p>
  <p>Work is invoiced monthly against the columns completed in that month. Invoices are payable within 30 days. A retention of 5 per cent is held until the end of the defects liability period of 12 months.</p>
  <p>Our offer remains valid for 90 days from the closing date of the tender.</p>
  </body></html>`;
}

export function dataSheet() {
  const spec = [
    ['Luminous flux', '4,800 lm'],
    ['Power consumption', '36 W'],
    ['Luminous efficacy', '133 lm/W'],
    ['Colour temperature', '3,000 K'],
    ['Colour rendering', 'Ra ≥ 80'],
    ['Protection', 'IP66, IK09'],
    ['Mounting height', '4 to 8 m'],
    ['Weight', '6.2 kg'],
    ['Operating temperature', '−30 °C to +45 °C'],
    ['Control', 'Zhaga socket with control node'],
    ['Rated life', 'L90 at 100,000 h'],
    ['Warranty', '10 years'],
  ];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">${base(`
    body { font-family: 'Inter', 'Liberation Sans', sans-serif; font-size: 10pt; }
    .band { border-left: 5pt solid #e0a100; padding-left: 10pt; margin-bottom: 14pt; }
    .grid { display: flex; gap: 18pt; align-items: flex-start; }
    .spec { flex: 1.3; }
    .spec td { border-bottom: 0.5pt solid #d5dae0; }
    .spec td:first-child { color: #4a5360; width: 48%; }
    figure { flex: 1; margin: 0; }
    figcaption { font-size: 8.5pt; color: #5b6470; margin-top: 4pt; }
  `)}</head><body>
  <div class="band">
    <p class="muted" style="font-size:9pt;margin:0">Product data sheet · Brackwater Lighting Co. · synthetic sample</p>
    <h1>PL-60 promenade luminaire</h1>
    <p style="margin:0">LED column luminaire for promenades, parks and residential streets.</p>
  </div>
  <div class="grid">
    <table class="spec"><tbody>
      ${spec.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('\n      ')}
    </tbody></table>
    <figure>
      <svg viewBox="0 0 200 260" width="190" height="247" xmlns="http://www.w3.org/2000/svg">
        <rect x="96" y="70" width="8" height="180" fill="#6b7480"/>
        <rect x="80" y="246" width="40" height="8" fill="#4a5360"/>
        <path d="M100 74 Q100 40 140 36" stroke="#6b7480" stroke-width="6" fill="none"/>
        <path d="M118 30 h64 l-10 14 h-44 z" fill="#2f3b47"/>
        <rect x="128" y="44" width="44" height="4" fill="#f2c94c"/>
        <line x1="20" y1="70" x2="20" y2="250" stroke="#9aa3ad" stroke-width="1"/>
        <text x="14" y="165" font-size="10" fill="#4a5360" transform="rotate(-90 14 165)" text-anchor="middle">4–8 m</text>
      </svg>
      <figcaption>Side-entry mounting on a 60 mm spigot. Drawing not to scale.</figcaption>
    </figure>
  </div>
  <h2>Optics and maintenance</h2>
  <p>The flat glass cover keeps the upward light ratio at 0 per cent. The asymmetric lens directs the light along the promenade and keeps spill light off the water. The driver can be replaced on site without tools.</p>
  <p>The housing is die-cast aluminium, powder-coated in a colour chosen by the client. All fixings are stainless steel.</p>
  </body></html>`;
}

// ---------------------------------------------------- case 3: engagement letter

export function engagementLetter({ final }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">${base(`
    @page { size: A4; margin: 30mm 24mm 30mm 24mm; }
    @page :first { margin-top: 40mm; }
    body { font-family: 'Liberation Serif', serif; font-size: 11pt; line-height: 1.42; }
    h1 { font-family: 'Liberation Sans', sans-serif; font-size: 17pt; }
    h2 { font-family: 'Liberation Sans', sans-serif; font-size: 11.5pt; margin-top: 14pt; }
    .meta td { padding: 1pt 8pt 1pt 0; }
    .deliv td, .deliv th { border-bottom: 0.6pt solid #b9c0c8; }
    .deliv th { font-family: 'Liberation Sans', sans-serif; font-size: 9.5pt; }
    ul { margin: 0 0 7pt 0; padding-left: 16pt; }
    li { margin-bottom: 3pt; }
    .sign { display: flex; gap: 30pt; margin-top: 26pt; }
    .sign div { flex: 1; border-top: 0.8pt solid #333; padding-top: 4pt; font-size: 10pt; }
  `)}</head><body>
  <h1>Engagement letter: records digitisation advisory</h1>
  <table class="meta" style="width:auto;margin-bottom:10pt"><tbody>
    <tr><td>To</td><td>The Board, Eastfield Housing Trust (fictitious)</td></tr>
    <tr><td>Date</td><td>28 October 2026</td></tr>
    <tr><td>Our ref.</td><td>OVA/2026/031</td></tr>
    <tr><td>Status</td><td>${final ? 'Issued for signature' : 'Draft v3 for discussion'}</td></tr>
  </tbody></table>
  <p>Dear members of the Board,</p>
  <p>Thank you for asking Orrin Vale Advisory to support the Trust in digitising its tenancy and property records. This letter sets out the scope of our work, the deliverables, our fees and the terms that apply. Please read it carefully and sign it if you agree.</p>
  <h2>1 Background</h2>
  <p>The Trust keeps about 9,400 tenancy files and 1,150 property files on paper at its head office. The files are needed for day-to-day housing management and must be kept for six years after a tenancy ends. The Trust wants to scan the files, move to an electronic records system and free the archive room by the end of 2027.</p>
  <h2>2 Scope of the engagement</h2>
  <ul>
    <li>Review the current filing practice and the retention rules that apply to each type of file.</li>
    <li>Prepare a specification for the scanning service and the electronic records system.</li>
    <li>Support the Trust during the procurement of both services, including the evaluation of the tenders.</li>
    <li>Prepare a migration plan, including a pilot with 300 files and the training of staff.</li>
  </ul>
  <p>The scope does not include the scanning itself, the configuration of the records system or legal advice on data protection. We can quote for these separately.</p>
  <h2>3 Deliverables</h2>
  <table class="deliv"><thead><tr><th>Deliverable</th><th style="width:28%">Due</th></tr></thead><tbody>
    <tr><td>Review of filing practice and retention rules</td><td>8 January 2027</td></tr>
    <tr><td>Specification for scanning and records system</td><td>12 February 2027</td></tr>
    <tr><td>Tender evaluation report</td><td>30 April 2027</td></tr>
    <tr><td>Migration plan and pilot report</td><td>25 June 2027</td></tr>
  </tbody></table>
  <h2>4 Fees and expenses</h2>
  <p>Our fixed fee for the scope above is EUR ${final ? '19,800' : '18,500'}, excluding VAT. We invoice the fee in four equal parts, each on delivery of one of the deliverables listed in section 3. Travel expenses are charged at cost up to a cap of EUR 1,200 for the whole engagement.</p>
  <p>If the Trust asks for work outside the scope, we agree the fee for it in writing before we start. Our day rate for such work is EUR 980.</p>
  <h2>5 Timetable and team</h2>
  <p>We start on 23 November 2026 and expect to complete the engagement by the end of June 2027. The engagement is led by a director, who attends the Board meetings at which the deliverables are discussed, supported by a records manager and an analyst.</p>
  <h2>6 Responsibilities of the Trust</h2>
  <p>The Trust names a project lead who has the authority to take day-to-day decisions, gives our team access to the archive room and to the staff who use the files, and provides the information we ask for within five working days. Delays in providing information may move the due dates in section 3.</p>
  <h2>7 Terms</h2>
  <p>Our standard terms of business apply and are attached. Our liability is limited to three times the fee. Either party may end the engagement with one month's written notice; in that case we invoice the work done up to the end of the notice period.</p>
  <p>We will treat all information we receive from the Trust as confidential and use it only for this engagement. We do not take original files away from the Trust's premises.</p>
  <h2>8 Acceptance</h2>
  <p>Please sign and return one copy of this letter. We look forward to working with the Trust.</p>
  <div class="sign"><div>For Orrin Vale Advisory LLP</div><div>For Eastfield Housing Trust</div></div>
  </body></html>`;
}

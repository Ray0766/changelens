// SYNTHETIC probe PDFs for fix round 9, area V2-thin-light-lines, second
// pass: the remittance statement of review round 7's probe p15 (Chromium via
// Playwright), copied as test/fixtures/probe9-V2-refix-stamp-SYNTHETIC-*.pdf.
// A 3-page statement, one table per page. The new versions add a rotated
// semi-transparent stamp ("PAID" red at -18°, "RECEIVED" blue at -12°,
// "CHECKED" green at -25°) over the amount column of each page, and insert
// a note line at the top of page 1 (a re-flow by a fraction of a pixel). No
// figure is edited: a strike or underline item on a figure is noise. The
// stamp's border crosses the foot of "253.86" on page 1.
//
// Run with Playwright's Chromium on NODE_PATH:
//   node v2-stamp-frame.cjs <out-dir>
const { chromium } = require('playwright');
const D = process.argv[2] || '.';
async function pdfs(items) {
  const b = await chromium.launch();
  const p = await b.newPage();
  for (const it of items) {
    await p.setContent(it.html, { waitUntil: 'load' });
    await p.pdf({ path: it.file, format: 'A4', printBackground: true, preferCSSPageSize: true });
  }
  await b.close();
}
const stamps = [['PAID', 'rgba(200,0,0,.55)', -18, 380, 210], ['RECEIVED', 'rgba(20,60,200,.5)', -12, 330, 260], ['CHECKED', 'rgba(0,130,60,.5)', -25, 350, 180]];
function page(i, stamp, note) {
  const rows = [];
  for (let r = 0; r < 14; r++) { const a = ((i + 3) * 137 + r * 211) % 9000 + 100; rows.push([`REF-${i}${String(r).padStart(2, '0')}`, `Remittance line ${r + 1}`, (a / 7).toFixed(2), a.toLocaleString('en-US') + '.00']); }
  const [t, c, ang, l, tp] = stamps[i];
  const st = stamp ? `<div style="position:absolute;left:${l}pt;top:${tp}pt;transform:rotate(${ang}deg);border:3pt solid ${c};color:${c};font:bold 34pt 'Liberation Sans';padding:2pt 8pt;z-index:3">${t}</div>` : '';
  const n = note && i === 0 ? `<p style="font-size:${note[0]}pt;line-height:${note[1]};margin:0">Statement reissued; see the cover note.</p>` : '';
  return `<div class="pg">${st}<div class="c"><h2 style="font-size:15pt;margin:0 0 6pt">Remittance statement, page ${i + 1}</h2>${n}<table><tr><th>Ref</th><th>Line</th><th class="n">Net</th><th class="n">Gross EUR</th></tr>${rows.map((r) => `<tr>${r.map((x, k) => `<td${k >= 2 ? ' class="n"' : ''}>${x}</td>`).join('')}</tr>`).join('')}</table></div></div>`;
}
const doc = (stamp, note) => `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4;margin:0}body{margin:0;font-family:'Liberation Sans';font-size:10pt}.pg{position:relative;width:595pt;height:841pt;page-break-after:always;overflow:hidden}.c{position:absolute;left:60pt;top:70pt;width:475pt}
table{border-collapse:collapse;width:475pt;margin-top:8pt}td,th{border-bottom:.5pt solid #aaa;padding:4pt 4pt;text-align:left}.n{text-align:right}</style></head><body>${[0, 1, 2].map((i) => page(i, stamp, note)).join('')}</body></html>`;
const P = `${D}/probe9-V2-refix-stamp-SYNTHETIC-`;
pdfs([
  { file: `${P}before.pdf`, html: doc(false, null) },
  { file: `${P}n25.pdf`, html: doc(true, [9, 1.5]) },
  { file: `${P}n90.pdf`, html: doc(true, [9.5, 1.4]) },
]).then(() => console.log('ok'));

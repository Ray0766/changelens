// SYNTHETIC counter-probes (second verifier, fifth pass text), Chromium via Playwright.
// Footer position: fixed, declared first, so positioned content (sup with position: relative, float notes
// with position: relative) is painted after it.
//  M1-<mk>: a paragraph with footnote markers <sup> (position: relative) after words on consecutive lines, and a
//    footnote list whose markers are <sup> too. Marker styles: 1/2 (digits), a/b, *, (1), 1., iii, 123.
//    Edits: -add   adds a footnote (marker in text and list), -word  changes the word right before a marker,
//           -ins   inserts a phrase early in the paragraph (re-wrap).
//  M2: a Chinese note 2 characters wide (lines of two CJK characters, 8 pt), beside a Chinese paragraph:
//    the MARKER pattern allows two letters, so check whether the lines are read as markers.
//    Edits: -ins insertion in the paragraph, -note one character of the note changed.
//  M3: an English note of two-letter words one per line (8 pt) ("to", "be", "OK"...) beside a paragraph.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
const { chromium } = await import('playwright').catch(() => createRequire(import.meta.url)('playwright'));
const out = process.argv[2];
const words = 'The SYNTHETIC water board inspected the northern stations in spring and logged the flow at station 4 as 1,250 litres per minute on each visit. Crews replaced two worn seals on the dosing line and recorded the torque on each flange bolt, as the plan requires for the outlet manifold. No leaks were found at the outlet manifold, and the gauges were calibrated in March. The readings are kept by the district office for ten years, and copies go to the regional board.'.split(' ');
const head = (font, extra = '') => `<!doctype html><html><head><meta charset="utf-8"><style>
 body { font: 11pt/1.5 ${font}; margin: 0; }
 footer { position: fixed; bottom: 0; left: 0; font-size: 8pt; }
 p { margin: 0 0 10pt 0; } sup { position: relative; font-size: 7pt; } ol { list-style: none; padding: 0; font-size: 9pt; } ${extra}
 </style></head><body><footer>SYNTHETIC sample, fictitious board</footer><h1 style="font-size:14pt">SYNTHETIC station report</h1>`;
const docs = {};
const MK = { d: ['1', '2', '3'], a: ['a', 'b', 'c'], s: ['*', '**', '†'], p: ['(1)', '(2)', '(3)'], dot: ['1.', '2.', '3.'], r: ['i', 'ii', 'iii'], big: ['121', '122', '123'] };
const NOTES = ['Flow read on the SYNTHETIC meter at the outlet.', 'Seals bought under the 2026 framework.', 'Gauge certificates are held by the district office.'];
for (const [tag, mk] of Object.entries(MK)) {
  // marker positions: words 9, 20 (consecutive lines at 60% width roughly) and 31 when added
  const pos = [9, 20, 31];
  const para = (n, ins, word) => words.map((w, k) => {
    let t = w;
    if (k === 19 && word) t = 'carefully';
    if (k === 5 && ins) t += ' and eastern';
    const at = pos.indexOf(k);
    if (at >= 0 && at < n) t += `<sup>${mk[at]}</sup>`;
    return t;
  }).join(' ');
  const list = (n) => `<ol>${NOTES.slice(0, n).map((x, q) => `<li><sup>${mk[q]}</sup> ${x}</li>`).join('')}</ol>`;
  const doc = (n, ins, word) => head("'Liberation Sans', sans-serif", 'p.t { width: 60%; }') + `<p class="t">${para(n, ins, word)}</p><p>${words.slice(0, 30).join(' ')}</p>${list(n)}</body></html>`;
  const k = `M1-${tag}`;
  docs[`${k}-before`] = doc(2, false, false);
  docs[`${k}-add`] = doc(3, false, false);
  docs[`${k}-word`] = doc(2, false, true);
  docs[`${k}-ins`] = doc(2, true, false);
}
// M2: Chinese note 2 characters per line
const zhPara = '本报告为合成样例（SYNTHETIC），记录北区各泵站春季巡检的结果。巡检人员在每次到访时记录四号站的流量，并更换了加药管线上两处磨损的密封件。所有法兰螺栓的扭矩均按计划记录在案，出水总管未发现泄漏，各压力表已于三月完成校准。';
const zn = (n) => `注明数据${n ? '已经' : '暂时'}保存待审`;
for (const side of ['left', 'right']) {
  const css = `.note { float: ${side}; position: relative; width: 2.2em; font-size: 8pt; line-height: 1.3; } p.t { text-align: justify; }`;
  const b = (ins, n) => head("'WenQuanYi Zen Hei', sans-serif", css) + `<div class="note">${zn(n)}</div><p class="t">${ins ? zhPara.replace('记录北区', '记录北区和东区') : zhPara}</p><p>${zhPara}</p></body></html>`;
  const k = `M2-${side[0]}`;
  docs[`${k}-before`] = b(false, false); docs[`${k}-ins`] = b(true, false); docs[`${k}-note`] = b(false, true);
}
// M3: two-letter words one per line
for (const side of ['left', 'right']) {
  const css = `.note { float: ${side}; position: relative; width: 1.6em; font-size: 8pt; line-height: 1.3; } p.t { text-align: justify; }`;
  const en = (n) => ['OK', 'to', n ? 'go' : 'be', 'as', 'is'].join(' ');
  const b = (ins, n) => head("'Liberation Sans', sans-serif", css) + `<div class="note">${en(n)}</div><p class="t">${words.map((x, q) => (q === 5 && ins ? x + ' and eastern' : x)).join(' ')}</p><p>${words.join(' ')}</p></body></html>`;
  const k = `M3-${side[0]}`;
  docs[`${k}-before`] = b(false, false); docs[`${k}-ins`] = b(true, false); docs[`${k}-note`] = b(false, true);
}
const browser = await chromium.launch();
const tab = await browser.newPage();
for (const [name, html] of Object.entries(docs)) {
  await tab.setContent(html);
  writeFileSync(join(out, `SYNTHETIC-${name}.pdf`), await tab.pdf({ format: 'A4', margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' } }));
}
await browser.close();
console.log('ok', Object.keys(docs).length);

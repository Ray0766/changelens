#!/usr/bin/env node
// Fix round 9, area T3 (context in Chinese and Japanese), third pass: a
// SYNTHETIC probe printed with Chromium (Playwright), A4, 18 mm margins,
// WenQuanYi Zen Hei / IPAGothic.
//
// Usage:  node test/fixtures/gen9/probe9-T3c.mjs OUT_DIR   (OUT_DIR: test/fixtures)
//
//   probe9-T3-sign-before / -after
//       four sentences that each start with a full-width sign or mark right
//       after a sentence end (－20℃, ＋5%, ～11月30日, －1,200元), so that
//       the context of the figure changed later in the sentence starts at
//       the sign; every figure changed is fictitious
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const { chromium } = await import('playwright').catch(() => createRequire(import.meta.url)('playwright'));
const out = process.argv[2];
if (!out) {
  console.error('usage: node probe9-T3c.mjs OUT_DIR');
  process.exit(2);
}

const CSS = `body{font-family:'WenQuanYi Zen Hei','IPAGothic',sans-serif;font-size:10.5pt;line-height:1.6}
h1{font-size:15pt} table{border-collapse:collapse;margin:6pt 0} td,th{border:0.5pt solid #888;text-align:left}
table.tight td, table.tight th{padding:1pt 3pt} table.norm td, table.norm th{padding:2pt 8pt} td.r{text-align:right}`;
const page = (title, body) => `<!doctype html><html lang=zh><head><meta charset=utf-8><style>${CSS}</style></head><body><h1>${title}</h1>${body}</body></html>`;

function sign(after) {
  const s = (x, y) => (after ? y : x);
  const body = `
<p>本页为 SYNTHETIC 合成样例。设备应在室内使用。－20℃以下时，泵的启动时间为${s('30', '45')}秒，并应先预热。</p>
<p>本合同自签订之日起生效。＋5%以内的偏差，由乙方在${s('3', '5')}日内书面确认。</p>
<p>受付は終了しました。～11月30日まで延長分は${s('2', '4')}件です。</p>
<p>以下为调整额。－1,200元为本期扣款，实发金额为${s('8,800', '9,600')}元。</p>
`;
  return page('上下文符号（SYNTHETIC 合成样例 RB）', body);
}

const browser = await chromium.launch();
const p = await browser.newPage();
for (const [name, html] of Object.entries({ 'probe9-T3-sign-before': sign(false), 'probe9-T3-sign-after': sign(true) })) {
  await p.setContent(html);
  const margin = { top: '18mm', bottom: '18mm', left: '18mm', right: '18mm' };
  writeFileSync(join(out, `${name}.pdf`), await p.pdf({ format: 'A4', margin, printBackground: true }));
  console.log('wrote', `${name}.pdf`);
}
await browser.close();

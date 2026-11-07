#!/usr/bin/env node
// Blind held-out evaluation cases, set 2, author "a" (business documents).
// Writes eval/cases/holdout2-a-<id>/{before.pdf,after.pdf,truth.json}.
// Every company, person, address, account number and amount is invented;
// each PDF footer carries the words "synthetic sample".
//
// Run:  NODE_PATH=/opt/node-tools/node_modules node eval/make-holdout2-a.mjs
// (requires Playwright's Chromium and the fonts Liberation Serif/Sans, Inter,
// DejaVu Serif and WenQuanYi Zen Hei).
//
// truth.json items follow eval/make-cases.mjs:
//   { type, old?, new?, oldPage?, newPage?, many? }
// Only deliberate edits are listed; re-flow, page-number and page-count
// changes caused by those edits are not.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import('playwright').catch(() => createRequire(import.meta.url)('playwright'));
const root = join(dirname(fileURLToPath(import.meta.url)), 'cases');
const AUTHOR = 'a';

// Inter's contextual alternates ('calt') make Chromium emit the minus sign,
// hyphens before digits and parentheses as private-use code points in the PDF
// text layer, so the Inter documents switch 'calt' off to keep U+2212 readable.
// overflow-x:hidden keeps Chromium from shrinking a whole page to fit when one
// line is too wide; the over-wide line is then cut at the page edge instead.
const baseCss = ({ font, size = '10.5pt', margin = '20mm', lh = 1.45, features = '' }) => `
  @page { size: A4; }
  html, body { overflow-x: hidden; }
  body { font-family: ${font}; font-size: ${size}; line-height: ${lh}; color: #1b1f24; margin: 0; padding: 0 ${margin}; ${features ? `font-feature-settings: ${features};` : ''} }
  h1 { font-size: 20pt; margin: 0 0 8pt; font-weight: 700; }
  h2 { font-size: 12.5pt; margin: 13pt 0 5pt; }
  p { margin: 0 0 7pt; text-align: justify; }
  .page { break-before: page; }
  table { border-collapse: collapse; }
  small, .small { font-size: 6.5pt; color: #4a4f55; line-height: 1.3; }
`;
const html = (css, body) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`;

const tpl = (text, font = 'sans-serif', align = 'left') =>
  `<div style="font-size:7.5pt;width:100%;padding:0 18mm;color:#6b7178;font-family:${font};text-align:${align};font-feature-settings:'calt' 0">${text}</div>`;
const pageOf = (fmt) => fmt.replace('{p}', '<span class="pageNumber"></span>').replace('{n}', '<span class="totalPages"></span>');

const cases = [];
const add = (id, description, before, after, truth, pdfOpts) => cases.push({ id: `holdout2-${AUTHOR}-${id}`, description, before, after, truth, pdfOpts });

// ---------------------------------------------------------------------------
// 1. Invoice with altered payment details (English, 1 page -> 1 page).
// A line amount has its digits transposed while the totals stay the same, the
// minus sign of the discount disappears, the bank name and the last IBAN digit
// change, and a new no-wrap notice line is cut off at the right page edge.
{
  const v0 = { amount: '1,180.00', discount: '−€62.40', bank: 'Nordhafen Sparkasse', iban: 'DE44 5001 0517 5407 3249 31', notice: false };
  const v1 = { amount: '1,810.00', discount: '€62.40', bank: 'Elbtal Direktbank', iban: 'DE44 5001 0517 5407 3249 37', notice: true };
  const css = baseCss({ font: "'Inter', 'Liberation Sans', sans-serif", size: '9.5pt', features: "'calt' 0" }) + `
    .top { display: flex; justify-content: space-between; margin-bottom: 14pt; }
    .kv td { padding: 1pt 0 1pt 14pt; } .kv td:first-child { color: #5b6168; padding-left: 0; }
    table.items { width: 100%; margin: 10pt 0 6pt; }
    .items th { text-align: left; font-weight: 600; border-bottom: 1pt solid #1b1f24; padding: 4pt 5pt; }
    .items td { border-bottom: 0.5pt solid #c9ced4; padding: 4pt 5pt; }
    .items .n { text-align: right; white-space: nowrap; }
    table.totals { margin: 4pt 0 14pt auto; min-width: 70mm; }
    .totals td { padding: 2pt 5pt; } .totals td.n { text-align: right; }
    .totals tr.grand td { border-top: 1pt solid #1b1f24; font-weight: 700; padding-top: 4pt; }
    .bank { border: 0.75pt solid #c9ced4; padding: 7pt 9pt; margin: 10pt 0; width: 95mm; }
    .bank div { margin: 1pt 0; }
    .nowrap { white-space: nowrap; margin: 6pt 0; }
  `;
  const doc = (v) => html(css, `
    <div class="top">
      <div><b style="font-size:12pt">Larchmont Office Supplies GmbH</b><br>Hafenstraße 12<br>20457 Hamburg, Germany<br>VAT ID DE 284 615 902</div>
      <table class="kv">
        <tr><td>Invoice no.</td><td>2026-0457</td></tr>
        <tr><td>Invoice date</td><td>20.11.2026</td></tr>
        <tr><td>Due date</td><td>04.12.2026</td></tr>
        <tr><td>Customer no.</td><td>K-50862</td></tr>
      </table>
    </div>
    <h1>Invoice</h1>
    <p style="text-align:left">Bill to: <b>Brightwater Dental Practice</b>, Accounts Payable, Möwenweg 9, 22605 Hamburg</p>
    <table class="items">
      <tr><th>#</th><th>Description</th><th class="n">Qty</th><th class="n">Unit price</th><th class="n">Amount</th></tr>
      <tr><td>1</td><td>Ergonomic office chair, model K2</td><td class="n">4</td><td class="n">€295.00</td><td class="n">€${v.amount}</td></tr>
      <tr><td>2</td><td>Height-adjustable desk, 160 × 80 cm</td><td class="n">2</td><td class="n">€640.00</td><td class="n">€1,280.00</td></tr>
      <tr><td>3</td><td>Dual monitor arm, clamp mount</td><td class="n">4</td><td class="n">€89.50</td><td class="n">€358.00</td></tr>
      <tr><td>4</td><td>Under-desk cable tray</td><td class="n">6</td><td class="n">€24.90</td><td class="n">€149.40</td></tr>
      <tr><td>5</td><td>Delivery, assembly and removal of packaging (flat rate)</td><td class="n">1</td><td class="n">€220.00</td><td class="n">€220.00</td></tr>
      <tr><td>6</td><td>Loyalty discount</td><td class="n"></td><td class="n"></td><td class="n">${v.discount}</td></tr>
    </table>
    <table class="totals">
      <tr><td>Net amount</td><td class="n">€3,125.00</td></tr>
      <tr><td>VAT 19%</td><td class="n">€593.75</td></tr>
      <tr class="grand"><td>Total due</td><td class="n">€3,718.75</td></tr>
    </table>
    <h2>Payment details</h2>
    <div class="bank">
      <div>Bank: ${v.bank}</div>
      <div>Account holder: Larchmont Office Supplies GmbH</div>
      <div>IBAN: ${v.iban}</div>
      <div>BIC: NHSKDEHHXXX</div>
      <div>Reference: 2026-0457</div>
    </div>
    <p>Payment terms: 14 days net from the invoice date. Goods remain our property until paid in full.</p>
    ${v.notice ? '<div class="nowrap">Payments made to any account other than the one stated above will not discharge the debt; please quote invoice number 2026-0457 and your customer number on every transfer and call accounts receivable first.</div>' : ''}
    <p>Thank you for your order. Questions about this invoice: accounts@larchmont-office.example, phone +49 40 5567 2210.</p>
  `);
  add('invoice-bank-details',
    'Synthetic invoice (EN, 1 page). Digits of one line amount transposed (totals unchanged), the minus sign of a discount removed, bank name and last IBAN digit changed, and a new no-wrap notice line that is cut off at the right page edge.',
    doc(v0), doc(v1),
    [
      { type: 'number', old: '1,180.00', new: '1,810.00', oldPage: 1, newPage: 1 },
      { type: 'number', old: '−€62.40', new: '€62.40', oldPage: 1, newPage: 1 },
      { type: 'replace', old: 'Nordhafen Sparkasse', new: 'Elbtal Direktbank', oldPage: 1, newPage: 1 },
      { type: 'number', old: '31', new: '37', oldPage: 1, newPage: 1 },
      { type: 'insert', new: 'Payments made to any account other than', newPage: 1 },
      { type: 'overflow', newPage: 1 },
    ],
    {
      headerTemplate: tpl('Larchmont Office Supplies GmbH · Hafenstraße 12 · Hamburg', "'Inter', sans-serif"),
      footerTemplate: tpl(pageOf('Invoice 2026-0457 · synthetic sample · Page {p} of {n}'), "'Inter', sans-serif", 'right'),
    });
}

// ---------------------------------------------------------------------------
// 2. Chinese price list spanning three pages (ZH, 3 -> 3 pages).
// One price changes on page 1, a discontinued product row is removed on page
// 2 (later rows move up a line, the repeated table header stays), and in the
// notes on page 3 the volume discount, the delivery warehouse and the
// effective date change.
{
  const families = [
    ['BG', '办公耗材', [['A4复印纸', '白色 500张/包', '包'], ['A3复印纸', '白色 500张/包', '包'], ['激光硒鼓', 'LT-K 黑色', '支'], ['喷墨墨盒', 'IJ-C 青色', '个'], ['热敏标签纸', '卷装 防水', '卷'], ['档案盒', '牛皮纸 加厚', '个'], ['中性笔', '0.5mm 黑色 12支/盒', '盒'], ['白板笔', '可擦 4色/盒', '盒']]],
    ['WL', '网络设备', [['千兆交换机', 'NX-G 24口', '台'], ['万兆交换机', 'NX-X 12口', '台'], ['无线接入点', 'AP-W6 吸顶式', '台'], ['企业路由器', 'RT-E 双WAN', '台'], ['光纤收发器', 'FT-S 单模', '对'], ['超六类网线', 'CAT6A 305米/箱', '箱'], ['配线架', 'PP-A 24口', '个'], ['PoE供电模块', 'PS-P 单口', '个']]],
    ['CC', '存储设备', [['固态硬盘', 'SD-N 1TB', '块'], ['机械硬盘', 'HD-E 8TB', '块'], ['网络存储', 'NS-B 四盘位', '台'], ['备份磁带', 'TP-L 第九代', '盘'], ['移动硬盘', 'MH-P 2TB', '个']]],
    ['PJ', '服务器配件', [['服务器内存', 'RM-E 32GB', '条'], ['冗余电源', 'PW-R 800W', '个'], ['机架导轨', 'RK-S 滑轨', '套'], ['风扇模块', 'FN-H 热插拔', '个'], ['阵列卡', 'RC-M 八通道', '块'], ['机柜', 'CB-F 42U', '台']]],
    ['ZD', '终端设备', [['商用显示器', 'MO-B 27英寸', '台'], ['键鼠套装', 'KM-W 无线', '套'], ['扩展坞', 'DK-C 十合一', '个'], ['笔记本支架', 'ST-A 铝合金', '个'], ['降噪耳麦', 'HS-D 双耳', '个'], ['会议摄像头', 'CM-V 广角', '台']]],
  ];
  const variants = ['标准型', '增强型', '工业级'];
  const factors = [1, 1.35, 1.9];
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const fmt = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const rows = [];
  for (const [prefix, , items] of families) {
    items.forEach(([name, spec, unit], i) => {
      const base = 20 + Math.round(rnd() * 3000);
      variants.forEach((variant, k) => {
        let price = Math.round(base * factors[k] * 2) / 2;
        // Keep the digits used by the edited cells unique in the document.
        while (/18|28|1,280|1,820/.test(fmt(price))) price += 3.5;
        rows.push({ code: `${prefix}-${i + 1}${k + 1}`, name: `${name}（${variant}）`, spec, unit, price: fmt(price) });
      });
    });
  }
  const priced = 7; // row whose price changes (page 1)
  const dropped = 52; // row removed in the new version (page 2)
  const css = baseCss({ font: "'WenQuanYi Zen Hei', sans-serif", size: '9.5pt', lh: 1.4 }) + `
    table.list { width: 100%; margin: 6pt 0 10pt; }
    .list th { background: #e9eef3; font-weight: 700; text-align: left; padding: 3pt 5pt; border-bottom: 0.75pt solid #5c6670; }
    .list td { padding: 2.6pt 5pt; border-bottom: 0.5pt solid #d3d8dd; }
    .list .n { text-align: right; white-space: nowrap; }
    ol { margin: 4pt 0 0 0; padding-left: 16pt; } li { margin-bottom: 4pt; }
  `;
  const doc = (v) => {
    const rs = rows.map((r, i) => (i === priced ? { ...r, price: v.price } : r)).filter((_, i) => v.keepRow || i !== dropped);
    return html(css, `
      <h1>2027年度产品价目表</h1>
      <p>本价目表适用于与杭州明川信息技术有限公司签订年度框架协议的企业客户。价格单位为人民币元，已含增值税，规格型号以产品铭牌为准。</p>
      <table class="list">
        <thead><tr><th>编号</th><th>产品名称</th><th>规格型号</th><th>单位</th><th class="n">单价（元）</th></tr></thead>
        <tbody>${rs.map((r) => `<tr><td>${r.code}</td><td>${r.name}</td><td>${r.spec}</td><td>${r.unit}</td><td class="n">${r.price}</td></tr>`).join('')}</tbody>
      </table>
      <h2>说明</h2>
      <ol>
        <li>同一型号单次订购满50件，单价下浮${v.disc}；满200件下浮8%。折扣不与其他优惠同时使用。</li>
        <li>交货方式：卖方负责送货至买方指定仓库（${v.wh}），运费已含在单价中。</li>
        <li>本价目表自2027年3月${v.day}日起生效，此前发布的价目表同时作废。</li>
        <li>如对价格有疑问，请联系销售部，电话 0571-8890 6655。</li>
      </ol>
    `);
  };
  const pdfOpts = {
    headerTemplate: tpl('杭州明川信息技术有限公司 · 2027年度产品价目表', "'WenQuanYi Zen Hei', sans-serif"),
    footerTemplate: tpl(pageOf('合成样例 synthetic sample · 第 {p} 页 / 共 {n} 页'), "'WenQuanYi Zen Hei', sans-serif", 'right'),
  };
  add('zh-price-list',
    '合成样例。三页中文价目表：第1页一个单价修改；第2页删除一行停产产品（后续行上移，表头在每页重复）；第3页说明中折扣比例、交货仓库和生效日期修改。',
    doc({ price: '1,280.00', keepRow: true, disc: '5%', wh: '杭州滨江', day: '18' }),
    doc({ price: '1,820.00', keepRow: false, disc: '3%', wh: '苏州吴中', day: '28' }),
    [
      { type: 'number', old: '1,280.00', new: '1,820.00', oldPage: 1, newPage: 1 },
      { type: 'delete', old: rows[dropped].code, oldPage: 2 },
      { type: 'number', old: '5%', new: '3%', oldPage: 3, newPage: 3 },
      { type: 'replace', old: '杭州滨江', new: '苏州吴中', oldPage: 3, newPage: 3 },
      { type: 'number', old: '18', new: '28', oldPage: 3, newPage: 3 },
    ],
    pdfOpts);
}

// ---------------------------------------------------------------------------
// 3. Tenancy agreement: a new clause pushes the rest onto a fourth page
// (EN, 3 -> 4 pages). Clauses use hierarchical numbers and the new clause is
// added as the last sub-clause of section 5, so no clause is renumbered.
// Also: start month and monthly rent change on page 1, and one sentence is
// removed from the middle of a long paragraph on page 3.
{
  const css = baseCss({ font: "'Liberation Serif', serif", size: '11pt', lh: 1.45 }) + `
    .cl { display: flex; gap: 8pt; margin: 0 0 6pt; text-align: justify; }
    .cl > span:first-child { flex: 0 0 22pt; }
    .cl > span:last-child { flex: 1; }
    .sig { display: flex; gap: 20mm; margin-top: 18pt; } .sig div { flex: 1; border-top: 0.75pt solid #333; padding-top: 4pt; }
    table.sch { width: 100%; margin: 4pt 0 8pt; }
    .sch td { border: 0.6pt solid #a3abb3; padding: 3pt 6pt; vertical-align: top; }
    .sch td:first-child { width: 48mm; font-weight: 700; }
  `;
  const C =(n, t) => `<div class="cl"><span>${n}</span><span>${t}</span></div>`;
  const doc = (v) => html(css, `
    <h1>Residential Tenancy Agreement</h1>
    <p>This agreement is dated 12 January 2027 and sets out the terms on which the Property is let. The Tenant should read it carefully and ask for an explanation of anything that is unclear before signing.</p>
    <h2>1. Parties and property</h2>
    ${C('1.1', 'This agreement is made between Marigold Lettings Ltd (“the Landlord”) and Tomasz Brennan-Okafor (“the Tenant”) for the letting of Flat 4, 27 Kestrel Road, Norwich (“the Property”), together with the fixtures, fittings and furniture listed in the inventory.')}
    ${C('1.2', 'Where there is more than one tenant, each of them is responsible for all of the obligations under this agreement, both jointly and individually.')}
    <h2>2. Term</h2>
    ${C('2.1', `The tenancy starts on 1 ${v.month} 2027 (“the Commencement Date”) and continues for a fixed term of twelve months.`)}
    ${C('2.2', 'If neither party ends the tenancy at the end of the fixed term, it continues from month to month on the same terms until it is ended in accordance with section 8.')}
    <h2>3. Rent and outgoings</h2>
    ${C('3.1', `The rent is £${v.rent} per calendar month, payable in advance by standing order on the first day of each month.`)}
    ${C('3.2', 'The first payment is due on the Commencement Date. If the tenancy starts part-way through a month, the first payment is reduced in proportion to the number of days remaining in that month.')}
    ${C('3.3', 'The rent may be reviewed once a year after the end of the fixed term. The Landlord will give at least one month’s written notice of any increase, and the new rent will be no more than the open market rent for comparable properties in the area.')}
    ${C('3.4', 'Council tax, water, electricity, gas, broadband and television licence costs are the responsibility of the Tenant from the Commencement Date until the end of the tenancy.')}
    <h2>4. Deposit</h2>
    ${C('4.1', 'Before the Commencement Date the Tenant pays a deposit equal to five weeks’ rent as security for the performance of the Tenant’s obligations.')}
    ${C('4.2', 'The deposit is protected in a government-approved scheme within thirty days of receipt, and the Landlord gives the Tenant the prescribed information about the scheme within the same period.')}
    ${C('4.3', 'At the end of the tenancy the deposit is returned within ten days of agreement on any deductions. Deductions may be made only for unpaid rent, damage beyond fair wear and tear, missing items listed in the inventory and reasonable cleaning costs.')}
    <h2>5. Tenant’s obligations</h2>
    <p>The Tenant agrees:</p>
    ${C('5.1', 'to use the Property as a private home for the Tenant and the members of the household named in the schedule only, and not for any trade or business;')}
    ${C('5.2', 'to keep the interior of the Property in good and clean condition, and to replace light bulbs, fuses and smoke alarm batteries when needed;')}
    ${C('5.3', 'not to make alterations or additions to the Property, including painting, fixing shelves or installing satellite dishes, without the Landlord’s written consent, which will not be unreasonably withheld;')}
    ${C('5.4', 'to report any disrepair, defect or damage to the Landlord promptly in writing, and in an emergency also by telephone;')}
    ${C('5.5', 'to take reasonable steps to prevent condensation and mould by heating and ventilating the Property adequately, and not to dry clothes on radiators;')}
    ${C('5.6', 'not to cause a nuisance or annoyance to neighbours, and to keep noise to a reasonable level between 11 pm and 7 am;')}
    ${C('5.7', 'not to sublet or part with possession of the whole or any part of the Property, and not to take in lodgers or paying guests;')}
    ${C('5.8', 'to allow the Landlord access to the Property for repairs and inspections in accordance with section 7.')}
    ${v.pets ? C('5.9', 'that the Tenant may keep one cat or one small dog at the Property, provided that the animal is vaccinated, insured against third-party liability and not left alone for more than eight hours at a time. The Tenant will have the carpets professionally cleaned and the Property treated against fleas at the end of the tenancy, and will pay for any damage caused by the animal, whether or not the cost exceeds the deposit. The Landlord may withdraw this permission on two months’ written notice if the animal causes a nuisance to neighbours or repeated damage to the Property. No other animals, birds or reptiles may be kept at the Property without the Landlord’s separate written consent, and the Tenant will make sure that any visitor’s animal is not brought into the communal areas of the building.') : ''}
    <h2>6. Landlord’s obligations</h2>
    <p>The Landlord agrees:</p>
    ${C('6.1', 'to keep in repair the structure and exterior of the Property, including drains, gutters and external pipes;')}
    ${C('6.2', 'to keep in repair and proper working order the installations for the supply of water, gas and electricity, for sanitation and for space heating and heating water;')}
    ${C('6.3', 'to arrange an annual gas safety check by a registered engineer and give the Tenant a copy of the record within twenty-eight days of the check;')}
    ${C('6.4', 'to allow the Tenant quiet enjoyment of the Property without unnecessary interruption by the Landlord or anyone acting for the Landlord.')}
    <h2>7. Access and inspections</h2>
    ${C('7.1', `The Landlord, or an agent or contractor acting for the Landlord, may enter the Property at reasonable times of day to inspect its condition, to carry out repairs or to carry out the safety checks required by law. Except in an emergency, the Landlord will give the Tenant at least twenty-four hours’ written notice of each visit, stating its purpose and its expected duration. Routine inspections will not take place more than once every three months.${v.sundays ? ' Such visits shall not take place on Sundays or public holidays unless the Tenant agrees.' : ''} Where contractors need access, the Landlord will try to group the work into as few visits as possible and will tell the Tenant the name of the contractor in advance. If the Tenant will not be at home, the Landlord may use the spare key held at the agent’s office, and will lock the Property and leave a note on departure.`)}
    ${C('7.2', 'In an emergency, such as a gas leak, a fire or a flood, the Landlord may enter without notice and will tell the Tenant as soon as reasonably possible afterwards.')}
    <h2>8. Ending the tenancy</h2>
    ${C('8.1', 'The Tenant may end the tenancy at the end of the fixed term, or at any time afterwards, by giving at least one month’s written notice expiring on the day before a rent day.')}
    ${C('8.2', 'The Landlord may end the tenancy only by giving the notice required by law and, where necessary, by obtaining a court order.')}
    ${C('8.3', 'At the end of the tenancy the Tenant will return all keys, remove all personal belongings and leave the Property in the condition recorded in the inventory, allowing for fair wear and tear.')}
    ${C('8.4', 'Any items left at the Property after the end of the tenancy will be stored for fourteen days and may then be disposed of, with the reasonable cost of storage and disposal deducted from the deposit.')}
    <h2>9. Notices</h2>
    ${C('9.1', 'Notices under this agreement must be in writing and may be delivered by hand, sent by first-class post or sent by email to the addresses given in the schedule.')}
    ${C('9.2', 'A notice sent by email is treated as received on the next working day after it was sent, unless the sender receives a message that delivery failed.')}
    <h2>10. General</h2>
    ${C('10.1', 'The Landlord processes the Tenant’s personal data only for the purposes of managing the tenancy and in accordance with data protection law.')}
    ${C('10.2', 'If any part of this agreement is found to be invalid, the rest of the agreement remains in force.')}
    ${C('10.3', 'This agreement is governed by the law of England and Wales.')}
    <h2>Schedule</h2>
    <table class="sch">
      <tr><td>Household</td><td>Tomasz Brennan-Okafor and one child under the age of ten.</td></tr>
      <tr><td>Deposit</td><td>Five weeks’ rent, protected with an approved tenancy deposit scheme; scheme certificate sent to the Tenant by email.</td></tr>
      <tr><td>Landlord’s address for notices</td><td>Marigold Lettings Ltd, 3 Wherry Yard, Norwich; lettings@marigold-lettings.example</td></tr>
      <tr><td>Tenant’s address for notices</td><td>The Property; t.brennan-okafor@mail.example</td></tr>
      <tr><td>Inventory</td><td>Inventory and schedule of condition dated 11 January 2027, with photographs, signed by both parties at check-in.</td></tr>
      <tr><td>Meter readings at check-in</td><td>Electricity 04912 kWh; gas 01377 m³; water meter not fitted.</td></tr>
      <tr><td>Keys handed over</td><td>Two front door keys, two flat keys, one bin store fob and one post box key.</td></tr>
    </table>
    <div class="sig"><div>Signed for the Landlord<br><br>Date</div><div>Signed by the Tenant<br><br>Date</div></div>
  `);
  add('lease-clause-added',
    'Synthetic tenancy agreement (EN, 3 → 4 pages). A long new clause 5.9 is added at the end of section 5, pushing everything after it down and onto a new fourth page (no renumbering); the start month and the monthly rent change on page 1; one sentence is removed from the middle of a long paragraph in section 7.',
    doc({ month: 'February', rent: '1,450.00', pets: false, sundays: true }),
    doc({ month: 'March', rent: '1,495.00', pets: true, sundays: false }),
    [
      { type: 'replace', old: 'February', new: 'March', oldPage: 1, newPage: 1 },
      { type: 'number', old: '1,450.00', new: '1,495.00', oldPage: 1, newPage: 1 },
      { type: 'insert', new: 'the Tenant may keep one cat or one small dog', newPage: 2 },
      { type: 'delete', old: 'Such visits shall not take place on Sundays or public holidays', oldPage: 2 },
    ],
    {
      headerTemplate: tpl('Marigold Lettings Ltd · Tenancy agreement for Flat 4, 27 Kestrel Road', "'Liberation Sans', sans-serif"),
      footerTemplate: tpl(pageOf('Synthetic sample · Page {p} of {n}'), "'Liberation Sans', sans-serif", 'right'),
    });
}

// ---------------------------------------------------------------------------
// 4. Services agreement after a change of supplier entity (EN, 3 -> 3 pages).
// The supplier's name changes in all its occurrences on every page, the
// subcontracting paragraph moves from section 2 (page 1) to section 11
// (page 3), the late-payment rate changes, the limitation-of-liability
// paragraph becomes bold, and one digit of the company number in the 6.5 pt
// small print on the last page changes.
{
  const css = baseCss({ font: "'DejaVu Serif', serif", size: '10pt', lh: 1.5 }) + `
    p b.lead { font-weight: 700; }
    .bold { font-weight: 700; }
    .sig { display: flex; gap: 18mm; margin-top: 16pt; } .sig div { flex: 1; border-top: 0.75pt solid #333; padding-top: 4pt; font-size: 9pt; }
    .fine { margin-top: 18pt; border-top: 0.5pt solid #9aa1a8; padding-top: 4pt; }
  `;
  const P = (lead, t, cls = '') => `<p${cls ? ` class="${cls}"` : ''}><b class="lead">${lead}</b> ${t}</p>`;
  const sub = P('Subcontracting.', 'The Supplier may not subcontract any part of the Services without the Customer’s prior written consent. Where consent is given, the Supplier remains responsible for the acts and omissions of its subcontractors as if they were its own, and will ensure that each subcontractor is bound by obligations of confidentiality and data protection at least as strict as those in this agreement.');
  const doc = (v) => {
    const S = v.name;
    return html(css, `
      <h1>Analytics Services Agreement</h1>
      <p>This agreement is made on 2 November 2026 between <b>Fernhollow Home Insurance plc</b> (“the Customer”) and <b>${S} Analytics Ltd</b> (“the Supplier”), each a “party”.</p>
      <p>The Customer wishes to obtain monthly claims analytics and fraud-risk dashboards, and ${S} Analytics Ltd has agreed to provide them on the terms below.</p>
      <h2>1. Definitions</h2>
      <p>In this agreement “Services” means the services described in Schedule 1; “Customer Data” means all data supplied by or on behalf of the Customer; “Business Day” means a day other than a Saturday, Sunday or public holiday in England; and “Contract Year” means each period of twelve months starting on the Start Date or an anniversary of it.</p>
      <h2>2. Services</h2>
      ${P('Scope.', 'The Supplier will provide the Services from the Start Date with reasonable skill and care and in accordance with good industry practice.')}
      ${P('Deliverables.', 'The monthly dashboards will be published on the secure portal no later than the fifth Business Day of each month, together with a short commentary on significant movements.')}
      ${v.subFirst ? sub : ''}
      ${P('Changes.', 'Either party may propose a change to the Services. No change takes effect until it is recorded in a change note signed by both parties, setting out any effect on the fees and the timetable.')}
      <h2>3. Service levels</h2>
      ${P('Availability.', `The portal operated by ${S} Analytics Ltd will be available at least 99.5% of the time in each calendar month, excluding planned maintenance notified at least five Business Days in advance.`)}
      ${P('Support.', 'Support requests may be raised by email or through the portal between 08:00 and 18:00 on Business Days. Priority 1 incidents are acknowledged within one hour.')}
      ${P('Service credits.', 'If availability falls below the target in any month, the Customer is entitled to a service credit calculated in accordance with Schedule 2. Service credits are the Customer’s sole financial remedy for failure to meet the availability target.')}
      <h2>4. Customer obligations</h2>
      <p>The Customer will supply the Customer Data in the agreed format by the last Business Day of each month, give the Supplier timely access to the people and information it reasonably needs, and tell the Supplier promptly of any change that may affect the Services.</p>
      <h2>5. Fees and payment</h2>
      ${P('Fees.', 'The Customer will pay the fees set out in Schedule 3. Fees are fixed for the first Contract Year and may afterwards be increased once a year by no more than the change in the consumer prices index over the previous twelve months.')}
      ${P('Invoices.', `${S} Analytics Ltd will invoice monthly in arrears. The Customer will pay each undisputed invoice within thirty days of receipt and will notify any dispute within ten Business Days, giving reasons.`)}
      ${P('Late payment.', `Late payments carry interest at ${v.rate} per year above the base rate from the due date until payment is received.`)}
      <h2>6. Data protection</h2>
      <p>The Supplier processes personal data contained in the Customer Data only on the Customer’s documented instructions and only for the purpose of providing the Services. It will keep the data within the United Kingdom, apply appropriate technical and organisational security measures, ensure that its staff are bound by confidentiality, notify the Customer without undue delay and in any event within forty-eight hours of becoming aware of a personal data breach, and assist the Customer in responding to requests from data subjects. At the end of the agreement the Supplier will return or securely delete the Customer Data at the Customer’s choice and confirm this in writing.</p>
      <h2>7. Confidentiality</h2>
      <p>Each party will keep the other’s confidential information secret, use it only for the purposes of this agreement and disclose it only to those of its employees, advisers and auditors who need to know it. This obligation continues for five years after the end of the agreement.</p>
      <h2>8. Intellectual property</h2>
      <p>The Customer owns the Customer Data and the dashboards produced for it. ${S} Analytics Ltd keeps ownership of its software, models and methods, and grants the Customer a non-exclusive licence to use them as part of the dashboards for the duration of this agreement.</p>
      <h2>9. Limitation of liability</h2>
      <p${v.boldLiability ? ' class="bold"' : ''}>Neither party limits its liability for death or personal injury caused by its negligence, for fraud or for any other liability that cannot be limited by law. Subject to that, each party’s total liability under this agreement in any Contract Year is limited to the fees paid or payable in that Contract Year, and neither party is liable for loss of profits, loss of business or any indirect or consequential loss.</p>
      <h2>10. Term and termination</h2>
      <p>This agreement starts on 1 December 2026 (“the Start Date”) and continues for three years. Either party may end it by written notice if the other commits a material breach that is not remedied within thirty days of being asked to do so, or if the other becomes insolvent. The Customer may also end it on six months’ written notice at any time after the first Contract Year.</p>
      <p>On termination the Supplier will provide reasonable assistance to transfer the Services to the Customer or to a replacement supplier, charged at the rates in Schedule 3.</p>
      <h2>11. General</h2>
      ${P('Notices.', 'Notices must be in writing and sent to the registered office of the receiving party, with a copy by email to the contact named in Schedule 4.')}
      ${P('Entire agreement.', 'This agreement and its schedules form the entire agreement between the parties about its subject matter and replace all earlier discussions.')}
      ${P('Assignment.', 'Neither party may assign or transfer this agreement without the written consent of the other, which will not be unreasonably withheld.')}
      ${v.subFirst ? '' : sub}
      ${P('Governing law.', 'This agreement is governed by the law of England and Wales, and the courts of England have exclusive jurisdiction.')}
      <div class="sig"><div>Signed for Fernhollow Home Insurance plc<br><br>Name, title, date</div><div>Signed for ${S} Analytics Ltd<br><br>Name, title, date</div></div>
      <p class="fine small">The Supplier is registered in England and Wales under company number ${v.reg}. Registered office: 14 Tanner Row, York. The Customer is authorised and regulated by its financial services regulator; register details are available on request.</p>
    `);
  };
  add('services-supplier-renamed',
    'Synthetic services agreement (EN, 3 pages). The supplier’s name changes in every occurrence across all pages, the subcontracting paragraph moves from section 2 (page 1) to section 11 (page 3), the late-payment interest rate changes, the limitation-of-liability paragraph becomes bold, and one digit of the company number in 6.5 pt small print changes.',
    doc({ name: 'Quillfield', subFirst: true, rate: '4%', boldLiability: false, reg: '08412763' }),
    doc({ name: 'Brackenridge', subFirst: false, rate: '8%', boldLiability: true, reg: '08412768' }),
    [
      { type: 'replace', old: 'Quillfield', new: 'Brackenridge', many: true },
      { type: 'move', old: 'The Supplier may not subcontract', new: 'The Supplier may not subcontract', oldPage: 1, newPage: 3 },
      { type: 'number', old: '4%', new: '8%', oldPage: 2, newPage: 2 },
      { type: 'format', old: 'Neither party limits its liability', new: 'Neither party limits its liability', oldPage: 2, newPage: 2 },
      { type: 'number', old: '08412763', new: '08412768', oldPage: 3, newPage: 3 },
    ],
    {
      headerTemplate: tpl('Analytics Services Agreement · Ref. FHI-PRC-2026-118', "'DejaVu Sans', sans-serif"),
      footerTemplate: tpl(pageOf('Synthetic sample · Page {p} of {n}'), "'DejaVu Sans', sans-serif", 'right'),
    });
}

// ---------------------------------------------------------------------------
// 5. Bilingual project schedule with a Gantt chart (ZH/EN mixed, 2 -> 2).
// One task's progress, another task's end date (ISO format) and one owner
// change; the Gantt bar of the delayed task is drawn longer; a milestone is
// added to a list whose dates use Chinese and English formats.
{
  const tasks = (v) => [
    ['T1', '需求确认 Requirements sign-off', '周婷 Zhou Ting', '2027-01-11', '2027-01-22', '100%'],
    ['T2', '方案设计 Solution design', '赵敏 Zhao Min', '2027-01-25', '2027-02-19', '100%'],
    ['T3', '开发与单元测试 Build and unit test', '陈晓东 Chen Xiaodong', '2027-02-22', '2027-03-26', v.done],
    ['T4', '系统联调 Integration testing', '刘佳 Liu Jia', '2027-03-29', `2027-04-${v.end}`, '0%'],
    ['T5', '用户验收测试 User acceptance test', v.owner, '2027-04-26', '2027-05-14', '0%'],
    ['T6', '上线与切换 Go-live and cutover', '刘佳 Liu Jia', '2027-05-17', '2027-05-21', '0%'],
  ];
  const day0 = Date.UTC(2027, 0, 1);
  const dayOf = (iso) => (Date.parse(iso + 'T00:00:00Z') - day0) / 86400000;
  const gantt = (v) => {
    const W = 600, left = 40, scale = (W - left - 10) / 151, rowH = 22, top = 26;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May'];
    const starts = [0, 31, 59, 90, 120];
    const grid = starts.map((s, i) => `<line x1="${left + s * scale}" y1="14" x2="${left + s * scale}" y2="${top + 6 * rowH}" stroke="#c9ced4" stroke-width="0.6"/><text x="${left + s * scale + 3}" y="11" font-size="8.5" fill="#5b6168" font-family="Inter">${months[i]}</text>`).join('');
    const bars = tasks(v).map(([id, , , s, e, done], i) => {
      const x = left + dayOf(s) * scale, w = (dayOf(e) - dayOf(s) + 1) * scale, y = top + i * rowH;
      const fill = done === '100%' ? '#2f6f4f' : '#3a6ea5';
      return `<text x="4" y="${y + 12}" font-size="8.5" fill="#1b1f24" font-family="Inter">${id}</text><rect x="${x.toFixed(1)}" y="${y + 3}" width="${w.toFixed(1)}" height="12" rx="2" fill="${fill}"/>`;
    }).join('');
    return `<svg width="${W}" height="${top + 6 * rowH + 4}" style="display:block;margin:8pt 0 4pt">${grid}${bars}</svg>`;
  };
  const css = baseCss({ font: "'Inter', 'WenQuanYi Zen Hei', sans-serif", size: '9.5pt', lh: 1.5, features: "'calt' 0" }) + `
    table.sch { width: 100%; margin: 6pt 0 8pt; table-layout: fixed; }
    .sch th { text-align: left; font-weight: 600; border-bottom: 1pt solid #1b1f24; padding: 4pt 5pt; }
    .sch td.d { white-space: nowrap; }
    .sch td { border-bottom: 0.5pt solid #c9ced4; padding: 4pt 5pt; }
    .sch .n { text-align: right; white-space: nowrap; }
    ul { margin: 4pt 0 8pt; padding-left: 14pt; } li { margin-bottom: 3pt; }
    .cap { font-size: 8pt; color: #5b6168; }
  `;
  const doc = (v) => html(css, `
    <h1>仓储管理系统升级 · 项目进度计划</h1>
    <p style="text-align:left"><b>WMS Upgrade — Project Schedule.</b> 本计划由项目管理办公室（PMO）维护，每周一在项目例会上复核。All dates are working days, China Standard Time.</p>
    <table class="sch">
      <colgroup><col style="width:9%"><col style="width:33%"><col style="width:20%"><col style="width:14%"><col style="width:14%"><col style="width:10%"></colgroup>
      <tr><th>编号 ID</th><th>任务 Task</th><th>负责人 Owner</th><th>开始 Start</th><th>结束 End</th><th class="n">完成 Done</th></tr>
      ${tasks(v).map((t) => `<tr><td>${t[0]}</td><td>${t[1]}</td><td>${t[2]}</td><td class="d">${t[3]}</td><td class="d">${t[4]}</td><td class="n">${t[5]}</td></tr>`).join('')}
    </table>
    <h2>甘特图 Gantt chart</h2>
    ${gantt(v)}
    <p class="cap">图 1　任务时间线（绿色为已完成）。Figure 1: task timeline, completed tasks in green.</p>
    <h2>里程碑 Milestones</h2>
    <ul>
      <li>设计评审通过 Design review passed — 19 Feb 2027</li>
      <li>代码冻结 Code freeze — 2027年3月26日</li>
      ${v.rehearsal ? '<li>数据迁移演练完成 Data migration rehearsal complete — 2027年4月21日</li>' : ''}
      <li>验收签字 UAT sign-off — 14 May 2027</li>
      <li>正式上线 Go-live — 2027年5月21日</li>
    </ul>
    <div class="page">
      <h2>风险与依赖 Risks and dependencies</h2>
      <p>库存数据迁移依赖旧系统在切换周末停止出入库操作。If the warehouse cannot stop movements for the cutover weekend, go-live moves to the next available weekend and the steering group must approve the new date.</p>
      <p>扫码枪固件升级由供应商负责，须在联调开始前完成。The scanner firmware upgrade is a vendor deliverable and must be finished before integration testing starts; any delay is reported at the Monday meeting.</p>
      <p>用户验收测试需要每个仓库至少两名关键用户全程参与。Acceptance testing needs at least two key users from each warehouse for its full duration; line managers have confirmed their availability in writing.</p>
      <h2>变更记录 Change log</h2>
      <p>本页仅记录已批准的计划变更。Only approved changes to the plan are recorded here; requests under discussion are tracked in the PMO register.</p>
    </div>
  `);
  add('zh-en-project-schedule',
    '合成样例 / synthetic. 中英混排项目进度计划（2页）：T3 完成比例、T4 结束日期（ISO 格式）和 T5 负责人修改；甘特图中 T4 的条形加长；里程碑列表新增一项（中英两种日期格式）。',
    doc({ done: '60%', end: '09', owner: '王磊 Wang Lei', rehearsal: false }),
    doc({ done: '75%', end: '23', owner: '孙悦 Sun Yue', rehearsal: true }),
    [
      { type: 'number', old: '60%', new: '75%', oldPage: 1, newPage: 1 },
      { type: 'number', old: '09', new: '23', oldPage: 1, newPage: 1 },
      { type: 'replace', old: '王磊 Wang Lei', new: '孙悦 Sun Yue', oldPage: 1, newPage: 1 },
      { type: 'graphic', oldPage: 1, newPage: 1 },
      { type: 'insert', new: '数据迁移演练完成', newPage: 1 },
    ],
    {
      headerTemplate: tpl('PMO · WMS-2027 · 项目进度计划 v3', "'Inter', 'WenQuanYi Zen Hei', sans-serif"),
      footerTemplate: tpl(pageOf('Synthetic sample 合成样例 · Page {p} / {n}'), "'Inter', 'WenQuanYi Zen Hei', sans-serif", 'right'),
    });
}

// ---------------------------------------------------------------------------
// 6. Chinese travel-expense policy with a footnote (ZH, 2 -> 2 pages).
// A sentence is removed from the middle of a long paragraph, a hotel limit in
// a table changes, one digit in the 7 pt footnote changes, and on page 2 the
// expense system's name and the effective date change.
{
  const css = baseCss({ font: "'WenQuanYi Zen Hei', sans-serif", size: '10.5pt', lh: 1.6 }) + `
    .p1 { height: 248mm; display: flex; flex-direction: column; }
    .p1 .fn { margin-top: auto; border-top: 0.5pt solid #8a9198; padding-top: 3pt; font-size: 7pt; color: #4a4f55; line-height: 1.4; width: 70%; }
    h2 { font-size: 11.5pt; }
    table.lim { margin: 4pt 0 8pt; min-width: 110mm; }
    .lim th, .lim td { border: 0.6pt solid #8a9198; padding: 3pt 8pt; text-align: left; }
    .lim th { background: #eef1f4; } .lim td.n { text-align: right; }
    sup { font-size: 7pt; }
  `;
  const doc = (v) => html(css, `
    <div class="p1">
      <h1>差旅费用报销管理办法（2027年修订）</h1>
      <h2>第一条　目的</h2>
      <p>为规范公司员工因公出差的费用支出，提高报销效率，根据国家有关财务制度并结合公司实际情况，制定本办法。</p>
      <h2>第二条　适用范围</h2>
      <p>本办法适用于北辰远航物流有限公司总部及各分公司的全体正式员工、试用期员工以及经批准的外聘顾问。</p>
      <h2>第三条　交通费用</h2>
      <p>员工出差应优先选择高铁、动车或经济舱航班。出差路程在八百公里以内且有高铁直达的，原则上乘坐高铁二等座；部门负责人及以上人员可乘坐高铁一等座或经济舱全价机票。${v.firstClass ? '未经批准乘坐头等舱或公务舱的，超出经济舱票价的差额由个人承担。' : ''}因航班延误、取消等不可抗力产生的改签费用，凭航空公司出具的证明可据实报销。市内交通原则上乘坐公共交通工具，确需乘坐出租车或网约车的，须在报销单中注明起止地点和事由。</p>
      <h2>第四条　住宿标准</h2>
      <p>员工出差住宿按城市类别实行限额标准，具体见下表。超出限额部分由个人承担；确因会议安排等特殊原因超标的，须事先经分管副总经理批准。</p>
      <table class="lim">
        <tr><th>城市类别</th><th>住宿上限（元/晚）</th></tr>
        <tr><td>一线城市<sup>①</sup></td><td class="n">650</td></tr>
        <tr><td>二线城市</td><td class="n">${v.tier2}</td></tr>
        <tr><td>其他城市</td><td class="n">390</td></tr>
      </table>
      <p>住宿费须凭酒店开具的增值税发票报销，多人同行的原则上合住标准间。</p>
      <div class="fn">① 一线城市指北京、上海、广州、深圳。因特殊原因超出住宿上限的，须在返回后 ${v.days} 个工作日内提交书面说明，逾期不予报销。</div>
    </div>
    <div class="page">
      <h2>第五条　报销流程</h2>
      <p>出差人员应在返回后通过 ${v.system} 系统提交报销申请，并上传发票、行程单及审批记录的电子影像。部门负责人审核业务真实性，财务部审核票据合规性，审核通过后统一转账至员工工资卡。</p>
      <h2>第六条　伙食补助</h2>
      <p>伙食补助按实际出差天数计发，一线城市每人每天一百二十元，其他城市每人每天一百元。会议或培训主办方已统一安排用餐的，不再发放当日伙食补助。</p>
      <h2>第七条　借款与还款</h2>
      <p>预计费用较高的出差可申请备用金，出差结束后应及时报销冲账。备用金逾期未冲账的，财务部有权从当月工资中扣回。</p>
      <h2>第八条　违规处理</h2>
      <p>虚报、冒领差旅费用的，除追回相关款项外，公司将视情节轻重给予通报批评直至解除劳动合同的处理。</p>
      <h2>第九条　附则</h2>
      <p>本办法由财务部负责解释，自2027年1月${v.eff}日起施行，原《差旅费用报销规定》同时废止。</p>
    </div>
  `);
  add('zh-policy-footnote',
    '合成样例。两页中文差旅报销办法：第1页长段落中间删除一句、住宿限额表中一个数字修改、7 pt 脚注中一位数字修改；第2页报销系统名称和施行日期修改。',
    doc({ firstClass: true, tier2: '480', days: '10', system: 'TravelDesk', eff: '18' }),
    doc({ firstClass: false, tier2: '520', days: '15', system: 'ExpensePoint', eff: '28' }),
    [
      { type: 'delete', old: '未经批准乘坐头等舱或公务舱的', oldPage: 1 },
      { type: 'number', old: '480', new: '520', oldPage: 1, newPage: 1 },
      { type: 'number', old: '10', new: '15', oldPage: 1, newPage: 1 },
      { type: 'replace', old: 'TravelDesk', new: 'ExpensePoint', oldPage: 2, newPage: 2 },
      { type: 'number', old: '18', new: '28', oldPage: 2, newPage: 2 },
    ],
    {
      headerTemplate: tpl('北辰远航物流有限公司 · 行政制度 XZ-07', "'WenQuanYi Zen Hei', sans-serif"),
      footerTemplate: tpl(pageOf('合成样例 synthetic sample · 第 {p} 页 共 {n} 页'), "'WenQuanYi Zen Hei', sans-serif", 'right'),
    });
}

// ---------------------------------------------------------------------------
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

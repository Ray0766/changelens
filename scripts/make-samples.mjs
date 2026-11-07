#!/usr/bin/env node
// Generates the demo PDFs in public/samples/ (also the test fixtures) by printing
// HTML with headless Chromium. Requires Playwright:  npx playwright install chromium
//
// The "after" version contains a realistic mix of edits that page-by-page
// tools struggle with: an inserted paragraph that pushes every later page down
// by one, a price change, a deleted paragraph, a moved paragraph, a bold-only
// change, a modified chart and a table that no longer fits on the page.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Use a project-local Playwright if present, otherwise one found via NODE_PATH.
const { chromium } = await import('playwright').catch(() => createRequire(import.meta.url)('playwright'));

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const css = (fontFamily) => `
  @page { size: A4; }
  * { box-sizing: border-box; }
  body { font-family: ${fontFamily}; font-size: 11.5pt; line-height: 1.55; color: #1d232b; margin: 0; padding: 0 20mm; }
  h1 { font-size: 26pt; margin: 0 0 6pt; color: #0f3d5e; }
  h2 { font-size: 16pt; margin: 0 0 10pt; color: #0f3d5e; border-bottom: 1.5pt solid #0f3d5e; padding-bottom: 4pt; }
  h3 { font-size: 12.5pt; margin: 14pt 0 4pt; }
  p { margin: 0 0 9pt; text-align: justify; }
  .section { break-before: page; }
  .subtitle { font-size: 13pt; color: #4a5866; margin-bottom: 28pt; }
  .meta { border-left: 3pt solid #0f3d5e; padding: 4pt 0 4pt 12pt; margin: 18pt 0 24pt; }
  .meta div { margin: 2pt 0; }
  table { border-collapse: collapse; width: 100%; margin: 8pt 0 14pt; }
  th, td { border: 0.75pt solid #9aa7b3; padding: 5pt 7pt; text-align: left; vertical-align: top; }
  th { background: #e8eef3; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  tr.total td { font-weight: bold; background: #f4f7f9; }
  .note { font-size: 10pt; color: #4a5866; }
  /* Page margins are emulated with body padding so that a too-wide table is
     cut off at the physical page edge (as in real documents) instead of
     Chromium shrinking the whole document to fit. */
  .edge { contain: paint; margin: 0 -20mm; padding: 0 20mm; }
  .wide { width: 760px; }
  .wide td, .wide th { white-space: nowrap; }
`;

const header = (text) => `<div style="font-size:7.5pt;width:100%;padding:0 18mm;color:#7a8794;display:flex;justify-content:space-between;font-family:sans-serif"><span>${text}</span><span>CONFIDENTIAL</span></div>`;
const footer = (fmt) => `<div style="font-size:7.5pt;width:100%;padding:0 18mm;color:#7a8794;text-align:right;font-family:sans-serif">${fmt}</div>`;

function chart(bars, labels) {
  // Simple Gantt chart. bars: [start, length, color]
  const rows = bars.map(([s, l, c], i) => `
    <text x="0" y="${34 + i * 34}" font-size="12" fill="#1d232b">${labels[i]}</text>
    <rect x="${150 + s * 38}" y="${20 + i * 34}" width="${l * 38}" height="20" rx="3" fill="${c}"/>`).join('');
  const grid = Array.from({ length: 11 }, (_, w) =>
    `<line x1="${150 + w * 38}" y1="10" x2="${150 + w * 38}" y2="${20 + bars.length * 34}" stroke="#d5dde4" stroke-width="1"/>
     <text x="${150 + w * 38 + 10}" y="${36 + bars.length * 34}" font-size="10" fill="#7a8794">${w + 1}</text>`).join('');
  return `<svg width="570" height="${50 + bars.length * 34}" xmlns="http://www.w3.org/2000/svg">${grid}${rows}</svg>`;
}

// ---------------------------------------------------------------- English ---
function english(v) {
  const after = v === 'after';
  const price = after ? '9,500' : '8,000';
  const total = after ? '26,000' : '24,500';
  const bars = [
    [0, 2, '#4f86b7'], [1.5, 2.5, '#4f86b7'],
    after ? [3.5, 5, '#d9822b'] : [3.5, 4, '#4f86b7'],
    [7.5, 1.5, '#4f86b7'], [9, 1, '#4f86b7'],
  ];
  const memberA = `<h3>Maya Chen — Project lead</h3><p>Maya has led more than forty website projects for hospitality and food brands over the past nine years. She will be your single point of contact, run the weekly status meetings and own the delivery plan from kickoff to launch.</p>`;
  const memberB = `<h3>Tomás Rivera — Design director</h3><p>Tomás is responsible for the visual language, the component library and the photography direction. He previously redesigned the online ordering experience for two regional coffee chains and a national grocery brand.</p>`;
  const memberC = `<h3>Priya Natarajan — Lead engineer</h3><p>Priya will build the front end, integrate the ordering system and set up hosting, monitoring and automated backups. She is a core maintainer of two open-source accessibility libraries.</p>`;
  const memberD = `<h3>Jonas Weber — Content strategist</h3><p>Jonas will audit the existing pages, interview your staff and rewrite the menu and story pages so that they are shorter, clearer and easier to find through search engines.</p>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css("'Liberation Serif', serif")}</style></head><body>
  <h1>Website Redesign Proposal</h1>
  <div class="subtitle">Prepared for Northwind Bakery by Acme Studio</div>
  <div class="meta">
    <div><b>Proposal number:</b> NW-2026-114</div>
    <div><b>Date:</b> 2 November 2026</div>
    <div><b>Valid until:</b> ${after ? '15 December 2026' : '30 November 2026'}</div>
    <div><b>Total investment:</b> USD ${total}</div>
  </div>
  <h3>Executive summary</h3>
  <p>Northwind Bakery has grown from a single neighbourhood shop into six locations, but its website still reflects the business as it was in 2017. Customers struggle to find opening hours, the online ordering flow is difficult to use on a phone, and the content management system no longer receives security updates.</p>
  <p>This proposal describes how Acme Studio will redesign and rebuild the website over ten weeks. The new site will make ordering fast on every device, present the bakery's story with fresh photography, and give your team a simple editor for daily specials, menus and announcements.</p>
  <p>We recommend a phased approach: discovery and content strategy first, followed by design, development, testing and a carefully monitored launch. Each phase ends with a review meeting so that you can approve the work before we continue.</p>

  <div class="section">
    <h2>1. Background and goals</h2>
    <p>The current website was built on a commercial template that has been modified many times by different contractors. Pages load slowly, the navigation has grown to more than thirty items and several important pages are only reachable through the search box. Analytics show that 71% of visits now come from mobile devices, yet the ordering flow was designed for desktop screens.</p>
    <p>During our initial conversations your team identified three priorities. First, customers should be able to place a pickup order in under a minute. Second, every location should have an accurate page with opening hours, directions and the current menu. Third, staff should be able to publish daily specials without asking a developer for help.</p>
    <p>We also reviewed the support emails you shared with us. Most questions concern opening hours on public holidays, allergen information and whether a cake can be ordered for a specific date. All three can be answered directly on the website, which would reduce the time your staff spend on email and phone calls.</p>
    ${after ? `<p>Accessibility is a further goal that we propose to add to the scope. The new site will meet the WCAG 2.2 AA standard, so that customers who rely on screen readers, keyboard navigation or larger text can browse the menu and place orders without assistance. We will test with real assistive technology before launch and document the results for your records.</p>` : ''}
    <p>Success will be measured against a small number of agreed metrics: the share of orders placed on mobile, the average time to complete an order, the number of support emails per week and the page speed score reported by standard performance tools. We will capture a baseline during discovery and report progress after launch.</p>
    <p>Several technical constraints shape the project. The ordering system is provided by a third-party point-of-sale vendor and exposes a documented interface for menus, prices and pickup slots. The new website will use this interface directly, so that prices and availability are always identical in the shops and online. Product photos and allergen data will be managed in the website's content system and linked to the vendor's product codes.</p>
    <p>Your team also asked us to keep the existing web address and to make sure that links shared on social media over the past years continue to work. We will map every old address to its new equivalent and set up permanent redirects, so that search rankings and bookmarks are preserved when the new site goes live.</p>
    <p>Content will be migrated in two passes. In the first pass we move the pages that are still accurate, such as the company history and the catering information, and adapt them to the new templates. In the second pass we work with your staff to rewrite the menu descriptions, the location pages and the frequently asked questions, using the language your customers actually use when they write to you.</p>
    <p>Finally, the redesign is an opportunity to tell the Northwind story. The bakery's commitment to local flour, long fermentation and zero food waste is a genuine differentiator, and the new site should make it visible without getting in the way of customers who simply want to order.</p>
  </div>

  <div class="section">
    <h2>2. Scope and pricing</h2>
    <p>The table below lists the work included in this proposal. All amounts are in US dollars and exclude sales tax. Prices are fixed for the scope described here; changes requested after design approval will be estimated separately.</p>
    <table>
      <tr><th>Phase</th><th>Deliverables</th><th class="num">Price (USD)</th></tr>
      <tr><td>Discovery</td><td>Stakeholder interviews, analytics review, content audit</td><td class="num">3,000</td></tr>
      <tr><td>Design and prototyping</td><td>Wireframes, visual design, clickable prototype</td><td class="num">${price}</td></tr>
      <tr><td>Development</td><td>Front end, ordering integration, content management</td><td class="num">10,500</td></tr>
      <tr><td>Testing and launch</td><td>Browser testing, accessibility review, go-live support</td><td class="num">3,000</td></tr>
      <tr class="total"><td>Total</td><td></td><td class="num">${total}</td></tr>
    </table>
    <p>Payment is due in three instalments: 30% on signature, 40% on design approval and 30% on launch. Invoices are payable within 30 days of receipt.</p>
    <p class="note">Photography is not included. We can recommend local photographers and art-direct the shoot if required.</p>
  </div>

  <div class="section">
    <h2>3. Timeline</h2>
    <p>The project will take ten weeks from the kickoff meeting to launch. The chart below shows the planned duration of each phase. Phases overlap slightly so that development can begin on approved templates while the remaining pages are still being designed.</p>
    ${chart(bars, ['Discovery', 'Design', 'Development', 'Testing', 'Launch'])}
    <p>Key milestones are the content audit at the end of week two, design approval at the end of week four, a complete staging site in week eight and the public launch in week ten. We will agree exact dates at the kickoff meeting.</p>
    <p>The timeline assumes that feedback on each deliverable is provided within three working days. Longer review periods will move the launch date accordingly.</p>
  </div>

  <div class="section">
    <h2>4. Your team</h2>
    <p>A small, senior team will work on your project from start to finish. You will meet everyone at the kickoff and can reach them directly throughout the engagement.</p>
    ${after ? memberB + memberA : memberA + memberB}
    ${memberC}
    ${memberD}
  </div>

  <div class="section">
    <h2>5. Terms and conditions</h2>
    <p><b>Ownership.</b> On final payment, Northwind Bakery will own all design files, source code and content created specifically for this project. Acme Studio may show the finished website in its portfolio unless you ask us not to.</p>
    <p><b>Changes to scope.</b> Requests that fall outside the scope described in this proposal will be estimated in writing before any work begins. No additional work will be invoiced without your written approval.</p>
    ${after ? '' : `<p><b>Late payment.</b> Invoices that remain unpaid ${'<b>30 days</b>'} after the due date incur interest of 1.5% per month. Acme Studio may pause work on the project until overdue invoices have been settled.</p>`}
    <p><b>Confidentiality.</b> Both parties will keep confidential any non-public business information they recieve during the project, and will only use it for the purposes of this engagement.</p>
    <p><b>Cancellation.</b> Either party may end the agreement with ${after ? '<b>30 days</b>' : '30 days'} written notice. Work completed up to the end of the notice period will be invoiced at the prices shown in section 2.</p>
    <p><b>Warranty.</b> We will fix defects reported within 60 days of launch at no charge. A defect is any behaviour that differs from the approved designs or the agreed functional specification.</p>
  </div>

  <div class="section">
    <h2>6. Support and maintenance</h2>
    <p>After the warranty period ends, we offer an optional support plan that covers security updates, uptime monitoring, monthly backups and up to four hours of small changes per month. The plan can be cancelled at any time with one month's notice.</p>
    <p>Support requests are answered within one business day. Urgent issues, such as the ordering system being unavailable, are handled ${after ? '<span style="color:#c62828">within two hours</span>' : 'within two hours'} between 7:00 and 21:00, seven days a week.</p>
    <p>We will also run a quarterly review in which we look at analytics together, recommend improvements and plan seasonal campaigns such as holiday pre-orders.</p>
  </div>

  <div class="section">
    <h2>Appendix A. Rate card</h2>
    <p>The following hourly rates apply to work outside the fixed scope and to the optional support plan.</p>
    <div class="edge"><table class="${after ? 'wide' : ''}">
      <tr><th>Role</th><th class="num">Hourly rate (USD)</th>${after ? '<th class="num">Weekend rate (USD)</th><th class="num">Holiday rate (USD)</th><th class="num">Minimum hours</th>' : ''}</tr>
      <tr><td>Project lead</td><td class="num">140</td>${after ? '<td class="num">185</td><td class="num">210</td><td class="num">2</td>' : ''}</tr>
      <tr><td>Design director</td><td class="num">150</td>${after ? '<td class="num">195</td><td class="num">225</td><td class="num">2</td>' : ''}</tr>
      <tr><td>Lead engineer</td><td class="num">145</td>${after ? '<td class="num">190</td><td class="num">215</td><td class="num">2</td>' : ''}</tr>
      <tr><td>Content strategist</td><td class="num">110</td>${after ? '<td class="num">145</td><td class="num">165</td><td class="num">1</td>' : ''}</tr>
    </table></div>
    <p class="note">Rates are reviewed once a year. You will be notified of any change at least 60 days in advance.</p>
  </div>
  </body></html>`;
}

// ---------------------------------------------------------------- Chinese ---
function chinese(v) {
  const after = v === 'after';
  const price = after ? '9,500' : '8,000';
  const total = after ? '26,000' : '24,500';
  const bars = [
    [0, 2, '#4f86b7'], [1.5, 2.5, '#4f86b7'],
    after ? [3.5, 5, '#d9822b'] : [3.5, 4, '#4f86b7'],
    [7.5, 1.5, '#4f86b7'], [9, 1, '#4f86b7'],
  ];
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css("'WenQuanYi Zen Hei', sans-serif")} p { text-align: left; }</style></head><body>
  <h1>官网改版项目报价方案</h1>
  <div class="subtitle">致：北风烘焙有限公司　｜　提交方：远山设计工作室</div>
  <div class="meta">
    <div><b>方案编号：</b>NW-2026-114</div>
    <div><b>日期：</b>2026 年 11 月 2 日</div>
    <div><b>报价有效期至：</b>${after ? '2026 年 12 月 15 日' : '2026 年 11 月 30 日'}</div>
    <div><b>项目总价：</b>人民币 ${total} 元</div>
  </div>
  <h3>方案概述</h3>
  <p>北风烘焙已经从一家社区小店发展为六家门店，但官网仍停留在 2017 年的样子。顾客很难找到营业时间，手机上的在线下单流程不好用，内容管理系统也早已停止安全更新。</p>
  <p>本方案说明远山设计工作室将如何在十周内完成官网的重新设计与开发。新网站将让顾客在任何设备上都能快速下单，用全新的照片讲述品牌故事，并为门店员工提供一个简单易用的编辑后台。</p>
  <p>我们建议分阶段推进：先做调研与内容规划，再进入设计、开发、测试和上线。每个阶段结束时召开评审会，经您确认后再进入下一阶段。</p>

  <div class="section">
    <h2>一、项目背景与目标</h2>
    <p>现有网站基于一套商业模板搭建，先后经过多位外包人员修改。页面加载缓慢，导航菜单已超过三十项，一些重要页面只能通过搜索框找到。数据显示，目前 71% 的访问来自手机，而下单流程却是为电脑屏幕设计的。</p>
    <p>在前期沟通中，贵方团队提出了三项优先事项：第一，顾客应能在一分钟内完成自提订单；第二，每家门店都应有准确的页面，展示营业时间、路线和当季菜单；第三，员工无需开发人员协助即可发布每日特价信息。</p>
    <p>我们还查看了贵方提供的客服邮件。大部分问题集中在节假日营业时间、过敏原信息以及能否预订指定日期的蛋糕。这些问题都可以直接在网站上解答，从而减少员工处理邮件和电话的时间。</p>
    ${after ? '<p>此外，我们建议将无障碍访问纳入项目范围。新网站将符合 WCAG 2.2 AA 标准，让依赖读屏软件、键盘操作或大字号的顾客也能独立浏览菜单并完成下单。上线前我们会使用真实的辅助技术进行测试，并将结果整理成文档交付贵方存档。</p>' : ''}
    <p>项目成效将以几项约定指标衡量：手机端订单占比、完成一笔订单的平均用时、每周客服邮件数量，以及常用性能工具给出的页面速度评分。我们会在调研阶段记录基线数据，并在上线后汇报进展。</p>
    <p>项目还受到若干技术条件的约束。下单系统由第三方收银系统供应商提供，并开放了菜单、价格和自提时段的标准接口。新网站将直接调用该接口，确保门店与线上的价格和库存始终一致。产品照片和过敏原信息将在网站内容系统中维护，并与供应商的商品编码关联。</p>
    <p>贵方团队还希望保留现有网址，并确保过去几年在社交媒体上分享的链接继续有效。我们会把每个旧地址对应到新页面并设置永久重定向，使搜索排名和收藏夹在新网站上线后不受影响。</p>
    <p>内容迁移将分两轮进行。第一轮迁移仍然准确的页面，例如公司历史和团餐服务介绍，并将其调整为新的页面模板。第二轮我们将与门店员工一起重写菜品介绍、门店页面和常见问题，尽量使用顾客写信时真正会用的说法，让每一位访客都能快速找到需要的信息，而不必再打电话询问门店。</p>
    <p>我们还会为每家门店建立统一的信息模板，包括地址、交通方式、停车信息、营业时间、节假日安排和联系电话。门店店长可以在后台直接修改这些信息，修改后会立即同步到网站、地图服务和搜索引擎的商家资料中，避免出现不同渠道信息互相矛盾的情况。新开门店时，只需复制模板并填写基本信息，当天即可在网站上线对应页面。</p>
    <p>为了让员工尽快上手，我们会在上线前组织两次培训，并提供图文并茂的操作手册和简短的视频教程。培训内容涵盖发布每日特价、更新菜单、上传照片和查看订单数据等常用操作，确保即使是不熟悉电脑的员工也能独立完成日常维护工作。</p>
    <p>最后，这次改版也是讲好北风品牌故事的机会。坚持使用本地面粉、长时间发酵和零食物浪费，是北风真正的差异化优势。新网站应当让这些内容清晰可见，同时又不妨碍只想快速下单的顾客。</p>
  </div>

  <div class="section">
    <h2>二、工作范围与报价</h2>
    <p>下表列出了本方案包含的全部工作。所有金额均以人民币计价，不含税。在本方案所述范围内价格固定；设计确认后提出的变更需求将另行报价。</p>
    <table>
      <tr><th>阶段</th><th>交付内容</th><th class="num">价格（元）</th></tr>
      <tr><td>调研</td><td>访谈、数据分析、内容盘点</td><td class="num">3,000</td></tr>
      <tr><td>设计与原型</td><td>线框图、视觉设计、可交互原型</td><td class="num">${price}</td></tr>
      <tr><td>开发</td><td>前端开发、下单系统对接、内容管理后台</td><td class="num">10,500</td></tr>
      <tr><td>测试与上线</td><td>浏览器兼容测试、无障碍检查、上线支持</td><td class="num">3,000</td></tr>
      <tr class="total"><td>合计</td><td></td><td class="num">${total}</td></tr>
    </table>
    <p>付款分三期：签约时支付 30%，设计确认时支付 40%，上线时支付 30%。发票自收到之日起 30 天内付清。</p>
    <p class="note">本报价不含摄影费用。如有需要，我们可以推荐本地摄影师并负责拍摄的艺术指导。</p>
  </div>

  <div class="section">
    <h2>三、项目进度</h2>
    <p>项目自启动会起共需十周完成上线。下图展示了各阶段的计划时长。各阶段之间略有重叠，以便在其余页面仍在设计时，开发团队即可开始制作已确认的模板。</p>
    ${chart(bars, ['调研', '设计', '开发', '测试', '上线'])}
    <p>关键里程碑包括：第二周末完成内容盘点，第四周末确认设计，第八周完成完整的测试站点，第十周正式上线。具体日期将在启动会上确定。</p>
    <p>以上进度假设贵方在三个工作日内对每项交付物给出反馈。如评审时间延长，上线日期将相应顺延。</p>
  </div>

  <div class="section">
    <h2>四、项目团队</h2>
    <p>一支精干的资深团队将全程负责贵方项目。启动会上您将见到所有成员，项目期间可以随时直接联系他们。</p>
    ${after ? '<h3>李哲 · 设计总监</h3><p>负责整体视觉语言、组件库和摄影方向。曾为两家区域连锁咖啡品牌和一家全国性生鲜品牌重新设计在线点单体验。</p><h3>陈曼 · 项目负责人</h3><p>九年来主导过四十多个餐饮与酒店品牌的网站项目。她将作为您的唯一对接人，主持每周例会，并对从启动到上线的交付计划负责。</p>'
             : '<h3>陈曼 · 项目负责人</h3><p>九年来主导过四十多个餐饮与酒店品牌的网站项目。她将作为您的唯一对接人，主持每周例会，并对从启动到上线的交付计划负责。</p><h3>李哲 · 设计总监</h3><p>负责整体视觉语言、组件库和摄影方向。曾为两家区域连锁咖啡品牌和一家全国性生鲜品牌重新设计在线点单体验。</p>'}
    <h3>王璐 · 首席工程师</h3><p>负责前端开发、下单系统对接，以及服务器托管、运行监控和自动备份。她是两个开源无障碍组件库的核心维护者。</p>
    <h3>赵一凡 · 内容策略师</h3><p>将梳理现有页面、访谈门店员工，并重写菜单和品牌故事页面，使其更简短、更清晰，也更容易被搜索引擎收录。</p>
  </div>

  <div class="section">
    <h2>五、合同条款</h2>
    <p><b>知识产权。</b>结清全部款项后，本项目专门创作的设计文件、源代码和内容均归北风烘焙所有。除非贵方另有要求，远山设计可在作品集中展示上线后的网站。</p>
    <p><b>范围变更。</b>超出本方案范围的需求，将在开始工作前以书面形式报价。未经贵方书面同意，不会产生任何额外费用。</p>
    ${after ? '' : '<p><b>逾期付款。</b>发票逾期 30 天仍未支付的，按每月 1.5% 计收利息。远山设计有权在逾期款项结清前暂停项目工作。</p>'}
    <p><b>保密义务。</b>双方应对项目期间获悉的对方非公开商业信息予以保密，且仅用于本项目目的。</p>
    <p><b>合同解除。</b>任何一方均可提前 ${after ? '<b>30 天</b>' : '30 天'}书面通知解除合同。截至通知期结束已完成的工作，按第二部分所列价格结算。</p>
    <p><b>质保。</b>上线后 60 天内报告的缺陷，我们将免费修复。缺陷是指与已确认设计稿或约定功能说明不一致的任何表现。</p>
  </div>

  <div class="section">
    <h2>六、售后支持与维护</h2>
    <p>质保期结束后，我们提供可选的维护服务，包括安全更新、在线监控、每月备份，以及每月最多四小时的小改动。该服务可随时提前一个月通知取消。</p>
    <p>一般支持请求将在一个工作日内响应。紧急问题（例如下单系统无法使用）每天 7:00 至 21:00 之间${after ? '<span style="color:#c62828">两小时内处理</span>' : '两小时内处理'}，全年无休。</p>
    <p>我们还将每季度与贵方一起回顾网站数据，提出改进建议，并规划节日预订等季节性活动。</p>
  </div>

  <div class="section">
    <h2>附录 A　工时费率表</h2>
    <p>以下工时费率适用于固定范围以外的工作及可选维护服务。</p>
    <div class="edge"><table class="${after ? 'wide' : ''}">
      <tr><th>角色</th><th class="num">工作日费率（元/小时）</th>${after ? '<th class="num">周末费率（元/小时）</th><th class="num">节假日费率（元/小时）</th><th class="num">最低计费时长</th>' : ''}</tr>
      <tr><td>项目负责人</td><td class="num">140</td>${after ? '<td class="num">185</td><td class="num">210</td><td class="num">2 小时</td>' : ''}</tr>
      <tr><td>设计总监</td><td class="num">150</td>${after ? '<td class="num">195</td><td class="num">225</td><td class="num">2 小时</td>' : ''}</tr>
      <tr><td>首席工程师</td><td class="num">145</td>${after ? '<td class="num">190</td><td class="num">215</td><td class="num">2 小时</td>' : ''}</tr>
      <tr><td>内容策略师</td><td class="num">110</td>${after ? '<td class="num">145</td><td class="num">165</td><td class="num">1 小时</td>' : ''}</tr>
    </table></div>
    <p class="note">费率每年调整一次，如有变动将至少提前 60 天通知。</p>
  </div>
  </body></html>`;
}

const docs = [
  { name: 'proposal', build: english, header: 'Acme Studio — Proposal NW-2026-114', footer: 'Page <span class="pageNumber"></span> of <span class="totalPages"></span>' },
  { name: 'proposal-zh', build: chinese, header: '远山设计工作室 · 报价方案 NW-2026-114', footer: '第 <span class="pageNumber"></span> 页 / 共 <span class="totalPages"></span> 页' },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const d of docs) {
  for (const v of ['before', 'after']) {
    await page.setContent(d.build(v), { waitUntil: 'load' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: header(d.header),
      footerTemplate: footer(d.footer),
      margin: { top: '22mm', bottom: '22mm', left: '0', right: '0' },
    });
    // Also used as test fixtures (test/fixtures.test.ts).
    const out = join(root, 'public/samples', `${d.name}-${v}.pdf`);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, pdf);
    console.log(`wrote ${d.name}-${v}.pdf (${(pdf.length / 1024).toFixed(0)} KB)`);
  }
}
await browser.close();

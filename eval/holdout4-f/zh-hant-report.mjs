// Case holdout4-f-zh-hant-community-annual-report: annual work and financial
// report of a fictional residential community management committee, in
// Traditional Chinese (Taiwan usage, ROC years, NT$), printed by Chromium in
// WenQuanYi Zen Hei. Synthetic sample.

const fmt = (n) => n.toLocaleString('en-US');

const RECYCLING = '<p>資源回收與垃圾分類方面，本會於地下一樓設置分類回收區，分為紙類、塑膠、鐵鋁罐、玻璃、廚餘及一般垃圾六類，並由清潔公司每日清運兩次。本年度回收變賣所得共新臺幣 18,640 元，已全數撥入公共基金。為減少大型廢棄物任意堆放，本會每季第一個週六上午統一受理住戶登記，由清潔隊集中清運。</p>';

function income() {
  return [
    ['管理費收入', 3268800], ['停車位清潔維護費', 712800], ['公共設施使用費', 46500],
    ['資源回收收入', 18640], ['利息收入', 11920], ['其他收入', 8400],
  ];
}
function expense() {
  return [
    ['保全服務費', 1584000], ['清潔服務費', 816000], ['公共電費', 498300], ['公共水費', 61240],
    ['電梯保養及維修', 306600], ['消防安全設備檢修', 84000], ['機電設備保養', 132000],
    ['公共設施修繕', 275400], ['園藝綠化', 96000], ['公共意外責任保險', 58800],
    ['行政及郵電文具', 41700], ['社區活動', 62500],
  ];
}

const meetings = (before) => [
  ['第 1 次', '114年1月16日', '通過本屆委員分工及年度工作重點；決議辦理屋頂防水工程招標。'],
  ['第 2 次', '114年2月20日', '審議屋頂防水工程投標廠商三家，決議由最低標廠商承作。'],
  ['第 3 次', '114年3月19日', '通過區分所有權人會議議程；決議更新地下室照明為 LED 燈具。'],
  ['第 4 次', '114年4月17日', '確認屋頂防水工程施工期程；決議施工期間暫停頂樓曬衣區開放。'],
  ['第 5 次', '114年5月15日', '審查第一季財務報表；決議增設大廳無障礙坡道扶手。'],
  ['第 6 次', '114年6月19日', '討論颱風季防災整備；決議購置備用抽水馬達一台。'],
  ['第 7 次', '114年7月17日', '屋頂防水工程驗收通過；決議保固期間每半年會同廠商巡檢一次。'],
  ['第 8 次', '114年8月21日', '審查第二季財務報表；決議監視系統更新案進行規劃。'],
  ['第 9 次', '114年9月18日', '通過中秋社區聯誼活動經費；決議修訂寵物管理規約草案。'],
  ['第 10 次', '114年10月16日', '審議監視系統更新案，決議列入 115 年度預算。'],
  ['第 11 次', '114年11月20日', '審查第三季財務報表；討論 115 年度管理費調整方案。'],
  ['第 12 次', before ? '114年12月18日' : '114年12月16日', '通過 115 年度工作計畫及預算草案，提請區分所有權人會議審議。'],
];

export function html(v) {
  const before = v === 'before';
  const inc = income();
  const exp = expense();
  const incTotal = inc.reduce((s, r) => s + r[1], 0);
  const expTotal = exp.reduce((s, r) => s + r[1], 0);
  const balance = incTotal - expTotal;
  const fundOpen = 1086400;
  const fundIn = 240000;
  const fundInterest = 9200;
  const fundUse = 87000; // 抽水馬達與無障礙扶手
  const fundClose = fundOpen + fundIn + fundInterest - fundUse; // 1,248,600
  const fundCloseShown = before ? 1284600 : fundClose; // the old version had two digits transposed
  const rows = (list) => list.map(([k, n]) => `<tr><td>${k}</td><td class="num">${fmt(n)}</td></tr>`).join('');

  return `<!doctype html><html lang="zh-Hant-TW"><head><meta charset="utf-8"><title>青嵐社區管理委員會 114 年度工作報告</title>
<style>
  @page { size: A4; }
  body { font-family: 'WenQuanYi Zen Hei', sans-serif; font-size: 11pt; line-height: 1.75; color: #1b1b1b; margin: 0; }
  h1 { font-size: 19pt; text-align: center; margin: 0 0 4pt; letter-spacing: 0.05em; }
  .sub { text-align: center; font-size: 12pt; margin-bottom: 14pt; }
  .synthetic { border: 1px solid #a05a00; color: #5c3600; font-size: 9.5pt; padding: 5pt 8pt; margin: 0 0 14pt; }
  h2 { font-size: 14pt; margin: 18pt 0 6pt; color: #233b5d; break-after: avoid; }
  h3 { font-size: 12pt; margin: 12pt 0 4pt; break-after: avoid; }
  p { margin: 0 0 7pt; text-indent: 2em; text-align: justify; }
  ol { margin: 0 0 8pt; padding-left: 2.2em; } li { margin-bottom: 4pt; }
  table { border-collapse: collapse; width: 100%; margin: 4pt 0 10pt; font-size: 10pt; line-height: 1.5; }
  th, td { border: 0.75px solid #8b97a6; padding: 3pt 6pt; vertical-align: top; }
  th { background: #e5ebf2; text-align: left; }
  td.num { text-align: right; white-space: nowrap; }
  tr { break-inside: avoid; }
  tr.total td { font-weight: bold; background: #f3f5f8; }
  .sign { margin-top: 18pt; text-align: right; text-indent: 0; }
</style></head><body>
<h1>青嵐社區管理委員會</h1>
<div class="sub">第十二屆　中華民國 114 年度工作報告暨財務報告</div>
<div class="synthetic">合成範例（Synthetic sample）：本報告為軟體測試而編寫，所述社區、委員會、廠商及全部數據均為虛構。</div>

<h2>壹、主任委員報告</h2>
<p>各位住戶大家好：第十二屆管理委員會自 114 年 1 月就任以來，在全體委員與住戶的支持下，順利完成屋頂防水工程、地下室照明更新及多項公共設施的維護工作。本報告彙整一年來的工作成果與財務收支，提請區分所有權人會議審議，並說明 115 年度的工作計畫。</p>
<p>本社區共有 A、B、C、D 四棟，住戶 312 戶，地下停車位 264 格。社區落成至今已滿 18 年，電梯、給排水及機電設備逐步進入汰換期。委員會本年度的重點，是在維持管理費不大幅調整的前提下，有計畫地提撥公共基金，為未來的大型修繕預作準備。</p>
<p>過去一年，委員會共受理住戶意見 146 件，其中九成以上已在兩週內回覆或處理完畢。在此感謝各位住戶對施工期間各項不便的包容，也感謝保全、清潔及各協力廠商的辛勞。</p>

<h2>貳、委員會組織與會議</h2>
<p>本屆管理委員會置委員九人，由各棟區分所有權人推選產生，任期一年，得連選連任一次。委員會下設財務、修繕、安全及活動四個小組，分別負責相關業務的規劃與督導。</p>
<table><thead><tr><th>職稱</th><th>人數</th><th>主要職責</th></tr></thead><tbody>
<tr><td>主任委員</td><td class="num">1</td><td>綜理會務，召集委員會議，對外代表本社區</td></tr>
<tr><td>副主任委員</td><td class="num">1</td><td>襄助主任委員，主任委員不能執行職務時代理之</td></tr>
<tr><td>財務委員</td><td class="num">1</td><td>管理費收支、公共基金保管及財務報表審核</td></tr>
<tr><td>監察委員</td><td class="num">1</td><td>監督會務及財務，查核帳冊與憑證</td></tr>
<tr><td>委員</td><td class="num">5</td><td>分任修繕、安全、活動及各棟聯絡事務</td></tr>
</tbody></table>
<p>本年度共召開委員會議 12 次、區分所有權人會議 1 次，委員平均出席率為 91%。各次委員會議的主要決議摘要列於附件，會議紀錄全文公告於社區公布欄及住戶網站，並由管理中心存檔備查。</p>

<h2>參、年度工作報告</h2>
<h3>一、公共設施維護</h3>
<p>屋頂防水工程於 114 年 4 月至 6 月施作，範圍包括四棟頂樓平台及水塔基座，採用聚脲防水塗層，總工程款新臺幣 1,462,000 元，由公共基金支應。工程已於 7 月驗收通過，廠商提供五年保固，保固期間每六個月由委員會會同廠商巡檢一次。</p>
<p>電梯共八部，由原廠保養公司每月保養一次。本年度電梯故障停機共 7 次，平均修復時間為 3.5 小時，較去年的 5.2 小時改善。其中 B 棟一號梯的主機鋼索已達更換年限，已於 9 月更換完成。</p>
${before ? RECYCLING : ''}
<p>消防安全設備依法${before ? '每年' : '每半年'}辦理一次檢修申報，本年度檢修發現 C 棟地下一樓兩處偵煙探測器故障及一具滅火器逾期，均已立即更換。給水塔及蓄水池於 3 月及 9 月各清洗一次，清洗後的水質檢驗結果均符合飲用水水質標準。</p>
<p>機電設備方面，發電機、消防幫浦及揚水馬達由機電保養廠商每月保養一次，並每季進行發電機負載測試。8 月颱風期間台電停電約 40 分鐘，發電機正常啟動，電梯及緊急照明均維持運作。本年度更換 A 棟揚水馬達軸封一組及 D 棟污水泵浦一台。</p>
<p>本年度其他公共設施修繕共 37 件，主要項目如下表。單筆金額超過新臺幣 50,000 元的修繕，均經委員會議同意並取得兩家以上廠商報價。</p>
<table><thead><tr><th>項目</th><th>位置</th><th>完成月份</th><th>金額（新臺幣元）</th></tr></thead><tbody>
<tr><td>大廳自動門感應器更換</td><td>A 棟大廳</td><td>2 月</td><td class="num">18,500</td></tr>
<tr><td>中庭排水溝清淤及格柵更換</td><td>中庭</td><td>4 月</td><td class="num">42,000</td></tr>
<tr><td>B 棟一號梯主機鋼索更換</td><td>B 棟</td><td>9 月</td><td class="num">96,000</td></tr>
<tr><td>地下二樓車道伸縮縫修補</td><td>地下二樓</td><td>10 月</td><td class="num">27,800</td></tr>
<tr><td>健身房跑步機維修</td><td>C 棟二樓</td><td>11 月</td><td class="num">8,600</td></tr>
<tr><td>屋頂避雷針檢測及接地改善</td><td>四棟屋頂</td><td>12 月</td><td class="num">31,200</td></tr>
</tbody></table>
<p>地下室照明於 5 月全面更新為 LED 燈具，共更換 386 盞，並在車道及樓梯間加裝感應控制。更新後公共電費每月平均減少約新臺幣 6,800 元，預計三年內可回收工程費用。</p>

<h3>二、安全管理</h3>
<p>社區保全由保全公司派駐，二十四小時輪班，日間兩名、夜間一名。保全人員每兩小時巡邏一次，巡邏紀錄以感應點簽到，委員會每月抽查一次。本年度未發生竊盜案件，可疑人士通報共 4 次，均由保全人員即時處理並通知轄區派出所。</p>
<p>門禁感應扣已於 3 月全面更新為加密式感應扣，舊式感應扣同時停用。住戶如有遺失，應立即至管理中心辦理掛失，補發每個收取工本費新臺幣 150 元。訪客一律在大廳登記，並由住戶確認後方可進入。</p>
<p>為提升住戶的防災意識，本會於 10 月配合消防分隊辦理全社區避難演練，共 186 人參加。演練中發現 D 棟安全梯有住戶堆放雜物，已通知限期清除，並於公布欄重申安全梯不得堆放物品的規定。</p>
<p>監視系統現有攝影機 48 支，部分已使用超過十年，畫質不足以辨識車牌及人臉。委員會已完成更新規劃，預計於 115 年度分兩期更新，詳見本報告伍、115 年度工作計畫。</p>

<h3>三、環境清潔與綠化</h3>
<p>公共區域清潔由清潔公司派駐兩名人員，每日清掃大廳、走道、樓梯及電梯車廂，每週清洗地下室車道一次。本年度住戶對清潔品質的滿意度調查結果為 4.2 分（滿分 5 分）。</p>
${before ? '' : RECYCLING}
<p>中庭花園由園藝廠商每月維護兩次，本年度補植樹木 6 株及灌木約 120 株，並更換中庭步道損壞的地磚。為節約用水，花園澆灌已改為定時滴灌系統。</p>

<h3>四、停車場管理</h3>
<p>地下停車場共 264 格，其中汽車位 236 格、機車位 28 格。本年度辦理車位抽籤一次，抽籤結果已公告並自 7 月起生效。為維護車道安全，車道已加裝凸面鏡 4 面及減速標線。${before ? '停車場地坪重新劃線工程延至明年度辦理。' : ''}</p>
<p>違規停放於車道或他人車位的車輛，經管理中心通知仍未移置者，依社區規約張貼違規通知單。本年度共張貼違規通知單 23 張，較去年減少 11 張。</p>

<h3>五、社區活動</h3>
<p>本年度舉辦春節揮毫、端午親子包粽、中秋聯誼晚會及年終社區大掃除等活動，共約 640 人次參加。中秋聯誼晚會並結合防災宣導，由轄區消防分隊示範滅火器使用方法。</p>

<h3>六、住戶意見處理</h3>
<table><thead><tr><th>類別</th><th>件數</th><th>兩週內處理完畢</th><th>說明</th></tr></thead><tbody>
<tr><td>公共設施修繕</td><td class="num">52</td><td class="num">48</td><td>以照明、門禁及排水為主</td></tr>
<tr><td>噪音及鄰里糾紛</td><td class="num">31</td><td class="num">27</td><td>多為裝修噪音及寵物叫聲</td></tr>
<tr><td>停車管理</td><td class="num">24</td><td class="num">23</td><td>違規停車及車位使用</td></tr>
<tr><td>清潔及環境</td><td class="num">18</td><td class="num">18</td><td>垃圾分類及病媒防治</td></tr>
<tr><td>財務及管理費</td><td class="num">9</td><td class="num">9</td><td>繳費方式及收據補發</td></tr>
<tr><td>其他</td><td class="num">12</td><td class="num">10</td><td>包裹代收、會議室借用等</td></tr>
<tr class="total"><td>合計</td><td class="num">146</td><td class="num">135</td><td></td></tr>
</tbody></table>

<h2>肆、財務報告</h2>
<h3>一、收支概況</h3>
<p>本年度管理費按每坪每月新臺幣 85 元收取，全年收繳率為 98.6%，截至 114 年 12 月 31 日止，尚有 5 戶共新臺幣 41,650 元未繳，管理中心已寄發催繳通知。本年度經常收入合計新臺幣 ${fmt(incTotal)} 元，經常支出合計新臺幣 ${fmt(expTotal)} 元，本期結餘新臺幣 ${fmt(balance)} 元，已依規約轉入公共基金。</p>
<h3>二、收支明細表（114 年 1 月 1 日至 12 月 31 日）</h3>
<table><thead><tr><th>收入項目</th><th>金額（新臺幣元）</th></tr></thead><tbody>${rows(inc)}<tr class="total"><td>收入合計</td><td class="num">${fmt(incTotal)}</td></tr></tbody></table>
<table><thead><tr><th>支出項目</th><th>金額（新臺幣元）</th></tr></thead><tbody>${rows(exp)}<tr class="total"><td>支出合計</td><td class="num">${fmt(expTotal)}</td></tr></tbody></table>
<h3>三、公共基金</h3>
<p>公共基金專戶存放於銀行定期存款，由主任委員及財務委員共同保管印鑑。本年度除每月提撥外，動支項目為備用抽水馬達及大廳無障礙扶手。屋頂防水工程款已於上一年度預先提列，不列入本年度動支。</p>
<table><thead><tr><th>項目</th><th>金額（新臺幣元）</th></tr></thead><tbody>
<tr><td>期初餘額（114 年 1 月 1 日）</td><td class="num">${fmt(fundOpen)}</td></tr>
<tr><td>本期提撥（每月 20,000 元）</td><td class="num">${fmt(fundIn)}</td></tr>
<tr><td>利息收入</td><td class="num">${fmt(fundInterest)}</td></tr>
<tr><td>本期動支</td><td class="num">${fmt(fundUse)}</td></tr>
<tr class="total"><td>期末餘額（114 年 12 月 31 日）</td><td class="num">${fmt(fundCloseShown)}</td></tr>
</tbody></table>
<p>上表期末餘額不含本期結餘轉入的部分，轉入後的公共基金餘額以 115 年 1 月的銀行對帳單為準。財務報表及相關憑證已經監察委員查核無誤，住戶如需查閱，可於管理中心辦公時間內申請。</p>

<h2>伍、115 年度工作計畫</h2>
<ol>
<li>管理費調整：為因應基本工資及電費調漲，擬自 115 年 7 月起將管理費調整為每坪每月新臺幣 ${before ? '88' : '90'} 元，停車位清潔維護費維持不變。</li>
<li>監視系統更新：分兩期將 48 支攝影機更新為高解析度網路攝影機，並更換錄影主機，總預算新臺幣 860,000 元，由公共基金支應。</li>
<li>電梯汰換評估：委託專業技師評估八部電梯的汰換時程，提出分年更新計畫及經費需求，作為公共基金提撥的依據。</li>
<li>停車場地坪整修：車道及停車格地坪重新塗佈並劃線，預計於暑假期間分區施工，以減少對住戶的影響。</li>
<li>寵物管理規約修訂：依第 9 次委員會議決議的草案，提請區分所有權人會議審議。</li>
${before ? '' : '<li>颱風季防災整備：於 6 月底前完成屋頂及地下室排水孔清理，並測試備用抽水馬達與防水閘門。</li>'}
</ol>
<p>上述計畫及 115 年度預算草案已經第 12 次委員會議通過，提請本次區分所有權人會議審議。審議通過後，委員會將按季公告執行進度。</p>

<h2>陸、附件：114 年度委員會議決議摘要</h2>
<table><thead><tr><th>會次</th><th>日期</th><th>主要決議</th></tr></thead><tbody>
${meetings(before).map((m) => `<tr><td style="white-space:nowrap">${m[0]}</td><td style="white-space:nowrap">${m[1]}</td><td>${m[2]}</td></tr>`).join('')}
</tbody></table>
<p class="sign">青嵐社區管理委員會　謹呈<br>中華民國 115 年 2 月</p>
</body></html>`;
}

export const pdfOptions = {
  format: 'A4',
  margin: { top: '20mm', bottom: '20mm', left: '22mm', right: '22mm' },
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate: `<div style="font-family:'WenQuanYi Zen Hei',sans-serif;font-size:8pt;color:#555;width:100%;padding:0 22mm;display:flex;justify-content:space-between"><span>青嵐社區管理委員會 114 年度工作報告 · 合成範例 Synthetic sample</span><span>第 <span class="pageNumber"></span> 頁／共 <span class="totalPages"></span> 頁</span></div>`,
};

export const truth = {
  description: 'Annual work and financial report of a fictional residential community management committee in Traditional Chinese (Taiwan usage: ROC years, NT$), printed by Chromium in WenQuanYi Zen Hei with justified paragraphs, first-line indents, tables and a footer "第 N 頁／共 M 頁". Seven edits: an inspection frequency word in section 參一 (每年 to 每半年); the paragraph on recycling moved from 參一 (facilities) to 參三 (cleaning), crossing a page; a sentence deleted at the end of a paragraph in 參四; the closing balance of the public fund corrected (two digits transposed, 1,284,600 to 1,248,600; the other rows of that table are unchanged); the proposed management fee in the first item of the 115 work plan list; a new last item (6.) added to that list, so no other item is renumbered; and one meeting date in the appendix table on the last page. Re-flow and footer page numbers change only as consequences.',
  truth: [
    { type: 'replace', old: '每年', new: '每半年', oldLocate: '消防安全設備依法每年辦理一次檢修申報', newLocate: '消防安全設備依法每半年辦理一次檢修申報', note: 'Fire safety inspection frequency in section 參一; Chinese is compared character by character, so the change is the insertion of 半 (每年 to 每半年).' },
    { type: 'move', old: '資源回收與垃圾分類方面，本會於地下一樓設置分類回收區', new: '資源回收與垃圾分類方面，本會於地下一樓設置分類回收區', note: 'Whole paragraph (about 150 characters, unchanged) moved from 參一 公共設施維護 to 參三 環境清潔與綠化.' },
    { type: 'delete', old: '停車場地坪重新劃線工程延至明年度辦理。', newAnchor: '車道已加裝凸面鏡 4 面及減速標線。', note: 'Last sentence of the first paragraph of 參四 停車場管理.' },
    { type: 'number', old: '1,284,600', new: '1,248,600', note: 'Closing balance (期末餘額) in the public fund table of 肆三; the new figure equals opening balance + contributions + interest − withdrawals.' },
    { type: 'insert', new: '颱風季防災整備：於 6 月底前完成屋頂及地下室排水孔清理，並測試備用抽水馬達與防水閘門。', oldAnchor: '寵物管理規約修訂：依第 9 次委員會議決議的草案', note: 'New last item (6.) of the ordered work-plan list in 伍; the list marker "6." is generated by the browser and is part of the text layer.' },
    { type: 'number', old: '88', new: '90', oldLocate: '調整為每坪每月新臺幣 88 元', newLocate: '調整為每坪每月新臺幣 90 元', note: 'Proposed management fee per ping per month in the first item of the 115 work plan.' },
    { type: 'number', old: '114年12月18日', new: '114年12月16日', note: 'Date of the 12th committee meeting in the appendix table (only the day changes).' },
  ],
};

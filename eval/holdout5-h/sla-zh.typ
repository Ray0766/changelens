// Case holdout5-h-bilingual-sla: English / Chinese cloud hosting service level agreement (synthetic sample).
#import "common.typ": *

#set document(title: "Service Level Agreement 服务水平协议 (synthetic sample)", author: "Synthetic sample")
#set page(
  paper: "a4",
  margin: (top: 2.6cm, bottom: 2.6cm, left: 2.6cm, right: 2.6cm),
  header: context [
    #set text(size: 8.5pt)
    Agreement No. SLA-2026-0219 #h(1fr) Service Level Agreement 服务水平协议
  ],
  footer: context [
    #set text(size: 8.5pt)
    Synthetic sample · 合成样例，当事方均为虚构
    #h(1fr) #counter(page).display() / #counter(page).final().first()
  ],
)
#set text(font: ("Libertinus Serif", "WenQuanYi Zen Hei"), size: 10.5pt, lang: "en")
#set par(justify: true, leading: 0.65em, spacing: 0.8em)
#set heading(numbering: "1.")
#show heading.where(level: 1): it => block(above: 1.2em, below: 0.6em)[#text(size: 11pt, weight: "bold")[#it]]

// Chinese paragraph: WenQuanYi Zen Hei for CJK, Libertinus Serif for Latin letters and digits
#let zh(body) = block(inset: (left: 0.8em), text(lang: "zh", region: "CN", size: 10pt, fill: luma(30), body))

#align(center)[
  #text(size: 15pt, weight: "bold")[Cloud Hosting Service Level Agreement]
  #v(0.1em)
  #text(size: 14pt, lang: "zh")[云托管服务水平协议]
]
#v(0.5em)

This Service Level Agreement is entered into on 2 February 2026 between #smallcaps[Hexton Retail Co., Ltd.] (the “Customer”) and #smallcaps[Lumenvale Cloud Services Co., Ltd.] (the “Provider”). It forms part of the master hosting contract between the parties.

#zh[本服务水平协议由赫斯顿零售有限公司（“甲方”）与澜谷云服务有限公司（“乙方”）于2026年2月2日签订，构成双方主托管合同的组成部分。]

= Scope of Services 服务范围

The Provider shall host the Customer’s online store platform in two availability zones and shall provide monitoring, backup, security patch management and incident handling for the production and staging environments described in Annex 1.

#zh[乙方应在两个可用区内托管甲方的在线商城平台，并为附件一所述的生产环境和预发布环境提供监控、备份、安全补丁管理及故障处理服务。]

= Service Availability 服务可用性

The Provider guarantees a monthly availability of #ed[99.5%][99.9%] for the production environment, measured at the public load balancer. #del[Scheduled maintenance announced at least 72 hours in advance is excluded from the calculation.] Availability is reported to the nearest 0.01 percentage point.

#zh[乙方保证生产环境的月度可用性不低于99.5%，以公网负载均衡器的监测数据为准。提前至少72小时通知的计划维护不计入可用性统计。可用性统计精确到0.01个百分点。]

= Incident Response 故障响应

Priority 1 incidents, which make the online store unavailable to shoppers, are acknowledged within 15 minutes and the Provider shall restore service within 4 hours. Priority 2 incidents are acknowledged within 1 hour and resolved within 1 business day. The Provider shall keep the Customer informed of progress at least every 30 minutes during a Priority 1 incident.

#zh[一级故障指导致在线商城无法向顾客提供服务的故障，乙方应在15分钟内响应，并在4小时内恢复服务。二级故障应在1小时内响应，并在1个工作日内解决。#ins[乙方应为甲方指定一名专属客户经理，负责故障期间的沟通协调。]一级故障处理期间，乙方应至少每30分钟向甲方通报一次进展。]

= Fees 服务费用

The monthly service fees are set out in Table 1. All amounts are in Chinese yuan (CNY) and include value added tax at the applicable rate.

#figure(
  kind: table,
  caption: [Monthly service fees 月度服务费用],
  {
    set text(size: 9.5pt)
    table(
      columns: (1fr, 1fr, auto),
      align: (left, left, right),
      stroke: none,
      inset: (x: 6pt, y: 4pt),
      table.hline(stroke: 1pt),
      table.header([*Item*], [*项目*], [*CNY per month*]),
      table.hline(stroke: 0.5pt),
      [Production hosting, two zones], [生产环境托管（双可用区）], [96,000.00],
      [Backup and disaster recovery], [备份与容灾], [#ed[18,500.00][27,000.00]],
      [Monitoring, 24 × 7], [7×24小时监控], [13,500.00],
      table.hline(stroke: 0.5pt),
      [*Total*], [*合计*], [*#ed[128,000.00][136,500.00]*],
      table.hline(stroke: 1pt),
    )
  },
)

#zh[月服务费合计（大写）：人民币#ed[壹拾贰万捌仟元整][壹拾叁万陆仟伍佰元整]。]

= Service Credits 服务赔偿

If the monthly availability falls below the guaranteed level, the Provider grants the service credits in Table 2 as a reduction of the monthly fee for the affected month. Service credits are applied to the next invoice.

#figure(
  kind: table,
  caption: [Service credits 服务赔偿标准],
  {
    set text(size: 9.5pt)
    table(
      columns: (1fr, 1fr, auto),
      align: (left, left, right),
      stroke: none,
      inset: (x: 6pt, y: 4pt),
      table.hline(stroke: 1pt),
      table.header([*Monthly availability*], [*月度可用性*], [*Fee adjustment*]),
      table.hline(stroke: 0.5pt),
      [99.0% to below 99.5%], [99.0%（含）至99.5%], [#ed[−5%][−10%]],
      [95.0% to below 99.0%], [95.0%（含）至99.0%], [−15%],
      [Below 95.0%], [低于95.0%], [−30%],
      table.hline(stroke: 1pt),
    )
  },
)

#zh[如月度可用性低于保证水平，乙方应按表2所列标准减免当月服务费，减免金额在下一期账单中抵扣。]

= Reporting 服务报告

The Provider shall deliver a monthly service report within five business days after the end of each month. The report covers availability, incidents, changes, capacity and security patches.

#zh[乙方应于每月结束后五个#ed[工作日][自然日]内提交上月服务报告，内容包括可用性、故障、变更、容量及安全补丁情况。]

= Payment 付款

The Customer shall pay each invoice within thirty (30) days of receiving a valid VAT invoice. Disputed amounts shall be notified in writing within ten (10) days of receipt of the invoice.

#zh[甲方应在收到合法有效的增值税发票后三十（30）日内付款。如对发票金额有异议，应在收到发票后十（10）日内书面提出。]

= Data Protection 数据保护

Customer data is stored only in data centres located in the People’s Republic of China. The Provider shall not transfer customer data abroad without the Customer’s prior written consent.

#zh[甲方数据仅存储于中华人民共和国境内的数据中心。未经甲方事先书面同意，乙方不得将甲方数据传输至境外。]

= Language 协议文本

This Agreement is made in English and Chinese. Both versions have the same legal effect.

#zh[本协议以中英文书就，两种文本具有同等法律效力；两种文本如有不一致，#if AFTER { underline(offset: 2.5pt)[以中文文本为准] } else [以中文文本为准]。]

#v(1.2em)
#grid(columns: (1fr, 1fr), column-gutter: 2em,
  [Customer 甲方：#smallcaps[Hexton Retail Co., Ltd.]\ #v(1.4em) #line(length: 80%, stroke: 0.5pt) Authorised signatory 授权代表],
  [Provider 乙方：#smallcaps[Lumenvale Cloud Services Co., Ltd.]\ #v(1.4em) #line(length: 80%, stroke: 0.5pt) Authorised signatory 授权代表],
)

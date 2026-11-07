"""Case holdout4-f-ja-maintenance-contract.

A Japanese system maintenance outsourcing contract (システム保守業務委託契約書)
between two unnamed fictional parties (甲 and 乙), typeset with reportlab in
IPAGothic with CJK line wrapping. Synthetic sample.

    python3 ja_contract.py before|after out.pdf
    python3 ja_contract.py truth
"""

import json
import sys

from reportlab import rl_config

rl_config.invariant = 1

from reportlab.lib.enums import TA_CENTER, TA_LEFT  # noqa: E402
from reportlab.lib.pagesizes import A4  # noqa: E402
from reportlab.lib.styles import ParagraphStyle  # noqa: E402
from reportlab.lib.units import mm  # noqa: E402
from reportlab.pdfbase import pdfmetrics  # noqa: E402
from reportlab.pdfbase.ttfonts import TTFont  # noqa: E402
from reportlab.platypus import KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle  # noqa: E402

pdfmetrics.registerFont(TTFont('IPAGothic', '/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf'))
F = 'IPAGothic'

TITLE = ParagraphStyle('title', fontName=F, fontSize=17, leading=24, alignment=TA_CENTER, spaceAfter=14)
BODY = ParagraphStyle('body', fontName=F, fontSize=10.5, leading=17, wordWrap='CJK', alignment=TA_LEFT, spaceAfter=4)
ART = ParagraphStyle('art', fontName=F, fontSize=11, leading=17, spaceBefore=9, spaceAfter=3, textColor='#1d2d44')
CL = ParagraphStyle('cl', parent=BODY, leftIndent=10.5, firstLineIndent=-10.5)
ITEM = ParagraphStyle('item', parent=BODY, leftIndent=31.5, firstLineIndent=-21, spaceAfter=2)
CELL = ParagraphStyle('cell', fontName=F, fontSize=9, leading=13, wordWrap='CJK')
NOTE = ParagraphStyle('note', fontName=F, fontSize=8.5, leading=13, wordWrap='CJK', textColor='#444444')


def articles(v):
    before = v == 'before'
    start = '２０２７年４月１日' if before else '２０２７年５月１日'
    hours = '午前９時から午後６時まで' if before else '午前９時から午後８時まで'
    fee = '金３８５，０００円' if before else '金４１８，０００円'
    term = '瑕疵担保責任' if before else '契約不適合責任'
    art12 = [
        '乙は、本業務の遂行にあたり甲から預託を受けた個人情報を、個人情報の保護に関する法律その他の関係法令及び甲の定める規程に従って取り扱うものとする。',
        '２　乙は、前項の個人情報を本業務の目的以外に利用してはならず、また、甲の書面による事前の承諾なく複製し、又は第三者に提供してはならない。',
        '３　乙は、個人情報の漏えい、滅失又は毀損が発生し、又はそのおそれがあることを知ったときは、直ちに甲に報告し、甲の指示に従って必要な措置を講じるものとする。',
    ]
    if not before:
        art12.append('４　乙は、本業務の遂行にあたり生成ＡＩその他の外部サービスに甲の情報を入力する場合には、事前に甲の書面による承諾を得るものとする。')
    art14 = '乙が本契約に基づき甲に対して負う損害賠償の額は、損害発生の原因となった事由が生じた月の直前１２か月間に甲が乙に支払った委託料の総額を上限とする。'
    if before:
        art14 += 'ただし、乙の故意又は重大な過失による場合は、この限りでない。'
    return [
        ('第１条（目的）', [
            '本契約は、甲が運用する販売管理システム（以下「本システム」という。）の安定した稼働を維持するため、甲が乙に本システムの保守業務を委託し、乙がこれを受託することに関し、必要な事項を定めることを目的とする。',
        ]),
        ('第２条（定義）', [
            '本契約において使用する用語の意味は、次の各号に定めるとおりとする。',
            ('（１）', '「本業務」とは、別紙１に定める本システムの保守業務をいう。'),
            ('（２）', '「障害」とは、本システムが仕様書に定める機能を発揮できない状態をいい、その影響の大きさに応じて別紙１に定める重大障害、中障害及び軽障害に区分する。'),
            ('（３）', '「営業日」とは、土曜日、日曜日、国民の祝日に関する法律に定める休日及び１２月２９日から翌年１月３日までの日を除いた日をいう。'),
            ('（４）', '「成果物」とは、本業務の遂行に伴い乙が甲に納入する報告書、修正プログラム、手順書その他の物をいう。'),
        ]),
        ('第３条（委託業務の内容）', [
            '甲は、乙に対し、別紙１に定める本業務を委託し、乙はこれを受託する。',
            '２　本業務の詳細な実施方法は、甲乙協議の上、運用手順書に定めるものとする。運用手順書の内容が本契約と矛盾する場合には、本契約の定めが優先する。',
        ]),
        ('第４条（契約期間）', [
            f'本契約の有効期間は、{start}から２０２８年３月３１日までとする。',
            '２　期間満了の３か月前までに甲乙いずれからも書面による別段の申出がないときは、本契約は同一の条件でさらに１年間更新されるものとし、以後も同様とする。',
        ]),
        ('第５条（対応時間）', [
            f'乙は、営業日の{hours}（以下「対応時間」という。）、甲からの問合せ及び障害の連絡を受け付けるものとする。',
            '２　重大障害については、乙は対応時間外においても電話による連絡を受け付け、別紙１に定める時間内に初動対応を開始するものとする。',
            '３　対応時間外の作業に係る費用は、別紙２に定める単価により、委託料とは別に甲が負担する。ただし、障害の原因が乙の責めに帰すべき事由による場合は、この限りでない。',
        ]),
        ('第６条（障害対応）', [
            '乙は、障害の連絡を受けたときは、直ちに原因の調査に着手し、暫定的な回避策及び恒久的な対策を甲に提示するものとする。',
            '２　乙は、障害が復旧したときは、復旧の日から５営業日以内に、障害の内容、原因、対応経過及び再発防止策を記載した障害報告書を甲に提出するものとする。',
        ]),
        ('第７条（報告）', [
            '乙は、毎月の本業務の実施状況を取りまとめた月次報告書を、翌月の第５営業日までに甲に提出するものとする。',
            '２　甲及び乙は、月次報告書に基づき、原則として毎月１回、定例会を開催し、本業務の実施状況、課題及び改善策について協議する。',
        ]),
        ('第８条（再委託）', [
            '乙は、本業務の全部又は一部を第三者に再委託してはならない。ただし、あらかじめ甲の書面による承諾を得た場合は、この限りでない。',
            '２　乙は、前項ただし書に基づき再委託する場合には、再委託先に本契約における乙の義務と同等の義務を負わせるとともに、再委託先の行為について甲に対し全ての責任を負うものとする。',
        ]),
        ('第９条（委託料）', [
            f'本業務の委託料は、月額{fee}（消費税及び地方消費税を含む。）とする。',
            '２　契約期間の途中で本契約が終了した場合の当該月の委託料は、日割り計算により算定する。',
        ]),
        ('第１０条（支払方法）', [
            '乙は、毎月末日締めで当月分の委託料を甲に請求し、甲は、請求書を受領した月の翌月末日までに、乙の指定する銀行口座に振り込む方法により支払うものとする。振込手数料は甲の負担とする。',
        ]),
        ('第１１条（秘密保持）', [
            '甲及び乙は、本契約の履行に関して知り得た相手方の技術上又は営業上の情報（以下「秘密情報」という。）を、相手方の書面による事前の承諾なく第三者に開示し、又は本契約の目的以外に使用してはならない。',
            '２　前項の規定は、次の各号のいずれかに該当する情報には適用しない。',
            ('（１）', '開示を受けた時点で既に公知であった情報'),
            ('（２）', '開示を受けた後、自らの責めによらずに公知となった情報'),
            ('（３）', '正当な権限を有する第三者から秘密保持義務を負うことなく取得した情報'),
            ('（４）', '法令又は裁判所の命令により開示を求められた情報'),
            '３　本条の義務は、本契約の終了後も３年間存続する。',
        ]),
        ('第１２条（個人情報の取扱い）', art12),
        (f'第１３条（{term}）', [
            '乙が本業務において納入した成果物に、本契約の内容に適合しない点があるときは、甲は、乙に対し、相当の期間を定めて、その修補又は代替物の納入を請求することができる。',
            '２　前項の請求は、甲が当該不適合を知った時から１年以内に乙に通知した場合に限り、行うことができる。',
        ]),
        ('第１４条（損害賠償）', [
            '甲及び乙は、本契約に違反し、相手方に損害を与えたときは、相手方に対し、その損害を賠償する責任を負う。',
            '２　' + art14,
        ]),
        ('第１５条（契約の解除）', [
            '甲又は乙は、相手方が次の各号のいずれかに該当したときは、何らの催告を要せず、直ちに本契約の全部又は一部を解除することができる。',
            ('（１）', '本契約に違反し、相当の期間を定めて催告したにもかかわらず、当該期間内に是正しないとき'),
            ('（２）', '支払の停止があったとき、又は破産手続開始、民事再生手続開始若しくは会社更生手続開始の申立てがあったとき'),
            ('（３）', '差押え、仮差押え又は競売の申立てを受けたとき'),
            ('（４）', 'その他本契約を継続し難い重大な事由が生じたとき'),
        ]),
        ('第１６条（反社会的勢力の排除）', [
            '甲及び乙は、自己又はその役員が暴力団、暴力団員その他の反社会的勢力に該当しないこと、及び将来にわたっても該当しないことを表明し、保証する。',
            '２　甲又は乙は、相手方が前項の表明に違反したときは、何らの催告を要せず、直ちに本契約を解除することができる。',
        ]),
        ('第１７条（協議）', [
            '本契約に定めのない事項又は本契約の解釈について疑義が生じた事項については、甲乙誠実に協議の上、解決するものとする。',
        ]),
        ('第１８条（合意管轄）', [
            '本契約に関する一切の紛争については、甲の本店所在地を管轄する地方裁判所を第一審の専属的合意管轄裁判所とする。',
        ]),
    ]


SCHEDULE1 = [
    ('定期保守', 'サーバ及びミドルウェアの稼働状況の確認、ログの点検、ディスク使用量の確認', '月１回'),
    ('セキュリティ更新', 'ＯＳ及びミドルウェアのセキュリティパッチの検証及び適用', '月１回（緊急時は随時）'),
    ('バックアップ確認', 'バックアップの取得結果の確認及び四半期ごとのリストア試験', '毎営業日／四半期１回'),
    ('問合せ対応', '甲の担当者からの操作方法、仕様に関する問合せへの回答', '対応時間内随時'),
    ('障害対応', '障害の切り分け、暫定対応、恒久対策の提示及び実施', '随時'),
    ('軽微な改修', '画面の文言変更、帳票レイアウトの調整等、月８時間以内の改修', '随時'),
    ('報告', '月次報告書の作成及び定例会への出席', '月１回'),
]

SEVERITY = [
    ('重大障害', '本システムの全部が停止し、業務の継続が困難な状態', '連絡受付から１時間以内', '４時間以内'),
    ('中障害', '本システムの一部の機能が停止し、業務に支障がある状態', '連絡受付から４時間以内', '翌営業日まで'),
    ('軽障害', '業務への影響が軽微であり、回避策がある状態', '翌営業日まで', '次回定期保守まで'),
]


def rates(v):
    return [
        ('ＳＥ作業（対応時間内）', '1人日', '96,000円', '第３条の範囲を超える改修等'),
        ('時間外対応', '1時間', '14,500円' if v == 'before' else '16,000円', '平日の対応時間外'),
        ('休日対応', '1時間', '19,800円', '土曜日、日曜日及び休日'),
        ('オンサイト対応', '1回', '35,000円', '交通費を含む'),
        ('データ復旧作業', '1件', '見積りによる', '甲の操作誤りに起因するもの'),
    ]


def table(header, rows, widths):
    data = [[Paragraph(h, CELL) for h in header]] + [[Paragraph(c, CELL) for c in r] for r in rows]
    t = Table(data, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.5, '#7a8899'),
        ('BACKGROUND', (0, 0), (-1, 0), '#e6ecf2'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    return t


def build(v, out):
    story = [
        Paragraph('システム保守業務委託契約書', TITLE),
        Paragraph('合成サンプル（Synthetic sample）：本契約書はソフトウェア試験のために作成した架空の文書であり、実在の当事者・システムとは関係がない。', NOTE),
        Spacer(1, 8),
        Paragraph('発注者（以下「甲」という。）と受注者（以下「乙」という。）は、甲の運用する販売管理システムの保守業務の委託に関し、次のとおり契約（以下「本契約」という。）を締結する。', BODY),
    ]
    for head, paras in articles(v):
        flow = [Paragraph(head, ART)]
        for p in paras:
            if isinstance(p, tuple):
                flow.append(Paragraph(f'{p[0]}{p[1]}', ITEM))
            else:
                flow.append(Paragraph(p, CL))
        story.append(KeepTogether(flow[:2]))
        story.extend(flow[2:])
    story += [
        Spacer(1, 12),
        Paragraph('本契約の成立を証するため、本書２通を作成し、甲乙記名押印の上、各１通を保有する。', BODY),
        Spacer(1, 6),
        Paragraph('２０２７年　　月　　日', BODY),
        Spacer(1, 6),
        Paragraph('甲　住所', BODY), Paragraph('　　名称', BODY), Paragraph('　　代表者　　　　　　　　　　　　　　　印', BODY),
        Spacer(1, 6),
        Paragraph('乙　住所', BODY), Paragraph('　　名称', BODY), Paragraph('　　代表者　　　　　　　　　　　　　　　印', BODY),
        PageBreak(),
        Paragraph('別紙１　保守業務の内容', ART),
        table(['業務項目', '内容', '頻度'], SCHEDULE1, [32 * mm, 98 * mm, 40 * mm]),
        Spacer(1, 8),
        Paragraph('障害の区分と対応時間', ART),
        table(['区分', '状態', '初動対応', '復旧目標'], SEVERITY, [24 * mm, 78 * mm, 36 * mm, 32 * mm]),
        Spacer(1, 8),
        Paragraph('別紙２　追加作業の単価', ART),
        Paragraph('委託料に含まれない作業は、次の単価（消費税別）により、作業の翌月に委託料と併せて請求する。', BODY),
        table(['作業', '単位', '単価', '備考'], rates(v), [44 * mm, 20 * mm, 32 * mm, 74 * mm]),
    ]

    def on_page(canvas, doc):
        canvas.saveState()
        canvas.setFont(F, 8)
        canvas.setFillColor('#555555')
        canvas.drawString(22 * mm, 12 * mm, 'システム保守業務委託契約書　合成サンプル（Synthetic sample）')
        canvas.drawRightString(A4[0] - 22 * mm, 12 * mm, f'－ {doc.page} －')
        canvas.restoreState()

    doc = SimpleDocTemplate(out, pagesize=A4, leftMargin=22 * mm, rightMargin=22 * mm, topMargin=22 * mm,
                            bottomMargin=22 * mm, title='システム保守業務委託契約書', author='Synthetic sample')
    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)


TRUTH = {
    'description': (
        'Japanese system maintenance outsourcing contract (システム保守業務委託契約書) between two unnamed fictional '
        'parties 甲 and 乙: 18 articles with numbered paragraphs (２, ３) and items (（１）), a signature block and two '
        'schedules with tables, typeset with reportlab in IPAGothic with CJK line wrapping; full-width digits in the '
        'articles, half-width digits in the schedule tables. Seven edits: contract start date in article 4 (４月 to '
        '５月, full-width); end of the service hours in article 5; the monthly fee in article 9 (full-width digits and '
        'comma); a new paragraph ４ added at the end of article 12; the title of article 13 modernised from '
        '瑕疵担保責任 to 契約不適合責任; the proviso deleted from article 14 paragraph ２; and the overtime rate in '
        'schedule 2. Re-flow changes only as a consequence. The README lists Japanese as tested by unit tests only.'
    ),
    'truth': [
        {'type': 'number', 'old': '４月１日', 'new': '５月１日', 'oldLocate': '２０２７年４月１日から', 'newLocate': '２０２７年５月１日から',
         'note': 'Start date in article 4, full-width digits; the end date ２０２８年３月３１日 is unchanged.'},
        {'type': 'number', 'old': '午後６時', 'new': '午後８時', 'note': 'End of the service hours in article 5 paragraph 1 (full-width digit).'},
        {'type': 'number', 'old': '３８５，０００', 'new': '４１８，０００', 'note': 'Monthly fee in article 9, full-width digits and full-width comma (金３８５，０００円 to 金４１８，０００円).'},
        {'type': 'insert', 'new': '乙は、本業務の遂行にあたり生成ＡＩその他の外部サービスに甲の情報を入力する場合には、事前に甲の書面による承諾を得るものとする。',
         'oldAnchor': '甲の指示に従って必要な措置を講じるものとする。', 'note': 'New paragraph ４ at the end of article 12; no renumbering.'},
        {'type': 'replace', 'old': '瑕疵担保責任', 'new': '契約不適合責任', 'note': 'Article 13 heading only (第１３条（瑕疵担保責任） to 第１３条（契約不適合責任）); the body text is unchanged.'},
        {'type': 'delete', 'old': 'ただし、乙の故意又は重大な過失による場合は、この限りでない。', 'newAnchor': '甲が乙に支払った委託料の総額を上限とする。',
         'note': 'Proviso at the end of article 14 paragraph ２ deleted (the liability cap now applies without exception). Article 5 paragraph ３ has a similar but different proviso, which is unchanged.'},
        {'type': 'number', 'old': '14,500', 'new': '16,000', 'note': 'Overtime rate (時間外対応, per hour) in the schedule 2 table, half-width digits.'},
    ],
}

if __name__ == '__main__':
    if sys.argv[1] == 'truth':
        print(json.dumps(TRUTH, ensure_ascii=False))
    else:
        build(sys.argv[1], sys.argv[2])

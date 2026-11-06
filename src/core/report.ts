import type { Change, CompareResult } from './types.ts';
import { t, type Lang } from './i18n.ts';
import { countLabel, describeChange, excerpt, kindLabel, locationLabel, notices, pageLabel, pairLabel, truncate, type Notice } from './describe.ts';
import { countChanges } from './pipeline.ts';
import { COLORS } from './crops.ts';

export type ReviewStatus = 'ok' | 'question';

export interface Review {
  status?: ReviewStatus;
  note?: string;
}

export interface ReportInput {
  result: CompareResult;
  lang: Lang;
  oldName: string;
  newName: string;
  reviews?: Record<string, Review>;
  /** PNG data URLs keyed by change id. */
  crops?: Record<string, { old?: string; new?: string; wide?: boolean }>;
  generatedAt?: Date;
  /** Only include these change ids (e.g. the current filter). */
  include?: string[];
  homepage?: string;
  /** File identity for the method section. */
  files?: { old?: { sha256?: string }; new?: { sha256?: string } };
  version?: string;
  /** Whether graphics/colour were compared (rendering was available and enabled). */
  visualCompared?: boolean;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const HOMEPAGE = 'https://github.com/Ray0766/changelens';

/**
 * Everything that was filtered out or not compared, for every output
 * (terminal, HTML report, JSON), so the three cannot drift apart.
 */
export function reportNotices(lang: Lang, result: CompareResult, visualCompared = true): Notice[] {
  let notes = notices(lang, result);
  if (!visualCompared) {
    // Pages paired by hand were not compared as images either.
    const textOnly = new Map(
      result.pageLinks
        .filter((l) => l.manual)
        .map((l) => {
          const pair = pairLabel(lang, l.oldPage, l.newPage);
          return [t(lang, 'noticePaired', { pair }), t(lang, 'noticePairedNoVisual', { pair })] as const;
        }),
    );
    notes = notes.map((n) => (textOnly.has(n.text) ? { ...n, text: textOnly.get(n.text)! } : n));
    notes.push({ level: 'info', text: t(lang, 'noticeNoVisual') });
  }
  if (!result.options.detectFormatting) notes.push({ level: 'info', text: t(lang, 'noticeNoFormat') });
  return notes;
}

/**
 * False when part of the documents was not compared: pages without text,
 * unreadable glyphs, uncertain pairing (warnings) or graphics skipped. Then
 * "no differences" is not an all-clear.
 */
export function comparedEverything(notes: Notice[], visualCompared = true): boolean {
  return visualCompared && !notes.some((n) => n.level === 'warn');
}

/**
 * The parts of the excerpt that the report and the web list show for a
 * change ('' where nothing is shown). Context is shown around text edits
 * only. A move shows its old wording only when the moved text was also
 * edited: the two wordings can differ in ways the comparison ignores
 * (quotes, ligatures, case with --ignore-case), and showing those as
 * deleted text would contradict "Moved".
 */
export function shownExcerpt(c: Change): { before: string; old: string; new: string; after: string } {
  const e = excerpt(c);
  switch (c.kind) {
    case 'replace':
      return e;
    case 'insert':
      return { ...e, old: '' };
    case 'delete':
      return { ...e, new: '' };
    case 'move':
      return { before: '', old: c.moveEdits && e.old !== e.new ? e.old : '', new: e.new, after: '' };
    default:
      return { before: '', old: e.new ? '' : e.old, new: e.new, after: '' };
  }
}

export function excerptHtml(c: Change): string {
  const e = shownExcerpt(c);
  const ctxB = e.before ? `<span class="ctx">${escapeHtml(e.before)}</span> ` : '';
  const ctxA = e.after ? ` <span class="ctx">${escapeHtml(e.after)}</span>` : '';
  switch (c.kind) {
    case 'replace':
      return `${ctxB}<del>${escapeHtml(e.old)}</del> <ins>${escapeHtml(e.new)}</ins>${ctxA}`;
    case 'insert':
      return `${ctxB}<ins>${escapeHtml(e.new)}</ins>${ctxA}`;
    case 'delete':
      return `${ctxB}<del>${escapeHtml(e.old)}</del>${ctxA}`;
    case 'move':
      // Moved and edited: show the old wording too, so the edit is visible.
      return e.old ? `<del>${escapeHtml(e.old)}</del> <mark class="mv">${escapeHtml(e.new)}</mark>` : `<mark class="mv">${escapeHtml(e.new)}</mark>`;
    default:
      return e.new || e.old ? `<span class="q">${escapeHtml(e.new || e.old)}</span>` : '';
  }
}

/** Small SVG showing how old pages map onto new pages. */
export function pageMapSvg(result: CompareResult, lang: Lang): string {
  const n = result.oldDoc.pages.length;
  const m = result.newDoc.pages.length;
  const cols = Math.max(n, m);
  const step = cols > 40 ? 12 : cols > 20 ? 18 : 28;
  const pw = step * 0.64;
  const ph = pw * 1.3;
  const width = cols * step + 96;
  const yOld = 6;
  const yNew = 62 + ph;
  const changed = (side: 'old' | 'new', p: number) => result.changes.some((c) => c[side].rects.some((r) => r.page === p));
  const x = (i: number) => 90 + i * step;
  const maxW = Math.max(1, ...result.pageLinks.map((l) => l.weight));
  const links = result.pageLinks
    .filter((l) => l.weight >= 3 || l.manual || l.image)
    .map((l) =>
      l.manual
        ? `<line class="manual" x1="${x(l.oldPage) + pw / 2}" y1="${yOld + ph}" x2="${x(l.newPage) + pw / 2}" y2="${yNew}" stroke="${COLORS.move}" stroke-width="2.5" stroke-dasharray="4 3"/>`
        : l.image
        ? `<line class="image" x1="${x(l.oldPage) + pw / 2}" y1="${yOld + ph}" x2="${x(l.newPage) + pw / 2}" y2="${yNew}" stroke="currentColor" stroke-opacity="0.6" stroke-width="1.5" stroke-dasharray="2 3"/>`
        : `<line x1="${x(l.oldPage) + pw / 2}" y1="${yOld + ph}" x2="${x(l.newPage) + pw / 2}" y2="${yNew}" stroke="currentColor" stroke-opacity="${(0.25 + 0.6 * (l.weight / maxW)).toFixed(2)}" stroke-width="${(1 + 2 * (l.weight / maxW)).toFixed(1)}"/>`,
    )
    .join('');
  // Pages that could not be paired from text (no text layer, mostly new): dashed outline.
  const unsure = (side: 'old' | 'new', p: number) =>
    !!result.coverage?.[side].textless.includes(p) || (side === 'new' && !!result.coverage?.new.uncertain?.some((u) => u.page === p));
  const pages = (count: number, y: number, side: 'old' | 'new') =>
    Array.from({ length: count }, (_, i) => {
      const hot = changed(side, i);
      return `<rect data-side="${side}" data-page="${i}" pointer-events="all" x="${x(i)}" y="${y}" width="${pw}" height="${ph}" rx="2" fill="${hot ? (side === 'old' ? COLORS.del : COLORS.ins) : 'none'}" fill-opacity="${hot ? 0.22 : 0}" stroke="currentColor" stroke-opacity="0.55"${unsure(side, i) ? ' stroke-dasharray="2 2"' : ''}/>` +
        (count <= 40 ? `<text x="${x(i) + pw / 2}" y="${y + ph / 2 + 3.5}" font-size="${step > 20 ? 9 : 7}" text-anchor="middle" fill="currentColor" pointer-events="none">${i + 1}</text>` : '');
    }).join('');
  return `<svg class="pagemap" viewBox="0 0 ${width} ${yNew + ph + 6}" width="${width}" role="img" aria-label="${escapeHtml(t(lang, 'pageMap'))}">
  <text x="0" y="${yOld + ph / 2 + 4}" font-size="11" fill="currentColor">${escapeHtml(t(lang, 'oldVersion'))}</text>
  <text x="0" y="${yNew + ph / 2 + 4}" font-size="11" fill="currentColor">${escapeHtml(t(lang, 'newVersion'))}</text>
  ${links}${pages(n, yOld, 'old')}${pages(m, yNew, 'new')}</svg>`;
}

const CSS = `
:root{--bg:#f6f7f9;--card:#fff;--ink:#1b1f24;--muted:#5d6670;--line:#e2e5e9;--del:${COLORS.del};--ins:${COLORS.ins};--mv:${COLORS.move};--vis:${COLORS.visual};--accent:#2754c5}
@media (prefers-color-scheme:dark){:root{--bg:#121417;--card:#1b1e22;--ink:#e8eaed;--muted:#9aa3ad;--line:#2c3138}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 system-ui,-apple-system,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",sans-serif}
main{max-width:1080px;margin:0 auto;padding:32px 16px 64px}
header h1{font-size:26px;margin:0 0 4px;letter-spacing:-.01em}
.files{color:var(--muted);margin:0 0 4px;word-break:break-all}
.files b{color:var(--ink);font-weight:600}
.meta{color:var(--muted);font-size:13px;margin:0}
.lede{font-size:17px;margin:18px 0 10px;max-width:68ch}
.notices{list-style:none;margin:0 0 8px;padding:0;font-size:14px}
.notices li{padding:6px 10px;border-radius:8px;margin:4px 0;background:var(--card);border:1px solid var(--line)}
.notices li.warn{border-color:#e0a100;background:color-mix(in srgb,#e0a100 10%,var(--card))}
.method dl{display:grid;grid-template-columns:max-content 1fr;gap:6px 16px;margin:0;font-size:14px}
.method dt{color:var(--muted)}.method dd{margin:0;word-break:break-word}.method dt+dd~dd{grid-column:2}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;color:var(--muted)}
.disclaimer{margin-top:14px;font-size:13px;color:var(--muted);max-width:75ch}
section{margin-top:28px}
h2{font-size:18px;margin:0 0 12px}
.mapbox{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px;overflow-x:auto;color:var(--muted)}
.pagemap{display:block;max-width:none}
.change{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin:0 0 14px;break-inside:avoid;page-break-inside:avoid}
.head{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px 10px}
.num{font-variant-numeric:tabular-nums;color:var(--muted);font-size:13px;min-width:2.2em}
.badge{display:inline-block;font-size:12px;font-weight:600;padding:1px 8px;border-radius:999px;color:#fff}
.b-text{background:var(--accent)}.b-del{background:var(--del)}.b-ins{background:var(--ins)}.b-mv{background:var(--mv)}.b-vis{background:var(--vis)}.b-num{background:#c77800}
.desc{font-weight:600;flex:1 1 320px;word-break:break-word}
.loc{color:var(--muted);font-size:13px;white-space:nowrap}
.ex{margin:8px 0 0;color:var(--ink);word-break:break-word}
.ctx{color:var(--muted)}
del{background:color-mix(in srgb,var(--del) 16%,transparent);color:inherit;text-decoration:line-through;text-decoration-color:var(--del);padding:0 2px;border-radius:3px}
ins{background:color-mix(in srgb,var(--ins) 18%,transparent);text-decoration:none;padding:0 2px;border-radius:3px}
mark.mv{background:color-mix(in srgb,var(--mv) 14%,transparent);color:inherit;padding:0 2px;border-radius:3px}
.q{color:var(--muted)}
.crops{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}
.crops.wide{grid-template-columns:1fr}
.crops figure{margin:0;min-width:0}
.crops figcaption{font-size:12px;color:var(--muted);margin-bottom:4px}
.crops img{display:block;width:100%;height:auto;border:1px solid var(--line);border-radius:8px;background:#fff}
.crops .none{border:1px dashed var(--line);border-radius:8px;color:var(--muted);font-size:13px;display:flex;align-items:center;justify-content:center;min-height:80px}
.review{margin-top:10px;font-size:13px;display:flex;flex-wrap:wrap;gap:6px 12px;align-items:baseline}
.st-ok{color:var(--ins);font-weight:600}.st-question{color:#c77800;font-weight:600}.st-open{color:var(--muted)}
.note{white-space:pre-wrap;background:var(--bg);border-radius:6px;padding:4px 8px;flex:1 1 100%}
footer{margin-top:40px;color:var(--muted);font-size:13px;text-align:center}
footer a{color:inherit}
@media (max-width:640px){.crops{grid-template-columns:1fr}}
@media print{
:root{color-scheme:light;--bg:#fff;--card:#fff;--ink:#1b1f24;--muted:#4a525b;--line:#ccc}
body{background:#fff;font-size:12px}main{padding:0}.change,.mapbox,.notices li{border-color:#ccc}a{color:inherit}
.notices li.warn{background:none;border-width:2px}
.badge{background:none;color:var(--ink);border:1.5px solid currentColor}
.b-text{color:var(--accent)}.b-del{color:var(--del)}.b-ins{color:var(--ins)}.b-mv{color:var(--mv)}.b-vis{color:var(--vis)}.b-num{color:#9a5d00}
del{background:none;text-decoration-thickness:1.5px}
ins{background:none;text-decoration:underline;text-decoration-color:var(--ins);text-decoration-thickness:1.5px}
mark.mv{background:none;border-bottom:1.5px dotted var(--mv);border-radius:0}
}
`;

function badgeClass(c: Change): string {
  if (c.numeric) return 'b-num';
  if (c.category === 'visual') return 'b-vis';
  if (c.kind === 'move') return 'b-mv';
  if (c.kind === 'insert') return 'b-ins';
  if (c.kind === 'delete') return 'b-del';
  return 'b-text';
}

/** A complete, self-contained HTML review report. */
export function buildReport(input: ReportInput): string {
  const { result, lang } = input;
  const reviews = input.reviews ?? {};
  const crops = input.crops ?? {};
  const changes = input.include ? result.changes.filter((c) => input.include!.includes(c.id)) : result.changes;
  const counts = countChanges(changes);
  const date = (input.generatedAt ?? new Date()).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-GB', { dateStyle: 'long', timeStyle: 'short' });
  const reviewed = changes.filter((c) => reviews[c.id]?.status).length;
  const questions = changes.filter((c) => reviews[c.id]?.status === 'question').length;
  const homepage = input.homepage ?? HOMEPAGE;

  const summary =
    lang === 'zh'
      ? `共 ${counts.total} 处修改：文字 ${counts.text} 处${counts.numbers ? `（其中数字 ${counts.numbers} 处）` : ''}，版式 ${counts.visual} 处。已审查 ${reviewed}/${changes.length}${questions ? `，其中 ${questions} 处需要关注` : ''}。`
      : `${countLabel(lang, counts.total)}: ${counts.text} in the text${counts.numbers ? ` (${counts.numbers} with numbers)` : ''} and ${counts.visual} in the layout. Reviewed ${reviewed} of ${changes.length}${questions ? `; ${questions} need attention` : ''}.`;
  const visual = input.visualCompared ?? true;
  const notes = reportNotices(lang, result, visual);
  const noticeHtml = notes.length
    ? `<ul class="notices">${notes.map((n) => `<li class="${n.level}">${n.level === 'warn' ? '⚠ ' : ''}${escapeHtml(n.text)}</li>`).join('')}</ul>`
    : '';
  const settings = [
    t(lang, result.options.ignoreFurniture ? 'settingFurnitureOn' : 'settingFurnitureOff'),
    result.options.ignoreCase ? t(lang, 'settingCaseOn') : '',
    result.options.ignorePunctuation ? t(lang, 'settingPunctOn') : '',
    result.options.detectFormatting ? '' : t(lang, 'settingFormatOff'),
  ].filter(Boolean);
  const fileLine = (side: 'old' | 'new', name: string) => {
    const doc = side === 'old' ? result.oldDoc : result.newDoc;
    const sha = input.files?.[side]?.sha256;
    return `<dd><b>${escapeHtml(name)}</b> · ${escapeHtml(t(lang, 'pagesCount', { n: doc.pages.length }))}${sha ? ` · <span class="mono">${escapeHtml(t(lang, 'sha'))} ${escapeHtml(sha)}</span>` : ''}</dd>`;
  };
  const coverageNotes = notes.filter((n) => n.level === 'warn');
  const manualPairs = result.pageLinks.filter((l) => l.manual).map((l) => pairLabel(lang, l.oldPage, l.newPage));
  const method = `<section class="method">
  <h2>${escapeHtml(t(lang, 'methodTitle'))}</h2>
  <dl>
    <dt>${escapeHtml(t(lang, 'methodFiles'))}</dt>${fileLine('old', input.oldName)}${fileLine('new', input.newName)}
    <dt>${escapeHtml(t(lang, 'methodTool'))}</dt><dd>ChangeLens ${escapeHtml(input.version ?? '')} · ${escapeHtml(date)}</dd>
    <dt>${escapeHtml(t(lang, 'methodHow'))}</dt><dd>${escapeHtml(t(lang, visual ? 'methodHowText' : 'methodHowTextOnly'))}</dd>
    <dt>${escapeHtml(t(lang, 'methodSettings'))}</dt><dd>${escapeHtml(settings.join(' · '))}</dd>
    ${manualPairs.length ? `<dt>${escapeHtml(t(lang, 'manualPairs'))}</dt><dd>${manualPairs.map((p) => escapeHtml(p)).join('<br>')}</dd>` : ''}
    <dt>${escapeHtml(t(lang, 'methodCoverage'))}</dt><dd>${coverageNotes.length ? coverageNotes.map((n) => escapeHtml(n.text)).join('<br>') : escapeHtml(t(lang, 'methodCoverageNone'))}</dd>
  </dl>
  <p class="disclaimer">${escapeHtml(t(lang, 'disclaimer'))}</p>
</section>`;

  const items = changes
    .map((c, k) => {
      const cr = crops[c.id] ?? {};
      const fig = (side: 'old' | 'new') => {
        const label = side === 'old' ? t(lang, 'oldVersion') : t(lang, 'newVersion');
        const pages = c[side].pages.length ? c[side].pages : c[side].caret ? [c[side].caret!.page] : [];
        const cap = `${escapeHtml(label)}${pages.length ? ' · ' + escapeHtml(pageLabel(lang, pages)) : ''}`;
        const src = cr[side];
        return `<figure><figcaption>${cap}</figcaption>${src ? `<img alt="" src="${src}">` : `<div class="none">—</div>`}</figure>`;
      };
      const rv = reviews[c.id] ?? {};
      const status = rv.status === 'ok' ? `<span class="st-ok">${escapeHtml(t(lang, 'statusOk'))}</span>` : rv.status === 'question' ? `<span class="st-question">${escapeHtml(t(lang, 'statusQuestion'))}</span>` : `<span class="st-open">${escapeHtml(t(lang, 'statusOpen'))}</span>`;
      const note = rv.note ? `<div class="note"><b>${escapeHtml(t(lang, 'noteLabel'))}:</b> ${escapeHtml(rv.note)}</div>` : '';
      const ex = excerptHtml(c);
      const showCrops = cr.old || cr.new;
      return `<article class="change" id="${c.id}">
  <div class="head"><span class="num">#${k + 1}</span><span class="badge ${badgeClass(c)}">${escapeHtml(kindLabel(lang, c))}</span><span class="desc">${escapeHtml(describeChange(lang, c))}</span><span class="loc">${escapeHtml(locationLabel(lang, c))}</span></div>
  ${ex ? `<p class="ex">${ex}</p>` : ''}
  ${showCrops ? `<div class="crops${cr.wide ? ' wide' : ''}">${fig('old')}${fig('new')}</div>` : ''}
  <div class="review">${status}${note}</div>
</article>`;
    })
    .join('\n');

  const title = `${t(lang, 'reportTitle')} · ${truncate(input.newName, 60)}`;
  return `<!doctype html>
<html lang="${lang === 'zh' ? 'zh-CN' : 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="generator" content="ChangeLens">
<title>${escapeHtml(title)}</title>
<style>${CSS}</style>
</head>
<body>
<main>
<header>
  <h1>${escapeHtml(t(lang, 'reportTitle'))}</h1>
  <p class="files"><b>${escapeHtml(input.oldName)}</b> → <b>${escapeHtml(input.newName)}</b></p>
  <p class="meta">${escapeHtml(t(lang, 'generated', { date }))} · ${escapeHtml(t(lang, 'pagesLine', { old: result.oldDoc.pages.length, new: result.newDoc.pages.length }))} · ${escapeHtml(t(lang, 'similarity', { pct: (result.stats.similarity * 100).toFixed(1) + '%' }))}</p>
</header>
<p class="lede">${escapeHtml(summary)}</p>
${noticeHtml}
<section>
  <h2>${escapeHtml(t(lang, 'pageMap'))}</h2>
  <div class="mapbox">${pageMapSvg(result, lang)}</div>
</section>
<section>
  <h2>${escapeHtml(t(lang, 'details'))}</h2>
  ${changes.length ? items : `<p>${escapeHtml(t(lang, comparedEverything(notes, visual) ? 'noChanges' : 'noChangesIncomplete'))}</p>`}
</section>
${method}
<footer>ChangeLens · <a href="${escapeHtml(homepage)}">${escapeHtml(homepage.replace(/^https?:\/\//, ''))}</a></footer>
</main>
</body>
</html>`;
}

/**
 * Machine-readable export of the comparison (no page images). `version` is
 * the schema version; `tool.version` is the ChangeLens build. All page
 * numbers are 1-based.
 */
export function buildJson(input: ReportInput): unknown {
  const { result, lang } = input;
  const reviews = input.reviews ?? {};
  const visualCompared = input.visualCompared ?? true;
  const notes = reportNotices(lang, result, visualCompared);
  const page1 = <T extends { page: number }>(u: T): T => ({ ...u, page: u.page + 1 });
  const coverage = (c: CompareResult['coverage']['old']) => ({
    textless: c.textless.map((p) => p + 1),
    unreadable: c.unreadable.map(page1),
    ...(c.privateUse ? { privateUse: c.privateUse.map(page1) } : {}),
    ...(c.visualSkipped ? { visualSkipped: c.visualSkipped.map((p) => p + 1) } : {}),
    ...(c.uncertain ? { uncertain: c.uncertain.map(page1) } : {}),
    ...(c.partlyCompared ? { partlyCompared: c.partlyCompared.map(page1) } : {}),
    ...(c.fieldsUnread ? { fieldsUnread: c.fieldsUnread.map(page1) } : {}),
    ...(c.outOfOrder ? { outOfOrder: c.outOfOrder.map(page1) } : {}),
  });
  return {
    generator: 'ChangeLens',
    version: 2,
    tool: { name: 'ChangeLens', version: input.version ?? null },
    old: { name: input.oldName, pages: result.oldDoc.pages.length },
    new: { name: input.newName, pages: result.newDoc.pages.length },
    // Page numbers in the JSON are 1-based, the pairs given with --pair too.
    options: { ...result.options, manualPairs: result.options.manualPairs?.map(([o, n]) => [o + 1, n + 1]) },
    stats: result.stats,
    visualCompared,
    /** False when pages, glyphs or graphics were not compared (see notices). */
    complete: comparedEverything(notes, visualCompared),
    coverage: result.coverage && { old: coverage(result.coverage.old), new: coverage(result.coverage.new) },
    ignored: result.ignored,
    notices: notes,
    files: input.files,
    manualPairs: result.pageLinks.filter((l) => l.manual).map((l) => ({ old: l.oldPage + 1, new: l.newPage + 1 })),
    // Listed in the app with "Show"; a reviewer may have marked them too.
    minor: result.minor.map((c) => ({ id: c.id, description: describeChange(lang, c), location: locationLabel(lang, c), review: reviews[c.id] })),
    pageMap: { oldToNew: result.oldToNew.map((p) => (p < 0 ? null : p + 1)), newToOld: result.newToOld.map((p) => (p < 0 ? null : p + 1)) },
    changes: result.changes.map((c) => ({
      id: c.id,
      kind: c.kind,
      category: c.category,
      description: describeChange(lang, c),
      location: locationLabel(lang, c),
      numeric: c.numeric,
      format: c.format,
      overflow: c.overflow,
      old: { pages: c.old.pages.map((p) => p + 1), text: c.old.text, rects: c.old.rects.map((r) => ({ page: r.page + 1, ...round(r.rect) })) },
      new: { pages: c.new.pages.map((p) => p + 1), text: c.new.text, rects: c.new.rects.map((r) => ({ page: r.page + 1, ...round(r.rect) })) },
      review: reviews[c.id],
    })),
  };
}

function round(r: { x: number; y: number; w: number; h: number }) {
  const f = (v: number) => Math.round(v * 10) / 10;
  return { x: f(r.x), y: f(r.y), w: f(r.w), h: f(r.h) };
}

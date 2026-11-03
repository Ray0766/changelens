import type { Change, CompareResult, Side } from './types.ts';
import { t, type Lang } from './i18n.ts';
import { SHIFT_PT } from './visual.ts';

export function truncate(s: string, n: number): string {
  const chars = Array.from(s.replace(/\s+/g, ' ').trim());
  return chars.length <= n ? chars.join('') : chars.slice(0, n - 1).join('') + '…';
}

export function pageLabel(lang: Lang, pages: number[]): string {
  if (pages.length === 0) return '';
  const a = pages[0] + 1;
  const b = pages[pages.length - 1] + 1;
  return a === b ? t(lang, 'page', { n: a }) : t(lang, 'pages', { a, b });
}

function sidePages(s: Side): number[] {
  if (s.pages.length) return s.pages;
  return s.caret ? [s.caret.page] : [];
}

/** "p. 3 → p. 4", or "p. 3" when both sides are on the same page number. */
export function locationLabel(lang: Lang, c: Change): string {
  const o = pageLabel(lang, sidePages(c.old));
  const n = pageLabel(lang, sidePages(c.new));
  if (!o) return n;
  if (!n) return o;
  return o === n ? o : `${o} → ${n}`;
}

export function percentChange(from: number | null, to: number | null): string | null {
  if (from === null || to === null || from === 0) return null;
  const pct = ((to - from) / Math.abs(from)) * 100;
  if (!Number.isFinite(pct) || Math.abs(pct) < 0.05) return null;
  const s = (Math.abs(pct) >= 10 ? pct.toFixed(0) : pct.toFixed(1)).replace(/\.0$/, '');
  return (pct > 0 ? '+' : '') + s + '%';
}

type CountKey = (w: 'addedWords' | 'deletedWords' | 'rewrote') => 'addedWords' | 'deletedWords' | 'rewrote' | 'addedChars' | 'deletedChars' | 'rewroteChars';

function describeReplace(lang: Lang, c: Change, countKey: CountKey): string {
  if (c.numeric) {
    const { fromValue: a, toValue: b } = c.numeric;
    const base = t(lang, 'numberChanged', { from: c.numeric.from, to: c.numeric.to });
    // A sign flip is the important fact; a percentage would only confuse.
    if (a !== null && b !== null && a !== 0 && b !== 0 && Math.sign(a) !== Math.sign(b))
      return lang === 'zh' ? `${base}（${t(lang, 'signChanged')}）` : `${base} (${t(lang, 'signChanged')})`;
    // "(3)" → "(4)" are labels or both negative: compare magnitudes.
    const bothParen = c.numeric.from.startsWith('(') && c.numeric.to.startsWith('(');
    const pct = bothParen ? percentChange(Math.abs(a ?? 0) || null, Math.abs(b ?? 0) || null) : percentChange(a, b);
    return pct ? (lang === 'zh' ? `${base}（${pct}）` : `${base} (${pct})`) : base;
  }
  if (Array.from(c.old.text).length <= 40 && Array.from(c.new.text).length <= 40) return t(lang, 'changedText', { from: c.old.text, to: c.new.text });
  return t(lang, countKey('rewrote'), { n: c.size });
}

/** One-line, plain-language description of a change. */
export function describeChange(lang: Lang, c: Change): string {
  const short = 48;
  const countKey = (words: 'addedWords' | 'deletedWords' | 'rewrote') =>
    c.cjk ? (({ addedWords: 'addedChars', deletedWords: 'deletedChars', rewrote: 'rewroteChars' }) as const)[words] : words;
  switch (c.kind) {
    case 'insert':
      if (c.duplicateOf !== undefined) return t(lang, 'duplicateOf', { page: pageLabel(lang, [c.duplicateOf]) });
      // Short content is clearer quoted than summarised (e.g. one table row).
      if (Array.from(c.new.text).length <= short) return t(lang, 'addedText', { text: c.new.text });
      if (c.wholeParagraphs) return c.wholeParagraphs === 1 ? t(lang, 'addedParagraph') : t(lang, 'addedParagraphs', { n: c.wholeParagraphs });
      return t(lang, countKey('addedWords'), { n: c.size });
    case 'delete':
      if (Array.from(c.old.text).length <= short) return t(lang, 'deletedText', { text: c.old.text });
      if (c.wholeParagraphs) return c.wholeParagraphs === 1 ? t(lang, 'deletedParagraph') : t(lang, 'deletedParagraphs', { n: c.wholeParagraphs });
      return t(lang, countKey('deletedWords'), { n: c.size });
    case 'replace': {
      if (c.consequence === 'renumber') return t(lang, 'renumbered', { from: c.old.text, to: c.new.text });
      const places = c.places ? (lang === 'zh' ? `（${t(lang, 'inPlaces', { n: c.places })}）` : ` (${t(lang, 'inPlaces', { n: c.places })})`) : '';
      return describeReplace(lang, c, countKey) + places;
    }
    case 'move':
      if (c.wholeParagraphs) return c.wholeParagraphs === 1 ? t(lang, 'movedParagraph') : t(lang, 'movedParagraphs', { n: c.wholeParagraphs });
      return t(lang, 'movedText', { text: truncate(c.new.text, 32) });
    case 'format': {
      const f = c.format ?? {};
      const parts: string[] = [];
      if (f.boldAdded) parts.push(t(lang, 'nowBold'));
      if (f.boldRemoved) parts.push(t(lang, 'noLongerBold'));
      if (f.italicAdded) parts.push(t(lang, 'nowItalic'));
      if (f.italicRemoved) parts.push(t(lang, 'noLongerItalic'));
      if (f.sizeFrom !== undefined) parts.push(t(lang, 'sizeChanged', { from: f.sizeFrom, to: f.sizeTo ?? '' }));
      if (f.fontFrom) parts.push(t(lang, 'fontChanged', { from: f.fontFrom, to: f.fontTo ?? '' }));
      const sep = lang === 'zh' ? '，' : ', ';
      if (c.places) {
        const head = t(lang, 'formatChanged');
        return lang === 'zh' ? `${head}：${parts.join(sep)}（${t(lang, 'inPlaces', { n: c.places })}）` : `${head}: ${parts.join(sep)} (${t(lang, 'inPlaces', { n: c.places })})`;
      }
      const what = truncate(c.new.text, 32);
      return lang === 'zh' ? `「${what}」${parts.join(sep)}` : `“${what}” ${parts.join(sep)}`;
    }
    case 'position': {
      const mm = Math.round((Math.abs(c.shift?.dx ?? 0) * 25.4) / 72);
      const dir = (c.shift?.dx ?? 0) > 0 ? 'right' : 'left';
      return t(lang, dir === 'right' ? 'movedRight' : 'movedLeft', { text: truncate(c.new.text, 32), mm });
    }
    case 'overflow': {
      const e = c.overflow?.edge ?? 'margin';
      const key = ({ right: 'overflowRight', left: 'overflowLeft', top: 'overflowTop', bottom: 'overflowBottom', margin: 'overflowMargin' } as const)[e];
      return t(lang, key);
    }
    case 'graphic':
      if (c.minor) return t(lang, 'minorShift', { n: SHIFT_PT });
      if (c.format) return t(lang, 'colorChanged');
      if (!c.old.rects.length) return t(lang, 'graphicAdded');
      if (!c.new.rects.length) return t(lang, 'graphicRemoved');
      return t(lang, 'graphicChanged');
  }
}

/** Short badge label for the change type. */
export function kindLabel(lang: Lang, c: Change): string {
  if (c.minor) return t(lang, 'kind_minor');
  if (c.numeric) return t(lang, 'kind_number');
  if (c.kind === 'graphic' && c.format?.appearanceChanged) return t(lang, 'kind_format');
  return t(lang, `kind_${c.kind}` as const);
}

/** Excerpt shown under the description: the changed text with context. */
export function excerpt(c: Change): { before: string; old: string; new: string; after: string } {
  return {
    before: truncate(c.contextBefore, 40),
    old: truncate(c.old.text, 160),
    new: truncate(c.new.text, 160),
    after: truncate(c.contextAfter, 40),
  };
}

export interface Notice {
  level: 'warn' | 'info';
  text: string;
  /** Lets the UI offer a "Show" action for filtered differences. */
  action?: 'furniture' | 'minor';
}

function pageRuns(lang: Lang, pages: number[]): string {
  // "p. 2, 5–7"
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(i === j ? String(sorted[i] + 1) : `${sorted[i] + 1}–${sorted[j] + 1}`);
    i = j;
  }
  return lang === 'zh' ? `第 ${parts.join('、')} 页` : `p. ${parts.join(', ')}`;
}

/** What was not compared or was filtered out — shown so nothing is hidden silently. */
export function notices(lang: Lang, r: CompareResult): Notice[] {
  const out: Notice[] = [];
  const side = (s: 'old' | 'new') => t(lang, s === 'old' ? 'oldVersion' : 'newVersion') + (lang === 'zh' ? '' : ' ');
  for (const s of ['old', 'new'] as const) {
    const cov = r.coverage?.[s];
    if (!cov) continue;
    if (cov.textless.length) out.push({ level: 'warn', text: t(lang, 'noticeTextless', { side: side(s), pages: pageRuns(lang, cov.textless) }) });
    if (cov.unreadable.length)
      out.push({ level: 'warn', text: t(lang, 'noticeUnreadable', { side: side(s), pages: pageRuns(lang, cov.unreadable.map((u) => u.page)), n: cov.unreadable.reduce((n, u) => n + u.count, 0) }) });
  }
  for (const u of r.coverage?.new.uncertain ?? []) out.push({ level: 'warn', text: t(lang, 'noticeUncertain', { pages: pageRuns(lang, [u.page]), pct: Math.round(u.matched * 100) + '%' }) });
  if (r.ignored?.furniture) out.push({ level: 'info', text: t(lang, 'noticeFurniture', { n: r.ignored.furniture }), action: 'furniture' });
  if (r.ignored?.renumbered) out.push({ level: 'info', text: t(lang, 'noticeRenumbered', { n: r.ignored.renumbered }), action: 'minor' });
  if (r.ignored?.minorShifts) out.push({ level: 'info', text: t(lang, 'noticeMinor', { n: r.ignored.minorShifts, pt: SHIFT_PT }), action: 'minor' });
  if (r.ignored?.caseOnly) out.push({ level: 'info', text: t(lang, 'noticeCase', { n: r.ignored.caseOnly }) });
  if (r.options.ignorePunctuation) out.push({ level: 'info', text: t(lang, 'noticePunct') });
  return out;
}

export function countLabel(lang: Lang, n: number): string {
  return n === 1 ? t(lang, 'oneChange') : t(lang, 'changesCount', { n });
}

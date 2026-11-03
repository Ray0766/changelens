import type { Change, Side } from './types.ts';
import { t, type Lang } from './i18n.ts';

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

/** One-line, plain-language description of a change. */
export function describeChange(lang: Lang, c: Change): string {
  const short = 48;
  const countKey = (words: 'addedWords' | 'deletedWords' | 'rewrote') =>
    c.cjk ? (({ addedWords: 'addedChars', deletedWords: 'deletedChars', rewrote: 'rewroteChars' }) as const)[words] : words;
  switch (c.kind) {
    case 'insert':
      if (c.wholeParagraphs) return c.wholeParagraphs === 1 ? t(lang, 'addedParagraph') : t(lang, 'addedParagraphs', { n: c.wholeParagraphs });
      if (Array.from(c.new.text).length <= short) return t(lang, 'addedText', { text: c.new.text });
      return t(lang, countKey('addedWords'), { n: c.size });
    case 'delete':
      if (c.wholeParagraphs) return c.wholeParagraphs === 1 ? t(lang, 'deletedParagraph') : t(lang, 'deletedParagraphs', { n: c.wholeParagraphs });
      if (Array.from(c.old.text).length <= short) return t(lang, 'deletedText', { text: c.old.text });
      return t(lang, countKey('deletedWords'), { n: c.size });
    case 'replace': {
      if (c.numeric) {
        const pct = percentChange(c.numeric.fromValue, c.numeric.toValue);
        const base = t(lang, 'numberChanged', { from: c.numeric.from, to: c.numeric.to });
        return pct ? (lang === 'zh' ? `${base}（${pct}）` : `${base} (${pct})`) : base;
      }
      if (Array.from(c.old.text).length <= 40 && Array.from(c.new.text).length <= 40)
        return t(lang, 'changedText', { from: c.old.text, to: c.new.text });
      return t(lang, countKey('rewrote'), { n: c.size });
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
      const what = truncate(c.new.text, 32);
      const sep = lang === 'zh' ? '，' : ', ';
      return lang === 'zh' ? `「${what}」${parts.join(sep)}` : `“${what}” ${parts.join(sep)}`;
    }
    case 'overflow': {
      const e = c.overflow?.edge ?? 'margin';
      const key = ({ right: 'overflowRight', left: 'overflowLeft', top: 'overflowTop', bottom: 'overflowBottom', margin: 'overflowMargin' } as const)[e];
      return t(lang, key);
    }
    case 'graphic':
      if (c.format) return t(lang, 'colorChanged');
      if (!c.old.rects.length) return t(lang, 'graphicAdded');
      if (!c.new.rects.length) return t(lang, 'graphicRemoved');
      return t(lang, 'graphicChanged');
  }
}

/** Short badge label for the change type. */
export function kindLabel(lang: Lang, c: Change): string {
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

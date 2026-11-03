import type { Change, CompareResult } from '../core/types.ts';
import { t, type Lang } from '../core/i18n.ts';
import { describeChange, kindLabel, locationLabel, notices, pairLabel } from '../core/describe.ts';
import { excerptHtml, pageMapSvg, type Review } from '../core/report.ts';
import { countChanges } from '../core/pipeline.ts';
import { h, icon, clear } from './dom.ts';

export type Filter = 'all' | 'text' | 'numbers' | 'visual';

export function applyFilter(changes: Change[], f: Filter): Change[] {
  if (f === 'text') return changes.filter((c) => c.category === 'text');
  if (f === 'numbers') return changes.filter((c) => c.numeric);
  if (f === 'visual') return changes.filter((c) => c.category === 'visual');
  return changes;
}

function badgeClass(c: Change): string {
  if (c.numeric) return 'b-num';
  if (c.category === 'visual') return 'b-vis';
  if (c.kind === 'move') return 'b-mv';
  if (c.kind === 'insert') return 'b-ins';
  if (c.kind === 'delete') return 'b-del';
  return 'b-text';
}

export interface SidebarCallbacks {
  onSelect(id: string): void;
  onFilter(f: Filter): void;
  onReview(id: string, review: Review): void;
  onPage(side: 'old' | 'new', page: number): void;
  /** "Show" on a notice about filtered differences. */
  onNotice(action: 'furniture' | 'minor'): void;
  /** Pair two pages by hand (0-based), or remove such a pair. */
  onPair(oldPage: number, newPage: number): void;
  onUnpair(oldPage: number, newPage: number): void;
}

export class Sidebar {
  readonly root: HTMLElement;
  private list: HTMLOListElement;
  private tabs: HTMLDivElement;
  private progress: HTMLDivElement;
  private summary: HTMLDivElement;
  private mapDetails: HTMLDetailsElement | null = null;
  private selected: string | null = null;
  filter: Filter = 'all';
  /** Also list minor layout shifts (hidden by default). */
  showMinor = false;
  /** Page-pairing form is open. */
  private pairing = false;
  private pairOld: number | null = null;
  private lang: Lang;
  private result: CompareResult;
  private reviews: Record<string, Review>;
  private cb: SidebarCallbacks;

  constructor(lang: Lang, result: CompareResult, reviews: Record<string, Review>, cb: SidebarCallbacks) {
    this.lang = lang;
    this.result = result;
    this.reviews = reviews;
    this.cb = cb;
    this.summary = h('div', { class: 'summary' });
    this.tabs = h('div', { class: 'tabs', role: 'tablist' });
    this.list = h('ol', { class: 'changes', 'aria-label': t(lang, 'details') });
    this.progress = h('div', { class: 'progress-foot' });
    this.root = h('aside', { class: 'sidebar' }, this.summary, this.tabs, this.list, this.progress);
    this.list.addEventListener('click', (e) => this.onListClick(e));
    this.list.addEventListener('keydown', (e) => {
      const el = e.target as HTMLElement;
      if ((e.key === 'Enter' || e.key === ' ') && el.classList.contains('item')) {
        e.preventDefault();
        this.cb.onSelect(el.dataset.id!);
      }
    });
    this.list.addEventListener('input', (e) => {
      const ta = e.target as HTMLTextAreaElement;
      const id = ta.closest<HTMLElement>('.item')?.dataset.id;
      if (!id) return;
      this.reviews[id] = { ...this.reviews[id], note: ta.value };
      this.cb.onReview(id, this.reviews[id]);
    });
    this.render();
  }

  update(result: CompareResult): void {
    this.result = result;
    this.render();
  }

  private render(): void {
    const lang = this.lang;
    const counts = countChanges(this.result.changes);
    clear(this.summary);
    const { oldDoc, newDoc, stats } = this.result;
    const big = h('div', { class: 'summary-head' },
      h('div', { class: 'summary-count' }, String(counts.total)),
      h('div', {},
        h('div', { class: 'summary-title' }, counts.total === 1 ? t(lang, 'totalChange1') : counts.total ? t(lang, 'totalChanges') : t(lang, 'noChanges')),
        h('div', { class: 'summary-sub' }, `${t(lang, 'pagesLine', { old: oldDoc.pages.length, new: newDoc.pages.length })} · ${t(lang, 'similarity', { pct: (stats.similarity * 100).toFixed(1) + '%' })}`),
      ),
    );
    const map = h('div', { class: 'minimap', html: pageMapSvg(this.result, lang) });
    const pairForm = this.pairing ? this.pairFormEl() : null;
    map.addEventListener('click', (e) => {
      const rect = (e.target as Element).closest<SVGRectElement>('rect[data-side]');
      if (!rect) return;
      const side = rect.dataset.side as 'old' | 'new';
      const page = Number(rect.dataset.page);
      if (!this.pairing) return void this.cb.onPage(side, page);
      // Pairing mode: old page first, then the new page.
      const selOld = pairForm?.querySelector<HTMLSelectElement>('select[name=old]');
      const selNew = pairForm?.querySelector<HTMLSelectElement>('select[name=new]');
      if (side === 'old') {
        this.pairOld = page;
        if (selOld) selOld.value = String(page);
        map.querySelectorAll('rect.sel').forEach((r) => r.classList.remove('sel'));
        rect.classList.add('sel');
      } else if (this.pairOld !== null) {
        this.finishPair(this.pairOld, page);
      } else if (selNew) {
        selNew.value = String(page);
      }
    });
    const manual = this.result.pageLinks.filter((l) => l.manual);
    const pairs = manual.length
      ? h('ul', { class: 'pairs' }, manual.map((l) =>
          h('li', {}, h('span', { class: 'pair-dash', 'aria-hidden': 'true' }), pairLabel(lang, l.oldPage, l.newPage),
            h('button', { class: 'btn link', title: t(lang, 'removePair'), 'aria-label': `${t(lang, 'removePair')}: ${pairLabel(lang, l.oldPage, l.newPage)}`, onclick: () => this.cb.onUnpair(l.oldPage, l.newPage) }, '✕'))))
      : null;
    const pairButton = this.pairing ? null : h('button', { class: 'btn link pair-btn', onclick: () => this.openPairing() }, t(lang, 'pairPages'));
    this.mapDetails = h('details', { class: 'mapdetails', open: this.pairing || manual.length > 0 || oldDoc.pages.length !== newDoc.pages.length },
      h('summary', {}, t(lang, 'pageMap')), map, ...(pairForm ? [pairForm] : []), ...(pairs ? [pairs] : []), ...(pairButton ? [pairButton] : []));
    // State what was filtered out or not covered, with a way to show it.
    const notes = notices(lang, this.result);
    const noteList = notes.length
      ? h('ul', { class: 'notices' }, notes.map((n) =>
          h('li', { class: `notice ${n.level}` },
            n.level === 'warn' ? icon('alert', 15) : icon('layers', 15),
            h('span', {}, n.text),
            n.action === 'pair'
              ? h('button', { class: 'btn link', onclick: () => this.openPairing() }, t(lang, 'pair'))
              : n.action ? h('button', { class: 'btn link', onclick: () => this.cb.onNotice(n.action as 'furniture' | 'minor') }, n.action === 'minor' && this.showMinor ? t(lang, 'hide') : t(lang, 'show')) : null,
          )))
      : null;
    this.summary.append(big, ...(noteList ? [noteList] : []), this.mapDetails);

    clear(this.tabs);
    const tabs: [Filter, string, number][] = [
      ['all', t(lang, 'all'), counts.total],
      ['text', t(lang, 'text'), counts.text],
      ['numbers', t(lang, 'numbers'), counts.numbers],
      ['visual', t(lang, 'visual'), counts.visual],
    ];
    for (const [f, label, n] of tabs) {
      this.tabs.append(
        h('button', {
          class: `tab${this.filter === f ? ' on' : ''}`,
          role: 'tab',
          'aria-selected': this.filter === f ? 'true' : 'false',
          onclick: () => {
            this.filter = f;
            this.cb.onFilter(f);
            this.render();
          },
        }, label, h('span', { class: 'tab-n' }, String(n))),
      );
    }
    this.renderList();
  }

  private openPairing(): void {
    this.pairing = true;
    this.pairOld = null;
    this.render();
    this.mapDetails?.querySelector<HTMLSelectElement>('select[name=old]')?.focus();
  }

  private finishPair(oldPage: number, newPage: number): void {
    this.pairing = false;
    this.pairOld = null;
    this.cb.onPair(oldPage, newPage);
  }

  /** Keyboard-accessible pairing form; clicks in the page map fill it in. */
  private pairFormEl(): HTMLElement {
    const lang = this.lang;
    const options = (n: number) => Array.from({ length: n }, (_, i) => h('option', { value: i }, String(i + 1)));
    const selOld = h('select', { name: 'old', 'aria-label': t(lang, 'oldVersion') }, options(this.result.oldDoc.pages.length));
    const selNew = h('select', { name: 'new', 'aria-label': t(lang, 'newVersion') }, options(this.result.newDoc.pages.length));
    // Preselect the first page that needs pairing.
    const textlessOld = this.result.coverage.old.textless[0];
    const unsureNew = this.result.coverage.new.textless[0] ?? this.result.coverage.new.uncertain?.[0]?.page;
    if (textlessOld !== undefined) selOld.value = String(textlessOld);
    if (unsureNew !== undefined) selNew.value = String(unsureNew);
    return h('div', { class: 'pairform' },
      h('p', { class: 'pair-hint' }, `${t(lang, 'pairHintOld')} ${t(lang, 'pairHintNew')}`),
      h('label', {}, t(lang, 'oldVersion'), ' ', selOld),
      h('span', { 'aria-hidden': 'true' }, '↔'),
      h('label', {}, t(lang, 'newVersion'), ' ', selNew),
      h('button', { class: 'btn primary sm', onclick: () => this.finishPair(Number(selOld.value), Number(selNew.value)) }, t(lang, 'pair')),
      h('button', { class: 'btn link', onclick: () => { this.pairing = false; this.render(); } }, t(lang, 'pairCancel')),
    );
  }

  private renderList(): void {
    const lang = this.lang;
    clear(this.list);
    const items = this.visible();
    if (items.length === 0) {
      this.list.append(
        h('li', { class: 'empty' }, icon('check', 32), h('b', {}, t(lang, 'noChanges')), h('span', {}, t(lang, 'noChangesHint'))),
      );
    }
    items.forEach((c) => this.list.append(this.item(c)));
    this.renderProgress();
  }

  private item(c: Change): HTMLLIElement {
    const lang = this.lang;
    const rv = this.reviews[c.id] ?? {};
    const ex = excerptHtml(c);
    const li = h(
      'li',
      { class: `item${c.id === this.selected ? ' on' : ''}${rv.status ? ' st-' + rv.status : ''}`, 'data-id': c.id, tabindex: 0 },
      h('div', { class: 'item-head' },
        h('span', { class: `badge ${badgeClass(c)}` }, kindLabel(lang, c)),
        h('span', { class: 'loc' }, locationLabel(lang, c)),
        h('span', { class: 'item-actions' },
          h('button', { class: `rv ok${rv.status === 'ok' ? ' on' : ''}`, 'data-act': 'ok', title: t(lang, 'reviewOk'), 'aria-label': t(lang, 'reviewOk'), 'aria-pressed': rv.status === 'ok' ? 'true' : 'false' }, icon('check', 14)),
          h('button', { class: `rv q${rv.status === 'question' ? ' on' : ''}`, 'data-act': 'question', title: t(lang, 'reviewQuestion'), 'aria-label': t(lang, 'reviewQuestion'), 'aria-pressed': rv.status === 'question' ? 'true' : 'false' }, icon('alert', 14)),
          h('button', { class: `rv nt${rv.note ? ' on' : ''}`, 'data-act': 'note', title: t(lang, 'addNote'), 'aria-label': t(lang, 'addNote') }, icon('note', 14)),
        ),
      ),
      h('div', { class: 'desc' }, describeChange(lang, c)),
      ex ? h('div', { class: 'ex', html: ex }) : null,
      rv.note !== undefined && rv.note !== '' ? h('textarea', { class: 'note', rows: 2, placeholder: t(lang, 'addNote') }, rv.note) : null,
    );
    return li;
  }

  private onListClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const li = target.closest<HTMLLIElement>('.item');
    if (!li) return;
    const id = li.dataset.id!;
    const act = target.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (target.closest('textarea')) return;
    if (act === 'ok' || act === 'question') {
      const cur = this.reviews[id] ?? {};
      const status = cur.status === act ? undefined : act;
      this.reviews[id] = { ...cur, status };
      this.cb.onReview(id, this.reviews[id]);
      li.replaceWith(this.item([...this.result.changes, ...this.result.minor].find((c) => c.id === id)!));
      this.renderProgress();
      return;
    }
    if (act === 'note') {
      let ta = li.querySelector('textarea');
      if (!ta) {
        ta = h('textarea', { class: 'note', rows: 2, placeholder: t(this.lang, 'addNote') });
        li.append(ta);
      }
      ta.focus();
      return;
    }
    this.cb.onSelect(id);
  }

  private renderProgress(): void {
    const all = this.result.changes;
    const done = all.filter((c) => this.reviews[c.id]?.status).length;
    clear(this.progress);
    if (!all.length) return;
    this.progress.append(
      h('div', { class: 'bar' }, h('span', { style: { width: `${(done / all.length) * 100}%` } })),
      h('span', {}, t(this.lang, 'reviewed', { n: done, total: all.length })),
    );
  }

  select(id: string | null): void {
    this.selected = id;
    for (const li of this.list.querySelectorAll<HTMLElement>('.item')) {
      const on = li.dataset.id === id;
      li.classList.toggle('on', on);
      if (on) li.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  }

  /** Changes in the list: the current filter, plus minor shifts when shown. */
  visible(): Change[] {
    const all = this.showMinor ? [...this.result.changes, ...this.result.minor].sort((a, b) => a.order - b.order) : this.result.changes;
    return applyFilter(all, this.filter);
  }

  visibleIds(): string[] {
    return this.visible().map((c) => c.id);
  }
}

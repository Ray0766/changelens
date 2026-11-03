import type { RenderTask } from 'pdfjs-dist';
import type { Change, CompareResult, DocModel } from '../core/types.ts';
import { focusRect } from '../core/pipeline.ts';
import { describeChange } from '../core/describe.ts';
import { t, type Lang } from '../core/i18n.ts';
import { h, clear } from './dom.ts';
import { renderInto, type PDFDocumentProxy } from './pdf.ts';

type Side = 'old' | 'new';
const GAP = 16;
const behavior = (): ScrollBehavior => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
const PAD = 16;

interface PageView {
  el: HTMLDivElement;
  canvas: HTMLCanvasElement;
  overlay: HTMLDivElement;
  rendered: number;
  near: boolean;
  task?: RenderTask;
  busy?: Promise<void>;
}

function hlClass(c: Change, side: Side): string {
  if (c.category === 'visual') return 'vis';
  if (c.kind === 'move') return 'mv';
  return side === 'old' ? 'del' : 'ins';
}

class Pane {
  readonly root: HTMLElement;
  readonly scroller: HTMLDivElement;
  readonly inner: HTMLDivElement;
  readonly pages: PageView[] = [];
  tops: number[] = [];
  zoom = 1;
  private observer: IntersectionObserver;
  private queue: number[] = [];
  private working = false;
  readonly side: Side;
  readonly doc: DocModel;
  readonly pdf: PDFDocumentProxy;

  constructor(side: Side, doc: DocModel, pdf: PDFDocumentProxy, title: string, subtitle: string) {
    this.side = side;
    this.doc = doc;
    this.pdf = pdf;
    this.inner = h('div', { class: 'pane-pages' });
    this.scroller = h('div', { class: 'pane-scroll', tabindex: 0, 'aria-label': title }, this.inner);
    this.root = h(
      'section',
      { class: `pane pane-${side}` },
      h('div', { class: 'pane-head' }, h('span', { class: `pane-dot ${side}` }), h('b', {}, title), h('span', { class: 'pane-sub' }, subtitle)),
      this.scroller,
    );
    this.observer = new IntersectionObserver((entries) => this.onIntersect(entries), {
      root: this.scroller,
      rootMargin: '120% 0px 120% 0px',
    });
    doc.pages.forEach((_, i) => {
      const canvas = h('canvas', { class: 'page-canvas' });
      const overlay = h('div', { class: 'page-overlay' });
      const el = h('div', { class: 'page', 'data-page': i }, canvas, overlay, h('span', { class: 'page-num' }, `${i + 1} / ${doc.pages.length}`));
      this.inner.append(el);
      this.pages.push({ el, canvas, overlay, rendered: 0, near: false });
      this.observer.observe(el);
    });
  }

  get maxWidth(): number {
    return Math.max(...this.doc.pages.map((p) => p.width));
  }

  setZoom(zoom: number): void {
    this.zoom = zoom;
    let y = PAD;
    this.tops = [];
    this.doc.pages.forEach((p, i) => {
      const el = this.pages[i].el;
      el.style.width = `${p.width * zoom}px`;
      el.style.height = `${p.height * zoom}px`;
      this.tops.push(y);
      y += p.height * zoom + GAP;
    });
    this.inner.style.padding = `${PAD}px`;
    this.inner.style.gap = `${GAP}px`;
    this.schedule();
  }

  /** Vertical pixel position of a point on a page (inside the scroller). */
  docY(page: number, y: number): number {
    return (this.tops[page] ?? 0) + y * this.zoom;
  }

  docX(page: number, x: number): number {
    const el = this.pages[page]?.el;
    return (el ? el.offsetLeft : PAD) + x * this.zoom;
  }

  private onIntersect(entries: IntersectionObserverEntry[]): void {
    for (const e of entries) {
      const i = Number((e.target as HTMLElement).dataset.page);
      const pv = this.pages[i];
      pv.near = e.isIntersecting;
      if (!pv.near && pv.rendered) {
        // Free memory for pages far away.
        pv.task?.cancel();
        pv.canvas.width = pv.canvas.height = 0;
        pv.rendered = 0;
      }
    }
    this.schedule();
  }

  schedule(): void {
    const view = this.scroller.scrollTop + this.scroller.clientHeight / 2;
    this.queue = this.pages
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.near && p.rendered !== this.zoom)
      .sort((a, b) => Math.abs(this.tops[a.i] - view) - Math.abs(this.tops[b.i] - view))
      .map(({ i }) => i);
    void this.work();
  }

  private async work(): Promise<void> {
    if (this.working) return;
    this.working = true;
    try {
      while (this.queue.length) {
        const i = this.queue.shift()!;
        const pv = this.pages[i];
        if (!pv.near || pv.rendered === this.zoom) continue;
        const zoom = this.zoom;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        // Render off-screen first so the old bitmap stays visible meanwhile.
        const tmp = document.createElement('canvas');
        try {
          await renderInto(this.pdf, i, zoom * dpr, tmp, (task) => (pv.task = task));
          if (zoom !== this.zoom || !pv.near) continue;
          pv.canvas.width = tmp.width;
          pv.canvas.height = tmp.height;
          pv.canvas.getContext('2d')!.drawImage(tmp, 0, 0);
          pv.rendered = zoom;
        } catch {
          /* cancelled */
        } finally {
          tmp.width = tmp.height = 0;
        }
      }
    } finally {
      this.working = false;
    }
  }

  setHighlights(changes: Change[], lang: Lang): void {
    for (const pv of this.pages) clear(pv.overlay);
    for (const c of changes) {
      const s = c[this.side];
      const cls = hlClass(c, this.side);
      const title = describeChange(lang, c);
      for (const r of s.rects) {
        const pg = this.doc.pages[r.page];
        const pv = this.pages[r.page];
        if (!pv) continue;
        // Change bar in the page margin (as in printed redlines): visible
        // even when the highlight itself is tiny at the current zoom.
        pv.overlay.append(
          h('div', {
            class: `cbar ${cls}`,
            'data-id': c.id,
            'data-tip': title,
            style: { top: `${(r.rect.y / pg.height) * 100}%`, height: `${(Math.max(r.rect.h, 6) / pg.height) * 100}%` },
          }),
        );
        const pad = 1.5;
        pv.overlay.append(
          h('div', {
            class: `hl ${cls}${c.numeric ? ' num' : ''}`,
            'data-id': c.id,
            'data-tip': title,
            style: {
              left: `${((r.rect.x - pad) / pg.width) * 100}%`,
              top: `${((r.rect.y - pad) / pg.height) * 100}%`,
              width: `${((r.rect.w + 2 * pad) / pg.width) * 100}%`,
              height: `${((r.rect.h + 2 * pad) / pg.height) * 100}%`,
            },
          }),
        );
      }
      if (s.rects.length === 0 && s.caret) {
        const pg = this.doc.pages[s.caret.page];
        const pv = this.pages[s.caret.page];
        if (!pv) continue;
        pv.overlay.append(
          h('div', {
            class: `caret ${this.side === 'old' ? 'ins' : 'del'}${c.category === 'visual' ? ' vis' : ''}`,
            'data-id': c.id,
            'data-tip': `${title} — ${t(lang, this.side === 'old' ? 'insertedHere' : 'wasHere')}`,
            style: {
              left: `${(s.caret.x / pg.width) * 100}%`,
              top: `${(s.caret.y / pg.height) * 100}%`,
              height: `${(s.caret.h / pg.height) * 100}%`,
            },
          }),
        );
      }
    }
  }

  markActive(id: string | null, pulse: boolean): void {
    for (const el of this.inner.querySelectorAll<HTMLElement>('.hl, .caret, .cbar')) {
      const on = el.dataset.id === id;
      el.classList.toggle('active', on);
      if (on && pulse) {
        el.classList.remove('pulse');
        void el.offsetWidth;
        el.classList.add('pulse');
      }
    }
  }

  destroy(): void {
    this.observer.disconnect();
    for (const pv of this.pages) {
      pv.task?.cancel();
      pv.canvas.width = pv.canvas.height = 0;
    }
  }
}

export interface ViewerOptions {
  lang: Lang;
  onSelect: (id: string) => void;
}

/** Two synchronised page panes with change highlights. */
export class Viewer {
  readonly root: HTMLElement;
  private panes: Record<Side, Pane>;
  private anchorsOld: number[] = [];
  private anchorsNew: number[] = [];
  private active: Side | null = null;
  private fitMode = true;
  private zoomed = false;
  sync = true;
  private selected: string | null = null;
  private changes: Change[] = [];
  private tip: HTMLDivElement;
  private resizeObs: ResizeObserver;
  show: Side = 'new';
  onZoom?: (zoom: number) => void;
  private result: CompareResult;
  private opts: ViewerOptions;

  constructor(
    result: CompareResult,
    pdfs: { old: PDFDocumentProxy; new: PDFDocumentProxy },
    names: { old: string; new: string },
    opts: ViewerOptions,
  ) {
    this.result = result;
    this.opts = opts;
    const lang = opts.lang;
    const pages = (n: number) => (lang === 'zh' ? `${n} 页` : `${n} pages`);
    this.panes = {
      old: new Pane('old', result.oldDoc, pdfs.old, t(lang, 'oldVersion'), `${names.old} · ${pages(result.oldDoc.pages.length)}`),
      new: new Pane('new', result.newDoc, pdfs.new, t(lang, 'newVersion'), `${names.new} · ${pages(result.newDoc.pages.length)}`),
    };
    this.tip = h('div', { class: 'tip', role: 'tooltip' });
    this.root = h('div', { class: 'panes', 'data-show': this.show }, this.panes.old.root, this.panes.new.root, this.tip);

    for (const side of ['old', 'new'] as const) {
      const pane = this.panes[side];
      const sc = pane.scroller;
      const claim = () => (this.active = side);
      sc.addEventListener('wheel', claim, { passive: true });
      sc.addEventListener('pointerdown', claim);
      sc.addEventListener('touchstart', claim, { passive: true });
      sc.addEventListener('keydown', claim);
      sc.addEventListener('scroll', () => {
        pane.schedule();
        if (this.sync && this.active === side) this.follow(side);
      });
      sc.addEventListener('click', (e) => {
        const el = (e.target as HTMLElement).closest<HTMLElement>('.hl, .caret, .cbar');
        if (el?.dataset.id) this.opts.onSelect(el.dataset.id);
      });
      sc.addEventListener('mouseover', (e) => {
        const el = (e.target as HTMLElement).closest<HTMLElement>('.hl, .caret, .cbar');
        if (!el?.dataset.tip) return void this.hideTip();
        this.tip.textContent = el.dataset.tip;
        const r = el.getBoundingClientRect();
        const host = this.root.getBoundingClientRect();
        this.tip.style.left = `${Math.max(8, Math.min(r.left - host.left, host.width - 280))}px`;
        this.tip.style.top = `${r.bottom - host.top + 6}px`;
        this.tip.classList.add('show');
      });
      sc.addEventListener('mouseleave', () => this.hideTip());
    }
    this.resizeObs = new ResizeObserver(() => {
      if (this.fitMode) this.fit();
    });
    this.resizeObs.observe(this.root);
  }

  private hideTip(): void {
    this.tip.classList.remove('show');
  }

  get zoom(): number {
    return this.panes.old.zoom;
  }

  private setZoom(z: number): void {
    const zoom = Math.max(0.25, Math.min(5, z));
    const pane = this.panes[this.show];
    const first = !this.zoomed;
    // Keep the point at the top third of the view in place while zooming.
    const focus = pane.scroller.clientHeight / 3;
    const before = (pane.scroller.scrollTop + focus) / (pane.zoom || 1);
    this.panes.old.setZoom(zoom);
    this.panes.new.setZoom(zoom);
    this.zoomed = true;
    this.rebuildAnchors();
    if (!first) {
      pane.scroller.scrollTop = before * zoom - focus;
      this.follow(this.show);
    }
    this.onZoom?.(zoom);
  }

  fit(): void {
    this.fitMode = true;
    const visible = this.panes[this.show].scroller.clientWidth || this.panes.new.scroller.clientWidth;
    const w = Math.max(this.panes.old.maxWidth, this.panes.new.maxWidth);
    if (visible > 0) this.setZoom((visible - 2 * PAD - 4) / w);
  }

  zoomBy(f: number): void {
    this.fitMode = false;
    this.setZoom(this.zoom * f);
  }

  setShow(side: Side): void {
    const from = this.show;
    this.show = side;
    this.root.dataset.show = side;
    // Bring the newly shown pane to the matching position.
    this.follow(from);
    this.panes[side].schedule();
  }

  private rebuildAnchors(): void {
    const { old: po, new: pn } = this.panes;
    const ao: number[] = [];
    const an: number[] = [];
    for (const a of this.result.anchors) {
      ao.push(po.docY(a.oldPage, a.oldY));
      an.push(pn.docY(a.newPage, a.newY));
    }
    this.anchorsOld = ao;
    this.anchorsNew = an;
  }

  /** Map a vertical position from one pane to the other. */
  mapY(from: Side, y: number): number {
    const src = from === 'old' ? this.anchorsOld : this.anchorsNew;
    const dst = from === 'old' ? this.anchorsNew : this.anchorsOld;
    if (src.length === 0) {
      const a = this.panes[from].inner.scrollHeight || 1;
      const b = this.panes[from === 'old' ? 'new' : 'old'].inner.scrollHeight;
      return (y / a) * b;
    }
    if (y <= src[0]) return dst[0] + (y - src[0]);
    const last = src.length - 1;
    if (y >= src[last]) return dst[last] + (y - src[last]);
    let lo = 0;
    let hi = last;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (src[mid] <= y) lo = mid;
      else hi = mid;
    }
    const span = src[hi] - src[lo];
    const f = span > 0 ? (y - src[lo]) / span : 0;
    return dst[lo] + f * (dst[hi] - dst[lo]);
  }

  private follow(from: Side): void {
    const to: Side = from === 'old' ? 'new' : 'old';
    const a = this.panes[from].scroller;
    const b = this.panes[to].scroller;
    const focus = a.clientHeight / 3;
    const y = this.mapY(from, a.scrollTop + focus);
    b.scrollTop = y - (b.clientHeight || a.clientHeight) / 3;
    b.scrollLeft = a.scrollLeft;
  }

  setChanges(changes: Change[]): void {
    this.changes = changes;
    this.panes.old.setHighlights(changes, this.opts.lang);
    this.panes.new.setHighlights(changes, this.opts.lang);
    this.markActive(false);
  }

  private markActive(pulse: boolean): void {
    this.panes.old.markActive(this.selected, pulse);
    this.panes.new.markActive(this.selected, pulse);
  }

  /** Select a change and scroll both panes to it. */
  select(id: string | null, scroll = true): void {
    this.selected = id;
    this.markActive(true);
    const c = this.changes.find((x) => x.id === id) ?? this.result.changes.find((x) => x.id === id);
    if (!c || !scroll) return;
    this.active = null;
    const targets: Partial<Record<Side, { y: number; x: number }>> = {};
    for (const side of ['old', 'new'] as const) {
      const f = focusRect(c, side);
      if (!f) continue;
      const pane = this.panes[side];
      targets[side] = { y: pane.docY(f.page, f.rect.y + f.rect.h / 2), x: pane.docX(f.page, f.rect.x + f.rect.w / 2) };
    }
    if (!targets.old && targets.new) targets.old = { y: this.mapY('new', targets.new.y), x: targets.new.x };
    if (!targets.new && targets.old) targets.new = { y: this.mapY('old', targets.old.y), x: targets.old.x };
    for (const side of ['old', 'new'] as const) {
      const tg = targets[side];
      if (!tg) continue;
      const sc = this.panes[side].scroller;
      sc.scrollTo({
        top: Math.max(0, tg.y - sc.clientHeight * 0.35),
        left: Math.max(0, tg.x - sc.clientWidth / 2),
        behavior: behavior(),
      });
    }
  }

  scrollToPage(side: Side, page: number): void {
    this.active = null;
    const pane = this.panes[side];
    const top = pane.docY(page, 0) - 8;
    pane.scroller.scrollTo({ top, behavior: behavior() });
    const other: Side = side === 'old' ? 'new' : 'old';
    this.panes[other].scroller.scrollTo({ top: this.mapY(side, top + pane.scroller.clientHeight / 3) - pane.scroller.clientHeight / 3, behavior: behavior() });
    if (window.matchMedia('(max-width: 900px)').matches && this.show !== side) this.setShow(side);
  }

  destroy(): void {
    this.resizeObs.disconnect();
    this.panes.old.destroy();
    this.panes.new.destroy();
  }
}

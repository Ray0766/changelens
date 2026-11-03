import type { Change, CompareResult, DiffOptions, DocModel } from '../core/types.ts';
import { defaultOptions } from '../core/types.ts';
import { buildDocModel } from '../core/tokenize.ts';
import { compareDocs } from '../core/compare.ts';
import { addVisualChanges } from '../core/pipeline.ts';
import { detectLang, explainOpenError, t, type Lang, type MessageKey } from '../core/i18n.ts';
import type { Review } from '../core/report.ts';
import { extractText } from '../pdf/extract.ts';
import { h, icon, clear, focusKeyOf, restoreFocus, narrowQuery, LOGO } from './dom.ts';
import { openPdf, renderRaster, type PDFDocumentProxy } from './pdf.ts';
import { Viewer } from './viewer.ts';
import { Sidebar, type Filter } from './sidebar.ts';
import { exportJson, exportReport, ExportPageError } from './export.ts';
import { fileIdentity, reuseLoaded } from './filekey.ts';

const REPO = 'https://github.com/Ray0766/changelens';

interface Picked {
  name: string;
  bytes: Uint8Array;
  lastModified: number;
}

interface Loaded {
  name: string;
  pdf: PDFDocumentProxy;
  model: DocModel;
  /** Full-content key (see filekey.ts): cache, reviews and page pairs. */
  key: string;
  sha256: string;
}

type Options = DiffOptions & { graphics: boolean };

/** What the shown result was computed with (settings may change later). */
interface RunInputs {
  options: Options;
  pairs: [number, number][];
}

const cancelled = () => new DOMException('Comparison cancelled', 'AbortError');

const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* storage unavailable */
    }
  },
};

/** Stable identity of a change across re-runs with different settings. */
function signature(c: Change): string {
  const first = (s: Change['old']) => s.start ?? (s.rects[0] ? `${s.rects[0].page}:${Math.round(s.rects[0].rect.x)}:${Math.round(s.rects[0].rect.y)}` : '');
  return `${c.kind}|${first(c.old)}|${first(c.new)}`;
}

export class App {
  private lang: Lang;
  private picked: { old?: Picked; new?: Picked } = {};
  private loaded: { old?: Loaded; new?: Loaded } = {};
  private result?: CompareResult;
  private viewer?: Viewer;
  private sidebar?: Sidebar;
  private filter: Filter = 'all';
  private showMinor = false;
  private listHidden = false;
  private selected: string | null = null;
  private reviewsBySig: Record<string, Review> = {};
  private options: Options;
  /** Inputs of the shown result; `options` is what the next run will use. */
  private shown?: RunInputs;
  private busy = false;
  /** run() was called during a run: run once more with the latest settings. */
  private rerun = false;
  private root: HTMLElement;
  /** Aborts document-level listeners of the current results view. */
  private viewAbort?: AbortController;
  /** User's page-map open/closed choice for the current comparison. */
  private mapOpen?: boolean;
  private settingsOpen = false;
  /** Report exports in progress, by result (progress text for the button). */
  private exporting = new Map<CompareResult, { job: Promise<void>; progress: string }>();

  constructor(root: HTMLElement) {
    this.root = root;
    const saved = store.get('changelens.lang');
    this.lang = saved === 'zh' || saved === 'en' ? saved : detectLang(navigator.languages ?? navigator.language);
    let opts: Partial<Options> = {};
    try {
      opts = JSON.parse(store.get('changelens.options') ?? '{}');
    } catch {
      /* ignore */
    }
    this.options = { ...defaultOptions, graphics: true, ...opts };
    document.addEventListener('keydown', (e) => this.onKey(e));
    this.showLanding();
  }

  private tr(key: MessageKey, params?: Record<string, string | number>): string {
    return t(this.lang, key, params);
  }

  private setLang(lang: Lang): void {
    const focus = focusKeyOf(this.root);
    this.lang = lang;
    store.set('changelens.lang', lang);
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    if (this.result) this.showResults();
    else this.showLanding();
    restoreFocus(this.root, focus);
  }

  private langToggle(): HTMLElement {
    return h('button', {
      class: 'btn ghost',
      'data-fk': 'lang',
      title: this.tr('language'),
      onclick: () => this.setLang(this.lang === 'zh' ? 'en' : 'zh'),
    }, icon('globe'), h('span', {}, this.lang === 'zh' ? 'English' : '中文'));
  }

  // ------------------------------------------------------------ landing ---

  private showLanding(): void {
    this.viewer?.destroy();
    this.viewer = undefined;
    document.documentElement.lang = this.lang === 'zh' ? 'zh-CN' : 'en';
    document.title = 'ChangeLens';
    clear(this.root);
    const zone = (side: 'old' | 'new') => {
      const input = h('input', { type: 'file', accept: 'application/pdf,.pdf', class: 'sr-only', id: `file-${side}` });
      const picked = this.picked[side];
      const el = h(
        'label',
        { class: `drop${picked ? ' has' : ''}`, for: `file-${side}`, 'data-side': side },
        input,
        h('span', { class: `drop-tag ${side}` }, this.tr(side === 'old' ? 'before' : 'after')),
        icon(picked ? 'file' : 'upload', 30),
        h('span', { class: 'drop-name' }, picked ? picked.name : this.tr('dropHint')),
        picked ? h('span', { class: 'drop-meta' }, `${(picked.bytes.length / 1024).toFixed(0)} KB`) : null,
      );
      input.addEventListener('change', async () => {
        const files = [...(input.files ?? [])];
        if (files.length) await this.pickFiles(files, side);
      });
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        el.classList.add('over');
      });
      el.addEventListener('dragleave', () => el.classList.remove('over'));
      el.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.remove('over');
        const files = [...(e.dataTransfer?.files ?? [])];
        if (files.length) await this.pickFiles(files, side);
      });
      return el;
    };
    const ready = !!(this.picked.old && this.picked.new);
    // One real result from the bundled (synthetic) demo instead of feature
    // cards: it shows what you get and why the other pages are not flagged.
    const zh = this.lang === 'zh';
    const example = h('section', { class: 'example', 'aria-label': zh ? '结果示例' : 'Example result' },
      h('div', { class: 'example-label' }, zh ? '示例结果（来自内置的虚构报价单）' : 'Example result (from the bundled, synthetic proposal)'),
      h('div', { class: 'example-item' },
        h('div', { class: 'item-head' }, h('span', { class: 'badge b-num' }, this.tr('kind_number')), h('span', { class: 'loc' }, zh ? '第 3 页 → 第 4 页' : 'p. 3 → p. 4')),
        h('div', { class: 'desc' }, zh ? '数字变化：8,000 → 9,500（+19%）' : 'Number changed: 8,000 → 9,500 (+19%)'),
        h('div', { class: 'ex', html: zh ? '<span class="ctx">设计与原型 线框图、视觉设计、可交互原型</span> <del>8,000</del> <ins>9,500</ins>' : '<span class="ctx">Design and prototyping · Wireframes, visual design, clickable prototype</span> <del>8,000</del> <ins>9,500</ins>' }),
      ),
      h('p', { class: 'example-why' }, zh
        ? '新版第 2 页多了一段，之后每页都顺延了一页。ChangeLens 按内容而不是页码匹配，所以只列出这类真正的修改，而不是把后面的页面全部标红。'
        : 'A paragraph was added on page 2 of the new version, so every later page moved down by one. ChangeLens matches content rather than page numbers, so it lists changes like this one instead of marking every later page as different.'),
      h('ul', { class: 'scope' },
        h('li', {}, h('b', {}, zh ? '比较：' : 'Compares: '), zh ? '文字、数字（含正负号）、移动的段落、粗体/字号/字体、图形与颜色、位置变化、超出页面的内容。' : 'words, numbers (including signs), moved paragraphs, bold/size/font, graphics and colour, position, content cut off at the page edge.'),
        h('li', {}, h('b', {}, zh ? '默认忽略但会注明：' : 'Ignored by default, but stated: '), zh ? '页眉、页脚、页码，以及线条的轻微移位。' : 'headers, footers, page numbers, and slight shifts of lines.'),
        h('li', {}, h('b', {}, zh ? '暂不支持：' : 'Not supported yet: '), zh ? '扫描件（没有文字层的 PDF）；Word、PowerPoint 请先导出为 PDF。' : 'scanned PDFs (no text layer); export Word or PowerPoint files to PDF first.'),
      ),
    );
    const page = h(
      'div',
      { class: 'landing' },
      h('header', { class: 'topbar plain' },
        h('a', { class: 'brand', href: './', html: `${LOGO}<span>ChangeLens</span>` }),
        h('div', { class: 'spacer' }),
        this.langToggle(),
        h('a', { class: 'btn ghost', href: REPO, target: '_blank', rel: 'noopener' }, icon('github'), h('span', { class: 'hide-sm' }, 'GitHub')),
      ),
      h('main', { class: 'hero' },
        h('h1', {}, this.lang === 'zh' ? '看清两版 PDF 之间到底改了什么' : 'See exactly what changed between two PDFs'),
        h('p', { class: 'lead' }, this.tr('appTagline')),
        h('div', { class: 'drops' }, zone('old'), h('div', { class: 'arrow', 'aria-hidden': 'true' }, icon('right', 26)), zone('new')),
        h('div', { class: 'cta' },
          h('button', { class: 'btn primary lg', 'data-fk': 'compare', disabled: !ready, onclick: () => this.run() }, this.tr('compare')),
          h('div', { class: 'demo' },
            h('button', { class: 'btn link', onclick: () => this.loadDemo('proposal') }, this.tr('tryDemo')),
            h('span', { class: 'dot' }, '·'),
            h('button', { class: 'btn link', onclick: () => this.loadDemo('proposal-zh') }, this.tr('tryDemoZh')),
          ),
        ),
        h('p', { class: 'privacy' }, icon('lock', 15), this.tr('privacy')),
        h('div', { id: 'msg', class: 'msg', role: 'alert' }),
        example,
      ),
      h('footer', { class: 'foot' }, h('a', { href: REPO, target: '_blank', rel: 'noopener' }, 'ChangeLens'), ' · ', this.tr('footer')),
    );
    // Dropping two files anywhere fills both slots (older file = before).
    page.addEventListener('dragover', (e) => e.preventDefault());
    page.addEventListener('drop', async (e) => {
      e.preventDefault();
      const files = [...(e.dataTransfer?.files ?? [])];
      if (files.length) await this.pickFiles(files);
    });
    this.root.append(page);
  }

  private message(text: string): void {
    const el = this.root.querySelector('#msg');
    if (el) el.textContent = text;
    else this.banner(text);
  }

  /** Error banner under the top bar of the results view, with an optional retry. */
  private banner(text: string, retry?: { label: string; run: () => void; focus?: string }): void {
    const results = this.root.querySelector('.results');
    if (!results) return void console.error(text);
    results.querySelector('.banner')?.remove();
    const close = () => {
      el.remove();
      restoreFocus(this.root, retry?.focus ?? null);
    };
    const el = h('div', { class: 'banner', role: 'alert' },
      icon('alert', 16),
      h('span', { class: 'banner-text' }, text),
      retry ? h('button', { class: 'btn sm', 'data-fk': 'banner-retry', onclick: () => { close(); retry.run(); } }, retry.label) : null,
      h('button', { class: 'btn icon sm', title: this.tr('dismiss'), 'aria-label': this.tr('dismiss'), onclick: close }, icon('x', 16)),
    );
    results.querySelector('.topbar')?.after(el);
  }

  private async pickFiles(files: File[], side?: 'old' | 'new'): Promise<void> {
    const pdfs = files.filter((f) => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name));
    if (!pdfs.length) return this.message(this.tr('needTwo'));
    const read = async (f: File): Promise<Picked> => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()), lastModified: f.lastModified });
    if (pdfs.length >= 2) {
      const [a, b] = pdfs.slice(0, 2).sort((x, y) => x.lastModified - y.lastModified || x.name.localeCompare(y.name));
      this.picked = { old: await read(a), new: await read(b) };
    } else if (side) {
      this.picked[side] = await read(pdfs[0]);
    } else {
      this.picked[this.picked.old ? 'new' : 'old'] = await read(pdfs[0]);
    }
    this.showLanding();
  }

  private async loadDemo(name: string): Promise<void> {
    try {
      const get = async (v: string): Promise<Picked> => {
        const res = await fetch(`${import.meta.env.BASE_URL}samples/${name}-${v}.pdf`);
        if (!res.ok) throw new Error(res.statusText);
        return { name: `${name}-${v}.pdf`, bytes: new Uint8Array(await res.arrayBuffer()), lastModified: 0 };
      };
      this.picked = { old: await get('before'), new: await get('after') };
      await this.run();
    } catch (e) {
      this.message(String(e));
    }
  }

  // ------------------------------------------------------------ running ---

  private overlay(onCancel: () => void): { set(text: string, frac?: number): void; close(): void } {
    const bar = h('span', {});
    const label = h('div', { class: 'ov-label', role: 'status', 'aria-live': 'polite' }, this.tr('readingFiles'));
    const cancel = h('button', {
      class: 'btn ghost ov-cancel',
      onclick: () => {
        if (cancel.getAttribute('aria-disabled')) return;
        cancel.setAttribute('aria-disabled', 'true');
        cancel.textContent = this.tr('cancelling');
        onCancel();
      },
    }, this.tr('cancel'));
    const box = h('div', { class: 'overlay' },
      h('div', { class: 'ov-box' }, h('div', { class: 'ov-logo', html: LOGO }), label, h('div', { class: 'bar' }, bar), cancel),
    );
    document.body.append(box);
    // The page behind is inert while this runs; keep the focus in reach.
    cancel.focus();
    return {
      set: (text, frac) => {
        label.textContent = text;
        if (frac !== undefined) bar.style.width = `${Math.round(frac * 100)}%`;
      },
      close: () => box.remove(),
    };
  }

  private async load(side: 'old' | 'new', p: Picked, ov: ReturnType<App['overlay']>, base: number, check: () => void): Promise<Loaded> {
    const prev = this.loaded[side];
    // Reuse a loaded document only if every byte is the same.
    const id = await fileIdentity(p.bytes);
    const same = reuseLoaded(prev, id.key, p.name);
    if (same) return same;
    check();
    let pdf: PDFDocumentProxy;
    try {
      pdf = await openPdf(p.bytes);
    } catch (e) {
      throw new Error(explainOpenError(this.lang, p.name, e));
    }
    let model: DocModel;
    try {
      const doc = await extractText(pdf, p.name, (page, total) => {
        check();
        ov.set(this.tr('extracting', { doc: p.name, page, total }), base + 0.25 * (page / total));
      });
      model = buildDocModel(doc);
      if (model.tokens.length === 0) throw new Error(this.tr('noText', { name: p.name }));
    } catch (e) {
      void pdf.loadingTask.destroy();
      throw e;
    }
    if (prev) this.release(prev.pdf);
    return { name: p.name, pdf, model, key: id.key, sha256: id.sha256 };
  }

  /** Close a replaced document, but not while a report export still renders it. */
  private release(pdf: PDFDocumentProxy): void {
    const destroy = () => void pdf.loadingTask.destroy();
    const running = [...this.exporting.values()].map((e) => e.job);
    if (running.length) void Promise.allSettled(running).then(destroy);
    else destroy();
  }

  /**
   * Compare the picked files. Afterwards the focus returns to the control
   * that had it, or, if the new result no longer has that control (the
   * notice whose "Show" was pressed, the pairing form), to the first of
   * `fallback` that exists.
   */
  private async run(fallback: string[] = []): Promise<void> {
    if (!this.picked.old || !this.picked.new) return;
    if (this.busy) {
      this.rerun = true;
      return;
    }
    this.busy = true;
    const focus = focusKeyOf(this.root);
    const abort = new AbortController();
    const check = () => {
      if (abort.signal.aborted) throw cancelled();
    };
    const ov = this.overlay(() => abort.abort());
    // Nothing behind the overlay may change settings or start another task.
    this.root.inert = true;
    const options = { ...this.options };
    let ok = false;
    try {
      const lo = (this.loaded.old = await this.load('old', this.picked.old, ov, 0, check));
      const ln = (this.loaded.new = await this.load('new', this.picked.new, ov, 0.25, check));
      ov.set(this.tr('comparingText'), 0.5);
      await new Promise((r) => setTimeout(r, 16));
      check();
      const { graphics, ...diffOpts } = options;
      const pairs = this.loadPairs();
      const result = compareDocs(lo.model, ln.model, { ...diffOpts, manualPairs: pairs });
      if (graphics) {
        await addVisualChanges(
          result,
          (p) => (check(), renderRaster(lo.pdf, p, 1.5)),
          (p) => (check(), renderRaster(ln.pdf, p, 1.5)),
          (done, total) => {
            check();
            ov.set(this.tr('comparingVisual', { page: done, total }), 0.55 + 0.45 * (done / total));
          },
        );
      }
      check();
      this.showMinor = false;
      this.result = result;
      this.shown = { options, pairs };
      this.reviewsBySig = this.loadReviews();
      this.selected = null;
      this.showResults();
      ok = true;
    } catch (e) {
      if (this.result && this.shown) {
        // The shown result stays: show the settings and pairs it was made with.
        this.options = { ...this.shown.options };
        store.set('changelens.options', JSON.stringify(this.options));
        this.savePairs(this.shown.pairs);
        this.syncSettings();
        // Also the change list: e.g. a pairing form closed by its Pair button.
        this.sidebar?.update(this.result);
      } else this.showLanding();
      if (!abort.signal.aborted) {
        console.error(e);
        this.message((e as Error).message);
      }
    } finally {
      ov.close();
      this.root.inert = false;
      this.busy = false;
      if (!restoreFocus(this.root, focus)) fallback.some((key) => restoreFocus(this.root, key));
    }
    const again = this.rerun && ok;
    this.rerun = false;
    if (again) await this.run();
  }

  private pairsKey(): string {
    return `changelens.pairs.${this.loaded.old?.key}.${this.loaded.new?.key}`;
  }

  /** Manual page pairs for the current pair of files (kept in local storage). */
  private loadPairs(): [number, number][] {
    try {
      const v = JSON.parse(store.get(this.pairsKey()) ?? '[]');
      return Array.isArray(v) ? v.filter((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isInteger)) : [];
    } catch {
      return [];
    }
  }

  private savePairs(pairs: [number, number][]): void {
    store.set(this.pairsKey(), JSON.stringify(pairs));
  }

  private reviewKey(): string {
    return `changelens.reviews.${this.loaded.old?.key}.${this.loaded.new?.key}`;
  }

  private loadReviews(): Record<string, Review> {
    try {
      return JSON.parse(store.get(this.reviewKey()) ?? '{}');
    } catch {
      return {};
    }
  }

  /**
   * Reviews keyed by the current change ids (backed by stable signatures),
   * including minor shifts the reviewer listed with "Show" and marked.
   */
  private reviewsById(): Record<string, Review> {
    const out: Record<string, Review> = {};
    for (const c of [...(this.result?.changes ?? []), ...(this.result?.minor ?? [])]) {
      const r = this.reviewsBySig[signature(c)];
      if (r) out[c.id] = { ...r };
    }
    return out;
  }

  // ------------------------------------------------------------ results ---

  private showResults(): void {
    const result = this.result!;
    const lo = this.loaded.old!;
    const ln = this.loaded.new!;
    // A rebuilt view of the same documents (language switch, re-run) keeps
    // the zoom, side and reading position of the previous one.
    const restore = this.viewer?.viewState();
    const listTop = this.sidebar?.listScrollTop ?? 0;
    this.viewer?.destroy();
    this.viewAbort?.abort();
    this.viewAbort = new AbortController();
    const signal = this.viewAbort.signal;
    clear(this.root);
    document.title = `${ln.name} — ChangeLens`;
    const reviews = this.reviewsById();

    this.sidebar = new Sidebar(this.lang, result, reviews, {
      onSelect: (id) => this.select(id),
      onFilter: (f) => {
        this.filter = f;
        this.viewer?.setChanges(this.sidebar!.visible());
      },
      onReview: (id, review) => {
        const c = [...result.changes, ...result.minor].find((x) => x.id === id);
        if (!c) return;
        this.reviewsBySig[signature(c)] = review;
        store.set(this.reviewKey(), JSON.stringify(this.reviewsBySig));
      },
      onPage: (side, page) => this.jumpToPage(side, page),
      onPair: async (o, n) => {
        const pairs = this.loadPairs().filter(([a, b]) => a !== o && b !== n);
        this.savePairs([...pairs, [o, n]]);
        // The form is gone afterwards: go to the new pair's remove button.
        await this.run([`unpair-${o}-${n}`, 'pair-open']);
      },
      onUnpair: async (o, n) => {
        this.savePairs(this.loadPairs().filter(([a, b]) => !(a === o && b === n)));
        await this.run(['pair-open']);
      },
      onNotice: async (action) => {
        if (action === 'minor') {
          this.showMinor = !this.showMinor;
          this.sidebar!.showMinor = this.showMinor;
          this.sidebar!.update(result);
          this.viewer?.setChanges(this.sidebar!.visible());
        } else {
          this.options.ignoreFurniture = false;
          store.set('changelens.options', JSON.stringify(this.options));
          // The notice goes away with the re-run: go to the new summary.
          await this.run(['summary']);
        }
      },
      onMapToggle: (open) => (this.mapOpen = open),
    });
    this.sidebar.filter = this.filter;
    this.sidebar.showMinor = this.showMinor;
    this.sidebar.mapOpen = this.mapOpen;
    this.sidebar.update(result);

    this.viewer = new Viewer(result, { old: lo.pdf, new: ln.pdf }, { old: lo.name, new: ln.name }, {
      lang: this.lang,
      onSelect: (id) => this.select(id),
      restore,
    });
    this.viewer.setChanges(this.sidebar.visible());

    const zoomLabel = h('span', { class: 'zoom-val' }, '100%');
    this.viewer.onZoom = (z) => (zoomLabel.textContent = `${Math.round(z * 100)}%`);
    const sync = this.viewer.sync;
    const syncBtn = h('button', { class: `btn icon${sync ? ' on' : ''}`, 'data-fk': 'sync', title: this.tr('syncScroll'), 'aria-pressed': String(sync) }, icon(sync ? 'link' : 'unlink'));
    syncBtn.addEventListener('click', () => {
      const v = this.viewer!;
      v.sync = !v.sync;
      syncBtn.classList.toggle('on', v.sync);
      syncBtn.setAttribute('aria-pressed', String(v.sync));
      syncBtn.replaceChildren(icon(v.sync ? 'link' : 'unlink'));
    });
    const seg = (side: 'old' | 'new') => {
      const on = this.viewer!.show === side;
      return h('button', { class: `seg-b${on ? ' on' : ''}`, 'data-side': side, 'data-fk': `side-${side}`, 'aria-pressed': String(on), onclick: () => this.showSide(side) }, this.tr(side === 'old' ? 'oldVersion' : 'newVersion'));
    };
    const sideToggle = h('div', { class: 'seg only-sm', role: 'group' }, seg('old'), seg('new'));

    // On very narrow screens only the icon shows; the label stays its name.
    const exportBtn = h('button', { class: 'btn primary', 'data-fk': 'export', title: this.tr('exportReport'), onclick: () => this.doExport() },
      icon('download'), h('span', { class: 'lbl' }, this.tr('exportReport')), h('span', { class: 'pct' }));
    const listOpen = this.root.classList.contains('list-open');
    const top = h('header', { class: 'topbar' },
      h('button', { class: 'brand', 'data-fk': 'brand', title: this.tr('newComparison'), onclick: () => this.reset(), html: `${LOGO}<span class="hide-sm">ChangeLens</span>` }),
      h('div', { class: 'files' },
        h('span', { class: 'fname old', title: lo.name }, lo.name),
        icon('right', 16),
        h('span', { class: 'fname new', title: ln.name }, ln.name),
      ),
      h('div', { class: 'spacer' }),
      h('button', {
        class: 'btn ghost only-sm',
        'data-fk': 'list-menu',
        title: this.tr('changeList'),
        'aria-label': this.tr('changeList'),
        'aria-controls': this.sidebar.root.id,
        'aria-expanded': String(listOpen),
        onclick: () => this.setListOpen(!this.root.classList.contains('list-open')),
      }, icon('menu')),
      this.settingsButton(),
      this.langToggle(),
      h('button', { class: 'btn ghost hide-sm', 'data-fk': 'json', title: this.tr('exportJson'), onclick: () => exportJson(this.exportInput()) }, 'JSON'),
      exportBtn,
      h('button', { class: 'btn ghost hide-sm', 'data-fk': 'new', title: this.tr('newComparison'), onclick: () => this.reset() }, icon('refresh')),
    );
    const hideBtn = h('button', {
      class: `btn icon hide-sm${this.listHidden ? ' on' : ''}`,
      'data-fk': 'list-hide',
      // A toggle keeps its label; aria-pressed carries the state.
      title: this.tr('hideList'),
      'aria-label': this.tr('hideList'),
      'aria-pressed': String(this.listHidden),
      onclick: () => {
        this.listHidden = !this.listHidden;
        this.root.classList.toggle('list-hidden', this.listHidden);
        hideBtn.classList.toggle('on', this.listHidden);
        hideBtn.setAttribute('aria-pressed', String(this.listHidden));
        this.viewer?.refit();
      },
    }, icon('menu'));
    const tools = h('div', { class: 'viewer-tools' },
      sideToggle,
      h('div', { class: 'tool-group' },
        h('button', { class: 'btn icon', 'data-fk': 'zoom-out', title: this.tr('zoomOut'), onclick: () => this.viewer?.zoomBy(1 / 1.2) }, icon('minus')),
        zoomLabel,
        h('button', { class: 'btn icon', 'data-fk': 'zoom-in', title: this.tr('zoomIn'), onclick: () => this.viewer?.zoomBy(1.2) }, icon('plus')),
        h('button', { class: 'btn icon', 'data-fk': 'fit', title: this.tr('fitWidth'), onclick: () => this.viewer?.fit() }, icon('fit')),
      ),
      syncBtn,
      h('div', { class: 'tool-group' },
        h('button', { class: 'btn icon', 'data-fk': 'prev', title: this.tr('prevChange'), onclick: () => this.step(-1) }, icon('up')),
        h('button', { class: 'btn icon', 'data-fk': 'next', title: this.tr('nextChange'), onclick: () => this.step(1) }, icon('down')),
      ),
      hideBtn,
      h('span', { class: 'legend hide-sm', 'aria-label': 'Legend' },
        ([['del', 'legendDel'], ['ins', 'legendIns'], ['mv', 'legendMove'], ['vis', 'legendVisual'], ['num', 'legendNumber']] as const).map(([k, label]) =>
          h('span', { class: 'lg' }, h('i', { class: `sw ${k}` }), this.tr(label)))),
      h('span', { class: 'hint hide-sm' }, this.tr('help')),
    );
    this.root.classList.toggle('list-hidden', this.listHidden);
    const viewerWrap = h('section', { class: 'viewer' }, tools, this.viewer.root);
    this.root.append(h('div', { class: 'results' }, top, h('div', { class: 'workspace' }, this.sidebar.root, viewerWrap)));
    this.sidebar.listScrollTop = listTop;
    // The off-canvas list (narrow screens) and what it covers: see updateSidebarInert.
    window.matchMedia(narrowQuery).addEventListener('change', () => this.updateSidebarInert(), { signal });
    this.updateSidebarInert();
    this.paintExport();
    if (this.selected) this.select(this.selected, false);
  }

  private setListOpen(open: boolean): void {
    const sb = this.sidebar?.root;
    const hadFocus = !!sb && sb.contains(document.activeElement);
    this.root.classList.toggle('list-open', open);
    this.root.querySelector('[data-fk="list-menu"]')?.setAttribute('aria-expanded', String(open));
    this.updateSidebarInert();
    // Closing the list must not drop the keyboard focus with it.
    if (!open && hadFocus && sb?.inert) restoreFocus(this.root, 'list-menu');
  }

  /**
   * Narrow screens: the off-canvas list is out of the tab order while
   * closed, and the viewer it covers while open (no focus on hidden
   * controls; Escape or the list button closes it).
   */
  private updateSidebarInert(): void {
    const narrow = window.matchMedia(narrowQuery).matches;
    const open = this.root.classList.contains('list-open');
    const sb = this.sidebar?.root;
    if (sb) sb.inert = narrow && !open;
    const viewer = this.root.querySelector<HTMLElement>('.viewer');
    if (viewer) viewer.inert = narrow && open;
  }

  /** Page-map click: on narrow screens show that version first, then scroll it. */
  private jumpToPage(side: 'old' | 'new', page: number): void {
    if (window.matchMedia(narrowQuery).matches) {
      if (this.viewer?.show !== side) this.showSide(side);
      this.setListOpen(false);
    }
    this.viewer?.scrollToPage(side, page);
  }

  private showSide(side: 'old' | 'new'): void {
    this.viewer?.setShow(side);
    for (const b of this.root.querySelectorAll<HTMLElement>('.seg-b')) {
      b.classList.toggle('on', b.dataset.side === side);
      b.setAttribute('aria-pressed', String(b.dataset.side === side));
    }
    this.viewer?.refit();
  }

  private settingsButton(): HTMLElement {
    const wrap = h('div', { class: 'pop-wrap' });
    const pop = h('div', { class: 'pop', hidden: !this.settingsOpen });
    const setOpen = (open: boolean) => {
      this.settingsOpen = open;
      pop.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
    };
    const opt = (key: keyof Options, label: MessageKey) => {
      const input = h('input', { type: 'checkbox', 'data-opt': key, 'data-fk': `opt-${key}`, checked: !!this.options[key] });
      input.addEventListener('change', async () => {
        (this.options as unknown as Record<string, boolean>)[key] = input.checked;
        store.set('changelens.options', JSON.stringify(this.options));
        await this.run();
      });
      return h('label', { class: 'check' }, input, h('span', {}, this.tr(label)));
    };
    pop.append(
      h('div', { class: 'pop-title' }, this.tr('settings')),
      opt('ignoreFurniture', 'ignoreFurniture'),
      opt('ignoreCase', 'ignoreCase'),
      opt('ignorePunctuation', 'ignorePunctuation'),
      opt('detectFormatting', 'detectFormatting'),
      opt('graphics', 'detectGraphics'),
    );
    const btn = h('button', { class: 'btn ghost', 'data-fk': 'settings', title: this.tr('settings'), 'aria-haspopup': 'true', 'aria-expanded': String(this.settingsOpen) }, icon('settings'), h('span', { class: 'hide-sm' }, this.tr('settings')));
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      setOpen(!this.settingsOpen);
    });
    document.addEventListener(
      'click',
      (e) => {
        // Clicks on the progress overlay (outside the app) leave it open.
        const target = e.target as Node;
        if (this.settingsOpen && this.root.contains(target) && !wrap.contains(target)) setOpen(false);
      },
      { signal: this.viewAbort?.signal },
    );
    wrap.append(btn, pop);
    return wrap;
  }

  /** Show the stored settings in the open settings panel. */
  private syncSettings(): void {
    for (const input of this.root.querySelectorAll<HTMLInputElement>('input[data-opt]')) {
      input.checked = !!this.options[input.dataset.opt as keyof Options];
    }
  }

  private exportInput() {
    return {
      result: this.result!,
      pdfs: { old: this.loaded.old!.pdf, new: this.loaded.new!.pdf },
      names: { old: this.loaded.old!.name, new: this.loaded.new!.name },
      lang: this.lang,
      reviews: this.reviewsById(),
      files: { old: { sha256: this.loaded.old!.sha256 }, new: { sha256: this.loaded.new!.sha256 } },
      // What the shown result was computed with, not the current setting.
      visualCompared: (this.shown?.options ?? this.options).graphics,
    };
  }

  private async doExport(): Promise<void> {
    const result = this.result;
    if (!result || this.exporting.has(result)) return;
    this.root.querySelector('.banner')?.remove();
    const input = this.exportInput();
    const entry = { job: Promise.resolve(), progress: '' };
    entry.job = exportReport(input, (d, n) => {
      entry.progress = ` ${Math.round((d / n) * 100)}%`;
      this.paintExport();
    });
    this.exporting.set(result, entry);
    this.paintExport();
    try {
      await entry.job;
    } catch (e) {
      console.error(e);
      // Only if that comparison is still on screen.
      if (this.result === result) {
        const text = e instanceof ExportPageError ? e.message : this.tr('exportFailed', { error: (e as Error)?.message ?? String(e) });
        this.banner(text, { label: this.tr('retry'), run: () => void this.doExport(), focus: 'export' });
      }
    } finally {
      this.exporting.delete(result);
      this.paintExport();
    }
  }

  /** Export button: progress while the shown result is being exported. */
  private paintExport(): void {
    const btn = this.root.querySelector<HTMLButtonElement>('button[data-fk="export"]');
    if (!btn) return;
    const running = this.result ? this.exporting.get(this.result) : undefined;
    // aria-disabled rather than disabled, so a focused button keeps the focus.
    if (running) btn.setAttribute('aria-disabled', 'true');
    else btn.removeAttribute('aria-disabled');
    btn.querySelector('.pct')!.textContent = running?.progress ?? '';
  }

  private reset(): void {
    this.result = undefined;
    this.shown = undefined;
    this.selected = null;
    this.mapOpen = undefined;
    this.settingsOpen = false;
    this.root.classList.remove('list-open');
    this.showLanding();
  }

  private select(id: string, scroll = true): void {
    this.selected = id;
    this.sidebar?.select(id);
    this.viewer?.select(id, scroll);
    if (this.root.classList.contains('list-open')) this.setListOpen(false);
  }

  private step(dir: 1 | -1): void {
    const ids = this.sidebar?.visibleIds() ?? [];
    if (!ids.length) return;
    const k = this.selected ? ids.indexOf(this.selected) : -1;
    const next = k < 0 ? (dir > 0 ? 0 : ids.length - 1) : Math.max(0, Math.min(ids.length - 1, k + dir));
    this.select(ids[next]);
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.result || this.busy) return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape' && this.root.classList.contains('list-open')) {
      this.setListOpen(false);
      restoreFocus(this.root, 'list-menu');
    } else if (e.key === 'j' || e.key === 'n') this.step(1);
    else if (e.key === 'k' || e.key === 'p') this.step(-1);
    else if (e.key === '+' || e.key === '=') this.viewer?.zoomBy(1.2);
    else if (e.key === '-') this.viewer?.zoomBy(1 / 1.2);
    else if (e.key === '0') this.viewer?.fit();
    else return;
    e.preventDefault();
  }
}

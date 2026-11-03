// Web app behaviour in a real browser: the production build is served
// locally and driven with Playwright (Chromium). Skipped when Playwright is
// not installed: `npm i -g playwright && npx playwright install chromium`
// (NODE_PATH must include the global modules), or install it in the repo.
// Fixtures: test/fixtures/web4-*.pdf (make-web4-fixtures.py) and the demo.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer, type Server } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixture = (name: string) => join(root, 'test', 'fixtures', name);

// Playwright has no types in this repo; it is optional.
type Any = any;
let chromium: Any;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {
  /* not installed */
}
const skip = chromium ? false : 'Playwright is not installed';

let server: Server | undefined;
let browser: Any;
let base = '';
let out = '';

const types: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.pdf': 'application/pdf',
  '.wasm': 'application/wasm', '.json': 'application/json', '.svg': 'image/svg+xml',
};

before(async () => {
  if (skip) return;
  if (!existsSync(join(root, 'public', 'pdfjs', 'standard_fonts'))) spawnSync(process.execPath, [join(root, 'scripts', 'copy-pdfjs-assets.mjs')], { stdio: 'ignore' });
  out = mkdtempSync(join(tmpdir(), 'changelens-web4-'));
  const { build } = await import('vite');
  await build({ root, logLevel: 'silent', cacheDir: join(out, 'cache'), build: { outDir: join(out, 'dist'), emptyOutDir: true } });
  const dist = join(out, 'dist');
  server = createServer((req, res) => {
    const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0])).replace(/^(\.\.[/\\])+/, '');
    let file = join(dist, path);
    if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html');
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  await new Promise<void>((ok) => server!.listen(0, '127.0.0.1', ok));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}/`;
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  await new Promise((ok) => (server ? server.close(ok) : ok(null)));
  if (out) rmSync(out, { recursive: true, force: true });
});

interface Open {
  width?: number;
  height?: number;
  graphics?: boolean;
  scheme?: 'light' | 'dark';
  phone?: boolean;
}

async function open(o: Open = {}): Promise<{ ctx: Any; page: Any }> {
  const ctx = await browser.newContext({
    viewport: { width: o.width ?? 1440, height: o.height ?? 900 },
    reducedMotion: 'reduce',
    colorScheme: o.scheme ?? 'light',
    acceptDownloads: true,
    ...(o.phone ? { deviceScaleFactor: 3, isMobile: true, hasTouch: true } : {}),
  });
  await ctx.addInitScript((graphics: boolean) => {
    if (sessionStorage.getItem('init')) return;
    sessionStorage.setItem('init', '1');
    localStorage.setItem('changelens.lang', 'en');
    localStorage.setItem('changelens.options', JSON.stringify({ graphics }));
  }, o.graphics ?? false);
  const page = await ctx.newPage();
  await page.goto(base);
  return { ctx, page };
}

async function settled(page: Any): Promise<void> {
  await page.waitForSelector('.overlay', { state: 'detached', timeout: 120_000 });
  await page.waitForSelector('.results .item, .results .empty', { state: 'attached' });
}

async function comparePair(page: Any, name: string): Promise<void> {
  for (const [side, v] of [['old', 'before'], ['new', 'after']]) {
    await page.setInputFiles(`#file-${side}`, fixture(`web4-${name}-${v}.pdf`));
    await page.waitForFunction((s: string) => document.querySelector(`.drop[data-side="${s}"].has`), side);
  }
  await page.click('[data-fk="compare"]');
  await settled(page);
}

async function demo(page: Any): Promise<void> {
  await page.locator('.demo .btn.link').first().click();
  await settled(page);
}

const focusKey = (page: Any): Promise<string> => page.evaluate(() => {
  const a = document.activeElement as HTMLElement | null;
  return a?.closest('[data-fk]')?.getAttribute('data-fk') ?? a?.tagName ?? 'none';
});

async function zoomTo(page: Any, atLeast: number): Promise<void> {
  for (let i = 0; i < 40 && parseInt(await page.textContent('.zoom-val')) < atLeast; i++) await page.keyboard.press('+');
}

test('zooming keeps the reading position on a late page (gaps between pages do not scale)', { skip }, async () => {
  const { ctx, page } = await open();
  try {
    await comparePair(page, 'long');
    await page.locator('.item', { hasText: 'p. 30' }).click();
    const y = () => page.evaluate(() => {
      const sc = document.querySelector('.pane-new .pane-scroll')!;
      const r = document.querySelector('.pane-new .hl.active')!.getBoundingClientRect();
      return r.top + r.height / 2 - sc.getBoundingClientRect().top;
    });
    const start = await y();
    for (let i = 0; i < 4; i++) await page.keyboard.press('+');
    const end = await y();
    // Only the point a third down stays exactly; the change sits a few
    // pixels below it. Scaling the pixel position moved it by ~(29 × 16 px) × 0.2 per step.
    assert.ok(Math.abs(end - start) < 40, `the selected change moved from ${start.toFixed(0)} to ${end.toFixed(0)} px in the view`);
  } finally {
    await ctx.close();
  }
});

test('after "Hide change list" on a wide window, the list button still opens the list on a narrow one', { skip }, async () => {
  const { ctx, page } = await open();
  try {
    await demo(page);
    await page.click('[data-fk="list-hide"]');
    assert.equal(await page.$eval('.sidebar', (e: Element) => getComputedStyle(e).display), 'none');
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.click('[data-fk="list-menu"]');
    const shown = await page.$eval('.sidebar', (e: Element) => {
      const r = e.getBoundingClientRect();
      return { w: r.width, left: r.left, item: (e.querySelector('.item') as HTMLElement).checkVisibility() };
    });
    assert.ok(shown.w > 300 && shown.left >= 0 && shown.item, JSON.stringify(shown));
    // Back on the wide window the list is hidden again, as chosen.
    await page.setViewportSize({ width: 1440, height: 900 });
    assert.equal(await page.$eval('.sidebar', (e: Element) => getComputedStyle(e).display), 'none');
    assert.equal(await page.getAttribute('[data-fk="list-hide"]', 'aria-pressed'), 'true');
  } finally {
    await ctx.close();
  }
});

test('a review mark on a slight shift shown with "Show" survives a rebuild and is exported', { skip }, async () => {
  const { ctx, page } = await open({ graphics: true });
  try {
    await comparePair(page, 'minor');
    await page.click('[data-fk="notice-minor"]');
    const id = await page.$eval('.item:not([data-id^="c"])', (e: HTMLElement) => e.dataset.id);
    await page.click(`[data-fk="rv-${id}-ok"]`);
    await page.click('[data-fk="lang"]'); // rebuilds the view (Chinese)
    const item = page.locator(`.item[data-id="${id}"]`);
    assert.match((await item.getAttribute('class')) ?? '', /st-ok/);
    assert.equal(await page.getAttribute(`[data-fk="rv-${id}-ok"]`, 'aria-pressed'), 'true');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-fk="json"]')]);
    const json = JSON.parse(readFileSync(await download.path(), 'utf8'));
    assert.equal(json.minor.find((m: { id: string }) => m.id === id)?.review?.status, 'ok');
  } finally {
    await ctx.close();
  }
});

test('cancelling the re-run started by "Pair" closes the pairing form and keeps the focus', { skip }, async () => {
  const { ctx, page } = await open({ graphics: true });
  try {
    await comparePair(page, 'long');
    await page.click('[data-fk="map"]');
    await page.click('[data-fk="pair-open"]');
    await page.selectOption('.pairform select[name=old]', '3');
    await page.selectOption('.pairform select[name=new]', '3');
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 3 });
    await page.focus('.pairform .btn.primary');
    await page.keyboard.press('Enter');
    await page.click('.ov-cancel');
    await page.waitForSelector('.overlay', { state: 'detached' });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    assert.equal(await page.locator('.pairform').count(), 0, 'no stale pairing form');
    assert.equal(await page.locator('.pairs li').count(), 0);
    assert.equal(await focusKey(page), 'pair-open');
    // A page-map click now navigates, as the absent form implies.
    await page.click('.minimap rect[data-side="old"][data-page="7"]');
    await page.waitForFunction(() => document.querySelector('.pane-old .pane-scroll')!.scrollTop > 0);
  } finally {
    await ctx.close();
  }
});

test('above the canvas cap the visible part of a page is rendered at full detail (phone, 500%)', { skip }, async () => {
  const { ctx, page } = await open({ width: 390, height: 844, phone: true });
  try {
    await demo(page);
    await zoomTo(page, 500);
    await page.click('[data-fk="list-menu"]');
    await page.locator('.item', { hasText: '9,500' }).click();
    const handle = await page.waitForFunction(() => {
      const hl = document.querySelector('.pane-new .hl.active');
      const pg = hl?.closest('.page');
      const d = pg?.querySelector<HTMLCanvasElement>('canvas.page-detail');
      if (!hl || !pg || !d) return null;
      const r = d.getBoundingClientRect();
      const h = hl.getBoundingClientRect();
      const c = pg.querySelector('canvas.page-canvas') as HTMLCanvasElement;
      return { devPx: d.width / r.width, covers: r.left <= h.left && r.right >= h.right && r.top <= h.top && r.bottom >= h.bottom, base: c.width * c.height, detail: d.width * d.height };
    }, null, { timeout: 15_000 });
    const m = await handle.jsonValue();
    // Device pixel ratio 3 is rendered at 2 (as everywhere in the viewer).
    assert.ok(m.devPx > 1.95, `detail at ${m.devPx.toFixed(2)} device px per CSS px`);
    assert.ok(m.covers, 'the detail covers the selected change');
    // The page bitmap stays within the touch-device cap, the detail within half of it.
    assert.ok(m.base <= 5_242_880 && m.detail <= (5_242_880 / 2) * 1.001, JSON.stringify(m));
  } finally {
    await ctx.close();
  }
});

test('keyboard focus stays in place after "Show" (headers/footers), "Pair" and "Remove pair"', { skip }, async () => {
  const { ctx, page } = await open();
  try {
    await comparePair(page, 'furniture');
    await page.focus('[data-fk="notice-furniture"]');
    await page.keyboard.press('Enter');
    await settled(page);
    assert.equal(await focusKey(page), 'summary', 'the notice is gone: focus on the new summary');
    await page.click('[data-fk="map"]');
    await page.click('[data-fk="pair-open"]');
    await page.selectOption('.pairform select[name=old]', '0');
    await page.selectOption('.pairform select[name=new]', '0');
    await page.focus('.pairform .btn.primary');
    await page.keyboard.press('Enter');
    await settled(page);
    assert.equal(await focusKey(page), 'unpair-0-0', 'focus on the new pair');
    await page.keyboard.press('Enter');
    await settled(page);
    assert.equal(await focusKey(page), 'pair-open');
  } finally {
    await ctx.close();
  }
});

test('narrow screen: with the change list open, Tab does not reach viewer controls under it', { skip }, async () => {
  const { ctx, page } = await open({ width: 390, height: 844 });
  try {
    await demo(page);
    await page.click('[data-fk="list-menu"]');
    await page.locator('.sidebar button').last().focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => !!document.activeElement?.closest('.viewer')), false, `focus went to ${await focusKey(page)}`);
    assert.equal(await page.$eval('.viewer', (e: HTMLElement) => e.inert), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.$eval('.viewer', (e: HTMLElement) => e.inert), false);
  } finally {
    await ctx.close();
  }
});

test('selecting a change wider than the pane shows where its lines start', { skip }, async () => {
  const { ctx, page } = await open();
  try {
    await demo(page);
    await zoomTo(page, 240);
    await page.locator('.item', { hasText: 'Deleted a paragraph' }).click();
    const r = await page.evaluate(() => {
      const sc = document.querySelector('.pane-old .pane-scroll')!.getBoundingClientRect();
      const hl = document.querySelector('.pane-old .hl.active')!.getBoundingClientRect();
      return { hl: hl.left, hlW: hl.width, view: sc.left, viewW: sc.width };
    });
    assert.ok(r.hlW > r.viewW, 'the change is wider than the view at this zoom');
    assert.ok(r.hl >= r.view, `line start ${(r.hl - r.view).toFixed(0)} px from the view's left edge`);
  } finally {
    await ctx.close();
  }
});

test('at 320 CSS px the results view does not pan sideways, and the closed list shows nothing', { skip }, async () => {
  const { ctx, page } = await open({ width: 320, height: 640 });
  try {
    await demo(page);
    for (const [lang, name] of [['en', 'Export report'], ['zh', '导出报告']]) {
      const m = await page.evaluate(() => {
        const e = document.querySelector('[data-fk="export"]')!;
        const onScreen = [...document.querySelectorAll('.sidebar *')].filter((x) => {
          const r = x.getBoundingClientRect();
          return r.width > 0 && r.right > 0 && r.left < innerWidth && x.checkVisibility({ visibilityProperty: true });
        }).length;
        return { scrollW: document.documentElement.scrollWidth, exportRight: e.getBoundingClientRect().right, exportName: e.textContent!.trim(), onScreen };
      });
      assert.ok(m.scrollW <= 320 && m.exportRight <= 320, `${lang}: ${JSON.stringify(m)}`);
      assert.equal(m.onScreen, 0, `${lang}: parts of the closed list on screen`);
      assert.equal(m.exportName, name, 'the icon-only export button keeps its name');
      if (lang === 'en') await page.click('[data-fk="lang"]');
    }
  } finally {
    await ctx.close();
  }
});

test('change indicators in the viewer and the page-map tile outlines reach 3:1 (light and dark)', { skip }, async () => {
  for (const scheme of ['light', 'dark'] as const) {
    const { ctx, page } = await open({ scheme });
    try {
      await demo(page);
      await page.click('[data-fk="map"]');
      const low = await page.evaluate(() => {
        type RGB = [number, number, number];
        const parse = (s: string): [RGB, number] => {
          const v = s.match(/rgba?\(([^)]+)\)/)![1].split(/[ ,/]+/).filter(Boolean).map(Number);
          return [[v[0], v[1], v[2]], v[3] ?? 1];
        };
        const over = (c: RGB, a: number, bg: RGB): RGB => c.map((v, i) => v * a + bg[i] * (1 - a)) as RGB;
        const lum = (c: RGB) => {
          const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
          return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
        };
        const ratio = (a: RGB, b: RGB) => {
          const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
          return (x + 0.05) / (y + 0.05);
        };
        const white: RGB = [255, 255, 255];
        const viewerBg = parse(getComputedStyle(document.querySelector('.viewer')!).backgroundColor)[0];
        const surface = parse(getComputedStyle(document.querySelector('.sidebar')!).backgroundColor)[0];
        const found: [string, number][] = [];
        for (const k of ['del', 'ins', 'mv', 'num']) {
          const el = document.querySelector(`.hl.${k}${k === 'num' ? '' : ':not(.num)'}:not(.active)`);
          if (!el) continue;
          const s = getComputedStyle(el);
          // Outline (inset shadow) over the element's own fill, on the white page.
          const [c, a] = parse(s.boxShadow);
          const [, f] = parse(s.backgroundColor);
          found.push([`hl.${k}`, ratio(over(c, a + f * (1 - a), white), white)]);
        }
        for (const k of ['del', 'ins', 'mv']) {
          const el = document.querySelector(`.cbar.${k}`);
          if (el) found.push([`cbar.${k}`, ratio(parse(getComputedStyle(el).backgroundColor)[0], viewerBg)]);
        }
        const tile = getComputedStyle(document.querySelector('.minimap rect[data-side]')!);
        found.push(['map tile', ratio(over(parse(tile.stroke)[0], Number(tile.strokeOpacity), surface), surface)]);
        return { all: found.map(([n]) => n), low: found.filter(([, r]) => r < 3).map(([n, r]) => `${n} ${r.toFixed(2)}`) };
      });
      assert.ok(low.all.includes('hl.ins') && low.all.includes('cbar.ins') && low.all.includes('map tile'), JSON.stringify(low.all));
      assert.deepEqual(low.low, [], `${scheme}: below 3:1`);
    } finally {
      await ctx.close();
    }
  }
});

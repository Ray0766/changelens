// Generator for blind held-out round 4, author "f": long and multilingual
// review documents. Regenerates all six cases under eval/cases/holdout4-f-*/
// (before.pdf, after.pdf, truth.json).
//
//   NODE_PATH=/opt/node-tools/node_modules node eval/make-holdout4-f.mjs [case-id-substring ...]
//
// Producers: Chromium (Playwright), LibreOffice Writer (python-docx -> soffice)
// and reportlab. Python and LibreOffice helpers live in eval/holdout4-f/.
// All content is synthetic. The page numbers in truth.json are located in the
// generated PDFs with PDF.js; the script stops if a snippet is missing, sits on
// more than one page, or is still present on the other side.

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import * as assetPlan from './holdout4-f/asset-plan.mjs';
import * as zhHantReport from './holdout4-f/zh-hant-report.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const helpers = path.join(here, 'holdout4-f');
const casesDir = path.join(here, 'cases');

const require = createRequire(import.meta.url);
function loadPlaywright() {
  try { return require('playwright'); } catch { /* fall through */ }
  return require('/opt/node-tools/node_modules/playwright');
}

const pdfjs = await import(pathToFileURL(path.join(repo, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href);

// ---------------------------------------------------------------- producers

let browser = null;
async function chromiumPdf(html, out, pdfOptions) {
  if (!browser) browser = await loadPlaywright().chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: out, printBackground: true, ...pdfOptions });
  await page.close();
}

const pyEnv = process.env; // -B: no __pycache__ next to the helpers
function python(script, args) {
  execFileSync('python3', ['-I', '-B', path.join(helpers, script), ...args], { stdio: 'inherit', env: pyEnv });
}

let loRun = 0;
function soffice(inputFile, outDir) {
  loRun += 1;
  const profile = path.join(os.tmpdir(), `lo-f-${process.pid}-${loRun}`);
  execFileSync('soffice', [
    `-env:UserInstallation=${pathToFileURL(profile).href}`,
    '--headless', '--convert-to', 'pdf', '--outdir', outDir, inputFile,
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  fs.rmSync(profile, { recursive: true, force: true });
  const pdf = path.join(outDir, path.basename(inputFile).replace(/\.[^.]+$/, '.pdf'));
  if (!fs.existsSync(pdf)) throw new Error(`LibreOffice did not write ${pdf}`);
  return pdf;
}

// ---------------------------------------------------------------- cases

const cases = [
  {
    id: 'holdout4-f-en-asset-plan-long',
    producer: 'Chromium (Skia/PDF m153, Playwright page.pdf), HTML/CSS, Liberation Serif/Sans',
    async build(dir) {
      for (const v of ['before', 'after']) {
        await chromiumPdf(assetPlan.html(v), path.join(dir, `${v}.pdf`), assetPlan.pdfOptions);
      }
    },
    ...assetPlan.truth,
  },
  {
    id: 'holdout4-f-zh-en-ja-controller-manual-long',
    producer: 'LibreOffice Writer 24.2 (python-docx .docx -> soffice --convert-to pdf), WenQuanYi Zen Hei / IPAGothic / Liberation Sans',
    async build(dir, tmp) {
      for (const v of ['before', 'after']) {
        const docx = path.join(tmp, `controller-manual-${v}.docx`);
        python('controller_manual.py', [v, docx]);
        fs.renameSync(soffice(docx, tmp), path.join(dir, `${v}.pdf`));
      }
    },
    truthModule: 'controller_manual.py',
  },
  {
    id: 'holdout4-f-en-security-handbook-reordered',
    producer: 'reportlab 5 (platypus), Liberation Serif/Sans',
    async build(dir) {
      for (const v of ['before', 'after']) python('security_handbook.py', [v, path.join(dir, `${v}.pdf`)]);
    },
    truthModule: 'security_handbook.py',
  },
  {
    id: 'holdout4-f-en-master-services-agreement',
    producer: 'LibreOffice Writer 24.2 (python-docx .docx -> soffice --convert-to pdf), Caladea/Carlito',
    async build(dir, tmp) {
      for (const v of ['before', 'after']) {
        const docx = path.join(tmp, `msa-${v}.docx`);
        python('master_agreement.py', [v, docx]);
        fs.renameSync(soffice(docx, tmp), path.join(dir, `${v}.pdf`));
      }
    },
    truthModule: 'master_agreement.py',
  },
  {
    id: 'holdout4-f-ja-maintenance-contract',
    producer: 'reportlab 5 (platypus, wordWrap CJK), IPAGothic',
    async build(dir) {
      for (const v of ['before', 'after']) python('ja_contract.py', [v, path.join(dir, `${v}.pdf`)]);
    },
    truthModule: 'ja_contract.py',
  },
  {
    id: 'holdout4-f-zh-hant-community-annual-report',
    producer: 'Chromium (Skia/PDF m153, Playwright page.pdf), HTML/CSS, WenQuanYi Zen Hei',
    async build(dir) {
      for (const v of ['before', 'after']) {
        await chromiumPdf(zhHantReport.html(v), path.join(dir, `${v}.pdf`), zhHantReport.pdfOptions);
      }
    },
    ...zhHantReport.truth,
  },
];

// Python helpers print their truth spec as JSON with "truth" as argument.
function truthFromPython(script) {
  const out = execFileSync('python3', ['-I', '-B', path.join(helpers, script), 'truth'], { encoding: 'utf8', env: pyEnv });
  return JSON.parse(out);
}

// ---------------------------------------------------------------- text and truth

async function pageTexts(file) {
  const task = pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), verbosity: 0 });
  const doc = await task.promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    pages.push(tc.items.map((it) => it.str).join(''));
  }
  await task.destroy();
  return pages;
}

const norm = (s) => s.normalize('NFC').replace(/\s+/g, '');
const count = (hay, needle) => {
  let n = 0;
  for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + 1)) n++;
  return n;
};

// Find the single page that holds `locate` (whitespace-insensitive) and check
// that `snippet` is on it.
function locate(pages, snippet, locateText, label) {
  const needle = norm(locateText ?? snippet);
  const hits = pages.map((p, i) => (norm(p).includes(needle) ? i + 1 : 0)).filter(Boolean);
  if (hits.length !== 1) throw new Error(`${label}: "${locateText ?? snippet}" found on pages [${hits}]`);
  const page = norm(pages[hits[0] - 1]);
  const n = count(page, norm(snippet));
  if (n < 1) throw new Error(`${label}: snippet "${snippet}" not on page ${hits[0]}`);
  return { page: hits[0], repeats: n };
}

function absent(pages, text, label) {
  const needle = norm(text);
  const hits = pages.map((p, i) => (norm(p).includes(needle) ? i + 1 : 0)).filter(Boolean);
  if (hits.length) throw new Error(`${label}: "${text}" should not be in this version but is on pages [${hits}]`);
}

function buildTruth(spec, before, after) {
  const items = [];
  const warnings = [];
  spec.truth.forEach((t, k) => {
    const label = `${spec.id} item ${k + 1} (${t.type})`;
    const item = { type: t.type };
    if (t.old !== undefined) item.old = t.old;
    if (t.new !== undefined) item.new = t.new;
    if (t.old !== undefined) {
      const r = locate(before, t.old, t.oldLocate, `${label} old`);
      item.oldPage = r.page;
      if (r.repeats > 1) warnings.push(`${label}: old snippet occurs ${r.repeats}x on page ${r.page}`);
    } else if (t.oldAnchor !== undefined) {
      // Insertions: the old page is where the text just before the insertion point is.
      item.oldPage = locate(before, t.oldAnchor, undefined, `${label} oldAnchor`).page;
    } else item.oldPage = t.oldPage;
    if (t.new !== undefined) {
      const r = locate(after, t.new, t.newLocate, `${label} new`);
      item.newPage = r.page;
      if (r.repeats > 1) warnings.push(`${label}: new snippet occurs ${r.repeats}x on page ${r.page}`);
    } else if (t.newAnchor !== undefined) {
      // Deletions: the new page is where the text just before the deleted text is.
      item.newPage = locate(after, t.newAnchor, undefined, `${label} newAnchor`).page;
    } else item.newPage = t.newPage;
    // The old wording must be gone from the new version and vice versa.
    if (['number', 'replace', 'delete', 'furniture'].includes(t.type) && t.old !== undefined) {
      absent(after, t.oldLocate ?? t.old, `${label} old-in-after`);
    }
    if (['number', 'replace', 'insert', 'furniture'].includes(t.type) && t.new !== undefined) {
      absent(before, t.newLocate ?? t.new, `${label} new-in-before`);
    }
    if (t.oldRect) item.oldRect = t.oldRect;
    if (t.newRect) item.newRect = t.newRect;
    if (t.maxItems) item.maxItems = t.maxItems;
    if (t.note) item.note = t.note;
    if (item.oldPage === undefined || item.newPage === undefined) {
      throw new Error(`${label}: give oldPage/newPage explicitly`);
    }
    items.push(item);
  });
  return { items, warnings };
}

// ---------------------------------------------------------------- main

const filters = process.argv.slice(2);
const selected = cases.filter((c) => !filters.length || filters.some((f) => c.id.includes(f)));
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'holdout4-f-'));
const summary = [];
try {
  for (const c of selected) {
    const dir = path.join(casesDir, c.id);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = fs.mkdtempSync(path.join(tmpRoot, 'case-'));
    await c.build(dir, tmp);
    const spec = c.truthModule ? { ...truthFromPython(c.truthModule), id: c.id } : { ...c };
    const before = await pageTexts(path.join(dir, 'before.pdf'));
    const after = await pageTexts(path.join(dir, 'after.pdf'));
    const { items, warnings } = buildTruth({ ...spec, id: c.id }, before, after);
    const truth = {
      description: `${spec.description} Producer: ${c.producer}.`,
      synthetic: true,
      set: 'held-out-4',
      blind: true,
      truth: items,
    };
    fs.writeFileSync(path.join(dir, 'truth.json'), JSON.stringify(truth, null, 2) + '\n');
    summary.push({ id: c.id, pages: `${before.length}→${after.length}`, truthItems: items.length, producer: c.producer });
    console.log(`${c.id}: ${before.length}→${after.length} pages, ${items.length} items`);
    for (const it of items) console.log(`   ${it.type.padEnd(8)} p.${it.oldPage}→${it.newPage}  ${(it.old ?? '').slice(0, 40)} | ${(it.new ?? '').slice(0, 40)}`);
    for (const w of warnings) console.log(`   warning: ${w}`);
  }
} finally {
  if (browser) await browser.close();
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}
console.log(JSON.stringify(summary, null, 2));

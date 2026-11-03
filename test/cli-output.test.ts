// End-to-end tests of the command-line tool: what it prints, its exit codes
// and the files it writes. Each test runs the CLI in a child process.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canRender } from '../src/node/render.ts';

const cli = new URL('../src/cli/cli.ts', import.meta.url).pathname;
const fixture = (p: string) => new URL(`./fixtures/${p}`, import.meta.url).pathname;
const evalCase = (id: string, v: 'before' | 'after') => new URL(`../eval/cases/${id}/${v}.pdf`, import.meta.url).pathname;
const tmp = () => mkdtempSync(join(tmpdir(), 'cl-cli-'));

function run(args: string[], env: Record<string, string> = {}) {
  const r = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: { ...process.env, LC_ALL: '', LANG: 'C.UTF-8', ...env } });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

/**
 * A minimal one-page PDF (SYNTHETIC). Byte 0x01 in the text is mapped by the
 * font's ToUnicode CMap to `payload` (UTF-16BE hex), e.g. ESC[2J ESC[H, which
 * clears a terminal screen.
 */
function rawPdf(lines: string[], payload: string): Buffer {
  const content = 'BT /F1 12 Tf 72 720 Td 14 TL ' + lines.map((l) => `(${l}) '`).join(' ') + ' ET';
  const cmap =
    '/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CMapName /X def 1 begincodespacerange <00> <FF> endcodespacerange ' +
    `1 beginbfchar <01> <${payload}> endbfchar 1 beginbfrange <20> <7E> <0020> endbfrange endcmap CMapName currentdict /CMap defineresource pop end end`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /ToUnicode 6 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    `<< /Length ${cmap.length} >>\nstream\n${cmap}\nendstream`,
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer << /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

test('control characters from the PDF or the file name are not sent to the terminal', () => {
  const dir = tmp();
  const clear = '001B005B0032004A001B005B0048'; // ESC [ 2 J ESC [ H
  // The file names carry a bidi override and an escape sequence too.
  const a = join(dir, 'old‮.pdf');
  const b = join(dir, 'new\x1b[2J.pdf');
  writeFileSync(a, rawPdf(['Synthetic sample.', 'The fee is 100 dollars per month.', 'Final line.'], clear));
  writeFileSync(b, rawPdf(['Synthetic sample.', 'The fee is 900 dollars per month.', 'See annex\\001', 'Final line.'], clear));
  const r = run([a, b, '--no-visual']);
  assert.equal(r.code, 0, r.err);
  assert.doesNotMatch(r.out, /[\u0000-\u0009\u000b-\u001f\u007f-\u009f‪-‮⁦-⁩]/, JSON.stringify(r.out));
  // The real change is still there, and the hidden characters are visible as escapes.
  assert.match(r.out, /Number changed: 100 → 900/);
  assert.match(r.out, /new\\x1b\[2J\.pdf/);
  assert.match(r.out, /old\\u202e\.pdf/);
});

test('--fail-on-change: 3 when nothing differs but not everything was compared, 0 when everything was', async () => {
  // Same file twice: page 2 has no text layer.
  const textless = fixture('textless-before.pdf');
  let r = run([textless, textless, '--no-visual', '--fail-on-change']);
  assert.equal(r.code, 3, r.out + r.err);
  assert.doesNotMatch(r.out, /^No differences found\.$/m);
  assert.match(r.out, /not everything was compared/);
  assert.match(r.out, /p\. 2: no text layer/);
  assert.match(r.out, /Graphics, images and colours were not compared/);
  // Text-only PDFs: only the graphics were left out.
  const plain = evalCase('duplicate-page', 'before');
  r = run([plain, plain, '--no-visual', '--fail-on-change']);
  assert.equal(r.code, 3, r.out + r.err);
  // Without --fail-on-change the exit code stays 0.
  assert.equal(run([plain, plain, '--no-visual']).code, 0);
  if (await canRender()) {
    r = run([plain, plain, '--fail-on-change']);
    assert.equal(r.code, 0, r.out + r.err);
    assert.match(r.out, /^No differences found\.$/m);
    // Differences found: 1, even if part of the document was not compared.
    assert.equal(run([fixture('textless-before.pdf'), fixture('textless-after.pdf'), '--no-visual', '--fail-on-change']).code, 1);
  }
});

test('JSON: page numbers in coverage match the notices; graphics skipped and tool version are stated', () => {
  const dir = tmp();
  const out = join(dir, 'r.json');
  const textless = fixture('textless-before.pdf');
  const r = run([textless, textless, '--no-visual', '--json', out]);
  assert.equal(r.code, 0, r.err);
  const j = JSON.parse(readFileSync(out, 'utf8'));
  assert.deepEqual(j.coverage.old.textless, [2]);
  assert.deepEqual(j.coverage.new.textless, [2]);
  const textlessNotes = j.notices.filter((n: { text: string }) => /no text layer/.test(n.text));
  assert.equal(textlessNotes.length, 2);
  for (const n of textlessNotes) assert.match(n.text, new RegExp(`p\\. ${j.coverage.old.textless[0]}:`));
  assert.equal(j.visualCompared, false);
  assert.equal(j.complete, false);
  assert.ok(j.notices.some((n: { text: string }) => n.text === 'Graphics, images and colours were not compared.'));
  assert.equal(j.tool.name, 'ChangeLens');
  assert.equal(typeof j.tool.version, 'string');
  // The terminal states the same notices as the file.
  for (const n of j.notices) assert.ok(r.out.includes(n.text), n.text);
});

test('output paths: an input or the other output is never overwritten; bad folders are refused before comparing', () => {
  const dir = tmp();
  const a = join(dir, 'a.pdf');
  const b = join(dir, 'b.pdf');
  copyFileSync(fixture('textless-before.pdf'), a);
  copyFileSync(fixture('textless-after.pdf'), b);
  const original = readFileSync(b);
  for (const args of [['-o', b], ['--json', join(dir, '.', 'b.pdf')], ['-o', join(dir, 'r.html'), '--json', join(dir, 'r.html')], ['-o', join(dir, 'missing', 'r.html'), '--json', join(dir, 'ok.json')], ['-o', dir]]) {
    const r = run([a, b, '--no-visual', ...args]);
    assert.equal(r.code, 2, `${args.join(' ')}: ${r.out}${r.err}`);
    assert.equal(r.out, '', 'refused before the comparison ran');
    assert.ok(r.err.trim().length > 0);
  }
  assert.deepEqual(readFileSync(b), original);
  assert.ok(!existsSync(join(dir, 'ok.json')));
  // Valid paths: both files are written.
  const r = run([a, b, '--no-visual', '-o', join(dir, 'r.html'), '--json', join(dir, 'r.json')]);
  assert.equal(r.code, 0, r.err);
  assert.ok(readFileSync(join(dir, 'r.html'), 'utf8').startsWith('<!doctype html>'));
  assert.ok(JSON.parse(readFileSync(join(dir, 'r.json'), 'utf8')).changes.length > 0);
});

test('--lang accepts locale forms and rejects unknown values', () => {
  const pdf = evalCase('duplicate-page', 'before');
  for (const lang of ['zh', 'zh-CN', 'zh_CN', 'ZH', 'zh-Hans']) {
    const r = run([pdf, pdf, '-q', '--no-visual', '--lang', lang]);
    assert.equal(r.code, 0, `${lang}: ${r.err}`);
    assert.match(r.out, /已比较的部分没有发现差异/, lang);
  }
  for (const lang of ['en', 'en-US', 'EN_gb']) assert.match(run([pdf, pdf, '-q', '--no-visual', '--lang', lang], { LANG: 'zh_CN.UTF-8' }).out, /No differences found/, lang);
  for (const lang of ['fr', 'english', '']) {
    const r = run([pdf, pdf, '-q', '--lang', lang]);
    assert.equal(r.code, 2, lang);
    assert.equal(r.out, '');
    assert.match(r.err, /Unknown --lang value/);
  }
});

test('an empty output name is refused instead of silently writing nothing', () => {
  const dir = tmp();
  const pdf = evalCase('duplicate-page', 'before');
  for (const args of [['-o', ''], ['--json', ''], ['-o', ' ']]) {
    const r = run([pdf, pdf, '--no-visual', ...args]);
    assert.equal(r.code, 2, `${JSON.stringify(args)}: ${r.out}${r.err}`);
    assert.equal(r.out, '');
    assert.match(r.err, /needs a file name/);
  }
  // A real name is still written.
  const r = run([pdf, pdf, '--no-visual', '--json', join(dir, 'r.json')]);
  assert.equal(r.code, 0, r.err);
  assert.ok(existsSync(join(dir, 'r.json')));
});

test('--lang also accepts the locale form of $LANG (zh_CN.UTF-8)', () => {
  const pdf = evalCase('duplicate-page', 'before');
  for (const lang of ['zh_CN.UTF-8', 'zh_CN.utf8', 'zh_TW.Big5', 'zh_CN@pinyin']) {
    const r = run([pdf, pdf, '-q', '--no-visual', '--lang', lang]);
    assert.equal(r.code, 0, `${lang}: ${r.err}`);
    assert.match(r.out, /已比较的部分没有发现差异/, lang);
  }
  assert.match(run([pdf, pdf, '-q', '--no-visual', '--lang', 'en_US.UTF-8'], { LANG: 'zh_CN.UTF-8' }).out, /No differences found/);
  for (const lang of ['fr_FR.UTF-8', 'zh.', 'en@']) assert.equal(run([pdf, pdf, '-q', '--lang', lang]).code, 2, lang);
});

test('pages without text that were paired and compared as images do not make the result incomplete', { skip: !(await canRender()) && 'no canvas' }, () => {
  // Same file twice: page 2 has no text layer; it is paired by position and compared as an image.
  const textless = fixture('textless-before.pdf');
  let r = run([textless, textless, '--fail-on-change']);
  assert.equal(r.code, 0, r.out + r.err);
  assert.match(r.out, /^No differences found\.$/m);
  assert.doesNotMatch(r.out, /pair them to compare their images/);
  // Paired by hand without the visual stage: not "compared as images".
  r = run([textless, textless, '--pair', '2:2', '--no-visual', '--fail-on-change']);
  assert.equal(r.code, 3, r.out + r.err);
  assert.match(r.out, /Paired by hand: old p\. 2 ↔ new p\. 2 \(images not compared\)\./);
  assert.doesNotMatch(r.out, /compared as images/);
});

test('--no-format says that formatting was not compared', () => {
  const dir = tmp();
  const [a, b] = [evalCase('font-swap', 'before'), evalCase('font-swap', 'after')];
  const r = run([a, b, '--no-visual', '--no-format', '--json', join(dir, 'r.json')]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /· Changes in bold, italic, font size and font were not compared\./);
  const j = JSON.parse(readFileSync(join(dir, 'r.json'), 'utf8'));
  assert.ok(j.notices.some((n: { level: string; text: string }) => n.level === 'info' && /bold, italic, font size and font were not compared/.test(n.text)));
  assert.equal(j.options.detectFormatting, false);
  // With formatting compared the change is listed and the note is absent.
  const full = run([a, b, '--no-visual']);
  assert.match(full.out, /font LiberationSerif/);
  assert.doesNotMatch(full.out, /font size and font were not compared/);
});

test('a reader that closes the output early does not stop the report from being written', async () => {
  const { spawn } = await import('node:child_process');
  const dir = mkdtempSync(join(tmpdir(), 'cl-epipe-'));
  const out = join(dir, 'r.json');
  const child = spawn(process.execPath, [cli, evalCase('numbers', 'before'), evalCase('numbers', 'after'), '--no-visual', '--json', out], { stdio: ['ignore', 'pipe', 'pipe'] });
  // Like `| head -1`: read the first chunk, then close the pipe.
  child.stdout.once('data', () => child.stdout.destroy());
  const code = await new Promise<number | null>((resolve) => child.on('close', resolve));
  assert.equal(code, 0);
  assert.ok(existsSync(out), 'JSON written');
  assert.ok(JSON.parse(readFileSync(out, 'utf8')).changes.length > 0);
});

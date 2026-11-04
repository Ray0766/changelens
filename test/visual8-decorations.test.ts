// Visual stage, fix round 8: strikes and underlines (review round 7,
// appearance and robustness probes). Before: a strike was missed on CJK
// numerals and figures after a re-flow by a fraction of a pixel, on glyphs
// already dense at the strike's rows, in grey or coloured text, and on
// short words whose estimated box lies beside the glyphs (Carlito); in CJK
// set solid, the next line's glyphs were read as underlines; a reviewer's
// box, a stamp's border and a turned page gave false lines. Each probe
// asserts what the reviewer must see, next to its control. Fixtures
// test/fixtures/probe8-R4-*, probe8-R6-05-*, probe8-R7-05-* and
// probe8-R7-V01-* are copies of the SYNTHETIC probe and verifier PDFs of
// round 7 (Chromium via Playwright, LibreOffice from python-docx, reportlab;
// pypdf for /Rotate). probe8-R7-V01-cp-* is a SYNTHETIC counter-probe made
// with reportlab: the same invoice and stamp with a real underline and a
// strike under the stamp.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPdf } from '../src/node/pdf.ts';
import { renderPage, canRender } from '../src/node/render.ts';
import { extractText } from '../src/pdf/extract.ts';
import { buildDocModel } from '../src/core/tokenize.ts';
import { compareDocs } from '../src/core/compare.ts';
import { addVisualChanges } from '../src/core/pipeline.ts';
import { describeChange } from '../src/core/describe.ts';
import type { Change, CompareResult } from '../src/core/types.ts';

const fixtures = new URL('./fixtures/', import.meta.url).pathname;
const cases = new URL('../eval/cases/', import.meta.url).pathname;
const skip = !(await canRender()) && 'no canvas';

async function compare(before: string, after: string): Promise<CompareResult> {
  const pa = await openPdf(before);
  const pb = await openPdf(after);
  const r = compareDocs(buildDocModel(await extractText(pa, 'old')), buildDocModel(await extractText(pb, 'new')));
  await addVisualChanges(r, (p) => renderPage(pa, p, 1.5), (p) => renderPage(pb, p, 1.5));
  return r;
}
const run = (before: string, after: string) => compare(fixtures + before, fixtures + after);
const list = (cs: Change[]) => cs.map((c) => describeChange('en', c));
/** Strike and underline items. */
const lines = (r: CompareResult) => list(r.changes.filter((c) => c.format?.decoration));
const struck = (...words: string[]) => words.map((w) => `Struck through: “${w}”`);
const underlined = (...words: string[]) => words.map((w) => `Underlined: “${w}”`);

test('R4-01, R4-16: CJK numerals struck after a re-flow by a fraction of a pixel are listed; a stroke of 算 is no strike', { skip }, async () => {
  // 十<s>五</s>日内 and <s>两</s>年 were missing: 五 and 两 have a stroke of
  // their own at the strike's rows. The strike covers their side bearings.
  const r = await run('probe8-R4-01-before.pdf', 'probe8-R4-01-strike-n50.pdf');
  assert.deepEqual(lines(r), struck('五', '万', '五', '两', '三', '七', '八', '千', '百', '七', '贰', '六', '一', '二', '四', '五'));
  // Control (R4-16): the same note line inserted, nothing struck. Before:
  // "Strikethrough removed: “算”" (its long stroke at 64 % of its height).
  const c = await run('probe8-R4-01-before.pdf', 'probe8-R4-16-ctrl-n33.pdf');
  assert.deepEqual(list(c.changes), ['Added “修订说明：本稿根据第二次会议意见修改。”']);
  // LibreOffice Writer: 两 (一式两份), 五 (百分之五) and 日 (自交付之日) were missing.
  const lo = await run('probe8-R4-01-lo-before.pdf', 'probe8-R4-01-lo-s1.pdf');
  assert.deepEqual(lines(lo), struck('五', '两', '三', '十', '五', '万', '七', '两', '五', '四', '日', '甲'));
});

test('R4-02: struck figures 4, 5, 14, 47 and −5 are listed after a re-flow; the re-flow alone adds no line', { skip }, async () => {
  const r = await run('probe8-R4-02-before.pdf', 'probe8-R4-02-s-n62.pdf');
  assert.deepEqual(lines(r), struck('0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '14', '47', '88', '−5', '1.5'));
  const c = await run('probe8-R4-02-before.pdf', 'probe8-R4-02-c-n62.pdf');
  assert.deepEqual(list(c.changes), ['Added 10 words']);
  // LibreOffice Writer, Liberation Serif 11 pt: 45, 5, 3 and 6 were missing.
  const lo = await run('probe8-R4-02-lo-before.pdf', 'probe8-R4-02-lo-s1.pdf');
  assert.deepEqual(lines(lo), struck('4', '45', '5', '8', '9', '−5', '3', '14', '2', '6'));
});

test('R4-03: a strike through glyphs already dense at its rows is listed (8, 88, fee, see; agreed in Caladea)', { skip }, async () => {
  const r = await run('probe8-R4-03-before.pdf', 'probe8-R4-03-s.pdf');
  assert.deepEqual(lines(r), struck('fee', 'eight', 'agreed', 'exceed', '8', '88', 'one', 'see', '98', 'executed'));
  const cal = await run('probe8-R4-03-caladea-before.pdf', 'probe8-R4-03-caladea-s.pdf');
  assert.deepEqual(lines(cal), struck('Six', '30', 'agreed', 'by post', 'agreement', 'ten', '48', '8'));
});

test('R4-08: a strike and an underline in grey or coloured text are listed; a grey footnote is no longer "no differences"', { skip }, async () => {
  // Text in #333, #555, #666, #777, #888, #9a9a9a, blue and green: only the
  // #333 strike and six underlines were listed.
  const r = await run('probe8-R4-08-ink-before.pdf', 'probe8-R4-08-ink-after.pdf');
  assert.deepEqual(lines(r), Array.from({ length: 8 }, () => [...struck('60 days'), ...underlined('annual')]).flat());
  const grey = await run('probe8-R4-08-grey-before.pdf', 'probe8-R4-08-grey-after.pdf');
  assert.deepEqual(list(grey.changes), [...struck('60 days'), ...underlined('annual')]);
  const ctrl = await run('probe8-R4-08-grey-before.pdf', 'probe8-R4-08-grey-ctrl.pdf');
  assert.deepEqual(list(ctrl.changes), []);
});

test('R4-10: strikes and underlines on short words whose estimated box lies beside the glyphs (Carlito) are listed', { skip }, async () => {
  // Chromium writes one run per line; the word boxes, estimated with
  // Helvetica widths, drift 2–3 pt off the Carlito glyphs. Before: "No
  // differences found." for 20 struck figures, and “six” and “4” missing.
  const r = await run('probe8-R4-10-before.pdf', 'probe8-R4-10-s.pdf');
  // 4, 6 and 8 lie further off than their own width: still missed (a limit).
  assert.deepEqual(lines(r), struck('0', '1', '2', '3', '5', '7', '9', '10', '14', '47', '88', '−5', '1.5'));
  const c = await run('probe8-R4-10-before.pdf', 'probe8-R4-10-c-n25.pdf');
  assert.deepEqual(list(c.changes), ['Added 10 words']);
  const u = await run('probe8-R4-10-ch11-before.pdf', 'probe8-R4-10-ch11-u.pdf');
  assert.deepEqual(lines(u), underlined('4', 'six', '1,250.00', '10', 'terminate', 'logged', '12'));
});

test('R4-V01, R4-15, R4-14: in lines set solid, a strike above an inserted word is listed and the next line is no underline', { skip }, async () => {
  // CJK at line height 1.0: 14 pt boxes 11 pt apart. Before: 'Struck
  // through: “公司”' was missing, and six false underline items came from
  // the inserted words on the next lines.
  const both = await run('probe8-R4-V01-before.pdf', 'probe8-R4-V01-both.pdf');
  assert.deepEqual(list(both.changes), [
    'Text colour or weight changed',
    'Added “未提交”',
    'Underlined: “负责人”',
    'Added “加班”',
    'Struck through: “公司”',
    'Added “准时”',
    'Text colour or weight changed',
    'Added “清单”',
  ]);
  const ins = await run('probe8-R4-V01-before.pdf', 'probe8-R4-V01-ins.pdf');
  assert.deepEqual(list(ins.changes), ['Added “未提交”', 'Added “加班”', 'Added “准时”', 'Added “清单”']);
  // R4-15: 部 above 本 (turned blue) after a re-flow: no "Underline removed".
  const pitch = await run('probe8-R4-15-before.pdf', 'probe8-R4-15-after-reflow.pdf');
  assert.deepEqual(list(pitch.changes), ['Added “修订：补充体检时间。”', 'Text colour or weight changed', 'Text colour or weight changed', 'Text colour or weight changed']);
  const ctrl = await run('probe8-R4-15-before.pdf', 'probe8-R4-15-ctrl-reflow.pdf');
  assert.deepEqual(list(ctrl.changes), ['Added “修订：补充体检时间。”']);
  // R4-14: Latin at line height 1.0, "refundable" inserted under the
  // underlined "deposit": the inserted word is no overlay of the word above.
  const tight = await run('probe8-R4-14-before.pdf', 'probe8-R4-14-after.pdf');
  assert.deepEqual(list(tight.changes), ['Underlined: “deposit”', 'Added “refundable”']);
});

test('R4-17: a box drawn around words is a graphic, not an underline', { skip }, async () => {
  const r = await run('probe8-R4-17-before.pdf', 'probe8-R4-17-box.pdf');
  assert.deepEqual(list(r.changes), ['Graphic or image added']);
  // reportlab: red 0.8 pt rectangles around six phrases, 1–4 pt below the baseline.
  const rl = await run('probe8-R4-17-rl-before.pdf', 'probe8-R4-17-rl-box.pdf');
  assert.deepEqual(lines(rl), []);
  assert.ok(rl.changes.length > 0 && rl.changes.every((c) => describeChange('en', c) === 'Graphic or image added'), list(rl.changes).join(' | '));
});

test('R7-V01: a stamp whose border crosses words adds no line; an underline and a strike under it are listed', { skip }, async () => {
  const r = await run('probe8-R7-V01-before.pdf', 'probe8-R7-V01-after.pdf');
  assert.deepEqual(lines(r), []);
  assert.equal(r.changes.filter((c) => describeChange('en', c) === 'Graphic or image added').length, 1);
  const ctl = await run('probe8-R7-V01-before.pdf', 'probe8-R7-V01-ctl.pdf');
  assert.deepEqual(list(ctl.changes), ['Graphic or image added']);
  // Counter-probe: "above" underlined and "account" struck, both crossed by
  // the stamp's border.
  const cp = await run('probe8-R7-V01-cp-before.pdf', 'probe8-R7-V01-cp-mark.pdf');
  assert.deepEqual(lines(cp), [...underlined('above'), ...struck('account')]);
});

test('R4-22: the second stroke of a double underline is part of the underline, not a graphic of its own', { skip }, async () => {
  // LibreOffice Calc, every cell ruled: "380.00" double underlined.
  // Before: also "Graphic or image added" for the lower stroke.
  const r = await run('probe8-R4-22-before.pdf', 'probe8-R4-22-marks.pdf');
  assert.deepEqual(list(r.changes), [
    ...underlined('192.00'),
    ...struck('1,040.00'),
    ...underlined('380.00'),
    ...underlined('120.00'),
    ...struck('75.00'),
    ...underlined('510.00'),
  ]);
  const twice = r.changes[2];
  assert.ok(twice.new.rects.some((q) => q.rect.y > 158 && q.rect.h <= 4), JSON.stringify(twice.new.rects));
  // LibreOffice Writer double underlines (a run split at the underlined
  // amount, so the two versions' boxes lie 1.4 pt apart): one item each.
  const w = await run('probe8-R4-22-writer-before.pdf', 'probe8-R4-22-writer-after.pdf');
  assert.deepEqual(list(w.changes), underlined('784.00', '4,704.00'));
});

test('R6-05, R7-05: a page turned by /Rotate gives no strike or underline on its figures and short words', { skip }, async () => {
  // Before (fix round 7): "Strikethrough removed: “44”" on a page turned by
  // 90°, "Struck through: “is”" twice on one turned by 180°, and 50 items on
  // a Chinese notice turned by 180°.
  const q = await run('probe8-R6-05-old.pdf', 'probe8-R6-05-new90.pdf');
  assert.deepEqual(list(q.changes), ['Page size changed: 595 × 842 pt → 842 × 595 pt']);
  const h = await run('probe8-R7-05-before.pdf', 'probe8-R7-05-after.pdf');
  assert.deepEqual(list(h.changes), ['Page turned by 180°']);
  const cjk = await run('probe8-R7-05-cjk-before.pdf', 'probe8-R7-05-cjk-after.pdf');
  assert.deepEqual(list(cjk.changes), ['Page turned by 180°']);
});

test('a tracked deletion struck through in the reviewer colour is one strike, not strikes and colour changes by turns (round 4)', { skip }, async () => {
  // The pale red strike through the deleted paragraph is a little fainter
  // on some words: they were listed as colour changes between the struck
  // ones (eleven items for one deletion).
  const r = await compare(`${cases}holdout4-e-docx-retention-redline/before.pdf`, `${cases}holdout4-e-docx-retention-redline/after.pdf`);
  const marks = r.changes.filter((c) => c.format?.appearanceChanged && c.new.pages[0] === 0);
  assert.deepEqual(list(marks), ['Struck through: “Paper records may be scanned an…”']);
  assert.equal(marks[0].new.text, 'Paper records may be scanned and the paper copy destroyed after a quality check of a sample of the scanned batch');
});

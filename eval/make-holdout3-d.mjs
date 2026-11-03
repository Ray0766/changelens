#!/usr/bin/env node
// Blind held-out set 3, author "d": production and layout variety.
// Writes eval/cases/holdout3-d-<id>/{before.pdf,after.pdf,truth.json}.
//
// Six document pairs from four producers:
//   LibreOffice Impress (flat ODP -> PDF), LibreOffice Writer (flat ODT -> PDF),
//   reportlab (eval/holdout3-d/lake_report.py, vector charts and a raster plate),
//   Chromium via Playwright (HTML -> PDF).
// Every project, place, organisation, person and figure is SYNTHETIC
// (invented); each document says "Synthetic sample" on its first page and,
// except for full-page plates, in the footer.
// Written without looking at the engine, its tests or its evaluation results.
//
// Run:  NODE_PATH=/opt/node-tools/node_modules node eval/make-holdout3-d.mjs [case-id ...]
// Needs: soffice (LibreOffice 24.x), python3 with reportlab 5, Pillow and numpy,
// Playwright's Chromium, and the fonts Carlito, Liberation Sans/Serif,
// DejaVu Sans and WenQuanYi Zen Hei. "Calibri" must NOT be installed: the
// rate-card case relies on LibreOffice substituting Carlito for it.
//
// truth.json items: { type, old?, new?, oldPage?, newPage?, oldRect?, newRect?, maxItems?, note? }
// Pages are 1-based; rects are [x, y, w, h] in PDF points, top-left origin.
// Only deliberate edits are listed. Consequences (re-flow, page breaks moving,
// page numbers, renumbering) are described in "description" but not listed.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, 'cases');
const helpers = join(here, 'holdout3-d');
const AUTHOR = 'd';
const only = process.argv.slice(2);
const work = mkdtempSync(join(tmpdir(), 'holdout3-d-'));
const profile = join(work, 'lo-profile');

const r1 = (n) => Math.round(n * 10) / 10;

const cases = [];
const add = (c) => cases.push({ ...c, id: `holdout3-${AUTHOR}-${c.id}` });

// Convert flat ODF files with LibreOffice; returns the PDF paths.
function soffice(files) {
  const out = join(work, 'lo-out');
  mkdirSync(out, { recursive: true });
  execFileSync('soffice', [`-env:UserInstallation=file://${profile}`, '--headless', '--convert-to', 'pdf', '--outdir', out, ...files], { stdio: ['ignore', 'pipe', 'pipe'] });
  return files.map((f) => join(out, f.split('/').pop().replace(/\.\w+$/, '.pdf')));
}

const ODF_NS = [
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"',
  'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"',
  'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"',
  'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"',
  'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"',
  'xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0"',
  'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"',
  'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"',
].join(' ');

// ===========================================================================
// 1. Slide deck, LibreOffice Impress (16:9, 28 cm x 15.75 cm = 793.7 x 446.5 pt)
//    Steering-group update for an invented tram project. 7 -> 8 slides.
//    Edits: a spending figure on slide 2; the colour of one status dot on
//    slide 3 (amber -> green); one bar of the vector bar chart on slide 4 is
//    taller (consistent with the new figure on slide 2); a whole slide is
//    inserted as slide 5; one month on old slide 5 (new 6) and one date on
//    old slide 6 (new 7) change. Slide numbers 5-7 become 6-8: consequence.
// ===========================================================================
{
  const CM = 72 / 2.54;
  const rect = (x, y, w, h) => [x, y, w, h].map((v) => r1(v * CM));
  const font = 'Carlito';
  const colours = new Set();
  const fill = (c) => { colours.add(c); return `f${c.slice(1)}`; };
  const P = {
    title: 'fo:font-size="28pt" fo:font-weight="bold" fo:color="#12263a"',
    hero: 'fo:font-size="40pt" fo:font-weight="bold" fo:color="#12263a"',
    sub: 'fo:font-size="22pt" fo:color="#2c4a63"',
    body: 'fo:font-size="20pt" fo:color="#1f2933"',
    row: 'fo:font-size="18pt" fo:color="#1f2933"',
    small: 'fo:font-size="13pt" fo:color="#52606d"',
    head: 'fo:font-size="12pt" fo:font-weight="bold" fo:color="#52606d"',
    foot: 'fo:font-size="9pt" fo:color="#7b8794"',
  };
  const para = (style, text, align = 'start') => `<text:p text:style-name="P_${style}_${align}">${text}</text:p>`;
  const box = (x, y, w, h, inner) => `<draw:frame draw:style-name="gtext" svg:x="${x}cm" svg:y="${y}cm" svg:width="${w}cm" svg:height="${h}cm"><draw:text-box>${inner}</draw:text-box></draw:frame>`;
  const shape = (kind, x, y, w, h, c) => `<draw:${kind} draw:style-name="${fill(c)}" svg:x="${x}cm" svg:y="${y}cm" svg:width="${w}cm" svg:height="${h}cm"/>`;
  const hline = (x1, x2, y, c = '#d5dbe1') => `<draw:line draw:style-name="grid" svg:x1="${x1}cm" svg:y1="${y}cm" svg:x2="${x2}cm" svg:y2="${y}cm"/>`;
  const bullets = (items, style = 'body') => `<text:list text:style-name="L1">${items.map((t) => `<text:list-item>${para(style, t)}</text:list-item>`).join('')}</text:list>`;
  const titleOf = (t) => box(1.6, 1.0, 24.8, 1.6, para('title', t)) + shape('rect', 1.6, 2.75, 2.6, 0.14, '#0f8b8d');

  const STATUS = { green: '#2e8b57', amber: '#e0a100', red: '#c8372d' };
  const workstreams = [
    ['Utility diversions', 'green', 'Complete; final inspection booked for October'],
    ['Track works', 'red', 'Second rail delivery delayed by the supplier'],
    ['Overhead line', 'amber', 'Bridge section design under review'],
    ['Tram stops', 'green', 'Five of seven platforms poured'],
    ['Depot extension', 'amber', 'Ground survey received; no piling changes needed'],
  ];
  const rowY = (i) => 4.25 + i * 1.65;
  const dot = { x: 9.6, size: 0.8 };
  const chart = { x0: 3.2, x1: 26.2, base: 12.4, perUnit: 0.42, slot: 4.6, barW: 2.2 };
  const spend = (v) => [['Utility diversions', 9.8], ['Track works', v.track], ['Overhead line', 5.1], ['Tram stops', 7.9], ['Depot extension', 3.8]];
  const barRect = (i, value) => {
    const h = value * chart.perUnit;
    return [chart.x0 + i * chart.slot + (chart.slot - chart.barW) / 2, chart.base - h, chart.barW, h];
  };

  const deck = (v) => {
    const slides = [];
    slides.push([
      shape('rect', 0, 0, 28, 15.75, '#f3f6f8'),
      shape('rect', 1.6, 4.2, 0.25, 4.6, '#0f8b8d'),
      box(2.4, 4.0, 23, 2.2, para('hero', 'Harbour Line tram extension')),
      box(2.4, 6.2, 23, 1.2, para('sub', 'Steering group update · Q3 2027')),
      box(2.4, 7.6, 23, 1.0, para('small', 'Project delivery office, Port Calder · meeting of 12 October 2027')),
      box(2.4, 11.6, 23, 1.0, para('small', 'Synthetic sample: the project, the city, the people and all figures are invented.')),
    ]);
    slides.push([titleOf('Summary'), box(1.6, 3.6, 24.8, 9.5, bullets([
      'Track laying on the Quay Street section is six weeks behind plan.',
      `Spending to the end of September: £${v.spent} m of the £118.5 m budget.`,
      'Utility diversions on Ferry Road finished in August, two weeks early.',
      'The planning committee approved the design of the Calder Market stop.',
    ]))]);
    slides.push([
      titleOf('Status by workstream'),
      box(1.6, 3.35, 7, 0.7, para('head', 'WORKSTREAM')),
      box(8.9, 3.35, 2.2, 0.7, para('head', 'STATUS', 'center')),
      box(11.4, 3.35, 14, 0.7, para('head', 'COMMENT')),
      ...workstreams.flatMap(([name, status, comment], i) => {
        const s = i === 4 ? v.depot : status;
        return [
          hline(1.6, 26.4, rowY(i) - 0.2),
          box(1.6, rowY(i), 7.2, 1.1, para('row', name)),
          shape('ellipse', dot.x, rowY(i) + 0.12, dot.size, dot.size, STATUS[s]),
          box(11.4, rowY(i), 15, 1.1, para('row', comment)),
        ];
      }),
      hline(1.6, 26.4, rowY(5) - 0.2),
      ...['green', 'amber', 'red'].flatMap((s, i) => [
        shape('ellipse', 1.6 + i * 4.2, 13.25, 0.45, 0.45, STATUS[s]),
        box(2.25 + i * 4.2, 13.1, 3.6, 0.8, para('small', { green: 'On track', amber: 'At risk', red: 'Late' }[s])),
      ]),
    ]);
    slides.push([
      titleOf('Spending by workstream to the end of September (£ m)'),
      ...[0, 5, 10, 15, 20].flatMap((t) => [
        hline(chart.x0, chart.x1, chart.base - t * chart.perUnit, t === 0 ? '#7b8794' : '#d5dbe1'),
        box(1.4, chart.base - t * chart.perUnit - 0.36, 1.5, 0.7, para('small', String(t), 'end')),
      ]),
      ...spend(v).flatMap(([name, value], i) => {
        const [x, y, w, h] = barRect(i, value);
        return [
          shape('rect', x, y, w, h, '#2c6e9b'),
          box(chart.x0 + i * chart.slot, chart.base + 0.2, chart.slot, 1.3, para('small', name, 'center')),
        ];
      }),
      box(14, 13.7, 12.2, 0.7, para('foot', 'Source: project ledger, 30 September 2027', 'end')),
    ]);
    if (v.cr) {
      slides.push([titleOf('Change request CR-12: extra stop at Quay Street'), box(1.6, 3.6, 24.8, 9.5, bullets([
        'Adds a stop between Calder Market and Ferry Road for the new housing at Quay Street.',
        'Estimated cost £2.4 m, to be funded from the project contingency.',
        'Decision requested from the steering group at this meeting.',
      ]))]);
    }
    slides.push([titleOf('Top risks'), box(1.6, 3.6, 24.8, 9.5, bullets([
      `Rail supply: the second delivery may slip to ${v.month}.`,
      'Bridge section: the rail operator must approve the overhead line fixings.',
      'Night works: noise complaints could limit working hours on Ferry Road.',
      'Land: one lease at the depot site is not yet signed.',
    ]))]);
    slides.push([titleOf('Next steps'), box(1.6, 3.6, 24.8, 9.5, bullets([
      `Recovery plan for the track works to the steering group on ${v.planDay} November.`,
      'Public drop-in sessions at the Calder Market library in the first week of November.',
      'Briefing for contractors on the night-work rules before work restarts on Ferry Road.',
      'Next steering group meeting: 9 January 2028.',
    ]))]);
    slides.push([titleOf('Contacts'), box(1.6, 3.6, 24.8, 9.5, bullets([
      'Project director: Ana Ferreira-Holm',
      'Delivery office: harbourline@portcalder.example',
      'Questions on this update can be sent to the delivery office before the meeting.',
    ]))]);

    const pstyles = [];
    for (const [k, props] of Object.entries(P)) for (const align of ['start', 'center', 'end']) {
      pstyles.push(`<style:style style:name="P_${k}_${align}" style:family="paragraph"><style:paragraph-properties fo:text-align="${align}" fo:margin-bottom="${k === 'body' ? '0.35cm' : '0cm'}"/><style:text-properties style:font-name="${font}" ${props}/></style:style>`);
    }
    const gstyles = [...colours].map((c) => `<style:style style:name="f${c.slice(1)}" style:family="graphic"><style:graphic-properties draw:stroke="none" draw:fill="solid" draw:fill-color="${c}"/></style:style>`);
    return `<?xml version="1.0" encoding="UTF-8"?>
<office:document ${ODF_NS} office:version="1.3" office:mimetype="application/vnd.oasis.opendocument.presentation">
<office:font-face-decls><style:font-face style:name="${font}" svg:font-family="${font}" style:font-family-generic="swiss"/></office:font-face-decls>
<office:automatic-styles>
<style:page-layout style:name="PM1"><style:page-layout-properties fo:margin-top="0cm" fo:margin-bottom="0cm" fo:margin-left="0cm" fo:margin-right="0cm" fo:page-width="28cm" fo:page-height="15.75cm" style:print-orientation="landscape"/></style:page-layout>
<style:style style:name="dp1" style:family="drawing-page"><style:drawing-page-properties draw:fill="solid" draw:fill-color="#ffffff" presentation:background-visible="true" presentation:background-objects-visible="true"/></style:style>
<style:style style:name="gtext" style:family="graphic"><style:graphic-properties draw:stroke="none" draw:fill="none" draw:textarea-vertical-align="top" fo:padding-top="0cm" fo:padding-bottom="0cm" fo:padding-left="0cm" fo:padding-right="0cm" draw:auto-grow-height="false" fo:wrap-option="wrap"/></style:style>
<style:style style:name="grid" style:family="graphic"><style:graphic-properties draw:stroke="solid" svg:stroke-color="#d5dbe1" svg:stroke-width="0.03cm" draw:fill="none"/></style:style>
${gstyles.join('\n')}
${pstyles.join('\n')}
<text:list-style style:name="L1"><text:list-level-style-bullet text:level="1" text:bullet-char="●"><style:list-level-properties text:space-before="0cm" text:min-label-width="0.9cm"/><style:text-properties fo:font-family="${font}" fo:color="#0f8b8d" fo:font-size="70%"/></text:list-level-style-bullet></text:list-style>
</office:automatic-styles>
<office:master-styles><style:master-page style:name="Default" style:page-layout-name="PM1" draw:style-name="dp1"/></office:master-styles>
<office:body><office:presentation>
${slides.map((s, i) => `<draw:page draw:name="slide${i + 1}" draw:style-name="dp1" draw:master-page-name="Default">${s.join('\n')}
${box(1.6, 14.75, 20, 0.6, para('foot', 'Synthetic sample · Harbour Line steering group update · Q3 2027'))}
${box(24.4, 14.75, 2, 0.6, para('foot', String(i + 1), 'end'))}</draw:page>`).join('\n')}
</office:presentation></office:body></office:document>`;
  };

  const before = { spent: '41.2', depot: 'amber', track: 14.6, cr: false, month: 'January', planDay: '14' };
  const after = { spent: '43.9', depot: 'green', track: 17.3, cr: true, month: 'February', planDay: '28' };
  const dotRect = rect(dot.x, rowY(4) + 0.12, dot.size, dot.size);
  const oldBar = barRect(1, before.track);
  const newBar = barRect(1, after.track);
  add({
    id: 'impress-steering-deck',
    producer: 'LibreOffice Impress 24.2 (flat ODP -> PDF), 16:9 slides',
    description: 'Synthetic. Steering-group slide deck for an invented tram project, exported from LibreOffice Impress (7 -> 8 landscape slides, drawn shapes for the status dots and the bar chart). Edits: the spending figure on slide 2 (41.2 -> 43.9); the status dot of "Depot extension" on slide 3 changes colour from amber to green (its comment is unchanged); on slide 4 the "Track works" bar of the vector bar chart is taller (14.6 -> 17.3 on the axis, no value label; consistent with slide 2); a new slide 5 "Change request CR-12" is inserted (title and three bullets); on old slide 5 / new slide 6 "January" becomes "February"; on old slide 6 / new slide 7 the date 14 November becomes 28 November. Not edits: the slide numbers in the footer of old slides 5-7 change to 6-8.',
    kind: 'odf', ext: 'fodp', before: deck(before), after: deck(after),
    truth: [
      { type: 'number', old: '41.2', new: '43.9', oldPage: 2, newPage: 2 },
      { type: 'graphic', oldPage: 3, newPage: 3, oldRect: dotRect, newRect: dotRect, note: 'Status dot of "Depot extension" recoloured from amber to green; no text changed.' },
      { type: 'graphic', oldPage: 4, newPage: 4, oldRect: rect(oldBar[0], newBar[1], oldBar[2], newBar[3]), newRect: rect(...newBar), note: 'The "Track works" bar is taller (14.6 -> 17.3 on the axis). Rect = the new bar; the old bar is the lower part of it.' },
      { type: 'insert', new: 'Change request CR-12', newPage: 5, maxItems: 4, note: 'A whole slide is inserted (title and three bullets); it may legitimately be reported as one item per text block.' },
      { type: 'replace', old: 'January', new: 'February', oldPage: 5, newPage: 6 },
      { type: 'number', old: '14 November', new: '28 November', oldPage: 6, newPage: 7, note: 'Only the day changes (14 -> 28); the month is included because "28" also occurs in "2028" on the slide.' },
    ],
  });
}

// ---------------------------------------------------------------------------
// Flat ODT (Writer) skeleton shared by cases 2 and 6.
// ---------------------------------------------------------------------------
const fodt = ({ fonts, styles, auto = '', masters, body }) => `<?xml version="1.0" encoding="UTF-8"?>
<office:document ${ODF_NS} office:version="1.3" office:mimetype="application/vnd.oasis.opendocument.text">
<office:font-face-decls>${fonts.map((f) => `<style:font-face style:name="${f}" svg:font-family="'${f}'"/>`).join('')}</office:font-face-decls>
<office:styles>${styles}</office:styles>
<office:automatic-styles>${auto}</office:automatic-styles>
<office:master-styles>${masters}</office:master-styles>
<office:body><office:text>${body}</office:text></office:body></office:document>`;
const pstyle = (name, props, text = '', extra = '', tabs = '') => `<style:style style:name="${name}" style:family="paragraph" ${extra}><style:paragraph-properties ${props}>${tabs ? `<style:tab-stops>${tabs}</style:tab-stops>` : ''}</style:paragraph-properties><style:text-properties ${text}/></style:style>`;
const tabStop = (pos, type = 'right', leader = false) => `<style:tab-stop style:position="${pos}" style:type="${type}"${leader ? ' style:leader-style="dotted" style:leader-text="."' : ''}/>`;

// ===========================================================================
// 2. Methods report, LibreOffice Writer (A4, 8 pages -> 8 pages)
//    Title page, a contents page with dot leaders (level 1 and 2 entries),
//    one section per page, numbered footnotes with superscript markers.
//    Edits: a figure in footnote 2 (34.1 -> 31.4); "two reminders" -> "one
//    reminder" (page 4); a sentence on page 5 is struck through (words kept);
//    a sentence on page 6 is deleted; a new footnote 7 (marker and note) on
//    page 7. Every section starts on a new page and no section overflows, so
//    the contents page and all page numbers stay the same.
// ===========================================================================
{
  const SERIF = 'Liberation Serif';
  const SANS = 'Liberation Sans';
  const styles = [
    `<style:default-style style:family="paragraph"><style:paragraph-properties fo:hyphenation-ladder-count="no-limit" style:writing-mode="lr-tb"/><style:text-properties style:font-name="${SERIF}" fo:font-size="11pt" fo:language="en" fo:country="GB" fo:hyphenate="false"/></style:default-style>`,
    pstyle('Standard', 'fo:margin-top="0cm" fo:margin-bottom="0.22cm" fo:line-height="128%" fo:text-align="justify"'),
    pstyle('Title', 'fo:margin-top="6cm" fo:margin-bottom="0.4cm"', `style:font-name="${SANS}" fo:font-size="26pt" fo:font-weight="bold" fo:color="#15324b"`, 'style:parent-style-name="Standard" style:master-page-name="First"'),
    pstyle('Subtitle', 'fo:margin-bottom="1.6cm" fo:text-align="start"', `style:font-name="${SANS}" fo:font-size="16pt" fo:color="#3b5b75"`, 'style:parent-style-name="Standard"'),
    pstyle('Imprint', 'fo:margin-bottom="0.15cm" fo:text-align="start"', `style:font-name="${SANS}" fo:font-size="10pt" fo:color="#3b4651"`, 'style:parent-style-name="Standard"'),
    pstyle('ContentsHeading', 'fo:margin-bottom="0.6cm" fo:text-align="start"', `style:font-name="${SANS}" fo:font-size="16pt" fo:font-weight="bold" fo:color="#15324b"`, 'style:parent-style-name="Standard" style:master-page-name="Standard"'),
    pstyle('Heading_20_1', 'fo:break-before="page" fo:margin-bottom="0.45cm" fo:text-align="start" fo:keep-with-next="always"', `style:font-name="${SANS}" fo:font-size="16pt" fo:font-weight="bold" fo:color="#15324b"`, 'style:display-name="Heading 1" style:parent-style-name="Standard" style:default-outline-level="1"'),
    pstyle('Heading_20_2', 'fo:margin-top="0.35cm" fo:margin-bottom="0.2cm" fo:text-align="start" fo:keep-with-next="always"', `style:font-name="${SANS}" fo:font-size="12pt" fo:font-weight="bold" fo:color="#15324b"`, 'style:display-name="Heading 2" style:parent-style-name="Standard" style:default-outline-level="2"'),
    pstyle('Contents_20_1', 'fo:margin-top="0.25cm" fo:margin-bottom="0.1cm" fo:text-align="start"', `style:font-name="${SANS}" fo:font-size="11pt" fo:font-weight="bold"`, 'style:display-name="Contents 1" style:parent-style-name="Standard"', tabStop('16cm', 'right', true)),
    pstyle('Contents_20_2', 'fo:margin-left="0.8cm" fo:margin-bottom="0.1cm" fo:text-align="start"', `style:font-name="${SERIF}" fo:font-size="11pt"`, 'style:display-name="Contents 2" style:parent-style-name="Standard"', tabStop('15.2cm', 'right', true)),
    pstyle('Term', 'fo:margin-left="0.6cm" fo:text-indent="-0.6cm" fo:margin-bottom="0.25cm"', '', 'style:parent-style-name="Standard"'),
    pstyle('Footnote', 'fo:margin-left="0.45cm" fo:text-indent="-0.45cm" fo:margin-bottom="0.08cm" fo:line-height="115%" fo:text-align="start"', 'fo:font-size="9pt"', 'style:parent-style-name="Standard"'),
    pstyle('Header', 'fo:text-align="end" fo:margin-bottom="0cm"', `style:font-name="${SANS}" fo:font-size="8.5pt" fo:color="#6b7782"`, 'style:parent-style-name="Standard"'),
    pstyle('Footer', 'fo:text-align="start" fo:margin-bottom="0cm"', `style:font-name="${SANS}" fo:font-size="8.5pt" fo:color="#6b7782"`, 'style:parent-style-name="Standard"', tabStop('16cm')),
    '<style:style style:name="Footnote_20_anchor" style:display-name="Footnote anchor" style:family="text"><style:text-properties style:text-position="super 58%"/></style:style>',
    '<style:style style:name="Footnote_20_Symbol" style:display-name="Footnote Symbol" style:family="text"><style:text-properties style:text-position="super 58%"/></style:style>',
    '<style:style style:name="Strong" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style>',
    '<text:notes-configuration text:note-class="footnote" text:citation-style-name="Footnote_20_Symbol" text:citation-body-style-name="Footnote_20_anchor" style:num-format="1" text:start-value="0" text:footnotes-position="page" text:start-numbering-at="document"/>',
  ].join('\n');
  const auto = `<style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm" fo:margin-top="1.3cm" fo:margin-bottom="1.3cm" fo:margin-left="2.5cm" fo:margin-right="2.5cm"><style:footnote-sep style:width="0.018cm" style:distance-before-sep="0.2cm" style:distance-after-sep="0.15cm" style:line-style="solid" style:adjustment="left" style:rel-width="25%" style:color="#6b7782"/></style:page-layout-properties>
    <style:header-style><style:header-footer-properties fo:min-height="0.5cm" fo:margin-bottom="0.9cm"/></style:header-style>
    <style:footer-style><style:header-footer-properties fo:min-height="0.5cm" fo:margin-top="0.9cm"/></style:footer-style></style:page-layout>
    <style:page-layout style:name="pm0"><style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm" fo:margin-top="2cm" fo:margin-bottom="2cm" fo:margin-left="2.5cm" fo:margin-right="2.5cm"/></style:page-layout>
    <style:style style:name="Strike" style:family="text"><style:text-properties style:text-line-through-style="solid" style:text-line-through-type="single"/></style:style>`;
  const masters = `<style:master-page style:name="First" style:page-layout-name="pm0" style:next-style-name="Standard"/>
    <style:master-page style:name="Standard" style:page-layout-name="pm1">
      <style:header><text:p text:style-name="Header">Lindenfeld Household Travel Survey 2027 · Methods report</text:p></style:header>
      <style:footer><text:p text:style-name="Footer">Synthetic sample<text:tab/>Page <text:page-number text:select-page="current">1</text:page-number></text:p></style:footer>
    </style:master-page>`;
  let fnNo = 0;
  const fn = (t) => { fnNo += 1; return `<text:note text:id="ftn${fnNo}" text:note-class="footnote"><text:note-citation>${fnNo}</text:note-citation><text:note-body><text:p text:style-name="Footnote">${t}</text:p></text:note-body></text:note>`; };
  const p = (t, s = 'Standard') => `<text:p text:style-name="${s}">${t}</text:p>`;
  const h1 = (t) => `<text:h text:style-name="Heading_20_1" text:outline-level="1">${t}</text:h>`;
  const h2 = (t) => `<text:h text:style-name="Heading_20_2" text:outline-level="2">${t}</text:h>`;
  const toc = [
    [1, '1 Purpose of the survey', 3], [2, '1.1 Who commissioned the survey', 3],
    [1, '2 Sampling and fieldwork', 4], [2, '2.1 Sample design', 4], [2, '2.2 Fieldwork', 4],
    [1, '3 Questionnaire', 5], [2, '3.1 Pre-test', 5],
    [1, '4 Weighting and estimation', 6], [2, '4.1 Estimates and margins of error', 6],
    [1, '5 Data quality', 7], [2, '5.1 Item non-response', 7],
    [1, 'Annex A Definitions', 8],
  ];
  const doc = (v) => {
    fnNo = 0;
    const term = (t, d) => p(`<text:span text:style-name="Strong">${t}</text:span>: ${d}`, 'Term');
    const body = [
      p('Lindenfeld Household Travel Survey 2027', 'Title'),
      p('Methods report', 'Subtitle'),
      p('Lindenfeld Transport Office · Version 1.1 · March 2028', 'Imprint'),
      p('Synthetic sample: the town, the survey and all figures in this report are invented.', 'Imprint'),
      p('Contents', 'ContentsHeading'),
      `<text:table-of-content text:name="Contents" text:protected="true"><text:table-of-content-source text:outline-level="2"/><text:index-body>${toc.map(([lvl, t, pg]) => p(`${t}<text:tab/>${pg}`, `Contents_20_${lvl}`)).join('')}</text:index-body></text:table-of-content>`,

      h1('1 Purpose of the survey'),
      p('The Household Travel Survey describes how residents of Lindenfeld travel on an ordinary day: how many trips they make, for what purpose, how far they go and which means of transport they use. The results feed the municipal transport plan, the annual cycling report and the forecasts for the regional bus network.'),
      p(`The 2027 survey is the third in the series. It repeats the core questions of the earlier rounds so that trends can be followed, and adds questions on working from home and on the use of shared e-scooters.${fn('The earlier rounds took place in 2017 and 2022. The 2022 questionnaire was shortened because of the pandemic, so some of its results are not directly comparable.')}`),
      p('This report documents how the survey was carried out. It is written for analysts who use the data and for readers who want to judge how far the published figures can be trusted. The results themselves are published separately.'),
      h2('1.1 Who commissioned the survey'),
      p('The survey was commissioned by the Lindenfeld Transport Office and funded jointly with the regional transport authority. Fieldwork was carried out by an external research contractor under a framework agreement; the Transport Office kept responsibility for the questionnaire, the weighting and the publication of results.'),

      h1('2 Sampling and fieldwork'),
      h2('2.1 Sample design'),
      p(`A random sample of 5,930 addresses was drawn from the municipal address register, stratified by the twelve town districts. Districts with fewer residents were oversampled so that each district has at least 300 responding households.${fn(`Of the 5,930 invited households, 1,862 completed the questionnaire, a response rate of ${v.rate} %.`)}`),
      p('Each household was assigned a travel day between Tuesday and Thursday. Mondays, Fridays and public holidays were excluded because travel on those days differs from the typical working week.'),
      h2('2.2 Fieldwork'),
      p(`Fieldwork ran from 12 April to 30 June 2027.${fn('Fieldwork was paused from 22 to 26 May because of the regional holiday week.')} Invited households received a letter with a personal code for the online questionnaire. Paper questionnaires were sent to households that had not responded after ${v.reminders}.`),
      p('A telephone helpline was open on weekdays. Interviews by telephone were offered to residents who could not complete the questionnaire online or on paper.'),

      h1('3 Questionnaire'),
      p('The questionnaire has three parts: a household part, a person part for every member aged six or over, and a trip diary for the assigned travel day. The household part is completed once; the person part and the trip diary are completed for each member.'),
      p(`Most questions were kept from 2022. New questions cover the number of days worked from home in a typical week and the use of shared e-scooters and bicycles.${fn('The full questionnaire, in German and English, is published together with the data set.')} ${v.strike ? '<text:span text:style-name="Strike">' : ''}Questions on car ownership were moved to the end of the questionnaire to reduce drop-outs.${v.strike ? '</text:span>' : ''} The trip diary itself was not changed.`),
      h2('3.1 Pre-test'),
      p('A pre-test with 120 households in two districts was carried out in February 2027. It led to shorter instructions for the trip diary and to a clearer definition of a trip that is interrupted for a short stop.'),

      h1('4 Weighting and estimation'),
      p(`Responses are weighted so that the sample matches the population of Lindenfeld by district, household size, age group and sex.${fn('Population totals are taken from the municipal register on 31 December 2026.')} Weights are first computed for households and then adjusted for persons.`),
      p(`Weights were calibrated by raking over the four margins.${v.sixMembers ? ' Households with more than six members were grouped into one cell.' : ''} Weights larger than five times the mean weight were trimmed, and the remaining weights were rescaled to the population total.`),
      h2('4.1 Estimates and margins of error'),
      p('All published shares and averages are weighted estimates. Margins of error are given at the 95 % level and take the stratified design into account. Figures based on fewer than 50 respondents are marked and should be read with caution.'),

      h1('5 Data quality'),
      p(`Completed questionnaires were checked for missing answers, implausible trip times and trips that do not connect, for example a trip that ends in a different place from where the next one starts.${fn('About 4 % of all reported trips needed a correction of this kind.')} Inconsistent trips were corrected where the answer was clear from the rest of the diary; otherwise they were flagged.`),
      p(`Households that reported no trips at all on the travel day were kept in the data. Their share is similar to that in the 2022 survey.${v.fn7 ? fn('Diaries without any trip on the travel day were checked by telephone with a sample of these households.') : ''}`),
      h2('5.1 Item non-response'),
      p('Item non-response is low for most questions. The question on household income was answered by 78 % of households; for the analysis, missing incomes were imputed from household size, district and employment status.'),

      h1('Annex A Definitions'),
      term('Trip', 'a movement from one place to another for a single purpose. A trip that includes a stop of less than five minutes, for example to drop off a child, counts as one trip.'),
      term('Main mode', 'the means of transport used for the longest distance of a trip.'),
      term('Household', 'all people who live at the same address and share living costs.'),
      term('Travel day', 'the day for which the household reports its trips; one of Tuesday, Wednesday or Thursday.'),
      term('Active modes', 'walking and cycling, including e-bikes with assistance up to 25 km/h.'),
    ].join('\n');
    return fodt({ fonts: [SERIF, SANS], styles, auto, masters, body });
  };
  add({
    id: 'writer-methods-report',
    producer: 'LibreOffice Writer 24.2 (flat ODT -> PDF), A4',
    description: 'Synthetic. Eight-page survey methods report from LibreOffice Writer: title page, a contents page with dot leaders and page numbers, one section per page, numbered footnotes with superscript markers at the page foot, running header and footer. Edits: in footnote 2 on page 4 the response rate 34.1 % is corrected to 31.4 %; on page 4 "two reminders" becomes "one reminder"; on page 5 the sentence about car-ownership questions is struck through (the words stay); on page 6 the sentence about households with more than six members is deleted; on page 7 a new footnote 7 is added (superscript marker after "2022 survey." and the note at the page foot). Not edits: the paragraphs around the edits re-wrap; the contents page, footnotes 1-6 and all page numbers are unchanged because every section starts on a new page.',
    kind: 'odf', ext: 'fodt',
    before: doc({ rate: '34.1', reminders: 'two reminders', strike: false, sixMembers: true, fn7: false }),
    after: doc({ rate: '31.4', reminders: 'one reminder', strike: true, sixMembers: false, fn7: true }),
    truth: [
      { type: 'number', old: '34.1', new: '31.4', oldPage: 4, newPage: 4, note: 'Inside footnote 2 (9 pt, page foot).' },
      { type: 'replace', old: 'two reminders', new: 'one reminder', oldPage: 4, newPage: 4 },
      { type: 'format', old: 'Questions on car ownership were moved to the end of the questionnaire', new: 'Questions on car ownership were moved to the end of the questionnaire', oldPage: 5, newPage: 5, note: 'Sentence struck through (a line through the words); the text itself is unchanged. It may show up as a graphic/line change rather than a font change.' },
      { type: 'delete', old: 'Households with more than six members were grouped into one cell.', oldPage: 6 },
      { type: 'insert', new: 'Diaries without any trip on the travel day were checked by telephone', newPage: 7, maxItems: 2, note: 'New footnote 7: the superscript marker "7" after "2022 survey." and the note text at the page foot. Footnotes 1-6 are not renumbered.' },
    ],
  });
}

// ===========================================================================
// 3. Monitoring report drawn with reportlab (A4, 6 -> 7 pages)
//    Vector bar chart (page 2), a table with zebra shading (page 3), a
//    full-page raster photo plate without any text (page 4), a vector line
//    chart (page 5 -> 6). Edits: one bar of the grouped bar chart is taller;
//    one temperature anomaly changes sign; one table cell gets an amber
//    shading; a second text-less plate (vector depth map) is inserted as new
//    page 5; one point of the oxygen line chart is lower.
// ===========================================================================
{
  let geo;
  add({
    id: 'reportlab-lake-plates',
    producer: 'reportlab 5 (canvas API; vector charts, JPEG photo plate), A4',
    description: 'Synthetic. Six-page water-quality report for an invented lake, drawn with reportlab: page 2 a vector grouped bar chart, page 3 a station table with zebra shading, page 4 a full-page photo plate (raster image, no text, no footer), page 5 a vector line chart, page 6 conclusions. Edits: on page 2 the August bar of station C is taller (no value label); on page 3 the temperature anomaly of station D changes sign (−0.4 -> +0.4) and the Total P cell of station E (38) gets an amber shading, matching the unchanged table note; a new full-page depth-map plate (vector shapes, no text, no footer) is inserted as new page 5; on the oxygen chart (old page 5, new page 6) the point for 3 August is lower (5.2 -> 4.1 mg/l; no value label). Not edits: old pages 5-6 become new pages 6-7 (footer page numbers change); the photo plate on page 4 is identical in both versions.',
    kind: 'custom',
    async build(dir) {
      const out = {};
      for (const v of ['before', 'after']) {
        out[v] = JSON.parse(execFileSync('python3', ['-I', join(helpers, 'lake_report.py'), v, join(dir, `${v}.pdf`)], { encoding: 'utf8' }));
      }
      if (out.before.pages !== 6 || out.after.pages !== 7) throw new Error('lake report: unexpected page count');
      geo = out;
    },
    truth: () => [
      { type: 'graphic', oldPage: 2, newPage: 2, oldRect: geo.before.bar, newRect: geo.after.bar, note: 'Station C, August bar: 18.6 -> 24.1 µg/l on the axis. Rect = full height of the taller (new) bar.' },
      { type: 'number', old: '−0.4', new: '+0.4', oldPage: 3, newPage: 3, note: 'Sign change; U+2212 minus in the old version, plus sign in the new one.' },
      { type: 'graphic', oldPage: 3, newPage: 3, oldRect: geo.before.cell, newRect: geo.after.cell, note: 'Amber background added to the Total P cell of station E; the value 38 is unchanged.' },
      { type: 'graphic', newPage: 5, newRect: geo.after.plate, note: 'Inserted page without any text (vector depth map, no footer). There is no old counterpart.' },
      { type: 'graphic', oldPage: geo.before.oxygenPage, newPage: geo.after.oxygenPage, oldRect: geo.before.oxygen, newRect: geo.after.oxygen, note: 'One data point of the line chart moved down (3 August, 5.2 -> 4.1 mg/l), changing the two line segments next to it.' },
    ],
  });
}

// ===========================================================================
// 4. Long service manual, Chromium (A5, 30+ pages, continuous flow)
//    Edits: one safety bullet inserted in section 1.4 on page 2 (everything
//    after it re-flows and later pages shift); near the end, one tightening
//    torque in the technical data and one glove material in the
//    decommissioning steps change.
// ===========================================================================
{
  const { manualHtml, manualPdfOptions } = await import('./holdout3-d/manual.mjs');
  add({
    id: 'chromium-a5-manual',
    producer: 'Chromium (Playwright page.pdf), A5 portrait, running header and "Page N of M" footer',
    description: 'Synthetic. Long A5 service manual for an invented dosing pump (30+ pages, text flows continuously without forced page breaks; tables with repeated header rows, a 100-row spare-parts list, an empty maintenance-record table at the end). Edits: a new safety bullet ("Wear a face shield ...") is inserted in section 1.4 on page 2; near the end, the tightening torque of the rotor fixing screw changes from 6.0 to 9.0 N·m (section 12.3) and the glove material in the decommissioning steps changes from nitrile to butyl (section 13). Not edits: every page after the insertion re-flows, so lines and table rows move to other pages; the page count and the "Page N of M" footers may change.',
    kind: 'html', pdfOpts: manualPdfOptions,
    before: manualHtml({ faceShield: false, rotorTorque: '6.0', gloves: 'nitrile' }),
    after: manualHtml({ faceShield: true, rotorTorque: '9.0', gloves: 'butyl' }),
    truth: [
      { type: 'insert', new: 'Wear a face shield when you open the discharge line' },
      { type: 'number', old: '6.0', new: '9.0', oldCtx: 'Rotor fixing screw', newCtx: 'Rotor fixing screw', note: 'Rotor fixing screw, M6: 6.0 N·m -> 9.0 N·m (table in section 12.3).' },
      { type: 'replace', old: 'nitrile', new: 'butyl' },
    ],
  });
}

// ===========================================================================
// 5. Chinese park newsletter in two columns, Chromium (A4, 2 pages)
//    CSS multi-column text (column-count: 2) with mixed Chinese and English.
//    Edits: a sentence inserted in the first article (column 1, page 1; the
//    rest of the text re-flows across both columns and onto page 2); an app
//    name replaced; an hourly parking fee changed; a sentence deleted on page 2.
// ===========================================================================
{
  const css = `
    @page { size: A4; }
    html, body { margin: 0; padding: 0; }
    body { font-family: 'Liberation Sans', 'WenQuanYi Zen Hei', sans-serif; font-size: 10.5pt; line-height: 1.75; color: #1f2328; padding: 0 16mm; }
    .mast { border-bottom: 2pt solid #1b5e4a; padding-bottom: 5pt; margin-bottom: 10pt; }
    .mast h1 { font-size: 22pt; margin: 0; color: #1b5e4a; letter-spacing: 1pt; }
    .mast div { font-size: 9pt; color: #4d5a55; }
    .cols { column-count: 2; column-gap: 9mm; column-rule: 0.5pt solid #c9d3cf; }
    h2 { font-size: 12pt; margin: 0 0 4pt; color: #1b5e4a; break-after: avoid; }
    p { margin: 0 0 7pt; text-align: justify; }
    .article { margin-bottom: 8pt; }
  `;
  const A = (title, ...ps) => `<div class="article"><h2>${title}</h2>${ps.map((t) => `<p>${t}</p>`).join('')}</div>`;
  const doc = (v) => `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>${css}</style></head><body>
    <div class="mast"><h1>青川科技园 · 园区通讯</h1><div>2027 年第 4 期 · 园区运营中心编 · 合成样例：园区、企业、人物与数据均为虚构</div></div>
    <div class="cols">
    ${A('地下停车场新增充电桩',
      '为满足入驻企业员工日益增长的充电需求，园区运营中心于 9 月在 B2 层停车场新增 40 个交流慢充桩和 6 个直流快充桩，充电车位总数由 58 个增至 104 个。新充电桩已于 10 月 8 日完成验收并投入使用。',
      `车主可通过 ${v.app} App 扫码启动充电，也可在充电桩上刷园区一卡通。App 会在充电完成时推送提醒，请车主及时挪车，方便其他车辆使用。${v.limit ? '直流快充桩单次充电时长不超过 90 分钟，超过后将按临时停车标准另行计费。' : ''}`,
      '充电服务费为每千瓦时 0.80 元，电费按所在地分时电价执行。月度账单可在 App 的“我的订单”中下载；由企业统一结算的客户，请联系园区财务部开具发票。')}
    ${A('临时停车收费标准调整',
      `自 11 月 1 日起，园区访客车辆临时停车收费标准调整如下：首 30 分钟免费；此后每小时 ${v.fee} 元，不足一小时按一小时计；单日封顶 45 元。入驻企业员工的月租车位价格不变。`,
      '访客可在园区入口的自助终端提前登记车牌，登记后出场时自动扣费，无需在岗亭排队。新能源车辆停车前两小时免费的政策继续执行。')}
    ${A('二号食堂延长供餐时间',
      '应员工建议，二号食堂（A5 栋一层）自 11 月起将晚餐供应时间延长至 20:30，并在工作日增加一个轻食窗口，提供沙拉、全麦三明治和低糖饮品。',
      '食堂继续实行“光盘行动”，用餐后请将餐盘送至回收处。食堂意见箱和线上问卷每月统计一次，处理结果在一楼公告栏公示。')}
    ${A('园区 Wi-Fi 网络升级',
      '园区公共区域的 Wi-Fi 网络将于 11 月 12 日至 14 日夜间分批升级。升级后支持 Wi-Fi 6，访客网络 ParkNet-Guest 的单次连接时长由 2 小时延长至 4 小时。升级期间部分区域可能短暂断网，请提前做好安排。',
      '企业专网不受此次升级影响。如需为会议或活动开通临时网络，请至少提前三个工作日通过服务台提交申请。')}
    ${A('园区班车新增 3 号线',
      '为方便居住在城东片区的员工通勤，园区班车自 11 月 6 日起新增 3 号线：早班 7:40 从城东地铁站发车，晚班 18:10 从园区南门返回。原 1 号线和 2 号线的发车时间不变，班车实时位置可在园区服务号中查询。',
      '乘车需出示园区一卡通或电子工牌，访客请在服务台办理临时乘车证。')}
    ${A('消防疏散演练通知',
      '园区将于 11 月 15 日上午 10:00 在 A3、A4 栋组织消防疏散演练。警报响起后，请按照疏散指示标志从最近的安全出口有序撤离，并在楼前广场集合。演练约持续 30 分钟。',
      '请各企业安全员提前核对本单位人员名单，并在集合后向现场指挥报告人数。行动不便的员工请提前告知物业，物业将安排专人协助撤离。')}
    ${A('园区垃圾分类检查结果',
      '10 月，园区对 26 栋楼宇的垃圾分类情况进行了抽查。可回收物的分类准确率为 87%，比上季度提高 5 个百分点；厨余垃圾中混入塑料袋的问题仍较突出。',
      '物业将在各楼层茶水间张贴新版分类指引，并在每月第一个星期三中午于 A1 栋大堂设置咨询台。分类表现较好的楼层将在下期通讯中公布。')}
    ${A('健身房设备更新',
      'B1 栋健身房设备更新已经完成，新增 4 台跑步机和 1 套综合训练器。健身房开放时间为工作日 7:00 至 22:00，周末 9:00 至 20:00。首次使用前请在服务台签署安全须知并领取储物柜钥匙。')}
    ${A('快递柜与收发室',
      'C 区新增 2 组智能快递柜，共 180 个格口。超过 48 小时未取的快递将转至收发室保管，收发室工作日 9:00 至 17:30 开放。大件快递请提前联系收发室预约送达时间。')}
    ${A('中央草坪改造',
      '园区中央草坪将于 11 月下旬开始改造，工期约 6 周。施工期间草坪东侧步道临时封闭，请绕行北侧连廊。改造完成后将增加 20 个遮阳座位和一条环形慢跑道。')}
    ${A('活动预告',
      '青川读书会（Book Club）本月共读一本关于城市规划的随笔集，11 月 20 日晚 19:00 在 C1 栋共享空间举行分享会，欢迎报名。',
      `第三届园区篮球联赛报名截至 11 月 25 日，每支队伍 8 至 12 人，比赛于 12 月的周六下午在园区体育馆进行。${v.prize ? '冠军队伍将获得园区咖啡厅全年八折优惠。' : ''}`,
      '园区周末市集暂停至明年 3 月，具体恢复时间另行通知。')}
    ${A('新入驻企业',
      '本季度共有 7 家企业入驻园区，涉及工业软件、医疗器械和新材料等领域，新增就业岗位约 320 个。园区运营中心将于 11 月底举办新入驻企业交流会，介绍园区公共服务、人才政策和配套设施。',
      '有意参加交流会的企业，请于 11 月 22 日前将参会人员名单发送至服务台邮箱。')}
    ${A('联系我们',
      '园区服务台位于 A1 栋大堂，工作日 8:30 至 18:00 有人值守。服务热线（示例号码）：000-0000-0000；电子邮箱：service@qingchuan-park.example。',
      '欢迎对本刊提出意见和建议，也欢迎各企业投稿介绍团队、产品和活动。来稿请注明联系人和电话，编辑部将在一周内回复。')}
    </div></body></html>`;
  add({
    id: 'chromium-zh-two-column',
    producer: 'Chromium (Playwright page.pdf), A4, CSS column-count: 2, WenQuanYi Zen Hei + Liberation Sans',
    description: '合成样例 / Synthetic. 两页中文园区通讯（A4，CSS 双栏排版，中英文混排：App、Wi-Fi、ParkNet-Guest、Book Club 等）。修改：第 1 页第一篇文章插入一句关于快充时长的规定（其后正文在两栏之间和跨页重新排布，不算修改）；App 名称 ParkPass 改为 ParkGo；临时停车费每小时 6 元改为 8 元；第 2 页删除一句关于篮球联赛奖励的话。Not edits: the re-flow of all following text between the two columns and from page 1 to page 2; the page footers.',
    kind: 'html',
    pdfOpts: {
      format: 'A4', displayHeaderFooter: true, margin: { top: '16mm', bottom: '18mm', left: '0', right: '0' },
      headerTemplate: '<span></span>',
      footerTemplate: `<div style="font-size:7.5pt;width:100%;padding:0 16mm;color:#6b7570;font-family:'WenQuanYi Zen Hei',sans-serif;display:flex;justify-content:space-between"><span>合成样例 · 青川科技园园区通讯 2027 年第 4 期</span><span>第 <span class="pageNumber"></span> 页，共 <span class="totalPages"></span> 页</span></div>`,
    },
    before: doc({ app: 'ParkPass', limit: false, fee: '6', prize: true }),
    after: doc({ app: 'ParkGo', limit: true, fee: '8', prize: false }),
    truth: [
      { type: 'insert', new: '直流快充桩单次充电时长不超过 90 分钟，超过后将按临时停车标准另行计费。' },
      { type: 'replace', old: 'ParkPass', new: 'ParkGo' },
      { type: 'number', old: '6 元', new: '8 元', note: '访客临时停车：每小时 6 元 -> 8 元。Snippet includes the unit because the bare digit 6 also occurs elsewhere on the page.' },
      { type: 'delete', old: '冠军队伍将获得园区咖啡厅全年八折优惠。' },
    ],
  });
}

// ===========================================================================
// 6. Rate card, LibreOffice Writer (A4, 2 pages), font substitution
//    Version 1 uses Liberation Sans. In version 2 every style asks for
//    "Calibri", which is not installed, so LibreOffice substitutes Carlito
//    (metric-compatible with Calibri, visibly different from Liberation Sans).
//    Five cells in two rate tables are revised, each in a different row.
// ===========================================================================
{
  const rates1 = [
    ['English → German', '14.20', '19.40', '24.60'], ['German → English', '13.80', '18.90', '23.70'],
    ['English → French', '14.50', '19.80', '25.10'], ['French → English', '13.60', '18.70', '23.40'],
    ['English → Spanish', '12.40', '17.30', '22.10'], ['Spanish → English', '12.10', '16.90', '21.60'],
    ['English → Polish', '11.30', '15.80', '20.20'], ['English → Chinese (simplified)', '16.40', '22.30', '27.50'],
    ['Chinese (simplified) → English', '17.10', '23.20', '28.40'], ['English → Japanese', '19.30', '25.70', '31.20'],
    ['English → Arabic', '18.20', '24.40', '29.80'], ['English → Portuguese (Brazil)', '12.70', '17.60', '22.50'],
  ];
  const rates2 = [
    ['German', '46', '390', '520'], ['French', '47', '395', '530'], ['Spanish', '44', '370', '495'], ['Polish', '41', '340', '460'],
    ['Chinese', '52', '430', '575'], ['Japanese', '54', '450', '610'], ['Arabic', '50', '415', '560'],
  ];
  // [table, row, column, new value]
  const revisions = [[1, 0, 2, '20.10'], [1, 3, 1, '14.30'], [1, 7, 3, '28.90'], [2, 2, 2, '380'], [2, 5, 1, '59']];
  const all = [...rates1, ...rates2].flatMap((r) => r.slice(1));
  for (const [t, r, k, nv] of revisions) {
    const ov = (t === 1 ? rates1 : rates2)[r][k];
    // Old and new values must not occur anywhere else in the tables, not even inside another number.
    if (all.filter((x) => x.includes(ov)).length !== 1 || all.some((x) => x.includes(nv))) throw new Error(`rate card: ${ov} -> ${nv} not unique`);
  }
  const doc = (font, revised) => {
    const val = (t, r, k, x) => (revised ? (revisions.find(([tt, rr, kk]) => tt === t && rr === r && kk === k)?.[3] ?? x) : x);
    const styles = [
      `<style:default-style style:family="paragraph"><style:text-properties style:font-name="${font}" fo:font-size="10pt" fo:language="en" fo:country="GB"/></style:default-style>`,
      pstyle('Standard', 'fo:margin-bottom="0.2cm" fo:line-height="130%"', `style:font-name="${font}"`),
      pstyle('Title', 'fo:margin-bottom="0.1cm"', `style:font-name="${font}" fo:font-size="22pt" fo:font-weight="bold" fo:color="#7a2e1d"`, 'style:parent-style-name="Standard"'),
      pstyle('Org', 'fo:margin-bottom="0.5cm"', `style:font-name="${font}" fo:font-size="12pt" fo:color="#4b4b4b"`, 'style:parent-style-name="Standard"'),
      pstyle('H2', 'fo:margin-top="0.45cm" fo:margin-bottom="0.15cm" fo:keep-with-next="always"', `style:font-name="${font}" fo:font-size="12.5pt" fo:font-weight="bold" fo:color="#7a2e1d"`, 'style:parent-style-name="Standard"'),
      pstyle('Cell', 'fo:margin-bottom="0cm" fo:line-height="115%"', `style:font-name="${font}" fo:font-size="9.5pt"`),
      pstyle('CellNum', 'fo:margin-bottom="0cm" fo:line-height="115%" fo:text-align="end"', `style:font-name="${font}" fo:font-size="9.5pt"`),
      pstyle('CellHead', 'fo:margin-bottom="0cm" fo:line-height="115%"', `style:font-name="${font}" fo:font-size="9pt" fo:font-weight="bold"`),
      pstyle('CellHeadNum', 'fo:margin-bottom="0cm" fo:line-height="115%" fo:text-align="end"', `style:font-name="${font}" fo:font-size="9pt" fo:font-weight="bold"`),
      pstyle('Small', 'fo:margin-bottom="0.15cm"', `style:font-name="${font}" fo:font-size="8.5pt" fo:color="#555555"`, 'style:parent-style-name="Standard"'),
      pstyle('Footer', 'fo:margin-bottom="0cm"', `style:font-name="${font}" fo:font-size="8pt" fo:color="#6b6b6b"`, '', tabStop('16.6cm')),
    ].join('\n');
    const auto = `<style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm" fo:margin-top="2cm" fo:margin-bottom="1.4cm" fo:margin-left="2.2cm" fo:margin-right="2.2cm"/><style:footer-style><style:header-footer-properties fo:min-height="0.5cm" fo:margin-top="0.8cm"/></style:footer-style></style:page-layout>
      <style:style style:name="Lead" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style>
      <style:style style:name="Tbl" style:family="table"><style:table-properties style:width="16.6cm" table:align="left" fo:margin-top="0.1cm" fo:margin-bottom="0.3cm"/></style:style>
      <style:style style:name="ColA" style:family="table-column"><style:table-column-properties style:column-width="7.0cm"/></style:style>
      <style:style style:name="ColN" style:family="table-column"><style:table-column-properties style:column-width="3.2cm"/></style:style>
      <style:style style:name="CH" style:family="table-cell"><style:table-cell-properties fo:padding="0.09cm" fo:background-color="#f3e7e2" fo:border-top="none" fo:border-left="none" fo:border-right="none" fo:border-bottom="0.04cm solid #7a2e1d"/></style:style>
      <style:style style:name="CB" style:family="table-cell"><style:table-cell-properties fo:padding="0.09cm" fo:border-top="none" fo:border-left="none" fo:border-right="none" fo:border-bottom="0.018cm solid #c9b7b0"/></style:style>`;
    const masters = `<style:master-page style:name="Standard" style:page-layout-name="pm1"><style:footer><text:p text:style-name="Footer">Synthetic sample · Halloran Vesk Language Services · Rate card 2028<text:tab/>Page <text:page-number text:select-page="current">1</text:page-number></text:p></style:footer></style:master-page>`;
    const p = (t, st = 'Standard') => `<text:p text:style-name="${st}">${t}</text:p>`;
    const cell = (t, st) => `<table:table-cell table:style-name="${st.startsWith('CellHead') ? 'CH' : 'CB'}" office:value-type="string">${p(t, st)}</table:table-cell>`;
    const tbl = (name, head, rows, t) => `<table:table table:name="${name}" table:style-name="Tbl"><table:table-column table:style-name="ColA"/><table:table-column table:style-name="ColN" table:number-columns-repeated="3"/>
      <table:table-header-rows><table:table-row>${head.map((h, k) => cell(h, k ? 'CellHeadNum' : 'CellHead')).join('')}</table:table-row></table:table-header-rows>
      ${rows.map((r, ri) => `<table:table-row>${r.map((x, k) => cell(k ? val(t, ri, k, x) : x, k ? 'CellNum' : 'Cell')).join('')}</table:table-row>`).join('\n')}</table:table>`;
    const body = [
      p('Rate card 2028', 'Title'),
      p('Halloran Vesk Language Services · translation, proofreading and interpreting', 'Org'),
      p('Synthetic sample: the company, its services and all rates are invented.', 'Small'),
      p('The rates below apply to orders placed between 1 January and 31 December 2028. They exclude VAT. For projects of more than 50,000 words, or for regular work in the same subject area, we are happy to quote a reduced rate.'),
      p('1 Translation', 'H2'),
      p('Rates in EUR per 100 words of the source text. “Specialist” covers legal, medical, financial and technical texts; “Certified” includes a signed statement of accuracy by a sworn translator.', 'Small'),
      tbl('Translation', ['Language pair', 'Standard', 'Specialist', 'Certified'], rates1, 1),
      p('2 Proofreading and interpreting', 'H2'),
      p('Proofreading in EUR per hour. Interpreting in EUR per interpreter and half day (up to four hours on site); a full day is charged as two half days.', 'Small'),
      tbl('Interpreting', ['Language (with English)', 'Proofreading', 'Consecutive', 'Simultaneous'], rates2, 2),
      p('Simultaneous interpreting is always provided by a team of two interpreters per language; the rate above is per interpreter. Booth and sound equipment are quoted separately.'),
      p('3 Terms', 'H2'),
      p('<text:span text:style-name="Lead">Minimum charge.</text:span> The minimum charge per translation order is EUR 45, and per proofreading order one hour.'),
      p('<text:span text:style-name="Lead">Express delivery.</text:span> For delivery within 24 hours we add 30 % to the translation rate; for delivery on weekends or public holidays, 50 %. Express delivery depends on availability and is confirmed in writing.'),
      p('<text:span text:style-name="Lead">Formatting.</text:span> Source files in editable formats are translated in the same format at no extra charge. Scanned documents, images and layout files are charged by the hour for preparation and checking.'),
      p('<text:span text:style-name="Lead">Payment.</text:span> Invoices are payable within 30 days of the invoice date without deduction. For first orders above EUR 2,000 we may ask for an advance payment of half of the quoted amount.'),
      p('<text:span text:style-name="Lead">Cancellation of interpreting assignments.</text:span> Cancellations received less than five working days before the assignment are charged at 50 % of the agreed fee, and cancellations received less than 48 hours before the assignment at the full fee. Travel costs that have already been incurred are charged in full.'),
      p('<text:span text:style-name="Lead">Travel.</text:span> Travel time is charged at half the half-day rate per started three hours. Travel and accommodation costs are charged at cost; train travel is second class, flights economy class.'),
      p('<text:span text:style-name="Lead">Confidentiality.</text:span> All texts and the information heard during interpreting assignments are treated as confidential. On request, our translators and interpreters sign a separate non-disclosure agreement.'),
      p('<text:span text:style-name="Lead">Quality.</text:span> Every translation is checked by a second linguist before delivery. If you are not satisfied with a translation, tell us within 30 days of delivery and we will revise it free of charge.'),
    ].join('\n');
    return fodt({ fonts: [font], styles, auto, masters, body });
  };
  const textArea = [60, 54, 476, 712]; // the text block of page 1 in both versions
  const truth = revisions.map(([t, r, k, nv]) => {
    const row = (t === 1 ? rates1 : rates2)[r];
    const col = t === 1 ? ['', 'Standard', 'Specialist', 'Certified'][k] : ['', 'Proofreading', 'Consecutive', 'Simultaneous'][k];
    return { type: 'number', old: row[k], new: nv, oldPage: 1, newPage: 1, note: `${row[0]}, ${col}.` };
  });
  add({
    id: 'writer-rate-card-font',
    producer: 'LibreOffice Writer 24.2 (flat ODT -> PDF), A4; after.pdf with Carlito substituted for the missing Calibri',
    description: 'Synthetic. Two-page rate card of an invented language-services company from LibreOffice Writer, with two rate tables on page 1 and terms on page 2. In the new version every style asks for the font "Calibri", which was not installed on the exporting machine, so LibreOffice substituted the metric-compatible Carlito; the old version uses Liberation Sans. All text is set in the new font, and lines and table rows re-flow. Edits: five rates are revised, each in a different row and column (19.40 -> 20.10, 13.60 -> 14.30, 27.50 -> 28.90 in the translation table; 370 -> 380 and 54 -> 59 in the interpreting table). Not edits: re-flow of the paragraphs and the shifted table rows caused by the font change; page 2 shows the same font change (one document-wide change).',
    kind: 'odf', ext: 'fodt',
    before: doc('Liberation Sans', false),
    after: doc('Calibri', true),
    truth: [
      ...truth,
      { type: 'format', oldPage: 1, newPage: 1, oldRect: textArea, newRect: textArea, maxItems: 2, note: 'Font substitution on every line of both pages: Liberation Sans -> Carlito (Calibri requested, not installed). Expected as one document-wide item, possibly one per page.' },
    ],
  });
}

// ===========================================================================
// Build
// ===========================================================================
// Page texts in content-stream order, whitespace removed, for locating and
// checking snippets: PDF.js from the repository if installed, otherwise
// poppler's pdftotext -raw.
const pdfjs = await import(join(here, '..', 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.mjs')).catch(() => null);
const squash = (s) => s.replace(/\s+/g, '');
async function pageTexts(pdf) {
  if (!pdfjs) {
    return execFileSync('pdftotext', ['-raw', pdf, '-'], { encoding: 'utf8', maxBuffer: 64 << 20 }).split('\f').map(squash);
  }
  const task = pdfjs.getDocument({ data: new Uint8Array(readFileSync(pdf)), verbosity: 0 });
  const doc = await task.promise;
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    out.push(squash(tc.items.map((it) => it.str ?? '').join('')));
  }
  await task.destroy();
  return out;
}
// Fill in missing text-item pages (snippet must occur on exactly one page) and
// check that every snippet is on its stated page.
async function locate(c, dir, truth) {
  const pages = { old: await pageTexts(join(dir, 'before.pdf')), new: await pageTexts(join(dir, 'after.pdf')) };
  for (const t of truth) {
    for (const side of ['old', 'new']) {
      const key = `${side}Page`;
      if (t[side] === undefined) continue;
      const ctx = t[`${side}Ctx`] ? squash(t[`${side}Ctx`]) : '';
      const hits = pages[side].flatMap((txt, i) => (txt.includes(squash(t[side])) && txt.includes(ctx) ? [i + 1] : []));
      if (t[key] === undefined) {
        if (hits.length !== 1) throw new Error(`${c.id}: "${t[side]}" found on ${side} pages [${hits}] — give the page explicitly`);
        t[key] = hits[0];
      } else if (!hits.includes(t[key])) {
        throw new Error(`${c.id}: "${t[side]}" not on ${side} page ${t[key]} (found on [${hits}])`);
      }
    }
  }
  // Re-order keys for readability.
  return truth.map(({ type, old, new: nw, oldPage, newPage, oldRect, newRect, maxItems, note }) =>
    Object.fromEntries(Object.entries({ type, old, new: nw, oldPage, newPage, oldRect, newRect, maxItems, note }).filter(([, v]) => v !== undefined)));
}

let browser;
for (const c of cases) {
  if (only.length && !only.some((o) => c.id.endsWith(o))) continue;
  const dir = join(root, c.id);
  mkdirSync(dir, { recursive: true });
  if (c.kind === 'odf') {
    const files = ['before', 'after'].map((v) => {
      const sub = join(work, c.id, v);
      mkdirSync(sub, { recursive: true });
      const f = join(sub, `${c.id}-${v}.${c.ext}`);
      writeFileSync(f, c[v]);
      return f;
    });
    const pdfs = soffice(files);
    copyFileSync(pdfs[0], join(dir, 'before.pdf'));
    copyFileSync(pdfs[1], join(dir, 'after.pdf'));
  } else if (c.kind === 'html') {
    if (!browser) {
      const { chromium } = await import('playwright').catch(() => createRequire(import.meta.url)('playwright'));
      browser = await chromium.launch();
    }
    const page = await browser.newPage();
    for (const v of ['before', 'after']) {
      await page.setContent(c[v], { waitUntil: 'load' });
      writeFileSync(join(dir, `${v}.pdf`), await page.pdf({ printBackground: true, ...c.pdfOpts }));
    }
    await page.close();
  } else if (c.kind === 'custom') {
    await c.build(dir);
  }
  const truth = await locate(c, dir, typeof c.truth === 'function' ? c.truth() : c.truth);
  const json = JSON.stringify({
    description: c.description, synthetic: true, set: 'held-out-3', blind: true, author: AUTHOR, producer: c.producer, truth,
  }, null, 2).replace(/\[\s+([-\d.]+),\s+([-\d.]+),\s+([-\d.]+),\s+([-\d.]+)\s+\]/g, '[$1, $2, $3, $4]');
  writeFileSync(join(dir, 'truth.json'), json + '\n');
  console.log('wrote', c.id);
}
if (browser) await browser.close();
rmSync(work, { recursive: true, force: true });

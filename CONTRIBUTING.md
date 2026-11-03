# Contributing to ChangeLens

Thanks for helping! ChangeLens aims to make document review easy for people who are not developers, so clear results and few false alarms matter more than anything else.

## Getting started

```bash
git clone https://github.com/Ray0766/changelens.git
cd changelens
npm install
npm run dev        # web app on http://localhost:5173
npm test           # all tests
npm run typecheck
```

Node.js 22.18 or newer is required for development: the tests import TypeScript directly using Node's built-in type stripping, so there is no build step for tests. Keep to *erasable* TypeScript syntax (no `enum`, `namespace` or constructor parameter properties); `tsconfig.json` enforces this.

## Where things live

| Path | What |
|---|---|
| `src/core/tokenize.ts` | text runs → words, lines, paragraphs; hyphenation |
| `src/core/furniture.ts` | header / footer / page-number detection |
| `src/core/diff.ts` | patience + Myers diff, semantic clean-up |
| `src/core/compare.ts` | turns the diff into changes, page map, anchors, moves, formatting |
| `src/core/overflow.ts` | text crossing the page edge |
| `src/core/visual.ts` | pixel comparison of rendered pages |
| `src/core/describe.ts`, `i18n.ts` | plain-language descriptions (English / Chinese) |
| `src/core/report.ts`, `crops.ts` | HTML/JSON export |
| `src/web/` | browser UI |
| `src/cli/`, `src/node/` | command line |

`src/core` must stay free of DOM and Node APIs so that the browser and the CLI share it.

## Reporting a wrong result

The most useful bug report is a **small pair of PDFs** that reproduces the problem, plus what you expected to see. Please only attach files you are allowed to share — synthetic documents are perfect. If you can, add the pair to `test/fixtures/` and a test to `test/fixtures.test.ts`.

## Demo files

The demo PDFs in `public/samples/` (also used as test fixtures) are generated from HTML by `scripts/make-samples.mjs`:

```bash
npx playwright install chromium
npm run samples
```

## Pull requests

- Keep changes focused and add a test for behaviour changes.
- Run `npm test` and `npm run typecheck` before pushing; CI runs both plus a production build.
- UI text lives in `src/core/i18n.ts` — please add both English and Chinese strings.

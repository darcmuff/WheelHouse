const test = require('node:test');
const assert = require('node:assert');
const WcBrand = require('../app/wc-brand.js');
const fs = require('fs');
const path = require('path');

test('hash fallback is deterministic per ticker', () => {
  const a = WcBrand.hashBg('PAFO');
  const b = WcBrand.hashBg('PAFO');
  const c = WcBrand.hashBg('MPAC');
  assert.strictEqual(a, b);
  assert.notStrictEqual(a, c);
});

test('legacy hand marks: KO uses svg watermark when WC_MARKS on globalThis', () => {
  globalThis.WC_MARKS = { KO: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>' };
  const html = WcBrand.artHtml('KO');
  assert.match(html, /wc-lgw/);
  assert.match(html, /image\/svg\+xml/);
  delete globalThis.WC_MARKS;
});

test('demo tickers skip remote when hand SVG exists', () => {
  globalThis.WC_MARKS = { AMD: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>' };
  assert.strictEqual(WcBrand.prefersHandMark('AMD'), true);
  delete globalThis.WC_MARKS;
});

test('index.html includes Logo.dev credit and wc-brand script', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
  assert.match(src, /wc-brand\.js/);
  assert.match(src, /Logos provided by Logo\.dev/);
  assert.match(src, /Not affiliated with or endorsed by/);
});

test('sw v247 precaches wc-brand but not brand PNG glob', () => {
  const sw = fs.readFileSync(path.join(__dirname, '..', 'app', 'sw.js'), 'utf8');
  assert.match(sw, /optrack-v247/);
  assert.match(sw, /wc-brand\.js/);
  assert.match(sw, /brand\/index\.json/);
  assert.doesNotMatch(sw, /brand\/.*\.png/);
});
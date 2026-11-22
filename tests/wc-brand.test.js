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

test('logos off: wheel cards use ticker letters not hand SVG marks', () => {
  globalThis.WC_MARKS = { KO: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>' };
  const html = WcBrand.artHtml('KO');
  assert.match(html, /wc-tk/);
  assert.match(html, />KO</);
  assert.doesNotMatch(html, /wc-lgw/);
  assert.doesNotMatch(html, /image\/svg\+xml/);
  delete globalThis.WC_MARKS;
});

test('logos off: hand tickers do not prefer hand marks', () => {
  globalThis.WC_MARKS = { AMD: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>' };
  assert.strictEqual(WcBrand.prefersHandMark('AMD'), false);
  delete globalThis.WC_MARKS;
});

test('index.html includes Logo.dev credit and wc-brand script', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
  assert.match(src, /wc-brand\.js/);
  assert.match(src, /Logos provided by Logo\.dev/);
  assert.match(src, /Not affiliated with or endorsed by/);
});

test('setMarks registers WC_MARKS on global without throwing', () => {
  WcBrand.setMarks({ TEST: '<svg viewBox="0 0 1 1"/>' });
  assert.ok(globalThis.WC_MARKS && globalThis.WC_MARKS.TEST);
  delete globalThis.WC_MARKS;
});

test('sw v259 precaches wc-brand but not brand PNG glob', () => {
  const sw = fs.readFileSync(path.join(__dirname, '..', 'app', 'sw.js'), 'utf8');
  assert.match(sw, /optrack-v328/);
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '../app/wc-brand.js'), 'utf8'), /force-cache/);
  assert.match(sw, /wc-brand\.js/);
  assert.match(sw, /brand\/index\.json/);
  assert.doesNotMatch(sw, /brand\/.*\.png/);
});
// startup.test.js — app always opens on the Wheel tab; price charts start collapsed.
const test = require('node:test');
const assert = require('node:assert');
const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'app', 'index.html'), 'utf8');

test('startup view is always Wheel, saved tab ignored', () => {
  assert.match(src, /let view='positions';/);
  assert.ok(!/let view=localStorage\.getItem\('wh-view'\)/.test(src));
  const navs = src.match(/<a class="nav-item active" data-view="(\w+)"/g) || [];
  assert.equal(navs.length, 2);
  navs.forEach(n => assert.ok(n.includes('data-view="positions"')));
});

test('switching tabs mid-session still works', () => {
  assert.match(src, /function switchView\(v\)\{\s*view=v;/);
});

test('price chart starts collapsed; only opened by the user this session', () => {
  assert.match(src, /<details class="wl-chart"[^>]*\$\{_pcOpen\[wheel\.id\]\?'open':''\}/);
  assert.match(src, /const _candles=\{\},_candlesData=\{\},_pcRange=\{\},_pcOpen=\{\};/);
  assert.ok(!/localStorage[^\n]*_pcOpen|_pcOpen[^\n]*localStorage/.test(src));
});

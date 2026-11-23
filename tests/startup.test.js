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
  assert.match(src, /function switchView\(v\)\{\s*if\(\(v==='log'\|\|v==='analytics'\|\|v==='report'\)&&isPhoneLayout\(\)\)v='dash';\s*(if\(v===.analytics.&&!canUse\(.analytics.\)\)\{openUpgrade\(.analytics.\);return;\}\s*)?(if\(v===.report.&&!canUse\(.report.\)\)\{openUpgrade\(.report.\);return;\}\s*)?view=v;/);
});


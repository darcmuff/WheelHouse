const{appSrc}=require('./appsrc');
// The LEAPs page summary tiles (Total value, Unrealised P&L, Calls banked, Next to act) were removed.
const fs=require('fs');
const path=require('path');
const assert=require('node:assert/strict');
const {test}=require('node:test');
const H=appSrc();

test('LEAPs page has no summary tiles box; header is followed by the right-click hint then the cards',()=>{
  assert.ok(!/class="leap-sum"/.test(H));
  assert.ok(!/leap-sum-wrap/.test(H));
  assert.ok(!/\.leap-sc\b/.test(H));
  assert.ok(!/function leapTileTotals\(/.test(H));
  assert.ok(!/function leapCallsBanked\(/.test(H));
  assert.ok(!/function leapNextAct\(/.test(H));
  const ro=H.slice(H.indexOf('function renderOptions()'), H.indexOf('// ── + LEAP'));
  assert.ok(/<\/section>\s*\$\{selTipHtml\(\)\}\s*<div class="leap-grid">/.test(ro));
  assert.ok(!/Total value/.test(ro));
  assert.ok(!/Unrealised P&amp;L/.test(ro));
  assert.ok(!/Calls banked/.test(ro));
  assert.ok(!/Next to act/.test(ro));
  assert.ok(/Cost after calls/.test(H));
});

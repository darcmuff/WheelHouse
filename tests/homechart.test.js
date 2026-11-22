const test = require('node:test');
const assert = require('node:assert');
const { extractFn } = require('./extract');
test('P&L bar chart and Data health tile live on Home only', () => {
  const home = extractFn('renderHome'), stats = extractFn('renderStatsOverview') + extractFn('renderAnalytics');
  assert.ok(home.includes('id="pnl-curve"') && home.includes('pnlCurveHtml()'));
  assert.ok(!home.includes('Data health ${ii(') && home.includes('Needs you ${ii(') && home.includes('Data issues'));
  assert.ok(!home.includes('Options P&amp;L by month'));
  assert.ok(!stats.includes('pnl-curve') && !stats.includes("kpi('Data health'"));
});
test('no Day/Week/Month toggle: granularity is automatic from the range', () => {
  const src = extractFn('pnlCurveHtml');
  assert.ok(!src.includes("'Day','Week','Month'") && !src.includes('setPnlGran'));
});

test('Options P&L chart has a measure dropdown that plots existing series only', () => {
  const src = extractFn('setPnlMeasure') + extractFn('_loadPnlMeasure');
  const H = require('fs').readFileSync(require('path').join(__dirname, '..', 'app', 'index.html'), 'utf8');
  assert.ok(H.includes('pc-measure') && H.includes('setPnlMeasure') && H.includes('optrack-pnl-measure'));
  assert.ok(H.includes("['pnl','Options P&L']") && H.includes("['premium','Premium collected']") && H.includes("['closed','Closed P&L']"));
  assert.ok(!src.includes('Trades closed'), 'dropped: no unambiguous already-computed trade count');
  assert.ok(extractFn('realisedDaily').includes('realisedPremium') && !extractFn('realisedDaily').includes('pnlMeasure'));
  assert.ok(!extractFn('pnlBuckets').includes('pnlMeasure'));
  assert.ok(/font-weight:480/.test(H) && H.includes('.pc-measure') && H.includes('border-radius:6px'));
  assert.ok(extractFn('setPnlMeasure').includes("localStorage.setItem('optrack-pnl-measure'"));
});

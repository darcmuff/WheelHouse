const test = require('node:test');
const assert = require('node:assert');
const { extractFn } = require('./extract');
test('P&L bar chart and Data health tile live on Home only', () => {
  const home = extractFn('renderHome'), stats = extractFn('renderStatsOverview') + extractFn('renderAnalytics');
  assert.ok(home.includes('id="pnl-curve"') && home.includes('pnlCurveHtml()'));
  assert.ok(home.includes('Data health ${ii(') && home.includes('Needs you ${ii(') && home.includes('hk-row2'));
  assert.ok(!home.includes('Options P&amp;L by month'));
  assert.ok(!stats.includes('pnl-curve') && !stats.includes("kpi('Data health'"));
});
test('no Day/Week/Month toggle: granularity is automatic from the range', () => {
  const src = extractFn('pnlCurveHtml');
  assert.ok(!src.includes("'Day','Week','Month'") && !src.includes('setPnlGran'));
});

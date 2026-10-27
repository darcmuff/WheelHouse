const test = require('node:test');
const assert = require('node:assert');
const { extractFn, extractConst } = require('./extract');
const S = new Function(extractFn('optionsLib') + '\nconst OPTS=optionsLib();\n' + extractConst('PNL_RANGES') +
  ['walkLegPairs', 'realisedPremium', 'shareRealisations', 'optsMonthly', 'calcMonthlyRealised', 'realisedDaily', 'pnlCurveSeries'].map(extractFn).join('\n') +
  '\nreturn {calcMonthlyRealised,realisedDaily,pnlCurveSeries};')();
const T = (action, entered, total, shares = 0, x = {}) => ({ wheelId: 'w1', action, entered, total, shares, strike: 50, ...x });
const TODAY = '2026-10-27';
const tr = [
  T('CSP', '2026-01-05', 300, 100, { expiry: '2026-01-30' }), T('IN', '2026-01-30', 5000, 100),
  T('STOC', '2026-02-02', 250, 100, { strike: 52 }), T('BTC', '2026-02-10', 400, 100, { strike: 52 }),
  T('OUT', '2026-10-20', 4800, 100), T('DIV', '2026-10-25', 20),
  T('CSP', '2026-10-21', 150, 100, { expiry: '2026-11-20' }), // open: must not appear
];

test('realised curve: All range ends at the all-time Realised P&L total', () => {
  const daily = S.realisedDaily(tr, [], TODAY);
  const all = S.calcMonthlyRealised(tr, [], TODAY).reduce((a, r) => a + r.total, 0);
  const s = S.pnlCurveSeries(daily, 'All', TODAY);
  assert.ok(Math.abs(s.net - all) < 1e-9);
  assert.strictEqual(s.pts[s.pts.length - 1].date, TODAY);
  assert.ok(!daily.some(d => d.amount === 150));
});

test('ranges start at zero and only count closes inside the window', () => {
  const daily = S.realisedDaily(tr, [], TODAY);
  const w = S.pnlCurveSeries(daily, '1W', TODAY);
  assert.strictEqual(w.start, '2026-10-20');
  assert.strictEqual(w.pts[0].val, 0);
  assert.strictEqual(w.net, -200 + 20);
  assert.strictEqual(S.pnlCurveSeries(daily, '1Y', TODAY).net, S.pnlCurveSeries(daily, 'All', TODAY).net);
});

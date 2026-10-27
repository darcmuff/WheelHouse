const test = require('node:test');
const assert = require('node:assert');
const { extractFn } = require('./extract');
const S = new Function(extractFn('optionsLib') + '\nconst OPTS=optionsLib();\n' +
  ['walkLegPairs', 'realisedPremium', 'shareRealisations', 'optsMonthly', 'calcMonthlyRealised'].map(extractFn).join('\n') +
  '\nreturn {calcMonthlyRealised,optsMonthly};')();
const T = (action, entered, total, shares = 0, x = {}) => ({ wheelId: 'w1', action, entered, total, shares, strike: 50, ...x });

test('options Profit + shares Net + divs equals the old Realised P&L total', () => {
  const tr = [
    T('CSP', '2026-01-05', 300, 100, { expiry: '2026-01-30' }), T('IN', '2026-01-30', 5000, 100),
    T('STOC', '2026-02-02', 250, 100, { strike: 52 }), T('BTC', '2026-02-10', 400, 100, { strike: 52 }),
    T('OUT', '2026-02-20', 4800, 100), T('DIV', '2026-02-25', 20),
    T('CSP', '2026-03-02', 200, 100, { expiry: '2026-03-20', wheelId: 'w2' }), T('IN', '2026-03-20', 5000, 100, { wheelId: 'w2' }),
    T('OUT', '2026-04-10', 5300, 100, { wheelId: 'w2' }),
  ];
  const ex = [{ key: 'leaps', byMonth: { '2026-02': 100 }, gain: { '2026-02': 150 }, loss: { '2026-02': 50 } }];
  const rows = S.calcMonthlyRealised(tr, ex, '2026-06-01');
  const feb = rows.find(r => r.ym === '2026-02'), apr = rows.find(r => r.ym === '2026-04');
  assert.deepStrictEqual([feb.collected, feb.loss], [250 + 150, 400 + 50]);
  assert.strictEqual(apr.shareGain, 300);
  assert.deepStrictEqual([feb.shareLoss, feb.divs], [200, 20]);
  rows.forEach(r => assert.ok(Math.abs(r.profit + r.shareGain - r.shareLoss + r.divs - r.total) < 1e-9, r.ym));
  const all = rows.reduce((a, r) => a + r.profit + r.shares + r.divs, 0), old = rows.reduce((a, r) => a + r.total, 0);
  assert.ok(Math.abs(all - old) < 1e-9);
});

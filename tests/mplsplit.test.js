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
  rows.forEach(r => assert.ok(Math.abs(r.profit + r.shareGain - r.shareLoss + r.divs + r.leapNet - r.total) < 1e-9, r.ym));
  const all = rows.reduce((a, r) => a + r.profit + r.shares + r.divs + r.leapNet, 0), old = rows.reduce((a, r) => a + r.total, 0);
  assert.ok(Math.abs(all - old) < 1e-9);
});

test('PMCC short calls: credit into Premium collected, buyback into Loss; long LEAP in its own table; nets reconcile', () => {
  const L = (x) => ({ underlying: 'SOFI', qty: 1, fees: 0, closeFees: 0, ...x });
  const legs = [
    L({ id: 'leap', side: 'long', type: 'C', strike: 10, expiry: '2027-12-17', entryPrice: 5, entryDate: '2026-01-02', status: 'closed', closePrice: 4, closeDate: '2026-09-15' }),
    L({ id: 'c1', parentLeapId: 'leap', side: 'short', type: 'C', strike: 20, expiry: '2026-09-19', entryPrice: 1.2, entryDate: '2026-09-01', status: 'expired', closePrice: 0, closeDate: '2026-09-19' }),
    L({ id: 'c2', parentLeapId: 'leap', side: 'short', type: 'C', strike: 20, expiry: '2026-09-26', entryPrice: 1, entryDate: '2026-09-02', status: 'closed', closePrice: 1.5, closeDate: '2026-09-12' }),
  ];
  const O = S.optsMonthly(legs);
  const rows = S.calcMonthlyRealised([], [{ key: 'leaps', byMonth: O.byMonth, gain: O.gain, loss: O.loss, lgain: O.lgain, lloss: O.lloss }], '2026-10-27');
  const sep = rows.find(r => r.ym === '2026-09');
  assert.strictEqual(Math.round(sep.collected), 120 + 100);
  assert.strictEqual(Math.round(sep.loss), 150);
  assert.strictEqual(Math.round(sep.leapNet), -100);
  assert.ok(Math.abs(sep.profit + sep.leapNet - sep.total) < 1e-9);
  assert.strictEqual(Math.round(sep.total), 120 - 50 - 100);
});

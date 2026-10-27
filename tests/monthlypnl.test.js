const test = require('node:test');
const assert = require('node:assert');
const { load } = require('./extract');
const f = load([{ kind: 'fn', name: 'walkLegPairs' }, { kind: 'fn', name: 'realisedPremium' }, { kind: 'fn', name: 'shareRealisations' }, { kind: 'fn', name: 'calcMonthlyRealised' }]);
const T = (action, entered, total, shares = 0, wheelId = 'w1') => ({ wheelId, action, entered, total, shares });

test('monthly realised P&L: premium, shares FIFO, dividends, total', () => {
  const rows = f.calcMonthlyRealised([
    T('CSP', '2026-01-05', 300, 100), T('IN', '2026-01-20', 30000, 100),
    T('STOC', '2026-02-02', 250, 100), T('BTC', '2026-02-10', 50, 100),
    T('OUT', '2026-02-20', 29500, 100), T('DIV', '2026-02-25', 20),
  ]);
  const jan = rows.find(r => r.ym === '2026-01'), feb = rows.find(r => r.ym === '2026-02');
  assert.deepStrictEqual([jan.premium, jan.shares, jan.total], [300, 0, 300]);
  assert.deepStrictEqual([feb.premium, feb.shares, feb.divs, feb.total], [200, -500, 20, -280]);
  assert.strictEqual(rows[0].ym, '2026-02'); // newest first
});

test('extra sources (e.g. LEAPs later) add into the total', () => {
  const rows = f.calcMonthlyRealised([{ ...T('CSP', '2026-03-01', 100, 100), expiry: '2026-03-20' }], [{ key: 'leaps', label: 'LEAPs', byMonth: { '2026-03': 400, '2026-04': -50 } }]);
  assert.strictEqual(rows.find(r => r.ym === '2026-03').total, 500);
  assert.strictEqual(rows.find(r => r.ym === '2026-04').total, -50);
});

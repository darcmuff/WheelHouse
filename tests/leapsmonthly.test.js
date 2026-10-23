const test = require('node:test');
const assert = require('node:assert');
const { extractFn } = require('./extract');
const S = new Function(extractFn('optionsLib') + '\nconst OPTS=optionsLib();\n' +
  ['optsMonthly', 'walkLegPairs', 'realisedPremium', 'shareRealisations', 'calcMonthlyRealised', 'monthlyExtraSources', 'rotationShareStats', 'calcUnrealised', 'calcAllUnrealised'].map(extractFn).join('\n') +
  '\nreturn {optsMonthly,calcMonthlyRealised,monthlyExtraSources,calcAllUnrealised};')();
const legs = [
  { id: 'L', side: 'long', type: 'C', qty: 1, entryPrice: 40, fees: 0, status: 'closed', closePrice: 55, closeDate: '2026-10-05', closeFees: 0 },
  { id: 's1', side: 'short', type: 'C', qty: 1, entryPrice: 5, fees: 0, status: 'expired', closePrice: 0, expiry: '2026-09-18', closeFees: 0 },
  { id: 's3', side: 'short', type: 'C', qty: 1, entryPrice: 6, fees: 0, status: 'open', mark: 2 },
];
test('LEAP realised P&L lands in the Monthly P&L table and total', () => {
  const rows = S.calcMonthlyRealised([{ wheelId: 'w', action: 'CSP', entered: '2026-10-01', expiry: '2026-10-10', total: 100 }], S.monthlyExtraSources(legs));
  const oct = rows.find(r => r.ym === '2026-10'), sep = rows.find(r => r.ym === '2026-09');
  assert.strictEqual(oct.extra.leaps, 1500); assert.strictEqual(oct.total, 1600);
  assert.strictEqual(sep.extra.leaps, 500);
});
test('no legs, no extra column', () => assert.deepStrictEqual(S.monthlyExtraSources([]), []));
test('Unrealised adds open LEAP/short marks to open shares', () => {
  const u = S.calcAllUnrealised([{ id: 'a', status: 'open', lastPrice: 172 }], [{ wheelId: 'a', action: 'IN', total: 18000, shares: 100, entered: '2026-08-01' }], w => w.lastPrice, legs);
  assert.strictEqual(u.shares, -800); assert.strictEqual(u.leaps, 400); assert.strictEqual(u.value, -400);
});

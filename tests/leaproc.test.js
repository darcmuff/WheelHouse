// Monthly return rule: LEAP cost only in the denominator; numerator = realised short-call premium (+ wheel). LEAP-leg P&L never counts.
const test = require('node:test');
const assert = require('node:assert');
const { extractFn } = require('./extract');
const S = new Function(extractFn('optionsLib') + '\nconst OPTS=optionsLib();\n' +
  ['optsMonthly', 'walkLegPairs', 'realisedPremium', 'shareRealisations', 'calcMonthlyRealised', 'monthlyExtraSources', 'homeFigures', 'capitalAtWork', 'returnBase', 'monthReturnPct', 'realisedDaily', 'allOptionsByMonth'].map(extractFn).join('\n') +
  '\nreturn {calcMonthlyRealised,monthlyExtraSources,homeFigures,capitalAtWork,returnBase,monthReturnPct,realisedDaily,allOptionsByMonth};')();
const TODAY = '2026-10-23';
const leapSold = { id: 'L', side: 'long', type: 'C', qty: 1, entryPrice: 40, fees: 0, status: 'closed', closePrice: 90, closeDate: '2026-10-05', closeFees: 0 };
const leapOpen = { id: 'L2', side: 'long', type: 'C', qty: 1, entryPrice: 50, fees: 0, status: 'open', mark: 80 };
const shortExp = { id: 's1', side: 'short', type: 'C', qty: 1, entryPrice: 3, fees: 0, status: 'expired', closePrice: 0, expiry: '2026-10-16', closeFees: 0 };
const shortBtc = { id: 's2', side: 'short', type: 'C', qty: 1, entryPrice: 4, fees: 1, status: 'closed', closePrice: 1.5, closeDate: '2026-10-09', closeFees: 1 };
const wheel = [{ wheelId: 'w', action: 'CSP', entered: '2026-10-01', expiry: '2026-10-10', total: 100 }];

test('LEAP sold at a big gain + short calls: month return counts only short-call (and wheel) premium', () => {
  const legs = [leapSold, shortExp, shortBtc];
  const F = S.homeFigures(S.calcMonthlyRealised(wheel, S.monthlyExtraSources(legs), TODAY), TODAY);
  // short calls: 300 + (400-1-150-1)=248 → 548; wheel 100; LEAP +5000 excluded
  assert.strictEqual(F.month.pmcc, 548); assert.strictEqual(F.month.wheel, 100); assert.strictEqual(F.month.total, 648);
  const r = S.monthReturnPct(F.month.total, 10000, 2);
  assert.strictEqual(+r.pct.toFixed(2), 6.48);
});
test('LEAP expiring worthless (big loss) does not drag the month return', () => {
  const legs = [{ ...leapSold, status: 'expired', closePrice: 0, closeDate: undefined, expiry: '2026-10-16' }, shortExp];
  const F = S.homeFigures(S.calcMonthlyRealised([], S.monthlyExtraSources(legs), TODAY), TODAY);
  assert.strictEqual(F.month.total, 300);
});
test('options P&L chart (daily) excludes LEAP-leg P&L', () => {
  const d = S.realisedDaily([], [leapSold, shortExp], TODAY);
  assert.strictEqual(d.reduce((a, x) => a + x.amount, 0), 300);
});
test('denominator includes open LEAP cost while open, not once closed', () => {
  const c = S.capitalAtWork(5000, 2000, [leapOpen, leapSold], null);
  assert.strictEqual(c.leaps, 5000); assert.strictEqual(c.total, 12000);
  assert.strictEqual(S.returnBase({ base: 'caw' }, c.total), 12000);
  assert.strictEqual(S.capitalAtWork(0, 0, [leapSold], null).leaps, 0);
});
test("'All options, by month' panel: Covered calls column = short-call premium only, open line excludes LEAPs", () => {
  const A = S.allOptionsByMonth([{ ym: '2026-10', pNet: 100 }], [leapSold, leapOpen, shortExp, shortBtc, { ...shortExp, id: 's9', status: 'open', mark: 1 }], TODAY);
  const oct = A.rows.find(r => r.ym === '2026-10');
  assert.strictEqual(oct.opts, 548); assert.strictEqual(oct.total, 648);
  assert.strictEqual(A.all.opts, 548);
  assert.strictEqual(A.open.n, 1); assert.strictEqual(A.open.pl, 200);
});

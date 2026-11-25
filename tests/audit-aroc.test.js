// audit-aroc.test.js — Step 3 AROC / capital / ROC formula audit cases
const test = require('node:test');
const assert = require('node:assert/strict');
const { extractFn } = require('./extract');

const FN = [
  'walkLegPairs',
  'normWheelShortStcClosers',
  'daysBetweenUTC',
  'wheelPeakCapital',
  'wheelCycleEndDate',
  'openOptionLegs',
  'realisedPremium',
  'shareRealisations',
  'calcWheel',
  'calcAROC',
  'cycleReturn',
  'calcTradeROC',
  'wheelSellOutcomes',
  'calledAwayProfit',
  'wheelCurrentOption',
  'wheelCurrentProfit',
  'pmccShortProfit',
];

const F = new Function(
  'let db;\n' +
    FN.map(extractFn).join('\n') +
    '\nreturn {set:d=>{db=d;},calcWheel,calcAROC,cycleReturn,calcTradeROC,wheelPeakCapital,wheelSellOutcomes,calledAwayProfit,wheelCurrentProfit,pmccShortProfit,daysBetweenUTC};'
)();

const W = (id, status) => ({ id, status, ticker: 'X' });

test('same-day BTC: closed wheel and trade AROC 1460%', () => {
  const day = '2026-06-01';
  const tr = [
    { id: 'a', wheelId: 'w1', action: 'CSP', entered: day, expiry: day, strike: 20, shares: 100, premium: 1, total: 100, days: 0 },
    { id: 'b', wheelId: 'w1', action: 'BTC', entered: day, strike: 20, shares: 100, premium: 0.2, total: 20 },
  ];
  F.set({ trades: tr, wheels: [W('w1', 'closed')] });
  const wheel = W('w1', 'closed');
  const m = F.calcWheel(wheel);
  const a = F.calcAROC(wheel, m, day);
  assert.ok(Math.abs(a.aroc - 1460) < 0.05, `calcAROC aroc ${a.aroc}`);
  const out = F.wheelSellOutcomes(tr);
  const roc = F.calcTradeROC(tr[0], out[tr[0].id].net, out[tr[0].id].end);
  assert.ok(Math.abs(roc - 1460) < 0.05, `calcTradeROC ${roc}`);
});

test('full 45-day wheel: cycle 113.6%, premium AROC 73%', () => {
  const tr = [
    { id: '1', wheelId: 'w2', action: 'CSP', entered: '2026-01-01', expiry: '2026-01-16', strike: 20, shares: 100, premium: 0.8, total: 80, days: 15 },
    { id: '2', wheelId: 'w2', action: 'BTC', entered: '2026-01-10', expiry: '2026-01-16', strike: 20, shares: 100, premium: 0.4, total: 40, rollId: 'r' },
    { id: '3', wheelId: 'w2', action: 'CSP', entered: '2026-01-10', expiry: '2026-01-23', strike: 20, shares: 100, premium: 0.8, total: 80, days: 13, rollId: 'r' },
    { id: '4', wheelId: 'w2', action: 'IN', entered: '2026-01-23', strike: 20, shares: 100, total: 2000 },
    { id: '5', wheelId: 'w2', action: 'STOC', entered: '2026-01-26', expiry: '2026-02-15', strike: 21, shares: 100, premium: 0.6, total: 60, days: 20 },
    { id: '6', wheelId: 'w2', action: 'OUT', entered: '2026-02-15', strike: 21, shares: 100, total: 2100 },
  ];
  const wheel = W('w2', 'closed');
  F.set({ trades: tr, wheels: [wheel] });
  const m = F.calcWheel(wheel);
  // Premium $180 (80 - 40 + 80 + 60, roll nets +$40) + share $100 (called away at $21) = $280 realised
  assert.ok(Math.abs(m.realisedPnL - 280) < 0.01, `realisedPnL ${m.realisedPnL}`);
  assert.strictEqual(F.wheelPeakCapital(tr), 2000);
  const cr = F.cycleReturn(wheel, m, { realised: 0, openShares: 0 }, 0, '2026-02-15');
  assert.strictEqual(cr.days, 45);
  assert.ok(Math.abs(cr.ann - 113.6) < 0.1, `cycle ann ${cr.ann}`);
  const a = F.calcAROC(wheel, m, '2026-02-15');
  assert.ok(Math.abs(a.aroc - 73.0) < 0.1, `premium aroc ${a.aroc}`);
});

test('share-started wheel with negative breakeven still has positive AROC', () => {
  const tr = [
    { id: 's0', wheelId: 'w3', action: 'IN', entered: '2026-01-01', openMarket: true, shares: 100, total: 2000 },
    { id: 's1', wheelId: 'w3', action: 'STOC', entered: '2026-01-02', expiry: '2026-03-01', strike: 20, shares: 100, premium: 25, total: 2500, days: 58 },
  ];
  const wheel = W('w3', 'open');
  F.set({ trades: tr, wheels: [wheel] });
  const m = F.calcWheel(wheel);
  assert.ok(m.breakeven < 0);
  const cr = F.cycleReturn(wheel, m, { realised: 0, openShares: 100, openCost: 2000 }, 0, '2026-02-01');
  assert.ok(cr.raw > 0, `raw ${cr.raw}`);
  assert.strictEqual(cr.cap, 2000);
});

test('concurrent CSPs peak capital 4000; IN_MKT beside open CSP', () => {
  const tr = [
    { id: 'c1', wheelId: 'w4', action: 'CSP', entered: '2026-01-01', expiry: '2026-02-01', strike: 20, shares: 100, total: 50 },
    { id: 'c2', wheelId: 'w4', action: 'CSP', entered: '2026-01-02', expiry: '2026-02-15', strike: 20, shares: 100, total: 60 },
    { id: 'c3', wheelId: 'w4', action: 'IN', entered: '2026-01-03', openMarket: true, shares: 100, total: 2500 },
  ];
  assert.strictEqual(F.wheelPeakCapital(tr), 6500);
  const tr2 = tr.slice(0, 2);
  assert.strictEqual(F.wheelPeakCapital(tr2), 4000);
});

test('calledAwayProfit with dividends; opening fees on live profits', () => {
  assert.strictEqual(F.calledAwayProfit(21, 100, 2000, 100, 0, 25), 225);
  const opt = { premium: 0.5, contracts: 4, openCredit: 180 };
  assert.strictEqual(F.wheelCurrentProfit(opt, 88), 92);
  assert.strictEqual(F.pmccShortProfit({ entryPrice: 2, qty: 1, fees: 5 }, 1, 0), 95);
});
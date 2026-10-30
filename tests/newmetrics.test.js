const test = require('node:test');
const assert = require('node:assert');
const { extractFn } = require('./extract');
const L = new Function(extractFn('optionsLib') + '\nconst OPTS=optionsLib();\n' + ['walkLegPairs','realisedPremium','shareRealisations','cycleReturn','calledAwayProfit','tickerPnL','capitalAtWork'].map(extractFn).join('\n') + '\nreturn {cycleReturn,calledAwayProfit,tickerPnL,capitalAtWork};')();
const m = (trades, premiumRealised, premiumNet = premiumRealised) => ({ trades, premiumRealised, premiumNet });
test('closed cycle annualised over first trade to last expiry', () => {
  const t = [{ action: 'CSP', strike: 100, shares: 100, entered: '2026-01-01', expiry: '2026-01-31' }];
  const r = L.cycleReturn({ status: 'closed' }, m(t, 500), { realised: 0, openShares: 0 }, 0);
  assert.strictEqual(r.days, 31); assert.strictEqual(r.raw, 5);
  assert.ok(Math.abs(r.ann - 5 * 365 / 31) < 1e-9);
});
test('open cycle: realised only (no unrealised, no open premium); under 7 days not annualised', () => {
  const t = [{ action: 'CSP', strike: 100, shares: 100, entered: '2026-10-20' }];
  const r = L.cycleReturn({ status: 'open' }, m(t, 50, 200), { realised: 0, openShares: 100, openCost: 10000, unrealised: -100 }, 0, '2026-10-23');
  assert.strictEqual(r.total, 50); assert.ok(!r.incUnrealised); assert.strictEqual(r.ann, null); assert.strictEqual(r.days, 4);
});
test('profit if called', () => {
  assert.strictEqual(L.calledAwayProfit(110, 100, 10000, 650, 0), 1650);
  assert.strictEqual(L.calledAwayProfit(0, 100, 1, 1), null);
});
test('ticker P&L combines wheel and LEAPs, year vs all time', () => {
  const trades = [{ wheelId: 'w1', action: 'CSP', total: 300, entered: '2025-06-01' }, { wheelId: 'w1', action: 'BTC', total: 50, entered: '2026-02-01' },
    { wheelId: 'w1', action: 'IN', shares: 100, total: 10000, entered: '2026-03-01' }, { wheelId: 'w1', action: 'OUT', shares: 100, total: 11000, entered: '2026-04-01' }];
  const legs = [{ status: 'closed', side: 'short', underlying: 'tsla', entryPrice: 2, closePrice: 1, qty: 1, closeDate: '2026-05-01' }, { status: 'open', side: 'long', underlying: 'NVDA', entryPrice: 50, qty: 1 }];
  const r = L.tickerPnL(trades, [{ id: 'w1', ticker: 'TSLA' }], legs, '2026');
  assert.strictEqual(r.length, 1); assert.strictEqual(r[0].all, 1350); assert.strictEqual(r[0].year, 1350); // 2025 put was bought back in 2026, so its premium banks in 2026
});
test('capital at work keeps LEAPs separate; % only with account size', () => {
  const legs = [{ status: 'open', side: 'long', entryPrice: 50, qty: 1 }, { status: 'open', side: 'short', entryPrice: 3, qty: 1 }];
  const c = L.capitalAtWork(30000, 15000, legs, null);
  assert.strictEqual(c.wheel, 45000); assert.strictEqual(c.leaps, 5000); assert.strictEqual(c.pct, null);
  assert.strictEqual(L.capitalAtWork(30000, 20000, [], 100000).pct, 50);
});
const R = new Function(extractFn('monthReturnPct') + '\nreturn monthReturnPct;')();
test('capital at work total includes open non-demo LEAP cost', () => {
  const legs = [{ status: 'open', side: 'long', entryPrice: 50, qty: 1 }, { status: 'open', side: 'long', entryPrice: 50, qty: 1, demo: true }, { status: 'closed', side: 'long', entryPrice: 50, qty: 1 }];
  const c = L.capitalAtWork(10000, 20000, legs, null);
  assert.strictEqual(c.leaps, 5000); assert.strictEqual(c.total, 35000);
});
test('month return % with 2% target boundary', () => {
  assert.strictEqual(R(100, 0), null);
  assert.deepStrictEqual(R(800, 40000), { pct: 2, ok: true });
  const r = R(790, 40000); assert.ok(Math.abs(r.pct - 1.975) < 1e-9); assert.strictEqual(r.ok, false);
  assert.strictEqual(R(-100, 10000).ok, false);
});

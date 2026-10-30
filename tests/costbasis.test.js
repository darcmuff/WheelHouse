// Cost basis / breakeven per share held (calcWheel → m.breakeven). Hand-calculated expectations.
// Trade totals are net of fees (computeTotal: credits = premium×shares − fees, debits = premium×shares + fees).
const test = require('node:test');
const assert = require('node:assert');
const { extractFn } = require('./extract');
const S = new Function('let db={trades:[]};' + ['walkLegPairs','realisedPremium','shareRealisations', 'calcWheel', 'computeTotal'].map(extractFn).join('\n') +
  "\nconst CREDITS=new Set(['CSP','STOC','STO','STC','OUT','DIV']);function isCredit(a){return CREDITS.has(a);}" +
  '\nreturn {run:(tr,id="w")=>{db={trades:tr};return calcWheel({id});},computeTotal};')();
let n = 0;
const T = (action, entered, premium, shares, fees = 0, x = {}) => ({ id: 't' + (n++), wheelId: 'w', action, entered, premium, shares, fees, total: S.computeTotal(action, premium, shares, fees), ...x });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test('1. assignment then covered calls expiring', () => {
  // 100 @ $50 = 5000; calls 1.00 and 0.80 → 180; basis (5000−180)/100
  const m = S.run([T('IN', '2026-01-02', 50, 100), T('STOC', '2026-01-05', 1, 100), T('STOC', '2026-01-20', 0.8, 100)]);
  near(m.breakeven, 48.2);
});
test('2. CSP premium before assignment counts (standard wheel adjusted basis)', () => {
  // CSP 1.50 → 150; assigned 100 @ 50; basis (5000−150)/100 = 48.50
  const m = S.run([T('CSP', '2026-01-02', 1.5, 100), T('IN', '2026-01-17', 50, 100)]);
  near(m.breakeven, 48.5);
});
test('3. covered call bought back / rolled raises basis', () => {
  // IN 5000; STOC 1.00 (100); BTC 1.60 (160); roll STOC 2.00 (200) → premium net 140 → 48.60
  const m = S.run([T('IN', '2026-01-02', 50, 100), T('STOC', '2026-01-05', 1, 100), T('BTC', '2026-01-15', 1.6, 100), T('STOC', '2026-01-15', 2, 100)]);
  near(m.breakeven, 48.6);
});
test('4. two assignments at different strikes', () => {
  // 100 @ 50 + 100 @ 45 = 9500; CSPs 150 + 120; call 2.00×200 = 400 → (9500−670)/200 = 44.15
  const m = S.run([T('CSP', '2026-01-02', 1.5, 100), T('IN', '2026-01-17', 50, 100), T('CSP', '2026-01-20', 1.2, 100), T('IN', '2026-02-06', 45, 100), T('STOC', '2026-02-09', 2, 200)]);
  assert.strictEqual(m.sharesHeld, 200);
  near(m.breakeven, 44.15);
});
test('5. partial call-away: sale proceeds must not distort the remaining basis', () => {
  // 200 @ 50 = 10000 (FIFO: lot A 100@50, lot B 100@50); premium 500; 100 called @ 55 → 5500.
  // Remaining lot cost 5000 → (5000−500)/100 = 45.00. (Old net-cash method gave (10000−500−5500)/100 = 40.)
  const m = S.run([T('IN', '2026-01-02', 50, 200), T('STOC', '2026-01-05', 2.5, 200), T('OUT', '2026-01-17', 55, 100)]);
  assert.strictEqual(m.sharesHeld, 100);
  near(m.breakeven, 45);
  // FIFO with different lots: 100@50 then 100@40; 100 called @ 52 sells the $50 lot → remaining 4000 − 300 premium = 37
  const m2 = S.run([T('IN', '2026-01-02', 50, 100), T('IN', '2026-02-02', 40, 100), T('STOC', '2026-02-05', 1.5, 200), T('OUT', '2026-02-20', 52, 100)]);
  near(m2.breakeven, 37);
});
test('6. full call-away then new rotation: no leakage across rotations', () => {
  const closed = [T('IN', '2026-01-02', 50, 100), T('STOC', '2026-01-05', 1, 100), T('OUT', '2026-01-17', 52, 100)];
  const m = S.run(closed);
  assert.strictEqual(m.sharesHeld, 0);
  assert.strictEqual(m.breakeven, null);
  const nr = [{ ...T('CSP', '2026-02-01', 1, 100), wheelId: 'w2' }, { ...T('IN', '2026-02-20', 48, 100), wheelId: 'w2' }];
  near(S.run(closed.concat(nr), 'w2').breakeven, 47); // 4800 − 100
});
test('7. fees: IN fee adds to cost, option fees reduce premium', () => {
  // IN 50×100 + 1.00 fee = 5001; STOC 1.00×100 − 0.65 = 99.35; BTC 0.20×100 + 0.65 = 20.65 → (5001 − 78.70)/100
  const m = S.run([T('IN', '2026-01-02', 50, 100, 1), T('STOC', '2026-01-05', 1, 100, 0.65), T('BTC', '2026-01-12', 0.2, 100, 0.65)]);
  near(m.breakeven, (5001 - 78.7) / 100);
});
test('8. dividends reduce basis', () => {
  const m = S.run([T('IN', '2026-01-02', 50, 100), { ...T('DIV', '2026-01-20', 0.25, 100) }]);
  near(m.breakeven, 49.75);
});
test('9. manual buy / sell trades (IN/OUT at market) behave like assignment / call-away', () => {
  // buy 100 @ 30, buy 50 @ 33 (4650), sell 50 @ 35 (FIFO from the $30 lot) → remaining 50@30 + 50@33 = 3150, call 0.5×100 = 50
  const m = S.run([T('IN', '2026-01-02', 30, 100), T('IN', '2026-01-05', 33, 50), T('OUT', '2026-01-09', 35, 50), T('STOC', '2026-01-10', 0.5, 100)]);
  assert.strictEqual(m.sharesHeld, 100);
  near(m.breakeven, 31);
});
test('10. edge cases: no shares → null; premium larger than cost → zero/negative basis is shown honestly', () => {
  assert.strictEqual(S.run([T('CSP', '2026-01-02', 1, 100)]).breakeven, null);
  assert.strictEqual(S.run([]).breakeven, null);
  near(S.run([T('IN', '2026-01-02', 2, 100), T('STOC', '2026-01-05', 2.5, 100)]).breakeven, -0.5);
});

// currentvalue.test.js — wheel card "Profit": picks the most recent OPEN short option and prices it.
const test = require('node:test');
const assert = require('node:assert');
const { load } = require('./extract');
const { wheelCurrentOption, wheelCurrentValue, wheelCurrentProfit, wheelCurrentPct } = load([
  { kind: 'fn', name: 'walkLegPairs' },
  { kind: 'fn', name: 'openOptionLegs' },
  { kind: 'fn', name: 'wheelCurrentOption' },
  { kind: 'fn', name: 'wheelCurrentValue' },
  { kind: 'fn', name: 'wheelCurrentProfit' },
  { kind: 'fn', name: 'wheelCurrentPct' },
]);
const d = o => { const x = new Date(); x.setDate(x.getDate() + o); return x.toISOString().slice(0, 10); };

test('picks the open put after a roll, not the closed one', () => {
  const tr = [
    { id: 'a', action: 'CSP', entered: d(-30), expiry: d(-10), strike: 20, shares: 400, total: 100 },
    { id: 'b', action: 'BTC', entered: d(-12), strike: 20, shares: 400, total: 150, rollId: 'r' },
    { id: 'c', action: 'CSP', entered: d(-12), expiry: d(20), strike: 19, shares: 400, total: 200, rollId: 'r' },
  ];
  const o = wheelCurrentOption('sofi', tr);
  assert.strictEqual(o.id, 'c');
  assert.strictEqual(o.occ, 'SOFI' + d(20).replace(/-/g, '').slice(2) + 'P00019000');
  assert.strictEqual(o.contracts, 4);
  assert.strictEqual(wheelCurrentValue(o, 0.35), 140);
});
test('open call is type C; nothing open → null; no quote → null', () => {
  const tr = [{ id: 'x', action: 'STOC', entered: d(-3), expiry: d(10), strike: 25, shares: 100, total: 40 }];
  assert.strictEqual(wheelCurrentOption('T', tr).type, 'C');
  assert.strictEqual(wheelCurrentOption('T', [{ id: 'y', action: 'CSP', entered: d(-30), expiry: d(-5), strike: 20, shares: 100, total: 30, expiredWorthless: true }]), null);
  assert.strictEqual(wheelCurrentValue(wheelCurrentOption('T', tr), null), null);
});

test('% vs premium received: + when cheaper to buy back, - when dearer', () => {
  const tr = [{ id: 'p', action: 'CSP', entered: d(-5), expiry: d(20), strike: 19, premium: 0.5, shares: 400, total: 200 }];
  const o = wheelCurrentOption('SOFI', tr);
  assert.strictEqual(o.premium, 0.5);
  // received 0.5 x 100 x 4 = 200
  assert.strictEqual(wheelCurrentPct(o, wheelCurrentValue(o, 0.27)), 46);   // 108 → +46%
  assert.strictEqual(wheelCurrentPct(o, wheelCurrentValue(o, 0.6)), -20);   // 240 → -20%
  assert.strictEqual(wheelCurrentPct(o, null), null);
  assert.strictEqual(wheelCurrentPct({ ...o, premium: null }, 100), null);
});

test('Profit $ = premium received - buy-back cost, signed', () => {
  const o = wheelCurrentOption('SOFI', [{ id: 'p', action: 'CSP', entered: d(-5), expiry: d(20), strike: 19, premium: 0.5, shares: 400, total: 200 }]);
  assert.strictEqual(wheelCurrentProfit(o, wheelCurrentValue(o, 0.27)), 92);
  assert.strictEqual(wheelCurrentProfit(o, wheelCurrentValue(o, 0.6)), -40);
  assert.strictEqual(wheelCurrentProfit(o, null), null);
  assert.strictEqual(wheelCurrentProfit({ ...o, premium: null }, 100), null);
});

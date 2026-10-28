// currentvalue.test.js — wheel card "Current value": picks the most recent OPEN short option and prices it.
const test = require('node:test');
const assert = require('node:assert');
const { load } = require('./extract');
const { wheelCurrentOption, wheelCurrentValue } = load([
  { kind: 'fn', name: 'walkLegPairs' },
  { kind: 'fn', name: 'openOptionLegs' },
  { kind: 'fn', name: 'wheelCurrentOption' },
  { kind: 'fn', name: 'wheelCurrentValue' },
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

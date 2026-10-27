const test = require('node:test');
const assert = require('node:assert');
const { load } = require('./extract');
const f = load([{ kind: 'fn', name: 'shareRealisations' }, { kind: 'fn', name: 'rotationShareStats' }, { kind: 'fn', name: 'calcUnrealised' }]);
const T = (wheelId, action, total, shares, entered) => ({ wheelId, action, total, shares, entered });
const trades = [T('a', 'IN', 18000, 100, '2026-08-01'), T('a', 'CSP', 200, 100, '2026-07-01'),
  T('b', 'IN', 10000, 100, '2026-08-01'), T('b', 'OUT', 10600, 100, '2026-09-01')];
const wheels = [{ id: 'a', status: 'open', lastPrice: 172 }, { id: 'b', status: 'open' }, { id: 'c', status: 'open' }];
const price = w => w.lastPrice ?? null;

test('rotation: unrealised is open shares at price minus FIFO cost; premium not mixed in', () => {
  const r = f.rotationShareStats(wheels[0], trades, price);
  assert.strictEqual(r.unrealised, -800);
  assert.strictEqual(r.realised, 0);
});
test('rotation with shares sold: realised shares P&L, nothing unrealised', () => {
  const r = f.rotationShareStats(wheels[1], trades, price);
  assert.strictEqual(r.realised, 600); assert.strictEqual(r.unrealised, 0);
});
test('unpriced rotations holding shares are counted, not guessed', () => {
  const u = f.calcUnrealised([...wheels, { id: 'd', status: 'open' }], [...trades, T('d', 'IN', 5000, 100, '2026-09-01')], price);
  assert.strictEqual(u.value, -800); assert.strictEqual(u.unpriced, 1);
});

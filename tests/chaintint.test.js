// chaintint.test.js — each roll chain gets its own permanent tint index.
const test = require('node:test');
const assert = require('node:assert');
const { load } = require('./extract');
const { wheelChainMap, pmccChainMap } = load([
  { kind: 'const', name: 'CREDITS' },
  { kind: 'fn', name: 'isCredit' },
  { kind: 'fn', name: 'walkLegPairs' },
  { kind: 'fn', name: 'buildRollChain' },
  { kind: 'fn', name: 'isChainTip' },
  { kind: 'const', name: '_chainMapCache' },
  { kind: 'fn', name: 'wheelChainMap' },
  { kind: 'fn', name: 'pmccChainMap' },
]);

test('wheel: two chains get distinct indices, plain trades none', () => {
  const T = [
    { id: 'a1', action: 'CSP', entered: '2026-01-01', expiry: '2026-02-01', strike: 20, shares: 100, total: 100 },
    { id: 'a2', action: 'BTC', entered: '2026-01-20', strike: 20, shares: 100, total: 150, rollId: 'r1' },
    { id: 'a3', action: 'CSP', entered: '2026-01-20', expiry: '2026-03-01', strike: 19, shares: 100, total: 200, rollId: 'r1' },
    { id: 'b1', action: 'CSP', entered: '2026-04-01', expiry: '2026-05-01', strike: 18, shares: 100, total: 90 },
    { id: 'b2', action: 'BTC', entered: '2026-04-20', strike: 18, shares: 100, total: 120, rollId: 'r2' },
    { id: 'b3', action: 'CSP', entered: '2026-04-20', expiry: '2026-06-01', strike: 17, shares: 100, total: 160, rollId: 'r2' },
    { id: 'p1', action: 'CSP', entered: '2026-03-05', expiry: '2026-03-20', strike: 18, shares: 100, total: 50 },
  ];
  const m = wheelChainMap(T);
  assert.equal(m.a1, m.a2); assert.equal(m.a2, m.a3);
  assert.equal(m.b1, m.b3);
  assert.notEqual(m.a1, m.b1);
  assert.equal(m.p1, undefined);
});

test('pmcc: rolledFrom chains indexed, lone short untinted', () => {
  const L = id => ({ id, rolledFrom: null });
  const s1 = L('s1'), s2 = { id: 's2', rolledFrom: 's1' }, s3 = L('s3'), s4 = { id: 's4', rolledFrom: 's3' }, s5 = L('s5');
  const ev = [s1, s2, s3, s4, s5].map(l => ({ kind: 'short', legId: l.id, leg: l }));
  ev.unshift({ kind: 'leap', legId: 'L' });
  const m = pmccChainMap(ev);
  assert.equal(m.s1, m.s2); assert.equal(m.s3, m.s4);
  assert.notEqual(m.s1, m.s3); assert.equal(m.s5, undefined);
});

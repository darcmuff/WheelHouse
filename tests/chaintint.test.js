// chaintint.test.js — each roll chain gets its own permanent tint index.
const test = require('node:test');
const assert = require('node:assert');
const { load } = require('./extract');
const { wheelChainMap, pmccChainMap, buildRollChain, isChainTip, pmccRollParents } = load([
  { kind: 'const', name: 'CREDITS' },
  { kind: 'fn', name: 'isCredit' },
  { kind: 'fn', name: 'walkLegPairs' },
  { kind: 'fn', name: 'strikeStep' },
  { kind: 'fn', name: 'nearStrike' },
  { kind: 'fn', name: 'exactSubset' },
  { kind: 'const', name: '_effRollCache' },
  { kind: 'fn', name: 'withInferredRolls' },
  { kind: 'fn', name: 'buildRollChain' },
  { kind: 'fn', name: 'isChainTip' },
  { kind: 'const', name: '_chainMapCache' },
  { kind: 'fn', name: 'wheelChainMap' },
  { kind: 'fn', name: 'pmccRollParents' },
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
  const B = { side: 'short', type: 'C' };
  const L = id => ({ ...B, id, rolledFrom: null });
  const s1 = L('s1'), s2 = { ...B, id: 's2', rolledFrom: 's1' }, s3 = L('s3'), s4 = { ...B, id: 's4', rolledFrom: 's3' }, s5 = L('s5');
  const ev = [s1, s2, s3, s4, s5].map(l => ({ kind: 'short', legId: l.id, leg: l }));
  ev.unshift({ kind: 'leap', legId: 'L' });
  const m = pmccChainMap(ev);
  assert.equal(m.s1, m.s2); assert.equal(m.s3, m.s4);
  assert.notEqual(m.s1, m.s3); assert.equal(m.s5, undefined);
});

test('trade tables do not paint chain strips, roll icons or tint', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'app', 'index.html'), 'utf8');
  assert.ok(!/chain-row|roll-badge|chain-tint|roll-trade|roll-slot|⛓ Chain|chain complete/.test(src));
});

// Marc's real SOFI-style example: two 400 CSPs → both bought back 01/04 and rolled into one
// 800 CSP the same day (merge roll, only one BTC carries a stored rollId), then 14/04 the
// 800 is bought back and a new 800 sold the same day at $17 (no stored link at all).
const MARC = [
  { id: 'c1', action: 'CSP', entered: '2026-03-20', expiry: '2026-04-02', strike: 17, shares: 400, total: 305.84 },
  { id: 'c2', action: 'CSP', entered: '2026-03-20', expiry: '2026-04-02', strike: 17, shares: 400, total: 305.84 },
  { id: 'b1', action: 'BTC', entered: '2026-04-01', strike: 17, shares: 400, total: 594.16, rollId: 'R2' },
  { id: 'b2', action: 'BTC', entered: '2026-04-01', strike: 17, shares: 400, total: 594.16 },
  { id: 'c3', action: 'CSP', entered: '2026-04-01', expiry: '2026-04-17', strike: 17, shares: 800, total: 1363.68, rollId: 'R2' },
  { id: 'b3', action: 'BTC', entered: '2026-04-14', strike: 17, shares: 800, total: 100.32 },
  { id: 'c4', action: 'CSP', entered: '2026-04-14', expiry: '2026-04-24', strike: 17, shares: 800, total: 278.64 },
  { id: 'x1', action: 'CSP', entered: '2026-05-01', expiry: '2026-05-15', strike: 15, shares: 400, total: 90 },
];
test('unstored same-day buyback and sale are not a roll; only the stored rollId links', () => {
  assert.equal(isChainTip(MARC, MARC.find(t => t.id === 'c4')), false);
  assert.ok(isChainTip(MARC, MARC.find(t => t.id === 'c3')));
  const c = buildRollChain(MARC, 'c3');
  assert.equal(c.rolls, 1);
  assert.ok(c.trades.some(t => t.id === 'b1') && c.trades.some(t => t.id === 'c3'));
  assert.ok(!c.trades.some(t => t.id === 'b2'), 'the second same-day buyback is not silently added');
  assert.ok(!c.trades.some(t => t.id === 'c4'), 'the later same-day sale is not a roll');
  const m = wheelChainMap(MARC);
  assert.equal(m.b2, undefined);
  assert.equal(m.c4, undefined);
  assert.equal(m.x1, undefined);
});
test('no over-linking: different shares, different day or far strike stay separate', () => {
  const T = [
    { id: 'a', action: 'CSP', entered: '2026-01-02', expiry: '2026-01-16', strike: 17, shares: 400, total: 100 },
    { id: 'b', action: 'BTC', entered: '2026-01-10', strike: 17, shares: 400, total: 50 },
    { id: 'c', action: 'CSP', entered: '2026-01-10', expiry: '2026-01-30', strike: 17, shares: 800, total: 200 }, // shares don't add up
    { id: 'd', action: 'CSP', entered: '2026-01-11', expiry: '2026-01-30', strike: 17, shares: 400, total: 90 },  // next day
    { id: 'e', action: 'CSP', entered: '2026-01-10', expiry: '2026-01-30', strike: 12, shares: 400, total: 90 },  // far strike
  ];
  assert.deepEqual(wheelChainMap(T), {});
});
test('pmcc: same-day buy backs are NOT inferred into a roll; only stored rolledFrom links', () => {
  const B = { side: 'short', type: 'C', underlying: 'SOFI', parentLeapId: 'L' };
  const legs = [
    { ...B, id: 'p1', qty: 4, strike: 17, entryDate: '2026-03-20', status: 'closed', closeDate: '2026-04-01' },
    { ...B, id: 'p2', qty: 4, strike: 17, entryDate: '2026-03-20', status: 'closed', closeDate: '2026-04-01' },
    { ...B, id: 'p3', qty: 8, strike: 18, entryDate: '2026-04-01', status: 'open', rolledFrom: 'p1' },
  ];
  assert.deepEqual(pmccRollParents(legs).p3, ['p1']);
  assert.equal(pmccRollParents(legs).p2, undefined);
});

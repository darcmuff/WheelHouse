// rollchain.test.js — regression suite for buildRollChain / isChainTip.
// Run: node tests/rollchain.test.js
// Extracts the live functions from app/index.html so tests never go stale.
const { load } = require('./extract');

const { buildRollChain, isChainTip } = load([
  { kind: 'const', name: 'CREDITS' },
  { kind: 'fn', name: 'isCredit' },
  { kind: 'fn', name: 'walkLegPairs' },
  { kind: 'fn', name: 'buildRollChain' },
  { kind: 'fn', name: 'isChainTip' },
]);

const d = (offsetDays) => {
  const dt = new Date();
  dt.setDate(dt.getDate() + offsetDays);
  return dt.toISOString().slice(0, 10);
};
const OLD = d(-40), MID = d(-20), RECENT = d(-5), FUTURE = d(30);

let pass = 0, fail = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}\n    expected ${JSON.stringify(want)}\n    got      ${JSON.stringify(got)}`); }
}
function approx(name, got, want, tol = 0.005) {
  const ok = got != null && Math.abs(got - want) <= tol;
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}\n    expected ~${want}\n    got      ${got}`); }
}

console.log('buildRollChain — campaign P&L\n');

// ── Scenario A: simple two-link chain, live tip ──
// CSP +100 → rolled (BTC -200, CSP +200) → live. Chain net = +100.
// The Robinhood lie: leg 2 shows "up" at $100 to close, but $100 close = campaign zero.
const A = [
  { id: 'a1', action: 'CSP', entered: OLD, expiry: MID, strike: 20, shares: 400, total: 100 },
  { id: 'a2', action: 'BTC', entered: MID, strike: 20, shares: 400, total: 200, rollId: 'r1' },
  { id: 'a3', action: 'CSP', entered: MID, expiry: FUTURE, strike: 19, shares: 400, total: 200, rollId: 'r1' },
];
const cA = buildRollChain(A, 'a3');
eq('A: chain has 3 legs, 1 roll', [cA.trades.length, cA.rolls], [3, 1]);
approx('A: net credit +$100', cA.net, 100);
eq('A: tip is live', cA.live, true);
approx('A: breakeven buyback $0.25/share (100 ÷ 400)', cA.breakeven, 0.25);
eq('A: tip detection — a3 is tip, a1 is not', [isChainTip(A, A[2]), isChainTip(A, A[0])], [true, false]);

// ── Scenario B: Marc's real Rotation 3 shape — MERGED chains ──
// Two 4-lot CSPs closed by ONE 8-lot roll closer; 8-lot opener is the tip.
// b0: CSP $17.50 root of branch one; roll_1 closes it, opens b2 ($17).
// b1: CSP $17 fresh root of branch two.
// roll_2: 8-lot BTC consumes b2 AND b1, opens 8-lot b4.
const B = [
  { id: 'b0', action: 'CSP', entered: OLD, expiry: MID, strike: 17.5, shares: 400, total: 210 },
  { id: 'b1', action: 'CSP', entered: OLD, expiry: MID, strike: 17, shares: 400, total: 213.84 },
  { id: 'b2', action: 'CSP', entered: MID, expiry: RECENT, strike: 17, shares: 400, total: 305.84, rollId: 'roll_1' },
  { id: 'b3', action: 'BTC', entered: MID, strike: 17.5, shares: 400, total: 222.16, rollId: 'roll_1' },
  { id: 'b4', action: 'CSP', entered: RECENT, expiry: FUTURE, strike: 17, shares: 800, total: 1363.68, rollId: 'roll_2' },
  { id: 'b5', action: 'BTC', entered: RECENT, strike: 17, shares: 800, total: 1188.32, rollId: 'roll_2' },
];
const cB = buildRollChain(B, 'b4');
eq('B: merge pulls in both branches — 6 legs, 2 rolls', [cB.trades.length, cB.rolls], [6, 2]);
// net = 210 + 213.84 + 305.84 + 1363.68 − 222.16 − 1188.32 = 682.88
approx('B: chain net +$682.88 across the merge', cB.net, 682.88);
eq('B: tip live', cB.live, true);
approx('B: breakeven $0.8536 (682.88 ÷ 800)', cB.breakeven, 0.8536);

// ── Scenario C: completed chain — Marc's HOOD exit, net-flat ──
// STOC +346.38 → roll (BTC −630, STOC +642, fees inside totals) → final BTC −352.62. Net −? 
// 346.38 − 630 + 642 − 355.86... use his real figures: +346.38 −630.00 +642.00 −3.24(fees in legs) −352.62 = +2.52
const C = [
  { id: 'c1', action: 'STOC', entered: OLD, expiry: MID, strike: 110, shares: 300, total: 346.38 },
  { id: 'c2', action: 'BTC', entered: MID, strike: 110, shares: 300, total: 631.62, rollId: 'h1' }, // 630 + half fees
  { id: 'c3', action: 'STOC', entered: MID, expiry: RECENT, strike: 115, shares: 300, total: 640.38, rollId: 'h1' }, // 642 − half fees
  { id: 'c4', action: 'BTC', entered: RECENT, strike: 115, shares: 300, total: 352.62 },
];
const cC = buildRollChain(C, 'c3');
approx('C: HOOD chain nets +$2.52 — flat, LEAPs freed', cC.net, 2.52);
eq('C: tip closed by plain BTC → chain complete, still a tip', [cC.live, isChainTip(C, C[2])], [false, true]);

// ── Scenario D: non-chain legs return null ──
const D = [{ id: 'd1', action: 'CSP', entered: OLD, expiry: FUTURE, strike: 20, shares: 400, total: 100 }];
eq('D: plain leg — no chain', buildRollChain(D, 'd1'), null);

// ── Scenario E: underwater chain — no green buyback ──
const E = [
  { id: 'e1', action: 'CSP', entered: OLD, expiry: MID, strike: 20, shares: 400, total: 100 },
  { id: 'e2', action: 'BTC', entered: MID, strike: 20, shares: 400, total: 400, rollId: 'r9' },
  { id: 'e3', action: 'CSP', entered: MID, expiry: FUTURE, strike: 19, shares: 400, total: 150, rollId: 'r9' },
];
const cE = buildRollChain(E, 'e3');
approx('E: net −$150', cE.net, -150);
eq('E: breakeven ≤ 0 — flagged underwater', cE.breakeven <= 0, true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// datahealth.test.js — regression suite for runDataHealth's leg-pairing engine,
// specifically the rollId-sibling exclusion (a roll's closer must never consume
// its own replacement opener) ported from walkLegPairs.
// Run: node tests/datahealth.test.js
// Extracts the live function from app/index.html so tests never go stale.
const { extractFn } = require('./extract');

// runDataHealth reads module-level globals (db, esc, fmt2, fmtDateFull) rather than
// taking arguments, so we sandbox it with stubs and a db setter instead of load().
const stubs = `
const esc = s => String(s == null ? '' : s);
const fmt2 = n => Number(n).toFixed(2);
const fmtDateFull = d => d;
let db = { wheels: [], trades: [] };
`;
const factory = new Function(stubs + extractFn('runDataHealth')
  + `\nreturn { run: runDataHealth, setDb: d => { db = d; } };`);
const { run, setDb } = factory();

// ── date helpers: everything relative to today so tests never rot ──
const d = (offsetDays) => {
  const dt = new Date();
  dt.setDate(dt.getDate() + offsetDays);
  return dt.toISOString().slice(0, 10);
};
const OPENED = d(-30), EXPIRED = d(-10), ROLLDAY = d(-7), FUTURE = d(30);

let id = 0;
const T = (action, over = {}) => ({ id: 'x' + (++id), wheelId: 'w1', ticker: 'SOFI', action, entered: OPENED, ...over });
const wheel = (trades) => setDb({ wheels: [{ id: 'w1', ticker: 'SOFI' }], trades });

let pass = 0, fail = 0;
const check = (name, ok) => {
  ok ? pass++ : fail++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + name);
};

// ── 1. Same-strike up-sizing roll on an expired-flagged leg ──
// The canonical edge case: old $21 CSP flagged expired-worthless, then a roll
// (BTC $21 + new 8-lot CSP $21, same day, shared rollId). Without the nk()
// exclusion, degraded pairing tiers let the BTC eat its own replacement opener,
// hiding the expired/closed contradiction on the original leg.
{
  const oldLeg = T('CSP', { entered: OPENED, expiry: EXPIRED, strike: 21, shares: 400, total: 120, expiredWorthless: true });
  const rollBTC = T('BTC', { entered: ROLLDAY, expiry: EXPIRED, strike: 21, shares: 400, total: -40, rollId: 'R1' });
  const rollNew = T('CSP', { entered: ROLLDAY, expiry: FUTURE, strike: 21, shares: 800, total: 300, rollId: 'R1' });
  wheel([oldLeg, rollBTC, rollNew]);
  const issues = run();
  check('up-size roll: BTC pairs with old flagged leg — contradiction surfaces on it',
    issues.some(i => i.tradeId === oldLeg.id && /expired-worthless/.test(i.text)));
  check('up-size roll: BTC is not an orphan',
    !issues.some(i => i.tradeId === rollBTC.id && /orphan/.test(i.text)));
  check('up-size roll: replacement opener untouched — no issues on it',
    !issues.some(i => i.tradeId === rollNew.id));
}

// ── 2. Strikeless roll closer ──
// The last-resort fallback (no strike on the closer) must also skip the sibling:
// findLastIndex(nk) lands on the old leg, not the just-opened replacement.
{
  const oldLeg = T('CSP', { entered: OPENED, expiry: EXPIRED, strike: 20, shares: 400, total: 120 });
  const rollBTC = T('BTC', { entered: ROLLDAY, shares: 400, total: -40, rollId: 'R1' });
  const rollNew = T('CSP', { entered: ROLLDAY, expiry: FUTURE, strike: 21, shares: 400, total: 200, rollId: 'R1' });
  wheel([oldLeg, rollBTC, rollNew]);
  check('strikeless roll: BTC consumes old leg, not sibling — zero issues', run().length === 0);
}

// ── 3. Control: plain BTC (no rollId) still pairs normally ──
{
  const leg = T('CSP', { entered: OPENED, expiry: EXPIRED, strike: 21, shares: 400, total: 120 });
  const btc = T('BTC', { entered: d(-15), expiry: EXPIRED, strike: 21, shares: 400, total: -40 });
  wheel([leg, btc]);
  check('control: plain BTC pairs clean, zero issues', run().length === 0);
}

// ── 4. Control: genuine orphan closer is still caught ──
// nk() must never suppress the orphan warning when there really is nothing to close.
{
  const btc = T('BTC', { entered: ROLLDAY, expiry: EXPIRED, strike: 25, shares: 400, total: -40, rollId: 'R1' });
  const rollNew = T('CSP', { entered: ROLLDAY, expiry: FUTURE, strike: 25, shares: 400, total: 200, rollId: 'R1' });
  wheel([btc, rollNew]);
  const issues = run();
  check('orphan roll closer with no prior leg is still flagged',
    issues.some(i => i.tradeId === btc.id && /orphan/.test(i.text)));
}

// ── 5. Down-sizing roll: partial close across the boundary ──
// Old 8-lot leg, roll buys back all 8 but reopens only 4 — closer must drain
// the old leg fully and leave the new 4-lot alone.
{
  const oldLeg = T('CSP', { entered: OPENED, expiry: EXPIRED, strike: 22, shares: 800, total: 240 });
  const rollBTC = T('BTC', { entered: ROLLDAY, expiry: EXPIRED, strike: 22, shares: 800, total: -80, rollId: 'R1' });
  const rollNew = T('CSP', { entered: ROLLDAY, expiry: FUTURE, strike: 22, shares: 400, total: 150, rollId: 'R1' });
  wheel([oldLeg, rollBTC, rollNew]);
  check('down-size roll: same-strike 8-lot fully consumed, 4-lot sibling untouched', run().length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

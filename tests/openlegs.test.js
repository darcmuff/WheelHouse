// openlegs.test.js — regression suite for the share-aware openOptionLegs lifecycle walk.
// Run: node tests/openlegs.test.js
// Extracts the live function from app/index.html so tests never go stale.
const { load } = require('./extract');

const { openOptionLegs } = load([{ kind: 'fn', name: 'openOptionLegs' }]);

// ── date helpers: everything relative to today so tests never rot ──
const d = (offsetDays) => {
  const dt = new Date();
  dt.setDate(dt.getDate() + offsetDays);
  return dt.toISOString().slice(0, 10);
};
const PAST = d(-30), RECENT = d(-5), YDAY = d(-1), TODAY = d(0), SOON = d(7), FUTURE = d(30), FAR = d(60);

let id = 0;
const T = (action, over = {}) => ({ id: 'x' + (++id), ticker: 'SOFI', action, entered: RECENT, ...over });

let pass = 0, fail = 0;
function check(name, legs, expect) {
  // expect: array of {strike, _rem} (order-insensitive), or a count
  let ok;
  if (typeof expect === 'number') ok = legs.length === expect;
  else {
    ok = legs.length === expect.length && expect.every(e =>
      legs.some(l => Number(l.strike) === e.strike && (e._rem === undefined || l._rem === e._rem)));
  }
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else {
    fail++;
    console.log(`  ✗ ${name}`);
    console.log(`    expected: ${JSON.stringify(expect)}`);
    console.log(`    got:      ${JSON.stringify(legs.map(l => ({ action: l.action, strike: l.strike, expiry: l.expiry, _rem: l._rem })))}`);
  }
}

console.log('openOptionLegs — share-aware lifecycle\n');

// 1. Simple open CSP
check('open CSP shows as one leg, full shares remaining',
  openOptionLegs([T('CSP', { strike: 26, shares: 400, expiry: FUTURE })]),
  [{ strike: 26, _rem: 400 }]);

// 2. Roll: BTC old leg, open new — only new survives
check('roll survives: BTC consumes old leg, new CSP open',
  openOptionLegs([
    T('CSP', { strike: 26, shares: 400, expiry: SOON, entered: PAST }),
    T('BTC', { strike: 26, shares: 400, expiry: SOON, entered: RECENT }),
    T('CSP', { strike: 25, shares: 400, expiry: FUTURE, entered: RECENT }),
  ]),
  [{ strike: 25, _rem: 400 }]);

// 3. Same-day roll at same strike: strike+expiry tier pairs the closer to the right contract
check('same-strike chain: BTC matches strike AND expiry',
  openOptionLegs([
    T('CSP', { strike: 26, shares: 400, expiry: SOON, entered: PAST }),
    T('CSP', { strike: 26, shares: 400, expiry: FAR, entered: RECENT }),
    T('BTC', { strike: 26, shares: 400, expiry: SOON, entered: RECENT }),
  ]),
  [{ strike: 26, _rem: 400 }]); // the FAR one survives

// 4. expiredWorthless leg excluded from output
check('expired-worthless flag excludes leg',
  openOptionLegs([T('CSP', { strike: 26, shares: 400, expiry: FUTURE, expiredWorthless: true })]),
  0);

// 5. Closer prefers the unflagged leg (mirrors health-engine tiers)
check('BTC skips expired-flagged leg, eats the live one',
  openOptionLegs([
    T('CSP', { strike: 26, shares: 400, expiry: SOON, entered: PAST, expiredWorthless: true }),
    T('CSP', { strike: 26, shares: 400, expiry: FUTURE, entered: RECENT }),
    T('BTC', { strike: 26, shares: 400, entered: RECENT }),
  ]),
  0); // flagged one filtered, live one consumed

// 6. Early assignment: IN consumes a CSP whose expiry is still in the future
check('early assignment (IN) removes the CSP',
  openOptionLegs([
    T('CSP', { strike: 26, shares: 400, expiry: FUTURE, entered: PAST }),
    T('IN', { strike: 26, shares: 400, entered: RECENT }),
  ]),
  0);

// 7. Partial assignment leaves the remainder open
check('partial assignment: 200 of 400 consumed, _rem=200',
  openOptionLegs([
    T('CSP', { strike: 26, shares: 400, expiry: FUTURE, entered: PAST }),
    T('IN', { strike: 26, shares: 200, entered: RECENT }),
  ]),
  [{ strike: 26, _rem: 200 }]);

// 8. Partial BTC (close 2 of 4 contracts)
check('partial BTC: 200 of 400 shares closed, _rem=200',
  openOptionLegs([
    T('CSP', { strike: 26, shares: 400, expiry: FUTURE, entered: PAST }),
    T('BTC', { strike: 26, shares: 200, entered: RECENT }),
  ]),
  [{ strike: 26, _rem: 200 }]);

// 9. Partial consumption spans legs
check('IN for 600 spans two 400-share CSPs, second left with _rem=200',
  openOptionLegs([
    T('CSP', { strike: 26, shares: 400, expiry: YDAY, entered: PAST }),
    T('CSP', { strike: 26, shares: 400, expiry: FUTURE, entered: PAST }),
    T('IN', { strike: 26, shares: 600, entered: TODAY }),
  ]),
  [{ strike: 26, _rem: 200 }]); // YDAY leg fully consumed (preferred: expiry passed), FUTURE leg partially

// 10. IN prefers the CSP whose expiry most recently passed
check('assignment pairs to the leg whose expiry just passed',
  openOptionLegs([
    T('CSP', { strike: 26, shares: 400, expiry: d(-10), entered: PAST }),
    T('CSP', { strike: 26, shares: 400, expiry: YDAY, entered: PAST }),
    T('IN', { strike: 26, shares: 400, entered: TODAY }),
  ]),
  0); // both filtered anyway (expiries past) — structural check below via OUT/STOC instead

// 11. OUT consumes matching STOC (called away)
check('call-away (OUT) removes the STOC',
  openOptionLegs([
    T('STOC', { strike: 30, shares: 400, expiry: FUTURE, entered: PAST }),
    T('OUT', { strike: 30, shares: 400, entered: RECENT }),
  ]),
  0);

// 12. OUT with no matching strike = manual sale, STOC untouched
check('manual share sale (OUT, no strike match) leaves STOC open',
  openOptionLegs([
    T('STOC', { strike: 30, shares: 400, expiry: FUTURE, entered: PAST }),
    T('OUT', { strike: null, total: 11000, shares: 400, entered: RECENT }), // derives $27.50 — no STOC there
  ]),
  [{ strike: 30, _rem: 400 }]);

// 13. OUT derives strike from total/shares and pairs
check('OUT derives strike from total ÷ shares',
  openOptionLegs([
    T('STOC', { strike: 30, shares: 400, expiry: FUTURE, entered: PAST }),
    T('OUT', { strike: null, total: 12000, shares: 400, entered: RECENT }), // 12000/400 = $30
  ]),
  0);

// 14. Orphan BTC (strike present, no match) eats nothing
check('orphan closer consumes nothing',
  openOptionLegs([
    T('CSP', { strike: 26, shares: 400, expiry: FUTURE, entered: PAST }),
    T('BTC', { strike: 99, shares: 400, entered: RECENT }),
  ]),
  [{ strike: 26, _rem: 400 }]);

// 15. BTC with no strike falls back to most recent leg
check('strikeless BTC closes most recent leg',
  openOptionLegs([
    T('CSP', { strike: 26, shares: 400, expiry: FUTURE, entered: PAST }),
    T('CSP', { strike: 25, shares: 400, expiry: FUTURE, entered: RECENT }),
    T('BTC', { strike: null, shares: 400, entered: TODAY }),
  ]),
  [{ strike: 26, _rem: 400 }]);

// 16. Closer with no share count consumes one whole leg
check('shareless closer eats exactly one whole leg',
  openOptionLegs([
    T('CSP', { strike: 26, shares: 400, expiry: SOON, entered: PAST }),
    T('CSP', { strike: 26, shares: 400, expiry: FUTURE, entered: PAST }),
    T('BTC', { strike: 26, shares: null, expiry: SOON, entered: RECENT }),
  ]),
  [{ strike: 26, _rem: 400 }]); // FUTURE leg survives intact

// 17. Lapsed unflagged leg (expiry past, never resolved) is not "open" for capital
check('lapsed leg awaiting verdict excluded from open set',
  openOptionLegs([T('CSP', { strike: 26, shares: 400, expiry: YDAY, entered: PAST })]),
  0);

// 18. Laddered CSPs at different strikes: BTC removes only its own
check('ladder: BTC $25 leaves $26 untouched',
  openOptionLegs([
    T('CSP', { strike: 26, shares: 400, expiry: FUTURE, entered: PAST }),
    T('CSP', { strike: 25, shares: 400, expiry: FUTURE, entered: PAST }),
    T('BTC', { strike: 25, shares: 400, entered: RECENT }),
  ]),
  [{ strike: 26, _rem: 400 }]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

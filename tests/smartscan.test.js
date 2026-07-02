// smartscan.test.js — regression suite for parseSmartText date/quantity parsing.
// Run:  node tests/smartscan.test.js
//
// Covers: rx2b month-first-no-year fix (Jun 2026), rx1 phantom-date lookbehind
// fix (Jul 2026), and all pre-existing date formats.
//
// Dates are computed relative to "today" at runtime so the suite never rots.

const { load } = require('./extract.js');

const { parseSmartText } = load(
  [
    { kind: 'const', name: 'MON_PAT' },
    { kind: 'const', name: 'MON_MAP' },
    { kind: 'fn', name: 'parseSmartText' },
  ],
  // parseSmartText calls computeTotal at the end; irrelevant to these assertions
  'function computeTotal(){return 0;}'
);

// ── dynamic date helpers ─────────────────────────────────────────────────────
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const daysFromNow = n => { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() + n); return d; };
const iso   = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const mFirst   = d => `${MONTHS[d.getMonth()]} ${d.getDate()}`;                       // "Jul 10"
const mFirstYr = d => `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;   // "Jul 10, 2026"
const dFirst   = d => `${d.getDate()} ${MONTHS[d.getMonth()]}`;                       // "10 Jul"
const dFirstYr = d => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;    // "10 Jul 2026"
const usSlash  = d => `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;
const compact  = d => `${d.getDate()}${MONTHS[d.getMonth()]}${d.getFullYear()}`;      // "10Jul2026"

const EXP = daysFromNow(10);   // expiry: safely in the future (avoids the ==today edge case)
const ENT = daysFromNow(-3);   // fill date: recent past

// ── scenarios ────────────────────────────────────────────────────────────────
const cases = [
  { name: 'Robinhood month-first, no year (rx2b fix)',
    text: `SOFI $20 Put ${mFirst(EXP)}\nSell to Open\nFilled ${mFirst(ENT)}\n4 contracts at $0.30`,
    expect: { expiry: iso(EXP), entered: iso(ENT), strike: 20, shares: 400, premium: 0.30 } },

  { name: 'Month-first WITH year (rx2 path, rx2b must not double-match)',
    text: `SOFI $20 Put ${mFirstYr(EXP)}\nSold to open ${mFirstYr(ENT)}\n4 contracts at $0.30`,
    expect: { expiry: iso(EXP), entered: iso(ENT) } },

  { name: 'Day-first, no year (rx1 path)',
    text: `SOFI $20 Put ${dFirst(EXP)}\nSell to Open filled ${dFirst(ENT)}\n4 contracts at $0.30`,
    expect: { expiry: iso(EXP), entered: iso(ENT) } },

  { name: 'Day-first WITH year (rx1 path)',
    text: `SOFI $20 Put ${dFirstYr(EXP)}\nSell to Open filled ${dFirstYr(ENT)}\n4 contracts at $0.30`,
    expect: { expiry: iso(EXP), entered: iso(ENT) } },

  { name: 'Contract count after month word is NOT a date (rx2b lookahead)',
    text: `HOOD $115 Call ${mFirst(EXP)}\nSell to Open\nFilled ${MONTHS[ENT.getMonth()]} 4 contracts at $2.14`,
    expect: { expiry: iso(EXP) } },

  { name: 'Price decimal before month word does NOT spawn phantom date (rx1 lookbehind fix)',
    text: `SOFI $20 Put ${mFirst(EXP)}\nSell to Open\n4 contracts at $0.30\n${mFirstYr(ENT)}`,
    expect: { expiry: iso(EXP), entered: iso(ENT) } },

  { name: 'Strike figure before month word does NOT spawn phantom date (rx1 lookbehind fix)',
    text: `SOFI $20 ${mFirst(EXP)} Puts\nSell to Open\nFilled ${mFirst(ENT)}\n4 contracts at $0.30`,
    expect: { expiry: iso(EXP), entered: iso(ENT) } },

  { name: 'Price decimal, day-first variant (rx1 lookbehind fix)',
    text: `SOFI $20 Put ${dFirst(EXP)}\nSold at $0.45\n${dFirstYr(ENT)}\n4 contracts`,
    expect: { expiry: iso(EXP), entered: iso(ENT) } },

  { name: 'ISO dates (IBKR / Trading 212)',
    text: `SOFI PUT strike: 20 qty: 4 fill price: 0.30 expiry ${iso(EXP)} trade date ${iso(ENT)} sell to open`,
    expect: { expiry: iso(EXP), entered: iso(ENT) } },

  { name: 'US slash dates (Schwab / E*Trade / Fidelity)',
    text: `SOFI $20 Put ${usSlash(EXP)} Sell to Open 4 contracts at $0.30 filled ${usSlash(ENT)}`,
    expect: { expiry: iso(EXP), entered: iso(ENT) } },

  { name: 'IBKR compact date (10Jul2026)',
    text: `SOFI ${compact(EXP)} 20 PUT SLD 4 @ 0.30 trade date ${iso(ENT)} open`,
    expect: { expiry: iso(EXP), entered: iso(ENT) } },
];

// ── runner ───────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
for (const c of cases) {
  const r = parseSmartText(c.text);
  const msgs = [];
  for (const [k, v] of Object.entries(c.expect)) {
    if (r[k] !== v) msgs.push(`${k}: got ${r[k]}, want ${v}`);
  }
  const ok = msgs.length === 0;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}${ok ? '' : '  ->  ' + msgs.join('; ')}`);
  ok ? pass++ : fail++;
}
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);

// pmcc.test.js — poor man's covered calls: short calls sold against a LEAP (fake figures only).
// Covers linking, premium/adjusted cost maths, warnings, SmartScan for sold calls, and that nothing touches wheel data.
// Run: node tests/pmcc.test.js
const { extractFn, extractConst } = require('./extract');
let pass = 0, fail = 0;
const check = (n, ok, x) => { ok ? pass++ : fail++; console.log((ok ? '  ✓ ' : '  ✗ ') + n + (ok || x === undefined ? '' : '  → ' + JSON.stringify(x))); };
const scanCode = ['MON_PAT','_LEAP_LABELS','MON_MAP','CREDITS','ACTION_MAP','VALID_ACTIONS'].map(extractConst)
  .concat(['isCredit','computeTotal','parseCSVLine','normDate','parseSmartText','brokerCSVLib','_lev','leapNormalize','leapFuzzy','leapScan','pmccScan'].map(extractFn)).join('\n');
const stubs = `const fmt2=n=>(+n).toFixed(2);const fmtMoney=n=>(n<0?'-':'')+'$'+Math.abs(n).toFixed(2);const esc=s=>String(s??'');
let db={wheels:[{id:'w1',ticker:'SPCX'}],trades:[{id:'t1',ticker:'SPCX'}],opts:[]};let writes=[];const _saveOpt=l=>writes.push(l);`;
const S = new Function(stubs + scanCode + extractFn('optionsLib') + '\nconst OPTS=optionsLib();\n' +
  ['splitLeapLegs','pmccShortsFor','pmccWarnings','pmccStats','pmccFormLeg','_fdShort','renderPmcc','optsToCSV'].map(extractFn).join('\n') +
  `\nconst B=brokerCSVLib();return {db,get writes(){return writes},OPTS,scan:t=>pmccScan(t,B,'2026-10-21'),splitLeapLegs,pmccShortsFor,pmccWarnings,pmccStats,pmccFormLeg,renderPmcc,optsToCSV,setOpts:o=>{db.opts=o}};`)();

const today = '2026-10-21';
const leap = { id: 'L1', groupId: 'L1', underlying: 'SPCX', type: 'C', side: 'long', strike: 150, expiry: '2028-06-16', qty: 2, entryPrice: 72, fees: 1.30, entryDate: '2026-06-01', status: 'open' };
const sh = (o) => ({ groupId: o.id, parentLeapId: 'L1', underlying: 'SPCX', type: 'C', side: 'short', qty: 2, fees: 1.30, closeFees: 0, status: 'open', ...o });
const a = sh({ id: 'a', strike: 240, expiry: '2026-08-21', entryPrice: 5.10, entryDate: '2026-07-10', status: 'closed', closePrice: 1.15, closeDate: '2026-08-12', closeFees: 1.30 });
const b = sh({ id: 'b', groupId: 'a', strike: 250, expiry: '2026-09-18', entryPrice: 4.60, entryDate: '2026-08-12', status: 'expired', closePrice: 0, closeDate: '2026-09-18', rolledFrom: 'a' });
const c = sh({ id: 'c', strike: 245, expiry: '2026-11-20', entryPrice: 6.40, entryDate: '2026-10-09', mark: 3.05 });
const other = { id: 'p1', groupId: 'p1', underlying: 'SPY', type: 'P', side: 'short', strike: 600, expiry: '2026-11-20', qty: 1, entryPrice: 5, status: 'open' };
const orphan = sh({ id: 'o', parentLeapId: 'gone', strike: 300, expiry: '2026-11-20', entryPrice: 1 });
const legs = [leap, a, b, c, other, orphan];

// ── linking ──
const sp = S.splitLeapLegs(legs);
check('LEAP stays a LEAP card even with shorts attached', sp.leaps.length === 1 && sp.leaps[0].id === 'L1');
check('attached short calls are not in "Other options"', sp.shorts.map(l => l.id).sort().join() === 'a,b,c' && !sp.other.some(l => ['a', 'b', 'c'].includes(l.id)));
check('orphan short call (LEAP deleted) falls back to Other options', sp.other.some(l => l.id === 'o') && sp.other.some(l => l.id === 'p1'));
const rolledLeap = { ...leap, id: 'L2', groupId: 'L1', rolledFrom: 'L1' };
check('shorts follow the LEAP through a roll (rolledFrom chain)', S.pmccShortsFor(rolledLeap, [{ ...leap, status: 'closed' }, rolledLeap, a, b, c]).length === 3);

// ── maths ──
const P = S.pmccStats(leap, legs, today);
// a: +1020-1.30 open, -230-1.30 close = 787.40 ; b: 920-1.30 = 918.70 ; c open cash: 1280-1.30 = 1278.70
check('premium collected = net of buybacks and fees', Math.abs(P.net - (787.40 + 918.70 + 1278.70)) < 0.01, P.net);
check('LEAP cost includes fees', Math.abs(P.cost - 14401.30) < 0.01, P.cost);
check('adjusted cost = cost − net premium', Math.abs(P.adj - (14401.30 - 2984.80)) < 0.01, P.adj);
check('adjusted per share', Math.abs(P.adjPerSh - (14401.30 - 2984.80) / 200) < 0.001, P.adjPerSh);
check('current open short = c, with DTE and live P&L', P.cur && P.cur.id === 'c' && P.curDte === 30 && Math.abs(P.curPnl - (1278.70 - 610)) < 0.01, [P.curDte, P.curPnl]);
check('history newest first', P.past.map(l => l.id).join() === 'b,a');
check('no warnings for a safe strike', P.warnings.length === 0, P.warnings);

// ── warnings ──
const floor = 150 + P.adjPerSh;
let w = S.pmccWarnings(leap, P.adjPerSh, [], { strike: 190, expiry: '2026-12-18', qty: 2 });
check('strike below LEAP strike + net debit → warning with $ loss', w.length === 1 && /below LEAP strike/.test(w[0]) && w[0].includes(floor.toFixed(2)), w);
w = S.pmccWarnings(leap, P.adjPerSh, [], { strike: 300, expiry: '2028-12-15', qty: 2 });
check('short expiry after LEAP expiry → warning', w.length === 1 && /expires after the LEAP/.test(w[0]), w);
w = S.pmccWarnings(leap, P.adjPerSh, [c], { strike: 300, expiry: '2026-12-18', qty: 1 });
check('contracts exceed LEAP contracts (counting open shorts) → warning', w.length === 1 && /3 short contracts against 2/.test(w[0]), w);
check('card warning shows for an open risky short', S.pmccStats(leap, [leap, sh({ id: 'r', strike: 160, expiry: '2026-11-20', entryPrice: 9, qty: 1 })], today).warnings.length === 1);
check('closed LEAP shows no live warnings', S.pmccStats({ ...leap, status: 'closed' }, [leap, sh({ id: 'r', strike: 160, expiry: '2026-11-20', entryPrice: 9 })], today).warnings.length === 0);

// ── form leg ──
const f = S.pmccFormLeg({ strike: '245', expiry: '2026-11-20', qty: '2', price: '6.40', date: '2026-10-09', fees: '1.30', notes: '', newId: 'n1' }, leap);
check('form → short call leg linked to LEAP, own group, no wheel link', f.leg && f.leg.side === 'short' && f.leg.type === 'C' && f.leg.parentLeapId === 'L1' && f.leg.groupId === 'n1' && f.leg.underlying === 'SPCX' && f.leg.wheelId === null && f.leg.status === 'open');
check('form validation: premium required', /premium/.test(S.pmccFormLeg({ strike: '245', expiry: '2026-11-20', qty: '1', price: '' }, leap).err));
check('form validation: strike required', /strike/.test(S.pmccFormLeg({ strike: '', expiry: '2026-11-20', qty: '1', price: '1' }, leap).err));

// ── render ──
S.setOpts(legs);
const h = S.renderPmcc(leap, today);
check('card strip shows short, premium, adjusted cost, history and actions', /PMCC/.test(h) && /2× \$245C/.test(h) && /Premium collected/.test(h) && /Adj\. LEAP cost/.test(h) && /Past short calls \(2\)/.test(h) && /Buy back/.test(h) && /Roll/.test(h) && /Expired/.test(h));
check('LEAP with no short calls renders no strip (Sell call lives in the card header)', S.renderPmcc({ ...leap, id: 'none' }, today) === '');
check('history labels rolled vs expired', /rolled/.test(h) && /expired/.test(h));
check('no wheel data touched by rendering', S.db.wheels.length === 1 && S.db.trades.length === 1 && S.writes.length === 0);
const csv = S.optsToCSV(legs);
check('Options CSV export carries parentLeapId', csv.split('\n')[0].includes('parentLeapId') && csv.includes(',L1,'));

// ── SmartScan for sold calls ──
const want = (name, text, exp) => { const r = S.scan(text); const x = r.calls[0] || {};
  const ok = r.calls.length === 1 && Object.entries(exp).every(([k, v]) => typeof v === 'number' ? Math.abs(x[k] - v) < 0.006 : x[k] === v);
  check(name, ok, { r: r.calls.length ? x : r.error }); };
want('Robinhood sell-to-open call', `SPCX $245 Call Nov 20, 2026
Sell to open
Position effect Open
Filled Oct 9, 10:31 AM
2 contracts at $6.40
Regulatory fees $0.06
Contract fees $1.24
Total $1,278.70`, { ticker: 'SPCX', strike: 245, expiry: '2026-11-20', qty: 2, price: 6.40, date: '2026-10-09', fees: 1.30 });
want('IBKR confirmation SELL … Code: O', `Trade Date: 2026-10-09
Symbol: SPCX 20NOV26 245 C
Action: SELL  Quantity: 2  Price: 6.40  Proceeds: 1280.00  Comm/Fee: -1.30  Code: O`, { ticker: 'SPCX', strike: 245, expiry: '2026-11-20', qty: 2, price: 6.4, fees: 1.3, date: '2026-10-09' });
want('IBKR statement line (negative qty = sold)', `SPCX 20NOV26 245 C  2026-10-09, 10:31:02  -2  6.40  1,280.00  -1.30  -1,278.70  O`, { ticker: 'SPCX', strike: 245, qty: 2, price: 6.4, date: '2026-10-09' });
want('garbled one-liner "sold 2 spcx 245c 11/20/26 @6.40"', `sold to open 2 SPCX 245c 11/20/2026 @ 6.40 on 10/09/2026`, { ticker: 'SPCX', strike: 245, expiry: '2026-11-20', qty: 2, price: 6.4 });
const rj = (name, text, re) => { const r = S.scan(text); check(name, r.calls.length === 0 && re.test(r.error), r.error); };
rj('bought call refused → points to + LEAP', `Buy to open SPCX 06/16/2028 150 C 2 @ 72.00 on 06/01/2026`, /\+ LEAP/);
rj('buy-to-close refused → points to Buy back', `Buy to close SPCX 11/20/2026 245 C 2 @ 1.10 on 10/19/2026`, /Buy back/);
rj('put refused', `Sell to open SPCX 11/20/2026 180 P 1 @ 3.00 on 10/09/2026`, /put/i);
rj('empty paste', `  `, /Paste/);
const nos = S.scan(`SPCX 20NOV26 245 C qty 2 price 6.40 date 2026-10-09`);
check('side unknown → accepted but flagged low-confidence', nos.calls.length === 1 && nos.calls[0].low.includes('side'), nos);

console.log(`\n${pass} pass / ${fail} fail`);
if (fail) process.exit(1);

// pmcc.test.js — poor man's covered calls: short calls sold against a LEAP (fake figures only).
// Covers linking, premium/adjusted cost maths, no risk warnings, SmartScan for sold calls, and that nothing touches wheel data.
// Run: node tests/pmcc.test.js
const { extractFn, extractConst } = require('./extract');
let pass = 0, fail = 0;
const check = (n, ok, x) => { ok ? pass++ : fail++; console.log((ok ? '  ✓ ' : '  ✗ ') + n + (ok || x === undefined ? '' : '  → ' + JSON.stringify(x))); };
const scanCode = ['MON_PAT','_LEAP_LABELS','MON_MAP','CREDITS','ACTION_MAP','VALID_ACTIONS'].map(extractConst)
  .concat(['isCredit','computeTotal','parseCSVLine','normDate','parseSmartText','brokerCSVLib','_lev','leapNormalize','leapFuzzy','leapScan','pmccScan'].map(extractFn)).join('\n');
const stubs = [
  "const fmt2=n=>(+n).toFixed(2);",
  "const fmtMoney=n=>(n<0?'-':'')+'$'+Math.abs(n).toFixed(2);",
  "const fmtPrem=n=>(+n).toFixed(2);",
  "const fmtDateFull=d=>d||'-';",
  "const esc=s=>String(s==null?'':s);",
  "function colorN(n){return n==null?'m':(n>=0?'g':'r');}",
  "let db={wheels:[{id:'w1',ticker:'SPCX'}],trades:[{id:'t1',ticker:'SPCX'}],opts:[]};let writes=[];const _saveOpt=l=>writes.push(l);let expandedLeaps=new Set();"
].join('');
const S = new Function(stubs + scanCode + extractFn('optionsLib') + '\nconst OPTS=optionsLib();\n' +
  ['splitLeapLegs','pmccShortsFor','pmccStats','pmccLabels','pmccFormLeg','_fdShort','pmccTradeEvents','renderPmccTradeRow','renderPmcc','optsToCSV'].map(extractFn).join('\n') +
  `\nconst B=brokerCSVLib();return {db,get writes(){return writes},OPTS,scan:t=>pmccScan(t,B,'2026-10-21'),scanAt:(t,d)=>pmccScan(t,B,d),leapAt:(t,d)=>leapScan(t,B,d),splitLeapLegs,pmccShortsFor,pmccStats,pmccLabels,pmccFormLeg,pmccTradeEvents,renderPmcc,optsToCSV,setOpts:o=>{db.opts=o}};`)();

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

// ── no risk warnings (Marc: "I made the trade myself, I know the risks") ──
const risky = [leap, sh({ id: 'r', strike: 120, expiry: '2029-01-19', entryPrice: 9, qty: 5 })];
S.setOpts(risky);
const rh0 = S.renderPmcc(leap, today);
check('risky short (below breakeven, past LEAP expiry, over-sold) renders with no warning text', !/⚠|warn|naked|risk|lock in a loss|uncovered|expires after/i.test(rh0) && /ab-STO/.test(rh0) && /\$120/.test(rh0), rh0);
check('stats carry no warnings field', !('warnings' in S.pmccStats(leap, risky, today)));
check('risky short still saves (no blocking)', !!S.pmccFormLeg({ strike: '120', expiry: '2029-01-19', qty: '5', price: '9', newId: 'z' }, leap).leg);
const html = require('fs').readFileSync(require('path').join(__dirname, '..', 'app', 'index.html'), 'utf8');
check('no PMCC risk copy anywhere in the app', !/pmccWarnings|pmcc-warn|pcc-warn|would be naked|risk a loss if called away|lock in a loss/.test(html));
// ── status labels (open short only) ──
const T = s => S.pmccLabels(s.c, s.spot, today).map(l => l.t + '/' + l.c).join('|');
const o = (x) => ({ status: 'open', strike: 245, expiry: '2026-11-20', entryPrice: 6.40, mark: 5, ...x });
check('no labels when nothing applies', T({ c: o({}), spot: 200 }) === '');
check('Expiring soon amber at 7 DTE', T({ c: o({ expiry: '2026-10-28' }), spot: 200 }) === 'Expiring soon/a');
check('8 DTE → no expiry label', T({ c: o({ expiry: '2026-10-29' }), spot: 200 }) === '');
check('Expires today red at DTE 0', T({ c: o({ expiry: today }), spot: 200 }) === 'Expires today/r');
check('Near the money amber within 5% below strike', T({ c: o({}), spot: 233 }) === 'Near the money/a' && T({ c: o({}), spot: 232 }) === '');
check('At the strike = near, not ITM', T({ c: o({}), spot: 245 }) === 'Near the money/a');
check('In the money red above strike', T({ c: o({}), spot: 246 }) === 'In the money/r');
check('Take profit green ≥40% captured with %', T({ c: o({ mark: 3.84 }), spot: 200 }) === 'Take profit · 40%/g' && T({ c: o({ mark: 3.45 }), spot: 200 }) === 'Take profit · 46%/g' && T({ c: o({ mark: 3.90 }), spot: 200 }) === '');
check('no price → no price-based labels (expiry still shown)', T({ c: o({ mark: null, expiry: '2026-10-25' }), spot: undefined }) === 'Expiring soon/a');
check('closed short → no labels', T({ c: o({ status: 'closed', mark: 0.1 }), spot: 300 }) === '');
S.setOpts(legs);
check('labels render on the open STO row', /pmcc-lb g">Take profit · 52%/.test(S.renderPmcc(leap, today, 205)));
check('no spot → no money-ness labels on the open row', !/the money/.test(S.renderPmcc(leap, today, undefined)) && /In the money/.test(S.renderPmcc(leap, today, 300)));

// ── form leg ──
const f = S.pmccFormLeg({ strike: '245', expiry: '2026-11-20', qty: '2', price: '6.40', date: '2026-10-09', fees: '1.30', notes: '', newId: 'n1' }, leap);
check('form → short call leg linked to LEAP, own group, no wheel link', f.leg && f.leg.side === 'short' && f.leg.type === 'C' && f.leg.parentLeapId === 'L1' && f.leg.groupId === 'n1' && f.leg.underlying === 'SPCX' && f.leg.wheelId === null && f.leg.status === 'open');
check('form validation: premium required', /premium/.test(S.pmccFormLeg({ strike: '245', expiry: '2026-11-20', qty: '1', price: '' }, leap).err));
check('form validation: strike required', /strike/.test(S.pmccFormLeg({ strike: '', expiry: '2026-11-20', qty: '1', price: '1' }, leap).err));

// ── render ──
S.setOpts(legs);
const h = S.renderPmcc(leap, today);
check('trade table: BTO + STO/BTC/EXP rows, soft action pills, open-row actions', /pmcc-trades/.test(h) && /ab-BTO/.test(h) && /ab-STO/.test(h) && /ab-BTC/.test(h) && /ab-EXP/.test(h) && /Buy back/.test(h) && /Roll/.test(h) && /Expired/.test(h) && /\$245/.test(h));
check('LEAP with no short calls renders no table (Sell call lives on the card)', S.renderPmcc({ ...leap, id: 'none' }, today) === '');
check('roll chain tip shows chain row', /chain-row/.test(h) && /Chain/.test(h));
check('events newest-first with BTO present', (()=>{const ev=S.pmccTradeEvents(leap,legs);return ev[0].entered>=ev[ev.length-1].entered && ev.some(e=>e.action==='BTO') && ev.filter(e=>e.action==='STO').length===3;})());
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


// ── Robinhood app: yearless expiry ("Nov 13") + relative time ("· 30m") — Marc's real-world paste layout, fake figures ──
const rh = 'Sell SPCX $170 Call Nov 13\nIndividual · 30m\n$501.00\n3 contracts at $1.67\nType\nLimit sell\nPosition effect\n';
const yl = (name, text, d, exp) => { const r = S.scanAt(text, d); const x = r.calls[0] || {};
  const ok = r.calls.length === 1 && Object.entries(exp).every(([k, v]) => typeof v === 'number' ? Math.abs(x[k] - v) < 0.006 : x[k] === v) && x.low.includes('expiry');
  check(name, ok, r.calls.length ? x : r.error); };
yl('RH yearless, cut off after "Position effect"', rh + '...', '2026-10-23', { ticker: 'SPCX', strike: 170, expiry: '2026-11-13', side: 'sell', qty: 3, price: 1.67, date: '2026-10-23' });
yl('RH yearless, full tail (Open, Filled, fees, Total)', rh + 'Open\nFilled\nOct 23, 3:58 PM\n3 contracts at $1.67\nRegulatory fees\n$0.06\nContract fees\n$1.86\nTotal\n$499.08', '2026-10-23', { expiry: '2026-11-13', qty: 3, price: 1.67, fees: 1.92, date: '2026-10-23' });
yl('RH yearless "2h ago"', rh.replace('30m', '2h ago') + 'Open', '2026-10-23', { expiry: '2026-11-13', date: '2026-10-23' });
yl('yearless expiry rolls into next year (Jan 15 sold in Dec)', 'Sell SPCX $170 Call Jan 15\nIndividual · 2h\n3 contracts at $1.67\nPosition effect\nOpen', '2026-12-20', { expiry: '2027-01-15', date: '2026-12-20' });
yl('yearless expiry on the trade date itself (0DTE) stays this year', 'Sell SPCX $170 Call Oct 23\nIndividual · 30m\n1 contract at $0.40\nPosition effect\nOpen', '2026-10-23', { expiry: '2026-10-23', qty: 1, price: 0.4 });
yl('"Yesterday" → trade date = day before', 'Sell SPCX $170 Call Nov 13\nIndividual · Yesterday\n3 contracts at $1.67\nPosition effect\nOpen', '2026-10-23', { date: '2026-10-22', expiry: '2026-11-13' });
const lb = S.leapAt('Buy SPCX $170 Call Jan 15\nIndividual · 30m\n$501.00\n3 contracts at $1.67\nPosition effect\nOpen', '2026-10-23');
check('+ LEAP form: yearless Robinhood buy also parses (expiry flagged)', lb.calls.length === 1 && lb.calls[0].expiry === '2027-01-15' && lb.calls[0].low.includes('expiry') && lb.calls[0].price === 1.67, lb);
const ls = S.leapAt(rh + 'Open', '2026-10-23');
check('+ LEAP form: yearless sold call refused, points to Sell call', !ls.calls.length && /Sell call/.test(ls.error), ls.error);

console.log(`\n${pass} pass / ${fail} fail`);
if (fail) process.exit(1);

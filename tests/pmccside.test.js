// pmccside.test.js — LEAP card Add trade: SmartScan side detection + buy to close. Based on pmcc.test.js harness; covered calls: short calls sold against a LEAP (fake figures only).
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
  "let db={wheels:[{id:'w1',ticker:'SPCX'}],trades:[{id:'t1',ticker:'SPCX'}],opts:[]};let writes=[];const _saveOpt=l=>writes.push(l);let collapsedLeaps=new Set();let _focusTid=null;",
  "function openEditTrade(){}",
  "function openOptEdit(){}",
  "function pmccClose(){}",
  "function pmccExpire(){}",
  "function pmccDeleteShort(){}",
  "function openPmccSell(){}",
  "function isChainTip(){return false;}",
  "function buildRollChain(){return null;}"
].join('');
const S = new Function(stubs + scanCode + extractFn('optionsLib') + '\nconst OPTS=optionsLib();\n' +
  ['splitLeapLegs','pmccShortsFor','pmccStats','pmccFormLeg','pmccBuyBack','_fdShort','pmccTradeEvents','pmccLegToTrade','toStrike','tradeTableHead','renderPmccOpenFace','pmccShortProfit','pmccChainPriorNet','renderPmccTradeRow','pmccRollParents','strikeStep','nearStrike','exactSubset','pmccChainMap','hoistChainLines','renderPmcc','pmccShortEvents','renderPmccListRow','optsToCSV','calcTradeROC','isCredit','renderTradeRow'].map(extractFn).join('\n') +
  `\nconst B=brokerCSVLib();return {db,get writes(){return writes},OPTS,scan:t=>pmccScan(t,B,'2026-10-21'),scanAt:(t,d)=>pmccScan(t,B,d),leapAt:(t,d)=>leapScan(t,B,d),splitLeapLegs,pmccShortsFor,pmccStats,pmccFormLeg,pmccBuyBack,pmccTradeEvents,pmccLegToTrade,toStrike,tradeTableHead,renderPmccOpenFace,renderPmcc,optsToCSV,setOpts:o=>{db.opts=o}};`)();


const leap = { id: 'L1', groupId: 'L1', underlying: 'SPCX', type: 'C', side: 'long', strike: 150, expiry: '2028-06-16', qty: 2, entryPrice: 72, status: 'open' };
const c = { id: 'c', groupId: 'c', parentLeapId: 'L1', underlying: 'SPCX', type: 'C', side: 'short', strike: 245, expiry: '2026-11-20', qty: 2, entryPrice: 6.40, fees: 1.3, status: 'open' };
const act = (t, d) => { const r = S.scanAt(t, d || '2026-10-23'); return r.calls.length === 1 ? r.calls[0].action : r.error; };
const sto = 'SPCX $245 Call Nov 20, 2026\nSell to open\nPosition effect Open\nFilled Oct 9, 10:31 AM\n2 contracts at $6.40\nTotal $1,278.70';
const btc = 'SPCX $245 Call Nov 20, 2026\nBuy to close\nPosition effect Close\nFilled Oct 19, 10:31 AM\n2 contracts at $1.10\nRegulatory fees $0.06\nContract fees $1.24\nTotal $221.30';
check('RH "Sell to open" → sto', act(sto) === 'sto', act(sto));
check('RH "Buy to close" → btc', act(btc) === 'btc', act(btc));
const rhB = 'Buy SPCX $170 Call Nov 13\nIndividual · 30m\n$501.00\n3 contracts at $1.67\nType\nLimit buy\nPosition effect\nClose';
const rhS = 'Sell SPCX $170 Call Nov 13\nIndividual · 30m\n$501.00\n3 contracts at $1.67\nType\nLimit sell\nPosition effect\nOpen';
check('RH app "Buy … Position effect Close" → btc', act(rhB) === 'btc', act(rhB));
check('RH app "Sell … Position effect Open" → sto', act(rhS) === 'sto', act(rhS));
check('"Bought to close" one-liner → btc', act('Bought to close 2 SPCX 245c 11/20/2026 @ 1.10 on 10/19/2026') === 'btc');
check('"Sold to open" one-liner → sto', act('sold to open 2 SPCX 245c 11/20/2026 @ 6.40 on 10/09/2026') === 'sto');
check('IBKR BUY Code: C → btc', act('Trade Date: 2026-10-19\nSymbol: SPCX 20NOV26 245 C\nAction: BUY  Quantity: 2  Price: 1.10  Comm/Fee: -1.30  Code: C') === 'btc');
check('bought call with no open/close marker → treated as buy to open (refused, not guessed)', /\+ LEAP/.test(act('Buy SPCX $170 Call Nov 13\nIndividual · 30m\n3 contracts at $1.67')));
check('explicit buy to open still refused', /\+ LEAP/.test(act('Buy to open SPCX 06/16/2028 150 C 2 @ 72.00 on 06/01/2026')));
const bt = S.scanAt(btc, '2026-10-23').calls[0];
check('btc fill fields', bt.strike === 245 && bt.expiry === '2026-11-20' && bt.qty === 2 && bt.price === 1.1 && bt.date === '2026-10-19' && Math.abs(bt.fees - 1.3) < 0.01, bt);

// ── buy to close path ──
const r = S.pmccBuyBack({ strike: '245', expiry: '2026-11-20', price: '1.10', date: '2026-10-19', fees: '1.30' }, leap, [leap, c]);
check('buy back closes the matching open short call', r.leg && r.leg.id === 'c' && r.leg.status === 'closed' && r.leg.closePrice === 1.1 && r.leg.closeDate === '2026-10-19' && r.leg.closeFees === 1.3 && r.leg.entryPrice === 6.4, r);
const r2 = S.pmccBuyBack({ strike: '250', expiry: '2026-11-20', price: '1.10', date: '2026-10-19', fees: '0' }, leap, [leap, c]);
check('no matching open short call → error, nothing returned', !r2.leg && /No open short call/.test(r2.err), r2);
const r3 = S.pmccBuyBack({ strike: '245', expiry: '2026-11-20', price: '1.10', date: '2026-10-19' }, leap, [leap, { ...c, status: 'closed' }]);
check('already closed call is not matched', !r3.leg && r3.err, r3);
const r4 = S.pmccBuyBack({ strike: '', expiry: '', price: '0.50', date: '2026-10-19' }, leap, [leap, c]);
check('blank strike/expiry with one open call → closes it', r4.leg && r4.leg.id === 'c', r4);
check('buy back writes nothing itself', S.writes.length === 0);

console.log(`\n${pass} pass / ${fail} fail`);
if (fail) process.exit(1);

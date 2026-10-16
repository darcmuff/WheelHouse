// brokerimport.test.js — broker-agnostic Import CSV parser (brokerCSVLib in app/index.html).
// Run: node tests/brokerimport.test.js
const { extractFn, extractConst } = require('./extract');
const code = [extractConst('MON_PAT'), extractConst('MON_MAP'), extractConst('CREDITS'),
  extractConst('ACTION_MAP'), extractConst('VALID_ACTIONS'),
  extractFn('isCredit'), extractFn('computeTotal'), extractFn('parseCSVLine'), extractFn('normDate'),
  extractFn('brokerCSVLib')].join('\n');
const L = new Function(code + '\nreturn brokerCSVLib();')();

let pass = 0, fail = 0;
const check = (name, ok, extra) => { ok ? pass++ : fail++; console.log((ok ? '  ✓ ' : '  ✗ ') + name + (ok || extra === undefined ? '' : '  → ' + JSON.stringify(extra))); };
const acts = p => p.rows.map(r => r.action).join(',');

// ── low-level helpers ──
check('num handles $ , and (neg)', L.num('($1,234.50)') === -1234.5 && L.num('$12') === 12);
check('CSV quoted commas, "" escapes, CRLF, BOM', JSON.stringify(L.parseCSVText('\uFEFFa,"b,c","d ""q"""\r\n1,2,3\r\n')) === JSON.stringify([['a','b,c','d "q"'],['1','2','3']]));
const o = s => JSON.stringify(L.parseOption(s));
const AAPL = JSON.stringify({ ticker: 'AAPL', expiry: '2025-01-17', strike: 150, pc: 'P' });
check('option: AAPL 01/17/25 150 P', o('AAPL 01/17/25 150 P') === AAPL, o('AAPL 01/17/25 150 P'));
check('option: AAPL 1/17/2025 Put $150.00', o('AAPL 1/17/2025 Put $150.00') === AAPL);
check('option: AAPL 17JAN25 150 P', o('AAPL 17JAN25 150 P') === AAPL);
check('option: OCC AAPL  250117P00150000', o('AAPL  250117P00150000') === AAPL);
check('option: Fidelity -AAPL250117P150', o('-AAPL250117P150') === AAPL);
check("option: E*Trade AAPL Jan 17 '25 $150 Put", o("AAPL Jan 17 '25 $150 Put") === AAPL);
check('option: plain stock → null', L.parseOption('AAPL') === null);

// ── native CoveredWheel format unchanged ──
const nat = L.parseBrokerCSV('Ticker,Action,Entered,Expiry,Strike,Premium,Fees,Shares,Total,Days,Verified,Comment\nSOFI,CSP: Cash Secured Put,2025-09-15,2025-09-26,21,0.45,1.3,100,43.7,11,yes,first\nSOFI,EXP: Expired Worthless,2025-09-26,,21,0,0,100,,0,no,\nSOFI,BOGUS,2025-09-26,,,,,,,,,');
check('native: broker CoveredWheel', nat.broker === 'CoveredWheel');
check('native: rows', acts(nat) === 'CSP,EXP' && nat.rows[0].total === 43.7 && nat.rows[0].verified === true && nat.rows[0].comment === 'first', nat.rows);
check('native: bad action listed', nat.unrecognised.length === 1);

// ── Robinhood ──
const rh = L.parseBrokerCSV(`"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"
"1/10/2025","1/10/2025","1/13/2025","AAPL","AAPL 1/17/2025 Put $150.00","STO","1","$1.25","$124.95"
"1/15/2025","1/15/2025","1/16/2025","AAPL","AAPL 1/17/2025 Put $150.00","BTC","1","$0.20","($20.05)"
"1/17/2025","1/17/2025","1/17/2025","SOFI","SOFI 1/17/2025 Put $14.00","OEXP","2S","",""
"1/17/2025","1/17/2025","1/17/2025","F","F 1/17/2025 Put $10.00","OASGN","1","",""
"1/20/2025","1/20/2025","1/22/2025","F","Ford Motor","Buy","100","$10.00","($1,000.00)"
"1/21/2025","1/21/2025","1/21/2025","","ACH Deposit","ACH","","","$500.00"
"1/22/2025","1/22/2025","1/22/2025","F","Cash Div: R/D 2025-01-10","CDIV","","","$15.00"
"","","","","","","","",""
"The data provided is for informational purposes only."`);
check('robinhood: detected', rh.broker === 'Robinhood', rh.broker);
check('robinhood: actions', acts(rh) === 'CSP,BTC,EXP,IN', acts(rh));
check('robinhood: CSP values', rh.rows[0].premium === 1.25 && rh.rows[0].shares === 100 && rh.rows[0].total === 124.95 && rh.rows[0].strike === 150 && rh.rows[0].expiry === '2025-01-17' && rh.rows[0].entered === '2025-01-10', rh.rows[0]);
check('robinhood: EXP 2 contracts', rh.rows[2].shares === 200 && rh.rows[2].ticker === 'SOFI');
check('robinhood: assignment IN at strike', rh.rows[3].premium === 10 && rh.rows[3].total === 1000);
check('robinhood: stock/ACH/div skipped', rh.skipped.length === 3, rh.skipped);

// ── Tastytrade ──
const tt = L.parseBrokerCSV(`Date,Type,Sub Type,Action,Symbol,Instrument Type,Description,Value,Quantity,Average Price,Commissions,Fees,Multiplier,Root Symbol,Underlying Symbol,Expiration Date,Strike Price,Call or Put,Order #,Currency
2025-01-10T15:32:00-0500,Trade,Sell to Open,SELL_TO_OPEN,SOFI  250117P00014000,Equity Option,Sold 1 SOFI 01/17/25 Put 14.00 @ 0.30,30.00,1,30.00,-1.00,-0.14,100,SOFI,SOFI,1/17/25,14,PUT,123,USD
2025-01-13T10:00:00-0500,Trade,Sell to Open,SELL_TO_OPEN,TSLA  250124C00450000,Equity Option,Sold 1 TSLA 01/24/25 Call 450.00 @ 3.10,310.00,1,310.00,-1.00,-0.14,100,TSLA,TSLA,1/24/25,450,CALL,124,USD
2025-01-17T16:00:00-0500,Receive Deliver,Expiration,,SOFI  250117P00014000,Equity Option,Removal of 1.0 SOFI 01/17/25 Put 14.00 due to expiration.,0.00,1,0.00,,0.00,100,SOFI,SOFI,1/17/25,14,PUT,,USD
2025-01-24T16:00:00-0500,Receive Deliver,Assignment,,TSLA  250124C00450000,Equity Option,Removal of option due to assignment,0.00,1,0.00,,0.00,100,TSLA,TSLA,1/24/25,450,CALL,,USD
2025-01-24T16:00:00-0500,Receive Deliver,Sell to Close,SELL_TO_CLOSE,TSLA,Equity,Sell 100 TSLA @ 450.00,"45,000.00",100,450.00,,-0.50,1,,TSLA,,,,,USD
2025-01-25T00:00:00-0500,Money Movement,Balance Adjustment,,,,Regulatory fee adjustment,-0.01,0,,,0.00,,,,,,,,USD`);
check('tastytrade: detected', tt.broker === 'Tastytrade', tt.broker);
check('tastytrade: actions', acts(tt) === 'CSP,STOC,EXP,OUT', acts(tt));
check('tastytrade: per-contract avg price scaled', tt.rows[0].premium === 0.3 && tt.rows[0].fees === 1.14 && tt.rows[0].total === 28.86, tt.rows[0]);
check('tastytrade: called away OUT', tt.rows[3].ticker === 'TSLA' && tt.rows[3].total === 45000);
check('tastytrade: equity + money movement skipped', tt.skipped.length === 2, tt.skipped);

// ── IBKR activity statement (preamble + Trades section) ──
const ib = L.parseBrokerCSV(`Statement,Header,Field Name,Field Value
Statement,Data,Title,Activity Statement
Statement,Data,Period,"January 1, 2025 - January 31, 2025"
Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code
Trades,Data,Order,Equity and Index Options,USD,AAPL 17JAN25 150 P,"2025-01-10, 10:32:11",-1,1.25,1.2,125,-1.05,-123.95,0,5,O
Trades,Data,Order,Equity and Index Options,USD,AAPL 17JAN25 150 P,"2025-01-15, 11:00:00",1,0.2,0.2,-20,-1.05,123.95,102.9,0,C
Trades,Data,Order,Equity and Index Options,USD,MSFT 17JAN25 400 C,"2025-01-10, 10:40:00",-2,4.5,4.4,900,-2.1,-897.9,0,20,O
Trades,Data,Order,Equity and Index Options,USD,MSFT 17JAN25 400 C,"2025-01-17, 16:20:00",2,0,0,0,0,897.9,897.9,0,C;Ep
Trades,Data,Order,Stocks,USD,AAPL,"2025-01-20, 09:31:00",100,148,148,-14800,-1,14801,0,0,O
Trades,SubTotal,,Equity and Index Options,USD,AAPL,,,,,,,,,,
Deposits & Withdrawals,Header,Currency,Settle Date,Description,Amount`);
check('ibkr: detected', ib.broker === 'Interactive Brokers', ib.broker);
check('ibkr: actions', acts(ib) === 'CSP,BTC,STOC,EXP', acts(ib));
check('ibkr: STOC 2 contracts', ib.rows[2].shares === 200 && ib.rows[2].premium === 4.5 && ib.rows[2].entered === '2025-01-10');
check('ibkr: stock skipped', ib.skipped.length === 1);

// ── Schwab ──
const sc = L.parseBrokerCSV(`"Transactions  for account Individual ...123 as of 01/31/2025 10:00:00 AM ET"
"Date","Action","Symbol","Description","Quantity","Price","Fees & Comm","Amount"
"01/10/2025","Sell to Open","AMD 01/17/2025 110.00 P","PUT ADVANCED MICRO DEVICES $110 EXP 01/17/25","1","$2.10","$0.66","$209.34"
"01/17/2025 as of 01/16/2025","Assigned","AMD 01/17/2025 110.00 P","PUT ADVANCED MICRO DEVICES $110 EXP 01/17/25","1","","",""
"01/17/2025","Buy","AMD","ADVANCED MICRO DEVICES","100","$110.00","","-$11,000.00"
"01/21/2025","Sell to Open","AMD 01/31/2025 115.00 C","CALL ADVANCED MICRO DEVICES $115 EXP 01/31/25","1","$1.50","$0.66","$149.34"
"01/24/2025","Qualified Dividend","AMD","ADVANCED MICRO DEVICES","","","","$5.00"
"Transactions Total","","","","","","","$-10,636.32"`);
check('schwab: detected', sc.broker === 'Schwab', sc.broker);
check('schwab: actions', acts(sc) === 'CSP,IN,STOC', acts(sc));
check('schwab: "as of" date', sc.rows[1].entered === '2025-01-17' && sc.rows[1].total === 11000);

// ── Fidelity ──
const fi = L.parseBrokerCSV(`

Brokerage

Run Date,Action,Symbol,Description,Type,Quantity,Price ($),Commission ($),Fees ($),Accrued Interest ($),Amount ($),Settlement Date
01/10/2025,"YOU SOLD OPENING TRANSACTION PUT (PLTR) PALANTIR TECHNOLOGIES JAN 17 25 $70 (100 SHS) (Cash)", -PLTR250117P70,"PUT (PLTR) PALANTIR TECHNOLOGIES JAN 17 25 $70 (100 SHS)",Cash,-3,1.05,1.95,0.06,,312.99,01/13/2025
01/14/2025,"YOU BOUGHT CLOSING TRANSACTION PUT (PLTR) PALANTIR TECHNOLOGIES JAN 17 25 $70 (100 SHS) (Cash)", -PLTR250117P70,"PUT (PLTR) PALANTIR TECHNOLOGIES JAN 17 25 $70 (100 SHS)",Cash,3,0.1,1.95,0.06,,-32.01,01/15/2025
01/15/2025,"DIVIDEND RECEIVED SPAXX (Cash)", SPAXX,"FIDELITY GOVERNMENT MONEY MARKET",Cash,,,,,,1.23,
01/16/2025,"YOU BOUGHT PALANTIR TECHNOLOGIES (PLTR) (Cash)", PLTR,"PALANTIR TECHNOLOGIES",Cash,10,70,,,,-700,01/17/2025


"The data and information in this spreadsheet is provided to you solely for your use"`);
check('fidelity: detected past preamble', fi.broker === 'Fidelity', fi.broker);
check('fidelity: actions', acts(fi) === 'CSP,BTC', acts(fi));
check('fidelity: 3 contracts, fees summed', fi.rows[0].shares === 300 && fi.rows[0].fees === 2.01 && fi.rows[0].total === 312.99, fi.rows[0]);

// ── E*Trade ──
const et = L.parseBrokerCSV(`For Account:,####1234

Activity/Trade Date: 01/01/25 - 01/31/25

TransactionDate,TransactionType,SecurityType,Symbol,Quantity,Amount,Price,Commission,Description
01/10/25,Sold To Open,OPTN,"NVDA Jan 17 '25 $130 Put",-1,214.33,2.15,0.67,PUT NVDA 01/17/25 130
01/17/25,Option Expiration,OPTN,"NVDA Jan 17 '25 $130 Put",1,0,0,0,PUT NVDA 01/17/25 130 EXPIRED
01/20/25,Bought To Close,OPTN,"NVDA Jan 31 '25 $140 Call",1,-50.67,0.5,0.67,CALL NVDA 01/31/25 140
01/22/25,Transfer,EQ,,0,1000,0,0,ONLINE TRANSFER`);
check('etrade: detected', et.broker === 'E*Trade', et.broker);
check('etrade: actions', acts(et) === 'CSP,EXP,BTC', acts(et));
check('etrade: BTC call strike', et.rows[2].strike === 140 && et.rows[2].expiry === '2025-01-31');

// ── Webull ──
const wb = L.parseBrokerCSV(`Name,Symbol,Side,Status,Filled,Total Qty,Price,Avg Price,Time-in-Force,Placed Time,Filled Time
SOFI250117P00014000,SOFI250117P00014000,Sell,Filled,2,2,0.35,0.35,DAY,01/10/2025 09:35:01 EST,01/10/2025 09:35:02 EST
SOFI250117P00014000,SOFI250117P00014000,Buy,Filled,2,2,0.05,0.05,DAY,01/15/2025 10:00:00 EST,01/15/2025 10:00:05 EST
SOFI250117P00013000,SOFI250117P00013000,Sell,Cancelled,0,1,0.30,,DAY,01/15/2025 10:01:00 EST,
SOFI,SOFI,Buy,Filled,100,100,14.00,14.00,DAY,01/16/2025 10:01:00 EST,01/16/2025 10:01:01 EST`);
check('webull: detected', wb.broker === 'Webull', wb.broker);
check('webull: actions', acts(wb) === 'CSP,BTC', acts(wb));
check('webull: totals from price', wb.rows[0].total === 70 && wb.rows[0].shares === 200, wb.rows[0]);
check('webull: cancelled + stock skipped', wb.skipped.length === 2);

// ── Generic broker ──
const gen = L.parseBrokerCSV(`Trade Date,Underlying,Activity,Qty,Price,Commission,Net Amount,Expiry,Strike,Put/Call
2025-02-03,KO,Sell to Open,1,0.80,0.65,79.35,2025-02-21,62,P
2025-02-21,KO,Buy to Open,1,0.80,0.65,79.35,2025-02-21,62,P
2025-02-21,KO,Mystery,1,0.80,0.65,79.35,2025-02-21,62,P`);
check('generic: detected', gen.broker === 'Generic', gen.broker);
check('generic: explicit option columns', acts(gen) === 'CSP' && gen.rows[0].ticker === 'KO' && gen.rows[0].strike === 62, gen.rows);
check('generic: BTO skipped, unknown listed', gen.skipped.length === 1 && gen.unrecognised.length === 1);
check('no header → error', !!L.parseBrokerCSV('hello\nworld').error);

// ── full-field checks + messy CSV layouts ──
const F = ['entered','ticker','action','strike','expiry','shares','premium','fees','total'];
let fOk = 0, fAll = 0;
function full(name, res, rows) {
  check(`${name}: ${rows.length} trade(s)`, res.rows.length === rows.length, res.rows.map(r => F.map(f => r[f])));
  rows.forEach((e, i) => { const g = res.rows[i] || {};
    const bad = F.filter((f, k) => { fAll++; const ok = typeof e[k] === 'number' ? Math.abs((g[f] ?? NaN) - e[k]) < 0.006 : g[f] === e[k]; ok && fOk++; return !ok; });
    check(`${name} #${i+1} all fields`, !bad.length, bad.map(f => `${f}: ${g[f]} ≠ ${e[F.indexOf(f)]}`)); });
}
full('robinhood full', rh, [
  ['2025-01-10','AAPL','CSP',150,'2025-01-17',100,1.25,0,124.95],
  ['2025-01-15','AAPL','BTC',150,'2025-01-17',100,0.20,0,20.05],
  ['2025-01-17','SOFI','EXP',14,'2025-01-17',200,0,0,0],
  ['2025-01-17','F','IN',10,'2025-01-17',100,10,0,1000]]);
full('schwab full', sc, [
  ['2025-01-10','AMD','CSP',110,'2025-01-17',100,2.10,0.66,209.34],
  ['2025-01-17','AMD','IN',110,'2025-01-17',100,110,0,11000],
  ['2025-01-21','AMD','STOC',115,'2025-01-31',100,1.50,0.66,149.34]]);
full('ibkr full', ib, [
  ['2025-01-10','AAPL','CSP',150,'2025-01-17',100,1.25,1.05,123.95],
  ['2025-01-15','AAPL','BTC',150,'2025-01-17',100,0.20,1.05,21.05],
  ['2025-01-10','MSFT','STOC',400,'2025-01-17',200,4.50,2.10,897.90],
  ['2025-01-17','MSFT','EXP',400,'2025-01-17',200,0,0,0]]);
full('etrade full', et, [
  ['2025-01-10','NVDA','CSP',130,'2025-01-17',100,2.15,0.67,214.33],
  ['2025-01-17','NVDA','EXP',130,'2025-01-17',100,0,0,0],
  ['2025-01-20','NVDA','BTC',140,'2025-01-31',100,0.50,0.67,50.67]]);
// repeated header rows mid-file, totals row, paren negatives, wrapped quoted description, day-first dates
full('messy generic CSV', L.parseBrokerCSV(`Account Export,,,,,,
Generated 31/03/2025,,,,,,
Date,Action,Symbol,Description,Quantity,Price,Fees,Amount
05/03/2025,Sell to Open,KO 03/21/2025 62.00 P,"PUT COCA-COLA
$62 EXP 21/03/25",1,0.80,0.65,79.35
Date,Action,Symbol,Description,Quantity,Price,Fees,Amount
14/03/2025,Buy to Close,KO 03/21/2025 62.00 P,PUT COCA-COLA,1,0.10,0.65,(10.65)
,,,,,,Total,68.70`), [
  ['2025-03-05','KO','CSP',62,'2025-03-21',100,0.80,0.65,79.35],
  ['2025-03-14','KO','BTC',62,'2025-03-21',100,0.10,0.65,10.65]]);
const t212c = L.parseBrokerCSV(`Action,Time,ISIN,Ticker,Name,No. of shares,Price / share,Currency (Price / share),Exchange rate,Total,Currency (Total)
Market buy,2025-01-14 10:00:01,US0378331005,AAPL,Apple,1.5,180.20,USD,1.25,216.24,GBP
Dividend (Dividend),2025-02-14 10:00:01,US0378331005,AAPL,Apple,1.5,0.25,USD,1.25,0.30,GBP`);
check('trading 212 CSV: detected, no trades invented', t212c.broker === 'Trading 212' && t212c.rows.length === 0 && t212c.skipped.length === 2, t212c);
console.log(`CSV field accuracy: ${fOk}/${fAll} (${(100*fOk/fAll).toFixed(1)}%)`);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

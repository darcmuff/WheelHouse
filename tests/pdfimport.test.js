// pdfimport.test.js — PDF statement/confirmation text → trades (parseStatementText in brokerCSVLib).
// Samples mimic pdf.js output after pdfItemsToLines (columns joined by double spaces).
// Every expected trade checks ALL fields: entered,ticker,action,strike,expiry,shares,premium,fees,total.
// Run: node tests/pdfimport.test.js
const { extractFn, extractConst } = require('./extract');
const code = ['MON_PAT','MON_MAP','CREDITS','ACTION_MAP','VALID_ACTIONS'].map(extractConst)
  .concat(['isCredit','computeTotal','parseCSVLine','normDate','parseSmartText','brokerCSVLib'].map(extractFn)).join('\n');
const L = new Function(code + '\nreturn brokerCSVLib();')();

let pass = 0, fail = 0, fieldsOk = 0, fieldsAll = 0;
const check = (name, ok, extra) => { ok ? pass++ : fail++; console.log((ok ? '  ✓ ' : '  ✗ ') + name + (ok || extra === undefined ? '' : '\n      ' + extra)); };
const F = ['entered','ticker','action','strike','expiry','shares','premium','fees','total'];
function expect(name, res, rows, opts = {}) {
  const got = res.rows;
  check(`${name}: ${rows.length} trade(s) found`, got.length === rows.length, `got ${got.length}: ` + JSON.stringify(got.map(r => F.map(f => r[f]))));
  rows.forEach((e, i) => {
    const g = got[i] || {};
    const bad = F.filter((f, k) => { fieldsAll++; const ok = typeof e[k] === 'number' ? Math.abs((g[f] ?? NaN) - e[k]) < 0.006 : g[f] === e[k]; if (ok) fieldsOk++; return !ok; });
    check(`${name} #${i + 1} ${e[1]} ${e[2]}`, !bad.length, bad.map(f => `${f}: got ${g[f]} want ${e[F.indexOf(f)]}`).join('; '));
  });
  if (opts.broker) check(`${name}: source ${opts.broker}`, res.broker === opts.broker, res.broker);
  if (opts.unsure !== undefined) check(`${name}: ${opts.unsure} unsure line(s)`, res.unrecognised.length === opts.unsure, JSON.stringify(res.unrecognised));
}
const S = L.parseStatementText;

// pdfItemsToLines groups by y, sorts by x, keeps pages in order
const items = [
  { str: '150.00', transform: [1,0,0,1,300,700], page: 1 }, { str: '01/10/2025', transform: [1,0,0,1,40,700.8], page: 1 },
  { str: 'Header', transform: [1,0,0,1,40,760], page: 1 }, { str: 'p2', transform: [1,0,0,1,40,780], page: 2 }];
check('pdfItemsToLines: rows by y, cols by x, page order', L.pdfItemsToLines(items) === 'Header\n01/10/2025  150.00\np2');

// ── Robinhood monthly statement ──
expect('Robinhood statement', S(`Robinhood Securities LLC  Account Statement  01/01/2025 to 01/31/2025
Page 1 of 3
Account Activity
Description  Symbol  Acct Type  Transaction  Date  Qty  Price  Debit  Credit
AAPL 01/17/2025 Put $150.00  AAPL  Margin  STO  01/10/2025  1  $1.25  $124.95
AAPL 01/17/2025 Put $150.00  AAPL  Margin  BTC  01/15/2025  1  $0.20  $20.05
SOFI 01/24/2025 Call $16.00  SOFI  Margin  STO  01/16/2025  3  $0.18  $53.94
Option Expiration for SOFI 01/24/2025 Call $16.00  SOFI  Margin  OEXP  01/24/2025  3S
F 01/31/2025 Put $10.00  F  Margin  OASGN  01/31/2025  2
Cash Div: R/D 2025-01-10  F  Margin  CDIV  01/22/2025  $15.00
Total Funds Paid and Received  $2,000.00  $193.89
Page 2 of 3  Robinhood Securities LLC`), [
  ['2025-01-10','AAPL','CSP',150,'2025-01-17',100,1.25,0.05,124.95],
  ['2025-01-15','AAPL','BTC',150,'2025-01-17',100,0.20,0.05,20.05],
  ['2025-01-16','SOFI','STOC',16,'2025-01-24',300,0.18,0.06,53.94],
  ['2025-01-24','SOFI','EXP',16,'2025-01-24',300,0,0,0],
  ['2025-01-31','F','IN',10,'2025-01-31',200,10,0,2000],
], { broker: 'Robinhood', unsure: 0 });

// ── Schwab statement: date on its own line, wrapped description, paren negatives ──
expect('Schwab statement', S(`Charles Schwab & Co., Inc.  Schwab One Account of MARC DUFF
Transaction Details
Date  Category  Action  Symbol/CUSIP  Description  Quantity  Price/Rate  Charges/Interest  Amount
01/10/25  Sale  Sell to Open  AMD 01/17/2025 110.00 P  PUT ADVANCED MICRO DEVICES  (1.0000)  2.1000  (0.66)  209.34
$110 EXP 01/17/25
01/14/25  Purchase  Buy to Close  AMD 01/17/2025 110.00 P  PUT ADVANCED MICRO DEVICES  1.0000  0.4500  (0.66)  (45.66)
01/21/25  Sale  Sell to Open  NVDA 02/21/2025 150.00 C  CALL NVIDIA CORP  (2.0000)  3.0500  (1.32)  608.68
Total Transactions  772.36
Statement Period January 1-31, 2025  Page 3 of 8`), [
  ['2025-01-10','AMD','CSP',110,'2025-01-17',100,2.10,0.66,209.34],
  ['2025-01-14','AMD','BTC',110,'2025-01-17',100,0.45,0.66,45.66],
  ['2025-01-21','NVDA','STOC',150,'2025-02-21',200,3.05,1.32,608.68],
], { broker: 'Schwab', unsure: 0 });

// ── IBKR activity statement PDF ──
expect('IBKR statement', S(`Interactive Brokers LLC  Activity Statement  January 1, 2025 - January 31, 2025
Trades
Symbol  Date/Time  Quantity  T. Price  C. Price  Proceeds  Comm/Fee  Basis  Realized P/L  Code
Equity and Index Options
USD
AAPL 17JAN25 150 P  2025-01-10, 10:32:11  -1  1.2500  1.2000  125.00  -1.05  -123.95  0.00  O
AAPL 17JAN25 150 P  2025-01-15, 11:00:00  1  0.2000  0.2000  -20.00  -1.05  123.95  102.90  C
MSFT 17JAN25 400 C  2025-01-17, 16:20:00  2  0.0000  0.0000  0.00  0.00  897.90  897.90  C;Ep
Total AAPL 17JAN25 150 P  105.00  -2.10
Total Equity and Index Options  105.00  -2.10`), [
  ['2025-01-10','AAPL','CSP',150,'2025-01-17',100,1.25,1.05,123.95],
  ['2025-01-15','AAPL','BTC',150,'2025-01-17',100,0.20,1.05,21.05],
  ['2025-01-17','MSFT','EXP',400,'2025-01-17',200,0,0,0],
], { broker: 'Interactive Brokers', unsure: 0 });

// ── Fidelity statement ──
expect('Fidelity statement', S(`Fidelity Brokerage Services LLC  INDIVIDUAL - TOD  Account Z12-345678
Activity
Settlement Date  Security Name  Symbol/CUSIP  Description  Quantity  Price  Transaction Cost  Amount
01/13  PUT (PLTR) PALANTIR TECHNOLOGIES JAN 17 25 $70 (100 SHS)  PLTR250117P70  You Sold Opening Transaction  -3.000  $1.05000  $2.01  $312.99
Trade date 01/10/2025
01/21  PUT (PLTR) PALANTIR TECHNOLOGIES JAN 17 25 $70 (100 SHS)  PLTR250117P70  Assigned  3.000  -  -  -
Trade date 01/17/2025
Total Securities Bought  -$21,000.00`), [
  ['2025-01-10','PLTR','CSP',70,'2025-01-17',300,1.05,2.01,312.99],
  ['2025-01-17','PLTR','IN',70,'2025-01-17',300,70,0,21000],
], { broker: 'Fidelity', unsure: 0 });

// ── E*Trade statement ──
expect('E*Trade statement', S(`E*TRADE Securities LLC  Morgan Stanley
TRANSACTION HISTORY
Trade Date  Settle Date  Transaction Type  Description  Quantity  Price  Commission  Amount
1/10/25  1/13/25  Sold To Open  NVDA Jan 17 '25 $130 Put  -1  2.15  0.67  214.33
1/17/25  1/17/25  Option Expiration  NVDA Jan 17 '25 $130 Put  1  0.00  0.00  0.00
1/20/25  1/21/25  Bought To Close  NVDA Jan 31 '25 $140 Call  1  0.50  0.67  (50.67)
NET CREDITS/(DEBITS)  163.66`), [
  ['2025-01-10','NVDA','CSP',130,'2025-01-17',100,2.15,0.67,214.33],
  ['2025-01-17','NVDA','EXP',130,'2025-01-17',100,0,0,0],
  ['2025-01-20','NVDA','BTC',140,'2025-01-31',100,0.50,0.67,50.67],
], { broker: 'E*Trade', unsure: 0 });

// ── Tastytrade statement (OCC symbols, fees on separate line) ──
expect('Tastytrade statement', S(`tastytrade  Monthly Statement  January 2025
Trade Confirmations
Date  Symbol  Action  Qty  Price  Value
01/10/2025  SOFI 250117P00014000  Sell to Open  2  0.30  60.00
Commissions -2.00  Fees -0.28
01/13/2025  TSLA 250124C00450000  Sell to Open  1  3.10  310.00
Commissions -1.00  Fees -0.14
01/24/2025  TSLA 250124C00450000  Assignment  1
Totals  370.00`), [
  ['2025-01-10','SOFI','CSP',14,'2025-01-17',200,0.30,0,60],
  ['2025-01-13','TSLA','STOC',450,'2025-01-24',100,3.10,0,310],
  ['2025-01-24','TSLA','OUT',450,'2025-01-24',100,450,0,45000],
], { broker: 'Tastytrade', unsure: 0 });

// ── Webull statement, DD/MM never assumed for US broker; partial fills on separate rows ──
expect('Webull statement', S(`Webull Financial LLC  Monthly Statement
Date  Symbol  Side  Qty  Price  Amount
01/10/2025  SOFI250117P00014000  Sell  1  0.35  35.00
01/10/2025  SOFI250117P00014000  Sell  1  0.34  34.00
01/15/2025  SOFI250117P00014000  Buy  2  0.05  10.00`), [
  ['2025-01-10','SOFI','CSP',14,'2025-01-17',100,0.35,0,35],
  ['2025-01-10','SOFI','CSP',14,'2025-01-17',100,0.34,0,34],
  ['2025-01-15','SOFI','BTC',14,'2025-01-17',200,0.05,0,10],
], { broker: 'Webull', unsure: 0 });

// ── UK-style day-first dates (Trading 212/eToro are share/CFD brokers: no option trades → none invented) ──
const t212 = S(`Trading 212  Monthly Statement  GBP
Date  Action  Ticker  Shares  Price  Total
14/01/2025  Market buy  AAPL  1.5  £180.20  £270.30
20/01/2025  Dividend  AAPL  £0.30
Total  £270.60`);
check('Trading 212: no option trades invented', t212.rows.length === 0 && t212.broker === 'Trading 212');
const etoro = S(`eToro (UK) Ltd  Account Statement  01/01/2025 - 31/01/2025
Closed Positions  Position ID  Action  Units  Open Rate  Close Rate  Profit
1234567  Buy AAPL  2.0  180.00  190.00  20.00`);
check('eToro: no option trades invented', etoro.rows.length === 0 && etoro.broker === 'eToro');
expect('Day-first dates (13/02/2025 forces DD/MM for whole doc)', S(`Monthly options statement  Account 99
05/02/2025  Sell to Open  KO 21FEB25 62 P  1  0.80  79.35
13/02/2025  Buy to Close  KO 21FEB25 62 P  1  0.10  10.65`), [
  ['2025-02-05','KO','CSP',62,'2025-02-21',100,0.80,0.65,79.35],
  ['2025-02-13','KO','BTC',62,'2025-02-21',100,0.10,0.65,10.65],
]);

// ── Month-name dates, totals and summaries never become trades ──
expect('Month-name dates + summary lines', S(`Options Activity Summary
Jan 10, 2025  Sold to open  1  AAPL 01/17/2025 150.00 P  1.25  124.95
Realized gain on AAPL 01/17/2025 150.00 P  104.90
Year to date total premium  $5,210.00
Net Credits  124.95`), [
  ['2025-01-10','AAPL','CSP',150,'2025-01-17',100,1.25,0.05,124.95],
], { unsure: 0 });

// ── Single trade confirmation → SmartScan fallback ──
expect('Robinhood confirmation (all fields)', S(`Robinhood
Trade Confirmation
Your order to sell 1 contract of AAPL $150 Put 1/17/2025 has been filled.
Sell to open
Filled Jan 10, 2025
Average price $1.25
Contracts 1`), [['2025-01-10','AAPL','CSP',150,'2025-01-17',100,1.25,0,125]]);
expect('Schwab confirmation, contract split across lines', S(`Charles Schwab  Trade Confirmation
Trade Date: 03/03/2025   Settlement Date: 03/04/2025
You sold to open 2 contracts
AMD 03/21/2025
95.00 P
Price 1.40   Commission $1.32
Net Amount $278.68`), [['2025-03-03','AMD','CSP',95,'2025-03-21',200,1.40,1.32,278.68]]);
const conf = S(`Robinhood
Trade Confirmation
Your order to sell 1 contract of AAPL $150 Put 1/17/2025 has been filled.
Sell to open
Filled Jan 10, 2025
Average price $1.25
Contracts 1`);
check('confirmation: one trade via SmartScan', conf.rows.length === 1 && conf.rows[0].ticker === 'AAPL' && conf.rows[0].action === 'CSP' && conf.rows[0].strike === 150 && /confirmation/.test(conf.broker), JSON.stringify(conf));

// ── repeated page headers/footers + a page break between rows ──
expect('Multi-page with repeated headers', S(`E*TRADE Securities LLC  Page 1 of 2
Trade Date  Transaction Type  Description  Quantity  Price  Commission  Amount
2/03/25  Sold To Open  KO Feb 21 '25 $62 Put  -2  0.80  1.30  158.70
E*TRADE Securities LLC  Page 2 of 2
Trade Date  Transaction Type  Description  Quantity  Price  Commission  Amount
2/14/25  Bought To Close  KO Feb 21 '25 $62 Put  2  0.10  1.30  (21.30)
Total  137.40`), [
  ['2025-02-03','KO','CSP',62,'2025-02-21',200,0.80,1.30,158.70],
  ['2025-02-14','KO','BTC',62,'2025-02-21',200,0.10,1.30,21.30]], { unsure: 0 });

// ── Scanned PDF ──
check('scanned/image PDF → clear message', /scanned/.test(S('   \n  \n').error || ''));

console.log(`\nField accuracy: ${fieldsOk}/${fieldsAll} (${(100 * fieldsOk / fieldsAll).toFixed(1)}%)`);
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// leapscan.test.js — SmartScan in the '+ LEAP' form: broker fill text → single long call (fake figures only).
// Every accepted fill checks ALL fields: ticker, strike, expiry, type, qty, price, fees, date.
// Run: node tests/leapscan.test.js
const { extractFn, extractConst } = require('./extract');
const code = ['MON_PAT','MON_MAP','CREDITS','ACTION_MAP','VALID_ACTIONS'].map(extractConst)
  .concat(['isCredit','computeTotal','parseCSVLine','normDate','parseSmartText','brokerCSVLib','leapScan'].map(extractFn)).join('\n');
const scan = new Function(code + '\nconst B=brokerCSVLib();return t=>leapScan(t,B);')();
let pass = 0, fail = 0;
const check = (n, ok, x) => { ok ? pass++ : fail++; console.log((ok ? '  ✓ ' : '  ✗ ') + n + (ok || x === undefined ? '' : '  → ' + JSON.stringify(x))); };
const F = ['ticker', 'strike', 'expiry', 'type', 'qty', 'price', 'fees', 'date'];
function one(name, text, want) {
  const r = scan(text);
  check(`${name}: exactly one bought call, nothing rejected`, r.calls.length === 1 && !r.rejected.length && !r.error, r);
  const c = r.calls[0] || {};
  F.forEach((f, i) => check(`${name}: ${f}`, typeof want[i] === 'number' ? Math.abs(c[f] - want[i]) < 0.006 : c[f] === want[i], { got: c[f], want: want[i] }));
}
function reject(name, text, re) {
  const r = scan(text);
  check(`${name}: not filled, clear message`, r.calls.length === 0 && re.test(r.error), r.error);
}

one('IBKR confirmation', `Interactive Brokers Trade Confirmation
Trade Date: 2026-03-10  Settle Date: 2026-03-11
Symbol: TSLA 15JAN27 450 C
Action: BUY  Quantity: 1  Price: 98.50  Proceeds: -9850.00  Comm/Fee: -1.05  Code: O`, ['TSLA', 450, '2027-01-15', 'C', 1, 98.5, 1.05, '2026-03-10']);
one('IBKR statement Trades line (Marc-style TSLA 450C buy)', `TSLA 15JAN27 450 C  2025-11-05, 09:31:02  1  15.00  -1,500.00  -1.05  1,501.05  O`,
  ['TSLA', 450, '2027-01-15', 'C', 1, 15, 1.05, '2025-11-05']);
one('IBKR statement section', `Trades
Equity and Index Options
USD
TSLA 15JAN27 450 C  2026-03-10, 10:41:12  1  98.50  -9,850.00  -1.05  9,851.05  O
Total  -9,850.00
Open Positions`, ['TSLA', 450, '2027-01-15', 'C', 1, 98.5, 1.05, '2026-03-10']);
one('Robinhood', `Your order to buy 2 contracts of TSLA $500 Call 12/17/2027 was executed at an average price of $62.40 on March 4, 2026.
Option Buy to Open
Contracts: 2
Average price: $62.40
Fees: $0.08`, ['TSLA', 500, '2027-12-17', 'C', 2, 62.4, 0.08, '2026-03-04']);
one('Tastytrade', `Order Filled
Bought 1 NVDA 01/21/28 Call 160.00 @ 41.25
Buy to Open · Filled Mar 2, 2026
Commissions: $1.00  Fees: $0.14`, ['NVDA', 160, '2028-01-21', 'C', 1, 41.25, 1.14, '2026-03-02']);
one('Schwab', `Trade Confirmation - Charles Schwab
Trade Date: 04/15/2026
Action: Buy to Open
Quantity: 3
Description: CALL AAPL 06/16/2028 250.00
Price: $38.10
Commission: $1.95
Net Amount: $11,431.95`, ['AAPL', 250, '2028-06-16', 'C', 3, 38.1, 1.95, '2026-04-15']);
one('Fidelity', `Fidelity Investments - Order Confirmation
YOU BOUGHT OPENING TRANSACTION
CALL (MSFT) MICROSOFT CORP JAN 21 28 $520 (100 SHS)
Trade date: 05/01/2026
Quantity: 1  Price: $71.30
Commission: $0.65
Amount: $7,130.65`, ['MSFT', 520, '2028-01-21', 'C', 1, 71.3, 0.65, '2026-05-01']);
one('Webull', `Webull Order Filled
Buy to Open AMZN 2027-12-17 230.00 Call
Filled Qty: 2  Avg Price: 35.80
Filled Time: 06/12/2026 10:22:41 EDT
Fees: $0.10`, ['AMZN', 230, '2027-12-17', 'C', 2, 35.8, 0.1, '2026-06-12']);
one('Generic broker CSV', `Trade Date,Underlying,Activity,Qty,Price,Commission,Net Amount,Expiry,Strike,Put/Call
2026-02-21,TSLA,Buy to Open,1,80.00,0.65,8000.65,2028-01-21,400,C`, ['TSLA', 400, '2028-01-21', 'C', 1, 80, 0.65, '2026-02-21']);

// ── not long calls → clear message, nothing filled ──
reject('sold call (Tastytrade STO)', `Sold 1 TSLA 01/15/27 Call 450.00 @ 12.00\nSell to Open · Filled Mar 2, 2026`, /sold call/);
reject('bought put', `Bought 1 TSLA 01/15/27 Put 300.00 @ 22.00\nBuy to Open · Filled Mar 2, 2026`, /put/);
reject('buy to close', `Bought 1 TSLA 11/20/26 Call 450.00 @ 1.10\nBuy to Close · Filled Mar 2, 2026`, /buy-to-close/);
reject('sell to close', `Sold 1 TSLA 01/15/27 Call 450.00 @ 99.00\nSell to Close · Filled Mar 2, 2026`, /sell-to-close/);
reject('IBKR SLD line (negative qty, O)', `TSLA 20NOV26 450 C  2026-03-10, 10:41:12  -1  4.10  410.00  -1.05  -408.95  O`, /sold call/);
reject('IBKR closing buy (code C)', `TSLA 20NOV26 450 C  2026-03-10, 10:41:12  1  1.10  -110.00  -1.05  111.05  C`, /buy-to-close/);
reject('Schwab sell to open put', `Trade Date: 04/15/2026\nAction: Sell to Open\nQuantity: 1\nDescription: PUT SOFI 07/17/2026 20.00\nPrice: $0.80`, /put/);
reject('no option at all', `Bought 100 shares of TSLA at $380.00 on Mar 2, 2026`, /Couldn't find an option contract/);
reject('empty', `   `, /Paste/);

// ── multiple long calls → picker list; others skipped ──
const m = scan(`Trades
Equity and Index Options
TSLA 15JAN27 450 C  2026-03-10, 10:41:12  1  98.50  -9,850.00  -1.05  9,851.05  O
NVDA 21JAN28 160 C  2026-03-11, 11:02:00  2  41.25  -8,250.00  -2.10  8,252.10  O
SOFI 17JUL26 20 P  2026-03-12, 11:02:00  -1  0.80  80.00  -1.05  -78.95  O
Open Positions`);
check('multi: two calls offered, put skipped', m.calls.length === 2 && m.rejected.length === 1 && m.rejected[0].ticker === 'SOFI');
check('multi: NVDA all fields', JSON.stringify(F.map(f => m.calls[1][f])) === JSON.stringify(['NVDA', 160, '2028-01-21', 'C', 2, 41.25, 2.1, '2026-03-11']), F.map(f => m.calls[1][f]));

// ── UI wiring: SmartScan never saves; rejects never fill ──
const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'app', 'index.html'), 'utf8');
const body = n => extractFn(n);
check('leapRunScan / leapFillFrom never call save', !/saveLeap\(|_saveOpt|_saveWheel|_saveTrade|saveDB/.test(body('leapRunScan') + body('leapFillFrom') + body('leapLoadFile')));
check('leapScan is pure (no db / wheel access)', !/\bdb\.|_save|document\./.test(body('leapScan')));
check('modal has SmartScan + Manual tabs like mPaste', /id="lf-tab-smartscan"/.test(src) && /id="lf-tab-manual"/.test(src) && /id="lf-paste"/.test(src));
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);

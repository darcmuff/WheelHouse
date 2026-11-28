// importrobust.test.js — the import engine must cope with messy real-world files:
// odd option wording, other delimiters, decimal commas, encodings, junk. (Run: node tests/importrobust.test.js)
const { extractFn, extractConst } = require('./extract');
const code = [extractConst('MON_PAT'), extractConst('MON_MAP'), extractConst('CREDITS'),
  extractConst('ACTION_MAP'), extractConst('VALID_ACTIONS'),
  extractFn('isCredit'), extractFn('computeTotal'), extractFn('parseCSVLine'), extractFn('normDate'),
  extractFn('brokerCSVLib'), extractFn('rhPlan')].join('\n');
const L = new Function(code + '\nconst B=brokerCSVLib();B.rhPlan=rhPlan;return B;')();

let pass = 0, fail = 0;
const check = (name, ok, extra) => { ok ? pass++ : fail++; console.log((ok ? '  ✓ ' : '  ✗ ') + name + (ok || extra === undefined ? '' : '  → ' + JSON.stringify(extra))); };
const key = r => [r.entered, r.ticker, r.action, r.strike, r.expiry, r.shares, r.premium, r.fees, r.total].join('|');

// ── option contract wording ──
const want = JSON.stringify({ ticker: 'AAPL', expiry: '2025-01-17', strike: 150, pc: 'P' });
const forms = [
  'AAPL 17 Jan 2025 150 Put', 'AAPL Put 150 Jan 17 2025', 'AAPL 2025-01-17 150 P', 'AAPL 150 Put 01/17/25',
  'AAPL 01-17-2025 150 P', 'AAPL $150 Put 17 Jan 25', 'AAPL Jan-17-2025 150 Put', 'AAPL 150.00 P 01/17/2025',
  'Sold 1 AAPL 01/17/25 Put 150.00 @ 1.25', 'PUT AAPL $150 EXP 01/17/25', 'AAPL20250117P150', 'AAPL 20250117 150 P',
  'AAPL Put 17JAN25 150', 'AAPL 250117 P 150', 'O:AAPL250117P00150000', 'AAPL 17/01/2025 150 P',
];
for (const f of forms) check('option wording: ' + f, JSON.stringify(L.parseOption(f, true)) === want, L.parseOption(f, true));
check('option: BRK B OCC with a space', (L.parseOption('BRK B 250117P00400000', true) || {}).ticker === 'BRK.B', L.parseOption('BRK B 250117P00400000', true));
check('option: never an impossible date (month 17)', !(L.parseOption('AAPL 31/31/2025 150 P', true) || {}).expiry);
check('option: stock description is not an option', L.parseOption('APPLE INC COMMON STOCK', true) === null && L.parseOption('AAPL', true) === null);
check('option: call/put words in a memo are not an option', L.parseOption('Please call me about the put', true) === null);

// ── delimiters ──
const base = 'Date,Symbol,Action,Quantity,Price,Fees,Amount\n01/10/2025,AAPL 250117P00150000,Sell to Open,1,1.25,0.05,124.95\n01/15/2025,AAPL 250117P00150000,Buy to Close,1,0.20,0.05,-20.05\n';
const ref = L.parseBrokerCSV(base);
check('baseline parses 2 rows', ref.rows.length === 2, ref);
const swap = (t, d) => t.split('\n').map(l => l.split(',').join(d)).join('\n');
for (const [nm, d] of [['semicolon', ';'], ['tab', '\t'], ['pipe', '|']]) {
  const p = L.parseBrokerCSV(swap(base, d));
  check('delimiter ' + nm + ': same rows', p.rows.length === 2 && p.rows.map(key).join() === ref.rows.map(key).join(), p.error || p.rows);
}
const eu = 'Date;Symbol;Action;Quantity;Price;Fees;Amount\n10.01.2025;AAPL 250117P00150000;Sell to Open;1;1,25;0,05;124,95\n15.01.2025;AAPL 250117P00150000;Buy to Close;1;0,20;0,05;-20,05\n';
const pe = L.parseBrokerCSV(eu);
check('European file (; delimiter, decimal commas, dd.mm.yyyy)', pe.rows.length === 2 && pe.rows.map(key).join() === ref.rows.map(key).join(), pe.error || pe.rows);
const quotedSemi = 'Date;Symbol;Action;Quantity;Price;Fees;Amount\n"01/10/2025";"AAPL 250117P00150000";"Sell to Open";"1";"1.25";"0.05";"124.95"\n';
check('semicolon with every cell quoted', L.parseBrokerCSV(quotedSemi).rows.length === 1);
check('a comma inside quoted text does not switch delimiter', L.parseBrokerCSV('Date,Symbol,Action,Quantity,Price,Fees,Amount,Note\n01/10/2025,AAPL 250117P00150000,Sell to Open,1,1.25,0.05,124.95,"a;b;c;d;e;f"\n').rows.length === 1);

// ── no bad trades: every row that reaches the review step is a real, sane trade ──
const natHdr = 'Ticker,Action,Entered,Expiry,Strike Price,Premium/Price,Fees,Shares,Total\n';
const nat = (...rows) => L.parseBrokerCSV(natHdr + rows.join('\n') + '\n');
const good = 'SOFI,CSP: Cash Secured Put,2025-09-15,2025-09-26,21,0.45,1.3,100,43.7';
check('native good row survives', nat(good).rows.length === 1);
check('native: impossible date rejected', nat('SOFI,CSP,2025-02-30,2025-09-26,21,0.45,1.3,100,43.7').rows.length === 0);
check('native: garbage date rejected, listed as not imported', (() => { const p = nat('SOFI,CSP,???,2025-09-26,21,0.45,1.3,100,43.7'); return p.rows.length === 0 && p.unrecognised.length === 1; })());
check('native: 1e999 becomes unreadable, not Infinity', nat('SOFI,CSP,2025-09-15,2025-09-26,1e999,0.45,1.3,100,43.7').rows.every(r => r.strike == null || Number.isFinite(r.strike)));
check('native: zero shares on a CSP rejected', nat('SOFI,CSP,2025-09-15,2025-09-26,21,0.45,1.3,0,43.7').rows.length === 0);
check('native: nonsense ticker rejected', nat('99999999999999999999,CSP,2025-09-15,2025-09-26,21,0.45,1.3,100,43.7').rows.length === 0);
check('native: negative premium rejected', nat('SOFI,CSP,2025-09-15,2025-09-26,21,-0.45,1.3,100,43.7').rows.length === 0 || nat('SOFI,CSP,2025-09-15,2025-09-26,21,-0.45,1.3,100,43.7').rows[0].premium >= 0);
check('num(): infinity and exponent junk is NaN', Number.isNaN(L.num('1e999')) && Number.isNaN(L.num('Infinity')));
check('num(): unicode minus, trailing minus, parens, currency words', L.num('\u221220.05') === -20.05 && L.num('20.05-') === -20.05 && L.num('(20.05)') === -20.05 && L.num('USD 1,234.50') === 1234.5 && L.num('1.25 GBP') === 1.25 && L.num('(\u22125)') === -5 && L.num('$-10,636.32') === -10636.32);
// ── dates in the wild ──
const dates = { 'Jan 10, 2025': '2025-01-10', 'January 10 2025': '2025-01-10', '10-Jan-2025': '2025-01-10', '10 Jan 25': '2025-01-10', '10th Jan 2025': '2025-01-10', '2025/01/10': '2025-01-10', '2025.01.10': '2025-01-10', '20250110': '2025-01-10', '20250110T153200-0500': '2025-01-10', '10-01-2025 as of 09-01-2025': '2025-01-10', '2025-01-10T15:32:00Z': '2025-01-10', '01/10/2025 10:32 AM': '2025-01-10', 'Sept 3, 2025': '2025-09-03' };
for (const [k, v] of Object.entries(dates)) check('pickDate: ' + k, L.pickDate(k, k.includes('10-01-2025') ? true : false) === v, L.pickDate(k, false));
check('pickDate: day-first when told', L.pickDate('10/01/2025', true) === '2025-01-10' && L.pickDate('10/01/2025', false) === '2025-10-01');
check('pickDate: garbage is empty', L.pickDate('hello') === '' && L.pickDate('13/13/2025') === '');

// ── order: newest-first files are put in time order ──
const hdr7 = 'Date,Symbol,Action,Quantity,Price,Fees,Amount\n';
const newestFirst = hdr7 + '01/15/2025,AAPL 250117P00150000,Buy to Close,1,0.20,0.05,-20.05\n01/10/2025,AAPL 250117P00150000,Sell to Open,1,1.25,0.05,124.95\n';
check('newest-first file comes out oldest-first', L.parseBrokerCSV(newestFirst).rows.map(r => r.action).join() === 'CSP,BTC');
check('oldest-first file is left as is', L.parseBrokerCSV(hdr7 + '01/10/2025,AAPL 250117P00150000,Sell to Open,1,1.25,0.05,124.95\n01/15/2025,AAPL 250117P00150000,Buy to Close,1,0.20,0.05,-20.05\n').rows.map(r => r.action).join() === 'CSP,BTC');
check('same-day newest-first fills keep open-before-close', L.parseBrokerCSV(hdr7 + '01/15/2025,AAPL 250117P00150000,Buy to Close,1,0.20,0.05,-20.05\n01/15/2025,AAPL 250117P00150000,Sell to Open,1,1.25,0.05,124.95\n01/10/2025,AAPL 250117P00150000,Sell to Open,1,1.00,0.05,99.95\n').rows.map(r => r.entered + r.action).join() === '2025-01-10CSP,2025-01-15CSP,2025-01-15BTC');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

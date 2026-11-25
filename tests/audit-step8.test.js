// audit-step8.test.js — SmartScan & importer hardening (audit Step 8).
// Runs the LIVE parseSmartText / parseRollTrades / brokerCSVLib / rhPlan out of app/index.html with the real BCSV.
const test = require('node:test');
const assert = require('node:assert');
const { extractFn, extractConst } = require('./extract');

const CONSTS = ['MON_PAT', 'MON_MAP', 'CREDITS', 'ACTION_MAP', 'VALID_ACTIONS'].map(extractConst).join('\n');
const FNS = ['isCredit', 'computeTotal', 'parseCSVLine', 'normDate', 'brokerCSVLib', 'rhPlan',
  'parseSmartText', 'detectRollPaste', 'splitFeesCents', 'parseRollTrades'].map(extractFn).join('\n');
const make = (pre = '') => new Function(pre + '\n' + CONSTS + '\n' + FNS +
  '\nconst BCSV=brokerCSVLib();return{BCSV,rhPlan,parseSmartText,parseRollTrades,computeTotal};')();
const S = make();
// same code with a POPULAR list on window (1-letter tickers next to a verb only count when known)
const SP = make("var window={POPULAR:{rows:[['F','Ford Motor'],['T','AT&T']]}};");

// ── 1. one-letter tickers ──
test('1-letter ticker right before "$12 Put" parses cleanly', () => {
  const r = S.parseSmartText('F $12 Put Dec 18, 2026\nSell to Open\nFilled Nov 20, 2026\n2 contracts at $0.25', '2026-11-25');
  assert.strictEqual(r.error, undefined);
  assert.deepStrictEqual([r.ticker, r.action, r.strike, r.shares, r.premium, r.expiry, r.entered], ['F', 'CSP', 12, 200, 0.25, '2026-12-18', '2026-11-20']);
});
test('1-letter ticker via "Symbol:" label and OCC symbol', () => {
  assert.strictEqual(S.parseSmartText('Symbol: T\nSell to open 1 contract at $0.40\nPut strike: 25\nExpiry 2026-12-18', '2026-11-25').ticker, 'T');
  assert.strictEqual(S.parseSmartText('Sold 1 F 261218P00012000 @ 0.25 sell to open put 2026-11-20', '2026-11-25').ticker, 'F');
});
test('1-letter ticker next to the verb only when it is in POPULAR.rows', () => {
  const txt = 'Sold 3 F puts, opening\nprice: 0.20\nexpiry 2026-12-18';
  assert.strictEqual(SP.parseSmartText(txt, '2026-11-25').ticker, 'F');
  assert.notStrictEqual(S.parseSmartText(txt, '2026-11-25').ticker, 'F');
});
test('prose "I" / "A" is never taken as a ticker', () => {
  const r = S.parseSmartText('I sold a $15 put on SOFI. A good fill.\nSOFI $15 Put Dec 18, 2026\nSell to Open\n1 contract at $0.30', '2026-11-25');
  assert.strictEqual(r.ticker, 'SOFI');
  const r2 = SP.parseSmartText('I think A $12 Put looks fine, I sold it\nsell to open 1 contract at $0.30', '2026-11-25');
  assert.ok(r2.ticker !== 'I' && r2.ticker !== 'A', r2.ticker);
});
test('roll paste with a 1-letter ticker reads both legs', () => {
  const roll = `F Short Put Roll\nBuy F $12 Put Dec 4\nType\nLimit buy\nPosition effect\nClose\nFilled quantity\n2 contracts at $0.10\nFilled\nNov 20, 3:45 PM\nSell F $11 Put Dec 18\nType\nLimit sell\nPosition effect\nOpen\nFilled quantity\n2 contracts at $0.30\nFilled\nNov 20, 3:45 PM`;
  const t = S.parseRollTrades(roll, '2026-11-25');
  assert.ok(Array.isArray(t), JSON.stringify(t));
  assert.deepStrictEqual(t.map(x => [x.ticker, x.action, x.strike, x.contracts, x.expiry]), [['F', 'BTC', 12, 2, '2026-12-04'], ['F', 'CSP', 11, 2, '2026-12-18']]);
});

// ── 2. slash dates: one pass through sniffDMY / pickDate ──
test('04/11/2026 resolves the same way in BCSV and SmartScan, never twice', () => {
  assert.strictEqual(S.BCSV.sniffDMY('filled 04/11/2026'), false);
  assert.strictEqual(S.BCSV.pickDate('04/11/2026', false), '2026-04-11');
  assert.strictEqual(S.BCSV.pickDate('04/11/2026', true), '2026-11-04');
  // old code also read it as 4 Nov (a phantom future "expiry"); now only 11 Apr exists
  const r = S.parseSmartText('SOFI $20 Put\nSell to Open\n4 contracts at $0.30\nfilled 04/11/2026', '2026-04-15');
  assert.strictEqual(r.entered, '2026-04-11');
  assert.notStrictEqual(r.expiry, '2026-11-04');
});
test('UK paste (day-first) reads every slash date day-first', () => {
  const r = S.parseSmartText('Trading 212\nSOFI $20 Put expiry 24/11/2026\nSell to Open\n4 contracts at $0.30\nfilled 04/11/2026', '2026-11-10');
  assert.deepStrictEqual([r.entered, r.expiry], ['2026-11-04', '2026-11-24']);
});

// ── 3. Dec → Jan expiry rollover ──
test('December fill with yearless "Jan 15" expiry rolls to next year', () => {
  const r = S.parseSmartText('SOFI $20 Put Jan 15\nSell to Open\nFilled Dec 18, 2026\n4 contracts at $0.30', '2026-12-20');
  assert.deepStrictEqual([r.entered, r.expiry, r.days], ['2026-12-18', '2027-01-15', 28]);
  const r2 = S.parseSmartText('SOFI 20 Put Jan 15 sell to open trade date 2026-12-18 4 contracts at $0.30', '2026-12-20');
  assert.deepStrictEqual([r2.entered, r2.expiry], ['2026-12-18', '2027-01-15']);
});
test('a recently expired yearless date is NOT rolled forward', () => {
  const r = S.parseSmartText('SOFI $20 Put Nov 20\nBuy to Close\nFilled Nov 3\n4 contracts at $0.05', '2026-11-25');
  assert.ok(r.expiry < '2027-01-01' && r.entered < '2027-01-01', JSON.stringify([r.entered, r.expiry]));
});

// ── 4. no silent action flips ──
test('Buy to Open is rejected with the LEAPs-tab message', () => {
  const msg = 'This is a bought option — add it on the LEAPs tab';
  assert.strictEqual(S.parseSmartText('SOFI $20 Call Jan 15, 2027\nBuy to Open\nFilled Nov 20, 2026\n1 contract at $3.00', '2026-11-25').error, msg);
  assert.strictEqual(S.parseSmartText('BTO 1 SOFI $20 Call Jan 15, 2027 @ 3.00 filled 2026-11-20', '2026-11-25').error, msg);
  assert.strictEqual(S.parseSmartText('Buy SOFI $20 Call Jan 15, 2027\nPosition effect: Open\n1 contract at $3.00', '2026-11-25').error, msg);
  assert.strictEqual(S.parseSmartText('SOFI $20 Call Jan 15, 2027\nBuy to Open\n1 contract at $3.00', '2026-11-25').action, undefined);
});
test('buy/sell tie with no explicit code is an error, not a silent "sell"', () => {
  const r = S.parseSmartText('SOFI $20 Put Dec 18, 2026\nBuy\nSell\n1 contract at $0.30', '2026-11-25');
  assert.match(r.error || '', /buy or a sell/);
  assert.strictEqual(r.action, undefined);
  // IBKR SLD on a tie (no buy/sell words) is an explicit sell
  assert.strictEqual(S.parseSmartText('SOFI 18Dec2026 20 PUT SLD 4 @ 0.30 trade date 2026-11-20 open', '2026-11-25').action, 'CSP');
});
test('Buy to Close and closing puts map to BTC, never CSP', () => {
  assert.strictEqual(S.parseSmartText('SOFI $20 Put Dec 18, 2026\nBuy to Close\nFilled Nov 20, 2026\n1 contract at $0.10', '2026-11-25').action, 'BTC');
  // old code: "sold" + put → CSP regardless of the close wording
  const r = S.parseSmartText('SOFI $20 Put Dec 18, 2026\nYour order to close was filled. Sold 1 contract at $0.10\nClosed', '2026-11-25');
  assert.strictEqual(r.action, 'BTC');
  // an explicit SELL to close on a put is a bought put — refused, not flipped
  assert.match(S.parseSmartText('SOFI $20 Put Dec 18, 2026\nSell to Close\n1 contract at $0.10', '2026-11-25').error || '', /LEAPs tab/);
});

// ── 5. quantities, fees, totals ──
const MULTI = `SOFI $20 Put Dec 18, 2026
Sell to Open
Limit order: 4 contracts at $0.35
Filled Nov 20, 2026
Executed: 4 contracts at $0.30
Commission -$1.30
Regulatory fee ($0.65)
Total fees $1.95
Net credit $118.05`;
test('limit + execution: the last "contracts at $X" wins; fees not double-counted; total = computeTotal', () => {
  const r = S.parseSmartText(MULTI, '2026-11-25');
  assert.deepStrictEqual([r.premium, r.shares, r.fees], [0.30, 400, 1.95]);
  assert.strictEqual(r.total, S.computeTotal(r.action, r.premium, r.shares, r.fees));
  assert.ok(Math.abs(r.total - 118.05) < 1e-9);
  assert.strictEqual(r.totalWarning, undefined);
});
test('itemised -$1.30 and ($0.65) fees with no summary line add up to $1.95', () => {
  const r = S.parseSmartText(MULTI.replace('Total fees $1.95\n', ''), '2026-11-25');
  assert.strictEqual(r.fees, 1.95);
});
test('broker total off by more than $0.05 → total stays computed and a warning is attached', () => {
  const r = S.parseSmartText(MULTI.replace('$118.05', '$125.00'), '2026-11-25');
  assert.ok(Math.abs(r.total - 118.05) < 1e-9);
  assert.strictEqual(r.scrapedTotal, 125);
  assert.match(r.totalWarning, /\$125\.00.*\$118\.05/);
  // within $0.05 → no warning
  assert.strictEqual(S.parseSmartText(MULTI.replace('$118.05', '$118.09'), '2026-11-25').totalWarning, undefined);
});
test('signed and comma quantities: -5 contracts and 1,000 shares', () => {
  const a = S.parseSmartText('SOFI PUT strike: 20 Quantity: -5 fill price: 0.30 expiry 2026-12-18 trade date 2026-11-20 sell to open', '2026-11-25');
  assert.strictEqual(a.shares, 500);
  const b = S.parseSmartText('SOFI $20 Put Dec 18, 2026\nSell to Open\n-5 contracts at $0.30', '2026-11-25');
  assert.strictEqual(b.shares, 500);
  const c = S.parseSmartText('Bought 1,000 shares at $10.00 of SOFI on 2026-11-20', '2026-11-25');
  assert.deepStrictEqual([c.action, c.shares, c.premium], ['IN', 1000, 10]);
  const d = S.parseSmartText('SOFI Bought shares\nQuantity: 1,000\nPrice: 10.00\n2026-11-20', '2026-11-25');
  assert.strictEqual(d.shares, 1000);
});
test('roll legs: signed fees and missing quantity', () => {
  const base = `SOFI Short Put Roll\nContract fee\n($1.30)\nBuy SOFI $20 Put Dec 4\nPosition effect\nClose\nFilled quantity\n1 contracts at $0.10\nFilled\nNov 20, 3:45 PM\nSell SOFI $19 Put Dec 18\nPosition effect\nOpen\nFilled quantity\n1 contracts at $0.30\nFilled\nNov 20, 3:45 PM`;
  const t = S.parseRollTrades(base, '2026-11-25');
  assert.deepStrictEqual(t.map(x => x.fees), [0.65, 0.65]);
  const bad = S.parseRollTrades(base.replace('1 contracts at $0.30', 'see order'), '2026-11-25');
  assert.match(bad.error, /filled quantity/);
});

// ── 6. importers: assignment fees kept, no quantity → not imported ──
test('broker CSV: assignment fees are kept on IN/OUT', () => {
  const p = S.BCSV.parseBrokerCSV(`"Date","Action","Symbol","Description","Quantity","Price","Fees & Comm","Amount"
"01/10/2025","Sell to Open","AMD 01/17/2025 110.00 P","PUT AMD $110","1","$2.10","$0.66","$209.34"
"01/17/2025","Assigned","AMD 01/17/2025 110.00 P","PUT AMD $110","1","","$5.00",""`);
  const inn = p.rows.find(r => r.action === 'IN');
  assert.ok(inn, JSON.stringify(p.rows));
  assert.deepStrictEqual([inn.fees, inn.total], [5, 11005]);
});
test('broker CSV: missing or unreadable quantity is listed, never imported as 1', () => {
  const p = S.BCSV.parseBrokerCSV(`Trade Date,Underlying,Activity,Qty,Price,Commission,Net Amount,Expiry,Strike,Put/Call
2025-02-03,KO,Sell to Open,,0.80,0.65,79.35,2025-02-21,62,P
2025-02-04,KO,Sell to Open,abc,0.80,0.65,79.35,2025-02-21,62,P
2025-02-05,KO,Sell to Open,2,0.80,0.65,159.35,2025-02-21,62,P`);
  assert.strictEqual(p.rows.length, 1);
  assert.strictEqual(p.rows[0].shares, 200);
  assert.strictEqual(p.unrecognised.length, 2);
  assert.ok(p.unrecognised.every(b => /quantity/.test(b.reason)), JSON.stringify(p.unrecognised));
});
test('PDF confirmation with no quantity is listed, not imported as 1 contract', () => {
  const p = S.BCSV.parseStatementText('Robinhood\nSOFI $20 Put 11/20/2026\nSold to open\nTrade date: Nov 1, 2026\nPrice: $0.30');
  assert.strictEqual(p.rows.length, 0);
  assert.ok(p.unrecognised.some(b => b.reason === 'no quantity'), JSON.stringify(p));
});
test('Robinhood: the assignment share row fee is kept on the IN trade', () => {
  const p = S.BCSV.parseBrokerCSV(`"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"
"1/17/2025","1/17/2025","1/17/2025","F","F 1/17/2025 Put $10.00","OASGN","1","",""
"1/20/2025","1/20/2025","1/22/2025","F","Ford Motor","Buy","100","$10.00","($1,000.15)"`);
  let k = 0; const P = S.rhPlan(p.rh, [], [], () => 'x' + (++k));
  const inn = P.wheelRows.find(r => r.action === 'IN');
  assert.deepStrictEqual([inn.fees, inn.total, inn.shares], [0.15, 1000.15, 100]);
  assert.strictEqual(P.skipped.filter(s => /assignment/.test(s.reason)).length, 1);
});
test('Robinhood: option row with no quantity is listed, not defaulted', () => {
  const p = S.BCSV.parseBrokerCSV(`"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"
"1/10/2025","1/10/2025","1/13/2025","AAPL","AAPL 1/17/2025 Put $150.00","STO","","$1.25","$124.95"`);
  assert.strictEqual(p.rh.length, 0);
  assert.strictEqual(p.unrecognised[0].reason, 'no quantity');
});

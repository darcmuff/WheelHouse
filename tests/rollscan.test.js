// rollscan.test.js — SmartScan rolls: Robinhood month-first dates, Position effect, LEAP card short-call / long-call / put rolls (fake LEAP, Marc's SOFI roll text).
const test = require('node:test');
const assert = require('node:assert');
const { extractFn, extractConst } = require('./extract');
const SOFI = `SOFI Short Call Roll
Individual · Apr 21
$48.00
Time in force
Good for day
Submitted
Apr 21, 3:44 PM GMT+1
Quantity
4
Account
Individual
Status
Filled
Limit price
$0.12
Est credit
$43.68
Est regulatory fees
$0.32
Contract fee
$4.00
Buy SOFI $19.5 Call Apr 24
Type
Limit buy
Position effect
Close
Filled quantity
4 contracts at $0.50
Filled
Apr 21, 3:45 PM GMT+1
Quantity
4
Sell SOFI $21 Call May 1
Type
Limit sell
Position effect
Open
Filled quantity
4 contracts at $0.62
Filled
Apr 21, 3:45 PM GMT+1
Quantity
4`;
const LONG = SOFI.replace('SOFI Short Call Roll', 'SOFI Long Call Roll').replace('Buy SOFI $19.5', 'Sell SOFI $19.5').replace('Limit buy', 'Limit sell')
  .replace('Sell SOFI $21', 'Buy SOFI $21').replace(/Limit sell\nPosition effect\nOpen/, 'Limit buy\nPosition effect\nOpen');
const PUT = SOFI.replace('Short Call Roll', 'Short Put Roll').replace(/ Call /g, ' Put ');
const S = new Function("let n=0;const uid=()=>'new'+(++n);const fmt2=n=>(+n).toFixed(2);" +
  ['CREDITS'].map(extractConst).join('\n') +
  ['isCredit', 'computeTotal', 'detectRollPaste', 'parseRollTrades', 'optionsLib', 'pmccShortsFor', 'pmccBtcMatch','pmccBuyBack', 'pmccFormLeg', 'pmccRollScan', 'pmccRollApply', 'pmccRollParents', 'nearStrike', 'strikeStep', 'exactSubset'].map(extractFn).join('\n') +
  '\nconst OPTS=optionsLib();return{parseRollTrades,pmccRollScan,pmccRollApply,pmccRollParents};')();
const T = '2026-10-29';
const leap = { id: 'L1', groupId: 'L1', underlying: 'SOFI', type: 'C', side: 'long', strike: 19.5, expiry: '2026-04-24', qty: 4, entryPrice: 3, entryDate: '2026-01-05', status: 'open' };
const short = { id: 'S1', groupId: 'S1', parentLeapId: 'L1', underlying: 'SOFI', type: 'C', side: 'short', strike: 19.5, expiry: '2026-04-24', qty: 4, entryPrice: 0.4, entryDate: '2026-04-14', status: 'open' };
const bigLeap = { ...leap, strike: 10, expiry: '2028-01-21' };

test('wheel roll: Robinhood month-first dates, years from fill date, fees split', () => {
  const t = S.parseRollTrades(SOFI, T);
  assert.strictEqual(t.length, 2);
  assert.deepStrictEqual(t.map(x => [x.action, x.strike, x.expiry, x.entered, x.contracts, x.premium, x.fees]),
    [['BTC', 19.5, '2026-04-24', '2026-04-21', 4, 0.5, 2.16], ['STOC', 21, '2026-05-01', '2026-04-21', 4, 0.62, 2.16]]);
  assert.strictEqual(t[0].rollId, t[1].rollId);
});
test('fill date in a later month than today goes to last year; expiry follows it', () => {
  const t = S.parseRollTrades(SOFI.replace(/Apr 21/g, 'Dec 29').replace('Apr 24', 'Jan 2').replace('May 1', 'Jan 9'), T);
  assert.deepStrictEqual(t.map(x => [x.entered, x.expiry]), [['2025-12-29', '2026-01-02'], ['2025-12-29', '2026-01-09']]);
});
test('day-first dates still read', () => {
  const t = S.parseRollTrades(SOFI.replace('Call Apr 24', 'Call 24 Apr').replace('Call May 1', 'Call 1 May').replace(/Apr 21, 3:45/g, '21 Apr 3:45'), T);
  assert.deepStrictEqual(t.map(x => [x.entered, x.expiry]), [['2026-04-21', '2026-04-24'], ['2026-04-21', '2026-05-01']]);
});
test('Position effect respected: sell close = STC, buy open = BTO', () => {
  assert.deepStrictEqual(S.parseRollTrades(LONG, T).map(x => x.action), ['STC', 'BTO']);
  assert.deepStrictEqual(S.parseRollTrades(PUT, T).map(x => x.action), ['BTC', 'CSP']);
});
test('LEAP card: short call roll closes the open $19.5 and opens $21, linked', () => {
  const r = S.pmccRollScan(SOFI, T);
  assert.strictEqual(r.kind, 'short');
  const legs = [bigLeap, short];
  const a = S.pmccRollApply(r, bigLeap, legs, 'N1');
  assert.ok(!a.err, a.err);
  const [c, o] = a.save;
  assert.deepStrictEqual([c.id, c.status, c.closePrice, c.closeDate, c.closeFees], ['S1', 'closed', 0.5, '2026-04-21', 2.16]);
  assert.deepStrictEqual([o.id, o.strike, o.expiry, o.qty, o.entryPrice, o.entryDate, o.fees, o.parentLeapId, o.rolledFrom, o.status], ['N1', 21, '2026-05-01', 4, 0.62, '2026-04-21', 2.16, 'L1', 'S1', 'open']);
  assert.deepStrictEqual(S.pmccRollParents([c, o]).N1, ['S1']);
});
test('LEAP card: short call roll with no matching open call is refused', () => {
  const a = S.pmccRollApply(S.pmccRollScan(SOFI, T), bigLeap, [bigLeap], 'N1');
  assert.match(a.err, /No open short call/);
});
test('LEAP card: long call roll closes the LEAP and opens the new one, shorts follow', () => {
  const r = S.pmccRollScan(LONG, T);
  assert.strictEqual(r.kind, 'long');
  const a = S.pmccRollApply(r, leap, [leap], 'N2');
  assert.ok(!a.err, a.err);
  const [c, n] = a.save;
  assert.deepStrictEqual([c.id, c.status, c.closePrice, c.closeDate], ['L1', 'closed', 0.5, '2026-04-21']);
  assert.deepStrictEqual([n.id, n.side, n.strike, n.expiry, n.qty, n.entryPrice, n.entryDate, n.rolledFrom, n.status], ['N2', 'long', 21, '2026-05-01', 4, 0.62, '2026-04-21', 'L1', 'open']);
});
test('LEAP card: put roll refused in plain words', () => {
  assert.strictEqual(S.pmccRollScan(PUT, T).error, 'This is a put roll — add it on the wheel card.');
});
test('LEAP card: not a roll → null (single-trade path)', () => {
  assert.strictEqual(S.pmccRollScan('Sell SOFI $21 Call May 1\nFilled quantity\n4 contracts at $0.62', T), null);
});

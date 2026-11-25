const test = require('node:test');
const assert = require('node:assert');
const { extractFn, extractConst, withLedger } = require('./extract');
const W = [{ id: 'w1', status: 'open', ticker: 'SOFI' }];
const S = new Function(withLedger(extractFn('optionsLib') + '\nconst OPTS=optionsLib();\n' + extractConst('PNL_RANGES') + extractConst('PNL_DEFAULT_GRAN') + extractConst('_iso') +
  ['walkLegPairs', 'realisedPremium', 'shareRealisations', 'optsMonthly', 'calcMonthlyRealised', 'realisedDaily', '_bucketKey', 'pnlBuckets'].map(extractFn).join('\n') +
  '\nreturn {calcMonthlyRealised,optsMonthly,realisedDaily,pnlBuckets};'))();
const T = (action, entered, total, shares = 0, x = {}) => ({ wheelId: 'w1', action, entered, total, shares, strike: 50, ...x });
const TODAY = '2026-10-27';
const tr = [
  T('CSP', '2026-01-05', 300, 100, { expiry: '2026-01-30' }), T('IN', '2026-01-30', 5000, 100),
  T('STOC', '2026-02-02', 250, 100, { strike: 52 }), T('BTC', '2026-02-10', 400, 100, { strike: 52 }),
  T('OUT', '2026-10-20', 4800, 100), T('DIV', '2026-10-25', 20),
  T('CSP', '2026-10-21', 150, 100, { expiry: '2026-11-20' }), // open: must not appear
];
const L = (x) => ({ underlying: 'SOFI', qty: 1, fees: 0, closeFees: 0, type: 'C', strike: 20, ...x });
const legs = [
  L({ id: 'leap', side: 'long', strike: 10, expiry: '2027-12-17', entryPrice: 5, entryDate: '2026-01-02', status: 'closed', closePrice: 6, closeDate: '2026-10-14' }),
  L({ id: 'c1', parentLeapId: 'leap', side: 'short', expiry: '2026-09-19', entryPrice: 1.2, entryDate: '2026-09-01', status: 'expired', closePrice: 0, closeDate: '2026-09-19' }),
  L({ id: 'c2', parentLeapId: 'leap', side: 'short', expiry: '2026-10-17', entryPrice: 1, entryDate: '2026-09-22', status: 'closed', closePrice: 1.5, closeDate: '2026-10-10' }),
];

test('options chart: All-time net equals Monthly P&L all-time Profit (wheel + PMCC; no shares/LEAP/divs)', () => {
  const O = S.optsMonthly(legs);
  const all = S.calcMonthlyRealised(tr, [{ key: 'leaps', byMonth: O.byMonth, gain: O.gain, loss: O.loss, lgain: O.lgain, lloss: O.lloss }], TODAY).reduce((a, r) => a + r.profit, 0);
  const B = S.pnlBuckets(S.realisedDaily(tr, legs, TODAY, W), 'All', null, TODAY);
  assert.strictEqual(B.gran, 'Month');
  assert.ok(Math.abs(B.net - all) < 1e-6, B.net + ' vs ' + all);
  const oct = B.buckets.find(b => b.key === '2026-10-01');
  assert.strictEqual(Math.round(oct.loss), 150); // PMCC buyback only; share loss is Positions P&L
  assert.ok(!S.realisedDaily(tr, legs, TODAY, W).some(d => d.gain === 150));
});

test('granularity defaults per range, override works, empty buckets kept', () => {
  const D = S.realisedDaily(tr, legs, TODAY, W);
  const w = S.pnlBuckets(D, '1W', null, TODAY);
  assert.strictEqual(w.gran, 'Day');
  assert.strictEqual(w.buckets.length, 7);
  assert.strictEqual(w.net, 0); // 21–27 Oct: only a dividend (excluded) and an open CSP
  assert.strictEqual(S.pnlBuckets(D, '3M', null, TODAY).gran, 'Week');
  const wk = S.pnlBuckets(D, '1M', 'Week', TODAY);
  assert.ok(wk.buckets.every(b => new Date(b.key + 'T12:00:00').getUTCDay() === 1));
  assert.strictEqual(S.pnlBuckets(D, '1Y', 'Day', TODAY).net, S.pnlBuckets(D, '1Y', null, TODAY).net);
});

test('YTD range starts Jan 1, defaults to Month, excludes prior-year entries', () => {
  const today = '2026-10-27';
  const daily = [
    { date: '2025-12-15', gain: 100, loss: 0 },
    { date: '2026-01-05', gain: 300, loss: 0 },
    { date: '2026-06-10', gain: 0, loss: 50 },
    { date: '2026-10-14', gain: 200, loss: 20 },
  ];
  const ytd = S.pnlBuckets(daily, 'YTD', null, today);
  assert.strictEqual(ytd.start, '2026-01-01');
  assert.strictEqual(ytd.end, today);
  assert.strictEqual(ytd.gran, 'Month');
  assert.strictEqual(ytd.buckets[0].key, '2026-01-01');
  assert.ok(ytd.buckets.every(b => b.key >= '2026-01-01' && b.key <= today));
  const year = daily.filter(e => e.date >= '2026-01-01' && e.date <= today);
  const expectedNet = Math.round(year.reduce((a, e) => a + e.gain - e.loss, 0) * 100) / 100;
  assert.strictEqual(ytd.net, expectedNet);
  assert.strictEqual(ytd.gain, Math.round(year.reduce((a, e) => a + e.gain, 0) * 100) / 100);
  assert.strictEqual(ytd.loss, Math.round(year.reduce((a, e) => a + e.loss, 0) * 100) / 100);
  const allNet = Math.round(daily.reduce((a, e) => a + e.gain - e.loss, 0) * 100) / 100;
  assert.notStrictEqual(ytd.net, allNet);
});

// delta.test.js — Black-Scholes delta at open, IV solve, unsolvable cases, bucketing.
// Isolated helper only. Does not touch existing optionsLib or P&L.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { extractFn } = require('./extract');
const D = require('../app/delta.js');

function near(a, b, eps) { return Math.abs(a - b) <= (eps == null ? 1e-3 : eps); }

test('known Black-Scholes ATM call and put deltas at 20% vol, 1y, 4% rate', () => {
  // S=K=100, T=1, r=0.04, σ=0.20 → d1 = 0.3, N(0.3) ≈ 0.6179
  const call = D.bs('C', 100, 100, 1, 0.2, 0.04);
  const put = D.bs('P', 100, 100, 1, 0.2, 0.04);
  assert.ok(call && put);
  assert.ok(near(call.delta, 0.6179, 0.002), call);
  assert.ok(near(put.delta, call.delta - 1, 1e-9), put);
  assert.ok(near(put.delta, -0.3821, 0.002), put);
  assert.ok(near(call.price, 9.925, 0.02), call);
});

test('implied vol round-trips a known mid', () => {
  const g = D.bs('C', 100, 100, 1, 0.2, 0.04);
  const iv = D.impliedVol('C', g.price, 100, 100, 1, 0.04);
  assert.ok(near(iv, 0.2, 0.001), iv);
});

test('implied vol below discounted intrinsic is unsolvable', () => {
  // ITM call, S=150 K=100 T=0.5 r=0.04; intrinsic ≈ 51.98. Premium 1 is far below.
  assert.strictEqual(D.impliedVol('C', 1, 150, 100, 0.5, 0.04), null);
  const miss = D.deltaAtOpen({ type: 'C', strike: 100, expiry: '2026-07-17', openDate: '2026-01-16', premium: 1, spot: 150 });
  assert.strictEqual(miss.delta, null);
  assert.strictEqual(miss.reason, 'unsolvable');
});

test('implied vol above the 500% bound is unsolvable, never guessed', () => {
  assert.strictEqual(D.impliedVol('C', 80, 100, 100, 7 / 365, 0.04), null);
  const miss = D.deltaAtOpen({ type: 'P', strike: 100, expiry: '2026-02-20', openDate: '2026-01-16', premium: 80, spot: 100 });
  assert.strictEqual(miss.delta, null);
  assert.strictEqual(miss.reason, 'unsolvable');
});

test('delta at open for a ~30 DTE OTM put lands around 0.15–0.35', () => {
  // S=100, K=95, 30 DTE, premium $1.20 — typical short put
  const r = D.deltaAtOpen({ type: 'P', strike: 95, expiry: '2026-02-20', openDate: '2026-01-21', premium: 1.20, spot: 100 });
  assert.ok(r.delta < 0, r);
  assert.ok(r.absDelta >= 0.15 && r.absDelta <= 0.35, r);
});

test('no spot or bad inputs leave delta blank', () => {
  assert.strictEqual(D.deltaAtOpen({ type: 'P', strike: 95, expiry: '2026-02-20', openDate: '2026-01-21', premium: 1.2 }).reason, 'no-spot');
  assert.strictEqual(D.deltaAtOpen({ type: 'P', strike: 95, expiry: '2026-02-20', openDate: '2026-01-21', premium: 1.2, spot: 0 }).reason, 'no-spot');
  assert.strictEqual(D.deltaAtOpen({ type: 'X', strike: 95, expiry: '2026-02-20', openDate: '2026-01-21', premium: 1.2, spot: 100 }).reason, 'bad-inputs');
  assert.strictEqual(D.deltaAtOpen({ type: 'P', strike: 95, expiry: '2026-01-10', openDate: '2026-01-21', premium: 1.2, spot: 100 }).reason, 'bad-inputs');
});

test('typed override wins over the estimate; live optleg delta is ignored', () => {
  const t = { action: 'CSP', strike: 95, expiry: '2026-02-20', entered: '2026-01-21', premium: 1.20, delta: 0.22 };
  const r = D.resolveOpenDelta(t, 100);
  assert.strictEqual(r.src, 'typed');
  assert.strictEqual(r.absDelta, 0.22);
  const leg = { type: 'C', side: 'long', strike: 200, expiry: '2027-01-15', entryDate: '2026-06-01', entryPrice: 58, delta: 0.81 };
  const live = D.resolveOpenDelta(leg, 238);
  assert.notStrictEqual(live.src, 'typed');
  const over = D.resolveOpenDelta({ ...leg, deltaAtOpen: 0.74 }, 238);
  assert.strictEqual(over.src, 'typed');
  assert.strictEqual(over.absDelta, 0.74);
});

test('fillTimestamp reads filledAt only, not createdAt or optleg ts', () => {
  assert.strictEqual(D.fillTimestamp({ entered: '2026-01-21', createdAt: '2026-01-21T20:00:00.000Z' }), null);
  assert.strictEqual(D.fillTimestamp({ entryDate: '2026-01-21', ts: '2026-01-21T20:00:00.000Z' }), null);
  assert.strictEqual(D.fillTimestamp({ filledAt: '2026-01-21T15:32:00-05:00' }), '2026-01-21T15:32:00-05:00');
  assert.ok(D.fillTimestamp({ entered: '2026-01-21T15:32:00-05:00' }));
});

test('bucket edges and No delta; best bucket is highest average P&L', () => {
  assert.strictEqual(D.bucketKey(0.149), 'under 0.15');
  assert.strictEqual(D.bucketKey(0.15), '0.15–0.25');
  assert.strictEqual(D.bucketKey(0.25), '0.25–0.35');
  assert.strictEqual(D.bucketKey(0.35), '0.35–0.50');
  assert.strictEqual(D.bucketKey(0.50), '0.35–0.50');
  assert.strictEqual(D.bucketKey(0.501), 'over 0.50');
  assert.strictEqual(D.bucketKey(null), 'No delta');
  const B = D.bucketItems([
    { absDelta: 0.12, win: true, amount: 40 },
    { absDelta: 0.12, win: true, amount: 50 },
    { absDelta: 0.20, win: true, amount: 200 },
    { absDelta: 0.20, win: false, amount: -20 },
    { absDelta: 0.40, win: true, amount: 10 },
    { absDelta: null, win: true, amount: 999 }
  ]);
  const by = Object.fromEntries(B.rows.map(r => [r.key, r]));
  assert.strictEqual(by['under 0.15'].count, 2);
  assert.strictEqual(by['under 0.15'].wr, '100.0');
  assert.strictEqual(by['under 0.15'].avgPnl, 45);
  assert.strictEqual(by['0.15–0.25'].count, 2);
  assert.strictEqual(by['0.15–0.25'].wins, 1);
  assert.strictEqual(by['0.15–0.25'].totalPnl, 180);
  assert.strictEqual(by['0.15–0.25'].avgPnl, 90);
  assert.strictEqual(B.noDelta, 1);
  assert.strictEqual(B.best.key, '0.15–0.25');
  assert.strictEqual(D.formatDelta(0.28), 'Δ 0.28');
  assert.match(D.precisionHover('estimated', 'minute', '1m'), /1-minute stock price at fill/);
  assert.match(D.precisionHover('estimated', 'day', '1d'), /close on the open date/);
  assert.match(D.precisionHover('typed'), /typed on the trade/);
});

test('delta.js is a separate helper and optionsLib BS is unchanged', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
  const delta = fs.readFileSync(path.join(__dirname, '..', 'app', 'delta.js'), 'utf8');
  assert.match(delta, /fixed 4%/);
  assert.match(delta, /filledAt/);
  assert.doesNotMatch(delta, /legPnL|calcWinLoss|realisedPremium/);
  const body = extractFn('optionsLib');
  assert.match(body, /function impliedVol\(/);
  assert.match(body, /function bs\(/);
  assert.match(src, /delta\.js/);
  assert.match(src, /Delta at open/);
});

test('report delta sold items keep the same win flag and amount as the Report', () => {
  const stubs = `
    const DeltaOpen = require(${JSON.stringify(path.join(__dirname, '../app/delta.js'))});
  `;
  const X = new Function('require', 'module', 'exports',
    stubs +
    extractFn('optionsLib') + '\nconst OPTS=optionsLib();\n' +
    ['reportWinLossItems','reportDeltaSoldItems','reportDeltaLeapItems'].map(extractFn).join('\n') +
    '\nreturn {OPTS,reportWinLossItems,reportDeltaSoldItems,reportDeltaLeapItems};'
  )(require, module, exports);
  const wheels = [{id:'w'}];
  const trades = [
    {id:'a',wheelId:'w',action:'CSP',entered:'2026-04-01',expiry:'2026-04-17',strike:15,total:200,premium:2,ticker:'SOFI'},
    {id:'b',wheelId:'w',action:'BTC',entered:'2026-04-10',expiry:'2026-04-17',strike:15,total:50,premium:0.5,ticker:'SOFI'},
    {id:'c',wheelId:'w',action:'CSP',entered:'2026-05-01',expiry:'2026-05-15',strike:14,total:80,premium:0.8,ticker:'SOFI',expiredWorthless:true},
  ];
  const legs = [
    {id:'C',status:'closed',side:'short',type:'C',underlying:'AAPL',strike:250,qty:1,entryPrice:2.4,entryDate:'2026-05-01',closePrice:3.9,closeDate:'2026-05-20',fees:0,closeFees:0.65},
    {id:'L',status:'closed',side:'long',type:'C',underlying:'TSLA',strike:250,qty:1,entryPrice:48,entryDate:'2026-04-01',closePrice:36,closeDate:'2026-10-01',fees:0.65,closeFees:0.65},
  ];
  const wins = X.reportWinLossItems(wheels, trades, legs);
  const sold = X.reportDeltaSoldItems(wheels, trades, legs, () => ({price:16,precision:'day',bar:'1d'}));
  assert.strictEqual(sold.length, wins.length);
  sold.forEach((it, i) => {
    assert.strictEqual(it.win, wins[i].win, i);
    assert.strictEqual(it.amount, wins[i].amount, i);
    assert.strictEqual(it.date, wins[i].date, i);
  });
  assert.ok(sold[0].absDelta != null || sold[0].absDelta === null);
  const leap = X.reportDeltaLeapItems(legs, () => ({price:260,precision:'day',bar:'1d'}));
  assert.strictEqual(leap.length, 1);
  assert.strictEqual(leap[0].amount, X.OPTS.legPnL(legs[1]).realized);
  assert.strictEqual(leap[0].win, leap[0].amount >= 0);
});

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { load, extractFn } = require('./extract');

const LEDGER = fs.readFileSync(path.join(__dirname, '..', 'app', 'ledger.js'), 'utf8');

const sandbox = (names, extra = '') => {
  const code = LEDGER + '\n' + extractFn('optionsLib') + '\nconst OPTS=optionsLib();\n' +
    extractFn('isSameMarkDay') + extractFn('markDay') + extractFn('wheelLegOcc') +
    names.map(extractFn).join('\n') + extra;
  return new Function(code + '\nreturn {' + names.join(',') + '};')();
};

test('underwater wheel CSP: mark-to-market premium is negative', () => {
  const { calcAllUnrealised } = sandbox(['_wheelMarkOf', 'calcAllUnrealised']);
  const wheels = [{ id: 'w', status: 'open', ticker: 'TSLA' }];
  const trades = [{
    id: '1', wheelId: 'w', ticker: 'TSLA', action: 'CSP', entered: '2026-11-01', expiry: '2026-12-19',
    strike: 100, shares: 100, premium: 5, total: 500, fees: 0,
  }];
  const u = calcAllUnrealised(wheels, trades, () => null, [], () => 21);
  assert.strictEqual(u.premium, -1600);
  assert.strictEqual(u.value, -1600);
  assert.strictEqual(u.unpriced, 0);
});

test('missing quotes: unpriced count and Home sub-text', () => {
  const { calcAllUnrealised } = sandbox(['_wheelMarkOf', 'calcAllUnrealised']);
  const wheels = [{ id: 'w1', status: 'open', ticker: 'SOFI' }, { id: 'w2', status: 'open', ticker: 'GX' }];
  const trades = [
    { id: 'p', wheelId: 'w1', ticker: 'SOFI', action: 'CSP', entered: '2026-11-01', expiry: '2027-01-15', strike: 15, shares: 100, total: 100 },
    { id: 'i', wheelId: 'w2', ticker: 'GX', action: 'IN', entered: '2026-11-02', shares: 100, total: 1500 },
  ];
  const u = calcAllUnrealised(wheels, trades, () => null, [], () => null);
  assert.strictEqual(u.unpriced, 2);
  assert.strictEqual(u.value, 0);
  assert.ok(extractFn('renderHome').includes('un.unpriced>0') && extractFn('renderHome').includes('unpriced'));
});

test('partial 1-of-5 losing buy-back in calcWinLoss', () => {
  const { calcWinLoss } = sandbox(['calcWinLoss'], 'var db={wheels:[{id:"w",status:"open",ticker:"X"}],trades:[{id:"s",wheelId:"w",action:"CSP",entered:"2026-10-01",expiry:"2027-11-20",strike:50,shares:500,total:500},{id:"b",wheelId:"w",action:"BTC",entered:"2026-10-15",expiry:"2027-11-20",strike:50,shares:100,total:120}],opts:[]};');
  const wl = calcWinLoss();
  assert.strictEqual(wl.wins, 0);
  assert.strictEqual(wl.losses, 1);
  assert.strictEqual(wl.openOpts, 1);
  assert.strictEqual(wl.avgLoss, 20);
  assert.strictEqual(wl.wr, '0.0');
});

test('homeFigures month/year totals agree with options measure and realisedDaily', () => {
  const names = ['walkLegPairs', 'realisedPremium', 'shareRealisations', 'optsMonthly', 'homeFigures', 'calcMonthlyRealised', 'monthlyExtraSources', 'calcMonthlyForMeasure', 'realisedDaily', 'pnlDailyForMeasure', 'mergePnlDaily', 'sharesLeapsDaily'];
  const S = sandbox(names);
  const TODAY = '2026-10-27';
  const legs = [
    { id: 'L1', status: 'closed', side: 'long', type: 'C', underlying: 'TSLA', strike: 200, expiry: '2027-01-15', qty: 1, entryPrice: 50, entryDate: '2025-01-02', closePrice: 149.4176, closeDate: '2026-10-05', fees: 0, closeFees: 0 },
    { id: 'C1', status: 'closed', side: 'short', type: 'C', underlying: 'TSLA', strike: 450, expiry: '2026-10-16', qty: 1, entryPrice: 3, entryDate: '2026-10-01', closePrice: 1, closeDate: '2026-10-10', fees: 0, closeFees: 0 },
  ];
  const wheels = [{ id: 'w1', status: 'open', ticker: 'TSLA' }];
  const trades = [];
  const mrows = S.calcMonthlyRealised(trades, S.monthlyExtraSources(legs), TODAY);
  const H = S.homeFigures(mrows, TODAY);
  const optRows = S.calcMonthlyForMeasure('options', trades, legs, TODAY, wheels);
  const ym = TODAY.slice(0, 7);
  const mOpt = optRows.find(r => r.ym === ym) || { profit: 0, collected: 0, loss: 0 };
  assert.strictEqual(H.month.total, mOpt.profit);
  const yOpt = optRows.filter(r => r.ym.startsWith(TODAY.slice(0, 4))).reduce((a, r) => a + r.profit, 0);
  assert.strictEqual(H.year.total, Math.round(yOpt * 100) / 100);
  const daily = S.realisedDaily(trades, legs, TODAY, wheels);
  const octDaily = daily.filter(d => d.date.startsWith(ym)).reduce((a, d) => a + d.amount, 0);
  assert.strictEqual(Math.round(H.month.total * 100) / 100, Math.round(octDaily * 100) / 100);
  assert.ok(!String(H.month.total).includes('+0.00') || H.month.total === 0);
});

test('actReturnNote flags atCost shares, leapPlain LEAPs and unpriced short options', () => {
  const { actReturnNote, actAndList } = sandbox(['actAndList', 'actReturnNote']);
  const base = actReturnNote({ shareParts: [{ ticker: 'GX', value: 1 }], leapParts: [], shortParts: [], unpriced: [], atCost: [], leapPlain: 0 });
  assert.ok(base.includes("today's value"));
  const n = actReturnNote({ shareParts: [], leapParts: [], shortParts: [], unpriced: [{ ticker: 'KO', type: 'P' }], atCost: ['PEP'], leapPlain: 2 });
  assert.ok(/shares valued at cost for PEP/.test(n));
  assert.ok(/LEAPs are unmarked/.test(n));
  assert.ok(/unpriced short options excluded/.test(n));
});
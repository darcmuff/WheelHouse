// crossview-invariants.test.js — Audit Step 7: Home, the Monthly P&L table, More data and the Report
// all read the same OT_LEDGER figures, so they cannot disagree.
const test = require('node:test');
const assert = require('node:assert');
const { extractFn, LEDGER_SRC } = require('./extract');

const NAMES = [
  'shareRealisations', 'optsMonthly', 'monthlyExtraSources', 'calcMonthlyRealised', 'homeFigures',
  'realisedDaily', 'sharesLeapsDaily', 'mergePnlDaily', 'pnlDailyForMeasure', 'calcMonthlyForMeasure',
  'earliestTradeDate', 'calcProjectedYearly', 'calcWinLoss', 'moreLedgerStats',
  'returnBase', 'monthReturnPct', 'reportMoney', 'reportMonthName', 'reportLegKind', 'reportFigures', 'reportSentences',
  'reportLastYm', 'reportMonthEnd', 'reportYmInPeriod', 'reportDateInPeriod', 'reportPeriods', 'reportPeriodLine',
  'reportWinLossItems', 'reportClosedLegPnLs',
];
const sandbox = (db) => new Function('DB',
  LEDGER_SRC + '\n' + extractFn('optionsLib') + '\nconst OPTS=optionsLib();\nvar db=DB;\n' +
  NAMES.map(extractFn).join('\n') + '\nreturn {' + NAMES.join(',') + '};')(db);

const TODAY = '2026-11-20';
const YM = TODAY.slice(0, 7);
const T = (id, wheelId, ticker, action, entered, total, x = {}) => ({ id, wheelId, ticker, action, entered, total, shares: 100, ...x });
const fixture = () => ({
  wheels: [{ id: 'w1', ticker: 'SOFI', status: 'open' }, { id: 'w2', ticker: 'KO', status: 'closed' }],
  trades: [
    // November: a wheel CSP bought back for far more than it took in (-1,500)
    T('a', 'w1', 'SOFI', 'CSP', '2026-11-02', 500, { strike: 15, expiry: '2026-11-14', days: 12 }),
    T('b', 'w1', 'SOFI', 'BTC', '2026-11-10', 2000, { strike: 15, expiry: '2026-11-14' }),
    // October: an expired put (+120)
    T('c', 'w1', 'SOFI', 'CSP', '2026-10-01', 120, { strike: 14, expiry: '2026-10-17', expiredWorthless: true, days: 16 }),
    // KO: assigned put (+200), dividend, covered call called away (+150) with a share gain
    T('d', 'w2', 'KO', 'CSP', '2026-09-01', 200, { strike: 50, expiry: '2026-09-19', days: 18 }),
    T('e', 'w2', 'KO', 'IN', '2026-09-19', 5000, { strike: 50 }),
    T('f', 'w2', 'KO', 'DIV', '2026-09-25', 20, { shares: 0 }),
    T('g', 'w2', 'KO', 'STOC', '2026-09-22', 150, { strike: 52, expiry: '2026-10-03', days: 11 }),
    T('h', 'w2', 'KO', 'OUT', '2026-10-03', 5200, { strike: 52 }),
  ],
  opts: [
    // A closed LEAP that lost $300 — smaller than the wheel loss
    { id: 'L1', side: 'long', type: 'C', underlying: 'SOFI', strike: 10, qty: 1, entryPrice: 5, entryDate: '2026-03-02', expiry: '2028-01-21', status: 'closed', closePrice: 2, closeDate: '2026-11-05', fees: 0, closeFees: 0 },
    { id: 'C1', parentLeapId: 'L1', side: 'short', type: 'C', underlying: 'SOFI', strike: 20, qty: 1, entryPrice: 1, entryDate: '2026-10-01', expiry: '2026-10-17', status: 'expired', fees: 0, closeFees: 0 },
    { id: 'C2', parentLeapId: 'L1', side: 'short', type: 'C', underlying: 'SOFI', strike: 20, qty: 1, entryPrice: 0.8, entryDate: '2026-11-01', expiry: '2026-11-21', status: 'closed', closePrice: 0.3, closeDate: '2026-11-04', fees: 0, closeFees: 0 },
    // An open LEAP with one closed short call (+100 in November)
    { id: 'L2', side: 'long', type: 'C', underlying: 'SOFI', strike: 12, qty: 1, entryPrice: 4, entryDate: '2026-06-01', expiry: '2028-01-21', status: 'open', fees: 0, closeFees: 0 },
    { id: 'C3', parentLeapId: 'L2', side: 'short', type: 'C', underlying: 'SOFI', strike: 22, qty: 1, entryPrice: 1.2, entryDate: '2026-11-03', expiry: '2026-12-19', status: 'closed', closePrice: 0.2, closeDate: '2026-11-12', fees: 0, closeFees: 0 },
  ],
});

const views = (db) => {
  const S = sandbox(db);
  const legs = db.opts;
  const rows = S.calcMonthlyRealised(db.trades, S.monthlyExtraSources(legs), TODAY);
  const home = S.homeFigures(rows, TODAY);
  const homeChart = S.calcMonthlyForMeasure('options', db.trades, legs, TODAY, db.wheels);
  const more = S.moreLedgerStats('all', db.wheels, db.trades, legs, TODAY);
  const rs = { base: 'caw', target: 2 };
  const F = S.reportFigures(rows, TODAY, 20000, rs, S.reportClosedLegPnLs(legs, db.wheels, db.trades));
  const P = S.reportPeriods(rows, TODAY, S.reportWinLossItems(db.wheels, db.trades, legs));
  return { S, rows, home, homeChart, more, F, P, wl: S.calcWinLoss() };
};

test('Home.month === Monthly P&L table[this month] === More data month === Report.thisMonth', () => {
  const V = views(fixture());
  const tableRow = V.rows.find(r => r.ym === YM);
  const chartRow = V.homeChart.find(r => r.ym === YM);
  // -1,500 wheel CSP buyback + 50 + 100 PMCC calls
  assert.strictEqual(V.home.month.total, -1350);
  assert.strictEqual(tableRow.profit, V.home.month.total);
  assert.strictEqual(chartRow.profit, V.home.month.total);
  assert.strictEqual(V.more.month, V.home.month.total);
  assert.strictEqual(V.F.thisMonth, V.home.month.total);
  // Gross / buy-back columns stay: wheel CSP 500 in, 2,000 out; PMCC 80 + 120 in, 30 + 20 out
  assert.strictEqual(tableRow.collected, 700);
  assert.strictEqual(tableRow.loss, 2050);
  assert.strictEqual(tableRow.premium, -1500);
  // Every month, not just this one
  V.rows.forEach(r => {
    const c = V.homeChart.find(x => x.ym === r.ym) || { profit: 0 };
    assert.strictEqual(r.profit, c.profit, r.ym);
  });
});

test('Home.winRate === More data winRate === Report total win rate', () => {
  const V = views(fixture());
  const total = V.P.find(p => p.key === 'total');
  assert.strictEqual(V.wl.wins, 6);
  assert.strictEqual(V.wl.losses, 1);
  assert.strictEqual(V.wl.wr, '85.7');
  assert.strictEqual(V.more.wl.wr, V.wl.wr);
  assert.strictEqual(total.wr, V.wl.wr);
  assert.strictEqual(total.wins, V.wl.wins);
  assert.strictEqual(total.losses, V.wl.losses);
});

test('Report biggest losing closed option finds a wheel CSP loss worse than any LEAP loss', () => {
  const V = views(fixture());
  assert.ok(V.F.loser);
  assert.strictEqual(V.F.loser.realized, -1500);
  assert.strictEqual(V.F.loser.ticker, 'SOFI');
  assert.strictEqual(V.F.loser.side, 'short');
  assert.strictEqual(V.S.reportLegKind(V.F.loser), 'short put $15');
  assert.strictEqual(V.F.loser.date, '2026-11-10');
  const s = V.S.reportSentences(V.F).join(' ');
  assert.match(s, /biggest losing closed option is SOFI short put \$15/);
  assert.match(s, /-\$1,500\.00/);
  // With only the LEAP losing, the LEAP is still found
  const db = fixture();
  db.trades = db.trades.filter(t => t.id !== 'a' && t.id !== 'b');
  const W = views(db);
  assert.strictEqual(W.F.loser.realized, -300);
  assert.strictEqual(W.F.loser.side, 'long');
});

test('More data scope: All = Wheels + LEAPs & PMCC, and each scope only sees its own trades', () => {
  const db = fixture();
  const S = sandbox(db);
  const all = S.moreLedgerStats('all', db.wheels, db.trades, db.opts, TODAY);
  const wh = S.moreLedgerStats('wheel', db.wheels, db.trades, db.opts, TODAY);
  const pm = S.moreLedgerStats('pmcc', db.wheels, db.trades, db.opts, TODAY);
  assert.ok(wh.events.every(e => e.strategy === 'wheel'));
  assert.ok(pm.events.every(e => e.strategy === 'pmcc'));
  assert.strictEqual(all.events.length, wh.events.length + pm.events.length);
  assert.strictEqual(all.premium, Math.round((wh.premium + pm.premium) * 100) / 100);
  assert.strictEqual(all.realised, Math.round((wh.realised + pm.realised) * 100) / 100);
  assert.strictEqual(wh.premium, -1030); // -1500 + 120 + 200 + 150
  assert.strictEqual(pm.premium, 250);   // 100 + 50 + 100
  assert.strictEqual(pm.realised, -50);  // + the -300 LEAP
  assert.strictEqual(all.wl.wins + all.wl.losses, wh.wl.wins + wh.wl.losses + pm.wl.wins + pm.wl.losses);
  // Ticker leaderboard and scoreboard follow the scope
  assert.deepStrictEqual(wh.tickers.map(t => t.ticker).sort(), ['KO', 'SOFI']);
  assert.deepStrictEqual(pm.tickers.map(t => t.ticker), ['SOFI']);
  assert.deepStrictEqual(wh.board.map(r => r.kind), ['wheel', 'wheel']);
  assert.deepStrictEqual(pm.board.map(r => r.kind), ['leap', 'leap']);
  assert.strictEqual(pm.board.find(r => r.id === 'L1').realised, -150); // 100 + 50 - 300
  assert.strictEqual(pm.board.find(r => r.id === 'L1').legCount, 3);
  // DTE buckets only hold the scope's options
  assert.strictEqual(wh.dte.reduce((a, d) => a + d.count, 0), wh.inc.length);
  assert.strictEqual(pm.dte.reduce((a, d) => a + d.count, 0), pm.inc.length);
});

test('AROC is OT_LEDGER.weightedAROC, with Wheel and PMCC side by side', () => {
  const db = fixture();
  const S = sandbox(db);
  const all = S.moreLedgerStats('all', db.wheels, db.trades, db.opts, TODAY);
  const L = new Function(LEDGER_SRC + '\nreturn OT_LEDGER;')();
  assert.strictEqual(all.aroc.all, L.weightedAROC(all.inc));
  assert.strictEqual(all.aroc.wheel, L.weightedAROC(all.inc.filter(e => e.strategy === 'wheel')));
  assert.strictEqual(all.aroc.pmcc, L.weightedAROC(all.inc.filter(e => e.strategy === 'pmcc')));
  assert.notStrictEqual(all.aroc.wheel, all.aroc.pmcc);
  // Weighted, not a plain mean of per-trade AROCs
  const per = all.inc.map(e => L.weightedAROC([e])).filter(x => x != null);
  const plain = Math.round(per.reduce((a, b) => a + b, 0) / per.length * 100) / 100;
  assert.notStrictEqual(all.aroc.all, plain);
  // Open positions only: open wheel w1 and short calls on the open LEAP L2
  const open = all.inc.filter(e => (e.strategy === 'wheel' && e.wheelId === 'w1') || e.legId === 'C3');
  assert.strictEqual(all.arocOpen.all, L.weightedAROC(open));
  // More data and the delta table use it; the old unweighted averages are gone
  const analytics = extractFn('renderAnalytics');
  assert.doesNotMatch(analytics, /allAroc\.reduce|arocs\.reduce/);
  assert.match(analytics, /'AROC',scope==='all'\?'Wheel '\+pctS\(M\.aroc\.wheel\)\+' · PMCC '\+pctS\(M\.aroc\.pmcc\)/);
  assert.match(extractFn('renderStatsOverview'), /Wheel \$\{pctS\(M\.arocOpen\.wheel\)\} · PMCC \$\{pctS\(M\.arocOpen\.pmcc\)\}/);
  assert.match(extractFn('analyticsDeltaTable'), /OT_LEDGER\.weightedAROC/);
});

test('Sortino: downside deviation over every month against 0; — under 3 months', () => {
  const db = fixture();
  const S = sandbox(db);
  const L = new Function(LEDGER_SRC + '\nreturn OT_LEDGER;')();
  const all = S.moreLedgerStats('all', db.wheels, db.trades, db.opts, TODAY);
  // Sep +200, Oct +120+150+100, Nov -1350
  assert.deepStrictEqual(all.months.map(m => [m.ym, m.net]), [['2026-09', 200], ['2026-10', 370], ['2026-11', -1350]]);
  const nets = [200, 370, -1350];
  const avg = nets.reduce((a, b) => a + b, 0) / 3;
  const dd = Math.sqrt((1350 * 1350) / 3);
  assert.strictEqual(all.sortino, Math.round(avg / dd * 100) / 100);
  assert.strictEqual(all.sortino, L.calcSortino(nets));
  // Two months: no Sortino
  const two = fixture();
  two.trades = two.trades.filter(t => t.wheelId !== 'w2');
  two.opts = [];
  const t2 = S.moreLedgerStats('all', two.wheels, two.trades, two.opts, TODAY);
  assert.strictEqual(t2.months.length, 2);
  assert.strictEqual(t2.sortino, null);
  // A quiet month in between counts as a 0 month
  const gap = fixture();
  gap.trades = gap.trades.filter(t => t.wheelId !== 'w2');
  gap.opts = [];
  gap.trades.push(T('z', 'w1', 'SOFI', 'CSP', '2026-07-01', 90, { strike: 13, expiry: '2026-07-17', expiredWorthless: true }));
  const g = S.moreLedgerStats('all', gap.wheels, gap.trades, gap.opts, TODAY);
  assert.deepStrictEqual(g.months.map(m => m.net), [90, 0, 0, 120, -1500]);
  assert.strictEqual(g.sortino, L.calcSortino([90, 0, 0, 120, -1500]));
  const analytics = extractFn('renderAnalytics');
  assert.match(analytics, /M\.sortino==null\?'—'/);
  assert.doesNotMatch(analytics, /downsideReturns/);
});

test('More data scope toggle: All | Wheels | LEAPs & PMCC, persisted', () => {
  const overview = extractFn('renderStatsOverview');
  assert.match(overview, />All<\/button>/);
  assert.match(overview, /onclick="setMoreScope\('wheel'\)">Wheels<\/button>/);
  assert.match(overview, /onclick="setMoreScope\('pmcc'\)">LEAPs &amp; PMCC<\/button>/);
  const store = {};
  const X = new Function('localStorage', extractFn('moreScope') + extractFn('setMoreScope') + '\nreturn {moreScope,setMoreScope};')({
    getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); },
  });
  assert.strictEqual(X.moreScope(), 'all');
  X.setMoreScope('pmcc');
  assert.strictEqual(X.moreScope(), 'pmcc');
  X.setMoreScope('bogus');
  assert.strictEqual(X.moreScope(), 'pmcc');
  X.setMoreScope('wheel');
  assert.strictEqual(X.moreScope(), 'wheel');
});

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

test('More data k1 per-day / per-week use the same total and days as k3 Projected Yearly, in every scope', () => {
  const overview = extractFn('renderStatsOverview');
  assert.match(overview, /const pyDay=py\.yearly!=null&&py\.days>0\?py\.total\/py\.days:null;/);
  assert.match(overview, /kpi\(scopeName\+'Realised P&L '\+new Date\(\)\.getFullYear\(\),fmtMoney\(py\.total\),pyDay!=null\?`\$\{fmtMoney\(pyDay\)\}\/day · \$\{fmtMoney\(pyDay\*7\)\}\/wk`/);
  assert.doesNotMatch(overview, /fmtMoney\(ytd\.net\)|ytd\.daily|ytd\.weekly/);
  const db = fixture();
  const S = sandbox(db);
  [[db.trades, db.opts], [db.trades, []], [[], db.opts]].forEach(([tr, lg]) => {
    const py = S.calcProjectedYearly(tr, lg, TODAY);
    const perDay = py.total / py.days;
    assert.strictEqual(Math.round(perDay * 365 * 100) / 100, Math.round(py.yearly * 100) / 100);
  });
});

test('Report wording: Option income and Total realised, same terms as Home and More data', () => {
  const V = views(fixture());
  const s = V.S.reportSentences(V.F).join(' ');
  assert.match(s, /Option income: -\$780\.00/);
  assert.match(s, /Option income this month so far: -\$1,350\.00/);
  assert.match(s, /Total realised: /);
  assert.doesNotMatch(s, /Options P&L|Short premium/);
  const total = V.P.find(p => p.key === 'total');
  assert.match(V.S.reportPeriodLine(total), /option income \(wheel [+-]\$[\d,.]+, PMCC calls \+\$250\.00\), [+-]\$[\d,.]+ total realised/);
});

test('Open LEAPs & short calls: each open LEAP with its open calls; closed legs and wheels left out', () => {
  const S = new Function(extractFn('optionsLib') + '\nconst OPTS=optionsLib();\n' + extractFn('openLeapPositions') + extractFn('moreRiskFigures') + '\nreturn {openLeapPositions,moreRiskFigures};')();
  const legs = fixture().opts.concat([
    { id: 'C4', parentLeapId: 'L2', side: 'short', type: 'C', underlying: 'SOFI', strike: 24, qty: 1, entryPrice: 0.9, entryDate: '2026-11-15', expiry: '2026-12-19', status: 'open', fees: 0.65, closeFees: 0, mark: 0.4 },
    { id: 'P9', side: 'short', type: 'P', underlying: 'KO', strike: 60, qty: 1, entryPrice: 1.1, entryDate: '2026-11-10', expiry: '2026-12-05', status: 'open', fees: 0, closeFees: 0 },
  ]);
  const P = S.openLeapPositions(legs, TODAY);
  assert.deepStrictEqual(P.leaps.map(r => r.id), ['L2']);           // L1 is closed
  assert.deepStrictEqual(P.leaps[0].shorts.map(r => r.id), ['C4']); // C3 is closed
  assert.strictEqual(P.leaps[0].cost, 400);
  assert.strictEqual(P.leaps[0].unrealised, null);                  // no mark: shown as "no mark"
  assert.strictEqual(P.leaps[0].shorts[0].unrealised, 49.35);       // 90 - 0.65 fees - 40 mark
  assert.strictEqual(P.leaps[0].shorts[0].dte, 29);
  assert.deepStrictEqual(P.other.map(r => r.id), ['P9']);           // short put with no LEAP
  assert.strictEqual(P.shortCount, 2);
  assert.strictEqual(P.cost, 400);
  const R = S.moreRiskFigures(fixture().trades.map(t => ({ ...t, fees: 1 })), legs);
  assert.strictEqual(R.peakCsp, 5000);
  assert.strictEqual(R.peakLeap, 500);
});

test('Risk & Exposure and Open Positions follow the scope; no unexplained wheel-only table in LEAPs & PMCC', () => {
  const overview = extractFn('renderStatsOverview');
  const analytics = extractFn('renderAnalytics');
  // Open Positions: wheel table hidden in pmcc scope, LEAP panel hidden in wheel scope, both in All
  assert.match(overview, /\$\{scope!=='pmcc'\?`<div class="d-panel">[\s\S]*?\$\{posHdr\}\$\{posRows\}[\s\S]*?`:''\}\s*\$\{scope!=='wheel'\?leapPanel:''\}/);
  assert.match(overview, /openLeapPositions\(db\.opts\|\|\[\],today\)/);
  assert.match(overview, /Open LEAPs &amp; Short Calls/);
  assert.match(overview, /No open LEAPs or short calls\./);
  assert.match(overview, /goToLeap\(/);
  // Risk: every tile branches on scope
  assert.match(analytics, /moreRiskFigures\(db\.trades,db\.opts\|\|\[\]\)/);
  assert.match(analytics, /stat\(fmtMoney\(c\.wheel\),'Current Exposure','Puts '/);
  assert.match(analytics, /stat\(fmtMoney\(c\.leaps\),'Current Exposure'/);
  assert.match(analytics, /scope==='pmcc'\?'highest single LEAP'/);
  assert.match(analytics, /const feeAmt=M\.fees;/);
  assert.match(analytics, /'Open Short Calls'/);
  assert.doesNotMatch(analytics, /cap\.totalFees|cap\.maxCap/);
});

test('Closed-trade tooltips say closed trades, net of buybacks — not gross credits opened', () => {
  const analytics = extractFn('renderAnalytics');
  const overview = extractFn('renderStatsOverview');
  const tip = (src, label) => { const m = src.match(new RegExp("'" + label + "'[^\\n]*")); assert.ok(m, label); return m[0]; };
  assert.match(tip(analytics, 'Total Option-Days'), /Closed trades only/);
  assert.match(tip(analytics, 'Avg Trade P&L'), /Closed trades, net of buybacks/);
  assert.match(tip(analytics, 'Best Single Trade'), /Closed trades, net of buybacks/);
  assert.match(analytics, /const stratTip='Closed trades, net of buybacks/);
  assert.match(analytics, /\$\{title\} \$\{ii\(stratTip\)\}/);
  const k2 = overview.slice(overview.indexOf('const k2Tip='), overview.indexOf('const k2=kpi('));
  assert.strictEqual((k2.match(/Closed trades, net of buybacks/g) || []).length, 3);
  assert.doesNotMatch(analytics, /before any buyback/);
  // Avg Trade P&L value is net too: option income ÷ closed trades
  assert.match(extractFn('moreLedgerStats'), /avgLeg:inc\.length\?S\.total\/inc\.length:0/);
});

test('Avg Trade P&L: renamed from Avg Leg Size; net option income per closed trade', () => {
  const analytics = extractFn('renderAnalytics');
  assert.doesNotMatch(analytics, /Avg Leg Size/);
  assert.match(analytics, /stat\(fmtMoney\(avgTradeSize\),'Avg Trade P&L','per closed trade, net'/);
  const db = fixture();
  const S = sandbox(db);
  const all = S.moreLedgerStats('all', db.wheels, db.trades, db.opts, TODAY);
  // 7 closed sold options, -780 option income in total (the -1,500 buyback pulls it below zero; gross credits would say +$167)
  assert.strictEqual(all.inc.length, 7);
  assert.strictEqual(all.avgLeg, -780 / 7);
  assert.notStrictEqual(all.avgLeg, all.grossIn / 7);
});

test('Fee %: one ledger denominator (gross premium on closed trades in the scope) for All, Wheels and LEAPs & PMCC', () => {
  const analytics = extractFn('renderAnalytics');
  assert.match(analytics, /const feeBase=M\.grossIn;/);
  assert.doesNotMatch(analytics, /s\.premiumCredits|legCredits/);
  assert.match(analytics, /% of closed premium/);
  const db = fixture();
  // An open CSP and an open short call must not change any scope's denominator
  db.trades.push(T('o1', 'w1', 'SOFI', 'CSP', '2026-11-15', 999, { strike: 14, expiry: '2026-12-19' }));
  db.opts.push({ id: 'C9', parentLeapId: 'L2', side: 'short', type: 'C', underlying: 'SOFI', strike: 25, qty: 1, entryPrice: 7.77, entryDate: '2026-11-15', expiry: '2026-12-19', status: 'open', fees: 0, closeFees: 0 });
  const S = sandbox(db);
  const base = sc => S.moreLedgerStats(sc, db.wheels, db.trades, db.opts, TODAY).grossIn;
  assert.strictEqual(base('wheel'), 500 + 120 + 200 + 150);
  assert.strictEqual(base('pmcc'), 100 + 80 + 120);
  assert.strictEqual(base('all'), base('wheel') + base('pmcc'));
});

test('Total Fees and Fee %: closed scoped ledger events only; an open trade with fees moves neither, in any scope', () => {
  const analytics = extractFn('renderAnalytics');
  assert.match(analytics, /const feeAmt=M\.fees;/);
  assert.match(analytics, /const feeBase=M\.grossIn;/);
  assert.match(analytics, /'Total Fees',feePct\.toFixed\(1\)\+'% of closed premium','var\(--text2\)','Commissions and regulatory fees across closed trades'\)/);
  const withFees = () => {
    const db = fixture();
    const f = { a: 0.65, b: 0.65, c: 0.65, d: 0.65, e: 1, g: 0.65, h: 1 };
    db.trades.forEach(t => { if (f[t.id] != null) t.fees = f[t.id]; });
    db.opts.forEach(l => { l.fees = 0.65; if (l.status !== 'open') l.closeFees = l.status === 'closed' ? 0.65 : 0; });
    return db;
  };
  const figs = db => Object.fromEntries(['all', 'wheel', 'pmcc'].map(sc => {
    const M = sandbox(db).moreLedgerStats(sc, db.wheels, db.trades, db.opts, TODAY);
    return [sc, { fees: M.fees, pct: M.grossIn > 0 ? M.fees / M.grossIn * 100 : 0 }];
  }));
  const base = figs(withFees());
  // Wheel: CSP a + BTC b, CSP c, CSP d (assigned), STOC g (called away), shares: IN e + OUT h
  assert.strictEqual(base.wheel.fees, 5.25);
  // LEAPs & PMCC: closed L1 (0.65 + 0.65), C1 (0.65), C2 (1.30), C3 (1.30); open L2 not counted
  assert.strictEqual(base.pmcc.fees, 4.55);
  assert.strictEqual(base.all.fees, Math.round((base.wheel.fees + base.pmcc.fees) * 100) / 100);
  // Add an open wheel CSP and an open short call, both with fees
  const db = withFees();
  db.trades.push(T('o1', 'w1', 'SOFI', 'CSP', '2026-11-15', 999, { strike: 14, expiry: '2026-12-19', fees: 9.99 }));
  db.opts.push({ id: 'C9', parentLeapId: 'L2', side: 'short', type: 'C', underlying: 'SOFI', strike: 25, qty: 1, entryPrice: 7.77, entryDate: '2026-11-15', expiry: '2026-12-19', status: 'open', fees: 9.99, closeFees: 0 });
  assert.deepStrictEqual(figs(db), base);
});

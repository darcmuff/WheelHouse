const{appSrc}=require('./appsrc');
const test = require('node:test');
const assert = require('node:assert');
const { extractFn, extractConst, withLedger } = require('./extract');
const W = [{ id: 'w1', status: 'open', ticker: 'PEP' }];

const S = new Function(withLedger(
  extractFn('optionsLib') + '\nconst OPTS=optionsLib();\n' +
  extractConst('PNL_RANGES') + extractConst('PNL_DEFAULT_GRAN') + extractConst('_iso') +
  ['walkLegPairs', 'realisedPremium', 'shareRealisations', 'realisedDaily', 'sharesLeapsDaily', 'mergePnlDaily', 'pnlDailyForMeasure', 'earliestTradeDate', 'calcProjectedYearly', 'optsMonthly', 'monthlyExtraSources', 'calcMonthlyRealised', 'homeFigures'].map(extractFn).join('\n') +
  '\nreturn {OPTS, calcProjectedYearly, pnlDailyForMeasure, earliestTradeDate, realisedDaily, sharesLeapsDaily, monthlyExtraSources, calcMonthlyRealised, homeFigures};'
))();

const TODAY = '2026-11-23';
const ytdSum = (rows, today = TODAY) =>
  (rows || []).filter(e => e.date >= today.slice(0, 4) + '-01-01' && e.date <= today)
    .reduce((a, e) => a + e.amount, 0);

const wheel = (action, entered, total, extra = {}) => ({
  wheelId: 'w1', ticker: 'PEP', action, entered, total, shares: extra.shares || 100, fees: 0, ...extra
});
const leg = (x) => ({
  underlying: 'AAPL', qty: 1, fees: 0, closeFees: 0, type: 'C', strike: 200, ...x
});

test('empty book returns yearly null', () => {
  const r = S.calcProjectedYearly([], [], TODAY);
  assert.deepStrictEqual(
    { total: r.total, days: r.days, yearly: r.yearly, since: r.since },
    { total: 0, days: 0, yearly: null, since: null }
  );
});

test('includes wheel premium, PMCC short-call profit, and closed long LEAPs or calls', () => {
  const trades = [
    wheel('CSP', '2026-07-05', 300, { expiry: '2026-07-24', expiredWorthless: true }),
    wheel('DIV', '2026-08-10', 20),
    wheel('IN', '2026-08-01', 14000, { shares: 100 }),
    wheel('OUT', '2026-09-15', 14500, { shares: 100 }),
  ];
  const closedLeap = leg({
    id: 'leap', side: 'long', strike: 10, expiry: '2027-12-17',
    entryPrice: 5, entryDate: '2026-07-05', status: 'closed',
    closePrice: 6, closeDate: '2026-10-14'
  });
  const shortCall = leg({
    id: 'c1', parentLeapId: 'leap', side: 'short', strike: 255, expiry: '2026-09-19',
    entryPrice: 1.2, entryDate: '2026-08-01', status: 'expired',
    closePrice: 0, closeDate: '2026-09-19'
  });
  const r = S.calcProjectedYearly(trades, [closedLeap, shortCall], TODAY);
  const all = ytdSum(S.pnlDailyForMeasure('all', trades, [closedLeap, shortCall], TODAY, W));
  assert.strictEqual(r.total, all);

  const withoutLeap = S.calcProjectedYearly(trades, [shortCall], TODAY);
  const leapPnL = S.OPTS.legPnL(closedLeap).realized;
  const shortPnL = S.OPTS.legPnL(shortCall).realized;
  assert.ok(leapPnL > 0, 'fixture long LEAP is a realised gain');
  assert.ok(shortPnL > 0, 'fixture short call is a realised gain');
  assert.ok(Math.abs((r.total - withoutLeap.total) - leapPnL) < 1e-9, 'closed long LEAP is in the total');
  const wheelOnly = ytdSum(S.pnlDailyForMeasure('wheel', trades, [closedLeap, shortCall], TODAY, W));
  assert.ok(r.total > wheelOnly, 'PMCC short calls and closed LEAPs add to wheel premium');
  const sharesOnly = ytdSum(S.pnlDailyForMeasure('shares', trades, [closedLeap, shortCall], TODAY, W));
  // shares measure includes share sales, dividends AND closed long LEAPs
  assert.ok(sharesOnly > 0);
  assert.ok(Math.abs(r.total - (wheelOnly + ytdSum(S.pnlDailyForMeasure('pmcc', trades, [closedLeap, shortCall], TODAY, W)) + sharesOnly)) < 1e-6);
});

test('mid-year first trade paces from that date, not 1 January', () => {
  const trades = [wheel('CSP', '2026-07-05', 300, { expiry: '2026-07-24', expiredWorthless: true })];
  const r = S.calcProjectedYearly(trades, [], TODAY);
  assert.strictEqual(S.earliestTradeDate(trades, []), '2026-07-05');
  assert.strictEqual(r.since, '2026-07-05');
  assert.strictEqual(r.startedMidYear, true);
  assert.strictEqual(r.days, 142); // 5 Jul through 23 Nov 2026 inclusive
  assert.ok(Math.abs(r.yearly - (r.total / 142) * 365) < 1e-9);
  assert.notStrictEqual(r.days, 327);
});

test('prior-year first trade paces from 1 January of this year', () => {
  const trades = [
    wheel('CSP', '2025-06-01', 200, { expiry: '2025-06-20', expiredWorthless: true }),
    wheel('CSP', '2026-02-10', 400, { expiry: '2026-02-27', expiredWorthless: true }),
  ];
  const r = S.calcProjectedYearly(trades, [], TODAY);
  assert.strictEqual(S.earliestTradeDate(trades, []), '2025-06-01');
  assert.strictEqual(r.since, '2026-01-01');
  assert.strictEqual(r.startedMidYear, false);
  assert.strictEqual(r.days, 327); // 1 Jan through 23 Nov 2026 inclusive
  assert.ok(Math.abs(r.yearly - (r.total / 327) * 365) < 1e-9);
  // prior-year premium is excluded from the YTD total
  assert.strictEqual(r.total, 400);
});

test('open options and open long LEAP cost are excluded', () => {
  const trades = [
    wheel('CSP', '2026-07-05', 300, { expiry: '2026-07-24', expiredWorthless: true }),
    wheel('CSP', '2026-11-20', 1000, { expiry: '2026-12-18' }), // still open
  ];
  const openLeap = leg({
    id: 'openLeap', side: 'long', strike: 200, expiry: '2027-12-17',
    entryPrice: 50, entryDate: '2026-07-05', status: 'open'
  });
  const openShort = leg({
    id: 'openShort', parentLeapId: 'openLeap', side: 'short', strike: 255, expiry: '2026-12-18',
    entryPrice: 2.3, entryDate: '2026-11-10', status: 'open'
  });
  const r = S.calcProjectedYearly(trades, [openLeap, openShort], TODAY);
  assert.strictEqual(r.total, 300);
  assert.ok(S.OPTS.legPnL(openLeap).costBasis > 0);
  assert.notStrictEqual(r.total, r.total + S.OPTS.legPnL(openLeap).costBasis);
});

test('More data KPI and Annualised Projection both use calcProjectedYearly, not calcYTD yearly', () => {
  const H = appSrc();
  const start = H.indexOf('function renderStatsOverview(');
  const mid = H.indexOf('function renderAnalytics(');
  const overview = H.slice(start, mid);
  const analytics = H.slice(mid, H.indexOf('\nfunction ', mid + 1) > 0 ? H.indexOf('\nfunction ', mid + 10) : mid + 40000);
  assert.ok(overview.includes("kpi('Projected Yearly',py.yearly!=null?fmtMoney(py.yearly):'—'"));
  assert.ok(overview.includes('fmtDayMon(py.since)'));
  assert.ok(!overview.includes('fmtMoney(ytd.yearly)'));
  assert.ok(analytics.includes("stat(py.yearly!=null?fmtMoney(py.yearly):'—','Annualised Projection'"));
  assert.ok(!analytics.includes('fmtMoney(ytd.yearly)'));
  // Audit Step 7 (approved): k1 uses the same total and days as k3 in every scope, not calcYTD's days since 1 Jan
  assert.ok(overview.includes("kpi(scopeName+'Realised P&L '+new Date().getFullYear(),fmtMoney(py.total)"));
  assert.ok(overview.includes('const pyDay=py.yearly!=null&&py.days>0?py.total/py.days:null;'));
  assert.ok(!overview.includes('fmtMoney(ytd.net)'));
  assert.ok(overview.includes("setMoreScope('all')") && overview.includes("setMoreScope('wheel')"));
  assert.ok(analytics.includes("scope==='wheel'?[]:(db.opts||[])"));
});

test('All-mode month premium matches homeFigures (wheel + PMCC); wheel-only is just the wheel slice', () => {
  const trades = [
    wheel('CSP', '2026-11-02', 300, { expiry: '2026-11-20', expiredWorthless: true }),
    wheel('CSP', '2026-10-05', 200, { expiry: '2026-10-16', expiredWorthless: true }),
    wheel('DIV', '2026-11-10', 20),
    wheel('IN', '2026-08-01', 14000, { shares: 100 }),
    wheel('OUT', '2026-11-12', 14500, { shares: 100 }),
  ];
  const closedLeap = leg({
    id: 'leap', side: 'long', strike: 10, expiry: '2027-12-17',
    entryPrice: 5, entryDate: '2026-07-05', status: 'closed',
    closePrice: 6, closeDate: '2026-11-14'
  });
  const shortCall = leg({
    id: 'c1', parentLeapId: 'leap', side: 'short', strike: 255, expiry: '2026-11-19',
    entryPrice: 1.2, entryDate: '2026-11-01', status: 'expired',
    closePrice: 0, closeDate: '2026-11-19'
  });
  const rows = S.calcMonthlyRealised(trades, S.monthlyExtraSources([closedLeap, shortCall]), TODAY);
  const F = S.homeFigures(rows, TODAY);
  assert.ok(Math.abs(F.month.total - (F.month.wheel + F.month.pmcc)) < 1e-9);
  assert.ok(F.month.pmcc > 0, 'PMCC short-call premium is in the All month total');
  assert.ok(F.month.wheel > 0, 'wheel premium is in the All month total');
  assert.ok(F.month.total > F.month.wheel, 'All month premium is larger than wheel-only');
  // long LEAP close in November must not sit in collected-loss (All options premium)
  const leapPnL = S.OPTS.legPnL(closedLeap).realized;
  assert.ok(leapPnL > 0);
  assert.ok(Math.abs(F.month.total - (F.month.wheel + leapPnL) - F.month.pmcc) > 1e-6 || F.month.total !== F.month.wheel + leapPnL);
  assert.ok(Math.abs(F.month.total - (F.month.wheel + F.month.pmcc + leapPnL)) > 1e-6, 'closed long LEAP is not in month option premium');
  // dividends and share sales are not in homeFigures month total
  assert.notStrictEqual(F.month.total, F.month.wheel + F.month.pmcc + 20 + 500);
});

test('calcProjectedYearly with no legs is wheel-only; with legs includes all options', () => {
  const trades = [
    wheel('CSP', '2026-07-05', 300, { expiry: '2026-07-24', expiredWorthless: true }),
    wheel('DIV', '2026-08-10', 20),
  ];
  const closedLeap = leg({
    id: 'leap', side: 'long', strike: 10, expiry: '2027-12-17',
    entryPrice: 5, entryDate: '2026-07-05', status: 'closed',
    closePrice: 6, closeDate: '2026-10-14'
  });
  const shortCall = leg({
    id: 'c1', parentLeapId: 'leap', side: 'short', strike: 255, expiry: '2026-09-19',
    entryPrice: 1.2, entryDate: '2026-08-01', status: 'expired',
    closePrice: 0, closeDate: '2026-09-19'
  });
  const all = S.calcProjectedYearly(trades, [closedLeap, shortCall], TODAY);
  const wheelOnly = S.calcProjectedYearly(trades, [], TODAY);
  assert.ok(all.total > wheelOnly.total);
  const leapPnL = S.OPTS.legPnL(closedLeap).realized;
  const shortPnL = S.OPTS.legPnL(shortCall).realized;
  assert.ok(Math.abs(all.total - wheelOnly.total - leapPnL - shortPnL) < 1e-9);
  const allDaily = ytdSum(S.pnlDailyForMeasure('all', trades, [closedLeap, shortCall], TODAY, W));
  const wheelDaily = ytdSum(S.pnlDailyForMeasure('all', trades, [], TODAY, W));
  assert.strictEqual(all.total, allDaily);
  assert.strictEqual(wheelOnly.total, wheelDaily);
});

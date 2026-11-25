const test = require('node:test');
const assert = require('node:assert');
const { extractFn } = require('./extract');
test('P&L bar chart and Data health tile live on Home only', () => {
  const home = extractFn('renderHome'), stats = extractFn('renderStatsOverview') + extractFn('renderAnalytics');
  assert.ok(home.includes('id="pnl-curve"') && home.includes('pnlCurveHtml()') && home.includes('id="home-monthly"') && home.includes('renderMonthlyForMeasure(pnlMeasure)'));
  assert.ok(!home.includes('Data health ${ii(') && home.includes('Needs you ${ii(') && home.includes('Data issues'));
  assert.ok(!home.includes('Options P&amp;L by month'));
  assert.ok(!stats.includes('pnl-curve') && !stats.includes("kpi('Data health'"));
});
test('no Day/Week/Month toggle: granularity is automatic from the range', () => {
  const src = extractFn('pnlCurveHtml');
  assert.ok(!src.includes("'Day','Week','Month'") && !src.includes('setPnlGran'));
});

test('chart dropdown is Total Realised / All options / Wheel P&L / PMCC calls / Shares & LEAPs P&L, default All options', () => {
  const H = require('fs').readFileSync(require('path').join(__dirname, '..', 'app', 'index.html'), 'utf8');
  const load = extractFn('_loadPnlMeasure');
  const daily = extractFn('pnlDailyForMeasure');
  const html = extractFn('pnlCurveHtml');
  assert.ok(H.includes("['all','Total Realised']") && H.includes("['options','All options']") && H.includes("['wheel','Wheel P&L']") && H.includes("['pmcc','PMCC calls']") && H.includes("['shares','Shares & LEAPs P&L']"));
  assert.ok(!H.includes("['leaps','LEAPs P&L']") && !H.includes("['pnl','Options P&L']") && !H.includes("['premium','Premium collected']") && !H.includes("['closed','Closed P&L']"));
  assert.ok(!html.includes('a-chart-title') && html.includes('pc-measure') && html.includes('${ii('));
  assert.ok(daily.includes("realisedDaily(trades,[],today,wheels)") && daily.includes("realisedDaily([],legs||[],today,wheels)") && daily.includes("realisedDaily(trades,legs||[],today,wheels)"));
  assert.ok(daily.includes("sharesLeapsDaily(trades,legs||[],today,wheels)"));
  const sl = extractFn('sharesLeapsDaily');
  assert.ok(sl.includes("bucket==='asset'") && sl.includes('OT_LEDGER.buildLedger') && sl.includes('OT_LEDGER.groupEventsByPeriod'));
  assert.ok(!extractFn('shareRealisations').includes('sharesLeapsDaily') && !extractFn('optsMonthly').includes('sharesLeapsDaily') && !extractFn('calcMonthlyRealised').includes('sharesLeapsDaily'));
  assert.ok(extractFn('realisedDaily').includes('OT_LEDGER.buildLedger') && !extractFn('realisedDaily').includes('pnlMeasure') && !extractFn('realisedDaily').includes('pnlDailyForMeasure'));
  assert.ok(!extractFn('pnlBuckets').includes('pnlMeasure'));
  const css = H.match(/\.pc-measure\{[^}]+/)[0];
  assert.ok(css.includes('padding:0.1875rem 32px') && css.includes('background-position:right 12px') && css.includes('font-weight:480') && css.includes('border-radius:6px'));
  assert.ok(load.includes("return 'options'") && !load.includes("return 'all'"));
  assert.ok(extractFn('setPnlMeasure').includes("localStorage.setItem('optrack-pnl-measure'"));
});
test('Wheel and PMCC calls split the options series; All = options + shares/LEAPs series', () => {
  const { extractFn, extractConst, withLedger } = require('./extract');
  const wheels = [{ id: 'w1', status: 'open', ticker: 'PEP' }];
  const S = new Function(withLedger(
    extractFn('optionsLib') + '\nconst OPTS=optionsLib();\n' +
    extractConst('PNL_RANGES') + extractConst('PNL_DEFAULT_GRAN') + extractConst('_iso') +
    ['walkLegPairs','realisedPremium','shareRealisations','realisedDaily','_bucketKey','earliestTradeDate','pnlBuckets','sharesLeapsDaily','mergePnlDaily','pnlDailyForMeasure'].map(extractFn).join('\n') +
    '\nreturn {realisedDaily,sharesLeapsDaily,mergePnlDaily,earliestTradeDate,pnlBuckets,pnlDailyForMeasure};'
  ))();
  const today = '2026-11-22';
  const trades = [
    { id: 't1', wheelId: 'w1', ticker: 'PEP', action: 'STOC', entered: '2026-10-01', expiry: '2026-10-16', strike: 140, shares: 100, total: 240, fees: 1 },
    { id: 't2', wheelId: 'w1', ticker: 'PEP', action: 'CSP', entered: '2026-09-01', expiry: '2026-09-18', strike: 140, shares: 100, total: 200, fees: 1, expiredWorthless: true },
  ];
  const legs = [
    { id: 'c1', status: 'closed', side: 'short', type: 'C', underlying: 'AAPL', parentLeapId: 'L1', strike: 255, expiry: '2026-10-16', qty: 1, entryPrice: 3, entryDate: '2026-10-01', closePrice: 1, closeDate: '2026-10-10', fees: 0, closeFees: 0 },
  ];
  const all = S.pnlDailyForMeasure('all', trades, legs, today, wheels);
  const wheel = S.pnlDailyForMeasure('wheel', trades, legs, today, wheels);
  const leaps = S.pnlDailyForMeasure('pmcc', trades, legs, today, wheels);
  const sum = (rows, k) => Math.round(rows.reduce((a, r) => a + r[k], 0) * 100) / 100;
  assert.strictEqual(sum(wheel, 'amount') + sum(leaps, 'amount'), sum(all, 'amount'));
  assert.strictEqual(sum(wheel, 'gain') + sum(leaps, 'gain'), sum(all, 'gain'));
  assert.strictEqual(sum(wheel, 'loss') + sum(leaps, 'loss'), sum(all, 'loss'));
  const BA = S.pnlBuckets(all, 'All', null, today), BW = S.pnlBuckets(wheel, 'All', null, today), BL = S.pnlBuckets(leaps, 'All', null, today);
  assert.strictEqual(Math.round((BW.net + BL.net) * 100) / 100, BA.net);
  assert.deepStrictEqual(S.pnlDailyForMeasure('all', trades, legs, today, wheels), S.mergePnlDaily(S.realisedDaily(trades, legs, today, wheels), S.sharesLeapsDaily(trades, legs, today, wheels)));
  // All range starts at the earliest trade date, not the first realised event
  assert.strictEqual(S.earliestTradeDate(trades, legs), '2026-09-01');
  const BF = S.pnlBuckets(all, 'All', null, today, '2025-03-04');
  assert.strictEqual(BF.buckets[0].key.slice(0, 7), '2025-03');
  assert.strictEqual(BF.buckets[BF.buckets.length - 1].key.slice(0, 7), '2026-11');
});
test('Shares & LEAPs chart All-range net matches the Home table All-time figure', () => {
  const { extractFn, extractConst, withLedger } = require('./extract');
  const wheels = [{ id: 'w1', status: 'open', ticker: 'PEP' }];
  const S = new Function(withLedger(
    extractFn('optionsLib') + '\nconst OPTS=optionsLib();\n' +
    extractConst('PNL_RANGES') + extractConst('PNL_DEFAULT_GRAN') + extractConst('_iso') +
    ['walkLegPairs','realisedPremium','shareRealisations','optsMonthly','monthlyExtraSources','calcMonthlyRealised','realisedDaily','_bucketKey','pnlBuckets','sharesLeapsDaily','mergePnlDaily','pnlDailyForMeasure'].map(extractFn).join('\n') +
    '\nreturn {shareRealisations,monthlyExtraSources,calcMonthlyRealised,pnlBuckets,sharesLeapsDaily,pnlDailyForMeasure,realisedDaily};'
  ))();
  const today = '2026-11-22';
  const trades = [
    { id: 'in1', wheelId: 'w1', ticker: 'PEP', action: 'IN', entered: '2026-08-01', shares: 100, total: 14000 },
    { id: 'out1', wheelId: 'w1', ticker: 'PEP', action: 'OUT', entered: '2026-10-15', shares: 100, total: 14500 },
    { id: 'div1', wheelId: 'w1', ticker: 'PEP', action: 'DIV', entered: '2026-09-10', total: 40 },
    { id: 't1', wheelId: 'w1', ticker: 'PEP', action: 'STOC', entered: '2026-10-01', expiry: '2026-10-16', strike: 140, shares: 100, total: 240, fees: 1 },
  ];
  const legs = [
    { id: 'L1', status: 'closed', side: 'long', type: 'C', underlying: 'AAPL', strike: 200, expiry: '2027-01-15', qty: 1, entryPrice: 50, entryDate: '2025-01-02', closePrice: 60, closeDate: '2026-10-05', fees: 0, closeFees: 0 },
    { id: 'c1', status: 'closed', side: 'short', type: 'C', underlying: 'AAPL', parentLeapId: 'L1', strike: 255, expiry: '2026-10-16', qty: 1, entryPrice: 3, entryDate: '2026-10-01', closePrice: 1, closeDate: '2026-10-10', fees: 0, closeFees: 0 },
  ];
  const rows = S.calcMonthlyRealised(trades, S.monthlyExtraSources(legs), today);
  const tableNet = Math.round(rows.reduce((a, r) => a + (r.shares || 0) + (r.leapNet || 0) + (r.divs || 0), 0) * 100) / 100;
  const chart = S.pnlBuckets(S.pnlDailyForMeasure('shares', trades, legs, today, wheels), 'All', null, today);
  assert.strictEqual(chart.net, tableNet);
  // short PMCC calls must not land in this series (they belong to PMCC calls / All)
  const opts = S.realisedDaily(trades, legs, today, wheels);
  assert.notDeepStrictEqual(S.pnlDailyForMeasure('shares', trades, legs, today, wheels), opts);
  // All measure includes every trade type: options + shares/divs/LEAPs nets add up
  const net = rows => Math.round(rows.reduce((a, r) => a + r.amount, 0) * 100) / 100;
  const allNet = net(S.pnlDailyForMeasure('all', trades, legs, today, wheels));
  assert.strictEqual(allNet, Math.round((net(opts) + net(S.pnlDailyForMeasure('shares', trades, legs, today, wheels))) * 100) / 100);
});

test('P&L chart tip is one persistent element, pointer-events none, transform-positioned', () => {
  const H = require('fs').readFileSync(require('path').join(__dirname, '..', 'app', 'index.html'), 'utf8');
  const css = H.match(/\.pc-tip\{[^}]+/)[0];
  assert.ok(css.includes('pointer-events:none') && css.includes('transform:translate3d') && css.includes('transition:opacity'));
  assert.ok(!css.includes('display:none'));
  assert.ok(H.includes('id="pc-tip"') && !H.includes('onmousemove="pnlTip'));
  assert.ok(extractFn('pnlTipShow').includes('translate3d') && extractFn('pnlTipShow').includes('el.dataset.br'));
  assert.ok(extractFn('bindPnlTip').includes('pointerup') && extractFn('bindPnlTip').includes('pointerover'));
});
test('P&L chart tip shows only the selected measure: Total Realised is In and Out', () => {
  const { extractFn } = require('./extract');
  const S = new Function(
    extractFn('fmtMoney') + extractFn('pnlTipHtml') +
    '\nreturn {pnlTipHtml,fmtMoney};'
  )();
  const all = S.pnlTipHtml('all', 'October 2026', 1600, 400, 1200);
  assert.ok(all.includes('October 2026') && all.includes('In ') && all.includes('Out ') && all.includes('Net '));
  assert.ok(!all.includes('Premium collected') && !all.includes('Gains') && !all.includes('Wheel') && !all.includes('PMCC') && !all.includes('LEAP') && !all.includes('Shares') && !all.includes('dividend'));
  const wheel = S.pnlTipHtml('wheel', 'October 2026', 200, 50, 150);
  assert.ok(wheel.includes('Premium collected') && wheel.includes('Loss ') && !wheel.includes('In ') && !wheel.includes('Gains') && !wheel.includes('PMCC'));
  const pmcc = S.pnlTipHtml('pmcc', 'October 2026', 100, 20, 80);
  assert.ok(pmcc.includes('Premium collected') && pmcc.includes('Loss ') && !pmcc.includes('In ') && !pmcc.includes('LEAP') && !pmcc.includes('Shares'));
  const shares = S.pnlTipHtml('shares', 'October 2026', 500, 1200, -700);
  assert.ok(shares.includes('Gains') && shares.includes('Losses') && !shares.includes('In ') && !shares.includes('Premium collected') && !shares.includes('Wheel'));
});

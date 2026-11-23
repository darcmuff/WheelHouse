// report.test.js — display-only aggregation of already-computed monthly P&L. No formula changes.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { extractFn } = require('./extract');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
const brand = fs.readFileSync(path.join(__dirname, '..', 'app', 'brand.js'), 'utf8');

const stubs = `
function returnBase(rs,cawTotal){return rs&&rs.base==='account'&&rs.account>0?rs.account:(cawTotal||0);}
function monthReturnPct(profit,capital,target){
  if(!(capital>0))return null;
  const pct=(profit||0)/capital*100;return{pct,ok:target>0?pct>=target:null};
}
`;
const Fns = new Function(stubs + ['reportFigures','reportMoney','reportMonthName','reportLegKind','reportSentences','reportLastYm','reportMonthEnd','reportYmInPeriod','reportDateInPeriod','reportPeriods','reportPeriodLine'].map(extractFn).join('\n') +
  '\nreturn {reportFigures,reportMoney,reportMonthName,reportLegKind,reportSentences,reportLastYm,reportMonthEnd,reportYmInPeriod,reportDateInPeriod,reportPeriods,reportPeriodLine};')();

test('empty rows produce an empty report', () => {
  assert.deepStrictEqual(Fns.reportFigures([], '2026-11-23', 10000, {base:'caw',target:2}, []), {empty:true});
});

test('sums and averages fill the calendar span, including a quiet month', () => {
  const rows = [
    {ym:'2026-04', profit:200, leapNet:0},
    {ym:'2026-06', profit:100, leapNet:-50},
  ];
  const F = Fns.reportFigures(rows, '2026-06-15', 10000, {base:'caw',target:2}, []);
  assert.strictEqual(F.months, 3);
  assert.strictEqual(F.firstYm, '2026-04');
  assert.strictEqual(F.lastYm, '2026-06');
  assert.strictEqual(F.options, 250);
  assert.strictEqual(F.premium, 300);
  assert.strictEqual(F.optionsAvg, 83.33);
  assert.strictEqual(F.premiumAvg, 100);
  assert.strictEqual(F.completeMonths, 2);
  assert.strictEqual(F.optionsComplete, 200);
  assert.strictEqual(F.optionsCompleteAvg, 100);
  assert.strictEqual(F.premiumComplete, 200);
  assert.strictEqual(F.premiumCompleteAvg, 100);
  assert.strictEqual(F.best.ym, '2026-04');
  assert.strictEqual(F.best.options, 200);
  assert.strictEqual(F.worst.ym, '2026-05');
  assert.strictEqual(F.worst.options, 0);
});

test('return uses short-premium complete-month average against capital at work', () => {
  const rows = [
    {ym:'2026-04', profit:200, leapNet:-1000},
    {ym:'2026-05', profit:200, leapNet:0},
    {ym:'2026-06', profit:50, leapNet:0},
  ];
  const F = Fns.reportFigures(rows, '2026-06-15', 10000, {base:'caw',target:2}, []);
  // complete months Apr-May premium avg = 200; 200/10000 = 2%
  assert.strictEqual(F.premiumCompleteAvg, 200);
  assert.ok(F.ret);
  assert.strictEqual(+F.ret.pct.toFixed(4), 2);
  assert.strictEqual(F.ret.ok, true);
});

test('biggest losing closed option is subtracted from already-computed options P&L', () => {
  const rows = [
    {ym:'2026-04', profit:500, leapNet:-25849.62},
  ];
  const loser = {ticker:'ABCD', side:'long', type:'call', strike:200, date:'2026-04-10', realized:-25849.62};
  const F = Fns.reportFigures(rows, '2026-11-23', 0, {base:'caw',target:null}, [loser, {realized:-10, ticker:'X'}]);
  assert.strictEqual(F.options, -25349.62);
  assert.strictEqual(F.loser.ticker, 'ABCD');
  assert.strictEqual(F.optionsEx, 500);
});

test('sentences include period, averages, premium and months', () => {
  const rows = [
    {ym:'2026-04', profit:200, leapNet:0},
    {ym:'2026-05', profit:-20, leapNet:0},
  ];
  const F = Fns.reportFigures(rows, '2026-05-20', 10000, {base:'caw',target:2}, []);
  const s = Fns.reportSentences(F).join(' ');
  assert.match(s, /2 months, April 2026 to May 2026/);
  assert.match(s, /Realised options P&L, wheels and LEAPs/);
  assert.match(s, /Options P&L: \+\$180\.00/);
  assert.match(s, /Short premium alone came to/);
  assert.match(s, /Best month was April 2026/);
  assert.match(s, /Worst was May 2026/);
  assert.match(s, /capital at work/);
  assert.match(s, /2% target/);
});

test('report figures come from calcMonthlyRealised rows: LEAPs in options P&L, not in short premium', () => {
  const X = new Function(
    extractFn('optionsLib') + '\nconst OPTS=optionsLib();\n' +
    ['optsMonthly','monthlyExtraSources','calcMonthlyRealised','realisedPremium','shareRealisations','walkLegPairs','reportFigures','reportClosedLegPnLs'].map(extractFn).join('\n') +
    extractFn('returnBase') + extractFn('monthReturnPct') +
    '\nreturn {OPTS,monthlyExtraSources,calcMonthlyRealised,reportFigures,reportClosedLegPnLs};'
  )();
  const trades = [
    {wheelId:'w', action:'CSP', entered:'2026-04-01', expiry:'2026-04-17', total:200, shares:100, ticker:'SOFI'},
  ];
  const legs = [
    {id:'L', status:'closed', side:'long', type:'call', underlying:'ABCD', strike:200, qty:1, entryPrice:50, entryDate:'2025-06-01', closePrice:0, closeDate:'2026-05-02', fees:0, closeFees:0},
    {id:'C', status:'closed', side:'short', type:'call', underlying:'SOFI', strike:15, qty:1, entryPrice:1, entryDate:'2026-05-01', closePrice:0.4, closeDate:'2026-05-20', fees:0, closeFees:0},
  ];
  const today = '2026-05-25';
  const rows = X.calcMonthlyRealised(trades, X.monthlyExtraSources(legs), today);
  const closed = X.reportClosedLegPnLs(legs);
  const F = X.reportFigures(rows, today, 20000, {base:'caw',target:2}, closed);
  const leapLoss = X.OPTS.legPnL(legs[0]).realized;
  const shortP = X.OPTS.legPnL(legs[1]).realized;
  assert.ok(leapLoss < -4000, leapLoss);
  assert.strictEqual(F.premium, Math.round((200 + shortP)*100)/100);
  assert.strictEqual(F.options, Math.round((200 + shortP + leapLoss)*100)/100);
  assert.strictEqual(F.loser.ticker, 'ABCD');
  assert.strictEqual(F.optionsEx, F.premium);
  assert.strictEqual(F.months, 2);
  assert.strictEqual(F.completeMonths, 1);
});

test('paid feature, gate and GoatCounter path are wired, and no writes in report code', () => {
  assert.match(brand, /'report'/);
  assert.match(brand, /featureNames[\s\S]*'report':/);
  assert.match(SRC, /v==='report'&&!canUse\('report'\)/);
  assert.match(SRC, /otTrack\('\/report'\)/);
  assert.match(SRC, /Copy summary/);
  assert.match(SRC, /function renderReport\(/);
  assert.match(SRC, /Year to date/);
  assert.match(SRC, /Last month/);
  assert.match(SRC, /Last year/);
  assert.match(SRC, />Total</);
  assert.match(SRC, /Delta at open/);
  const body = ['reportFigures','reportClosedLegPnLs','reportSentences','renderReport','copyReport','reportPeriods','reportPeriodLine','reportWinLossItems','reportDeltaSoldItems','reportDeltaLeapItems','reportDeltaTable','reportDeltaSection'].map(extractFn).join('\n');
  assert.doesNotMatch(body, /_save|setDoc|deleteDoc|saveDB|fetch\(/);
});

test('period bounds: last month rolls over the year, month end is the last calendar day', () => {
  assert.strictEqual(Fns.reportLastYm('2026-11-23'), '2026-10');
  assert.strictEqual(Fns.reportLastYm('2026-01-15'), '2025-12');
  assert.strictEqual(Fns.reportMonthEnd('2026-10'), '2026-10-31');
  assert.strictEqual(Fns.reportMonthEnd('2026-02'), '2026-02-28');
  assert.strictEqual(Fns.reportMonthEnd('2024-02'), '2024-02-29');
  assert.ok(Fns.reportYmInPeriod('2026-01', 'ytd', '2026-11-23'));
  assert.ok(!Fns.reportYmInPeriod('2025-12', 'ytd', '2026-11-23'));
  assert.ok(Fns.reportYmInPeriod('2026-10', 'lastMonth', '2026-11-23'));
  assert.ok(!Fns.reportYmInPeriod('2026-11', 'lastMonth', '2026-11-23'));
  assert.ok(Fns.reportYmInPeriod('2025-12', 'lastYear', '2026-11-23'));
  assert.ok(!Fns.reportYmInPeriod('2026-01', 'lastYear', '2026-11-23'));
  assert.ok(Fns.reportDateInPeriod('2026-11-23', 'ytd', '2026-11-23'));
  assert.ok(!Fns.reportDateInPeriod('2026-11-24', 'ytd', '2026-11-23'));
  assert.ok(Fns.reportDateInPeriod('2026-10-31', 'lastMonth', '2026-11-23'));
  assert.ok(!Fns.reportDateInPeriod('2026-11-01', 'lastMonth', '2026-11-23'));
  assert.ok(Fns.reportDateInPeriod('2025-12-31', 'lastYear', '2026-11-23'));
  assert.ok(!Fns.reportDateInPeriod('2026-01-01', 'lastYear', '2026-11-23'));
});

test('YTD, last month, last year and Total bucket monthly rows; empty periods are zero', () => {
  const rows = [
    {ym:'2025-12', profit:80, leapNet:20, collected:80, premium:80},
    {ym:'2026-01', profit:50, leapNet:0, collected:50, premium:50},
    {ym:'2026-10', profit:100, leapNet:-10, collected:120, premium:100},
    {ym:'2026-11', profit:40, leapNet:0, collected:40, premium:40},
  ];
  const wins = [
    {date:'2025-12-10', win:true},
    {date:'2026-01-05', win:true},
    {date:'2026-10-02', win:true},
    {date:'2026-10-20', win:false},
    {date:'2026-11-04', win:true},
  ];
  const P = Fns.reportPeriods(rows, '2026-11-23', wins);
  const by = Object.fromEntries(P.map(p => [p.key, p]));
  assert.strictEqual(P.length, 4);
  assert.strictEqual(by.ytd.options, 180);
  assert.strictEqual(by.ytd.wheel, 190);
  assert.strictEqual(by.ytd.leaps, -10);
  assert.strictEqual(by.ytd.collected, 210);
  assert.strictEqual(by.ytd.closed, 4);
  assert.strictEqual(by.ytd.wins, 3);
  assert.strictEqual(by.ytd.losses, 1);
  assert.strictEqual(by.ytd.wr, '75.0');
  assert.strictEqual(by.lastMonth.options, 90);
  assert.strictEqual(by.lastMonth.collected, 120);
  assert.strictEqual(by.lastMonth.closed, 2);
  assert.strictEqual(by.lastMonth.wr, '50.0');
  assert.strictEqual(by.lastYear.options, 100);
  assert.strictEqual(by.lastYear.closed, 1);
  assert.strictEqual(by.lastYear.wr, '100.0');
  assert.strictEqual(by.total.options, 280);
  assert.strictEqual(by.total.collected, 290);
  assert.strictEqual(by.total.closed, 5);
  assert.strictEqual(by.total.options, by.ytd.options + by.lastYear.options);
  const F = Fns.reportFigures(rows, '2026-11-23', 10000, {base:'caw',target:2}, []);
  assert.strictEqual(by.total.options, F.options);
  P.forEach(p => assert.strictEqual(p.options, Math.round((p.wheel + p.leaps) * 100) / 100, p.key));
});

test('period wheel + LEAPs equals options P&L when covered-call premium is in profit', () => {
  const rows = [
    {ym:'2026-10', profit:2103.42, leapNet:-1201.30, collected:2243.46, premium:1374.72},
    {ym:'2026-11', profit:500, leapNet:0, collected:500, premium:400},
  ];
  const P = Fns.reportPeriods(rows, '2026-11-23', []);
  const by = Object.fromEntries(P.map(p => [p.key, p]));
  assert.strictEqual(by.lastMonth.options, 902.12);
  assert.strictEqual(by.lastMonth.wheel, 2103.42);
  assert.strictEqual(by.lastMonth.leaps, -1201.30);
  assert.strictEqual(by.total.options, 1402.12);
  P.forEach(p => assert.strictEqual(p.options, Math.round((p.wheel + p.leaps) * 100) / 100, p.key));
  assert.match(Fns.reportPeriodLine(by.lastMonth), /wheel \+\$2,103\.42, LEAPs -\$1,201\.30/);
});

test('a period with no trades is $0 and No closed trades, not blank', () => {
  const rows = [{ym:'2026-11', profit:25, leapNet:0, collected:25, premium:25}];
  const P = Fns.reportPeriods(rows, '2026-11-23', [{date:'2026-11-02', win:true}]);
  const lastYear = P.find(p => p.key === 'lastYear');
  const lastMonth = P.find(p => p.key === 'lastMonth');
  assert.strictEqual(lastYear.options, 0);
  assert.strictEqual(lastYear.collected, 0);
  assert.strictEqual(lastYear.closed, 0);
  assert.strictEqual(lastYear.wr, null);
  assert.strictEqual(Fns.reportPeriodLine(lastYear), 'Last year (2025): $0. No closed trades.');
  assert.match(Fns.reportPeriodLine(lastMonth), /Last month \(October 2026\): \$0\. No closed trades\./);
  const ytd = P.find(p => p.key === 'ytd');
  assert.match(Fns.reportPeriodLine(ytd), /Year to date: \+\$25\.00 options P&L \(wheel \+\$25\.00/);
  assert.match(Fns.reportPeriodLine(ytd), /1 closed trade, win rate 100\.0%/);
  assert.match(Fns.reportPeriodLine(ytd), /premium collected \+\$25\.00/);
  const none = Fns.reportPeriods([], '2026-11-23', []);
  none.forEach(p => assert.match(Fns.reportPeriodLine(p), /\$0\. No closed trades\./));
});

test('reportWinLossItems totals match calcWinLoss, and dates bucket into last month vs YTD', () => {
  const X = new Function(
    extractFn('optionsLib') + '\nconst OPTS=optionsLib();\n' +
    extractFn('calcWinLoss') + extractFn('reportWinLossItems') +
    '\nreturn {calcWinLoss,reportWinLossItems,set(db){this.db=db;}};'
  );
  // extractFn calcWinLoss reads db; build a sandbox with a mutable db
  const S = new Function(
    extractFn('optionsLib') + '\nconst OPTS=optionsLib();\nlet db={wheels:[],trades:[],opts:[]};\n' +
    extractFn('calcWinLoss') + '\n' + extractFn('reportWinLossItems') +
    '\nreturn {set(o){db.wheels=o.wheels||[];db.trades=o.trades||[];db.opts=o.opts||[];},calcWinLoss,items:()=>reportWinLossItems(db.wheels,db.trades,db.opts)};'
  )();
  const db = { wheels: [{ id: 'w', status: 'open' }], trades: [
    { wheelId: 'w', action: 'CSP', strike: 300, total: 500, entered: '2026-01-01', expiredWorthless: true, expiry: '2026-01-17' },
    { wheelId: 'w', action: 'CSP', strike: 290, total: 400, entered: '2026-10-01' },
    { wheelId: 'w', action: 'BTC', strike: 290, total: 600, entered: '2026-10-10' },
    { wheelId: 'w', action: 'CSP', strike: 280, total: 300, entered: '2026-11-01' },
    { wheelId: 'w', action: 'IN', entered: '2026-11-20' },
    { wheelId: 'w', action: 'STOC', strike: 320, total: 200, entered: '2026-11-22' },
  ], opts: [] };
  S.set(db);
  const wl = S.calcWinLoss();
  const items = S.items();
  assert.strictEqual(items.filter(i => i.win).length, wl.wins);
  assert.strictEqual(items.filter(i => !i.win).length, wl.losses);
  assert.strictEqual(wl.wins, 2); assert.strictEqual(wl.losses, 1);
  const P = Fns.reportPeriods([], '2026-11-23', items);
  const by = Object.fromEntries(P.map(p => [p.key, p]));
  assert.strictEqual(by.lastMonth.closed, 1);
  assert.strictEqual(by.lastMonth.wins, 0);
  assert.strictEqual(by.lastMonth.losses, 1);
  assert.strictEqual(by.ytd.closed, 3);
  assert.strictEqual(by.total.closed, 3);
  assert.strictEqual(by.lastYear.closed, 0);
});

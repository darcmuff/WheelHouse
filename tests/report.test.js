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
const Fns = new Function(stubs + ['reportFigures','reportMoney','reportMonthName','reportLegKind','reportSentences'].map(extractFn).join('\n') +
  '\nreturn {reportFigures,reportMoney,reportMonthName,reportLegKind,reportSentences};')();

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
  const body = ['reportFigures','reportClosedLegPnLs','reportSentences','renderReport','copyReport'].map(extractFn).join('\n');
  assert.doesNotMatch(body, /_save|setDoc|deleteDoc|saveDB|fetch\(/);
});

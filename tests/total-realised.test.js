// Total Realised (measure key 'all') is the full realised net from OT_LEDGER:
// All options + Shares & LEAPs P&L (shares, dividends and closed long LEAPs).
// There is no separate LEAPs chart view — closed LEAPs already live in Shares & LEAPs —
// so adding them again would double-count. All-time monthly sum must match Report's
// Total realised (reportFigures.realised) to the penny.
const test = require('node:test');
const assert = require('node:assert');
const { extractFn, extractConst, withLedger } = require('./extract');

const stubs = `
function returnBase(rs,cawTotal){return rs&&rs.base==='account'&&rs.account>0?rs.account:(cawTotal||0);}
function monthReturnPct(profit,capital,target){
  if(!(capital>0))return null;
  const pct=(profit||0)/capital*100;return{pct,ok:target>0?pct>=target:null};
}
`;

const S = new Function(withLedger(
  extractFn('optionsLib') + '\nconst OPTS=optionsLib();\n' +
  stubs +
  extractConst('PNL_RANGES') + extractConst('PNL_DEFAULT_GRAN') + extractConst('_iso') +
  ['walkLegPairs','realisedPremium','shareRealisations','optsMonthly','monthlyExtraSources','calcMonthlyRealised',
   'realisedDaily','_bucketKey','pnlBuckets','sharesLeapsDaily','mergePnlDaily','pnlDailyForMeasure','calcMonthlyForMeasure',
   'reportFigures'].map(extractFn).join('\n') +
  '\nreturn {OPTS,pnlDailyForMeasure,calcMonthlyForMeasure,calcMonthlyRealised,monthlyExtraSources,reportFigures};'
))();

const TODAY = '2026-11-22';
const W = [{ id: 'w1', status: 'open', ticker: 'PEP' }];
const trades = [
  { id: 'csp1', wheelId: 'w1', ticker: 'PEP', action: 'CSP', entered: '2026-01-05', expiry: '2026-01-30', strike: 50, shares: 100, total: 300, fees: 0, expiredWorthless: true },
  { id: 'in1', wheelId: 'w1', ticker: 'PEP', action: 'IN', entered: '2026-02-01', shares: 100, total: 5000 },
  { id: 'stoc1', wheelId: 'w1', ticker: 'PEP', action: 'STOC', entered: '2026-02-02', expiry: '2026-02-20', strike: 52, shares: 100, total: 250, fees: 0 },
  { id: 'btc1', wheelId: 'w1', ticker: 'PEP', action: 'BTC', entered: '2026-02-10', expiry: '2026-02-20', strike: 52, shares: 100, total: 400, fees: 0 },
  { id: 'out1', wheelId: 'w1', ticker: 'PEP', action: 'OUT', entered: '2026-10-15', shares: 100, total: 4800 },
  { id: 'div1', wheelId: 'w1', ticker: 'PEP', action: 'DIV', entered: '2026-09-10', total: 40 },
];
const legs = [
  { id: 'L1', status: 'closed', side: 'long', type: 'C', underlying: 'AAPL', strike: 200, expiry: '2027-01-15', qty: 1, entryPrice: 50, entryDate: '2025-01-02', closePrice: 40, closeDate: '2026-10-05', fees: 0, closeFees: 0 },
  { id: 'c1', status: 'closed', side: 'short', type: 'C', underlying: 'AAPL', parentLeapId: 'L1', strike: 255, expiry: '2026-10-16', qty: 1, entryPrice: 3, entryDate: '2026-10-01', closePrice: 1, closeDate: '2026-10-10', fees: 0, closeFees: 0 },
];

const rd = n => Math.round(n * 100) / 100;
const byYm = rows => Object.fromEntries((rows || []).map(r => [r.ym, r]));
const netOf = r => r ? (r.net != null ? r.net : rd((r.collected || 0) - (r.loss || 0))) : 0;

test('for every month Total Realised equals All options + Shares & LEAPs, and the all-time sum matches Report Total realised to the penny', () => {
  const total = S.calcMonthlyForMeasure('all', trades, legs, TODAY, W);
  const options = S.calcMonthlyForMeasure('options', trades, legs, TODAY, W);
  const shares = S.calcMonthlyForMeasure('shares', trades, legs, TODAY, W);
  const optM = byYm(options), shM = byYm(shares), trM = byYm(total);
  const months = [...new Set([...Object.keys(trM), ...Object.keys(optM), ...Object.keys(shM)])].sort();
  assert.ok(months.length > 0, 'fixture should produce monthly rows');
  months.forEach(ym => {
    const got = netOf(trM[ym]);
    const expected = rd(netOf(optM[ym]) + netOf(shM[ym]));
    assert.strictEqual(got, expected, ym + ' Total Realised should equal All options + Shares & LEAPs');
  });

  // Fixture covers the required buckets: wheel options, a PMCC short call, a closed share sale, and a closed LEAP
  const dailyAll = S.pnlDailyForMeasure('all', trades, legs, TODAY, W);
  const dailyOpt = S.pnlDailyForMeasure('options', trades, legs, TODAY, W);
  const dailySh = S.pnlDailyForMeasure('shares', trades, legs, TODAY, W);
  // Wheel CSP $300 is booked on the 2026-02-01 assignment (shares IN), buyback on 2026-02-10, PMCC call on 2026-10-10
  assert.ok(dailyOpt.some(d => d.date === '2026-02-01' && d.amount === 300), 'wheel CSP credit in All options');
  assert.ok(dailyOpt.some(d => d.date === '2026-02-10' && d.amount === -150), 'wheel call buyback in All options');
  assert.ok(dailyOpt.some(d => d.date === '2026-10-10' && d.amount === 200), 'PMCC short call close in All options');
  assert.ok(dailySh.some(d => d.date === '2026-10-15' && d.amount === -200), 'closed share sale in Shares & LEAPs');
  assert.ok(dailySh.some(d => d.date === '2026-10-05' && d.amount === -1000), 'closed long LEAP in Shares & LEAPs');
  assert.ok(dailyAll.some(d => d.date === '2026-10-15') && dailyAll.some(d => d.date === '2026-10-05') && dailyAll.some(d => d.date === '2026-10-10'));

  const rows = S.calcMonthlyRealised(trades, S.monthlyExtraSources(legs), TODAY);
  const F = S.reportFigures(rows, TODAY, 20000, { base: 'caw', target: 2 }, []);
  const trSum = rd(total.reduce((a, r) => a + netOf(r), 0));
  assert.strictEqual(trSum, F.realised, 'all-time Total Realised monthly sum must match reportFigures.realised');
});

const test = require('node:test');
const assert = require('node:assert');
const { extractFn, extractConst, withLedger } = require('./extract');
const W = [{ id: 'w1', status: 'open', ticker: 'PEP' }];

const S = new Function(withLedger(
  extractFn('optionsLib') + '\nconst OPTS=optionsLib();\n' +
  extractConst('PNL_RANGES') + extractConst('PNL_DEFAULT_GRAN') + extractConst('_iso') +
  ['walkLegPairs','realisedPremium','shareRealisations','optsMonthly','monthlyExtraSources','calcMonthlyRealised',
   'realisedDaily','_bucketKey','pnlBuckets','sharesLeapsDaily','mergePnlDaily','pnlDailyForMeasure','calcMonthlyForMeasure'].map(extractFn).join('\n') +
  '\nreturn {OPTS,realisedDaily,sharesLeapsDaily,mergePnlDaily,pnlDailyForMeasure,calcMonthlyForMeasure,pnlBuckets,monthlyExtraSources,calcMonthlyRealised};'
))();

const TODAY = '2026-11-22';
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

const sum = (rows, k) => Math.round(rows.reduce((a, r) => a + (r[k] || 0), 0) * 100) / 100;
const netOf = rows => Math.round(rows.reduce((a, r) => a + (r.amount != null ? r.amount : (r.gain || 0) - (r.loss || 0)), 0) * 100) / 100;
const MEASURES = ['all', 'options', 'wheel', 'pmcc', 'shares'];

test('All options equals wheel options + PMCC short calls and excludes shares, closed long LEAPs and dividends', () => {
  const options = S.pnlDailyForMeasure('options', trades, legs, TODAY, W);
  const wheel = S.pnlDailyForMeasure('wheel', trades, legs, TODAY, W);
  const pmcc = S.pnlDailyForMeasure('pmcc', trades, legs, TODAY, W);
  const shares = S.pnlDailyForMeasure('shares', trades, legs, TODAY, W);
  const all = S.pnlDailyForMeasure('all', trades, legs, TODAY, W);

  assert.deepStrictEqual(options, S.realisedDaily(trades, legs, TODAY, W));
  assert.strictEqual(sum(options, 'gain'), Math.round((sum(wheel, 'gain') + sum(pmcc, 'gain')) * 100) / 100);
  assert.strictEqual(sum(options, 'loss'), Math.round((sum(wheel, 'loss') + sum(pmcc, 'loss')) * 100) / 100);
  assert.strictEqual(netOf(options), Math.round((netOf(wheel) + netOf(pmcc)) * 100) / 100);

  // Shares / closed long LEAP / dividend are in the shares series, not All options
  assert.ok(shares.some(d => d.date === '2026-10-15')); // share sale
  assert.ok(shares.some(d => d.date === '2026-09-10')); // dividend
  assert.ok(shares.some(d => d.date === '2026-10-05')); // closed long LEAP
  assert.ok(!options.some(d => d.date === '2026-10-15'));
  assert.ok(!options.some(d => d.date === '2026-09-10'));
  assert.ok(!options.some(d => d.date === '2026-10-05'));
  assert.notStrictEqual(netOf(options), netOf(all));
  assert.strictEqual(netOf(all), Math.round((netOf(options) + netOf(shares)) * 100) / 100);

  // Previous Monthly P&L options rows (collected / loss / profit) match All options to the penny
  const oldRows = S.calcMonthlyRealised(trades, S.monthlyExtraSources(legs), TODAY);
  const optMonths = S.calcMonthlyForMeasure('options', trades, legs, TODAY, W).filter(r => r.collected || r.loss);
  optMonths.forEach(r => {
    const old = oldRows.find(x => x.ym === r.ym) || { collected: 0, loss: 0, profit: 0 };
    assert.strictEqual(r.collected, Math.round((old.collected || 0) * 100) / 100, r.ym + ' collected');
    assert.strictEqual(r.loss, Math.round((old.loss || 0) * 100) / 100, r.ym + ' loss');
    assert.strictEqual(r.net, Math.round((old.profit || 0) * 100) / 100, r.ym + ' net');
  });
});

test('for every measure, monthly table collected/gains, loss and net match the chart month bars to the penny', () => {
  MEASURES.forEach(measure => {
    const rows = S.calcMonthlyForMeasure(measure, trades, legs, TODAY, W).filter(r => r.collected || r.loss);
    const bars = S.pnlBuckets(S.pnlDailyForMeasure(measure, trades, legs, TODAY, W), 'All', 'Month', TODAY);
    rows.forEach(r => {
      const bar = bars.buckets.find(b => b.key === r.ym + '-01');
      assert.ok(bar, measure + ' missing bar for ' + r.ym);
      assert.strictEqual(r.collected, bar.gain, measure + ' ' + r.ym + ' collected/gains');
      assert.strictEqual(r.gain, bar.gain, measure + ' ' + r.ym + ' gain');
      assert.strictEqual(r.loss, bar.loss, measure + ' ' + r.ym + ' loss');
      assert.strictEqual(r.net, bar.net, measure + ' ' + r.ym + ' net');
      assert.strictEqual(r.profit, bar.net, measure + ' ' + r.ym + ' profit');
    });
    // Every non-zero chart month is in the table; empty padding months are not required
    bars.buckets.filter(b => b.gain || b.loss).forEach(bar => {
      const ym = bar.key.slice(0, 7);
      const r = rows.find(x => x.ym === ym);
      assert.ok(r, measure + ' missing table row for ' + ym);
      assert.strictEqual(r.collected, bar.gain);
      assert.strictEqual(r.loss, bar.loss);
      assert.strictEqual(r.net, bar.net);
    });
  });
});

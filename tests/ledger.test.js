const test = require('node:test');
const assert = require('node:assert/strict');
const Ledger = require('../app/ledger.js');

const W = (id, status, ticker) => ({ id, status: status || 'open', ticker: ticker || 'X' });

test('1. same-day close: amount 80, daysHeld 1, capital 2000, weightedAROC 1460%', () => {
  const day = '2026-06-01';
  const tr = [
    { id: 'a', wheelId: 'w1', ticker: 'X', action: 'CSP', entered: day, expiry: day, strike: 20, shares: 100, premium: 1, total: 100 },
    { id: 'b', wheelId: 'w1', ticker: 'X', action: 'BTC', entered: day, strike: 20, shares: 100, premium: 0.2, total: 20 }
  ];
  const r = Ledger.buildLedger([W('w1', 'closed')], tr, [], { today: day });
  const inc = r.events.filter(e => e.bucket === 'income');
  assert.strictEqual(inc.length, 1);
  const e = inc[0];
  assert.ok(Math.abs(e.amount - 80) < 0.01);
  assert.strictEqual(e.daysHeld, 1);
  assert.strictEqual(e.capital, 2000);
  assert.ok(Math.abs(Ledger.weightedAROC([e]) - 1460) < 0.05);
});

test('2. full 45-day wheel with roll: income $180, shares $100, total $280', () => {
  const tr = [
    { id: '1', wheelId: 'w2', ticker: 'X', action: 'CSP', entered: '2026-01-01', expiry: '2026-01-16', strike: 20, shares: 100, premium: 0.8, total: 80 },
    { id: '2', wheelId: 'w2', ticker: 'X', action: 'BTC', entered: '2026-01-10', expiry: '2026-01-16', strike: 20, shares: 100, premium: 0.4, total: 40, rollId: 'r' },
    { id: '3', wheelId: 'w2', ticker: 'X', action: 'CSP', entered: '2026-01-10', expiry: '2026-01-23', strike: 20, shares: 100, premium: 0.8, total: 80, rollId: 'r' },
    { id: '4', wheelId: 'w2', ticker: 'X', action: 'IN', entered: '2026-01-23', strike: 20, shares: 100, total: 2000 },
    { id: '5', wheelId: 'w2', ticker: 'X', action: 'STOC', entered: '2026-01-26', expiry: '2026-02-15', strike: 21, shares: 100, premium: 0.6, total: 60 },
    { id: '6', wheelId: 'w2', ticker: 'X', action: 'OUT', entered: '2026-02-15', strike: 21, shares: 100, total: 2100 }
  ];
  const r = Ledger.buildLedger([W('w2', 'closed')], tr, [], { today: '2026-02-20' });
  const income = r.events.filter(e => e.bucket === 'income').reduce((a, e) => a + e.amount, 0);
  const shares = r.events.filter(e => e.kind === 'shares').reduce((a, e) => a + e.amount, 0);
  assert.ok(Math.abs(income - 180) < 0.01, `income ${income}`);
  assert.ok(Math.abs(shares - 100) < 0.01, `shares ${shares}`);
  assert.ok(Math.abs(income + shares - 280) < 0.01);
});

test('3. defensive debit roll: -$150 loss, open CSP collateral and unrealised', () => {
  const tr = [
    { id: 'c1', wheelId: 'w3', ticker: 'X', action: 'CSP', entered: '2026-04-01', expiry: '2026-04-17', strike: 20, shares: 100, premium: 1, total: 100 },
    { id: 'b1', wheelId: 'w3', ticker: 'X', action: 'BTC', entered: '2026-04-10', expiry: '2026-04-17', strike: 20, shares: 100, premium: 2.5, total: 250 },
    { id: 'c2', wheelId: 'w3', ticker: 'X', action: 'CSP', entered: '2026-04-10', expiry: '2026-05-15', strike: 18, shares: 100, premium: 2, total: 200 }
  ];
  const today = '2026-04-15';
  const r = Ledger.buildLedger([W('w3', 'open')], tr, [], {
    today,
    wheelMarkOf: t => (t.strike === 18 ? 3.5 : null)
  });
  const loss = r.events.find(e => e.amount < 0 && e.kind === 'csp');
  assert.ok(loss, 'loss event');
  assert.ok(Math.abs(loss.amount + 150) < 0.01, `amount ${loss.amount}`);
  assert.strictEqual(loss.isWin, false);
  const openCsp = r.open.find(o => o.kind === 'csp' && o.legId === 'c2');
  assert.ok(openCsp);
  assert.strictEqual(openCsp.capitalAtRisk, 1800);
  assert.ok(Math.abs(openCsp.unrealised + 150) < 0.01, `unrealised ${openCsp.unrealised}`);
  const r0 = Ledger.buildLedger([W('w3', 'open')], tr, [], { today, wheelMarkOf: () => null });
  assert.strictEqual(r0.open.find(o => o.legId === 'c2').unrealised, null);
  assert.strictEqual(r0.unpricedCount, 1);
});

test('4. partial 1-of-5 losing buy-back leaves 4 open', () => {
  const tr = [
    { id: 'c', wheelId: 'w4', ticker: 'X', action: 'CSP', entered: '2026-05-01', expiry: '2026-06-01', strike: 10, shares: 500, premium: 1, total: 500 },
    { id: 'b', wheelId: 'w4', ticker: 'X', action: 'BTC', entered: '2026-05-10', expiry: '2026-06-01', strike: 10, shares: 100, premium: 1.2, total: 120 }
  ];
  const r = Ledger.buildLedger([W('w4', 'open')], tr, [], { today: '2026-05-15' });
  const losses = r.events.filter(e => e.bucket === 'income' && e.amount < 0);
  assert.strictEqual(losses.length, 1);
  assert.ok(Math.abs(losses[0].amount + 20) < 0.01);
  assert.strictEqual(losses[0].isWin, false);
  const openLeg = r.open.find(o => o.kind === 'csp');
  assert.ok(openLeg);
  assert.strictEqual(openLeg.capitalAtRisk, 10 * 400);
});

test('5. open-market IN does not close CSP', () => {
  const tr = [
    { id: 'in', wheelId: 'w5', ticker: 'X', action: 'IN', entered: '2026-03-01', openMarket: true, shares: 100, total: 5000 },
    { id: 'c', wheelId: 'w5', ticker: 'X', action: 'CSP', entered: '2026-03-02', expiry: '2026-04-01', strike: 50, shares: 100, premium: 1, total: 100 }
  ];
  const r = Ledger.buildLedger([W('w5', 'open')], tr, [], { today: '2026-03-10' });
  assert.strictEqual(r.events.filter(e => e.bucket === 'income').length, 0);
  const csp = r.open.find(o => o.kind === 'csp');
  assert.ok(csp);
  assert.strictEqual(csp.capitalAtRisk, 5000);
});

test('6. paired STC on wheel short equals BTC debit', () => {
  const mk = act => [
    { id: 'cc', wheelId: 'w6', ticker: 'X', action: 'STOC', entered: '2026-10-01', expiry: '2026-10-17', strike: 50, shares: 100, premium: 1, total: 100 },
    { id: 'cl', wheelId: 'w6', ticker: 'X', action: act, entered: '2026-10-10', expiry: '2026-10-17', strike: 50, shares: 100, premium: 0.4, total: 40 }
  ];
  const a = Ledger.buildLedger([W('w6', 'closed')], mk('STC'), [], { today: '2026-11-01' }).events
    .filter(e => e.bucket === 'income').map(e => e.amount).sort((x, y) => x - y);
  const b = Ledger.buildLedger([W('w6', 'closed')], mk('BTC'), [], { today: '2026-11-01' }).events
    .filter(e => e.bucket === 'income').map(e => e.amount).sort((x, y) => x - y);
  assert.deepStrictEqual(a, b);
});

test('7. wheel vs pmcc buckets and PMCC short call capital for AROC', () => {
  const tr = [{ id: 'c', wheelId: 'w7', ticker: 'X', action: 'CSP', entered: '2026-01-01', expiry: '2026-02-01', strike: 20, shares: 100, premium: 1, total: 100 }];
  const parent = { id: 'leap', underlying: 'X', side: 'long', type: 'C', status: 'open', strike: 15, expiry: '2027-01-01', qty: 1, entryPrice: 10, entryDate: '2026-01-01', fees: 0 };
  const short = {
    id: 'pmcc', underlying: 'X', side: 'short', type: 'C', status: 'closed', strike: 20, expiry: '2026-02-01', qty: 1,
    entryPrice: 0.5, entryDate: '2026-01-05', closePrice: 0.2, closeDate: '2026-01-20', fees: 0, closeFees: 0,
    parentLeapId: 'leap'
  };
  const r = Ledger.buildLedger([W('w7', 'open')], tr, [parent, short], { today: '2026-06-01' });
  assert.ok(r.events.some(e => e.strategy === 'wheel' && e.bucket === 'income'));
  const pmccEv = r.events.find(e => e.strategy === 'pmcc' && e.kind === 'pmcc_call');
  assert.ok(pmccEv);
  assert.strictEqual(pmccEv.bucket, 'income');
  assert.ok(pmccEv.capital > 0);
  const aroc = Ledger.weightedAROC([pmccEv]);
  assert.ok(aroc != null && aroc > 0);
});

test('8. empty state', () => {
  const r = Ledger.buildLedger([], [], [], {});
  assert.deepStrictEqual(r.events, []);
  assert.deepStrictEqual(r.open, []);
  assert.strictEqual(r.unpricedCount, 0);
  const sum = Ledger.summarizeIncome([]);
  assert.strictEqual(sum.wr, null);
  assert.strictEqual(Ledger.weightedAROC([]), null);
  assert.strictEqual(Ledger.calcSortino([]), null);
});

test('9. Sortino: finite with 1 losing month of 4; null under 3 months', () => {
  assert.strictEqual(Ledger.calcSortino([-1, 1]), null);
  const s = Ledger.calcSortino([-1, 1, 1, 1]);
  assert.ok(Number.isFinite(s) && s !== Infinity);
  assert.strictEqual(Ledger.calcSortino([1, 1, 1, 1, 1]), Infinity);
});

test('open STOC with no expiry stays in open and unpriced', () => {
  const tr = [
    { id: 'cc', wheelId: 'w0', ticker: 'X', action: 'STOC', entered: '2026-04-01', strike: 50, shares: 100, total: 200 }
  ];
  const r = Ledger.buildLedger([W('w0', 'open')], tr, [], { today: '2026-06-01' });
  const leg = r.open.find(o => o.kind === 'cc');
  assert.ok(leg, 'open wheel short');
  assert.strictEqual(leg.priced, false);
  assert.strictEqual(r.unpricedCount, 1);
});

test('10. IEEE guard: bucket net exactly 0', () => {
  const events = [
    { date: '2026-01-01', amount: 0.1 },
    { date: '2026-01-02', amount: 0.2 },
    { date: '2026-01-03', amount: -0.3 }
  ];
  const g = Ledger.groupEventsByPeriod(events, { gran: 'Month', from: '2026-01-01', to: '2026-01-31' });
  assert.ok(Object.is(g.net, 0));
  assert.ok(g.buckets.every(b => Object.is(b.net, b.gain - b.loss)));
});
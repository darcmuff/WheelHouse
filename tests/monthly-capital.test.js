const test = require('node:test');
const assert = require('node:assert/strict');
const Ledger = require('../app/ledger.js');

const OPEN_END = '9999-12-31';
const W = (id, status, ticker) => ({ id, status: status || 'open', ticker: ticker || 'X' });

function csp(id, entered, expiry, extra) {
  return {
    id, wheelId: 'w1', ticker: 'X', action: 'CSP', entered, expiry,
    strike: 20, shares: 100, premium: 1, total: 100,
    ...extra
  };
}

function monthsOf(trades, opts, today, wheels) {
  return Ledger.monthlyDeployedCapital(wheels || [W('w1')], trades || [], opts || [], { today });
}

function intervalsOf(trades, opts, today, wheels) {
  return Ledger.buildCapitalIntervals(wheels || [W('w1')], trades || [], opts || [], { today });
}

test('exports monthlyDeployedCapital and buildCapitalIntervals on the ledger', () => {
  assert.equal(typeof Ledger.monthlyDeployedCapital, 'function');
  assert.equal(typeof Ledger.buildCapitalIntervals, 'function');
  assert.deepEqual(Ledger.monthlyDeployedCapital([], [], [], { today: '2026-03-01' }), {});
  assert.deepEqual(Ledger.buildCapitalIntervals([], [], [], { today: '2026-03-01' }), []);
});

test('single CSP: strike × shares from open to close, later months are 0', () => {
  const tr = [
    csp('a', '2026-01-05', '2026-01-30'),
    { id: 'b', wheelId: 'w1', ticker: 'X', action: 'BTC', entered: '2026-01-20', expiry: '2026-01-30', strike: 20, shares: 100, premium: 0.2, total: 20 }
  ];
  const iv = intervalsOf(tr, [], '2026-02-15');
  assert.equal(iv.length, 1);
  assert.deepEqual(iv[0], { start: '2026-01-05', end: '2026-01-20', capital: 2000, kind: 'csp', ticker: 'X' });
  const m = monthsOf(tr, [], '2026-02-15');
  assert.equal(m['2026-01'], 2000);
  assert.equal(m['2026-02'], 0);
  assert.deepEqual(Object.keys(m), ['2026-01', '2026-02']);
});

test('roll: close and reopen the same day does not double-count', () => {
  const tr = [
    csp('c1', '2026-01-01', '2026-01-16'),
    { id: 'b1', wheelId: 'w1', ticker: 'X', action: 'BTC', entered: '2026-01-10', expiry: '2026-01-16', strike: 20, shares: 100, premium: 0.4, total: 40, rollId: 'r' },
    csp('c2', '2026-01-10', '2026-01-23', { strike: 18, total: 80, rollId: 'r' })
  ];
  const iv = intervalsOf(tr, [], '2026-01-15');
  const old = iv.find(p => p.start === '2026-01-01');
  const neu = iv.find(p => p.start === '2026-01-10');
  assert.deepEqual(old, { start: '2026-01-01', end: '2026-01-10', capital: 2000, kind: 'csp', ticker: 'X' });
  assert.deepEqual(neu, { start: '2026-01-10', end: OPEN_END, capital: 1800, kind: 'csp', ticker: 'X' });
  const m = monthsOf(tr, [], '2026-01-15');
  assert.equal(m['2026-01'], 2000);
});

test('assignment into shares does not double-count', () => {
  const tr = [
    csp('c', '2026-01-01', '2026-01-23'),
    { id: 'in', wheelId: 'w1', ticker: 'X', action: 'IN', entered: '2026-01-23', strike: 20, shares: 100, total: 2000 }
  ];
  const iv = intervalsOf(tr, [], '2026-02-10');
  const put = iv.find(p => p.kind === 'csp');
  const sh = iv.find(p => p.kind === 'shares');
  assert.deepEqual(put, { start: '2026-01-01', end: '2026-01-23', capital: 2000, kind: 'csp', ticker: 'X' });
  assert.deepEqual(sh, { start: '2026-01-23', end: OPEN_END, capital: 2000, kind: 'shares', ticker: 'X' });
  const m = monthsOf(tr, [], '2026-02-10');
  assert.equal(m['2026-01'], 2000);
  assert.equal(m['2026-02'], 2000);
});

test('close on the 1st of the month is not $0 for that month', () => {
  const tr = [
    csp('a', '2026-01-15', '2026-02-20'),
    { id: 'b', wheelId: 'w1', ticker: 'X', action: 'BTC', entered: '2026-02-01', expiry: '2026-02-20', strike: 20, shares: 100, premium: 0.2, total: 20 }
  ];
  const iv = intervalsOf(tr, [], '2026-02-20');
  assert.equal(iv[0].end, '2026-02-01');
  const m = monthsOf(tr, [], '2026-02-20');
  assert.equal(m['2026-01'], 2000);
  assert.equal(m['2026-02'], 2000);
});

test('call-away ends share capital on the OUT date; covered call adds $0', () => {
  const tr = [
    csp('c', '2026-01-01', '2026-01-23'),
    { id: 'in', wheelId: 'w1', ticker: 'X', action: 'IN', entered: '2026-01-23', strike: 20, shares: 100, total: 2000 },
    { id: 'cc', wheelId: 'w1', ticker: 'X', action: 'STOC', entered: '2026-01-26', expiry: '2026-02-15', strike: 21, shares: 100, premium: 0.6, total: 60 },
    { id: 'out', wheelId: 'w1', ticker: 'X', action: 'OUT', entered: '2026-02-15', strike: 21, shares: 100, total: 2100 }
  ];
  const iv = intervalsOf(tr, [], '2026-03-01');
  assert.equal(iv.filter(p => p.kind === 'csp').length, 1);
  assert.equal(iv.filter(p => p.kind === 'shares').length, 1);
  assert.ok(!iv.some(p => p.capital === 0));
  assert.deepEqual(iv.find(p => p.kind === 'shares'), { start: '2026-01-23', end: '2026-02-15', capital: 2000, kind: 'shares', ticker: 'X' });
  const m = monthsOf(tr, [], '2026-03-01');
  assert.equal(m['2026-01'], 2000);
  assert.equal(m['2026-02'], 2000);
  assert.equal(m['2026-03'], 0);
});

test('open LEAP uses entry debit cost basis through today', () => {
  const leap = {
    id: 'leap', underlying: 'X', side: 'long', type: 'C', status: 'open',
    strike: 15, expiry: '2027-01-15', qty: 1, entryPrice: 10, entryDate: '2026-01-01', fees: 0
  };
  const iv = intervalsOf([], [leap], '2026-03-01', []);
  assert.deepEqual(iv, [{ start: '2026-01-01', end: OPEN_END, capital: 1000, kind: 'leap', ticker: 'X' }]);
  const m = monthsOf([], [leap], '2026-03-01', []);
  assert.equal(m['2026-01'], 1000);
  assert.equal(m['2026-02'], 1000);
  assert.equal(m['2026-03'], 1000);
});

test('PMCC short call adds $0 on top of the LEAP', () => {
  const leap = {
    id: 'leap', underlying: 'X', side: 'long', type: 'C', status: 'open',
    strike: 15, expiry: '2027-01-15', qty: 1, entryPrice: 10, entryDate: '2026-01-01', fees: 0
  };
  const short = {
    id: 'pmcc', underlying: 'X', side: 'short', type: 'C', status: 'closed',
    strike: 20, expiry: '2026-02-01', qty: 1, entryPrice: 0.5, entryDate: '2026-01-05',
    closePrice: 0.2, closeDate: '2026-01-20', fees: 0, closeFees: 0, parentLeapId: 'leap'
  };
  const iv = intervalsOf([], [leap, short], '2026-02-15', []);
  assert.equal(iv.length, 1);
  assert.equal(iv[0].kind, 'leap');
  assert.equal(iv[0].capital, 1000);
  const m = monthsOf([], [leap, short], '2026-02-15', []);
  assert.equal(m['2026-01'], 1000);
  assert.equal(m['2026-02'], 1000);
});

test('same-day open/close still counts that day', () => {
  const day = '2026-01-10';
  const tr = [
    csp('a', day, day),
    { id: 'b', wheelId: 'w1', ticker: 'X', action: 'BTC', entered: day, expiry: day, strike: 20, shares: 100, premium: 0.2, total: 20 }
  ];
  const iv = intervalsOf(tr, [], '2026-01-31');
  assert.deepEqual(iv[0], { start: day, end: day, capital: 2000, kind: 'csp', ticker: 'X' });
  const m = monthsOf(tr, [], '2026-01-31');
  assert.equal(m['2026-01'], 2000);
});

test('partial current month stops at today and ignores later opens', () => {
  const tr = [
    csp('held', '2026-02-20', '2026-04-17'),
    csp('future', '2026-03-20', '2026-04-17', { id: 'future', strike: 50, total: 100 })
  ];
  const m = monthsOf(tr, [], '2026-03-10');
  assert.equal(m['2026-02'], 2000);
  assert.equal(m['2026-03'], 2000);
  assert.ok(!Object.prototype.hasOwnProperty.call(m, '2026-04'));
});

test('month with no positions is 0 between the first trade and today', () => {
  const tr = [
    csp('a', '2026-01-05', '2026-01-30'),
    { id: 'b', wheelId: 'w1', ticker: 'X', action: 'BTC', entered: '2026-01-20', expiry: '2026-01-30', strike: 20, shares: 100, premium: 0.2, total: 20 }
  ];
  const m = monthsOf(tr, [], '2026-03-15');
  assert.equal(m['2026-01'], 2000);
  assert.equal(m['2026-02'], 0);
  assert.equal(m['2026-03'], 0);
  assert.deepEqual(Object.keys(m), ['2026-01', '2026-02', '2026-03']);
});

// pnl.test.js — calcYTD / calcOverall share P&L (FIFO against each rotation's own cost basis).
// Run: node --test tests/   (extracts live functions from app/index.html)
const test = require('node:test');
const assert = require('node:assert');
const { load } = require('./extract');

const Y = new Date().getFullYear();
const LY = `${Y - 1}-11-20`, Y1 = `${Y}-01-15`, Y2 = `${Y}-02-10`;

function build(trades, wheels) {
  const stubs = `const db={trades:${JSON.stringify(trades)},wheels:${JSON.stringify(wheels)}};`;
  return load([
    { kind: 'fn', name: 'shareRealisations' },
    { kind: 'fn', name: 'calcWheel' },
    { kind: 'fn', name: 'calcOverall' },
    { kind: 'fn', name: 'calcYTD' },
  ], stubs);
}
const T = (wheelId, action, entered, total, shares = 0) => ({ wheelId, ticker: 'TSLA', action, entered, total, shares });

test('shares bought last year, called away this year: YTD counts only the gain', () => {
  const f = build([
    T('w1', 'IN', LY, 30000, 100),
    T('w1', 'STOC', Y1, 400, 100),
    T('w1', 'OUT', Y2, 31000, 100),
  ], [{ id: 'w1', status: 'closed' }]);
  const y = f.calcYTD();
  assert.strictEqual(y.optNet, 400);
  assert.strictEqual(y.stockIncome, 1000);   // was 31000 before the fix
  assert.strictEqual(y.net, 1400);
});

test('share loss is negative, not hidden', () => {
  const f = build([
    T('w1', 'CSP', Y1, 300, 100),
    T('w1', 'IN', Y1, 30000, 100),
    T('w1', 'OUT', Y2, 29000, 100),
  ], [{ id: 'w1', status: 'closed' }]);
  assert.strictEqual(f.calcYTD().stockIncome, -1000);  // was 0
  assert.strictEqual(f.calcOverall().stockRealised, -1000);
  assert.strictEqual(f.calcOverall().totalRealised, -700);
});

test('partial sale is realised FIFO; rest stays as capital', () => {
  const f = build([
    T('w1', 'IN', Y1, 10000, 100),   // $100/sh
    T('w1', 'IN', Y1, 12000, 100),   // $120/sh
    T('w1', 'OUT', Y2, 11500, 100),  // sells the $100 lot first
  ], [{ id: 'w1', status: 'open' }]);
  const o = f.calcOverall();
  assert.strictEqual(o.stockRealised, 1500);   // was 0
  assert.strictEqual(o.capDeployed, 12000);    // was 10500
  assert.strictEqual(f.calcYTD().stockIncome, 1500);
});

test('rotations keep their own cost basis', () => {
  const f = build([
    T('a', 'IN', Y1, 5000, 100),
    T('b', 'IN', Y1, 9000, 100),
    T('b', 'OUT', Y2, 9500, 100),
  ], [{ id: 'a', status: 'open' }, { id: 'b', status: 'closed' }]);
  assert.strictEqual(f.calcYTD().stockIncome, 500);   // was 0 (9500-14000 clipped)
  assert.strictEqual(f.calcOverall().capDeployed, 5000);
});

test('premium-only and dividends unchanged', () => {
  const f = build([
    T('w1', 'CSP', Y1, 200, 100), T('w1', 'BTC', Y1, 50, 100), T('w1', 'DIV', Y2, 25),
  ], [{ id: 'w1', status: 'closed' }]);
  const o = f.calcOverall(), y = f.calcYTD();
  assert.strictEqual(o.pNet, 150); assert.strictEqual(o.divs, 25); assert.strictEqual(o.totalRealised, 175);
  assert.strictEqual(y.net, 175);
});

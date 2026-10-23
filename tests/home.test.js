const test = require('node:test');
const assert = require('node:assert');
const { extractFn } = require('./extract');
const S = new Function(extractFn('optionsLib') + '\nconst OPTS=optionsLib();\n' + ['homeFigures', 'nextExpiry', 'needsYou', 'pmccLabels'].map(extractFn).join('\n') + '\nreturn {homeFigures,nextExpiry,needsYou};')();
const rows = [
  { ym: '2026-10', premium: 237, shares: 500, divs: 0, extra: { leaps: 547 }, total: 1284 },
  { ym: '2026-09', premium: 332, shares: 0, divs: 10, extra: { leaps: 2846 }, total: 3188 },
  { ym: '2025-12', premium: 50, shares: 0, divs: 0, extra: {}, total: 50 },
];
test('this month splits wheel vs LEAPs; this year sums 2026 only', () => {
  const F = S.homeFigures(rows, '2026-10-23');
  assert.deepStrictEqual(F.month, { wheel: 737, leaps: 547, total: 1284 });
  assert.deepStrictEqual(F.year, { wheel: 1079, leaps: 3393, total: 4472 });
});
test('a month with no activity shows zero, not last month', () => {
  assert.strictEqual(S.homeFigures(rows, '2026-11-02').month.total, 0);
});
test('next expiry picks the soonest open leg across wheel and LEAPs', () => {
  const nx = S.nextExpiry([{ ticker: 'TSLA', action: 'CSP', strike: 300, expiry: '2026-12-18' }],
    [{ status: 'open', side: 'short', und: 'NVDA', strike: 190, expiry: '2026-10-31' }, { status: 'closed', expiry: '2026-10-24' }], '2026-10-23');
  assert.strictEqual(nx.ticker, 'NVDA'); assert.strictEqual(nx.dte, 8);
});
test('needs you lists status labels, red first', () => {
  const ny = S.needsYou([{ id: 'c1', status: 'open', side: 'short', underlying: 'AAPL', strike: 240, expiry: '2026-11-20', entryPrice: 5, mark: 2 },
    { id: 'c2', status: 'open', side: 'short', underlying: 'NVDA', strike: 180, expiry: '2026-10-23', entryPrice: 3, mark: 3 }], { AAPL: 200, NVDA: 185 }, '2026-10-23', []);
  assert.strictEqual(ny[0].c, 'r');
  assert.ok(ny.some(n => /Take profit/.test(n.text)));
});

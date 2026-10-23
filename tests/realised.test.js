// Realised-only monthly P&L: option premium banks when the option ends, never while open.
const test = require('node:test');
const assert = require('node:assert');
const { extractFn } = require('./extract');
const S = new Function(extractFn('optionsLib') + '\nconst OPTS=optionsLib();\n' +
  ['walkLegPairs', 'realisedPremium', 'optsMonthly', 'shareRealisations', 'calcMonthlyRealised', 'rotationShareStats', 'calcUnrealised', 'calcAllUnrealised', 'homeFigures'].map(extractFn).join('\n') +
  '\nreturn {calcMonthlyRealised,calcAllUnrealised,homeFigures};')();
const TODAY = '2026-10-23';
const T = (action, entered, total, o = {}) => ({ wheelId: 'w', ticker: 'TSLA', action, entered, total, shares: 100, strike: 100, ...o });
const mo = (rows, ym) => rows.find(r => r.ym === ym) || { premium: 0, total: 0 };

test('open CSP sold in October is excluded from October and shows in Unrealised', () => {
  const tr = [T('CSP', '2026-10-05', 300, { expiry: '2026-11-20' })];
  const rows = S.calcMonthlyRealised(tr, [], TODAY);
  assert.strictEqual(mo(rows, '2026-10').premium, 0);
  assert.strictEqual(S.homeFigures(rows, TODAY).month.total, 0);
  const u = S.calcAllUnrealised([{ id: 'w', status: 'open' }], tr, () => null, []);
  assert.strictEqual(u.premium, 300); assert.strictEqual(u.value, 300);
});
test('CSP sold in October that expires in November counts in November', () => {
  const tr = [T('CSP', '2026-10-05', 300, { expiry: '2026-11-20' })];
  const rows = S.calcMonthlyRealised(tr, [], '2026-11-25');
  assert.strictEqual(mo(rows, '2026-10').premium, 0);
  assert.strictEqual(mo(rows, '2026-11').premium, 300);
});
test('bought-back put counts net in its close month', () => {
  const tr = [T('CSP', '2026-09-10', 300, { expiry: '2026-10-30' }), T('BTC', '2026-10-02', 80, { expiry: '2026-10-30' })];
  const rows = S.calcMonthlyRealised(tr, [], TODAY);
  assert.strictEqual(mo(rows, '2026-09').premium, 0);
  assert.strictEqual(mo(rows, '2026-10').premium, 220);
});
test('assigned put banks its premium in the assignment month', () => {
  const tr = [T('CSP', '2026-08-25', 250, { expiry: '2026-09-19' }), T('IN', '2026-09-19', 10000)];
  const rows = S.calcMonthlyRealised(tr, [], TODAY);
  assert.strictEqual(mo(rows, '2026-08').premium, 0);
  assert.strictEqual(mo(rows, '2026-09').premium, 250);
});
test('roll: closed leg realises in the roll month, new leg stays open', () => {
  const tr = [T('CSP', '2026-09-01', 300, { expiry: '2026-10-17' }),
    T('BTC', '2026-10-10', 120, { expiry: '2026-10-17', rollId: 'r1' }),
    T('CSP', '2026-10-10', 350, { strike: 95, expiry: '2026-11-21', rollId: 'r1' })];
  const rows = S.calcMonthlyRealised(tr, [], TODAY);
  assert.strictEqual(mo(rows, '2026-10').premium, 180);
  const u = S.calcAllUnrealised([{ id: 'w', status: 'open' }], tr, () => null, []);
  assert.strictEqual(u.premium, 350);
});

const test = require('node:test');
const assert = require('node:assert');
const { extractFn } = require('./extract');
const run = db => new Function('db', extractFn('optionsLib') + '\nconst OPTS=optionsLib();\n' + extractFn('calcWinLoss') + '\nreturn calcWinLoss();')(db);
const base = { wheels: [], trades: [] };
const leap = { id: 'L', side: 'long', type: 'C', status: 'closed', entryPrice: 30, closePrice: 10, qty: 1 };
test('PMCC call sold 1.67×3, bought back 0.54 = win of the net', () => {
  const wl = run({ ...base, opts: [leap, { id: 's', parentLeapId: 'L', side: 'short', type: 'C', status: 'closed', entryPrice: 1.67, closePrice: 0.54, qty: 3, fees: 2, closeFees: 2 }] });
  assert.strictEqual(wl.wins, 1); assert.strictEqual(wl.losses, 0); assert.strictEqual(wl.avgWin, 335);
});
test('expired short = win, premium kept', () => {
  const wl = run({ ...base, opts: [{ side: 'short', status: 'expired', entryPrice: 1, qty: 2, parentLeapId: 'L' }] });
  assert.strictEqual(wl.wins, 1); assert.strictEqual(wl.avgWin, 200);
});
test('bought back higher = loss', () => {
  const wl = run({ ...base, opts: [{ side: 'short', status: 'closed', entryPrice: 1, closePrice: 1.5, qty: 1, parentLeapId: 'L' }] });
  assert.strictEqual(wl.losses, 1); assert.strictEqual(wl.avgLoss, 50); assert.strictEqual(wl.wr, '0.0');
});
test('LEAP long legs ignored, open short counts as open, demo ignored', () => {
  const wl = run({ ...base, opts: [leap, { ...leap, status: 'open' }, { side: 'short', status: 'open', entryPrice: 1, qty: 1 }, { side: 'short', status: 'expired', entryPrice: 1, qty: 1, demo: true }] });
  assert.strictEqual(wl.wins, 0); assert.strictEqual(wl.losses, 0); assert.strictEqual(wl.openOpts, 1);
});

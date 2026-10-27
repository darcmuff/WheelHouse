const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { extractFn } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
const mk = db => new Function('db', extractFn('calcWinLoss') + '\nreturn calcWinLoss();');
const run = db => mk()(db);
test('win rate counts closed option trades only (same rule as the old panel)', () => {
  const db = { wheels: [{ id: 'w', status: 'open' }], trades: [
    { wheelId: 'w', action: 'CSP', strike: 300, total: 500, entered: '2026-01-01', expiredWorthless: true },
    { wheelId: 'w', action: 'CSP', strike: 290, total: 400, entered: '2026-02-01' },
    { wheelId: 'w', action: 'BTC', strike: 290, total: 600, entered: '2026-02-10' },
    { wheelId: 'w', action: 'CSP', strike: 280, total: 300, entered: '2026-03-01' },
    { wheelId: 'w', action: 'IN', entered: '2026-03-20' },
    { wheelId: 'w', action: 'STOC', strike: 320, total: 200, entered: '2026-04-01' },
  ] };
  const wl = run(db);
  assert.strictEqual(wl.wins, 2); assert.strictEqual(wl.losses, 1); assert.strictEqual(wl.openOpts, 1);
  assert.strictEqual(wl.wr, '66.7');
});
test('Home has a Win rate tile using calcWinLoss with W / L underneath', () => {
  const home = extractFn('renderHome');
  assert.match(home, /calcWinLoss\(\)/);
  assert.match(home, /Win rate \$\{ii\(/);
  assert.match(home, /W \/ \$\{wl\.losses\} L/);
});

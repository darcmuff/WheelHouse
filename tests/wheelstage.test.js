const test = require('node:test'); const assert = require('node:assert');
const { load } = require('./extract');
const { wheelStage } = load([{ kind: 'fn', name: 'wheelStage' }]);
test('wheel step line stages', () => {
  assert.strictEqual(wheelStage(0, 'CSP', false), 0);
  assert.strictEqual(wheelStage(100, null, false), 1);
  assert.strictEqual(wheelStage(100, 'STOC', false), 2);
  assert.strictEqual(wheelStage(0, null, true), 3);
  assert.strictEqual(wheelStage(0, 'CSP', true), 0); // new cycle
});

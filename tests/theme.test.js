const test = require('node:test'); const assert = require('node:assert');
const { load } = require('./extract');
const { themeFromStored } = load([{ kind: 'fn', name: 'themeFromStored' }]);
test('stored theme keeps its old meaning; nothing stored → light', () => {
  assert.strictEqual(themeFromStored('light'), 'light');
  assert.strictEqual(themeFromStored('dark'), 'dark');
  assert.strictEqual(themeFromStored(null), 'light');
});

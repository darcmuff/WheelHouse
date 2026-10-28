const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { extractFn } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
const place = new Function(extractFn('iiPlace') + 'return iiPlace;')();
const r = (left, top) => ({ left, top, width: 12, height: 12, right: left + 12, bottom: top + 12 });
test('tip sits under the icon, centred', () => {
  assert.deepStrictEqual(place(r(500, 100), 200, 60, 1440, 900), { left: 406, top: 118 });
});
test('tip near the right edge is pulled back inside the screen', () => {
  assert.strictEqual(place(r(1420, 100), 272, 60, 1440, 900).left, 1440 - 272 - 8);
});
test('tip near the left edge stays on screen', () => {
  assert.strictEqual(place(r(2, 100), 272, 60, 1440, 900).left, 8);
});
test('tip near the bottom flips above the icon', () => {
  const o = place(r(500, 870), 200, 80, 1440, 900);
  assert.strictEqual(o.top, 870 - 6 - 80);
});
test('tips are not CSS ::after inside tiles any more (no clipping)', () => {
  assert.ok(!/\.ii[^{]*::after\{content:attr\(data-tip\)/.test(SRC));
  assert.ok(/#ii-pop\{position:fixed;z-index:10000/.test(SRC));
});
test('Home tile ⓘ flips the tile in place (no popup), tile size fixed', () => {
  assert.ok(/\.hk-back\{position:absolute;inset:0/.test(SRC));
  assert.ok(SRC.includes("t.classList.add('hk-flipped')"));
  assert.ok(SRC.includes("!b.closest('.hk')"), 'no hover popup on tile icons');
});
test('every Home tile tip is short enough to fit in the tile', () => {
  const a = SRC.indexOf('function renderHome'), h = SRC.slice(a, SRC.indexOf('\n}\n', a));
  const tips = [...h.matchAll(/hk-l">[^$]*\$\{ii\(`([^`]*)`\)/g)].map(m => m[1].replace(/\$\{mName\}/g, 'September').replace(/&amp;/g, '&'));
  assert.ok(tips.length >= 8, 'found ' + tips.length);
  tips.forEach(t => assert.ok(t.length <= 120, t.length + ': ' + t));
});
test('moving the mouse off a flipped tile flips it back', () => {
  assert.ok(/addEventListener\('mouseout',e=>\{const t=e\.target\.closest&&e\.target\.closest\('\.hk\.hk-flipped'\);if\(t&&!\(e\.relatedTarget&&t\.contains\(e\.relatedTarget\)\)\)unflip\(\);\}\)/.test(SRC));
  assert.ok(!/\.hk-back\{[^}]*overflow-y:auto/.test(SRC), 'no scroll on flipped tiles');
});

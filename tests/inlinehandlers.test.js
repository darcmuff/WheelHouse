const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
// The app's code lives in a <script type="module">, so inline on*="fn()" handlers only work if fn is put on window.
const BUILTIN = new Set(['if', 'for', 'return', 'setTimeout', 'alert', 'confirm', 'prompt', 'Number', 'String', 'parseFloat', 'parseInt', 'encodeURIComponent', 'switch', 'while', 'function', 'window', 'document', 'location', 'history', 'navigator', 'localStorage', 'Math', 'JSON', 'Array', 'Object', 'Boolean', 'isNaN', 'requestAnimationFrame']);
const exposed = n => new RegExp(`window\\.${n}\\s*=`).test(SRC) || new RegExp(`window\\[['"]${n}['"]\\]\\s*=`).test(SRC) || new RegExp(`Object\\.assign\\(window,\\s*\\{[^}]*\\b${n}\\b`).test(SRC);
const classic = SRC.split(/<script type="module">[\s\S]*?<\/script>/).join('');
test('every function called from an inline on*= handler is reachable from global scope', () => {
  const names = new Set();
  for (const m of SRC.matchAll(/\son(?:click|toggle|change|input|submit|keydown|keyup|blur|focus)="([^"]*)"/g)) {
    for (const c of m[1].replace(/\$\{[^}]*\}/g, "0").matchAll(/(?:^|[;{(\s!?:&|,])([A-Za-z_$][\w$]*)\s*\(/g)) if (!BUILTIN.has(c[1])) names.add(c[1]);
  }
  const missing = [...names].filter(n => !exposed(n) && !new RegExp(`function ${n}\\(`).test(classic));
  assert.deepStrictEqual(missing, []);
});
test('price chart handlers are exposed and the toggle path loads without IntersectionObserver', () => {
  for (const n of ['wlChartToggle', 'wlChartRange', 'drawWheelChart']) assert.ok(exposed(n), n);
  assert.ok(!SRC.includes('IntersectionObserver(es=>'), 'no observer-only lazy load');
  assert.ok(SRC.includes("document.getElementById('pc-'+wid)"), 'updates the live element by id');
});
const { extractFn } = require('./extract');
const F = new Function(['isoDay', 'chartTrades'].map(extractFn).join('\n') + 'return {isoDay,chartTrades};')();
test('real stored date shapes normalise to ISO days', () => {
  assert.strictEqual(F.isoDay('2026-10-23'), '2026-10-23');
  assert.strictEqual(F.isoDay('2026-10-23T09:00:00.000Z'), '2026-10-23');
  assert.strictEqual(F.isoDay({ seconds: Date.UTC(2026, 9, 23, 12) / 1000, nanoseconds: 0 }), '2026-10-23');
  assert.strictEqual(F.isoDay({ toDate: () => new Date(Date.UTC(2026, 9, 23, 12)) }), '2026-10-23');
  assert.strictEqual(F.isoDay('23/10/26'), '2026-10-23');
  assert.strictEqual(F.isoDay(''), null); assert.strictEqual(F.isoDay(null), null);
  const t = F.chartTrades([{ action: 'CSP', entered: { seconds: Date.UTC(2026, 9, 23, 12) / 1000 }, expiry: '2026-11-13', strike: 130 }, { action: 'CSP', entered: null }]);
  assert.strictEqual(t.length, 1); assert.strictEqual(t[0].entered, '2026-10-23');
});

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

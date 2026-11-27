const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
// Every inline <script> in app/index.html must parse — a syntax error blanks the whole app (incl. sign-in).
test('all inline scripts parse', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
  const re = /<script([^>]*)>([\s\S]*?)<\/script>/g; let m, i = 0;
  while ((m = re.exec(src))) {
    if (/\bsrc=/.test(m[1])) continue;
    const f = path.join(os.tmpdir(), `wh-script-${process.pid}-${i++}${/module/.test(m[1]) ? '.mjs' : '.js'}`);
    fs.writeFileSync(f, m[2]);
    try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
    catch (e) { assert.fail(`script #${i} does not parse:\n${String(e.stderr).slice(0, 400)}`); }
  }
});

test('extracted app.js parses', () => {
  const { spawnSync } = require('child_process');
  const path = require('path');
  const file = path.join(__dirname, '..', 'app', 'app.js');
  assert.ok(fs.existsSync(file), 'app.js must exist');
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
});
test('extracted app.css exists and is linked from the shell', () => {
  const path = require('path');
  const css = path.join(__dirname, '..', 'app', 'app.css');
  assert.ok(fs.existsSync(css), 'app.css must exist');
  const html = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
  assert.match(html, /<link rel="stylesheet" href="app\.css">/);
  assert.match(html, /<script type="module" src="app\.js"><\/script>/);
});

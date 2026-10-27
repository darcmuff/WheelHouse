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

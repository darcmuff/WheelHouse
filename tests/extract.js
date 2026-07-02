// extract.js — pulls named functions and consts out of app/index.html so tests
// always run against the LIVE code, never a stale copy.
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');

// Extract a `const NAME = ...;` declaration (single statement, may span lines)
function extractConst(name) {
  const re = new RegExp(`const ${name}\\s*=[\\s\\S]*?;\\n`);
  const m = SRC.match(re);
  if (!m) throw new Error(`const ${name} not found in app/index.html`);
  return m[0];
}

// Extract a `function name(...){...}` by brace-matching from the opening brace
function extractFn(name) {
  const i = SRC.indexOf(`function ${name}(`);
  if (i < 0) throw new Error(`function ${name} not found in app/index.html`);
  let j = SRC.indexOf('{', i), depth = 0, k = j;
  for (;;) {
    const c = SRC[k];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) break; }
    k++;
  }
  return SRC.slice(i, k + 1);
}

// Build an isolated sandbox containing the requested pieces plus any stubs
function load(pieces, stubs = '') {
  const code = stubs + '\n' + pieces.map(p =>
    p.kind === 'const' ? extractConst(p.name) : extractFn(p.name)
  ).join('\n');
  const exportNames = pieces.filter(p => p.kind === 'fn').map(p => p.name);
  const factory = new Function(code + `\nreturn {${exportNames.join(',')}};`);
  return factory();
}

module.exports = { load, extractFn, extractConst };

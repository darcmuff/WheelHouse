// audit-step10.test.js — final tidy, cache bump and the phone Unrealised tile (audit Step 10).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { extractFn } = require('./extract');
const APP = path.join(__dirname, '..', 'app');
const SRC = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
const SW = fs.readFileSync(path.join(APP, 'sw.js'), 'utf8');

test('orphaned buildLastAction, buildMiniCal, dteCls and the mini-calendar CSS are gone', () => {
  for (const name of ['buildLastAction', 'buildMiniCal', 'dteCls', 'd-mini-cal']) assert.ok(!SRC.includes(name), name);
});

test('service worker precaches ledger.js and every STATIC entry exists on disk', () => {
  const list = JSON.parse('[' + SW.match(/const STATIC = \[([^\]]*)\]/)[1].replace(/SHELL/, "'./index.html'").replace(/'/g, '"') + ']');
  assert.ok(list.includes('./ledger.js'));
  for (const f of list) assert.ok(fs.existsSync(path.join(APP, f.replace(/\?.*$/, ''))), f);
  assert.ok(!/wheelhouse-share/.test(SW));
});

test('Unrealised sub-text keeps each figure whole and gets a third line on phones so "N unpriced" is never clipped', () => {
  const home = extractFn('renderHome');
  assert.match(home, /class="hk-s hk-s3"><span class="hk-nw">Shares/);
  assert.match(home, /<span class="hk-nw">\$\{un\.unpriced\} unpriced<\/span>/);
  assert.match(SRC, /\.hk-nw\{white-space:nowrap\}/);
  assert.match(SRC, /\.v2-home \.hk-s\.hk-s3\{-webkit-line-clamp:3\}/);
});

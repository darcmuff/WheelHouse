const{appSrc}=require('./appsrc');
// unsigned-color.test.js — unsigned figures (no +/−) must not use brand orange
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('fs');
const path = require('path');
const { extractFn } = require('./extract');

const SRC = appSrc();
const F = new Function(extractFn('arocColor') + '\n' + extractFn('unsignedValueColor') + '\nreturn {arocColor, unsignedValueColor};')();

test('arocColor: mid-range AROC is normal text, never orange', () => {
  assert.strictEqual(F.arocColor(8), 'var(--text)');
  assert.strictEqual(F.arocColor(14.9), 'var(--text)');
  assert.ok(!/orange/i.test(F.arocColor(8)));
  assert.ok(!/orange/i.test(F.arocColor(10)));
});

test('arocColor: missing is muted, 15%+ stays green, below 8 stays muted', () => {
  assert.strictEqual(F.arocColor(null), 'var(--text3)');
  assert.strictEqual(F.arocColor(15), 'var(--green)');
  assert.strictEqual(F.arocColor(7.9), 'var(--text2)');
});

test('unsignedValueColor: no sign → text; negative → red; missing → muted; never orange', () => {
  assert.strictEqual(F.unsignedValueColor(6.08), 'var(--text)');
  assert.strictEqual(F.unsignedValueColor(0), 'var(--text)');
  assert.strictEqual(F.unsignedValueColor(-1.25), 'var(--red)');
  assert.strictEqual(F.unsignedValueColor(null), 'var(--text3)');
  assert.ok(!/orange/i.test(F.unsignedValueColor(10.27)));
  assert.ok(!/orange/i.test(F.unsignedValueColor(0)));
});

test('live markup no longer hard-codes orange on unsigned AROC, PPD, shares or short-call counts', () => {
  assert.match(SRC, /function arocColor\(/);
  assert.match(SRC, /function unsignedValueColor\(/);
  assert.match(SRC, /const rocColor=opts\.rocColor!=null\?opts\.rocColor:arocColor\(roc\);/);
  assert.doesNotMatch(SRC, /roc>=8\?'var\(--orange\)'/);
  assert.doesNotMatch(SRC, /aroc>=8\?'var\(--orange\)'/);
  assert.doesNotMatch(SRC, /'AROC'[^;]{0,200}'var\(--orange\)'/);
  assert.doesNotMatch(SRC, /data-l="Avg PPD" style="color:var\(--orange\)"/);
  assert.doesNotMatch(SRC, /Avg PPD<\/span><div style="font-weight:720;color:var\(--orange\)"/);
  assert.doesNotMatch(SRC, /shortCount>0\?'var\(--orange\)'/);
  assert.doesNotMatch(SRC, /totalSharesHeld>0\?'var\(--orange\)'/);
  assert.doesNotMatch(SRC, /color:var\(--orange\)">\$\{w\.sortOrder/);
});

// datefmt.test.js — default date format is US; a saved choice is honoured (v415)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { extractFn } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'app/index.html'), 'utf8');

test('default date format is US when nothing is saved; Settings still offers DD/MM', () => {
  assert.match(SRC, /let dateFmt=localStorage\.getItem\('wh-dateFmt'\)\|\|'us'/);
  assert.doesNotMatch(SRC, /getItem\('wh-dateFmt'\)\|\|'uk'/);
  assert.match(SRC, /<option value="us" selected>MM\/DD<\/option>/);
  assert.match(SRC, /<option value="uk">DD\/MM<\/option>/);
  assert.match(SRC, /id="date-fmt-select"/);
  assert.match(extractFn('setDateFmt'), /if\(val!=='us'&&val!=='uk'\)return;/);
  assert.match(extractFn('setDateFmt'), /localStorage\.setItem\('wh-dateFmt',val\)/);
});

function harness(initial) {
  return new Function(`
    let dateFmt = ${JSON.stringify(initial)};
    ${extractFn('dateLocale')}
    ${extractFn('fmtDate')}
    ${extractFn('fmtDateFull')}
    ${extractFn('fmtDateShort')}
    ${extractFn('cpDate')}
    ${extractFn('_fdShort')}
    return { setFmt(v){ dateFmt = v; }, dateLocale, fmtDate, fmtDateFull, fmtDateShort, cpDate, _fdShort };
  `)();
}

test('numeric dates use MM/DD/YY by default and DD/MM/YY when UK is chosen', () => {
  const us = harness('us');
  assert.equal(us.fmtDate('2026-11-26'), '11/26/26');
  assert.equal(us.fmtDateFull('2026-11-26'), '11/26/26');
  assert.equal(us.fmtDateShort('2026-11-26'), '11/26');
  assert.equal(us.fmtDate(''), '—');
  assert.equal(us.fmtDateShort(''), '—');
  const uk = harness('uk');
  assert.equal(uk.fmtDate('2026-11-26'), '26/11/26');
  assert.equal(uk.fmtDateFull('2026-11-26'), '26/11/26');
  assert.equal(uk.fmtDateShort('2026-11-26'), '26/11');
});

test('month-name dates are US-style by default and day-first when UK is chosen', () => {
  const us = harness('us');
  assert.equal(us.dateLocale(), 'en-US');
  assert.equal(us.cpDate('2026-11-26T12:00:00Z'), 'Nov 26');
  assert.equal(us._fdShort('2026-11-26'), 'Nov 26, 26');
  assert.equal(us.cpDate(''), '');
  assert.equal(us._fdShort(''), '—');
  const uk = harness('uk');
  assert.equal(uk.dateLocale(), 'en-GB');
  assert.equal(uk.cpDate('2026-11-26T12:00:00Z'), '26 Nov');
  assert.equal(uk._fdShort('2026-11-26'), '26 Nov 26');
});

test('switching the saved format updates both numeric and month-name dates', () => {
  const h = harness('us');
  assert.equal(h.fmtDate('2026-03-05'), '03/05/26');
  h.setFmt('uk');
  assert.equal(h.fmtDate('2026-03-05'), '05/03/26');
  assert.equal(h._fdShort('2026-03-05'), '5 Mar 26');
  h.setFmt('us');
  assert.equal(h._fdShort('2026-03-05'), 'Mar 5, 26');
});

test('CSV export keeps ISO dates; date inputs stay type=date', () => {
  const fn = extractFn('exportCSV');
  assert.match(fn, /t\.entered,t\.expiry\|\|''/);
  assert.doesNotMatch(fn, /fmtDate\(/);
  const inputs = [...SRC.matchAll(/<(?:input)[^>]*type="date"[^>]*>/g)].map(m => m[0]);
  assert.ok(inputs.length >= 8, 'expected the trade and LEAP date fields');
  inputs.forEach(tag => assert.doesNotMatch(tag, /type="text"/));
});

const{appSrc}=require('./appsrc');
// Fill time field: labels, ids (for OpTrack Bot), grey hints, and save wiring.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { extractFn } = require('./extract');

const SRC = appSrc();
const attr = (id) => ((SRC.match(new RegExp(`<input id="${id}"[^>]*>`)) || [])[0] || '');

function around(id, before, after) {
  const i = SRC.indexOf(`id="${id}"`);
  return i < 0 ? '' : SRC.slice(Math.max(0, i - before), i + Math.max(after, 800));
}

test('Fill time fields sit next to the date, with the ids the bot will type into', () => {
  const fields = [
    { time: 'pm-fill-time', date: 'pm-entered', hint: 'pm-fill-time-hint', label: 'Date Entered' },
    { time: 'tf-fill-time', date: 'tf-entered', hint: 'tf-fill-time-hint', label: 'Date Entered' },
    { time: 'pcc-fill-time', date: 'pcc-date', hint: 'pcc-fill-time-hint', label: 'Date sold' },
    { time: 'pe-fill-time', date: 'pe-date', hint: 'pe-fill-time-hint', label: 'Sold on' }
  ];
  for (const f of fields) {
    const a = attr(f.time);
    assert.ok(a, f.time);
    assert.match(a, /placeholder="14:52"/, f.time);
    assert.doesNotMatch(a, /required/, f.time);
    const chunk = around(f.time, 400, 900);
    assert.match(chunk, />Fill time /, f.time);
    assert.match(chunk, new RegExp(`id="${f.date}"`), f.time + ' next to date');
    assert.match(chunk, new RegExp(f.label), f.time + ' date label');
    assert.match(chunk, new RegExp(`id="${f.hint}"[^>]*class="fill-time-hint"`), f.hint);
  }
  assert.match(SRC, /\.fill-time-hint\{color:var\(--text3\)/);
  assert.doesNotMatch(SRC, /\.fill-time-hint\{[^}]*var\(--red\)/);
});

test('save paths write filledAt from the field and leave it alone when blank; parsers are untouched', () => {
  const saveTrade = extractFn('saveTrade');
  assert.match(saveTrade, /readFilledAtField\('tf-entered','tf-fill-time','tf-fill-time-hint'/);
  assert.match(saveTrade, /if\(_fa\.error\)return/);
  assert.match(saveTrade, /if\(_fa\.value\)data\.filledAt=_fa\.value/);
  const savePM = extractFn('savePMTrade');
  assert.match(savePM, /readFilledAtField\('pm-entered','pm-fill-time','pm-fill-time-hint'/);
  assert.match(savePM, /if\(_fa\.value\)newTrade\.filledAt=_fa\.value/);
  assert.doesNotMatch(extractFn('confirmParsed'), /filledAt|pm-fill-time|tf-fill-time/);
  const savePmcc = extractFn('savePmcc');
  assert.match(savePmcc, /readFilledAtField\('pcc-date','pcc-fill-time','pcc-fill-time-hint'/);
  assert.match(savePmcc, /if\(_fa\.value\)r\.leg\.filledAt=_fa\.value/);
  const savePmccLeg = extractFn('savePmccLeg');
  assert.match(savePmccLeg, /readFilledAtField\('pe-date','pe-fill-time','pe-fill-time-hint'/);
  // Pure helpers and parsers must not grow fill-time logic.
  assert.doesNotMatch(extractFn('pmccEditLeg'), /filledAt|fill-time|Fill time/);
  assert.doesNotMatch(extractFn('pmccFormLeg'), /filledAt|fill-time|Fill time/);
  assert.doesNotMatch(extractFn('pickDate'), /filledAt|tf-fill-time/);
});

test('fill-time helpers are on window so the inline field handlers can run', () => {
  for (const name of ['paintFillTimeHint','readFilledAtField','setFillTimeField']) {
    assert.match(SRC, new RegExp(`window\\.${name}\\s*=\\s*${name}`), name);
  }
});

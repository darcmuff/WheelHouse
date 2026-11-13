// A close and a later open are two trades. Nothing suggests or writes a roll link.
const test=require('node:test');const assert=require('node:assert');const fs=require('fs');const path=require('path');
const{extractFn}=require('./extract');
const SRC=fs.readFileSync(path.join(__dirname,'..','app','index.html'),'utf8');
test('the mark-as-roll prompt and its matchers are gone',()=>{
  assert.ok(!SRC.includes('Mark as roll?'));
  assert.ok(!SRC.includes('function checkRollCandidate'));
  assert.ok(!SRC.includes('function rollMatch'));
  assert.ok(!SRC.includes('function leapRollMatch'));
  assert.ok(!SRC.includes('function openRollPrompt'));
  assert.ok(!/checkRollCandidate\(/.test(SRC));
});
test('a two-leg paste is saved without a roll link',()=>{
  const save=extractFn('confirmParsed');
  assert.ok(!/rollId/.test(save));
  assert.ok(!/paste-roll-pair/.test(save));
});
test('saving a scanned pair does not write a new roll link',()=>{
  const save=extractFn('pmccSaveRoll');
  assert.match(save,/uid\(\),false\)/);
  assert.ok(!/pcc-roll-pair/.test(save));
});
test('the trade forms have no Mark as roll control',()=>{
  assert.ok(!SRC.includes('Mark as roll'));
  assert.ok(!SRC.includes('id="tf-roll"')&&!SRC.includes('id="pm-roll"')&&!SRC.includes('id="paste-roll-on"')&&!SRC.includes('id="paste-roll-pair"'));
  assert.match(extractFn('saveTrade'),/if\(old\.rollId\)updated\.rollId=old\.rollId/);
});

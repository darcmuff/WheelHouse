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
test('a two-leg paste stays unlinked unless Mark as roll is ticked',()=>{
  const save=extractFn('confirmParsed');
  assert.match(save,/pair&&pair\.checked\?'roll_'\+uid\(\):null/);
  assert.ok(!/openRollPrompt|checkRollCandidate/.test(save));
});
test('an explicit Save roll still stores the link only when Mark as roll is ticked',()=>{
  assert.match(extractFn('pmccRollApply'),/rolledFrom/);
  const save=extractFn('pmccSaveRoll');
  assert.match(save,/pcc-roll-pair/);
  assert.match(save,/pair&&pair\.checked\?true:false/);
});
test('Mark as roll is an unticked choice on the trade forms',()=>{
  assert.ok(SRC.includes('id="tf-roll"')&&SRC.includes('id="pm-roll"')&&SRC.includes('id="paste-roll-on"')&&SRC.includes('id="paste-roll-pair"'));
  assert.match(extractFn('confirmParsed'),/paste-roll-pair/);
  assert.match(extractFn('linkWheelRoll'),/roll_/);
});

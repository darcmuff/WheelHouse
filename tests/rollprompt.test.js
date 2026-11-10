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
test('a two-leg paste is saved unlinked',()=>{
  const save=extractFn('confirmParsed');
  assert.match(save,/rollId:null/);
  assert.ok(!/openRollPrompt|checkRollCandidate/.test(save));
});
test('an explicit Save roll still stores the link',()=>{
  assert.match(extractFn('pmccRollApply'),/rolledFrom/);
  assert.match(extractFn('pmccSaveRoll'),/pmccRollApply\(_pmccRoll,L,db\.opts\|\|\[\],uid\(\)\)/);
});

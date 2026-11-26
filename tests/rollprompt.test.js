// A close and a later open are two trades. The old "Mark as roll?" prompt stays gone.
// A simple Roll checkbox and a stored roll / rollId flag are the replacement.
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
test('a two-leg paste entered together is auto-linked as a roll',()=>{
  const save=extractFn('confirmParsed');
  assert.match(save,/autoLinkRollBatch\(built,\{enteredTogether:true\}\)/);
  assert.ok(!/paste-roll-pair/.test(save));
});
test('saving a scanned pair does not write a new roll link',()=>{
  const save=extractFn('pmccSaveRoll');
  assert.match(save,/uid\(\),false\)/);
  assert.ok(!/pcc-roll-pair/.test(save));
});
test('the trade forms have a Roll checkbox and no old roll picker',()=>{
  assert.ok(!SRC.includes('Mark as roll'));
  assert.ok(SRC.includes('id="tf-roll"'));
  assert.ok(SRC.includes('id="pm-roll"'));
  assert.ok(!SRC.includes('id="paste-roll-on"')&&!SRC.includes('id="paste-roll-pair"'));
  assert.ok(!SRC.includes('id="tf-roll-from"')&&!SRC.includes('id="pm-roll-from"')&&!SRC.includes('id="tf-roll-box"')&&!SRC.includes('id="pm-roll-box"'));
  assert.match(extractFn('saveTrade'),/if\(old\.rollId\)updated\.rollId=old\.rollId/);
  assert.match(extractFn('saveTrade'),/applyTradeRollFromForm/);
  assert.match(extractFn('savePMTrade'),/applyTradeRollFromForm/);
});

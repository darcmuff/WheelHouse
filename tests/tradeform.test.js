// Wheel trade-form validation and phone field UX (no formula changes).
const test=require('node:test');const assert=require('node:assert');const fs=require('fs');const path=require('path');
const{extractFn}=require('./extract');
const SRC=fs.readFileSync(path.join(__dirname,'..','app','index.html'),'utf8');
const attr=(id)=>((SRC.match(new RegExp(`<input id="${id}"[^>]*>`))||[])[0]||'');

test('option trades need an expiry on every wheel save path',()=>{
  for(const name of['saveTrade','savePMTrade','confirmParsed']){
    const fn=extractFn(name);
    assert.match(fn,/OPTIONS\.has\(/,name);
    assert.match(fn,/alert\('Enter the expiry'\)/,name);
  }
  assert.match(extractFn('saveLeap'),/alert\(r\.err\)/);
});

test('onboarding ticker no longer rewrites value on input',()=>{
  const tag=SRC.slice(SRC.indexOf('id="onboard-ticker"'),SRC.indexOf('id="onboard-submit-btn"'));
  assert.ok(!/oninput="this\.value=this\.value\.toUpperCase\(\)"/.test(tag));
  assert.match(tag,/autocomplete="off"/);
  assert.match(tag,/autocapitalize="characters"/);
  assert.match(tag,/spellcheck="false"/);
  assert.match(tag,/this\.select\(\)/);
  assert.match(extractFn('onboardSubmit'),/\.toUpperCase\(\)/);
});

test('trade tickers select on focus; strike and premium are decimal text',()=>{
  for(const id of['tf-ticker','pm-ticker']){
    const a=attr(id);
    assert.match(a,/onfocus="this\.select\(\)"/,id);
    assert.match(a,/autocomplete="off"/,id);
    assert.match(a,/autocapitalize="characters"/,id);
    assert.match(a,/spellcheck="false"/,id);
  }
  for(const id of['tf-strike','tf-premium','pm-strike','pm-premium']){
    const a=attr(id);
    assert.match(a,/type="text"/,id);
    assert.match(a,/inputmode="decimal"/,id);
    assert.doesNotMatch(a,/type="number"/,id);
    assert.match(extractFn(id.startsWith('pm')?'savePMTrade':'saveTrade'),new RegExp(`parseFloat\\(document\\.getElementById\\('${id}'\\)`),id);
  }
});

const test=require('node:test');const assert=require('node:assert');const fs=require('fs'),path=require('path');
const{extractFn}=require('./extract');const SRC=fs.readFileSync(path.join(__dirname,'..','app','index.html'),'utf8');
const needs=new Function(extractFn('needsOnboarding')+'\nreturn needsOnboarding;')();
test('onboarding only for a truly empty account',()=>{assert.ok(needs({wheels:[],trades:[],opts:[]},false));
  assert.ok(!needs({wheels:[],trades:[],opts:[{id:'o'}]},false),'LEAP-only user is not new');assert.ok(!needs({wheels:[{id:'w'}],trades:[],opts:[]},false));assert.ok(!needs({wheels:[],trades:[],opts:[]},true),'skipped');});
test('onboarding can be skipped and is readable on the dark overlay',()=>{assert.ok(/id="onboard-skip"[^>]*onboardSkip\(\)/.test(SRC));assert.ok(SRC.includes("<h2 style=\"color:#f3f4f6"));assert.ok(!/rename or delete this ticker later from Settings/.test(SRC));});
test('empty wheel tab gives real next steps, no stale sidebar hint',()=>{assert.ok(!/in the sidebar/.test(SRC));assert.ok(/id="wheel-empty"[\s\S]{0,300}openNewPos\(\)[\s\S]{0,200}openImport\(\)/.test(SRC));});
test('empty P&L chart: tidy scale and a friendly note',()=>{assert.ok(/_pcEmpty\?100:/.test(SRC)&&/class="pc-empty"/.test(SRC));});

const test=require('node:test');const assert=require('node:assert');const fs=require('fs'),path=require('path');
const{lastExt,getExt}=require('../netlify/functions/extquote.js');const{extractFn}=require('./extract');
const SRC=fs.readFileSync(path.join(__dirname,'..','app','index.html'),'utf8');
const T0=1793347200; // pre start
const raw=(bars)=>({chart:{result:[{meta:{regularMarketPrice:143.89,currentTradingPeriod:{pre:{start:T0,end:T0+19800},regular:{start:T0+19800,end:T0+43200},post:{start:T0+43200,end:T0+57600}}},timestamp:bars.map(b=>b[0]),indicators:{quote:[{close:bars.map(b=>b[1])}]}}]}});
test('pre-market: latest print vs regular close',()=>{const e=lastExt(raw([[T0-100,143.89],[T0+600,139],[T0+660,138],[T0+720,null]]),(T0+700)*1000);
  assert.deepStrictEqual(e,{session:'pre',price:138,at:(T0+660)*1000,base:143.89});});
test('regular hours: nothing',()=>assert.strictEqual(lastExt(raw([[T0+20000,140]]),(T0+21000)*1000),null));
test('no print yet this session: nothing',()=>assert.strictEqual(lastExt(raw([[T0-100,143.89]]),(T0+100)*1000),null));
test('bad data / failed fetch: quiet',async()=>{assert.strictEqual(lastExt({},Date.now()),null);
  const o=await getExt(['A','B'],{fetchImpl:async u=>u.includes('/A?')?{ok:false}:{ok:true,json:async()=>raw([[T0+60,10]])},now:(T0+120)*1000});assert.deepStrictEqual(Object.keys(o),['B']);});
const ext=new Function('extq',extractFn('extLine')+'\nreturn extLine;');
test('label: pre-market / after hours, % vs close, hidden when stale',()=>{const now=Date.now();
  assert.strictEqual(ext({S:{session:'pre',price:138,at:now-60000,base:143.89}})('S',now),'Pre-market $138.00 (−4.1%)');
  assert.strictEqual(ext({S:{session:'post',price:150,at:now,base:143.89}})('S',now),'After hours $150.00 (+4.2%)');
  assert.strictEqual(ext({S:{session:'pre',price:138,at:now-16*60000,base:143.89}})('S',now),'');
  assert.strictEqual(ext({})('S',now),'');});
test('display only: never feeds prices used for maths',()=>{
  assert.ok(!/extq[^\n]*quotes\[|quotes\[[^\n]*extq/.test(SRC));
  const f=extractFn('_priceOf');assert.ok(!f.includes('extq'));assert.ok(!extractFn('_optSpots').includes('extq'));
  assert.ok(SRC.includes('${extHtml(wheel.ticker)}')&&SRC.includes("${extHtml(l.underlying,")&&SRC.includes('await fetchExtQuotes(allSyms);'));});

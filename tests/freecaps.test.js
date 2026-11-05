// freecaps.test.js — Free caps (2 open wheel tickers, 1 open LEAP) on every creation route; Pro/founder unlimited; over-limit data kept.
const test=require('node:test');const assert=require('node:assert');const fs=require('fs'),path=require('path'),vm=require('vm');
const{extractFn}=require('./extract');const SRC=fs.readFileSync(path.join(__dirname,'..','app','index.html'),'utf8');
const ctx={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','app','brand.js'),'utf8'),ctx);const ON=ctx.window.BRAND.plans,OFF={...ON,gating:false};
const G=new Function("let _ent=null,_entErr=false;"+['planCfg','isPro','canUse','underLimit','wheelCapOk','leapCapOk','capNewLeaps'].map(extractFn).join('\n')+'\nreturn{wheelCapOk,leapCapOk,capNewLeaps};')();
const FREE={plan:'free'},PRO={plan:'pro'},FOUNDER={founder:true};
const W=n=>Array.from({length:n},(_,i)=>({id:'w'+i,ticker:'T'+i,status:'open'}));
const LEAP=(id,st='open')=>({id,side:'long',type:'C',status:st});
test('free limits are 2 tickers / 1 LEAP',()=>{assert.strictEqual(ON.free.maxWheelTickers,2);assert.strictEqual(ON.free.maxOpenLeaps,1);});
test('gating off: no caps',()=>{assert.ok(G.wheelCapOk('NEW',W(10),OFF,FREE,false));assert.ok(G.leapCapOk(1,[LEAP('a'),LEAP('b')],OFF,FREE,false));});
test('free: 2nd wheel ok, 3rd blocked; closed wheels do not count',()=>{assert.ok(G.wheelCapOk('NEW',W(1),ON,FREE,false));assert.ok(!G.wheelCapOk('NEW',W(2),ON,FREE,false));
  assert.ok(G.wheelCapOk('NEW',[...W(1),{id:'c',ticker:'OLD',status:'closed'}],ON,FREE,false));});
test('free: 1 LEAP ok, 2nd blocked; closed LEAPs do not count',()=>{assert.ok(G.leapCapOk(1,[LEAP('x','closed')],ON,FREE,false));assert.ok(!G.leapCapOk(1,[LEAP('a')],ON,FREE,false));});
test('pro and founder unlimited',()=>{[PRO,FOUNDER].forEach(e=>{assert.ok(G.wheelCapOk('NEW',W(20),ON,e,false));assert.ok(G.leapCapOk(1,[LEAP('a'),LEAP('b')],ON,e,false));});});
test('entitlement read failure stays fail-open (treated as Pro)',()=>{assert.ok(G.wheelCapOk('NEW',W(9),ON,null,true));});
test('over-limit free user: keeps data, can add to existing tickers, cannot add new',()=>{const w=W(5);
  assert.ok(G.wheelCapOk('T4',w,ON,FREE,false));assert.ok(!G.wheelCapOk('NEW',w,ON,FREE,false));assert.strictEqual(w.length,5);
  assert.ok(!G.leapCapOk(1,[LEAP('a'),LEAP('b')],ON,FREE,false));});
test('import: excess open LEAPs dropped with their calls; closed history kept; Pro keeps all',()=>{
  const nl=[LEAP('n1'),LEAP('n2'),{id:'s2',side:'short',parentLeapId:'n2',status:'open'},LEAP('h','closed')];
  const r=G.capNewLeaps([],nl,ON,FREE,false);assert.deepStrictEqual(r.keep.map(l=>l.id),['n1','h']);assert.strictEqual(r.droppedLeaps,1);
  assert.strictEqual(G.capNewLeaps([LEAP('a')],nl,ON,FREE,false).keep.map(l=>l.id).join(),'h');
  assert.strictEqual(G.capNewLeaps([],nl,ON,PRO,false).keep.length,4);});
const body=n=>{const s=extractFn(n);assert.ok(s,n);return s;};
test('every creation route checks the cap',()=>{
  assert.match(body('openNewPos'),/wheelCapOk\(null,db\.wheels\)/);assert.match(body('quickAddRotation'),/wheelCapOk\(ticker/);
  assert.match(body('saveWheel'),/wheelCapOk\(ticker/);assert.match(body('openLeapAdd'),/leapCapOk\(1,db\.opts\)/);assert.match(body('saveLeap'),/!old&&!leapCapOk/);
  assert.strictEqual((body('confirmParsed').match(/wheelCapOk\(/g)||[]).length,2); // SmartScan single + roll
  const imp=body('doImport');assert.match(imp,/wheelCapOk\(ticker,db\.wheels\)\)\{capSkipTickers/);assert.strictEqual((imp.match(/capNewLeaps\(/g)||[]).length,2);
  // manual trade forms that can create a wheel
  assert.strictEqual((SRC.match(/if\(ex\)\{wheelId=ex\.id;\}else\{if\(!wheelCapOk\(ticker,db\.wheels\)\)/g)||[]).length,2);
  assert.ok(!/if\(ex\)\{wheelId=ex\.id;\}else\{const mo/.test(SRC));});

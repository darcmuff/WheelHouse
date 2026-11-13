const test=require('node:test');const assert=require('node:assert');const fs=require('fs'),path=require('path');
const{extractFn}=require('./extract');const SRC=fs.readFileSync(path.join(__dirname,'..','app','index.html'),'utf8');
const L=new Function("const USER_COLLECTIONS=['wheels','trades','optlegs'];"+['_csvCell','toCSV','buildExport','deleteAllUserData'].map(n=>{const s=extractFn(n);return s.startsWith('function')&&n==='deleteAllUserData'?'async '+s:s;}).join('\n')+'\nreturn{toCSV,buildExport,deleteAllUserData};')();
const data={wheels:[{id:'w1',ticker:'ZEPH'}],trades:[{id:'t1',wheelId:'w1',type:'CSP',premium:1.25,pnl:-40,note:'rolled, "early"'},{id:'t2',note:'=HYPERLINK("x")'}],optlegs:[{id:'o1',ticker:'KOLA',side:'long'}]};
test('export JSON has everything',()=>{const j=JSON.parse(L.buildExport(data,{at:'2026-11-01T00:00:00Z',email:'a@b.c'}).json);
  assert.strictEqual(j.wheels.length,1);assert.strictEqual(j.trades.length,2);assert.strictEqual(j.leaps[0].ticker,'KOLA');assert.strictEqual(j.account,'a@b.c');});
test('export CSV: one row per record, quoted safely, numbers untouched, formulas neutralised',()=>{const c=L.buildExport(data).csv.split('\r\n');
  assert.strictEqual(c.length,5);assert.ok(c[0].startsWith('record,id,ticker'));assert.ok(c.some(r=>r.includes('"rolled, ""early"""')));
  assert.ok(c.some(r=>r.includes(',-40,')));assert.ok(c.some(r=>r.includes(`"'=HYPERLINK(""x"")"`)));});
function fake(){const store={wheels:['w1','w2'],trades:['t1'],optlegs:['o1']};return{store,list:async c=>[...store[c]],del:async(c,id)=>{store[c]=store[c].filter(x=>x!==id);}};}
test('delete removes every document in every collection',async()=>{const f=fake();assert.strictEqual(await L.deleteAllUserData('u1',f),4);assert.deepStrictEqual(f.store,{wheels:[],trades:[],optlegs:[]});});
test('delete refuses without a user and reports leftovers',async()=>{await assert.rejects(L.deleteAllUserData('',fake()));const f=fake();f.del=async()=>{};await assert.rejects(L.deleteAllUserData('u1',f),/could not be deleted/);});
test('delete flow: confirm word, re-sign-in, data before login',()=>{const d=extractFn('doDeleteAccount');
  assert.ok(d.includes("!=='DELETE'"));const re=d.indexOf('reauthenticate'),da=d.indexOf('deleteAllUserData('),rel=d.indexOf('releaseFirestore('),du=d.indexOf('deleteUser(u)');assert.ok(re>0&&re<da&&da<rel&&rel<du,'listeners stop after the data is gone and before the login is deleted');
  assert.ok(/id="delete-go"[^>]*disabled/.test(SRC));});
test('settings and sign-up link to the legal page; export and delete in settings',()=>{
  assert.ok(/id="settings-export"[^>]*exportMyData\(\)/.test(SRC));assert.ok(/id="settings-delete"[^>]*openDeleteAccount\(\)/.test(SRC));assert.ok(/id="settings-legal" href="legal.html"/.test(SRC));
  assert.ok(/id="settings-support"[^>]*href="mailto:support@optrack\.app\?subject=OpTrack%20support"/.test(SRC)&&SRC.includes('>support@optrack.app</span>'),'Settings contact mailto');
  assert.ok(/id="auth-legal"[\s\S]{0,400}legal.html#terms[\s\S]{0,200}legal.html#privacy[\s\S]{0,200}legal.html#advice/.test(SRC));
  ['exportMyData','openDeleteAccount','doDeleteAccount'].forEach(f=>assert.ok(SRC.includes(`window.${f} = ${f}`),f));});
test('legal page: draft, three sections, brand-driven, delete instructions',()=>{const h=fs.readFileSync(path.join(__dirname,'..','app','legal.html'),'utf8');
  ['id="advice"','id="privacy"','id="terms"','DRAFT','Marc Duff','Firebase','sell your data','Delete account','Export my data','brand.js'].forEach(s=>assert.ok(h.includes(s),s));});

const test=require('node:test');const assert=require('node:assert');const fs=require('fs'),path=require('path');
const{extractFn}=require('./extract');
const SRC=fs.readFileSync(path.join(__dirname,'..','app','index.html'),'utf8');
const OPTS=new Function(extractFn('optionsLib')+'\nreturn optionsLib();')();
const T=new Function('OPTS',['leapStats','pmccShortsFor','pmccStats','leapTileTotals'].map(extractFn).join('\n')+'\nreturn {leapTileTotals,pmccStats,leapStats};')(OPTS);
const today='2026-10-29';
const A={id:'a',underlying:'AAA',type:'C',side:'long',strike:100,expiry:'2028-01-21',entryDate:'2026-01-02',qty:1,entryPrice:30,fees:1,status:'open',mark:35};
const B={id:'b',underlying:'BBB',type:'C',side:'long',strike:50,expiry:'2028-01-21',entryDate:'2026-01-02',qty:2,entryPrice:10,status:'open'}; // no mark
const C={id:'c',underlying:'CCC',type:'C',side:'long',strike:20,expiry:'2026-09-30',entryDate:'2025-01-02',qty:1,entryPrice:5,status:'open',mark:4}; // expired
const A0={id:'a0',underlying:'AAA',type:'C',side:'long',strike:90,expiry:'2027-06-17',qty:1,entryPrice:25,status:'rolled'};
A.rolledFrom='a0';
const sh=(id,p,q,st,cp,parent,ex)=>({id,underlying:'AAA',type:'C',side:'short',strike:120,expiry:ex||'2026-11-20',qty:q,entryPrice:p,status:st,closePrice:cp,parentLeapId:parent});
const legs=[A0,A,B,C,sh('s1',2,1,'closed',0.5,'a0'),sh('s2',1.5,1,'expired',null,'a'),sh('s3',1,2,'closed',1.4,'b'),{...sh('s4',3,1,'open',null,'a'),expiry:'2026-12-18'}];
const r=T.leapTileTotals([A,B,C],legs,{AAA:110,BBB:55,CCC:22},today);
test('LEAP cost sums entry ×100×qty + fees',()=>assert.strictEqual(r.cost,3001+2000+500));
test('Value now excludes LEAPs with no price and expired ones',()=>{assert.strictEqual(r.value,3500);assert.strictEqual(r.noPrice,2);assert.strictEqual(r.n,3);});
test('Calls collected includes rolled-from legs and matches cards',()=>{
  const per=[A,B,C].map(l=>T.pmccStats(l,legs,today));
  assert.strictEqual(r.calls,Math.round(per.reduce((a,p)=>a+p.net,0)*100)/100);
  assert.strictEqual(r.adj,Math.round(per.reduce((a,p)=>a+p.adj,0)*100)/100);
  assert.strictEqual(r.adj,Math.round((r.cost-r.calls)*100)/100);
  assert.ok(T.pmccStats(A,legs,today).net>=150+150);});
test('demo LEAPs are left out',()=>assert.strictEqual(T.leapTileTotals([{...A,demo:true}],legs,{},today).n,0));
test('old tiles gone, tips short',()=>{const a=SRC.indexOf('function renderOptions('),h=SRC.slice(a,SRC.indexOf('\n}\n',a));
  ['Share equivalent','Time value','combined delta','Market value'].forEach(x=>assert.ok(!h.includes(x),x));
  const tips=[...h.matchAll(/ii\('([^']*(?:\\'[^']*)*)'\)/g)].map(m=>m[1]);assert.strictEqual(tips.length,4);tips.forEach(t=>assert.ok(t.length<=120,t));});
test('open call premium is never counted (realised only)',()=>{
  const P=T.pmccStats(A,legs,today);assert.strictEqual(P.net,150+150);assert.strictEqual(P.adj,3001-300);
  assert.strictEqual(r.calls,300+(100*2-140*2));});

const test=require('node:test');const assert=require('node:assert');const fs=require('fs'),path=require('path');
const{extractFn}=require('./extract');
const SRC=fs.readFileSync(path.join(__dirname,'..','app','index.html'),'utf8');
const OPTS=new Function(extractFn('optionsLib')+'\nreturn optionsLib();')();
const T=new Function('OPTS',['leapStats','pmccShortsFor','pmccStats','leapTileTotals','leapCallsBanked','leapNextAct'].map(extractFn).join('\n')+'\nreturn {leapTileTotals,pmccStats,leapStats,leapCallsBanked,leapNextAct};')(OPTS);
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
test('Value now % and colour: against the cost of the same priced, unexpired LEAPs',()=>{
  assert.strictEqual(r.pricedCost,3001);assert.strictEqual(r.valuePct,Math.round(499/3001*10000)/100);assert.strictEqual(r.valueCls,'g');
  const lo=T.leapTileTotals([{...A,mark:20}],legs,{AAA:110},today);assert.strictEqual(lo.valueCls,'r');assert.ok(lo.valuePct<0);
  const eq=T.leapTileTotals([{...A,fees:0,mark:30}],legs,{AAA:110},today);assert.strictEqual(eq.valuePct,0);assert.strictEqual(eq.valueCls,'');
  const none=T.leapTileTotals([B,C],legs,{BBB:55,CCC:22},today);assert.strictEqual(none.valuePct,null);assert.strictEqual(none.valueCls,'');
  const h=SRC.slice(SRC.indexOf('function renderOptions('));assert.ok(h.includes('T.valueCls,vPct)')&&h.includes('lc-pct ${T.valueCls'));});
test('Calls banked: closed/expired calls across all LEAPs, all time and this month; open calls never count',()=>{
  const cb=T.leapCallsBanked([A0,A,B,C],legs,today);
  const want=[ 's1','s2','s3' ].map(id=>OPTS.legPnL(legs.find(l=>l.id===id)).realized).reduce((a,b)=>a+b,0);
  assert.strictEqual(cb.all,Math.round(want*100)/100);
  const m=T.leapCallsBanked([A],[A,{...legs.find(l=>l.id==='s2'),expiry:'2026-10-16',closeDate:'2026-10-16'}],today);assert.strictEqual(m.month,m.all);
  assert.strictEqual(T.leapCallsBanked([A],[A,{...legs.find(l=>l.id==='s2'),closeDate:'2026-09-01',expiry:'2026-09-01'}],today).month,0);});
test('Next to act: expired LEAP first, else the soonest call expiry or LEAP near expiry, else nothing',()=>{
  assert.ok(/expired/.test(T.leapNextAct([A,C],legs,today).text));
  const n=T.leapNextAct([A],legs,today);assert.strictEqual(n.id,'a');assert.ok(/^AAA \$120C expires in \d+ days$/.test(n.text),n.text);
  const near={...A,id:'n',expiry:'2026-11-05'};assert.ok(/LEAP: 7 days left/.test(T.leapNextAct([near],[near],today).text));
  assert.strictEqual(T.leapNextAct([{...A,id:'z'}],[],today),null);});
test('tiles: Total value, Unrealised P&L, Calls banked, Next to act; card header shows Calls collected under Cost after calls',()=>{
  const a=SRC.indexOf('function renderOptions('),h=SRC.slice(a,SRC.indexOf('\n}\n',a));
  ['Total value','Unrealised P&amp;L','Calls banked','Next to act','This month','Nothing due',"goToLeap("].forEach(x=>assert.ok(h.includes(x),x));
  ['`LEAP cost','`Value now','`Calls collected','`Cost after calls'].forEach(x=>assert.ok(!h.includes(x),x));
  assert.ok(SRC.includes('<div class="lc-v lc-mut">${m0(P.adj)}</div><div class="lc-pct')&&SRC.includes('Calls collected ${P.net<0'));});

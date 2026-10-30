// Robinhood account activity report CSV → wheel trades + LEAP legs (fake data in fixtures/robinhood.csv).
const test=require('node:test');const assert=require('node:assert');const fs=require('fs'),path=require('path');
const{extractFn,extractConst}=require('./extract');
const code=['ACTION_MAP','VALID_ACTIONS','CREDITS','MON_PAT','MON_MAP'].map(n=>{try{return extractConst(n);}catch(e){return'';}}).join('\n')+'\n'+
  ['isCredit','computeTotal','parseCSVLine','normDate','brokerCSVLib','rhPlan'].map(extractFn).join('\n');
const L=new Function(code+'\nreturn{B:brokerCSVLib(),rhPlan};')();
const CSV=fs.readFileSync(path.join(__dirname,'fixtures','robinhood.csv'),'utf8');
let n=0;const mk=()=>'id'+(++n);
const p=L.B.parseBrokerCSV(CSV);
const P=L.rhPlan(p.rh,[],[],mk);
const W=P.wheelRows,legs=P.newLegs;
test('detected as Robinhood, footer and blank lines ignored',()=>{assert.strictEqual(p.broker,'Robinhood');assert.strictEqual(p.unrecognised.length,0,JSON.stringify(p.unrecognised));});
test('non-trades skipped with plain reasons',()=>{const r=p.skipped.map(s=>s.reason).sort();assert.deepStrictEqual(r,['Gold subscription','cash in or out','dividend','interest']);});
test('wheel trades: puts, expiry, assignment, calls, buy back, called away, share buy',()=>{
  assert.deepStrictEqual(W.map(r=>r.entered+' '+r.action+' '+(r.strike||'')),
   ['2026-03-02 CSP 40','2026-03-20 EXP 40','2026-03-23 CSP 40','2026-04-17 IN 40','2026-04-20 STOC 42','2026-05-01 BTC 42','2026-05-01 STOC 43','2026-05-06 IN ','2026-05-15 OUT 43']);
  const csp=W[0];assert.strictEqual(csp.shares,200);assert.strictEqual(csp.premium,1);assert.strictEqual(csp.fees,0.08);assert.strictEqual(csp.total,199.92);assert.strictEqual(csp.expiry,'2026-03-20');assert.strictEqual(csp.days,18);
  const btc=W[5];assert.strictEqual(btc.fees,0.08);assert.strictEqual(btc.total,40.08);
  assert.strictEqual(W[3].shares,200);assert.strictEqual(W[3].premium,40);assert.strictEqual(W[8].premium,43);
  assert.strictEqual(W[7].shares,10);assert.strictEqual(W[7].premium,41.5);});
test('assignment share rows are not counted twice; share trades on other stocks skipped',()=>{
  assert.strictEqual(P.skipped.filter(s=>/assignment/.test(s.reason)).length,2);
  assert.strictEqual(P.skipped.filter(s=>/don't wheel/.test(s.reason)).length,1);});
test('LEAP and its calls: bought, sold, expired, bought back, re-sold',()=>{
  const leap=legs.find(l=>l.side==='long');assert.ok(leap);assert.strictEqual(leap.expiry,'2028-01-21');assert.strictEqual(leap.entryPrice,30);assert.strictEqual(leap.fees,0.04);
  const sh=legs.filter(l=>l.side==='short');assert.strictEqual(sh.length,3);assert.ok(sh.every(l=>l.parentLeapId===leap.id));
  const [a,b,c]=sh;assert.strictEqual(a.status,'expired');assert.strictEqual(b.status,'closed');assert.strictEqual(b.closePrice,0.4);assert.strictEqual(b.closeFees,0.04);assert.strictEqual(b.fees,0.04);
  assert.strictEqual(c.status,'open');assert.strictEqual(c.strike,128);
  assert.ok(!c.rolledFrom,'same-day buy back + new sale is not guessed as a roll');
  assert.strictEqual(P.lines.length,6);});
test('re-import: everything already in WheelHouse is skipped',()=>{
  const opts=legs.map(l=>({...l})),trades=W.map(r=>({...r}));
  const Q=L.rhPlan(L.B.parseBrokerCSV(CSV).rh,opts,trades,mk);
  assert.strictEqual(Q.wheelRows.length,0);assert.strictEqual(Q.newLegs.length,0);assert.strictEqual(Q.changedLegs.length,0);
  assert.strictEqual(Q.dupes,W.length+legs.length+2);});
test('a later report closes a call already in WheelHouse',()=>{
  const open=legs.map(l=>({...l}));const csv='"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"\n"5/8/2026","5/8/2026","5/8/2026","KOLA","KOLA 5/15/2026 Call $128.00","BTC","1","$0.30","($30.04)"\n';
  const Q=L.rhPlan(L.B.parseBrokerCSV(csv).rh,open,[],mk);
  assert.strictEqual(Q.changedLegs.length,1);assert.strictEqual(Q.changedLegs[0].status,'closed');assert.strictEqual(Q.changedLegs[0].closeFees,0.04);assert.strictEqual(Q.wheelRows.length,0);});
test('covered call on wheel shares stays on the wheel even with a LEAP on that ticker',()=>{
  const opts=[{id:'L',underlying:'ZEPH',type:'C',side:'long',strike:30,expiry:'2028-01-21',qty:1,entryPrice:10,status:'open'}];
  const csv='"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"\n"5/8/2026","5/8/2026","5/8/2026","ZEPH","ZEPH 5/29/2026 Call $45.00","STO","1","$0.50","$49.96"\n';
  const Q=L.rhPlan(L.B.parseBrokerCSV(csv).rh,opts,[{ticker:'ZEPH',action:'IN',shares:100}],mk);
  assert.strictEqual(Q.wheelRows.length,1);assert.strictEqual(Q.wheelRows[0].action,'STOC');assert.strictEqual(Q.newLegs.length,0);});

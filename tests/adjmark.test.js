const test=require('node:test');const assert=require('node:assert');const{extractFn}=require('./extract');const fs=require('fs'),path=require('path');
const adjMark=new Function(extractFn('adjMark')+'\nreturn adjMark;')();
const SRC=fs.readFileSync(path.join(__dirname,'..','app','index.html'),'utf8');
test('delayed Cboe put mid brought up to the live stock price (30 Oct example)',()=>{
  // Cboe: bid 2.48 ask 2.61 (mid 2.545), Δ −0.2649, Γ 0.022 at SPCX 138.13; live SPCX 136.93 → ≈ 2.88 (Robinhood showed 2.86)
  assert.strictEqual(adjMark(2.545,-0.2649,0.022,138.13,136.93),2.88);});
test('captured vs Robinhood: (1.74 − 2.86)/1.74 = −64.37% on gross premium',()=>assert.strictEqual(Math.round((1.74-2.86)/1.74*100),-64));
test('no greeks or no live price: raw mid',()=>{assert.strictEqual(adjMark(2.545,null,null,138,137),2.55);assert.strictEqual(adjMark(2.5,-0.3,0.02,138,null),2.5);});
test('never below a cent; null mid stays null',()=>{assert.strictEqual(adjMark(0.05,0.5,0,100,80),0.01);assert.strictEqual(adjMark(null,0.5,0,1,1),null);});
test('marks refresh every minute and re-adjust after each stock refresh',()=>{
  assert.ok(SRC.includes('Date.now()-_wheelMarksAt<60e3')&&SRC.includes('Date.now()-_optMarksAt<60e3'));
  assert.ok(SRC.includes('    _applyWheelMarks();\n'));assert.ok(SRC.includes('mark:adjMark(mid,c.delta,c.gamma,j.spot,live)'));});

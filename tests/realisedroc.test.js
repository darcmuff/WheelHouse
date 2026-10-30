const test=require('node:test');const assert=require('node:assert');const{extractFn}=require('./extract');
const F=new Function('let db;'+['walkLegPairs','realisedPremium','shareRealisations','calcWheel','calcAROC','calcTradeROC'].map(extractFn).join('\n')+'\nreturn{set:d=>db=d,calcWheel,calcAROC,calcTradeROC};')();
const W={id:'w1',status:'open'};
const tr=[{id:'a',wheelId:'w1',ticker:'X',action:'CSP',entered:'2026-01-01',expiry:'2026-01-30',strike:100,shares:100,total:200,days:29},
          {id:'b',wheelId:'w1',ticker:'X',action:'CSP',entered:'2026-10-20',expiry:'2026-11-20',strike:100,shares:100,total:300,days:31}];
test('ROC/AROC count only realised premium (expired $200), never the open $300 put',()=>{
  F.set({trades:tr,wheels:[W]});const m=F.calcWheel(W);assert.strictEqual(m.premiumRealised,200);assert.strictEqual(m.premiumNet,500);
  assert.strictEqual(F.calcAROC(W,m).roc,2);});
test('per-trade ROC: open sell has none; closed uses realised net',()=>{
  assert.strictEqual(F.calcTradeROC(tr[1],null),null);assert.ok(Math.abs(F.calcTradeROC(tr[0],200)-200/10000*365/29*100)<1e-9);});

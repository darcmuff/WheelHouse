const test=require('node:test');const assert=require('node:assert');const{extractFn}=require('./extract');
const OPTS=new Function(extractFn('optionsLib')+'\nreturn optionsLib();')();
const F=new Function('OPTS',extractFn('leapStats')+extractFn('leapUnrealPct')+'\nreturn{leapStats,leapUnrealPct};')(OPTS);
const L={status:'open',side:'long',type:'C',qty:2,strike:100,expiry:'2028-01-21',entryDate:'2026-01-02',entryPrice:30,fees:2,mark:36};
test('Unrealised % = LEAP gain ÷ paid incl. fees',()=>{const S=F.leapStats(L,120,'2026-10-30');assert.strictEqual(S.pl,1198);assert.strictEqual(F.leapUnrealPct(S),19.96);});
test('no price or expired → no %',()=>{assert.strictEqual(F.leapUnrealPct(F.leapStats({...L,mark:null},120,'2026-10-30')),null);
  assert.strictEqual(F.leapUnrealPct(F.leapStats({...L,expiry:'2026-09-30'},120,'2026-10-30')),null);});

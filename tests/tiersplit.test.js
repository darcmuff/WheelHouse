const{appSrc}=require('./appsrc');
// tiersplit.test.js — v426 Free vs Pro/Trial split: caps, close-only downgrade, option quotes, copy.
const test=require('node:test');const assert=require('node:assert');const fs=require('fs'),path=require('path'),vm=require('vm');
const T=require('../app/entitlement.js');const{extractFn}=require('./extract');
const A=path.join(__dirname,'..','app');const SRC=appSrc();
const ctx={window:{}};vm.runInNewContext(fs.readFileSync(path.join(A,'brand.js'),'utf8'),ctx);const P=ctx.window.BRAND.plans;
const G=new Function('OT_TIER','let _ent=null,_entErr=false,db={wheels:[],opts:[]};'+['planCfg','_tierLib','effectiveTier','isPro','canUse','underLimit','wheelCapOk','leapCapOk','csvImportOk','openTickerCount','openLeapCount','isOpenRisk','wheelRiskOk','pmccRiskOk','liveOptionPricesOn'].map(extractFn).join('\n')+'\nreturn{isPro,canUse,wheelCapOk,leapCapOk,csvImportOk,wheelRiskOk,pmccRiskOk,liveOptionPricesOn,isOpenRisk};')(T);
const FREE={plan:'free'},PRO={plan:'pro'};
const W=n=>Array.from({length:n},(_,i)=>({id:'w'+i,ticker:'T'+i,status:'open'}));
const LEAP=(id,st='open')=>({id,side:'long',type:'C',status:st});
const T0=Date.parse('2026-12-01T10:00:00Z');
const trialEnt=()=>({...T.trialFields(T0)});

test('plan copy is exact, USD, US spelling; never says real-time or option marks',()=>{
  const C=T.planCopy();
  assert.strictEqual(C.free,'Full OpTrack — auto-updating stock prices, SmartScan, OpTrack Bot, PMCCs, and reports — for 2 active wheels and 1 active LEAP/PMCC (plus 1 Robinhood CSV import).');
  assert.strictEqual(C.pro,'Unlimited wheels, unlimited LEAPs & PMCCs, unlimited CSV imports, and auto-updating option prices.');
  assert.strictEqual(C.trial,'Try Pro free for 14 days · No credit card required.');
  assert.strictEqual(C.optionPrices,'Auto-updating option prices');
  assert.strictEqual(C.optionPricesCue,'Auto option prices · Pro');
  const D=T.priceDisplay(P);
  assert.strictEqual(D.annual.line,'$4.92/mo billed yearly');
  assert.strictEqual(D.monthly.perMonthText,'$6.99');
  const L=fs.readFileSync(path.join(A,'landing.html'),'utf8');
  const St=fs.readFileSync(path.join(A,'start.html'),'utf8');
  assert.ok(L.includes(C.trial)&&St.includes(C.trial));
  assert.ok(L.includes('$4.92/mo billed yearly')&&St.includes('$4.92/mo billed yearly'));
  assert.ok(!L.includes('$4.92/mo billed yearly · Save')&&!St.includes('$4.92/mo billed yearly · Save'),'billed line must not repeat Save 30%');
  assert.ok(L.includes('id="pro-save">Save 30%')&&SRC.includes('id="upg-save"')&&SRC.includes('Save 30%'),'Save 30% badge stays');
  assert.strictEqual(ctx.window.BRAND.featureNames.unlimited,'Unlimited wheels, LEAPs, CSV imports, and auto-updating option prices.');
  assert.ok(SRC.includes("id=\"upg-free\"")&&SRC.includes("id=\"upg-trial\"")&&/planCopy/.test(extractFn('openUpgrade')));
  for(const [name,txt] of [['landing',L],['start',St],['brand',fs.readFileSync(path.join(A,'brand.js'),'utf8')],['entitlement',fs.readFileSync(path.join(A,'entitlement.js'),'utf8')]]){
    assert.ok(!/real-time|option marks/i.test(txt),name+' must not say real-time or option marks');
  }
});

test('Free within cap: open/roll wheels and PMCC short calls, stock prices, analytics, report, targets',()=>{
  const info=T.getEffectiveTier(FREE,T0);
  assert.strictEqual(info.tier,'free');
  assert.ok(T.canOpenWheel(info,['AAPL'],'TSLA',P));
  assert.ok(T.canOpenOrRollWheel(info,2,P));
  assert.ok(T.canOpenLeap(info,0,P));
  assert.ok(T.canAddPmccCall(info,1,P));
  assert.ok(T.canImportCsv(info,{csvImportsUsed:0},P));
  assert.ok(T.canSeeView(info,'analytics')&&T.canSeeView(info,'report'));
  assert.ok(G.canUse('analytics',P,FREE,false)&&G.canUse('report',P,FREE,false));
  assert.ok(G.wheelRiskOk(W(2),P,FREE,false)&&G.pmccRiskOk([LEAP('a')],P,FREE,false));
  assert.ok(!T.liveOptionPrices(info),'Free does not get auto-updating option prices');
  assert.match(extractFn('retTargetOn'),/return true/);
  assert.ok(!SRC.includes("v==='analytics'&&!canUse('analytics')"));
  assert.ok(G.canUse('smartscan',P,FREE,false));
});

test('Free blocks a 3rd wheel, a 2nd LEAP, and a 2nd CSV import',()=>{
  const info=T.getEffectiveTier(FREE,T0);
  assert.ok(!T.canOpenWheel(info,['AAPL','TSLA'],'NVDA',P));
  assert.ok(!T.canOpenLeap(info,1,P));
  assert.ok(!T.canImportCsv(info,{csvImportsUsed:1},P));
  assert.ok(!G.wheelCapOk('NEW',W(2),P,FREE,false));
  assert.ok(!G.leapCapOk(1,[LEAP('a')],P,FREE,false));
  assert.ok(!G.csvImportOk(P,{plan:'free',csvImportsUsed:1},false));
});

test('downgraded account with 4 open wheels and 2 open LEAPs: close-only, opens and rolls blocked',()=>{
  const info=T.getEffectiveTier({plan:'free',trialStartedAt:'2025-01-01T00:00:00Z',trialEndsAt:'2025-01-15T00:00:00Z'},T0);
  assert.strictEqual(info.tier,'free');
  const wheels=W(4),leaps=[LEAP('a'),LEAP('b')];
  assert.deepStrictEqual(T.existingDataAccess(),{view:true,edit:true,close:true,export:true,delete:true});
  // still attached to existing tickers (view/edit/close); cannot add a 5th
  assert.ok(T.canOpenWheel(info,wheels.map(w=>w.ticker),'T1',P));
  assert.ok(!T.canOpenWheel(info,wheels.map(w=>w.ticker),'NEW',P));
  assert.ok(!T.canOpenOrRollWheel(info,4,P));
  assert.ok(!T.canOpenLeap(info,2,P));
  assert.ok(!T.canAddPmccCall(info,2,P));
  assert.ok(!G.wheelRiskOk(wheels,P,FREE,false));
  assert.ok(!G.pmccRiskOk(leaps,P,FREE,false));
  assert.ok(T.isClosingAction('BTC')&&T.isClosingAction('OUT')&&T.isClosingAction('STC'));
  assert.ok(T.isOpeningAction('CSP')&&T.isOpeningAction('STOC')&&T.isOpeningAction('STO'));
  assert.ok(G.isOpenRisk('CSP',false)&&G.isOpenRisk('BTC',true)&&!G.isOpenRisk('BTC',false)&&!G.isOpenRisk('OUT',false));
  // wiring: save/edit of an existing trade is not gated; new opening legs are
  assert.match(extractFn('saveTrade'),/if\(!id&&isOpenRisk[\s\S]*wheelRiskOk/);
  assert.ok(!/wheelRiskOk|leapCapOk|openUpgrade/.test(extractFn('openLeapEdit'))&&!/openUpgrade/.test(extractFn('savePmccLeg')));
  // once back within caps, opening resumes
  assert.ok(T.canOpenOrRollWheel(info,2,P));
  assert.ok(T.canAddPmccCall(info,1,P));
  assert.ok(G.wheelRiskOk(W(2),P,FREE,false)&&G.pmccRiskOk([LEAP('a')],P,FREE,false));
});

test('active 14-day trial and paid Pro bypass caps and enable auto-updating option prices',()=>{
  const trial=T.getEffectiveTier(trialEnt(),T0);
  const pro=T.getEffectiveTier(PRO,T0);
  assert.strictEqual(trial.tier,'pro');assert.ok(trial.isTrial);
  assert.strictEqual(pro.tier,'pro');assert.ok(!pro.isTrial);
  for(const info of [trial,pro]){
    assert.ok(T.canOpenWheel(info,W(9).map(w=>w.ticker),'NEW',P));
    assert.ok(T.canOpenOrRollWheel(info,9,P));
    assert.ok(T.canOpenLeap(info,9,P));
    assert.ok(T.canAddPmccCall(info,9,P));
    assert.ok(T.canImportCsv(info,{csvImportsUsed:9},P));
    assert.ok(T.liveOptionPrices(info));
  }
  const live={...trialEnt()};
  assert.ok(G.wheelRiskOk(W(9),P,live,false)&&G.pmccRiskOk([LEAP('a'),LEAP('b'),LEAP('c')],P,live,false));
  assert.ok(G.liveOptionPricesOn(P,live,false));
  assert.ok(!G.liveOptionPricesOn(P,FREE,false));
  assert.ok(G.liveOptionPricesOn(P,PRO,false));
});

test('Free makes zero option-quote requests; blank marks have no NaN and show the Pro cue',async()=>{
  let calls=0;
  const run=new Function('db','liveOptionPricesOn','fetch','quotes','OPTS','AbortSignal',"let _optMarkStatus='',_optMarksAt=0,_wheelMarksAt=0,_wheelMarkRaw={},_wheelMarks={},view='x';const render=()=>{};const _applyWheelMarks=()=>{};const isRegularSession=()=>true;const openOptionLegs=ts=>ts;const wheelLegOcc=()=>'x';async "+extractFn('fetchOptchain')+"\nasync "+extractFn('fetchOptionMarks')+"\nasync "+extractFn('fetchWheelMarks')+'\nreturn Promise.all([fetchOptionMarks(false),fetchWheelMarks(true)]);');
  const db={opts:[{id:'l',status:'open',underlying:'AAPL',expiry:'2027-01-15',strike:200,type:'C',side:'long'}],wheels:[{id:'w',ticker:'AAPL',status:'open'}],trades:[{id:'t',wheelId:'w',action:'CSP',strike:100,expiry:'2027-01-15'}]};
  const fetch=async()=>{calls++;return{ok:true,json:async()=>({spot:0,contracts:{}})};};
  await run(db,()=>false,fetch,{},{occ:()=>'AAPL270115C00200000'},{timeout:()=>undefined});
  assert.strictEqual(calls,0,'Free must not hit optchain / Cboe / Nasdaq / Finnhub option fetches');
  calls=0;
  await run(db,()=>true,fetch,{},{occ:()=>'AAPL270115C00200000'},{timeout:()=>undefined});
  assert.ok(calls>0,'Pro / trial still fetch option quotes');

  const cue=new Function('liveOptionPricesOn','_tierLib',extractFn('optPriceCueHtml')+'\nreturn optPriceCueHtml();')(()=>false,()=>T);
  assert.ok(cue.includes('Auto option prices · Pro')&&!/NaN/.test(cue));
  const none=new Function('liveOptionPricesOn',extractFn('optPriceCueHtml')+'\nreturn optPriceCueHtml();')(()=>true);
  assert.strictEqual(none,'');

  const stFn=new Function(extractFn('rollChainStatus')+'\nreturn rollChainStatus;')();
  const st=stFn([{action:'CSP',total:200,shares:100,strike:50}],{action:'CSP',total:200,shares:100,strike:50},null);
  assert.strictEqual(st.chainNow,null);assert.strictEqual(st.openPnl,null);
  const html=new Function('optPriceCueHtml','fmtMoney',extractFn('rollStatusHtml')+'\nreturn rollStatusHtml;')(()=>cue,n=>'$'+Number(n).toFixed(2));
  const h=html(st,n=>'$'+Number(n).toFixed(2));
  assert.ok(h.includes('Auto option prices · Pro'));
  assert.ok(!h.includes('Chain P&L now'));
  assert.ok(!/NaN/.test(h));
});

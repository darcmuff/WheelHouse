// trial-tier.test.js — USD Pro pricing, 14-day reverse trial, Free vs Pro gates (v408).
const test=require('node:test');const assert=require('node:assert');const fs=require('fs'),path=require('path'),vm=require('vm');
const T=require('../app/entitlement.js');const{extractFn}=require('./extract');
const A=path.join(__dirname,'..','app');const SRC=fs.readFileSync(path.join(A,'index.html'),'utf8');
const ctx={window:{}};vm.runInNewContext(fs.readFileSync(path.join(A,'brand.js'),'utf8'),ctx);const P=ctx.window.BRAND.plans;
const DAY=864e5,T0=Date.parse('2026-12-01T10:00:00Z');
const trialUser=()=>({...T.trialFields(T0)});
// index.html gates, run against the real OT_TIER helper
const G=new Function('OT_TIER','let _ent=null,_entErr=false,db={wheels:[],opts:[]};'+['planCfg','_tierLib','effectiveTier','isPro','canUse','underLimit','wheelCapOk','leapCapOk','csvImportOk','openTickerCount','openLeapCount','wheelRiskOk','pmccRiskOk','liveOptionPricesOn'].map(extractFn).join('\n')+'\nreturn{isPro,canUse,wheelCapOk,leapCapOk,csvImportOk,effectiveTier,wheelRiskOk,pmccRiskOk,liveOptionPricesOn};')(T);

test('new user: Pro trial on days 1–14, Free after trialEndsAt',()=>{
  const u=trialUser();assert.strictEqual(Date.parse(u.trialEndsAt)-Date.parse(u.trialStartedAt),14*DAY);
  for(let d=0;d<14;d++){const r=T.getEffectiveTier(u,T0+d*DAY+3600e3);assert.strictEqual(r.tier,'pro','day '+(d+1));assert.strictEqual(r.isTrial,true);assert.strictEqual(r.trialDaysLeft,14-d);}
  assert.deepStrictEqual(T.getEffectiveTier(u,Date.parse(u.trialEndsAt)),{tier:'pro',isTrial:true,trialDaysLeft:1,paid:false},'now <= trialEndsAt is still trial');
  const after=T.getEffectiveTier(u,Date.parse(u.trialEndsAt)+1);assert.strictEqual(after.tier,'free');assert.strictEqual(after.isTrial,false);
  assert.strictEqual(T.getEffectiveTier(u,T0+15*DAY).tier,'free','day 15 is Free');
  assert.strictEqual(T.trialPillText(T.getEffectiveTier(u,T0+3*DAY)),'Pro trial · 11 days left');
});
test('existing free accounts without a trial stay Free; null entitlement is Free',()=>{
  assert.strictEqual(T.getEffectiveTier({plan:'free'},T0).tier,'free');assert.strictEqual(T.getEffectiveTier(null,T0).tier,'free');
  const{trialDecision}=require('../netlify/functions/account');
  assert.strictEqual(trialDecision({plan:'free'},T0-30*DAY,T0).start,false,'old account: no trial');
  assert.strictEqual(trialDecision(null,T0-3600e3,T0).start,true,'brand-new account: trial');
  assert.strictEqual(trialDecision({trialStartedAt:'2026-01-01'},T0-3600e3,T0).start,false,'never twice');
  assert.strictEqual(trialDecision({plan:'pro'},T0-3600e3,T0).start,false,'paid needs no trial');
});
test('paid Pro on new USD and legacy GBP price IDs stays Pro regardless of trialEndsAt',async()=>{
  const hook=require('../netlify/functions/stripe-webhook');const o={...process.env};
  Object.assign(process.env,{STRIPE_PRICE_PRO_ANNUAL_USD:'price_usd_y',STRIPE_PRICE_PRO_MONTHLY_USD:'price_usd_m',STRIPE_PRICE_YEARLY:'price_gbp_y',STRIPE_PRICE_MONTHLY:'price_gbp_m'});
  try{for(const price of ['price_usd_y','price_usd_m','price_gbp_y','price_gbp_m']){
    const S={u:{trialStartedAt:'2026-01-01T00:00:00Z',trialEndsAt:'2026-01-15T00:00:00Z'}};
    await hook.apply({type:'customer.subscription.updated',data:{object:{id:'sub',customer:'cus',status:'active',metadata:{uid:'u'},items:{data:[{price:{id:price},current_period_end:1}]}}}},{getEntitlement:async u=>S[u],setEntitlement:async(u,f)=>{S[u]={...S[u],...f};}});
    assert.strictEqual(S.u.plan,'pro',price);assert.strictEqual(S.u.priceId,price);assert.strictEqual(S.u.legacyPrice,price.includes('gbp'));
    const r=T.getEffectiveTier(S.u,T0);assert.strictEqual(r.tier,'pro');assert.strictEqual(r.isTrial,false);
    assert.strictEqual(T.getEffectiveTier({...S.u,trialEndsAt:new Date(T0+5*DAY).toISOString()},T0).isTrial,false,'paid wins over an active trial');
  }}finally{process.env=o;}
  assert.strictEqual(T.getEffectiveTier({founder:true,trialEndsAt:'2020-01-01'},T0).tier,'pro');
});
test('post-trial downgrade: existing data kept and editable; new ticker and 2nd LEAP blocked; PMCC calls allowed on the 1 LEAP',()=>{
  const ent={...trialUser(),plan:'free'};const now=T0+20*DAY;const info=T.getEffectiveTier(ent,now);assert.strictEqual(info.tier,'free');
  const wheels=['AAPL','TSLA','SOFI'].map((t,i)=>({id:'w'+i,ticker:t,status:'open'}));const legs=[{id:'a',side:'long',status:'open'},{id:'b',side:'long',status:'open'}];
  assert.deepStrictEqual(T.existingDataAccess(),{view:true,edit:true,close:true,export:true,delete:true});
  assert.ok(T.canOpenWheel(info,wheels.map(w=>w.ticker),'TSLA',P),'legs on an existing open ticker');assert.ok(!T.canOpenWheel(info,wheels.map(w=>w.ticker),'NVDA',P),'new ticker blocked');
  assert.ok(!T.canOpenLeap(info,1,P),'2nd LEAP blocked');assert.ok(T.canAddPmccCall(info,1,P),'PMCC calls on the allowed LEAP');assert.ok(!T.canAddPmccCall(info,2,P),'PMCC open/roll blocked when over the LEAP cap');
  assert.ok(!T.canOpenOrRollWheel(info,3,P),'opening/rolling blocked with 3 open wheels');assert.ok(T.canOpenOrRollWheel(info,2,P),'opening/rolling resumes at 2 open wheels');
  // the same rules through the app's real gate functions (expired trial, real clock is after Dec 2026 + 20d? use a past trial)
  const expired={plan:'free',trialStartedAt:'2025-01-01T00:00:00Z',trialEndsAt:'2025-01-15T00:00:00Z'};
  assert.ok(G.wheelCapOk('TSLA',wheels,P,expired,false));assert.ok(!G.wheelCapOk('NVDA',wheels,P,expired,false));
  assert.ok(!G.leapCapOk(1,legs,P,expired,false));assert.ok(!G.leapCapOk(1,legs.slice(0,1),P,expired,false),'1 open LEAP: a 2nd is blocked');assert.ok(G.leapCapOk(1,[],P,expired,false),'first LEAP allowed');
  const live={plan:'free',...T.trialFields(Date.now())};assert.ok(G.wheelCapOk('NVDA',wheels,P,live,false)&&G.leapCapOk(1,legs,P,live,false),'trial = Pro');
  // existing-data routes carry no gates; buying back a PMCC call is checked before the new-call gate
  ['openLeapEdit','buildExport','openPmccLegEdit','savePmccLeg'].forEach(f=>assert.ok(!/CapOk|canUse/.test(extractFn(f)),f+' is never gated'));
  ['openPmccSell','savePmcc','pmccSaveRoll'].forEach(f=>assert.ok(/pmccRiskOk/.test(extractFn(f))&&/openUpgrade/.test(extractFn(f)),f+': PMCC open/roll gated when over the LEAP cap'));
  assert.ok(!/pmccCallOk|pmccLockMsg/.test(SRC)&&!P.paidFeatures.includes('leaps-full'));
});
test('Free: 1 Robinhood CSV import (csvImportsUsed < 1); Pro / trial unlimited; counted server-side',async()=>{
  assert.ok(G.csvImportOk(P,{plan:'free'},false));assert.ok(G.csvImportOk(P,{plan:'free',csvImportsUsed:0},false));
  assert.ok(!G.csvImportOk(P,{plan:'free',csvImportsUsed:1},false));assert.ok(G.csvImportOk(P,{plan:'pro',csvImportsUsed:9},false));
  assert.ok(G.csvImportOk(P,{csvImportsUsed:5,...T.trialFields(Date.now())},false));
  assert.ok(SRC.includes('p.rh&&!csvImportOk()')&&(SRC.match(/_noteCsvImport\(p\);/g)||[]).length===2);
  const acc=require('../netlify/functions/account');const S={u:{csvImportsUsed:0}};
  const deps={bearerUser:async()=>({uid:'u'}),getEntitlement:async u=>S[u],setEntitlement:async(u,f)=>{S[u]={...S[u],...f};}};
  const r=await acc._handler({httpMethod:'POST',headers:{},body:'{"action":"csv-import"}'},{},deps);assert.strictEqual(r.statusCode,200);assert.strictEqual(S.u.csvImportsUsed,1);
});
test('Free skips auto-updating option prices; Pro and trial fetch them',async()=>{
  assert.ok(!P.paidFeatures.includes('live-refresh'),'live-refresh is not a paid feature');
  assert.ok(!/canUse\('live-refresh'\)/.test(SRC),'no live-price gate left in the app');
  assert.ok(!/canUse|openUpgrade/.test(extractFn('fetchWheelMarks'))&&!/canUse|openUpgrade/.test(extractFn('refreshLegMark')));
  let calls=0;const run=new Function('db','canUse','fetch','quotes','OPTS','AbortSignal',"let _optMarkStatus='',_optMarksAt=0,view='x';const render=()=>{};async "+extractFn('fetchOptchain')+"\nasync "+extractFn('fetchOptionMarks')+'\nreturn fetchOptionMarks(false);');
  try{await run({opts:[{id:'l',status:'open',underlying:'AAPL',expiry:'2027-01-15',strike:200,type:'C',side:'long'}]},()=>false,async()=>{calls++;return{ok:true,json:async()=>({spot:0,contracts:{}})};},{},{occ:()=>'AAPL270115C00200000'},{timeout:()=>undefined});}catch(e){}
  assert.ok(calls>0,'option quotes are requested when the live-price gate is off (undefined)');
  assert.ok(!T.liveOptionPrices(T.getEffectiveTier({plan:'free'},T0)));
  assert.ok(T.liveOptionPrices(T.getEffectiveTier({plan:'pro'},T0)));
  assert.ok(T.liveOptionPrices(T.getEffectiveTier(trialUser(),T0)),'active trial gets option prices');
  let freeCalls=0;const runFree=new Function('db','liveOptionPricesOn','fetch','quotes','OPTS','AbortSignal',"let _optMarkStatus='',_optMarksAt=0,view='x';const render=()=>{};async "+extractFn('fetchOptchain')+"\nasync "+extractFn('fetchOptionMarks')+'\nreturn fetchOptionMarks(false);');
  try{await runFree({opts:[{id:'l',status:'open',underlying:'AAPL',expiry:'2027-01-15',strike:200,type:'C',side:'long'}]},()=>false,async()=>{freeCalls++;return{ok:true,json:async()=>({spot:0,contracts:{}})};},{},{occ:()=>'AAPL270115C00200000'},{timeout:()=>undefined});}catch(e){}
  assert.strictEqual(freeCalls,0,'Free makes zero option-quote requests');
  for(const f of fs.readdirSync(A).filter(f=>/\.(html|js)$/.test(f)))assert.ok(!/once per visit/i.test(fs.readFileSync(path.join(A,f),'utf8')),f);
});
test('pricing: one config, USD $59/yr default ($4.92/mo, Save 30%) and $6.99/mo; no GBP left',()=>{
  const D=T.priceDisplay(P);assert.strictEqual(D.defaultInterval,'annual');assert.strictEqual(D.annual.perMonthText,'$4.92');assert.strictEqual(D.annual.line,'$4.92/mo billed yearly · Save 30%');assert.strictEqual(D.monthly.perMonthText,'$6.99');
  assert.strictEqual(P.trialDays,T.TRIAL_DAYS);
  for(const f of ['landing.html','start.html','brand.js'])assert.ok(!/£\s?\d|£9|£79/.test(fs.readFileSync(path.join(A,f),'utf8')),f);
  assert.ok(!/upg-yearly|£/.test(extractFn('openUpgrade')));
});
test('comparison table matches the agreed Free vs Pro split; landing, start and upgrade box read it',()=>{
  assert.deepStrictEqual(JSON.parse(JSON.stringify(P.comparison)),[
    ['Manual entry and SmartScan','✓','✓'],['OpTrack Bot <em>(requires Grok Bot)</em>','✓','✓'],
    ['Auto-updating stock prices','✓','✓'],['Auto-updating option prices','–','✓'],['Robinhood CSV import','1 import','Unlimited'],
    ['Realised P&amp;L and Home','✓','✓'],['Export and delete your data','✓','✓'],['Wheel tickers','Up to 2 open','Unlimited'],
    ['LEAPs &amp; PMCC tracking','1 open LEAP/PMCC','Unlimited LEAPs &amp; PMCCs'],
    ['Home monthly targets, analytics &amp; scoreboard','✓','✓'],['Plain-English account performance report','✓','✓']]);
  const L=fs.readFileSync(path.join(A,'landing.html'),'utf8'),St=fs.readFileSync(path.join(A,'start.html'),'utf8');
  assert.ok(L.includes('P.comparison')&&L.includes('src="entitlement.js"')&&St.includes('P.comparison')&&St.includes('src="entitlement.js"'));
  assert.ok(/P\.comparison/.test(extractFn('openUpgrade'))&&SRC.includes('id="upg-table"')&&SRC.includes('data-iv="annual" class="on"'));
  assert.ok(fs.readFileSync(path.join(A,'sw.js'),'utf8').includes("'./entitlement.js'"));
});
test('checkout: interval → USD env vars, clear error if missing, no Stripe at signup',async()=>{
  const checkout=require('../netlify/functions/checkout');const o={...process.env};
  try{process.env.STRIPE_SECRET_KEY='sk_test_x';process.env.STRIPE_PRICE_PRO_ANNUAL_USD='price_a';process.env.STRIPE_PRICE_PRO_MONTHLY_USD='price_m';
    let sent;const deps={bearerUser:async()=>({uid:'u',email:'u@x.com'}),getEntitlement:async()=>null,stripe:async(p,x)=>{sent=x;return{url:'https://checkout.stripe.com/x'};}};
    const call=b=>checkout._handler({httpMethod:'POST',headers:{origin:'https://optrack.app'},body:JSON.stringify(b)},{},deps);
    assert.strictEqual((await call({interval:'annual'})).statusCode,200);assert.strictEqual(sent['line_items[0][price]'],'price_a');
    assert.strictEqual((await call({interval:'monthly'})).statusCode,200);assert.strictEqual(sent['line_items[0][price]'],'price_m');
    assert.strictEqual((await call({})).statusCode,200);assert.strictEqual(sent['line_items[0][price]'],'price_a','default annual');
    delete process.env.STRIPE_PRICE_PRO_MONTHLY_USD;assert.strictEqual((await call({interval:'monthly'})).statusCode,200);assert.strictEqual(sent['line_items[0][price]'],'price_1Ug01bDsI2fxIBCJ67VgZOTK','no env: live monthly ID');
    delete process.env.STRIPE_PRICE_PRO_ANNUAL_USD;assert.strictEqual((await call({interval:'yearly'})).statusCode,200);assert.strictEqual(sent['line_items[0][price]'],'price_1Ug015DsI2fxIBCJocEZDG2e','no env: live annual ID');
  }finally{process.env=o;}
  const acc=fs.readFileSync(path.join(__dirname,'..','netlify/functions/account.js'),'utf8');assert.ok(!/require\('\.\.\/lib\/stripe'\)/.test(acc),'trial never touches Stripe');
  // start-trial writes only our own record, once
  const a=require('../netlify/functions/account');const S={};const deps={bearerUser:async()=>({uid:'n'}),getEntitlement:async u=>S[u]||null,setEntitlement:async(u,f)=>{S[u]={...(S[u]||{}),...f};},accountCreatedAt:async()=>T0-60e3,now:()=>T0};
  const r=await a._handler({httpMethod:'POST',headers:{authorization:'Bearer x'},body:'{"action":"start-trial"}'},{},deps);assert.strictEqual(JSON.parse(r.body).started,true);
  assert.strictEqual(S.n.trialEndsAt,new Date(T0+14*DAY).toISOString());
  const again=await a._handler({httpMethod:'POST',headers:{authorization:'Bearer x'},body:'{"action":"start-trial"}'},{},{...deps,now:()=>T0+30*DAY});assert.strictEqual(JSON.parse(again.body).started,false);assert.strictEqual(S.n.trialEndsAt,new Date(T0+14*DAY).toISOString());
  const rules=fs.readFileSync(path.join(__dirname,'..','firestore.rules'),'utf8');assert.ok(/match \/entitlements\/\{uid\} \{\s*allow read: if request\.auth != null && request\.auth\.uid == uid;\s*allow write: if false;/.test(rules),'browser can never write trial fields');
});
test('top banner: compliant Grok Bot copy, no "Brought to you by" or xAI logo; trial pill is quiet',()=>{
  const i=SRC.indexOf('<div class="tn-bot-wrap">');const bar=SRC.slice(i,SRC.indexOf('</div>',SRC.indexOf('tn-bot-x',i))+6);
  assert.ok(!/Brought to you by|tnb-xai/.test(SRC));assert.ok(bar.includes('Automate with Grok Bot')&&bar.includes('Never enter a trade again.')&&bar.includes('Get OpTrack Bot')&&bar.includes('otBotAdHide()'));
  assert.ok(SRC.includes('id="tn-trial"')&&/tn-trial-end',t\.trialDaysLeft<=3/.test(extractFn('syncTrialPill')));
  assert.ok(!/openModal\('mUpgrade'\)/.test(extractFn('syncTrialPill'))&&!/openUpgrade/.test(extractFn('_maybeStartTrial').replace(/openUpgrade\('trial'\)/,'')),'no popups on load');
});
test('Home "Return this month": monthly target is available on Free, Trial and Pro',()=>{
  const H=new Function('canUse',extractFn('retTargetOn')+'\n'+extractFn('homeReturnSettings')+'\nreturn homeReturnSettings;');
  const rs={base:'caw',account:0,target:2};
  assert.deepStrictEqual(H(()=>false)(rs),rs,'Free keeps the monthly target');assert.strictEqual(H(()=>true)(rs),rs,'Pro / trial: unchanged');
  assert.match(extractFn('retTargetOn'),/return true/);
  const a=SRC.indexOf('function renderHome'),h=SRC.slice(a,SRC.indexOf('\n}\n',a));
  assert.ok(h.includes('const rsH=homeReturnSettings(rs);')&&h.includes('monthReturnPct(F.month.total,rBase,rsH.target)'));
  const tile=h.slice(h.indexOf('Return this month'),h.indexOf('Avg win / loss'));assert.ok(!/rs\.target/.test(tile)&&/rsH\.target/.test(tile),'tile reads only the gated target');
  assert.ok(/mr\.pct>=0\?'\+':'−'/.test(tile),'the actual return still shows');
  // the return itself never depends on the target: same pct with or without it
  const M=new Function(extractFn('monthReturnPct')+'\nreturn monthReturnPct;')();assert.strictEqual(M(500,10000,2).pct,M(500,10000,null).pct);assert.strictEqual(M(500,10000,null).ok,null);
  const cfg=extractFn('openRetCfg');assert.ok(cfg.includes('<input id="ret-target" type="number"')&&!cfg.includes("openUpgrade('analytics')")&&!cfg.includes('ret-pro'),'monthly target editor is available on Free');
});
test('USD price IDs: env vars are optional overrides of the live IDs; webhook knows the live IDs as Pro',async()=>{
  const pr=require('../netlify/lib/pricing');
  assert.deepStrictEqual({...pr.LIVE_USD},{annual:'price_1Ug015DsI2fxIBCJocEZDG2e',monthly:'price_1Ug01bDsI2fxIBCJ67VgZOTK'});
  assert.strictEqual(pr.priceForInterval('annual',{}).price,'price_1Ug015DsI2fxIBCJocEZDG2e');assert.strictEqual(pr.priceForInterval('monthly',{}).price,'price_1Ug01bDsI2fxIBCJ67VgZOTK');
  assert.strictEqual(pr.priceForInterval('yearly',{}).interval,'annual');assert.strictEqual(pr.priceForInterval('weekly',{}).status,400);
  assert.strictEqual(pr.priceForInterval('annual',{STRIPE_PRICE_PRO_ANNUAL_USD:'price_test_a'}).price,'price_test_a');assert.strictEqual(pr.priceForInterval('monthly',{STRIPE_PRICE_PRO_MONTHLY_USD:'  '}).price,'price_1Ug01bDsI2fxIBCJ67VgZOTK','blank env falls back');
  const ids=pr.proPriceIds({});assert.ok(ids.has('price_1Ug015DsI2fxIBCJocEZDG2e')&&ids.has('price_1Ug01bDsI2fxIBCJ67VgZOTK'));
  assert.ok(pr.proPriceIds({STRIPE_PRICE_YEARLY:'price_gbp'}).has('price_gbp'),'legacy GBP still recognised');assert.strictEqual(pr.isLegacyPrice('price_1Ug015DsI2fxIBCJocEZDG2e',{}),false);
  const hook=require('../netlify/functions/stripe-webhook');const warn=console.warn;let warned=0;console.warn=()=>{warned++;};
  try{const o={...process.env};delete process.env.STRIPE_PRICE_PRO_ANNUAL_USD;delete process.env.STRIPE_PRICE_PRO_MONTHLY_USD;
    for(const id of ['price_1Ug015DsI2fxIBCJocEZDG2e','price_1Ug01bDsI2fxIBCJ67VgZOTK']){const r=hook.planForSubscription({status:'active',items:{data:[{price:{id}}]}},false);assert.strictEqual(r.plan,'pro');assert.strictEqual(r.legacyPrice,false);}
    process.env=o;}finally{console.warn=warn;}
  assert.strictEqual(warned,0,'live IDs are known prices, not unlisted');
});

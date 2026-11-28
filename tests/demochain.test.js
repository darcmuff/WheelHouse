const{appSrc}=require('./appsrc');
// demochain.test.js — /demo ships one realistic ACTIVE rolled chain (INTC puts rolled down and out for a net credit)
// so Net P&L (now), "N% of $X chain" and the popover "Now: +$X · N% captured" are visible to demo visitors.
const test=require('node:test');const assert=require('node:assert');const fs=require('fs'),path=require('path'),vm=require('vm');
const{extractFn,extractConst}=require('./extract');
const A=path.join(__dirname,'..','app');const DEMO=fs.readFileSync(path.join(A,'demo.js'),'utf8');

function env(pathname='/demo',host='x.app'){
  class Storage{constructor(){this._m={};}getItem(k){return k in this._m?this._m[k]:null;}setItem(k,v){this._m[k]=String(v);}removeItem(k){delete this._m[k];}}
  const ls=new Storage();let reloaded=0;
  const P=new Proxy(ls,{ownKeys:()=>Object.keys(ls._m),getOwnPropertyDescriptor:(t,k)=>k in ls._m?{enumerable:true,configurable:true,value:ls._m[k]}:undefined});
  const win={location:{pathname,hostname:host,href:'https://'+host+pathname,origin:'https://'+host,reload(){reloaded++;}},confirm:()=>true,localStorage:P,sessionStorage:new Storage(),
    fetch:(u)=>Promise.resolve({ok:true,json:async()=>({})})};
  const ctx={window:win,location:win.location,localStorage:P,Storage,confirm:win.confirm,URL,
    Response:class{constructor(b,o){this.b=b;this.status=(o&&o.status)||200;this.ok=this.status<300;}async json(){return JSON.parse(this.b);}},
    Promise,JSON,Math,Date,setTimeout:(f)=>f(),clearTimeout(){},Object};
  vm.runInNewContext(DEMO,ctx);
  return{win,ls,reloaded:()=>reloaded};
}
const fns=['isCredit','walkLegPairs','normWheelShortStcClosers','strikeStep','nearStrike','exactSubset','withInferredRolls','buildRollChain','chainCapturedNow','chainCapturedCard','chainCapturedPopover'];
const F=new Function(extractConst('CREDITS')+'\nconst _effRollCache=new WeakMap();\n'+fns.map(extractFn).join('\n')+'\nreturn{buildRollChain,chainCapturedNow,chainCapturedCard,chainCapturedPopover};')();
const money=n=>(n<0?'-':'+')+'$'+Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');
const occ=(tk,exp,strike)=>tk+exp.slice(2,4)+exp.slice(5,7)+exp.slice(8,10)+'P'+String(Math.round(strike*1000)).padStart(8,'0');

function chainOf(d){
  const w=d.wheels.find(x=>x.id==='dw-intc');assert.ok(w,'INTC chain wheel is seeded');
  const trades=d.trades.filter(t=>t.wheelId==='dw-intc');
  const tip=trades.filter(t=>t.action==='CSP').find(t=>t.rollId&&!trades.some(c=>c.action==='BTC'&&c.rollId!==t.rollId&&false)&&t.expiry>=new Date().toISOString().slice(0,10));
  return{w,trades,tip};
}

test('the demo seed has one active rolled chain: 3 linked puts, 2 rolls, net credit > 0, open tip in the future',()=>{
  const e=env(),d=e.win.OT_DEMO.load();
  const{trades,tip}=chainOf(d);
  assert.ok(tip,'an open rolled tip exists');
  assert.strictEqual(trades.filter(t=>t.action==='CSP').length,3);
  assert.strictEqual(trades.filter(t=>t.action==='BTC').length,2);
  assert.strictEqual(trades.filter(t=>t.rollId).length,4,'two rolls = two closers + two replacement openers carry a rollId');
  const root=trades.filter(t=>t.action==='CSP'&&!t.rollId);assert.strictEqual(root.length,1,'one original entry, no rollId');
  const ch=F.buildRollChain(trades,tip.id);
  assert.ok(ch,'chain builds from the real roll code');
  assert.strictEqual(ch.rolls,2);assert.strictEqual(ch.live,true);
  assert.strictEqual(ch.trades.length,5);
  assert.ok(ch.net>50&&ch.net<400,'modest positive net credit, got '+ch.net);
});

test('the open leg is priced by the demo option feed, so the card shows "N% of $X chain" and the popover "Now: +$X · N% captured"',async()=>{
  const e=env(),d=e.win.OT_DEMO.load();const{trades,tip}=chainOf(d);
  const ch=F.buildRollChain(trades,tip.id);
  const code=occ('INTC',tip.expiry,tip.strike);
  const j=await (await e.win.fetch('/.netlify/functions/optchain?symbol=INTC&contracts='+code)).json();
  const c=j.contracts[code];assert.ok(c&&c.last>0,'demo prices the open INTC put');
  const buy=c.last*100*(Number(tip.shares)/100);
  const now=F.chainCapturedNow(ch.net,buy,ch.trades.length);
  assert.ok(now&&now.pct!=null,'priced, credit > 0');
  assert.ok(now.pct>0&&now.pct<100,'mid-flight capture, got '+now.pct);
  const card=F.chainCapturedCard(now);assert.match(card.text,/^\d+% of \$\d[\d,]*(\.\d\d)? chain$/);
  assert.match(F.chainCapturedPopover(now,money),/^Now: \+\$[\d,.]+ · \d+% captured$/);
});

test('every other demo wheel is untouched: still plain rows without rollId',()=>{
  const d=env().win.OT_DEMO.load();
  ['dw-pep','dw-ko','dw-amd','dw-sofi1','dw-sofi2'].forEach(id=>assert.ok(d.wheels.some(w=>w.id===id),id));
  assert.ok(d.trades.filter(t=>t.wheelId!=='dw-intc').every(t=>!t.rollId));
  assert.ok(d.trades.filter(t=>t.wheelId==='dw-intc').every(t=>t.ticker==='INTC'&&t.shares===100));
});

test('Reset demo reseeds the chain, and an existing visitor with older demo data gets it added without losing their trades',()=>{
  const e=env(),O=e.win.OT_DEMO;const d=O.load();
  const old={wheels:d.wheels.filter(w=>w.id!=='dw-intc'),trades:d.trades.filter(t=>t.wheelId!=='dw-intc'),opts:d.opts};
  const mine=Object.assign({},old.trades[0],{id:'mine-1',comment:'mine'});old.trades.push(mine);
  e.ls._m['optrack-demo:data-v1']=JSON.stringify(old);
  const again=O.load();
  assert.ok(again.wheels.some(w=>w.id==='dw-intc'),'chain wheel added for existing demo data');
  assert.ok(again.trades.some(t=>t.id==='mine-1'),'their own change kept');
  assert.strictEqual(again.trades.filter(t=>t.wheelId==='dw-intc').length,d.trades.filter(t=>t.wheelId==='dw-intc').length);
  O.reset();assert.strictEqual(e.reloaded(),1);
  assert.ok(O.load().wheels.some(w=>w.id==='dw-intc'),'reseeded after reset');
});

test('demo prices know INTC (spot + IV) and ids do not collide with existing demo ids',()=>{
  const e=env();assert.ok(e.win.OT_DEMO.spots.INTC>0);
  const d=e.win.OT_DEMO.load();const ids=d.trades.map(t=>t.id);assert.strictEqual(new Set(ids).size,ids.length,'unique trade ids');
  assert.ok(d.trades.filter(t=>t.wheelId!=='dw-intc').length>0);
});

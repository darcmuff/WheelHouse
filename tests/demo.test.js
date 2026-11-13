const test=require('node:test');const assert=require('node:assert');const fs=require('fs'),path=require('path'),vm=require('vm');
const A=path.join(__dirname,'..','app');const SRC=fs.readFileSync(path.join(A,'demo.js'),'utf8');const H=fs.readFileSync(path.join(A,'index.html'),'utf8');
function env(pathname){
  class Storage{constructor(){this._m={};}getItem(k){return k in this._m?this._m[k]:null;}setItem(k,v){this._m[k]=String(v);}removeItem(k){delete this._m[k];}}
  const ls=new Storage(),ss=new Storage();let reloaded=0;const fetched=[];
  const P=new Proxy(ls,{ownKeys:()=>Object.keys(ls._m),getOwnPropertyDescriptor:(t,k)=>k in ls._m?{enumerable:true,configurable:true,value:ls._m[k]}:undefined});
  const win={location:{pathname,href:'https://x.app'+pathname,origin:'https://x.app',reload(){reloaded++;}},confirm:()=>true,localStorage:P,sessionStorage:ss,
    fetch:(u)=>{fetched.push(String(u));return Promise.resolve({ok:true,json:async()=>({})});}};
  const ctx={window:win,location:win.location,localStorage:P,Storage,confirm:win.confirm,URL,
    Response:class{constructor(b,o){this.b=b;this.status=(o&&o.status)||200;this.ok=this.status<300;}async json(){return JSON.parse(this.b);}},
    Promise,JSON,Math,Date,setTimeout:(f)=>f(),clearTimeout(){},Object};
  vm.runInNewContext(SRC,ctx);
  return{win,ls,ss,ctx,reloaded:()=>reloaded,fetched};
}
test('demo.js does nothing outside /demo',()=>{const e=env('/app/');assert.strictEqual(e.win.OT_DEMO,undefined);e.win.localStorage.setItem('wh-view','x');assert.ok('wh-view' in e.ls._m);});
test('demo keeps its own storage: every key gets the demo prefix',()=>{const e=env('/demo');e.win.localStorage.setItem('wh-view','dash');assert.strictEqual(e.win.localStorage.getItem('wh-view'),'dash');assert.ok(!('wh-view' in e.ls._m));assert.strictEqual(e.ls._m['optrack-demo:wh-view'],'dash');
  e.win.sessionStorage.setItem('k','v');assert.strictEqual(e.ss._m.k,'v','sessionStorage untouched');});
test('seed data loads: wheels, roll chain, assignment, called away, LEAPs with one open short call, modest sizes',()=>{
  const e=env('/demo'),d=e.win.OT_DEMO.load();
  assert.ok(d.wheels.filter(w=>w.status==='open').length>=3);
  const r=d.trades.filter(t=>t.rollId);assert.ok(r.some(t=>t.action==='BTC')&&r.some(t=>t.action==='CSP'));
  assert.ok(d.trades.some(t=>t.action==='IN')&&d.trades.some(t=>t.action==='OUT'));
  assert.strictEqual(d.opts.filter(l=>l.side==='long'&&l.status==='open').length,2);
  assert.strictEqual(d.opts.filter(l=>l.side==='short'&&l.status==='open').length,1);
  assert.ok(d.opts.every(l=>!l.demo&&!String(l.id).startsWith('demo-')),'demo legs save like real ones (in the demo store)');
  const cash=d.trades.filter(t=>t.action==='IN').reduce((a,t)=>a+t.total,0);assert.ok(cash<30000,'modest');
  assert.ok(e.ls._m['optrack-demo:data-v1'],'saved under the demo prefix');
  assert.ok(!Object.keys(e.ls._m).some(k=>!k.startsWith('optrack-demo:')),'nothing outside the demo prefix');});
test('changes persist in the demo store, and reset clears only demo keys',()=>{
  const e=env('/demo'),O=e.win.OT_DEMO;const d=O.load();d.trades=d.trades.slice(1);O.save(d);
  assert.strictEqual(O.load().trades.length,d.trades.length);
  e.ls._m['wheel_tracker_v7']='real';e.ls._m['wh-theme']='dark';
  O.reset();assert.strictEqual(e.reloaded(),1);assert.ok(!Object.keys(e.ls._m).some(k=>k.startsWith('optrack-demo:')));
  assert.strictEqual(e.ls._m['wheel_tracker_v7'],'real');assert.strictEqual(e.ls._m['wh-theme'],'dark');
  assert.ok(O.load().trades.length>d.trades.length,'reseeded after reset');});
test('demo prices are made up locally: no quote API calls',async()=>{
  const e=env('/demo');const q=await (await e.win.fetch('/.netlify/functions/quote?symbol=KO')).json();assert.ok(q.c>0);
  const c=await (await e.win.fetch('/.netlify/functions/optchain?symbol=AAPL&contracts=AAPL280121C00200000')).json();assert.ok(c.contracts.AAPL280121C00200000.bid>0);
  const b=await e.win.fetch('/.netlify/functions/checkout');assert.strictEqual(b.status,503);
  assert.strictEqual(e.fetched.length,0,'nothing went to the network');
  assert.ok(/Sell to Open/.test(e.win.OT_DEMO.sample()));});
test('demo never initialises Firebase, auth or Firestore writes',()=>{
  assert.ok(H.includes("const APP_DEMO = !!(window.OT_DEMO && window.OT_DEMO.active);"));
  ['const _app  = APP_DEMO ? null : initializeApp(','const _auth = APP_DEMO ? null : getAuth(','let _fsDb = APP_DEMO ? null : getFirestore('].forEach(s=>assert.ok(H.includes(s),s));
  assert.strictEqual((H.match(/initializeApp\(/g)||[]).length,1);
  ['_saveWheel','_saveTrade','_saveOpt','_deleteOptDoc','_deleteWheelDoc','_deleteTradeDoc'].forEach(f=>{const i=H.indexOf('function '+f+'(');assert.ok(/^\s*if\(APP_DEMO\)\{[^}]*return;\}/.test(H.slice(H.indexOf('\n',i)+1,H.indexOf('\n',i)+120)),f);});
  assert.ok(H.includes('if (APP_DEMO) demoBoot(); else onAuthStateChanged(_auth'));
  assert.ok(/async function _billingCall\(fn,payload\)\{\n\s*if\(APP_DEMO\)/.test(H));
  const i=H.indexOf('<script src="demo.js"></script>');assert.ok(i>0&&i<H.indexOf('localStorage'),'demo.js runs before anything reads storage');
  assert.ok(H.includes('Demo</b> with made-up trades. Nothing is saved to an account.')&&H.includes('href="/app/?signup=1"'));});
test('demo is linked, routed, and never the installed app',()=>{
  const L=fs.readFileSync(path.join(A,'landing.html'),'utf8'),S=fs.readFileSync(path.join(A,'start.html'),'utf8'),R=fs.readFileSync(path.join(A,'_redirects'),'utf8');
  assert.ok(L.includes('href="/demo"')&&L.includes('Try the demo'));assert.ok(S.includes('href="/demo"'));
  assert.ok(/^\/demo\s+\/index\.html\s+200$/m.test(R));
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(A,'manifest.json'),'utf8')).start_url,'/app/');
  const sw=fs.readFileSync(path.join(A,'sw.js'),'utf8');assert.ok(sw.includes("'./demo.js'"));
  const shell=/^\/(app\/?|app\/index\.html|index\.html)$/;assert.ok(sw.includes(shell.source.replace(/\//g,'\\/'))||sw.includes('app\\/?|app\\/index\\.html|index\\.html'));assert.ok(!shell.test('/demo'));
  assert.ok(!L.slice(0,L.indexOf('</script>')).includes('demo'),'landing redirect ignores demo');});

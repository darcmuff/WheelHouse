// xpixel-robust.test.js — the X Sign up event must never be silently dropped (v436).
// Root causes covered: (1) x-pixel.js is async, so trackXSignup/twq may not exist yet when sign-up completes
// (Google redirect returns fast; slow phones) — the call used to be a silent no-op; (2) a navigation right after
// sign-up could abort the beacon; (3) a new user missed by getAdditionalUserInfo (storage-partitioned redirect,
// Incognito) never fired at all.
const test=require('node:test');const assert=require('node:assert');const fs=require('fs'),path=require('path'),vm=require('vm');
const{appSrc}=require('./appsrc');
const A=path.join(__dirname,'..','app');
const PIXEL=fs.readFileSync(path.join(A,'x-pixel.js'),'utf8');
const INDEX=fs.readFileSync(path.join(A,'index.html'),'utf8');

function env(opts={}){
  const store=Object.assign({},opts.store||{});
  const timers=[];const scripts=[];
  const win={localStorage:{getItem:k=>(k in store?store[k]:null),setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}},location:{hostname:('hostname' in opts)?opts.hostname:'optrack.app'}};
  win.window=win;
  if(opts.twq){win.twq=opts.twq;}
  const doc={createElement:()=>{const s={async:false,src:''};scripts.push(s);return s;},getElementsByTagName:()=>[{parentNode:{insertBefore:()=>{}}}]};
  let now=opts.now||1700000000000;
  const ctx=vm.createContext({window:win,document:doc,module:{exports:{}},setTimeout:(f,ms)=>{timers.push({f,ms});return timers.length;},Date:{now:()=>now},JSON,Number,Math});
  if(opts.early)vm.runInContext(opts.early,ctx);
  vm.runInContext(PIXEL,ctx);
  return{win,store,timers,scripts,ctx,advance:ms=>{now+=ms;},run:()=>{while(timers.length)timers.shift().f();}};
}
const evs=e=>JSON.parse(JSON.stringify((e.win.twq&&e.win.twq.queue?[...e.win.twq.queue]:[]).map(a=>[].slice.call(a)).filter(a=>a[0]==='event')));

test('install(): stub queues calls before uwt.js loads, config comes first, uwt.js is requested once',()=>{
  const e=env();
  assert.strictEqual(typeof e.win.twq,'function');
  assert.deepStrictEqual(JSON.parse(JSON.stringify([].slice.call(e.win.twq.queue[0]))),['config','riuhw']);
  assert.strictEqual(e.scripts.filter(s=>/uwt\.js$/.test(s.src)).length,1);
});

test('trackXSignup fires the Sign up event through the queue even though uwt.js has not loaded yet',()=>{
  const e=env();
  e.win.trackXSignup('u1');
  assert.deepStrictEqual(evs(e),[['event','tw-riuhw-152urb',{}]]);
});

test('trackXSignup installs the stub itself if twq is missing (no silent no-op)',()=>{
  const e=env();delete e.win.twq;e.scripts.length=0;
  e.win.trackXSignup('u2');
  assert.strictEqual(typeof e.win.twq,'function');
  assert.deepStrictEqual(evs(e).length,1);
  assert.deepStrictEqual(JSON.parse(JSON.stringify([].slice.call(e.win.twq.queue[0]))),['config','riuhw'],'config precedes the event');
});

test('same account never double-fires (popup + auth listener safety net), a different account does',()=>{
  const e=env();
  e.win.trackXSignup('uA');e.win.trackXSignup('uA');
  assert.strictEqual(evs(e).length,1);
  e.advance(60*1000);e.win.trackXSignup('uB');
  assert.strictEqual(evs(e).length,2,'a second new account in the same browser (re-test) still fires');
});

test('pending flag survives until the beacon has had time to leave, so a navigation right after sign-up re-fires on the next page',()=>{
  const e=env();
  e.win.trackXSignup('uC');
  assert.ok(e.store['ot-x-signup-pending'],'pending flag set while the request may still be in flight');
  assert.ok(e.timers.length>=1);
  e.run();
  assert.ok(!e.store['ot-x-signup-pending'],'cleared after the grace period');
  assert.strictEqual(e.store['ot-x-signup-sent'],'uC');
});

test('early stub (index.html, before x-pixel.js runs) records a pending sign-up and x-pixel.js flushes it on load',()=>{
  const m=INDEX.match(/<script>([^<]*ot-x-signup-pending[^<]*)<\/script>/);
  assert.ok(m,'inline early stub in index.html');
  assert.ok(INDEX.indexOf(m[0])<INDEX.indexOf('<script src="x-pixel.js"'),'stub runs before the async pixel script');
  const e=env({early:m[1]});          // stub defined; app calls it before x-pixel.js has run
  // simulate: app called the stub BEFORE x-pixel.js — rebuild with a store that holds the pending record
  const e2=env({store:{'ot-x-signup-pending':JSON.stringify({u:'uD',t:1700000000000-1000})}});
  assert.deepStrictEqual(evs(e2),[['event','tw-riuhw-152urb',{}]],'flushed on load');
  assert.strictEqual(e2.store['ot-x-signup-sent'],'uD');
  void e;
});

test('early stub alone: calling trackXSignup before x-pixel.js is loaded stores a pending record and never throws',()=>{
  const m=INDEX.match(/<script>([^<]*ot-x-signup-pending[^<]*)<\/script>/);
  const store={};const win={localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=v;}},location:{hostname:'optrack.app'}};win.window=win;
  const ctx=vm.createContext({window:win,localStorage:win.localStorage,Date,JSON,location:win.location});
  vm.runInContext(m[1],ctx);
  assert.strictEqual(typeof win.trackXSignup,'function');
  assert.doesNotThrow(()=>win.trackXSignup('uE'));
  assert.strictEqual(JSON.parse(store['ot-x-signup-pending']).u,'uE');
});

test('stale pending (older than 10 minutes) is ignored, never fires a ghost Sign up',()=>{
  const e=env({store:{'ot-x-signup-pending':JSON.stringify({u:'uOld',t:1700000000000-11*60*1000})}});
  assert.strictEqual(evs(e).length,0);
});

test('a pending sign-up already sent for that uid is not fired again',()=>{
  const e=env({store:{'ot-x-signup-sent':'uF','ot-x-signup-pending':JSON.stringify({u:'uF',t:1700000000000-500})}});
  assert.strictEqual(evs(e).length,0);
});

test('all three sign-up paths pass the uid, and the auth listener is a safety net for new users getAdditionalUserInfo missed',()=>{
  const SRC=appSrc();
  const email=SRC.slice(SRC.indexOf('async function authSubmit'),SRC.indexOf('async function authSubmit')+2500);
  assert.match(email,/trackXSignup\(_auth\.currentUser&&_auth\.currentUser\.uid\)/);
  assert.match(SRC,/isNewUser\)\{_freshSignup=true;[^}]*trackXSignup\(cred\.user&&cred\.user\.uid\)/);
  const redirect=SRC.slice(SRC.indexOf('const _googleRedirectReady'),SRC.indexOf('if (APP_DEMO) demoBoot()'));
  assert.match(redirect,/trackXSignup\(cred\.user&&cred\.user\.uid\)/);
  const listener=SRC.slice(SRC.indexOf('const fresh=isFreshSignup(user);'),SRC.indexOf('const fresh=isFreshSignup(user);')+400);
  assert.match(listener,/if\(fresh[^)]*\)[\s\S]{0,200}trackXSignup\(user\.uid\)/,'new user detected by account age still fires (deduped by uid)');
});

test('install/fire inject uwt.js and send Sign up on optrack.app, never on a blocked host',()=>{
  const ok=env({hostname:'optrack.app'});
  assert.strictEqual(ok.scripts.filter(s=>/static\.ads-twitter\.com\/uwt\.js$/.test(s.src)).length,1);
  assert.deepStrictEqual(JSON.parse(JSON.stringify([].slice.call(ok.win.twq.queue[0]))),['config','riuhw']);
  ok.win.trackXSignup('uProd');
  assert.deepStrictEqual(evs(ok),[['event','tw-riuhw-152urb',{}]]);

  const blocked=['dev--wheelhouse-tracker.netlify.app','deploy-preview-12--wheelhouse-tracker.netlify.app','localhost','127.0.0.1',''];
  blocked.forEach(hostname=>{
    const e=env({hostname,store:{'ot-x-signup-pending':JSON.stringify({u:'uPend',t:1700000000000-1000})}});
    assert.strictEqual(e.scripts.filter(s=>/uwt\.js/.test(s.src)).length,0,hostname+' must not inject uwt.js');
    assert.strictEqual(typeof e.win.twq,'function',hostname+' gets a no-op twq');
    assert.doesNotThrow(()=>e.win.twq('config','riuhw'));
    assert.doesNotThrow(()=>e.win.trackXSignup('uBlock'));
    assert.strictEqual(evs(e).length,0,hostname+' must not send Sign up');
    assert.ok(!e.store['ot-x-signup-pending'],hostname+' must clear pending, not send it later');
    assert.ok(!e.store['ot-x-signup-sent'],hostname+' must not mark sent');
  });
});

test('early stub on a blocked host does not record a pending sign-up',()=>{
  const m=INDEX.match(/<script>([^<]*ot-x-signup-pending[^<]*)<\/script>/);
  const store={};const win={localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=v;}},location:{hostname:'dev--wheelhouse-tracker.netlify.app'}};win.window=win;
  const ctx=vm.createContext({window:win,localStorage:win.localStorage,Date,JSON,location:win.location});
  vm.runInContext(m[1],ctx);
  assert.doesNotThrow(()=>win.trackXSignup('uDev'));
  assert.ok(!store['ot-x-signup-pending']);
});

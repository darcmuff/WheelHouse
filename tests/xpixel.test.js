const{appSrc}=require('./appsrc');
// xpixel.test.js — X Pixel base code on public pages; Sign up event only after a successful new account.
const test=require('node:test');const assert=require('node:assert');const fs=require('fs'),path=require('path'),vm=require('vm');
const{extractFn}=require('./extract');
const A=path.join(__dirname,'..','app');
const X=require('../app/x-pixel.js');
const pages={
  landing:fs.readFileSync(path.join(A,'landing.html'),'utf8'),
  start:fs.readFileSync(path.join(A,'start.html'),'utf8'),
  app:appSrc()
};
const SRC=pages.app+(fs.existsSync(path.join(A,'app.js'))?'\n'+fs.readFileSync(path.join(A,'app.js'),'utf8'):'');

test('X Pixel IDs: pixel riuhw, Sign up event is the literal tw-riuhw-rktzs',()=>{
  assert.strictEqual(X.PIXEL_ID,'riuhw');
  assert.strictEqual(X.SIGNUP_EVENT,'tw-riuhw-rktzs');
  const src=fs.readFileSync(path.join(A,'x-pixel.js'),'utf8');
  assert.match(src,/var SIGNUP_EVENT = 'tw-riuhw-rktzs';/);
  assert.doesNotMatch(src,/'tw-'\s*\+\s*PIXEL_ID/);
  assert.match(X.SIGNUP_EVENT,/^tw-[a-z0-9]+-[a-z0-9]+$/i);
});

test('landing, /start and the app (/demo shares index.html) load the pixel async',()=>{
  for(const [name,src] of Object.entries(pages)){
    assert.match(src,/src="x-pixel\.js"/,name+' includes x-pixel.js');
    assert.match(src,/<script[^>]*src="x-pixel\.js"[^>]*>/,name+' script tag');
    const tag=src.match(/<script[^>]*src="x-pixel\.js"[^>]*>/)[0];
    assert.match(tag,/\basync\b/,name+' loads x-pixel.js async so it never blocks render');
  }
  const file=fs.readFileSync(path.join(A,'x-pixel.js'),'utf8');
  assert.ok(file.includes("static.ads-twitter.com/uwt.js"));
  assert.ok(file.includes("u.async=!0")||file.includes('u.async = !0')||file.includes('async:!0')||file.includes('u.async=true')||file.includes("u.async = true"));
  assert.ok(file.includes("twq('config'")||file.includes('twq("config"')||file.includes("twq('config',"));
});

test('trackXSignup never throws (ad blockers, no window, no storage) and fires the Sign up event through twq',()=>{
  // Node has no window: must be a harmless no-op. Queue/stub behaviour is covered in xpixel-robust.test.js.
  assert.doesNotThrow(()=>X.trackXSignup());
  assert.doesNotThrow(()=>X.trackXSignup('u1'));
  const calls=[];
  const win={localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},twq:function(){calls.push([].slice.call(arguments));}};win.window=win;
  win.location={hostname:'optrack.app'};
  const ctx=vm.createContext({window:win,document:{},module:{exports:{}},setTimeout:()=>0,Date,JSON,location:win.location});
  vm.runInContext(fs.readFileSync(path.join(A,'x-pixel.js'),'utf8'),ctx);
  win.trackXSignup('u9');
  assert.ok(calls.some(c=>c[0]==='event'&&c[1]==='tw-riuhw-rktzs'));
  // blocked storage must not stop the event either
  const w2={localStorage:{getItem:()=>{throw new Error('blocked');},setItem:()=>{throw new Error('blocked');},removeItem:()=>{throw new Error('blocked');}},twq:function(){calls.push([].slice.call(arguments));}};w2.window=w2;
  const before=calls.length;
  w2.location={hostname:'optrack.app'};
  vm.runInContext(fs.readFileSync(path.join(A,'x-pixel.js'),'utf8'),vm.createContext({window:w2,document:{},module:{exports:{}},setTimeout:()=>0,Date,JSON,location:w2.location}));
  assert.doesNotThrow(()=>w2.trackXSignup('u10'));
  assert.ok(calls.length>before);
});

test('Sign up event fires only after a successful new account, never on login or a button click',()=>{
  const email=extractFn('authSubmit');
  assert.match(email,/createUserWithEmailAndPassword/);
  const start=email.indexOf('if(fresh){');
  const signupBranch=email.slice(start,email.indexOf('} else {',start));
  const loginBranch=email.slice(email.indexOf('} else {',start));
  assert.match(signupBranch,/trackXSignup/);
  assert.doesNotMatch(loginBranch,/trackXSignup/);
  assert.match(signupBranch,/createUserWithEmailAndPassword/);
  assert.match(loginBranch,/signInWithEmailAndPassword/);

  const google=extractFn('authGoogle');
  assert.match(google,/getAdditionalUserInfo\(cred\)/);
  assert.match(google,/info&&info\.isNewUser[\s\S]{0,120}trackXSignup/);
  assert.ok(!/onclick=["'][^"']*trackXSignup/.test(SRC),'never fire Sign up from a click handler');
  assert.ok(!/db-go[\s\S]{0,80}trackXSignup/.test(SRC));
  assert.ok(!/#demo-cta[\s\S]{0,200}trackXSignup/.test(SRC));

  const redirect=SRC.slice(SRC.indexOf('const _googleRedirectReady'),SRC.indexOf('if (APP_DEMO) demoBoot()'));
  assert.match(redirect,/getAdditionalUserInfo\(cred\)/);
  assert.match(redirect,/info&&info\.isNewUser[\s\S]{0,200}trackXSignup/);
});

test('isProdHost allows only optrack.app and www.optrack.app',()=>{
  assert.strictEqual(typeof X.isProdHost,'function');
  assert.ok(X.isProdHost('optrack.app'));
  assert.ok(X.isProdHost('www.optrack.app'));
  ['dev--wheelhouse-tracker.netlify.app',
   'deploy-preview-12--wheelhouse-tracker.netlify.app',
   'localhost','127.0.0.1','','optrack.app.evil.com','notoptrack.app',
   'file:','www.optrack.app.evil.com','optrack.app.com'].forEach(h=>assert.ok(!X.isProdHost(h),h+' must be blocked'));
});

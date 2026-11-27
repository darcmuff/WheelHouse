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

test('X Pixel IDs: pixel riuhw, event tw-riuhw-152urb in tw-<pixelId>-<eventId> form',()=>{
  assert.strictEqual(X.PIXEL_ID,'riuhw');
  assert.strictEqual(X.SIGNUP_EVENT,'tw-riuhw-152urb');
  assert.strictEqual(X.SIGNUP_EVENT,'tw-'+X.PIXEL_ID+'-152urb');
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

test('trackXSignup is a no-op when twq is missing (ad blockers) and fires the Sign up event when twq exists',()=>{
  const calls=[];
  const g={window:{},document:{createElement:()=>({async:false,src:''}),getElementsByTagName:()=>[{parentNode:{insertBefore:()=>{}}}]}};
  const api=vm.runInNewContext(fs.readFileSync(path.join(A,'x-pixel.js'),'utf8')+'\nmodule.exports',{module:{exports:{}},window:g.window,document:g.document,globalThis:g});
  assert.doesNotThrow(()=>api.trackXSignup());
  g.window.twq=function(){calls.push([].slice.call(arguments));};
  // re-bind if trackXSignup closed over a missing twq from the outer scope — call via the function that uses typeof twq
  const run=new Function('twq',fs.readFileSync(path.join(A,'x-pixel.js'),'utf8')+'\nreturn {trackXSignup:(typeof trackXSignup==="function"?trackXSignup:OT_XPIXEL.trackXSignup),api:typeof OT_XPIXEL!=="undefined"?OT_XPIXEL:null};');
  const env={module:{exports:{}},window:{twq:function(){calls.push([].slice.call(arguments));}},document:g.document};
  // Use the required module's function against a fake global twq
  const twq=function(){calls.push([].slice.call(arguments));};
  const prev=global.twq;global.twq=twq;
  try{X.trackXSignup();assert.deepStrictEqual(calls,[['event','tw-riuhw-152urb',{}]]);}
  finally{if(prev===undefined)delete global.twq;else global.twq=prev;}
  const again=[];global.twq=undefined;delete global.twq;
  assert.doesNotThrow(()=>X.trackXSignup());
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

const{appSrc}=require('./appsrc');
// democta.test.js — /demo sticky trial CTA and /app/?signup=1 opens Create Account.
const test=require('node:test');const assert=require('node:assert');const fs=require('fs'),path=require('path');
const{extractFn}=require('./extract');
const A=path.join(__dirname,'..','app');
const SRC=appSrc()+(fs.existsSync(path.join(A,'app.js'))?'\n'+fs.readFileSync(path.join(A,'app.js'),'utf8'):'')+(fs.existsSync(path.join(A,'app.css'))?'\n'+fs.readFileSync(path.join(A,'app.css'),'utf8'):'');

test('/app/?signup=1 opens Create Account mode',()=>{
  assert.match(SRC,/[?&]signup=1/);
  assert.match(SRC,/sessionStorage\.setItem\('ot-signup','1'\)/);
  assert.match(SRC,/authTab\(signup\?'signup':'signin'\)/);
});

test('/demo has a persistent sticky CTA with the exact trial copy, linking to Create Account',()=>{
  const boot=extractFn('demoBoot');
  assert.match(boot,/Start 14-day free trial — no credit card required/);
  assert.match(boot,/href="\/app\/\?signup=1"/);
  assert.match(boot,/id=['"]demo-cta['"]/);
  assert.doesNotMatch(boot,/trackXSignup|twq\('event'/);
  assert.match(SRC,/#demo-cta/);
  assert.match(SRC,/position:\s*fixed/);
  assert.match(SRC,/safe-area-inset-bottom/);
  assert.match(SRC,/--demo-cta-h/);
  assert.match(SRC,/#FF5A36|--brand-orange/);
  assert.match(SRC,/border-radius:\s*6px/);
});

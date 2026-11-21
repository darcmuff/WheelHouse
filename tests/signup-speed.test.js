const test=require('node:test');const assert=require('node:assert');
const fs=require('fs');const path=require('path');
const SRC=fs.readFileSync(path.join(__dirname,'../app/index.html'),'utf8');
function grab(name){
  const i=SRC.indexOf('function '+name+'(');
  assert.ok(i>=0,name+' missing');
  let d=0,start=SRC.indexOf('{',i);
  for(let j=start;j<SRC.length;j++){
    if(SRC[j]==='{')d++;
    else if(SRC[j]==='}'){d--;if(!d)return SRC.slice(i,j+1);}
  }
  throw new Error('unclosed '+name);
}
test('Create Account shows a progress overlay and opens onboarding as soon as Auth succeeds',()=>{
  const fn=grab('authSubmit');
  assert.ok(fn.includes("_freshSignup=true"));
  assert.ok(fn.includes("Creating your account…"));
  assert.ok(fn.includes('createUserWithEmailAndPassword'));
  assert.ok(fn.includes('otTrack')&&fn.includes('/signup-complete'));
  const after=fn.slice(fn.indexOf('createUserWithEmailAndPassword'));
  const catchAt=after.indexOf('} catch');
  const success=after.slice(0,catchAt);
  assert.ok(success.includes('showOnboardingIfNeeded()'));
  assert.ok(success.includes('hideLoadingOverlay(true)'));
  assert.ok(!/await loadDBFromFirestore/.test(success));
  assert.ok(!/await fetchSymbol/.test(success));
});
test('a new sign-up boot path does not wait for quotes or serial Firestore reads before onboarding',()=>{
  const i=SRC.indexOf('const fresh=isFreshSignup(user);');
  assert.ok(i>0);
  const boot=SRC.slice(i,SRC.indexOf('} else {',i));
  assert.ok(boot.includes('if(fresh)'));
  assert.ok(boot.includes('showOnboardingIfNeeded()'));
  assert.ok(boot.includes('hideLoadingOverlay(true)'));
  assert.ok(boot.includes('startLiveQuotes()'));
  assert.ok(!/await fetchSymbol/.test(boot));
  assert.ok(!/Fetching \$\{sym\}/.test(boot));
});
test('existing sign-in renders after a parallel data load and does not block on quotes',()=>{
  const i=SRC.indexOf("showLoadingOverlay('Loading your account…')");
  assert.ok(i>0);
  const boot=SRC.slice(i,SRC.indexOf('} else {',i));
  assert.ok(boot.includes('await loadAccount()'));
  assert.ok(boot.includes('hideLoadingOverlay()'));
  assert.ok(boot.includes('startLiveQuotes()'));
  assert.ok(!/await fetchSymbol/.test(boot));
  assert.ok(!/await Promise.allSettled\(logoPromises\)/.test(boot));
});
test('Firestore account load starts wheels, trades and option legs together',()=>{
  const fn=grab('loadDBFromFirestore');
  assert.ok(fn.includes('Promise.all(['));
  assert.ok(fn.includes("listenServer(collection(_fsDb,'users',userId,'wheels'))"));
  assert.ok(fn.includes("listenServer(collection(_fsDb,'users',userId,'trades'))"));
  assert.ok(fn.includes("listenServer(collection(_fsDb,'users',userId,'optlegs'))"));
});
test('Start Tracking paints the wheel at once and saves and quotes in the background',()=>{
  const fn=grab('onboardSubmit');
  assert.ok(!fn.includes('await setDoc'));
  assert.ok(fn.includes("display='none'"));
  assert.ok(fn.includes('startPriceFill(ticker,newWheel)'));
  assert.ok(fn.includes('_saveWheel(newWheel)'));
  assert.ok(fn.includes("btn.textContent='Starting…'")||fn.includes('Starting…'));
});
test('Getting price… is used on wheel and LEAP headers while the quote is in flight',()=>{
  assert.ok(SRC.includes('function pricePendingHtml('));
  assert.ok(SRC.includes("Getting price…"));
  assert.ok(SRC.includes('pricePendingHtml(wheel.ticker'));
  assert.ok(SRC.includes("pricePendingHtml(sym,'lc-spot')"));
});

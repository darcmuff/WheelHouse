// checkout-errors.test.js — Stripe failures are logged server-side and the browser gets one clean message (v414).
const test=require('node:test');const assert=require('node:assert');
const checkout=require('../netlify/functions/checkout');const{extractFn}=require('./extract');
const MSG="Checkout isn't available right now. Please try again shortly.";
const RAW='Invalid line_items[0]: the product tax code is missing. Set the product\'s tax_code field... acct_1UXU2oDsI2fxIBCJ';
async function call(stripeImpl){const o={...process.env};const logs=[];const err=console.error;console.error=(...a)=>logs.push(a.join(' '));
  try{process.env.STRIPE_SECRET_KEY='sk_test_x';
    const r=await checkout._handler({httpMethod:'POST',headers:{origin:'https://optrack.app'},body:'{"interval":"annual"}'},{},{bearerUser:async()=>({uid:'u',email:'u@x.com'}),getEntitlement:async()=>null,stripe:stripeImpl});
    return{r,logs};}finally{console.error=err;process.env=o;}}
test('Stripe error → 502 with the clean message only; the raw error is logged server-side',async()=>{
  const{r,logs}=await call(async()=>{throw new Error(RAW);});
  assert.strictEqual(r.statusCode,502);assert.deepStrictEqual(JSON.parse(r.body),{error:MSG});assert.strictEqual(checkout.CHECKOUT_DOWN,MSG);
  assert.ok(!/tax code|line_items|acct_|trace|at /.test(r.body),'no Stripe text or stack trace to the client');
  assert.ok(logs.some(l=>l.includes('tax code')),'logged server-side');
});
test('no or odd checkout URL from Stripe → same clean 502; unexpected failures too',async()=>{
  for(const ret of [{},{url:'https://evil.example/x'},null]){const{r}=await call(async()=>ret);assert.strictEqual(r.statusCode,502);assert.deepStrictEqual(JSON.parse(r.body),{error:MSG});}
  const o={...process.env};const err=console.error;console.error=()=>{};process.env.STRIPE_SECRET_KEY='sk_test_x';
  try{const r=await checkout._handler({httpMethod:'POST',headers:{},body:'{}'},{},{bearerUser:async()=>{throw new Error('boom stack');}});assert.strictEqual(r.statusCode,502);assert.deepStrictEqual(JSON.parse(r.body),{error:MSG});}
  finally{console.error=err;process.env=o;}
  const{r}=await call(async()=>({url:'https://checkout.stripe.com/c/pay/cs_live_x'}));assert.strictEqual(r.statusCode,200);
});
test('the Upgrade box shows the server message',async()=>{
  // real _billingCall + startCheckout from app/index.html, with the function answering 502 + the clean message
  const mk=new Function('fetch','_auth','APP_DEMO','otTrack','document','location','async '+extractFn('_billingCall')+'\nasync '+extractFn('startCheckout')+'\nreturn startCheckout;');
  let msg='',href=null;const doc={getElementById(){return{get textContent(){return msg;},set textContent(v){msg=v;}};}};
  const sc=mk(async()=>({ok:false,status:502,json:async()=>({error:MSG})}),{currentUser:{getIdToken:async()=>'t'}},false,()=>{},doc,{set href(v){href=v;}});
  await sc('annual');assert.strictEqual(msg,MSG);assert.strictEqual(href,null);
});

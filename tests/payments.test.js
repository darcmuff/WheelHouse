const test=require('node:test');const assert=require('node:assert');const crypto=require('crypto');const fs=require('fs'),path=require('path');
const{verifySignature,form,stripeKey}=require('../netlify/lib/stripe');const fb=require('../netlify/lib/fbadmin');
const hook=require('../netlify/functions/stripe-webhook');const checkout=require('../netlify/functions/checkout');
const sign=(body,secret,t=Math.floor(Date.now()/1000))=>`t=${t},v1=${crypto.createHmac('sha256',secret).update(t+'.'+body).digest('hex')}`;
test('Stripe signature: good passes; tampered, wrong secret, stale or missing fail',()=>{const b='{"a":1}';
  assert.ok(verifySignature(b,sign(b,'whsec_x'),'whsec_x'));assert.ok(!verifySignature(b+' ',sign(b,'whsec_x'),'whsec_x'));assert.ok(!verifySignature(b,sign(b,'other'),'whsec_x'));
  assert.ok(!verifySignature(b,sign(b,'whsec_x',Math.floor(Date.now()/1000)-3600),'whsec_x'));assert.ok(!verifySignature(b,'','whsec_x'));});
test('form encoding for nested Stripe params',()=>{assert.strictEqual(form({mode:'subscription',metadata:{uid:'u 1'}}),'mode=subscription&metadata%5Buid%5D=u%201');});
test('test mode only: live keys refused unless deliberately allowed',()=>{const o={...process.env};process.env.STRIPE_SECRET_KEY='sk_live_x';delete process.env.STRIPE_ALLOW_LIVE;assert.strictEqual(stripeKey(),null);
  process.env.STRIPE_SECRET_KEY='sk_test_x';assert.strictEqual(stripeKey(),'sk_test_x');process.env=o;});
function store(init){const S={...init};return{S,getEntitlement:async u=>S[u]||null,setEntitlement:async(u,f)=>{S[u]={...(S[u]||{}),...f};}};}
test('webhook: checkout completed grants Pro to the right user',async()=>{const st=store({});await hook.apply({type:'checkout.session.completed',data:{object:{client_reference_id:'alice',customer:'cus_1',subscription:'sub_1'}}},st);
  assert.strictEqual(st.S.alice.plan,'pro');assert.strictEqual(st.S.alice.stripeCustomerId,'cus_1');});
test('webhook: cancelled subscription goes back to Free',async()=>{const st=store({alice:{plan:'pro'}});await hook.apply({type:'customer.subscription.deleted',data:{object:{id:'sub_1',status:'canceled',customer:'cus_1',metadata:{uid:'alice'}}}},st);assert.strictEqual(st.S.alice.plan,'free');});
test('webhook: founders are never downgraded',async()=>{const st=store({marc:{plan:'pro',founder:true}});await hook.apply({type:'customer.subscription.deleted',data:{object:{id:'s',status:'canceled',metadata:{uid:'marc'}}}},st);assert.strictEqual(st.S.marc.plan,'pro');assert.strictEqual(st.S.marc.founder,true);});
test('webhook handler rejects unsigned calls and never writes',async()=>{process.env.STRIPE_WEBHOOK_SECRET='whsec_t';let wrote=false;
  const r=await hook.handler({httpMethod:'POST',headers:{'stripe-signature':'t=1,v1=00'},body:JSON.stringify({type:'checkout.session.completed',data:{object:{client_reference_id:'eve'}}})},{}, {setEntitlement:async()=>{wrote=true;}});
  assert.strictEqual(r.statusCode,400);assert.ok(!wrote);
  const body=JSON.stringify({type:'checkout.session.completed',data:{object:{client_reference_id:'eve',customer:'c'}}});const st=store({});
  const ok=await hook.handler({httpMethod:'POST',headers:{'stripe-signature':sign(body,'whsec_t')},body},{},st);assert.strictEqual(ok.statusCode,200);assert.strictEqual(st.S.eve.plan,'pro');});
test('checkout: needs config, sign-in and a known plan; ties the session to the uid',async()=>{const o={...process.env};
  delete process.env.STRIPE_SECRET_KEY;assert.strictEqual((await checkout._handler({httpMethod:'POST',headers:{}})).statusCode,503);
  process.env.STRIPE_SECRET_KEY='sk_test_x';process.env.STRIPE_PRICE_MONTHLY='price_m';process.env.STRIPE_PRICE_YEARLY='price_y';
  assert.strictEqual((await checkout._handler({httpMethod:'POST',headers:{}},{}, {bearerUser:async()=>null})).statusCode,401);
  let sent;const deps={bearerUser:async()=>({uid:'alice',email:'a@x.com'}),getEntitlement:async()=>null,stripe:async(p,params)=>{sent=params;return{url:'https://checkout.stripe.com/x'};}};
  const r=await checkout._handler({httpMethod:'POST',headers:{origin:'https://dev--wheelhouse-tracker.netlify.app'},body:'{"plan":"yearly"}'},{},deps);
  assert.strictEqual(r.statusCode,200);assert.strictEqual(sent['line_items[0][price]'],'price_y');assert.strictEqual(sent.client_reference_id,'alice');assert.strictEqual(sent.subscription_data.metadata.uid,'alice');assert.ok(sent.success_url.startsWith('https://dev--wheelhouse-tracker.netlify.app/app/'));
  assert.strictEqual((await checkout._handler({httpMethod:'POST',headers:{},body:'{"plan":"weekly"}'},{},deps)).statusCode,400);
  assert.strictEqual((await checkout._handler({httpMethod:'POST',headers:{},body:'{}'},{},{...deps,getEntitlement:async()=>({founder:true})})).statusCode,409);process.env=o;});
test('ID token check: real signature, right project, not expired',async()=>{const{publicKey,privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
  const pem=publicKey.export({type:'spki',format:'pem'});const b=x=>Buffer.from(JSON.stringify(x)).toString('base64url');const now=Math.floor(Date.now()/1000);
  const mk=(p,key=privateKey)=>{const u=b({alg:'RS256',kid:'k1'})+'.'+b(p);return u+'.'+crypto.createSign('RSA-SHA256').update(u).sign(key).toString('base64url');};
  const good={aud:'proj',iss:'https://securetoken.google.com/proj',sub:'alice',iat:now,exp:now+600,email:'a@x.com'};const o={projectId:'proj',certs:{k1:pem}};
  assert.deepStrictEqual(await fb.verifyIdToken(mk(good),o),{uid:'alice',email:'a@x.com'});
  await assert.rejects(fb.verifyIdToken(mk({...good,aud:'other'}),o));await assert.rejects(fb.verifyIdToken(mk({...good,exp:now-10}),o));
  await assert.rejects(fb.verifyIdToken(mk(good,crypto.generateKeyPairSync('rsa',{modulusLength:2048}).privateKey),o));await assert.rejects(fb.verifyIdToken('x.y',o));});
test('Firestore REST encoding round-trips',()=>{const f={plan:'pro',founder:true,n:3,x:1.5,z:null};assert.deepStrictEqual(fb.fromFs(Object.fromEntries(Object.entries(f).map(([k,v])=>[k,fb.toFs(v)]))),f);});

test('webhook saves renewal date from subscription items (new API) or top level (old API)', async () => {
  const { apply, periodEnd } = require('../netlify/functions/stripe-webhook');
  assert.strictEqual(periodEnd({ items: { data: [{ current_period_end: 1796246113 }] } }), 1796246113);
  assert.strictEqual(periodEnd({ current_period_end: 123 }), 123);
  assert.strictEqual(periodEnd({}), null);
  let saved;
  await apply({ type: 'customer.subscription.updated', data: { object: { id: 'sub_1', customer: 'cus_1', status: 'active', metadata: { uid: 'u1' }, items: { data: [{ current_period_end: 1796246113 }] } } } },
    { getEntitlement: async () => null, setEntitlement: async (u, f) => { saved = f; } });
  assert.strictEqual(saved.currentPeriodEnd, 1796246113);
});

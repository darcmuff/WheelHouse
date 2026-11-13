const test=require('node:test');const assert=require('node:assert');
const {extractFn}=require('./extract');
const startCheckout=new Function('_billingCall','otTrack','document','location','async '+extractFn('startCheckout')+'\nreturn startCheckout;');

async function run(plan,opts={}){
  const tracks=[];let href=null,msg='';
  const doc={getElementById(){return {get textContent(){return msg;},set textContent(v){msg=v;}};}};
  const loc={set href(v){href=v;},get href(){return href;}};
  const bill=opts.bill||(async()=>'https://checkout.stripe.com/c/pay/test');
  await startCheckout(bill,opts.track===null?undefined:(opts.track||(p=>tracks.push(p))),doc,loc)(plan);
  return {tracks,href,msg};
}
test('checkout event uses the plan name only after a Stripe URL',async()=>{
  const m=await run('monthly');assert.deepStrictEqual(m.tracks,['/checkout-started/monthly']);assert.strictEqual(m.href,'https://checkout.stripe.com/c/pay/test');
  const y=await run('yearly');assert.deepStrictEqual(y.tracks,['/checkout-started/yearly']);assert.ok(y.href);
});
test('checkout event does not fire without a URL, on error, or if analytics is missing',async()=>{
  const empty=await run('monthly',{bill:async()=>''});assert.deepStrictEqual(empty.tracks,[]);assert.strictEqual(empty.href,null);
  const bad=await run('yearly',{bill:async()=>{throw new Error('Payments are not set up yet.');}});assert.deepStrictEqual(bad.tracks,[]);assert.strictEqual(bad.href,null);assert.strictEqual(bad.msg,'Payments are not set up yet.');
  const missing=await run('monthly',{track:null});assert.strictEqual(missing.href,'https://checkout.stripe.com/c/pay/test');
  const boom=await run('monthly',{track(){throw new Error('analytics down');}});assert.strictEqual(boom.href,'https://checkout.stripe.com/c/pay/test');
});

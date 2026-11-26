// Stripe calls this when a subscription starts, changes or ends. It is the ONLY thing that grants or removes Pro
// (writes entitlements/{uid} with the service account). Every call must carry a valid Stripe signature.
// Founders (entitlement.founder === true) are never downgraded.
const { verifySignature } = require('../lib/stripe');
const fb = require('../lib/fbadmin');
const { proPriceIds, isLegacyPrice } = require('../lib/pricing');
const J = (code, body) => ({ statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const ACTIVE = ['active', 'trialing', 'past_due'];
// Newer Stripe API versions put the renewal date on the subscription item; older ones on the subscription.
// Pro is our only product: an active subscription on the new USD prices, the legacy GBP prices, or any other price
// resolves to 'pro', so existing subscribers are never broken. The price is recorded for reference.
function priceOf(o) { const it = o.items && o.items.data && o.items.data[0]; return (it && it.price && it.price.id) || (o.plan && o.plan.id) || null; }
function planForSubscription(o, deleted, env = process.env) {
  const priceId = priceOf(o), on = !deleted && ACTIVE.includes(o.status);
  if (on && priceId && !proPriceIds(env).has(priceId)) console.warn('webhook: active subscription on an unlisted price, kept as Pro');
  return { plan: on ? 'pro' : 'free', priceId, legacyPrice: isLegacyPrice(priceId, env) };
}
function periodEnd(o) { const it = o.items && o.items.data && o.items.data[0]; return (it && it.current_period_end) || o.current_period_end || null; }
async function apply(evt, deps) {
  const get = deps.getEntitlement || fb.getEntitlement, set = deps.setEntitlement || fb.setEntitlement;
  const o = evt.data && evt.data.object || {};
  let uid, fields;
  if (evt.type === 'checkout.session.completed') {
    uid = o.client_reference_id || (o.metadata || {}).uid;
    fields = { plan: 'pro', status: 'active', stripeCustomerId: o.customer || null, subscriptionId: o.subscription || null, source: 'stripe' };
  } else if (/^customer\.subscription\.(created|updated|deleted)$/.test(evt.type)) {
    uid = (o.metadata || {}).uid;
    const r = planForSubscription(o, evt.type === 'customer.subscription.deleted');
    fields = { plan: r.plan, priceId: r.priceId, legacyPrice: r.legacyPrice, status: evt.type === 'customer.subscription.deleted' ? 'canceled' : o.status, stripeCustomerId: o.customer || null, subscriptionId: o.id || null, currentPeriodEnd: periodEnd(o), source: 'stripe' };
  } else return { ignored: evt.type };
  if (!uid) return { ignored: 'no uid' };
  const cur = await get(uid).catch(() => null);
  if (cur && cur.founder) fields.plan = 'pro';   // never lock a founder out
  await set(uid, fields);
  return { uid, plan: fields.plan };
}
const handler = async (event, ctx, deps = {}) => {
  if (event.httpMethod !== 'POST') return J(405, { error: 'POST only' });
  const secret = process.env.STRIPE_WEBHOOK_SECRET; if (!secret) return J(503, { error: 'not configured' });
  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '');
  const h = event.headers || {}; const sig = h['stripe-signature'] || h['Stripe-Signature'];
  if (!verifySignature(raw, sig, secret)) return J(400, { error: 'bad signature' });
  let evt; try { evt = JSON.parse(raw); } catch (e) { return J(400, { error: 'bad json' }); }
  try { return J(200, await apply(evt, deps)); } catch (e) { console.error('webhook', e.message); return J(500, { error: 'retry' }); } // 500 → Stripe retries
};
exports.apply = apply;
exports.periodEnd = periodEnd;
exports.planForSubscription = planForSubscription;
exports.handler = handler; // not origin-guarded: Stripe's servers call it, the signature is the guard

// Start a Stripe Checkout for Pro (monthly or yearly). POST with the user's Firebase ID token.
const { bearerUser, getEntitlement } = require('../lib/fbadmin');
const { stripe, stripeKey } = require('../lib/stripe');
const { originOf } = require('../lib/origin');
const J = (code, body) => ({ statusCode: code, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });
const _handler = async (event, ctx, deps = {}) => {
  if (event.httpMethod !== 'POST') return J(405, { error: 'POST only' });
  if (!stripeKey()) return J(503, { error: 'Payments are not set up yet.' });
  const user = await (deps.bearerUser || bearerUser)(event); if (!user) return J(401, { error: 'Please sign in again.' });
  let plan = 'monthly'; try { plan = JSON.parse(event.body || '{}').plan || 'monthly'; } catch (e) {}
  const price = plan === 'yearly' ? process.env.STRIPE_PRICE_YEARLY : plan === 'monthly' ? process.env.STRIPE_PRICE_MONTHLY : null;
  if (!price) return J(400, { error: 'Unknown plan.' });
  const site = originOf(event.headers) || process.env.URL;
  let ent = null; try { ent = await (deps.getEntitlement || getEntitlement)(user.uid); } catch (e) {}
  if (ent && ent.founder) return J(409, { error: 'You are a founder: Pro is already yours, free.' });
  const s = await (deps.stripe || stripe)('checkout/sessions', {
    mode: 'subscription', 'line_items[0][price]': price, 'line_items[0][quantity]': 1,
    client_reference_id: user.uid, customer: ent && ent.stripeCustomerId || undefined, customer_email: ent && ent.stripeCustomerId ? undefined : (user.email || undefined),
    metadata: { uid: user.uid }, subscription_data: { metadata: { uid: user.uid } }, allow_promotion_codes: 'true',
    success_url: site + '/app/?upgraded=1', cancel_url: site + '/app/?upgrade=cancelled'
  });
  return J(200, { url: s.url });
};
exports._handler = _handler;
exports.handler = require('../lib/origin').guard(_handler);

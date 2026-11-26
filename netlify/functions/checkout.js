// Start a Stripe Checkout for Pro. POST {interval:'annual'|'monthly'} with the user's Firebase ID token.
// The 14-day trial lives on our own entitlement record: no Stripe customer or $0 subscription is ever made at signup;
// the user only reaches Stripe here, when they choose to upgrade.
const { bearerUser, getEntitlement } = require('../lib/fbadmin');
const { stripe, stripeKey } = require('../lib/stripe');
const { originOf } = require('../lib/origin');
const { priceForInterval } = require('../lib/pricing');
const CHECKOUT_DOWN = "Checkout isn't available right now. Please try again shortly.";
const J = (code, body) => ({ statusCode: code, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });
const _handler = async (event, ctx, deps = {}) => {
  if (event.httpMethod !== 'POST') return J(405, { error: 'POST only' });
  if (!stripeKey()) return J(503, { error: 'Payments are not set up yet.' });
  const user = await (deps.bearerUser || bearerUser)(event); if (!user) return J(401, { error: 'Please sign in again.' });
  let b = {}; try { b = JSON.parse(event.body || '{}') || {}; } catch (e) {}
  const pick = priceForInterval(b.interval || b.plan || 'annual');   // default Annual; `plan` is the old field name
  if (pick.error) { if (pick.missing) console.error('checkout: missing env', pick.missing); return J(pick.status, { error: pick.error }); }
  const price = pick.price;
  const site = originOf(event.headers) || process.env.URL;
  let ent = null; try { ent = await (deps.getEntitlement || getEntitlement)(user.uid); } catch (e) {}
  if (ent && ent.founder) return J(409, { error: 'You are a founder: Pro is already yours, free.' });
  // Stripe errors are logged here and never sent to the browser (no raw Stripe text, no stack trace).
  let s;
  try { s = await (deps.stripe || stripe)('checkout/sessions', {
    mode: 'subscription', 'line_items[0][price]': price, 'line_items[0][quantity]': 1,
    client_reference_id: user.uid, customer: ent && ent.stripeCustomerId || undefined, customer_email: ent && ent.stripeCustomerId ? undefined : (user.email || undefined),
    metadata: { uid: user.uid, interval: pick.interval }, subscription_data: { metadata: { uid: user.uid, interval: pick.interval } }, allow_promotion_codes: 'true',
    success_url: site + '/app/?upgraded=1', cancel_url: site + '/app/?upgrade=cancelled'
  }); } catch (e) { console.error('checkout: Stripe error', pick.interval, (e && e.message) || e); return J(502, { error: CHECKOUT_DOWN }); }
  if (!s || !/^https:\/\/checkout\.stripe\.com\//.test(s.url || '')) { console.error('checkout: Stripe returned no checkout URL', pick.interval); return J(502, { error: CHECKOUT_DOWN }); }
  return J(200, { url: s.url, interval: pick.interval });
};
// Last line of defence: anything unexpected becomes the same clean 502, logged server-side.
const _safe = async (event, ctx, deps) => { try { return await _handler(event, ctx, deps); } catch (e) { console.error('checkout: unexpected error', (e && e.message) || e); return J(502, { error: CHECKOUT_DOWN }); } };
exports._handler = _safe;
exports.CHECKOUT_DOWN = CHECKOUT_DOWN;
exports.handler = require('../lib/origin').guard(_safe);

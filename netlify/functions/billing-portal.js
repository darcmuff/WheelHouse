// Open Stripe's customer portal (change plan, card, cancel). POST with the user's Firebase ID token.
const { bearerUser, getEntitlement } = require('../lib/fbadmin');
const { stripe, stripeKey } = require('../lib/stripe');
const { originOf } = require('../lib/origin');
const J = (code, body) => ({ statusCode: code, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });
const _handler = async (event, ctx, deps = {}) => {
  if (event.httpMethod !== 'POST') return J(405, { error: 'POST only' });
  if (!stripeKey()) return J(503, { error: 'Payments are not set up yet.' });
  const user = await (deps.bearerUser || bearerUser)(event); if (!user) return J(401, { error: 'Please sign in again.' });
  const ent = await (deps.getEntitlement || getEntitlement)(user.uid);
  if (!ent || !ent.stripeCustomerId) return J(404, { error: 'No subscription found for this account.' });
  const s = await (deps.stripe || stripe)('billing_portal/sessions', { customer: ent.stripeCustomerId, return_url: (originOf(event.headers) || process.env.URL) + '/app/' });
  return J(200, { url: s.url });
};
exports._handler = _handler;
exports.handler = require('../lib/origin').guard(_handler);

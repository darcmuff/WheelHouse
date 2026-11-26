// Stripe Price IDs for OpTrack Pro, read from Netlify env vars (never hard-coded).
// New USD prices (checkout uses only these):
//   STRIPE_PRICE_PRO_ANNUAL_USD   → $59/year   (interval 'annual', the default)
//   STRIPE_PRICE_PRO_MONTHLY_USD  → $6.99/month (interval 'monthly')
// Legacy GBP prices (no new checkouts; existing subscribers on them stay Pro):
//   STRIPE_PRICE_YEARLY, STRIPE_PRICE_MONTHLY  (the original £79 / £9 prices)
//   STRIPE_PRICE_LEGACY_IDS (optional, comma-separated extra legacy price IDs)
const PRICE_ENV = { annual: 'STRIPE_PRICE_PRO_ANNUAL_USD', monthly: 'STRIPE_PRICE_PRO_MONTHLY_USD' };
const LEGACY_ENV = ['STRIPE_PRICE_YEARLY', 'STRIPE_PRICE_MONTHLY'];
// 'annual' | 'monthly'; older clients sent plan 'yearly' | 'monthly'.
function normInterval(v) { v = String(v || '').toLowerCase(); return v === 'annual' || v === 'yearly' ? 'annual' : v === 'monthly' ? 'monthly' : null; }
function priceForInterval(interval, env = process.env) {
  const i = normInterval(interval); if (!i) return { error: 'Unknown billing interval. Use annual or monthly.', status: 400 };
  const name = PRICE_ENV[i], id = env[name];
  if (!id) return { error: `Payments are misconfigured: ${name} is not set on the server.`, status: 500, missing: name };
  return { interval: i, price: id, envName: name };
}
function proPriceIds(env = process.env) {
  const ids = [env[PRICE_ENV.annual], env[PRICE_ENV.monthly], ...LEGACY_ENV.map(k => env[k]), ...String(env.STRIPE_PRICE_LEGACY_IDS || '').split(',')]
    .map(s => String(s || '').trim()).filter(Boolean);
  return new Set(ids);
}
function isLegacyPrice(id, env = process.env) {
  if (!id) return false;
  return LEGACY_ENV.some(k => env[k] === id) || String(env.STRIPE_PRICE_LEGACY_IDS || '').split(',').map(s => s.trim()).includes(id);
}
module.exports = { PRICE_ENV, LEGACY_ENV, normInterval, priceForInterval, proPriceIds, isLegacyPrice };

// Tiny Stripe REST client + webhook signature check (no npm dependency).
const crypto = require('crypto');
function form(obj, prefix, out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v, key, out); else out.push(encodeURIComponent(key) + '=' + encodeURIComponent(v));
  }
  return out.join('&');
}
// TEST MODE ONLY unless STRIPE_ALLOW_LIVE=1 is set deliberately.
function stripeKey() {
  const k = process.env.STRIPE_SECRET_KEY || '';
  if (!k) return null;
  if (k.startsWith('sk_live_') && process.env.STRIPE_ALLOW_LIVE !== '1') return null;
  return k;
}
async function stripe(path, params, fetchImpl = fetch) {
  const key = stripeKey(); if (!key) throw Object.assign(new Error('Payments are not set up yet'), { code: 'not_configured' });
  const r = await fetchImpl('https://api.stripe.com/v1/' + path, { method: params ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/x-www-form-urlencoded' }, body: params ? form(params) : undefined });
  const j = await r.json(); if (!r.ok) throw new Error((j.error && j.error.message) || 'Stripe ' + r.status);
  return j;
}
function verifySignature(payload, header, secret, toleranceSec = 300, now = Date.now()) {
  if (!payload || !header || !secret) return false;
  const parts = Object.create(null); const v1 = [];
  String(header).split(',').forEach(p => { const [k, v] = p.split('='); if (k === 'v1') v1.push(v); else parts[k] = v; });
  const t = +parts.t; if (!t || Math.abs(now / 1000 - t) > toleranceSec) return false;
  const expected = crypto.createHmac('sha256', secret).update(t + '.' + payload, 'utf8').digest('hex');
  return v1.some(s => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}
module.exports = { stripe, stripeKey, verifySignature, form };

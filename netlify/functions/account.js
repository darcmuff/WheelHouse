// Account plan bookkeeping that the browser is NOT allowed to write itself (entitlements/{uid} is read-only to users).
// POST with the user's Firebase ID token and {action}:
//   'start-trial' → sets trialStartedAt / trialEndsAt (+14 days) ONCE, only for a brand-new account (created in the
//                   last 48 hours, checked with Firebase Auth, not the browser). Existing accounts stay as they are.
//                   No Stripe customer or subscription is created: the trial lives only on our own record.
//   'csv-import'  → records one completed Robinhood CSV import (csvImportsUsed += 1).
const fb = require('../lib/fbadmin');
const T = require('../../app/entitlement.js');
const J = (code, body) => ({ statusCode: code, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });
const NEW_ACCOUNT_MS = 48 * 3600e3;
// The Firebase web API key is public client config (it is in app/index.html); env can override it.
const WEB_KEY = () => process.env.FIREBASE_WEB_API_KEY || 'AIzaSyCZi2lMI3luwA6ZLBQF0k1fKIPkrrhFZeI';
async function accountCreatedAt(idToken, fetchImpl = fetch) {
  const r = await fetchImpl('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(WEB_KEY()), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken })
  });
  if (!r.ok) throw new Error('lookup ' + r.status);
  const j = await r.json(); const u = j.users && j.users[0];
  const t = u && +u.createdAt; if (!t) throw new Error('no createdAt');
  return t;
}
const pub = e => ({ plan: (e && e.plan) || 'free', founder: !!(e && e.founder), trialStartedAt: (e && e.trialStartedAt) || null, trialEndsAt: (e && e.trialEndsAt) || null, csvImportsUsed: (e && +e.csvImportsUsed) || 0 });
// Pure decision: should this account get a trial now? (exported for tests)
function trialDecision(ent, createdAtMs, now) {
  if (ent && ent.trialStartedAt) return { start: false, why: 'already' };       // once only, never extended
  if (T.isPaid(ent)) return { start: false, why: 'paid' };
  if (!createdAtMs || now - createdAtMs > NEW_ACCOUNT_MS || createdAtMs > now + 300e3) return { start: false, why: 'existing' };
  return { start: true, fields: T.trialFields(now) };
}
const _handler = async (event, ctx, deps = {}) => {
  if (event.httpMethod !== 'POST') return J(405, { error: 'POST only' });
  const user = await (deps.bearerUser || fb.bearerUser)(event); if (!user) return J(401, { error: 'Please sign in again.' });
  let b = {}; try { b = JSON.parse(event.body || '{}') || {}; } catch (e) {}
  const get = deps.getEntitlement || fb.getEntitlement, set = deps.setEntitlement || fb.setEntitlement;
  const now = deps.now ? deps.now() : Date.now();
  let ent; try { ent = await get(user.uid); } catch (e) { return J(503, { error: 'Could not read your plan, try again.' }); }
  if (b.action === 'start-trial') {
    if (ent && ent.trialStartedAt) return J(200, { started: false, why: 'already', entitlement: pub(ent) });
    if (T.isPaid(ent)) return J(200, { started: false, why: 'paid', entitlement: pub(ent) });
    const h = event.headers || {}; const tok = (/^Bearer (.+)$/.exec(h.authorization || h.Authorization || '') || [])[1];
    let created; try { created = await (deps.accountCreatedAt || accountCreatedAt)(tok); } catch (e) { return J(503, { error: 'Could not check the account, try again.' }); }
    const d = trialDecision(ent, created, now);
    if (!d.start) return J(200, { started: false, why: d.why, entitlement: pub(ent) });
    await set(user.uid, d.fields);
    return J(200, { started: true, entitlement: pub({ ...(ent || {}), ...d.fields }) });
  }
  if (b.action === 'csv-import') {
    const n = ((ent && +ent.csvImportsUsed) || 0) + 1;
    await set(user.uid, { csvImportsUsed: n });
    return J(200, { csvImportsUsed: n, entitlement: pub({ ...(ent || {}), csvImportsUsed: n }) });
  }
  return J(400, { error: 'Unknown action.' });
};
exports._handler = _handler;
exports.trialDecision = trialDecision;
exports.accountCreatedAt = accountCreatedAt;
exports.handler = require('../lib/origin').guard(_handler);

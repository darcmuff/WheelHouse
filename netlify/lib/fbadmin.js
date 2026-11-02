// Minimal server-side Firebase helpers with no npm dependencies:
//  - verifyIdToken: checks a signed-in user's Firebase ID token (so a function knows who is calling)
//  - getEntitlement / setEntitlement: read/write entitlements/{uid} with the service account (bypasses rules;
//    users themselves can only read their own entitlement, never write it).
// Needs env FIREBASE_SERVICE_ACCOUNT (the service-account JSON, raw or base64). Project id from it or FIREBASE_PROJECT_ID.
const crypto = require('crypto');
const PROJECT = () => process.env.FIREBASE_PROJECT_ID || (serviceAccount() || {}).project_id || 'wheelhouse-61982';
function serviceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT; if (!raw) return null;
  try { return JSON.parse(raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')); } catch (e) { return null; }
}
const b64u = b => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const unb64u = s => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

let _certs = null, _certsExp = 0;
async function googleCerts(fetchImpl) {
  if (_certs && Date.now() < _certsExp) return _certs;
  const r = await fetchImpl('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
  if (!r.ok) throw new Error('cert fetch ' + r.status);
  const m = /max-age=(\d+)/.exec(r.headers.get('cache-control') || ''); _certsExp = Date.now() + (m ? +m[1] * 1000 : 3600e3);
  _certs = await r.json(); return _certs;
}
async function verifyIdToken(token, opts = {}) {
  const fetchImpl = opts.fetch || fetch, now = Math.floor((opts.now || Date.now()) / 1000), pid = opts.projectId || PROJECT();
  const parts = String(token || '').split('.'); if (parts.length !== 3) throw new Error('bad token');
  const head = JSON.parse(unb64u(parts[0])), body = JSON.parse(unb64u(parts[1]));
  if (head.alg !== 'RS256') throw new Error('bad alg');
  const certs = opts.certs || await googleCerts(fetchImpl); const cert = certs[head.kid]; if (!cert) throw new Error('unknown key');
  const ok = crypto.createVerify('RSA-SHA256').update(parts[0] + '.' + parts[1]).verify(cert, unb64u(parts[2]));
  if (!ok) throw new Error('bad signature');
  if (body.aud !== pid || body.iss !== 'https://securetoken.google.com/' + pid) throw new Error('wrong project');
  if (!body.sub || body.exp <= now || body.iat > now + 300) throw new Error('expired');
  return { uid: body.sub, email: body.email || '' };
}
async function bearerUser(event, opts) {
  const h = event.headers || {}; const a = h.authorization || h.Authorization || '';
  const m = /^Bearer (.+)$/.exec(a); if (!m) return null;
  try { return await verifyIdToken(m[1], opts); } catch (e) { return null; }
}

let _tok = null, _tokExp = 0;
async function accessToken(fetchImpl = fetch) {
  if (_tok && Date.now() < _tokExp) return _tok;
  const sa = serviceAccount(); if (!sa) throw new Error('FIREBASE_SERVICE_ACCOUNT not set');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' + b64u(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const jwt = unsigned + '.' + b64u(crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key));
  const r = await fetchImpl('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + jwt });
  if (!r.ok) throw new Error('token ' + r.status);
  const j = await r.json(); _tok = j.access_token; _tokExp = Date.now() + (j.expires_in - 120) * 1000; return _tok;
}
function toFs(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  return { stringValue: String(v) };
}
function fromFs(f) { const o = {}; for (const k in (f || {})) { const v = f[k]; o[k] = 'booleanValue' in v ? v.booleanValue : 'integerValue' in v ? +v.integerValue : 'doubleValue' in v ? v.doubleValue : 'nullValue' in v ? null : v.stringValue; } return o; }
const docUrl = uid => `https://firestore.googleapis.com/v1/projects/${PROJECT()}/databases/(default)/documents/entitlements/${encodeURIComponent(uid)}`;
async function getEntitlement(uid, fetchImpl = fetch) {
  const r = await fetchImpl(docUrl(uid), { headers: { Authorization: 'Bearer ' + await accessToken(fetchImpl) } });
  if (r.status === 404) return null; if (!r.ok) throw new Error('get entitlement ' + r.status);
  return fromFs((await r.json()).fields);
}
async function setEntitlement(uid, fields, fetchImpl = fetch) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid || '')) throw new Error('bad uid');
  const f = { ...fields, updatedAt: new Date().toISOString() }; const mask = Object.keys(f).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
  const body = { fields: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, toFs(v)])) };
  const r = await fetchImpl(docUrl(uid) + '?' + mask, { method: 'PATCH', headers: { Authorization: 'Bearer ' + await accessToken(fetchImpl), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('set entitlement ' + r.status);
  return f;
}
module.exports = { verifyIdToken, bearerUser, accessToken, getEntitlement, setEntitlement, toFs, fromFs, serviceAccount, _reset: () => { _certs = null; _tok = null; } };

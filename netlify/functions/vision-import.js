// Stage 2: read option trades from ONE broker screenshot with the paid Anthropic API (claude-haiku-5-5).
// POST { image: <base64 JPEG/PNG/WebP>, mediaType } with the user's Firebase ID token.
//  401 no/invalid token · 413 image over 1.5 MB base64 · 400 more than one image · 415 not an image
//  503 not configured (no ANTHROPIC_API_KEY) or plan unreadable · 429 daily cap (Free 5, Pro/trial 50 per UTC day)
//  502 the model reply could not be read · 200 { notTrade, broker, rows, usage, used, cap, model }
// Privacy: the image lives only in this request's memory. It is never written to Storage/Firestore and never logged;
// neither is the model's reply. The only thing stored is visionUsage/{uid} = { day, count }.
const fb = require('../lib/fbadmin');
const T = require('../../app/entitlement.js');
const V = require('../lib/vision-trades');
const J = (code, body) => ({ statusCode: code, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });

async function callAnthropic(body, key, fetchImpl = fetch) {
  const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), 24000);
  try {
    const r = await fetchImpl('https://api.anthropic.com/v1/messages', { method: 'POST', signal: ac.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': process.env.ANTHROPIC_VERSION || '2026-10-21' }, body: JSON.stringify(body) });
    if (!r.ok) { const e = new Error('upstream'); e.status = r.status; throw e; }
    return await r.json();
  } finally { clearTimeout(timer); }
}

const _handler = async (event, ctx, deps = {}) => {
  const L = deps.log || console, env = deps.env || process.env, now = deps.now ? deps.now() : Date.now();
  if (event.httpMethod !== 'POST') return J(405, { error: 'POST only' });
  const user = await (deps.bearerUser || fb.bearerUser)(event); if (!user) return J(401, { error: 'Please sign in again.' });
  let raw = event.body || ''; if (event.isBase64Encoded) raw = Buffer.from(raw, 'base64').toString('utf8');
  if (raw.length > V.MAX_B64 + 4096) return J(413, { error: 'That picture is too large. Crop it to just the trades and try again.' });
  let b; try { b = JSON.parse(raw); } catch (e) { return J(400, { error: 'Bad request.' }); }
  if (Array.isArray(b && b.images) || Array.isArray(b && b.image)) return J(400, { error: 'Send one screenshot at a time.' });
  const b64 = typeof (b && b.image) === 'string' ? b.image.replace(/^data:[^,]*,/, '') : '';
  if (!b64) return J(400, { error: 'No screenshot was sent.' });
  if (b64.length > V.MAX_B64) return J(413, { error: 'That picture is too large. Crop it to just the trades and try again.' });
  const mime = V.sniffMime(Buffer.from(b64.slice(0, 64), 'base64'));
  if (!mime) return J(415, { error: "That isn't a picture we can read. Use a PNG or JPEG screenshot." });
  const key = env.ANTHROPIC_API_KEY;
  if (!key) return J(503, { error: "Screenshot import isn't switched on yet.", configured: false });

  let ent; try { ent = await (deps.getEntitlement || fb.getEntitlement)(user.uid); } catch (e) { return J(503, { error: 'Could not read your plan, try again.' }); }
  const tier = T.getEffectiveTier(ent, now).tier;
  const getU = deps.getUsage || fb.getVisionUsage, putU = deps.putUsage || fb.putVisionUsage;
  let q;
  for (let attempt = 0; ; attempt++) { // count BEFORE the model call, so failures and non-trade images count too
    let cur; try { cur = await getU(user.uid); } catch (e) { return J(503, { error: 'Busy, try again in a moment.' }); }
    q = V.quotaDecision(cur && cur.fields, tier, now);
    if (!q.allowed) return J(429, { error: `You've used today's ${q.cap} screenshot reads (Free: ${V.CAPS.free} a day, Pro: ${V.CAPS.pro}). They reset at midnight UTC.`, used: q.count, cap: q.cap });
    try { await putU(user.uid, { day: q.day, count: q.count }, cur ? { updateTime: cur.updateTime } : { exists: false }); break; }
    catch (e) { if (e && e.conflict && attempt < 1) continue; return J(503, { error: 'Busy, try again in a moment.' }); }
  }

  let res;
  try { res = await (deps.anthropic ? deps.anthropic(V.anthropicBody(b64, mime)) : callAnthropic(V.anthropicBody(b64, mime), key)); }
  catch (e) { L.warn('vision-import: upstream failed', (e && e.status) || (e && e.name) || 'error'); return J(502, { error: "Couldn't read the screenshot right now. Try again in a minute.", used: q.count, cap: q.cap }); }
  const usage = { input_tokens: +(res && res.usage && res.usage.input_tokens) || 0, output_tokens: +(res && res.usage && res.usage.output_tokens) || 0 };
  let out;
  try {
    if (!res || res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') throw new Error('stop');
    const block = (res.content || []).find(c => c && c.type === 'text');
    out = V.normalizeTrades(JSON.parse(block ? block.text : ''), now);
  } catch (e) { L.warn('vision-import: unreadable model reply', (res && res.stop_reason) || 'parse'); return J(502, { error: "Couldn't read that screenshot. Try a clearer screenshot, or paste the rows instead.", used: q.count, cap: q.cap, usage }); }
  return J(200, { notTrade: out.notTrade, broker: out.broker, rows: out.rows, usage, used: q.count, cap: q.cap, model: V.MODEL });
};
exports._handler = _handler;
exports.callAnthropic = callAnthropic;
exports.handler = require('../lib/origin').guard(_handler);

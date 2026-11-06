// Only our own sites may use these functions. Anyone else (other websites, scripts, curl) gets 403,
// so they can't spend our Finnhub/Cboe/Yahoo quota.
// Live domain is baked in. Extra origins can still be added with ALLOWED_ORIGINS (comma-separated).
const BASE = ['https://optrack.app', 'https://www.optrack.app', 'https://wheelhouse-tracker.netlify.app', 'https://darcmuff.github.io'];
function originOf(headers) {
  const h = {}; for (const k in (headers || {})) h[k.toLowerCase()] = headers[k];
  if (h.origin && h.origin !== 'null') return h.origin;
  if (h.referer) { try { return new URL(h.referer).origin; } catch (e) { return ''; } }
  return '';
}
function allowed(origin, extra) {
  if (!origin) return false;
  let u; try { u = new URL(origin); } catch (e) { return false; }
  const o = u.origin;
  const list = BASE.concat(String(extra || '').split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean));
  if (list.includes(o)) return true;
  if (u.protocol === 'https:' && /^[a-z0-9-]+--wheelhouse-tracker\.netlify\.app$/.test(u.hostname)) return true; // dev, branch and deploy previews
  if ((u.hostname === 'localhost' || u.hostname === '127.0.0.1') && /^https?:$/.test(u.protocol)) return true;
  return false;
}
function guard(handler) {
  return async (event, ctx) => {
    const origin = originOf(event && event.headers);
    if (!allowed(origin, process.env.ALLOWED_ORIGINS)) {
      return { statusCode: 403, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify({ error: 'Forbidden' }) };
    }
    const res = await handler(event, ctx);
    if (res && res.headers) { res.headers['Access-Control-Allow-Origin'] = origin; res.headers['Vary'] = 'Origin'; }
    return res;
  };
}
module.exports = { guard, allowed, originOf };

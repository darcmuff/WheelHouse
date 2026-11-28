// Stage 2: broker screenshot → option trades. Loaded with dynamic import() from importLoadFile ONLY when the picked
// file is a picture, so none of this is in the initial /app or /demo bundle (and sw.js does not precache it).
// The picture is shrunk in the browser (long edge ≤ 1600px, JPEG 0.8), sent once to /.netlify/functions/vision-import
// (Firebase ID token required), and never stored. Trades come back as rows, become plain CSV text in the import box,
// and go through the exact Stage 1 Review → dedupe → Free caps → awaited save → landing path.
export const MAX_EDGE = 1600;
export const QUALITY = 0.8;
export const MAX_B64 = 1500000;
const ACT = { sell_to_open: 'Sell to Open', buy_to_close: 'Buy to Close', buy_to_open: 'Buy to Open', sell_to_close: 'Sell to Close' };
const HEIC_MSG = "This photo is in HEIC format, which this browser can't open. Take a screenshot instead (screenshots work everywhere), or on iPhone set Settings → Camera → Formats → Most Compatible.";
const DECODE_MSG = "Couldn't open that picture. Take a screenshot of the trades and pick that instead.";
const NO_TRADES = "No trades found in that picture. Use a screenshot of your broker's option order details or trade history, or paste the rows below.";
const USED = "The free plan includes 1 import (a Robinhood CSV or a screenshot), and you've used it. Pro has unlimited imports.";

export function fitSize(w, h, max = MAX_EDGE) {
  const s = Math.min(1, max / Math.max(w, h));
  return { w: Math.round(w * s), h: Math.round(h * s) };
}
export function isHeic(file, u8) {
  if (/\.(heic|heif)$/i.test((file && file.name) || '') || /hei[cf]/i.test((file && file.type) || '')) return true;
  if (!u8 || u8.length < 12) return false;
  const s = String.fromCharCode.apply(null, Array.prototype.slice.call(u8, 4, 12));
  return /^ftyp(heic|heix|hevc|hevx|mif1|msf1|heim|heis)/.test(s);
}
function b64of(u8, env) {
  let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.prototype.slice.call(u8, i, i + 0x8000));
  return (env.btoa || btoa)(s);
}
function loadImg(file, env) {
  return new Promise((res, rej) => {
    const U = env.URL || URL, url = U.createObjectURL(file), img = env.document.createElement('img');
    img.onload = () => { try { U.revokeObjectURL(url); } catch (e) {} res(img); };
    img.onerror = () => { try { U.revokeObjectURL(url); } catch (e) {} rej(new Error('decode')); };
    img.src = url;
  });
}
// Decode (createImageBitmap, then <img> — Safari decodes HEIC this way), scale, and re-encode as JPEG.
export async function prepareImage(file, env = globalThis) {
  const u8 = new Uint8Array(await file.arrayBuffer());
  const heic = isHeic(file, u8);
  let src, w, h, done = () => {};
  try { const bm = await env.createImageBitmap(file); src = bm; w = bm.width; h = bm.height; done = () => { try { bm.close && bm.close(); } catch (e) {} }; }
  catch (e) {
    try { const img = await loadImg(file, env); src = img; w = img.naturalWidth; h = img.naturalHeight; }
    catch (e2) { const err = new Error(heic ? HEIC_MSG : DECODE_MSG); err.code = heic ? 'heic' : 'decode'; throw err; }
  }
  if (!w || !h) { done(); const err = new Error(heic ? HEIC_MSG : DECODE_MSG); err.code = heic ? 'heic' : 'decode'; throw err; }
  const enc = async (max, q) => {
    const d = fitSize(w, h, max), c = env.document.createElement('canvas'); c.width = d.w; c.height = d.h;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, d.w, d.h); g.drawImage(src, 0, 0, d.w, d.h);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', q));
    if (!blob) throw Object.assign(new Error(DECODE_MSG), { code: 'decode' });
    return { b64: b64of(new Uint8Array(await blob.arrayBuffer()), env), width: d.w, height: d.h };
  };
  try {
    let r = await enc(MAX_EDGE, QUALITY);
    if (r.b64.length > MAX_B64) r = await enc(1280, 0.6);
    return { b64: r.b64, mediaType: 'image/jpeg', width: r.width, height: r.height };
  } finally { done(); }
}
export function occSymbol(r) {
  if (!r || !r.ticker || !r.expiry || !r.type || !(r.strike > 0)) return '';
  return `${r.ticker} ${r.expiry.slice(2, 4)}${r.expiry.slice(5, 7)}${r.expiry.slice(8, 10)}${r.type === 'put' ? 'P' : 'C'}${String(Math.round(r.strike * 1000)).padStart(8, '0')}`;
}
const v = x => (x === null || x === undefined ? '' : String(x));
// Selected rows only. Values that were not on the screenshot stay blank: Stage 1 then shows the row as "couldn't understand" until fixed.
export function rowsToCsv(rows, sel) {
  const ix = [...sel].sort((a, b) => a - b).filter(i => rows[i]);
  if (!ix.length) return '';
  return ['Date,Symbol,Action,Quantity,Price,Fees,Amount'].concat(ix.map(i => {
    const r = rows[i], amt = r.total === null || r.total === undefined ? '' : String(/^sell/.test(r.action || '') ? Math.abs(r.total) : -Math.abs(r.total));
    return [v(r.date), occSymbol(r), ACT[r.action] || '', v(r.qty), v(r.price), v(r.fees), amt].join(',');
  })).join('\n') + '\n';
}
export function defaultSel(rows) { const s = new Set(); (rows || []).forEach((r, i) => { if (r.ok) s.add(i); }); return s; }
function describe(r) {
  const p = r.price === null || r.price === undefined ? '?' : Number(r.price).toFixed(2);
  return `${r.ticker || '?'} ${r.strike || '?'}${r.type ? r.type[0].toUpperCase() : '?'} ${r.expiry || '?'} · ${ACT[r.action] || '?'} ${r.qty || '?'} @ ${p} · ${r.date || '?'}` +
    (r.missing && r.missing.length ? ` — missing: ${r.missing.join(', ')}` : '') + (r.uncertain && r.uncertain.length ? ` — check: ${r.uncertain.join(', ')}` : '');
}
const CSS = '<style>.imp-vis{font-family:Urbanist,-apple-system,"Segoe UI",Roboto,sans-serif;margin-top:0.5rem}.imp-vrow{display:flex;gap:0.5rem;align-items:flex-start;padding:0.25rem 0;font-size:0.75rem;line-height:1.4;cursor:pointer}.imp-vrow input{margin-top:0.15rem;flex:none}.imp-vis .imp-cap-warn .imp-vrow{color:var(--text3)}.imp-vhd{margin-top:0.5rem;color:var(--text2)}</style>';
export function flagsHtml(rows, sel, esc) {
  const box = (r, i) => `<label class="imp-vrow"><input type="checkbox"${sel.has(i) ? ' checked' : ''} onchange="importVisionToggle(${i})"> <span>${esc(describe(r))}</span></label>`;
  const ok = [], bad = []; rows.forEach((r, i) => (r.ok ? ok : bad).push(box(r, i)));
  return `<div class="imp-vis">${CSS}<div class="imp-vhd">From your screenshot: ${rows.length} trade${rows.length === 1 ? '' : 's'}. Ticked rows are in the box above; tick or untick to change.</div>${ok.join('')}` +
    (bad.length ? `<div class="imp-cap-warn">${bad.length} row${bad.length === 1 ? '' : 's'} flagged for checking (not ticked by default). Tick one to add it to the box above, then fill in any blank value there.${bad.join('')}</div>` : '') + '</div>';
}
export function statusMessage(s, j) {
  j = j || {};
  if (s === 401) return 'Please sign in again, then pick the screenshot again.';
  if (s === 413) return 'That picture is too large even after shrinking. Crop it to just the trades and try again.';
  if (s === 415) return "That file isn't a picture we can read. Use a PNG or JPEG screenshot.";
  if (s === 429) return j.error || "You've used today's screenshot reads. They reset at midnight UTC.";
  if (s === 503 && j.configured === false) return "Screenshot import isn't switched on yet. Export a CSV from your broker, or paste the rows below.";
  if (s === 503) return j.error || 'Busy, try again in a minute.';
  return "Couldn't read the screenshot right now. Try again in a minute, or paste the rows below.";
}
// A = bridge from app.js: { fail, preview, csvOk, demo, user, esc, set, upgrade, text, busy?, fetch?, prepare? }
export async function run(file, A) {
  const u = A.user && A.user();
  if (A.demo || !u) return A.fail('Sign in to import trades from a screenshot. Screenshot import is not available in the demo.');
  if (!A.csvOk()) return A.fail(USED); // no vision call is spent once the Free import is used
  if (A.busy) A.busy('Reading screenshot…');
  let img; try { img = await (A.prepare || prepareImage)(file); } catch (e) { return A.fail((e && e.message) || DECODE_MSG); }
  let r, j;
  try {
    const tok = await u.getIdToken();
    const ac = typeof AbortController !== 'undefined' ? new AbortController() : null, t = ac ? setTimeout(() => ac.abort(), 45000) : 0;
    try { r = await (A.fetch || fetch)('/.netlify/functions/vision-import', { method: 'POST', signal: ac ? ac.signal : undefined, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify({ image: img.b64, mediaType: img.mediaType }) }); }
    finally { if (t) clearTimeout(t); }
    j = await r.json().catch(() => ({}));
  } catch (e) { return A.fail(statusMessage(0)); }
  img = null; // drop our only copy of the picture
  if (!r.ok) return A.fail(statusMessage(r.status, j));
  const rows = Array.isArray(j.rows) ? j.rows : [];
  if (j.notTrade || !rows.length) return A.fail(NO_TRADES);
  const sel = defaultSel(rows);
  const state = { rows, sel, usage: j.usage || null, html: () => flagsHtml(rows, sel, A.esc) };
  A.set(state);
  if (typeof window !== 'undefined') window.importVisionToggle = i => { sel.has(i) ? sel.delete(i) : sel.add(i); A.text(rowsToCsv(rows, sel)); A.preview(); };
  A.text(rowsToCsv(rows, sel));
  A.preview();
}

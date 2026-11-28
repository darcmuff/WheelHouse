// vision-client.test.js — Stage 2 screenshot importer, browser side (app/import-vision.js, lazy) and its wiring into the Stage 1 pipeline.
const test = require('node:test'); const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { extractFn, extractConst } = require('./extract');
const A = path.join(__dirname, '..', 'app');
const APPJS = fs.readFileSync(path.join(A, 'app.js'), 'utf8');
const INDEX = fs.readFileSync(path.join(A, 'index.html'), 'utf8');
const SW = fs.readFileSync(path.join(A, 'sw.js'), 'utf8');
const VSRC = fs.readFileSync(path.join(A, 'import-vision.js'), 'utf8');
const IV = new Function(VSRC.replace(/^export (async function|function|const) /gm, '$1 ') + '\nreturn{MAX_EDGE,QUALITY,MAX_B64,fitSize,isHeic,prepareImage,occSymbol,rowsToCsv,defaultSel,flagsHtml,statusMessage,run};')();

// Stage 1 engine pieces, extracted live from app.js
const B = new Function([extractConst('MON_PAT'), extractConst('MON_MAP'), extractConst('CREDITS'), extractConst('ACTION_MAP'), extractConst('VALID_ACTIONS'),
  extractFn('isCredit'), extractFn('computeTotal'), extractFn('parseCSVLine'), extractFn('normDate'), extractFn('brokerCSVLib')].join('\n') + '\nreturn brokerCSVLib();')();
const G = new Function(['const _impFp=r=>`${r.ticker}|${r.action}|${r.entered}|${+r.strike||\'\'}|${+r.shares||\'\'}`;', extractFn('importDedupe'), extractFn('importGate'), extractFn('importUsesAllowance')].join('\n') + '\nreturn{importDedupe,importGate,importUsesAllowance};')();

const row = o => Object.assign({ ticker: 'AAPL', date: '2026-11-03', action: 'sell_to_open', type: 'put', strike: 150, expiry: '2026-12-19', qty: 2, price: 1.5, fees: 0.04, total: 299.96, missing: [], uncertain: [], ok: true }, o);

test('image handling is lazy: only importLoadFile dynamic-imports import-vision.js, nothing image-related in the initial bundle', () => {
  const loadFn = APPJS.slice(APPJS.indexOf('async function importLoadFile'), APPJS.indexOf('let _pdfjs'));
  assert.match(loadFn, /kind==='image'[\s\S]{0,80}import\(['"]\.\/import-vision\.js['"]\)/);
  assert.strictEqual((APPJS.match(/import-vision\.js/g) || []).length, 1, 'one reference only, inside importLoadFile');
  assert.doesNotMatch(APPJS, /createImageBitmap|toBlob\(|toDataURL\(/, 'resize/compress code is not in app.js');
  assert.doesNotMatch(INDEX, /import-vision/);
  const staticArr = SW.slice(SW.indexOf('const STATIC'), SW.indexOf('];', SW.indexOf('const STATIC')) + 2);
  assert.doesNotMatch(staticArr, /import-vision\.js/, 'not precached at install (runtime cache only)');
});

test('file picker stays broad: #import-file has no accept attribute', () => {
  const tag = INDEX.match(/<input[^>]*id="import-file"[^>]*>/)[0];
  assert.doesNotMatch(tag, /accept=/);
});

test('resize: long edge capped at 1600px, aspect kept, small images untouched; JPEG at 0.8', () => {
  assert.strictEqual(IV.MAX_EDGE, 1600); assert.strictEqual(IV.QUALITY, 0.8); assert.strictEqual(IV.MAX_B64, 1500000);
  assert.deepStrictEqual(IV.fitSize(1179, 2556), { w: 738, h: 1600 });
  assert.deepStrictEqual(IV.fitSize(3000, 1000), { w: 1600, h: 533 });
  assert.deepStrictEqual(IV.fitSize(800, 600), { w: 800, h: 600 });
});

function fakeEnv(o = {}) {
  const calls = { draw: [], toBlob: [] };
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: (...a) => calls.draw.push(a), fillRect: () => {}, set fillStyle(v) {} }),
    toBlob: (cb, type, q) => { calls.toBlob.push([type, q]); cb(o.blobNull ? null : { size: 1000, type, arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]).buffer }); } };
  return { calls, env: {
    createImageBitmap: o.bitmapFail ? async () => { throw new Error('decode'); } : async () => ({ width: o.w || 1179, height: o.h || 2556, close: () => {} }),
    document: { createElement: t => (t === 'canvas' ? canvas : (o.imgFail ? { set src(v) { setTimeout(() => this.onerror && this.onerror(new Error('x')), 0); } } : { naturalWidth: 1179, naturalHeight: 2556, set src(v) { setTimeout(() => this.onload && this.onload(), 0); } })) },
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} },
    btoa: s => Buffer.from(s, 'binary').toString('base64')
  } };
}
const file = (name, type, bytes) => ({ name, type, size: bytes.length, arrayBuffer: async () => new Uint8Array(bytes).buffer, slice: () => file(name, type, bytes) });

test('prepareImage: decodes, scales to ≤1600px and outputs base64 JPEG at quality 0.8', async () => {
  const { env, calls } = fakeEnv();
  const r = await IV.prepareImage(file('shot.png', 'image/png', [0x89, 0x50, 0x4e, 0x47]), env);
  assert.strictEqual(r.mediaType, 'image/jpeg'); assert.deepStrictEqual(calls.toBlob[0], ['image/jpeg', 0.8]);
  assert.strictEqual(r.width, 738); assert.strictEqual(r.height, 1600);
  assert.ok(r.b64.length > 0 && Buffer.from(r.b64, 'base64')[0] === 0xff);
});

test('HEIC that the browser cannot decode → clear "take a screenshot instead" message; other undecodable images → plain message', async () => {
  const heic = [0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]; // ....ftypheic
  assert.ok(IV.isHeic(file('IMG_1.HEIC', 'image/heic', heic), new Uint8Array(heic)));
  const { env } = fakeEnv({ bitmapFail: true, imgFail: true });
  await assert.rejects(IV.prepareImage(file('IMG_1.HEIC', '', heic), env), e => e.code === 'heic' && /take a screenshot instead/i.test(e.message) && /Most Compatible/.test(e.message));
  await assert.rejects(IV.prepareImage(file('x.png', 'image/png', [0x89, 0x50, 0x4e, 0x47]), env), e => e.code === 'decode');
  // HEIC that Safari CAN decode goes through like any other picture
  const ok = fakeEnv({ bitmapFail: true });
  const r = await IV.prepareImage(file('IMG_2.HEIC', 'image/heic', heic), ok.env);
  assert.strictEqual(r.mediaType, 'image/jpeg');
});

test('screenshot rows → CSV → the same Stage 1 parser: multi-trade extraction, LEAP buy-to-open goes to option fills', () => {
  const rows = [row(), row({ ticker: 'TSLA', type: 'call', strike: 450, expiry: '2026-11-28', qty: 1, price: 3.1, fees: null, total: null }),
    row({ action: 'buy_to_close', price: 0.4, date: '2026-11-05', fees: null, total: null }), row({ ticker: 'QQQ', action: 'buy_to_open', type: 'call', strike: 500, expiry: '2028-01-21', qty: 1, price: 62.3, fees: null, total: null })];
  assert.strictEqual(IV.occSymbol(rows[0]), 'AAPL 261219P00150000');
  const csv = IV.rowsToCsv(rows, IV.defaultSel(rows));
  const p = B.parseBrokerCSV(csv); const v = B.vetRows(p);
  assert.strictEqual(v.rows.length, 3, csv + JSON.stringify(p.unrecognised));
  assert.deepStrictEqual(v.rows.map(r => r.action), ['CSP', 'STOC', 'BTC']);
  assert.strictEqual(v.rows[0].premium, 1.5); assert.strictEqual(v.rows[0].shares, 200);
  assert.strictEqual(v.rows[1].fees, 0, 'fees not shown are blank in the CSV, never a made-up number');
  assert.strictEqual((p.optionFills || []).length, 1); assert.strictEqual(p.optionFills[0].ticker, 'QQQ');
});

test('flagged rows start deselected and stay out of the CSV until ticked; incomplete rows never get invented numbers', () => {
  const rows = [row(), row({ price: null, missing: ['price'], ok: false }), row({ ticker: 'NVDA', strike: 120, uncertain: ['strike'], ok: false })];
  const sel = IV.defaultSel(rows); assert.deepStrictEqual([...sel], [0]);
  assert.strictEqual(IV.rowsToCsv(rows, sel).trim().split('\n').length, 2, 'header + the one clean row');
  sel.add(1); const line = IV.rowsToCsv(rows, sel).trim().split('\n')[2];
  assert.match(line, /^2026-11-03,AAPL 261219P00150000,Sell to Open,2,,0\.04,/, 'missing price stays blank for the user to fill in');
  const html = IV.flagsHtml(rows, IV.defaultSel(rows), s => String(s));
  assert.match(html, /imp-cap-warn/, 'grey warning style');
  assert.match(html, /missing: price/); assert.match(html, /check: strike/);
  assert.strictEqual((html.match(/type="checkbox"/g) || []).length, 3);
  assert.strictEqual((html.match(/checked/g) || []).length, 1);
  assert.ok(!/class="imp-sub"/.test(html), 'the intro line is not styled like an error');
  assert.match(html, /class="imp-vhd"/);
  assert.match(html, /2 rows flagged for checking \(not ticked by default\)/);
  const all = new Set([0, 1, 2]);
  assert.ok(!/aren't ticked|isn't ticked/.test(IV.flagsHtml(rows, all, s => String(s))), 'wording stays true after the user ticks a flagged row');
});

test('duplicate blocking: re-scanning the same screenshot adds nothing (same fingerprint as Stage 1)', () => {
  const rows = [row(), row({ action: 'buy_to_close', price: 0.4, date: '2026-11-05', fees: null, total: null })];
  const v = B.vetRows(B.parseBrokerCSV(IV.rowsToCsv(rows, IV.defaultSel(rows))));
  const first = G.importDedupe(v.rows, []); assert.strictEqual(first.fresh.length, 2);
  const again = G.importDedupe(v.rows, first.fresh); assert.strictEqual(again.fresh.length, 0); assert.strictEqual(again.dupes, 2);
  assert.strictEqual(G.importGate({ rh: true, hasNew: false, capOk: false }), 'nothing-new', 'a pure duplicate never hits the Free cap');
});

test('Free allowance: a screenshot import counts only when new trades are saved', () => {
  assert.strictEqual(G.importUsesAllowance({ vision: true }, 3), true);
  assert.strictEqual(G.importUsesAllowance({ vision: true }, 0), false, 'failed / duplicate / nothing saved');
  assert.strictEqual(G.importUsesAllowance({ rh: true }, 2), true);
  assert.strictEqual(G.importUsesAllowance({}, 5), false, 'generic CSVs still do not use it');
  const prev = APPJS.slice(APPJS.indexOf('function importPreview('), APPJS.indexOf('// ── Import gate / dedupe'));
  assert.match(prev, /_importVision\)p\.vision=true/);
  assert.match(prev, /p\.vision&&importGate\(\{rh:true,hasNew:n>0,capOk:csvImportOk\(\)\}\)==='capped'/);
  const di = APPJS.slice(APPJS.indexOf('async function doImport('), APPJS.indexOf('function _importLand('));
  assert.match(di, /\(p\.rh\|\|p\.vision\)&&!csvImportOk\(\)/);
  assert.match(di, /_importVision=null/);
});

test('allowance kept on failed, cancelled or non-trade scans: the screenshot module never records an import', async () => {
  assert.doesNotMatch(VSRC, /_noteCsvImport|csv-import|_accountCall/);
  const out = { fails: [], text: null };
  const mk = (status, j) => ({ fail: m => out.fails.push(m), preview: () => {}, csvOk: () => true, demo: false, user: () => ({ getIdToken: async () => 'tok' }), esc: s => s, set: () => {}, upgrade: () => {}, text: t => { out.text = t; },
    fetch: async () => ({ ok: status === 200, status, json: async () => j }), prepare: async () => ({ b64: 'AAAA', mediaType: 'image/jpeg', width: 10, height: 10 }) });
  for (const [s, j, re] of [[401, {}, /sign in again/i], [413, {}, /too large/i], [429, { error: 'You have used today\'s 5 screenshot reads.' }, /5 screenshot reads/], [503, { configured: false }, /isn't switched on yet/], [502, {}, /couldn't read/i], [200, { notTrade: true, rows: [] }, /No trades found/]]) {
    out.fails.length = 0; out.text = null;
    await IV.run(file('a.png', 'image/png', [0x89, 0x50]), mk(s, j));
    assert.match(out.fails.join(' '), re, String(s)); assert.strictEqual(out.text, null, 'nothing put in the import box');
  }
  out.fails.length = 0;
  await IV.run(file('a.png', 'image/png', [0x89]), { ...mk(200, { rows: [] }), demo: true }); assert.match(out.fails[0], /Sign in/);
  out.fails.length = 0;
  await IV.run(file('a.png', 'image/png', [0x89]), { ...mk(200, { rows: [] }), csvOk: () => false }); assert.match(out.fails[0], /free plan includes 1 import/i, 'used allowance: no vision call is spent');
});

test('successful scan fills the import box with the selected rows and hands over to importPreview', async () => {
  let state = null, text = null, previews = 0;
  const rows = [row(), row({ price: null, missing: ['price'], ok: false })];
  await IV.run(file('a.png', 'image/png', [0x89]), { fail: m => { throw new Error(m); }, preview: () => { previews++; }, csvOk: () => true, demo: false, user: () => ({ getIdToken: async () => 'tok' }), esc: s => s,
    set: s => { state = s; }, upgrade: () => {}, text: t => { text = t; }, fetch: async (u, o) => { assert.match(u, /\/\.netlify\/functions\/vision-import$/); assert.strictEqual(o.headers.Authorization, 'Bearer tok'); const b = JSON.parse(o.body); assert.ok(!b.images); assert.strictEqual(b.mediaType, 'image/jpeg'); return { ok: true, status: 200, json: async () => ({ rows, notTrade: false }) }; },
    prepare: async () => ({ b64: 'AAAA', mediaType: 'image/jpeg', width: 10, height: 10 }) });
  assert.ok(state && typeof state.html === 'function'); assert.strictEqual(previews, 1);
  assert.strictEqual(text.trim().split('\n').length, 2);
});

test('pixel: isFreshSignup is false for a returning user (old account, new sign-in)', () => {
  const f = new Function('let _freshSignup=false;' + extractFn('isFreshSignup') + ';return isFreshSignup;')();
  const now = Date.now();
  assert.strictEqual(f({ metadata: { creationTime: new Date(now - 30 * 86400e3).toUTCString(), lastSignInTime: new Date(now - 1000).toUTCString() } }), false, 'returning email or Google sign-in');
  assert.strictEqual(f({ metadata: { creationTime: new Date(now - 20e3).toUTCString(), lastSignInTime: new Date(now - 20e3).toUTCString() } }), true, 'brand-new account');
  assert.strictEqual(f({ metadata: { creationTime: new Date(now - 10 * 60e3).toUTCString(), lastSignInTime: new Date(now - 10 * 60e3).toUTCString() } }), false, 'older than 3 minutes');
  assert.strictEqual(f(null), false);
});

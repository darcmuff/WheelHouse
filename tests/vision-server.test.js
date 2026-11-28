// vision-server.test.js — Stage 2 screenshot importer, server side (netlify/functions/vision-import.js + netlify/lib/vision-trades.js).
// Anthropic is always mocked: npm test never calls the live API and never needs a key.
const test = require('node:test'); const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const V = require('../netlify/lib/vision-trades.js');
const F = require('../netlify/functions/vision-import.js');

const NOW = Date.UTC(2026, 10, 28, 15, 0, 0); // 2026-11-28 15:00 UTC
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]).toString('base64');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]).toString('base64');

const trade = o => Object.assign({ ticker: 'AAPL', trade_date: '2026-11-03', action: 'sell_to_open', option_type: 'put', strike: 150, expiry: '2026-12-19', quantity: 2, price: 1.5, fees: 0.04, total: 299.96, uncertain_fields: [] }, o);
const aiOk = (trades, extra) => ({ stop_reason: 'end_turn', usage: { input_tokens: 1234, output_tokens: 210 }, content: [{ type: 'text', text: JSON.stringify(Object.assign({ is_trade_screenshot: true, broker: 'Robinhood', trades, note: null }, extra || {})) }] });

function deps(o = {}) {
  const st = { usage: o.usage === undefined ? null : o.usage, writes: [], ai: [], logs: [] };
  const log = { log: (...a) => st.logs.push(a), warn: (...a) => st.logs.push(a), error: (...a) => st.logs.push(a), info: (...a) => st.logs.push(a) };
  const d = {
    bearerUser: async ev => (ev.headers && ev.headers.authorization === 'Bearer good') ? { uid: 'u1', email: 'x@y.z' } : null,
    getEntitlement: async () => (o.ent === undefined ? null : o.ent),
    getUsage: async () => (st.usage ? { fields: { ...st.usage }, updateTime: 't1' } : null),
    putUsage: async (uid, fields, pre) => { if (o.conflictOnce && !st.conflicted) { st.conflicted = true; const e = new Error('conflict'); e.conflict = true; throw e; } st.writes.push({ uid, fields: { ...fields }, pre }); st.usage = { ...fields }; },
    anthropic: async body => { st.ai.push(body); if (o.aiThrow) { const e = new Error('upstream'); e.status = o.aiThrow; throw e; } return o.ai || aiOk([trade()]); },
    now: () => NOW,
    log,
    env: { ANTHROPIC_API_KEY: o.noKey ? '' : 'test-key-not-real' }
  };
  return { d, st };
}
const ev = (body, auth = 'Bearer good', method = 'POST') => ({ httpMethod: method, headers: auth ? { authorization: auth } : {}, body: typeof body === 'string' ? body : JSON.stringify(body) });
const call = (e, d) => F._handler(e, {}, d);
const J = r => JSON.parse(r.body);

test('model, limits and caps are the agreed values', () => {
  assert.strictEqual(V.MODEL, 'claude-haiku-5-5');
  assert.deepStrictEqual(V.CAPS, { free: 5, pro: 50 });
  assert.strictEqual(V.MAX_B64, 1500000);
  assert.strictEqual(V.MAX_IMAGES, 1);
});

test('auth: missing or invalid Firebase ID token → 401, no quota used, no AI call', async () => {
  for (const auth of [null, 'Bearer bad', 'Basic xyz']) {
    const { d, st } = deps();
    const r = await call(ev({ image: JPEG, mediaType: 'image/jpeg' }, auth), d);
    assert.strictEqual(r.statusCode, 401, String(auth));
    assert.strictEqual(st.ai.length, 0); assert.strictEqual(st.writes.length, 0);
  }
  const { d } = deps(); assert.strictEqual((await call(ev({}, 'Bearer good', 'GET'), d)).statusCode, 405);
});

test('handler verifies the token with the shared fbadmin.bearerUser by default', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'netlify', 'functions', 'vision-import.js'), 'utf8');
  assert.match(src, /require\('\.\.\/lib\/fbadmin'\)/);
  assert.match(src, /fb\.bearerUser/);
  assert.match(src, /require\('\.\.\/lib\/origin'\)\.guard\(_handler\)/);
});

test('payload: over 1.5 MB base64 → 413; more than one image → 400; not an image → 415; none of these use quota', async () => {
  const big = 'A'.repeat(V.MAX_B64 + 4);
  let { d, st } = deps();
  let r = await call(ev({ image: big, mediaType: 'image/jpeg' }), d);
  assert.strictEqual(r.statusCode, 413); assert.match(J(r).error, /too large/i);
  r = await call(ev('x'.repeat(V.MAX_B64 + 50000)), d); assert.strictEqual(r.statusCode, 413, 'raw body cap before JSON.parse');
  r = await call(ev({ images: [JPEG, JPEG], mediaType: 'image/jpeg' }), d); assert.strictEqual(r.statusCode, 400); assert.match(J(r).error, /one screenshot/i);
  r = await call(ev({ image: Buffer.from('%PDF-1.7 hello').toString('base64'), mediaType: 'image/jpeg' }), d); assert.strictEqual(r.statusCode, 415);
  r = await call(ev({ image: '', mediaType: 'image/jpeg' }), d); assert.strictEqual(r.statusCode, 400);
  assert.strictEqual(st.ai.length, 0); assert.strictEqual(st.writes.length, 0);
});

test('no Anthropic key configured → 503 configured:false, nothing counted', async () => {
  const { d, st } = deps({ noKey: true });
  const r = await call(ev({ image: JPEG, mediaType: 'image/jpeg' }), d);
  assert.strictEqual(r.statusCode, 503); assert.strictEqual(J(r).configured, false);
  assert.strictEqual(st.writes.length, 0); assert.strictEqual(st.ai.length, 0);
});

test('daily cap: Free 5/day → 6th call is 429 with a clear message; Pro and trial 50/day', async () => {
  let { d, st } = deps({ ent: null, usage: { day: '2026-11-28', count: 4 } });
  let r = await call(ev({ image: JPEG, mediaType: 'image/jpeg' }), d);
  assert.strictEqual(r.statusCode, 200); assert.strictEqual(J(r).used, 5); assert.strictEqual(J(r).cap, 5);
  r = await call(ev({ image: JPEG, mediaType: 'image/jpeg' }), d);
  assert.strictEqual(r.statusCode, 429); assert.match(J(r).error, /5 screenshot reads/); assert.match(J(r).error, /midnight UTC/);
  assert.strictEqual(st.ai.length, 1, 'blocked call never reaches Anthropic');

  ({ d, st } = deps({ ent: { plan: 'pro' }, usage: { day: '2026-11-28', count: 49 } }));
  r = await call(ev({ image: JPEG, mediaType: 'image/jpeg' }), d); assert.strictEqual(r.statusCode, 200); assert.strictEqual(J(r).cap, 50);
  r = await call(ev({ image: JPEG, mediaType: 'image/jpeg' }), d); assert.strictEqual(r.statusCode, 429); assert.match(J(r).error, /50 screenshot reads/);

  const trial = { trialStartedAt: new Date(NOW - 86400e3).toISOString(), trialEndsAt: new Date(NOW + 5 * 86400e3).toISOString() };
  ({ d, st } = deps({ ent: trial, usage: { day: '2026-11-28', count: 10 } }));
  r = await call(ev({ image: JPEG, mediaType: 'image/jpeg' }), d); assert.strictEqual(r.statusCode, 200); assert.strictEqual(J(r).cap, 50);
});

test('counter resets on a new UTC day and is written with a precondition (retries once on a race)', async () => {
  let { d, st } = deps({ usage: { day: '2026-11-27', count: 5 } });
  let r = await call(ev({ image: JPEG, mediaType: 'image/jpeg' }), d);
  assert.strictEqual(r.statusCode, 200); assert.deepStrictEqual(st.writes[0].fields, { day: '2026-11-28', count: 1 });
  assert.deepStrictEqual(st.writes[0].pre, { updateTime: 't1' });
  ({ d, st } = deps({ usage: null }));
  await call(ev({ image: JPEG, mediaType: 'image/jpeg' }), d); assert.deepStrictEqual(st.writes[0].pre, { exists: false });
  ({ d, st } = deps({ usage: { day: '2026-11-28', count: 1 }, conflictOnce: true }));
  r = await call(ev({ image: JPEG, mediaType: 'image/jpeg' }), d); assert.strictEqual(r.statusCode, 200); assert.strictEqual(st.writes.length, 1);
});

test('entitlement read failure → 503 (spend is never fail-open), nothing counted', async () => {
  const { d, st } = deps(); d.getEntitlement = async () => { throw new Error('down'); };
  const r = await call(ev({ image: JPEG, mediaType: 'image/jpeg' }), d);
  assert.strictEqual(r.statusCode, 503); assert.strictEqual(st.ai.length, 0);
});

test('every vision call counts: AI errors, malformed JSON and non-trade images still use the daily cap', async () => {
  for (const o of [{ aiThrow: 500 }, { ai: { stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text: '{not json' }] } },
    { ai: { stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text: JSON.stringify({ hello: 1 }) }] } },
    { ai: aiOk([], { is_trade_screenshot: false, note: 'a cat' }) }, { ai: { stop_reason: 'refusal', content: [], usage: {} } }]) {
    const { d, st } = deps({ ...o, usage: { day: '2026-11-28', count: 0 } });
    const r = await call(ev({ image: JPEG, mediaType: 'image/jpeg' }), d);
    assert.strictEqual(st.writes.length, 1, JSON.stringify(o).slice(0, 60)); assert.strictEqual(st.writes[0].fields.count, 1);
    if (o.aiThrow) { assert.strictEqual(r.statusCode, 502); assert.match(J(r).error, /couldn't read/i); }
    else if (o.ai.stop_reason === 'refusal' || /not json|hello/.test(o.ai.content[0] && o.ai.content[0].text || '')) { assert.strictEqual(r.statusCode, 502); }
    else { assert.strictEqual(r.statusCode, 200); assert.strictEqual(J(r).notTrade, true); assert.strictEqual(J(r).rows.length, 0); }
  }
});

test('request to Anthropic: claude-haiku-5-5, one base64 image, strict JSON schema output, no tools that write anywhere', async () => {
  const { d, st } = deps();
  await call(ev({ image: PNG, mediaType: 'image/png' }), d);
  const b = st.ai[0];
  assert.strictEqual(b.model, 'claude-haiku-5-5');
  const imgs = b.messages[0].content.filter(c => c.type === 'image');
  assert.strictEqual(imgs.length, 1); assert.strictEqual(imgs[0].source.type, 'base64'); assert.strictEqual(imgs[0].source.media_type, 'image/png');
  assert.strictEqual(b.output_config.format.type, 'json_schema');
  assert.strictEqual(b.output_config.format.schema.additionalProperties, false);
  assert.ok(!b.tools, 'no tools');
  assert.ok(b.max_tokens > 0 && b.max_tokens <= 4096);
});

test('valid multi-trade screenshot: every trade is returned, validated and normalised', async () => {
  const { d } = deps({ ai: aiOk([trade(), trade({ ticker: 'tsla', option_type: 'call', strike: 450, expiry: '2026-11-28', quantity: 1, price: 3.1, fees: null, total: null }), trade({ action: 'buy_to_close', price: 0.4, trade_date: '2026-11-05', total: null, fees: null })]) });
  const r = await call(ev({ image: JPEG, mediaType: 'image/jpeg' }), d);
  const j = J(r); assert.strictEqual(r.statusCode, 200); assert.strictEqual(j.rows.length, 3);
  assert.ok(j.rows.every(x => x.ok), JSON.stringify(j.rows));
  assert.strictEqual(j.rows[1].ticker, 'TSLA'); assert.strictEqual(j.rows[1].type, 'call'); assert.strictEqual(j.rows[1].fees, null, 'fees not shown stay null (never invented)');
  assert.deepStrictEqual(j.usage, { input_tokens: 1234, output_tokens: 210 });
  assert.strictEqual(j.model, 'claude-haiku-5-5');
});

test('validation: missing or impossible values are flagged, never filled in', () => {
  const v = V.normalizeTrades({ is_trade_screenshot: true, broker: null, note: null, trades: [
    trade({ price: null }), trade({ ticker: 'AAPL!!' }), trade({ trade_date: '2026-02-30' }), trade({ strike: 0 }), trade({ option_type: null }),
    trade({ action: null }), trade({ quantity: 1.5 }), trade({ quantity: 0 }), trade({ expiry: null }), trade({ uncertain_fields: ['strike'] }),
    trade({ trade_date: '--11-03' }), trade({ expiry: '2026-10-01' }), trade({ total: 999 }), trade({ fees: -1 }), trade({ price: 'abc' }) ] }, NOW);
  const r = v.rows;
  assert.deepStrictEqual(r[0].missing, ['price']); assert.strictEqual(r[0].price, null); assert.strictEqual(r[0].ok, false);
  assert.ok(r[1].missing.includes('ticker')); assert.ok(r[2].missing.includes('date')); assert.ok(r[3].missing.includes('strike'));
  assert.ok(r[4].missing.includes('put/call')); assert.ok(r[5].missing.includes('action')); assert.ok(r[6].missing.includes('quantity')); assert.ok(r[7].missing.includes('quantity'));
  assert.ok(r[8].missing.includes('expiry'));
  assert.deepStrictEqual(r[9].missing, []); assert.ok(r[9].uncertain.includes('strike')); assert.strictEqual(r[9].ok, false, 'uncertain rows start deselected');
  assert.strictEqual(r[10].date, '2026-11-03'); assert.ok(r[10].uncertain.includes('year'), 'a year not shown is marked as assumed');
  assert.ok(r[11].uncertain.includes('expiry'), 'expiry before trade date is flagged');
  assert.ok(r[12].uncertain.includes('total'), 'total that does not match qty × price × 100 is flagged');
  assert.ok(r[13].missing.includes('fees'));
  assert.ok(r[14].missing.includes('price'));
  assert.strictEqual(v.notTrade, false);
});

test('malformed AI JSON is rejected deterministically', () => {
  for (const bad of [null, 'x', 42, [], { trades: 'no' }, { is_trade_screenshot: true }]) assert.throws(() => V.normalizeTrades(bad, NOW), /malformed/);
  const n = V.normalizeTrades({ is_trade_screenshot: false, broker: null, note: 'photo of a dog', trades: [] }, NOW);
  assert.strictEqual(n.notTrade, true); assert.strictEqual(n.rows.length, 0);
  const n2 = V.normalizeTrades({ is_trade_screenshot: true, broker: 'Webull', note: null, trades: [] }, NOW);
  assert.strictEqual(n2.notTrade, true, 'a broker page with no trades is "no trades found" too');
});

test('privacy: no image or AI text is logged, and the only Firestore write is {day,count}', async () => {
  const marker = 'SECRETTRADEMARKER';
  const { d, st } = deps({ ai: { stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text: '{bad json ' + marker }] } });
  const img = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(marker.repeat(20))]).toString('base64');
  await call(ev({ image: img, mediaType: 'image/jpeg' }), d);
  const { d: d2, st: st2 } = deps({ aiThrow: 500 }); await call(ev({ image: img, mediaType: 'image/jpeg' }), d2);
  const logged = JSON.stringify(st.logs.concat(st2.logs));
  assert.ok(!logged.includes(marker) && !logged.includes(img.slice(0, 40)), 'nothing from the image or the AI reply is logged');
  for (const w of st.writes.concat(st2.writes)) assert.deepStrictEqual(Object.keys(w.fields).sort(), ['count', 'day']);
  const src = fs.readFileSync(path.join(__dirname, '..', 'netlify', 'functions', 'vision-import.js'), 'utf8') + fs.readFileSync(path.join(__dirname, '..', 'netlify', 'lib', 'vision-trades.js'), 'utf8');
  assert.doesNotMatch(src, /firebasestorage|storage\.googleapis|\/o\?name=/i, 'never uploads to Storage');
  assert.doesNotMatch(src, /console\.(log|info|warn|error)\([^)]*(event\.body|image|b64|text|content)/, 'no body or reply in logs');
});

test('usage counter lives in visionUsage/{uid}, written by the service account, closed to browsers by the catch-all rule', () => {
  const fb = fs.readFileSync(path.join(__dirname, '..', 'netlify', 'lib', 'fbadmin.js'), 'utf8');
  assert.match(fb, /visionUsage/);
  assert.match(fb, /currentDocument\.(updateTime|exists)/);
  const rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
  assert.doesNotMatch(rules, /visionUsage/, 'no client rule opens it');
  assert.match(rules, /match \/\{document=\*\*\}[\s\S]*allow read, write: if false/);
});

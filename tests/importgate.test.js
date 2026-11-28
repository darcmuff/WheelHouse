// importgate.test.js — dedupe on re-import, the Free 1-import allowance, and where you land after importing.
// A failed / unreadable / pure-duplicate upload must never use up a Free user's allowance.
const test = require('node:test'), assert = require('node:assert');
const { extractFn, extractConst } = require('./extract');
const ctx = `let _ent={csvImportsUsed:0};let calls=[];const _accountCall=(n)=>{calls.push(n);return Promise.resolve();};
${extractConst('_impFp')}
${extractFn('importDedupe')}\n${extractFn('importGate')}\n${extractFn('importUsesAllowance')}\n${extractFn('importLanding')}\n${extractFn('_noteCsvImport')}
return {importDedupe,importGate,importUsesAllowance,importLanding,_noteCsvImport,get ent(){return _ent;},get calls(){return calls;},reset(){_ent={csvImportsUsed:0};calls=[];}};`;
const G = new Function(ctx)();

const row = (o) => ({ entered: '2025-01-10', ticker: 'AAPL', action: 'CSP', strike: 150, expiry: '2025-01-17', shares: 100, premium: 1.25, ...o });
const ex = (r) => ({ ticker: r.ticker, action: r.action, entered: r.entered, strike: r.strike, shares: r.shares });

test('re-importing the same rows is a pure duplicate', () => {
  const rows = [row({}), row({ ticker: 'TSLA', action: 'STOC', strike: 450 })];
  const d = G.importDedupe(rows, rows.map(ex));
  assert.equal(d.fresh.length, 0); assert.equal(d.dupes, 2);
});
test('first import keeps two identical-looking fills (two lots, same day)', () => {
  const a = row({}), b = row({ premium: 1.30 });
  const d = G.importDedupe([a, b], []);
  assert.equal(d.fresh.length, 2); assert.equal(d.dupes, 0);
});
test('re-import of a file with two identical fills skips both, not just one', () => {
  const a = row({}), b = row({ premium: 1.30 });
  const d = G.importDedupe([a, b], [ex(a), ex(b)]);
  assert.equal(d.fresh.length, 0); assert.equal(d.dupes, 2);
});
test('a file with a third identical fill adds only the new one', () => {
  const a = row({});
  const d = G.importDedupe([a, a, a], [ex(a), ex(a)]);
  assert.equal(d.fresh.length, 1); assert.equal(d.dupes, 2);
});
test('different date / strike / action / shares are not duplicates', () => {
  const base = row({});
  const have = [ex(base)];
  for (const o of [{ entered: '2025-01-11' }, { strike: 155 }, { action: 'BTC' }, { shares: 200 }, { ticker: 'MSFT' }]) {
    assert.equal(G.importDedupe([row(o)], have).fresh.length, 1, JSON.stringify(o));
  }
});
test('dedupe tolerates missing strike/shares and numeric strings', () => {
  const r = row({ strike: undefined, shares: undefined });
  assert.equal(G.importDedupe([r], [ex(r)]).fresh.length, 0);
  assert.equal(G.importDedupe([row({ strike: '150' })], [ex(row({}))]).fresh.length, 0);
});

test('gate: nothing new is "nothing-new" even when the Free allowance is used up', () => {
  assert.equal(G.importGate({ rh: true, hasNew: false, capOk: false }), 'nothing-new');
  assert.equal(G.importGate({ rh: true, hasNew: false, capOk: true }), 'nothing-new');
  assert.equal(G.importGate({ rh: false, hasNew: false, capOk: false }), 'nothing-new');
});
test('gate: Free cap only blocks a Robinhood file that has something new', () => {
  assert.equal(G.importGate({ rh: true, hasNew: true, capOk: false }), 'capped');
  assert.equal(G.importGate({ rh: true, hasNew: true, capOk: true }), 'ok');
  assert.equal(G.importGate({ rh: false, hasNew: true, capOk: false }), 'ok');
});
test('allowance is used only by a Robinhood import that actually saved something', () => {
  assert.equal(G.importUsesAllowance({ rh: [] }, 3), true);
  assert.equal(G.importUsesAllowance({ rh: [] }, 0), false);
  assert.equal(G.importUsesAllowance({ rh: [] }), false);
  assert.equal(G.importUsesAllowance({}, 5), false);
  assert.equal(G.importUsesAllowance(null, 5), false);
});
test('_noteCsvImport: counts once for a saved Robinhood import, never for 0 saved or other brokers', () => {
  G.reset(); G._noteCsvImport({ rh: [] }, 0); assert.equal(G.ent.csvImportsUsed, 0); assert.deepEqual(G.calls, []);
  G._noteCsvImport({ broker: 'Tastytrade', rows: [1] }, 4); assert.equal(G.ent.csvImportsUsed, 0); assert.deepEqual(G.calls, []);
  G._noteCsvImport({ rh: [] }, 4); assert.equal(G.ent.csvImportsUsed, 1); assert.deepEqual(G.calls, ['csv-import']);
});

test('landing: wheel rows → Wheels; only LEAPs → LEAPs; nothing → stay', () => {
  assert.equal(G.importLanding({ wheelRows: 3, legs: 2 }), 'positions');
  assert.equal(G.importLanding({ wheelRows: 1, legs: 0 }), 'positions');
  assert.equal(G.importLanding({ wheelRows: 0, legs: 2 }), 'options');
  assert.equal(G.importLanding({ wheelRows: 0, legs: 0 }), '');
});

test('Cancel, Back or closing the Review modal never consumes the Free allowance', () => {
  const fs = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
  const doStart = src.indexOf('async function doImport()');
  const doEnd = src.indexOf('\nfunction _importLand', doStart);
  assert.ok(doStart >= 0 && doEnd > doStart, 'doImport block');
  const def = src.indexOf('function _noteCsvImport');
  const callRe = /(?<!function )_noteCsvImport\(/g;
  const allCalls = [...src.matchAll(callRe)].map(m => m.index);
  assert.ok(allCalls.length >= 1, 'expected _noteCsvImport calls');
  allCalls.forEach(i => assert.ok(i > doStart && i < doEnd, 'allowance counted outside doImport at '+i));
  assert.ok(def < doStart || def > doEnd, 'definition should sit outside doImport');
  const close = src.slice(src.indexOf('function closeModal('), src.indexOf('function closeModal(')+400);
  const popAt = src.indexOf("window.addEventListener('popstate'");
  const pop = src.slice(popAt, popAt+280);
  assert.match(close, /id==='mImport'&&_impHist/);
  assert.match(pop, /_impHist&&m&&m\.classList\.contains\('open'\)/);
  assert.doesNotMatch(close, /_noteCsvImport|csv-import|csvImportsUsed/);
  assert.doesNotMatch(pop, /_noteCsvImport|csv-import|csvImportsUsed/);
  assert.match(html, /<button class="btn btn-ghost" onclick="closeModal\('mImport'\)">Cancel<\/button>/);
  assert.equal((html.match(/_noteCsvImport|csv-import/g) || []).length, 0);
});

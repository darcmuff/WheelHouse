// importsave.test.js — an import is written to Firestore in committed batches (not fire-and-forget), so a big file
// can't be lost by closing the tab, and a failure is reported instead of vanishing into the console.
const test = require('node:test'), assert = require('node:assert');
const { extractFn } = require('./extract');
function make({ demo = false, failTimes = 0, hang = false } = {}) {
  const log = { batches: [], commits: 0, demoSaves: 0, tries: 0 };
  const code = `
    const APP_DEMO=${demo};const OT_DEMO={save(){log.demoSaves++;}};const _fsDb={};
    const _fsDoc=(...a)=>a.join('/');const _currentUid=()=>'u1';const _stripUndefined=o=>o;
    const writeBatch=()=>{const ops=[];const b={set(ref,d){ops.push(ref);},async commit(){log.tries++;if(log.tries<=${failTimes})throw new Error('boom');${hang ? 'await new Promise(()=>{});' : ''}log.commits++;log.batches.push(ops.length);}};return b;};
    const db={};
    async ${extractFn("_saveImportBatch")}
    return _saveImportBatch;`;
  return { fn: new Function('log', code)(log), log };
}
const wheels = n => Array.from({ length: n }, (_, i) => ({ id: 'w' + i }));
const trades = n => Array.from({ length: n }, (_, i) => ({ id: 't' + i }));

test('950 trades + 3 wheels are committed in chunks of at most 450, all of them', async () => {
  const { fn, log } = make();
  const r = await fn(wheels(3), trades(950));
  assert.equal(r.ok, true);
  assert.ok(log.batches.every(n => n <= 450), JSON.stringify(log.batches));
  assert.equal(log.batches.reduce((a, b) => a + b, 0), 953);
});
test('a failing chunk is retried once and then succeeds', async () => {
  const { fn, log } = make({ failTimes: 1 });
  const r = await fn(wheels(1), trades(10));
  assert.equal(r.ok, true); assert.equal(log.commits, 1);
});
test('a chunk that keeps failing is reported, not swallowed', async () => {
  const { fn } = make({ failTimes: 99 });
  const r = await fn(wheels(1), trades(10));
  assert.equal(r.ok, false); assert.match(r.error, /boom/);
});
test('demo mode saves locally once and never touches Firestore', async () => {
  const { fn, log } = make({ demo: true });
  const r = await fn(wheels(2), trades(100));
  assert.equal(r.ok, true); assert.equal(log.demoSaves, 1); assert.equal(log.commits, 0);
});
test('an unacknowledged commit (offline) resolves as pending after the timeout instead of hanging the UI', async () => {
  const { fn } = make({ hang: true });
  const r = await fn(wheels(1), trades(5), { timeoutMs: 30 });
  assert.equal(r.ok, true); assert.equal(r.pending, true);
});
test('nothing to save is a no-op', async () => {
  const { fn, log } = make();
  const r = await fn([], []);
  assert.equal(r.ok, true); assert.equal(log.commits, 0);
});

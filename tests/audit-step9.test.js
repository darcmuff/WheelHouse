const{appSrc}=require('./appsrc');
// audit-step9.test.js — cleanup, listener fix and dead code (audit Step 9).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { extractFn } = require('./extract');
const SRC = appSrc();

// listenServer run against a fake onSnapshot that records subscribe/unsubscribe
function harness() {
  const subs = [];
  const onSnapshot = (q, opts, next, err) => { const s = { q, next, err, live: true }; subs.push(s); return () => { s.live = false; }; };
  const f = new Function('onSnapshot', 'setTimeout', 'clearTimeout',
    'let _fsUnsubs=[];' + extractFn('listenServer') + extractFn('fsUnsubAll') + '\nreturn {listenServer,fsUnsubAll,pending:()=>_fsUnsubs.length};');
  return { subs, ...f(onSnapshot, setTimeout, clearTimeout) };
}
const snap = fromCache => ({ metadata: { fromCache }, docs: [] });

test('listenServer: ignores a cache snapshot, resolves on the server one, then stops listening', async () => {
  const H = harness();
  const p = H.listenServer('q');
  assert.strictEqual(H.subs.length, 1);
  assert.strictEqual(H.pending(), 1, 'a listener still waiting can be stopped by releaseFirestore');
  H.subs[0].next(snap(true));
  assert.ok(H.subs[0].live, 'cache-only snapshot does not settle');
  const s = snap(false);
  H.subs[0].next(s);
  assert.strictEqual(await p, s);
  assert.strictEqual(H.subs[0].live, false, 'no permanent background listener');
  assert.strictEqual(H.pending(), 0);
  H.subs[0].next(snap(false)); // a late snapshot is harmless
});

test('listenServer: an error or a timeout also unsubscribes', async () => {
  const H = harness();
  const p = H.listenServer('q');
  H.subs[0].err(new Error('denied'));
  await assert.rejects(p, /denied/);
  assert.strictEqual(H.subs[0].live, false);
  assert.strictEqual(H.pending(), 0);
  const p2 = H.listenServer('q2', 5);
  await assert.rejects(p2, /Timed out/);
  assert.strictEqual(H.subs[1].live, false);
  assert.strictEqual(H.pending(), 0);
});

test('orphaned functions and the Update Price modal are gone', () => {
  for (const n of ['renderDashChart', 'renderMonthlyRealised', 'autoMarkExpiredTrades', 'openUpdatePrice', 'savePrice',
    'linkWheelRoll', 'calcAssignmentIntel', 'reportDeltaSectionHtml', 'reportDeltaSectionLines']) {
    assert.ok(!new RegExp(`\\b${n}\\b`).test(SRC), n);
  }
  assert.ok(!/id="mPrice"|mPriceTitle|pf-price|pf-wheelId/.test(SRC));
  assert.ok(!/#sidebar/.test(SRC));
});

test('dead render work is gone from the hot paths', () => {
  const rw = extractFn('renderRotationWindow'), so = extractFn('renderStatsOverview'), an = extractFn('renderAnalytics'), ytd = extractFn('calcYTD');
  for (const v of ['metricsBar', '_fRet', 'openPosHtml', 'calcAROC(']) assert.ok(!rw.includes(v), 'renderRotationWindow ' + v);
  for (const v of ['liveOpts', 'recRows', 'calCells', 'ytdSummary', 'calcYTD(', 'calcCapitalStats(']) assert.ok(!so.includes(v), 'renderStatsOverview ' + v);
  for (const v of ['eqSvg', 'rollCount', 'calcCapitalStats(']) assert.ok(!an.includes(v), 'renderAnalytics ' + v);
  assert.ok(!/sc\+=v|sd\+=v/.test(ytd), 'calcYTD dead sc/sd loop');
});

test('OpTrack branding: CSV filenames, option-chain User-Agent, old share image removed', () => {
  assert.ok(extractFn('exportCSV').includes('download:`optrack${suffix}-'));
  assert.ok(extractFn('exportOptsCSV').includes('a.download=`optrack-options-'));
  assert.ok(!/wheelhouse[-$]/.test(extractFn('exportCSV') + extractFn('exportOptsCSV')));
  const oc = fs.readFileSync(path.join(__dirname, '..', 'netlify', 'functions', 'optchain.js'), 'utf8');
  assert.ok(oc.includes("'User-Agent': 'Mozilla/5.0 OpTrack'") && !/WheelHouse/.test(oc));
  assert.ok(!fs.existsSync(path.join(__dirname, '..', 'wheelhouse-share.png')));
});

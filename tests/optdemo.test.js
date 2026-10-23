// optdemo.test.js — Options demo mode: sample legs are sensible and NOTHING is ever written to Firestore.
// Run: node tests/optdemo.test.js
const { extractFn, extractConst } = require('./extract');
let pass = 0, fail = 0;
const check = (n, ok, x) => { ok ? pass++ : fail++; console.log((ok ? '  ✓ ' : '  ✗ ') + n + (ok || x === undefined ? '' : '  → ' + JSON.stringify(x))); };
const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'app', 'index.html'), 'utf8');
const grab = (re) => { const m = src.match(re); if (!m) throw new Error('not found ' + re); return m[0]; };
const stubs = `
let writes=[],deletes=[];
const _fsSetDoc=(...a)=>{writes.push(a);return Promise.resolve();};const _fsDeleteDoc=(...a)=>{deletes.push(a);return Promise.resolve();};
const _fsDoc=(...a)=>a.join('/');const _fsDb='db';const _currentUid=()=>'u1';const _stripUndefined=o=>o;const toastOptErr=()=>{};
const _saveWheel=()=>{writes.push('WHEEL');};const _saveTrade=()=>{writes.push('TRADE');};
const localStorage={getItem:()=>null,setItem(){}};const location={search:'?demo=options'};
let db={wheels:[{id:'w1',ticker:'SOFI',status:'open',lastPrice:20}],trades:[{id:'t1',ticker:'SOFI'}],opts:[{id:'real1',underlying:'MSFT',type:'C',side:'long',strike:500,expiry:'2027-01-15',qty:1,entryPrice:30,status:'open'}]};
let quotes={};let view='options';let _optMarkStatus='';let renders=0;const render=()=>{renders++;};
const fetch=async()=>({ok:true,json:async()=>({contracts:{}})});
`;
const code = stubs + extractFn('optionsLib') + '\nconst OPTS=optionsLib();\n' +
  grab(/let optDemo=[^\n]*\n/) + grab(/let _realOpts=null;[^\n]*\n/) + grab(/const DEMO_SPOTS=[^\n]*\n/) +
  ['optDemoLegs', 'setOptDemo', '_demoNotSaved', '_saveOpt', '_deleteOptDoc', 'saveDB'].map(extractFn).join('\n') + '\nasync ' + extractFn('fetchOptionMarks') +
  '\nlet _optMarksAt=0;\nreturn {get db(){return db},get writes(){return writes},get deletes(){return deletes},get optDemo(){return optDemo},get real(){return _realOpts},optDemoLegs,setOptDemo,_saveOpt,_deleteOptDoc,saveDB,fetchOptionMarks,OPTS};';
const S = new Function(code)();

check('URL ?demo=options turns demo on at boot', S.optDemo === true);
S.setOptDemo(true);
const legs = S.db.opts, today = new Date().toISOString().slice(0, 10);
check('real legs parked, demo legs shown instead', S.real.length === 1 && S.real[0].id === 'real1' && legs.every(l => l.demo));
const longs = legs.filter(l => l.side === 'long'), shorts = legs.filter(l => l.side === 'short');
check('five demo LEAPs, all open long calls', longs.length === 5 && longs.every(l => l.type === 'C' && l.status === 'open'));
check('demo PMCC short calls: all calls, each linked to a demo LEAP', shorts.length === 5 && shorts.every(l => l.type === 'C' && longs.some(x => x.id === l.parentLeapId && x.underlying === l.underlying)));
check('demo legs raise no red data-health issues', !S.OPTS.health(legs, [], today, []).some(i => i.sev === 'red'), S.OPTS.health(legs, [], today, []).filter(i => i.sev === 'red'));
check('SPCX LEAP has open + past (rolled, expired) short calls', shorts.filter(l => l.parentLeapId === 'demo-5' && l.status === 'open').length === 1 && shorts.some(l => l.status === 'expired' && l.rolledFrom));
check('TSLA ×2, NVDA, AAPL, SPCX', longs.filter(l => l.underlying === 'TSLA').length === 2 && legs.some(l => l.underlying === 'NVDA') && legs.some(l => l.underlying === 'AAPL'));
const dtes = longs.map(l => S.OPTS.dte(l.expiry, today));
check('three ≥ 270 DTE LEAPs, AAPL inside the 270-day review window', longs.filter((l, i) => dtes[i] >= 270).length === 4 && S.OPTS.dte(legs.find(l => l.underlying === 'AAPL').expiry, today) < 270, dtes);
const pl = longs.map(l => S.OPTS.legPnL(l).unrealized);
check('mix of winners and losers', pl.some(x => x > 0) && pl.some(x => x < 0), pl);
check('entry dates in the past, before expiry', legs.every(l => l.entryDate < today && l.entryDate < l.expiry));
check('never attached to a rotation', legs.every(l => !l.wheelId) && !S.optDemoLegs(today, S.db.wheels).some(l => l.wheelId));
check('greeks computable at demo spots (delta-as-shares)', longs.every(l => { const g = S.OPTS.legGreeks(l, { TSLA: 380, NVDA: 185, AAPL: 245, SPCX: 205 }[l.underlying], today); return g && g.delta > 0; }));
check('AAPL has an optional review date', !!legs.find(l => l.underlying === 'AAPL').reviewDate);

// ── nothing persists ──
legs.forEach(l => S._saveOpt(l)); S._saveOpt({ id: 'new-in-demo', underlying: 'X' });
S._deleteOptDoc(legs[0].id); S._deleteOptDoc('real1');
S.saveDB(); // broad save: writes wheels/trades as always, but must skip demo option legs
const wheelWritesFromSaveDB = S.writes.filter(w => !Array.isArray(w)).length;
const closedLeg = S.OPTS.closeLeg(legs[0], 0.5, today, 0.65); S._saveOpt(closedLeg);
const [a, b] = S.OPTS.rollLeg(legs[1], { price: 1, date: today, fees: 0 }, { strike: 400, expiry: legs[1].expiry, price: 5 }, 'r'); S._saveOpt(a); S._saveOpt(b);
(async () => {
  await S.fetchOptionMarks(true);
  const optWrites = S.writes.filter(w => Array.isArray(w));
  check('demo: no option writes (save, close, roll, saveDB, marks)', optWrites.length === 0, optWrites.length);
  check('demo: no deletes', S.deletes.length === 0);
  check('demo: options paths never write wheel data (only saveDB\'s normal wheel save)', S.writes.filter(w => !Array.isArray(w)).length === wheelWritesFromSaveDB && wheelWritesFromSaveDB === 2);
  S.setOptDemo(false);
  check('demo off: real legs restored', S.db.opts.length === 1 && S.db.opts[0].id === 'real1' && S.real === null);
  S._saveOpt(S.db.opts[0]);
  check('demo off: real saves work again', S.writes.filter(w => Array.isArray(w)).length === 1);
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();

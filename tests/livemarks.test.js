// livemarks.test.js — live prices stay in memory; manual marks persist; expired LEAPs read as Expired.
const { extractFn } = require('./extract');
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok) => { ok ? pass++ : fail++; console.log((ok ? '  ✓ ' : '  ✗ ') + n); };

// 1. Automatic option-mark refresh never calls _saveOpt
const fom = extractFn('fetchOptionMarks');
check('fetchOptionMarks does not call _saveOpt', !/_saveOpt\(/.test(fom));
// run it with a fake fetch and a spy
const saves = [];
const run = new Function('db', 'fetch', 'quotes', 'OPTS', '_saveOpt', 'AbortSignal',
  `let _optMarkStatus='',view='x';const render=()=>{};async ` + fom + `\nreturn fetchOptionMarks(true);`);
const leg = { id: 'a', status: 'open', underlying: 'SPCX', expiry: '2027-12-17', strike: 150, type: 'C', side: 'long', markSrc: 'cboe', mark: 1 };
run({ opts: [leg] }, async () => ({ ok: true, json: async () => ({ spot: 100, contracts: { K: { bid: 2, ask: 3 } } }) }), {},
  { occ: () => 'K' }, l => saves.push(l), { timeout: () => null }).then(() => {
  check('refresh updates mark in memory', leg.mark === 2.5);
  check('refresh made zero Firestore saves', saves.length === 0);

  // 2. _persistableLeg strips live fields, keeps manual
  const P = new Function(extractFn('_persistableLeg') + '\nreturn _persistableLeg;')();
  const live = P({ id: 'a', mark: 2.5, markSrc: 'cboe', delta: 0.5, theta: -1, iv: 0.4, strike: 150 });
  check('live mark not persisted', live.mark === null && live.markSrc === null && live.delta === null && live.strike === 150);
  const man = P({ id: 'b', mark: 3, markSrc: 'manual' });
  check('manual mark still persisted', man.mark === 3 && man.markSrc === 'manual');
  check('_saveOpt writes through _persistableLeg', /_persistableLeg\(leg\)/.test(extractFn('_saveOpt')));
  check('quote polls do not save wheels', !/lastPrice=quotes\[[^\]]+\]\.price;_saveWheel/.test(SRC) && !/lastPrice = quotes\[w\.ticker\]\.price;\s*_saveWheel/.test(SRC));

  // 3. Expired LEAP
  const OPTS = new Function(extractFn('optionsLib') + '\nreturn optionsLib();')();
  const leapStats = new Function('OPTS', extractFn('leapStats') + '\nreturn leapStats;')(OPTS);
  const S = leapStats({ status: 'open', qty: 5, strike: 150, expiry: '2026-09-30', entryDate: '2025-01-01', entryPrice: 20, mark: 4, side: 'long', type: 'C' }, 160, '2026-10-29');
  check('expired LEAP flagged expired', S.expired === true);
  check('expired LEAP value is unknown (—)', S.value === null && S.pl === null);
  const card = extractFn('renderLeapCard');
  check('header shows Expired instead of negative days', /S\.expired\?' · Expired'/.test(card));
  const h = OPTS.health([{ id: 'x', underlying: 'SPCX', type: 'C', side: 'long', strike: 150, expiry: '2026-09-30', qty: 5, entryPrice: 20, status: 'open' }], [], '2026-10-29');
  check('Needs you: "SPCX LEAP expired — close it"', h.some(i => i.text === 'SPCX LEAP expired — close it'));
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
});

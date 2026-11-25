// Audit step 4: adjusted LEAP breakeven, stale-mark honesty, exact-cent fee split
const test = require('node:test');
const assert = require('node:assert/strict');
const { extractFn, extractConst } = require('./extract');

const stubs = `const localStorage={getItem:()=>null,setItem(){}};const esc=s=>String(s??'');const fmt2=n=>Number(n).toFixed(2);
const fmtMoney=n=>(n<0?'-':'')+'$'+Math.abs(n).toFixed(2);const fmtPrem=n=>(+n).toFixed(2);const fmtDateFull=d=>d||'-';
let quotes={SPCX:{price:200}};let view='options';let collapsedLeaps=new Set();let hiddenLeaps=new Set();
let db={wheels:[],trades:[],opts:[]};const _sel=new Map();function selCash(){return 0;}function openOptEdit(){}function openOptClose(){}function openLeapEdit(){}function openPmccSell(){}
function toggleLeapExpand(){}function toggleHideLeap(){}function wlWhatIf(){}function wlWhatIfClose(){}function wlWhatIfCalc(){}
function wlWhatIfLog(){}function isPhoneLayout(){return false;}function openDeltaBadge(){return'';}
function leapLogoHtml(){return'';}function leapEarnHtml(){return'';}function isChainTip(){return false;}
function buildRollChain(){return null;}function queueEarnings(){}function queueDividend(){}function liveBadgeHtml(){return'';}
function shortRowWarnTags(){return'';}function tradeRowPhoneCard(){return'';}function pricePendingHtml(){return'';}`;

const pmccBundle = new Function(
  stubs + extractFn('optionsLib') + '\nconst OPTS=optionsLib();\n' +
    ['pmccShortsFor', 'pmccStats', 'pmccTradeEvents'].map(extractFn).join('\n') +
    '\nreturn {pmccStats,pmccShortsFor,OPTS};'
)();

const today = '2026-10-21';
const leap = {
  id: 'L1', groupId: 'L1', underlying: 'SPCX', type: 'C', side: 'long', strike: 150,
  expiry: '2028-06-16', qty: 2, entryPrice: 72, fees: 1.30, entryDate: '2026-06-01', status: 'open', mark: 80
};
const sh = (o) => ({
  groupId: o.id, parentLeapId: 'L1', underlying: 'SPCX', type: 'C', side: 'short', qty: 2,
  fees: 1.30, closeFees: 0, status: 'open', ...o
});
const closedShort = sh({
  id: 'a', strike: 240, expiry: '2026-08-21', entryPrice: 5.10, entryDate: '2026-07-10',
  status: 'closed', closePrice: 1.15, closeDate: '2026-08-12', closeFees: 1.30
});
const openShort = sh({
  id: 'c', strike: 245, expiry: '2026-11-20', entryPrice: 6.40, entryDate: '2026-10-09', mark: 3.05
});

test('pmccStats adjBe includes LEAP fees and realised short-call profit; ignores open shorts', () => {
  const legsNoShorts = [leap];
  const P0 = pmccBundle.pmccStats(leap, legsNoShorts, today);
  assert.strictEqual(P0.net, 0);
  const expectBe0 = Math.round((150 + P0.adjPerSh) * 100) / 100;
  assert.strictEqual(P0.adjBe, expectBe0);
  assert.ok(Math.abs(P0.adjBe - 222.01) < 0.01);

  const legs = [leap, closedShort, openShort];
  const P = pmccBundle.pmccStats(leap, legs, today);
  // Same realised net as pmcc.test.js closed legs only (787.40)
  assert.ok(Math.abs(P.net - 787.4) < 0.01, `net ${P.net}`);
  const beWithClosed = 150 + (14401.3 - 787.4) / 200;
  assert.ok(Math.abs(P.adjBe - Math.round(beWithClosed * 100) / 100) < 0.01, `adjBe ${P.adjBe}`);

  const legsOpenOnly = [leap, openShort];
  const Po = pmccBundle.pmccStats(leap, legsOpenOnly, today);
  assert.strictEqual(Po.net, 0);
  assert.ok(Math.abs(Po.adjBe - P0.adjBe) < 0.0001);
});

const cardFn = new Function(
  stubs + extractFn('optionsLib') + '\nconst OPTS=optionsLib();\n' +
    [
      'splitLeapLegs', 'leapStats', '_fdShort', 'cpDate', 'renderLeapCard', 'leapMiniRealisedHtml',
      'leapSpotHtml', 'isRegularSession', 'colorN', 'leapPayback', 'leapPaybackTip', 'leapBarHtml',
      'leapAdjMoveHtml', 'leapOptHtml', 'leapHeaderRightHtml', 'pmccShortsFor', 'pmccStats',
      'pmccTradeEvents', 'renderPmcc', 'listCut', 'listMoreBtn', 'pmccShortEvents', 'pmccClosedCaptured',
      'renderPmccListRow', 'pmccLegToTrade', 'toStrike', 'tradeTableHead', 'ii', 'markDay', 'isSameMarkDay',
      'leapUnrealPct', 'capturedCellHtml', 'ppdCellHtml', 'pmccShortProfit', 'pmccChainPriorNet'
    ].map(extractFn).join('\n') +
    '\nconst listShowAll=new Set();\nreturn {renderLeapCard,OPTS,setOpts:o=>{db.opts=o;}};'
)();

test('renderLeapCard shows adjBe in Breakeven tile and orig when short calls moved it', () => {
  const legs = [leap, closedShort];
  cardFn.setOpts(legs);
  const html = cardFn.renderLeapCard(leap, 200, today);
  const P = pmccBundle.pmccStats(leap, legs, today);
  const S = { be: 150 + 72 };
  assert.match(html, new RegExp(`\\$${P.adjBe.toFixed(2).replace('.', '\\.')}`));
  assert.match(html, /lc-be-orig/);
  assert.match(html, new RegExp(`orig \\$${S.be.toFixed(2).replace('.', '\\.')}`));
  assert.match(html, /Breakeven[\s\S]*data-tip="[^"]*original breakeven/);
});

test('renderLeapCard: saved date under Value now; no header option today-move when markWhy is none', () => {
  const stale = {
    ...leap, id: 'L2', mark: 75, markWhy: 'none', markSrc: 'cboe', markAt: '2026-10-15T12:00:00.000Z'
  };
  cardFn.setOpts([stale]);
  const html = cardFn.renderLeapCard(stale, 200, today);
  assert.match(html, /lc-saved/);
  assert.match(html, /saved 15 Oct/);
  assert.doesNotMatch(html, /lc-opt[\s\S]*today/);
});

const rollFns = new Function(
  "let n=0;const uid=()=>'new'+(++n);const fmt2=n=>(+n).toFixed(2);" +
    ['CREDITS'].map(extractConst).join('\n') +
    ['isCredit', 'computeTotal', 'splitFeesCents', 'parseRollTrades'].map(extractFn).join('\n') +
    '\nreturn {splitFeesCents,parseRollTrades,computeTotal,isCredit};'
)();

test('splitFeesCents exact cent splits', () => {
  assert.deepStrictEqual(rollFns.splitFeesCents(0.05, 2), [0.03, 0.02]);
  assert.deepStrictEqual(rollFns.splitFeesCents(1, 3), [0.34, 0.33, 0.33]);
  assert.strictEqual(
    rollFns.splitFeesCents(0.05, 2).reduce((a, b) => a + b, 0).toFixed(2),
    '0.05'
  );
  assert.strictEqual(
    rollFns.splitFeesCents(1, 3).reduce((a, b) => a + b, 0).toFixed(2),
    '1.00'
  );
});

const ROLL_5C = `TEST Roll
Est regulatory fees
$0.02
Contract fee
$0.03
Buy TEST $10 Call Jan 2
Position effect
Close
Filled quantity
1 contracts at $0.50
Filled
Jan 1, 3:45 PM GMT+1
Sell TEST $11 Call Jan 9
Position effect
Open
Filled quantity
1 contracts at $0.62
Filled
Jan 1, 3:45 PM GMT+1`;

test('parseRollTrades $0.05 total fees → leg fees [0.03, 0.02] and totals reconcile', () => {
  const t = rollFns.parseRollTrades(ROLL_5C, '2026-01-15');
  assert.strictEqual(t.length, 2);
  assert.deepStrictEqual(t.map((x) => x.fees), [0.03, 0.02]);
  t.forEach((leg) => {
    const computed = rollFns.computeTotal(leg.action, leg.premium, leg.shares, leg.fees);
    assert.strictEqual(leg.total, computed);
  });
  const feeSum = t.reduce((s, x) => s + x.fees, 0);
  assert.strictEqual(Math.round(feeSum * 100) / 100, 0.05);
});
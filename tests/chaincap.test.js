const{appSrc}=require('./appsrc');
// chaincap.test.js — Chain Captured % for active rolled chains
const test=require('node:test');
const assert=require('node:assert');
const{extractFn}=require('./extract');
const SRC=appSrc();
const F=new Function(
  extractFn('chainCapturedNow')+extractFn('chainCapturedCard')+extractFn('chainCapturedPopover')+
  ';return{chainCapturedNow,chainCapturedCard,chainCapturedPopover};'
)();
const money=n=>(n<0?'-':'+')+'$'+Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');

test('a $1,000 loss rolled into a $1,200 credit is  -100% / 0% / 50% / 100% at $400, $200, $100 and $0 buy-backs',()=>{
  const credit=200, n=3;
  const cases=[[400,-200,-100],[200,0,0],[100,100,50],[0,200,100]];
  cases.forEach(([buy,now,pct])=>{
    const got=F.chainCapturedNow(credit,buy,n);
    assert.deepStrictEqual(got,{now,credit,pct,buyBack:buy}, 'buy-back $'+buy);
  });
  const card=F.chainCapturedCard(F.chainCapturedNow(200,100,3));
  assert.strictEqual(card.text,'50% of $200 chain');
  assert.strictEqual(card.tone,'g');
  assert.strictEqual(F.chainCapturedCard(F.chainCapturedNow(200,400,3)).tone,'r');
  assert.strictEqual(F.chainCapturedCard(F.chainCapturedNow(200,200,3)).tone,'m');
  assert.strictEqual(F.chainCapturedPopover(F.chainCapturedNow(200,100,3),money),'Now: +$100.00 · 50% captured');
  assert.strictEqual(F.chainCapturedPopover(F.chainCapturedNow(200,400,3),money),'Now: -$200.00 · -100% captured');
});

test('a net-debit roll hides the % with no NaN and no sign-flip',()=>{
  const got=F.chainCapturedNow(-200,200,3);
  assert.ok(got);
  assert.strictEqual(got.now,-400);
  assert.strictEqual(got.pct,null);
  assert.ok(!Number.isNaN(got.now));
  assert.strictEqual(F.chainCapturedCard(got),null);
  assert.strictEqual(F.chainCapturedPopover(got,money),'Now: -$400.00');
  assert.ok(!String(F.chainCapturedPopover(got,money)).includes('%'));
  const zero=F.chainCapturedNow(0,50,3);
  assert.strictEqual(zero.pct,null);
  assert.strictEqual(zero.now,-50);
  assert.strictEqual(F.chainCapturedCard(zero),null);
  assert.strictEqual(F.chainCapturedPopover(zero,money),'Now: -$50.00');
});

test('a single unrolled leg does not render the chain sub-line on the wheel card',()=>{
  assert.strictEqual(F.chainCapturedNow(200,100,1),null);
  assert.strictEqual(F.chainCapturedNow(200,100,0),null);
  assert.strictEqual(F.chainCapturedCard(null),null);
  assert.match(SRC,/chainCapturedNow\(/);
  assert.match(SRC,/buildRollChain\(m\.trades,_curOpt\.id\)/);
  assert.match(SRC,/wl-chain-cap/);
  assert.match(SRC,/_capNow\.pct!=null/);
  assert.doesNotMatch(extractFn('chainCapturedCard')||'',/unrolled/);
});

test('an unpriced open option hides the chain sub-line cleanly',()=>{
  assert.strictEqual(F.chainCapturedNow(200,null,3),null);
  assert.strictEqual(F.chainCapturedNow(200,undefined,3),null);
  assert.strictEqual(F.chainCapturedNow(200,'',3),null);
  assert.strictEqual(F.chainCapturedPopover(null,money),'');
  // The em-dash Net P&L branch stays a bare — with no chain sub-line
  assert.match(SRC,/<span>Net P&amp;L \(now\)<\/span><b class="m">—<\/b><\/div>/);
  assert.doesNotMatch(SRC,/<span>Net P&amp;L \(now\)<\/span><b class="m">—<\/b>\$\{_capLine\}/);
});

test('the popover Now line sits under the subtitle and uses the same chain net as buildRollChain',()=>{
  assert.match(SRC,/id="sel-now"/);
  assert.match(SRC,/chainCapturedNow\(chain\.net/);
  assert.match(extractFn('selBar'),/sel-now/);
  assert.match(extractFn('chainCapturedNow'),/Math\.round\(\(now\/c\)\*100\)/);
});

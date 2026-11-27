const{appSrc}=require('./appsrc');
// netpnlnow.test.js — wheel card top-right is cycle mark-to-market Net P&L (now)
const test=require('node:test');
const assert=require('node:assert');
const{extractFn}=require('./extract');
const SRC=appSrc();
const net=new Function(extractFn('wheelNetPnlNow')+';return wheelNetPnlNow;')();

function now(o){return net(o);}

test('rolled cycle with -$1,017.60 realised and a +$1,637.84 open leg is +$620.24',()=>{
  assert.strictEqual(now({
    realised:-1017.60,
    hasOpenOption:true,optionPriced:true,openOptionPnl:1637.84,
    hasOpenShares:false,sharesPriced:true,openSharePnl:0
  }),620.24);
});

test('rolled cycle that is still net negative stays negative, and the card paints it red',()=>{
  assert.strictEqual(now({
    realised:-1017.60,
    hasOpenOption:true,optionPriced:true,openOptionPnl:200,
    hasOpenShares:false,sharesPriced:true,openSharePnl:0
  }),-817.60);
  
  assert.match(SRC,/\bclass="\$\{_netNow>=0\?'g':'r'\}"/);
});

test('an open option with no buy-back price shows —, never NaN or a silent realised-only / single-leg fallback',()=>{
  assert.strictEqual(now({
    realised:-1017.60,
    hasOpenOption:true,optionPriced:false,openOptionPnl:1637.84,
    hasOpenShares:false,sharesPriced:true,openSharePnl:0
  }),null);
  assert.ok(!Number.isNaN(now({
    realised:-1017.60,
    hasOpenOption:true,optionPriced:false,openOptionPnl:1637.84,
    hasOpenShares:false
  })));
  const fn=extractFn('wheelNetPnlNow');
  assert.doesNotMatch(fn,/wheelChainProfit/);
  assert.match(SRC,/wheelNetPnlNow\(/);
  assert.match(SRC,/openOptionPnl:\s*_legPft|openOptionPnl:_legPft/);
  assert.match(SRC,/<span>Net P&amp;L \(now\)<\/span><b class="m">—<\/b>/);
  assert.doesNotMatch(SRC,/wl-cur"><span>Profit<\/span><b class="m">no quote<\/b>/);
});

test('a closed cycle with no open legs equals realised cycle P&L',()=>{
  assert.strictEqual(now({
    realised:-1017.60,
    hasOpenOption:false,optionPriced:false,openOptionPnl:null,
    hasOpenShares:false,sharesPriced:true,openSharePnl:0
  }),-1017.60);
  assert.strictEqual(now({
    realised:3609.20,
    hasOpenOption:false,optionPriced:false,
    hasOpenShares:false,sharesPriced:true,openSharePnl:0
  }),3609.20);
});

test('Net P&L (now) is built from the same realised figure the card shows underneath, plus open share unrealised when priced',()=>{
  assert.match(SRC,/_fact\('Realised',fmtMoney\(m\.realisedPnL\)/);
  assert.match(SRC,/realised:\s*m\.realisedPnL/);
  assert.strictEqual(now({
    realised:-1017.60,
    hasOpenOption:true,optionPriced:true,openOptionPnl:1637.84,
    hasOpenShares:true,sharesPriced:true,openSharePnl:100
  }),720.24);
  assert.strictEqual(now({
    realised:-1017.60,
    hasOpenOption:false,
    hasOpenShares:true,sharesPriced:false,openSharePnl:null
  }),null);
});

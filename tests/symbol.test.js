// New wheel: Finnhub search results and ticker fallback.
const test=require('node:test');const assert=require('node:assert');const fs=require('fs');const path=require('path');
const{extractFn}=require('./extract');
const{pick}=require('../netlify/functions/symbol.js');
const nwTicker=new Function(extractFn('nwTicker')+'\nreturn nwTicker;')();
const SRC=fs.readFileSync(path.join(__dirname,'..','app','index.html'),'utf8');
test('search keeps stocks and drops odd symbols',()=>{
  const rows=pick({result:[
    {description:'TESLA INC',displaySymbol:'TSLA',type:'Common Stock'},
    {description:'TESLA INC',displaySymbol:'TSLA',type:'Common Stock'},
    {description:'Something',displaySymbol:'TSLA.MX',type:'Common Stock'},
    {description:'Not a stock',displaySymbol:'TSLA240119C00200000',type:'Option'},
    {description:'Space Exploration Technologies',displaySymbol:'SPCX',type:'Common Stock'}
  ]});
  assert.deepStrictEqual(rows.map(r=>r.symbol),['TSLA','SPCX']);
  assert.strictEqual(rows[0].name,'TESLA INC');
});
test('a plain ticker is accepted; a company name is not a ticker by itself',()=>{
  assert.strictEqual(nwTicker('tsla'),'TSLA');
  assert.strictEqual(nwTicker('BRK.B'),'BRK.B');
  assert.strictEqual(nwTicker('Tesla'),'TESLA'); // letters only, used only when lookup has nothing
  assert.strictEqual(nwTicker('Tesla Inc'),'');
});
test('New wheel replaces the old ticker box and still checks the free cap',()=>{
  assert.ok(SRC.includes('>New wheel</button>'));
  assert.ok(SRC.includes('placeholder="Ticker or company"'));
  assert.ok(SRC.includes('/.netlify/functions/symbol?q='));
  assert.match(extractFn('quickAddRotation'),/wheelCapOk\(ticker/);
  assert.ok(!SRC.includes('placeholder="+ Ticker"'));
  assert.ok(SRC.includes('#new-wheel-btn[hidden],#new-wheel-box[hidden]{display:none !important}'));
  assert.ok(SRC.includes('.nw{position:relative;display:inline-grid'));
});
test('popular US names rank ahead of exchange suffixes',()=>{
  const {rank,rows}=require('../app/popular.js');
  assert.ok(rows.length>=300);
  assert.strictEqual(rank('tes',[{symbol:'TES.V',name:'Tesoro'},{symbol:'TES.L',name:'Thames'},{symbol:'F',name:'Ford'}])[0].symbol,'TSLA');
  const t=rank('T',[{symbol:'TES.V',name:'x'}]).map(r=>r.symbol);
  assert.strictEqual(t[0],'TSLA');
  assert.ok(t.indexOf('T')>0&&t.indexOf('T')<4);
  assert.ok(!t.some(s=>s.includes('.')));
  assert.strictEqual(rank('apple')[0].symbol,'AAPL');
  assert.strictEqual(rank('AAPL')[0].symbol,'AAPL');
  assert.strictEqual(rank('spacex')[0].symbol,'SPCX');
});

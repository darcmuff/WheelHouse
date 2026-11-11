// Multi-select net: credits minus debits, fees already inside the totals. Read-only.
const test=require('node:test');const assert=require('node:assert');const fs=require('fs');const path=require('path');
const{extractFn,extractConst}=require('./extract');
const S=new Function(extractConst('CREDITS')+'\n'+['isCredit','selCash','selCt','selSummary'].map(extractFn).join('\n')+'\nreturn{selCash,selCt,selSummary};')();
const SRC=fs.readFileSync(path.join(__dirname,'..','app','index.html'),'utf8');
test('wheel cash: credit minus fees stays positive, buyback is a debit',()=>{
  assert.strictEqual(S.selCash('CSP',174*4-2.16),693.84);
  assert.strictEqual(S.selCash('BTC',40),-40);
  assert.strictEqual(S.selCash('STO',152),152);
});
test('summary spans dates and sums mixed rows',()=>{
  const s=S.selSummary([{cash:100,date:'2026-10-26',tk:'KO',fee:0.04,ct:1},{cash:-40,date:'2026-11-09',tk:'AMD',fee:0.04,ct:1},{cash:20,date:'2026-11-01',tk:'KO',fee:0,ct:0}]);
  assert.strictEqual(s.net,80);
  assert.strictEqual(s.n,3);
  assert.strictEqual(s.min,'2026-10-26');
  assert.strictEqual(s.max,'2026-11-09');
  assert.strictEqual(s.credits,120);
  assert.strictEqual(s.debits,40);
  assert.strictEqual(s.fees,0.08);
  assert.strictEqual(s.contracts,2);
  assert.strictEqual(s.per,30);
  assert.deepStrictEqual(s.tickers,[{tk:'AMD',cash:-40},{tk:'KO',cash:120}]);
});
test('one ticker omits the split, and shares become contracts',()=>{
  assert.deepStrictEqual(S.selSummary([{cash:80,date:'2026-11-01',tk:'KO',fee:0.04,ct:1}]).tickers,[]);
  assert.strictEqual(S.selCt('CSP',500),5);
  assert.strictEqual(S.selCt('IN',100),0);
});
test('rows carry a selection key and the bar is hidden until select mode',()=>{
  assert.ok(SRC.includes('data-sel="w:'));
  assert.ok(SRC.includes('data-sel="p:'));
  assert.ok(SRC.includes('id="sel-panel" hidden'));
  assert.ok(!SRC.includes('id="sel-bar"'));
  assert.ok(SRC.includes("e.key==='Escape'&&_selOn"));
});

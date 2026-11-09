// Multi-select net: credits minus debits, fees already inside the totals. Read-only.
const test=require('node:test');const assert=require('node:assert');const fs=require('fs');const path=require('path');
const{extractFn,extractConst}=require('./extract');
const S=new Function(extractConst('CREDITS')+'\n'+['isCredit','selCash','selSummary'].map(extractFn).join('\n')+'\nreturn{selCash,selSummary};')();
const SRC=fs.readFileSync(path.join(__dirname,'..','app','index.html'),'utf8');
test('wheel cash: credit minus fees stays positive, buyback is a debit',()=>{
  assert.strictEqual(S.selCash('CSP',174*4-2.16),693.84);
  assert.strictEqual(S.selCash('BTC',40),-40);
  assert.strictEqual(S.selCash('STO',152),152);
});
test('summary spans dates and sums mixed rows',()=>{
  const s=S.selSummary([{cash:100,date:'2026-10-26'},{cash:-40,date:'2026-11-09'},{cash:20,date:'2026-11-01'}]);
  assert.deepStrictEqual(s,{net:80,n:3,min:'2026-10-26',max:'2026-11-09'});
});
test('rows carry a selection key and the bar is hidden until select mode',()=>{
  assert.ok(SRC.includes('data-sel="w:'));
  assert.ok(SRC.includes('data-sel="p:'));
  assert.ok(SRC.includes('id="sel-bar" hidden'));
  assert.ok(SRC.includes("e.key==='Escape'&&_selOn"));
});

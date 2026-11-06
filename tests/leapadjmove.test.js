const test=require('node:test');const assert=require('node:assert');const fs=require('fs');const path=require('path');
const SRC=fs.readFileSync(path.join(__dirname,'..','app','index.html'),'utf8');
const {extractFn}=require('./extract');
const f=new Function(extractFn('leapAdjMoveHtml')+'\nreturn leapAdjMoveHtml;')();
test('Cost after calls %: down vs paid is green ▼ (calls paid you back)',()=>{
  const h=f(15745,14170.5); // ~10% paid back
  assert.ok(h.includes('▼')&&h.includes('10.0%')&&h.includes('var(--green)')&&!h.includes('▲'));
});
test('Cost after calls %: up vs paid is red ▲ (calls lost money)',()=>{
  const h=f(10000,11000);
  assert.ok(h.includes('▲')&&h.includes('10.0%')&&h.includes('var(--red)'));
});
test('Cost after calls %: flat / missing / zero cost → nothing',()=>{
  assert.strictEqual(f(10000,10000),'');
  assert.strictEqual(f(10000,10004),''); // <0.05%
  assert.strictEqual(f(0,0),'');
  assert.strictEqual(f(10000,null),'');
});
test('hero wires leapAdjMoveHtml next to Cost after calls dollar',()=>{
  assert.ok(SRC.includes('${m0(P.adj)}${leapAdjMoveHtml(P.cost,P.adj)}'));
  assert.ok(SRC.includes('The ▲/▼ % is vs what you paid.'));
});

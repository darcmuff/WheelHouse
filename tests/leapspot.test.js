const test=require('node:test');const assert=require('node:assert');const fs=require('fs');const path=require('path');
const SRC=fs.readFileSync(path.join(__dirname,'..','app','index.html'),'utf8');
const i=SRC.indexOf('function leapSpotHtml(');const j=SRC.indexOf('\nfunction renderLeapCard(',i);
const f=new Function(SRC.slice(i,j)+'\nreturn leapSpotHtml;')();
test('LEAP header price: up, open session, above strike',()=>{const h=f({price:165,pct:1.23,state:'REGULAR'},150,true);assert.ok(h.includes('$165.00')&&h.includes('▲1.2%')&&h.includes('var(--green)')&&h.includes('10.0% above strike')&&!h.includes('close'));});
test('LEAP header price: down, out of hours labelled close, below strike',()=>{const h=f({price:135,pct:-2,state:'REGULAR'},150,false);assert.ok(h.includes('▼2.0%')&&h.includes('var(--red)')&&h.includes('close')&&h.includes('10.0% below strike'));});
test('LEAP header price: no quote → nothing; delayed fallback → no move',()=>{assert.strictEqual(f(null,150,true),'');assert.ok(!f({price:10,pct:0,state:'DELAYED'},5,true).includes('▲'));});

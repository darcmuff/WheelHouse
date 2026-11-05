const test=require('node:test');const assert=require('node:assert');const fs=require('fs');const path=require('path');
const SRC=fs.readFileSync(path.join(__dirname,'..','app','index.html'),'utf8');
const i=SRC.indexOf('function leapOptHtml(');const j=SRC.indexOf('\nfunction renderLeapCard(',i);
const f=new Function(SRC.slice(i,j)+'\nreturn leapOptHtml;')();
test('option up vs prev close',()=>{const h=f(62.4,60.5,null);assert.ok(h.includes('$62.40')&&h.includes('▲3.1%')&&h.includes('+$1.90')&&h.includes('var(--green)'));});
test('option down falls back to first mark today',()=>{const h=f(9,null,10);assert.ok(h.includes('▼10.0%')&&h.includes('var(--red)'));});
test('no mark → nothing; no base → price only',()=>{assert.strictEqual(f(null,5,5),'');const h=f(5,null,null);assert.ok(h.includes('$5.00')&&!h.includes('▲'));});
test('optchain passes prev close through',()=>{assert.ok(fs.readFileSync(path.join(__dirname,'..','netlify','functions','optchain.js'),'utf8').includes('prevClose: o.prev_day_close'));});

const test=require('node:test');const assert=require('node:assert');const fs=require('fs');const path=require('path');
const SRC=fs.readFileSync(path.join(__dirname,'..','app','index.html'),'utf8');
const i=SRC.indexOf('function leapLogoHtml(');const j=SRC.indexOf('\nfunction renderLeapCard(',i);
const f=new Function('logos','esc',SRC.slice(i,j)+'\nreturn leapLogoHtml;')({SPCX:'https://x/spcx.png'},s=>s);
test('LEAP header shows the same logo as wheel cards',()=>{const h=f('SPCX',true);assert.ok(h.includes('spcx.png')&&h.includes('rot-logo')&&!h.includes(' cn'));});
test('no logo → nothing; closed → dimmed',()=>{assert.strictEqual(f('ZZZ',true),'');assert.ok(f('SPCX',false).includes('cn'));});
test('renderLeapCard uses it',()=>{assert.ok(SRC.includes("leapLogoHtml(l.underlying,open)"));});
test('boot fetches logos for open LEAP underlyings too',()=>{assert.ok(SRC.includes("const allSyms = [...new Set([...wheelSyms, ...optSyms])];"));});

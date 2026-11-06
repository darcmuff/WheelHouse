const test=require('node:test');const assert=require('node:assert');const fs=require('fs');const path=require('path');
const SRC=fs.readFileSync(path.join(__dirname,'..','app','index.html'),'utf8');
const i=SRC.indexOf('function leapLogoHtml(');const j=SRC.indexOf('\nfunction renderLeapCard(',i);
const f=new Function('logos','esc',SRC.slice(i,j)+'\nreturn leapLogoHtml;')({SPCX:'https://x/spcx.png'},s=>s);
test('LEAP header shows the same logo as wheel cards',()=>{const h=f('SPCX',true);assert.ok(h.includes('spcx.png')&&h.includes('rot-logo')&&!h.includes(' cn'));});
test('no logo → nothing; closed → dimmed',()=>{assert.strictEqual(f('ZZZ',true),'');assert.ok(f('SPCX',false).includes('cn'));});
test('renderLeapCard uses it',()=>{assert.ok(SRC.includes("leapLogoHtml(l.underlying,open)"));});
test('boot fetches logos for open LEAP underlyings too',()=>{assert.ok(SRC.includes('logoSyms()'));assert.ok(SRC.includes('function logoSyms()'));});
test('logoSyms includes every wheel and LEAP ticker, not only open',()=>{
  const a=SRC.indexOf('function logoSyms()');assert.ok(a>0);
  const body=SRC.slice(a,SRC.indexOf('\n}',a)+2);
  assert.ok(!/status\s*===\s*['"]open['"]/.test(body),'logoSyms must not filter by open status');
  assert.ok(body.includes('db.wheels')&&body.includes('db.opts')&&body.includes('underlying'));
});
test('logos hydrate from localStorage so first paint keeps them',()=>{
  assert.ok(SRC.includes("localStorage.getItem('wh-logos')"));
  assert.ok(SRC.includes('let logos=_loadLogoCache()')||SRC.includes('let logos = _loadLogoCache()'));
  assert.ok(SRC.includes('_saveLogoCache'));
});
test('boot re-renders when logos land without waiting for quotes',()=>{
  assert.ok(SRC.includes('Promise.allSettled(logoPromises).then(() => { if (Object.values(logos).some(Boolean)) render(); })')
    ||SRC.includes('Promise.allSettled(logoPromises).then(()=>{if(Object.values(logos).some(Boolean))render();})'));
});
test('fetchAllQuotes logos use logoSyms (closed wheels keep logos)',()=>{
  const a=SRC.indexOf('async function fetchAllQuotes(');const b=SRC.indexOf('\nasync function buildSpark(',a);
  const body=SRC.slice(a,b);
  assert.ok(body.includes('logoSyms()'));
});

const test=require('node:test');const assert=require('node:assert');const fs=require('fs');const path=require('path');
const SRC=fs.readFileSync(path.join(__dirname,'..','app','index.html'),'utf8');
function grab(name){const i=SRC.indexOf('function '+name+'(');if(i<0)throw new Error('missing '+name);let d=0,start=SRC.indexOf('{',i);for(let j=start;j<SRC.length;j++){if(SRC[j]==='{')d++;else if(SRC[j]==='}'){d--;if(!d)return SRC.slice(i,j+1);}}throw new Error('unclosed '+name);}
const f=new Function('logos','esc',grab('rotNumHtml')+'\n'+grab('leapLogoHtml')+'\nreturn leapLogoHtml;')({SPCX:'https://x/spcx.png'},s=>s);
test('LEAP header shows the same logo as wheel cards',()=>{const h=f('SPCX',true);assert.ok(h.includes('spcx.png')&&h.includes('rot-logo')&&!h.includes(' cn'));assert.ok(h.includes('rot-num'));});
test('no logo → letter fallback; closed → dimmed',()=>{const miss=f('ZZZ',true);assert.ok(miss.includes('rot-num')&&miss.includes('Z')&&!miss.includes('rot-logo'));assert.ok(f('SPCX',false).includes('cn'));});
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
test('LEAP logo CSS matches the wheel header badge (size, ring, not hidden)',()=>{
  assert.ok(!/\.lcw \.lc-logo\{display:none/.test(SRC));
  assert.ok(SRC.includes('.lcw .rot-logo,.lcw .rot-num{box-shadow:0 0 0 1.5px rgba(255,255,255,.55);background-color:#fff}'));
  assert.ok(SRC.includes('.lcw>.lc-h .lc-id{display:inline-flex;align-items:center;gap:0.5rem'));
});

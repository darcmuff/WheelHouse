const{appSrc}=require('./appsrc');
const test=require('node:test');const assert=require('node:assert');const fs=require('fs');const path=require('path');
const SRC=appSrc();
function grab(name){const i=SRC.indexOf('function '+name+'(');if(i<0)throw new Error('missing '+name);let d=0,start=SRC.indexOf('{',i);for(let j=start;j<SRC.length;j++){if(SRC[j]==='{')d++;else if(SRC[j]==='}'){d--;if(!d)return SRC.slice(i,j+1);}}throw new Error('unclosed '+name);}
function grabConst(name){const i=SRC.indexOf('const '+name+'=');if(i<0)throw new Error('missing '+name);let end=SRC.indexOf(';',i);return SRC.slice(i,end+1);}
const f=new Function('logos','esc',grabConst('FACE_LOGOS')+'\n'+grab('logoUrlFor')+'\n'+grab('rotNumHtml')+'\n'+grab('leapLogoHtml')+'\nreturn leapLogoHtml;')({SPCX:'https://x/wordmark.png',AAPL:'https://x/aapl.png'},s=>s);
test('LEAP header shows the same logo as wheel cards',()=>{const h=f('AAPL',true);assert.ok(h.includes('aapl.png')&&h.includes('rot-logo')&&!h.includes(' cn'));assert.ok(h.includes('rot-num'));});
test('SPCX and TSLA always use the crisp Logo.dev square faces, not the wordmark or a profile stub',()=>{
  const sp=f('SPCX',true), ts=f('TSLA',true);
  assert.ok(sp.includes('brand/logos/SPCX.png')&&sp.includes('rot-logo')&&!sp.includes('wordmark.png'));
  assert.ok(ts.includes('brand/logos/TSLA.png')&&ts.includes('rot-logo'));
  assert.ok(fs.existsSync(path.join(__dirname,'../app/brand/logos/SPCX.png')));
  assert.ok(fs.existsSync(path.join(__dirname,'../app/brand/logos/TSLA.png')));
  // Square icons (black X / Tesla T), not the wide wordmark mask used as card art
  const face=fs.readFileSync(path.join(__dirname,'../app/brand/logos/SPCX.png'));
  const mask=fs.readFileSync(path.join(__dirname,'../app/brand/SPCX.png'));
  assert.notDeepStrictEqual(face,mask);
});
test('no logo → letter fallback; closed → dimmed',()=>{const miss=f('ZZZ',true);assert.ok(miss.includes('rot-num')&&miss.includes('Z')&&!miss.includes('rot-logo'));assert.ok(f('SPCX',false).includes('cn'));assert.ok(f('AAPL',false).includes('cn'));});
test('fetchLogo and wheelLogoHtml go through logoUrlFor so wheels and LEAPs share the face',()=>{
  assert.ok(SRC.includes('function logoUrlFor('));
  assert.ok(SRC.includes('const logoUrl=logoUrlFor(wheel.ticker);'));
  assert.ok(SRC.includes('function wheelLogoHtml(ticker){const u=logoUrlFor(ticker);'));
  assert.ok(SRC.includes('if(FACE_LOGOS[sym]){logos[sym]=FACE_LOGOS[sym];return;}'));
});
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

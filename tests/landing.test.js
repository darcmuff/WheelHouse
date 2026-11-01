const test=require('node:test');const assert=require('node:assert');const fs=require('fs'),path=require('path');
const A=path.join(__dirname,'..','app');const L=fs.readFileSync(path.join(A,'landing.html'),'utf8');const R=fs.readFileSync(path.join(A,'_redirects'),'utf8');
const{analyticsTag}=require('../app/analytics.js');
test('root shows the landing page; /app/ and /index.html are the app',()=>{assert.ok(/^\/\s+\/landing\.html\s+200!$/m.test(R));assert.ok(/^\/app\s+\/index\.html\s+200$/m.test(R)&&/^\/app\/\*\s+\/index\.html\s+200$/m.test(R));assert.ok(!/301/.test(R.replace(/^#.*$/mg,'')),'no slash redirect loop');
  const h=fs.readFileSync(path.join(A,'index.html'),'utf8');assert.ok(h.includes('<base href="/">'));});
test('installed app and returning users skip the landing page',()=>{assert.ok(L.includes("display-mode: standalone")&&L.includes("'wh-view'")&&L.includes("location.replace('/app/'"));assert.ok(L.indexOf('location.replace')<L.indexOf('<style>'),'redirect runs before anything renders');});
test('installed app keeps its identity',()=>{const m=JSON.parse(fs.readFileSync(path.join(A,'manifest.json'),'utf8'));assert.strictEqual(m.id,'/');assert.strictEqual(m.start_url,'/app/');});
test('landing: features, screenshots, plans, not financial advice, legal links, CTAs, no hype',()=>{
  ['SmartScan','Robinhood','LEAP','PMCC','captured','Realised','Monthly return','after-hours','Not financial advice','legal.html#privacy','legal.html#terms','Start free','Sign in','id="plans"'].forEach(s=>assert.ok(L.includes(s),s));
  ['img/shot-wheel.webp','img/shot-home.webp','img/shot-leaps.webp','img/shot-smartscan.webp'].forEach(s=>{assert.ok(L.includes(s));assert.ok(fs.existsSync(path.join(A,s)),s);});
  assert.ok(!/financial freedom|passive income|guaranteed/i.test(L));});
test('landing is light: no external CSS/fonts, images small',()=>{assert.ok(!/<link[^>]+stylesheet/.test(L));fs.readdirSync(path.join(A,'img')).forEach(f=>assert.ok(fs.statSync(path.join(A,'img',f)).size<60000,f));});
test('analytics: off by default, cookie-free providers only, never on localhost',()=>{const ctx={window:{}};require('vm').runInNewContext(fs.readFileSync(path.join(A,'brand.js'),'utf8'),ctx);
  assert.strictEqual(analyticsTag(ctx.window.BRAND.analytics,'x.netlify.app'),null);
  assert.strictEqual(analyticsTag({provider:'plausible',domain:'optrack.app'},'optrack.app').attrs['data-domain'],'optrack.app');assert.strictEqual(analyticsTag({provider:'plausible',domain:'optrack.app'},'localhost'),null);
  assert.ok(analyticsTag({provider:'goatcounter',goatcounter:'https://optrack.goatcounter.com/count'},'a').src.includes('gc.zgo.at'));assert.strictEqual(analyticsTag({provider:'goatcounter',goatcounter:'https://evil.com/x'},'a'),null);
  ['index.html','landing.html','legal.html'].forEach(f=>assert.ok(fs.readFileSync(path.join(A,f),'utf8').includes('src="analytics.js"'),f));});
test('service worker keeps the app, not the landing page, as the offline shell',()=>{const s=fs.readFileSync(path.join(A,'sw.js'),'utf8');assert.ok(s.includes("const SHELL = './index.html'")&&s.includes('x.put(SHELL, c)'));});

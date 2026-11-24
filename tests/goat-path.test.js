const test=require('node:test');const assert=require('node:assert');const fs=require('fs'),path=require('path');
const A=path.join(__dirname,'..','app');
const{goatPath,gcLiveHost,gcTestFlag,gcShouldCount,gcTakePageview}=require('../app/goat-path.js');
const{countEvent}=require('../app/analytics.js');

const cases=[
  ['/demo','/demo'],
  ['/demo?twclid=abc123','/demo'],
  ['/demo?utm_source=x&twclid=abc123','/demo?utm_source=x'],
  ['/demo?utm_source=x&utm_medium=paid&twclid=abc&fbclid=1&gclid=2&utm_campaign=c','/demo?utm_source=x&utm_medium=paid&utm_campaign=c'],
  ['/demo?fbclid=IwAR','/demo'],
  ['/demo?gclid=xyz','/demo'],
  ['/demo?utm_source=x','/demo?utm_source=x'],
  ['/demo?TWCLID=abc&utm_source=x','/demo?utm_source=x'],
  ['/demo?utm_source=x&twclid=','/demo?utm_source=x'],
  ['/app/?signup=1','/app/?signup=1'],
  ['/','/'],
  ['',''],
  ['?twclid=1',''],
  ['/p?b=1&utm_source=x&a=2&twclid=3','/p?b=1&utm_source=x&a=2'],
  ['/demo?utm_source=x&fbclid=IwAR&other=1','/demo?utm_source=x&other=1'],
  ['/demo?twclid=1#x','/demo#x'],
  ['/demo?utm_source=x&twclid=1#sec','/demo?utm_source=x#sec'],
  [null,''],
  [undefined,''],
  ['/no-such-page','/no-such-page'],
  ['/demo?utm_source=x&utm_medium=paid&utm_campaign=optrack_nov2026&twclid=abc123','/demo?utm_source=x&utm_medium=paid&utm_campaign=optrack_nov2026'],
  ['/demo?utm_source=x&twclid=abc123&gc_test=1','/demo?utm_source=x&gc_test=1'],
];

test('goatPath strips twclid, fbclid and gclid and keeps utm_* and other params',()=>{
  cases.forEach(([input,want])=>assert.strictEqual(goatPath(input),want,String(input)));
});

test('gcLiveHost allows only optrack.app and www.optrack.app',()=>{
  assert.strictEqual(gcLiveHost('optrack.app'),true);
  assert.strictEqual(gcLiveHost('www.optrack.app'),true);
  assert.strictEqual(gcLiveHost('OPTRACK.APP'),true);
  ['dev--wheelhouse-tracker.netlify.app','wheelhouse-tracker.netlify.app','deploy-preview-99--wheelhouse-tracker.netlify.app','something.netlify.app','localhost','127.0.0.1','optrack.app.evil.com','app.optrack.app',''].forEach(h=>assert.strictEqual(gcLiveHost(h),false,h));
});

test('gcTestFlag recognises ?gc_test=1 and localStorage value 1 only',()=>{
  assert.strictEqual(gcTestFlag('?gc_test=1',null),true);
  assert.strictEqual(gcTestFlag('?utm_source=x&gc_test=1',null),true);
  assert.strictEqual(gcTestFlag('?gc_test=1&utm_source=x',null),true);
  assert.strictEqual(gcTestFlag('', '1'),true);
  assert.strictEqual(gcTestFlag('?utm_source=x',null),false);
  assert.strictEqual(gcTestFlag('?gc_test=0',null),false);
  assert.strictEqual(gcTestFlag('?gc_test=10',null),false);
  assert.strictEqual(gcTestFlag('?gc_test',null),false);
  assert.strictEqual(gcTestFlag('', 'true'),false);
  assert.strictEqual(gcTestFlag('', null),false);
});

test('gcShouldCount is live-host or test flag, never bare preview/dev/localhost',()=>{
  assert.strictEqual(gcShouldCount('optrack.app','',null),true);
  assert.strictEqual(gcShouldCount('www.optrack.app','',null),true);
  assert.strictEqual(gcShouldCount('dev--wheelhouse-tracker.netlify.app','',null),false);
  assert.strictEqual(gcShouldCount('dev--wheelhouse-tracker.netlify.app','?gc_test=1',null),true);
  assert.strictEqual(gcShouldCount('dev--wheelhouse-tracker.netlify.app','?utm_source=x&twclid=abc&gc_test=1',null),true);
  assert.strictEqual(gcShouldCount('foo.netlify.app','', '1'),true);
  assert.strictEqual(gcShouldCount('localhost','',null),false);
  assert.strictEqual(gcShouldCount('localhost','?gc_test=1',null),true);
  assert.strictEqual(gcShouldCount('127.0.0.1','',null),false);
});

test('gcTakePageview allows exactly one send per state object',()=>{
  const s={};
  assert.strictEqual(gcTakePageview(s),true);
  assert.strictEqual(gcTakePageview(s),false);
  assert.strictEqual(gcTakePageview(s),false);
  assert.strictEqual(s.sent,true);
  const s2=gcTakePageview();
  assert.strictEqual(s2,true);
});

test('countEvent follows the same host gate and still skips simulator runs',()=>{
  assert.strictEqual(countEvent('/start-free','optrack.app',false),true);
  assert.strictEqual(countEvent('/start-free','www.optrack.app',false),true);
  assert.strictEqual(countEvent('/start-free','localhost',false),false);
  assert.strictEqual(countEvent('/go-pro','optrack.app',true),false);
  assert.strictEqual(countEvent('/start-free','dev--wheelhouse-tracker.netlify.app',false),false);
  assert.strictEqual(countEvent('/start-free','dev--wheelhouse-tracker.netlify.app',false,'?gc_test=1'),true);
  assert.strictEqual(countEvent('/start-free','foo.netlify.app',false,'', '1'),true);
  assert.strictEqual(countEvent('/start-free','dev--wheelhouse-tracker.netlify.app',true,'?gc_test=1'),false);
  assert.strictEqual(countEvent('','optrack.app',false),false);
});

function extractFn(src, name){
  const m=src.match(new RegExp('function '+name+'\\([^{]*\\)\\{[\\s\\S]*?\\n\\}'));
  assert.ok(m, name+' in source');
  return m[0];
}

test('every counting page inlines the helpers, sets no_onload, sends one pageview on count.js onload, and analytics.js does not inject count.js',()=>{
  const src=fs.readFileSync(path.join(A,'goat-path.js'),'utf8');
  const names=['goatPath','gcLiveHost','gcTestFlag','gcShouldCount','gcTakePageview'];
  const fns=Object.fromEntries(names.map(n=>[n,extractFn(src,n)]));
  const pages=['index.html','landing.html','start.html','legal.html','404.html'];
  pages.forEach(f=>{
    const h=fs.readFileSync(path.join(A,f),'utf8');
    const head=h.slice(0,h.toLowerCase().indexOf('</head>'));
    names.forEach(n=>assert.ok(head.includes(fns[n]),f+' inlines '+n));
    const pathAt=head.indexOf('window.goatcounter.path=');
    const noOn=head.indexOf('window.goatcounter.no_onload=true');
    const countAt=head.indexOf('src="https://gc.zgo.at/count.js"');
    assert.ok(pathAt>=0&&noOn>=0&&countAt>pathAt&&countAt>noOn,f+' sets path and no_onload before count.js');
    assert.ok(/<script[^>]*data-goatcounter="https:\/\/optrack\.goatcounter\.com\/count"[^>]*\basync\b[^>]*src="https:\/\/gc\.zgo\.at\/count\.js"[^>]*onload="window\._gcSendPageview&&window\._gcSendPageview\(\)"/i.test(head),f+' loads count.js async and pagesviews from onload');
    const inlined=new Function(fns.goatPath+';return goatPath;')();
    cases.forEach(([input,want])=>assert.strictEqual(inlined(input),want,f+' inlined goatPath: '+String(input)));
    const should=new Function(fns.gcLiveHost+fns.gcTestFlag+fns.gcShouldCount+';return gcShouldCount;')();
    assert.strictEqual(should('optrack.app','',null),true);
    assert.strictEqual(should('dev--wheelhouse-tracker.netlify.app','',null),false);
    assert.strictEqual(should('dev--wheelhouse-tracker.netlify.app','?gc_test=1',null),true);
    const take=new Function(fns.gcTakePageview+';return gcTakePageview;')();
    const st={};assert.ok(take(st)&&!take(st));
  });
  const idx=fs.readFileSync(path.join(A,'index.html'),'utf8');
  const i=idx.indexOf('<script src="demo.js"></script>');
  assert.ok(i>0&&i<idx.indexOf('localStorage'),'demo.js still runs before any localStorage read on the app page');
  const ana=fs.readFileSync(path.join(A,'analytics.js'),'utf8');
  assert.ok(!/createElement\(\s*['"]script['"]\s*\)/.test(ana),'analytics.js must not inject a second count.js');
  assert.ok(ana.includes('window._otQ')&&ana.includes('typeof gc.count')&&ana.includes('typeof g.count'),'event queue still waits for goatcounter.count');
  assert.ok(ana.includes('gc_test')&&ana.includes('countEvent._allow'),'events use the same host gate');
});

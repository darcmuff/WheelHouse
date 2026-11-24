const test=require('node:test');const assert=require('node:assert');const fs=require('fs'),path=require('path');
const A=path.join(__dirname,'..','app');
const{goatPath}=require('../app/goat-path.js');

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
  ['',''] ,
  ['?twclid=1',''],
  ['/p?b=1&utm_source=x&a=2&twclid=3','/p?b=1&utm_source=x&a=2'],
  ['/demo?utm_source=x&fbclid=IwAR&other=1','/demo?utm_source=x&other=1'],
  ['/demo?twclid=1#x','/demo#x'],
  ['/demo?utm_source=x&twclid=1#sec','/demo?utm_source=x#sec'],
  [null,''],
  [undefined,''],
  ['/no-such-page','/no-such-page'],
  ['/demo?utm_source=x&utm_medium=paid&utm_campaign=optrack_nov2026&twclid=abc123','/demo?utm_source=x&utm_medium=paid&utm_campaign=optrack_nov2026'],
];

test('goatPath strips twclid, fbclid and gclid and keeps utm_* and other params',()=>{
  cases.forEach(([input,want])=>assert.strictEqual(goatPath(input),want,String(input)));
});

test('every counting page inlines the same goatPath before async count.js, and analytics.js does not inject it',()=>{
  const src=fs.readFileSync(path.join(A,'goat-path.js'),'utf8');
  const m=src.match(/function goatPath\(p\)\{[\s\S]*?\n\}/);
  assert.ok(m,'goat-path.js exports goatPath');
  const fn=m[0];
  const pages=['index.html','landing.html','start.html','legal.html','404.html'];
  pages.forEach(f=>{
    const h=fs.readFileSync(path.join(A,f),'utf8');
    const head=h.slice(0,h.toLowerCase().indexOf('</head>'));
    assert.ok(head.includes(fn),f+' inlines the same goatPath body');
    const pathAt=head.indexOf('window.goatcounter.path=');
    const countAt=head.indexOf('src="https://gc.zgo.at/count.js"');
    assert.ok(pathAt>=0&&countAt>pathAt,f+' sets goatcounter.path before count.js');
    assert.ok(/<script[^>]*data-goatcounter="https:\/\/optrack\.goatcounter\.com\/count"[^>]*\basync\b[^>]*src="https:\/\/gc\.zgo\.at\/count\.js"/i.test(head),f+' loads count.js async with the endpoint');
    const inlined=new Function(fn+';return goatPath;')();
    cases.forEach(([input,want])=>assert.strictEqual(inlined(input),want,f+' inlined goatPath: '+String(input)));
  });
  const ana=fs.readFileSync(path.join(A,'analytics.js'),'utf8');
  assert.ok(!/createElement\(\s*['"]script['"]\s*\)/.test(ana),'analytics.js must not inject a second count.js');
  assert.ok(ana.includes('window._otQ')&&ana.includes('typeof gc.count')&&ana.includes('typeof g.count'),'event queue still waits for goatcounter.count');
});

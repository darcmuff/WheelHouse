// healthall.test.js — allDataHealth: options load failures must never read as "all clear"; merged list sorted by severity.
const test=require('node:test');const assert=require('node:assert');const {extractFn}=require('./extract');
const mk=(optErr,healthImpl,wheelIssues)=>new Function(`const esc=s=>String(s==null?'':s);let optDemo=false;const _optsLoadError=${JSON.stringify(optErr)};
const db={wheels:[],trades:[],opts:[]};const OPTS={health:${healthImpl}};const runDataHealth=()=>${JSON.stringify(wheelIssues)};
${extractFn('allDataHealth')};return allDataHealth;`)();
test('no issues, options loaded: all clear',()=>{assert.deepStrictEqual(mk('','()=>[]',[])(),[]);});
test('options load error surfaces as amber, not all clear',()=>{const r=mk('permission-denied','()=>[]',[])();
  assert.strictEqual(r.length,1);assert.strictEqual(r[0].sev,'amber');assert.match(r[0].text,/couldn't load \(permission-denied\)/);});
test('options health throwing is reported, not swallowed',()=>{const r=mk('','()=>{throw new Error("x")}',[])();
  assert.strictEqual(r.length,1);assert.match(r[0].text,/could not run/);});
test('merged list sorted red > amber > grey across wheel and options',()=>{
  const r=mk('','()=>[{sev:"red",text:"o-red"}]',[{sev:'amber',text:'w-amber'},{sev:'grey',text:'w-grey'}])();
  assert.deepStrictEqual(r.map(i=>i.sev),['red','amber','grey']);assert.match(r[0].text,/^Options · o-red/);});

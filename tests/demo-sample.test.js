const test=require('node:test');const assert=require('node:assert');
const { load } = require('./extract.js');

const { parseSmartText } = load(
  [
    { kind: 'const', name: 'MON_PAT' },
    { kind: 'const', name: 'MON_MAP' },
    { kind: 'fn', name: 'parseSmartText' },
  ],
  // parseSmartText calls computeTotal at the end; irrelevant to these assertions
  'function computeTotal(){return 0;}'
);
const fs=require('fs'),path=require('path'),vm=require('vm');
test('demo "Try a sample" text is understood by SmartScan',()=>{
  const ls={_m:{},getItem(k){return this._m[k]??null;},setItem(k,v){this._m[k]=v;},removeItem(k){delete this._m[k];}};
  const win={location:{pathname:'/demo',href:'https://x/demo',origin:'https://x'},localStorage:ls,fetch(){}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','app','demo.js'),'utf8'),{window:win,location:win.location,localStorage:ls,Storage:function(){},URL,Response:function(){},Promise,JSON,Math,Date,setTimeout,clearTimeout,Object,confirm(){}});
  const r=parseSmartText(win.OT_DEMO.sample());
  assert.ok(r,'parsed');assert.strictEqual(r.ticker,'SOFI');assert.strictEqual(r.action,'CSP');assert.strictEqual(+r.strike,15);assert.strictEqual(+r.premium,0.29);assert.ok(Math.abs(+r.fees-0.2)<1e-9);assert.strictEqual(+r.shares,500);
});

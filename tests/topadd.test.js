const test=require('node:test');const assert=require('node:assert');const fs=require('fs'),path=require('path');
const SRC=fs.readFileSync(path.join(__dirname,'..','app','index.html'),'utf8');
test('top bar Add trade hidden on Wheel tab only, set on every render',()=>{const i=SRC.indexOf('function render(){');
  assert.ok(SRC.slice(i,i+200).includes("b.style.display=view==='positions'?'none':''"));});
test('wheel cards keep Add trade and + Ticker; cog stays right-aligned',()=>{
  assert.ok(SRC.includes(`onclick="openPasteTrade('\${wheel.id}')">Add trade</button>`));
  assert.ok(SRC.includes('id="new-rot-ticker-top"'));
  assert.ok(/\.tn-right\{margin-left:auto/.test(SRC));});

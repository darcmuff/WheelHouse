const test=require('node:test');const assert=require('node:assert');const fs=require('fs'),path=require('path');
const SRC=fs.readFileSync(path.join(__dirname,'..','app','index.html'),'utf8');
test('header Add trade only on Wheel and LEAPs, not Home, Activity or Settings',()=>{
  assert.ok(SRC.includes("b.style.display=(view==='positions'||view==='options')&&!settingsOpen?'':'none'"));
  assert.ok(SRC.includes("if(id==='mSettings')syncAddTrade()"));
  assert.ok(SRC.includes('class="btn btn-primary tn-paste"'));
  assert.ok(!SRC.includes(`openPasteTrade('\${wheel.id}')">Add trade`));
  assert.ok(!SRC.includes(`openPmccSell('\${esc(leap.id)}')">Add trade`));
  assert.ok(!SRC.includes('✦ Add Trade'));
  assert.ok(!/act-btns"><button class="btn btn-primary" onclick="openPasteTrade\(\)">\+ Add trade/.test(SRC));
  assert.ok(SRC.includes('Import CSV / PDF'));
  assert.ok(SRC.includes('id="wheel-empty"'));});
test('wheel toolbar keeps New wheel; cog stays right-aligned',()=>{
  assert.ok(SRC.includes('id="new-rot-ticker-top"'));
  assert.ok(/\.tn-right\{margin-left:auto/.test(SRC));});

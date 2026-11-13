const test=require('node:test');const assert=require('node:assert');const fs=require('fs'),path=require('path');
const SRC=fs.readFileSync(path.join(__dirname,'..','app','index.html'),'utf8');
test('Add trade is only on each trade table, not the nav or the import row',()=>{
  assert.ok(!SRC.includes('tn-paste'));
  assert.ok(!SRC.includes('function pasteFill'));
  assert.ok(SRC.includes(`onclick="openPasteTrade('\${wheel.id}')">Add trade</button>`));
  assert.ok(SRC.includes(`onclick="openPmccSell('\${esc(leap.id)}')">Add trade</button>`));
  assert.ok(!/act-btns"><button class="btn btn-primary" onclick="openPasteTrade\(\)">\+ Add trade/.test(SRC));
  assert.ok(!SRC.includes('✦ Add Trade'));
  assert.ok(SRC.includes('Import CSV / PDF'));
  assert.ok(SRC.includes('id="wheel-empty"'));});
test('wheel toolbar keeps New wheel; cog stays right-aligned',()=>{
  assert.ok(SRC.includes('id="new-rot-ticker-top"'));
  assert.ok(/\.tn-right\{margin-left:auto/.test(SRC));});

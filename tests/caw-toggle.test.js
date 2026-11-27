const{appSrc}=require('./appsrc');
// caw-toggle.test.js — Capital at Work cog: Auto / Manual toggle (v411). No maths changes.
const test=require('node:test');const assert=require('node:assert');
const fs=require('fs'),path=require('path');
const{extractFn}=require('./extract');
const SRC=appSrc();

test('popover swaps the dropdown for an Auto/Manual toggle; Auto=caw, Manual=account',()=>{
  const cfg=extractFn('openRetCfg');
  const set=extractFn('setRetBase');
  const save=extractFn('saveReturnSettings');
  assert.ok(!/<select[\s\S]*id="ret-base"|id="ret-base"[\s\S]*<select/.test(cfg),'dropdown is gone');
  assert.ok(!/How it works|worked example/i.test(cfg+set),'no How it works popup');
  assert.ok(cfg.includes("onclick=\"setRetBase('caw')\"")&&cfg.includes("onclick=\"setRetBase('account')\""));
  assert.ok(/>Auto<\/button>/.test(cfg)&&/>Manual<\/button>/.test(cfg));
  assert.ok(cfg.includes('id="ret-base"')&&cfg.includes('type="hidden"'));
  assert.match(set,/v==='account'\?'account':'caw'/);
  assert.match(set,/ret-acct-row[\s\S]*b==='account'\?'block':'none'/);
  assert.match(save,/const b=bEl\.value/);
  assert.match(save,/base:b,account:a>0\?a:0,target:t>0\?t:null/);
  assert.ok(cfg.includes("const base=rawBase==='account'?'account':rs.base"),'Auto stays the default unless Manual was saved');
  assert.ok(cfg.includes('setRetBase(base)'));
  assert.ok(/window\.setRetBase\s*=\s*setRetBase/.test(SRC),'inline onclick can reach setRetBase');
});

test('popover copy, Monthly target, and Banked profit line are unchanged besides the two new grey lines',()=>{
  const cfg=extractFn('openRetCfg');
  assert.ok(cfg.includes("Auto: measures each month's % return against that month's peak capital at work. Manual: uses the account size you enter."));
  assert.ok(cfg.includes('Applies to Return this month, the monthly table, and the Report.'));
  assert.ok(cfg.includes('class="ret-note"')&&/color:var\(--text3\)/.test(SRC.match(/\.ret-note\{[^}]+\}/)[0]));
  assert.ok(cfg.includes('Monthly target')&&cfg.includes('Banked profit only'));
  assert.ok(cfg.includes('<input id="ret-target" type="number"')&&!cfg.includes("openUpgrade('analytics')")&&!cfg.includes('ret-pro'));
  const css=SRC.match(/\.ret-mode\{[^}]+\}/)[0]+SRC.match(/\.ret-mode button\.on\{[^}]+\}/)[0];
  assert.ok(css.includes('border-radius:6px')&&css.includes('var(--brand-orange)'));
});

test('setRetBase keeps hidden #ret-base in sync and only shows the account size in Manual',()=>{
  const hidden={value:''};
  const row={style:{display:''}};
  const auto={getAttribute:()=>'caw',classList:{on:null,toggle(n,on){this.on=on;}},setAttribute(n,v){this[n]=v;}};
  const man={getAttribute:()=>'account',classList:{on:null,toggle(n,on){this.on=on;}},setAttribute(n,v){this[n]=v;}};
  const els={'ret-base':hidden,'ret-acct-row':row};
  const prev=global.document;
  global.document={
    getElementById:id=>els[id]||null,
    querySelectorAll:sel=>sel.includes('ret-mode')?[auto,man]:[],
  };
  try{
    const set=new Function(extractFn('setRetBase')+'\nreturn setRetBase;')();
    set('caw');
    assert.strictEqual(hidden.value,'caw');assert.strictEqual(row.style.display,'none');
    assert.strictEqual(auto.classList.on,true);assert.strictEqual(auto['aria-pressed'],'true');
    assert.strictEqual(man.classList.on,false);assert.strictEqual(man['aria-pressed'],'false');
    set('account');
    assert.strictEqual(hidden.value,'account');assert.strictEqual(row.style.display,'block');
    assert.strictEqual(auto.classList.on,false);assert.strictEqual(man.classList.on,true);
    set('something-else');
    assert.strictEqual(hidden.value,'caw','unknown values fall back to Auto / caw');
  }finally{
    if(prev===undefined)delete global.document;else global.document=prev;
  }
});

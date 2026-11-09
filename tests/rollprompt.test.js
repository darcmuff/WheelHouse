// A buy-to-close plus a later sell is a roll only when the user says Yes.
const test=require('node:test');const assert=require('node:assert');const fs=require('fs');const path=require('path');
const{extractFn,extractConst}=require('./extract');
const S=new Function(['CREDITS','ROLL_WINDOW_DAYS'].map(extractConst).join('\n')+'\n'+['isCredit','walkLegPairs','withinRollWindow','closedOptionSide','rollMatch','leapRollMatch','rollLegNet'].map(extractFn).join('\n')+'\nreturn{ROLL_WINDOW_DAYS,withinRollWindow,rollMatch,leapRollMatch,rollLegNet};')();
const SRC=fs.readFileSync(path.join(__dirname,'..','app','index.html'),'utf8');
const csp=(id,day,strike)=>({id,action:'CSP',entered:day,expiry:'2026-11-20',strike,shares:100,total:80,wheelId:'w',ticker:'EX'});
const btc=(id,day,strike)=>({id,action:'BTC',entered:day,strike,shares:100,total:40,wheelId:'w',ticker:'EX'});
test('window is the sell date or the calendar day before',()=>{
  assert.strictEqual(S.ROLL_WINDOW_DAYS,1);
  assert.strictEqual(S.withinRollWindow('2026-11-09','2026-11-09'),true);
  assert.strictEqual(S.withinRollWindow('2026-11-08','2026-11-09'),true);
  assert.strictEqual(S.withinRollWindow('2026-11-07','2026-11-09'),false);
  assert.strictEqual(S.withinRollWindow('2026-11-10','2026-11-09'),false);
});
test('same put side inside the window matches; a call buyback, an older close, and an existing roll do not',()=>{
  const open={id:'n',action:'CSP',entered:'2026-11-09',expiry:'2026-11-27',strike:125,shares:100,total:90,wheelId:'w',ticker:'EX'};
  const rows=[
    csp('a','2026-10-26',130),btc('b','2026-11-09',130),
    csp('a2','2026-10-01',120),btc('c','2026-11-07',120),
    csp('a3','2026-10-20',130),{...btc('d','2026-11-09',130),rollId:'old'},
    {id:'e',action:'STOC',entered:'2026-11-01',expiry:'2026-11-20',strike:140,shares:100,total:50,wheelId:'w',ticker:'EX'},
    {id:'f',action:'BTC',entered:'2026-11-09',strike:140,shares:100,total:20,wheelId:'w',ticker:'EX'}
  ];
  assert.strictEqual(S.rollMatch(rows,open).id,'b');
  assert.strictEqual(S.rollMatch(rows,{...open,action:'STOC'}).id,'f');
  assert.strictEqual(S.rollMatch(rows,{...open,entered:'2026-11-12'}),null);
});
test('linking does not change the sum of the two premiums',()=>{
  const b={total:40},s={total:90};
  assert.strictEqual(S.rollLegNet(b,s),50);
  assert.strictEqual(b.total+s.total,130);
});
test('LEAP: same-day bought-back short call matches; an already-linked one does not',()=>{
  const sto={id:'n',side:'short',type:'C',parentLeapId:'L',entryDate:'2026-11-09',strike:165,status:'open'};
  const closed={id:'c',side:'short',type:'C',parentLeapId:'L',status:'closed',closeDate:'2026-11-09',strike:170};
  assert.strictEqual(S.leapRollMatch([closed,sto],sto).id,'c');
  assert.strictEqual(S.leapRollMatch([closed,{...sto,rolledFrom:'c'},sto],sto),null);
});
test('prompt is Yes/No, and a two-leg confirmation defaults to Yes without saving a roll first',()=>{
  assert.ok(SRC.includes('>Mark as roll?</span>'));
  assert.ok(SRC.includes('id="mRoll-yes"')&&SRC.includes('>Yes</button>')&&SRC.includes('>No</button>'));
  const save=extractFn('confirmParsed');
  assert.match(save,/rollId:null/);
  assert.match(save,/yesDefault:true/);
  assert.match(save,/checkRollCandidate\(nt,wheelId\)/);
  assert.ok(!/inf_/.test(extractFn('withInferredRolls')));
});

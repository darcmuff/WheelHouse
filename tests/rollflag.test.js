const{appSrc}=require('./appsrc');
// Roll flag + pairing. A stored roll / rollId is the only signal; history is not guessed.
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('fs');const path=require('path');
const{extractFn}=require('./extract');

const SRC=appSrc();

const helpers=new Function([
  'let _n=0;function uid(){return "id"+(++_n);}',
  extractFn('parseRollFlag'),
  extractFn('tradeIsRoll'),
  extractFn('isRollCloser'),
  extractFn('isRollOpener'),
  extractFn('tradeRollDay'),
  extractFn('tradeRollStamp'),
  extractFn('sameRollStamp'),
  extractFn('isRollPair'),
  extractFn('findRollMate'),
  extractFn('autoLinkRollBatch'),
  extractFn('applyTradeRollFromForm'),
  extractFn('applyImportRoll'),
  extractFn('tradeRollMate'),
  'return {parseRollFlag,tradeIsRoll,isRollCloser,isRollOpener,sameRollStamp,isRollPair,findRollMate,autoLinkRollBatch,applyTradeRollFromForm,applyImportRoll,tradeRollMate};'
].join('\n'))();

const{parseRollFlag,tradeIsRoll,isRollPair,findRollMate,autoLinkRollBatch,applyTradeRollFromForm,applyImportRoll,tradeRollMate}=helpers;

test('parseRollFlag accepts true/yes/1/Y and rejects empty or false',()=>{
  for(const v of[true,1,'true','YES','1','y','Y','Roll',' roll '])assert.equal(parseRollFlag(v),true,String(v));
  for(const v of[false,0,'','no','false',null,undefined])assert.equal(parseRollFlag(v),false,String(v));
});

test('old trades without roll or rollId are not rolls',()=>{
  assert.equal(tradeIsRoll({ticker:'SOFI',action:'CSP'}),false);
  assert.equal(tradeIsRoll({roll:true}),true);
  assert.equal(tradeIsRoll({rollId:'x'}),true);
  assert.equal(tradeIsRoll({roll:false}),false);
});

test('isRollPair: complementary actions, same ticker, same day or same filledAt minute',()=>{
  const btc={ticker:'SOFI',action:'BTC',entered:'2026-11-26'};
  const csp={ticker:'SOFI',action:'CSP',entered:'2026-11-26'};
  assert.equal(isRollPair(btc,csp),true);
  assert.equal(isRollPair(csp,btc),true);
  assert.equal(isRollPair(btc,{...csp,ticker:'AAPL'}),false);
  assert.equal(isRollPair(btc,{...csp,entered:'2026-11-25'}),false);
  assert.equal(isRollPair(btc,{...btc,action:'STC'}),false);
  assert.equal(isRollPair({ticker:'X',action:'STC',entered:'2026-01-01'},{ticker:'X',action:'STOC',entered:'2026-01-01'}),true);
  assert.equal(isRollPair({ticker:'X',action:'BTC',entered:'2026-01-01'},{ticker:'X',action:'STO',entered:'2026-01-01'}),true);
  const a={ticker:'X',action:'BTC',entered:'2026-01-01',filledAt:'2026-01-01T14:30:01-05:00'};
  const b={ticker:'X',action:'CSP',entered:'2026-01-01',filledAt:'2026-01-01T14:30:55-05:00'};
  const c={ticker:'X',action:'CSP',entered:'2026-01-01',filledAt:'2026-01-01T14:31:00-05:00'};
  assert.equal(isRollPair(a,b),true);
  assert.equal(isRollPair(a,c),false);
});

test('autoLinkRollBatch links a pair only when entered together, not a silent history guess',()=>{
  const pair=[
    {id:'1',ticker:'SOFI',action:'BTC',entered:'2026-11-26'},
    {id:'2',ticker:'SOFI',action:'CSP',entered:'2026-11-26'}
  ];
  autoLinkRollBatch(pair.map(t=>({...t})));
  assert.equal(pair[0].roll,undefined);
  assert.equal(pair[0].rollId,undefined);
  const together=pair.map(t=>({...t}));
  autoLinkRollBatch(together,{enteredTogether:true,uid:()=>'RID1'});
  assert.equal(together[0].roll,true);
  assert.equal(together[1].roll,true);
  assert.equal(together[0].rollId,'RID1');
  assert.equal(together[1].rollId,'RID1');
});

test('autoLinkRollBatch shares one id when both rows are already flagged roll without an id',()=>{
  const rows=[
    {id:'1',ticker:'SOFI',action:'BTC',entered:'2026-11-26',roll:true},
    {id:'2',ticker:'SOFI',action:'CSP',entered:'2026-11-26',roll:true}
  ];
  autoLinkRollBatch(rows,{uid:()=>'IMP'});
  assert.equal(rows[0].rollId,'IMP');
  assert.equal(rows[1].rollId,'IMP');
});

test('autoLinkRollBatch honors a pre-set shared rollId and does not relink across ids',()=>{
  const rows=[
    {id:'1',ticker:'SOFI',action:'BTC',entered:'2026-11-26',rollId:'A'},
    {id:'2',ticker:'SOFI',action:'CSP',entered:'2026-11-26',rollId:'A'},
    {id:'3',ticker:'SOFI',action:'BTC',entered:'2026-11-26',rollId:'B'}
  ];
  autoLinkRollBatch(rows,{enteredTogether:true,uid:()=>'NEW'});
  assert.equal(rows[0].roll,true);
  assert.equal(rows[1].rollId,'A');
  assert.equal(rows[2].rollId,'B');
});

test('applyTradeRollFromForm ticks, links a same-day mate, and clears when unticked',()=>{
  const saved=[];
  const mate={id:'m',ticker:'AAPL',action:'BTC',entered:'2026-11-26'};
  const trade={id:'t',ticker:'AAPL',action:'CSP',entered:'2026-11-26'};
  const fn=new Function('uid','_saveTrade','findRollMate','trade',
    extractFn('applyTradeRollFromForm')+'\nreturn applyTradeRollFromForm(trade,true,[trade,mate]);'
  );
  // reuse helpers.find via the already-built apply, with a stubbed _saveTrade through a fresh eval
  const ctx=new Function([
    'let saved=[];',
    'function uid(){return "NEW1";}',
    'function _saveTrade(t){saved.push(t);}',
    extractFn('isRollCloser'),extractFn('isRollOpener'),extractFn('tradeRollDay'),extractFn('tradeRollStamp'),extractFn('sameRollStamp'),extractFn('isRollPair'),extractFn('findRollMate'),
    extractFn('applyTradeRollFromForm'),
    'const mate={id:"m",ticker:"AAPL",action:"BTC",entered:"2026-11-26"};',
    'const trade={id:"t",ticker:"AAPL",action:"CSP",entered:"2026-11-26"};',
    'applyTradeRollFromForm(trade,true,[trade,mate]);',
    'const cleared={id:"t",ticker:"AAPL",action:"CSP",entered:"2026-11-26",roll:true,rollId:"NEW1"};',
    'applyTradeRollFromForm(cleared,false,[cleared,mate]);',
    'return {trade,mate,saved,cleared};'
  ].join('\n'))();
  assert.equal(ctx.trade.roll,true);
  assert.equal(ctx.trade.rollId,'NEW1');
  assert.equal(ctx.mate.roll,true);
  assert.equal(ctx.mate.rollId,'NEW1');
  assert.equal(ctx.saved.length,1);
  assert.equal(ctx.cleared.roll,undefined);
  assert.equal(ctx.cleared.rollId,undefined);
});

test('applyImportRoll is backward compatible and copies explicit fields',()=>{
  const plain=applyImportRoll({id:'1',ticker:'X'},{comment:'hi'});
  assert.equal(plain.roll,undefined);
  assert.equal(plain.rollId,undefined);
  const flagged=applyImportRoll({id:'2'},{roll:'yes',rollId:'R1'});
  assert.equal(flagged.roll,true);
  assert.equal(flagged.rollId,'R1');
});

test('tradeRollChip is a plain non-interactive Roll label',()=>{
  const html=new Function([
    'function tradeIsRoll(t){return !!(t&&(t.roll===true||t.rollId));}',
    extractFn('tradeRollChip'),
    "return tradeRollChip({id:'a1',roll:true,rollId:'R'});"
  ].join('\n'))();
  assert.equal(html,'<span class="roll-chip">Roll</span>');
  assert.doesNotMatch(html,/<a\b|<button\b|href=|onclick=|goToRollMate|⟳/);
  const none=new Function([
    'function tradeIsRoll(t){return !!(t&&(t.roll===true||t.rollId));}',
    extractFn('tradeRollChip'),
    'return tradeRollChip({id:"z",action:"CSP"});'
  ].join('\n'))();
  assert.equal(none,'');
});

test('row render wires the chip; CSS is Urbanist, grey, 6px, not clickable',()=>{
  assert.match(extractFn('renderTradeRow'),/tradeRollChip/);
  assert.match(SRC,/\.roll-chip\{[^}]*border-radius:6px/);
  assert.match(SRC,/\.roll-chip\{[^}]*font-family:Urbanist/);
  assert.match(SRC,/\.roll-chip\{[^}]*color:var\(--text3\)/);
  assert.match(SRC,/\.roll-chip\{[^}]*background:var\(--bg3\)/);
  assert.match(SRC,/\.roll-chip\{[^}]*cursor:default/);
  assert.doesNotMatch(SRC,/\.roll-chip:hover|\.roll-chip:focus/);
  assert.ok(!SRC.includes('function goToRollMate'));
  assert.ok(!SRC.includes('⟳ Roll'));
});

test('Roll form tick is a compact left-aligned checkbox, not a full-width input',()=>{
  assert.match(SRC,/id="tf-roll"/);
  assert.match(SRC,/id="pm-roll"/);
  assert.match(SRC,/class="roll-hint">links the close and new open/);
  assert.match(SRC,/\.roll-tick input\[type=checkbox\]\{[^}]*width:18px/);
  assert.match(SRC,/\.roll-tick input\[type=checkbox\]\{[^}]*accent-color:var\(--brand-orange\)/);
  assert.match(SRC,/\.roll-tick input\[type=checkbox\]\{[^}]*border:none!important/);
  assert.match(SRC,/\.fld input:not\(\[type=checkbox\]\)/);
  assert.equal((SRC.match(/\.fld input,/g)||[]).length,0);
});

test('ledger P&L walk is untouched and old roll controls stay gone',()=>{
  const ledger=fs.readFileSync(path.join(__dirname,'..','app','ledger.js'),'utf8');
  assert.match(ledger,/nk = o => !\(t\.rollId && o\.rollId === t\.rollId\)/);
  assert.ok(!SRC.includes('function checkRollCandidate'));
  assert.ok(!SRC.includes('function openRollPrompt'));
});

test('CSV parser reads Roll / Roll ID aliases and leaves unflagged rows alone',()=>{
  const {extractConst}=require('./extract');
  const L=new Function([
    extractConst('MON_PAT'),extractConst('MON_MAP'),extractConst('CREDITS'),
    extractConst('ACTION_MAP'),extractConst('VALID_ACTIONS'),
    extractFn('isCredit'),extractFn('computeTotal'),extractFn('parseCSVLine'),extractFn('normDate'),
    extractFn('brokerCSVLib')
  ].join('\n')+'\nreturn brokerCSVLib();')();
  const csv='Ticker,Action,Entered,Expiry,Strike,Premium,Fees,Shares,Total,Days,Verified,Comment,Roll,Roll ID,Status\nSOFI,BTC,2026-11-26,2026-11-28,17,0.05,1,100,-6,2,no,c,Yes,roll-9,closed\nSOFI,CSP,2026-11-26,2026-12-18,16,0.40,1.3,100,38.7,22,no,o,true,roll-9,active\nSOFI,IN,2026-10-01,,,10,1,100,1001,0,no,stock,,,\n';
  const parsed=L.parseBrokerCSV(csv);
  assert.equal(parsed.broker,'CoveredWheel');
  assert.equal(parsed.rows[0].roll,true);
  assert.equal(parsed.rows[0].rollId,'roll-9');
  assert.equal(parsed.rows[1].roll,true);
  assert.equal(parsed.rows[2].roll,undefined);
  const alt=L.parseBrokerCSV('Ticker,Action,Entered,Expiry,Strike,Premium,Fees,Shares,Total,Days,Verified,Comment,roll,roll_id\nSOFI,STC,2026-11-01,2026-11-20,20,0.1,1,100,11,0,no,x,1,RIDZ\n');
  assert.equal(alt.rows[0].roll,true);
  assert.equal(alt.rows[0].rollId,'RIDZ');
});

const{appSrc}=require('./appsrc');
// Roll picker math + open-roll row display. Figures are Marc's (t1194u).
const test=require('node:test');
const assert=require('node:assert');
const fs=require('fs');
const path=require('path');
const{extractFn,extractConst}=require('./extract');

const SRC=appSrc();

const stubs=`
function fmtMoney(n){if(n==null||isNaN(n))return'—';const abs=Math.abs(n).toFixed(2).replace(/\\B(?=(\\d{3})+(?!\\d))/g,',');return(n<0?'-$':'$')+abs;}
function fmt2(n,dp=2){return n!=null&&!isNaN(n)?parseFloat(n).toFixed(dp):'—';}
function esc(s){return String(s??'');}
function isSameMarkDay(){return false;}
`;

const selCode=[extractConst('CREDITS')].concat(['isCredit','selCash','selCt','selSummary','selHeadline','selContractLine','rollChainStatus'].map(extractFn)).join('\n');
const S=new Function(stubs+selCode+'\nreturn{selCash,selCt,selSummary,selHeadline,selContractLine,rollChainStatus,isCredit};')();

const money=n=>(n<0?'-':'+')+'$'+Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');

// Opening CSP $133 × 4, then the roll close + new open.
const OPEN={id:'o1',action:'CSP',entered:'2026-11-20',expiry:'2026-12-18',strike:133,shares:400,premium:1.19,total:473.84,fees:2.16,ticker:'XYZ'};
const BTC={id:'c1',action:'BTC',entered:'2026-11-24',expiry:'2026-12-18',strike:133,shares:400,premium:6.71,total:2686.16,fees:2.16,rollId:'r1',ticker:'XYZ'};
const CSP2={id:'o2',action:'CSP',entered:'2026-11-24',expiry:'2026-12-18',strike:130,shares:400,premium:7.21,total:2881.84,fees:2.16,rollId:'r1',ticker:'XYZ'};
const MARK=7.08;
const ROLL_ITEMS=[
  {cash:S.selCash('BTC',BTC.total),date:BTC.entered,tk:'XYZ',fee:BTC.fees,ct:S.selCt('BTC',BTC.shares),act:'BTC',strike:BTC.strike},
  {cash:S.selCash('CSP',CSP2.total),date:CSP2.entered,tk:'XYZ',fee:CSP2.fees,ct:S.selCt('CSP',CSP2.shares),act:'CSP',strike:CSP2.strike}
];

test('roll cashflow, contracts, per-contract and fees use the rolled size — not 8',()=>{
  const s=S.selSummary(ROLL_ITEMS);
  assert.strictEqual(s.net,195.68);
  assert.strictEqual(s.fees,4.32);
  assert.strictEqual(s.closedContracts,4);
  assert.strictEqual(s.openedContracts,4);
  assert.strictEqual(s.contracts,4);
  assert.notStrictEqual(s.contracts,8);
  assert.strictEqual(s.per,48.92);
  assert.strictEqual(s.isRoll,true);
  assert.strictEqual(S.selContractLine(s,money),'4 contracts · +$48.92 each');
});

test('mismatched roll 4 closed → 6 opened does not sum to 10 and omits per-contract',()=>{
  const items=[
    {...ROLL_ITEMS[0]},
    {...ROLL_ITEMS[1],ct:6,cash:S.selCash('CSP',2881.84)}
  ];
  const s=S.selSummary(items);
  assert.strictEqual(s.closedContracts,4);
  assert.strictEqual(s.openedContracts,6);
  assert.notStrictEqual(s.contracts,10);
  assert.strictEqual(s.per,null);
  assert.strictEqual(S.selContractLine(s,money),'4 closed → 6 opened');
  assert.ok(!String(S.selContractLine(s,money)).includes('each'));
});

test('same-direction legs still sum contracts',()=>{
  const s=S.selSummary([
    {cash:100,fee:0.04,ct:2,act:'CSP',date:'2026-11-01',tk:'A'},
    {cash:80,fee:0.04,ct:2,act:'CSP',date:'2026-11-02',tk:'A'}
  ]);
  assert.strictEqual(s.isRoll,false);
  assert.strictEqual(s.contracts,4);
  assert.strictEqual(s.per,45);
});

test('roll popover headline is cashflow, styled neutral — not victory green',()=>{
  const credit=S.selHeadline(S.selSummary(ROLL_ITEMS));
  assert.strictEqual(credit.kind,'Roll cashflow (net credit)');
  assert.strictEqual(credit.netClass,'sel-net-neutral');
  assert.ok(!/\b[gr]\b/.test(credit.netClass));
  assert.ok(!/\b[gr]\b/.test(credit.kindClass||''));
  const debit=S.selHeadline({isRoll:true,net:-20});
  assert.strictEqual(debit.kind,'Roll cashflow (net debit)');
  assert.strictEqual(debit.netClass,'sel-net-neutral');
  const plain=S.selHeadline({isRoll:false,net:80});
  assert.strictEqual(plain.kind,'Net credit');
  assert.strictEqual(plain.netClass,'g');
});

test('full 3-leg chain selection is 4 contracts · +$167.38 each, never 4 closed → 8 opened, and the headline is Chain cashflow',()=>{
  const items=[
    {cash:S.selCash('CSP',OPEN.total),date:'2026-11-19',tk:'SPCX',fee:OPEN.fees,ct:S.selCt('CSP',OPEN.shares),act:'CSP',strike:OPEN.strike},
    {cash:S.selCash('BTC',BTC.total),date:'2026-11-24',tk:'SPCX',fee:BTC.fees,ct:S.selCt('BTC',BTC.shares),act:'BTC',strike:BTC.strike},
    {cash:S.selCash('CSP',CSP2.total),date:'2026-11-24',tk:'SPCX',fee:CSP2.fees,ct:S.selCt('CSP',CSP2.shares),act:'CSP',strike:CSP2.strike}
  ];
  const s=S.selSummary(items);
  assert.strictEqual(s.net,669.52);
  assert.strictEqual(s.fees,6.48);
  assert.strictEqual(s.contracts,4);
  assert.notStrictEqual(s.contracts,8);
  assert.strictEqual(s.per,167.38);
  assert.strictEqual(s.isRoll,true);
  assert.strictEqual(s.isChain,true);
  assert.strictEqual(S.selContractLine(s,money),'4 contracts · +$167.38 each');
  assert.ok(!String(S.selContractLine(s,money)).includes('closed →'));
  const head=S.selHeadline(s);
  assert.strictEqual(head.kind,'Chain cashflow (net credit)');
  assert.strictEqual(head.netClass,'sel-net-neutral');
  // Roll-only selection (close + new open) keeps the Roll cashflow label
  const rollOnly=S.selHeadline(S.selSummary(ROLL_ITEMS));
  assert.strictEqual(rollOnly.kind,'Roll cashflow (net credit)');
  // A genuine size-up on the roll itself is still 4 closed → 6 opened
  const sized=S.selSummary([
    items[0],
    items[1],
    {...items[2],ct:6}
  ]);
  assert.strictEqual(S.selContractLine(sized,money),'4 closed → 6 opened');
  assert.strictEqual(sized.per,null);
  assert.notStrictEqual(sized.contracts,10);
});

test('honest chain status: open P&L, chain now, expiry max, assigned basis',()=>{
  const st=S.rollChainStatus([OPEN,BTC,CSP2],CSP2,MARK);
  assert.strictEqual(st.openPnl,49.84);
  assert.strictEqual(st.chainNow,-2162.48);
  assert.strictEqual(st.expiryMax,669.52);
  assert.strictEqual(st.assignedBasis,128.33);
  const noMark=S.rollChainStatus([OPEN,BTC,CSP2],CSP2,null);
  assert.strictEqual(noMark.openPnl,null);
  assert.strictEqual(noMark.chainNow,null);
  assert.strictEqual(noMark.expiryMax,669.52);
  assert.strictEqual(noMark.assignedBasis,128.33);
});

const listFns=['isCredit','walkLegPairs','normWheelShortStcClosers','strikeStep','nearStrike','exactSubset','withInferredRolls','buildRollChain','wheelCurrentValue','wheelCurrentProfit','wheelChainProfit','wheelLegOcc','toStrike','openCapturedHtml','capturedCellHtml','ppdCellHtml','closedCapturedHtml','wheelCloseSlices','wheelListCells'];
const listCode=[extractConst('CREDITS'),extractConst('_effRollCache')].concat(listFns.map(extractFn)).join('\n');
const L=new Function(stubs+listCode+'\nreturn{wheelListCells,wheelLegOcc,wheelCurrentProfit,wheelCurrentValue,wheelChainProfit,buildRollChain,openCapturedHtml};')();

test('open roll row: own P&L with % and mark, labeled chain line, PPD is a dash',()=>{
  const occ=L.wheelLegOcc('XYZ',CSP2);
  const ctx={
    ticker:'XYZ',spot:125,today:'2026-11-26',
    marks:{[occ]:MARK},
    trades:[OPEN,BTC,CSP2],
    openIds:new Set(['o2']),
    outcomes:{}
  };
  const cells=L.wheelListCells(CSP2,ctx);
  assert.strictEqual(cells.ppd,'—');
  assert.ok(cells.cap.includes('2%'),cells.cap);
  assert.ok(cells.cap.includes('+$49.84'),cells.cap);
  assert.ok(cells.cap.includes('at $7.08'),cells.cap);
  assert.ok(cells.cap.includes('Chain')&&cells.cap.includes('-$2,162.48'),cells.cap);
  // open P&L and chain figure must not be stacked unlabeled
  assert.ok(cells.cap.includes('2%')&&cells.cap.includes('+$49.84')&&cells.cap.includes('at $7.08'),cells.cap);
  // % follows the open-leg P&L sign (green), not a red cell colour; only Chain stays red
  assert.ok(/<span class="g">2%<\/span>/.test(cells.cap),cells.cap);
  assert.ok(/<span class="g">\+\$49\.84<\/span>/.test(cells.cap),cells.cap);
  assert.ok(/Chain <span class="r">-\$2,162\.48<\/span>/.test(cells.cap),cells.cap);
  const down=L.openCapturedHtml(-50,-350.16,2.61,null);
  assert.ok(/<span class="r">-50%<\/span>/.test(down.html),down.html);
  assert.ok(/<span class="r">-\$350\.16<\/span>/.test(down.html),down.html);
  assert.ok(!down.html.includes('Chain'),down.html);
});

test('picker markup keeps roll cashflow framing and status labels',()=>{
  assert.match(SRC,/Roll cashflow/);
  assert.match(SRC,/Chain cashflow/);
  assert.match(SRC,/\(net credit\)/);
  assert.match(SRC,/\(net debit\)/);
  assert.match(SRC,/sel-net-neutral/);
  assert.doesNotMatch(SRC,/Chain P&L now/);
  assert.match(SRC,/If expired worthless/);
  assert.match(SRC,/If assigned/);
  assert.match(SRC,/closed → /);
});

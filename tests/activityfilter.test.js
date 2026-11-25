const test=require('node:test'),assert=require('node:assert');
const {load}=require('./extract');
const F=load([
  {kind:'const',name:'CREDITS'},
  {kind:'fn',name:'isCredit'},
  {kind:'fn',name:'selCash'},
  {kind:'fn',name:'walkLegPairs'},
  {kind:'fn',name:'actKind'},
  {kind:'fn',name:'actAnnotate'},
  {kind:'fn',name:'actPnl'},
  {kind:'fn',name:'shareRealisations'},
  {kind:'fn',name:'wheelCloseSlices'},
  {kind:'fn',name:'openOptionLegs'},
  {kind:'fn',name:'actHeldValue'},
  {kind:'fn',name:'actMoneyPlain'},
  {kind:'fn',name:'actAndList'},
  {kind:'fn',name:'actReturnNote'}
]);
const put={id:'p',action:'CSP',strike:15,expiry:'2026-11-20',entered:'2026-10-01',shares:100,total:100,fees:1};
const buy={id:'b',action:'BTC',strike:15,expiry:'2026-11-20',entered:'2026-10-20',shares:100,total:40,fees:1};
const call={id:'c',action:'STOC',strike:20,expiry:'2026-12-18',entered:'2026-10-02',shares:100,total:80,fees:0.5};
const stock={id:'s',action:'IN',entered:'2026-10-20',shares:100,total:1500,fees:0};
const leap={id:'L:o',opt:true,side:'long',type:'C',action:'BTO',total:4000,fees:1};
const short={id:'S:o',opt:true,side:'short',type:'C',action:'STO',total:200,fees:0.65};

test('puts, the buy-back of a put, covered calls, LEAPs, and share buys each get a type',()=>{
  const rows=F.actAnnotate([put,buy,call,stock,leap,short]);
  const kind=id=>rows.find(r=>r.id===id).kind;
  assert.strictEqual(kind('p'),'csp');
  assert.strictEqual(kind('b'),'csp');
  assert.strictEqual(kind('c'),'cc');
  assert.strictEqual(kind('L:o'),'leap');
  assert.strictEqual(kind('S:o'),'cc');
  assert.strictEqual(kind('s'),'other');
});
test('P&L is the select-card cash sum, fees already inside each total',()=>{
  const rows=F.actAnnotate([put,buy,leap]);
  const pnl=F.actPnl(rows);
  assert.strictEqual(pnl.net, F.selCash('CSP',100)+F.selCash('BTC',40)+F.selCash('BTO',4000));
  assert.strictEqual(pnl.fees, 1+1+1);
  assert.strictEqual(pnl.by.csp, 60);
  assert.strictEqual(pnl.n.leap, 1);
});
test('total return adds share value once and a priced open LEAP, and does not recount premium',()=>{
  const rows=F.actAnnotate([
    put,
    {id:'in',wheelId:'w',ticker:'GX',action:'IN',entered:'2026-10-20',shares:100,total:5000,fees:0},
    {id:'L:o',opt:true,legId:'L',side:'long',type:'C',action:'BTO',total:2001,fees:1}
  ]);
  const cash=F.actPnl(rows).net;
  assert.strictEqual(cash, 100-5000-2001);
  const held=F.actHeldValue(rows, tk=>tk==='GX'?80:null, [{id:'L',status:'open',side:'long',type:'C',qty:1,mark:26}]);
  assert.strictEqual(held.shares, 8000);
  assert.strictEqual(held.leaps, 2600);
  assert.strictEqual(Math.round((cash+held.shares+held.leaps)*100)/100, 3699);
  const cspOnly=rows.filter(t=>t.kind==='csp');
  const only=F.actHeldValue(cspOnly, ()=>80, []);
  assert.strictEqual(only.shares, 0);
  assert.strictEqual(F.actPnl(cspOnly).net+only.shares, 100);
});

test('a live mark on an open short, any source, comes off total return',()=>{
  const rows=F.actAnnotate([
    put,
    {id:'L:o',opt:true,legId:'L',side:'long',type:'C',action:'BTO',total:2001,fees:1},
    {id:'S:o',opt:true,legId:'S',side:'short',type:'C',action:'STO',total:200,fees:0.65}
  ]);
  const legs=[
    {id:'L',status:'open',side:'long',type:'C',qty:1,mark:26,underlying:'GX'},
    {id:'S',status:'open',side:'short',type:'C',qty:1,mark:1.13,markSrc:'cboe',underlying:'GX'}
  ];
  const held=F.actHeldValue(rows,()=>null,legs);
  assert.strictEqual(held.leaps,2600);
  assert.strictEqual(held.closeCost,113);
  assert.strictEqual(held.unpriced.length,0);
  const cash=F.actPnl(rows).net;
  assert.strictEqual(Math.round((cash+held.shares+held.leaps-held.closeCost)*100)/100, cash+2600-113);
});

test('wheel shorts use a live mark, else the typed currentPrice, and skip a short with no price',()=>{
  const openPut={id:'p2',ticker:'SOFI',action:'CSP',strike:15,expiry:'2027-01-15',entered:'2026-11-01',shares:100,total:34,fees:0.5};
  const openCall={id:'c2',ticker:'AMD',action:'STOC',strike:165,expiry:'2027-01-15',entered:'2026-11-01',shares:100,total:80,fees:0.5,currentPrice:1.2};
  const bare={id:'k2',ticker:'KO',action:'CSP',strike:68,expiry:'2027-01-15',entered:'2026-11-01',shares:100,total:80,fees:0.5};
  const stale={id:'old',ticker:'SOFI',action:'CSP',strike:14,expiry:'2026-01-15',entered:'2025-12-01',shares:100,total:20,fees:0.5,currentPrice:2};
  const rows=F.actAnnotate([openPut,openCall,bare,stale]);
  const held=F.actHeldValue(rows,()=>null,[],t=>t.id==='p2'?0.4:null);
  assert.strictEqual(held.closeCost,40+120); // 0.40×100 live + 1.20×100 typed
  assert.deepStrictEqual(held.shortParts.map(p=>({ticker:p.ticker,type:p.type,value:p.value})).sort((a,b)=>a.ticker.localeCompare(b.ticker)),[
    {ticker:'AMD',type:'C',value:120},
    {ticker:'SOFI',type:'P',value:40}
  ]);
  assert.deepStrictEqual(held.unpriced,[{ticker:'KO',type:'P'}]);
});

test('filtering Activity to SOFI excludes open TSLA PMCC shorts from held value',()=>{
  const sofiPut={id:'p',ticker:'SOFI',action:'CSP',strike:15,expiry:'2027-01-15',entered:'2026-11-01',shares:100,total:34,fees:0.5};
  const rows=F.actAnnotate([sofiPut]);
  const legs=[
    {id:'S-sofi',status:'open',side:'short',type:'C',qty:1,mark:0.5,underlying:'SOFI'},
    {id:'S-tsla',status:'open',side:'short',type:'C',qty:1,mark:2.5,underlying:'TSLA'},
  ];
  const allRows=F.actAnnotate([
    sofiPut,
    {id:'S:o',opt:true,legId:'S-sofi',side:'short',type:'C',action:'STO',total:50,fees:0.5,ticker:'SOFI'},
    {id:'T:o',opt:true,legId:'S-tsla',side:'short',type:'C',action:'STO',total:200,fees:0.65,ticker:'TSLA'},
  ]);
  const heldAll=F.actHeldValue(allRows,()=>null,legs,()=>0.4);
  assert.strictEqual(heldAll.closeCost,40+50+250);
  const heldSofi=F.actHeldValue(rows,()=>null,legs,()=>0.4);
  assert.strictEqual(heldSofi.closeCost,40);
  assert.deepStrictEqual(heldSofi.shortParts.map(p=>({ticker:p.ticker,value:p.value})),[{ticker:'SOFI',value:40}]);
});

test('the return note is one general sentence, with plain-English caveats when quotes are missing',()=>{
  assert.strictEqual(F.actReturnNote({shareParts:[],leapParts:[],shortParts:[],unpriced:[]}),
    'Nothing open, so total return equals net cash flow.');
  const G="Total return adds shares and LEAPs you still hold at today's value, and takes off what it would cost to buy back options you've sold.";
  assert.strictEqual(F.actReturnNote({leapParts:[{ticker:'SPCX',value:15300}],shortParts:[{ticker:'SPCX',type:'C',value:339}],shareParts:[],unpriced:[],atCost:[],leapPlain:0}),G);
  assert.strictEqual(F.actReturnNote({shareParts:[{ticker:'PEP',value:14520}],leapParts:[],shortParts:[],unpriced:[],atCost:[],leapPlain:0}),G);
  const unpricedShort=G+' unpriced short options excluded from buy-back cost.';
  assert.strictEqual(F.actReturnNote({shareParts:[],leapParts:[],shortParts:[],unpriced:[{ticker:'SOFI',type:'P'}],atCost:[],leapPlain:0}),unpricedShort);
  const atCost=G+' shares valued at cost for PEP.';
  assert.strictEqual(F.actReturnNote({shareParts:[{ticker:'PEP',value:14520}],leapParts:[],shortParts:[],unpriced:[],atCost:['PEP'],leapPlain:0}),atCost);
  const leapPlain=G+' One LEAP is unmarked and excluded from market value.';
  assert.strictEqual(F.actReturnNote({shareParts:[],leapParts:[{ticker:'GX',value:0}],shortParts:[],unpriced:[],atCost:[],leapPlain:1}),leapPlain);
  assert.ok(!/SPCX|SOFI|\$/.test(unpricedShort));
});

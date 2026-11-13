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
  {kind:'fn',name:'actHeldValue'}
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

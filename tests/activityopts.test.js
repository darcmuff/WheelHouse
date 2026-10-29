const test=require('node:test'),assert=require('node:assert');const{load}=require('./extract');
const{pmccFormLeg,optLegLogRows}=load([{kind:'fn',name:'pmccFormLeg'},{kind:'fn',name:'pmccBuyBack'},{kind:'fn',name:'optLegLogRows'}]);
test('PMCC STO + BTC and the LEAP show in Activity rows',()=>{
  const leap={id:'L',groupId:'L',underlying:'EXAMPLE',type:'C',side:'long',strike:150,expiry:'2027-12-17',qty:3,entryPrice:40,entryDate:'2026-09-01',fees:1,status:'open'};
  const s=pmccFormLeg({strike:'170',expiry:'2026-11-20',qty:'3',price:'1.70',date:'2026-10-23',fees:'2',newId:'S'},leap).leg;
  const opts=[leap,s];
  opts[1]={...s,status:'closed',closePrice:0.54,closeDate:'2026-10-29',closeFees:2,closeTs:'2026-10-29T15:00:00Z'}; // shape pmccBuyBack/OPTS.closeLeg writes
  const rows=optLegLogRows(opts),a=rows.map(x=>x.action+'@'+x.entered).sort();
  assert.deepStrictEqual(a,['BTC@2026-10-29','BTO@2026-09-01','STO@2026-10-23']);
  assert.strictEqual(rows.find(x=>x.action==='STO').total,1.70*300-2);
});
test('expired leg shows an EXP row at $0 on its close date',()=>{
  const l={id:'E',underlying:'sofi',side:'short',strike:21,expiry:'2026-05-01',qty:4,entryPrice:0.62,entryDate:'2026-04-21',fees:2,status:'expired',closePrice:0,closeDate:'2026-05-01',closeFees:0};
  const rows=optLegLogRows([l,{...l,id:'D',demo:true}]);
  assert.strictEqual(rows.length,2);
  const x=rows.find(r=>r.action==='EXP');
  assert.ok(x);assert.strictEqual(x.entered,'2026-05-01');assert.strictEqual(x.total,0);assert.strictEqual(x.ticker,'SOFI');
});

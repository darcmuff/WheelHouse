// pmcctally.test.js — LEAP pmccStats (all time / this month per LEAP) vs Home "PMCC calls" (this month, all LEAPs).
// Realistic sample: calls sold since Sep; Home's November figure must equal the sum of the cards' November lines.
const test=require('node:test');const assert=require('node:assert');const{extractFn}=require('./extract');
const OPTS=new Function(extractFn('optionsLib')+'\nreturn optionsLib();')();
const T=new Function('OPTS',['pmccShortsFor','pmccStats','optsMonthly','monthlyExtraSources','homeFigures','calcMonthlyRealised'].map(extractFn).join('\n')+
  '\nconst realisedPremium=()=>({events:[]}),shareRealisations=()=>({events:[]});return {pmccStats,optsMonthly,monthlyExtraSources,homeFigures,calcMonthlyRealised};')(OPTS);
const today='2026-11-05';
const L={id:'L1',underlying:'SOFI',type:'C',side:'long',strike:15,expiry:'2028-01-21',entryDate:'2026-08-01',qty:2,entryPrice:9,status:'open'};
const L2={id:'L2',underlying:'HOOD',type:'C',side:'long',strike:60,expiry:'2028-01-21',entryDate:'2026-09-01',qty:1,entryPrice:30,status:'open'};
const s=(id,p,q,st,cp,cd,ex,par)=>({id,underlying:par==='L2'?'HOOD':'SOFI',type:'C',side:'short',strike:30,expiry:ex,entryDate:'2026-09-01',qty:q,entryPrice:p,status:st,closePrice:cp,closeDate:cd,parentLeapId:par||'L1'});
const legs=[L,L2,
  s('a',1.6,2,'expired',null,null,'2026-09-19'),      // Sep +320
  s('b',1.4,2,'closed',0.3,'2026-10-14','2026-10-17'), // Oct +220 (bought back)
  s('c',2.0,2,'closed',0.2,'2026-11-03','2026-11-21'), // Nov +360
  s('d',1.5,2,'closed',0.4,'2026-11-04','2026-11-28'), // Nov +220
  s('e',1.2,2,'open',null,null,'2026-12-19'),          // open: never counted
  s('h',2.0,1,'closed',2.5,'2026-11-02','2026-11-21','L2')]; // other LEAP, Nov −50 buyback loss
test('card all-time differs from Home month by design (scope), card shows its own month line',()=>{
  const P=T.pmccStats(L,legs,today);assert.strictEqual(P.net,1120);assert.strictEqual(P.month,580);});
test('Home PMCC calls this month = sum of every card\'s month line',()=>{
  const rows=T.calcMonthlyRealised([],T.monthlyExtraSources(legs),today);const F=T.homeFigures(rows,today);
  const sumCards=[L,L2].reduce((a,l)=>a+T.pmccStats(l,legs,today).month,0);
  assert.strictEqual(F.month.pmcc,530);assert.strictEqual(F.month.pmcc,sumCards);});
test('open calls excluded from both; year PMCC = sum of cards all-time',()=>{
  const rows=T.calcMonthlyRealised([],T.monthlyExtraSources(legs),today);const F=T.homeFigures(rows,today);
  assert.strictEqual(F.year.pmcc,[L,L2].reduce((a,l)=>a+T.pmccStats(l,legs,today).net,0));});
test('LEAP card header has Cost after calls only (Calls collected line dropped; Calls banked tile covers it)',()=>{const s=require('fs').readFileSync(require('path').join(__dirname,'../app/index.html'),'utf8');assert.ok(s.includes('<div class="lc-k">Cost after calls'));assert.ok(s.includes('<div class="lc-v lc-mut">${m0(P.adj)}${leapAdjMoveHtml(P.cost,P.adj)}</div></div>'));assert.ok(!s.includes('Calls collected ${P.net<0'));assert.ok(s.includes('Calls banked'));});

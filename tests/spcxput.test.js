// Reproduction (example numbers matching a 4-contract $130 put sold 26 Oct: 2 @ 1.81 + 2 @ 1.67, fees 2.16, mark 2.61).
const test=require('node:test');const assert=require('node:assert');const{extractFn,extractConst}=require('./extract');
const code=[extractConst('CREDITS')].concat(['isCredit','computeTotal','wheelListCells','capturedCellHtml','ppdCellHtml','wheelCurrentValue','wheelCurrentProfit','toStrike','wheelLegOcc'].map(extractFn)).join('\n');
const L=new Function('wheelChainProfit','fmt2','fmtMoney',code+'\nreturn{wheelListCells,computeTotal};')(()=>null,n=>(+n).toFixed(2),n=>(n<0?'-':'')+'$'+Math.abs(n).toFixed(2));
const t={id:'p',ticker:'SPCX',action:'CSP',entered:'2026-10-26',expiry:'2026-11-13',strike:130,premium:1.74,shares:400,fees:2.16};
t.total=L.computeTotal('CSP',t.premium,t.shares,t.fees);
const ctx={ticker:'SPCX',spot:137.8,today:'2026-10-30',marks:new Proxy({},{get:()=>2.61}),trades:[t],openIds:new Set(['p']),outcomes:{}};
test('total = 4 × 100 × $1.74 − $2.16 fees',()=>assert.strictEqual(t.total,693.84));
test('captured matches Robinhood: −50% / −$348 (premium in − cost to buy back now)',()=>assert.strictEqual(L.wheelListCells(t,ctx).cap,'-50% <span class="r">-$348.00</span>'));
test('PPD counts days since the sale date (4 days on 30 Oct)',()=>assert.ok(L.wheelListCells(t,ctx).ppd.startsWith('$173.46')));

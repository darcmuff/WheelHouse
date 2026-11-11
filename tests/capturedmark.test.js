// SPCX 13 Nov 2026 $130 put, 4 contracts, sold at $1.74 (the live card in the bug report).
// The mark must be this contract brought forward to the live stock, and Captured / Profit use that same mark.
const test=require('node:test');const assert=require('node:assert');const fs=require('fs');const path=require('path');
const{extractFn,extractConst}=require('./extract');
const code=[extractConst('CREDITS')].concat(['isCredit','computeTotal','wheelListCells','capturedCellHtml','ppdCellHtml','wheelCurrentValue','wheelCurrentProfit','toStrike','wheelLegOcc'].map(extractFn)).join('\n');
const L=new Function('wheelChainProfit','fmt2','fmtMoney','esc',code+'\nreturn{wheelListCells,wheelCurrentProfit,wheelCurrentValue,wheelLegOcc};')(()=>null,n=>(+n).toFixed(2),n=>(n<0?'-':'')+'$'+Math.abs(n).toFixed(2),s=>String(s));
const S=new Function(['adjMark','steadyMark'].map(extractFn).join('\n')+'\nreturn{steadyMark};')();
const t={id:'p',ticker:'SPCX',action:'CSP',entered:'2026-10-26',expiry:'2026-11-13',strike:130,premium:1.74,shares:400,fees:2.16};
const occ=L.wheelLegOcc('SPCX',t);
const cells=(marks,spot)=>L.wheelListCells(t,{ticker:'SPCX',spot,today:'2026-11-09',marks,trades:[t],openIds:new Set(['p']),outcomes:{}});
const q={bid:2.16,ask:2.2,delta:-0.2641,gamma:0.0256}; // Cboe 2026-11-09 14:48Z, spot 137
test('screenshot: Captured and the buy-back are the adjusted $1.32, not -$316 at $2.53',()=>{
  const mark=S.steadyMark(q,137,141.03,null,{strike:130,type:'P',regular:true}).mark;
  assert.strictEqual(mark,1.32);
  const opt={premium:1.74,contracts:4};
  const val=L.wheelCurrentValue(opt,mark);
  assert.strictEqual(val,528);
  assert.strictEqual(L.wheelCurrentProfit(opt,val),168);
  const cap=cells({[occ]:mark},141.03).cap;
  assert.ok(cap.includes('24%')&&cap.includes('<span class="g">+$168.00</span>')&&cap.includes('· at $1.32'),cap);
  assert.ok(cap.includes('at $1.32'),cap);
  assert.ok(!cap.includes('-$316')&&!cap.includes('$2.53'));
});
test('an explicit empty quote says no quote, and a mark that has not loaded yet stays blank',()=>{
  assert.ok(cells({[occ]:null},141.03).cap.includes('no quote'));
  assert.strictEqual(cells({},141.03).cap,'—');
});
test('card Profit uses the same words when the quote was rejected',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','app','index.html'),'utf8');
  assert.ok(src.includes('wl-cur"><span>Profit</span><b class="m">no quote</b>'));
  assert.ok(src.includes("c.markWhy==='none'"));
});

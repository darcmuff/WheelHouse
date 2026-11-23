// Captured must follow this contract's own quote. A delayed mid is brought up to the live stock.
// A tight two-sided market is preferred; a wide mid or a last trade is used rather than "no quote".
const test=require('node:test');const assert=require('node:assert');const{extractFn}=require('./extract');
const S=new Function(['adjMark','isRegularSession','steadyMark','markNote'].map(extractFn).join('\n')+'\nreturn{adjMark,isRegularSession,steadyMark,markNote};')();
const put135={bid:4.6,ask:4.7,last:4.63,delta:-0.4913,gamma:0.0351}; // real SPCX 6 Nov 135P, Cboe 2 Nov 11:08 GMT
const P={strike:135,type:'P'};
test('out of hours: mismatched spots are not turned into a made-up move',()=>{
  assert.strictEqual(S.adjMark(4.65,put135.delta,put135.gamma,138.42,134.72),6.71); // what a blind adjustment would invent
  assert.deepStrictEqual(S.steadyMark(put135,138.42,134.72,null,{...P,regular:false}),{mark:4.65,why:'mid'});
});
test('regular hours, normal move: adjusted with this quote\'s delta and gamma',()=>{
  const r=S.steadyMark(put135,136,135,null,{...P,regular:true});
  assert.strictEqual(r.why,'adjusted');assert.strictEqual(r.mark,5.16);
});
test('regular hours, a real 6% move is adjusted — it is not left on the old mid',()=>{
  assert.deepStrictEqual(S.steadyMark(put135,140,131.6,null,{...P,regular:true}),{mark:10.02,why:'adjusted'});
});
test('gamma that would push delta past -1 is dropped; the delta step still stands',()=>{
  // bid/ask $1.05, delta -0.9, gamma 0.2, stock 100 → 96.5. Gamma would drive delta to -1.6.
  const r=S.steadyMark({bid:1.0,ask:1.1,delta:-0.9,gamma:0.2},100,96.5,null,{strike:90,type:'P',regular:true});
  assert.strictEqual(r.mark,4.2);
});
test('a last trade is used when there is no two-sided bid/ask',()=>{
  const q={bid:0,ask:0,last:83.13,delta:-0.97,gamma:0.002};
  assert.deepStrictEqual(S.steadyMark(q,402.87,399.81,null,{strike:460,type:'P',regular:false}),{mark:83.13,why:'last'});
  assert.deepStrictEqual(S.steadyMark({bid:0,ask:0,last:0.5},400,0,null,{strike:420,type:'P'}),{mark:0.5,why:'last'});
});
test('a wide two-sided market uses the mid, not no-quote',()=>{
  // TSLA 21 Jan 2028 $840 call, Cboe 23 Nov 2026: bid 3.65 / ask 9.25 (87% spread).
  assert.deepStrictEqual(S.steadyMark({bid:3.65,ask:9.25,last:6.78},389.79,389.79,null,{strike:840,type:'C',regular:true}),{mark:6.45,why:'wide-mid'});
  // SPCX 15 Oct 2027 $220 call: bid 5.25 / ask 10.20 (64% spread).
  assert.deepStrictEqual(S.steadyMark({bid:5.25,ask:10.2,last:5.2},139.89,139.89,null,{strike:220,type:'C',regular:true}),{mark:7.73,why:'wide-mid'});
  // Older tight-filter reject: bid 0.50 / ask 3.00 still has a mid.
  assert.deepStrictEqual(S.steadyMark({bid:0.5,ask:3},100,100,null,{strike:95,type:'P'}),{mark:1.75,why:'wide-mid'});
});
test('no mid and no last is still no quote',()=>{
  assert.strictEqual(S.steadyMark({bid:0,ask:0,last:0},400,399.81,null,{strike:420,type:'P'}),null);
  assert.strictEqual(S.steadyMark({bid:0,ask:0.01},400,399,null,{strike:420,type:'P'}),null);
  assert.strictEqual(S.steadyMark(null,100,100,null,P),null);
});
test('a spot gap over 12% keeps the delayed mid unadjusted, not no-quote',()=>{
  // 13% rise: put stays OTM so the intrinsic floor does not hide the mid.
  assert.deepStrictEqual(S.steadyMark(put135,140,158.2,null,{...P,regular:true}),{mark:4.65,why:'mid'});
});
test('a greek with the wrong sign is not applied — the delayed mid is kept',()=>{
  // 2.9% spot move, put quote with a call-like delta: do not adjust, but still show the mid.
  assert.deepStrictEqual(S.steadyMark({bid:2.16,ask:2.2,delta:0.74,gamma:0.02},137,141.03,null,{strike:130,type:'P',regular:true}),{mark:2.18,why:'mid'});
});
test('missing delta in regular hours still accepts a two-sided mid',()=>{
  assert.deepStrictEqual(S.steadyMark({bid:2.16,ask:2.2},137,141.03,null,{strike:130,type:'P',regular:true}),{mark:2.18,why:'mid'});
});
test('tiny wiggles do not move the shown price; real moves do',()=>{
  assert.deepStrictEqual(S.steadyMark({bid:4.6,ask:4.72},0,0,4.65,P),{mark:4.65,why:'held-small'});
  assert.strictEqual(S.steadyMark({bid:5.0,ask:5.1},0,0,4.65,P).mark,5.05);
});
test('a minute-by-minute jumpy feed keeps good mids and drops empty ones',()=>{
  const feed=[[4.6,4.7,0],[0,0,0],[4.61,4.71,0],[0.4,9,0],[4.59,4.69,0],[4.62,4.72,0]];let prev=null;const out=[];
  feed.forEach(([b,a,last])=>{const r=S.steadyMark({bid:b,ask:a,last},138.42,134.72,prev,{...P,regular:false});prev=r?r.mark:null;out.push(prev);});
  // [0,0] has no last → no quote. [0.4,9] is a wide mid 4.70, within held-small of 4.66.
  assert.deepStrictEqual(out,[4.65,null,4.66,4.66,4.66,4.66]);
});
test('hover notes name a wide mid or a last trade, and are not an error',()=>{
  const wide=S.markNote(6.45,'wide-mid','TSLA',392.56,{bid:3.65,ask:9.25,last:6.78});
  assert.match(wide,/Buy-back price \$6\.45/);
  assert.match(wide,/wide market, mid used/);
  assert.match(wide,/bid \$3\.65 \/ ask \$9\.25/);
  assert.doesNotMatch(wide,/no quote/i);
  const adj=S.markNote(6.72,'wide-adjusted','TSLA',392.56,{bid:3.65,ask:9.25,last:6.78});
  assert.match(adj,/wide market, mid used, adjusted to TSLA at \$392\.56/);
  const last=S.markNote(6.78,'last','TSLA',392.56,{bid:0,ask:0,last:6.78});
  assert.match(last,/last \$6\.78/);
  assert.match(last,/last trade/);
  assert.doesNotMatch(last,/no quote/i);
});
test('regular session: New York 9:30–16:00 weekdays only',()=>{
  assert.strictEqual(S.isRegularSession(new Date('2026-11-02T12:24:00Z')),false); // 07:24 ET
  assert.strictEqual(S.isRegularSession(new Date('2026-11-02T15:00:00Z')),true);
  assert.strictEqual(S.isRegularSession(new Date('2026-11-01T15:00:00Z')),false); // Sunday
});

// SPCX 13 Nov 2026 $130 put. Cboe delayed snapshot 2026-11-09 14:48Z: spot 137, bid 2.16 / ask 2.20,
// delta -0.2641, gamma 0.0256. Live stock in the screenshot: 141.03. The old gate left this near $2.53.
const spcx={bid:2.16,ask:2.2,delta:-0.2641,gamma:0.0256};
const spcxO={strike:130,type:'P',regular:true};
test('SPCX deep OTM put near expiry: delayed mid is brought down to the live stock',()=>{
  const r=S.steadyMark(spcx,137,141.03,null,spcxO);
  assert.deepStrictEqual(r,{mark:1.32,why:'adjusted'});
  assert.ok(r.mark<1.74,'buy-back must be under the $1.74 credit');
});
test('SPCX when the quote spot is already >4% behind: do not freeze the stale $2.53 mid',()=>{
  // bid 2.50 / ask 2.56 is a $2.53 mid, the figure the card was showing. Stock has since gone 135.50 → 141.03.
  const r=S.steadyMark({bid:2.5,ask:2.56,delta:-0.306,gamma:0.028},135.5,141.03,2.53,spcxO);
  assert.strictEqual(r.why,'adjusted');
  assert.strictEqual(r.mark,1.27);
  assert.ok(r.mark<1.74);
});
test('ITM put follows the stock and never prints below intrinsic',()=>{
  const up=S.steadyMark({bid:12.4,ask:12.6,delta:-0.75,gamma:0.02},150,155,null,{strike:160,type:'P',regular:true});
  assert.deepStrictEqual(up,{mark:9,why:'adjusted'});
  const floored=S.steadyMark({bid:4,ask:4.2,delta:-0.45,gamma:0.03},150,158,null,{strike:160,type:'P',regular:true});
  assert.strictEqual(floored.mark,2); // intrinsic at 158 is $2; the taylor step alone was $1.46
});
test('covered call rises with the stock instead of staying pinned to the delayed ask',()=>{
  const r=S.steadyMark({bid:3.1,ask:3.3,delta:0.48,gamma:0.025},155,159,null,{strike:160,type:'C',regular:true});
  assert.deepStrictEqual(r,{mark:5.32,why:'adjusted'});
});

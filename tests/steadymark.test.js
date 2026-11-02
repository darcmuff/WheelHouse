// Captured must not swing on bad inputs: out-of-hours spot mismatch, no bid/ask, wide spreads, big jumps, tiny wiggles.
const test=require('node:test');const assert=require('node:assert');const{extractFn}=require('./extract');
const S=new Function(['adjMark','isRegularSession','steadyMark'].map(extractFn).join('\n')+'\nreturn{adjMark,isRegularSession,steadyMark};')();
const put135={bid:4.6,ask:4.7,last:4.63,delta:-0.4913,gamma:0.0351}; // real SPCX 6 Nov 135P, Cboe 2 Nov 11:08 GMT
const P={strike:135,type:'P'};
test('out of hours: Cboe spot 138.42 vs Friday close 134.72 no longer adds ~$2 to the put',()=>{
  assert.strictEqual(S.adjMark(4.65,put135.delta,put135.gamma,138.42,134.72),6.71); // the old swing: +44%
  assert.deepStrictEqual(S.steadyMark(put135,138.42,134.72,null,{...P,regular:false}),{mark:4.65,why:'mid'});
});
test('regular hours, normal move: adjusted, within a band around the quote',()=>{
  const r=S.steadyMark(put135,136,135,null,{...P,regular:true});assert.strictEqual(r.why,'adjusted');assert.ok(r.mark>4.65&&r.mark<=4.7+0.7,r.mark);
});
test('regular hours, implausible 6% gap: no adjustment',()=>assert.strictEqual(S.steadyMark(put135,140,131.6,null,{...P,regular:true}).mark,4.65));
test('adjustment capped at the quote band even when greeks overshoot',()=>{
  const r=S.steadyMark({bid:1.0,ask:1.1,delta:-0.9,gamma:0.2},100,96.5,null,{strike:90,type:'P',regular:true});
  assert.ok(r.mark<=1.1+0.165+1e-9,r.mark);
});
test('zero bid/ask (TSLA out of hours): keep last good mark, not a stale last trade',()=>{
  const q={bid:0,ask:0,last:83.13,delta:-0.97,gamma:0.002};
  assert.deepStrictEqual(S.steadyMark(q,402.87,399.81,57.4,{strike:460,type:'P',regular:false}),{mark:57.4,why:'held'});
});
test('zero bid with no history: last trade, floored at intrinsic',()=>{
  assert.strictEqual(S.steadyMark({bid:0,ask:0,last:0.5},400,399.81,null,{strike:420,type:'P'}).mark,20.19);
});
test('absurd spread is ignored when a good mark exists',()=>assert.strictEqual(S.steadyMark({bid:0.5,ask:3},100,100,1.6,{strike:95,type:'P'}).why,'held'));
test('tiny wiggles do not move the shown price; real moves do',()=>{
  assert.deepStrictEqual(S.steadyMark({bid:4.6,ask:4.72},0,0,4.65,P),{mark:4.65,why:'held-small'});
  assert.strictEqual(S.steadyMark({bid:5.0,ask:5.1},0,0,4.65,P).mark,5.05);
});
test('a minute-by-minute jumpy feed gives a steady series',()=>{
  const feed=[[4.6,4.7],[0,0],[4.61,4.71],[0.4,9],[4.59,4.69],[4.62,4.72]];let prev=null;const out=[];
  feed.forEach(([b,a])=>{const r=S.steadyMark({bid:b,ask:a,last:7},138.42,134.72,prev,{...P,regular:false});prev=r.mark;out.push(r.mark);});
  assert.deepStrictEqual(out,[4.65,4.65,4.65,4.65,4.65,4.65]);
});
test('regular session: New York 9:30–16:00 weekdays only',()=>{
  assert.strictEqual(S.isRegularSession(new Date('2026-11-02T12:24:00Z')),false); // 07:24 ET
  assert.strictEqual(S.isRegularSession(new Date('2026-11-02T15:00:00Z')),true);
  assert.strictEqual(S.isRegularSession(new Date('2026-11-01T15:00:00Z')),false); // Sunday
});

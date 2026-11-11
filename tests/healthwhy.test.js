// Needs you rows say what is wrong, why, and how to fix it. A dismissal sticks until the issue itself changes.
const test=require('node:test');const assert=require('node:assert');const {extractFn}=require('./extract');
const S=new Function(['explainHealth','healthKey','_persistableLeg'].map(extractFn).join('\n')+'\nreturn {explainHealth,healthKey,_persistableLeg};')();
const OPTS=new Function(extractFn('optionsLib')+'\nreturn optionsLib();')();
test('each issue has a one-line why and how',()=>{
  const e=S.explainHealth('KO CSP entered 1 Nov 2026 has no strike — collateral and P&L maths break without it');
  assert.match(e.why,/strike was blank/);
  assert.match(e.how,/Edit/);
  assert.strictEqual(e.act,'edit');
  const leap=S.explainHealth('SPCX LEAP expired — close it');
  assert.match(leap.why,/expiry date has passed/);
  assert.strictEqual(leap.act,'close-leap');
});
test('dismiss key ignores the day count so tomorrow is the same issue',()=>{
  const a={tradeId:'t1',text:'KO CSP $68 entered 1 Aug 2026 expired 12d ago — never closed, assigned, or marked expired'};
  const b={tradeId:'t1',text:'KO CSP $68 entered 1 Aug 2026 expired 13d ago — never closed, assigned, or marked expired'};
  assert.strictEqual(S.healthKey(a),S.healthKey(b));
  assert.notStrictEqual(S.healthKey(a),S.healthKey({tradeId:'t2',text:a.text}));
});
test('a missing LEAP quote is not a Home issue',()=>{
  const h=OPTS.health([{id:'x',underlying:'SPCX',type:'C',side:'long',strike:150,expiry:'2027-12-17',qty:1,entryPrice:20,status:'open',mark:30,markAt:'2026-10-29',markSrc:'cboe'}],[],'2026-11-09');
  assert.ok(!h.some(i=>/stale/.test(i.text)));
});
test('a received quote is what gets stored',()=>{
  const o=S._persistableLeg({id:'a',mark:30.7,markSrc:'cboe',markAt:'2026-11-09',strike:150,markWhy:'mid',markNote:'note'});
  assert.strictEqual(o.mark,30.7);
  assert.strictEqual(o.markAt,'2026-11-09');
  assert.strictEqual(o.markWhy,undefined);
});

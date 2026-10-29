const test=require('node:test');const assert=require('node:assert');const fs=require('fs'),path=require('path');
const{extractFn}=require('./extract');const SRC=fs.readFileSync(path.join(__dirname,'..','app','index.html'),'utf8');
const listCut=new Function(extractFn('listCut')+'\nreturn listCut;')();
const N=(n,v)=>Array(n).fill(v);
test('10 or fewer: all rows',()=>assert.deepStrictEqual(listCut(8,N(8,null),N(8,false),10,false),[0,1,2,3,4,5,6,7]));
test('50 rows: newest 10 only',()=>assert.deepStrictEqual(listCut(50,N(50,null),N(50,false),10,false),[0,1,2,3,4,5,6,7,8,9]));
test('expanded: all 50',()=>assert.strictEqual(listCut(50,N(50,null),N(50,false),10,true).length,50));
test('open leg beyond the cut is still shown',()=>{const o=N(50,false);o[40]=true;assert.deepStrictEqual(listCut(50,N(50,null),o,10,false),[0,1,2,3,4,5,6,7,8,9,40]);});
test('roll chain never split',()=>{const c=N(50,null);c[9]='x';c[12]='x';c[30]='x';c[45]='y';const r=listCut(50,c,N(50,false),10,false);assert.ok(r.includes(12)&&r.includes(30)&&!r.includes(45));assert.strictEqual(r.length,12);});
test('both lists use the cut and button, no DOM for hidden rows',()=>{
  assert.ok(/listCut\(ev\.length/.test(SRC)&&/evS\.map\(e=>renderPmccListRow/.test(SRC));
  assert.ok(/listCut\(_ord\.length/.test(SRC)&&/_S\.map\(t=>renderTradeRow/.test(SRC));
  const b=extractFn('listMoreBtn');assert.ok(b.includes('Show all (${n})')&&b.includes('Show less'));
  assert.ok(!/listShowAll[^\n]*_saveUIState/.test(SRC));});

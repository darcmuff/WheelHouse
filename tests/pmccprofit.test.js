const test=require('node:test');const assert=require('node:assert');const{load}=require('./extract');
const{pmccShortProfit}=load([{kind:'fn',name:'pmccShortProfit'}]);
test('single short call: premium minus buyback',()=>{assert.strictEqual(pmccShortProfit({entryPrice:2.5,qty:2},1),300);});
test('chain: adds prior realised net',()=>{assert.strictEqual(pmccShortProfit({entryPrice:2,qty:1},3,-50),-150);});
test('no mark → null',()=>{assert.strictEqual(pmccShortProfit({entryPrice:2,qty:1},null,0),null);});

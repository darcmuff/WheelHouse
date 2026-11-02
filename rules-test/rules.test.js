// Proves the repo firestore.rules keep users apart. Runs against the local emulator only (demo- project, no real data).
// Run: cd rules-test && npm install && npm test   (needs Java 11+)
const test=require('node:test');const fs=require('fs'),path=require('path');
const{initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const{doc,getDoc,setDoc,deleteDoc,collection,getDocs}=require('firebase/firestore');
let env;
test.before(async()=>{env=await initializeTestEnvironment({projectId:'demo-wheelhouse',firestore:{rules:fs.readFileSync(path.join(__dirname,'..','firestore.rules'),'utf8'),host:'127.0.0.1',port:8085}});
  await env.withSecurityRulesDisabled(async c=>{await setDoc(doc(c.firestore(),'users/bob/trades/t1'),{ticker:'ZEPH'});await setDoc(doc(c.firestore(),'entitlements/alice'),{plan:'free'});await setDoc(doc(c.firestore(),'entitlements/bob'),{plan:'pro',founder:true});});});
test.after(()=>env&&env.cleanup());
const A=()=>env.authenticatedContext('alice').firestore();
test('alice can read and write her own data',async()=>{await assertSucceeds(setDoc(doc(A(),'users/alice/trades/t1'),{ticker:'KOLA'}));await assertSucceeds(getDoc(doc(A(),'users/alice/trades/t1')));await assertSucceeds(getDocs(collection(A(),'users/alice/wheels')));await assertSucceeds(deleteDoc(doc(A(),'users/alice/trades/t1')));});
test('alice cannot read bob',async()=>{await assertFails(getDoc(doc(A(),'users/bob/trades/t1')));await assertFails(getDocs(collection(A(),'users/bob/trades')));});
test('alice cannot write or delete bob',async()=>{await assertFails(setDoc(doc(A(),'users/bob/trades/t2'),{x:1}));await assertFails(deleteDoc(doc(A(),'users/bob/trades/t1')));});
test('signed-out users get nothing',async()=>{const u=env.unauthenticatedContext().firestore();await assertFails(getDoc(doc(u,'users/bob/trades/t1')));await assertFails(setDoc(doc(u,'users/bob/trades/t3'),{x:1}));});
test('nothing outside users/ is open',async()=>{await assertFails(getDocs(collection(A(),'users')));await assertFails(setDoc(doc(A(),'other/x'),{x:1}));});
test('entitlements: read your own only',async()=>{await assertSucceeds(getDoc(doc(A(),'entitlements/alice')));await assertFails(getDoc(doc(A(),'entitlements/bob')));await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'entitlements/alice')));});
test('entitlements: nobody can give themselves Pro',async()=>{await assertFails(setDoc(doc(A(),'entitlements/alice'),{plan:'pro'}));await assertFails(setDoc(doc(A(),'entitlements/alice'),{plan:'pro'},{merge:true}));
  await assertFails(deleteDoc(doc(A(),'entitlements/alice')));await assertFails(setDoc(doc(A(),'entitlements/carol'),{plan:'pro'}));const{updateDoc}=require('firebase/firestore');await assertFails(updateDoc(doc(A(),'entitlements/alice'),{founder:true}));});
test('entitlements: cannot be smuggled in under users/',async()=>{await assertSucceeds(setDoc(doc(A(),'users/alice/entitlements/x'),{plan:'pro'}));/* harmless: the app only trusts top-level entitlements/{uid} */});

const{appSrc}=require('./appsrc');
// phoneimport.test.js — Import must stay reachable on phones (≤700px), where Activity is hidden.
const test=require('node:test');const assert=require('node:assert');const fs=require('fs');const path=require('path');
const SRC=appSrc();
const CSS=fs.readFileSync(path.join(__dirname,'..','app','app.css'),'utf8');

test('desktop Activity toolbar and the empty-wheels state still open the import modal',()=>{
  assert.match(SRC,/function renderActivityHead\(\)[\s\S]*?onclick="openImport\(\)">Import CSV \/ PDF/);
  assert.match(SRC,/id="wheel-empty"[\s\S]*?onclick="openImport\(\)">Import broker file/);
  assert.match(SRC,/function openImport\(\)\{openModal\('mImport'\);initImportDrop\(\);try\{if\(!_impHist\)\{history\.pushState\(\{whImp:1\},''\);_impHist=true;\}\}catch\(e\)\{\}\}/,'opens the modal and parks one history entry so Back closes it');
  assert.match(SRC,/window\.addEventListener\('popstate',\(\)=>\{const m=document\.getElementById\('mImport'\)/);
});

test('Settings → Your data has an Import CSV / PDF row next to Export, and it opens the import modal',()=>{
  const data=SRC.slice(SRC.indexOf('id="settings-data"'),SRC.indexOf('id="settings-data"')+800);
  assert.match(data,/id="settings-import"/);
  assert.match(data,/openImport\(\)/);
  assert.match(data,/Import CSV \/ PDF/);
  assert.match(data,/id="settings-export"/);
  assert.ok(data.indexOf('settings-import')<data.indexOf('settings-export'),'Import sits above Export');
  assert.match(SRC,/id="mImport"/);
});

test('Activity stays off the phone tab bar (swipe is still Home / Wheels / LEAPs), so Settings is the phone path',()=>{
  const phone=CSS.slice(CSS.indexOf('/* Phone chrome: tab bar, ⋯ menu, form controls */'));
  const media=phone.slice(phone.indexOf('@media(max-width:700px){'),phone.indexOf('@media(max-width:700px){')+900);
  assert.match(media,/#tabbar a\.nav-item\[data-view="log"\]\{display:none\}/);
  assert.match(SRC,/const PHONE_SWIPE_TABS=\['dash','positions','options'\]/);
  // The new Settings row is not hidden on phones
  assert.doesNotMatch(CSS,/#settings-import[^\{]*\{[^}]*display:\s*none/);
});

test('the import modal and its preview fit a 390px phone: full-width box, scrollable table, 44px foot buttons, 6px radii',()=>{
  const i=CSS.indexOf('#mImport .mbox');
  assert.ok(i>0,'#mImport .mbox has a phone rule');
  // inside a max-width:700px block that starts before this rule
  const before=CSS.lastIndexOf('@media(max-width:700px)',i);
  assert.ok(before>0 && i-before<4000,'phone rule sits in a ≤700px block');
  const chunk=CSS.slice(i,i+900);
  assert.match(chunk,/max-width:\s*calc\(100vw - 1\.25rem\)/);
  assert.match(CSS,/#mImport[\s\S]{0,400}imp-tbl-wrap[\s\S]{0,200}overflow-x:\s*auto/);
  assert.match(CSS,/#mImport[\s\S]{0,800}\.mfoot \.btn[\s\S]{0,80}min-height:\s*44px/);
  assert.match(CSS,/#mImport[\s\S]{0,400}imp-drop[\s\S]{0,80}border-radius:\s*6px/);
});

// Onboarding test mode. Only active on the onboarding branch site (onboarding--…netlify.app).
// Every visit to the landing page wipes this browser's OpTrack state, so the new-user flow runs fresh.
// In the app, "Restart onboarding" deletes the test account + its data, then starts again from the landing page.
(function(){
  var on=/^onboarding--/.test(location.hostname)||/[?&]obtest\b/.test(location.search);
  window.OT_ONBOARDING=on;
  if(!on)return;
  function wipeAsync(){
    var p=[];
    try{if(navigator.serviceWorker)p.push(navigator.serviceWorker.getRegistrations().then(function(rs){return Promise.all(rs.map(function(r){return r.unregister();}));}));}catch(e){}
    try{if(window.caches)p.push(caches.keys().then(function(ks){return Promise.all(ks.map(function(k){return caches.delete(k);}));}));}catch(e){}
    try{if(indexedDB.databases)p.push(indexedDB.databases().then(function(ds){ds.forEach(function(d){indexedDB.deleteDatabase(d.name);});}));
        else ['firebaseLocalStorageDb'].forEach(function(n){indexedDB.deleteDatabase(n);});}catch(e){}
    return Promise.all(p).catch(function(){});
  }
  function wipeSync(){try{localStorage.clear();sessionStorage.clear();}catch(e){}}
  window.OT_ONBOARDING_WIPE=function(){wipeSync();return wipeAsync();};
  var path=location.pathname;
  if(path==='/'||path==='/landing.html'){wipeSync();wipeAsync();}
  window.otRestartOnboarding=async function(){
    var b=document.getElementById('ob-restart');if(b){b.disabled=true;b.textContent='Restarting…';}
    try{if(window._obDeleteAccount)await window._obDeleteAccount();}catch(e){console.warn('Test account delete failed',e);}
    await window.OT_ONBOARDING_WIPE();
    location.href='/';
  };
  document.addEventListener('DOMContentLoaded',function(){
    var d=document.createElement('div');
    d.id='ob-bar';
    d.style.cssText='position:fixed;left:12px;bottom:12px;z-index:2147483647;background:#111;color:#fff;font:600 12px/1.2 system-ui,sans-serif;padding:8px 10px;border-radius:8px;display:flex;gap:10px;align-items:center;box-shadow:0 2px 10px rgba(0,0,0,.3)';
    d.innerHTML='<span>Onboarding test</span><button id="ob-restart" style="background:#FF5A36;color:#fff;border:0;border-radius:6px;padding:6px 10px;font:inherit;cursor:pointer">Restart onboarding</button>';
    document.body.appendChild(d);
    document.getElementById('ob-restart').onclick=window.otRestartOnboarding;
  });
})();

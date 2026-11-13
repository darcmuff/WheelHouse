// Onboarding test mode. Only the onboarding branch site (onboarding--….netlify.app), or ?obtest=1.
// The landing page wipes this browser so the visit starts as a new user.
// Sign-up is simulated: no Firebase account, nothing is saved to a real account. Restart wipes it again.
(function(){
  var on=/^onboarding--/.test(location.hostname)||/[?&]obtest\b/.test(location.search);
  window.OT_ONBOARDING=on;
  if(!on)return;
  function wipeAsync(){
    var p=[];
    try{if(navigator.serviceWorker)p.push(navigator.serviceWorker.getRegistrations().then(function(rs){return Promise.all(rs.map(function(r){return r.unregister();}));}));}catch(e){}
    try{if(window.caches)p.push(caches.keys().then(function(ks){return Promise.all(ks.map(function(k){return caches.delete(k);}));}));}catch(e){}
    try{if(indexedDB.databases)p.push(indexedDB.databases().then(function(ds){ds.forEach(function(d){if(d&&d.name)indexedDB.deleteDatabase(d.name);});}));
        else ['firebaseLocalStorageDb'].forEach(function(n){indexedDB.deleteDatabase(n);});}catch(e){}
    return Promise.all(p).catch(function(){});
  }
  function wipeSync(){try{localStorage.clear();sessionStorage.clear();}catch(e){}}
  window.OT_ONBOARDING_WIPE=function(){wipeSync();return wipeAsync();};
  var path=location.pathname.replace(/\/+$/,'')||'/';
  if(path==='/'||path==='/landing.html'){wipeSync();wipeAsync();}
  try{localStorage.setItem('ot-sim','1');}catch(e){}
  if(path!=='/demo'){
    var KEY='ot-sim-data';
    window.OT_DEMO={active:true,sim:true,
      load:function(){try{var d=JSON.parse(localStorage.getItem(KEY));if(d&&Array.isArray(d.wheels))return{wheels:d.wheels,trades:d.trades||[],opts:d.opts||[]};}catch(e){}return{wheels:[],trades:[],opts:[]};},
      save:function(db){try{localStorage.setItem(KEY,JSON.stringify({wheels:db.wheels||[],trades:db.trades||[],opts:db.opts||[]}));}catch(e){}},
      signedIn:function(){try{return localStorage.getItem('ot-sim-user')==='1';}catch(e){return false;}},
      signIn:function(){try{localStorage.setItem('ot-sim-user','1');}catch(e){}},
      reset:function(){window.otRestartOnboarding();}};
  }
  window.otRestartOnboarding=async function(){
    var b=document.getElementById('ob-restart');if(b){b.disabled=true;b.textContent='Restarting…';}
    await window.OT_ONBOARDING_WIPE();
    location.href='/';
  };
  document.addEventListener('DOMContentLoaded',function(){
    if(document.getElementById('ob-bar'))return;
    var d=document.createElement('div');
    d.id='ob-bar';
    d.style.cssText='position:fixed;left:12px;bottom:12px;z-index:2147483647;background:#111;color:#fff;font:600 12px/1.2 system-ui,sans-serif;padding:8px 10px;border-radius:8px;display:flex;gap:10px;align-items:center;box-shadow:0 2px 10px rgba(0,0,0,.3)';
    d.innerHTML='<span>Onboarding test</span><button id="ob-restart" type="button" style="background:#FF5A36;color:#fff;border:0;border-radius:6px;padding:6px 10px;font:inherit;cursor:pointer">Restart onboarding</button>';
    document.body.appendChild(d);
    document.getElementById('ob-restart').onclick=window.otRestartOnboarding;
  });
})();

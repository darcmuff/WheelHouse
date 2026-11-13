// Activate a new service worker without a banner.
// A fresh open (no interaction yet, no modal or form) reloads once onto the new version.
// A session already in use waits for the next open, a navigation, or a return after
// 30 minutes hidden, and only when no modal or form is open.
(function(){
  if(!('serviceWorker' in navigator))return;
  var h=location.hostname;
  if(location.protocol!=='https:'&&h!=='localhost'&&h!=='127.0.0.1')return;
  var interacted=false,hiddenAt=0,pending=false,reloading=false;
  var hadCtrl=!!navigator.serviceWorker.controller;
  function mark(){interacted=true;}
  ['pointerdown','keydown','input'].forEach(function(ev){addEventListener(ev,mark,true);});
  function formOpen(){
    if(document.querySelector('.mb.open'))return true;
    var ob=document.getElementById('onboard-overlay');
    if(ob&&getComputedStyle(ob).display!=='none')return true;
    var ae=document.activeElement;
    if(ae&&/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)&&ae.form)return true;
    return false;
  }
  function versionOf(ctrl){
    return new Promise(function(resolve){
      if(!ctrl){resolve('');return;}
      var ch=new MessageChannel(),done=false;
      var t=setTimeout(function(){if(!done){done=true;resolve('');}},800);
      ch.port1.onmessage=function(e){if(done)return;done=true;clearTimeout(t);resolve(e.data&&e.data.cache||'');};
      try{ctrl.postMessage({type:'VERSION'},[ch.port2]);}catch(err){if(!done){done=true;clearTimeout(t);resolve('');}}
    });
  }
  function maybeReload(afterIdle){
    if(reloading)return;
    if(!afterIdle&&interacted){pending=true;return;}
    if(formOpen()){pending=true;return;}
    var ctrl=navigator.serviceWorker.controller;
    if(!ctrl)return;
    reloading=true;
    versionOf(ctrl).then(function(ver){
      ver=ver||'unknown';
      try{
        if(sessionStorage.getItem('ot-sw-reload')===ver){reloading=false;return;}
        sessionStorage.setItem('ot-sw-reload',ver);
      }catch(e){reloading=false;return;}
      location.reload();
    });
  }
  navigator.serviceWorker.addEventListener('controllerchange',function(){
    if(!hadCtrl){hadCtrl=true;return;}
    maybeReload(false);
  });
  document.addEventListener('visibilitychange',function(){
    if(document.hidden){hiddenAt=Date.now();return;}
    var away=hiddenAt&&Date.now()-hiddenAt>30*60*1000;
    hiddenAt=0;
    if(away&&pending)maybeReload(true);
  });
  function nudge(reg){
    var w=reg.waiting;
    if(!w)return;
    if(!interacted&&!formOpen())w.postMessage({type:'SKIP_WAITING'});
    else pending=true;
  }
  navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(function(reg){
    reg.update();
    nudge(reg);
    reg.addEventListener('updatefound',function(){
      var iw=reg.installing;if(!iw)return;
      iw.addEventListener('statechange',function(){
        if(iw.state==='installed')nudge(reg);
      });
    });
  }).catch(function(e){console.warn('SW register failed',e);});
})();

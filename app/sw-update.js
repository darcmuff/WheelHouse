// Activate a new service worker without a banner and without reloading.
// The new worker takes control silently; the next navigation or visit uses it.
(function(){
  if(!('serviceWorker' in navigator))return;
  var h=location.hostname;
  if(location.protocol!=='https:'&&h!=='localhost'&&h!=='127.0.0.1')return;
  navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(function(reg){
    reg.update();
    function nudge(){if(reg.waiting)reg.waiting.postMessage({type:'SKIP_WAITING'});}
    nudge();
    reg.addEventListener('updatefound',function(){
      var iw=reg.installing;if(!iw)return;
      iw.addEventListener('statechange',function(){if(iw.state==='installed')nudge();});
    });
  }).catch(function(e){console.warn('SW register failed',e);});
})();

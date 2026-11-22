// Stash beforeinstallprompt and reveal any [data-pwa-install] control.
// Never preventDefault (Chrome can still show its own install UI) and never a banner.
(function(){
  if(window.__otPwaInstall)return;
  window.__otPwaInstall=true;
  var ev=null;
  function standalone(){
    return (window.matchMedia&&(matchMedia('(display-mode: standalone)').matches||matchMedia('(display-mode: fullscreen)').matches||matchMedia('(display-mode: minimal-ui)').matches))||!!(navigator&&navigator.standalone);
  }
  function sync(){
    var show=!!ev&&!standalone();
    document.querySelectorAll('[data-pwa-install]').forEach(function(n){n.hidden=!show;});
  }
  window.addEventListener('beforeinstallprompt',function(e){ev=e;sync();});
  window.addEventListener('appinstalled',function(){ev=null;sync();});
  window.promptPwaInstall=function(){
    if(!ev)return;
    var e=ev;ev=null;
    try{e.prompt();}catch(err){}
    sync();
  };
})();

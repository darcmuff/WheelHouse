// Pure path cleaner for GoatCounter. The function body is inlined in each
// counting page's <head> before count.js loads; tests check they stay in sync.
// Strips twclid, fbclid and gclid; keeps utm_* and every other param.
function goatPath(p){
  p=String(p==null?'':p);
  var hash='',h=p.indexOf('#');
  if(h>=0){hash=p.slice(h);p=p.slice(0,h)}
  var q=p.indexOf('?');
  if(q<0)return p+hash;
  var path=p.slice(0,q),kept=[],parts=p.slice(q+1).split('&');
  for(var i=0;i<parts.length;i++){
    var pair=parts[i];if(!pair)continue;
    var key=pair.split('=')[0],dec=key;
    try{dec=decodeURIComponent(key.replace(/\+/g,' '))}catch(e){}
    dec=String(dec).toLowerCase();
    if(dec==='twclid'||dec==='fbclid'||dec==='gclid')continue;
    kept.push(pair);
  }
  return path+(kept.length?'?'+kept.join('&'):'')+hash;
}
if(typeof module!=='undefined'&&module.exports)module.exports={goatPath};

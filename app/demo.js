// OpTrack demo mode (/demo). Loaded first by index.html; does nothing anywhere else.
// In demo: no sign-in, no Firestore. Trades live in this browser only under the 'optrack-demo:' localStorage prefix,
// which can never mix with a real account. Prices are made up here, so no quote API is called.
(function(){
  var path=location.pathname.replace(/\/+$/,'');
  if(path!=='/demo')return;
  var PREFIX='optrack-demo:',DATA_KEY='data-v1';

  // 1. Separate storage: every localStorage key the app uses gets the demo prefix (UI prefs too).
  var S=Storage.prototype,gi=S.getItem,si=S.setItem,ri=S.removeItem;
  var isLS=function(o){try{return o===window.localStorage;}catch(e){return false;}};
  S.getItem=function(k){return gi.call(this,isLS(this)?PREFIX+k:k);};
  S.setItem=function(k,v){return si.call(this,isLS(this)?PREFIX+k:k,v);};
  S.removeItem=function(k){return ri.call(this,isLS(this)?PREFIX+k:k);};

  // 2. Made-up prices. Option prices from a simple Black-Scholes so marks, profit and greeks behave like the real thing.
  var SPOT={KO:69.80,AMD:158.40,SOFI:16.40,AAPL:238.20,MSFT:452.00,NVDA:176.50,PEP:145.20,INTC:24.80};
  var IV={KO:0.18,AMD:0.45,SOFI:0.55,AAPL:0.27,MSFT:0.25,NVDA:0.50,PEP:0.22,INTC:0.42};
  function N(x){var t=1/(1+0.2316419*Math.abs(x)),d=0.3989423*Math.exp(-x*x/2),p=d*t*(0.3193815+t*(-0.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));return x>0?1-p:p;}
  function bs(S0,K,T,v,call){var r=0.04;T=Math.max(T,1/365);var d1=(Math.log(S0/K)+(r+v*v/2)*T)/(v*Math.sqrt(T)),d2=d1-v*Math.sqrt(T);
    var price=call?S0*N(d1)-K*Math.exp(-r*T)*N(d2):K*Math.exp(-r*T)*N(-d2)-S0*N(-d1);
    var pdf=Math.exp(-d1*d1/2)/Math.sqrt(2*Math.PI);
    return{price:Math.max(0.01,price),delta:call?N(d1):N(d1)-1,gamma:pdf/(S0*v*Math.sqrt(T))};}
  function parseOcc(c){var m=/^([A-Z.]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/.exec(c);if(!m)return null;
    return{u:m[1],exp:new Date(Date.UTC(2000+ +m[2],+m[3]-1,+m[4],21)),call:m[5]==='C',k:+m[6]/1000};}
  function chain(sym,codes){var s=SPOT[sym];var out={spot:s||null,contracts:{}};if(!s)return out;
    codes.forEach(function(c){var o=parseOcc(c);if(!o)return;var T=(o.exp-Date.now())/(365*864e5);if(T<=0)return;
      var b=bs(s,o.k,T,IV[sym]||0.3,o.call),mid=Math.round(b.price*100)/100,spr=Math.max(0.01,Math.round(mid*0.02*100)/100);
      out.contracts[c]={src:'demo',bid:Math.max(0.01,mid-spr/2),ask:mid+spr/2,last:mid,iv:IV[sym],delta:b.delta,gamma:b.gamma,theta:null,vega:null};});
    return out;}
  var J=function(o,st){return Promise.resolve(new Response(JSON.stringify(o),{status:st||200,headers:{'Content-Type':'application/json'}}));};
  var realFetch=window.fetch.bind(window);
  window.fetch=function(input,init){
    var u;try{u=new URL(typeof input==='string'?input:input.url,location.href);}catch(e){return realFetch(input,init);}
    if(u.origin===location.origin&&u.pathname.indexOf('/.netlify/functions/')===0){
      var fn=u.pathname.split('/').pop(),sym=(u.searchParams.get('symbol')||'').toUpperCase();
      if(fn==='quote'){var s=SPOT[sym];return s?J({c:s,pc:+(s/1.004).toFixed(2),d:+(s-s/1.004).toFixed(2),dp:0.4}):J({c:0});}
      if(fn==='optchain'){var out=chain(sym,(u.searchParams.get('contracts')||'').split(',').filter(Boolean));
        if(sym==='PEP'&&out.contracts){Object.keys(out.contracts).forEach(function(c){var o=parseOcc(c);if(!o||!o.call)return;var spot=SPOT.PEP,intr=Math.max(0,spot-o.k),mid=Math.round((intr+0.08)*100)/100;
          out.contracts[c]={src:'demo',bid:Math.max(0.01,mid-0.02),ask:mid+0.02,last:mid,iv:IV.PEP,delta:0.95,gamma:0.01,theta:null,vega:null};});}
        return J(out);}
      if(fn==='profile'){var svg='<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="30" fill="#1f2937"/><text x="32" y="42" text-anchor="middle" font-size="28" font-family="sans-serif" fill="#fff">'+(sym.charAt(0)||'?')+'</text></svg>';return J({logo:'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)});}
      if(fn==='earnings'||fn==='dividends'){
        var addN=function(n){var d=new Date();d.setUTCHours(12,0,0,0);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
        if(fn==='earnings'){
          var E={AMD:addN(4),PEP:addN(6),KO:addN(8),AAPL:addN(7)};
          return J(E[sym]?{date:E[sym],source:'demo'}:{date:null});
        }
        var D={PEP:{date:addN(3),amount:1.265},KO:{date:addN(20),amount:0.51},AAPL:{date:addN(20),amount:0.27}};
        return J(D[sym]?{symbol:sym,date:D[sym].date,amount:D[sym].amount,source:'demo'}:{symbol:sym,date:null,amount:null});
      }
      if(fn==='symbol'){var q=(u.searchParams.get('q')||'').toLowerCase();var all=[{symbol:'KO',name:'Coca-Cola'},{symbol:'AMD',name:'Advanced Micro Devices'},{symbol:'SOFI',name:'SoFi'},{symbol:'AAPL',name:'Apple'},{symbol:'MSFT',name:'Microsoft'},{symbol:'TSLA',name:'Tesla'},{symbol:'SPCX',name:'Space Exploration Technologies'},{symbol:'NVDA',name:'Nvidia'},{symbol:'PEP',name:'PepsiCo'}];return J({results:all.filter(function(x){return x.symbol.toLowerCase().indexOf(q)>=0||x.name.toLowerCase().indexOf(q)>=0;}).slice(0,8)});}
      if(fn==='histclose'){
        var HIST=Object.assign({TSLA:280},SPOT);
        var s0=HIST[sym];if(!s0)return J({symbol:sym,closes:{},spots:{},source:'demo'});
        var px=function(date){return{price:s0,precision:'day',bar:'1d',date:date};};
        var closes={},spots={};
        (u.searchParams.get('dates')||'').split(',').forEach(function(d){d=d.trim();if(/^\d{4}-\d{2}-\d{2}$/.test(d))closes[d]=px(d);});
        (u.searchParams.get('at')||'').split(',').forEach(function(at){at=at.trim();if(!at)return;var d=(at.match(/^\d{4}-\d{2}-\d{2}/)||[])[0];if(d)spots[at]=Object.assign({},px(d));});
        return J({symbol:sym,closes:closes,spots:spots,source:'demo'});
      }
      return J({error:'Not available in the demo.'},503);
    }
    return realFetch(input,init);
  };

  // 3. Seed: modest, made-up trades, dated relative to today.
  function seed(todayISO){
    var T=new Date((todayISO||new Date().toISOString().slice(0,10))+'T12:00:00Z');
    var iso=function(d){return d.toISOString().slice(0,10);};
    var add=function(n){var d=new Date(T);d.setUTCDate(d.getUTCDate()+n);return iso(d);};
    var fri=function(n){var d=new Date(T);d.setUTCDate(d.getUTCDate()+n);while(d.getUTCDay()!==5)d.setUTCDate(d.getUTCDate()+1);return iso(d);};
    var third=function(m){var d=new Date(Date.UTC(T.getUTCFullYear(),T.getUTCMonth()+m,1,12)),c=0;while(true){if(d.getUTCDay()===5&&++c===3)break;d.setUTCDate(d.getUTCDate()+1);}return iso(d);};
    var n=0,trades=[];
    var days=function(a,b){return Math.round((new Date(b)-new Date(a))/864e5);};
    var tr=function(w,tk,action,entered,o){o=o||{};var sh=o.shares||100,prem=o.premium||0,fees=o.fees!=null?o.fees:(action==='IN'||action==='OUT'?0:0.04*sh/100);
      var credit=action==='CSP'||action==='STOC'||action==='OUT'||action==='STC';
      var t={id:'dt'+(++n),wheelId:w,ticker:tk,action:action,entered:entered,expiry:o.expiry||null,strike:o.strike||null,delta:null,premium:prem,fees:fees,shares:sh,
        total:Math.round((credit?prem*sh-fees:prem*sh+fees)*100)/100,days:o.expiry?days(entered,o.expiry):0,ppd:0,verified:true,comment:'',createdAt:entered+'T15:00:00.000Z'};
      if(o.exp)t.expiredWorthless=true;trades.push(t);return t;};
    var wheels=[
      {id:'dw-pep',ticker:'PEP',label:'',company:'PepsiCo',status:'open',lastPrice:null,notes:'',createdAt:add(-80),sortOrder:0},
      {id:'dw-ko',ticker:'KO',label:'',company:'Coca-Cola',status:'open',lastPrice:null,notes:'',createdAt:add(-120),sortOrder:1},
      {id:'dw-amd',ticker:'AMD',label:'',company:'AMD',status:'open',lastPrice:null,notes:'',createdAt:add(-70),sortOrder:2},
      {id:'dw-sofi2',ticker:'SOFI',label:'',company:'SoFi',status:'open',lastPrice:null,notes:'',createdAt:add(-5),sortOrder:3},
      {id:'dw-sofi1',ticker:'SOFI',label:'',company:'SoFi',status:'closed',lastPrice:null,notes:'',createdAt:add(-150),sortOrder:4}];
    // PEP: assigned shares and an in-the-money covered call, so the demo can show earnings-before-expiry and early-assignment tags.
    var p1=fri(-45);
    tr('dw-pep','PEP','CSP',add(-80),{strike:140,expiry:p1,premium:2.10});
    tr('dw-pep','PEP','IN',p1,{strike:140,premium:140});
    tr('dw-pep','PEP','STOC',add(-8),{strike:140,expiry:fri(10),premium:2.40});
    // KO: puts that expired, then a buy back and a new put, then an open put.
    var e1=fri(-96),e2=fri(-68),e3=fri(-40),e4=fri(-12);
    tr('dw-ko','KO','CSP',add(-120),{strike:67.5,expiry:e1,premium:0.62,exp:true});
    tr('dw-ko','KO','CSP',add(days(iso(T),e1)+3),{strike:67.5,expiry:e2,premium:0.70,exp:true});
    tr('dw-ko','KO','CSP',add(days(iso(T),e2)+3),{strike:68,expiry:e3,premium:0.75});
    tr('dw-ko','KO','BTC',add(days(iso(T),e3)-3),{strike:68,expiry:e3,premium:1.40});
    tr('dw-ko','KO','CSP',add(days(iso(T),e3)-3),{strike:67,expiry:e4,premium:1.85,exp:true});
    tr('dw-ko','KO','CSP',add(-6),{strike:68,expiry:fri(12),premium:0.80});
    // AMD: a put expired, the next was assigned, then covered calls.
    var a1=fri(-52),a2=fri(-31),a3=fri(-14);
    tr('dw-amd','AMD','CSP',add(-70),{strike:150,expiry:a1,premium:3.10,exp:true});
    tr('dw-amd','AMD','CSP',add(days(iso(T),a1)+3),{strike:155,expiry:a2,premium:3.40});
    tr('dw-amd','AMD','IN',a2,{strike:155,premium:155});
    tr('dw-amd','AMD','STOC',add(days(iso(T),a2)+3),{strike:165,expiry:a3,premium:2.20,exp:true});
    tr('dw-amd','AMD','STOC',add(-10),{strike:165,expiry:fri(10),premium:2.60});
    // SOFI: assigned, covered calls, called away (closed wheel), then a fresh put.
    var s1=fri(-129),s2=fri(-108),s3=fri(-87);
    tr('dw-sofi1','SOFI','CSP',add(-150),{strike:15,expiry:s1,premium:0.32,shares:500});
    tr('dw-sofi1','SOFI','IN',s1,{strike:15,premium:15,shares:500});
    tr('dw-sofi1','SOFI','STOC',add(days(iso(T),s1)+1),{strike:16,expiry:s2,premium:0.28,shares:500,exp:true});
    tr('dw-sofi1','SOFI','STOC',add(days(iso(T),s2)+3),{strike:16,expiry:s3,premium:0.30,shares:500});
    tr('dw-sofi1','SOFI','OUT',s3,{strike:16,premium:16,shares:500});
    tr('dw-sofi2','SOFI','CSP',add(-5),{strike:15.5,expiry:fri(14),premium:0.34,shares:500});
    // LEAPs with calls sold against them (PMCC). One short call open.
    var k=0,L=function(o){var b={id:'dl'+(++k),groupId:'dg'+(o.g||k),status:'open',closePrice:null,closeDate:null,closeFees:0,qty:1,fees:0.65,markSrc:null,markAt:null,mark:null,delta:null,theta:null,iv:null,wheelId:null,notes:'',reviewDate:null,type:'C',side:'long'};for(var x in o)if(x!=='g')b[x]=o[x];return b;};
    var aapl=L({g:1,underlying:'AAPL',strike:200,expiry:third(14),entryPrice:58.00,entryDate:add(-160)});
    var msft=L({g:2,underlying:'MSFT',strike:400,expiry:third(20),entryPrice:92.00,entryDate:add(-130)});
    var c1=L({g:3,underlying:'AAPL',side:'short',parentLeapId:aapl.id,strike:250,expiry:fri(-79),entryPrice:2.10,entryDate:add(-100),status:'expired',closePrice:0,closeDate:fri(-79)});
    var c2=L({g:4,underlying:'AAPL',side:'short',parentLeapId:aapl.id,strike:255,expiry:fri(-56),entryPrice:2.40,entryDate:add(-77),status:'closed',closePrice:3.90,closeDate:add(-60),closeFees:0.65});
    var c3=L({g:9,underlying:'AAPL',side:'short',parentLeapId:aapl.id,strike:260,expiry:fri(-35),entryPrice:3.20,entryDate:add(-60),status:'expired',closePrice:0,closeDate:fri(-35)});
    var c4=L({g:5,underlying:'AAPL',side:'short',parentLeapId:aapl.id,strike:255,expiry:fri(12),entryPrice:2.30,entryDate:add(-9)});
    var c5=L({g:6,underlying:'MSFT',side:'short',parentLeapId:msft.id,strike:480,expiry:fri(-62),entryPrice:3.80,entryDate:add(-90),status:'closed',closePrice:1.10,closeDate:add(-70),closeFees:0.65});
    var c6=L({g:7,underlying:'MSFT',side:'short',parentLeapId:msft.id,strike:485,expiry:fri(-28),entryPrice:4.10,entryDate:add(-50),status:'expired',closePrice:0,closeDate:fri(-28)});
    var c7=L({g:8,underlying:'MSFT',side:'short',parentLeapId:msft.id,strike:490,expiry:fri(9),entryPrice:4.30,entryDate:add(-20),status:'closed',closePrice:1.25,closeDate:add(0),closeFees:0.65});
    var tsla=L({g:10,underlying:'TSLA',strike:250,expiry:third(-8),entryPrice:48.00,entryDate:add(-400),status:'closed',closePrice:36.00,closeDate:add(-300),closeFees:0.65});
    if(/^dev--/.test(location.hostname)){
      wheels.push({id:'dw-nvda',ticker:'NVDA',label:'',company:'Nvidia',status:'open',lastPrice:null,notes:'Test wheel (dev only)',createdAt:add(-150),sortOrder:0});
      var n1=fri(-136),n2=fri(-115),n3=fri(-94),n4=fri(-80),n5=fri(-59),n6=fri(-38),n7=fri(-17);
      tr('dw-nvda','NVDA','CSP',add(-150),{strike:170,expiry:n1,premium:3.20,shares:200,exp:true});
      tr('dw-nvda','NVDA','CSP',add(days(iso(T),n1)+3),{strike:175,expiry:n2,premium:3.60,shares:200,exp:true});
      tr('dw-nvda','NVDA','CSP',add(days(iso(T),n2)+3),{strike:180,expiry:n3,premium:4.10,shares:200,exp:true});
      tr('dw-nvda','NVDA','CSP',add(days(iso(T),n3)+3),{strike:185,expiry:n4,premium:4.40,shares:200});
      tr('dw-nvda','NVDA','IN',n4,{strike:185,premium:185,shares:200});
      tr('dw-nvda','NVDA','STOC',add(days(iso(T),n4)+3),{strike:190,expiry:n5,premium:3.30,shares:200,exp:true});
      tr('dw-nvda','NVDA','STOC',add(days(iso(T),n5)+3),{strike:190,expiry:n6,premium:2.90,shares:200,exp:true});
      tr('dw-nvda','NVDA','STOC',add(days(iso(T),n6)+3),{strike:187.5,expiry:n7,premium:2.60,shares:200,exp:true});
      tr('dw-nvda','NVDA','STOC',add(-10),{strike:185,expiry:fri(11),premium:2.75,shares:200});
    }
    // INTC: one ACTIVE rolled chain. A $25 put rolled down twice ($24, then $23.50) for credits, so the card shows
    // "N% of $X chain" under Net P&L (now) and the roll popover shows Chain cashflow + "Now: +$X · N% captured".
    // Fixed ids + rollIds so an existing visitor's saved demo can get it added (see load()).
    wheels.push({id:'dw-intc',ticker:'INTC',label:'',company:'Intel',status:'open',lastPrice:null,notes:'',createdAt:add(-56),sortOrder:5});
    var ix=0,ti=function(action,entered,o,rollId){var t=tr('dw-intc','INTC',action,entered,o);t.id='dt-intc'+(++ix);if(rollId)t.rollId=rollId;return t;};
    var i1=fri(-28),i2=fri(-6),i3=fri(12);
    ti('CSP',add(-56),{strike:25,expiry:i1,premium:0.60});
    ti('BTC',add(-30),{strike:25,expiry:i1,premium:1.30},'dr-intc1');
    ti('CSP',add(-30),{strike:24,expiry:i2,premium:1.50},'dr-intc1');
    ti('BTC',add(-8),{strike:24,expiry:i2,premium:1.15},'dr-intc2');
    ti('CSP',add(-8),{strike:23.5,expiry:i3,premium:1.45},'dr-intc2');
    return{wheels:wheels,trades:trades,opts:[aapl,msft,tsla,c1,c2,c3,c4,c5,c6,c7]};
  }
  function load(){try{var raw=localStorage.getItem(DATA_KEY);if(raw){var d=JSON.parse(raw);if(d&&Array.isArray(d.wheels)&&Array.isArray(d.trades)){
      var s=seed(),added=false;
      if(/^dev--/.test(location.hostname)&&!d.wheels.some(function(w){return w.id==='dw-nvda';})){
        s.wheels.filter(function(w){return w.id==='dw-nvda';}).forEach(function(w){d.wheels.push(w);});
        s.trades.filter(function(t){return t.wheelId==='dw-nvda';}).forEach(function(t){d.trades.push(t);});added=true;}
      if(!d.wheels.some(function(w){return w.id==='dw-pep';})){
        s.wheels.filter(function(w){return w.id==='dw-pep';}).forEach(function(w){d.wheels.push(w);});
        s.trades.filter(function(t){return t.wheelId==='dw-pep';}).forEach(function(t){d.trades.push(t);});added=true;}
      if(!d.wheels.some(function(w){return w.id==='dw-intc';})){
        s.wheels.filter(function(w){return w.id==='dw-intc';}).forEach(function(w){d.wheels.push(w);});
        s.trades.filter(function(t){return t.wheelId==='dw-intc';}).forEach(function(t){d.trades.push(t);});added=true;}
      if(added)save(d);
      return{wheels:d.wheels,trades:d.trades,opts:d.opts||[]};}}}catch(e){}
    var s=seed();save(s);try{localStorage.setItem('wh-returnSet',JSON.stringify({base:'caw',account:0,target:null}));}catch(e){}return s;}
  var tmr=null,pending=null;
  function save(db){pending=db;clearTimeout(tmr);tmr=setTimeout(function(){try{localStorage.setItem(DATA_KEY,JSON.stringify({wheels:pending.wheels,trades:pending.trades,opts:(pending.opts||[]).map(function(l){var o={};for(var x in l)o[x]=l[x];o.mark=null;o.markSrc=null;o.markAt=null;return o;})}));}catch(e){}},50);}
  function reset(){if(!confirm('Reset the demo? Your changes here will be cleared and the sample trades put back.'))return;
    Object.keys(window.localStorage).forEach(function(k){if(k.indexOf(PREFIX)===0)ri.call(window.localStorage,k);});location.reload();}
  var SAMPLE=function(){var M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],d=new Date(),e=new Date();e.setDate(e.getDate()+17);while(e.getDay()!==5)e.setDate(e.getDate()+1);
    return'Symbol: SOFI\nSOFI $15 Put '+M[e.getMonth()]+' '+e.getDate()+', '+e.getFullYear()+'\nSell to Open\nFilled '+M[d.getMonth()]+' '+d.getDate()+', '+d.getFullYear()+'\n5 contracts at $0.29\nRegulatory fees $0.20';};
  window.OT_DEMO={active:true,prefix:PREFIX,key:DATA_KEY,seed:seed,load:load,save:save,reset:reset,sample:SAMPLE,spots:SPOT};
})();

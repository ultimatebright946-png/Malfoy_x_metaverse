'use strict';
(function(){
 var deferred=null,btn=document.getElementById('installBtn');
 if(!btn)return;
 function visible(){btn.hidden=false;}
 window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();deferred=e;btn.textContent='Install app';visible();});
 window.addEventListener('appinstalled',function(){deferred=null;btn.hidden=true;});
 btn.addEventListener('click',async function(){
   if(deferred){deferred.prompt();try{await deferred.userChoice;}catch(e){}deferred=null;btn.hidden=true;return;}
   if(/iphone|ipad|ipod/i.test(navigator.userAgent)){alert('To install Malfoy: tap Share, then “Add to Home Screen”.');}
   else if(!window.matchMedia('(display-mode: standalone)').matches){alert('Open your browser menu and choose “Install Malfoy” or “Add to Home screen”.');}
 });
 if('serviceWorker' in navigator) window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){});});
 if(window.matchMedia('(display-mode: standalone)').matches)btn.hidden=true; else btn.hidden=false;
})();

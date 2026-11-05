const { chromium } = require('playwright'); const fs=require('fs');
const S=n=>fs.readFileSync(require('path').join(__dirname,'../src/')+n,'utf8');
(async()=>{const b=await chromium.launch(); const p=await b.newPage({viewport:{width:390,height:844}}); p.on('pageerror',e=>console.log('PAGEERR',e.message));
 await p.addInitScript(S('web-page.user.js'));
 await p.route('https://missav.test/**',r=>r.fulfill({contentType:'text/html',body:`<style>@media (orientation:landscape){video.player{display:none}}</style>
 <div class=plyr style="position:relative"><video class=player style="width:390px;height:220px"></video></div>
 <div style="position:fixed;bottom:0;right:0;width:150px;height:100px"><a id=m href="https://go.livecams.example/x"><video class=cam muted></video></a></div>
 <p style="height:2000px">content</p>`}));
 await p.goto('https://missav.test/'); await p.evaluate(S('web-adblock.user.js')); await p.evaluate(S('web-main.user.js'));
 await p.evaluate(()=>{const v=document.querySelector('.player');Object.defineProperty(v,'readyState',{get:()=>4});Object.defineProperty(v,'videoWidth',{get:()=>1280});Object.defineProperty(v,'videoHeight',{get:()=>720});Object.defineProperty(v,'paused',{get:()=>false});});
 await p.waitForTimeout(4000); console.log('errs', await p.evaluate(()=>document.documentElement.dataset.kwAd ? 'adblock on':'adblock off'));
 console.log('cam video removed:', await p.evaluate(()=>!document.querySelector('video.cam')));
 await p.setViewportSize({width:844,height:390}); await p.waitForTimeout(8000);
 console.log('landscape:', await p.evaluate(()=>{const v=document.querySelector('.player');return v.className+' | display='+getComputedStyle(v).display+' | style='+v.getAttribute('style')+' | top='+(document.elementFromPoint(400,200)===v)}));
 await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(1500);
 console.log('portrait:', await p.evaluate(()=>{const v=document.querySelector('.player');return v.className+' | display='+getComputedStyle(v).display+' | style='+v.getAttribute('style')}));
 await b.close();})();

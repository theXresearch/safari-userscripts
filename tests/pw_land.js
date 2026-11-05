const { chromium } = require('playwright'); const fs=require('fs');
const S=n=>fs.readFileSync(require('path').join(__dirname,'../src/')+n,'utf8');
(async()=>{const b=await chromium.launch(); const p=await b.newPage({viewport:{width:390,height:844}});
 await p.route('https://s.test/',r=>r.fulfill({contentType:'text/html',body:`<style>@media (orientation:landscape){video.player{display:none}}</style>
 <div class=plyr><video class=player style="width:390px;height:220px"></video></div>
 <div style="position:fixed;display:none"><video id=ad muted></video></div>`}));
 await p.goto('https://s.test/'); await p.evaluate(S('web-main.user.js'));
 await p.evaluate(()=>{const fake=(v,w,h,paused)=>{let ps=paused;Object.defineProperty(v,'readyState',{get:()=>4});Object.defineProperty(v,'videoWidth',{get:()=>w});Object.defineProperty(v,'videoHeight',{get:()=>h});Object.defineProperty(v,'paused',{get:()=>ps});v.pause=()=>{ps=true;window.adPaused=true;};};
  fake(document.querySelector('.player'),1280,720,false); fake(document.getElementById('ad'),424,240,false);});
 await p.setViewportSize({width:844,height:390}); await p.waitForTimeout(1000);
 console.log(await p.evaluate(()=>{const v=document.querySelector('.player');const r=v.getBoundingClientRect();return [v.className,getComputedStyle(v).display,r.width+'x'+r.height,document.elementFromPoint(400,200)===v].join(' | ')}));
 await p.waitForTimeout(1200); console.log('ad paused:', await p.evaluate(()=>!!window.adPaused));
 await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(900);
 console.log('portrait:', await p.evaluate(()=>document.querySelector('.player').className+' parent='+document.querySelector('.player').parentNode.className));
 await b.close();})();

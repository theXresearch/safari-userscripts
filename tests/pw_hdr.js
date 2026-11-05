const { chromium } = require('playwright'); const fs=require('fs');
const S=n=>fs.readFileSync(require('path').join(__dirname,'../src/')+n,'utf8');
(async()=>{const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:370,height:600},hasTouch:true}); const p=await ctx.newPage(); p.on('pageerror',e=>console.log('ERR',e.message));
 await p.route('https://missav.test/**',r=>r.fulfill({contentType:'text/html',body:`<body style="margin:0">
 <div id=hdr style="position:fixed;top:0;left:0;right:0;height:56px;z-index:30;background:#111"><nav><a href="/">MISSAV</a> <a href="/search">search</a></nav></div>
 <div style="position:sticky;top:56px" id=sub><a href="/x">tab</a></div>
 <div class="relative" style="margin-top:56px"><div style="position:relative;padding-bottom:56.25%"><div class=plyr style="position:absolute;inset:0"><video class=player style="width:100%;height:100%"></video></div></div></div><p style="height:2000px">t</p></body>`}));
 await p.goto('https://missav.test/'); await p.evaluate(S('web-adblock.user.js')); await p.evaluate(S('web-main.user.js'));
 await p.evaluate(()=>{const v=document.querySelector('.player');Object.defineProperty(v,'readyState',{get:()=>4});Object.defineProperty(v,'videoWidth',{get:()=>842});Object.defineProperty(v,'videoHeight',{get:()=>474});Object.defineProperty(v,'paused',{get:()=>false});Object.defineProperty(v,'duration',{get:()=>7207});});
 const st=()=>p.evaluate(()=>['hdr','sub'].map(id=>{const e=document.getElementById(id),c=getComputedStyle(e);return id+':'+c.visibility+'/'+c.display}).join(' '));
 await p.waitForTimeout(1600); console.log('before :', await st());
 for (let i=0;i<2;i++){ await p.setViewportSize({width:587,height:314}); await p.waitForTimeout(1600); console.log('fs     :', await st());
 await p.setViewportSize({width:370,height:600}); await p.waitForTimeout(800); console.log('after  :', await st()); }
 await p.setViewportSize({width:587,height:314}); await p.waitForTimeout(500); await p.setViewportSize({width:370,height:600}); await p.waitForTimeout(2000); console.log('quick rotate back:', await st());
 await b.close();})();

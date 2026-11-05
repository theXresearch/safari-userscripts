const { chromium } = require('playwright'); const fs=require('fs');
const S=n=>fs.readFileSync(require('path').join(__dirname,'../src/')+n,'utf8');
(async()=>{const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:844},hasTouch:true}); const p=await ctx.newPage(); p.on('pageerror',e=>console.log('ERR',e.message));
 await p.route('https://missav.test/**',r=>r.fulfill({contentType:'text/html',body:`<body style="margin:0">
 <header id=hdr style="position:fixed;top:0;left:0;right:0;height:56px;z-index:2147483647"><a href="/">MISSAV</a><input></header>
 <div id=m3u8 style="position:fixed;right:20px;top:120px;z-index:2147483647;width:60px;height:60px;background:blue">M3U8</div>
 <div class="relative" style="margin-top:56px"><div style="position:relative;padding-bottom:56.25%"><video class=player style="position:absolute;inset:0;width:100%;height:100%"></video></div></div><p style="height:2000px">t</p></body>`}));
 await p.goto('https://missav.test/'); await p.evaluate(S('web-adblock.user.js')); await p.evaluate(S('web-main.user.js'));
 await p.evaluate(()=>{const v=document.querySelector('.player');let t=100,ps=false;Object.defineProperty(v,'readyState',{get:()=>4});Object.defineProperty(v,'videoWidth',{get:()=>1280});Object.defineProperty(v,'videoHeight',{get:()=>720});Object.defineProperty(v,'paused',{get:()=>ps});v.pause=()=>{ps=true};v.play=()=>{ps=false;return Promise.resolve()};Object.defineProperty(v,'duration',{get:()=>2833});Object.defineProperty(v,'currentTime',{get:()=>t,set:x=>{t=x}});});
 await p.waitForTimeout(1600);
 await p.setViewportSize({width:844,height:390}); await p.waitForTimeout(1500);
 const st=()=>p.evaluate(()=>{const g=id=>document.getElementById(id);return `seek=${g('kw-seek')?g('kw-seek').style.display:'none'} play=${g('kw-fsplay')?g('kw-fsplay').style.display:'none'} tools=${g('kw-tools').style.opacity} hdr=${getComputedStyle(g('hdr')).visibility} m3u8=${getComputedStyle(g('m3u8')).visibility} paused=${document.querySelector('.player').paused}`});
 console.log('enter fs   :', await st(), '| m3u8 on top:', await p.evaluate(()=>{const r=document.getElementById('m3u8').getBoundingClientRect();return document.elementFromPoint(r.left+5,r.top+5).id}));
 await p.touchscreen.tap(300,200); await p.waitForTimeout(500); console.log('tap once   :', await st());
 await p.touchscreen.tap(422,195); await p.waitForTimeout(200); console.log('tap center :', await st());
 await p.waitForTimeout(3300); console.log('after 3s   :', await st());
 await p.touchscreen.tap(300,200); await p.waitForTimeout(500); await p.touchscreen.tap(300,200); await p.waitForTimeout(500); console.log('tap twice(slow):', await st());
 await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(800); console.log('portrait   :', await st());
 await b.close();})();

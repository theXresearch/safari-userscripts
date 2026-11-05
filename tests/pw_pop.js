const { chromium } = require('playwright'); const fs=require('fs');
const page_js=fs.readFileSync(require('path').join(__dirname,'../src/web-page.user.js'),'utf8');
const main_js=fs.readFileSync(require('path').join(__dirname,'../src/web-main.user.js'),'utf8');
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:844},hasTouch:true});
 const p=await ctx.newPage(); let popups=[]; ctx.on('page',pg=>popups.push(pg.url()));
 await p.addInitScript(page_js);
 await p.route('https://missav.test/**',r=>r.fulfill({contentType:'text/html',body:`<body>
 <button id=play>play</button><a id=ext href="https://news.example.org/" target=_blank>news link</a>
 <a id=share href="https://twitter.com/intent" target=_blank>share</a>
 <div style="position:relative;width:390px;height:400px"><a id=ov href="https://wannaknowmysecret.com/" target=_blank style="position:absolute;inset:0"></a></div>
 <video id=v src="data:video/mp4;base64," style="width:390px;height:220px"></video>
 <script>document.getElementById('play').onclick=()=>{window.open('https://wannaknowmysecret.com/x');window.open('');};
 document.getElementById('ext').addEventListener('click',()=>{});</script></body>`}));
 await p.goto('https://missav.test/');
 await p.click('#play'); await p.waitForTimeout(300); console.log('after play:',popups);
 await p.click('#ov',{force:true}); await p.waitForTimeout(300); console.log('after overlay:',popups);
 
 await p.click('#share'); await p.waitForTimeout(1500); console.log('after share:',popups);
 await p.evaluate(main_js);
 await p.evaluate(()=>{const v=document.getElementById('v');Object.defineProperty(v,'readyState',{get:()=>4});Object.defineProperty(v,'paused',{get:()=>false});});
 await p.setViewportSize({width:844,height:390}); await p.waitForTimeout(900);
 console.log('landscape:', await p.evaluate(()=>document.getElementById('v').className));
 await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(900);
 console.log('portrait:', JSON.stringify(await p.evaluate(()=>document.getElementById('v').className)));
 await b.close();})();

const { chromium } = require('playwright'); const fs=require('fs');
const S=n=>fs.readFileSync(require('path').join(__dirname,'../src/')+n,'utf8');
(async()=>{const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:844}}); const p=await ctx.newPage(); const pops=[]; ctx.on('page',x=>pops.push(x.url()));
 await p.addInitScript(S('web-page.user.js'));
 await ctx.route('**/*',r=>{const u=r.request().url(); if(u.startsWith('https://site.test')) return r.fulfill({contentType:'text/html',body:`<body><video></video>
 <div id=ext style="position:fixed;right:10px;top:400px;z-index:2147483647"><button id=b>M3U8</button></div>
 <script>b.onclick=()=>{ window.open('https://wiselife.blog/hls/abc.m3u8?t=1'); 
   const p=document.createElement('div');p.id='panel';p.style.cssText='position:fixed;bottom:0;left:0;right:0;height:150px;background:#fff';
   p.innerHTML='<a href="https://wiselife.blog/hls/abc.m3u8">abc.m3u8 copy</a>';document.body.appendChild(p); };
 </script><button id=nav onclick="location.href='https://wiselife.blog/hls/abc.m3u8'">nav</button></body>`});
 return r.fulfill({contentType:'text/plain',body:'ok'});});
 await p.goto('https://site.test/'); await p.evaluate(S('web-adblock.user.js'));
 await p.click('#b'); await p.waitForTimeout(2500);
 console.log('popup opened:', pops, '| panel visible:', await p.evaluate(()=>getComputedStyle(document.getElementById('panel')).display));
 await p.click('#nav'); await p.waitForTimeout(800); console.log('navigated to:', p.url());
 await b.close();})();

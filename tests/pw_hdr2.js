const { chromium } = require('playwright'); const fs=require('fs');
const S=n=>fs.readFileSync(require('path').join(__dirname,'../src/')+n,'utf8');
(async()=>{const b=await chromium.launch(); const p=await b.newPage({viewport:{width:370,height:600}}); p.on('pageerror',e=>console.log('ERR',e.message));
 await p.route('https://missav.test/**',r=>r.fulfill({contentType:'text/html',body:`<body style="margin:0">
 <div id=hdr style="position:fixed;top:0;left:0;right:0;height:56px;background:#111"><a href="/">MISSAV</a><a href="/s">search</a><a href="/g">genres</a><a id=live href="https://www.myavlive.com/?ref=x">Live Cams</a></div>
 <div id=m3u8 style="position:fixed;right:20px;top:300px;z-index:2147483647"><img src="safari-web-extension://ABC-123/icon.png" width=60 height=60><span>M3U8</span></div>
 <p style="height:2000px;margin-top:70px">t</p></body>`}));
 await p.goto('https://missav.test/'); await p.evaluate(S('web-adblock.user.js')); await p.waitForTimeout(2000);
 console.log(await p.evaluate(()=>['hdr','live','m3u8'].map(id=>id+':'+getComputedStyle(document.getElementById(id)).display).join(' ')));
 await b.close();})();

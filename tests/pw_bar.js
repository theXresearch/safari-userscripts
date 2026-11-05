const { chromium } = require('playwright'); const fs=require('fs');
const S=n=>fs.readFileSync(require('path').join(__dirname,'../src/')+n,'utf8');
(async()=>{const b=await chromium.launch(); const p=await b.newPage({viewport:{width:390,height:844}}); p.on('pageerror',e=>console.log('ERR',e.message));
 await p.addInitScript(S('web-page.user.js'));
 await p.route('https://missav.test/**',r=>r.fulfill({contentType:'text/html',body:`<body style="margin:0">
 <div id=hdr style="height:56px">header</div>
 <div class="relative"><div class="aspect" style="position:relative;padding-bottom:56.25%"><div class=plyr style="position:absolute;inset:0"><video class=player style="width:100%;height:100%"></video></div></div></div>
 <div id=row style="height:40px;background:#333">« 10m  ‹ 1m  10s ›</div><p style="height:2000px">text</p>
 <div style="position:fixed;bottom:0;right:0;width:150px;height:100px" id=wid><a href="https://go.cams.example/"><video class=cam></video></a></div>
 <button id=pl onclick="var w=window.open('https://adx.example/');w.blur();window.focus();document.title='played'">play</button></body>`}));
 await p.goto('https://missav.test/'); await p.evaluate(S('web-adblock.user.js')); await p.evaluate(S('web-main.user.js'));
 await p.evaluate(()=>{const v=document.querySelector('.player');Object.defineProperty(v,'readyState',{get:()=>4});Object.defineProperty(v,'videoWidth',{get:()=>1280});Object.defineProperty(v,'videoHeight',{get:()=>720});Object.defineProperty(v,'paused',{get:()=>false});});
 await p.waitForTimeout(3500);
 console.log(await p.evaluate(()=>{const bar=document.getElementById('kw-tools');const r=bar.getBoundingClientRect(), v=document.querySelector('.player').getBoundingClientRect(), row=document.getElementById('row').getBoundingClientRect();
  return `mode=${bar.dataset.mode} bar top=${r.top|0} h=${r.height|0} | video bottom=${v.bottom|0} | site row top=${row.top|0} | buttons=${[...bar.children].map(c=>c.textContent).join(',')} | widget hidden=${getComputedStyle(document.getElementById('wid')).display}`}));
 await p.click('#pl'); console.log('play handler survived:', await p.title());
 await p.setViewportSize({width:844,height:390}); await p.waitForTimeout(1200);
 console.log(await p.evaluate(()=>{const bar=document.getElementById('kw-tools');const r=bar.getBoundingClientRect();return `fs mode=${bar.dataset.mode} at ${r.left|0},${r.top|0} opacity=${bar.style.opacity}`}));
 await p.waitForTimeout(3500); console.log('after 3s opacity', await p.evaluate(()=>document.getElementById('kw-tools').style.opacity));
 await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(1500);
 console.log('back:', await p.evaluate(()=>document.getElementById('kw-tools').dataset.mode+' video display='+getComputedStyle(document.querySelector('.player')).display));
 await b.close();})();

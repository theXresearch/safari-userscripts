const { chromium } = require('playwright'); const fs=require('fs');
const S=n=>fs.readFileSync(require('path').join(__dirname,'../src/')+n,'utf8');
(async()=>{const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:844},hasTouch:true}); const p=await ctx.newPage(); p.on('pageerror',e=>console.log('ERR',e.message));
 await p.addInitScript('window.GM={getValue:async(k,d)=>d,setValue:async()=>{}};');
 await p.addInitScript(S('web-page.user.js'));
 await p.route('https://missav.test/**',r=>r.fulfill({contentType:'text/html',body:`<body style="margin:0"><div style="margin-top:56px;position:relative;padding-bottom:56.25%"><div class=plyr style="position:absolute;inset:0"><video class=player style="width:100%;height:100%"></video></div></div><p style="height:900px">t</p>
 <script>const v=document.querySelector('.player');v.plyr={options:{quality:[1080,720,480,360]},_q:720,get quality(){return this._q},set quality(x){this._q=x;document.title='q='+x}};</script></body>`}));
 await p.goto('https://missav.test/'); await p.evaluate(S('web-main.user.js'));
 await p.evaluate(()=>{const v=document.querySelector('.player');Object.defineProperty(v,'readyState',{get:()=>4});Object.defineProperty(v,'videoWidth',{get:()=>1280});Object.defineProperty(v,'videoHeight',{get:()=>720});Object.defineProperty(v,'paused',{get:()=>false});Object.defineProperty(v,'duration',{get:()=>3000});});
 await p.waitForTimeout(3200);
 console.log('list:', await p.evaluate(()=>document.documentElement.dataset.kwQList), 'label:', await p.textContent('#kw-quality'));
 await p.click('#kw-quality'); await p.waitForTimeout(200);
 console.log('menu:', await p.evaluate(()=>[...document.querySelectorAll('#kw-menu button')].map(b=>b.textContent).join(' | ')));
 await p.click('#kw-menu button:nth-child(4)'); await p.waitForTimeout(1800);
 console.log('picked → label', await p.textContent('#kw-quality'), 'plyr', await p.title(), 'menu gone', await p.evaluate(()=>!document.getElementById('kw-menu')));
 await p.click('#kw-speed'); await p.waitForTimeout(200);
 console.log('speed menu:', await p.evaluate(()=>[...document.querySelectorAll('#kw-menu button')].map(b=>b.textContent).join(' | ')));
 await p.mouse.click(50,600); await p.waitForTimeout(200); console.log('outside click closes:', await p.evaluate(()=>!document.getElementById('kw-menu')));
 await b.close();})();

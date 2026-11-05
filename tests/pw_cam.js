const { chromium } = require('playwright'); const fs=require('fs');
const S=n=>fs.readFileSync(require('path').join(__dirname,'../src/')+n,'utf8');
(async()=>{const b=await chromium.launch(); const p=await b.newPage({viewport:{width:314,height:502}}); p.on('pageerror',e=>console.log('ERR',e.message));
 await p.route('https://missav.test/**',r=>r.fulfill({contentType:'text/html',body:`<body><div class=is-home>
 <h2>Recent</h2><div class=grid><a href="/v1"><video class="preview" id=pv></video>VIDEO ONE title</a></div>
 <div id=camwrap><div class=layoutWrapper><a id=model-1 class=root><div class=inner><video id=c1 muted style="width:147px;height:96px"></video></div></a><a id=model-2><div><video id=c2 muted style="width:147px;height:96px"></video></div></a></div></div>
 <p>More content text here that is long enough</p></div></body>`}));
 await p.goto('https://missav.test/');
 await p.evaluate(()=>{['c1','c2'].forEach(id=>Object.defineProperty(document.getElementById(id),'duration',{get:()=>Infinity}));Object.defineProperty(document.getElementById('pv'),'duration',{get:()=>9.1});});
 await p.evaluate(S('web-adblock.user.js')); await p.waitForTimeout(2000);
 console.log(await p.evaluate(()=>`cams=${document.querySelectorAll('#c1,#c2').length} camwrap=${getComputedStyle(document.getElementById('camwrap')).display} preview=${!!document.getElementById('pv')} home=${getComputedStyle(document.querySelector('.is-home')).display}`));
 await b.close();})();

const { chromium } = require('playwright'); const fs=require('fs');
const page_js=fs.readFileSync(require('path').join(__dirname,'../src/web-page.user.js'),'utf8');
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:844}});
 const p=await ctx.newPage(); let popups=[]; ctx.on('page',pg=>popups.push(pg.url()));
 await p.addInitScript(page_js);
 await ctx.route('**/*',r=>{const u=r.request().url(); if(u.startsWith('https://missav.test')) return r.fulfill({contentType:'text/html',body:`<body>
 <div id=play style="width:200px;height:100px;background:red">play</div><a id=ext href="https://news.example.org/">news</a>
 <script>play.onclick=()=>{window.open(location.href);location.href='https://randomad123.com/';};</script></body>`});
 return r.fulfill({contentType:'text/html',body:'<h1>'+u+'</h1>'});});
 await p.goto('https://missav.test/');
 console.log('navigation API:', await p.evaluate(()=>!!window.navigation));
 await p.click('#play'); await p.waitForTimeout(600);
 console.log('shield on → url:', p.url(), 'popups:', popups);
 await p.evaluate(()=>localStorage.setItem('kwShield','off')); await p.reload(); popups=[];
 await p.click('#play'); await p.waitForTimeout(600);
 console.log('shield off → url:', p.url(), 'popups:', popups.length);
 await p.goto('https://missav.test/'); await p.evaluate(()=>localStorage.removeItem('kwShield')); await p.reload();
 await p.click('#ext'); await p.waitForTimeout(600); console.log('real link →', p.url());
 await b.close();})();

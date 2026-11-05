const { chromium } = require('playwright'); const fs=require('fs'); const path=require('path');
const SRC=require('path').join(__dirname,'../src/'); const S=n=>fs.readFileSync(path.join(SRC,n),'utf8');
(async()=>{const b=await chromium.launch(); const p=await b.newPage({viewport:{width:390,height:844}}); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.route('https://m.youtube.com/**',r=>r.fulfill({contentType:'text/html',body:`<body><ytm-mobile-topbar-renderer style="display:block;height:48px"><ytm-home-logo style="display:block;width:100px;height:24px"></ytm-home-logo></ytm-mobile-topbar-renderer>
 <div id=movie_player><video></video><div class="ytp-ce-element" id=ce>card</div></div><like-button-view-model id=like>like</like-button-view-model></body>`}));
 await p.goto('https://m.youtube.com/watch?v=abcdefghijk');
 await p.evaluate(()=>{const d=document.documentElement.dataset;d.krPage='1';d.krChan='강의채널';window.cmds=[];
   document.addEventListener('kr-cmd',()=>cmds.push(d.krCmd+':'+d.krArg));
   const v=document.querySelector('video');Object.defineProperty(v,'paused',{get:()=>false});Object.defineProperty(v,'playbackRate',{get:()=>1,set(){}});});
 await p.evaluate(S('yt-main.user.js')); await p.waitForTimeout(1500);
 const vis=id=>p.evaluate(id=>getComputedStyle(document.getElementById(id)).display,id);
 console.log('buttons:', await p.evaluate(()=>[...document.querySelectorAll('#kr-bar button')].map(b=>b.textContent).join(',')));
 console.log('default hidden: like=',await vis('like'),'endcard=',await vis('ce'));
 await p.click('#kr-speed'); await p.waitForTimeout(200);
 console.log('speed menu:', await p.evaluate(()=>[...document.querySelectorAll('#kr-menu > *')].map(b=>b.textContent).join(' | ')));
 await p.click('#kr-menu button:nth-of-type(3)'); await p.waitForTimeout(200);   // 1.5x
 console.log('chan speeds:', await p.evaluate(()=>localStorage.getItem('krChanSpeed')), '| global:', await p.evaluate(()=>localStorage.getItem('krSpeed')));
 await p.evaluate(()=>{document.documentElement.dataset.krChan='음악채널'}); await p.waitForTimeout(1200);
 console.log('other channel label:', await p.textContent('#kr-speed'));
 await p.evaluate(()=>{document.documentElement.dataset.krChan='강의채널'}); await p.waitForTimeout(1200);
 console.log('back to 강의채널 label:', await p.textContent('#kr-speed'), '| speed cmds:', await p.evaluate(()=>cmds.filter(c=>c.startsWith('speed')).join(',')));
 await p.click('#kr-set'); await p.waitForTimeout(200);
 console.log('settings rows:', await p.evaluate(()=>document.querySelectorAll('#kr-settings button').length));
 // toggle endCards (last row) and tidy
 await p.evaluate(()=>{const rows=[...document.querySelectorAll('#kr-settings div[style*="border-top"]')];rows.find(r=>r.textContent.includes('추천·정보 카드')).querySelector('button').click();rows.find(r=>r.textContent.includes('좋아요·댓글')).querySelector('button').click();});
 console.log('after off: like=',await vis('like'),'endcard=',await vis('ce'),'| saved:', await p.evaluate(()=>localStorage.getItem('krSet')), '| reload btn:', await p.evaluate(()=>[...document.querySelectorAll('#kr-settings button')].some(b=>b.textContent.includes('새로고침')&&b.style.display==='block')));
 console.log('errors:', errs);
 await b.close();})();

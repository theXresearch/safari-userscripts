const { chromium } = require('playwright'); const fs=require('fs'); const path=require('path');
const SRC=require('path').join(__dirname,'../src/'); const S=n=>fs.readFileSync(path.join(SRC,n),'utf8');
(async()=>{const b=await chromium.launch(); const errs=[];
 // ---------- YouTube ----------
 const ctx=await b.newContext({viewport:{width:390,height:844},hasTouch:true}); const p=await ctx.newPage(); p.on('pageerror',e=>errs.push('yt '+e.message));
 const sbUrls=[];
 await ctx.route('**/*',r=>{const u=r.request().url(); if(u.includes('sponsor.ajay.app')){sbUrls.push(decodeURIComponent(u));return r.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'[]'});}
  return r.fulfill({contentType:'text/html',body:`<body style="margin:0"><div id=movie_player><video style="width:390px;height:220px"></video></div></body>`});});
 await p.goto('https://m.youtube.com/watch?v=abcdefghijk');
 await p.evaluate(()=>{const d=document.documentElement.dataset;d.krPage='1';d.krT='100';d.krD='600';window.cmds=[];
   document.addEventListener('kr-cmd',()=>cmds.push(d.krCmd+(d.krArg?':'+d.krArg:'')));
   const v=document.querySelector('video');Object.defineProperty(v,'paused',{get:()=>false});Object.defineProperty(v,'readyState',{get:()=>4});});
 await p.evaluate(S('yt-main.user.js')); await p.waitForTimeout(1300);
 console.log('SB default cats:', (sbUrls[0]||'').match(/categories=(.*)/)[1]);
 // settings: sleep 'end' + toggle sponsor category off
 await p.click('#kr-set'); await p.waitForTimeout(200);
 await p.evaluate(()=>{const bs=[...document.querySelectorAll('#kr-settings button')];bs.find(x=>x.textContent==='이 영상 끝나면').click();bs.find(x=>x.textContent==='광고').click();});
 console.log('gear label:', await p.textContent('#kr-set'), '| saved cats:', await p.evaluate(()=>JSON.parse(localStorage.getItem('krSet')).sbCats.join(',')));
 await p.evaluate(()=>document.getElementById('kr-settings').remove()); await p.waitForTimeout(1300);
 console.log('SB refetch cats:', (sbUrls[sbUrls.length-1]||'').match(/categories=(.*)/)[1], '| fetches:', sbUrls.length);
 await p.evaluate(()=>{document.documentElement.dataset.krT='599'}); await p.waitForTimeout(1200);
 console.log('sleep end → cmds:', await p.evaluate(()=>cmds.filter(c=>c==='pause').length), 'pause | gear after:', await p.textContent('#kr-set'));
 // fullscreen double tap sides
 await p.setViewportSize({width:844,height:390}); await p.waitForTimeout(1300);
 const inFs = await p.evaluate(()=>document.querySelector('video').classList.contains('kr-fs')); 
 await p.evaluate(()=>{cmds.length=0;document.documentElement.dataset.krT='100'});
 for (const x of [100,742,422]) { await p.mouse.click(x,200); await p.waitForTimeout(60); await p.mouse.click(x,200); await p.waitForTimeout(450); }
 console.log('yt fs:', inFs, '| double-tap cmds:', await p.evaluate(()=>cmds.join(',')), '| hud:', await p.evaluate(()=>{const h=document.getElementById('kr-fs-hud');return h?h.textContent:''}));
 // ---------- Web ----------
 const ctx2=await b.newContext({viewport:{width:390,height:844},hasTouch:true}); const w=await ctx2.newPage(); w.on('pageerror',e=>errs.push('web '+e.message));
 await w.addInitScript('window.GM={getValue:async(k,d)=>d,setValue:async()=>{}};');
 await w.route('https://site.test/**',r=>r.fulfill({contentType:'text/html',body:`<body style="margin:0"><div style="position:relative;padding-bottom:56.25%"><video class=player style="position:absolute;inset:0;width:100%;height:100%"></video></div><p style="height:900px">t</p></body>`}));
 await w.goto('https://site.test/'); await w.evaluate(S('web-main.user.js'));
 await w.evaluate(()=>{const v=document.querySelector('.player');let t=100;Object.defineProperty(v,'readyState',{get:()=>4});Object.defineProperty(v,'videoWidth',{get:()=>1280});Object.defineProperty(v,'videoHeight',{get:()=>720});Object.defineProperty(v,'paused',{get:()=>false});Object.defineProperty(v,'duration',{get:()=>600});Object.defineProperty(v,'currentTime',{get:()=>t,set:x=>{t=x}});});
 await w.waitForTimeout(1600); await w.setViewportSize({width:844,height:390}); await w.waitForTimeout(1200);
 const dt=async x=>{await w.touchscreen.tap(x,200); await w.waitForTimeout(80); await w.touchscreen.tap(x,200); await w.waitForTimeout(500);};
 await dt(100); const t1=await w.evaluate(()=>document.querySelector('.player').currentTime);
 await dt(742); await dt(742); const t2=await w.evaluate(()=>document.querySelector('.player').currentTime);
 const fsBefore=await w.evaluate(()=>document.querySelector('.player').classList.contains('kw-fs'));
 await dt(422); const fsAfter=await w.evaluate(()=>document.querySelector('.player').classList.contains('kw-fs'));
 console.log('web fs double-tap: left→', t1, '| right x2→', t2, '| middle exits fs:', fsBefore, '→', fsAfter);
 console.log('errors:', errs);
 await b.close();})();

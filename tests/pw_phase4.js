const { chromium } = require('playwright'); const fs=require('fs'); const path=require('path');
const SRC=require('path').join(__dirname,'../src/'); const S=n=>fs.readFileSync(path.join(SRC,n),'utf8');
const VID='abcdefghijk';
(async()=>{const b=await chromium.launch(); const errs=[];
 // ---------- YouTube 상태 + 자막 ----------
 const ctx=await b.newContext({viewport:{width:390,height:844}}); const p=await ctx.newPage(); p.on('pageerror',e=>errs.push('yt '+e.message));
 await p.addInitScript(`if(!localStorage.getItem('krSet'))localStorage.setItem('krSet', JSON.stringify({capLang:'ko'}));`);
 await p.addInitScript(S('yt-page.user.js'));
 await ctx.route('**/*',r=>{const u=r.request().url();
  if(u.includes('sponsor.ajay.app')) return r.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'[]'});
  if(u.includes('/shorts/')) return r.fulfill({contentType:'text/html',body:'<body>shorts page</body>'});
  return r.fulfill({contentType:'text/html',body:`<body><script>var ytInitialPlayerResponse={adPlacements:[1],playerAds:[1]};</script>
   <ytm-mobile-topbar-renderer style="display:block;height:48px"><ytm-home-logo style="display:block;width:100px;height:24px"></ytm-home-logo></ytm-mobile-topbar-renderer>
   <div id=movie_player style="width:390px;height:220px"><video style="width:390px;height:220px"></video></div><yt-video-metadata-view-model>제목</yt-video-metadata-view-model>
   <a id=sh href="/shorts/SHORTSID001">a short</a></body>`});});
 await p.goto('https://m.youtube.com/watch?v='+VID);
 await p.evaluate((VID)=>{const pl=document.getElementById('movie_player'),v=pl.querySelector('video');let ps=false;window.log=[];
  Object.defineProperty(v,'paused',{get:()=>ps});Object.defineProperty(v,'readyState',{get:()=>4});
  Object.assign(pl,{getVideoData:()=>({video_id:VID,title:'T',author:'강의채널'}),getCurrentTime:()=>50,getDuration:()=>600,getAvailableQualityLevels:()=>['hd720','medium'],
   seekTo(){},playVideo(){ps=false},pauseVideo(){ps=true},loadModule(m){log.push('load '+m)},
   getOption:(m,k)=>k==='tracklist'?[{languageCode:'en',displayName:'English'},{languageCode:'ko',kind:'asr',displayName:'한국어 (자동 생성됨)'}]:null,
   setOption:(m,k,v)=>log.push('cap '+JSON.stringify(v)),
   getAvailableAudioTracks:()=>[{id:'ko-dub',displayName:'한국어 (더빙)'},{id:'en',displayName:'English',isOriginalTrack:true}],getAudioTrack:()=>({id:'ko-dub',displayName:'한국어 (더빙)'}),setAudioTrack(){log.push('audio')}});},VID);
 await p.evaluate(S('yt-main.user.js')); await p.waitForTimeout(2600);
 await p.click('#kr-set'); await p.waitForTimeout(1200);
 const lines=await p.evaluate(()=>[...document.querySelectorAll('#kr-stat > div')].map(d=>d.textContent));
 console.log('YT status:\n  '+lines.join('\n  '));
 console.log('player log:', await p.evaluate(()=>log.join(' | ')));
 console.log('cap chips:', await p.evaluate(()=>[...document.querySelectorAll('#kr-settings button')].filter(b=>['끔','한국어','English'].includes(b.textContent)).map(b=>b.textContent+(b.style.background.includes('48')?'':'*')).join(',')));
 // Shorts → normal: enable, click link
 await p.evaluate(()=>{const rows=[...document.querySelectorAll('#kr-settings div[style*="border-top"]')];rows.find(r=>r.textContent.includes('Shorts를 일반'))?.querySelector('button').click();document.getElementById('kr-settings').remove();});
 await p.click('#sh'); await p.waitForTimeout(800);
 console.log('shorts link click →', new URL(p.url()).pathname + new URL(p.url()).search);
 const p2=await ctx.newPage(); p2.on('pageerror',e=>errs.push('yt2 '+e.message));
 await p2.goto('https://m.youtube.com/shorts/SHORTSID002'); await p2.evaluate(S('yt-main.user.js')); await p2.waitForTimeout(800);
 console.log('open shorts URL →', new URL(p2.url()).pathname + new URL(p2.url()).search);
 // ---------- Web 설정 + 상태 ----------
 const c2=await b.newContext({viewport:{width:390,height:844},colorScheme:'dark'}); const w=await c2.newPage(); w.on('pageerror',e=>errs.push('web '+e.message));
 await w.addInitScript('window.GM={_s:{},getValue:async function(k,d){return k in this._s?this._s[k]:d},setValue:async function(k,v){this._s[k]=v}};');
 await w.addInitScript(S('web-page.user.js'));
 await w.route('https://site.test/**',r=>r.fulfill({contentType:'text/html',body:`<body style="background:#fff;margin:0"><div style="position:relative;padding-bottom:56.25%"><video class=player style="position:absolute;inset:0;width:100%;height:100%"></video></div>
  <iframe src="https://creative.ads.example/widgets/x"></iframe><button id=pop onclick="window.open('https://randomad.example/')">pop</button><p style="height:900px">t</p></body>`}));
 await w.goto('https://site.test/'); await w.evaluate(S('web-adblock.user.js')); await w.evaluate(S('web-main.user.js'));
 await w.evaluate(()=>{const v=document.querySelector('.player');Object.defineProperty(v,'readyState',{get:()=>4});Object.defineProperty(v,'videoWidth',{get:()=>1280});Object.defineProperty(v,'videoHeight',{get:()=>720});Object.defineProperty(v,'paused',{get:()=>false});Object.defineProperty(v,'duration',{get:()=>600});});
 await w.click('#pop'); await w.waitForTimeout(2200);
 console.log('dark before:', await w.evaluate(()=>!!document.getElementById('kw-dark')));
 await w.click('#kw-set'); await w.waitForTimeout(1200);
 console.log('WEB status:\n  '+(await w.evaluate(()=>[...document.querySelectorAll('#kw-stat > div')].map(d=>d.textContent))).join('\n  '));
 await w.evaluate(()=>[...document.querySelectorAll('#kw-settings div[style*="border-top"]')].find(r=>r.textContent.includes('다크 모드')).querySelector('button').click());
 console.log('dark after off:', await w.evaluate(()=>!!document.getElementById('kw-dark')), '| saved:', await w.evaluate(()=>GM._s.set));
 await w.evaluate(()=>document.getElementById('kw-settings').remove());
 await w.evaluate(()=>document.dispatchEvent(new Event('kw-open-settings'))); console.log('open from 🚫 bar event:', await w.evaluate(()=>!!document.getElementById('kw-settings')));
 console.log('errors:', errs);
 await b.close();})();

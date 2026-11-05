const { chromium } = require('playwright'); const fs=require('fs'); const crypto=require('crypto');
const S=n=>fs.readFileSync(require('path').join(__dirname,'../src/')+n,'utf8');
const VID='abcdefghijk', prefix=crypto.createHash('sha256').update(VID).digest('hex').slice(0,4);
(async()=>{const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:844}}); const p=await ctx.newPage();
 const errs=[]; p.on('pageerror',e=>errs.push(e.message)); let sbUrl='';
 await p.addInitScript(S('yt-page.user.js'));
 await ctx.route('**/*',async r=>{const u=r.request().url();
  if(u.includes('sponsor.ajay.app')){ sbUrl=u; return r.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify([{videoID:'zzzzzzzzzzz',segments:[{segment:[1,2]}]},{videoID:VID,segments:[{segment:[10,20],category:'sponsor',actionType:'skip'},{segment:[30,31],category:'poi_highlight',actionType:'poi'}]}])}); }
  if(u.includes('/youtubei/v1/player')) return r.fulfill({contentType:'application/json',body:JSON.stringify({adPlacements:[{a:1}],playerAds:[1],streamingData:{ok:1}})});
  return r.fulfill({contentType:'text/html',body:`<body><script>var ytInitialPlayerResponse = {adPlacements:[1],adSlots:[2],videoDetails:{videoId:'${VID}'}};</script>
  <div id=movie_player style="width:390px;height:220px"><video style="width:390px;height:220px"></video></div></body>`});});
 await p.goto('https://m.youtube.com/watch?v='+VID);
 console.log('initial PR keys:', await p.evaluate(()=>Object.keys(window.ytInitialPlayerResponse).join(',')));
 console.log('JSON.parse pruned:', await p.evaluate(()=>JSON.stringify(JSON.parse('{"playerResponse":{"adPlacements":[1],"x":1},"responseContext":{}}'))));
 console.log('fetch player pruned:', await p.evaluate(async()=>JSON.stringify(await (await fetch('/youtubei/v1/player?key=1',{method:'POST'})).json())));
 console.log('normal JSON untouched:', await p.evaluate(()=>JSON.stringify(JSON.parse('{"adPlacements":1,"keep":2}'))!=='' && JSON.stringify(JSON.parse('{"a":[1,2]}'))));
 // mock player API
 await p.evaluate((VID)=>{const pl=document.getElementById('movie_player'),v=pl.querySelector('video');let t=0,ps=false,track={id:'ko-dub',displayName:'한국어 (자동 더빙)'};window.log=[];
  Object.defineProperty(v,'paused',{get:()=>ps});Object.defineProperty(v,'readyState',{get:()=>4});
  Object.assign(pl,{getVideoData:()=>({video_id:VID,title:'T',author:'A'}),getCurrentTime:()=>t,getDuration:()=>100,getPlaybackQuality:()=>'medium',getAvailableQualityLevels:()=>['hd720','medium','auto'],
   seekTo:(x)=>{t=x;log.push('seek '+x)},playVideo:()=>{ps=false;log.push('play')},pauseVideo:()=>{ps=true},
   getAvailableAudioTracks:()=>[{id:'ko-dub',displayName:'한국어 (자동 더빙)'},{id:'en-orig',displayName:'English (original)',isOriginalTrack:true}],
   getAudioTrack:()=>track,setAudioTrack:(x)=>{track=x;ps=true;log.push('audio '+x.id)}});
  window.setT=x=>{t=x;v.dispatchEvent(new Event('timeupdate'))};},VID);
 await p.evaluate(S('yt-main.user.js')); await p.waitForTimeout(2600);
 console.log('SB url uses prefix:', sbUrl.includes('/skipSegments/'+prefix+'?'), '| krSb:', await p.evaluate(()=>document.documentElement.dataset.krSb));
 await p.evaluate(()=>setT(12)); await p.waitForTimeout(100);
 await p.evaluate(()=>setT(25)); await p.waitForTimeout(100);
 console.log('player log:', await p.evaluate(()=>log.join(' | ')), '| quality list:', await p.evaluate(()=>document.documentElement.dataset.krQList));
 console.log('marks on progress bar:', await p.evaluate(()=>{const b=document.getElementById('kr-prog');return b?b.lastChild.children.length-1:'no bar'}));
 console.log('errors:', errs);
 await b.close();})();

// 전체화면 조작 막대 검증: 탭 → 막대 표시, 10초 앞/뒤, 위치 막대 이동, 재생/일시정지
const { JSDOM } = require('jsdom');
const fs = require('fs');
const dir = require('path').join(__dirname,'../src/');
const dom = new JSDOM('<!doctype html><title>t - YouTube</title><body><div id="movie_player" class="html5-video-player"><video></video></div></body>',
  { url: 'https://m.youtube.com/watch?v=abc', runScripts: 'outside-only' });
const w = dom.window, d = w.document, log = [];
const v = d.querySelector('video');
let paused = false;
Object.defineProperty(v, 'paused', { get: () => paused });
Object.defineProperty(v, 'ended', { get: () => false });
Object.defineProperty(v, 'readyState', { get: () => 4 });
const p = d.getElementById('movie_player');
let yt = 95;
Object.assign(p, { getCurrentTime: () => yt, getDuration: () => 600, getPlaybackQuality: () => 'small', isMuted: () => false,
  seekTo: t => { log.push('YouTube 이동 → ' + t + '초'); yt = t; }, playVideo: () => { log.push('YouTube 재생'); paused = false; },
  pauseVideo: () => { log.push('YouTube 일시정지'); paused = true; } });
const ticks = [];
w.setInterval = f => ticks.push(f);
w.matchMedia = () => ({ matches: true, addEventListener() {} });   // 가로 화면
w.fetch = () => Promise.resolve({ ok: true, json: () => [] });
w.eval(fs.readFileSync(dir + 'yt-page.user.js', 'utf8'));
w.eval(fs.readFileSync(dir + 'yt-main.user.js', 'utf8'));
const tick = () => ticks.forEach(f => f());
tick(); tick();
console.log('전체화면 들어감:', v.parentElement.tagName === 'BODY' ? '예' : '아니오');
v.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
setTimeout(() => {
  const bar = d.getElementById('kr-fsbar');
  tick();
  console.log('탭 후 조작 막대:', bar && bar.style.display === 'block' ? '보임' : '안 보임', '/', bar.querySelector('[data-t]').textContent);
  const click = a => bar.querySelector(`[data-a="${a}"]`).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  click('fwd'); tick(); click('back'); tick(); click('play'); tick(); click('play');
  const r = bar.querySelector('input'); r.value = 300; r.dispatchEvent(new w.Event('input')); r.dispatchEvent(new w.Event('change'));
  tick();
  console.log(log.join('\n'));
  console.log('막대 표시:', bar.querySelector('[data-t]').textContent);
}, 400);

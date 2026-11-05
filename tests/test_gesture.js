// 제스처 검증: 좌우 밀기 → 이동, 왼쪽 위아래 → 밝기, 오른쪽 위아래 → 무시, 밀기 직후 탭 무시
const { JSDOM } = require('jsdom');
const fs = require('fs');
const dir = require('path').join(__dirname,'../src/');
const dom = new JSDOM('<!doctype html><title>t - YouTube</title><head></head><body><div id="movie_player" class="html5-video-player"><video></video></div></body>',
  { url: 'https://m.youtube.com/watch?v=abc', runScripts: 'outside-only' });
const w = dom.window, d = w.document, log = [];
const v = d.querySelector('video');
Object.defineProperty(v, 'paused', { get: () => false });
Object.defineProperty(v, 'ended', { get: () => false });
Object.defineProperty(v, 'readyState', { get: () => 4 });
const p = d.getElementById('movie_player');
let yt = 100;
Object.assign(p, { getCurrentTime: () => yt, getDuration: () => 600, getPlaybackQuality: () => 'small', isMuted: () => false,
  seekTo: t => { log.push('YouTube 이동 → ' + t + '초'); yt = t; } });
const ticks = []; w.setInterval = f => ticks.push(f);
w.matchMedia = () => ({ matches: true, addEventListener() {} });
w.fetch = () => Promise.resolve({ ok: true, json: () => [] });
w.eval(fs.readFileSync(dir + 'yt-page.user.js', 'utf8'));
w.eval(fs.readFileSync(dir + 'yt-main.user.js', 'utf8'));
ticks.forEach(f => f()); ticks.forEach(f => f());
const touch = (type, x, y) => {
  const e = new w.Event(type, { bubbles: true, cancelable: true });
  const list = type === 'touchend' ? [] : [{ clientX: x, clientY: y }];
  Object.defineProperty(e, 'touches', { value: list });
  v.dispatchEvent(e);
  return e;
};
const W = w.innerWidth, H = w.innerHeight;
const swipe = (x1, y1, x2, y2) => { touch('touchstart', x1, y1); touch('touchmove', (x1 + x2) / 2, (y1 + y2) / 2); const m = touch('touchmove', x2, y2); touch('touchend'); return m.defaultPrevented; };
const bright = () => (d.getElementById('kr-fs-bright') || {}).textContent || '(기본)';
const hud = () => (d.getElementById('kr-fs-hud') || {}).textContent;

swipe(200, 300, 200 + W / 3, 300);
console.log('① 오른쪽으로 화면 1/3 밀기 → 화면 안내:', hud(), '/', log.pop());
swipe(800, 300, 800 - W / 9, 300);
console.log('② 왼쪽으로 화면 1/9 밀기 → 화면 안내:', hud(), '/', log.pop());
swipe(100, 500, 100, 500 - H / 3);
console.log('③ 왼쪽 절반 위로 밀기 → 밝기 규칙:', bright(), '/ 안내:', hud());
const before = bright(); const prevented = swipe(900, 500, 900, 300);
console.log('④ 오른쪽 절반 위아래 → 밝기 변화', before === bright() ? '없음' : '있음', '/ 스크롤 막음:', prevented ? '예' : '아니오');
swipe(200, 300, 500, 300);
v.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
setTimeout(() => {
  const bar = d.getElementById('kr-fsbar');
  console.log('⑤ 밀기 직후 탭 → 조작 막대', bar && bar.style.display === 'block' ? '뜸 (문제)' : '안 뜸 (정상)');
}, 450);

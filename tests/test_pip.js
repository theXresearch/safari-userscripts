// 두 손가락 톡 PiP (YouTube·일반 사이트), 버튼 글자 변경, 확대·두 번 탭과의 구분
const { JSDOM } = require('jsdom');
const fs = require('fs');
function run(file, url, label) {
  const dom = new JSDOM(`<!doctype html><body><div id="movie_player" class="html5-video-player"><video src="a.mp4"></video></div></body>`,
    { url, runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window, d = w.document, v = d.querySelector('video'), log = [];
  let mode = 'inline';
  Object.defineProperty(v, 'webkitPresentationMode', { get: () => mode });
  v.webkitSetPresentationMode = m => { log.push('PiP→' + m); mode = m; v.dispatchEvent(new w.Event('webkitpresentationmodechanged')); };
  Object.defineProperty(v, 'readyState', { get: () => 4 });
  Object.defineProperty(v, 'paused', { get: () => false });
  v.getBoundingClientRect = () => ({ left: 0, top: 0, right: 390, bottom: 220, width: 390, height: 220 });
  const ticks = []; w.setInterval = f => ticks.push(f);
  w.matchMedia = () => ({ matches: false, addEventListener() {} });
  w.fetch = () => Promise.resolve({ ok: true, json: () => [] });
  w.GM = { getValue: async (k, dv) => dv, setValue: async () => {} };
  w.eval(fs.readFileSync(file, 'utf8'));
  ticks.forEach(f => { try { f(); } catch (e) {} });
  const T = (x, y) => ({ clientX: x, clientY: y, target: v });
  const fire = (type, touches, changed) => { const e = new w.Event(type, { bubbles: true, cancelable: true }); e.touches = touches; e.changedTouches = changed || touches; v.dispatchEvent(e); return e; };
  const twoTap = (move = 0) => {
    fire('touchstart', [T(150, 100), T(220, 110)]);
    if (move) fire('touchmove', [T(150 - move, 100), T(220 + move, 110)]);
    fire('touchend', [T(220, 110)], [T(150, 100)]);
    return fire('touchend', [], [T(220, 110)]);
  };
  const btn = () => { const b = d.querySelector('#kr-pip, #kw-pip'); return b ? b.textContent : '(버튼 없음)'; };
  console.log('■', label);
  console.log('  처음 버튼:', btn());
  const e1 = twoTap(); console.log('  두 손가락 톡 →', log.slice(-1)[0], '| 버튼:', btn(), '| 일반 탭 막음:', e1.defaultPrevented);
  twoTap(); console.log('  다시 두 손가락 톡 →', log.slice(-1)[0], '| 버튼:', btn());
  const n = log.length; twoTap(60); console.log('  벌려서 확대(움직임) →', log.length === n ? 'PiP 안 바뀜(정상)' : '바뀜(문제)');
  d.querySelector('#kr-pip, #kw-pip').click(); console.log('  PiP 버튼 누름 →', log.slice(-1)[0], '| 버튼:', btn());
  d.querySelector('#kr-pip, #kw-pip').click(); console.log('  다시 누름 →', log.slice(-1)[0], '| 버튼:', btn());
}
run(require('path').join(__dirname,'../src/yt-main.user.js'), 'https://m.youtube.com/watch?v=abcdefghijk', 'YouTube');
run(require('path').join(__dirname,'../src/web-main.user.js'), 'https://example.com/video', '일반 사이트');

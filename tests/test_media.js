// yt-page: 잠금 화면 버튼 연결·제목·진행 막대·활동 시간·창 벗어남 차단 / yt-main: 화면 꺼짐 시 즉시 다음 영상
const { JSDOM } = require('jsdom');
const fs = require('fs');
const page = fs.readFileSync(require('path').join(__dirname,'../src/yt-page.user.js'), 'utf8');
const main = fs.readFileSync(require('path').join(__dirname,'../src/yt-main.user.js'), 'utf8');
function setup(url, hidden) {
  const dom = new JSDOM(`<!doctype html><body><div id="movie_player" class="html5-video-player"><video></video></div></body>`,
    { url, runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window, d = w.document, log = [];
  const handlers = {}; let meta = null, pos = null, state = '';
  Object.defineProperty(w.navigator, 'mediaSession', { value: {
    setActionHandler: (a, f) => { handlers[a] = f; },
    set metadata(m) { meta = m; }, get metadata() { return meta; },
    set playbackState(s) { state = s; }, get playbackState() { return state; },
    setPositionState: p => { pos = p; } } });
  w.MediaMetadata = class { constructor(o) { Object.assign(this, o); } };
  let t = 42;
  const p = d.getElementById('movie_player');
  Object.assign(p, { getCurrentTime: () => t, getDuration: () => 600, getPlaybackQuality: () => 'small',
    getVideoData: () => ({ video_id: 'abcdefghijk', title: '테스트 영상', author: '채널A' }),
    playVideo: () => log.push('YT.play'), pauseVideo: () => log.push('YT.pause'), nextVideo: () => log.push('YT.next'),
    seekTo: x => log.push('YT.seekTo ' + x), isMuted: () => false });
  const v = d.querySelector('video');
  Object.defineProperty(v, 'paused', { get: () => false });
  if (hidden !== undefined) Object.defineProperty(d, 'hidden', { get: () => hidden, configurable: true });
  const intervals = [], timers = [];
  w.setInterval = (f, ms) => intervals.push([f, ms]);
  w.matchMedia = () => ({ matches: false, addEventListener() {} });
  w.fetch = () => Promise.resolve({ ok: true, json: () => [] });
  return { w, d, p, v, log, handlers, intervals, get meta() { return meta; }, get pos() { return pos; }, get state() { return state; } };
}
// --- yt-page ---
{
  const e = setup('https://m.youtube.com/watch?v=abcdefghijk');
  e.w.eval(page);
  for (let i = 0; i < 4; i++) e.intervals.forEach(([f, ms]) => ms === 500 && f());
  console.log('연결된 잠금 화면 버튼:', Object.keys(e.handlers).join(', '));
  console.log('잠금 화면 제목:', e.meta && `${e.meta.title} / ${e.meta.artist} / ${e.meta.artwork[0].src}`);
  console.log('재생 상태:', e.state, '| 진행 막대:', e.pos && `${e.pos.position}/${e.pos.duration}`);
  e.handlers.play(); e.handlers.pause(); e.handlers.nexttrack(); e.handlers.seekforward({}); e.handlers.seekbackward({ seekOffset: 15 }); e.handlers.seekto({ seekTime: 300 }); e.handlers.previoustrack();
  console.log('버튼 → YouTube 기능:', e.log.join(', '));
  e.intervals.forEach(([f, ms]) => ms === 30000 && f());
  console.log('활동 시간 갱신(_lact):', Math.abs(e.w._lact - Date.now()) < 1000 ? '예' : '아니오');
  let got = false; e.w.addEventListener('blur', () => { got = true; });
  e.w.dispatchEvent(new e.w.Event('blur'));
  console.log('창 벗어남(blur) 신호 YouTube에 전달:', got ? '전달됨(문제)' : '차단됨', '| hasFocus:', e.d.hasFocus());
}
// --- Shorts에서 ⏭ ---
{
  const e = setup('https://m.youtube.com/shorts/abcdefghijk');
  e.w.eval(page);
  e.intervals.forEach(([f, ms]) => ms === 500 && f());
  let ev = false; e.d.addEventListener('kr-next-short', () => { ev = true; });
  e.handlers.nexttrack();
  console.log('Shorts ⏭ → yt-main에 다음 편 요청:', ev ? '예' : '아니오');
}
// --- yt-main: 영상 끝 ---
for (const hidden of [true, false]) {
  const e = setup('https://m.youtube.com/watch?v=abcdefghijk', hidden);
  e.w.eval(page); e.w.eval(main);
  e.intervals.forEach(([f, ms]) => ms === 1000 && f());   // ended 감지 연결
  e.v.dispatchEvent(new e.w.Event('ended'));
}
// 실제 iPhone처럼 분리: yt-main만 실행, yt-page 역할은 명령 기록으로 대신
for (const hidden of [true, false]) {
  const e = setup('https://m.youtube.com/watch?v=abcdefghijk', hidden);
  e.d.documentElement.dataset.krPage = '1';
  const cmds = []; e.d.addEventListener('kr-cmd', () => cmds.push(e.d.documentElement.dataset.krCmd));
  e.w.eval(main);
  e.intervals.forEach(([f, ms]) => ms === 1000 && f());
  e.v.dispatchEvent(new e.w.Event('ended'));
  console.log(`[분리] 영상 끝, 화면 ${hidden ? '꺼짐' : '켜짐'} → 즉시 명령:`, cmds.includes('next') ? '다음 영상' : '없음(6초 뒤 확인)');
}

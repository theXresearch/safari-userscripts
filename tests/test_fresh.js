const { JSDOM } = require('jsdom');
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname,'../src/yt-main.user.js'), 'utf8');
const block = src.match(/  const SEEN_MAX[\s\S]*?\n  const SEEN_DAYS[^\n]*\n/)[0] +
  src.match(/  const FEED_ITEM[\s\S]*?\n  \};\n(?=\n  \/\/ =+ 8-3\.)/)[0];
let store = {}, clock = Date.now();
const item = (id, extra = '') => `<ytm-rich-item-renderer><ytm-video-with-context-renderer><a href="/watch?v=${id}">t</a>${extra}</ytm-video-with-context-renderer></ytm-rich-item-renderer>`;
function load(ids, label, opts = {}) {
  const dom = new JSDOM(`<body>${ids.map(i => item(i, opts.watched === i ? '<ytm-thumbnail-overlay-resume-playback-renderer></ytm-thumbnail-overlay-resume-playback-renderer>' : '')).join('')}
    <ytm-reel-item-renderer><a href="/shorts/SHORTxxxxx1">s</a></ytm-reel-item-renderer></body>`, { url: 'https://m.youtube.com/' });
  const w = dom.window;
  Object.entries(store).forEach(([k, v]) => w.localStorage.setItem(k, v));
  // 첫 6개만 화면 안에 보임
  [...w.document.querySelectorAll('ytm-rich-item-renderer, ytm-reel-item-renderer')].forEach((e, i) =>
    e.getBoundingClientRect = () => ({ height: 100, top: i * 100, bottom: i * 100 + 100 }));
  const f = new w.Function('SET', 'loadJson', 'Date', 'innerHeight', 'location', 'document', 'localStorage', block + '; return freshFeed;')({ fresh: true },
    (k, d) => { try { return JSON.parse(w.localStorage.getItem(k)) || d; } catch (e) { return d; } },
    { now: () => clock }, 600, w.location, w.document, w.localStorage);
  f(); f();
  const shown = [...w.document.querySelectorAll('ytm-rich-item-renderer')].filter(e => e.style.display !== 'none').map(e => e.__krId);
  console.log(label.padEnd(26), '보임:', shown.join(' ') || '(없음)');
  store = { krSeen: w.localStorage.getItem('krSeen'), krPos: w.localStorage.getItem('krPos') || '{}' };
}
const A = ['aaaaaaaaaa1','bbbbbbbbbb1','cccccccccc1','dddddddddd1','eeeeeeeeee1'];
store.krPos = JSON.stringify({ eeeeeeeeee1: 300 });
load(A, '1회차 (e=이어보기기록)', { watched: 'dddddddddd1' });
clock += 11 * 60e3; load(A, '2회차 (11분 뒤 새로고침)');
clock += 60e3;      load(A, '2-1 (1분 뒤, 횟수 안 셈)');
clock += 11 * 60e3; load(A, '3회차');
clock += 11 * 60e3; load([...A, 'ffffffffff1', 'gggggggggg1'], '4회차 (+새 영상 f,g)');
clock += 8 * 864e5; load(A, '8일 뒤 (기록 만료)');
console.log('저장 개수:', Object.keys(JSON.parse(store.krSeen)).length);

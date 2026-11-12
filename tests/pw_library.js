// 🎬 영상보기 시험: 받은 영상을 영상보기 페이지로 넘기기, 목록·재생 방식 기억·길게 누름 메뉴(이름 바꾸기·삭제), 🎵 소리만 받기
const pw = require('playwright'), chromium = pw[process.env.BROWSER || 'chromium'];
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const S = n => fs.readFileSync(path.join(__dirname, '../src/', n), 'utf8');
const FX = path.join(__dirname, 'fixtures/hls');
if (!fs.existsSync(path.join(FX, 'alt/master.m3u8'))) execFileSync('sh', [path.join(__dirname, 'make-hls.sh')]);
const MUX = fs.readFileSync(require.resolve('mux.js/dist/mux-mp4.min.js'), 'utf8');
const OUT = path.join(__dirname, 'fixtures/out'); fs.mkdirSync(OUT, { recursive: true });
const LIB = 'https://thexresearch.github.io/safari-userscripts/videos/';
const probe = f => {
  try {
    const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_name,codec_type', '-of', 'json', f], { encoding: 'utf8' }));
    return `streams=${j.streams.map(s => s.codec_type + ':' + s.codec_name).join('+')} dur=${Math.round(+j.format.duration)}`;
  } catch (e) { return 'probe fail'; }
};

(async () => {
  const opts = { viewport: { width: 390, height: 844 }, acceptDownloads: true };
  const persist = process.env.BROWSER === 'webkit';
  const prof = path.join(__dirname, 'fixtures/wk-profile-lib');
  if (persist) fs.rmSync(prof, { recursive: true, force: true });
  const b = persist ? null : await chromium.launch();
  const ctx = persist ? await chromium.launchPersistentContext(prof, opts) : await b.newContext(opts);
  const errors = [];
  await ctx.route('**/*', (r, req) => {
    const u = new URL(req.url());
    if (u.hostname === 'thexresearch.github.io') {
      const f = u.pathname.endsWith('sw.js') ? 'sw.js' : 'index.html';
      return r.fulfill({ contentType: f === 'sw.js' ? 'text/javascript' : 'text/html; charset=utf-8', body: fs.readFileSync(path.join(__dirname, '../docs/videos', f)) });
    }
    if (u.hostname === 'site.test') {
      const src = u.searchParams.get('src');
      return r.fulfill({ contentType: 'text/html; charset=utf-8', body: `<meta charset="utf-8"><meta property="og:title" content="${u.searchParams.get('og') || '테스트 영화'}"><title>x</title><body><video></video><script>fetch(${JSON.stringify(src)}).catch(()=>{})</script></body>` });
    }
    if (u.hostname === 'cdn.test') {
      const fp = path.join(FX, u.pathname.replace(/^\/hls\//, ''));
      if (!fs.existsSync(fp)) return r.fulfill({ status: 404, body: '' });
      return r.fulfill({ headers: { 'access-control-allow-origin': '*' }, contentType: fp.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'application/octet-stream', body: fs.readFileSync(fp) });
    }
    return r.fulfill({ body: '' });
  });
  await ctx.addInitScript(() => {
    // Safari처럼: 새 탭은 누른 그 순간(같은 차례)에만 열림 — 기다린 뒤(await) 열면 막힘
    let g = false;
    document.addEventListener('click', e => { if (e.isTrusted) { g = true; setTimeout(() => { g = false; }, 0); } }, true);
    const o = window.open;
    window.open = function (...a) { return g ? o.apply(this, a) : null; };
    window.GM = { getValue: async (k, d) => { const v = localStorage.getItem('gm:' + k); return v === null ? d : JSON.parse(v); },
                  setValue: async (k, v) => localStorage.setItem('gm:' + k, JSON.stringify(v)) };
  });
  ctx.on('page', pg => pg.on('pageerror', e => errors.push(e.message)));
  const p = ctx.pages()[0] || await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(S('web-page.user.js'));
  const load = async (src, og) => {
    await p.goto('https://site.test/w?src=' + encodeURIComponent(src) + (og ? '&og=' + encodeURIComponent(og) : ''));
    await p.evaluate(MUX); await p.evaluate(S('web-save.user.js'));
    await p.waitForTimeout(1200);
  };
  const waitFor = async (fn, ms = 30000) => { for (let t = 0; t < ms; t += 400) { if (await fn()) return true; await p.waitForTimeout(400); } return false; };
  const btnText = () => p.evaluate(() => (document.getElementById('kw-save') || {}).textContent);
  const sendAndOpen = async () => {
    const [lib] = await Promise.all([ctx.waitForEvent('page', { timeout: 8000 }), p.click('#kw-savelib button')]);   // 진짜 손가락 누름
    await lib.waitForLoadState();
    return lib;
  };
  const siteJobs = () => p.evaluate(() => new Promise(res => { const r = indexedDB.open('kw-save'); r.onsuccess = () => { const q = r.result.transaction('jobs').objectStore('jobs').getAll(); q.onsuccess = () => res(q.result.length); }; }));
  const libFile = (lib, label) => lib.evaluate(async () => {
    const d = await new Promise(r => { const o = indexedDB.open('kw-videos'); o.onsuccess = () => r(o.result); });
    const metas = await new Promise(r => { const q = d.transaction('meta').objectStore('meta').getAll(); q.onsuccess = () => r(q.result); });
    const m = metas.sort((a, b) => b.at - a.at)[0];
    const parts = await new Promise(r => { const q = d.transaction('files').objectStore('files').getAll(IDBKeyRange.bound([m.id, 0], [m.id, Infinity])); q.onsuccess = () => r(q.result); });
    const blob = new Blob(parts);
    const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 32768) s += String.fromCharCode(...buf.subarray(i, i + 32768));
    return { name: m.name, audio: m.audio, b64: btoa(s) };
  }).then(x => { const f = path.join(OUT, 'lib-' + label + (x.audio ? '.m4a' : '.mp4')); fs.writeFileSync(f, Buffer.from(x.b64, 'base64')); return { ...x, f }; });

  // 1. ⬇ 한 번 → 다 받으면 '🎬 영상보기에 넣기' 띠 → 누르면 영상보기 탭이 열리고 영상이 들어감, 사이트 임시 파일은 삭제
  await load('https://cdn.test/hls/v240/index.m3u8', '테스트 영화 ABC-1');
  await p.evaluate(() => document.getElementById('kw-save').click());
  const barShown = await waitFor(() => p.evaluate(() => !!document.getElementById('kw-savelib')));
  await p.waitForTimeout(1200);
  console.log('1 lib bar shown:', barShown, '| button:', await btnText());
  let lib = await sendAndOpen();
  const inLib = await (async () => { for (let i = 0; i < 40; i++) { const t = await lib.evaluate(() => document.getElementById('list').innerText); if (/테스트 영화 ABC-1/.test(t)) return t; await lib.waitForTimeout(300); } return ''; })();
  await p.waitForTimeout(800);
  console.log('1 in library:', !!inLib, '| site temp jobs left:', await siteJobs(), '| bar gone:', await p.evaluate(() => !document.getElementById('kw-savelib')));
  let f = await libFile(lib, 'v');
  console.log('1 stored file:', f.name, '|', probe(f.f));

  // 2. 처음 누르면 '어떻게 볼까요?' → Safari에서 보기(기억) → 다음부터는 바로 재생
  const row = () => lib.evaluate(() => document.querySelector('.row .info').click());
  await row(); await lib.waitForTimeout(300);
  const ask = await lib.evaluate(() => !document.getElementById('sheetWrap').hidden && /어떻게 볼까요/.test(document.getElementById('sheet').innerText));
  await lib.evaluate(() => [...document.querySelectorAll('#sheet .item')].find(b => /Safari에서 바로/.test(b.textContent)).click());
  await lib.waitForTimeout(600);
  const playing = await lib.evaluate(() => !document.getElementById('player').hidden && /^blob:/.test(document.getElementById('video').src));
  await lib.evaluate(() => document.getElementById('pclose').click());
  await row(); await lib.waitForTimeout(500);
  const direct = await lib.evaluate(() => !document.getElementById('player').hidden && document.getElementById('sheetWrap').hidden);
  await lib.evaluate(() => document.getElementById('pclose').click());
  console.log('2 first tap asks:', ask, '| plays in Safari:', playing, '| remembered → direct play:', direct);

  // 3. 길게 누름(메뉴) → 이름 바꾸기 → 삭제(두 번 눌러 완전히)
  const longPress = () => lib.evaluate(() => document.querySelector('.row').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })));
  await longPress(); await lib.waitForTimeout(200);
  const menuItems = await lib.evaluate(() => [...document.querySelectorAll('#sheet .item')].map(b => b.textContent.replace(/\s.*/, '')).join(''));
  lib.once('dialog', d => d.accept('새 이름 테스트'));
  await lib.evaluate(() => [...document.querySelectorAll('#sheet .item')].find(b => /이름 바꾸기/.test(b.textContent)).click());
  await lib.waitForTimeout(600);
  const renamed = /새 이름 테스트/.test(await lib.evaluate(() => document.getElementById('list').innerText));
  await lib.reload(); await lib.waitForTimeout(800);
  const kept = await lib.evaluate(() => document.querySelectorAll('.row').length);
  await longPress(); await lib.waitForTimeout(200);
  const del = () => lib.evaluate(() => [...document.querySelectorAll('#sheet .item')].find(b => /삭제/.test(b.textContent)).click());
  await del(); await lib.waitForTimeout(300);
  const afterOne = await lib.evaluate(() => document.querySelectorAll('.row').length);
  await del(); await lib.waitForTimeout(800);
  const afterTwo = await lib.evaluate(async () => {
    const d = await new Promise(r => { const o = indexedDB.open('kw-videos'); o.onsuccess = () => r(o.result); });
    const n = await new Promise(r => { const q = d.transaction('files').objectStore('files').count(); q.onsuccess = () => r(q.result); });
    return document.querySelectorAll('.row').length + '/' + n;
  });
  console.log('3 menu:', menuItems, '| renamed:', renamed, '| after reload rows:', kept, '| delete 1st tap rows:', afterOne, '| 2nd tap rows/files:', afterTwo);
  await lib.close();

  // 4. 🎵 소리만 (영상·소리가 섞인 TS에서 소리만 꺼냄)
  await load('https://cdn.test/hls/v240/index.m3u8', '소리 시험');
  await p.evaluate(() => document.dispatchEvent(new Event('kw-open-save'))); await p.waitForTimeout(1500);
  await p.evaluate(() => [...document.querySelectorAll('#kw-savepanel button')].find(b => /소리만/.test(b.textContent)).click());
  await waitFor(() => p.evaluate(() => !!document.getElementById('kw-savelib')));
  lib = await sendAndOpen();
  await lib.waitForTimeout(1500);
  f = await libFile(lib, 'audio');
  console.log('4 audio only:', f.name, f.audio, '|', probe(f.f), '| row icon:', await lib.evaluate(() => (document.querySelector('.thumb') || {}).textContent));
  await lib.close();

  // 5. 🎵 소리만 (소리가 따로 있는 화질 목록 → 소리 목록만 받음)
  await load('https://cdn.test/hls/alt/master.m3u8', '따로 소리');
  await p.evaluate(() => document.dispatchEvent(new Event('kw-open-save'))); await p.waitForTimeout(1500);
  await p.evaluate(() => [...document.querySelectorAll('#kw-savepanel button')].find(b => /소리만/.test(b.textContent)).click());
  await waitFor(() => p.evaluate(() => !!document.getElementById('kw-savelib')));
  lib = await sendAndOpen();
  await lib.waitForTimeout(1500);
  f = await libFile(lib, 'alt-audio');
  console.log('5 separate audio:', f.name, '|', probe(f.f));
  // 6. 영상보기 설정
  await lib.evaluate(() => document.getElementById('setBtn').click()); await lib.waitForTimeout(500);
  console.log('6 settings:', await lib.evaluate(() => [...document.querySelectorAll('#sheet .item')].map(b => b.textContent).join(' / ')));
  await lib.close();
  console.log('errors:', JSON.stringify(errors));
  await ctx.close(); if (b) await b.close();
})();

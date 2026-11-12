// 영상 받기(web-save) 시험: 실제 HLS(TS·암호화·fMP4)와 MP4를 받아 파일로 저장 → ffprobe로 확인
// 필요: ffmpeg/ffprobe (시험 영상은 tests/make-hls.sh가 만듦)
const pw = require('playwright'), chromium = pw[process.env.BROWSER || 'chromium'];
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { execFileSync } = require('child_process');
const S = n => fs.readFileSync(path.join(__dirname, '../src/', n), 'utf8');
const FX = path.join(__dirname, 'fixtures/hls');
if (!fs.existsSync(path.join(FX, 'fm/init.mp4'))) execFileSync('sh', [path.join(__dirname, 'make-hls.sh')]);
const MUX = fs.readFileSync(require.resolve('mux.js/dist/mux-mp4.min.js'), 'utf8');
const OUT = path.join(__dirname, 'fixtures/out'); fs.mkdirSync(OUT, { recursive: true });
const sha = b => crypto.createHash('sha1').update(b).digest('hex');
const probe = f => {
  try {
    const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_name,height', '-of', 'json', f], { encoding: 'utf8' }));
    let dec = 'ok';
    try { const e = execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-f', 'null', '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); if (e.trim()) dec = 'errors'; } catch (e) { dec = 'fail'; }
    return `codecs=${j.streams.map(s => s.codec_name).join('+')} h=${(j.streams.find(s => s.height) || {}).height || '-'} dur=${Math.round(+j.format.duration)} decode=${dec}`;
  } catch (e) { return 'probe fail: ' + e.message.split('\n')[0]; }
};
const serve = (route, file, req, cors, range = true) => {
  const fp = path.join(FX, file);
  if (!fs.existsSync(fp)) return route.fulfill({ status: 404, body: 'no' });
  const body = fs.readFileSync(fp), h = cors ? { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'range', 'access-control-expose-headers': 'content-range' } : {};
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: h });
  const ct = file.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'application/octet-stream';
  const m = /bytes=(\d+)-(\d*)/.exec(req.headers().range || '');
  if (m && range) {
    const a = +m[1], b = Math.min(m[2] ? +m[2] : body.length - 1, body.length - 1);
    if (a >= body.length) return route.fulfill({ status: 416, headers: h, body: '' });
    return route.fulfill({ status: 206, headers: Object.assign({ 'content-type': ct, 'content-range': `bytes ${a}-${b}/${body.length}` }, h), body: body.subarray(a, b + 1) });
  }
  return route.fulfill({ status: 200, headers: Object.assign({ 'content-type': ct }, h), body });
};

(async () => {
  // WebKit(Safari 엔진): 일반 탭처럼 저장 공간이 남는 프로필로 (PRIVATE=1이면 개인정보 보호 탭처럼)
  const opts = { viewport: { width: 390, height: 844 }, acceptDownloads: true };
  const persist = process.env.BROWSER === 'webkit' && !process.env.PRIVATE;
  const prof = path.join(__dirname, 'fixtures/wk-profile');
  if (persist) fs.rmSync(prof, { recursive: true, force: true });
  const b = persist ? null : await chromium.launch();
  const ctx = persist ? await chromium.launchPersistentContext(prof, opts) : await b.newContext(opts);
  const errors = [];
  let gmCalls = 0, slow = false;
  await ctx.exposeFunction('gmFetch', (url, range) => {        // GM.xmlHttpRequest 대역: 서버 파일을 직접 읽음 (CORS 없음)
    gmCalls++;
    const u = new URL(url), fp = path.join(FX, u.pathname.replace(/^\/hls\//, ''));
    if (!fs.existsSync(fp)) return { status: 404, b64: '' };
    let body = fs.readFileSync(fp), status = 200, cr = '';
    const m = /bytes=(\d+)-(\d*)/.exec(range || '');
    if (m) { const a = +m[1], e = Math.min(m[2] ? +m[2] : body.length - 1, body.length - 1); cr = `bytes ${a}-${e}/${body.length}`; body = body.subarray(a, e + 1); status = 206; }
    return { status, b64: body.toString('base64'), range: cr };
  });
  await ctx.route('**/*', (r, req) => {
    const u = new URL(req.url());
    if (u.hostname === 'site.test' || u.hostname === 'player.test') {
      const src = u.searchParams.get('src') || '';
      const frame = u.searchParams.get('frame');
      const og = u.searchParams.get('og') || '샘플 영화 ABC-123 정식 제목', src2 = u.searchParams.get('src2') || '';
      const fake = u.searchParams.get('fake');   // 재생 중인 영상 흉내 (길이 fake초, hls.js처럼 blob 주소)
      const fakeJs = fake ? `const fv=document.querySelector('video');Object.defineProperties(fv,{paused:{get:()=>false},duration:{get:()=>${+fake}},currentTime:{get:()=>5},readyState:{get:()=>4},currentSrc:{get:()=>'blob:https://site.test/x'}});` : '';
      const html = frame ? `<meta charset="utf-8"><title>틀 안 영상</title><body><iframe src="https://player.test/p?src=${encodeURIComponent(frame)}" width=320 height=180></iframe></body>`
        : `<meta charset="utf-8"><meta property="og:title" content="${og}"><title>${og} - 예시사이트</title><body><video width=320 height=180></video><p>본문</p>
           <script>${fakeJs}${[src, src2].filter(Boolean).map(x => `fetch(${JSON.stringify(x)}).then(r=>r.text()).catch(()=>{});`).join('')}</script></body>`;
      return r.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
    }
    if (slow && /\/(enc|v240|fm)\/s00[3-9]\.(ts|m4s)$/.test(u.pathname)) return setTimeout(() => serve(r, u.pathname.replace(/^\/hls\//, ''), req, true), 4000);
    if (u.pathname === '/hls/long.m3u8') {   // 같은 조각을 두 번 = 40초짜리 다른 영상
      const pl = fs.readFileSync(path.join(FX, 'v240/index.m3u8'), 'utf8').split('\n');
      const segs = pl.filter(l => /^#EXTINF|^s\d/.test(l)).map(l => (l.startsWith('s') ? 'v240/' + l : l));
      return r.fulfill({ contentType: 'application/vnd.apple.mpegurl', headers: { 'access-control-allow-origin': '*' }, body: ['#EXTM3U', '#EXT-X-TARGETDURATION:2', ...segs, ...segs, '#EXT-X-ENDLIST'].join('\n') });
    }
    if (u.hostname === 'cdn.test') return serve(r, u.pathname.replace(/^\/hls\//, ''), req, true, !u.pathname.includes('norange'));
    if (u.hostname === 'nocors.test') return serve(r, u.pathname.replace(/^\/hls\//, ''), req, false);
    return r.fulfill({ body: '' });
  });
  // 같은 파일을 '범위 무시' 주소로도
  fs.mkdirSync(path.join(FX, 'norange'), { recursive: true });
  fs.copyFileSync(path.join(FX, 'big.mp4'), path.join(FX, 'norange/big.mp4'));

  const p = ctx.pages()[0] || await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(() => {
    const f0 = window.fetch;   // 브라우저의 CORS 차단 흉내: nocors.test는 페이지에서 직접 못 받음
    window.fetch = function (u, ...a) { return /nocors\.test/.test(String(u)) && !window.__pageFetch ? Promise.reject(new TypeError('Load failed')) : f0.call(this, u, ...a); };
  });
  await p.addInitScript(S('web-page.user.js'));
  await p.addInitScript(() => {
    window.__kwSaveCleanMs = 4000;   // 저장 후 임시 파일 자동 삭제를 4초로 (실제 10분)
    window.GM = {
      getValue: async (k, d) => { const v = localStorage.getItem('gm:' + k); return v === null ? d : JSON.parse(v); },
      setValue: async (k, v) => localStorage.setItem('gm:' + k, JSON.stringify(v)),
      xmlHttpRequest(d) {
      window.gmFetch(d.url, (d.headers || {}).Range).then(r => {
        const bin = atob(r.b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        d.onload({ status: r.status, response: u8.buffer, responseHeaders: r.range ? 'content-range: ' + r.range + '\r\n' : '' });
      }, () => d.onerror());
    } };
  });
  const load = async (q, mux = true) => {
    await p.goto('https://site.test/watch?' + q);
    if (mux) await p.evaluate(MUX);
    await p.evaluate(S('web-save.user.js'));
    await p.waitForTimeout(1200);
  };
  const enc = encodeURIComponent;
  const panelText = () => p.evaluate(() => (document.getElementById('kw-savepanel') || {}).innerText || '');
  const tap = txt => p.evaluate(t => { const x = [...document.querySelectorAll('#kw-savepanel button')].find(b => b.textContent.startsWith(t)); if (!x) return false; x.click(); return true; }, txt);
  const press = () => p.evaluate(() => document.getElementById('kw-save').click());          // ⬇ 한 번 누름
  const open = async () => { await p.evaluate(() => document.dispatchEvent(new Event('kw-open-save'))); await p.waitForTimeout(1200); };
  const close = () => p.evaluate(() => { const x = document.getElementById('kw-savepanel'); if (x) x.remove(); });
  // 다 받으면 저절로 저장(다운로드)되는지: fn 실행 후 다운로드를 기다림
  const autoSaved = async (label, fn, timeout = 40000) => {
    try {
      const [d] = await Promise.all([p.waitForEvent('download', { timeout }), fn()]);
      const f = path.join(OUT, label + '-' + d.suggestedFilename());
      await d.saveAs(f);
      return { f, name: d.suggestedFilename(), ok: true };
    } catch (e) { return { ok: false, f: '', name: '', err: e.message.split('\n')[0] }; }
  };
  const cleanAll = async () => { await open(); await tap('▸ ⚙'); await p.waitForTimeout(500); await tap('🧹'); await p.waitForTimeout(800); await close(); };
  const jobsLeft = () => p.evaluate(() => new Promise(res => { const r = indexedDB.open('kw-save'); r.onsuccess = () => { const q = r.result.transaction('jobs').objectStore('jobs').getAll(); q.onsuccess = () => res(q.result.length); }; }));
  let s;
  const jobNames = () => p.evaluate(async () => { const r = indexedDB.open('kw-save'); await new Promise(x => { r.onsuccess = x; }); return new Promise(res => { const q = r.result.transaction('jobs').objectStore('jobs').getAll(); q.onsuccess = () => res(q.result.map(j => j.name).join('|')); }); });

  // A. ⬇ 한 번 → 기본 화질(1080 이하 최고 = 360p)로 받고 영상 제목 그대로 자동 저장
  await load('src=' + enc('https://cdn.test/hls/master.m3u8'));
  console.log('button:', await p.evaluate(() => (document.getElementById('kw-save') || {}).textContent));
  s = await autoSaved('A', press);
  console.log('A one tap → auto saved:', s.ok, '|', s.ok ? probe(s.f) : s.err);
  await open();
  let t = await panelText();
  const aName = await jobNames();
  console.log('A name:', aName + '.mp4', '| saved line:', /✓ 저장한 영상 1개/.test(t) && !/다시 저장/.test(t), '| already:', /이 영상은 이미 받았습니다/.test(t));
  // A2. 다른 화질 고르기 (접힌 '다른 화질로 다시 받기'에서 240p) → 그것도 자동 저장
  await tap('▸ 다른 화질로'); await p.waitForTimeout(600);
  console.log('A2 default ★:', /★ 360p/.test(await panelText()));
  s = await autoSaved('A2', () => tap('240p'));
  console.log('A2 other quality:', s.ok, '|', s.ok ? probe(s.f) : s.err);
  // A3. 저장 후 임시 파일 자동 삭제 (시험에서는 4초 + 확인 주기 10초)
  await close();
  await p.waitForTimeout(13000);
  console.log('A3 temp files auto-deleted → jobs left:', await jobsLeft());

  // B. 암호화 (IV 적힘) / C. 암호화 (조각 순번 IV, 순번 5부터) / D. fMP4 / E. MP4 나눠 받기 / F. 서버가 Range 무시
  const big = sha(fs.readFileSync(path.join(FX, 'big.mp4')));
  for (const [k, u] of [['B', 'enc/index.m3u8'], ['C', 'enc2/index.m3u8'], ['D', 'fm/index.m3u8'], ['E', 'big.mp4'], ['F', 'norange/big.mp4']]) {
    await load('src=' + enc('https://cdn.test/hls/' + u));
    s = await autoSaved(k, press);
    console.log(`${k} ${u}:`, s.ok, '|', !s.ok ? s.err : u.endsWith('.mp4') ? 'same bytes: ' + (sha(fs.readFileSync(s.f)) === big) : probe(s.f));
    await cleanAll();
  }

  // G. 다른 서버가 CORS로 막음 → GM으로 받기
  gmCalls = 0;
  await load('src=' + enc('https://nocors.test/hls/master.m3u8'));
  s = await autoSaved('G', press);
  console.log('G nocors via GM:', s.ok, 'gm calls:', gmCalls, '|', s.ok ? probe(s.f) : s.err);
  await cleanAll();

  // H. 이어받기: 받는 중 멈춤 → 페이지 다시 열기 → 계속
  slow = true;
  await load('src=' + enc('https://cdn.test/hls/enc/index.m3u8'));
  await press();
  await p.waitForTimeout(1000);
  await open(); await tap('멈춤'); await p.waitForTimeout(2000);
  const mid = await p.evaluate(() => (document.querySelector('[data-info]') || {}).textContent);
  slow = false;
  await load('src=' + enc('https://cdn.test/hls/enc/index.m3u8'));
  await open();
  const pausedShown = /멈춤/.test(await panelText());
  s = await autoSaved('H', () => tap('계속'));
  console.log('H after reload:', mid, '→', pausedShown ? 'shows 멈춤' : 'no', '| resumed+saved:', s.ok, '|', s.ok ? probe(s.f) : s.err);
  await cleanAll();

  // H2. 받는 중에 페이지를 닫았다 다시 열면 자동으로 이어받고 저장
  slow = true;
  await load('src=' + enc('https://cdn.test/hls/enc/index.m3u8'));
  await press();
  await p.waitForTimeout(1000);
  slow = false;
  s = await autoSaved('H2', () => load(''));
  console.log('H2 auto resume+save:', s.ok, '|', s.ok ? probe(s.f) : s.err);
  await cleanAll();

  // K. 두 개를 받으면 하나씩 차례로
  await load('src=' + enc('https://cdn.test/hls/v240/index.m3u8') + '&src2=' + enc('https://cdn.test/hls/fm/index.m3u8'));
  await open();
  const downloads = [];
  p.on('download', d => downloads.push(d));
  slow = true;   // 첫 번째가 오래 걸리도록 (enc 아님 → v240 조각을 느리게)
  await p.evaluate(() => { const bs = [...document.querySelectorAll('#kw-savepanel button')].filter(b => b.textContent === '받기'); bs.forEach(b => b.click()); });
  await p.waitForTimeout(2500);
  const kt = await panelText();
  const queued = /차례 기다리는 중/.test(kt);
  slow = false;
  await p.waitForTimeout(20000);
  console.log('K queue:', queued, '| both saved:', downloads.length, '| init.mp4 hidden:', !/init\.mp4/.test(await panelText()));
  await close();
  await cleanAll();

  // L. 저장 공간이 모자라면 시작하지 않음
  await load('src=' + enc('https://cdn.test/hls/master.m3u8'));
  await p.evaluate(() => Object.defineProperty(navigator, 'storage', { configurable: true, value: { estimate: async () => ({ quota: 1000, usage: 900 }), persist: async () => true } }));
  await p.evaluate(() => Object.defineProperty(document.querySelector('video'), 'duration', { get: () => 600 }));
  await press(); await p.waitForTimeout(1500);
  console.log('L low space:', await p.evaluate(() => (document.getElementById('kw-savetoast') || {}).textContent), '| jobs:', await jobsLeft());

  // M. 긴 제목 → 파일 이름 200바이트 이내, 못 쓰는 글자 제거
  await load('src=' + enc('https://cdn.test/hls/v240/index.m3u8') + '&og=' + enc('가'.repeat(120) + ' a/b:c'));
  await open(); await tap('받기'); await p.waitForTimeout(500);
  const nm = await jobNames();
  console.log('M long name bytes<=200:', Buffer.byteLength(nm.replace(/\.(mp4|ts)$/, '')) <= 200, '| no slash:', !/[/:]/.test(nm));
  await close(); await cleanAll();
  console.log('M after clean-all jobs:', await jobsLeft());

  // N. 한 페이지에서 두 재생 목록이 잡힘 → 재생 중인 영상(20초)과 길이가 같은 것만 '이 영상', 40초짜리는 접힌 '다른 영상'
  await load('fake=20&src=' + enc('https://cdn.test/hls/long.m3u8') + '&src2=' + enc('https://cdn.test/hls/v240/index.m3u8'));
  await p.waitForTimeout(2500);
  await open();
  t = await panelText();
  console.log('N main only:', (t.match(/조각 10개/g) || []).length === 1 && !/조각 20개/.test(t), '| others folded:', /함께 잡힌 다른 영상 1개/.test(t));
  await close();
  s = await autoSaved('N', press);
  console.log('N one tap picks watched:', s.ok, '|', s.ok ? probe(s.f) : s.err);
  await open(); await tap('▸ 이 페이지에서'); await p.waitForTimeout(600);
  console.log('N others shown on tap:', /조각 20개/.test(await panelText()));
  await close(); await cleanAll();

  // I. iframe 안 플레이어 → 바깥 페이지 ⬇ 목록에 표시
  await p.goto('https://site.test/x?frame=' + enc('https://cdn.test/hls/v240/index.m3u8'));
  await p.evaluate(MUX); await p.evaluate(S('web-save.user.js'));
  await p.waitForTimeout(1500);
  await open();
  await tap('▸ ⚙'); await p.waitForTimeout(600);
  t = await panelText();
  console.log('I iframe media listed:', /조각 10개/.test(t), '| settings shown:', /기본 화질/.test(t) && /저장 폴더 지정/.test(t) && /받은 영상 모두 삭제/.test(t), '| history:', (t.match(/받은 기록 (\d+)개/) || [])[1]);
  await close();

  // J. MP4 변환기(mux.js)를 못 불러온 경우 → .ts로 저장
  await load('src=' + enc('https://cdn.test/hls/v240/index.m3u8'), false);
  s = await autoSaved('J', press);
  await open();
  const jName = 'fmt=' + await p.evaluate(async () => { const r = indexedDB.open('kw-save'); await new Promise(x => { r.onsuccess = x; }); return new Promise(res => { const q = r.result.transaction('jobs').objectStore('jobs').getAll(); q.onsuccess = () => res(q.result.map(j => j.fmt).join()); }); });
  console.log('J no mux:', s.ok, jName, '|', s.ok ? probe(s.f) : s.err);
  await close(); await cleanAll();
  console.log('errors:', JSON.stringify(errors));
  await ctx.close(); if (b) await b.close();
})();

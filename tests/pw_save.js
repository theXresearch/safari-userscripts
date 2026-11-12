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
    const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_name', '-of', 'json', f], { encoding: 'utf8' }));
    let dec = 'ok';
    try { const e = execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-f', 'null', '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); if (e.trim()) dec = 'errors'; } catch (e) { dec = 'fail'; }
    return `codecs=${j.streams.map(s => s.codec_name).join('+')} dur=${Math.round(+j.format.duration)} decode=${dec}`;
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
      const html = frame ? `<meta charset="utf-8"><title>틀 안 영상</title><body><iframe src="https://player.test/p?src=${encodeURIComponent(frame)}" width=320 height=180></iframe></body>`
        : `<meta charset="utf-8"><title>테스트 영상 | 예시 사이트</title><body><video width=320 height=180></video><p>본문</p>
           <script>${src ? `fetch(${JSON.stringify(src)}).then(r=>r.text()).catch(()=>{})` : ''}</script></body>`;
      return r.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
    }
    if (slow && /\/enc\/s00[3-9]\.ts$/.test(u.pathname)) return setTimeout(() => serve(r, u.pathname.replace(/^\/hls\//, ''), req, true), 1500);
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
    window.GM = { xmlHttpRequest(d) {
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
  const panelText = () => p.evaluate(() => (document.getElementById('kw-savepanel') || {}).innerText || '');
  const tap = txt => p.evaluate(t => { const x = [...document.querySelectorAll('#kw-savepanel button')].find(b => b.textContent.startsWith(t)); if (!x) return false; x.click(); return true; }, txt);
  const open = async () => { await p.evaluate(() => document.getElementById('kw-save').click()); await p.waitForTimeout(1500); };
  const waitDone = async (n = 1) => { for (let i = 0; i < 60; i++) { const t = await panelText(); if ((t.match(/완료 ·/g) || []).length >= n) return true; await p.waitForTimeout(500); } return false; };
  const saveAs = async label => {
    const [d] = await Promise.all([p.waitForEvent('download', { timeout: 10000 }), tap('파일에 저장')]);
    const f = path.join(OUT, label + '-' + d.suggestedFilename());
    await d.saveAs(f);
    return { f, name: d.suggestedFilename() };
  };
  const clean = () => p.evaluate(async () => { for (;;) { const x = [...document.querySelectorAll('#kw-savepanel button')].find(b => b.textContent === '지우기' || b.textContent === '취소'); if (!x) break; x.click(); await new Promise(r => setTimeout(r, 400)); } });

  // A. 화질 목록(master) TS
  await load('src=' + encodeURIComponent('https://cdn.test/hls/master.m3u8'));
  console.log('button:', await p.evaluate(() => (document.getElementById('kw-save') || {}).textContent));
  await open();
  const t = await panelText();
  console.log('panel variants:', (t.match(/\d+p/g) || []).join(','), '| variant playlists hidden:', !/index\.m3u8/.test(t));
  await tap('360p');
  console.log('A done:', await waitDone());
  let s = await saveAs('A');
  console.log('A name in panel:', /테스트 영상 360p\.mp4/.test(await panelText()));
  console.log('A file:', s.name, '|', probe(s.f));
  await clean();

  // B. 암호화 (IV 적힘) / C. 암호화 (조각 순번 IV, 순번 5부터) / D. fMP4
  for (const [k, dir] of [['B', 'enc'], ['C', 'enc2'], ['D', 'fm']]) {
    await load('src=' + encodeURIComponent(`https://cdn.test/hls/${dir}/index.m3u8`));
    await open();
    await tap('받기');
    const ok = await waitDone();
    s = ok ? await saveAs(k) : { f: '', name: '' };
    console.log(`${k} ${dir}:`, ok, s.name.replace(/^.* /, ''), '|', ok ? probe(s.f) : (await panelText()).slice(0, 300));
    await clean();
  }

  // E. MP4 나눠 받기 (Range) / F. 서버가 Range 무시
  const big = sha(fs.readFileSync(path.join(FX, 'big.mp4')));
  for (const [k, u] of [['E', 'https://cdn.test/hls/big.mp4'], ['F', 'https://cdn.test/hls/norange/big.mp4']]) {
    await load('src=' + encodeURIComponent(u));
    await open();
    await tap('받기');
    const ok = await waitDone();
    s = ok ? await saveAs(k) : { f: '' };
    console.log(`${k} mp4:`, ok, s.name, '| same bytes:', ok && sha(fs.readFileSync(s.f)) === big);
    await clean();
  }

  // G. 다른 서버가 CORS로 막음 → GM으로 받기
  gmCalls = 0;
  await load('src=' + encodeURIComponent('https://nocors.test/hls/master.m3u8'));
  await open();
  await tap('240p');
  const g = await waitDone();
  s = g ? await saveAs('G') : { f: '' };
  console.log('G nocors via GM:', g, 'gm calls:', gmCalls, '|', g ? probe(s.f) : await panelText());
  await clean();

  // H. 이어받기: 받는 중 멈춤 → 페이지 다시 열기 → 계속
  slow = true;
  await load('src=' + encodeURIComponent('https://cdn.test/hls/enc/index.m3u8'));
  await open();
  await tap('받기');
  await p.waitForTimeout(900);
  await tap('멈춤');
  await p.waitForTimeout(2000);
  const mid = await p.evaluate(() => (document.querySelector('[data-info]') || {}).textContent);
  slow = false;
  await load('src=' + encodeURIComponent('https://cdn.test/hls/enc/index.m3u8'));
  await open();
  console.log('H after reload:', mid, '→', /멈춤/.test(await panelText()) ? 'shows 멈춤' : 'no', '| 계속:', await tap('계속'));
  const h = await waitDone();
  s = h ? await saveAs('H') : { f: '' };
  console.log('H resumed:', h, '|', h ? probe(s.f) : await panelText());
  await clean();

  // H2. 받는 중에 페이지를 닫았다 다시 열면 자동으로 이어받기
  slow = true;
  await load('src=' + encodeURIComponent('https://cdn.test/hls/enc/index.m3u8'));
  await open();
  await tap('받기');
  await p.waitForTimeout(1000);
  const mid2 = await p.evaluate(() => (document.querySelector('[data-info]') || {}).textContent);
  slow = false;
  await load('');
  await open();
  const h2 = await waitDone();
  console.log('H2 auto resume:', mid2, '→', h2, '| button:', await p.evaluate(() => document.getElementById('kw-save') ? 'shown' : 'none'));
  if (h2) { s = await saveAs('H2'); console.log('H2 file:', probe(s.f)); }
  await clean();

  // I. iframe 안 플레이어 → 바깥 페이지 ⬇ 목록에 표시
  await p.goto('https://site.test/x?frame=' + encodeURIComponent('https://cdn.test/hls/v240/index.m3u8'));
  await p.evaluate(MUX); await p.evaluate(S('web-save.user.js'));
  await p.waitForTimeout(1500);
  await open();
  console.log('I iframe media listed:', /조각 10개/.test(await panelText()));

  // J. MP4 변환기(mux.js)를 못 불러온 경우 → .ts로 저장
  await load('src=' + encodeURIComponent('https://cdn.test/hls/v240/index.m3u8'), false);
  await open();
  await tap('받기');
  const jd = await waitDone();
  const jName = ((await panelText()).match(/[^\n]*\.(ts|mp4)(?=\n)/) || [''])[0];
  s = jd ? await saveAs('J') : { f: '', name: '' };
  console.log('J no mux:', jd, jName, '|', jd ? probe(s.f) : '');
  await clean();
  console.log('storage line:', /저장 공간: 사용/.test(await panelText()));
  console.log('errors:', JSON.stringify(errors));
  await ctx.close(); if (b) await b.close();
})();

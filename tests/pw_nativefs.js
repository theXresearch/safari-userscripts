// 가로 화면에서 Safari 주소창·탭 줄이 영상을 가릴 때: 영상을 탭하면 iPhone 기본 전체화면(webkitEnterFullscreen)
// 주소창이 없을 때(화면 높이 = 기기 짧은 변)는 예전처럼 조작 화면
const { chromium } = require('playwright'); const fs = require('fs');
const S = n => fs.readFileSync(require('path').join(__dirname, '../src/') + n, 'utf8');
(async () => {
  const b = await chromium.launch();
  const run = async (chrome) => {
    const p = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    // iPhone의 screen 크기 (세로 기준 390×844). 가로에서 주소창이 있으면 화면 높이가 390보다 작음
    await p.addInitScript(() => { Object.defineProperty(screen, 'width', { get: () => 390 }); Object.defineProperty(screen, 'height', { get: () => 844 }); });
    await p.route('https://s.test/', r => r.fulfill({ contentType: 'text/html', body: '<div class=plyr><video class=player style="width:390px;height:220px"></video></div>' }));
    await p.goto('https://s.test/'); await p.evaluate(S('web-main.user.js'));
    await p.evaluate(() => { const v = document.querySelector('video'); let ps = false;
      Object.defineProperty(v, 'readyState', { get: () => 4 }); Object.defineProperty(v, 'videoWidth', { get: () => 1280 }); Object.defineProperty(v, 'videoHeight', { get: () => 720 });
      Object.defineProperty(v, 'paused', { get: () => ps }); Object.defineProperty(v, 'duration', { get: () => 600 });
      v.webkitEnterFullscreen = () => { window.nativeFs = (window.nativeFs || 0) + 1; }; });
    await p.setViewportSize({ width: 844, height: chrome ? 300 : 390 }); await p.waitForTimeout(1500);
    const hud = await p.evaluate(() => (document.getElementById('kw-fs-hud') || {}).textContent || '');
    await p.tap('video', { position: { x: 400, y: 150 } }); await p.waitForTimeout(700);
    const r = await p.evaluate(() => [!!document.querySelector('video.kw-fs'), window.nativeFs || 0, (document.getElementById('kw-seek') || { style: {} }).style.display || 'none']);
    await p.close();
    return `pseudo=${r[0]} native=${r[1]} seekbar=${r[2]} hint=${hud}`;
  };
  console.log('with Safari bars:', await run(true));
  console.log('no Safari bars:', await run(false));
  await b.close();
})();

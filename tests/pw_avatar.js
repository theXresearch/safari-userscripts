const { chromium, devices } = require('playwright');
const fs = require('fs');
const px = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>YouTube</title><style>
body{margin:0;background:#0f0f0f;color:#fff;font:15px sans-serif} .item{display:flex;gap:12px;padding:12px}
.av{width:40px;height:40px;flex:none} .av img{width:40px;height:40px;border-radius:50%;background:#c33}
.thumb{width:100%;height:120px;background:#345} .info{flex:1} ytm-pivot-bar-renderer{display:flex;padding:8px} ytm-pivot-bar-renderer img{width:24px;height:24px;background:#3a3;border-radius:50%}
.banner{width:100%;height:80px;background:#335}</style></head><body>
<img class="banner" id="banner" src="https://yt3.googleusercontent.com/banner=w1060">
<ytm-rich-item-renderer><img class="thumb" src="https://i.ytimg.com/vi/abc/hq.jpg" id="thumb">
<div class="item"><a class="av" href="/@ch"><span><img id="logo1" src="https://yt3.ggpht.com/abc=s68"></span></a><div class="info" id="info1"><h3>영상 제목</h3><span>채널 • 2주 전</span></div></div></ytm-rich-item-renderer>
<div class="item" id="owner"><a class="av"><img id="logo2" src="https://yt3.googleusercontent.com/xyz=s88"></a><span>@CH신사임당</span><button>구독</button></div>
<ytm-pivot-bar-renderer><span>홈</span><img id="me" src="https://yt3.ggpht.com/me=s48"><span>내 페이지</span></ytm-pivot-bar-renderer>
</body></html>`;
(async () => {
  const b = await chromium.launch();
  const pg = await (await b.newContext({ ...devices['iPhone 13'] })).newPage();
  await pg.route('https://m.youtube.com/**', r => r.fulfill({ contentType: 'text/html', body: html }));
  await pg.route(/ytimg|yt3/, r => r.fulfill({ contentType: 'image/gif', body: Buffer.from('R0lGODlhAQABAAAAACw=', 'base64') }));
  await pg.goto('https://m.youtube.com/');
  await pg.evaluate(fs.readFileSync(require('path').join(__dirname,'../src/yt-main.user.js'), 'utf8'));
  await pg.waitForTimeout(1300);
  const st = await pg.evaluate(() => {
    const show = id => { const e = document.getElementById(id), r = e.getBoundingClientRect(); return r.width && getComputedStyle(e).visibility !== 'hidden' ? '보임' : '숨김'; };
    return `목록 로고: ${show('logo1')} | 시청화면 채널 로고: ${show('logo2')} | 영상 썸네일: ${show('thumb')} | 채널 배너: ${show('banner')} | 내 페이지 아이콘: ${show('me')} | 제목 칸 시작 위치: ${Math.round(document.getElementById('info1').getBoundingClientRect().left)}px`;
  });
  console.log(st);
  await pg.screenshot({ path: 'avatar.png' });
  await b.close();
})();

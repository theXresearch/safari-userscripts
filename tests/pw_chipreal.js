const { chromium, devices } = require('playwright');
const fs = require('fs');
const outer = process.env.RENAME ? 'zz-related-chips' : 'ytm-related-chip-cloud-renderer';
const inner = process.env.RENAME ? 'zz-chip-cloud' : 'ytm-chip-cloud-renderer';   // RENAME: 이름이 바뀐 경우 (클래스 chip-cloud만 남음)
const html = `<!doctype html><html><head><meta charset="utf-8"><title>t - YouTube</title><style>
body{margin:0;background:#0f0f0f;color:#fff;font:15px sans-serif;padding-top:195px}
.top{position:fixed;top:0;left:0;right:0;height:48px;background:#222;z-index:5}
#player-container-id{position:fixed;top:48px;left:0;right:0;height:147px;background:#345;z-index:4}
.chips-fixed-positioning{display:block;height:0}
.chip-bar{position:fixed;top:195px;left:0;right:0;height:0;overflow:hidden;display:flex;align-items:center;background:#111;z-index:3}
.chips-visible .chip-bar{height:48px}
h2{margin:12px} .acts{height:48px} .item{height:120px;border-bottom:1px solid #444}</style></head><body>
<div class="top">YouTube</div><div id="player-container-id"><div id="movie_player"><video></video></div></div>
<ytm-watch><div class="watch-below-the-player"><ytm-single-column-watch-next-results-renderer><ytm-item-section-renderer>
<ytm-slim-video-metadata-section-renderer><h2 id="title">구글 '알파벳' 상장 이후 최대 폭락</h2><div>@ytnnews24 3시간 전</div><div class="acts">구독</div></ytm-slim-video-metadata-section-renderer>
<${outer} class="chips-fixed-positioning" id="outer"><${inner} class="YtmChipCloudRendererHost chip-bar ${process.env.RENAME ? 'yt-chip-cloud' : ''}">모두 | 정치 뉴스 | 추천</${inner}></${outer}>
${Array.from({ length: 8 }, (_, i) => `<div class="item">관련 영상 ${i + 1}</div>`).join('')}
</ytm-item-section-renderer></ytm-single-column-watch-next-results-renderer></div></ytm-watch></body></html>`;
(async () => {
  const b = await chromium.launch();
  const pg = await (await b.newContext({ ...devices['iPhone 13'], viewport: { width: 262, height: 424 } })).newPage();
  await pg.route('https://m.youtube.com/**', r => r.fulfill({ contentType: 'text/html', body: html }));
  await pg.goto('https://m.youtube.com/watch?v=mmarX8HbzOs');
  await pg.evaluate(fs.readFileSync(require('path').join(__dirname,'../src/yt-main.user.js'), 'utf8'));
  const st = () => pg.evaluate(() => {
    const tt = document.getElementById('title'), r = tt.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + 20, r.top + r.height / 2);
    return `제목 ${Math.round(r.top)} → ${top && (tt === top || tt.contains(top)) ? '제목 보임' : '덮임(' + (top && top.textContent.trim().slice(0, 12)) + ')'}`;
  });
  await pg.waitForTimeout(700); console.log('처음 재생       :', await st());
  await pg.mouse.wheel(0, 300); await pg.waitForTimeout(300);
  await pg.evaluate(() => document.getElementById('outer').classList.add('chips-visible'));
  await pg.waitForTimeout(800); await pg.mouse.wheel(0, -300); await pg.waitForTimeout(800);
  console.log('내렸다 다시 올림:', await st());
  await b.close();
})();

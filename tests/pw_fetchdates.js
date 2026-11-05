const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage();
  await pg.route('https://m.youtube.com/watch*', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }));
  await pg.route('**/youtubei/v1/next*', r => r.fulfill({ contentType: 'application/json',
    body: JSON.stringify({ contents: { items: [{ videoRenderer: { videoId: 'NEWVIDEO001', publishedTimeText: { simpleText: '2일 전' } } }] } }) }));
  await pg.goto('https://m.youtube.com/watch?v=abcdefghijk');
  await pg.evaluate(fs.readFileSync(require('path').join(__dirname,'../src/yt-page.user.js'), 'utf8'));
  const got = await pg.evaluate(async () => {
    const r = await fetch('/youtubei/v1/next?prettyPrint=false', { method: 'POST', body: '{}' });
    const j = await r.json();                       // YouTube가 받는 응답은 그대로여야 함
    await new Promise(res => setTimeout(res, 300));
    return { ytReceived: j.contents.items[0].videoRenderer.videoId, dates: document.documentElement.dataset.krDates };
  });
  console.log('YouTube가 받은 응답:', got.ytReceived, '(그대로 전달됨) | 모은 게시일:', got.dates);
  await b.close();
})();

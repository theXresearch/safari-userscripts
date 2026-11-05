// src/*.user.js 의 머리말(==UserScript== 부분)만 뽑아 src/*.meta.js 로 저장
// Userscripts 앱은 @updateURL(작은 .meta.js)로 새 버전을 확인하고, @downloadURL(.user.js)에서 내려받음
// 실행: node tools/make-meta.js   (버전을 바꾼 뒤 꼭 실행. 시험에서 일치 여부 확인)
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '../src');
for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.user.js'))) {
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  const m = src.match(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\n/);
  if (!m) throw new Error('머리말 없음: ' + f);
  fs.writeFileSync(path.join(dir, f.replace('.user.js', '.meta.js')), m[0]);
  console.log('meta:', f);
}

// 모든 시험을 차례로 실행하고, 각 시험의 출력에 '기대하는 결과'가 들어 있는지 확인
// 실행: node tests/run-all.js   (필요: npm i && npx playwright install chromium)
const { execFileSync } = require('child_process');
const path = require('path');

// 시험 파일 → 출력에 반드시 있어야 하는 내용
const EXPECT = {
  // ── YouTube ──
  pw_phase1: [/initial PR keys: videoDetails/, /fetch player pruned: \{"streamingData"/, /SB url uses prefix: true/,
              /player log: audio en-orig \| play \| seek 20/, /marks on progress bar: 1/, /errors: \[\]/],
  pw_settings: [/buttons: PiP,240p,1\.25x,⚙/, /chan speeds: \{"강의채널":1\.5\}/, /other channel label: 1\.25x/,
                /back to 강의채널 label: 1\.5x/, /after off: like= inline endcard= block/, /errors: \[\]/],
  pw_phase3: [/gear label: 🌙 영상 끝/, /SB refetch cats: \["selfpromo"/, /sleep end → cmds: 1 pause \| gear after: ⚙/,
              /double-tap cmds: .*seek:90.*seek:110/, /web fs double-tap: left→ 90 \| right x2→ 110 \| middle exits fs: true → false/, /errors: \[\]/],
  pw_phase4: [/✓ 광고 일정 1건 제거/, /✓ 원래 음성으로 바꿈/, /✓ 자막 켬: 한국어/, /✓ 화면 구조 정상/, /버전 2026\.11\.12\.1/,
              /shorts link click → \/watch\?v=SHORTSID001/, /open shorts URL → \/watch\?v=SHORTSID002/,
              /✓ 실드 켜짐 · 막은 광고 창·이동 1번/, /지운 광고 1개/, /dark after off: false/, /open from 🚫 bar event: true/, /errors: \[\]/],
  pw_swipeback: [/short drag 80px: .*after: \/watch \| transform none/, /sideways drag: .*still \/watch/, /long drag 320px: .*after: \/ \| home visible: true/, /errors: \[\]/],
  pw_ytmenu: [/menu: 자동 \| 1080p/, /after pick: quality::hd720/, /speed menu: .*✓ 1\.25x/],
  pw_fetchdates: [/모은 게시일: \{"NEWVIDEO001":"2일 전"\}/],
  pw_avatar: [/목록 로고: 숨김 \| 시청화면 채널 로고: 숨김 \| 영상 썸네일: 보임/],
  pw_chipreal: [/내렸다 다시 올림: 제목 \d+ → 제목 보임/],
  test_fsbar: [/막대 표시: 5:00 \/ 10:00/],
  test_gesture: [/YouTube 이동 → 130초/, /밀기 직후 탭 → 조작 막대 안 뜸/],
  test_fresh: [/저장 개수: 7/],
  test_media: [/YT\.play, YT\.pause, YT\.next/, /화면 꺼짐 → 즉시 명령: 다음 영상/],
  test_pip: [/다시 누름 → PiP→inline/],
  // ── 일반 사이트 ──
  pw_save: [/panel variants: 360p,240p \| variant playlists hidden: true/, /A name in panel: true/, /A file: .*codecs=h264\+aac dur=20 decode=ok/,
            /B enc: true .*dur=20 decode=ok/, /C enc2: true .*dur=20 decode=ok/, /D fm: true .*dur=20 decode=ok/,
            /E mp4: true .*same bytes: true/, /F mp4: true .*same bytes: true/, /G nocors via GM: true gm calls: 1\d .*decode=ok/,
            /H after reload: [1-8]\d% .*shows 멈춤/, /H resumed: true .*dur=20 decode=ok/, /H2 auto resume: .*→ true/, /H2 file: .*dur=20 decode=ok/,
            /I iframe media listed: true/, /J no mux: true .*\.ts .*decode=ok/, /errors: \[\]/],
  'pw_save@webkit': 'pw_save',
  'pw_save@webkit-private': 'pw_save',
  pw_shield: [/shield on → url: https:\/\/missav\.test\/ popups: \[\]/, /real link → https:\/\/news\.example\.org/],
  pw_all: [/cam video removed: true/, /landscape: player kw-fs/],
  pw_cam: [/cams=0 camwrap=none preview=true/],
  pw_hdr: [/quick rotate back: hdr:visible/],
  pw_hdr2: [/hdr:block live:none m3u8:block/],
  pw_m3u8: [/popup opened: \[ 'https:\/\/wiselife\.blog/, /navigated to: https:\/\/wiselife\.blog/],
  pw_q: [/picked → label 480p plyr q=480/, /outside click closes: true/],
  pw_bar: [/mode=flow/, /play handler survived: played/],
  pw_ui: [/enter fs   : seek=none play=none tools=0/, /tap center : .*paused=true/, /portrait   : .*hdr=visible/],
  pw_land: [/player kw-fs \| block/, /ad paused: true/],
  pw_pop: [/after play: \[\]/, /after overlay: \[\]/]
};

let failed = 0;
// 업데이트용 .meta.js가 .user.js 머리말과 같은지 (버전을 바꾸고 tools/make-meta.js를 안 돌린 경우 잡기)
const fs = require('fs');
for (const f of fs.readdirSync(path.join(__dirname, '../src')).filter(n => n.endsWith('.user.js'))) {
  const head = (fs.readFileSync(path.join(__dirname, '../src', f), 'utf8').match(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\n/) || [''])[0];
  const metaPath = path.join(__dirname, '../src', f.replace('.user.js', '.meta.js'));
  const ok = fs.existsSync(metaPath) && fs.readFileSync(metaPath, 'utf8') === head;
  if (!ok) { failed++; console.log(`✗ ${f}: .meta.js가 없거나 머리말과 다름 → node tools/make-meta.js`); } else console.log(`✓ ${f} 머리말 = .meta.js`);
}
// 'pw_save@webkit' = 같은 시험을 WebKit(Safari 엔진)으로, '-private' = 개인정보 보호 탭처럼
for (const [name, spec] of Object.entries(EXPECT)) {
  const [file, br] = name.split('@'), checks = typeof spec === 'string' ? EXPECT[spec] : spec;
  const env = Object.assign({}, process.env, br ? { BROWSER: br.replace('-private', ''), PRIVATE: br.endsWith('-private') ? '1' : '' } : {});
  let out = '';
  try {
    out = execFileSync(process.execPath, [path.join(__dirname, file + '.js')], { encoding: 'utf8', timeout: 300000, env, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) { out = (e.stdout || '') + (e.stderr || '') + '\n' + e.message; }
  const miss = checks.filter(re => !re.test(out));
  if (miss.length) {
    failed++;
    console.log(`✗ ${name}\n   빠진 결과: ${miss.map(String).join(', ')}\n   출력:\n${out.split('\n').map(l => '     ' + l).join('\n')}`);
  } else console.log(`✓ ${name}`);
}
console.log(failed ? `\n${failed}개 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);

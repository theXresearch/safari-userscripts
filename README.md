# Safari Userscripts — iPhone에서 ReVanced처럼 YouTube 보기

iPhone Safari의 [Userscripts](https://apps.apple.com/app/userscripts/id1463298887) 앱에서 쓰는 스크립트 모음입니다.
YouTube(m.youtube.com)를 ReVanced처럼 쓰게 해 주고, 일반 사이트의 영상 보기와 광고 처리를 개선하며, 영상(M3U8·MP4)을 폰에 받아 데이터 없이 나중에 볼 수 있게 합니다.

## 설치

1. App Store에서 **Userscripts** 앱을 설치하고 Safari 확장 프로그램으로 켭니다. 모든 웹사이트에서 허용해야 합니다.
2. iPhone Safari에서 아래 링크를 하나씩 열고 Userscripts 메뉴에서 **설치**를 누릅니다.

| 파일 | 대상 | 하는 일 |
|---|---|---|
| [yt-main.user.js](https://raw.githubusercontent.com/theXresearch/safari-userscripts/main/src/yt-main.user.js) | YouTube | 버튼(PiP·화질·속도 메뉴), 광고 건너뛰기, 스폰서 구간 정보, 다음 영상·Shorts 연속재생, 진행 막대(스폰서 구간 노란색 표시), 홈 화면 새 영상 우선, 게시일 표시, 화면 정리, 가로 회전 전체화면, 1시간 휴식 |
| [yt-page.user.js](https://raw.githubusercontent.com/theXresearch/safari-userscripts/main/src/yt-page.user.js) | YouTube | 광고 일정 미리 빼기, 자동 더빙 끄기(원래 음성), 스폰서 구간 건너뛰기, 백그라운드 재생(화면 숨김 감지 차단), 잠금 화면 버튼, '계속 시청' 방지 |
| [web-main.user.js](https://raw.githubusercontent.com/theXresearch/safari-userscripts/main/src/web-main.user.js) | 일반 사이트 | 영상 아래 버튼 줄, 두 번 탭·가로 회전 전체화면(탭하면 진행 막대), 벌려서 확대, 두 손가락 톡 PiP, 복사 방지 해제, 다크 모드 |
| [web-page.user.js](https://raw.githubusercontent.com/theXresearch/safari-userscripts/main/src/web-page.user.js) | 일반 사이트 | 실드(광고 새 창·몰래 이동 차단), 백그라운드 재생, 화질 적용, hls.js 늦은 로딩 대비 |
| [web-adblock.user.js](https://raw.githubusercontent.com/theXresearch/safari-userscripts/main/src/web-adblock.user.js) | 일반 사이트 | 광고망·광고 칸·라이브캠 광고 제거, 🚫 직접 숨김, 사이트별 실드 켜기/끄기 |
| [web-save.user.js](https://raw.githubusercontent.com/theXresearch/safari-userscripts/main/src/web-save.user.js) | 일반 사이트 | ⬇ 한 번에 영상 받기·자동 저장(제목 그대로, 1080p 기본): M3U8(HLS)·MP4, 다른 화질 선택, 암호화(AES-128) 해독, MP4 변환, 이어받기, 차례 받기, 임시 파일 자동 삭제 |

YouTube용 2개와 일반 사이트용 4개는 짝으로 동작합니다. 각각 함께 설치하세요. (web-save는 web-page가 찾은 영상 주소를 씁니다)

## 업데이트

모든 파일에 `@version`, `@updateURL`(작은 `.meta.js`), `@downloadURL`(`.user.js`)이 들어 있습니다.
Userscripts 확장 프로그램이 주기적으로 새 버전을 확인하고, 찾으면 **Safari 주소창의 확장 프로그램 메뉴 → Userscripts** 창에
**업데이트 표시**가 나타납니다. 거기서 업데이트를 누르면 받아집니다. (Userscripts 앱 자체에는 업데이트 버튼이 없습니다)
확인 주기를 기다리지 않으려면 위 설치 링크를 다시 열어 설치해도 됩니다 — 설정은 그대로 유지됩니다.

개발: 버전을 바꾼 뒤 `node tools/make-meta.js`로 `.meta.js`를 다시 만듭니다 (시험에서 일치 여부를 확인).

## 조작법

**YouTube**
- 두 손가락으로 영상을 톡 → PiP, 다시 톡 → 복귀
- 시청 화면에서 영상을 잡고 아래로 끌어내리기 → 보던 목록으로 돌아감 (YouTube 앱 방식)
- 가로로 돌리면 전체화면, 영상을 탭하면 조작 막대 표시, 옆으로 밀면 앞뒤 이동, 왼쪽 절반을 위아래로 밀면 밝기 조절
- 전체화면에서 화면 왼쪽 1/3을 두 번 탭 → 10초 뒤로, 오른쪽 1/3 → 10초 앞으로
- 화면을 끈 채 계속 들으려면 PiP 상태에서 홈 화면으로 간 뒤 잠그기

**일반 사이트**
- 영상을 두 번 탭하거나 가로로 돌리면 전체화면. 전체화면에서 왼쪽·오른쪽 1/3 두 번 탭 = 10초 이동, 가운데 두 번 탭 = 끄기. 전체화면에서 한 번 탭하면 진행 막대·재생 버튼이 나타났다가 3초 뒤 사라짐
- 🚫 → 광고 탭 → 한 번 더 탭하면 그 사이트에서 영구 숨김. 🛡 버튼으로 그 사이트의 실드 끄기

**영상 받기 (⬇)**
1. 영상을 한 번 재생합니다 (재생해야 주소가 잡힙니다).
2. 영상 아래 버튼 줄의 **⬇를 한 번** 누르면 끝입니다: 기본 화질(1080p 이하에서 가장 좋은 것)로 받고, 다 받으면 **영상 제목 그대로 자동 저장**합니다. Safari가 "다운로드할까요?"를 물으면 다운로드를 누릅니다.
3. 저장하고 10분 뒤 Safari 안의 임시 파일은 자동으로 지워집니다.
4. 다른 화질은 받는 중에 ⬇를 누르거나 ⬇를 길게 누르면 열리는 화면에서 고릅니다 (★ = 기본 화질). 여러 개를 고르면 하나씩 차례로 받습니다.
5. 받는 동안 페이지를 열어 두세요. 화면은 자동으로 켜져 있습니다. 끊기거나 페이지를 닫아도 다시 열면 이어받습니다.

**🎬 영상보기** ([theXresearch.github.io/safari-userscripts/videos](https://thexresearch.github.io/safari-userscripts/videos/)) — Safari 안의 내 영상 목록
- 다 받으면 화면 아래 **🎬 영상보기에 넣기**를 한 번 누르면 영상보기 탭이 열리며 영상이 들어가고, 사이트 쪽 임시 파일은 바로 지워집니다.
- 영상을 누르면 처음 한 번 "Safari에서 보기 / 다른 앱(VLC 등)으로 열기"를 묻고 기억합니다 (영상보기 ⚙에서 변경). 본 곳부터 이어 봅니다.
- 길게 누르면 메뉴: 보기, 다른 앱으로 열기, 공유, 파일 앱에 저장, 이름 바꾸기, 삭제(두 번 눌러 완전히 지움).
- 즐겨찾기에 두면 인터넷 없이도 열립니다. Safari는 오래 열지 않은 사이트 데이터를 지울 수 있으니, 오래 둘 영상은 "파일 앱에 저장"으로 옮기세요.
- 저장할 곳을 **파일 앱**으로 바꾸면 예전처럼 다 받는 즉시 파일 앱에 자동 저장됩니다.

**🎵 소리만 받기**: ⬇ 화면에서 영상마다 **🎵 소리만**. 소리가 따로 있으면 그것만, 아니면 가장 낮은 화질을 받아 소리만 꺼내 .m4a로 저장합니다 (데이터 절약).

**받기 설정** (⬇ 화면 아래, 모든 사이트 공통): 저장할 곳(영상보기·파일 앱), 기본 화질(최고·1080·720·480·360), ⬇ 한 번에 바로 받기, 자동 저장, 저장 후 임시 파일 자동 삭제, 🧹 임시 파일 모두 지우기, 🗑 받은 영상 모두 삭제, 받은 기록.

**저장 폴더 지정** (한 번만): iPhone Settings → Apps → Safari → Downloads → **On My iPhone** 안의 폴더(예: "영상")를 고릅니다.
iCloud Drive를 고르면 영상이 iCloud로 올라가 데이터·용량을 씁니다. 같은 화면의 **Remove Download List Items → Upon Successful Download**로 두면 Safari 다운로드 목록도 자동으로 비워집니다.

**🗑 받은 영상 모두 삭제 준비** (한 번만, 웹페이지는 파일 앱 파일을 직접 지울 수 없어 단축어를 씀):
Shortcuts 앱 → + → 이름 "영상 모두 삭제" → Get Contents of Folder(저장 폴더) → Filter Files(File Extension: mp4·m4a·ts) → Delete Files.

## 설정 (YouTube 버튼 줄의 ⚙)

| 항목 | 기본 |
|---|---|
| 광고 일정 미리 빼기 (YouTube가 광고 차단 경고를 띄우면 끄기) | 켜짐 |
| 자동 더빙 끄기 (원래 음성) | 켜짐 |
| 스폰서 구간 건너뛰기 | 켜짐 |
| 채널별 속도 기억 (속도를 고르면 그 채널에만 적용) | 켜짐 |
| 홈: 본 영상·반복 영상 숨김 | 켜짐 |
| 1시간 연속 재생 시 휴식 | 켜짐 |
| 좋아요·댓글·채널 로고 숨김 | 켜짐 |
| 영상 위 추천·정보 카드 숨김 | 켜짐 |
| 🌙 취침 타이머 (15·30·60분 / 이 영상 끝나면) | 끔 |
| Shorts를 일반 화면으로 열기 | 끔 |
| 영상을 아래로 내려 이전 화면으로 | 켜짐 |
| 자막 자동 켜기 (한국어 / English, 없으면 자동 번역) | 끔 |
| 스폰서 구간 범주 (광고·자기 홍보·구독 요청·인트로·아웃트로·미리보기·음악 잡담·본론 외 잡담) | 본론 외 잡담만 끔 |

⚙ 맨 아래 **작동 상태**에서 광고 일정 제거 수, 원래 음성·자막 적용, 스폰서 구간, 속도, 잠금 화면 연결, YouTube 화면 구조 이상(⚠)을 바로 확인할 수 있습니다. 문제가 생기면 이 화면 스크린샷을 보내면 됩니다.

**일반 사이트 ⚙** (영상 버튼 줄 또는 🚫 줄): 다크 모드, 복사·선택 방지 해제, 가로 자동 전체화면, 안 보이는 영상 자동 정지를 켜고 끄고, 작동 상태(실드로 막은 횟수, 지운 광고 수, 영상·화질 정보)를 봅니다.

반복 노출 횟수(`SEEN_MAX`), 휴식 간격(`BREAK_MS`)은 `yt-main.user.js` 위쪽에서 바꿀 수 있습니다.

## 알려진 한계

- **백그라운드 재생**: 2026년 초부터 YouTube가 모바일 브라우저의 백그라운드 재생을 막고 있습니다. 화면 숨김 감지 차단으로 대응하지만, 가장 확실한 방법은 PiP입니다.
- **영상에 붙여 보내는 광고(SSAP)**: 미리 뺄 수 없어서 '건너뛰기' 버튼으로 대응합니다.
- **YouTube 화면 구조 변경**: m.youtube.com 구조가 바뀌면 일부 숨김 기능이 동작하지 않을 수 있습니다.
- **영상 받기**: YouTube 영상은 받지 않습니다 (YouTube 약관, 오프라인 저장은 YouTube Premium). 실시간 방송, DRM(FairPlay·SAMPLE-AES) 보호 영상은 받을 수 없습니다. 소리가 따로 나오는 영상은 영상·소리 두 파일로 저장됩니다. 받는 중 화면을 끄거나 다른 앱으로 가면 iPhone이 멈추게 하므로, 돌아오면 이어서 받습니다. 개인정보 보호 탭에서는 큰 영상이 메모리 부족으로 실패할 수 있습니다.
- **Chrome 대안**: iPhone의 Chrome은 확장 프로그램·유저스크립트를 지원하지 않아 Safari보다 기능이 적습니다. 이 스크립트는 Safari 전용입니다.

## 개발

```bash
npm install
npx playwright install chromium webkit   # webkit = Safari 엔진
npm run lint
npm test        # tests/run-all.js — 시험 28개 (가짜 페이지 + 실제 HLS 영상 받기, ffmpeg 필요)
```

GitHub에 올리면(push) 자동으로 시험이 돌아갑니다(`.github/workflows/test.yml`).

### 참고한 공개 자료
- SponsorBlock k-익명 조회: https://github.com/ajayyy/SponsorBlock/wiki/K-Anonymity
- 광고 일정 미리 빼기(json-prune 방식): uBlock Origin / AdGuard YouTube 규칙
- 원래 음성 고정: Greasy Fork "YouTube Original Audio Priority"
- HLS → MP4 변환: [mux.js](https://github.com/videojs/mux.js) (Apache-2.0, `@require`로 불러옴). 받기 방식은 Momo707577045/m3u8-downloader, Greasy Fork "StreamGrabber" 참고

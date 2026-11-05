# Safari Userscripts — iPhone에서 ReVanced처럼 YouTube 보기

iPhone Safari의 [Userscripts](https://apps.apple.com/app/userscripts/id1463298887) 앱에서 쓰는 스크립트 모음입니다.
YouTube(m.youtube.com)를 ReVanced처럼 쓰게 해 주고, 일반 사이트의 영상 보기와 광고 처리도 개선합니다.

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

YouTube용 2개와 일반 사이트용 3개는 짝으로 동작합니다. 각각 함께 설치하세요.

## 업데이트

모든 파일에 `@version`과 `@updateURL`이 들어 있습니다. 이 저장소에 새 버전이 올라오면
**Userscripts 앱 → 업데이트 확인**으로 받을 수 있습니다. 파일을 다시 설치할 필요가 없습니다.

## 조작법

**YouTube**
- 두 손가락으로 영상을 톡 → PiP, 다시 톡 → 복귀
- 가로로 돌리면 전체화면, 영상을 탭하면 조작 막대 표시, 옆으로 밀면 앞뒤 이동, 왼쪽 절반을 위아래로 밀면 밝기 조절
- 화면을 끈 채 계속 들으려면 PiP 상태에서 홈 화면으로 간 뒤 잠그기

**일반 사이트**
- 영상을 두 번 탭하거나 가로로 돌리면 전체화면. 전체화면에서 한 번 탭하면 진행 막대·재생 버튼이 나타났다가 3초 뒤 사라짐
- 🚫 → 광고 탭 → 한 번 더 탭하면 그 사이트에서 영구 숨김. 🛡 버튼으로 그 사이트의 실드 끄기

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

스폰서 구간 범주(`SB_CATS`), 반복 노출 횟수(`SEEN_MAX`), 휴식 간격(`BREAK_MS`)은 `yt-main.user.js` 위쪽에서 바꿀 수 있습니다.

## 알려진 한계

- **백그라운드 재생**: 2026년 초부터 YouTube가 모바일 브라우저의 백그라운드 재생을 막고 있습니다. 화면 숨김 감지 차단으로 대응하지만, 가장 확실한 방법은 PiP입니다.
- **영상에 붙여 보내는 광고(SSAP)**: 미리 뺄 수 없어서 '건너뛰기' 버튼으로 대응합니다.
- **YouTube 화면 구조 변경**: m.youtube.com 구조가 바뀌면 일부 숨김 기능이 동작하지 않을 수 있습니다.

## 개발

```bash
npm install
npx playwright install chromium
npm run lint
npm test        # tests/run-all.js — 시험 22개 (가짜 페이지로 동작 확인)
```

GitHub에 올리면(push) 자동으로 시험이 돌아갑니다(`.github/workflows/test.yml`).

### 참고한 공개 자료
- SponsorBlock k-익명 조회: https://github.com/ajayyy/SponsorBlock/wiki/K-Anonymity
- 광고 일정 미리 빼기(json-prune 방식): uBlock Origin / AdGuard YouTube 규칙
- 원래 음성 고정: Greasy Fork "YouTube Original Audio Priority"

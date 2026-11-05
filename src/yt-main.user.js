// ==UserScript==
// @name         YT Main
// @namespace    https://github.com/theXresearch/safari-userscripts
// @version      2026.11.05.7
// @author       theXresearch
// @updateURL    https://raw.githubusercontent.com/theXresearch/safari-userscripts/main/src/yt-main.meta.js
// @downloadURL  https://raw.githubusercontent.com/theXresearch/safari-userscripts/main/src/yt-main.user.js
// @description  YouTube: ⚙ 설정·작동 상태, 속도(채널별)·화질·PiP 버튼, 취침 타이머, Shorts를 일반 화면으로, 두 손가락 톡 PiP, 광고 건너뛰기, 소리 켜기, 스폰서 건너뛰기, 다음 영상·Shorts 연속재생(화면 꺼짐 포함), 잠금 화면 버튼, 하단 진행 막대, 홈 화면 새 영상 우선(본 영상·반복 영상 숨김), 목록·시청 화면에 조회수 대신 게시일, 채널 로고·좋아요·댓글·필터 칩 숨김, 아래로 내리면 영상도 위로, Shorts 화면 정리, 1시간 휴식, 가로 회전 시 전체화면(조작 막대·밀어서 이동·밝기)
// @match        *://*.youtube.com/*
// @run-at       document-start
// ==/UserScript==
(function () {
  'use strict';
  if (window.top !== window.self) return;   // 다른 사이트에 삽입된 YouTube(iframe)에서는 실행 안 함 (주소 이동으로 깨지지 않게)
  // 원칙: YouTube 재생에 끼어들지 않음. 플레이어는 '사용자가 누른 순간'과 '꼭 필요한 한 번'만 건드림.

  // ================= 0. 모바일 버전 고정 (www → m) =================
  if (location.hostname === 'www.youtube.com' && !/[?&]app=m/.test(location.search)) {
    const u = new URL(location.href);
    u.hostname = 'm.youtube.com';
    u.searchParams.set('app', 'm');
    u.searchParams.set('persist_app', '1');
    location.replace(u.toString());
    return;
  }

  // ================= 설정 =================
  const SPEEDS = [1, 1.25, 1.5, 1.75, 2];               // YouTube 자체 속도 값만 사용
  const QHEIGHT = { hd2160: 2160, hd1440: 1440, hd1080: 1080, hd720: 720, large: 480, medium: 360, small: 240, tiny: 144 };   // 높은 화질부터
  const QNAME = Object.assign({ auto: '자동' }, ...Object.entries(QHEIGHT).map(([k, v]) => ({ [k]: v + 'p' })));
  // 스폰서 구간 범주 (⚙에서 각각 켜고 끔). [이름, 표시, 기본값]
  const SB_ALL = [['sponsor', '광고', 1], ['selfpromo', '자기 홍보', 1], ['interaction', '구독·좋아요 요청', 1], ['intro', '인트로', 1],
    ['outro', '아웃트로', 1], ['preview', '미리보기·요약', 1], ['music_offtopic', '음악 영상 잡담', 1], ['filler', '본론 외 잡담', 0]];
  const NEXT_WAIT = 6000;                  // 끝난 뒤 YouTube가 안 넘기면 6초 후 다음 영상
  const BREAK_MS = 60 * 60 * 1000;         // 연속 재생 1시간마다 휴식
  const IDLE_RESET_MS = 10 * 60 * 1000;    // 10분 이상 쉬면 연속 재생 시간 초기화
  const SEEN_MAX = 2;                      // 홈 화면에 2번 보였는데 안 누른 영상은 숨김
  const SEEN_DAYS = 7;                     // 숨긴 영상은 7일 뒤 다시 보이게 (기록 초기화)

  const html = document.documentElement;
  const loadJson = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };

  // ================= 설정 (⚙ 버튼으로 켜고 끔, yt-page도 같은 값을 읽음) =================
  const VERSION = '2026.11.05.7';   // 위 @version과 같게 (⚙ 작동 상태에 표시)
  const SET = Object.assign({ prune: true, origAudio: true, sb: true, chanSpeed: true, fresh: true, rest: true, tidy: true, endCards: true,
    shortsNormal: false, swipeBack: true, capLang: '', sbCats: SB_ALL.filter(c => c[2]).map(c => c[0]) }, loadJson('krSet', {}));
  const saveSet = () => localStorage.setItem('krSet', JSON.stringify(SET));
  const applySet = () => {   // CSS로 처리하는 항목은 <html> 표시로 켜고 끔
    if (SET.tidy) html.dataset.krTidy = '1'; else delete html.dataset.krTidy;
    if (SET.endCards) html.dataset.krEndcards = '1'; else delete html.dataset.krEndcards;
  };
  applySet();

  // 속도: 채널별로 기억(설정에서 켠 경우) → 없으면 전체 속도. 저장값은 가장 가까운 YouTube 속도로. 기본 1.25배
  const chanSpeeds = loadJson('krChanSpeed', {});
  const nearest = s => SPEEDS.reduce((a, b) => (Math.abs(b - s) < Math.abs(a - s) ? b : a));
  const chan = () => html.dataset.krChan || '';   // 지금 영상의 채널 이름 (yt-page가 알려 줌)
  const getSpeed = () => nearest((SET.chanSpeed && chanSpeeds[chan()]) || +localStorage.getItem('krSpeed') || 1.25);
  const setSpeed = x => {
    if (SET.chanSpeed && chan()) {
      chanSpeeds[chan()] = x;
      const k = Object.keys(chanSpeeds);
      if (k.length > 300) delete chanSpeeds[k[0]];   // 오래된 것부터 정리
      localStorage.setItem('krChanSpeed', JSON.stringify(chanSpeeds));
    } else localStorage.setItem('krSpeed', x);
  };
  const getQuality = () => localStorage.getItem('krQuality') || 'small';   // 기본 240p (없으면 360p)
  const isShorts = () => location.pathname.startsWith('/shorts/');
  // [설정] Shorts를 일반 시청 화면으로: Shorts 링크를 누르면 /watch?v= 로 열고, Shorts 주소로 들어오면 바꿔서 다시 엶
  // (일반 화면에서는 속도·진행 막대·스폰서 건너뛰기·전체화면 등을 그대로 씀)
  const shortsId = () => (location.pathname.match(/^\/shorts\/([\w-]{11})/) || [])[1];
  const toNormal = () => { const id = shortsId(); if (SET.shortsNormal && id) location.replace('/watch?v=' + id); };
  toNormal();
  document.addEventListener('click', e => {
    if (!SET.shortsNormal || !e.isTrusted) return;
    const a = e.target.closest && e.target.closest('a[href*="/shorts/"]');
    const m = a && (a.getAttribute('href') || '').match(/\/shorts\/([\w-]{11})/);
    if (!m) return;
    e.preventDefault(); e.stopImmediatePropagation();
    location.href = '/watch?v=' + m[1];
  }, true);
  const vidId = () => new URLSearchParams(location.search).get('v');
  const pageKey = () => (isShorts() ? location.pathname : (vidId() || ''));
  const playerEl = () => document.querySelector('#movie_player, #shorts-player, .html5-video-player');
  const isAd = () => { const p = playerEl(); return !!(p && p.classList.contains('ad-showing')); };
  // 오류가 나도 다음 회차는 계속 실행
  const every = (ms, fn) => setInterval(() => { try { fn(); } catch (e) {} }, ms);
  // 화면 정리처럼 '보일 때만' 필요한 작업용: 화면이 꺼져 있거나 다른 앱에 있으면 쉼 (재생·다음 영상 기능은 every로 계속)
  const look = (ms, fn) => every(ms, () => { if (!document.hidden) fn(); });
  // 화면 요소 만들기: YouTube는 보안 정책(Trusted Types)으로 innerHTML을 막으므로 요소를 직접 만듦
  const h = (tag, css, ...kids) => {
    const e = document.createElement(tag);
    if (css) e.style.cssText = css;
    e.append(...kids);
    return e;
  };
  const fmt = x => { x = Math.max(0, Math.floor(x || 0)); const hh = Math.floor(x / 3600), m = Math.floor(x / 60) % 60, sec = String(x % 60).padStart(2, '0');
    return hh ? `${hh}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`; };
  // YouTube가 기억하는 설정값 저장 형식 (30일 유지)
  const saveYt = (k, obj) => {
    const now = Date.now();
    localStorage.setItem(k, JSON.stringify({ data: JSON.stringify(obj), expiration: now + 30 * 864e5, creation: now }));
  };

  // ================= 재생 명령 =================
  // yt-page가 YouTube 플레이어 자체 기능으로 실행 → YouTube 내부 상태와 어긋나지 않음.
  // yt-page가 동작하지 않을 때만 영상을 직접 제어.
  const cmd = (c, v, arg) => {
    if (html.dataset.krPage) {
      html.dataset.krCmd = c;
      html.dataset.krArg = arg == null ? '' : arg;
      document.dispatchEvent(new Event('kr-cmd'));
    } else if (v) {
      if (c === 'play') v.play().catch(() => {});
      else if (c === 'pause') v.pause();
      else if (c === 'unmute') v.muted = false;
      else if (c === 'speed') v.playbackRate = arg;
    }
  };

  // ================= 1. 속도 =================
  // YouTube 자체 속도 기능으로만, 영상이 '실제로 재생되기 시작한 뒤'에 적용 (광고 중 제외).
  // 영상을 불러오는 도중에 속도를 바꾸면 YouTube가 영상을 다시 불러오다 플레이어가 멈춤 (디버그 기록으로 확인).
  const applySpeed = v => {
    const s = getSpeed();
    if (v instanceof HTMLVideoElement && !v.paused && v.playbackRate !== s && !isAd()) cmd('speed', v, s);
  };
  document.addEventListener('playing', e => applySpeed(e.target), true);

  // ================= 2. 화질·소리 기억 =================
  // 화질: YouTube '선호 화질'로 저장 → 새 영상이 처음부터 그 화질로 시작 (재생 도중 바꾸면 iOS가 멈추므로)
  // 소리: YouTube가 '음소거'를 기억하면 '소리 켜짐'으로 바꿔 둠
  const saveQualityPref = () => {
    const ht = QHEIGHT[getQuality()];
    try { ht ? saveYt('yt-player-quality', { quality: ht, previousQuality: ht }) : localStorage.removeItem('yt-player-quality'); } catch (e) {}
  };
  const fixVolumePref = () => {
    try {
      const d = JSON.parse(JSON.parse(localStorage.getItem('yt-player-volume')).data);
      if (d.muted === false && d.volume >= 10) return;
    } catch (e) {}
    try { saveYt('yt-player-volume', { volume: 100, muted: false }); } catch (e) {}
  };
  saveQualityPref();
  fixVolumePref();

  // ================= 3. 소리 켜기 (화면을 누른 순간에만) =================
  // iOS는 누른 순간에만 소리 켜기를 허락함 (그 외에 켜면 영상을 멈춤).
  // 별도 오디오는 재생하지 않음: iOS는 미디어를 하나만 재생해서, 막 시작한 영상이 멈춰 버림.
  let lastTap = 0;
  const onTap = e => {
    if (!e.isTrusted) return;
    lastTap = Date.now();
    const tappedMute = e.target.closest && e.target.closest('button[aria-label*="음소거"], button[aria-label*="ute"], .ytp-mute-button');
    if (!tappedMute && !isAd()) cmd('unmute', document.querySelector('video'));
  };
  window.addEventListener('touchend', onTap, true);
  window.addEventListener('click', onTap, true);

  // ================= 4. 광고·앱 유도 숨김 =================
  // 목록·화면의 광고만 숨김. 플레이어 안의 광고 영역은 숨기지 않음
  // (숨기면 YouTube가 광고가 '보이지 않는다'고 판단해 영상 시작을 미루다 플레이어가 멈출 수 있음)
  const CSS = `
    ytm-promoted-sparkles-web-renderer, ytm-promoted-video-renderer,
    ytm-companion-ad-renderer, ad-slot-renderer, ytm-ad-slot-renderer,
    ytm-in-feed-ad-layout-renderer, ytm-display-ad-renderer,
    ytm-mealbar-promo-renderer, ytm-statement-banner-renderer,
    ytm-paid-content-overlay-renderer, ytm-upsell-dialog-renderer,
    ytm-app-promo-renderer, ytm-open-app-button, .open-app-button,
    ytm-app-upsell-renderer,
    a[href^="youtube://"], a[href^="vnd.youtube"], a[href^="intent:"], a[href*="apps.apple.com"]
    { display: none !important; }
    /* 조회수 숨김 → 그 자리에 YouTube 자체 게시일(예: 3일 전)이 보임 (실제 m.youtube.com 화면 구조 기준, 2026-10 확인)
       · 목록: '채널 • 조회수 • 게시일' 중 조회수 칸과 그 앞 구분점
       · 시청 화면 제목 아래: '채널 · 좋아요 수 · 조회수 · 게시일' 중 좋아요 수와 조회수 칸 */
    .ytmBadgeAndBylineRendererItemByline:has(> [aria-label^="조회수"], > [aria-label*=" views"]),
    .ytmBadgeAndBylineRendererSeparator:has(+ .ytmBadgeAndBylineRendererItemByline > [aria-label^="조회수"]),
    .ytmBadgeAndBylineRendererSeparator:has(+ .ytmBadgeAndBylineRendererItemByline > [aria-label*=" views"]),
    .slim-video-information-upload-info > .slim-video-subtitle-substring:has(> [aria-label^="조회수"], > [aria-label*=" views"])
    { display: none !important; }
    /* [설정: 화면 정리] 시청 화면의 좋아요 수·좋아요/싫어요 버튼·댓글 미리보기 */
    html[data-kr-tidy] :is(.slim-video-information-like-count, like-button-view-model, dislike-button-view-model,
      segmented-like-dislike-button-view-model, comments-entry-point-teaser-view-model,
      yt-video-metadata-carousel-view-model:has(comments-entry-point-teaser-view-model))
    { display: none !important; }
    /* [설정: 끝 화면 카드] 영상 끝·도중에 영상 위로 뜨는 추천 카드·정보 카드 */
    html[data-kr-endcards] :is(.ytp-ce-element, .ytp-ce-covering-overlay, .ytp-cards-teaser, .ytp-cards-button,
      .ytp-endscreen-content, .ytp-videowall-still, .iv-branding)
    { display: none !important; }
    /* 시청 화면: YouTube가 칩 줄을 영상 밑에 붙이려고 '제목·버튼·목록 전체를 감싼 상자'를 위로 끌어올림(translateY -48px)
       → 제목이 영상 뒤로 숨고 칩 줄이 제목을 덮음 (진단으로 확인, 2026-10). 끌어올리지 못하게 고정 */
    .related-chips-slot-wrapper { transform: none !important; }
    /* 시청 화면: 필터 칩 줄('모두 · 정치 뉴스 · 추천') — 펼쳐지면 영상 밑에 떠서 제목을 덮음. 진단으로 확인한 이름으로 숨김 */
    ytm-related-chip-cloud-renderer, .watch-below-the-player ytm-chip-cloud-renderer { display: none !important; }
    /* 시청 화면: 상단 바의 'YouTube' 글자 로고를 ▶ 아이콘만 남겨 버튼 묶음(PiP·화질·속도) 자리를 만듦 */
    html[data-kr-watch] ytm-home-logo { width: 34px !important; min-width: 0 !important; overflow: hidden !important; flex: none !important; }
    html[data-kr-watch] ytm-home-logo .mobile-topbar-logo { flex: none !important; }
    /* [설정: 화면 정리] 채널 로고: 나타나는 즉시 안 보이게 (자리는 아래 hideAvatars가 정리) */
    html[data-kr-tidy] :is(img[src*="yt3.ggpht.com"], img[src*="yt3.googleusercontent.com"]):not(ytm-pivot-bar-renderer *, ytm-topbar-menu-button-renderer *)
    { visibility: hidden !important; }`;
  const ensureCss = () => {
    if (document.getElementById('kr-css')) return;
    const s = document.createElement('style');
    s.id = 'kr-css';
    s.textContent = CSS;
    (document.head || html).appendChild(s);
  };
  ensureCss();
  const removeAppMeta = () => document.querySelectorAll('meta[name="apple-itunes-app"]').forEach(m => m.remove());
  // 페이지를 처음 불러오는 동안만 감시 (이후 2초 점검으로 충분, 계속 감시하면 배터리 소모)
  const metaWatch = new MutationObserver(removeAppMeta);
  metaWatch.observe(html, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', () => { removeAppMeta(); metaWatch.disconnect(); });
  const APP_TEXT = /^\s*(앱 열기|앱에서 열기|앱으로 열기|앱에서 보기|YouTube 앱|Open App|Open in app)\s*$/i;
  const hideAppButtons = () => document.querySelectorAll('button, a, [role="button"]').forEach(b => {
    const t = b.textContent || '';
    if (t.length < 30 && APP_TEXT.test(t) && b.offsetParent) b.style.setProperty('display', 'none', 'important');
  });

  // ================= 5. 다음 영상 / 다음 Shorts =================
  // 일반 영상: YouTube 자동재생이 넘기게 두고, 6초가 지나도 그대로면 '다음 영상' 명령 한 번.
  // 단, 화면이 꺼져 있으면 즉시 넘김: iPhone Safari는 화면이 꺼진 동안 '앞 영상이 끝나고 10초 안'에만
  // 다음 영상 자동 재생을 허락함 (그 뒤에는 잠금 화면에서 직접 ▶를 눌러야 함 — WebKit 동작)
  const onEnded = v => {
    if (resting) return;
    if (sleepEnd) { setSleep(0); return; }   // 취침 타이머 '이 영상 끝나면' → 다음 영상으로 넘기지 않음
    if (isShorts()) return nextShort();
    if (document.hidden) return cmd('next', v);
    const key = pageKey();
    setTimeout(() => { if (!resting && pageKey() === key && v.ended) cmd('next', v); }, NEXT_WAIT);
  };
  // Shorts: '다음' 버튼, 없으면 한 화면 아래로
  let advancing = false;
  const nextShort = () => {
    if (advancing) return;
    advancing = true;
    const before = location.pathname;
    const btn = document.querySelector('button[aria-label*="다음 동영상"], button[aria-label*="Next video"], #navigation-button-down button');
    if (btn) btn.click();
    setTimeout(() => {
      if (location.pathname === before)
        (document.querySelector('ytm-reel-watch-sequence-renderer, ytm-shorts-container, .reel-sequence') ||
          document.scrollingElement).scrollBy({ top: innerHeight, behavior: 'smooth' });
    }, 700);
    setTimeout(() => { advancing = false; }, 2500);
  };
  document.addEventListener('kr-next-short', nextShort);   // 잠금 화면 ⏭ 버튼 (yt-page가 알려 줌)

  // ================= 6. Shorts 화면: 영상만 남기고 모두 숨김 =================
  // 'Shorts 한 편'의 범위 = 페이지 제목(document.title) 글자가 들어 있는 가장 작은 상자
  // → YouTube 화면 구조가 바뀌어도 다른 Shorts나 페이지 전체를 잘못 숨기지 않음.
  const tidyShorts = (v, key) => {
    const keep = v.closest('#shorts-player, .html5-video-player') || v.parentElement;
    let item = v.__krItem;
    if (v.__krItemKey !== key || !item || !item.isConnected) {   // 편이 바뀌면 범위를 새로 찾음
      const t = (document.title || '').replace(/\s*-\s*YouTube\s*$/i, '').trim().slice(0, 12);
      item = keep;
      while (item && item !== document.body &&
             !(t && [...item.querySelectorAll('*')].some(e => !e.children.length && (e.textContent || '').trim().startsWith(t)))) {
        item = item.parentElement;
      }
      // 제목이 아직 안 바뀌었거나 범위가 다른 Shorts까지 포함하면 다음에 다시 (잘못 숨기지 않게)
      if (!item || item === document.body || item.querySelectorAll('video').length > 1) return;
      v.__krItem = item; v.__krItemKey = key;
    }
    item.querySelectorAll('*').forEach(e => {
      if (e.dataset.krHid || keep.contains(e) || e.contains(keep)) return;   // 영상 안쪽·영상을 감싼 상자는 유지
      e.style.setProperty('display', 'none', 'important');
      e.dataset.krHid = '1';
    });
  };

  // ================= 7. 연속 재생 1시간마다 휴식 =================
  let { played = 0, lastPlay = 0 } = loadJson('krBreak', {});
  let resting = false, lastTick = Date.now(), lastBreakSave = 0;
  const endRest = () => {
    resting = false; played = 0;
    const o = document.getElementById('kr-rest');
    if (o) o.remove();
  };
  const showRest = v => {
    if (document.getElementById('kr-rest') || !document.body) return;
    const btn = h('button', 'background:#fff;color:#000;border:none;border-radius:20px;padding:10px 24px;font:bold 16px -apple-system,sans-serif', '▶ 다시 재생');
    const o = h('div', 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.85);color:#fff;' +
      'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;' +
      'font:16px -apple-system,sans-serif;text-align:center;padding:24px;',
      h('div', 'font-size:22px;font-weight:bold', '휴식 시간입니다'),
      h('div', '', '1시간 연속으로 재생했습니다.', document.createElement('br'), '잠시 눈과 귀를 쉬어 주세요.'), btn);
    o.id = 'kr-rest';
    btn.addEventListener('click', () => { endRest(); cmd('play', v); });
    document.body.appendChild(o);
  };
  const trackBreak = (v, ad) => {
    const now = Date.now(), dt = Math.min(now - lastTick, 2000);   // 화면 꺼짐 등으로 멈춘 시간은 세지 않음
    lastTick = now;
    if (!SET.rest) { if (resting) endRest(); return; }             // 설정에서 끔
    const playing = v && !v.paused && !v.ended;
    if (resting) {
      if (!playing) return;
      if (now - lastTap < 2000) endRest();          // 사용자가 직접 재생 → 휴식 끝, 다시 1시간
      else { cmd('pause', v); return; }              // 자동으로 재생된 것은 다시 멈춤
    }
    if (!playing || ad) return;
    if (lastPlay && now - lastPlay > IDLE_RESET_MS) played = 0;
    played += dt; lastPlay = now;
    if (played >= BREAK_MS) { resting = true; cmd('pause', v); showRest(v); }
    if (now - lastBreakSave > 5000) {
      lastBreakSave = now;
      localStorage.setItem('krBreak', JSON.stringify({ played, lastPlay }));
    }
  };

  // ================= 7-2. 취침 타이머 =================
  // ⚙에서 15·30·60분 뒤 또는 '이 영상 끝나면' 멈춤 (화면이 꺼져 있어도 동작). 멈추면 타이머는 꺼짐.
  let sleepAt = 0, sleepEnd = false, sleepMin = 0;
  const setSleep = m => { sleepEnd = m === 'end'; sleepMin = typeof m === 'number' ? m : 0; sleepAt = sleepMin ? Date.now() + m * 60e3 : 0; };
  const sleepLabel = () => (sleepEnd ? '영상 끝' : sleepAt ? Math.max(1, Math.ceil((sleepAt - Date.now()) / 60e3)) + '분' : '');
  const checkSleep = v => {
    if (!v || v.paused) return;
    const t = +html.dataset.krT, d = +html.dataset.krD, rate = v.playbackRate || 1;
    if ((sleepAt && Date.now() >= sleepAt) || (sleepEnd && d > 0 && t >= d - 1.5 * rate)) {   // 끝나기 직전에 멈춰 다음 영상으로 안 넘어가게
      cmd('pause', v); setSleep(0);
    }
  };

  // ================= 8. "계속 시청하시겠습니까?" 자동 닫기 =================
  const STILL = /(계속 시청|시청을 계속|동영상이 일시중지|Continue watching|Video paused)/i;
  const dismissStill = v => {
    document.querySelectorAll('ytm-confirm-dialog-renderer, yt-confirm-dialog-renderer, [role="dialog"]').forEach(d => {
      if (!STILL.test(d.innerText || '')) return;
      const b = [...d.querySelectorAll('button')].find(x => /(예|네|계속|Yes|Continue)/i.test(x.innerText)) || d.querySelector('button');
      if (b) b.click();
      if (!resting && v && v.paused) cmd('play', v);
    });
  };

  // ================= 8-2. 홈 화면: 이미 본 영상·반복 노출 영상 숨김 → 새 영상이 위로 =================
  // · 이미 본 영상: 썸네일에 빨간 시청 막대가 있는 영상
  // · 반복 노출: 화면에 실제로 보인 횟수를 셈(같은 영상은 10분에 한 번만) → SEEN_MAX번 이상이면 다음부터 숨김
  // · 숨길지는 영상이 처음 나타날 때 한 번만 정함 → 보고 있는 중에 목록이 갑자기 사라지지 않음
  // · 홈 화면은 아래로 내리면 YouTube가 영상을 더 불러오므로 숨겨도 목록이 비지 않음
  const FEED_ITEM = 'ytm-rich-item-renderer, ytm-video-with-context-renderer, ytm-compact-video-renderer, ' +
    'ytm-reel-item-renderer, ytm-shorts-lockup-view-model';
  const WATCHED = 'ytm-thumbnail-overlay-resume-playback-renderer, [class*="resume-playback"]';
  const seen = loadJson('krSeen', {});
  let seenDirty = false;
  const feedId = el => {
    const a = el.querySelector('a[href*="/watch?v="], a[href*="/shorts/"]');
    const m = a && (a.getAttribute('href') || '').match(/(?:v=|\/shorts\/)([\w-]{11})/);
    return m && m[1];
  };
  const freshFeed = () => {
    if (!SET.fresh || location.pathname !== '/') return;
    const now = Date.now();
    const items = new Set([...document.querySelectorAll(FEED_ITEM)].map(e => e.closest('ytm-rich-item-renderer') || e));
    items.forEach(el => {
      const id = feedId(el);
      if (!id) return;
      let e = seen[id];
      if (e && now - e.f > SEEN_DAYS * 864e5) { delete seen[id]; e = null; seenDirty = true; }
      if (el.__krId !== id) {               // 처음 나타남(또는 칸이 다른 영상으로 바뀜) → 숨길지 결정
        el.__krId = id;
        el.__krHide = !!(el.querySelector(WATCHED) || (e && e.n >= SEEN_MAX));
        el.style.display = el.__krHide ? 'none' : '';
      }
      if (el.__krHide) return;
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.top < innerHeight && r.bottom > 0) {   // 화면에 실제로 보인 것만 셈
        if (!e) e = seen[id] = { n: 0, t: 0, f: now };
        if (now - e.t > 6e5) { e.n++; e.t = now; seenDirty = true; }
      }
    });
    if (seenDirty) {
      seenDirty = false;
      const k = Object.keys(seen);
      if (k.length > 3000) k.sort((a, b) => seen[a].t - seen[b].t).slice(0, k.length - 3000).forEach(x => delete seen[x]);
      localStorage.setItem('krSeen', JSON.stringify(seen));
    }
  };

  // ================= 8-3. 목록: 조회수 빼고 업로드 시기(예: 1년 전)가 보이게 =================
  // 기본은 위 CSS(실제 화면 구조)가 처리. 여기서는 구조가 다른 목록에서만 '조회수' 글자를 찾아 그 글자만 지움.
  const VIEWS = /^(조회수\s*\S+|[\d.,]+\s*[KMB천만억]?\s*(views?|회)|No views|조회수 없음)$/i;
  const SEP = /^\s*[•·]\s*$/;
  const LIST_ITEM = FEED_ITEM + ', ytm-lockup-view-model, ytm-video-card-renderer, ytm-playlist-video-renderer';
  // 글자 조각 하나만 지움 (+ 옆의 '•' 구분점 하나). 같은 상자에 다른 글자(업로드 시기 등)가 있으면 상자는 그대로 둠.
  const nearSib = (n, prev) => { let x = prev ? n.previousSibling : n.nextSibling;
    while (x && x.nodeType === 3 && !x.nodeValue.trim()) x = prev ? x.previousSibling : x.nextSibling;
    return x; };
  const isSep = x => !!x && SEP.test(x.nodeType === 3 ? x.nodeValue : (x.textContent || ''));
  const blank = x => { if (x.nodeType === 3) x.nodeValue = ''; else x.style.setProperty('display', 'none', 'important'); };
  const dropText = n => {
    n.nodeValue = '';
    // 글자를 지워 비게 된 상자는 위로 올라가며 함께 숨기고, 그 옆의 구분점 하나만 숨김 (다른 글자가 있는 상자는 그대로)
    let box = n;
    while (box.parentElement && !box.parentElement.textContent.trim()) box = box.parentElement;
    if (box !== n) box.style.setProperty('display', 'none', 'important');
    const sep = [nearSib(box, true), nearSib(box, false)].find(isSep);
    if (sep) blank(sep);
  };
  const trimViews = () => {
    if (isShorts()) return;
    document.querySelectorAll(LIST_ITEM).forEach(item => {
      if (item.__krMeta || (item.__krTry = (item.__krTry || 0) + 1) > 5) return;   // 처리 완료 / 5번 찾아도 없으면 그만
      const walk = document.createTreeWalker(item, NodeFilter.SHOW_TEXT);
      for (let n; (n = walk.nextNode());) {
        const t = n.nodeValue;
        if (!/조회수|views?|회/i.test(t) || (n.parentElement && n.parentElement.closest('h1, h2, h3, h4, [class*="headline"], [class*="title"]'))) continue;   // 제목은 건드리지 않음
        if (n.parentElement && !n.parentElement.offsetParent) { item.__krMeta = true; break; }   // 이미 CSS로 숨겨짐
        const parts = t.split(/\s*[•·]\s*/);
        if (parts.length > 1) {                       // '조회수 284만회 • 1년 전'이 한 덩어리
          const kept = parts.filter(x => !VIEWS.test(x.trim()));
          if (kept.length === parts.length) continue;
          n.nodeValue = kept.join(' • ');
        } else if (VIEWS.test(t.trim())) {           // 조회수 글자만 따로 있음 → 그 글자와 구분점만 지움
          dropText(n);
        } else continue;
        item.__krMeta = true;
        break;
      }
    });
  };

  // 목록에 게시일이 없으면(시청 화면 아래 관련 영상 등) yt-page가 데이터에서 모아 둔 게시일을 덧붙임
  let dateMap = {}, dateSrc = '';
  const addDates = () => {
    const src = html.dataset.krDates || '';
    if (src !== dateSrc) { dateSrc = src; try { dateMap = JSON.parse(src) || {}; } catch (e) { dateMap = {}; } }
    document.querySelectorAll(LIST_ITEM).forEach(item => {
      if (item.__krDated || (item.__krDateTry = (item.__krDateTry || 0) + 1) > 30) return;
      const id = feedId(item), date = id && dateMap[id];
      if (!date) return;                               // 아직 정보 없음 → 다음에 다시
      item.__krDated = true;
      if ((item.textContent || '').includes(date)) return;   // 이미 게시일이 보임
      const host = item.querySelector('ytm-badge-and-byline-renderer, [class*="BylineRendererHost"], [class*="byline"]');
      if (!host) return;
      // YouTube 목록과 같은 모양(구분점 + 칸)으로 덧붙임
      const sep = h('span', '', '•'), cell = h('span', '', h('span', '', date));
      sep.className = 'ytmBadgeAndBylineRendererSeparator';
      cell.className = 'ytmBadgeAndBylineRendererItemByline';
      host.append(sep, cell);
    });
  };

  // 시청 화면 '댓글' 칸 숨김 (이름표가 '댓글'인 칸만 정확히)
  const hideComments = () => {
    if (!SET.tidy || !vidId()) return;
    document.querySelectorAll('h2.ytCarouselTitleViewModelTitle, yt-carousel-title-view-model h2').forEach(t => {
      if (/^(댓글|Comments)/i.test((t.textContent || '').trim())) {
        const box = t.closest('yt-video-metadata-carousel-view-model');
        if (box) box.style.setProperty('display', 'none', 'important');
      }
    });
  };

  // 시청 화면: 필터 칩 줄('모두 · 정치 뉴스 · 추천') 숨김
  // YouTube가 칩을 펼치면(slot-open) 칩 줄이 영상 바로 밑에 떠서 제목·채널 줄을 덮음 (진단: 칩 195~243, 제목 207).
  // 기본은 위 CSS(진단으로 확인한 이름)가 숨김. 여기서는 이름이 바뀐 경우를 대비해 칩 줄 크기만 한 상자까지만 숨김
  const CHIPS = 'ytm-chip-cloud-renderer, ytm-related-chip-cloud-renderer, [class*="chip-cloud"], [class*="ChipCloud"]';
  const hideChips = () => {
    if (!vidId() || isShorts()) return;
    document.querySelectorAll(CHIPS).forEach(c => {
      if (c.closest(LIST_ITEM) || c.closest('[data-kr-chip]')) return;   // 목록 안 · 이미 숨긴 상자 안은 제외
      const r = c.getBoundingClientRect();
      if (!r.height) return;                          // 접혀 있거나(펼쳐지면 그때 처리) 바깥 상자만 높이가 0인 경우 → 안쪽에서 처리
      let box = c;
      for (let e = c.parentElement; e && e !== document.body; e = e.parentElement) {
        if (e.getBoundingClientRect().height > r.height + 8) break;   // 칩 줄보다 큰 상자에서 멈춤
        box = e;
      }
      box.dataset.krChip = '1';
      box.style.setProperty('display', 'none', 'important');
    });
  };

  // 목록 속 광고(스폰서) 줄 숨김 — 이름을 아는 광고 칸만 숨김 (상자를 넓혀 가며 찾지 않음: 제목 영역까지 숨긴 적이 있음)
  const AD_ROW = LIST_ITEM + ', ytm-compact-promoted-item-renderer, ytm-promoted-sparkles-web-renderer, ad-slot-renderer, ytm-ad-slot-renderer';
  const hideAdRows = () => document.querySelectorAll('.sparkles-ad-byline, badge-shape.ytBadgeShapeAd').forEach(b => {
    const row = b.closest(AD_ROW);
    if (row && !row.querySelector('#movie_player, h1, h2')) row.style.setProperty('display', 'none', 'important');
  });

  // 시청 화면 제목 아래 줄: 위 CSS가 화면 구조 차이(로그인 여부 등)로 못 잡을 때를 대비해
  // '좋아요 4.6천개'·'조회수 12만회' 글자만 지움 → 뒤에 있던 YouTube 자체 게시일이 보임. 상자는 숨기지 않으므로 다른 내용에 영향 없음.
  const LIKES = /^(좋아요\s*[\d.,]+\s*[천만억]?\s*개?|[\d.,]+\s*[KMB]?\s*likes?)$/i;
  const SKIP_HEAD = LIST_ITEM + ', #movie_player, #kr-bar, script, style';
  let headNodes = [], headFor = '', headTries = 0;
  const cleanHeader = () => {
    const id = vidId();
    if (!id || isShorts()) return;
    if (headFor !== id) { headFor = id; headTries = 0; headNodes = []; }
    if (headNodes.length && headNodes.every(n => n.isConnected && !n.nodeValue)) return;   // 이미 처리됨
    if (++headTries > 30) return;                    // 30초 찾아도 없으면 그만
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: n => {
        if (n.nodeType === 1) return n.matches(SKIP_HEAD) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
        const t = n.nodeValue.trim();
        return LIKES.test(t) || VIEWS.test(t) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    const found = [];
    for (let n; (n = walk.nextNode());) { n.nodeValue = ''; found.push(n); }
    if (found.length) { headNodes = found; headTries = 0; }
  };

  // ================= 8-4. 채널 로고 숨김 (모든 화면) =================
  // 채널 로고는 영상 썸네일(i.ytimg.com)과 달리 yt3.ggpht.com / yt3.googleusercontent.com에서 옴 → 주소로 정확히 구분.
  // 로고를 감싼 '로고 크기의 상자'까지 숨겨 빈 동그라미 자리도 없앰 (제목·설명이 그 자리까지 넓게 표시됨).
  // 아래쪽 메뉴의 '내 페이지' 아이콘(내 계정)은 그대로 둠.
  const AVATAR_IMG = 'img[src*="yt3.ggpht.com"], img[src*="yt3.googleusercontent.com"]';
  const KEEP_AVATAR = 'ytm-pivot-bar-renderer, ytm-topbar-menu-button-renderer';
  const hideAvatars = () => SET.tidy && document.querySelectorAll(AVATAR_IMG).forEach(img => {
    if (img.__krAv || img.closest(KEEP_AVATAR)) return;
    const r = img.getBoundingClientRect();
    if (!r.width) return;                          // 아직 화면에 그려지지 않음 → 다음에 다시
    img.__krAv = true;
    if (r.width > 120 || Math.abs(r.width - r.height) > 4) {   // 정사각형 작은 그림만 로고 (채널 배너·게시물 사진은 다시 보이게)
      img.style.setProperty('visibility', 'visible', 'important');
      return;
    }
    let box = img;
    for (let e = img.parentElement; e && e !== document.body; e = e.parentElement) {
      const q = e.getBoundingClientRect();
      if (q.width > r.width + 16 || q.height > r.height + 16) break;   // 로고보다 큰 상자(제목 등 포함)에서 멈춤
      box = e;
    }
    box.style.setProperty('display', 'none', 'important');
  });

  // ================= 9. 스폰서 구간 (SponsorBlock) =================
  // 구간 정보를 받아 <html data-kr-sb>에 넣어 두면, 건너뛰기는 yt-page가 영상 시간이 바뀔 때마다 처리.
  // 개인정보 보호: 영상 ID 대신 그 해시의 앞 4글자만 보내고, 돌아온 여러 영상 중에서 내 영상을 고름
  // (서버는 내가 어떤 영상을 보는지 알 수 없음 — SponsorBlock 공식 k-익명 방식)
  // (이어보기는 로그인 상태에서 YouTube가 스스로 하므로 따로 하지 않음 → 위치를 두 번 옮기는 충돌 방지)
  let sbFor = null, sbSegs = [];
  const sha256 = async t => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))]
    .map(b => b.toString(16).padStart(2, '0')).join('');
  const loadSB = async id => {
    sbFor = id; sbSegs = [];
    delete html.dataset.krSb;
    try {
      const prefix = (await sha256(id)).slice(0, 4);
      const r = await fetch(`https://sponsor.ajay.app/api/skipSegments/${prefix}?categories=` + encodeURIComponent(JSON.stringify(SET.sbCats)));
      const list = r.ok ? await r.json() : [];
      const mine = (list || []).find(x => x.videoID === id);
      if (sbFor !== id || !mine) return;
      sbSegs = mine.segments.filter(x => !x.actionType || x.actionType === 'skip').map(x => x.segment).sort((p, q) => p[0] - q[0]);
      html.dataset.krSb = JSON.stringify({ id, segs: sbSegs });
    } catch (e) {}
  };

  // ================= 10. 가로로 돌리면 영상만 전체화면 =================
  // ----- 전체화면 손가락 제스처 (YouTube·일반 사이트 공통 코드) -----
  // · 좌우로 길게 밀기: 앞/뒤로 이동 (화면 폭 끝까지 밀면 90초) — 손을 떼는 순간 이동
  // · 왼쪽 절반을 위/아래로 밀기: 영상 밝기 (20%~160%)
  // iPhone Safari는 웹페이지가 '화면 밝기'와 '소리 크기'를 바꾸는 것을 막아 둠 →
  // 밝기는 영상 자체의 밝기로 대신하고, 소리는 iPhone 음량 버튼으로 조절.
  const fsGest = ((P, getVideo, getTime, seek, allowed, baseFilter) => {
    let g = null, bright = 1, hudTimer = 0, eatClick = false;
    const hud = msg => {
      let el = document.getElementById(P + '-hud');
      if (!el) {
        el = document.createElement('div');
        el.id = P + '-hud';
        el.style.cssText = 'position:fixed;left:50%;top:40%;transform:translate(-50%,-50%);z-index:2147483647;pointer-events:none;' +
          'background:rgba(0,0,0,.7);color:#fff;padding:10px 18px;border-radius:14px;font:600 18px -apple-system,sans-serif;';
        document.body.appendChild(el);
      }
      el.textContent = msg;
      el.style.display = 'block';
      clearTimeout(hudTimer);
      hudTimer = setTimeout(() => { el.style.display = 'none'; }, 800);
    };
    // 밝기는 전체화면 영상에만 적용되는 규칙으로 → 전체화면을 끄면 자동으로 원래 밝기
    const setBright = b => {
      bright = b;
      let st = document.getElementById(P + '-bright');
      if (!st) { st = document.createElement('style'); st.id = P + '-bright'; document.head.appendChild(st); }
      st.textContent = `video.${P} { filter: ${baseFilter()}brightness(${b}) !important; }`;
    };
    // 밀기 동작이 끝난 직후의 '탭'은 무시 (밀었는데 재생/일시정지·막대가 뜨지 않게)
    window.addEventListener('click', e => { if (eatClick) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
    document.addEventListener('touchstart', e => {
      const v = getVideo();
      g = null;
      if (!v || e.touches.length !== 1 || e.target !== v || !allowed()) return;
      const t = e.touches[0];
      g = { v, x: t.clientX, y: t.clientY, mode: '', t0: getTime(), b0: bright, delta: 0 };
    }, { capture: true, passive: true });
    document.addEventListener('touchmove', e => {
      if (!g || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - g.x, dy = e.touches[0].clientY - g.y;
      if (!g.mode) {
        if (Math.hypot(dx, dy) < 20) return;   // 짧은 움직임은 탭으로 봄
        g.mode = Math.abs(dx) > Math.abs(dy) ? 'seek' : (g.x < innerWidth / 2 ? 'bright' : 'none');
      }
      if (g.mode === 'none') return;
      e.preventDefault();
      if (g.mode === 'seek') {
        g.delta = Math.round(dx / innerWidth * 90);
        hud(`${g.delta >= 0 ? '+' : ''}${g.delta}초  →  ${fmt(g.t0 + g.delta)}`);
      } else {
        setBright(Math.max(0.2, Math.min(1.6, g.b0 - dy / innerHeight * 1.5)));
        hud(`밝기 ${Math.round(bright * 100)}%`);
      }
    }, { capture: true, passive: false });
    document.addEventListener('touchend', () => {
      if (g && g.mode && g.mode !== 'none') {
        eatClick = true;
        setTimeout(() => { eatClick = false; }, 400);
        if (g.mode === 'seek' && g.delta) seek(g.v, Math.max(0, g.t0 + g.delta));
      }
      g = null;
    }, true);
    return { hud };
  })('kr-fs', () => pseudoFs.video(), () => +html.dataset.krT || 0,
     (v, t) => cmd('seek', v, t), () => true, () => '');   // YouTube: 이동은 YouTube 자체 기능으로

  // ----- 영상만 화면 전체에 보이기 (YouTube·일반 사이트 공통 코드) -----
  // iPhone 기본 전체화면은 손가락 터치 없이 켤 수 없고, 켜지면 페이지가 터치를 받지 못하므로 이 방식을 씀.
  // 영상을 페이지 맨 바깥(body)으로 잠시 옮겨 화면 전체에 고정 → 사이트 구조와 관계없이 항상 꽉 참.
  // 끄거나 영상이 끝나면 원래 자리로 되돌림. 전체화면에서 영상을 한 번 탭하면 tap(영상) 실행.
  const pseudoFs = ((P, play, tap, dbl) => {
    const CSS = `
      video.${P} { position: fixed !important; top: 0 !important; left: 0 !important; right: auto !important; bottom: auto !important;
                   width: 100vw !important; height: 100vh !important; height: 100dvh !important;
                   max-width: none !important; max-height: none !important; margin: 0 !important; padding: 0 !important;
                   object-fit: contain !important; background: #000 !important; z-index: 2147483646 !important;
                   opacity: 1 !important; visibility: visible !important; display: block !important; touch-action: manipulation !important; }
      html.${P}-on, html.${P}-on body { overflow: hidden !important; background: #000 !important;
                   transform: none !important; filter: none !important; contain: none !important; }`;
    let vid = null, home = null, homeParent = null, tapTimer = 0;
    // 자리를 옮기면 멈추는 경우가 있어, 재생 중이었다면 다시 재생
    const keepPlaying = (v, was) => {
      window.dispatchEvent(new Event('resize'));
      setTimeout(() => { if (was && v.paused) play(v); }, 400);
    };
    // 한 번 탭 → tap 실행 (두 번 탭과 구분하려고 0.3초 기다림)
    window.addEventListener('click', e => {
      if (!vid || e.target !== vid) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (tapTimer) { clearTimeout(tapTimer); tapTimer = 0; if (dbl) dbl(e, vid); return; }   // 두 번 탭
      tapTimer = setTimeout(() => {
        tapTimer = 0;
        if (vid) tap(vid);
      }, 300);
    }, true);
    const enter = v => {
      if (vid || !document.body) return;
      if (!document.getElementById(P + '-css')) {
        const s = document.createElement('style');
        s.id = P + '-css'; s.textContent = CSS;
        (document.head || document.documentElement).appendChild(s);
      }
      const was = !v.paused;
      vid = v;
      homeParent = v.parentNode;
      home = document.createComment(P);              // 원래 자리 표시
      homeParent.insertBefore(home, v);
      document.body.appendChild(v);                   // 같은 순간에 옮기므로 재생은 끊기지 않음
      v.classList.add(P);
      document.documentElement.classList.add(P + '-on');
      keepPlaying(v, was);
    };
    const exit = () => {
      if (!vid) return;
      const v = vid, was = !v.paused;
      v.classList.remove(P);
      document.documentElement.classList.remove(P + '-on');
      if (home && home.parentNode) home.parentNode.insertBefore(v, home);
      else if (homeParent && homeParent.isConnected) homeParent.appendChild(v);
      if (home) home.remove();
      vid = home = homeParent = null;
      keepPlaying(v, was);
    };
    // 영상이 끝나거나 다른 영상으로 바뀌면 원래 자리로 되돌림 → 사이트가 다음 영상을 정상적으로 이어서 재생
    ['ended', 'emptied'].forEach(ev => document.addEventListener(ev, e => { if (e.target === vid) exit(); }, true));
    return { enter, exit, video: () => vid };
  })('kr-fs', v => cmd('play', v), () => showFsBar(),          // YouTube: 한 번 탭 = 조작 막대 보이기
     (e, v) => {                                                   // 두 번 탭: 화면 왼쪽 1/3 = 10초 뒤로, 오른쪽 1/3 = 10초 앞으로
       const side = e.clientX < innerWidth / 3 ? -10 : e.clientX > innerWidth * 2 / 3 ? 10 : 0;
       if (!side) return;
       cmd('seek', v, Math.max(0, (+html.dataset.krT || 0) + side));
       fsGest.hud(side > 0 ? '10초 앞으로 ▶▶' : '◀◀ 10초 뒤로');
     });

  const landscape = matchMedia('(orientation: landscape)');
  const updateFs = v => {
    const want = landscape.matches && !isShorts() && !!vidId() && !!v;
    // 재생 준비된 영상만 전체화면으로 (끝난 영상은 다음 영상이 로드된 뒤 다시 들어감)
    if (want && pseudoFs.video() !== v && !v.ended && v.readyState >= 2) { pseudoFs.exit(); pseudoFs.enter(v); }
    else if (!want && pseudoFs.video()) pseudoFs.exit();
  };
  landscape.addEventListener('change', () => updateFs(pseudoFs.video() || document.querySelector('video')));

  // ----- 전체화면 조작 막대: 10초 뒤로 · 재생/일시정지 · 10초 앞으로 · 위치 막대 · 현재/전체 시간 -----
  // 영상을 한 번 탭하면 4초 동안 보임. 이동은 YouTube 자체 이동 기능으로만 (영상 직접 이동은 멈춤 원인)
  const ytTime = () => [+html.dataset.krT || 0, +html.dataset.krD || 0];
  let fsBarTimer = 0, dragging = false;
  const fsBar = () => {
    let bar = document.getElementById('kr-fsbar');
    if (bar || !document.body) return bar;
    bar = h('div', 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;display:none;' +
      'padding:8px 16px calc(10px + env(safe-area-inset-bottom));background:linear-gradient(transparent,rgba(0,0,0,.75));' +
      'color:#fff;font:600 13px -apple-system,sans-serif;');
    bar.id = 'kr-fsbar';
    const btn = 'background:none;border:none;color:#fff;font:600 18px -apple-system,sans-serif;padding:4px 14px;';
    const range = h('input', 'width:100%;accent-color:#f00;margin:0 0 6px');
    Object.assign(range, { type: 'range', min: 0, max: 1, step: 1, value: 0 });
    const mk = (a, txt) => { const b = h('button', btn, txt); b.dataset.a = a; return b; };
    const tEl = h('span', 'margin-left:auto', '0:00 / 0:00');
    tEl.dataset.t = '';
    bar.append(range, h('div', 'display:flex;align-items:center;gap:6px', mk('back', '« 10'), mk('play', '❚❚'), mk('fwd', '10 »'), tEl));
    range.addEventListener('input', () => { dragging = true; bar.querySelector('[data-t]').textContent = `${fmt(range.value)} / ${fmt(range.max)}`; showFsBar(); });
    range.addEventListener('change', () => { dragging = false; cmd('seek', pseudoFs.video(), +range.value); showFsBar(); });
    bar.addEventListener('click', e => {
      const a = e.target.dataset && e.target.dataset.a, v = pseudoFs.video();
      if (!a || !v) return;
      const [t] = ytTime();
      if (a === 'back') cmd('seek', v, Math.max(0, t - 10));
      else if (a === 'fwd') cmd('seek', v, t + 10);
      else cmd(v.paused ? 'play' : 'pause', v);
      showFsBar();
    });
    document.body.appendChild(bar);
    return bar;
  };
  // 막대 내용 갱신 (보일 때만)
  const updateFsBar = () => {
    const bar = document.getElementById('kr-fsbar'), v = pseudoFs.video();
    if (!bar || bar.style.display === 'none' || !v || dragging) return;
    const [t, d] = ytTime(), range = bar.querySelector('input');
    range.max = Math.floor(d) || 1;
    range.value = Math.floor(t);
    bar.querySelector('[data-t]').textContent = `${fmt(t)} / ${fmt(d)}`;
    bar.querySelector('[data-a="play"]').textContent = v.paused ? '▶' : '❚❚';
  };
  function showFsBar() {
    const bar = fsBar();
    if (!bar || !pseudoFs.video()) return;
    bar.style.display = 'block';
    updateFsBar();
    clearTimeout(fsBarTimer);
    fsBarTimer = setTimeout(() => { if (!dragging) bar.style.display = 'none'; }, 4000);
  }

  // ================= 11. 시청 화면: 아래로 내리면 영상도 함께 위로 (고정 해제) =================
  // YouTube는 세로 화면에서 플레이어를 위쪽에 고정(fixed/sticky)해 둠 → 내린 만큼 플레이어를 위로 밀어 올려
  // 아래 목록을 화면 전체로 보게 함. 화면 위치만 옮기므로 재생·소리는 그대로 계속됨.
  // (영상 밑 필터 칩 줄은 hideChips가 숨김) Shorts·가로 전체화면에서는 동작하지 않음.
  const unstick = (() => {
    let boxes = [], scroller = null;
    // 스크롤 양: 페이지 전체가 스크롤되는 경우와, YouTube가 화면 크기의 상자 안에서 스크롤하는 경우(로그인 화면 등에서 확인) 모두
    const scrollTop = () => Math.max(window.scrollY || 0, (document.scrollingElement || {}).scrollTop || 0,
      scroller && scroller.isConnected ? scroller.scrollTop : 0);
    const clear = () => { boxes.forEach(b => b.style.removeProperty('transform')); boxes = []; };
    const apply = () => {
      const y = scrollTop();
      boxes.forEach(b => { if (y > 0) b.style.setProperty('transform', `translateY(${-y}px)`, 'important'); else b.style.removeProperty('transform'); });
    };
    // 플레이어를 감싼 '고정된' 상자 찾기 (클래스 이름 대신 실제 스타일로 판단. Safari는 sticky를 -webkit-sticky로 알려 주기도 함)
    const isFixed = e => { const pos = getComputedStyle(e).position || ''; return pos === 'fixed' || pos.includes('sticky'); };
    const find = () => {
      const p = document.querySelector('#movie_player');
      if (!vidId() || isShorts() || pseudoFs.video() || landscape.matches || !p) return clear();
      const found = [];
      for (let e = p; e && e !== document.body; e = e.parentElement) if (isFixed(e)) found.push(e);
      boxes.filter(b => !found.includes(b)).forEach(b => b.style.removeProperty('transform'));
      boxes = found;
      apply();
    };
    // 스크롤 중: 위치는 매 화면마다, 고정 상자 찾기는 0.3초에 한 번 (+ 멈춘 뒤 한 번 더)
    let raf = 0, lastFind = 0, later = 0;
    const findNow = () => { lastFind = Date.now(); find(); };
    // 어느 상자가 스크롤되든 받기 위해 문서 전체에서 '잡아서' 들음 (스크롤 신호는 위로 전달되지 않으므로)
    document.addEventListener('scroll', e => {
      const t = e.target;
      if (t && t.nodeType === 1 && t.clientHeight > innerHeight * 0.5 && t.scrollTop > 0) scroller = t;   // 세로로 큰 상자만 (가로로 넘기는 칩 줄 제외)
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        clearTimeout(later);
        if (Date.now() - lastFind > 300) findNow(); else { apply(); later = setTimeout(findNow, 320); }
      });
    }, { capture: true, passive: true });
    return find;
  })();

  // ================= 11-2. 영상을 아래로 끌어내리면 이전 화면으로 (YouTube 앱 방식) =================
  // 시청 화면(세로·맨 위)에서 영상을 잡고 아래로 끌면 화면 전체가 손가락을 따라 내려가며 흐려지고,
  // 화면 높이의 1/4 이상 내리고 놓으면 아래로 사라지면서 이전 화면(보던 목록)으로 돌아감. 덜 내리면 제자리로.
  // (iPhone Safari는 끄는 순간 페이지 스크롤로 가져가 손가락 신호를 끊어 버리므로, 아래로 끄는 것이 확실해지면
  //  그 뒤 움직임은 직접 처리 — 예전 버전이 실제 폰에서 동작하지 않던 원인)
  (() => {
    let s = null;
    const page = () => document.querySelector('ytm-app') || document.body;   // 화면 전체 (위치 고정된 플레이어까지 함께 움직이도록)
    const reset = el => { el.style.removeProperty('transform'); el.style.removeProperty('opacity'); el.style.removeProperty('transition'); };
    const scrollTop = () => Math.max(window.scrollY || 0, (document.scrollingElement || {}).scrollTop || 0);
    document.addEventListener('touchstart', e => {
      s = null;
      if (!SET.swipeBack || e.touches.length !== 1 || !vidId() || isShorts() || pseudoFs.video() || landscape.matches) return;
      const p = document.querySelector('#movie_player');
      if (!p || !p.contains(e.target) || scrollTop() > 5) return;                 // 영상 위에서, 페이지 맨 위일 때만
      const t = e.touches[0];
      s = { x: t.clientX, y: t.clientY, dy: 0, on: false };
    }, { capture: true, passive: true });
    document.addEventListener('touchmove', e => {
      if (!s || e.touches.length !== 1) return;
      const t = e.touches[0], dx = t.clientX - s.x, dy = t.clientY - s.y;
      if (!s.on) {
        if (Math.hypot(dx, dy) < 12) return;
        if (dy < 0 || Math.abs(dx) > dy * 0.7) { s = null; return; }             // 위로·옆으로 → 일반 동작
        s.on = true;
      }
      e.preventDefault();                                                       // Safari가 스크롤로 가져가지 못하게
      s.dy = Math.max(0, dy);
      const el = page();
      el.style.setProperty('transition', 'none', 'important');
      el.style.setProperty('transform', `translateY(${s.dy}px)`, 'important');
      el.style.setProperty('opacity', String(Math.max(0.35, 1 - s.dy / innerHeight)), 'important');
    }, { capture: true, passive: false });
    const end = () => {
      if (!s || !s.on) { s = null; return; }
      const el = page(), go = s.dy > innerHeight / 4;
      s = null;
      el.style.setProperty('transition', 'transform .22s ease-in, opacity .22s ease-in', 'important');
      if (!go) { el.style.setProperty('transform', 'translateY(0)', 'important'); el.style.setProperty('opacity', '1', 'important'); setTimeout(() => reset(el), 260); return; }
      el.style.setProperty('transform', `translateY(${innerHeight}px)`, 'important');
      el.style.setProperty('opacity', '0', 'important');
      const from = location.href;
      setTimeout(() => {
        if (history.length > 1) history.back(); else location.href = '/';         // 바로 들어온 영상이면 홈으로
        // 이전 화면이 그려지면(주소가 바뀌면) 원래대로, 혹시 안 바뀌어도 1.5초 뒤 원래대로
        const t0 = Date.now(), wait = setInterval(() => {
          if (location.href !== from || Date.now() - t0 > 1500) { clearInterval(wait); reset(el); }
        }, 50);
      }, 200);
    };
    document.addEventListener('touchend', end, true);
    document.addEventListener('touchcancel', end, true);   // Safari가 신호를 끊어도 놓은 것으로 처리
  })();

  // ================= 메인 루프 (1초) — 확인 위주. 재생 위치에 따른 일(스폰서 건너뛰기·진행 막대)은 영상 시간 신호로 =================
  // 지금 보고 있는 영상: 전체화면 영상 > 재생 중인 영상 > 화면 가운데 영상 (Shorts)
  const activeVideo = () => {
    const vids = [...document.querySelectorAll('video')];
    return pseudoFs.video() || vids.find(v => !v.paused) ||
      vids.find(v => { const r = v.getBoundingClientRect(); return r.height > 0 && r.top < innerHeight / 2 && r.bottom > innerHeight / 2; }) ||
      vids[0];
  };
  let lastKey = null, adSkips = 0;

  // 영상 하단 진행 표시 (Shorts·일반 영상): 얇은 막대 + 왼쪽 아래 작은 "현재 / 전체" (오른쪽 버튼과 겹치지 않게)
  // 보기만 함(터치는 영상으로 통과). 광고 중·전체화면 조작 막대가 보일 때는 숨김.
  // 일반 영상은 YouTube가 알려주는 시간(광고 제외)을, Shorts는 영상 자체 시간을 씀.
  const progBar = (v, ad) => {
    let b = document.getElementById('kr-prog');
    const fb = document.getElementById('kr-fsbar');
    let t = 0, d = 0;
    if (v && !ad) {
      if (isShorts()) { t = v.currentTime; d = v.duration; }
      else if (vidId()) [t, d] = html.dataset.krPage ? ytTime() : [v.currentTime, v.duration];
    }
    const r = v ? v.getBoundingClientRect() : null;
    if (!(d > 0) || !isFinite(d) || !r || r.height < 50 || r.bottom < 80 || (fb && fb.style.display !== 'none')) {   // 영상이 위로 올라가 안 보이면 숨김
      if (b) b.style.display = 'none';
      return;
    }
    if (!b) {
      b = h('div', 'position:fixed;z-index:2147483646;pointer-events:none;',
        h('div', 'padding:0 8px 2px;font:500 10px -apple-system,sans-serif;color:rgba(255,255,255,.85);text-shadow:0 0 2px #000'),
        h('div', 'height:3px;background:rgba(255,255,255,.3);position:relative', h('div', 'height:100%;width:0;background:#f00')));
      b.id = 'kr-prog';
      document.body.appendChild(b);
    }
    // 스폰서 구간 표시 (노란 칸, 영상이 바뀌면 다시 그림)
    const track = b.lastChild, marksFor = vidId() + ':' + sbSegs.length + ':' + Math.round(d);
    if (track.__krMarks !== marksFor) {
      track.__krMarks = marksFor;
      [...track.children].slice(1).forEach(m => m.remove());
      if (!isShorts() && sbFor === vidId()) sbSegs.forEach(([a, e]) => track.appendChild(h('div',
        `position:absolute;top:0;height:100%;background:#ffd400;left:${a / d * 100}%;width:${Math.max(0.5, (e - a) / d * 100)}%`)));
    }
    const left = Math.max(0, r.left), right = Math.min(innerWidth, r.right);
    b.style.display = 'block';
    b.style.left = left + 'px';
    b.style.width = (right - left) + 'px';
    b.style.top = (Math.min(r.bottom, innerHeight) - b.offsetHeight) + 'px';
    t = Math.min(t, d);
    b.firstChild.textContent = `${fmt(t)} / ${fmt(d)}`;
    track.firstChild.style.width = (t / d * 100) + '%';
  };

  // 버튼 묶음 위치 (영상·목록을 가리지 않게)
  //  · 시청 화면 = 영상 위 검은 상단 바 안 (로고는 ▶ 아이콘만 남겨 자리를 만듦, 아이콘을 누르면 홈)
  //  · Shorts = 오른쪽 아래(세로) · 가로 전체화면·홈·검색 목록 = 숨김
  const placeBar = () => {
    const bar = document.getElementById('kr-bar');
    if (!bar) return;
    const set = css => { if (bar.__krCss !== css) { bar.__krCss = css; bar.style.cssText = 'position:fixed;z-index:2147483647;gap:4px;' + css; } };
    const watch = !!vidId() && !isShorts() && !pseudoFs.video();
    if (watch) html.dataset.krWatch = '1'; else delete html.dataset.krWatch;   // 로고 줄이기(CSS)는 시청 화면에서만
    if (isShorts()) return set('display:flex;flex-direction:column;align-items:flex-end;right:6px;bottom:calc(84px + env(safe-area-inset-bottom));');
    if (pseudoFs.video()) return set('display:none;');   // 가로 전체화면: 영상만 (버튼은 세로 화면에 있음, PiP는 두 손가락 톡)
    if (!vidId()) return set('display:none;');
    const head = document.querySelector('ytm-mobile-topbar-renderer, #header-bar'), logo = document.querySelector('ytm-home-logo');
    const hr = head && head.getBoundingClientRect(), lr = logo && logo.getBoundingClientRect();
    if (hr && hr.height > 20 && hr.bottom > 0) {
      const top = Math.round(hr.top + (hr.height - 22) / 2), left = Math.round((lr && lr.width ? lr.right : hr.left) + 8);
      set(`display:flex;top:${top}px;left:${left}px;`);
    } else set('display:flex;top:calc(8px + env(safe-area-inset-top));right:6px;');   // 상단 바를 못 찾으면 화면 오른쪽 위
  };

  // 진행 막대는 영상 시간이 바뀔 때마다(초당 약 4번) 갱신 — 1초 루프보다 부드럽고 따로 반복하지 않음
  let progRaf = 0;
  document.addEventListener('timeupdate', e => {
    if (progRaf || document.hidden || e.target.tagName !== 'VIDEO') return;
    progRaf = requestAnimationFrame(() => { progRaf = 0; try { progBar(activeVideo(), isAd()); } catch (err) {} });
  }, true);

  let barRaf = 0;   // 스크롤 중에도 버튼이 영상을 바로 따라가도록
  document.addEventListener('scroll', () => {
    if (!barRaf) barRaf = requestAnimationFrame(() => { barRaf = 0; try { placeBar(); } catch (e) {} });
  }, { capture: true, passive: true });

  every(1000, () => {
    ensureCss();
    const active = activeVideo();
    const ad = isAd();
    trackBreak(active, ad);
    checkSleep(active);
    if (!document.hidden) {                      // 화면 표시용은 보일 때만 (표시 오류가 나도 아래 기능은 계속 동작)
      try { progBar(active, ad); } catch (e) {}
      try { placeBar(); } catch (e) {}
    }
    if (resting) return;

    // 광고: '건너뛰기' 버튼이 나오면 누르기만 함.
    // (광고 위치를 강제로 옮기면 YouTube가 감지하거나 이어 붙은 본 영상까지 끝으로 밀려 플레이어가 멈춤)
    if (ad) {
      const skipBtns = document.querySelectorAll('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button');
      if (skipBtns.length) { adSkips++; skipBtns.forEach(b => b.click()); }
      return;
    }

    const key = pageKey();
    if (key !== lastKey) { lastKey = key; fixVolumePref(); }

    document.querySelectorAll('video').forEach(v => {
      if (v.hasAttribute('disablepictureinpicture')) v.removeAttribute('disablepictureinpicture');
      if (!v.__krEnd) { v.__krEnd = true; v.addEventListener('ended', () => onEnded(v)); }
    });
    if (!active) return;
    updateFs(active);
    const fb = document.getElementById('kr-fsbar');
    if (fb && !pseudoFs.video()) fb.style.display = 'none'; else updateFsBar();

    // Shorts: 화면 정리, 반복 끄기, 끝나면(처음으로 되감기면) 다음 편
    // (영상 칸이 다음 Shorts에 재사용되거나 직접 넘긴 직후에는 이전 기록을 버려 두 편씩 넘어가지 않게)
    if (isShorts() && SET.shortsNormal) return toNormal();   // YouTube가 화면 안에서 Shorts로 옮겨 간 경우
    if (isShorts()) {
      tidyShorts(active, key);
      if (active.loop) active.loop = false;
      if (active.__krKey !== key) { active.__krKey = key; active.__krLast = 0; }
      if (isFinite(active.duration) && active.duration > 0) {
        if (active.__krLast > active.duration - 2.5 && active.currentTime < 1.5 && !active.paused &&
            Date.now() - lastTap > 2000) nextShort();
        active.__krLast = active.currentTime;
      }
      return;
    }

    // 스폰서 구간 정보 받기 (건너뛰기는 YouTube 자체 기능으로 yt-page가 처리하므로 yt-page가 있을 때만)
    const id = vidId();
    if (!SET.sb || !SET.sbCats.length) { sbFor = null; sbSegs = []; delete html.dataset.krSb; }
    else if (id && html.dataset.krPage && sbFor !== id) loadSB(id);
    applySpeed(active);   // 채널이 바뀌어 속도가 다르면 맞춤 (재생 중일 때만)
  });

  // 가벼운 화면 정리는 2초마다
  every(2000, () => dismissStill(activeVideo()));          // '계속 시청' 창은 화면이 꺼져 있어도 닫아야 함
  look(2000, () => { hideAppButtons(); removeAppMeta(); });
  look(2000, unstick);

  // ================= 버튼 묶음: PiP / 화질 / 속도 (위치는 placeBar) =================
  const toast = msg => {
    let t = document.getElementById('kr-toast');
    if (!t) {
      t = h('div', 'position:fixed;left:50%;top:70px;transform:translateX(-50%);z-index:2147483647;' +
        'background:rgba(0,0,0,.85);color:#fff;padding:8px 14px;border-radius:16px;font:14px -apple-system,sans-serif;');
      t.id = 'kr-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    clearTimeout(t._h);
    t._h = setTimeout(() => t.remove(), 2500);
  };
  // ----- PiP 쉽게 켜고 끄기 (YouTube·일반 사이트 공통 코드) -----
  // · 영상 위를 두 손가락으로 '톡' → PiP 켜기
  // · PiP 중에는 화면 아무 곳이나 두 손가락으로 '톡' → 원래 화면으로 복귀
  // · PiP 버튼 글자가 상태에 따라 'PiP' ↔ '복귀'로 바뀜
  // (두 손가락 '톡' = 거의 움직이지 않고 0.45초 안에 뗀 것 → 벌려서 확대·스크롤과 구분)
  const pip = ((getVideo, onChange) => {
    // PiP 여부는 영상마다 직접 확인 (Safari는 webkitPresentationMode가 정확함.
    //  document.pictureInPictureElement는 PiP를 끈 뒤에도 남아 있는 경우가 있어 Safari가 아닐 때만 사용.
    //  영상이 바뀌며 비워진 옛 영상 칸(readyState 0)은 PiP 상태가 남아 있어도 무시)
    const inPip = v => !!v && v.isConnected && v.readyState > 0 && (v.webkitPresentationMode !== undefined
      ? v.webkitPresentationMode === 'picture-in-picture' : document.pictureInPictureElement === v);
    const current = () => [...document.querySelectorAll('video')].find(inPip) || null;
    const toggle = v => {
      try {
        const cur = current();
        if (cur) return cur.webkitSetPresentationMode ? cur.webkitSetPresentationMode('inline') : document.exitPictureInPicture();
        v = v || getVideo();
        if (!v) return;
        v.removeAttribute('disablepictureinpicture');
        if (v.webkitSetPresentationMode) v.webkitSetPresentationMode('picture-in-picture');
        else v.requestPictureInPicture().catch(() => {});
      } catch (e) {}
    };
    const pts = t => { const x = (t[0].clientX + t[1].clientX) / 2, y = (t[0].clientY + t[1].clientY) / 2;
      return { x, y, d: Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY) }; };
    const videoAt = (x, y) => current() || [...document.querySelectorAll('video')].find(v => {
      const r = v.getBoundingClientRect();
      return r.width > 80 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    });
    let two = null;
    document.addEventListener('touchstart', e => {
      if (e.touches.length === 2) { const p = pts(e.touches), v = videoAt(p.x, p.y); two = v ? { v, p, t: Date.now() } : null; }
      else if (e.touches.length > 2) two = null;
    }, { capture: true, passive: true });
    document.addEventListener('touchmove', e => {
      if (!two || e.touches.length !== 2) return;
      const p = pts(e.touches);
      if (Math.hypot(p.x - two.p.x, p.y - two.p.y) > 20 || Math.abs(p.d - two.p.d) > 20) two = null;   // 움직이면 취소
    }, { capture: true, passive: true });
    document.addEventListener('touchend', e => {
      if (!two || e.touches.length) return;   // 두 손가락을 모두 뗀 순간
      const v = two.v, quick = Date.now() - two.t < 450;
      two = null;
      if (!quick) return;
      e.preventDefault();                     // 사이트가 일반 '탭'으로 받아 재생/정지하지 않게
      toggle(v);
    }, { capture: true, passive: false });
    ['webkitpresentationmodechanged', 'enterpictureinpicture', 'leavepictureinpicture'].forEach(ev =>
      document.addEventListener(ev, () => onChange(!!current()), true));
    return { toggle, active: () => !!current() };
  })(() => activeVideo(), on => { const b = document.getElementById('kr-pip'); if (b) b.textContent = on ? '복귀' : 'PiP'; });
  // ----- 고르는 메뉴 (화질·속도): 버튼을 누르면 목록이 뜨고, 고르면 바로 적용 -----
  const closeMenu = () => {
    const m = document.getElementById('kr-menu'); if (m) m.remove();
    document.removeEventListener('click', closeMenu);
  };
  const openMenu = (btn, items, current, onPick) => {
    if (document.getElementById('kr-menu')) return closeMenu();   // 열려 있으면 닫기
    const m = h('div', 'position:fixed;z-index:2147483647;background:rgba(20,20,20,.95);border-radius:12px;padding:4px;' +
      'display:flex;flex-direction:column;min-width:76px;box-shadow:0 4px 16px rgba(0,0,0,.5);');
    m.id = 'kr-menu';
    items.forEach(([val, text]) => {
      if (val === null) return m.appendChild(h('div', 'color:#aaa;font:12px -apple-system,sans-serif;padding:6px 14px 2px', text));   // 안내 줄
      const on = String(val) === String(current);
      const it = h('button', 'background:none;border:none;color:' + (on ? '#4da3ff' : '#fff') +
        ';font:600 15px -apple-system,sans-serif;padding:9px 14px;text-align:left;', (on ? '✓ ' : '') + text);
      it.addEventListener('click', e => { e.stopPropagation(); closeMenu(); onPick(val); });
      m.appendChild(it);
    });
    document.body.appendChild(m);
    const r = btn.getBoundingClientRect(), mh = m.offsetHeight, mw = m.offsetWidth;   // 버튼 아래에 공간이 있으면 아래, 없으면 위
    m.style.left = Math.max(6, Math.min(innerWidth - mw - 6, r.left)) + 'px';
    m.style.top = (r.bottom + 4 + mh < innerHeight ? r.bottom + 4 : Math.max(6, r.top - 4 - mh)) + 'px';
    setTimeout(() => document.addEventListener('click', closeMenu), 0);   // 바깥을 누르면 닫힘
  };
  const BUTTONS = [
    ['kr-pip', () => (pip.active() ? '복귀' : 'PiP'), () => pip.toggle()],
    ['kr-quality', () => QNAME[getQuality()] || '자동', () => {
      // 이 영상에서 고를 수 있는 화질만 (yt-page가 알려 줌. 모르면 전체 목록)
      const avail = (html.dataset.krQList || '').split(',').filter(q => QHEIGHT[q]);
      const list = (avail.length ? avail : Object.keys(QHEIGHT).slice(2)).sort((a, b) => QHEIGHT[b] - QHEIGHT[a]);
      openMenu(document.getElementById('kr-quality'), [['auto', '자동']].concat(list.map(q => [q, QNAME[q]])), getQuality(), q => {
        localStorage.setItem('krQuality', q);
        saveQualityPref();   // 다음 영상부터 이 화질로 시작
        cmd('quality');      // 지금 영상: 고른 순간 바로 적용
        const b = document.getElementById('kr-quality'); if (b) b.textContent = QNAME[q];
        if (!html.dataset.krPage && q !== 'auto') toast(`${QNAME[q]} 저장됨 · 다음 영상부터 적용`);
      });
    }],
    ['kr-speed', () => getSpeed() + 'x', () => {
      const caption = SET.chanSpeed && chan() ? [[null, `'${chan().slice(0, 14)}' 채널에 기억`]] : [];
      openMenu(document.getElementById('kr-speed'), caption.concat(SPEEDS.map(x => [x, x + 'x'])), getSpeed(), x => {
        setSpeed(x);
        applySpeed(activeVideo());
        const b = document.getElementById('kr-speed'); if (b) b.textContent = x + 'x';
      });
    }],
    ['kr-set', () => (sleepLabel() ? '🌙 ' + sleepLabel() : '⚙'), () => openSettings()]
  ];
  // ----- 설정 화면 (⚙) -----
  const SET_ITEMS = [
    ['prune', '광고 일정 미리 빼기', '광고가 아예 예약되지 않게 함. YouTube가 광고 차단 경고를 띄우면 끄세요', true],
    ['origAudio', '자동 더빙 끄기', 'AI 더빙 대신 원래 음성으로'],
    ['sb', '스폰서 구간 건너뛰기', '광고·홍보·인트로 등 (SponsorBlock)'],
    ['chanSpeed', '채널별 속도 기억', '속도를 고르면 그 채널에만 적용'],
    ['fresh', '홈: 본 영상·반복 영상 숨김', '새 영상이 위로', true],
    ['rest', '1시간 연속 재생 시 휴식', ''],
    ['tidy', '좋아요·댓글·채널 로고 숨김', '', true],
    ['endCards', '영상 위 추천·정보 카드 숨김', ''],
    ['shortsNormal', 'Shorts를 일반 화면으로 열기', '속도·진행 막대·스폰서 건너뛰기를 Shorts에서도'],
    ['swipeBack', '영상을 아래로 내려 이전 화면으로', 'YouTube 앱처럼 영상을 손가락으로 끌어내리면 보던 목록으로']
  ];
  // ----- 작동 상태 (⚙ 아래쪽): 보이지 않게 동작하는 기능이 실제로 되고 있는지 표시 -----
  // 문제가 생기면 이 화면 스크린샷 한 장으로 원인을 알 수 있게
  const statusLines = () => {
    const st = loadJsonStr(html.dataset.krStat), ok = '✓', no = '–', warn = '⚠';
    const page = !!html.dataset.krPage, id = vidId(), L = [];
    const ago = t => { const m = Math.round((Date.now() - t) / 60e3); return m < 1 ? '방금' : m + '분 전'; };
    L.push([page ? ok : warn, page ? 'YT Page 연결됨 (백그라운드 재생·잠금 화면·명령)' : 'YT Page가 동작하지 않음 — 설치·켜짐 확인']);
    L.push(!SET.prune ? [no, '광고 일정 미리 빼기: 꺼짐'] : st.prune ? [ok, `광고 일정 ${st.prune}건 제거 (마지막 ${ago(st.pruneAt)})`]
      : [ok, '광고 일정 미리 빼기: 대기 중 (아직 제거할 광고 없음)']);
    L.push([adSkips ? ok : no, `광고 '건너뛰기' 누름: ${adSkips}번 (영상에 붙어 온 광고)`]);
    if (id && !isShorts()) {
      const a = st.audio || '';
      L.push(!SET.origAudio ? [no, '자동 더빙 끄기: 꺼짐'] : a.startsWith('switched:') ? [ok, `원래 음성으로 바꿈 (${a.slice(9)} → 원래)`]
        : a === 'orig' ? [ok, '원래 음성으로 재생 중'] : a === 'single' ? [ok, '음성 하나뿐 (더빙 없음)']
        : a === 'noorig' ? [warn, '여러 음성 중 원래 음성을 찾지 못함'] : [no, '음성 확인 중 (재생 중일 때 확인)']);
      const c = st.cap || '';
      L.push(!SET.capLang ? [no, '자막 자동 켜기: 꺼짐'] : c.startsWith('on:') ? [ok, `자막 켬: ${c.slice(3)}`]
        : c.startsWith('translated:') ? [ok, `자막 자동 번역: ${c.slice(11)} → ${SET.capLang}`] : c === 'none' ? [no, '이 영상엔 자막 없음']
        : c === 'fail' ? [warn, '자막을 켜지 못함'] : [no, '자막 확인 중']);
      L.push(!SET.sb ? [no, '스폰서 건너뛰기: 꺼짐'] : sbFor !== id ? [no, '스폰서 구간 받는 중']
        : sbSegs.length ? [ok, `스폰서 구간 ${sbSegs.length}개 · ${st.skips || 0}번 건너뜀`] : [ok, '이 영상엔 등록된 스폰서 구간 없음']);
      L.push([ok, `속도 ${getSpeed()}x · ${SET.chanSpeed && chanSpeeds[chan()] ? `'${chan().slice(0, 14)}' 채널 기억` : '기본 속도'}`]);
      L.push([st.ms ? ok : no, st.ms ? '잠금 화면 버튼 연결됨' : '잠금 화면 버튼 연결 대기']);
    }
    // 화면 구조 점검: 이 스크립트가 기대하는 YouTube 화면 요소가 있는지
    const need = id && !isShorts()
      ? [['플레이어', '#movie_player'], ['상단 바', 'ytm-mobile-topbar-renderer, #header-bar'],
         ['제목 줄', 'yt-video-metadata-view-model, ytm-slim-video-metadata-section-renderer, .slim-video-information-title']]
      : location.pathname === '/' ? [['홈 목록', 'ytm-rich-item-renderer, ytm-video-with-context-renderer']] : [];
    const miss = need.filter(([, sel]) => !document.querySelector(sel)).map(([n]) => n);
    if (need.length) L.push(miss.length ? [warn, `화면 구조 바뀜: ${miss.join(', ')}을(를) 못 찾음`] : [ok, '화면 구조 정상']);
    L.push([no, `버전 ${VERSION}`]);
    return L;
  };
  const loadJsonStr = t => { try { return JSON.parse(t) || {}; } catch (e) { return {}; } };
  const openSettings = () => {
    closeMenu();
    if (document.getElementById('kr-settings')) return;
    const sheet = h('div', 'position:absolute;left:0;right:0;bottom:0;max-height:85vh;overflow:auto;background:#1c1c1e;color:#fff;' +
      'border-radius:16px 16px 0 0;padding:14px 16px calc(16px + env(safe-area-inset-bottom));font:15px -apple-system,sans-serif;',
      h('div', 'font:700 18px -apple-system,sans-serif;margin-bottom:8px', '설정'));
    const wrap = h('div', 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.55);', sheet);
    wrap.id = 'kr-settings';
    const row = (...kids) => h('div', 'display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid #333', ...kids);
    const chip = (text, on, fn) => {
      const c = h('button', `padding:5px 10px;border:none;border-radius:12px;font:600 12px -apple-system,sans-serif;color:#fff;background:${on ? '#30d158' : '#48484a'}`, text);
      c.addEventListener('click', fn);
      return c;
    };
    // 취침 타이머
    const sleepBox = h('div', 'display:flex;flex-wrap:wrap;gap:6px;margin-top:6px');
    const paintSleep = () => {
      sleepBox.replaceChildren(...[['끔', 0], ['15분', 15], ['30분', 30], ['60분', 60], ['이 영상 끝나면', 'end']].map(([t, m]) => {
        const on = m === 'end' ? sleepEnd : !sleepEnd && sleepMin === m;
        return chip(t, on, () => { setSleep(m); paintSleep(); const b = document.getElementById('kr-set'); if (b) b.textContent = BUTTONS.find(x => x[0] === 'kr-set')[1](); });
      }));
    };
    paintSleep();
    sheet.appendChild(row(h('div', 'flex:1', h('div', '', '🌙 취침 타이머' + (sleepLabel() ? ` (남은 ${sleepLabel()})` : '')),
      h('div', 'color:#999;font-size:12px;margin-top:2px', '정한 시간이 지나면 멈춤 (화면이 꺼져 있어도)'), sleepBox)));
    const reloadBtn = h('button', 'display:none;width:100%;margin-top:10px;padding:11px;border:none;border-radius:10px;background:#0a84ff;color:#fff;font:600 15px -apple-system,sans-serif', '새로고침해서 적용');
    reloadBtn.addEventListener('click', () => location.reload());
    SET_ITEMS.forEach(([k, label, desc, reload]) => {
      const sw = h('button', '', '');
      const paint = () => { sw.textContent = SET[k] ? '켜짐' : '꺼짐';
        sw.style.cssText = `min-width:58px;padding:6px 10px;border:none;border-radius:14px;font:600 13px -apple-system,sans-serif;color:#fff;background:${SET[k] ? '#30d158' : '#48484a'}`; };
      paint();
      sw.addEventListener('click', () => {
        SET[k] = !SET[k];
        saveSet();
        applySet(); paint();
        if (reload) reloadBtn.style.display = 'block';
      });
      sheet.appendChild(row(h('div', 'flex:1', h('div', '', label + (reload ? ' *' : '')), desc ? h('div', 'color:#999;font-size:12px;margin-top:2px', desc) : ''), sw));
      // 스폰서 구간 범주 고르기 (스폰서 줄 바로 아래)
      if (k === 'sb') {
        const box = h('div', 'display:flex;flex-wrap:wrap;gap:6px;padding:0 0 10px');
        const paintCats = () => box.replaceChildren(...SB_ALL.map(([c, t]) => chip(t, SET.sbCats.includes(c), () => {
          SET.sbCats = SET.sbCats.includes(c) ? SET.sbCats.filter(x => x !== c) : SET.sbCats.concat(c);
          saveSet(); sbFor = null; paintCats();   // 다음 확인 때 새 범주로 다시 받음
        })));
        paintCats();
        sheet.appendChild(box);
      }
    });
    // 자막 자동 켜기 (언어)
    const capBox = h('div', 'display:flex;flex-wrap:wrap;gap:6px;margin-top:6px');
    const paintCap = () => capBox.replaceChildren(...[['끔', ''], ['한국어', 'ko'], ['English', 'en']].map(([t, l]) =>
      chip(t, SET.capLang === l, () => { SET.capLang = l; saveSet(); paintCap(); })));
    paintCap();
    sheet.appendChild(row(h('div', 'flex:1', h('div', '', '자막 자동 켜기'),
      h('div', 'color:#999;font-size:12px;margin-top:2px', '고른 언어 자막을 켬. 없으면 자동 번역 (다음 영상부터)'), capBox)));
    // 작동 상태 (열려 있는 동안 1초마다 갱신)
    const statBox = h('div', 'margin-top:12px;padding:10px 12px;border-radius:10px;background:#2c2c2e;font:13px/1.55 -apple-system,sans-serif');
    statBox.id = 'kr-stat';
    const paintStat = () => statBox.replaceChildren(h('div', 'font-weight:700;margin-bottom:4px', '작동 상태'),
      ...statusLines().map(([i, t]) => h('div', `color:${i === '⚠' ? '#ffd60a' : i === '✓' ? '#fff' : '#999'}`, `${i} ${t}`)));
    paintStat();
    const statTimer = setInterval(() => { if (!wrap.isConnected) clearInterval(statTimer); else paintStat(); }, 1000);
    sheet.appendChild(statBox);
    const close = h('button', 'width:100%;margin-top:10px;padding:11px;border:none;border-radius:10px;background:#3a3a3c;color:#fff;font:600 15px -apple-system,sans-serif', '닫기');
    close.addEventListener('click', () => wrap.remove());
    wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });
    sheet.append(h('div', 'color:#999;font-size:12px;margin-top:8px', '* 표시는 새로고침 후 적용'), reloadBtn, close);
    document.body.appendChild(wrap);
  };
  const ensureBar = () => {
    if (!document.body || document.getElementById('kr-bar')) return;
    const bar = h('div', 'position:fixed;z-index:2147483647;display:none;gap:4px;');
    bar.id = 'kr-bar';
    BUTTONS.forEach(([id, label, action]) => {
      const b = h('button', 'background:rgba(0,0,0,.5);color:#fff;border:none;border-radius:10px;' +
        'padding:3px 7px;font:600 11px -apple-system,sans-serif;', label());
      b.id = id;
      b.addEventListener('click', () => { action(); b.textContent = label(); });
      bar.appendChild(b);
    });
    document.body.appendChild(bar);
  };
  // 1초마다: 작업별로 따로 실행 (하나가 오류 나도 나머지는 계속)
  look(1000, () => {
    ensureBar();
    // 버튼 글자 갱신 (PiP 상태, 영상·채널이 바뀌어 달라진 화질·속도)
    BUTTONS.forEach(([id, label]) => { const b = document.getElementById(id), t = label(); if (b && b.textContent !== t) b.textContent = t; });
  });
  look(1000, freshFeed);
  look(1000, () => { trimViews(); addDates(); });
  look(1000, () => { cleanHeader(); hideComments(); hideAdRows(); hideChips(); });
  look(1000, hideAvatars);
})();

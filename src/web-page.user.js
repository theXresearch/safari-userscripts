// ==UserScript==
// @name         Web Page
// @namespace    https://github.com/theXresearch/safari-userscripts
// @version      2026.11.05.6
// @author       theXresearch
// @updateURL    https://raw.githubusercontent.com/theXresearch/safari-userscripts/main/src/web-page.user.js
// @downloadURL  https://raw.githubusercontent.com/theXresearch/safari-userscripts/main/src/web-page.user.js
// @description  일반 사이트 페이지 안쪽 처리: 실드(광고 새 창·몰래 이동 차단), 화면 숨김 감지 차단(PiP 백그라운드 재생), 광고차단 감지 무력화, 화질 적용, hls.js 늦은 로딩 대비
// @match        *://*/*
// @exclude      *://*.youtube.com/*
// @run-at       document-start
// @inject-into  page
// ==/UserScript==
(function () {
  'use strict';
  // ================= 1. 광고 사이트로 가는 새 창·이동 차단 (광고 iframe 안에서도 동작) =================
  // 광고 사이트는 사용자가 화면을 누른 순간을 이용해 창을 열거나, 현재 페이지를 광고로 바꿔 버림
  // → Safari 기본 '팝업 차단'으로는 못 막으므로 여기서 막음.
  // 광고 도메인 목록은 web-adblock이 <html data-kw-ad>에 넣어 둔 것을 사용 (목록은 web-adblock 한 곳에서 관리).
  // 광고 iframe 안이나 목록이 아직 없을 때만 아래 최소 목록 사용.
  const BASE_AD = 'popads|popcash|propeller|adsterra|exoclick|exosrv|realsrv|magsrv|tsyndicate|trafficjunky|trafficstars|juicyads|clickadu|hilltopads|adcash|onclkds|stripchat|chaturbate|bongacams|livejasmin|camsoda|cam4|xlovecam|imlive|flirt4free|myfreecams|streamate';
  const adRe = () => {
    let src = '';
    try { src = document.documentElement.dataset.kwAd || window.top.document.documentElement.dataset.kwAd || ''; } catch (e) {}
    try { return new RegExp(src || BASE_AD, 'i'); } catch (e) { return new RegExp(BASE_AD, 'i'); }
  };
  // 주소 전체가 아니라 '사이트 이름'만 검사 (정상 링크 오차단 방지).
  // 지금 보고 있는 사이트 안에서의 이동은 막지 않음 (그 사이트에 직접 들어간 경우)
  const base = h => h.split('.').slice(-2).join('.');
  let topHost = location.hostname;
  try { topHost = window.top.location.hostname; } catch (e) {          // 다른 사이트의 광고 iframe 안
    try {
      const ao = location.ancestorOrigins;
      topHost = new URL(ao && ao.length ? ao[ao.length - 1] : document.referrer).hostname;
    } catch (e2) { topHost = ''; }
  }
  const hostOf = url => { try { return new URL(String(url || ''), location.href).hostname; } catch (e) { return ''; } };
  const isAd = url => {
    const h = hostOf(url);
    return !!h && (!topHost || base(h) !== base(topHost)) && adRe().test(h);
  };
  // 로그인·결제·공유 창은 다른 사이트라도 정상
  const SAFE = /(google|apple|icloud|facebook|twitter|x\.com|instagram|kakao|naver|daum|line\.me|t\.me|telegram|whatsapp|reddit|pinterest|linkedin|paypal|stripe|microsoft|live\.com|github|amazon|youtube)/i;
  const foreignTo = (url, ref) => {
    const h = hostOf(url);
    return !!h && !!ref && base(h) !== base(ref) && !SAFE.test(h);
  };
  const foreign = url => foreignTo(url, topHost);

  // ----- 실드 (Brave 방식 팝업 차단) -----
  // 기본 켜짐. 사이트별로 끌 수 있음 (🚫 → '실드' 버튼, web-adblock). 끄면 광고 목록에 있는 사이트만 막음.
  // 켜져 있으면 광고 주소를 몰라도 '수법' 자체를 막음:
  //  · 새 창은 사용자가 방금 누른 링크가 가리키는 곳(또는 로그인/결제/공유)만 허용
  //  · 화면을 누른 직후 페이지가 몰래 다른 사이트로 넘어가는 것 차단 (광고를 새 탭에 열고 원래 페이지를 광고로 바꾸는 수법)
  //  · 스크립트가 몰래 만든 링크 누르기, 영상 위를 덮은 보이지 않는 큰 링크 차단
  let shield = true;
  try { shield = localStorage.getItem('kwShield') !== 'off'; } catch (e) {}

  // 사용자가 방금 직접 누른 것
  let tapped = { base: '', at: 0 };
  window.addEventListener('click', e => {
    if (!e.isTrusted) return;
    const a = e.target && e.target.closest && e.target.closest('a[href]');
    tapped = { base: a ? base(hostOf(a.href)) : '', at: Date.now() };
  }, true);
  const justTapped = () => Date.now() - tapped.at < 2000;
  // 영상 파일·스트림 주소(.m3u8·.mp4 등)나 앱 열기 주소(vlc:// 등)는 광고가 아님 →
  // 사용자가 방금 화면을 눌렀다면 허용 (M3U8 같은 다른 확장 프로그램이 영상을 새 탭·외부 앱으로 여는 기능을 막지 않도록)
  const isMedia = url => {
    const u = String(url || '');
    return /\.(m3u8|mpd|mp4|m4v|mov|webm|ts)([?#]|$)/i.test(u) || /m3u8/i.test(u) || /^(blob|data):/i.test(u) ||
      (/^[a-z][\w+.-]*:/i.test(u) && !/^(https?|javascript|about):/i.test(u));
  };
  const userChose = url => justTapped() && ((!!tapped.base && tapped.base === base(hostOf(url))) || isMedia(url));

  // 새 창
  // 막을 때 null 대신 '이미 닫힌 가짜 창'을 돌려줌 → 광고 코드가 창을 다루다 오류로 멈추면서
  // 같은 코드에 묶인 사이트 기능(재생 버튼 등)까지 멈추는 것을 막음
  // 막은 횟수 → <html data-kw-st-blocked> (web-main ⚙ '작동 상태'에 표시)
  let blocked = 0;
  const bump = () => { blocked++; try { document.documentElement.dataset.kwStBlocked = blocked; } catch (e) {} };
  const noop = () => {};
  const fakeWin = () => ({ closed: true, opener: null, close: noop, focus: noop, blur: noop, postMessage: noop,
    location: { href: '', assign: noop, replace: noop, reload: noop }, document: { write: noop, writeln: noop, open: noop, close: noop } });
  const origOpen = window.open;
  window.open = function (url, ...rest) {
    const u = String(url || '').trim();
    if (isAd(u)) { bump(); return fakeWin(); }
    // 실드: 직접 누른 링크가 가리키는 곳이거나 로그인·결제·공유 창일 때만 허용 (같은 사이트를 새 탭에 복제하는 수법도 차단)
    if (shield && !userChose(u || location.href) && !(u && SAFE.test(hostOf(u)))) { bump(); return fakeWin(); }
    return origOpen.call(window, url, ...rest);
  };
  // 스크립트가 몰래 만든 링크를 대신 누르는 방식
  const sneaky = a => isAd(a.href) || (shield && a.target === '_blank' && foreign(a.href) && !isMedia(a.href));
  try {
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { if (sneaky(this)) return bump(); return origClick.call(this); };
    const origDispatch = EventTarget.prototype.dispatchEvent;
    EventTarget.prototype.dispatchEvent = function (ev) {
      if (ev && ev.type === 'click' && this instanceof HTMLAnchorElement && sneaky(this)) { bump(); return false; }
      return origDispatch.call(this, ev);
    };
  } catch (e) {}
  // 링크 클릭: 광고 사이트 링크, 또는 영상 위를 덮은 '보이지 않는' 큰 링크
  document.addEventListener('click', e => {
    const a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    let overlay = false;
    if (shield && a.target === '_blank' && foreign(a.href) && !a.textContent.trim() && !a.querySelector('img,picture,video')) {
      const r = a.getBoundingClientRect();
      overlay = r.width * r.height > innerWidth * innerHeight * 0.3;
    }
    if (isAd(a.href) || overlay) { e.preventDefault(); e.stopImmediatePropagation(); bump(); }
  }, true);
  // 페이지 이동: 광고 사이트로는 항상 차단. 실드가 켜져 있으면, 화면을 누른 직후
  // 누른 링크와 다른 사이트로 몰래 넘어가는 것도 차단 (양식 제출·새로고침·뒤로가기는 제외)
  if (window.navigation && window.navigation.addEventListener) {
    window.navigation.addEventListener('navigate', e => {
      if (!e.cancelable || !e.destination) return;
      const url = e.destination.url;
      const sneakyNav = shield && !e.formData && (e.navigationType === 'push' || e.navigationType === 'replace') &&
        justTapped() && foreignTo(url, location.hostname) && !userChose(url);
      if (isAd(url) || sneakyNav) { e.preventDefault(); bump(); }
    });
  }

  if (window.top !== window.self) return;   // 아래는 바깥 페이지에서만
  const markReady = () => { if (document.documentElement) document.documentElement.dataset.kwPage = shield ? 'on' : 'off'; else setTimeout(markReady, 10); };
  markReady();   // web-main에게 '동작 중'과 실드 상태를 알림

  // ================= 2. 화면 숨김 감지 차단 =================

  // 사이트가 "화면이 안 보인다"·"창을 벗어났다"고 판단해 스스로 영상을 멈추는 것을 막음
  // → PiP 상태로 홈 화면·다른 앱으로 가도 계속 재생
  try {
    const def = (k, v) => Object.defineProperty(document, k, { get: () => v, configurable: true });
    def('hidden', false);
    def('webkitHidden', false);
    def('visibilityState', 'visible');
    def('webkitVisibilityState', 'visible');
  } catch (e) {}
  ['visibilitychange', 'webkitvisibilitychange'].forEach(ev =>
    window.addEventListener(ev, e => e.stopImmediatePropagation(), true));
  window.addEventListener('blur', e => { if (e.target === window) e.stopImmediatePropagation(); }, true);
  try { document.hasFocus = () => true; } catch (e) {}

  // ================= 3. 광고차단 감지 무력화 =================
  // 흔히 쓰는 광고차단 감지 도구들이 항상 "광고차단 없음"으로 판단하도록 가짜로 바꿔치기
  const fake = {
    onDetected() { return fake; },
    onNotDetected(fn) { try { fn && fn(); } catch (e) {} return fake; },
    on(detected, fn) { if (!detected) try { fn && fn(); } catch (e) {} return fake; },
    check() {}, emitEvent() { return fake; }, clearEvent() {}, setOption() { return fake; }
  };
  const lock = (k, v) => { try { Object.defineProperty(window, k, { get: () => v, set() {}, configurable: true }); } catch (e) {} };
  ['blockAdBlock', 'fuckAdBlock', 'sniffAdBlock'].forEach(k => lock(k, fake));
  ['BlockAdBlock', 'FuckAdBlock'].forEach(k => lock(k, function () { return fake; }));
  lock('canRunAds', true);
  lock('isAdBlockActive', false);
  lock('adBlockEnabled', false);

  // ================= 4. 화질 =================
  // web-main 화질 메뉴에서 고른 값(<html data-kw-quality>: 1080·720·…·auto)을 사이트 플레이어에 적용하고,
  // 이 영상에서 고를 수 있는 화질 목록을 <html data-kw-q-list>로 알려 줌 (메뉴에 그 목록만 표시).
  const pickIndex = (heights, want) => {
    let best = -1;
    heights.forEach((h, i) => { if (h && h <= want && (best < 0 || h > heights[best])) best = i; });
    if (best < 0) heights.forEach((h, i) => { if (h && (best < 0 || h < heights[best])) best = i; });  // 전부 높으면 가장 낮은 것
    return best;
  };
  const num = x => parseInt(String(x || '').replace(/[^\d]/g, ''), 10) || 0;

  // ----- hls.js -----
  // 재생 멈춤 방지: 사이트가 hls.js를 늦게(비동기로) 불러오는데 그 전에 'Hls.isSupported()'를 부르면
  // 오류로 플레이어 준비가 통째로 멈춤 (진단에서 확인). → hls.js가 오기 전에는 '지원 안 함'이라고 답하는
  // 대역을 세워 두어, 사이트가 iPhone 기본 재생(Safari 자체 HLS)으로 넘어가게 함. 진짜 hls.js가 오면 그것을 씀.
  function HlsStub() {}
  Object.assign(HlsStub, { isSupported: () => false, isMSESupported: () => false, Events: {}, ErrorTypes: {}, ErrorDetails: {}, DefaultConfig: {}, version: '0' });
  Object.assign(HlsStub.prototype, { loadSource: noop, attachMedia: noop, detachMedia: noop, destroy: noop, on: noop, off: noop, once: noop, startLoad: noop, stopLoad: noop });
  let HlsReal;
  try {
    Object.defineProperty(window, 'Hls', { configurable: true, enumerable: true, get: () => HlsReal || HlsStub, set: v => { HlsReal = v; } });
  } catch (e) {}
  // 화질을 바꾸려고 사이트의 hls.js 플레이어를 기록 (hls.js는 그대로 두고 '영상에 연결하는 함수'만 감쌈)
  const hlsList = [];
  const hookHls = () => {
    const H = HlsReal;
    if (typeof H !== 'function' || !H.prototype || H.prototype.__kwHooked) return;
    const orig = H.prototype.attachMedia;
    if (typeof orig !== 'function') return;
    H.prototype.attachMedia = function (...a) { if (!hlsList.includes(this)) hlsList.push(this); return orig.apply(this, a); };
    H.prototype.__kwHooked = true;
  };
  let hookTries = 0;
  const hookTimer = setInterval(() => { hookHls(); if (++hookTries > 50) clearInterval(hookTimer); }, 200);   // 처음 10초 동안 확인

  // 각 처리기는 사이트가 제공하는 화질 목록(세로 픽셀 배열)을 돌려줌 (없으면 null).
  // want = 0(자동)이면 사이트 기본 그대로 두고 목록만 알려줌.
  const controllers = [
    // Plyr (설정 톱니바퀴에 화질 메뉴가 있는 플레이어)
    want => {
      let list = null;
      document.querySelectorAll('video').forEach(v => {
        const p = v.plyr;
        if (!p) return;
        const opts = ((p.options && p.options.quality) || (p.config && p.config.quality && p.config.quality.options) || [])
          .map(num).filter(Boolean);
        if (opts.length < 2) return;
        list = opts;
        if (want) { const q = opts[pickIndex(opts, want)]; if (num(p.quality) !== q) p.quality = q; }
      });
      return list;
    },
    // hls.js
    want => {
      let list = null;
      hlsList.forEach(h => {
        if (!h.levels || h.levels.length < 2) return;
        list = h.levels.map(l => l.height);
        const i = want ? pickIndex(list, want) : -1;
        if (h.currentLevel !== i && (want || h.autoLevelEnabled === false)) h.currentLevel = i;   // -1 = 자동
      });
      return list;
    },
    // JW Player
    want => {
      if (typeof window.jwplayer !== 'function') return null;
      try {
        const p = window.jwplayer();
        const lv = p && p.getQualityLevels && p.getQualityLevels();
        if (!lv || lv.length < 2) return null;
        const hs = lv.map(l => l.height || num(l.label));
        const i = want ? pickIndex(hs, want) : lv.findIndex(l => /auto/i.test(l.label));
        if (i >= 0 && p.getCurrentQuality() !== i) p.setCurrentQuality(i);
        return hs;
      } catch (e) { return null; }
    },
    // video.js (quality-levels 플러그인)
    want => {
      if (!window.videojs || !window.videojs.getPlayers) return null;
      let list = null;
      Object.values(window.videojs.getPlayers()).forEach(p => {
        try {
          const ql = p && p.qualityLevels && p.qualityLevels();
          if (!ql || ql.length < 2) return;
          const hs = []; for (let i = 0; i < ql.length; i++) hs.push(ql[i].height);
          list = hs;
          const pick = want ? pickIndex(hs, want) : -1;
          for (let i = 0; i < ql.length; i++) ql[i].enabled = pick < 0 || i === pick;
        } catch (e) {}
      });
      return list;
    },
    // 화질별 파일이 <source>로 여러 개 있는 경우
    want => {
      let list = null;
      document.querySelectorAll('video').forEach(v => {
        if (v.plyr) return;   // Plyr가 직접 관리
        const srcs = [...v.querySelectorAll('source[src]')];
        if (srcs.length < 2) return;
        const hs = srcs.map(s => num(s.getAttribute('size') || s.getAttribute('res') ||
          s.getAttribute('label') || s.getAttribute('data-quality') || s.getAttribute('title')));
        if (hs.filter(Boolean).length < 2) return;
        list = hs.filter(Boolean);
        if (!want) return;
        const url = srcs[pickIndex(hs, want)].src;
        if (v.currentSrc === url) return;
        const t = v.currentTime, playing = !v.paused;
        v.src = url;
        v.addEventListener('loadedmetadata', () => { v.currentTime = t; if (playing) v.play().catch(() => {}); }, { once: true });
      });
      return list;
    }
  ];

  // 1.5초마다 (영상이 있을 때만). 목록이 비어 있으면 화질 선택 불가 = Safari 자동
  setInterval(() => {
    if (!document.querySelector('video')) return;
    hookHls();
    const q = document.documentElement.dataset.kwQuality || 'auto';
    const want = q === 'auto' ? 0 : num(q);
    const all = new Set();
    controllers.forEach(c => { try { (c(want) || []).forEach(h => h && all.add(h)); } catch (e) {} });
    const list = [...all].sort((x, y) => y - x).join(',');
    const ds = document.documentElement.dataset;
    if (ds.kwQList !== list) ds.kwQList = list;
  }, 1500);
})();

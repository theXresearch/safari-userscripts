// ==UserScript==
// @name         YT Page
// @namespace    https://github.com/theXresearch/safari-userscripts
// @version      2026.11.12.2
// @author       theXresearch
// @updateURL    https://raw.githubusercontent.com/theXresearch/safari-userscripts/main/src/yt-page.meta.js
// @downloadURL  https://raw.githubusercontent.com/theXresearch/safari-userscripts/main/src/yt-page.user.js
// @description  YouTube 플레이어 자체 기능으로 제어: 광고 일정 미리 빼기, 자동 더빙 끄기(원래 음성), 자막 자동 켜기, 작동 상태 보고, 재생·정지·다음·이동·속도·소리·화질 명령 실행, 재생 시간·화질 목록 보고, 화면 숨김·창 벗어남 감지 차단, 잠금 화면 재생 버튼 연결, '계속 시청' 멈춤 방지
// @match        *://*.youtube.com/*
// @run-at       document-start
// @inject-into  page
// ==/UserScript==
(function () {
  'use strict';
  // 원칙: 플레이어 상태는 'yt-main의 명령이 올 때'만 바꿈.
  //       주기적으로 계속 덮어쓰면 YouTube와 충돌해 재생 버튼이 먹통이 됨.

  // ================= 1. 화면 숨김 감지 차단 =================
  // YouTube는 탭 전환·PiP·앱 전환 시 "화면이 안 보인다"고 판단하면 스스로 멈춤 → 항상 보이는 것으로 위장
  try {
    const def = (k, v) => Object.defineProperty(document, k, { get: () => v, configurable: true });
    def('hidden', false);
    def('webkitHidden', false);
    def('visibilityState', 'visible');
    def('webkitVisibilityState', 'visible');
  } catch (e) {}
  ['visibilitychange', 'webkitvisibilitychange'].forEach(ev =>
    window.addEventListener(ev, e => e.stopImmediatePropagation(), true));
  // '창을 벗어났다'는 신호도 차단 (화면을 끄거나 다른 앱으로 갈 때 발생)
  window.addEventListener('blur', e => { if (e.target === window) e.stopImmediatePropagation(); }, true);
  try { document.hasFocus = () => true; } catch (e) {}
  // '계속 시청하시겠습니까?' 방지: YouTube가 기억하는 마지막 활동 시간을 계속 갱신
  // (화면이 꺼져 있으면 창을 자동으로 닫을 수 없어 그대로 멈추므로, 창이 아예 뜨지 않게 함)
  setInterval(() => { try { window._lact = Date.now(); } catch (e) {} }, 30000);

  // (document-start 순간에는 <html>이 아직 없을 수 있어 그때그때 찾음)
  const root = () => document.documentElement;

  // ================= 1-2. 광고 미리 빼기 (uBlock·AdGuard의 json-prune 방식) =================
  // YouTube가 영상 정보와 함께 보내는 '광고 일정'(adPlacements·playerAds·adSlots)을 플레이어가 읽기 전에 지움
  // → 광고가 아예 예약되지 않음. 영상 자체에 붙여 보내는 광고(SSAP)는 못 빼므로 yt-main의 '건너뛰기'가 계속 대비.
  // 끄기: ⚙ 설정 → '광고 일정 미리 빼기' (YouTube가 광고 차단 경고를 띄우면 끄면 됨)
  const AD_KEYS = ['adPlacements', 'playerAds', 'adSlots', 'adBreakHeartbeatParams'];
  // 설정(yt-main의 ⚙): localStorage krSet = { prune, origAudio, capLang, ... }
  const settings = () => { try { return JSON.parse(localStorage.getItem('krSet')) || {}; } catch (e) { return {}; } };
  const setting = k => settings()[k] !== false;                 // 켜고 끄는 항목 (기본 켜짐)
  // 작동 상태 (yt-main ⚙ 아래 '작동 상태'에 표시): <html data-kr-stat>
  const st = { prune: 0, pruneAt: 0, ms: false, vid: '', audio: '', skips: 0, cap: '' };
  const pruneOn = setting('prune') && (() => { try { return localStorage.getItem('krPrune') !== 'off'; } catch (e) { return true; } })();
  const prune = o => {
    if (!o || typeof o !== 'object') return o;
    [o, o.playerResponse, o.response && o.response.playerResponse].forEach(t => {
      if (!t || typeof t !== 'object') return;
      let hit = false;
      AD_KEYS.forEach(k => { if (k in t) { delete t[k]; hit = true; } });
      if (hit) { st.prune++; st.pruneAt = Date.now(); }
    });
    if (Array.isArray(o)) o.forEach(prune);   // 여러 응답이 묶여 오는 경우
    return o;
  };
  if (pruneOn) {
    // ① 처음 페이지에 들어 있는 영상 정보
    let initialPR;
    try {
      Object.defineProperty(window, 'ytInitialPlayerResponse', { configurable: true, get: () => initialPR, set: v => { initialPR = prune(v); } });
    } catch (e) {}
    // ② 이후 영상 정보: 글자를 해석하는 순간(JSON.parse)과 응답을 읽는 순간(Response.json)에 지움
    const looksLikePlayer = o => o && typeof o === 'object' && (('adPlacements' in o) || ('playerAds' in o) || ('adSlots' in o) || o.playerResponse);
    const origParse = JSON.parse;
    JSON.parse = function (...a) { const o = origParse.apply(this, a); return looksLikePlayer(o) ? prune(o) : o; };
    if (typeof Response === 'function') {
      const origJson = Response.prototype.json;
      Response.prototype.json = function () { return origJson.call(this).then(o => (looksLikePlayer(o) ? prune(o) : o)); };
    }
  }

  const player = () =>
    document.querySelector(location.pathname.startsWith('/shorts/') ? '#shorts-player' : '#movie_player') ||
    document.querySelector('.html5-video-player');
  // 재생·정지는 YouTube 자체 기능으로 (영상을 직접 재생하면 YouTube가 '멈춘 상태'로 알고 다시 멈추는 경우가 있음)
  const play = () => { const p = player(), v = document.querySelector('video'); if (p && p.playVideo) p.playVideo(); else if (v) v.play().catch(() => {}); };
  const pause = () => { const p = player(), v = document.querySelector('video'); if (p && p.pauseVideo) p.pauseVideo(); else if (v) v.pause(); };

  // ================= 2. 화질 고르기 =================
  // 원하는 화질이 없으면 바로 위 화질(예: 240p 없으면 360p), 그것도 없으면 바로 아래 화질
  const ORDER = ['tiny', 'small', 'medium', 'large', 'hd720', 'hd1080', 'hd1440', 'hd2160'];
  const pickQuality = (want, levels) => {
    if (levels.includes(want)) return want;
    const wi = ORDER.indexOf(want);
    const known = levels.filter(l => ORDER.indexOf(l) >= 0).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
    return known.find(l => ORDER.indexOf(l) > wi) || known[known.length - 1] || levels[0];
  };

  // ================= 3. 명령 실행 (yt-main → YouTube 플레이어) =================
  // yt-main이 <html data-kr-cmd>에 명령을 적고 'kr-cmd' 신호를 보내면 즉시 실행.
  // 신호는 같은 순간에 전달되므로, 화면을 누른 순간 보낸 명령(소리 켜기·화질 변경)도 iOS가 허락함.
  // 새 영상의 화질은 yt-main이 저장한 YouTube '선호 화질'로 YouTube가 스스로 정함 →
  // 재생 시작 직후 화질을 바꾸지 않으므로 자동재생이 끊기지 않음. (재생 중 바꾸면 iOS가 재생을 멈춤)
  const markReady = () => { if (root()) root().dataset.krPage = '1'; else setTimeout(markReady, 10); };   // yt-main에게 '이 스크립트 동작 중'임을 알림
  markReady();
  document.addEventListener('kr-cmd', () => {
    const p = player(), v = document.querySelector('video');
    try {
      switch (root().dataset.krCmd) {
        case 'play':   play(); break;
        case 'pause':  pause(); break;
        case 'next':   if (p && p.nextVideo) p.nextVideo(); break;
        // 위치 이동은 반드시 YouTube 자체 기능으로 (영상에 직접 이동시키면 YouTube가 새 구간을 못 불러와 멈춤)
        case 'seek':   if (p && p.seekTo) p.seekTo(+root().dataset.krArg, true); break;
        case 'speed':  if (p && p.setPlaybackRate) p.setPlaybackRate(+root().dataset.krArg); break;
        case 'unmute':
          if (p && p.isMuted && p.isMuted()) { p.unMute(); if (p.setVolume) p.setVolume(100); }
          else if (v && v.muted) v.muted = false;
          break;
        case 'quality': {   // 화질 버튼을 누른 순간에만
          const want = localStorage.getItem('krQuality') || 'small';
          const levels = p && p.getAvailableQualityLevels ? p.getAvailableQualityLevels() : [];
          if (want !== 'auto' && levels && levels.length && p.setPlaybackQualityRange) {
            const q = pickQuality(want, levels);
            p.setPlaybackQualityRange(q, q);
          }
          break;
        }
      }
    } catch (e) {}
  });

  // ================= 4. 잠금 화면·제어 센터 버튼 연결 (Media Session) =================
  // iPhone 잠금 화면의 ▶ / ❚❚ / ⏭ / 이동 버튼을 YouTube 자체 기능에 직접 연결.
  // 제목·채널·썸네일도 알려 줘서 잠금 화면에 무엇이 재생 중인지 표시.
  const ms = navigator.mediaSession;
  const isAd = p => p && p.classList && p.classList.contains('ad-showing');
  const seekBy = sec => { const p = player(); if (p && p.seekTo) p.seekTo(Math.max(0, p.getCurrentTime() + sec), true); };
  const ACTIONS = {
    play, pause,
    nexttrack: () => {
      if (location.pathname.startsWith('/shorts/')) document.dispatchEvent(new Event('kr-next-short'));   // Shorts는 yt-main이 넘김
      else { const p = player(); if (p && p.nextVideo) p.nextVideo(); }
    },
    previoustrack: () => seekBy(-1e9),               // 처음으로
    seekbackward: d => seekBy(-((d && d.seekOffset) || 10)),
    seekforward: d => seekBy((d && d.seekOffset) || 10),
    seekto: d => { const p = player(); if (p && p.seekTo && d && d.seekTime >= 0) p.seekTo(d.seekTime, true); }
  };
  let msFor = '', tick = 0;
  const updateSession = (p, v) => {
    if (!ms || !p || !p.getVideoData) return;
    const data = p.getVideoData() || {}, id = data.video_id || '';
    // 영상이 바뀔 때(그리고 30초마다 한 번) 버튼 연결·제목을 다시 설정 → YouTube가 덮어써도 복구
    if (id && (id !== msFor || tick % 60 === 0)) {
      msFor = id;
      Object.entries(ACTIONS).forEach(([a, f]) => { try { ms.setActionHandler(a, f); st.ms = true; } catch (e) {} });
      try {
        ms.metadata = new MediaMetadata({ title: data.title || 'YouTube', artist: data.author || '',
          artwork: [{ src: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, sizes: '480x360', type: 'image/jpeg' }] });
      } catch (e) {}
    }
    if (v) try { ms.playbackState = v.paused ? 'paused' : 'playing'; } catch (e) {}
    // 잠금 화면 진행 막대 (광고 중 제외, 2초마다)
    if (tick % 4 === 0 && ms.setPositionState && !isAd(p)) {
      const d = p.getDuration ? p.getDuration() : 0, t = p.getCurrentTime();
      if (d > 0 && isFinite(d)) try { ms.setPositionState({ duration: d, position: Math.min(Math.max(t, 0), d), playbackRate: (v && v.playbackRate) || 1 }); } catch (e) {}
    }
  };

  // ================= 4-2. 목록 게시일 모으기 =================
  // YouTube는 목록(특히 시청 화면 아래 관련 영상)에 게시일을 화면에 그리지 않지만, 받은 데이터 안에는 들어 있음
  // (publishedTimeText: '3주 전'). 처음 페이지 데이터와, 이후 YouTube가 목록을 더 불러올 때 받는 데이터에서 꺼내
  // <html data-kr-dates>에 { 영상ID: '3주 전' } 형태로 적어 둠 → yt-main이 목록에 표시. 추가 접속은 없음.
  const dates = {};
  let datesDirty = false;
  const collectDates = (o, depth = 0) => {
    if (!o || typeof o !== 'object' || depth > 60) return;
    if (typeof o.videoId === 'string' && o.publishedTimeText) {
      const t = o.publishedTimeText.simpleText || (o.publishedTimeText.runs || []).map(r => r.text).join('');
      if (t && dates[o.videoId] !== t) { dates[o.videoId] = t; datesDirty = true; }
    }
    for (const k in o) if (o[k] && typeof o[k] === 'object') collectDates(o[k], depth + 1);
  };
  const publishDates = () => {
    if (!datesDirty) return;
    datesDirty = false;
    const keys = Object.keys(dates);
    if (keys.length > 500) keys.slice(0, keys.length - 500).forEach(k => delete dates[k]);   // 최근 500개만
    root().dataset.krDates = JSON.stringify(dates);
  };
  // 처음 페이지 데이터 (m.youtube.com은 글자로 들어 있다가 나중에 해석됨)
  let initTries = 0;
  const readInitial = setInterval(() => {
    try {
      const d = window.ytInitialData;
      if (d) { collectDates(typeof d === 'string' ? JSON.parse(d) : d); publishDates(); clearInterval(readInitial); }
    } catch (e) {}
    if (++initTries > 20) clearInterval(readInitial);
  }, 500);
  // 이후 목록 데이터: YouTube가 받는 응답을 함께 읽기만 함 (응답 자체는 그대로 YouTube에 전달)
  const origFetch = window.fetch;
  window.fetch = function (...args) {
    const p = origFetch.apply(this, args);
    try {
      const url = String(args[0] && args[0].url || args[0] || '');
      if (/\/youtubei\/v1\/(next|browse|search)/.test(url)) {
        p.then(r => r.clone().json()).then(j => { collectDates(j); publishDates(); }).catch(() => {});
      }
    } catch (e) {}
    return p;
  };

  // ================= 4-3. 자동 더빙 끄기 → 원래 음성 =================
  // YouTube가 AI 자동 더빙 음성을 기본으로 틀면, 영상마다 한 번 '원래 음성(isOriginalTrack)'으로 바꿈.
  // 바꾸는 순간 iPhone이 재생을 멈추는 경우가 있어, 재생 중이었다면 바로 다시 재생.
  let audioFor = '', audioTries = 0;
  const fixAudio = (p, v) => {
    if (!p.getAvailableAudioTracks || !p.setAudioTrack || !p.getVideoData || !setting('origAudio')) return;
    const id = (p.getVideoData() || {}).video_id || '';
    if (!id || !v || v.paused || isAd(p)) return;
    if (audioFor !== id) { audioFor = id; audioTries = 0; st.audio = ''; }
    if (audioTries > 5) return;                      // 이 영상은 처리 끝(또는 포기)
    audioTries++;
    const tracks = p.getAvailableAudioTracks() || [];
    const name = t => (t && (t.displayName || (t.getName && t.getName()))) || '';
    if (tracks.length < 2) { st.audio = 'single'; return; }   // 음성이 하나뿐 (더빙 없음)
    const orig = tracks.find(t => t.isOriginalTrack === true) || tracks.find(t => /original|원본|원래/i.test(name(t)));
    const cur = p.getAudioTrack && p.getAudioTrack();
    audioTries = 99;
    if (!orig) { st.audio = 'noorig'; return; }
    if (cur && cur.id === orig.id) { st.audio = 'orig'; return; }
    p.setAudioTrack(orig);
    st.audio = 'switched:' + name(cur).slice(0, 24);
    setTimeout(() => { if (v.paused) play(); }, 800);
  };

  // ================= 4-3-2. 자막 자동 켜기 (⚙에서 언어 선택, 기본 끔) =================
  // 고른 언어 자막(사람이 만든 것 우선, 없으면 자동 생성)을 켬. 그 언어가 없으면 첫 자막을 그 언어로 자동 번역.
  let capFor = '', capTries = 0;
  const fixCaptions = p => {
    const lang = settings().capLang || '';
    const id = (p.getVideoData && (p.getVideoData() || {}).video_id) || '';
    if (!id || isAd(p)) return;
    if (capFor !== id) { capFor = id; capTries = 0; st.cap = lang ? '' : 'off'; }
    if (!lang || capTries > 8 || !p.getOption || !p.setOption) return;
    capTries++;
    try { if (p.loadModule) p.loadModule('captions'); } catch (e) {}
    const list = (() => { try { return p.getOption('captions', 'tracklist') || []; } catch (e) { return []; } })();
    if (!list.length) { if (capTries > 8) st.cap = 'none'; return; }   // 자막 정보가 아직 없음 → 다음에 다시 (8초까지)
    const mine = list.filter(t => (t.languageCode || '').startsWith(lang));
    const pick = mine.find(t => t.kind !== 'asr') || mine[0];
    try {
      if (pick) { p.setOption('captions', 'track', { languageCode: pick.languageCode }); st.cap = 'on:' + (pick.displayName || pick.languageCode); }
      else { p.setOption('captions', 'track', { languageCode: list[0].languageCode, translationLanguage: { languageCode: lang } }); st.cap = 'translated:' + (list[0].displayName || list[0].languageCode); }
    } catch (e) { st.cap = 'fail'; }
    capTries = 99;
  };

  // ================= 4-4. 스폰서 구간 건너뛰기 (구간 정보는 yt-main이 받아 <html data-kr-sb>에 넣어 줌) =================
  // 영상 시간이 바뀔 때마다(초당 약 4번) YouTube 자체 시간으로 확인 → 구간에 들어서면 끝으로 이동 (반복 확인 없음)
  let sbSrc = '', sb = null;
  document.addEventListener('timeupdate', e => {
    if (e.target.tagName !== 'VIDEO' || e.target.paused) return;
    const src = root().dataset.krSb || '';
    if (src !== sbSrc) { sbSrc = src; try { sb = JSON.parse(src); } catch (err) { sb = null; } }
    const p = player();
    if (!sb || !sb.segs || !sb.segs.length || !p || !p.getCurrentTime || !p.getVideoData || isAd(p)) return;
    if ((p.getVideoData() || {}).video_id !== sb.id) return;
    const t = p.getCurrentTime();
    if (!(t > 0.5)) return;                            // 재생 시작 순간에는 끼어들지 않음
    const seg = sb.segs.find(([a, b]) => t >= a && t < b - 0.5);
    if (seg) { p.seekTo(seg[1], true); st.skips++; }
  }, true);

  // ================= 5. 상태 보고 (읽기만 함) =================
  // yt-main이 쓸 수 있도록 <html data-kr-*>에 적어 둠: 고를 수 있는 화질, 영상 기준 재생 시간·길이
  // (광고가 영상에 이어 붙어 있으면 <video>의 시간과 실제 영상 시간이 다르므로 YouTube가 알려주는 시간을 씀)
  setInterval(() => {
    const p = player();
    tick++;
    try {
      if (!p || !p.getCurrentTime) return;
      const lv = (p.getAvailableQualityLevels ? p.getAvailableQualityLevels() : []).filter(q => q !== 'auto').join(',');
      if (root().dataset.krQList !== lv) root().dataset.krQList = lv;   // yt-main 화질 메뉴에 이 영상의 화질만 표시
      root().dataset.krT = p.getCurrentTime();
      root().dataset.krD = p.getDuration ? p.getDuration() : 0;
      const v = p.querySelector('video') || document.querySelector('video');
      updateSession(p, v);
      const ch = (p.getVideoData && (p.getVideoData() || {}).author) || '';
      if (ch && root().dataset.krChan !== ch) root().dataset.krChan = ch;   // yt-main 채널별 속도용
      const vid = (p.getVideoData && (p.getVideoData() || {}).video_id) || '';
      if (vid && vid !== st.vid) { st.vid = vid; st.skips = 0; }
      if (tick % 2 === 0 && !document.hidden) { fixAudio(p, v); fixCaptions(p); }   // 1초마다, 화면이 보일 때만
      const stat = JSON.stringify(st);
      if (root().dataset.krStat !== stat) root().dataset.krStat = stat;
    } catch (e) {}
  }, 500);
})();

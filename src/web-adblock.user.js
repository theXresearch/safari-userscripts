// ==UserScript==
// @name         Web AdBlock
// @namespace    https://github.com/theXresearch/safari-userscripts
// @version      2026.11.12.3
// @author       theXresearch
// @updateURL    https://raw.githubusercontent.com/theXresearch/safari-userscripts/main/src/web-adblock.meta.js
// @downloadURL  https://raw.githubusercontent.com/theXresearch/safari-userscripts/main/src/web-adblock.user.js
// @description  일반 사이트 광고 제거: 광고망·광고 iframe·라이브캠 광고 영상·떠 있는 광고/팝업·"광고" 표시 본문·배너 / 🚫 직접 지정 숨김·사이트별 실드 켜기/끄기
// @match        *://*/*
// @exclude      *://*.youtube.com/*
// @run-at       document-start
// ==/UserScript==
(function () {
  'use strict';
  if (window.top !== window.self) return;   // iframe 안에서는 실행 안 함

  // ================= 공통: 광고망 판별 =================
  // 광고 네트워크 (일반 + 성인 라이브캠): 이 주소의 그림·스크립트·iframe은 지워도 되는 것
  const AD_NET = /(doubleclick|googlesyndication|googleadservices|adservice|amazon-adsystem|adnxs|pubmatic|rubiconproject|openx|criteo|taboola|outbrain|mgid|revcontent|popads|popcash|propeller|adsterra|exoclick|exosrv|realsrv|magsrv|tsyndicate|trafficjunky|trafficstars|juicyads|clickadu|hilltopads|adcash|onclkds|stripchat|stripcdn|chaturbate|bongacams|livejasmin|camsoda|cam4|xlovecam|imlive|flirt4free|myfreecams|streamate|myavlive|mavrtracktor|snaptrckr|mayzaent|smartpop|saawsedge|greentrafsa|rallytrck)/i;
  // 도박 사이트 이름에 흔한 단어: '링크가 어디로 가는지' 판단할 때만 사용
  // (사이트 자체 그림·스크립트 서버 이름에도 들어 있을 수 있어서, 이걸로 그림·스크립트를 지우면 사이트가 깨짐)
  const GAMBLE = /(casino|slot|toto|poker|baccarat|bet\d|\dbet|-bet|bet-)/i;
  // 공유 버튼 등 정상 외부 링크
  const SAFE_HOST = /(facebook|twitter|x\.com|instagram|kakao|naver|daum|line\.me|t\.me|telegram|whatsapp|reddit|pinterest|linkedin|apple\.com|google\.com|youtube|youtu\.be)/i;
  const baseDomain = h => h.split('.').slice(-2).join('.');
  const myBase = baseDomain(location.hostname);
  // 웹 주소(http·https)만 판단 — 확장 프로그램(M3U8 등)·data·blob 주소는 '다른 사이트'로 보지 않음
  const hostOf = url => { try { const u = new URL(url, location.href); return /^https?:$/.test(u.protocol) ? u.hostname : ''; } catch (e) { return ''; } };
  const isForeign = url => { const h = hostOf(url); return !!h && baseDomain(h) !== myBase && !SAFE_HOST.test(h); };
  // 주소의 '도메인'만 검사 (data:·blob: 같은 도메인 없는 주소는 광고로 보지 않음)
  const isAdUrl = url => { const h = hostOf(url); return !!h && AD_NET.test(h); };            // 지워도 되는 광고 자원
  const isAdLink = url => { const h = hostOf(url); return !!h && (AD_NET.test(h) || GAMBLE.test(h)); };   // 광고로 가는 링크
  const offsite = url => { const h = hostOf(url); return !!h && baseDomain(h) !== myBase; };
  // web-page(실드: 광고 새 창·광고 링크·몰래 이동 차단)도 같은 목록을 쓰도록 공유
  document.documentElement.dataset.kwAd = AD_NET.source + '|' + GAMBLE.source;

  const own = el => !!(el.closest && el.closest('[id^="kw-"]'));   // 스크립트가 만든 버튼·안내창
  // 지운·숨긴 광고 수 → <html data-kw-st-ads> (web-main ⚙ '작동 상태'에 표시)
  let removed = 0;
  const count = () => { removed++; document.documentElement.dataset.kwStAds = removed; };
  const hide = el => { el.style.setProperty('display', 'none', 'important'); el.dataset.kwHidden = '1'; count(); };

  // ================= 1. 알려진 광고 자리 숨김 (CSS) + 직접 지정한 광고 =================
  const GENERIC = [
    'ins.adsbygoogle', '.adsbygoogle', '[id^="google_ads"]', '[id^="div-gpt-ad"]', '[id*="gpt-ad"]',
    'iframe[id^="google_ads_iframe"]', 'ins[data-zoneid]', '[id^="taboola"]', '.trc_related_container',
    '.OUTBRAIN', '[data-widget-id*="outbrain"]', '.advertisement', '.advertisment', '.ad-banner', '.ad_banner',
    '.banner-ad', '.ad-slot', '.ad-container', '.ad-wrapper', '.ad-unit', '.adunit', '.sponsored-ad',
    '.top-ad', '.bottom-ad', '.sticky-ad', '.anchor-ad', '.ad-sticky', '[aria-label="Advertisement"]',
    '[aria-label="광고"]', '[data-ad-slot]', '[data-ad-unit]', '[data-google-query-id]', 'amp-ad', 'amp-embed'
  ];
  const PICK_KEY = 'kwHide';
  const loadPicked = () => { try { return JSON.parse(localStorage.getItem(PICK_KEY)) || []; } catch (e) { return []; } };
  const applyCss = () => {
    let s = document.getElementById('kw-adcss');
    if (!s) {
      s = document.createElement('style');
      s.id = 'kw-adcss';
      (document.head || document.documentElement).appendChild(s);
    }
    const css = GENERIC.concat(loadPicked()).join(',\n') + ' { display: none !important; }';
    if (s.textContent !== css) s.textContent = css;
  };
  applyCss();

  // ================= 2. 광고망 iframe·스크립트·이미지는 생기는 즉시 제거 =================
  const AD_NODES = 'iframe[src], script[src], img[src]';
  // 다른 사이트를 담은 칸(iframe) 중 주소에 광고·추적·라이브캠 흔적이 있는 것 (광고 회사 이름을 몰라도 잡도록)
  // 예: creative.○○.com/widgets/…, go.○○.com/smartpop/…, t.○○trckr…  (영상 플레이어 embed는 해당 없음)
  const AD_FRAME = /(^|[./-])(creatives?|ads?|adserv\w*|banners?|promo|popunder|smartpop|track\w*|trk|trck\w*|tracktor|widgets?|live-?cams?|cams?)([./-]|$)/i;
  const isAdFrame = n => n.tagName === 'IFRAME' && isForeign(n.src) && (() => {
    try { const u = new URL(n.src); return AD_FRAME.test(u.hostname) || AD_FRAME.test(u.pathname); } catch (e) { return false; }
  })();
  const killAdNodes = root => {
    const bad = n => isAdUrl(n.src) || isAdFrame(n);
    if (root.matches && root.matches(AD_NODES) && bad(root)) { root.remove(); count(); return; }
    if (root.querySelectorAll) root.querySelectorAll(AD_NODES).forEach(n => { if (bad(n)) { n.remove(); count(); } });
  };
  let dirty = true;   // 페이지에 변화가 있었는지 → 있을 때만 전체 검사 (배터리 절약)
  new MutationObserver(ms => {
    ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) killAdNodes(n); }));
    dirty = true;
  }).observe(document.documentElement, { childList: true, subtree: true });

  // ================= 3. 전체 검사 =================
  const POPUP_TEXT = /(subscribe|newsletter|sign up for|disable (your )?ad ?block|ad ?blocker detected|turn off (your )?ad ?block|whitelist|광고\s?차단|애드블록|구독하|뉴스레터|앱 설치|앱에서 보기|앱으로 보기|알림을 받|cookie|쿠키)/i;
  const LABEL = /^(광고|광고·제휴|AD|Ad|Ads|Advertisement|Advertising|Sponsored|Promoted|Promotion|스폰서|협찬|파워링크|파트너스|Partner content)$/;
  const IAB = [[300, 250], [320, 50], [320, 100], [728, 90], [468, 60], [336, 280], [300, 600], [160, 600],
               [970, 90], [970, 250], [300, 50], [320, 480], [250, 250], [200, 200]];
  const isIabSize = (w, h) => IAB.some(([a, b]) => Math.abs(w - a) <= 4 && Math.abs(h - b) <= 4);
  const STOP = /^(BODY|HTML|MAIN|ARTICLE|HEADER|NAV|FOOTER)$/;

  // (a) 광고 라이브캠 영상 → 영상째 제거하고 광고 묶음 상자도 숨김
  // 판별: 끝이 없는(실시간) 영상, 광고망 주소의 영상, 광고·다른 사이트로 가는 링크 안의 영상
  // (사이트 자체 영상·목록 미리보기는 길이가 있으므로 해당 없음. 실시간 방송 사이트에 직접 들어간 경우는 제외)
  const liveSite = /(stripchat|chaturbate|bongacams|livejasmin|camsoda|cam4|myfreecams|twitch|kick\.com)/i.test(location.hostname);
  const isAdVideo = v => {
    if (own(v)) return false;
    const src = v.currentSrc || v.getAttribute('src') || '';
    const a = v.closest('a');
    // 실시간 영상은 '소리 없이 작게' 재생되는 것만 광고로 봄 (뉴스·스포츠 생중계 같은 본 영상은 크고 소리가 있음)
    const smallMuted = v.muted && v.getBoundingClientRect().width < innerWidth * 0.6;
    return (!liveSite && v.duration === Infinity && smallMuted) || isAdUrl(src) || (a && a.href && (isAdLink(a.href) || isForeign(a.href)));
  };
  // 광고 영상들을 모두 담은 가장 작은 상자 (사이트 본문·본 영상은 포함하지 않는 것만)
  const adBox = vids => {
    let box = vids[0].closest('a') || vids[0].parentElement;
    const okBox = e => e && e !== document.body && e !== document.documentElement && !e.querySelector('video.player, .plyr, video.kw-fs') &&
      (e.innerText || '').length < 400 && [...e.querySelectorAll('video')].every(x => vids.includes(x) || x.duration === Infinity);
    while (box && !vids.every(v => box.contains(v)) && okBox(box.parentElement)) box = box.parentElement;
    // 묶음을 감싼 바깥 상자(제목·여백)도 광고 전용이면 함께
    for (let i = 0; i < 3 && okBox(box.parentElement) && box.parentElement.children.length <= 3; i++) box = box.parentElement;
    return okBox(box) ? box : null;
  };
  const adVideos = () => {
    const bad = [...document.querySelectorAll('video')].filter(isAdVideo);
    if (!bad.length) return;
    const box = adBox(bad);
    bad.forEach(v => { try { v.pause(); } catch (e) {} v.remove(); count(); });
    if (box) hide(box);
  };
  // 재생이 시작되는 순간 바로 검사 (전체 검사 주기를 기다리지 않음)
  ['playing', 'loadedmetadata'].forEach(ev => document.addEventListener(ev, e => {
    if (e.target.tagName === 'VIDEO' && isAdVideo(e.target)) adVideos();
  }, true));
  // (b) 화면에 떠 있는 광고·팝업·광고차단 경고
  const floating = () => {
    const vh = innerHeight, area = innerWidth * vh;
    let removedOverlay = false;
    document.querySelectorAll('body *').forEach(el => {
      if (!el.isConnected || own(el) || el.dataset.kwHidden) return;
      // 영상 자체(영상만 전체화면 기능 포함)와 재생 중인 영상이 든 상자는 절대 숨기지 않음
      if (el.matches('video, canvas, [class~="kw-fs"]') || [...el.querySelectorAll('video')].some(v => !v.paused && v.videoWidth >= 400)) return;
      const pos = getComputedStyle(el).position;
      if (pos !== 'fixed' && pos !== 'sticky') return;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const big = r.width * r.height > area * 0.35;
      const lower = r.top > vh * 0.3 && r.height < vh * 0.6;   // 화면 아래쪽 상자
      const txt = (el.innerText || '').slice(0, 600);
      const srcs = [...el.querySelectorAll('iframe[src], img[src], video[src], source[src]')].map(n => n.src);
      const hrefs = [...el.querySelectorAll('a[href]')].map(a => a.href);
      // 사이트 자체 미니 플레이어(길이 있는 영상)는 보호 — 라이브캠 광고는 길이가 무한대
      const ownPlayer = [...el.querySelectorAll('video')].some(v => isFinite(v.duration) && v.duration > 60);
      // 사이트 메뉴(헤더 등: 검색칸·메뉴 또는 같은 사이트 링크 3개 이상)는 통째로 숨기지 않고, 안의 광고 링크만 숨김
      // 영상 주소(.m3u8·.mp4 등)를 보여 주는 상자 = M3U8 같은 다른 확장 프로그램의 창 → 건드리지 않음
      if (/\.(m3u8|mpd|mp4)|m3u8/i.test(hrefs.join(' ') + ' ' + txt)) return;
      const siteUi = el.querySelector('nav, input, form') || hrefs.filter(h => !offsite(h)).length >= 3;
      if (siteUi) {
        el.querySelectorAll('a[href]').forEach(a => { if (!a.dataset.kwHidden && isAdLink(a.href)) hide(a); });
        return;
      }
      if (srcs.some(isAdUrl) || hrefs.some(isAdLink) ||
          (lower && !ownPlayer && srcs.concat(hrefs).some(isForeign)) ||
          (POPUP_TEXT.test(txt) && (big || (lower && r.height > 60)))) {
        hide(el);
        if (big) removedOverlay = true;
      } else if (big && !txt.trim() && !el.querySelector('video, img, input, form, canvas')) {
        hide(el);                // 내용 없는 반투명 배경막 / 화면 전체를 덮는 투명 클릭 유도막
        removedOverlay = true;
      }
    });
    // 팝업을 지운 경우에만 막힌 스크롤 복구
    if (removedOverlay) [document.documentElement, document.body].forEach(n => {
      if (n && getComputedStyle(n).overflow === 'hidden') n.style.setProperty('overflow', 'auto', 'important');
    });
  };

  // (c) "광고·Sponsored" 표시가 붙은 본문 광고 → 그 표시를 감싼 상자 통째로 숨김
  const labeled = () => {
    document.querySelectorAll('body span, body div, body small, body p, body a, body em, body b, body i, body label')
      .forEach(el => {
        if (el.children.length || own(el) || !el.offsetHeight || el.offsetHeight > 24) return;
        if (!LABEL.test((el.textContent || '').trim())) return;
        let box = el, lv = 0;
        while (box.parentElement && !STOP.test(box.parentElement.tagName) && lv < 6 &&
               box.parentElement.getBoundingClientRect().height < innerHeight * 0.6) {
          box = box.parentElement; lv++;
        }
        // 링크·이미지·iframe이 있는 상자만 (글자 하나만 있는 경우 제외)
        if (box !== el && !box.dataset.kwHidden && box.querySelector('a[href], img, iframe, video')) hide(box);
      });
  };

  // (d) 배너 광고 (사이트가 직접 올린 것 포함)
  //  배너 = 표준 광고 크기이거나 가로로 긴(2.5:1 이상) 그림이면서, 아래 중 하나에 해당하는 것
  //   ① 누르면 다른 사이트·광고망·중간 이동 주소로 감 (배너 모양이면 텔레그램 등 '제휴 문의' 홍보도 광고로 봄)
  //   ② 링크 없이 눌러서 이동시키는 그림 (onclick 등 스크립트 이동)
  //   ③ 그림 주소에 배너·광고·도박 단어가 들어 있음 (/banner/, bn_, casino, toto …)
  //  배너를 숨긴 뒤 비어 버린 감싸는 상자도 함께 숨겨, 배너 묶음이 차지하던 빈 자리까지 정리
  const REDIRECT = /[?&](url|link|target|goto|redirect|dest|u)=https?|\/(go|out|redirect|bn|banner|ad|ads|click)[\/.?]/i;
  const AD_IMG = /(^|[\/_.-])(banners?|bn|ads?|promo|casino|toto|slot|bet)([\/_.\d-]|$)/i;
  const bannerShape = (w, h) => isIabSize(w, h) || (w >= 150 && h >= 25 && h <= 250 && w / h >= 2.5);
  const isBanner = m => {
    const r = m.getBoundingClientRect();
    if (!bannerShape(r.width, r.height)) return false;
    const a = m.closest('a[href]');
    if (a) return offsite(a.href) || isAdLink(a.href) || REDIRECT.test(a.href) || AD_IMG.test(m.currentSrc || m.src || '');
    if (m.closest('[onclick], [role="link"], [data-href], [data-url], [data-link]')) return true;
    return AD_IMG.test(m.currentSrc || m.src || getComputedStyle(m).backgroundImage);
  };
  // 숨긴 뒤 안이 모두 숨겨진 상자는 위로 올라가며 함께 숨김 (본문·메뉴 같은 큰 구역에서 멈춤)
  const collapse = el => {
    for (let p = el.parentElement; p && !STOP.test(p.tagName) && !own(p); p = p.parentElement) {
      if (![...p.children].every(c => c.dataset.kwHidden || !c.offsetHeight)) break;
      hide(p);
    }
  };
  const banners = () => {
    document.querySelectorAll('img, a[style*="background"], div[style*="background-image"]').forEach(m => {
      if (own(m) || m.closest('[data-kw-hidden]') || !isBanner(m)) return;
      const target = m.closest('a[href]') || m;
      hide(target);
      collapse(target);
    });
    document.querySelectorAll('iframe[src]').forEach(f => {
      if (!f.dataset.kwHidden && isIabSize(f.offsetWidth, f.offsetHeight) && isForeign(f.src)) { hide(f); collapse(f); }
    });
  };

  // 1.5초마다 확인: 변화가 있었거나 6초가 지났을 때만 전체 검사, 화면이 꺼져 있으면 쉼
  let quiet = 0;
  setInterval(() => {
    if (!document.body || document.hidden) return;
    ensurePickButton();
    if (!dirty && ++quiet < 4) return;
    dirty = false; quiet = 0;
    applyCss();
    killAdNodes(document.body);
    adVideos();
    floating();
    labeled();
    banners();
  }, 1500);

  // ================= 4. 직접 지정해서 숨기기 (🚫 버튼) + 사이트별 실드 켜기/끄기 =================
  // (광고 링크 클릭·새 창 차단은 web-page의 실드가 담당)
  // 🚫 누름 → 광고 탭(빨간 테두리) → 한 번 더 탭하면 이 사이트에서 영구 숨김
  let picking = false, picked = null, bar = null;

  const selectorOf = el => {
    const parts = [];
    while (el && el.nodeType === 1 && el !== document.body) {
      if (el.id && !/\d{3,}/.test(el.id)) { parts.unshift('#' + CSS.escape(el.id)); break; }
      let p = el.tagName.toLowerCase();
      const same = el.parentElement ? [...el.parentElement.children].filter(c => c.tagName === el.tagName) : [];
      if (same.length > 1) p += `:nth-of-type(${same.indexOf(el) + 1})`;
      parts.unshift(p);
      el = el.parentElement;
    }
    return (parts[0] && parts[0][0] === '#' ? '' : 'body > ') + parts.join(' > ');
  };
  const outline = (el, on) => { if (el) el.style.outline = on ? '3px solid red' : ''; };
  const setBar = msg => { bar.querySelector('span').textContent = msg; };

  const stopPicking = () => {
    picking = false;
    outline(picked, false);
    picked = null;
    if (bar) { bar.remove(); bar = null; }
  };
  const startPicking = () => {
    picking = true;
    bar = document.createElement('div');
    bar.id = 'kw-bar';
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#222;color:#fff;' +
      'padding:10px;font:14px -apple-system,sans-serif;display:flex;gap:8px;align-items:center;flex-wrap:wrap;';
    const msg = document.createElement('span');
    msg.style.flex = '1';
    msg.textContent = '숨길 광고를 탭하세요';
    bar.appendChild(msg);
    let shieldOn = true;
    try { shieldOn = localStorage.getItem('kwShield') !== 'off'; } catch (e) {}
    [['up', '더 크게'], ['reset', '이 사이트 초기화'], ['shield', shieldOn ? '🛡 실드 켜짐' : '실드 꺼짐'], ['set', '⚙ 설정'], ['close', '닫기']].forEach(([a, txt]) => {
      const b = document.createElement('button');
      b.dataset.a = a;
      b.textContent = txt;
      b.style.cssText = 'background:#555;color:#fff;border:none;border-radius:8px;padding:6px 10px;';
      bar.appendChild(b);
    });
    bar.addEventListener('click', e => {
      const a = e.target.dataset.a;
      if (a === 'up' && picked && picked.parentElement && picked.parentElement !== document.body) {
        outline(picked, false); picked = picked.parentElement; outline(picked, true);
        setBar('범위를 넓혔습니다 · 빨간 상자를 탭하면 숨김');
      } else if (a === 'reset') {
        localStorage.removeItem(PICK_KEY); applyCss(); setBar('이 사이트에서 숨긴 항목을 모두 되돌렸습니다');
      } else if (a === 'shield') {
        // 이 사이트에서 팝업 차단(실드) 켜기/끄기 → 새로고침해야 적용
        try { if (shieldOn) localStorage.setItem('kwShield', 'off'); else localStorage.removeItem('kwShield'); } catch (err) {}
        location.reload();
      } else if (a === 'set') { stopPicking(); document.dispatchEvent(new Event('kw-open-settings')); }   // web-main의 설정 화면
      else if (a === 'close') stopPicking();
    });
    document.body.appendChild(bar);
  };

  window.addEventListener('click', e => {
    if (!picking || own(e.target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const t = e.target;
    if (picked && (t === picked || picked.contains(t))) {
      const list = loadPicked();
      const sel = selectorOf(picked);
      if (sel && !list.includes(sel)) list.push(sel);
      localStorage.setItem(PICK_KEY, JSON.stringify(list));
      applyCss();
      stopPicking();
    } else {
      outline(picked, false); picked = t; outline(picked, true);
      setBar('한 번 더 탭하면 숨김 · 작으면 "더 크게"');
    }
  }, true);

  function ensurePickButton() {
    if (document.getElementById('kw-pick')) return;
    const b = document.createElement('button');
    b.id = 'kw-pick';
    b.textContent = '🚫';
    // 오른쪽 아래 구석 (영상이 있는 페이지에서는 web-main이 영상 아래 버튼 줄로 옮김)
    b.style.cssText = 'position:fixed;right:6px;bottom:calc(84px + env(safe-area-inset-bottom));z-index:2147483647;' +
      'background:rgba(0,0,0,.45);border:none;border-radius:12px;padding:3px 8px;font:12px -apple-system,sans-serif;';
    b.addEventListener('click', () => (picking ? stopPicking() : startPicking()));
    document.body.appendChild(b);
  }
})();

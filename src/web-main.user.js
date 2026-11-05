// ==UserScript==
// @name         Web Main
// @namespace    https://github.com/theXresearch/safari-userscripts
// @version      2026.11.05.6
// @author       theXresearch
// @updateURL    https://raw.githubusercontent.com/theXresearch/safari-userscripts/main/src/web-main.user.js
// @downloadURL  https://raw.githubusercontent.com/theXresearch/safari-userscripts/main/src/web-main.user.js
// @description  일반 사이트: ⚙ 설정·작동 상태 / 영상: PiP·화질·속도 버튼(영상 아래), 두 번 탭·가로 회전 전체화면(탭하면 진행 막대, 밀어서 이동·밝기), 벌려서 확대, 두 손가락 톡 PiP / 복사 방지 해제, 다크 모드 (광고는 web-adblock)
// @match        *://*/*
// @exclude      *://*.youtube.com/*
// @run-at       document-start
// @grant        GM.getValue
// @grant        GM.setValue
// ==/UserScript==
(function () {
  'use strict';
  if (window.top !== window.self) return;   // iframe 안에서는 실행 안 함

  const host = location.hostname;
  const own = el => !!(el && el.closest && el.closest('[id^="kw-"]'));   // 스크립트가 만든 버튼
  const onSite = list => list.some(d => host === d || host.endsWith('.' + d));

  // ========== 예외 사이트 (문제 생기면 여기에 도메인 추가) ==========
  const NO_COPY_FIX = ['docs.google.com', 'notion.so', 'notion.site', 'figma.com', 'office.com', 'icloud.com'];
  const NO_DARK = [];

  // ================= 설정 (영상 버튼 줄·🚫 줄의 ⚙, 모든 사이트 공통) =================
  const VERSION = '2026.11.05.6';
  const SET = { dark: true, copyFix: true, autoFs: true, pauseHidden: true };
  const SET_ITEMS = [
    ['dark', '다크 모드', 'iPhone이 다크 모드일 때 밝은 사이트를 어둡게'],
    ['copyFix', '복사·선택 방지 해제', '글자 선택·복사를 막은 사이트에서도 가능하게'],
    ['autoFs', '가로로 돌리면 자동 전체화면', '재생 중인 영상만'],
    ['pauseHidden', '안 보이는 영상 자동 정지', '숨겨진 채 소리 없이 재생되는 광고 영상 등 (데이터·배터리 절약)']
  ];

  // ================= 1. 복사·선택 방지 해제 =================
  const COPY_CSS = `
    *, *::before, *::after { -webkit-user-select: text !important; user-select: text !important; }
    body { -webkit-touch-callout: default !important; }`;
  const copyFix = () => SET.copyFix && !onSite(NO_COPY_FIX);
  ['copy', 'cut', 'selectstart', 'contextmenu'].forEach(ev =>
    window.addEventListener(ev, e => { if (copyFix()) e.stopImmediatePropagation(); }, true));

  const addStyle = (id, css) => {
    if (document.getElementById(id)) return;
    const s = document.createElement('style');
    s.id = id;
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  };
  const ensureStyles = () => {
    if (copyFix()) addStyle('kw-copy', COPY_CSS);
    else { const c = document.getElementById('kw-copy'); if (c) c.remove(); }
  };
  ensureStyles();

  // ================= 2. 다크 모드 (iPhone이 다크 모드일 때, 밝은 사이트만) =================
  const DARK_CSS = `
    html { filter: invert(0.92) hue-rotate(180deg) !important; background: #fff !important; }
    img, video, picture, canvas, iframe, svg image, [style*="background-image"], [id^="kw-"]
    { filter: invert(1) hue-rotate(180deg) !important; }`;
  const darkQuery = matchMedia('(prefers-color-scheme: dark)');
  const brightness = el => {
    const c = el && getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
    if (!c || (c[3] !== undefined && +c[3] === 0)) return null;   // 투명
    return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
  };
  const applyDark = () => {
    const el = document.getElementById('kw-dark');
    if (!SET.dark || !darkQuery.matches || onSite(NO_DARK)) { if (el) el.remove(); return; }
    if (el || !document.body) return;
    let b = brightness(document.body);
    if (b === null) b = brightness(document.documentElement);
    if (b !== null && b < 0.6) return;   // 이미 어두운 사이트
    addStyle('kw-dark', DARK_CSS);
  };
  darkQuery.addEventListener('change', applyDark);
  document.addEventListener('DOMContentLoaded', applyDark);

  // ================= 3. 영상 버튼 (PiP·화질·속도) =================
  // 설정은 모든 사이트 공통으로 저장 (GM 저장소). 화질은 web-page가 사이트 플레이어에 적용.
  const SPEEDS = [0.75, 1, 1.25, 1.3, 1.5, 1.75, 2];
  const prefs = { speed: 1.3, quality: 'auto' };       // 기본: 1.3배, 화질은 사이트 기본(자동) — 버튼으로 직접 고름
  const shareQuality = () => { document.documentElement.dataset.kwQuality = prefs.quality; };
  shareQuality();
  (async () => {
    try {
      prefs.speed = +(await GM.getValue('speed', 1.3)) || 1.3;
      prefs.quality = String(await GM.getValue('quality', 'auto'));
      Object.assign(SET, JSON.parse(await GM.getValue('set', '{}')) || {});
      ensureStyles(); applyDark();
    } catch (e) {}
    shareQuality();
  })();
  const save = (k, v) => { prefs[k] = v; try { GM.setValue(k, v); } catch (e) {} };

  // 속도: 영상이 로드·재생될 때와 사이트가 되돌렸을 때만 맞춤 (라이브 방송 제외)
  const applySpeed = v => {
    if (v instanceof HTMLVideoElement && isFinite(v.duration) && v.duration > 0 && v.playbackRate !== prefs.speed)
      v.playbackRate = prefs.speed;
  };
  ['loadedmetadata', 'ratechange', 'play'].forEach(ev => document.addEventListener(ev, e => applySpeed(e.target), true));

  const toast = msg => {
    let t = document.getElementById('kw-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'kw-toast';
      t.style.cssText = 'position:fixed;left:50%;top:70px;transform:translateX(-50%);z-index:2147483647;' +
        'background:rgba(0,0,0,.85);color:#fff;padding:8px 14px;border-radius:16px;font:14px -apple-system,sans-serif;';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    clearTimeout(t._h);
    t._h = setTimeout(() => t.remove(), 2500);
  };
  // 본 영상 = 전체화면 중인 영상, 아니면 재생 중인 영상 중 원본 화질이 가장 큰 것 (숨은 작은 광고 영상 제외)
  // (화면상 크기가 아니라 원본 크기로 고름 — 사이트가 영상을 숨겨 화면상 크기가 0일 때도 찾도록)
  const activeVideo = () => {
    const all = [...document.querySelectorAll('video')];
    const big = v => (v.videoWidth * v.videoHeight) || 0;
    const playing = all.filter(v => !v.paused).sort((a, b) => big(b) - big(a));
    return pseudoFs.video() || playing[0] || all.find(v => v.readyState > 0) || all[0];
  };
  // 손가락 위치에 있는 영상
  const videoAt = (x, y) => [...document.querySelectorAll('video')].find(v => {
    const r = v.getBoundingClientRect();
    return r.width > 80 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  });
  const fmtT = x => { x = Math.max(0, Math.floor(x || 0)); const h = Math.floor(x / 3600), m = Math.floor(x / 60) % 60, sec = String(x % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`; };
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
    let two = null;
    document.addEventListener('touchstart', e => {
      if (e.touches.length === 2) { const p = pts(e.touches), v = current() || videoAt(p.x, p.y); two = v ? { v, p, t: Date.now() } : null; }
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
  })(() => activeVideo(), on => { const b = document.getElementById('kw-pip'); if (b) b.textContent = on ? '복귀' : 'PiP'; });
  // ----- 고르는 메뉴 (화질·속도): 버튼을 누르면 목록이 뜨고, 고르면 바로 적용 -----
  const closeMenu = () => {
    const m = document.getElementById('kw-menu'); if (m) m.remove();
    document.removeEventListener('click', closeMenu);
  };
  const openMenu = (btn, items, current, onPick) => {
    if (document.getElementById('kw-menu')) return closeMenu();   // 열려 있으면 닫기
    const m = document.createElement('div');
    m.id = 'kw-menu';
    m.style.cssText = 'position:fixed;z-index:2147483647;background:rgba(20,20,20,.95);border-radius:12px;padding:4px;' +
      'display:flex;flex-direction:column;min-width:76px;box-shadow:0 4px 16px rgba(0,0,0,.5);';
    items.forEach(([val, text]) => {
      const it = document.createElement('button');
      it.textContent = (String(val) === String(current) ? '✓ ' : '') + text;
      it.style.cssText = 'background:none;border:none;color:' + (String(val) === String(current) ? '#4da3ff' : '#fff') +
        ';font:600 15px -apple-system,sans-serif;padding:9px 14px;text-align:left;';
      it.addEventListener('click', e => { e.stopPropagation(); closeMenu(); onPick(val); });
      m.appendChild(it);
    });
    document.body.appendChild(m);
    // 버튼 아래에 공간이 있으면 아래, 없으면 위로
    const r = btn.getBoundingClientRect(), mh = m.offsetHeight, mw = m.offsetWidth;
    m.style.left = Math.max(6, Math.min(innerWidth - mw - 6, r.right - mw)) + 'px';
    m.style.top = (r.bottom + 4 + mh < innerHeight ? r.bottom + 4 : Math.max(6, r.top - 4 - mh)) + 'px';
    setTimeout(() => document.addEventListener('click', closeMenu), 0);   // 바깥을 누르면 닫힘
  };
  // 이 사이트가 제공하는 화질 목록 (web-page가 <html data-kw-q-list>로 알려 줌)
  const qList = () => (document.documentElement.dataset.kwQList || '').split(',').filter(Boolean);
  const qLabel = () => (prefs.quality === 'auto' || !qList().length) ? '자동' : prefs.quality + 'p';
  const BUTTONS = [
    ['kw-pip', () => (pip.active() ? '복귀' : 'PiP'), () => pip.toggle()],
    ['kw-quality', qLabel, () => {
      const list = qList();
      if (!list.length) return toast('이 영상은 화질을 고를 수 없음 (Safari가 자동으로 맞춤)');
      openMenu(document.getElementById('kw-quality'), [['auto', '자동']].concat(list.map(h => [h, h + 'p'])), prefs.quality, q => {
        save('quality', String(q));
        shareQuality();
        const b = document.getElementById('kw-quality'); if (b) b.textContent = qLabel();
      });
    }],
    ['kw-speed', () => prefs.speed + 'x', () => {
      openMenu(document.getElementById('kw-speed'), SPEEDS.map(x => [x, x + 'x']), prefs.speed, x => {
        save('speed', x);
        document.querySelectorAll('video').forEach(applySpeed);
        const b = document.getElementById('kw-speed'); if (b) b.textContent = x + 'x';
      });
    }],
    ['kw-set', () => '⚙', () => openSettings()]
  ];
  // ----- 설정 화면 + 작동 상태 -----
  const statusLines = () => {
    const ds = document.documentElement.dataset, ok = '✓', no = '–', warn = '⚠', L = [];
    const v = activeVideo(), q = qList();
    L.push(ds.kwPage ? [ok, 'Web Page 연결됨 (실드·백그라운드 재생·화질)'] : [warn, 'Web Page가 동작하지 않음 — 설치·켜짐 확인']);
    L.push(ds.kwPage === 'off' ? [no, '이 사이트 실드: 꺼짐 (🚫 줄에서 켜기)'] : [ok, `실드 켜짐 · 막은 광고 창·이동 ${ds.kwStBlocked || 0}번`]);
    L.push(ds.kwAd ? [ok, `광고 차단 동작 중 · 지운 광고 ${ds.kwStAds || 0}개`] : [warn, 'Web AdBlock이 동작하지 않음 — 설치·켜짐 확인']);
    if (v && v.readyState > 0) {
      L.push([ok, `영상 ${v.videoWidth}×${v.videoHeight}${isFinite(v.duration) ? ' · ' + fmtT(v.duration) : ' · 실시간'} · ${v.paused ? '멈춤' : '재생 중'} · ${prefs.speed}x`]);
      L.push(q.length ? [ok, `고를 수 있는 화질: ${q.map(x => x + 'p').join(', ')}`] : [no, '이 영상은 화질 선택 불가 (Safari 자동)']);
    } else L.push([no, '재생 중인 영상 없음']);
    L.push([no, `버전 ${VERSION}`]);
    return L;
  };
  const openSettings = () => {
    closeMenu();
    if (document.getElementById('kw-settings')) return;
    const mk = (tag, css, ...kids) => { const e = document.createElement(tag); e.style.cssText = css; e.append(...kids); return e; };
    const sheet = mk('div', 'position:absolute;left:0;right:0;bottom:0;max-height:85vh;overflow:auto;background:#1c1c1e;color:#fff;' +
      'border-radius:16px 16px 0 0;padding:14px 16px calc(16px + env(safe-area-inset-bottom));font:15px -apple-system,sans-serif;text-align:left;',
      mk('div', 'font:700 18px -apple-system,sans-serif;margin-bottom:8px', '설정 (모든 사이트)'));
    const wrap = mk('div', 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.55);', sheet);
    wrap.id = 'kw-settings';
    SET_ITEMS.forEach(([k, label, desc]) => {
      const sw = mk('button', '', '');
      const paint = () => { sw.textContent = SET[k] ? '켜짐' : '꺼짐';
        sw.style.cssText = `min-width:58px;padding:6px 10px;border:none;border-radius:14px;font:600 13px -apple-system,sans-serif;color:#fff;background:${SET[k] ? '#30d158' : '#48484a'}`; };
      paint();
      sw.addEventListener('click', () => {
        SET[k] = !SET[k];
        try { GM.setValue('set', JSON.stringify(SET)); } catch (e) {}
        paint(); ensureStyles(); applyDark();
      });
      sheet.appendChild(mk('div', 'display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid #333',
        mk('div', 'flex:1', mk('div', '', label), mk('div', 'color:#999;font-size:12px;margin-top:2px', desc)), sw));
    });
    const statBox = mk('div', 'margin-top:12px;padding:10px 12px;border-radius:10px;background:#2c2c2e;font:13px/1.55 -apple-system,sans-serif');
    statBox.id = 'kw-stat';
    const paintStat = () => statBox.replaceChildren(mk('div', 'font-weight:700;margin-bottom:4px', '작동 상태 (이 페이지)'),
      ...statusLines().map(([i, t]) => mk('div', `color:${i === '⚠' ? '#ffd60a' : i === '✓' ? '#fff' : '#999'}`, `${i} ${t}`)));
    paintStat();
    const timer = setInterval(() => { if (!wrap.isConnected) clearInterval(timer); else paintStat(); }, 1000);
    const close = mk('button', 'width:100%;margin-top:10px;padding:11px;border:none;border-radius:10px;background:#3a3a3c;color:#fff;font:600 15px -apple-system,sans-serif', '닫기');
    close.addEventListener('click', () => wrap.remove());
    wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });
    sheet.append(statBox, close);
    document.body.appendChild(wrap);
  };
  document.addEventListener('kw-open-settings', () => openSettings());   // 🚫 줄의 '⚙ 설정' (web-adblock)
  // 화면에 보이지 않는데 소리 없이 계속 재생되는 영상(숨겨진 광고 영상 등)은 멈춤 → 데이터·배터리 절약
  const pauseHidden = () => SET.pauseHidden && document.querySelectorAll('video').forEach(v => {
    if (v.paused || !v.muted || v === pseudoFs.video() || v.webkitPresentationMode === 'picture-in-picture') return;
    const r = v.getBoundingClientRect();
    if ((r.width < 2 || r.height < 2) && v.videoWidth < 640) v.pause();   // 본 영상(고화질)은 제외
  });

  // ----- 버튼 묶음(PiP·화질·속도·🚫) 위치: 영상을 가리지 않게 -----
  // · 평소: 영상 바로 아래에 '한 줄'을 끼워 넣음 (페이지 내용이 그만큼 아래로 밀릴 뿐, 영상·글자를 덮지 않음)
  // · 영상만 전체화면일 때: 오른쪽 위 구석 — 평소 숨김, 영상을 탭하면 조작 화면과 함께 나타남
  // · 영상 아래 자리를 못 찾는 사이트: 예전처럼 오른쪽 아래
  const BTN_CSS = 'background:rgba(0,0,0,.55);color:#fff;border:none;border-radius:10px;' +
    'padding:3px 9px;font:600 12px -apple-system,sans-serif;min-width:40px;';
  // 영상을 감싼 상자 중, 크기가 영상과 같은 가장 바깥 상자 (그 바로 뒤에 줄을 끼움)
  const playerBox = v => {
    const r = v.getBoundingClientRect();
    if (r.width < 160 || r.height < 90) return null;
    let box = v;
    for (let e = v.parentElement; e && e !== document.body; e = e.parentElement) {
      const er = e.getBoundingClientRect();
      if (er.height > r.height + 8 || er.width > innerWidth + 2) break;
      box = e;
    }
    return box === v && getComputedStyle(v).position === 'absolute' ? null : box;
  };
  // ----- 전체화면 조작 화면 (평소에는 아무것도 안 보임 → 영상만) -----
  // · 영상을 한 번 탭: 조작 화면 표시 — 아래 진행 막대(현재 위치·전체 길이, 눌러서/끌어서 이동),
  //   가운데 재생/일시정지, 오른쪽 위 버튼 묶음. 3초 동안 손대지 않으면 사라짐. 보일 때 한 번 더 탭하면 바로 사라짐.
  // · 옆으로 밀기(앞뒤 이동)·두 번 탭(가운데 = 전체화면 끄기, 좌우 = 10초 이동)·두 손가락 탭(PiP)은 조작 화면 없이 그대로 동작
  let fsUi = null, scrub = null, uiTick = 0, uiTimer = 0, uiOn = false;
  const makeFsUi = () => {
    const seek = document.createElement('div');
    seek.id = 'kw-seek';
    seek.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;display:none;align-items:center;gap:10px;' +
      'padding:14px calc(16px + env(safe-area-inset-right)) calc(10px + env(safe-area-inset-bottom)) calc(16px + env(safe-area-inset-left));' +
      'background:linear-gradient(transparent,rgba(0,0,0,.7));color:#fff;font:600 13px -apple-system,sans-serif;';
    const cur = document.createElement('span'), end = document.createElement('span');
    const track = document.createElement('div'), fill = document.createElement('div'), knob = document.createElement('div'), bg = document.createElement('div');
    track.style.cssText = 'flex:1;height:30px;position:relative;touch-action:none;';
    const line = 'position:absolute;left:0;top:13px;height:4px;border-radius:2px;';
    bg.style.cssText = line + 'right:0;background:rgba(255,255,255,.3);';
    fill.style.cssText = line + 'width:0;background:#ff3b5c;';
    knob.style.cssText = 'position:absolute;top:8px;width:14px;height:14px;margin-left:-7px;border-radius:50%;background:#fff;left:0;';
    track.append(bg, fill, knob);
    seek.append(cur, track, end);
    const play = document.createElement('button');
    play.id = 'kw-fsplay';
    play.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2147483647;display:none;' +
      'width:64px;height:64px;border-radius:50%;border:none;background:rgba(0,0,0,.45);color:#fff;font:28px -apple-system,sans-serif;';
    const frac = t => { const r = track.getBoundingClientRect(); return Math.max(0, Math.min(1, (t.clientX - r.left) / r.width)); };
    const draw = (f, t, d) => { fill.style.width = knob.style.left = (f * 100) + '%'; cur.textContent = fmtT(t); end.textContent = fmtT(d); };
    const onTouch = (e, done) => {
      const v = pseudoFs.video(); if (!v || !isFinite(v.duration)) return;
      e.preventDefault(); e.stopPropagation();
      if (!done) { scrub = frac(e.touches[0]); draw(scrub, scrub * v.duration, v.duration); }
      else if (scrub !== null) { v.currentTime = scrub * v.duration; scrub = null; }
      showFsUi();
    };
    track.addEventListener('touchstart', e => onTouch(e), { passive: false });
    track.addEventListener('touchmove', e => onTouch(e), { passive: false });
    track.addEventListener('touchend', e => onTouch(e, true), { passive: false });
    play.addEventListener('click', e => {
      e.stopPropagation();
      const v = pseudoFs.video(); if (!v) return;
      if (v.paused) v.play().catch(() => {}); else v.pause();
      showFsUi();
    });
    [seek, play].forEach(el => el.addEventListener('click', e => e.stopPropagation()));
    return { seek, play, draw };
  };
  const updFsUi = () => {
    const v = pseudoFs.video();
    if (!fsUi || !v) return;
    fsUi.play.textContent = v.paused ? '▶' : '❚❚';
    if (scrub !== null) return;
    const d = isFinite(v.duration) ? v.duration : 0;
    fsUi.draw(d ? v.currentTime / d : 0, v.currentTime, d);
  };
  const setToolbar = on => {
    const bar = document.getElementById('kw-tools');
    if (bar && bar.dataset.mode === 'fs') { bar.style.opacity = on ? '1' : '0'; bar.style.pointerEvents = on ? 'auto' : 'none'; }
  };
  function hideFsUi() {
    if (uiOn) closeMenu();
    uiOn = false;
    clearTimeout(uiTimer); clearInterval(uiTick);
    if (fsUi) { fsUi.seek.style.display = 'none'; fsUi.play.style.display = 'none'; }
    setToolbar(false);
  }
  function showFsUi() {
    const v = pseudoFs.video();
    if (!v) return;
    if (!fsUi) fsUi = makeFsUi();
    [fsUi.seek, fsUi.play].forEach(el => { if (el.parentElement !== document.body) document.body.appendChild(el); });
    uiOn = true;
    fsUi.seek.style.display = isFinite(v.duration) ? 'flex' : 'none';   // 실시간 방송은 막대 없음
    fsUi.play.style.display = 'block';
    setToolbar(true);
    updFsUi();
    clearInterval(uiTick); uiTick = setInterval(updFsUi, 250);
    clearTimeout(uiTimer);
    uiTimer = setTimeout(() => (scrub !== null ? showFsUi() : hideFsUi()), 3000);
  }
  const toggleFsUi = () => (uiOn ? hideFsUi() : showFsUi());
  // 버튼 묶음을 누르는 동안에는 사라지지 않게
  document.addEventListener('touchstart', e => { if (uiOn && e.target.closest && e.target.closest('#kw-tools, #kw-menu')) showFsUi(); }, { capture: true, passive: true });
  const sleepFs = () => { hideFsUi(); if (fsUi) { fsUi.seek.remove(); fsUi.play.remove(); } };

  // 전체화면 중 사이트의 위쪽 메뉴·검색창처럼 '떠 있는' 사이트 메뉴는 숨김 (영상 위로 비침 방지)
  // 링크·입력칸이 든 떠 있는 상자만 대상 → 다른 확장 프로그램 버튼(M3U8 등)은 그대로 둠
  // 숨김 표시만 붙이고, 실제 숨김은 '전체화면 중' 규칙으로만 적용 → 전체화면이 끝나면 무조건 다시 보임
  const hideSiteBars = () => {
    if (!pseudoFs.video()) return;
    document.querySelectorAll('body *').forEach(el => {
      if (el.hasAttribute('data-kw-fshide') || el.tagName === 'VIDEO' || (el.id && el.id.startsWith('kw-'))) return;
      const pos = getComputedStyle(el).position;
      if ((pos === 'fixed' || pos === 'sticky') && el.querySelector('a[href], input, nav') && !el.querySelector('video.kw-fs')) el.setAttribute('data-kw-fshide', '');
    });
  };
  const showSiteBars = () => document.querySelectorAll('[data-kw-fshide]').forEach(el => el.removeAttribute('data-kw-fshide'));

  const placeBar = bar => {
    const pick = document.getElementById('kw-pick');           // web-adblock의 🚫 버튼도 같은 줄로
    if (pick && pick.parentElement !== bar) { bar.appendChild(pick); pick.style.cssText = BTN_CSS + 'min-width:0;'; }
    const fs = pseudoFs.video();
    const v = fs || activeVideo();
    const box = !fs && v && playerBox(v);
    if (fs) {
      if (bar.dataset.mode !== 'fs') {
        bar.dataset.mode = 'fs';
        document.body.appendChild(bar);
        bar.style.cssText = 'position:fixed;top:calc(8px + env(safe-area-inset-top));right:calc(8px + env(safe-area-inset-right));' +
          'z-index:2147483647;display:flex;gap:4px;';
        setToolbar(uiOn);   // 평소에는 숨김, 탭하면 조작 화면과 함께 나타남
        hideSiteBars(); setTimeout(hideSiteBars, 1200);   // 전환 직후 한 번 + 늦게 뜨는 메뉴 대비 한 번 (매번 검사하지 않음)
      }
    } else if (box) {
      sleepFs(); showSiteBars();
      if (bar.dataset.mode !== 'flow' || bar.previousElementSibling !== box) {
        bar.dataset.mode = 'flow';
        box.insertAdjacentElement('afterend', bar);
        bar.style.cssText = 'position:relative;z-index:5;display:flex;justify-content:flex-end;gap:4px;' +
          'padding:3px 4px;background:#000;opacity:1;';
      }
    } else if ((sleepFs(), showSiteBars(), bar.dataset.mode !== 'corner')) {
      bar.dataset.mode = 'corner';
      document.body.appendChild(bar);
      bar.style.cssText = 'position:fixed;right:6px;bottom:calc(84px + env(safe-area-inset-bottom));' +
        'z-index:2147483647;display:flex;flex-direction:column;align-items:flex-end;gap:4px;opacity:1;';
    }
  };
  const updateVideos = () => {
    pauseHidden();
    const vids = [...document.querySelectorAll('video')].filter(v => v.readyState > 0 || v.currentSrc);
    vids.forEach(v => { if (v.hasAttribute('disablepictureinpicture')) v.removeAttribute('disablepictureinpicture'); });
    let bar = document.getElementById('kw-tools');
    if (!vids.length) {
      if (bar) { const pick = document.getElementById('kw-pick'); if (pick) pick.remove(); bar.remove(); }   // 🚫는 web-adblock이 원래 자리에 다시 만듦
      return;
    }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'kw-tools';
      BUTTONS.forEach(([id, label, action]) => {
        const b = document.createElement('button');
        b.id = id;
        b.style.cssText = BTN_CSS;
        b.addEventListener('click', () => { action(); b.textContent = label(); });
        bar.appendChild(b);
      });
    }
    placeBar(bar);
    BUTTONS.forEach(([id, label]) => { const b = document.getElementById(id), t = label(); if (b.textContent !== t) b.textContent = t; });
  };

  // ================= 4. 영상 두 번 탭 → 전체화면 / 다시 두 번 탭 → 원래 크기 =================
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
        hud(`${g.delta >= 0 ? '+' : ''}${g.delta}초  →  ${fmtT(g.t0 + g.delta)}`);
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
  })('kw-fs', () => pseudoFs.video(), () => pseudoFs.video().currentTime,
     (v, t) => { v.currentTime = t; }, () => Z.s <= 1,                       // 확대 중에는 끌기가 화면 이동이므로 제외
     () => (document.getElementById('kw-dark') ? 'invert(1) hue-rotate(180deg) ' : ''));   // 다크 모드 색 보정 유지

  // ----- 영상만 화면 전체에 보이기 (YouTube·일반 사이트 공통 코드) -----
  // iPhone 기본 전체화면은 손가락 터치 없이 켤 수 없고, 켜지면 페이지가 터치를 받지 못하므로 이 방식을 씀.
  // 영상을 페이지 맨 바깥(body)으로 잠시 옮겨 화면 전체에 고정 → 사이트 구조와 관계없이 항상 꽉 참.
  // 끄거나 영상이 끝나면 원래 자리로 되돌림. 전체화면에서 영상을 한 번 탭하면 tap(영상) 실행.
  const pseudoFs = ((P, play, tap) => {
    const CSS = `
      video.${P} { position: fixed !important; top: 0 !important; left: 0 !important; right: auto !important; bottom: auto !important;
                   width: 100vw !important; height: 100vh !important; height: 100dvh !important;
                   max-width: none !important; max-height: none !important; margin: 0 !important; padding: 0 !important;
                   object-fit: contain !important; background: #000 !important; z-index: 2147483000 !important;   /* 다른 확장 프로그램 버튼(M3U8 등)이 영상 위에 보이도록 최대값보다 낮게 */
                   opacity: 1 !important; visibility: visible !important; display: block !important; touch-action: manipulation !important; }
      html.${P}-on, html.${P}-on body { overflow: hidden !important; background: #000 !important;
                   transform: none !important; filter: none !important; contain: none !important; }
      html.${P}-on [data-kw-fshide] { visibility: hidden !important; }`;
    let vid = null, home = null, homeParent = null, tapTimer = 0;
    // 광고 차단 등 다른 스크립트가 숨김 표시를 붙였으면 지움 (영상이 검게 보이는 것 방지)
    const unhide = v => { if (v.style.display === 'none') v.style.removeProperty('display'); delete v.dataset.kwHidden; };
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
      if (tapTimer) { clearTimeout(tapTimer); tapTimer = 0; return; }
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
      unhide(v);
      v.classList.add(P);
      document.documentElement.classList.add(P + '-on');
      keepPlaying(v, was);
    };
    const exit = () => {
      if (!vid) return;
      const v = vid, was = !v.paused;
      v.classList.remove(P);
      unhide(v);
      document.documentElement.classList.remove(P + '-on');
      if (home && home.parentNode) home.parentNode.insertBefore(v, home);
      else if (homeParent && homeParent.isConnected) homeParent.appendChild(v);
      if (home) home.remove();
      vid = home = homeParent = null;
      keepPlaying(v, was);
    };
    // 영상이 끝나거나 다른 영상으로 바뀌면 원래 자리로 되돌림 → 사이트가 다음 영상을 정상적으로 이어서 재생
    // (사이트가 화면 회전 때 영상을 잠깐 다시 불러오는 경우가 있어, 'emptied'는 2초 뒤에도 비어 있을 때만 되돌림)
    document.addEventListener('ended', e => { if (e.target === vid) exit(); }, true);
    document.addEventListener('emptied', e => {
      const v = e.target;
      if (v !== vid) return;
      setTimeout(() => { if (vid === v && (v.readyState === 0 || (v.paused && v.currentTime === 0))) exit(); }, 2000);
    }, true);
    // 사이트가 영상을 원래 자리로 다시 가져가거나 표시를 지우면 즉시 복구 (가로 전환 후 검은 화면 방지)
    setInterval(() => {
      if (!vid) return;
      if (!vid.isConnected || vid.parentNode !== document.body) document.body.appendChild(vid);
      if (!vid.classList.contains(P)) vid.classList.add(P);
      unhide(vid);
      if (!document.documentElement.classList.contains(P + '-on')) document.documentElement.classList.add(P + '-on');
    }, 400);
    // 두 번 탭을 따로 처리했을 때, 첫 탭이 예약한 '한 번 탭' 동작(조작 화면 표시) 취소
    const cancelTap = () => { clearTimeout(tapTimer); tapTimer = 0; };
    return { enter, exit, cancelTap, video: () => vid };
  })('kw-fs', v => v.play().catch(() => {}), () => toggleFsUi());   // 한 번 탭 = 조작 화면 보이기/숨기기

  let lastTapAt = 0, lastX = 0, lastY = 0;
  const toggleFs = v => {
    resetZoom();
    autoFs = false;
    if (pseudoFs.video()) pseudoFs.exit(); else pseudoFs.enter(v);
    setTimeout(updateVideos, 50);   // 버튼 묶음 위치 바로 바꾸기
  };

  document.addEventListener('touchend', e => {
    const t = e.changedTouches && e.changedTouches[0];
    if (!t || e.touches.length || e.defaultPrevented || own(e.target)) return;   // (두 손가락 톡은 PiP가 처리)
    // 영상 위에 떠 있는 버튼(다른 확장 프로그램의 M3U8 버튼, 사이트 플레이어 버튼 등)을 누른 것은 건드리지 않음
    if (e.target.tagName !== 'VIDEO' && e.target.closest && e.target.closest('button, a, input, select, [role="button"]')) { lastTapAt = 0; return; }
    const v = pseudoFs.video() || videoAt(t.clientX, t.clientY);
    if (!v) { lastTapAt = 0; return; }
    const now = Date.now();
    if (now - lastTapAt < 300 && Math.abs(t.clientX - lastX) < 40 && Math.abs(t.clientY - lastY) < 40) {
      e.preventDefault();   // 두 번 탭 확대(줌) 막기
      lastTapAt = 0;
      pseudoFs.cancelTap();
      // 전체화면 중: 왼쪽 1/3 = 10초 뒤로, 오른쪽 1/3 = 10초 앞으로, 가운데 = 전체화면 끄기
      const side = pseudoFs.video() ? (t.clientX < innerWidth / 3 ? -10 : t.clientX > innerWidth * 2 / 3 ? 10 : 0) : 0;
      if (side && isFinite(v.duration)) {
        v.currentTime = Math.max(0, Math.min(v.duration - 0.5, v.currentTime + side));
        fsGest.hud(side > 0 ? '10초 앞으로 ▶▶' : '◀◀ 10초 뒤로');
        return;
      }
      toggleFs(v);
    } else {
      lastTapAt = now; lastX = t.clientX; lastY = t.clientY;
    }
  }, { capture: true, passive: false });

  // ----- 가로로 돌리면 자동 전체화면, 세로로 돌리면 원래대로 -----
  // (iPhone 기본 전체화면은 손가락 터치 없이 켤 수 없으므로 위의 '영상만 화면 전체' 방식 사용)
  let autoFs = false;
  const landscape = matchMedia('(orientation: landscape)');
  let rotTimer = 0;
  const onRotate = () => {
    rotTimer = 0;
    const wide = innerWidth > innerHeight;
    if (wide && landscape.matches) {
      if (!SET.autoFs) return;
      const v = activeVideo();
      if (!pseudoFs.video() && v && !v.paused && v.videoWidth >= 400) {   // 재생 중인 본 영상만 (작은 광고 영상 제외)
        resetZoom(); pseudoFs.enter(v); autoFs = true; setTimeout(updateVideos, 50);
      }
    } else if (!wide && autoFs) {
      autoFs = false;
      if (pseudoFs.video()) { resetZoom(); pseudoFs.exit(); setTimeout(updateVideos, 50); }
    }
  };
  // 회전 직후에는 화면 크기가 아직 바뀌는 중 → 크기 변화가 0.4초 동안 없을 때 실행
  const scheduleRotate = () => { clearTimeout(rotTimer); rotTimer = setTimeout(onRotate, 400); };
  landscape.addEventListener('change', scheduleRotate);
  window.addEventListener('resize', () => { if (rotTimer) scheduleRotate(); });

  // ================= 5. 영상 두 손가락으로 벌리기 → 확대 / 오므리기 → 축소 =================
  // 확대된 상태에서는 한 손가락으로 끌어 위치 이동. 최대 4배.
  const Z = { v: null, s: 1, x: 0, y: 0, d0: 0, s0: 1, px: 0, x0: 0, y0: 0 };   // 영상, 배율, 이동, 손가락 간격 등
  const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const clampPan = () => {
    const r = Z.v.getBoundingClientRect(), w = r.width / Z.s, h = r.height / Z.s;
    const mx = (Z.s - 1) * w / 2, my = (Z.s - 1) * h / 2;
    Z.x = Math.max(-mx, Math.min(mx, Z.x));
    Z.y = Math.max(-my, Math.min(my, Z.y));
  };
  const drawZoom = () => {
    if (!Z.v) return;
    Z.v.style.transformOrigin = 'center center';
    Z.v.style.transform = Z.s > 1 ? `translate(${Z.x}px, ${Z.y}px) scale(${Z.s})` : '';
  };
  function resetZoom() {
    if (Z.v) Z.v.style.transform = '';
    Object.assign(Z, { v: null, s: 1, x: 0, y: 0, d0: 0, px: 0 });
  }

  document.addEventListener('touchstart', e => {
    const t = e.touches;
    if (t.length === 2) {
      const v = pseudoFs.video() ||
        videoAt((t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2);
      if (!v) return;
      if (Z.v !== v) { resetZoom(); Z.v = v; }
      Z.d0 = dist(t); Z.s0 = Z.s; Z.px = 0;
      e.preventDefault();
    } else if (t.length === 1 && Z.v && Z.s > 1 && videoAt(t[0].clientX, t[0].clientY) === Z.v) {
      Z.px = 1; Z.x0 = Z.x - t[0].clientX; Z.y0 = Z.y - t[0].clientY;   // 끌기 시작
    }
  }, { capture: true, passive: false });

  document.addEventListener('touchmove', e => {
    const t = e.touches;
    if (Z.d0 && t.length === 2) {
      Z.s = Math.max(1, Math.min(4, Z.s0 * dist(t) / Z.d0));
    } else if (Z.px && t.length === 1) {
      Z.x = Z.x0 + t[0].clientX; Z.y = Z.y0 + t[0].clientY;
    } else return;
    clampPan(); drawZoom();
    e.preventDefault();   // 페이지 확대·스크롤 대신 영상만 확대·이동
  }, { capture: true, passive: false });

  document.addEventListener('touchend', e => {
    if (e.touches.length < 2) Z.d0 = 0;
    if (!e.touches.length) Z.px = 0;
    if (Z.v && Z.s < 1.05) { Z.s = 1; Z.x = Z.y = 0; drawZoom(); }
  }, true);
  // Safari 자체 페이지 확대 제스처는 영상 위에서만 막음
  ['gesturestart', 'gesturechange'].forEach(ev =>
    document.addEventListener(ev, e => { if (Z.d0) e.preventDefault(); }, { capture: true, passive: false }));

  // ================= 메인 루프 (1.5초) =================
  setInterval(() => {
    if (!document.body || document.hidden) return;   // 화면이 꺼져 있으면 쉼 (배터리 절약)
    try { ensureStyles(); updateVideos(); applyDark(); } catch (e) {}
  }, 1500);
})();

// ==UserScript==
// @name         Web Save
// @namespace    https://github.com/theXresearch/safari-userscripts
// @version      2026.11.12.8
// @author       theXresearch
// @updateURL    https://raw.githubusercontent.com/theXresearch/safari-userscripts/main/src/web-save.meta.js
// @downloadURL  https://raw.githubusercontent.com/theXresearch/safari-userscripts/main/src/web-save.user.js
// @description  일반 사이트 영상 내려받기 (데이터 없이 나중에 보기): ⬇ 한 번 → 기본 화질(1080p)로 받아 영상 제목 그대로 🎬 영상보기(Safari 안 목록·재생) 또는 파일 앱에 저장, 저장 후 임시 파일 자동 삭제 / 🎵 소리만 받기, 다른 화질 선택, M3U8(HLS)·MP4, 암호화(AES-128) 해독, MP4 변환, 이어받기, 차례 받기, 공간 확인, 임시 파일·받은 영상 모두 지우기, 받은 기록
// @match        *://*/*
// @exclude      *://*.youtube.com/*
// @run-at       document-end
// @noframes
// @grant        GM.xmlHttpRequest
// @grant        GM.getValue
// @grant        GM.setValue
// @require      https://cdn.jsdelivr.net/npm/mux.js@6.3.0/dist/mux-mp4.min.js
// ==/UserScript==
/* global muxjs */
(function () {
  'use strict';
  if (window.top !== window.self) return;

  // 영상 주소는 web-page가 찾아 <html data-kw-media>에 적어 둠 (iframe 안 플레이어는 postMessage로 전달)
  // 받은 조각은 이 사이트의 저장 공간(IndexedDB)에 차곡차곡 쌓음 → 메모리를 적게 쓰고, 중간에 끊겨도 이어받기
  // 다 받으면 조각을 한 파일로 묶어 '파일에 저장'(파일 앱 → 다운로드) 또는 '공유'(사진 앱에 저장 등)
  const ROOT = document.documentElement;
  // 🎬 영상보기 페이지 (받은 영상 목록·재생). 이 페이지에서는 받기 기능을 쓰지 않음
  const LIB = window.__kwLib || 'https://thexresearch.github.io/Tarrot/videos/';
  const LIB_ORIGIN = new URL(LIB).origin;
  if (location.href.startsWith(LIB)) return;
  const CONCURRENCY = 4;                 // 동시에 받는 조각 수
  const CHUNK = 4 << 20;                 // 일반 영상 파일은 4MB씩
  // MP4 변환기 (mux.js: mux-mp4 판은 muxjs.Transmuxer, 전체 판은 muxjs.mp4.Transmuxer)
  const Muxer = () => (typeof muxjs === 'undefined' ? null : (muxjs.mp4 && muxjs.mp4.Transmuxer) || muxjs.Transmuxer || null);
  const hasMux = () => !!Muxer();

  // ================= 1. 저장 공간 (IndexedDB) =================
  // jobs: 받기 작업 정보 / parts: [작업ID, 순번] → 조각(Blob). 순번 -1 = 영상 머리(init)
  let noBlob = false;
  const DB = (() => {
    let opening = null;
    const open = () => opening || (opening = new Promise((res, rej) => {
      const r = indexedDB.open('kw-save', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('jobs', { keyPath: 'id' }); r.result.createObjectStore('parts'); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => { opening = null; rej(r.error); };
    }));
    const tx = (store, mode, fn) => open().then(d => new Promise((res, rej) => {
      const t = d.transaction(store, mode), req = fn(t.objectStore(store));
      let out;
      if (req) req.onsuccess = () => { out = req.result; };
      t.oncomplete = () => res(out);
      t.onerror = t.onabort = () => rej(t.error || new Error('저장 실패'));
    }));
    const span = id => IDBKeyRange.bound([id, -1], [id, Infinity]);
    return {
      putJob: j => tx('jobs', 'readwrite', s => s.put(j)),
      jobs: () => tx('jobs', 'readonly', s => s.getAll()),
      delJob: id => tx('jobs', 'readwrite', s => s.delete(id)),
      // Safari '개인정보 보호 브라우징'은 저장 공간에 Blob을 못 넣음 → 그때부터 바이트 배열로 저장 (메모리는 더 씀)
      putPart: async (id, i, blob) => {
        if (!noBlob) {
          try { return await tx('parts', 'readwrite', s => s.put(blob, [id, i])); } catch (e) { noBlob = true; }
        }
        const buf = await blob.arrayBuffer();
        return tx('parts', 'readwrite', s => s.put(buf, [id, i]));
      },
      parts: id => tx('parts', 'readonly', s => s.getAll(span(id))),
      delParts: id => tx('parts', 'readwrite', s => s.delete(span(id)))
    };
  })();

  // ================= 2. 네트워크 =================
  // 먼저 페이지와 같은 방식(fetch)으로 받음 → 사이트 쿠키·출처 정보가 그대로 가서 대부분 통과.
  // 다른 사이트 서버가 막으면(CORS) Userscripts 앱의 GM.xmlHttpRequest로 다시 받음.
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const visible = () => document.visibilityState === 'visible';
  const untilVisible = async () => { while (!visible()) await sleep(1000); };
  const gmGet = (url, headers) => new Promise((res, rej) => {
    if (typeof GM === 'undefined' || !GM.xmlHttpRequest) return rej(new Error('이 사이트 서버가 받기를 막음'));
    GM.xmlHttpRequest({
      url, method: 'GET', headers, responseType: 'arraybuffer', timeout: 90000,
      onload: r => res({ status: r.status, buf: new Uint8Array(r.response || new ArrayBuffer(0)),
        range: ((r.responseHeaders || '').match(/content-range:\s*([^\r\n]+)/i) || [])[1] || '' }),
      onerror: () => rej(new Error('네트워크 오류')), ontimeout: () => rej(new Error('시간 초과'))
    });
  });
  // job.net: 'page' | 'gm' (처음 막힌 뒤로는 바로 GM)
  // onChunk가 있으면 서버가 이어받기를 지원하지 않을 때(200) 4MB씩 나눠 넘김 (큰 파일을 한 번에 메모리에 올리지 않음)
  const getBin = async (job, url, br, onChunk) => {
    const headers = br ? { Range: `bytes=${br[0]}-${br[1] === undefined ? '' : br[1]}` } : {};
    if (job.net !== 'gm') {
      let r;
      try { r = await fetch(url, { headers, cache: 'no-store' }); } catch (e) { r = null; }
      if (r) {
        if (!r.ok) throw new Error('서버 응답 ' + r.status + (r.status === 403 ? ' (주소 유효 시간이 지났을 수 있음 → 영상을 다시 재생 후 받기)' : ''));
        const range = r.headers.get('content-range') || '';
        if (onChunk && r.status === 200 && r.body && r.body.getReader) {
          const rd = r.body.getReader();
          let buf = [], size = 0;
          for (;;) {
            const { done, value } = await rd.read();
            if (value) { buf.push(value); size += value.length; }
            if (size >= CHUNK || (done && size)) { await onChunk(join(buf, size)); buf = []; size = 0; }
            if (done) break;
          }
          return { status: 200, streamed: true, range };
        }
        return { status: r.status, buf: new Uint8Array(await r.arrayBuffer()), range };
      }
      job.net = 'gm';
    }
    const g = await gmGet(url, headers);
    if (g.status >= 400) throw new Error('서버 응답 ' + g.status);
    return g;
  };
  const getText = async (url, job = {}) => new TextDecoder().decode((await getBin(job, url)).buf);
  const join = (arr, size) => { const o = new Uint8Array(size); let p = 0; arr.forEach(a => { o.set(a, p); p += a.length; }); return o; };
  // 실패하면 1·2·4초 뒤 다시 (화면이 꺼져 멈춘 동안의 실패는 횟수에 넣지 않고, 화면이 켜지면 다시)
  const retry = async (job, fn) => {
    for (let i = 0; ; i++) {
      if (job.state !== 'run') throw new Error('멈춤');
      try { return await fn(); } catch (e) {
        if (!visible()) { await untilVisible(); i--; continue; }
        if (i >= 3 || /서버 응답 4/.test(e.message)) throw e;
        await sleep(1000 << i);
      }
    }
  };

  // ================= 3. 재생 목록(M3U8) 읽기 =================
  const attrs = s => { const o = {}; s.replace(/([A-Z0-9-]+)=("[^"]*"|[^,]*)/g, (_, k, v) => { o[k] = v.replace(/^"|"$/g, ''); }); return o; };
  const parseM3u8 = (text, base) => {
    const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (!/^#EXTM3U/.test(lines[0] || '')) throw new Error('재생 목록이 아님');
    const abs = u => new URL(u, base).href;
    if (lines.some(l => l.startsWith('#EXT-X-STREAM-INF'))) {          // 화질 목록 (master)
      const variants = [], audio = {};
      lines.forEach((l, i) => {
        if (l.startsWith('#EXT-X-MEDIA:')) {
          const a = attrs(l.slice(13));
          if (a.TYPE === 'AUDIO' && a.URI) (audio[a['GROUP-ID']] = audio[a['GROUP-ID']] || []).push({ u: abs(a.URI), name: a.NAME || '', def: a.DEFAULT === 'YES' });
        } else if (l.startsWith('#EXT-X-STREAM-INF:')) {
          const a = attrs(l.slice(18)), uri = lines.slice(i + 1).find(x => !x.startsWith('#'));
          if (!uri) return;
          const [w, h] = (a.RESOLUTION || '').split('x').map(Number);
          const v = { u: abs(uri), bw: +a['AVERAGE-BANDWIDTH'] || +a.BANDWIDTH || 0, w: w || 0, h: h || 0, audio: a.AUDIO || '' };
          if (!variants.some(x => x.u === v.u)) variants.push(v);
        }
      });
      variants.forEach(v => { const g = audio[v.audio]; v.audioUrl = g ? (g.find(x => x.def) || g[0]).u : ''; });
      variants.sort((a, b) => (b.h - a.h) || (b.bw - a.bw));
      return { master: true, variants };
    }
    let key = null, map = null, seq = 0, nextDur = 0, nextBr = null, lastEnd = 0, dur = 0, live = true;
    const segs = [];
    const byteRange = (s, from) => { const [len, off] = s.split('@'); const o = off !== undefined ? +off : from; return [o, o + +len - 1]; };
    for (const l of lines) {
      if (l.startsWith('#EXT-X-MEDIA-SEQUENCE:')) seq = +l.split(':')[1] || 0;
      else if (l.startsWith('#EXT-X-KEY:')) {
        const a = attrs(l.slice(11));
        key = a.METHOD === 'NONE' ? null : { m: a.METHOD, u: a.URI ? abs(a.URI) : '', iv: a.IV || '' };
      } else if (l.startsWith('#EXT-X-MAP:')) {
        const a = attrs(l.slice(11));
        map = { u: abs(a.URI) };
        if (a.BYTERANGE) map.br = byteRange(a.BYTERANGE, 0);
      } else if (l.startsWith('#EXTINF:')) nextDur = parseFloat(l.slice(8)) || 0;
      else if (l.startsWith('#EXT-X-BYTERANGE:')) nextBr = l.slice(17);
      else if (l.startsWith('#EXT-X-ENDLIST')) live = false;
      else if (!l.startsWith('#')) {
        const s = { u: abs(l), d: nextDur, n: seq + segs.length };
        if (key) s.k = key;
        if (nextBr) { s.br = byteRange(nextBr, lastEnd); lastEnd = s.br[1] + 1; nextBr = null; }
        segs.push(s);
        dur += nextDur; nextDur = 0;
      }
    }
    return { master: false, segs, dur, map, live };
  };

  // ================= 4. 암호 해독 (AES-128, iPhone 자체 암호 기능) =================
  const keyCache = {};
  const ivOf = s => {
    const iv = new Uint8Array(16);
    if (s.k.iv) { const hex = s.k.iv.replace(/^0x/i, '').padStart(32, '0'); for (let i = 0; i < 16; i++) iv[i] = parseInt(hex.substr(i * 2, 2), 16); }
    else { let n = s.n; for (let i = 15; i >= 12; i--) { iv[i] = n & 255; n = Math.floor(n / 256); } }
    return iv;
  };
  const decrypt = async (job, s, data) => {
    if (!s.k) return data;
    if (s.k.m !== 'AES-128') throw new Error('이 영상은 받을 수 없는 방식으로 보호됨 (' + s.k.m + ')');
    if (!keyCache[s.k.u]) keyCache[s.k.u] = retry(job, () => getBin(job, s.k.u))
      .then(r => crypto.subtle.importKey('raw', r.buf, 'AES-CBC', false, ['decrypt']));
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv: ivOf(s) }, await keyCache[s.k.u], data));
  };

  // ================= 5. MP4 머리에 영상 길이 기록 =================
  // 조각 MP4는 길이가 '모름'으로 적혀 있어 파일 앱에서 진행 막대가 안 생기는 경우가 있음 → 실제 길이를 적어 넣음
  const setDuration = (init, sec) => {
    const dv = new DataView(init.buffer, init.byteOffset, init.byteLength);
    const type = p => String.fromCharCode(init[p + 4], init[p + 5], init[p + 6], init[p + 7]);
    let movieScale = 0;
    const walk = (from, to) => {
      for (let p = from; p + 8 <= to;) {
        const size = dv.getUint32(p), t = type(p);
        if (size < 8 || p + size > to) return;
        if (/^(moov|trak|mdia)$/.test(t)) walk(p + 8, p + size);
        else if (t === 'mvhd' || t === 'tkhd' || t === 'mdhd') {
          const v1 = init[p + 8] === 1, b = p + 12;               // 버전·플래그 뒤
          // mvhd·mdhd: 만든 시각, 고친 시각, 단위, 길이 / tkhd: 만든 시각, 고친 시각, 트랙 번호, 예약, 길이
          const f = v1 ? 8 : 4;
          let scale, at;
          if (t === 'tkhd') { scale = movieScale; at = b + f * 2 + 8; }
          else { scale = dv.getUint32(b + f * 2); at = b + f * 2 + 4; if (t === 'mvhd') movieScale = scale; }
          const d = Math.round(sec * scale);
          if (scale && d > 0) {
            if (v1) { dv.setUint32(at, Math.floor(d / 4294967296)); dv.setUint32(at + 4, d >>> 0); }
            else if (d < 4294967295) dv.setUint32(at, d);
          }
        }
        p += size;
      }
    };
    try { walk(0, init.length); } catch (e) {}
    return init;
  };

  // ================= 6. 받기 작업 =================
  const running = new Map();          // 작업ID → 진행 정보 (화면 표시용)
  // 파일 이름에 못 쓰는 글자는 빼고, 너무 길면 줄임 (파일 앱 한도 안으로)
  const cleanName = s => {
    let t = (s || '').replace(/[\\/:*?"<>|\n\r\t]+/g, ' ').replace(/\s+/g, ' ').replace(/^[.\s]+|[.\s]+$/g, '');
    while (new TextEncoder().encode(t).length > 200) t = t.slice(0, -1);   // 파일 이름 한도 255바이트 (한글 1자 = 3바이트)
    return t.trim();
  };
  const ext = j => (j.fmt === 'ts' ? '.ts' : j.audioOnly ? '.m4a' : '.mp4');
  const mime = j => (j.fmt === 'ts' ? 'video/mp2t' : j.audioOnly ? 'audio/mp4' : 'video/mp4');
  const fileName = j => j.name + ext(j);
  const save = j => { if (j.removed) return Promise.resolve(); j.at = Date.now(); return DB.putJob(Object.assign({}, j)).catch(() => {}); };

  let wl = null;                       // 화면 켜짐 유지 (받는 동안 화면이 꺼지면 iPhone이 받기를 멈추므로)
  const wake = async on => {
    try {
      if (on && !wl && navigator.wakeLock && visible()) { wl = await navigator.wakeLock.request('screen'); wl.addEventListener('release', () => { wl = null; }); }
      else if (!on && wl) { await wl.release(); wl = null; }
    } catch (e) {}
  };
  setInterval(() => { if (running.size && !wl) wake(true); }, 3000);   // 화면을 다시 켜면 다시 요청

  const runHls = async j => {
    const N = j.segs.length, ready = new Map();
    let next = j.done, writeAt = j.done, failed = null, writing = Promise.resolve();
    // 이어받기면 새 변환기를 이전까지의 시간에서 시작 (시간이 0으로 돌아가지 않게)
    const startSec = j.segs.slice(0, j.done).reduce((a, s) => a + s.d, 0);
    let tm = null, out = [];
    // 'aud'(소리만)은 영상·소리를 따로 꺼내(remux: false) 소리 쪽만 씀
    const transmux = u8 => {
      if (!tm) {
        tm = new (Muxer())({ remux: j.fmt !== 'aud', baseMediaDecodeTime: Math.round(startSec * 90000) });
        tm.on('data', s => out.push(s));
      }
      out = [];
      tm.push(u8); tm.flush();
      return j.fmt === 'aud' ? out.filter(x => x.type === 'audio') : out;
    };
    if (j.map && !j.initDone) {
      const r = await retry(j, () => getBin(j, j.map.u, j.map.br));
      await DB.putPart(j.id, -1, new Blob([setDuration(r.buf, j.dur)]));
      j.initDone = true; j.fmt = 'mp4'; await save(j);
    }
    const write = async () => {
      while (ready.has(writeAt)) {
        let data = ready.get(writeAt); ready.delete(writeAt);
        const s = j.segs[writeAt];
        data = await decrypt(j, s, data);
        if (!j.fmt) {
          const ts = data[0] === 0x47;                                         // 0x47 = TS 조각
          const aac = (data[0] === 0xFF && (data[1] & 0xF6) === 0xF0) || (data[0] === 0x49 && data[1] === 0x44 && data[2] === 0x33);   // 소리 조각(AAC·ID3)
          j.fmt = j.audioOnly && (ts || aac) && hasMux() ? 'aud' : ts ? (hasMux() ? 'tsmux' : 'ts') : 'mp4';
        }
        let blob;
        if (j.fmt === 'tsmux' || j.fmt === 'aud') {
          const segsOut = transmux(data);
          if (!j.initDone && segsOut.length) {
            await DB.putPart(j.id, -1, new Blob([setDuration(segsOut[0].initSegment, j.dur)]));
            j.initDone = true;
          }
          blob = new Blob(segsOut.map(x => x.data));
        } else blob = new Blob([data]);
        await DB.putPart(j.id, writeAt, blob);
        j.bytes += blob.size;
        writeAt++;
        j.done = writeAt;
        if (writeAt % 5 === 0 || writeAt === N) await save(j);
      }
    };
    const worker = async () => {
      while (j.state === 'run' && !failed && next < N) {
        if (ready.size > CONCURRENCY * 3) { await sleep(100); continue; }   // 앞 조각을 기다리는 동안 너무 많이 쌓이지 않게
        const i = next++, s = j.segs[i];
        try {
          const r = await retry(j, () => getBin(j, s.u, s.br));
          ready.set(i, r.buf);
          writing = writing.then(write).catch(e => { failed = failed || e; });
        } catch (e) { failed = failed || e; }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    await writing;
    if (failed) throw failed;
    if (j.state === 'run' && j.done >= N) j.state = 'done';
  };

  const runFile = async j => {
    const onChunk = async u8 => { await DB.putPart(j.id, j.done, new Blob([u8])); j.done++; j.bytes += u8.length; await save(j); };
    while (j.state === 'run') {
      if (j.total && j.bytes >= j.total) break;
      const r = await retry(j, () => getBin(j, j.url, [j.bytes, j.bytes + CHUNK - 1], j.bytes === 0 ? onChunk : null));
      if (r.status === 200) {                       // 서버가 나눠 받기를 지원하지 않음 → 처음부터 통째로
        if (r.streamed) { j.total = j.bytes; break; }
        if (j.bytes > 0) { await DB.delParts(j.id); j.done = 0; j.bytes = 0; }
        for (let p = 0; p < r.buf.length; p += CHUNK) await onChunk(r.buf.subarray(p, p + CHUNK));
        j.total = j.bytes; break;
      }
      const m = /\/(\d+)/.exec(r.range || '');
      if (m) j.total = +m[1];
      if (r.buf.length) await onChunk(r.buf);
      if (r.buf.length < CHUNK) { j.total = j.bytes; break; }
    }
    if (j.state === 'run') j.state = 'done';
  };

  // ================= 6-2. 설정·기록 (모든 사이트 공통, Userscripts 저장소) =================
  // SS: quality = 기본 화질(세로 픽셀, 0 = 가장 좋은 화질) · oneTap = ⬇ 한 번에 바로 받기 · autoSave = 다 받으면 저장 · autoClean = 저장 후 임시 파일 정리
  // dest = 저장할 곳: 'library'(🎬 영상보기, Safari 안) | 'files'(파일 앱)
  const SS = { quality: 1080, oneTap: true, autoSave: true, autoClean: true, dest: 'library' };
  const CLEAN_MS = window.__kwSaveCleanMs || 10 * 60000;          // 저장 후 임시 파일을 지우기까지 (Safari가 파일 앱으로 옮길 시간)
  const STALE_MS = 3 * 864e5;           // 3일 동안 손대지 않은 받다 만 작업은 자동 정리
  const SHORTCUT = '영상 모두 삭제';     // '받은 영상 모두 삭제'가 실행할 단축어 이름
  const gmGetV = async (k, d) => { try { return typeof GM !== 'undefined' && GM.getValue ? await GM.getValue(k, d) : d; } catch (e) { return d; } };
  const gmSetV = (k, v) => { try { if (typeof GM !== 'undefined' && GM.setValue) GM.setValue(k, v); } catch (e) {} };
  const gmJson = async (k, d) => { try { return JSON.parse(await gmGetV(k, JSON.stringify(d))) || d; } catch (e) { return d; } };
  const ready = (async () => { Object.assign(SS, await gmJson('saveSet', {})); })();
  const saveSet = () => gmSetV('saveSet', JSON.stringify(SS));
  const addHistory = async j => {
    const h = await gmJson('saveHist', []);
    h.unshift({ name: fileName(j), size: j.bytes, at: Date.now(), site: location.hostname });
    gmSetV('saveHist', JSON.stringify(h.slice(0, 200)));
  };
  // 사이트마다 따로인 임시 공간(IndexedDB) 사용량을 한곳에 적어 둠 → 설정 화면에서 '다른 사이트에 남은 임시 파일' 표시
  let siteTimer = 0;
  const noteSite = () => {
    clearTimeout(siteTimer);
    siteTimer = setTimeout(async () => {
      const js = await DB.jobs().catch(() => []);
      const bytes = js.reduce((a, j) => a + (j.bytes || 0), 0);
      const sites = await gmJson('saveSites', {});
      if (bytes) sites[location.origin] = { bytes, at: Date.now() }; else delete sites[location.origin];
      gmSetV('saveSites', JSON.stringify(sites));
    }, 3000);
  };

  // ================= 6-3. 시작·차례·끝 =================
  // 한 번에 하나씩 받음 (메모리·데이터를 나눠 쓰지 않게). 나머지는 '차례 기다림'
  const progress = j => (j.kind === 'hls' ? j.done / j.total : j.total ? j.bytes / j.total : 0);
  const start = async j => {
    if (running.has(j.id) || j.removed) return;
    if (running.size) { j.state = 'queue'; await save(j); refresh(); return; }
    j.state = 'run'; j.err = '';
    running.set(j.id, { j, t0: Date.now(), b0: j.bytes });
    wake(true);
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
    await save(j);
    try {
      if (j.kind === 'hls') await runHls(j); else await runFile(j);
    } catch (e) {
      if (j.state === 'run') { j.state = 'error'; j.err = e.message || String(e); }
    }
    running.delete(j.id);
    if (!running.size) wake(false);
    await save(j);
    if (j.state === 'done') { addHistory(j); toast(`받기 완료: ${fileName(j)}`); afterDone(); }
    noteSite();
    refresh();
    startNext();
  };
  const startNext = async () => {
    if (running.size) return;
    const q = (await DB.jobs().catch(() => [])).filter(j => j.state === 'queue').sort((a, b) => a.created - b.created)[0];
    if (q) start(q);
  };
  const pause = j => { j.state = 'pause'; save(j); refresh(); startNext(); };
  const remove = async j => {
    j.state = 'pause'; j.removed = true;
    running.delete(j.id);
    blobs.delete(j.id);
    await DB.delParts(j.id).catch(() => {});
    await DB.delJob(j.id).catch(() => {});
    noteSite();
    refresh();
    startNext();
  };
  // 다 받은 영상
  //  · 파일 앱: 화면이 보일 때 자동으로 저장 → 10분 뒤 임시 파일 자동 삭제
  //  · 영상보기: 페이지를 여는 데 손가락 한 번이 필요(iPhone 규칙) → 아래 '🎬 영상보기에 넣기' 띠를 띄움. 넣으면 임시 파일 바로 삭제
  const saving = new Set();
  let pendingN = 0;                    // 영상보기에 넣기를 기다리는 완료 영상 수
  const afterDone = async () => {
    const js = await DB.jobs().catch(() => []);
    for (const j of js) {
      if (j.state !== 'done' || saving.has(j.id)) continue;
      if (!j.savedAt && SS.dest === 'files' && SS.autoSave && visible()) { saving.add(j.id); await saveToFiles(j, true).catch(() => {}); saving.delete(j.id); }
      else if (j.savedAt && SS.autoClean && Date.now() - j.savedAt > CLEAN_MS) await remove(j);
    }
    const pend = js.filter(j => j.state === 'done' && !j.savedAt && SS.dest === 'library');
    pendingN = pend.length;
    libBar(pend);
  };
  // 🎬 영상보기로 보내기: 영상보기 페이지를 새 탭으로 열고, 그 페이지가 준비되면 영상 파일을 하나씩 건넴 → 받았다고 하면 임시 파일 삭제
  // 새 탭은 손가락으로 누른 바로 그 순간에만 열 수 있음 (iPhone 규칙) → 무엇보다 먼저 탭을 열고, 보낼 영상은 그다음에 찾음
  const sendToLibrary = async list => {
    const w = window.open(LIB, '_blank');
    if (!w) return toast('새 탭을 열 수 없음 — 다시 눌러 주세요');
    list = list || (await DB.jobs().catch(() => [])).filter(j => j.state === 'done' && !j.savedAt);
    if (!list.length) return;
    let sent = false;
    setTimeout(() => { if (!sent) toast('영상보기 페이지가 응답하지 않음 — 인터넷 연결 또는 페이지 주소를 확인하세요'); }, 20000);
    const onMsg = async e => {
      if (e.source !== w || e.origin !== LIB_ORIGIN || !e.data) return;
      if (e.data.kwLib === 'ready' && !sent) {
        sent = true;
        for (const j of list) {
          const blob = await prepare(j);
          w.postMessage({ kwLib: 'put', blob, item: { id: j.id, name: j.name, dur: j.dur || 0, h: j.h || 0, audio: !!j.audioOnly, ts: j.fmt === 'ts', site: location.hostname } }, LIB_ORIGIN);
        }
      } else if (e.data.kwLib === 'ok') {
        const j = list.find(x => x.id === e.data.id);
        if (j) { j.savedAt = Date.now(); await remove(j); }      // 영상보기에 들어갔으니 이 사이트의 임시 파일은 바로 지움
        if (list.every(x => x.savedAt)) window.removeEventListener('message', onMsg);
      } else if (e.data.kwLib === 'fail') toast('영상보기에 넣지 못함: ' + (e.data.err || ''));
    };
    window.addEventListener('message', onMsg);
  };
  // 화면 아래 띠: '✓ 받기 완료 n개 — 🎬 영상보기에 넣기'
  // ✕로 닫으면 이 영상들에 대해서는 다시 띄우지 않음 (⬇ 버튼의 '🎬 n'으로 언제든 넣기)
  const barOff = new Set((() => { try { return JSON.parse(sessionStorage.getItem('kwBarOff')) || []; } catch (e) { return []; } })());
  const libBar = pend => {
    let bar = document.getElementById('kw-savelib');
    pend = pend.filter(j => !barOff.has(j.id));
    if (!pend.length || !document.body) { if (bar) bar.remove(); return; }
    if (!bar) {
      bar = mk('div', 'position:fixed;left:10px;right:10px;bottom:calc(14px + env(safe-area-inset-bottom));z-index:2147483647;display:flex;align-items:center;gap:10px;' +
        'background:rgba(28,28,30,.96);color:#fff;padding:10px 12px;border-radius:14px;font:14px -apple-system,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.5)');
      bar.id = 'kw-savelib';
      const t = mk('div', 'flex:1');
      const go = btn('🎬 영상보기에 넣기', () => { bar.remove(); sendToLibrary(); }, '#0a84ff');
      const x = btn('✕', () => {
        pend.forEach(j => barOff.add(j.id));
        try { sessionStorage.setItem('kwBarOff', JSON.stringify([...barOff])); } catch (e) {}
        bar.remove();
      });
      x.style.background = 'none';
      bar.append(t, go, x);
      document.body.appendChild(bar);
    }
    bar.firstChild.textContent = `✓ 받기 완료 ${pend.length}개`;
  };
  // 정리: 오래 방치된 작업, '임시 파일 모두 지우기'를 누른 뒤 남은 이 사이트 작업
  const tidyUp = async () => {
    const cleanAt = +(await gmGetV('saveCleanAt', 0)) || 0;
    const js = await DB.jobs().catch(() => []);
    for (const j of js) {
      if (running.has(j.id)) continue;
      if (j.created < cleanAt || (j.state !== 'done' && Date.now() - (j.at || j.created) > STALE_MS)) await remove(j);
    }
    noteSite();
  };
  const cleanAll = async () => {
    for (const r of [...running.values()]) r.j.state = 'pause';
    const js = await DB.jobs().catch(() => []);
    for (const j of js) await remove((running.get(j.id) || {}).j || j);
    gmSetV('saveCleanAt', Date.now());          // 다른 사이트의 임시 파일은 그 사이트를 열 때 자동으로 지움
    toast('임시 파일을 지웠습니다');
  };

  // ================= 6-4. 영상 이름 =================
  // 사이트가 알려 주는 영상 제목(og:title·영상 정보) → 큰 제목(h1) → 페이지 제목 순. 끝에 붙은 사이트 이름은 뺌
  const videoTitle = () => {
    const meta = n => { const m = document.querySelector(`meta[property="${n}"], meta[name="${n}"]`); return m ? (m.content || '').trim() : ''; };
    let t = '';
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      const find = o => {
        if (!o || typeof o !== 'object') return '';
        if (Array.isArray(o)) { for (const x of o) { const r = find(x); if (r) return r; } return ''; }
        if (/VideoObject|Movie|Episode|Clip/.test(String(o['@type'])) && typeof o.name === 'string') return o.name;
        for (const k in o) { const r = find(o[k]); if (r) return r; }
        return '';
      };
      try { t = find(JSON.parse(s.textContent)); } catch (e) {}
      if (t) break;
    }
    t = t || meta('og:title') || meta('twitter:title');
    if (!t) { const h = document.querySelector('h1'); t = h ? h.textContent.trim() : ''; }
    t = t || document.title;
    const site = (meta('og:site_name') || location.hostname.replace(/^(www|m)\./, '').split('.')[0]).toLowerCase();
    // '제목 - 사이트' · '제목 | 사이트' 처럼 사이트 이름이 든 끝부분만 뺌 (제목 안의 '-'는 그대로: 예 ABC-123)
    t = t.replace(/\s+[-|–—·:]\s+([^-|–—·:]{1,60})$/, (all, tail) => (tail.toLowerCase().replace(/\s/g, '').includes(site.replace(/\s/g, '')) ||
      site.includes(tail.toLowerCase().replace(/\s/g, '')) ? '' : all));
    return cleanName(t) || location.hostname;
  };

  // 작업 만들기 (c = 찾은 영상, v = 고른 화질)
  // 지금 보는 영상이 아닌 것(같은 페이지에서 함께 잡힌 다른 영상)은 제목 뒤에 길이를 붙여 구분
  const newJob = async (c, v) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const base = { id, src: c.u, page: location.href, created: Date.now(), done: 0, bytes: 0, state: 'pause', net: 'page', name: videoTitle(), h: v ? v.h : 0 };
    if (c.t === 'file') return Object.assign(base, { kind: 'file', url: c.u });
    const url = v ? v.u : c.u;
    const pl = parseM3u8(await getText(url, base), url);
    if (pl.master) throw new Error('재생 목록 구조가 예상과 다름');
    if (pl.live) throw new Error('실시간 방송은 받을 수 없음 (끝이 정해진 영상만)');
    if (!pl.segs.length) throw new Error('영상 조각이 없음');
    if (c.main === false) base.name += ` (${fmtT(pl.dur)})`;
    return Object.assign(base, { kind: 'hls', url, segs: pl.segs, map: pl.map, dur: pl.dur, total: pl.segs.length });
  };
  // 기본 화질 고르기: 설정한 화질 이하에서 가장 좋은 것 (없으면 가장 낮은 것), 0 = 가장 좋은 화질
  const pickVariant = vs => {
    if (!SS.quality) return vs[0];
    const under = vs.filter(v => v.h && v.h <= SS.quality);
    return under[0] || vs.filter(v => v.h).slice(-1)[0] || vs[0];
  };
  const estimate = (p, v) => { const d = (p && !p.master && p.dur) || mainDuration(); return v && v.bw && d ? v.bw * d / 8 : 0; };
  const roomFor = async bytes => {
    if (!bytes) return true;
    try { const e = await navigator.storage.estimate(); const free = (e.quota || 0) - (e.usage || 0); if (free && free < bytes * 1.05) { toast(`저장 공간 부족: 필요 약 ${MB(bytes)}, 남은 공간 ${MB(free)}`); return false; } } catch (e) {}
    return true;
  };
  // 🎵 소리만 받기: 소리가 따로 있으면 그것만, 아니면 가장 낮은 화질을 받아 소리만 꺼냄 (데이터 절약)
  const beginAudio = async (c, p) => {
    if (c.t === 'file') return toast('이 영상 파일은 소리만 따로 받을 수 없음 — 영상으로 받기');
    const src = c.u + '#audio';
    const old = (await DB.jobs().catch(() => [])).find(j => j.src === src);
    if (old) return toast(old.state === 'done' ? '이미 받은 소리입니다' : '이미 받는 중입니다');
    let target = c;
    if (p && p.master) {
      const withAudio = p.variants.find(v => v.audioUrl);
      target = withAudio ? { u: withAudio.audioUrl, t: 'hls', main: c.main } : { u: p.variants[p.variants.length - 1].u, t: 'hls', main: c.main };
    }
    const j = await newJob(target);
    if (j.map && !(p && p.master && p.variants.some(v => v.audioUrl))) throw new Error('이 영상은 소리만 따로 받을 수 없는 형식 — 영상으로 받기');
    if (!hasMux() && !j.map) throw new Error('변환기를 불러오지 못해 소리만 받을 수 없음');
    Object.assign(j, { src, audioOnly: true, h: 0 });
    start(j);
    toast('🎵 소리만 받기 시작');
  };
  // 받기 시작 (같은 영상을 다른 화질로 받던 중이면 그것은 취소하고 새로 시작)
  const begin = async (c, p, v) => {
    if (!(await roomFor(estimate(p, v)))) return;
    const old = (await DB.jobs().catch(() => [])).filter(j => j.src === c.u && !j.audioOnly);
    for (const o of old) {
      if (o.state === 'done') { if ((o.h || 0) === (v ? v.h : 0)) return toast('이미 받은 영상입니다'); continue; }
      if ((o.h || 0) === (v ? v.h : 0)) return toast('이미 받는 중입니다');
      await remove((running.get(o.id) || {}).j || o);
    }
    const j = await newJob(c, v);
    start(j);
    if (v && v.audioUrl) {
      toast('이 영상은 소리가 따로 있어 영상·소리 두 파일로 받습니다');
      const a = await newJob({ u: v.audioUrl, t: 'hls' });
      Object.assign(a, { name: j.name + ' (소리)', audioOnly: true, src: c.u + '#audio-pair' });
      start(a);
    } else toast(`${v && v.h ? v.h + 'p로 ' : ''}받기 시작 — 다 받으면 ${SS.dest === 'files' ? '파일 앱에 자동 저장' : '🎬 영상보기에 넣을 수 있습니다'}`);
  };

  // ================= 7. 이 페이지의 영상 찾기 =================
  const fromFrames = new Map();        // iframe 안 플레이어가 알려 준 주소
  const frameDurs = new Map();         // iframe별 재생한 영상 길이
  window.addEventListener('message', e => {
    const d = e.data;
    if (d && Array.isArray(d.kwMedia)) d.kwMedia.forEach(m => { if (m && typeof m.u === 'string' && /^https?:/.test(m.u)) fromFrames.set(m.u, m); });
    if (d && Array.isArray(d.kwDur)) frameDurs.set(e.source, d.kwDur.filter(x => typeof x === 'number'));
  });
  // 사용자가 재생한 영상의 길이 (이 페이지 + iframe 안)
  const watchedDurs = () => {
    const out = [];
    try { out.push(...JSON.parse(ROOT.dataset.kwDur || '[]')); } catch (e) {}
    frameDurs.forEach(a => out.push(...a));
    return out;
  };
  const sameLen = (a, b) => Math.abs(a - b) <= Math.max(3, b * 0.01);
  const parsed = new Map();            // 재생 목록 주소 → 읽은 결과 (Promise)
  const candidates = () => {
    const all = new Map();
    const add = (u, t, at, v) => {
      if (!u || !/^https?:/.test(u)) return;
      if (all.has(u)) { if (v) all.get(u).v = 1; } else all.set(u, { u, t, at: at || 0, v: v ? 1 : 0 });
    };
    try { JSON.parse(ROOT.dataset.kwMedia || '[]').forEach(m => add(m.u, m.t, m.at, m.v)); } catch (e) {}
    fromFrames.forEach(m => add(m.u, m.t, m.at, m.v));
    document.querySelectorAll('video, video source').forEach(v => {
      const s = v.currentSrc || v.src || '';
      if (s && !/^blob:/.test(s)) add(s, /m3u8/i.test(s) ? 'hls' : 'file', Date.now(), !v.paused || v.currentTime > 1);
    });
    try { performance.getEntriesByType('resource').forEach(r => { if (/\.m3u8([?#]|$)/i.test(r.name)) add(r.name, 'hls', r.startTime); }); } catch (e) {}
    return [...all.values()];
  };
  const inspect = c => {
    if (c.t !== 'hls') return Promise.resolve(null);
    if (!parsed.has(c.u)) parsed.set(c.u, getText(c.u).then(t => parseM3u8(t, c.u)).then(async p => {
      if (p.master && p.variants[0]) {     // 화질 목록이면 한 화질의 목록을 읽어 영상 길이를 알아 둠
        const v = await inspect({ u: p.variants[0].u, t: 'hls' });
        if (v && !v.error) { p.dur = v.dur; p.live = v.live; }
      }
      return p;
    }).catch(e => ({ error: e.message })));
    return parsed.get(c.u);
  };
  // 화면에 보여 줄 목록: 화질 목록(master)에 들어 있는 개별 화질 주소는 따로 보이지 않게
  const listing = async () => {
    const cs = candidates();
    const info = await Promise.all(cs.map(inspect));
    const inMaster = new Set();
    info.forEach(p => p && p.master && p.variants.forEach(v => { inMaster.add(v.u); if (v.audioUrl) inMaster.add(v.audioUrl); }));
    // 재생 목록 안의 조각·머리 파일(init.mp4, 조각 .mp4)은 따로 보이지 않게
    info.forEach(p => { if (p && p.segs) { p.segs.forEach(x => inMaster.add(x.u)); if (p.map) inMaster.add(p.map.u); } });
    const list = cs.map((c, i) => ({ c, p: info[i] })).filter(x => !inMaster.has(x.c.u))
      .sort((a, b) => (b.p && b.p.master ? 1 : 0) - (a.p && a.p.master ? 1 : 0) || b.c.at - a.c.at);
    // 지금 보는 영상 = 재생 중인 영상이 실제로 쓰는 주소, 또는 재생한 영상과 길이가 같은 재생 목록
    // (같은 페이지에서 함께 잡힌 다른 영상·미리보기·광고·이전 페이지 영상은 '다른 영상'으로 따로)
    const durs = watchedDurs();
    list.forEach(x => { x.main = !!x.c.v || (!!x.p && !!x.p.dur && durs.some(d => sameLen(x.p.dur, d))); });
    if (!list.some(x => x.main)) list.forEach(x => { x.main = true; });   // 판단할 정보가 없으면 모두 보여 줌
    list.forEach(x => { x.c.main = x.main; });
    return list;
  };
  const mainDuration = () => {
    const v = [...document.querySelectorAll('video')].sort((a, b) => b.videoWidth - a.videoWidth)[0];
    return v && isFinite(v.duration) ? v.duration : 0;
  };
  // ⬇ 한 번 누름 → 본 영상을 골라 기본 화질로 바로 받기
  // 본 영상 = 화질 목록(master)이 있는 것 > 길이가 가장 긴 재생 목록 > 영상 파일 (짧은 광고 영상은 뒤로)
  const bestOf = list => {
    const ok = list.filter(x => x.main && (!x.p || (!x.p.error && !x.p.live)));
    const len = x => (x.p && x.p.master ? mainDuration() || 1e6 : x.p ? x.p.dur : mainDuration());
    return ok.sort((a, b) => ((b.p && b.p.master ? 2 : b.p ? 1 : 0) - (a.p && a.p.master ? 2 : a.p ? 1 : 0)) ||
      ((len(b) >= 30) - (len(a) >= 30)) || (len(b) - len(a)))[0];
  };
  let picking = false;                 // ⬇를 누르고 영상을 고르는 중 (버튼에 '⬇ …')
  const oneTap = async () => {
    const js = await DB.jobs().catch(() => []);
    if (!SS.oneTap || js.some(j => j.page === location.href && /run|queue|pause|error/.test(j.state))) return openPanel();
    const b = document.getElementById('kw-save');
    picking = true;
    if (b) b.textContent = '⬇ …';
    const best = bestOf(await listing());
    if (!best) { picking = false; toast('받을 영상을 찾지 못함 → 영상을 먼저 재생한 뒤 다시 누르세요'); return openPanel(); }
    try { await begin(best.c, best.p, best.p && best.p.master ? pickVariant(best.p.variants) : null); }
    catch (e) { toast('받을 수 없음: ' + e.message); openPanel(); }
    picking = false;
    refresh();
  };

  // ================= 8. 화면 =================
  const MB = b => (b >= 1 << 30 ? (b / (1 << 30)).toFixed(2) + 'GB' : (b / (1 << 20)).toFixed(b < 10 << 20 ? 1 : 0) + 'MB');
  const fmtT = x => { x = Math.max(0, Math.round(x || 0)); const h = Math.floor(x / 3600), m = Math.floor(x / 60) % 60, s = String(x % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`; };
  const mk = (tag, css, ...kids) => { const e = document.createElement(tag); if (css) e.style.cssText = css; e.append(...kids.filter(k => k !== null && k !== undefined && k !== '')); return e; };
  const BTN = 'border:none;border-radius:9px;padding:7px 11px;font:600 13px -apple-system,sans-serif;color:#fff;background:#3a3a3c;';
  const btn = (txt, fn, bg) => { const b = mk('button', BTN + (bg ? 'background:' + bg + ';' : ''), txt); b.addEventListener('click', e => { e.stopPropagation(); fn(b); }); return b; };
  const H = txt => mk('div', 'font:700 15px -apple-system,sans-serif;margin:16px 0 2px', txt);
  const NOTE = 'color:#999;font-size:12px;line-height:1.5;margin-top:4px';
  const toast = msg => {
    let t = document.getElementById('kw-savetoast');
    if (!t) {
      t = mk('div', 'position:fixed;left:50%;top:70px;transform:translateX(-50%);z-index:2147483647;max-width:88vw;' +
        'background:rgba(0,0,0,.88);color:#fff;padding:9px 14px;border-radius:14px;font:14px -apple-system,sans-serif;text-align:center;');
      t.id = 'kw-savetoast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    clearTimeout(t._h); t._h = setTimeout(() => t.remove(), 4000);
  };

  // 저장: 조각을 한 파일로 묶어 Safari 다운로드로 넘김 → 설정한 다운로드 폴더(기본: 파일 앱 → 다운로드)
  const blobs = new Map();
  const prepare = j => {
    if (!blobs.has(j.id)) blobs.set(j.id, DB.parts(j.id).then(ps => new Blob(ps, { type: mime(j) })));
    return blobs.get(j.id);
  };
  const saveToFiles = async (j, auto) => {
    const blob = await prepare(j);
    const a = mk('a', 'display:none');
    a.href = URL.createObjectURL(blob);
    a.download = fileName(j);
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, CLEAN_MS);
    j.savedAt = Date.now();
    await save(j);
    toast(auto ? `저장 중: ${fileName(j)} — Safari가 물으면 "다운로드"` : '저장했습니다');
    refresh();
  };
  const share = async j => {
    const blob = await prepare(j);
    const f = new File([blob], fileName(j), { type: blob.type });
    if (!navigator.canShare || !navigator.canShare({ files: [f] })) return toast('이 기기에서는 공유로 저장할 수 없음 → "다시 저장" 사용');
    navigator.share({ files: [f], title: j.name }).catch(e => { if (e.name !== 'AbortError') toast('공유 실패: ' + e.message); });
  };

  let panel = null, lastSig = '';
  const showMore = { others: false, settings: false, again: false };   // 접힌 부분 (다른 영상, 설정)
  const jobLine = j => {
    const r = running.get(j.id);
    const speed = r && Date.now() - r.t0 > 1500 ? (j.bytes - r.b0) / ((Date.now() - r.t0) / 1000) : 0;
    const left = speed && j.kind === 'hls' && j.done ? (j.total - j.done) * (j.bytes / j.done) / speed : 0;
    if (j.state === 'done') {
      const mins = j.savedAt && SS.autoClean ? Math.max(1, Math.ceil((CLEAN_MS - (Date.now() - j.savedAt)) / 60000)) : 0;
      return `${j.savedAt ? '✓ 저장함' : SS.dest === 'library' ? '완료 — 🎬 영상보기에 넣으세요' : '완료'} · ${MB(j.bytes)}${j.dur ? ' · ' + fmtT(j.dur) : ''}${mins ? ` · 임시 파일 ${mins}분 뒤 자동 삭제` : ''}`;
    }
    if (j.state === 'error') return '⚠ ' + j.err;
    if (j.state === 'queue') return '차례 기다리는 중';
    return `${Math.floor(progress(j) * 100)}% · ${MB(j.bytes)}${speed ? ' · ' + MB(speed) + '/초' : ''}${left ? ' · 남은 시간 ' + fmtT(left) : ''}${j.state === 'pause' ? ' · 멈춤' : ''}`;
  };
  const jobView = j => {
    const bar = mk('div', 'height:4px;border-radius:2px;background:#444;margin:6px 0;overflow:hidden',
      mk('div', `height:100%;width:${Math.min(100, progress(j) * 100)}%;background:${j.state === 'done' ? '#30d158' : '#0a84ff'}`));
    bar.dataset.bar = j.id;
    const info = mk('div', 'color:#aaa;font-size:12px', jobLine(j));
    info.dataset.info = j.id;
    const acts = mk('div', 'display:flex;gap:6px;flex-wrap:wrap;margin-top:4px');
    if (j.state === 'done') {
      prepare(j);
      acts.append(btn('🎬 영상보기에 넣기', () => sendToLibrary([j]), SS.dest === 'library' ? '#0a84ff' : ''),
        btn(j.savedAt ? '💾 다시 저장' : '💾 파일 앱에 저장', () => saveToFiles(j), SS.dest === 'files' ? '#0a84ff' : ''), btn('공유', () => share(j)),
        btn('임시 파일 지우기', () => remove(j), '#5a1f1f'));
    } else {
      if (j.state !== 'queue') acts.append(j.state === 'run' ? btn('멈춤', () => pause(j)) : btn(j.state === 'error' ? '다시 시도' : '계속', () => start(j), '#0a84ff'));
      acts.append(btn('취소', () => remove(j), '#5a1f1f'));
    }
    return mk('div', 'padding:10px 0;border-top:1px solid #333', mk('div', 'font-weight:600;word-break:break-all', fileName(j) + (j.h ? ` · ${j.h}p` : '')), bar, info, acts);
  };
  const candView = ({ c, p }, jobs) => {
    const host = (() => { try { return new URL(c.u).hostname; } catch (e) { return ''; } })();
    const box = mk('div', 'padding:10px 0;border-top:1px solid #333');
    const acts = mk('div', 'display:flex;gap:6px;flex-wrap:wrap;margin-top:6px');
    const mine = jobs.filter(j => j.src === c.u && !j.audioOnly);
    const go = (v, label) => {
      const has = mine.find(j => (j.h || 0) === (v ? v.h : 0));
      return btn((has ? (has.state === 'done' ? '✓ ' : '⬇ ') : '') + label, async b => {
        b.disabled = true; b.textContent = '준비 중…';
        try { await begin(c, p, v); } catch (e) { toast('받을 수 없음: ' + e.message); }
        refresh(true);
      }, has ? '#1f4f2a' : '#0a84ff');
    };
    let kind;
    if (!p) { kind = '영상 파일'; acts.append(go(null, '받기')); }
    else if (p.error) { kind = '재생 목록 (읽기 실패: ' + p.error + ')'; acts.append(go(null, '그래도 받기')); }
    else if (p.master) {
      const def = pickVariant(p.variants);
      kind = '화질 선택 (★ = 기본 화질)';
      p.variants.forEach(v => {
        const est = estimate(p, v);
        acts.append(go(v, `${v === def ? '★ ' : ''}${v.h ? v.h + 'p' : MB(v.bw / 8) + '/초'}${est ? ' · 약 ' + MB(est) : ''}`));
      });
    } else if (p.live) kind = '실시간 방송 — 받을 수 없음';
    else { kind = `영상 ${fmtT(p.dur)} · 조각 ${p.segs.length}개${p.segs[0] && p.segs[0].k ? ' · 암호화' : ''}`; acts.append(go(null, '받기')); }
    if (p && !p.error && !p.live) {
      const has = jobs.find(j => j.src === c.u + '#audio');
      acts.append(btn((has ? (has.state === 'done' ? '✓ ' : '⬇ ') : '') + '🎵 소리만', async b => {
        b.disabled = true; b.textContent = '준비 중…';
        try { await beginAudio(c, p); } catch (e) { toast('받을 수 없음: ' + e.message); }
        refresh(true);
      }, has ? '#1f4f2a' : '#5e3a8c'));
    }
    box.append(mk('div', 'font-weight:600', kind), mk('div', 'color:#888;font-size:11px;word-break:break-all;margin-top:2px', host + ' · ' + c.u.split('?')[0].split('/').slice(-1)[0]), acts);
    return box;
  };
  // 설정 줄
  const toggle = (k, label, desc) => {
    const sw = mk('button', '');
    const paint = () => { sw.textContent = SS[k] ? '켜짐' : '꺼짐';
      sw.style.cssText = `min-width:58px;padding:6px 10px;border:none;border-radius:14px;font:600 13px -apple-system,sans-serif;color:#fff;background:${SS[k] ? '#30d158' : '#48484a'}`; };
    paint();
    sw.addEventListener('click', e => { e.stopPropagation(); SS[k] = !SS[k]; saveSet(); paint(); });
    return mk('div', 'display:flex;align-items:center;gap:12px;padding:8px 0;border-top:1px solid #333',
      mk('div', 'flex:1', mk('div', '', label), desc ? mk('div', 'color:#999;font-size:12px;margin-top:2px', desc) : null), sw);
  };
  const qualityRow = () => {
    const row = mk('div', 'display:flex;gap:6px;flex-wrap:wrap;margin-top:6px');
    [[0, '최고'], [1080, '1080p'], [720, '720p'], [480, '480p'], [360, '360p']].forEach(([q, t]) => {
      row.appendChild(btn((SS.quality === q ? '✓ ' : '') + t, () => { SS.quality = q; saveSet(); refresh(true); }, SS.quality === q ? '#0a84ff' : ''));
    });
    return mk('div', 'padding:8px 0;border-top:1px solid #333', mk('div', '', '기본 화질'),
      mk('div', 'color:#999;font-size:12px;margin-top:2px', '이 화질 이하에서 가장 좋은 것으로 받음 (없으면 가장 낮은 화질)'), row);
  };
  const destRow = () => {
    const row = mk('div', 'display:flex;gap:6px;flex-wrap:wrap;margin-top:6px');
    [['library', '🎬 영상보기 (Safari 안)'], ['files', '💾 파일 앱']].forEach(([d, t]) => {
      row.appendChild(btn((SS.dest === d ? '✓ ' : '') + t, () => { SS.dest = d; saveSet(); refresh(true); }, SS.dest === d ? '#0a84ff' : ''));
    });
    return mk('div', 'padding:8px 0;border-top:1px solid #333', mk('div', '', '저장할 곳'),
      mk('div', 'color:#999;font-size:12px;margin-top:2px', SS.dest === 'library'
        ? '영상보기: Safari 안 목록에서 바로 보기·이어 보기·길게 눌러 삭제/공유. Safari가 오래 안 연 사이트 데이터를 지울 수 있어, 오래 둘 영상은 영상보기에서 "파일 앱에 저장"'
        : '파일 앱: 설정한 다운로드 폴더에 영구 보관 (아래 📁 저장 폴더)'), row);
  };
  const guide = (title, lines) => {
    const body = mk('div', NOTE + ';display:none;padding:6px 0 0 4px', ...lines.flatMap(l => [l, mk('br')]));
    const b = btn(title, () => { body.style.display = body.style.display === 'none' ? 'block' : 'none'; });
    return mk('div', 'padding:8px 0;border-top:1px solid #333', b, body);
  };
  const storageLine = async () => {
    try { const e = await navigator.storage.estimate(); return `이 사이트 임시 공간: 사용 ${MB(e.usage || 0)} / 남은 공간 ${MB(Math.max(0, (e.quota || 0) - (e.usage || 0)))}`; } catch (e) { return ''; }
  };
  async function render(force) {
    if (!panel || !panel.isConnected) return;
    const [jobs, list] = await Promise.all([DB.jobs().catch(() => []), listing()]);
    const mine = jobs.map(j => (running.get(j.id) || {}).j || j).sort((a, b) => b.created - a.created);
    const sig = mine.map(j => j.id + j.state + (j.savedAt ? 's' : '')).join() + '|' + list.map(x => x.c.u + (x.p ? 1 : 0) + (x.main ? 'm' : '')).join() + JSON.stringify(showMore);
    if (!force && sig === lastSig) {        // 진행률만 바뀌었으면 글자·막대만 고침 (누르는 중인 버튼이 사라지지 않게)
      mine.forEach(j => {
        const i = panel.querySelector(`[data-info="${j.id}"]`), b = panel.querySelector(`[data-bar="${j.id}"] > div`);
        if (i) i.textContent = jobLine(j);
        if (b) b.style.width = Math.min(100, progress(j) * 100) + '%';
      });
      return;
    }
    lastSig = sig;
    const [sites, hist] = await Promise.all([gmJson('saveSites', {}), gmJson('saveHist', [])]);
    const others = Object.entries(sites).filter(([o]) => o !== location.origin);
    const otherBytes = others.reduce((a, [, v]) => a + (v.bytes || 0), 0);
    const histTotal = hist.reduce((a, h) => a + (h.size || 0), 0);
    const body = panel.querySelector('[data-body]');
    // 보여 줄 것만: 받는 중·손볼 것 / 지금 보는 영상 / (눌러야 보이는) 함께 잡힌 다른 영상 / 저장 끝난 것은 한 줄로
    const active = mine.filter(j => j.state !== 'done' || !j.savedAt);
    const saved = mine.filter(j => j.state === 'done' && j.savedAt);
    const got = new Set(mine.filter(j => j.state === 'done').map(j => j.src));
    const mainList = list.filter(x => x.main && !got.has(x.c.u)), otherList = list.filter(x => !x.main && !got.has(x.c.u));
    const gotMain = list.some(x => x.main && got.has(x.c.u));
    const fold = (key, title, kids) => {
      const b = btn((showMore[key] ? '▾ ' : '▸ ') + title, () => { showMore[key] = !showMore[key]; refresh(true); });
      return mk('div', 'padding:8px 0;border-top:1px solid #333', b, showMore[key] ? mk('div', '', ...kids) : null);
    };
    body.replaceChildren(
      active.length ? H('받는 중') : null,
      ...active.map(jobView),
      H('이 영상 받기 · 화질 고르기'),
      ...(mainList.length ? mainList.map(x => candView(x, mine)) :
        [mk('div', 'color:#999;padding:8px 0', gotMain ? '✓ 이 영상은 이미 받았습니다' : '영상을 찾지 못함 → 영상을 먼저 재생한 뒤 다시 여세요')]),
      gotMain ? fold('again', '다른 화질로 다시 받기', list.filter(x => x.main && got.has(x.c.u)).map(x => candView(x, mine))) : null,
      otherList.length ? fold('others', `이 페이지에서 함께 잡힌 다른 영상 ${otherList.length}개`, otherList.map(x => candView(x, mine))) : null,
      saved.length ? mk('div', 'display:flex;align-items:center;gap:8px;padding:10px 0;border-top:1px solid #333;color:#aaa;font-size:13px',
        mk('div', 'flex:1', `✓ 저장한 영상 ${saved.length}개 · 임시 파일은 곧 자동 삭제`),
        btn('지금 지우기', async () => { for (const j of saved) await remove(j); })) : null,
      fold('settings', '⚙ 받기 설정 · 정리', [
      H('설정 (모든 사이트)'),
      destRow(),
      qualityRow(),
      toggle('oneTap', '⬇ 한 번 누르면 바로 받기', '끄면 누를 때마다 화질을 고르는 화면이 열림'),
      toggle('autoSave', '다 받으면 자동 저장', 'Safari가 "다운로드할까요?"를 물으면 다운로드'),
      toggle('autoClean', '저장 후 임시 파일 자동 삭제', '저장하고 10분 뒤 Safari 안에 쌓인 조각을 지움 (폰 공간 확보)'),
      guide('📁 저장 폴더 지정하기', [
        'iPhone 설정 → Apps → Safari → Downloads 에서 폴더를 고릅니다.',
        '· On My iPhone 안의 폴더를 권장 (예: On My iPhone → 영상). iCloud Drive를 고르면 영상이 iCloud로 올라가 데이터·용량을 씁니다.',
        '· 같은 화면의 Remove Download List Items → Upon Successful Download 로 두면 Safari 다운로드 목록도 자동으로 비워집니다.',
        '(웹페이지는 폴더를 직접 바꿀 수 없어 iPhone 설정에서 한 번만 지정합니다)']),
      H('정리'),
      mk('div', 'display:flex;gap:6px;flex-wrap:wrap;padding-top:6px',
        btn('🧹 임시 파일 모두 지우기', () => cleanAll(), '#5a1f1f'),
        btn('🗑 받은 영상 모두 삭제', () => { location.href = 'shortcuts://run-shortcut?name=' + encodeURIComponent(SHORTCUT); }, '#5a1f1f'),
        hist.length ? btn('받은 기록 비우기', () => { gmSetV('saveHist', '[]'); refresh(true); }) : null),
      mk('div', NOTE, await storageLine(),
        others.length ? mk('br') : null,
        others.length ? `다른 사이트 ${others.length}곳에 임시 파일 ${MB(otherBytes)} — '모두 지우기'를 누른 뒤 그 사이트를 열면 자동으로 지워짐. 바로 다 지우려면 iPhone 설정 → Apps → Safari → Advanced → Website Data` : null,
        noBlob ? mk('br') : null,
        noBlob ? '개인정보 보호 브라우징 중: 큰 영상은 메모리가 부족할 수 있음 → 일반 탭에서 받기 권장' : null),
      guide('🗑 "받은 영상 모두 삭제" 처음 한 번 준비하기', [
        '웹페이지는 파일 앱의 파일을 직접 지울 수 없어서 iPhone 단축어(Shortcuts)로 지웁니다. 한 번만 만들면 됩니다:',
        `1. Shortcuts 앱 → + → 이름을 "${SHORTCUT}"로`,
        '2. Get Contents of Folder 추가 → 폴더: 위에서 지정한 저장 폴더',
        '3. Filter Files 추가 → File Extension is mp4 (Any of: mp4, m4a, ts)',
        '4. Delete Files 추가 (Confirm Before Deleting은 켜 두면 안전)',
        '이후 이 버튼을 누르면 단축어가 실행되어 저장 폴더의 영상이 모두 지워집니다.']),
      hist.length ? H(`받은 기록 ${hist.length}개 · ${MB(histTotal)}`) : null,
      ...hist.slice(0, 8).map(h => mk('div', 'color:#aaa;font-size:12px;padding:3px 0;word-break:break-all',
        `${new Date(h.at).toLocaleDateString()} · ${h.name} · ${MB(h.size || 0)} · ${h.site}`))].filter(Boolean)),
      mk('div', NOTE + ';margin-top:12px', '받는 동안 이 페이지를 열어 두세요 (화면은 자동으로 켜져 있음). 중간에 닫혀도 다시 오면 이어받습니다.'));
  }
  const refresh = force => { render(force); updateButton(); };
  const openPanel = () => {
    if (panel && panel.isConnected) return;
    const sheet = mk('div', 'position:absolute;left:0;right:0;bottom:0;max-height:85vh;overflow:auto;background:#1c1c1e;color:#fff;' +
      'border-radius:16px 16px 0 0;padding:14px 16px calc(16px + env(safe-area-inset-bottom));font:14px -apple-system,sans-serif;text-align:left;',
      mk('div', 'display:flex;align-items:center;gap:6px', mk('div', 'flex:1;font:700 18px -apple-system,sans-serif', '⬇ 영상 받기'),
        btn('🎬 영상보기', () => window.open(LIB, '_blank')), btn('닫기', () => panel.remove())));
    const body = mk('div', '');
    body.dataset.body = '1';
    sheet.appendChild(body);
    panel = mk('div', 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.55);', sheet);
    panel.id = 'kw-savepanel';
    parsed.forEach((p, u) => p.then(r => { if (r && r.error) parsed.delete(u); }));   // 읽기 실패했던 목록은 다시 시도
    panel.addEventListener('click', e => { if (e.target === panel) panel.remove(); });
    document.body.appendChild(panel);
    lastSig = '';
    refresh(true);
  };
  document.addEventListener('kw-open-save', openPanel);   // web-main ⚙ 설정의 '영상 받기' 줄

  // ⬇ 버튼: 영상이 있는 페이지에만. web-main이 영상 아래 버튼 줄로 옮김 (없으면 오른쪽 아래)
  // 한 번 누름 = 기본 화질로 바로 받기 · 받는 중에 누름(또는 길게 누름) = 받기 화면
  const updateButton = () => {
    if (!document.body) return;
    let b = document.getElementById('kw-save');
    const busy = [...running.values()].map(r => r.j);
    const show = busy.length || pendingN || document.querySelector('video') || candidates().length;
    if (!show) { if (b) b.remove(); return; }
    if (!b) {
      b = mk('button', 'position:fixed;right:6px;bottom:calc(120px + env(safe-area-inset-bottom));z-index:2147483647;' +
        'background:rgba(0,0,0,.55);color:#fff;border:none;border-radius:10px;padding:3px 9px;font:600 12px -apple-system,sans-serif;');
      b.id = 'kw-save';
      let pressT = 0, long = false;
      b.addEventListener('touchstart', () => { long = false; pressT = setTimeout(() => { long = true; openPanel(); }, 550); }, { passive: true });
      b.addEventListener('touchend', () => clearTimeout(pressT), { passive: true });
      b.addEventListener('click', e => { e.stopPropagation(); if (long) { long = false; return; } if (running.size) openPanel(); else if (pendingN) sendToLibrary(); else oneTap(); });
      document.body.appendChild(b);
    }
    if (picking) return;
    const j = busy[0];
    const t = j ? `⬇ ${Math.floor(progress(j) * 100)}%` : pendingN ? `🎬 ${pendingN}` : '⬇';
    if (b.textContent !== t) b.textContent = t;
  };
  // 1초마다: 버튼·화면 갱신, 다 받은 영상 자동 저장·정리 (10초마다), 작동 상태 (web-main ⚙): <html data-kw-save>
  let tick = 0;
  setInterval(() => {
    updateButton();
    if (panel && panel.isConnected) render();
    if (++tick % 10 === 0) afterDone();
    const st = JSON.stringify({ found: candidates().length, active: running.size, mux: !!hasMux() });
    if (ROOT.dataset.kwSave !== st) ROOT.dataset.kwSave = st;
  }, 1000);

  // 페이지를 열면: 설정 읽기 → 정리 → 받던 작업(멈추지 않고 끊긴 것) 이어받기 → 저장 안 한 완료 영상 저장
  ready.then(tidyUp).then(() => DB.jobs()).then(js => {
    const run = js.filter(j => j.state === 'run');
    run.forEach(j => { j.state = 'queue'; });
    return Promise.all(run.map(save));
  }).then(startNext).then(afterDone).catch(() => {});
})();

// ==UserScript==
// @name         Web Save
// @namespace    https://github.com/theXresearch/safari-userscripts
// @version      2026.11.12.1
// @author       theXresearch
// @updateURL    https://raw.githubusercontent.com/theXresearch/safari-userscripts/main/src/web-save.meta.js
// @downloadURL  https://raw.githubusercontent.com/theXresearch/safari-userscripts/main/src/web-save.user.js
// @description  일반 사이트 영상 내려받기 (데이터 없이 나중에 보기): ⬇ 버튼 → M3U8(HLS)·MP4 영상을 화질 골라 받기, 암호화(AES-128) 해독, MP4로 변환, 이어받기(페이지를 다시 열면 계속), 받는 동안 화면 켜짐 유지, 파일 앱·사진 앱에 저장
// @match        *://*/*
// @exclude      *://*.youtube.com/*
// @run-at       document-end
// @noframes
// @grant        GM.xmlHttpRequest
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
  const cleanName = s => (s || 'video').replace(/[\\/:*?"<>|\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'video';
  const ext = j => (j.fmt === 'ts' ? '.ts' : j.audioOnly ? '.m4a' : '.mp4');
  const fileName = j => j.name + ext(j);
  const save = j => (j.removed ? Promise.resolve() : DB.putJob(Object.assign({}, j)).catch(() => {}));

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
    const transmux = u8 => {
      if (!tm) {
        tm = new (Muxer())({ remux: true, baseMediaDecodeTime: Math.round(startSec * 90000) });
        tm.on('data', s => out.push(s));
      }
      out = [];
      tm.push(u8); tm.flush();
      return out;
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
        if (!j.fmt) j.fmt = data[0] === 0x47 ? (hasMux() ? 'tsmux' : 'ts') : 'mp4';   // 0x47 = TS 조각
        let blob;
        if (j.fmt === 'tsmux') {
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

  const start = async j => {
    if (running.has(j.id)) return;
    j.state = 'run'; j.err = '';
    running.set(j.id, { j, t0: Date.now(), b0: j.bytes });
    wake(true);
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
    await save(j);
    try {
      if (j.kind === 'hls') await runHls(j); else await runFile(j);
      if (j.state === 'done') toast(`받기 완료: ${j.name} — ⬇에서 저장하세요`);
    } catch (e) {
      if (j.state === 'run') { j.state = 'error'; j.err = e.message || String(e); }
    }
    running.delete(j.id);
    if (!running.size) wake(false);
    await save(j);
    refresh();
  };
  const pause = j => { j.state = 'pause'; save(j); refresh(); };
  const remove = async j => {
    j.state = 'pause'; j.removed = true;
    running.delete(j.id);
    blobs.delete(j.id);
    await DB.delParts(j.id).catch(() => {});
    await DB.delJob(j.id).catch(() => {});
    refresh();
  };

  // 화질을 고르면 작업을 만듦
  const newJob = async (c, v) => {
    const title = cleanName(document.title.replace(/\s*[-|–].{0,40}$/, '')) || location.hostname;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const base = { id, page: location.href, created: Date.now(), done: 0, bytes: 0, state: 'pause', net: 'page' };
    if (c.t === 'file') return Object.assign(base, { kind: 'file', url: c.u, name: title });
    const url = v ? v.u : c.u;
    const pl = parseM3u8(await getText(url, base), url);
    if (pl.master) throw new Error('재생 목록 구조가 예상과 다름');
    if (pl.live) throw new Error('실시간 방송은 받을 수 없음 (끝이 정해진 영상만)');
    if (!pl.segs.length) throw new Error('영상 조각이 없음');
    return Object.assign(base, { kind: 'hls', url, name: title + (v && v.h ? ` ${v.h}p` : ''), segs: pl.segs, map: pl.map, dur: pl.dur, total: pl.segs.length });
  };

  // ================= 7. 이 페이지의 영상 찾기 =================
  const fromFrames = new Map();        // iframe 안 플레이어가 알려 준 주소
  window.addEventListener('message', e => {
    const d = e.data;
    if (d && Array.isArray(d.kwMedia)) d.kwMedia.forEach(m => { if (m && typeof m.u === 'string' && /^https?:/.test(m.u)) fromFrames.set(m.u, m); });
  });
  const parsed = new Map();            // 재생 목록 주소 → 읽은 결과 (Promise)
  const candidates = () => {
    const all = new Map();
    const add = (u, t, at) => { if (u && /^https?:/.test(u) && !all.has(u)) all.set(u, { u, t, at: at || 0 }); };
    try { JSON.parse(ROOT.dataset.kwMedia || '[]').forEach(m => add(m.u, m.t, m.at)); } catch (e) {}
    fromFrames.forEach(m => add(m.u, m.t, m.at));
    document.querySelectorAll('video, video source').forEach(v => {
      const s = v.currentSrc || v.src || '';
      if (s && !/^blob:/.test(s)) add(s, /m3u8/i.test(s) ? 'hls' : 'file', Date.now());
    });
    try { performance.getEntriesByType('resource').forEach(r => { if (/\.m3u8([?#]|$)/i.test(r.name)) add(r.name, 'hls', r.startTime); }); } catch (e) {}
    return [...all.values()];
  };
  const inspect = c => {
    if (c.t !== 'hls') return Promise.resolve(null);
    if (!parsed.has(c.u)) parsed.set(c.u, getText(c.u).then(t => parseM3u8(t, c.u)).catch(e => ({ error: e.message })));
    return parsed.get(c.u);
  };
  // 화면에 보여 줄 목록: 화질 목록(master)에 들어 있는 개별 화질 주소는 따로 보이지 않게
  const listing = async () => {
    const cs = candidates();
    const info = await Promise.all(cs.map(inspect));
    const inMaster = new Set();
    info.forEach(p => p && p.master && p.variants.forEach(v => { inMaster.add(v.u); if (v.audioUrl) inMaster.add(v.audioUrl); }));
    return cs.map((c, i) => ({ c, p: info[i] })).filter(x => !inMaster.has(x.c.u))
      .sort((a, b) => (b.p && b.p.master ? 1 : 0) - (a.p && a.p.master ? 1 : 0) || b.c.at - a.c.at);
  };
  const mainDuration = () => {
    const v = [...document.querySelectorAll('video')].sort((a, b) => b.videoWidth - a.videoWidth)[0];
    return v && isFinite(v.duration) ? v.duration : 0;
  };

  // ================= 8. 화면 =================
  const MB = b => (b >= 1 << 30 ? (b / (1 << 30)).toFixed(2) + 'GB' : (b / (1 << 20)).toFixed(b < 10 << 20 ? 1 : 0) + 'MB');
  const fmtT = x => { x = Math.max(0, Math.round(x || 0)); const h = Math.floor(x / 3600), m = Math.floor(x / 60) % 60, s = String(x % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`; };
  const mk = (tag, css, ...kids) => { const e = document.createElement(tag); if (css) e.style.cssText = css; e.append(...kids.filter(k => k !== null && k !== undefined)); return e; };
  const BTN = 'border:none;border-radius:9px;padding:7px 11px;font:600 13px -apple-system,sans-serif;color:#fff;background:#3a3a3c;';
  const btn = (txt, fn, bg) => { const b = mk('button', BTN + (bg ? 'background:' + bg + ';' : ''), txt); b.addEventListener('click', e => { e.stopPropagation(); fn(b); }); return b; };
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

  // 다 받은 영상: 저장 버튼을 누르는 순간 바로 쓸 수 있게 묶은 파일을 미리 준비 (공유는 누른 직후에만 허용됨)
  const blobs = new Map();
  const prepare = j => {
    if (!blobs.has(j.id)) blobs.set(j.id, DB.parts(j.id).then(ps => new Blob(ps, { type: j.fmt === 'ts' ? 'video/mp2t' : 'video/mp4' })));
    return blobs.get(j.id);
  };
  const saveToFiles = async j => {
    const blob = await prepare(j);
    const a = mk('a', 'display:none');
    a.href = URL.createObjectURL(blob);
    a.download = fileName(j);
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 600000);   // 저장이 끝날 때까지 넉넉히
    toast('"다운로드" 를 누르면 파일 앱 → 다운로드 폴더에 저장됩니다');
  };
  const share = async j => {
    const blob = await prepare(j);
    const f = new File([blob], fileName(j), { type: blob.type });
    if (!navigator.canShare || !navigator.canShare({ files: [f] })) return toast('이 기기에서는 공유로 저장할 수 없음 → "파일에 저장" 사용');
    navigator.share({ files: [f], title: j.name }).catch(e => { if (e.name !== 'AbortError') toast('공유 실패: ' + e.message); });
  };

  let panel = null, lastSig = '';
  const jobView = (j, live) => {
    const r = running.get(j.id);
    const pct = j.kind === 'hls' ? j.done / j.total : (j.total ? j.bytes / j.total : 0);
    const speed = r && Date.now() - r.t0 > 1500 ? (j.bytes - r.b0) / ((Date.now() - r.t0) / 1000) : 0;
    const left = speed && j.kind === 'hls' && j.done ? (j.total - j.done) * (j.bytes / j.done) / speed : 0;
    const line = j.state === 'done' ? `완료 · ${MB(j.bytes)}${j.dur ? ' · ' + fmtT(j.dur) : ''}` :
      j.state === 'error' ? '⚠ ' + j.err :
      `${Math.floor(pct * 100)}% · ${MB(j.bytes)}${speed ? ' · ' + MB(speed) + '/초' : ''}${left ? ' · 남은 시간 ' + fmtT(left) : ''}${j.state === 'pause' ? ' · 멈춤' : ''}`;
    if (live) return line;
    const bar = mk('div', 'height:4px;border-radius:2px;background:#444;margin:6px 0;overflow:hidden',
      mk('div', `height:100%;width:${Math.min(100, pct * 100)}%;background:${j.state === 'done' ? '#30d158' : '#0a84ff'}`));
    bar.dataset.bar = j.id;
    const info = mk('div', 'color:#aaa;font-size:12px', line);
    info.dataset.info = j.id;
    const acts = mk('div', 'display:flex;gap:6px;flex-wrap:wrap;margin-top:4px');
    if (j.state === 'done') {
      prepare(j);
      acts.append(btn('파일에 저장', () => saveToFiles(j), '#0a84ff'), btn('공유 (사진 앱 등)', () => share(j)),
        btn('지우기', () => remove(j), '#5a1f1f'));
    } else {
      acts.append(j.state === 'run' ? btn('멈춤', () => pause(j)) : btn(j.state === 'error' ? '다시 시도' : '계속', () => start(j), '#0a84ff'),
        btn('취소', () => remove(j), '#5a1f1f'));
    }
    return mk('div', 'padding:10px 0;border-top:1px solid #333', mk('div', 'font-weight:600;word-break:break-all', fileName(j)), bar, info, acts);
  };
  const candView = ({ c, p }) => {
    const host = (() => { try { return new URL(c.u).hostname; } catch (e) { return ''; } })();
    const box = mk('div', 'padding:10px 0;border-top:1px solid #333');
    const acts = mk('div', 'display:flex;gap:6px;flex-wrap:wrap;margin-top:6px');
    const go = (v, label) => btn(label, async b => {
      b.disabled = true; b.textContent = '준비 중…';
      try {
        const j = await newJob(c, v);
        if (v && v.audioUrl) toast('이 영상은 소리가 따로 있어 영상·소리 두 파일로 받습니다');
        start(j);
        if (v && v.audioUrl) {
          const a = await newJob({ u: v.audioUrl, t: 'hls' });
          a.name = j.name + ' (소리)'; a.audioOnly = true;
          start(a);
        }
      } catch (e) { toast('받을 수 없음: ' + e.message); }
      refresh(true);
    }, '#0a84ff');
    const dur = (p && !p.master && p.dur) || mainDuration();
    let kind;
    if (!p) { kind = '영상 파일'; acts.append(go(null, '받기')); }
    else if (p.error) { kind = '재생 목록 (읽기 실패: ' + p.error + ')'; acts.append(go(null, '그래도 받기')); }
    else if (p.master) {
      kind = '화질 선택';
      p.variants.forEach(v => acts.append(go(v, `${v.h ? v.h + 'p' : MB(v.bw / 8) + '/초'}${v.bw && dur ? ' · 약 ' + MB(v.bw * dur / 8) : ''}`)));
    } else if (p.live) kind = '실시간 방송 — 받을 수 없음';
    else { kind = `영상 ${fmtT(p.dur)} · 조각 ${p.segs.length}개${p.segs[0] && p.segs[0].k ? ' · 암호화' : ''}`; acts.append(go(null, '받기')); }
    box.append(mk('div', 'font-weight:600', kind), mk('div', 'color:#888;font-size:11px;word-break:break-all;margin-top:2px', host + ' · ' + c.u.split('?')[0].split('/').slice(-1)[0]), acts);
    return box;
  };
  const storageLine = async () => {
    try { const e = await navigator.storage.estimate(); return `저장 공간: 사용 ${MB(e.usage || 0)} / 사용 가능 ${MB(Math.max(0, (e.quota || 0) - (e.usage || 0)))}`; } catch (e) { return ''; }
  };
  async function render(force) {
    if (!panel || !panel.isConnected) return;
    const [jobs, list] = await Promise.all([DB.jobs().catch(() => []), listing()]);
    const mine = jobs.map(j => (running.get(j.id) || {}).j || j).sort((a, b) => b.created - a.created);
    const sig = mine.map(j => j.id + j.state).join() + '|' + list.map(x => x.c.u + (x.p ? 1 : 0)).join();
    if (!force && sig === lastSig) {        // 진행률만 바뀌었으면 글자·막대만 고침 (누르는 중인 버튼이 사라지지 않게)
      mine.forEach(j => {
        const i = panel.querySelector(`[data-info="${j.id}"]`), b = panel.querySelector(`[data-bar="${j.id}"] > div`);
        if (i) i.textContent = jobView(j, true);
        if (b) b.style.width = Math.min(100, (j.kind === 'hls' ? j.done / j.total : j.total ? j.bytes / j.total : 0) * 100) + '%';
      });
      return;
    }
    lastSig = sig;
    const body = panel.querySelector('[data-body]');
    body.replaceChildren(
      mk('div', 'font:700 15px -apple-system,sans-serif;margin:6px 0 2px', '이 페이지의 영상'),
      ...(list.length ? list.map(candView) : [mk('div', 'color:#999;padding:8px 0', '영상을 찾지 못함 → 영상을 먼저 재생한 뒤 다시 여세요')]),
      mk('div', 'font:700 15px -apple-system,sans-serif;margin:16px 0 2px', '받기 목록 (이 사이트)'),
      ...(mine.length ? mine.map(j => jobView(j)) : [mk('div', 'color:#999;padding:8px 0', '없음')]),
      mk('div', 'color:#999;font-size:12px;margin-top:12px;line-height:1.5',
        '· 받는 동안 이 페이지를 열어 두세요 (화면은 자동으로 켜져 있음). 중간에 닫혀도 다시 오면 "계속"으로 이어받기', mk('br'),
        '· 저장한 파일은 파일 앱 → 다운로드에서 데이터 없이 볼 수 있음. 저장 후 "지우기"로 공간 정리', mk('br'),
        noBlob ? '· 개인정보 보호 브라우징 중: 큰 영상은 메모리가 부족할 수 있음 → 일반 탭에서 받기 권장' : '', noBlob ? mk('br') : null,
        await storageLine()));
  }
  const refresh = force => { render(force); updateButton(); };
  const openPanel = () => {
    if (panel && panel.isConnected) return;
    const sheet = mk('div', 'position:absolute;left:0;right:0;bottom:0;max-height:85vh;overflow:auto;background:#1c1c1e;color:#fff;' +
      'border-radius:16px 16px 0 0;padding:14px 16px calc(16px + env(safe-area-inset-bottom));font:14px -apple-system,sans-serif;text-align:left;',
      mk('div', 'display:flex;align-items:center', mk('div', 'flex:1;font:700 18px -apple-system,sans-serif', '⬇ 영상 받기'), btn('닫기', () => panel.remove())));
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
  const updateButton = () => {
    if (!document.body) return;
    let b = document.getElementById('kw-save');
    const busy = [...running.values()].map(r => r.j);
    const show = busy.length || document.querySelector('video') || candidates().length;
    if (!show) { if (b) b.remove(); return; }
    if (!b) {
      b = mk('button', 'position:fixed;right:6px;bottom:calc(120px + env(safe-area-inset-bottom));z-index:2147483647;' +
        'background:rgba(0,0,0,.55);color:#fff;border:none;border-radius:10px;padding:3px 9px;font:600 12px -apple-system,sans-serif;');
      b.id = 'kw-save';
      b.addEventListener('click', e => { e.stopPropagation(); openPanel(); });
      document.body.appendChild(b);
    }
    const j = busy[0];
    const t = j ? `⬇ ${Math.floor((j.kind === 'hls' ? j.done / j.total : j.total ? j.bytes / j.total : 0) * 100)}%` : '⬇';
    if (b.textContent !== t) b.textContent = t;
  };
  // 작동 상태 (web-main ⚙에 표시): <html data-kw-save>
  setInterval(() => {
    updateButton();
    if (panel && panel.isConnected) render();
    const st = JSON.stringify({ found: candidates().length, active: running.size, mux: !!hasMux() });
    if (ROOT.dataset.kwSave !== st) ROOT.dataset.kwSave = st;
  }, 1000);

  // 페이지를 다시 열면, 받던 작업(멈추지 않고 끊긴 것)을 자동으로 이어받기
  DB.jobs().then(js => js.forEach(j => { if (j.state === 'run') start(j); })).catch(() => {});
})();

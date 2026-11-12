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

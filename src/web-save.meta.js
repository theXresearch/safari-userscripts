// ==UserScript==
// @name         Web Save
// @namespace    https://github.com/theXresearch/safari-userscripts
// @version      2026.11.12.7
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

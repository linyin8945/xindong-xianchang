/* 《心动现场》 v1.2.0

作者：linyin8945



本版：



全屏铺满



顶栏返回键保留



右上角恋综设置



沉浸模式 / 记忆融合模式



创建档案后才确定本季嘉宾



嘉宾候选池读取 Roche 角色



嘉宾详情 + 关系



私信独立页面



观察室



心动小屋地图



玩法入口



档案彼此独立
*/

(() => {
"use strict";

const PLUGIN_ID = "xindong-xianchang";
const APP_ID = "xindong-xianchang-home";
const STYLE_ID = "xindong-xianchang-style";

const state = {
roche: null,
container: null,

activeTab: "show",
page: "tab",
stack: [],

user: null,

// Roche 中所有角色：只作为“创建恋综时”的候选池
candidateCharacters: [],

// 当前档案真正选中的嘉宾
characters: [],

archives: [],
currentArchive: null,

listeners: []

};

/* =========================================================
基础工具
========================================================= */

const esc = (value) =>
String(value ?? "")
.replace(/&/g, "&")
.replace(/</g, "<")
.replace(/>/g, ">")
.replace(/"/g, """)
.replace(/'/g, "'");

const uid = () =>
globalThis.crypto?.randomUUID
? crypto.randomUUID()
: xd-${Date.now()}-${Math.random().toString(16).slice(2)};

const nameOf = (item, fallback = "未命名") =>
item?.name || item?.handle || fallback;

const handleOf = (item) =>
item?.handle ? @${item.handle} : "";

const avatarOf = (item) =>
item?.avatar || "";

async function storageGet(key, fallback = null) {
try {
const value = await state.roche.storage.get(key);
return value ?? fallback;
} catch {
return fallback;
}
}

async function storageSet(key, value) {
try {
await state.roche.storage.set(key, value);
} catch (error) {
console.error("[心动现场] storage.set", error);
}
}

async function storageDelete(key) {
try {
await state.roche.storage.delete(key);
} catch {}
}

function toast(message) {
try {
state.roche.ui.toast(message);
} catch {
console.log("[心动现场]", message);
}
}

function clearListeners() {
state.listeners.forEach((fn) => {
try {
fn();
} catch {}
});

state.listeners = [];

}

function listen(element, event, handler) {
if (!element) return;

element.addEventListener(event, handler);

state.listeners.push(() => {
  try {
    element.removeEventListener(event, handler);
  } catch {}
});

}

/* =========================================================
样式
========================================================= */

function injectStyle() {
if (document.getElementById(STYLE_ID)) return;

const style = document.createElement("style");
style.id = STYLE_ID;

style.textContent = `
  .roche-plugin-xindong-xianchang,
  .roche-plugin-xindong-xianchang * {
    box-sizing: border-box;
  }

  .roche-plugin-xindong-xianchang {
    --xd-bg:#f6f1f1;
    --xd-paper:rgba(255,255,255,.82);
    --xd-paper-strong:#fffafa;
    --xd-pink:#b88791;
    --xd-pink-dark:#855d67;
    --xd-pink-soft:#ead9dc;
    --xd-pink-faint:#f1e5e6;
    --xd-text:#41383a;
    --xd-muted:#8e8183;
    --xd-line:rgba(117,91,97,.13);
    --xd-shadow:0 14px 40px rgba(102,73,80,.08);

    position:relative;
    width:100%;
    height:100%;
    min-height:100%;
    max-height:none;

    overflow:hidden;

    background:
      radial-gradient(
        circle at 92% 7%,
        rgba(210,169,176,.18),
        transparent 30%
      ),
      radial-gradient(
        circle at 7% 75%,
        rgba(222,191,196,.18),
        transparent 28%
      ),
      linear-gradient(
        145deg,
        #f8f4f3 0%,
        #f3eded 48%,
        #f7f1f1 100%
      );

    color:var(--xd-text);

    font-family:
      -apple-system,
      BlinkMacSystemFont,
      "SF Pro Display",
      "SF Pro Text",
      "Helvetica Neue",
      Arial,
      sans-serif;

    -webkit-font-smoothing:antialiased;

    display:flex;
    flex-direction:column;

    /* 关键：不再给插件自己留下上下额外空白 */
    margin:0 !important;
    padding:0 !important;
  }

  .roche-plugin-xindong-xianchang button,
  .roche-plugin-xindong-xianchang input,
  .roche-plugin-xindong-xianchang textarea {
    font:inherit;
  }

  /* =====================================================
     顶栏
     ===================================================== */

  .xd-topbar {
    flex:0 0 72px;
    height:72px;

    padding:12px 14px 8px;

    display:flex;
    align-items:flex-end;
    gap:10px;

    background:rgba(249,246,245,.78);

    border-bottom:1px solid var(--xd-line);

    backdrop-filter:blur(22px) saturate(125%);
    -webkit-backdrop-filter:blur(22px) saturate(125%);

    position:relative;
    z-index:20;
  }

  .xd-back,
  .xd-settings {
    width:40px;
    height:40px;
    flex:0 0 40px;

    border:0;
    border-radius:14px;

    background:rgba(255,255,255,.64);

    color:var(--xd-pink-dark);

    display:grid;
    place-items:center;

    cursor:pointer;

    box-shadow:
      0 4px 18px rgba(101,73,80,.06);

    transition:.16s ease;
  }

  .xd-back {
    font-size:25px;
    line-height:1;
  }

  .xd-settings {
    font-size:17px;
  }

  .xd-back:active,
  .xd-settings:active {
    transform:scale(.94);
  }

  .xd-heading {
    min-width:0;
    flex:1;
    padding-bottom:2px;
  }

  .xd-eyebrow {
    font-size:10px;
    letter-spacing:.18em;
    color:var(--xd-pink);
    font-weight:700;
    margin-bottom:2px;
  }

  .xd-title {
    font-size:21px;
    line-height:1.15;
    letter-spacing:-.03em;
    font-weight:760;
    color:#403638;

    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
  }

  .xd-topday {
    flex:0 0 auto;

    padding:8px 11px;

    border-radius:13px;

    background:rgba(255,255,255,.65);

    border:1px solid rgba(145,110,118,.10);

    text-align:right;

    margin-bottom:1px;
  }

  .xd-topday-main {
    display:block;

    font-size:11px;
    font-weight:750;
    letter-spacing:.08em;

    color:var(--xd-pink-dark);
  }

  .xd-topday-sub {
    display:block;

    margin-top:2px;

    font-size:9px;

    color:var(--xd-muted);

    letter-spacing:.12em;
  }

  /* =====================================================
     内容
     ===================================================== */

  .xd-content {
    flex:1 1 auto;

    min-height:0;

    overflow:hidden;

    position:relative;
  }

  .xd-page {
    width:100%;
    height:100%;

    overflow-y:auto;

    padding:
      18px
      16px
      105px;

    scrollbar-width:none;
  }

  .xd-page::-webkit-scrollbar {
    display:none;
  }

  /* =====================================================
     底栏
     ===================================================== */

  .xd-bottom {
    flex:0 0 82px;

    height:82px;

    padding:8px 10px 15px;

    display:grid;

    grid-template-columns:
      repeat(4,1fr);

    gap:5px;

    background:rgba(250,247,246,.88);

    border-top:1px solid var(--xd-line);

    backdrop-filter:
      blur(22px)
      saturate(125%);

    -webkit-backdrop-filter:
      blur(22px)
      saturate(125%);

    position:relative;

    z-index:20;
  }

  .xd-tab {
    border:0;
    background:transparent;

    color:#a09597;

    border-radius:16px;

    cursor:pointer;

    display:flex;

    flex-direction:column;

    align-items:center;

    justify-content:center;

    gap:4px;

    transition:.18s ease;
  }

  .xd-tab-icon {
    width:29px;
    height:29px;

    border-radius:11px;

    display:grid;
    place-items:center;

    font-size:16px;

    transition:.18s ease;
  }

  .xd-tab-label {
    font-size:10px;

    font-weight:650;

    letter-spacing:.03em;
  }

  .xd-tab.active {
    color:var(--xd-pink-dark);
  }

  .xd-tab.active .xd-tab-icon {
    background:var(--xd-pink-faint);

    box-shadow:
      inset 0 0 0 1px
      rgba(184,135,145,.10);

    transform:translateY(-1px);
  }

  /* =====================================================
     公共
     ===================================================== */

  .xd-kicker {
    color:var(--xd-pink);

    font-size:10px;

    letter-spacing:.18em;

    font-weight:750;

    text-transform:uppercase;
  }

  .xd-section-head {
    display:flex;

    align-items:flex-end;

    justify-content:space-between;

    gap:12px;

    margin:
      22px 2px 10px;
  }

  .xd-section-title {
    font-size:17px;

    font-weight:780;

    letter-spacing:-.025em;
  }

  .xd-section-note {
    font-size:10px;

    color:var(--xd-muted);
  }

  .xd-card-grid {
    display:grid;
    gap:11px;
  }

  /* =====================================================
     Hero
     ===================================================== */

  .xd-hero {
    margin-top:7px;

    padding:
      22px 20px 20px;

    border-radius:27px;

    min-height:230px;

    position:relative;

    overflow:hidden;

    background:
      linear-gradient(
        135deg,
        rgba(255,255,255,.90),
        rgba(245,229,231,.80)
      );

    border:
      1px solid
      rgba(157,116,124,.13);

    box-shadow:var(--xd-shadow);
  }

  .xd-hero::before {
    content:"";

    position:absolute;

    width:190px;
    height:190px;

    border-radius:50%;

    right:-55px;
    top:-80px;

    background:
      rgba(184,135,145,.16);
  }

  .xd-hero::after {
    content:"";

    position:absolute;

    width:120px;
    height:120px;

    border-radius:50%;

    right:35px;
    bottom:-75px;

    border:
      1px solid
      rgba(184,135,145,.20);
  }

  .xd-hero > * {
    position:relative;
    z-index:1;
  }

  .xd-hero-title {
    margin:
      8px 0 7px;

    font-size:32px;

    line-height:1.05;

    letter-spacing:-.055em;

    font-weight:800;
  }

  .xd-hero-sub {
    max-width:310px;

    color:#75696b;

    font-size:13px;

    line-height:1.7;
  }

  .xd-live {
    display:inline-flex;

    align-items:center;

    gap:6px;

    margin-top:19px;

    padding:7px 10px;

    border-radius:999px;

    background:
      rgba(255,255,255,.70);

    color:var(--xd-pink-dark);

    font-size:10px;

    font-weight:750;

    letter-spacing:.08em;
  }

  .xd-live-dot {
    width:6px;
    height:6px;

    border-radius:50%;

    background:#b88791;

    box-shadow:
      0 0 0 4px
      rgba(184,135,145,.12);
  }

  /* =====================================================
     节目现场
     ===================================================== */

  .xd-scene {
    border-radius:23px;

    background:
      rgba(255,255,255,.72);

    border:
      1px solid
      var(--xd-line);

    padding:17px;

    box-shadow:
      0 8px 25px
      rgba(96,70,76,.045);
  }

  .xd-scene-label {
    font-size:10px;

    color:var(--xd-pink);

    letter-spacing:.12em;

    font-weight:750;
  }

  .xd-narrative {
    margin-top:10px;

    font-size:14px;

    line-height:1.85;

    color:#4b4143;
  }

  .xd-quote {
    margin-top:13px;

    padding:12px 13px;

    border-left:
      2px solid
      var(--xd-pink);

    background:
      rgba(245,231,233,.48);

    border-radius:
      0 13px 13px 0;

    font-size:13px;

    line-height:1.65;

    color:#65575a;
  }

  /* =====================================================
     玩法入口
     ===================================================== */

  .xd-play-grid {
    display:grid;

    grid-template-columns:
      repeat(2,minmax(0,1fr));

    gap:10px;
  }

  .xd-play-card {
    position:relative;

    min-height:116px;

    padding:15px;

    border:1px solid
      rgba(143,105,113,.12);

    border-radius:21px;

    background:
      linear-gradient(
        145deg,
        rgba(255,255,255,.86),
        rgba(247,233,235,.68)
      );

    cursor:pointer;

    text-align:left;

    box-shadow:
      0 7px 22px
      rgba(101,73,80,.045);

    transition:.16s ease;

    overflow:hidden;
  }

  .xd-play-card::after {
    content:"";

    position:absolute;

    width:75px;
    height:75px;

    border-radius:50%;

    right:-26px;
    bottom:-30px;

    background:
      rgba(184,135,145,.10);
  }

  .xd-play-card:active {
    transform:scale(.97);
  }

  .xd-play-icon {
    width:38px;
    height:38px;

    display:grid;

    place-items:center;

    border-radius:14px;

    background:
      var(--xd-pink-faint);

    font-size:20px;

    margin-bottom:9px;
  }

  .xd-play-title {
    font-size:13px;

    font-weight:800;
  }

  .xd-play-desc {
    margin-top:4px;

    font-size:9px;

    line-height:1.5;

    color:var(--xd-muted);
  }

  /* =====================================================
     弹幕
     ===================================================== */

  .xd-danmu {
    display:flex;

    flex-wrap:wrap;

    gap:7px;
  }

  .xd-danmu span {
    padding:7px 10px;

    border-radius:999px;

    background:
      rgba(255,255,255,.66);

    border:
      1px solid
      rgba(140,104,112,.10);

    color:#75686b;

    font-size:10px;
  }

  /* =====================================================
     嘉宾
     ===================================================== */

  .xd-profile {
    display:flex;

    align-items:center;

    gap:14px;

    padding:17px;

    border-radius:22px;

    background:
      rgba(255,255,255,.76);

    border:
      1px solid
      var(--xd-line);
  }

  .xd-avatar {
    width:54px;
    height:54px;

    flex:0 0 54px;

    border-radius:17px;

    overflow:hidden;

    background:
      linear-gradient(
        145deg,
        #e8d5d8,
        #f4e8e9
      );

    display:grid;

    place-items:center;

    color:var(--xd-pink-dark);

    font-size:19px;

    font-weight:800;
  }

  .xd-avatar img {
    width:100%;
    height:100%;

    object-fit:cover;

    display:block;
  }

  .xd-profile .xd-avatar {
    width:62px;
    height:62px;

    flex-basis:62px;

    border-radius:19px;
  }

  .xd-profile-name {
    font-size:17px;

    font-weight:800;
  }

  .xd-profile-handle {
    margin-top:3px;

    color:var(--xd-pink);

    font-size:10px;
  }

  .xd-profile-bio {
    margin-top:6px;

    color:var(--xd-muted);

    font-size:11px;

    line-height:1.5;
  }

  .xd-guest-card {
    display:flex;

    align-items:center;

    gap:13px;

    padding:13px;

    border-radius:20px;

    background:
      rgba(255,255,255,.76);

    border:
      1px solid
      var(--xd-line);

    box-shadow:
      0 7px 22px
      rgba(101,73,80,.045);

    cursor:pointer;

    transition:
      transform .16s ease,
      border-color .16s ease;
  }

  .xd-guest-card:active {
    transform:scale(.985);
  }

  .xd-guest-main {
    min-width:0;

    flex:1;
  }

  .xd-guest-name {
    font-size:15px;

    font-weight:780;
  }

  .xd-guest-handle {
    margin-top:3px;

    font-size:10px;

    color:var(--xd-pink);
  }

  .xd-guest-bio {
    margin-top:5px;

    font-size:10px;

    color:var(--xd-muted);

    white-space:nowrap;

    overflow:hidden;

    text-overflow:ellipsis;
  }

  .xd-arrow {
    color:#b3a5a8;

    font-size:18px;

    flex:0 0 auto;
  }

  /* =====================================================
     嘉宾详情
     ===================================================== */

  .xd-detail-hero {
    padding:22px 18px;

    border-radius:26px;

    background:
      linear-gradient(
        145deg,
        rgba(255,255,255,.90),
        rgba(245,229,231,.76)
      );

    border:1px solid
      rgba(157,116,124,.13);

    box-shadow:var(--xd-shadow);

    text-align:center;
  }

  .xd-detail-hero .xd-avatar {
    width:82px;
    height:82px;

    flex-basis:82px;

    margin:0 auto 12px;

    border-radius:25px;
  }

  .xd-detail-name {
    font-size:24px;

    font-weight:820;

    letter-spacing:-.04em;
  }

  .xd-detail-handle {
    margin-top:4px;

    font-size:10px;

    color:var(--xd-pink);
  }

  .xd-collapse {
    margin-top:13px;

    border-radius:18px;

    background:
      rgba(255,255,255,.72);

    border:1px solid
      var(--xd-line);

    overflow:hidden;
  }

  .xd-collapse-head {
    width:100%;

    border:0;

    background:transparent;

    padding:13px;

    display:flex;

    justify-content:space-between;

    align-items:center;

    cursor:pointer;

    color:var(--xd-text);

    font-size:12px;

    font-weight:750;
  }

  .xd-collapse-body {
    display:none;

    padding:
      0 13px 14px;

    font-size:11px;

    line-height:1.8;

    color:#75696b;
  }

  .xd-collapse.open .xd-collapse-body {
    display:block;
  }

  .xd-relation-box {
    padding:17px;

    border-radius:22px;

    background:
      rgba(255,255,255,.76);

    border:1px solid
      var(--xd-line);

    box-shadow:
      0 7px 22px
      rgba(101,73,80,.045);
  }

  .xd-relation-line {
    display:flex;

    justify-content:space-between;

    align-items:center;

    gap:12px;
  }

  .xd-relation-state {
    font-size:16px;

    font-weight:800;

    color:var(--xd-pink-dark);
  }

  .xd-tags {
    display:flex;

    flex-wrap:wrap;

    gap:6px;

    margin-top:13px;
  }

  .xd-tag {
    padding:6px 9px;

    border-radius:999px;

    background:
      var(--xd-pink-faint);

    color:
      var(--xd-pink-dark);

    font-size:9px;

    font-weight:700;
  }

  /* =====================================================
     私信
     ===================================================== */

  .xd-chat {
    display:flex;

    flex-direction:column;

    height:100%;
  }

  .xd-chat-list {
    flex:1;

    overflow-y:auto;

    padding:
      18px
      16px
      115px;

    scrollbar-width:none;
  }

  .xd-chat-list::-webkit-scrollbar {
    display:none;
  }

  .xd-chat-person {
    display:flex;

    align-items:center;

    gap:12px;

    padding:
      13px;

    margin-bottom:17px;

    border-radius:20px;

    background:
      rgba(255,255,255,.72);

    border:1px solid
      var(--xd-line);
  }

  .xd-chat-message {
    display:flex;

    gap:8px;

    margin-top:13px;
  }

  .xd-chat-message.me {
    justify-content:flex-end;
  }

  .xd-chat-bubble {
    max-width:78%;

    padding:
      10px 13px;

    border-radius:
      17px;

    background:
      rgba(255,255,255,.82);

    color:#5b4e51;

    font-size:12px;

    line-height:1.65;

    box-shadow:
      0 4px 15px
      rgba(101,73,80,.04);
  }

  .xd-chat-message.me
  .xd-chat-bubble {
    background:
      #ead9dc;

    color:#634c52;
  }

  .xd-chat-input {
    position:absolute;

    left:12px;
    right:12px;
    bottom:94px;

    display:flex;

    gap:8px;

    padding:8px;

    border-radius:18px;

    background:
      rgba(255,255,255,.88);

    border:1px solid
      var(--xd-line);

    box-shadow:
      0 10px 35px
      rgba(80,56,63,.10);

    backdrop-filter:
      blur(20px);
  }

  .xd-chat-input input {
    flex:1;

    min-width:0;

    border:0;

    outline:none;

    background:transparent;

    color:var(--xd-text);

    padding:7px;
  }

  .xd-chat-send {
    border:0;

    width:35px;
    height:35px;

    border-radius:12px;

    background:
      var(--xd-pink);

    color:white;

    cursor:pointer;
  }

  /* =====================================================
     观察室
     ===================================================== */

  .xd-observe-card {
    padding:17px;

    border-radius:23px;

    background:
      rgba(255,255,255,.76);

    border:
      1px solid
      var(--xd-line);

    box-shadow:
      0 7px 22px
      rgba(101,73,80,.045);
  }

  .xd-observe-scene {
    padding:13px;

    border-radius:17px;

    background:
      rgba(245,231,233,.45);

    margin-top:10px;
  }

  .xd-observe-scene-title {
    font-size:12px;

    font-weight:780;

    color:var(--xd-pink-dark);
  }

  .xd-observe-text {
    margin-top:6px;

    font-size:11px;

    line-height:1.75;

    color:#75696b;
  }

  /* =====================================================
     房屋 / 地图
     ===================================================== */

  .xd-house {
    position:relative;

    min-height:475px;

    border-radius:30px;

    overflow:hidden;

    background:
      linear-gradient(
        145deg,
        #f9f0ef,
        #eee0e2
      );

    border:1px solid
      rgba(157,116,124,.15);

    box-shadow:var(--xd-shadow);
  }

  .xd-house-roof {
    position:absolute;

    left:-8%;
    right:-8%;

    top:-70px;

    height:190px;

    border-radius:50%;

    background:
      rgba(255,255,255,.44);

    border:
      1px solid
      rgba(184,135,145,.12);
  }

  .xd-house-title {
    position:relative;

    z-index:2;

    padding:
      22px 20px 0;
  }

  .xd-house-name {
    font-size:24px;

    font-weight:820;

    letter-spacing:-.04em;
  }

  .xd-house-sub {
    margin-top:4px;

    font-size:10px;

    color:var(--xd-muted);
  }

  .xd-room {
    position:absolute;

    width:104px;
    min-height:72px;

    padding:12px;

    border-radius:19px;

    border:1px solid
      rgba(140,104,112,.12);

    background:
      rgba(255,255,255,.80);

    box-shadow:
      0 7px 18px
      rgba(101,73,80,.06);

    cursor:pointer;

    text-align:left;

    transition:.16s ease;
  }

  .xd-room:active {
    transform:scale(.96);
  }

  .xd-room-icon {
    font-size:20px;
  }

  .xd-room-name {
    margin-top:5px;

    font-size:11px;

    font-weight:800;
  }

  .xd-room-desc {
    margin-top:2px;

    font-size:8px;

    color:var(--xd-muted);
  }

  .xd-room-kitchen {
    left:18px;
    top:110px;
  }

  .xd-room-living {
    right:18px;
    top:110px;
  }

  .xd-room-bath {
    left:18px;
    top:220px;
  }

  .xd-room-bedroom {
    right:18px;
    top:220px;
  }

  .xd-room-garden {
    left:50%;

    transform:
      translateX(-50%);

    bottom:28px;

    width:140px;
  }

  .xd-room-garden:active {
    transform:
      translateX(-50%)
      scale(.96);
  }

  /* =====================================================
     档案
     ===================================================== */

  .xd-archive {
    position:relative;

    padding:18px;

    border-radius:23px;

    background:
      linear-gradient(
        140deg,
        rgba(255,255,255,.88),
        rgba(245,229,231,.70)
      );

    border:1px solid
      var(--xd-line);

    box-shadow:var(--xd-shadow);

    overflow:hidden;
  }

  .xd-archive-title {
    font-size:20px;

    font-weight:800;

    letter-spacing:-.035em;
  }

  .xd-archive-meta {
    margin-top:6px;

    font-size:10px;

    color:var(--xd-muted);
  }

  .xd-archive-summary {
    margin-top:13px;

    color:#76696b;

    font-size:11px;

    line-height:1.7;
  }

  .xd-archive-actions {
    display:flex;

    gap:8px;

    margin-top:14px;
  }

  .xd-small-btn {
    flex:1;

    border:
      1px solid
      rgba(140,104,112,.13);

    background:
      rgba(255,255,255,.65);

    color:
      var(--xd-pink-dark);

    border-radius:13px;

    padding:9px;

    font-size:10px;

    font-weight:720;

    cursor:pointer;
  }

  .xd-new-archive {
    width:100%;

    margin-top:11px;

    padding:15px;

    border-radius:19px;

    border:
      1px dashed
      rgba(167,121,131,.25);

    background:
      rgba(255,255,255,.36);

    color:
      var(--xd-pink-dark);

    font-size:12px;

    font-weight:750;

    cursor:pointer;
  }

  /* =====================================================
     空状态
     ===================================================== */

  .xd-empty {
    text-align:center;

    padding:38px 20px;

    border-radius:23px;

    border:
      1px dashed
      rgba(140,104,112,.18);

    background:
      rgba(255,255,255,.42);
  }

  .xd-empty-icon {
    font-size:27px;

    margin-bottom:9px;

    opacity:.8;
  }

  .xd-empty-title {
    font-size:15px;

    font-weight:780;
  }

  .xd-empty-text {
    margin-top:6px;

    font-size:11px;

    line-height:1.7;

    color:var(--xd-muted);
  }

  /* =====================================================
     按钮
     ===================================================== */

  .xd-primary {
    border:0;

    border-radius:15px;

    padding:11px 16px;

    background:#a97983;

    color:white;

    font-size:12px;

    font-weight:750;

    cursor:pointer;

    box-shadow:
      0 7px 18px
      rgba(132,91,101,.18);
  }

  .xd-primary:active {
    transform:scale(.98);
  }

  /* =====================================================
     创建恋综选择器
     ===================================================== */

  .xd-selector-list {
    display:grid;

    gap:8px;

    margin-top:10px;

    max-height:280px;

    overflow-y:auto;
  }

  .xd-selector {
    width:100%;

    border:
      1px solid
      rgba(140,104,112,.12);

    background:
      rgba(255,255,255,.75);

    border-radius:17px;

    padding:10px;

    display:flex;

    align-items:center;

    gap:10px;

    text-align:left;

    cursor:pointer;
  }

  .xd-selector.selected {
    border-color:
      rgba(184,135,145,.50);

    background:
      #f8edef;

    box-shadow:
      0 0 0 2px
      rgba(184,135,145,.07);
  }

  .xd-check {
    margin-left:auto;

    width:21px;
    height:21px;

    border-radius:50%;

    border:1px solid
      rgba(140,104,112,.18);

    display:grid;

    place-items:center;

    color:transparent;

    font-size:11px;
  }

  .xd-selector.selected .xd-check {
    background:
      var(--xd-pink);

    border-color:
      var(--xd-pink);

    color:white;
  }

  /* =====================================================
     设置
     ===================================================== */

  .xd-setting-card {
    padding:15px;

    border-radius:20px;

    background:
      rgba(255,255,255,.76);

    border:
      1px solid
      var(--xd-line);
  }

  .xd-setting-row {
    display:flex;

    align-items:center;

    justify-content:space-between;

    gap:15px;

    padding:11px 0;

    border-bottom:
      1px solid
      rgba(117,91,97,.08);
  }

  .xd-setting-row:last-child {
    border-bottom:0;
  }

  .xd-setting-name {
    font-size:12px;

    font-weight:760;
  }

  .xd-setting-desc {
    margin-top:3px;

    font-size:9px;

    line-height:1.5;

    color:var(--xd-muted);
  }

  .xd-switch {
    width:45px;
    height:27px;

    border:0;

    border-radius:999px;

    background:#d8ccce;

    position:relative;

    cursor:pointer;

    flex:0 0 auto;
  }

  .xd-switch::after {
    content:"";

    position:absolute;

    width:21px;
    height:21px;

    border-radius:50%;

    background:white;

    left:3px;
    top:3px;

    transition:.18s ease;

    box-shadow:
      0 2px 7px
      rgba(70,50,55,.13);
  }

  .xd-switch.on {
    background:
      var(--xd-pink);
  }

  .xd-switch.on::after {
    transform:
      translateX(18px);
  }

  /* =====================================================
     弹窗
     ===================================================== */

  .xd-modal-wrap {
    position:absolute;

    inset:0;

    z-index:100;

    background:
      rgba(67,51,55,.20);

    backdrop-filter:blur(5px);

    display:flex;

    align-items:flex-end;

    justify-content:center;
  }

  .xd-modal {
    width:100%;

    max-height:88%;

    overflow-y:auto;

    background:#fbf8f7;

    border-radius:
      28px 28px 0 0;

    padding:
      21px
      17px
      28px;

    box-shadow:
      0 -12px 45px
      rgba(72,51,57,.15);
  }

  .xd-modal-handle {
    width:37px;
    height:4px;

    border-radius:99px;

    background:#d7c8ca;

    margin:
      -5px auto 17px;
  }

  .xd-modal-title {
    font-size:20px;

    font-weight:800;

    letter-spacing:-.03em;
  }

  .xd-field {
    margin-top:15px;
  }

  .xd-field label {
    display:block;

    font-size:10px;

    color:var(--xd-muted);

    font-weight:700;

    margin-bottom:7px;
  }

  .xd-field input,
  .xd-field textarea {
    width:100%;

    border:
      1px solid
      rgba(140,104,112,.15);

    background:white;

    color:var(--xd-text);

    border-radius:14px;

    padding:12px;

    outline:none;

    resize:none;
  }

  .xd-field input:focus,
  .xd-field textarea:focus {
    border-color:
      rgba(184,135,145,.45);

    box-shadow:
      0 0 0 3px
      rgba(184,135,145,.08);
  }

  .xd-modal-actions {
    display:flex;

    gap:8px;

    margin-top:18px;
  }

  .xd-modal-actions button {
    flex:1;
  }

  /* =====================================================
     桌面
     ===================================================== */

  @media (min-width:700px) {

    .roche-plugin-xindong-xianchang {
      max-width:520px;

      margin:0 auto;

      border-left:
        1px solid
        rgba(120,90,96,.08);

      border-right:
        1px solid
        rgba(120,90,96,.08);
    }

  }
`;

document.head.appendChild(style);

}

/* =========================================================
Shell
========================================================= */

function renderShell() {
state.container.innerHTML = `
<div class="roche-plugin-xindong-xianchang">

    <header class="xd-topbar">

      <button
        class="xd-back"
        data-action="back"
        aria-label="返回 Roche"
      >
        ‹
      </button>

      <div class="xd-heading">
        <div class="xd-eyebrow">
          LOVE REALITY SHOW
        </div>

        <div class="xd-title">
          心动现场
        </div>
      </div>

      <div class="xd-topday">
        <span
          class="xd-topday-main"
          data-top-day
        >
          DAY 01
        </span>

        <span class="xd-topday-sub">
          ON AIR
        </span>
      </div>

      <button
        class="xd-settings"
        data-action="settings"
        aria-label="恋综设置"
      >
        ⚙
      </button>

    </header>

    <main
      class="xd-content"
      data-content
    ></main>

    <nav
      class="xd-bottom"
      aria-label="心动现场导航"
    >

      <button
        class="xd-tab active"
        data-tab="show"
      >
        <span class="xd-tab-icon">
          ▣
        </span>

        <span class="xd-tab-label">
          节目
        </span>
      </button>

      <button
        class="xd-tab"
        data-tab="guests"
      >
        <span class="xd-tab-icon">
          ♧
        </span>

        <span class="xd-tab-label">
          嘉宾档案
        </span>
      </button>

      <button
        class="xd-tab"
        data-tab="observe"
      >
        <span class="xd-tab-icon">
          ◌
        </span>

        <span class="xd-tab-label">
          观察室
        </span>
      </button>

      <button
        class="xd-tab"
        data-tab="archives"
      >
        <span class="xd-tab-icon">
          ▤
        </span>

        <span class="xd-tab-label">
          档案
        </span>
      </button>

    </nav>

  </div>
`;

state.container
  .querySelectorAll("[data-tab]")
  .forEach((button) => {

    listen(button, "click", () => {

      state.activeTab =
        button.dataset.tab;

      state.page = "tab";
      state.stack = [];

      renderPage();
    });

  });

const back =
  state.container.querySelector(
    "[data-action='back']"
  );

listen(back, "click", () => {

  if (state.page !== "tab") {

    state.page = "tab";
    state.stack = [];

    renderPage();

    return;
  }

  try {
    state.roche.ui.closeApp();
  } catch {
    toast("无法返回 Roche");
  }

});

const settings =
  state.container.querySelector(
    "[data-action='settings']"
  );

listen(settings, "click", () => {

  if (!state.currentArchive) {
    toast("请先创建一个恋综档案");
    return;
  }

  openSettings();
});

}

/* =========================================================
Avatar
========================================================= */

function avatarHTML(item, className = "xd-avatar") {

const src = avatarOf(item);

if (src) {

  return `
    <div class="${className}">
      <img
        src="${esc(src)}"
        alt=""
      >
    </div>
  `;

}

const first =
  nameOf(item, "♡")
    .slice(0, 1);

return `
  <div class="${className}">
    ${esc(first)}
  </div>
`;

}

function pageHead(kicker, title, note = "") {

return `
  <div class="xd-kicker">
    ${esc(kicker)}
  </div>

  <div
    class="xd-section-head"
    style="margin-top:5px;"
  >
    <div class="xd-section-title">
      ${esc(title)}
    </div>

    ${
      note
        ? `
          <div class="xd-section-note">
            ${esc(note)}
          </div>
        `
        : ""
    }

  </div>
`;

}

/* =========================================================
节目页
========================================================= */

function renderShow() {

const archive =
  state.currentArchive;

const day =
  archive?.currentDay || 1;

const scene =
  archive?.currentSceneLabel ||
  "心动小屋 · 客厅";

const narrative =
  archive?.lastNarrative ||
  "夕阳落进客厅的玻璃窗。节目组没有宣布新的任务，空气却比往常安静了一些。几个人各自做着手里的事，偶尔的目光交错，让今晚显得格外微妙。";

const quote =
  archive?.lastQuote ||
  "“你今天……好像一直在看我。”";

if (!archive) {

  return `
    <div class="xd-page">

      ${pageHead(
        "TONIGHT · LIVE",
        "心动现场",
        "还没有正在进行的恋综"
      )}

      <section class="xd-hero">

        <div class="xd-kicker">
          READY TO START
        </div>

        <div class="xd-hero-title">
          开始一场新的心动。
        </div>

        <div class="xd-hero-sub">
          先创建属于你的恋综世界，
          再选择本季入住的嘉宾。
          Roche 中的其他角色不会自动进入节目。
        </div>

        <button
          class="xd-primary"
          data-new-archive
        >
          ＋ 创建新的恋综
        </button>

      </section>

      <div class="xd-section-head">
        <div class="xd-section-title">
          你会遇见什么？
        </div>
      </div>

      <div class="xd-play-grid">

        <button
          class="xd-play-card"
          data-open-house
        >
          <div class="xd-play-icon">
            🏠
          </div>

          <div class="xd-play-title">
            心动小屋
          </div>

          <div class="xd-play-desc">
            探索不同地点与互动玩法
          </div>
        </button>

        <button
          class="xd-play-card"
          data-open-observe
        >
          <div class="xd-play-icon">
            👀
          </div>

          <div class="xd-play-title">
            观察室
          </div>

          <div class="xd-play-desc">
            偷看你不在场时发生的事情
          </div>
        </button>

      </div>

    </div>
  `;
}

return `
  <div class="xd-page">

    ${pageHead(
      "TONIGHT · LIVE",
      "正在播出",
      "实时节目现场"
    )}

    <section class="xd-hero">

      <div class="xd-kicker">
        EPISODE
        ${String(day).padStart(2, "0")}
      </div>

      <div class="xd-hero-title">
        ${esc(archive.title)}
      </div>

      <div class="xd-hero-sub">
        一场关于靠近、试探与心动的真人秀。
        没有人知道下一秒谁会先动心。
      </div>

      <div class="xd-live">
        <span class="xd-live-dot"></span>
        LIVE · ${esc(scene)}
      </div>

    </section>

    <div class="xd-section-head">

      <div class="xd-section-title">
        今晚的现场
      </div>

      <div class="xd-section-note">
        DAY
        ${String(day).padStart(2, "0")}
        ·
        ${esc(
          archive.currentTime ||
          "20:36"
        )}
      </div>

    </div>

    <section class="xd-scene">

      <div class="xd-scene-label">
        ${esc(scene)}
      </div>

      <div class="xd-narrative">
        ${esc(narrative)}
      </div>

      <div class="xd-quote">
        ${esc(quote)}
      </div>

    </section>

    <!-- 房屋入口 -->

    <div class="xd-section-head">

      <div class="xd-section-title">
        心动小屋
      </div>

      <div class="xd-section-note">
        EXPLORE
      </div>

    </div>

    <div class="xd-play-grid">

      <button
        class="xd-play-card"
        data-open-house
      >

        <div class="xd-play-icon">
          🏠
        </div>

        <div class="xd-play-title">
          进入心动小屋
        </div>

        <div class="xd-play-desc">
          自由选择地点与节目玩法
        </div>

      </button>

      <button
        class="xd-play-card"
        data-open-observe
      >

        <div class="xd-play-icon">
          👀
        </div>

        <div class="xd-play-title">
          观察室
        </div>

        <div class="xd-play-desc">
          看看你不在的时候发生了什么
        </div>

      </button>

    </div>

    <!-- 今日玩法 -->

    <div class="xd-section-head">

      <div class="xd-section-title">
        今日玩法
      </div>

      <div class="xd-section-note">
        TODAY
      </div>

    </div>

    <div class="xd-play-grid">

      <button
        class="xd-play-card"
        data-play="kitchen"
      >
        <div class="xd-play-icon">
          🍳
        </div>

        <div class="xd-play-title">
          厨房大战
        </div>

        <div class="xd-play-desc">
          一场看似普通的晚餐准备
        </div>
      </button>

      <button
        class="xd-play-card"
        data-play="message"
      >
        <div class="xd-play-icon">
          💌
        </div>

        <div class="xd-play-title">
          匿名短信夜
        </div>

        <div class="xd-play-desc">
          收到一条没有署名的消息
        </div>
      </button>

      <button
        class="xd-play-card"
        data-play="gift"
      >
        <div class="xd-play-icon">
          🎁
        </div>

        <div class="xd-play-title">
          心动礼物
        </div>

        <div class="xd-play-desc">
          今天有人为你准备了东西
        </div>
      </button>

    </div>

    <div class="xd-section-head">

      <div class="xd-section-title">
        观众席
      </div>

      <div class="xd-section-note">
        LIVE DANMU
      </div>

    </div>

    <div class="xd-danmu">

      <span>
        这气氛突然不对劲了
      </span>

      <span>
        救命谁先移开视线
      </span>

      <span>
        节目组你最好有事
      </span>

      <span>
        我已经开始期待了
      </span>

    </div>

  </div>
`;

}

/* =========================================================
嘉宾页
========================================================= */

function renderGuests() {

const chars =
  state.characters || [];

if (!state.currentArchive) {

  return `
    <div class="xd-page">

      ${pageHead(
        "THE CAST",
        "嘉宾档案",
        "创建恋综后开启"
      )}

      <div class="xd-empty">

        <div class="xd-empty-icon">
          ♡
        </div>

        <div class="xd-empty-title">
          还没有本季嘉宾
        </div>

        <div class="xd-empty-text">
          Roche 中的角色只会作为候选嘉宾。
          创建恋综并选择他们之后，
          才会正式入住本季。
        </div>

        <button
          class="xd-primary"
          data-new-archive
        >
          创建恋综
        </button>

      </div>

    </div>
  `;
}

return `
  <div class="xd-page">

    ${pageHead(
      "THE CAST",
      "本季嘉宾",
      `${chars.length} 位入住`
    )}

    <div class="xd-profile">

      ${avatarHTML(state.user)}

      <div>

        <div class="xd-profile-name">
          ${esc(nameOf(
            state.user,
            "我的人设"
          ))}
        </div>

        <div class="xd-profile-handle">
          ${esc(
            handleOf(state.user) ||
            "USER"
          )}
        </div>

        <div class="xd-profile-bio">
          ${esc(
            state.user?.bio ||
            "本季恋综玩家"
          )}
        </div>

      </div>

    </div>

    <div class="xd-section-head">

      <div class="xd-section-title">
        入住嘉宾
      </div>

      <div class="xd-section-note">
        ${chars.length} 条故事线
      </div>

    </div>

    <div class="xd-card-grid">

      ${
        chars.length

          ? chars.map((char) => `
            <div
              class="xd-guest-card"
              data-guest-id="${esc(char.id)}"
            >

              ${avatarHTML(char)}

              <div class="xd-guest-main">

                <div class="xd-guest-name">
                  ${esc(nameOf(char))}
                </div>

                <div class="xd-guest-handle">
                  ${esc(
                    handleOf(char) ||
                    "GUEST"
                  )}
                </div>

                <div class="xd-guest-bio">
                  点击查看嘉宾档案
                </div>

              </div>

              <div class="xd-arrow">
                ›
              </div>

            </div>
          `).join("")

          : `
            <div class="xd-empty">

              <div class="xd-empty-icon">
                ♡
              </div>

              <div class="xd-empty-title">
                本季还没有嘉宾
              </div>

              <div class="xd-empty-text">
                请创建恋综时选择入住嘉宾。
              </div>

            </div>
          `
      }

    </div>

  </div>
`;

}

/* =========================================================
观察室
========================================================= */

function renderObserve() {

const chars =
  state.characters || [];

if (!state.currentArchive) {

  return `
    <div class="xd-page">

      ${pageHead(
        "OBSERVATION ROOM",
        "节目观察室",
        "还没有节目"
      )}

      <div class="xd-empty">

        <div class="xd-empty-icon">
          👀
        </div>

        <div class="xd-empty-title">
          这里会发生什么？
        </div>

        <div class="xd-empty-text">
          当你不在现场时，
          其他嘉宾的行动、聊天与事件
          会逐渐汇聚到这里。
        </div>

      </div>

    </div>
  `;
}

return `
  <div class="xd-page">

    ${pageHead(
      "OBSERVATION ROOM",
      "节目观察室",
      "你不在的时候"
    )}

    <section class="xd-hero"
      style="min-height:190px;">

      <div class="xd-kicker">
        OFF CAMERA
      </div>

      <div
        class="xd-hero-title"
        style="font-size:27px;"
      >
        有些故事，
        你不会亲眼看到。
      </div>

      <div class="xd-hero-sub">
        观察室记录你离开现场之后，
        嘉宾之间发生的互动。
        这里不是剧情主线，
        而是这个世界自己继续运转留下的痕迹。
      </div>

    </section>

    <div class="xd-section-head">

      <div class="xd-section-title">
        今日观察
      </div>

      <div class="xd-section-note">
        DAY
        ${String(
          state.currentArchive.currentDay || 1
        ).padStart(2,"0")}
      </div>

    </div>

    <div class="xd-observe-card">

      <div class="xd-kicker">
        HOUSE CAMERA
      </div>

      <div class="xd-observe-scene">

        <div class="xd-observe-scene-title">
          客厅
        </div>

        <div class="xd-observe-text">
          节目组暂时没有记录到
          可以公开的特殊事件。
          随着剧情推进，
          这里会逐渐出现更多
          嘉宾自主行动留下的片段。
        </div>

      </div>

      <div class="xd-observe-scene">

        <div class="xd-observe-scene-title">
          厨房
        </div>

        <div class="xd-observe-text">
          有人比其他人更早开始准备晚餐。
          至于是谁，
          目前还没有人告诉你。
        </div>

      </div>

    </div>

    <div class="xd-section-head">

      <div class="xd-section-title">
        本季嘉宾
      </div>

      <div class="xd-section-note">
        ${chars.length} 人
      </div>

    </div>

    <div class="xd-card-grid">

      ${
        chars.map((char) => `
          <div class="xd-guest-card">

            ${avatarHTML(char)}

            <div class="xd-guest-main">

              <div class="xd-guest-name">
                ${esc(nameOf(char))}
              </div>

              <div class="xd-guest-bio">
                当前状态：节目进行中
              </div>

            </div>

          </div>
        `).join("")
      }

    </div>

  </div>
`;

}

/* =========================================================
嘉宾详情
========================================================= */

function renderGuestDetail(char) {

const archive =
  state.currentArchive;

const relation =
  archive?.relationships
    ?.userToChar?.[char.id] ||
  {
    statusLine:
      "你们的故事才刚刚开始。",
    tags:["尚未定义"]
  };

const persona =
  char.persona ||
  char.bio ||
  "暂无可展示的人设。";

const expanded =
  state.detailExpanded
    ? "open"
    : "";

return `
  <div class="xd-page">

    <div class="xd-detail-hero">

      ${avatarHTML(char)}

      <div class="xd-detail-name">
        ${esc(nameOf(char))}
      </div>

      <div class="xd-detail-handle">
        ${esc(
          handleOf(char) ||
          "GUEST"
        )}
      </div>

    </div>

    <div class="xd-section-head">

      <div class="xd-section-title">
        嘉宾档案
      </div>

      <div class="xd-section-note">
        PERSONA
      </div>

    </div>

    <div class="xd-collapse ${expanded}">

      <button
        class="xd-collapse-head"
        data-toggle-persona
      >

        <span>
          人设描述
        </span>

        <span>
          ${state.detailExpanded ? "⌃" : "⌄"}
        </span>

      </button>

      <div class="xd-collapse-body">
        ${esc(persona)}
      </div>

    </div>

    <div class="xd-section-head">

      <div class="xd-section-title">
        你们的关系
      </div>

      <div class="xd-section-note">
        RELATIONSHIP
      </div>

    </div>

    <div class="xd-relation-box">

      <div class="xd-relation-line">

        <div>

          <div
            style="
              font-size:10px;
              color:#8e8183;
              margin-bottom:4px;
            "
          >
            当前状态
          </div>

          <div class="xd-relation-state">
            ${esc(
              relation.statusLine ||
              "尚未定义"
            )}
          </div>

        </div>

        <div
          style="
            font-size:28px;
            opacity:.75;
          "
        >
          ♡
        </div>

      </div>

      <div class="xd-tags">

        ${
          (relation.tags?.length
            ? relation.tags
            : ["故事刚刚开始"]
          )
          .map(
            tag => `
              <span class="xd-tag">
                ${esc(tag)}
              </span>
            `
          )
          .join("")
        }

      </div>

    </div>

    <div class="xd-section-head">

      <div class="xd-section-title">
        与他联系
      </div>

    </div>

    <button
      class="xd-primary"
      style="
        width:100%;
        margin-top:0;
      "
      data-open-private
    >
      💬 打开私信
    </button>

  </div>
`;

}

/* =========================================================
私信
========================================================= */

function renderPrivateChat(char) {

const archive =
  state.currentArchive;

const messages =
  archive?.privateMessages?.[char.id] ||
  [
    {
      from:"char",
      text:
        "今晚……好像有很多话想和你说。"
    }
  ];

return `
  <div class="xd-chat">

    <div class="xd-chat-list">

      <div class="xd-chat-person">

        ${avatarHTML(char)}

        <div>

          <div
            style="
              font-size:15px;
              font-weight:800;
            "
          >
            ${esc(nameOf(char))}
          </div>

          <div
            style="
              margin-top:3px;
              font-size:9px;
              color:#a97983;
            "
          >
            PRIVATE MESSAGE
          </div>

        </div>

      </div>

      ${
        messages.map((msg) => `
          <div
            class="
              xd-chat-message
              ${msg.from === "me" ? "me" : ""}
            "
          >

            <div class="xd-chat-bubble">
              ${esc(msg.text)}
            </div>

          </div>
        `).join("")
      }

    </div>

    <div class="xd-chat-input">

      <input
        data-private-input
        placeholder="写点什么……"
      >

      <button
        class="xd-chat-send"
        data-private-send
      >
        ↑
      </button>

    </div>

  </div>
`;

}

/* =========================================================
心动小屋
========================================================= */

function renderHouse() {

return `
  <div class="xd-page">

    ${pageHead(
      "THE HOUSE",
      "心动小屋",
      "选择你想去的地方"
    )}

    <section class="xd-house">

      <div class="xd-house-roof"></div>

      <div class="xd-house-title">

        <div class="xd-house-name">
          心动小屋
        </div>

        <div class="xd-house-sub">
          今晚 · ${esc(
            state.currentArchive?.currentTime ||
            "20:36"
          )}
        </div>

      </div>

      <button
        class="xd-room xd-room-kitchen"
        data-room="kitchen"
      >

        <div class="xd-room-icon">
          🍳
        </div>

        <div class="xd-room-name">
          厨房
        </div>

        <div class="xd-room-desc">
          香味已经飘出来了
        </div>

      </button>

      <button
        class="xd-room xd-room-living"
        data-room="living"
      >

        <div class="xd-room-icon">
          🛋️
        </div>

        <div class="xd-room-name">
          客厅
        </div>

        <div class="xd-room-desc">
          最容易发生偶遇
        </div>

      </button>

      <button
        class="xd-room xd-room-bath"
        data-room="bath"
      >

        <div class="xd-room-icon">
          🫧
        </div>

        <div class="xd-room-name">
          卫生间
        </div>

        <div class="xd-room-desc">
          暂时安静的角落
        </div>

      </button>

      <button
        class="xd-room xd-room-bedroom"
        data-room="bedroom"
      >

        <div class="xd-room-icon">
          🛏️
        </div>

        <div class="xd-room-name">
          卧室
        </div>

        <div class="xd-room-desc">
          夜晚之后的私人空间
        </div>

      </button>

      <button
        class="xd-room xd-room-garden"
        data-room="garden"
      >

        <div class="xd-room-icon">
          🌿
        </div>

        <div class="xd-room-name">
          花园
        </div>

        <div class="xd-room-desc">
          最适合偷偷聊一会儿
        </div>

      </button>

    </section>

    <div class="xd-section-head">

      <div class="xd-section-title">
        今日玩法
      </div>

      <div class="xd-section-note">
        GAME & EVENT
      </div>

    </div>

    <div class="xd-play-grid">

      <button
        class="xd-play-card"
        data-play="kitchen"
      >

        <div class="xd-play-icon">
          🍳
        </div>

        <div class="xd-play-title">
          厨房大战
        </div>

        <div class="xd-play-desc">
          谁负责做饭？
          谁负责捣乱？
        </div>

      </button>

      <button
        class="xd-play-card"
        data-play="message"
      >

        <div class="xd-play-icon">
          💌
        </div>

        <div class="xd-play-title">
          匿名短信夜
        </div>

        <div class="xd-play-desc">
          今晚的短信来自谁？
        </div>

      </button>

      <button
        class="xd-play-card"
        data-play="gift"
      >

        <div class="xd-play-icon">
          🎁
        </div>

        <div class="xd-play-title">
          心动礼物
        </div>

        <div class="xd-play-desc">
          有人准备了一份礼物
        </div>

      </button>

    </div>

  </div>
`;

}

/* =========================================================
档案
========================================================= */

function renderArchives() {

return `
  <div class="xd-page">

    ${pageHead(
      "YOUR SHOWS",
      "恋综档案",
      `${state.archives.length} 个世界`
    )}

    <div
      class="xd-empty"
      style="
        padding:27px 18px;
        margin-bottom:11px;
      "
    >

      <div class="xd-empty-icon">
        ✦
      </div>

      <div class="xd-empty-title">
        一个档案，就是一个完整世界
      </div>

      <div class="xd-empty-text">
        不同恋综之间的人设、剧情、
        关系与记忆彼此独立。
      </div>

    </div>

    <div class="xd-card-grid">

      ${
        state.archives.length

          ? state.archives.map(
              archive => `
                <article
                  class="xd-archive"
                >

                  <div
                    class="xd-archive-title"
                  >
                    ${esc(
                      archive.title
                    )}
                  </div>

                  <div
                    class="xd-archive-meta"
                  >
                    DAY
                    ${String(
                      archive.currentDay || 1
                    ).padStart(2,"0")}
                    ·
                    ${(archive.characterNames || []).length}
                    位嘉宾
                  </div>

                  <div
                    class="xd-archive-summary"
                  >
                    ${esc(
                      archive.lastSummary ||
                      "还没有发生故事。"
                    )}
                  </div>

                  <div
                    class="xd-archive-actions"
                  >

                    <button
                      class="xd-small-btn"
                      data-open-archive="${esc(
                        archive.archiveId
                      )}"
                    >
                      进入档案
                    </button>

                    <button
                      class="xd-small-btn"
                      data-delete-archive="${esc(
                        archive.archiveId
                      )}"
                    >
                      删除
                    </button>

                  </div>

                </article>
              `
            ).join("")

          : ""
      }

    </div>

    <button
      class="xd-new-archive"
      data-new-archive
    >
      ＋ 创建新的恋综世界
    </button>

  </div>
`;

}

/* =========================================================
设置页面
========================================================= */

function renderSettings() {

const archive =
  state.currentArchive;

const mode =
  archive?.participationMode ||
  "immersive";

return `
  <div class="xd-page">

    ${pageHead(
      "SHOW SETTINGS",
      "恋综设置",
      "决定你如何进入这个世界"
    )}

    <div class="xd-setting-card">

      <div class="xd-setting-row">

        <div>

          <div class="xd-setting-name">
            沉浸式参与
          </div>

          <div class="xd-setting-desc">
            只读取当前 USER / 嘉宾的人设。
            不主动融合你们过去的关系记忆。
          </div>

        </div>

        <button
          class="
            xd-switch
            ${mode === "immersive" ? "on" : ""}
          "
          data-mode="immersive"
        ></button>

      </div>

      <div class="xd-setting-row">

        <div>

          <div class="xd-setting-name">
            记忆融合
          </div>

          <div class="xd-setting-desc">
            在人设基础上，
            让角色过去与你的关系记忆
            影响本季恋综。
          </div>

        </div>

        <button
          class="
            xd-switch
            ${mode === "memory" ? "on" : ""}
          "
          data-mode="memory"
        ></button>

      </div>

    </div>

    <div class="xd-section-head">

      <div class="xd-section-title">
        当前档案
      </div>

    </div>

    <div class="xd-profile">

      ${avatarHTML(state.user)}

      <div>

        <div class="xd-profile-name">
          ${esc(
            archive?.userPersona?.name ||
            nameOf(state.user)
          )}
        </div>

        <div class="xd-profile-handle">
          ${esc(
            archive?.userPersona?.handle
              ? "@" +
                archive.userPersona.handle
              : "USER"
          )}
        </div>

      </div>

    </div>

  </div>
`;

}

/* =========================================================
页面渲染
========================================================= */

function renderPage() {

const content =
  state.container.querySelector(
    "[data-content]"
  );

if (!content) return;

clearListeners();

/*
 * clearListeners 会把 shell 的监听器也清掉，
 * 所以重新建立 shell 级监听。
 */

bindShellEvents();

let html = "";

if (state.page === "guest") {

  const char =
    state.detailCharacter;

  html = char
    ? renderGuestDetail(char)
    : renderGuests();

} else if (state.page === "chat") {

  html = state.chatCharacter
    ? renderPrivateChat(
        state.chatCharacter
      )
    : renderGuests();

} else if (state.page === "house") {

  html = renderHouse();

} else if (state.page === "settings") {

  html = renderSettings();

} else {

  html =
    state.activeTab === "show"
      ? renderShow()
      : state.activeTab === "guests"
      ? renderGuests()
      : state.activeTab === "observe"
      ? renderObserve()
      : renderArchives();

}

content.innerHTML = html;

bindPageEvents();

updateTopDay();

updateTabs();

}

function bindShellEvents() {

const shell =
  state.container.querySelector(
    ".roche-plugin-xindong-xianchang"
  );

if (!shell) return;

shell
  .querySelectorAll("[data-tab]")
  .forEach(button => {

    listen(
      button,
      "click",
      () => {

        state.activeTab =
          button.dataset.tab;

        state.page = "tab";

        renderPage();

      }
    );

  });

listen(
  shell.querySelector("[data-action='back']"),
  "click",
  () => {

    if (state.page !== "tab") {

      state.page = "tab";

      state.stack = [];

      renderPage();

      return;
    }

    try {
      state.roche.ui.closeApp();
    } catch {
      toast("无法返回 Roche");
    }

  }
);

listen(
  shell.querySelector(
    "[data-action='settings']"
  ),
  "click",
  () => {

    if (!state.currentArchive) {

      toast(
        "请先创建一个恋综档案"
      );

      return;
    }

    state.page = "settings";

    renderPage();

  }
);

}

function bindPageEvents() {

const root =
  state.container;

/* 新建 */

root
  .querySelectorAll("[data-new-archive]")
  .forEach(button => {

    listen(
      button,
      "click",
      openCreateArchive
    );

  });

/* 嘉宾 */

root
  .querySelectorAll("[data-guest-id]")
  .forEach(card => {

    listen(
      card,
      "click",
      () => {

        const char =
          state.characters.find(
            c =>
              String(c.id) ===
              String(
                card.dataset.guestId
              )
          );

        if (!char) return;

        state.detailCharacter =
          char;

        state.detailExpanded = false;

        state.page = "guest";

        renderPage();

      }
    );

  });

/* 人设展开 */

listen(
  root.querySelector(
    "[data-toggle-persona]"
  ),
  "click",
  () => {

    state.detailExpanded =
      !state.detailExpanded;

    renderPage();

  }
);

/* 私信 */

listen(
  root.querySelector(
    "[data-open-private]"
  ),
  "click",
  () => {

    if (!state.detailCharacter)
      return;

    state.chatCharacter =
      state.detailCharacter;

    state.page = "chat";

    renderPage();

  }
);

/* 私信发送 */

listen(
  root.querySelector(
    "[data-private-send]"
  ),
  "click",
  async () => {

    const input =
      root.querySelector(
        "[data-private-input]"
      );

    const text =
      input?.value.trim();

    if (!text) return;

    const char =
      state.chatCharacter;

    if (!char) return;

    if (!state.currentArchive)
      return;

    if (!state.currentArchive.privateMessages)
      state.currentArchive.privateMessages = {};

    if (!state.currentArchive.privateMessages[char.id])
      state.currentArchive.privateMessages[char.id] = [];

    state.currentArchive
      .privateMessages[char.id]
      .push({
        from:"me",
        text,
        createdAt:Date.now()
      });

    await saveCurrentArchive();

    renderPage();

  }
);

/* 观察室 */

root
  .querySelectorAll("[data-open-observe]")
  .forEach(button => {

    listen(
      button,
      "click",
      () => {

        state.activeTab =
          "observe";

        state.page =
          "tab";

        renderPage();

      }
    );

  });

/* 房屋 */

root
  .querySelectorAll("[data-open-house]")
  .forEach(button => {

    listen(
      button,
      "click",
      () => {

        state.page =
          "house";

        renderPage();

      }
    );

  });

/* 房间 */

root
  .querySelectorAll("[data-room]")
  .forEach(button => {

    listen(
      button,
      "click",
      () => {

        const room =
          button.dataset.room;

        openRoom(room);

      }
    );

  });

/* 玩法 */

root
  .querySelectorAll("[data-play]")
  .forEach(button => {

    listen(
      button,
      "click",
      () => {

        openPlay(
          button.dataset.play
        );

      }
    );

  });

/* 档案 */

root
  .querySelectorAll("[data-open-archive]")
  .forEach(button => {

    listen(
      button,
      "click",
      async () => {

        const id =
          button.dataset.openArchive;

        const archive =
          state.archives.find(
            a =>
              a.archiveId === id
          );

        if (!archive) return;

        const full =
          await storageGet(
            `archive:${id}`,
            archive
          );

        state.currentArchive =
          full;

        loadCurrentCharacters();

        state.activeTab =
          "show";

        state.page =
          "tab";

        renderPage();

      }
    );

  });

root
  .querySelectorAll("[data-delete-archive]")
  .forEach(button => {

    listen(
      button,
      "click",
      async () => {

        const id =
          button.dataset.deleteArchive;

        let ok = true;

        try {

          ok =
            await state.roche.ui.confirm({
              title:"删除恋综档案",
              message:
                "确定删除这个完整恋综世界吗？此操作无法恢复。"
            });

        } catch {}

        if (!ok) return;

        state.archives =
          state.archives.filter(
            a =>
              a.archiveId !== id
          );

        await storageSet(
          "archiveIndex",
          state.archives
        );

        await storageDelete(
          `archive:${id}`
        );

        if (
          state.currentArchive
            ?.archiveId === id
        ) {

          state.currentArchive =
            null;

          state.characters = [];
        }

        toast("档案已删除");

        renderPage();

      }
    );

  });

/* 设置模式 */

root
  .querySelectorAll("[data-mode]")
  .forEach(button => {

    listen(
      button,
      "click",
      async () => {

        if (!state.currentArchive)
          return;

        state.currentArchive
          .participationMode =
          button.dataset.mode;

        await saveCurrentArchive();

        renderPage();

        toast(
          button.dataset.mode ===
          "memory"
            ? "已切换为记忆融合模式"
            : "已切换为沉浸式模式"
        );

      }
    );

  });

}

function updateTabs() {

state.container
  .querySelectorAll("[data-tab]")
  .forEach(button => {

    button.classList.toggle(
      "active",
      state.page === "tab" &&
      button.dataset.tab ===
        state.activeTab
    );

  });

}

function updateTopDay() {

const el =
  state.container.querySelector(
    "[data-top-day]"
  );

if (!el) return;

el.textContent =
  `DAY ${String(
    state.currentArchive?.currentDay || 1
  ).padStart(2,"0")}`;

}

/* =========================================================
房间
========================================================= */

function openRoom(room) {

const names = {
  kitchen:"厨房",
  living:"客厅",
  bath:"卫生间",
  bedroom:"卧室",
  garden:"花园"
};

const descriptions = {
  kitchen:
    "厨房是最容易自然发生互动的地方。做饭、帮忙、偷吃、抢食材，都可以成为剧情入口。",
  living:
    "客厅是所有人最容易碰面的公共空间。闲聊、游戏、偶遇都可能在这里发生。",
  bath:
    "卫生间暂时不会触发大型剧情，它更像一个短暂脱离镜头的私人角落。",
  bedroom:
    "卧室属于更私人的夜晚空间。随着节目规则推进，这里会出现更特殊的事件。",
  garden:
    "花园适合两个人短暂离开其他人的视线，进行更安静的交流。"
};

const modal =
  document.createElement("div");

modal.className =
  "xd-modal-wrap";

modal.innerHTML = `
  <section class="xd-modal">

    <div class="xd-modal-handle"></div>

    <div class="xd-kicker">
      LOCATION
    </div>

    <div
      class="xd-modal-title"
      style="margin-top:4px;"
    >
      ${esc(names[room] || "地点")}
    </div>

    <div
      style="
        margin-top:12px;
        font-size:12px;
        line-height:1.8;
        color:#75696b;
      "
    >
      ${esc(
        descriptions[room] ||
        "这里暂时还没有发生什么。"
      )}
    </div>

    <button
      class="xd-primary"
      style="
        width:100%;
        margin-top:18px;
      "
      data-close-room
    >
      好，我去看看
    </button>

  </section>
`;

state.container
  .querySelector(
    ".roche-plugin-xindong-xianchang"
  )
  .appendChild(modal);

listen(
  modal.querySelector(
    "[data-close-room]"
  ),
  "click",
  () => modal.remove()
);

listen(
  modal,
  "click",
  e => {

    if (e.target === modal)
      modal.remove();

  }
);

}

/* =========================================================
玩法
========================================================= */

function openPlay(type) {

const data = {

  kitchen: {
    icon:"🍳",
    title:"厨房大战",
    text:
      "节目组临时宣布：今晚的晚餐由入住嘉宾自己完成。有人抢着掌勺，有人偷偷捣乱，而你刚走进厨房。",
    button:"进入厨房"
  },

  message: {
    icon:"💌",
    title:"匿名短信夜",
    text:
      "手机突然震动了一下。没有备注，没有名字，只有一条刚刚收到的匿名短信。",
    button:"查看短信"
  },

  gift: {
    icon:"🎁",
    title:"心动礼物",
    text:
      "节目组把一个包装精致的小盒子放在了你的房间门口。卡片上没有写名字。",
    button:"拆开看看"
  }

};

const item =
  data[type] ||
  data.kitchen;

const modal =
  document.createElement("div");

modal.className =
  "xd-modal-wrap";

modal.innerHTML = `
  <section class="xd-modal">

    <div class="xd-modal-handle"></div>

    <div
      style="
        font-size:34px;
        margin-bottom:9px;
      "
    >
      ${item.icon}
    </div>

    <div class="xd-kicker">
      TODAY'S EVENT
    </div>

    <div
      class="xd-modal-title"
      style="margin-top:4px;"
    >
      ${esc(item.title)}
    </div>

    <div
      style="
        margin-top:12px;
        font-size:12px;
        line-height:1.8;
        color:#75696b;
      "
    >
      ${esc(item.text)}
    </div>

    <div class="xd-modal-actions">

      <button
        class="xd-small-btn"
        data-close-play
      >
        稍后
      </button>

      <button
        class="xd-primary"
        style="margin-top:0;"
        data-start-play
      >
        ${esc(item.button)}
      </button>

    </div>

  </section>
`;

state.container
  .querySelector(
    ".roche-plugin-xindong-xianchang"
  )
  .appendChild(modal);

listen(
  modal.querySelector(
    "[data-close-play]"
  ),
  "click",
  () => modal.remove()
);

listen(
  modal.querySelector(
    "[data-start-play]"
  ),
  "click",
  async () => {

    modal.remove();

    if (!state.currentArchive)
      return;

    state.currentArchive.events =
      state.currentArchive.events || [];

    state.currentArchive.events.push({
      type:"play",
      play:type,
      createdAt:Date.now()
    });

    await saveCurrentArchive();

    toast(
      "玩法入口已开启。"
    );

  }
);

}

/* =========================================================
设置
========================================================= */

function openSettings() {

state.page =
  "settings";

renderPage();

}

/* =========================================================
创建恋综
========================================================= */

function openCreateArchive() {

const selected =
  new Set();

const modal =
  document.createElement("div");

modal.className =
  "xd-modal-wrap";

const candidates =
  state.candidateCharacters || [];

modal.innerHTML = `
  <section class="xd-modal">

    <div class="xd-modal-handle"></div>

    <div class="xd-kicker">
      NEW SEASON
    </div>

    <div
      class="xd-modal-title"
      style="margin-top:4px;"
    >
      创建新的恋综
    </div>

    <div class="xd-field">

      <label>
        恋综名称
      </label>

      <input
        data-title
        placeholder="例如：心动小屋"
        maxlength="30"
      >

    </div>

    <div class="xd-field">

      <label>
        本季氛围
      </label>

      <input
        data-tone
        value="温柔、暧昧、轻微修罗场"
        maxlength="60"
      >

    </div>

    <div class="xd-field">

      <label>
        选择本季嘉宾
      </label>

      <div
        style="
          font-size:10px;
          color:#8e8183;
          line-height:1.6;
        "
      >
        下面只是 Roche 的角色候选池。
        只有勾选并创建后，
        才会正式进入这个恋综档案。
      </div>

      <div
        class="xd-selector-list"
      >

        ${
          candidates.length

            ? candidates.map(char => `
                <button
                  class="xd-selector"
                  data-select="${esc(
                    char.id
                  )}"
                >

                  ${avatarHTML(char)}

                  <div
                    style="
                      min-width:0;
                      flex:1;
                    "
                  >

                    <div
                      style="
                        font-size:12px;
                        font-weight:780;
                      "
                    >
                      ${esc(
                        nameOf(char)
                      )}
                    </div>

                    <div
                      style="
                        margin-top:3px;
                        font-size:9px;
                        color:#a97983;
                      "
                    >
                      ${esc(
                        handleOf(char) ||
                        "GUEST"
                      )}
                    </div>

                  </div>

                  <div class="xd-check">
                    ✓
                  </div>

                </button>
              `).join("")

            : `
              <div
                class="xd-empty"
                style="
                  padding:22px 12px;
                "
              >
                暂时没有读取到 Roche 角色。
              </div>
            `
        }

      </div>

    </div>

    <div class="xd-field">

      <label>
        参与模式
      </label>

      <div
        style="
          display:grid;
          gap:8px;
        "
      >

        <button
          class="xd-selector selected"
          data-create-mode="immersive"
        >

          <div style="flex:1;">

            <div
              style="
                font-size:12px;
                font-weight:780;
              "
            >
              沉浸式
            </div>

            <div
              style="
                margin-top:3px;
                font-size:9px;
                color:#8e8183;
              "
            >
              只按照人设参与恋综
            </div>

          </div>

          <div class="xd-check">
            ✓
          </div>

        </button>

        <button
          class="xd-selector"
          data-create-mode="memory"
        >

          <div style="flex:1;">

            <div
              style="
                font-size:12px;
                font-weight:780;
              "
            >
              记忆融合
            </div>

            <div
              style="
                margin-top:3px;
                font-size:9px;
                color:#8e8183;
              "
            >
              人设 + 过去与你的记忆
            </div>

          </div>

          <div class="xd-check">
            ✓
          </div>

        </button>

      </div>

    </div>

    <div class="xd-modal-actions">

      <button
        class="xd-small-btn"
        data-close
      >
        取消
      </button>

      <button
        class="xd-primary"
        style="margin-top:0;"
        data-create
      >
        开始这一季
      </button>

    </div>

  </section>
`;

state.container
  .querySelector(
    ".roche-plugin-xindong-xianchang"
  )
  .appendChild(modal);

/* 嘉宾选择 */

modal
  .querySelectorAll("[data-select]")
  .forEach(button => {

    listen(
      button,
      "click",
      () => {

        const id =
          button.dataset.select;

        if (selected.has(id)) {

          selected.delete(id);

          button.classList.remove(
            "selected"
          );

        } else {

          selected.add(id);

          button.classList.add(
            "selected"
          );

        }

      }
    );

  });

/* 模式选择 */

let createMode =
  "immersive";

modal
  .querySelectorAll(
    "[data-create-mode]"
  )
  .forEach(button => {

    listen(
      button,
      "click",
      () => {

        createMode =
          button.dataset.createMode;

        modal
          .querySelectorAll(
            "[data-create-mode]"
          )
          .forEach(item => {

            item.classList.toggle(
              "selected",
              item.dataset.createMode ===
                createMode
            );

          });

      }
    );

  });

listen(
  modal.querySelector(
    "[data-close]"
  ),
  "click",
  () => modal.remove()
);

listen(
  modal,
  "click",
  e => {

    if (e.target === modal)
      modal.remove();

  }
);

listen(
  modal.querySelector(
    "[data-create]"
  ),
  "click",
  async () => {

    const title =
      modal
        .querySelector("[data-title]")
        .value.trim() ||
      "心动小屋";

    const tone =
      modal
        .querySelector("[data-tone]")
        .value.trim() ||
      "温柔、暧昧、轻微修罗场";

    const picked =
      candidates
        .filter(c =>
          selected.has(
            String(c.id)
          )
        )
        .map(c => ({
          characterId:c.id,
          name:c.name || "",
          handle:c.handle || "",
          avatar:c.avatar || "",
          bio:c.bio || "",
          personaSnapshot:
            c.persona ||
            c.bio ||
            "",

          joinedDay:1,

          isNewGuest:false
        }));

    if (!picked.length) {

      toast(
        "至少选择一位嘉宾"
      );

      return;
    }

    const archive = {

      archiveId:uid(),

      title,

      createdAt:Date.now(),

      lastSavedAt:Date.now(),

      participationMode:
        createMode,

      userPersona:{
        personaId:
          state.user?.id ||
          uid(),

        name:
          state.user?.name ||
          "",

        handle:
          state.user?.handle ||
          "",

        avatar:
          state.user?.avatar ||
          "",

        personaSnapshot:
          state.user?.persona ||
          state.user?.bio ||
          ""
      },

      characters:picked,

      /*
       * 世界书结构先预留。
       * 下一版这里会正式接入：
       * - Roche 世界书
       * - 插件自建世界书
       * - 创建时勾选多个世界书
       */
      worldbooks:[],

      seasonConfig:{
        description:
          "一档以自然互动与真实心动为核心的恋爱真人秀。",

        tone,

        forbiddenContent:""
      },

      currentDay:1,

      currentTime:"20:36",

      currentSceneLabel:
        "心动小屋 · 客厅",

      timeline:[
        {
          day:1,
          summary:"",
          fullNarrative:""
        }
      ],

      stageSummaries:[],

      relationships:{
        userToChar:{},
        charToChar:{}
      },

      privateMessages:{},

      events:[],

      lastNarrative:"",

      lastQuote:"",

      lastSummary:
        "新的恋综世界刚刚开机。"

    };

    /*
     * 给每个嘉宾建立独立关系档案。
     */

    picked.forEach(char => {

      archive.relationships
        .userToChar[char.characterId] = {

          statusLine:
            "你们的故事才刚刚开始。",

          tags:[
            "初次入住"
          ],

          history:[]

        };

    });

    state.archives.unshift({

      archiveId:
        archive.archiveId,

      title:
        archive.title,

      currentDay:1,

      characterNames:
        picked.map(
          c => c.name
        ),

      characterAvatars:
        picked.map(
          c => c.avatar
        ),

      lastSummary:
        archive.lastSummary,

      lastSavedAt:
        archive.lastSavedAt

    });

    state.currentArchive =
      archive;

    loadCurrentCharacters();

    await storageSet(
      `archive:${archive.archiveId}`,
      archive
    );

    await storageSet(
      "archiveIndex",
      state.archives
    );

    modal.remove();

    state.activeTab =
      "show";

    state.page =
      "tab";

    toast(
      `《${title}》已开机`
    );

    renderPage();

  }
);

}

/* =========================================================
当前档案嘉宾
========================================================= */

function loadCurrentCharacters() {

if (!state.currentArchive) {

  state.characters = [];

  return;
}

state.characters =
  (
    state.currentArchive.characters ||
    []
  ).map(snapshot => {

    /*
     * 优先保留档案里的快照。
     * 这样即使 Roche 后续角色资料发生变化，
     * 已经开始的恋综不会被偷偷改掉。
     */

    return {

      id:
        snapshot.characterId,

      name:
        snapshot.name,

      handle:
        snapshot.handle,

      avatar:
        snapshot.avatar,

      bio:
        snapshot.bio,

      persona:
        snapshot.personaSnapshot,

      archiveSnapshot:
        snapshot

    };

  });

}

/* =========================================================
保存档案
========================================================= */

async function saveCurrentArchive() {

if (!state.currentArchive)
  return;

state.currentArchive.lastSavedAt =
  Date.now();

const archive =
  state.currentArchive;

const indexEntry = {

  archiveId:
    archive.archiveId,

  title:
    archive.title,

  currentDay:
    archive.currentDay || 1,

  characterNames:
    (archive.characters || [])
      .map(c => c.name),

  characterAvatars:
    (archive.characters || [])
      .map(c => c.avatar),

  lastSummary:
    archive.lastSummary ||
    archive.lastNarrative?.slice(
      0,
      80
    ) ||
    "暂无剧情",

  lastSavedAt:
    archive.lastSavedAt

};

const index =
  state.archives.findIndex(
    a =>
      a.archiveId ===
      archive.archiveId
  );

if (index >= 0) {

  state.archives[index] =
    indexEntry;

} else {

  state.archives.unshift(
    indexEntry
  );

}

await storageSet(
  `archive:${archive.archiveId}`,
  archive
);

await storageSet(
  "archiveIndex",
  state.archives
);

}

/* =========================================================
Roche 数据
========================================================= */

async function loadRocheData(roche) {

/*
 * USER
 */

try {

  state.user =
    await roche
      .persona
      .getActiveUserPersona();

} catch (error) {

  console.warn(
    "[心动现场] USER读取失败",
    error
  );

  state.user = null;

}

/*
 * Roche 全角色
 *
 * 注意：
 * 这里只作为“创建恋综时”的候选池。
 * 不会直接塞进当前嘉宾。
 */

try {

  state.candidateCharacters =
    (await roche.character.list()) ||
    [];

} catch (error) {

  console.warn(
    "[心动现场] CHAR读取失败",
    error
  );

  state.candidateCharacters =
    [];

}

/*
 * 读取档案索引
 */

state.archives =
  await storageGet(
    "archiveIndex",
    []
  );

/*
 * 打开最近使用的档案。
 */

if (state.archives.length) {

  const first =
    state.archives[0];

  state.currentArchive =
    await storageGet(
      `archive:${first.archiveId}`,
      first
    );

  loadCurrentCharacters();

} else {

  state.currentArchive =
    null;

  state.characters = [];

}

}

/* =========================================================
Mount
========================================================= */

async function mount(
container,
roche
) {

state.container =
  container;

state.roche =
  roche;

state.activeTab =
  "show";

state.page =
  "tab";

state.stack = [];

state.listeners = [];

injectStyle();

renderShell();

await loadRocheData(
  roche
);

renderPage();

updateTopDay();

}

/* =========================================================
Unmount
========================================================= */

async function unmount(
container
) {

clearListeners();

const modal =
  container.querySelector(
    ".xd-modal-wrap"
  );

if (modal)
  modal.remove();

container.replaceChildren();

const style =
  document.getElementById(
    STYLE_ID
  );

if (style)
  style.remove();

state.container = null;

state.roche = null;

state.currentArchive = null;

state.characters = [];

}

/* =========================================================
注册插件
========================================================= */

window.RochePlugin.register({

id:PLUGIN_ID,

name:"心动现场",

version:"1.2.0",

apps:[

  {

    id:APP_ID,

    name:"心动现场",

    icon:"heart",

    iconImage:"",

    async mount(
      container,
      roche
    ) {

      await mount(
        container,
        roche
      );

    },

    async unmount(
      container,
      roche
    ) {

      await unmount(
        container
      );

    }

  }

]

});

})();

/* =========================================================
   《心动现场》 · 恋综模拟器
   v1.1.0 · Real Archive + Persona Snapshot Lock
   作者：linyin8945

   本版：
   1. 四页面真实切换
   2. 新建恋综流程：
      USER → 嘉宾 → 世界书 → 本季设定 → 创建
   3. USER / 嘉宾人设快照锁
   4. 多档案独立保存 / 切换 / 删除
   5. 嘉宾详情读取“锁定快照”，不再跟随原角色变化
   6. 剧情选择真正写入当前档案
   7. 为后续 AI / 弹幕 / 私信 / 关系 / DAY 系统预留数据结构
   ========================================================= */

(() => {
  "use strict";

  const PLUGIN_ID = "xindong-xianchang";
  const APP_ID = "xindong-xianchang-home";
  const STYLE_ID = "xindong-xianchang-style";

  const state = {
    roche: null,
    container: null,
    activeTab: "show",

    user: null,
    characters: [],

    archives: [],
    currentArchive: null,

    createStep: 1,
    createDraft: {
      userId: "",
      characterIds: [],
      worldbookIds: [],
      worldbookEntries: [],
      title: "",
      tone: "温柔、暧昧、轻微修罗场",
      description: "一档以自然互动与真实心动为核心的恋爱真人秀。",
    },

    listeners: [],
  };

  /* =========================================================
     基础工具
     ========================================================= */

  const escapeHTML = (value) => {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  const uid = () =>
    globalThis.crypto && crypto.randomUUID
      ? crypto.randomUUID()
      : `archive-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const displayName = (item, fallback = "未命名") =>
    item?.handle || item?.name || fallback;

  const realName = (item, fallback = "未命名") =>
    item?.name || item?.handle || fallback;

  const avatar = (item) => item?.avatar || "";

  async function safeGet(key, fallback) {
    try {
      const value = await state.roche.storage.get(key);
      return value ?? fallback;
    } catch (error) {
      console.warn("[心动现场] storage.get failed:", key, error);
      return fallback;
    }
  }

  async function safeSet(key, value) {
    try {
      await state.roche.storage.set(key, value);
      return true;
    } catch (error) {
      console.error("[心动现场] storage.set failed:", key, error);
      return false;
    }
  }

  async function safeDelete(key) {
    try {
      if (state.roche?.storage?.delete) {
        await state.roche.storage.delete(key);
      }
    } catch (error) {
      console.warn("[心动现场] storage.delete failed:", key, error);
    }
  }

  function toast(message) {
    try {
      state.roche.ui.toast(message);
    } catch {
      console.log("[心动现场]", message);
    }
  }

  function currentDay() {
    return Number(state.currentArchive?.currentDay || 1);
  }

  /* =========================================================
     CSS
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
        --xd-bg: #f6f1f1;
        --xd-paper: rgba(255,255,255,.82);
        --xd-paper-strong: #fffafa;
        --xd-pink: #b88791;
        --xd-pink-dark: #855d67;
        --xd-pink-soft: #ead9dc;
        --xd-pink-faint: #f1e5e6;
        --xd-text: #41383a;
        --xd-muted: #8e8183;
        --xd-line: rgba(117,91,97,.13);
        --xd-shadow: 0 14px 40px rgba(102,73,80,.08);

        position: relative;
        width: 100%;
        height: 100%;
        min-height: 100%;
        overflow: hidden;

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

        color: var(--xd-text);

        font-family:
          -apple-system,
          BlinkMacSystemFont,
          "SF Pro Display",
          "SF Pro Text",
          "Helvetica Neue",
          Arial,
          sans-serif;

        -webkit-font-smoothing: antialiased;

        display: flex;
        flex-direction: column;
      }

      .roche-plugin-xindong-xianchang button,
      .roche-plugin-xindong-xianchang input,
      .roche-plugin-xindong-xianchang textarea,
      .roche-plugin-xindong-xianchang select {
        font: inherit;
      }

      button {
        -webkit-tap-highlight-color: transparent;
      }

      .xd-topbar {
        flex: 0 0 auto;
        height: 72px;
        padding: 12px 14px 8px;

        display: flex;
        align-items: flex-end;
        gap: 10px;

        background: rgba(249,246,245,.78);
        border-bottom: 1px solid var(--xd-line);

        backdrop-filter: blur(22px) saturate(125%);
        -webkit-backdrop-filter: blur(22px) saturate(125%);

        position: relative;
        z-index: 20;
      }

      .xd-back {
        width: 40px;
        height: 40px;
        flex: 0 0 40px;

        border: 0;
        border-radius: 14px;

        background: rgba(255,255,255,.64);
        color: var(--xd-pink-dark);

        display: grid;
        place-items: center;

        font-size: 25px;
        line-height: 1;

        cursor: pointer;

        box-shadow:
          0 4px 18px rgba(101,73,80,.06);
      }

      .xd-back:active {
        transform: scale(.96);
      }

      .xd-heading {
        min-width: 0;
        flex: 1;
        padding-bottom: 2px;
      }

      .xd-eyebrow {
        font-size: 10px;
        letter-spacing: .18em;
        color: var(--xd-pink);
        font-weight: 700;
        margin-bottom: 2px;
      }

      .xd-title {
        font-size: 21px;
        line-height: 1.15;
        letter-spacing: -.03em;
        font-weight: 760;

        color: #403638;

        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .xd-topday {
        flex: 0 0 auto;

        padding: 8px 11px;

        border-radius: 13px;

        background: rgba(255,255,255,.65);
        border: 1px solid rgba(145,110,118,.10);

        text-align: right;

        margin-bottom: 1px;
      }

      .xd-topday-main {
        display: block;

        font-size: 11px;
        font-weight: 750;
        letter-spacing: .08em;

        color: var(--xd-pink-dark);
      }

      .xd-topday-sub {
        display: block;

        margin-top: 2px;

        font-size: 9px;
        color: var(--xd-muted);
        letter-spacing: .12em;
      }

      .xd-content {
        flex: 1 1 auto;
        min-height: 0;

        overflow: hidden;

        position: relative;
      }

      .xd-page {
        width: 100%;
        height: 100%;

        overflow-y: auto;

        padding: 18px 16px 104px;

        scrollbar-width: none;
      }

      .xd-page::-webkit-scrollbar {
        display: none;
      }

      .xd-bottom {
        flex: 0 0 auto;

        height: 82px;

        padding: 8px 10px 15px;

        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 5px;

        background: rgba(250,247,246,.88);
        border-top: 1px solid var(--xd-line);

        backdrop-filter: blur(22px) saturate(125%);
        -webkit-backdrop-filter: blur(22px) saturate(125%);

        position: relative;
        z-index: 20;
      }

      .xd-tab {
        border: 0;
        background: transparent;

        color: #a09597;

        border-radius: 16px;

        cursor: pointer;

        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;

        gap: 4px;

        transition: .18s ease;
      }

      .xd-tab-icon {
        width: 29px;
        height: 29px;

        border-radius: 11px;

        display: grid;
        place-items: center;

        font-size: 16px;

        transition: .18s ease;
      }

      .xd-tab-label {
        font-size: 10px;
        font-weight: 650;
        letter-spacing: .03em;
      }

      .xd-tab.active {
        color: var(--xd-pink-dark);
      }

      .xd-tab.active .xd-tab-icon {
        background: var(--xd-pink-faint);

        box-shadow:
          inset 0 0 0 1px rgba(184,135,145,.10);

        transform: translateY(-1px);
      }

      .xd-kicker {
        color: var(--xd-pink);

        font-size: 10px;
        letter-spacing: .18em;

        font-weight: 750;

        text-transform: uppercase;
      }

      .xd-hero {
        margin-top: 7px;

        padding: 22px 20px 20px;

        border-radius: 27px;

        min-height: 230px;

        position: relative;
        overflow: hidden;

        background:
          linear-gradient(
            135deg,
            rgba(255,255,255,.90),
            rgba(245,229,231,.80)
          );

        border: 1px solid rgba(157,116,124,.13);

        box-shadow: var(--xd-shadow);
      }

      .xd-hero::before {
        content: "";

        position: absolute;

        width: 190px;
        height: 190px;

        border-radius: 50%;

        right: -55px;
        top: -80px;

        background: rgba(184,135,145,.16);
      }

      .xd-hero::after {
        content: "";

        position: absolute;

        width: 120px;
        height: 120px;

        border-radius: 50%;

        right: 35px;
        bottom: -75px;

        border: 1px solid rgba(184,135,145,.20);
      }

      .xd-hero > * {
        position: relative;
        z-index: 1;
      }

      .xd-hero-title {
        margin: 8px 0 7px;

        font-size: 32px;
        line-height: 1.05;

        letter-spacing: -.055em;

        font-weight: 800;
      }

      .xd-hero-sub {
        max-width: 300px;

        color: #75696b;

        font-size: 13px;
        line-height: 1.7;
      }

      .xd-live {
        display: inline-flex;

        align-items: center;
        gap: 6px;

        margin-top: 19px;

        padding: 7px 10px;

        border-radius: 999px;

        background: rgba(255,255,255,.70);

        color: var(--xd-pink-dark);

        font-size: 10px;
        font-weight: 750;
        letter-spacing: .08em;
      }

      .xd-live-dot {
        width: 6px;
        height: 6px;

        border-radius: 50%;

        background: #b88791;

        box-shadow:
          0 0 0 4px rgba(184,135,145,.12);
      }

      .xd-section-head {
        display: flex;

        align-items: flex-end;
        justify-content: space-between;

        gap: 12px;

        margin: 22px 2px 10px;
      }

      .xd-section-title {
        font-size: 17px;

        font-weight: 780;

        letter-spacing: -.025em;
      }

      .xd-section-note {
        font-size: 10px;
        color: var(--xd-muted);
      }

      .xd-scene {
        border-radius: 23px;

        background: rgba(255,255,255,.72);

        border: 1px solid var(--xd-line);

        padding: 17px;

        box-shadow:
          0 8px 25px rgba(96,70,76,.045);
      }

      .xd-scene-label {
        font-size: 10px;

        color: var(--xd-pink);

        letter-spacing: .12em;

        font-weight: 750;
      }

      .xd-narrative {
        margin-top: 10px;

        font-size: 14px;

        line-height: 1.85;

        color: #4b4143;

        white-space: pre-wrap;
      }

      .xd-quote {
        margin-top: 13px;

        padding: 12px 13px;

        border-left: 2px solid var(--xd-pink);

        background: rgba(245,231,233,.48);

        border-radius: 0 13px 13px 0;

        font-size: 13px;

        line-height: 1.65;

        color: #65575a;
      }

      .xd-choice-grid {
        display: grid;
        gap: 9px;
      }

      .xd-choice {
        width: 100%;

        text-align: left;

        border: 1px solid rgba(143,105,113,.12);

        background: rgba(255,255,255,.78);

        color: #514548;

        border-radius: 17px;

        padding: 14px 15px;

        cursor: pointer;

        box-shadow:
          0 5px 16px rgba(100,73,79,.035);

        transition: .16s ease;
      }

      .xd-choice:hover {
        border-color: rgba(184,135,145,.35);
        background: #fffafa;
      }

      .xd-choice:active {
        transform: scale(.985);
      }

      .xd-choice-no {
        display: inline-block;

        width: 23px;

        color: var(--xd-pink);

        font-size: 11px;

        font-weight: 800;
      }

      .xd-custom-action {
        margin-top: 10px;

        width: 100%;

        border: 1px dashed rgba(167,121,131,.25);

        background: rgba(255,255,255,.48);

        color: var(--xd-pink-dark);

        border-radius: 17px;

        padding: 13px 15px;

        text-align: left;

        cursor: pointer;

        font-size: 11px;

        font-weight: 720;
      }

      .xd-danmu {
        display: flex;

        flex-wrap: wrap;

        gap: 7px;
      }

      .xd-danmu span {
        padding: 7px 10px;

        border-radius: 999px;

        background: rgba(255,255,255,.66);

        border: 1px solid rgba(140,104,112,.10);

        color: #75686b;

        font-size: 10px;
      }

      .xd-card-grid {
        display: grid;
        gap: 11px;
      }

      .xd-guest-card {
        display: flex;

        align-items: center;

        gap: 13px;

        padding: 13px;

        border-radius: 20px;

        background: rgba(255,255,255,.76);

        border: 1px solid var(--xd-line);

        box-shadow:
          0 7px 22px rgba(101,73,80,.045);

        cursor: pointer;

        transition: .16s ease;
      }

      .xd-guest-card:active {
        transform: scale(.985);
      }

      .xd-avatar {
        width: 54px;
        height: 54px;

        flex: 0 0 54px;

        border-radius: 17px;

        overflow: hidden;

        background:
          linear-gradient(
            145deg,
            #e8d5d8,
            #f4e8e9
          );

        display: grid;
        place-items: center;

        color: var(--xd-pink-dark);

        font-size: 19px;
        font-weight: 800;
      }

      .xd-avatar img {
        width: 100%;
        height: 100%;

        object-fit: cover;

        display: block;
      }

      .xd-guest-main {
        min-width: 0;
        flex: 1;
      }

      .xd-guest-name {
        font-size: 15px;
        font-weight: 780;
      }

      .xd-guest-handle {
        margin-top: 3px;

        font-size: 10px;

        color: var(--xd-pink);
      }

      .xd-guest-bio {
        margin-top: 5px;

        font-size: 11px;

        color: var(--xd-muted);

        white-space: nowrap;

        overflow: hidden;

        text-overflow: ellipsis;
      }

      .xd-arrow {
        color: #b3a5a8;

        font-size: 18px;
      }

      .xd-relation {
        padding: 17px;

        border-radius: 22px;

        background: rgba(255,255,255,.76);

        border: 1px solid var(--xd-line);

        box-shadow:
          0 7px 22px rgba(101,73,80,.045);
      }

      .xd-relation-top {
        display: flex;

        align-items: center;

        gap: 11px;
      }

      .xd-relation-names {
        flex: 1;
      }

      .xd-relation-name {
        font-size: 14px;

        font-weight: 780;
      }

      .xd-relation-status {
        margin-top: 3px;

        color: var(--xd-muted);

        font-size: 10px;
      }

      .xd-tags {
        display: flex;

        flex-wrap: wrap;

        gap: 6px;

        margin-top: 13px;
      }

      .xd-tag {
        padding: 6px 9px;

        border-radius: 999px;

        background: var(--xd-pink-faint);

        color: var(--xd-pink-dark);

        font-size: 9px;

        font-weight: 700;
      }

      .xd-empty {
        text-align: center;

        padding: 38px 20px;

        border-radius: 23px;

        border: 1px dashed rgba(140,104,112,.18);

        background: rgba(255,255,255,.42);
      }

      .xd-empty-icon {
        font-size: 27px;

        margin-bottom: 9px;

        opacity: .8;
      }

      .xd-empty-title {
        font-size: 15px;

        font-weight: 780;
      }

      .xd-empty-text {
        margin-top: 6px;

        font-size: 11px;

        line-height: 1.7;

        color: var(--xd-muted);
      }

      .xd-primary {
        margin-top: 15px;

        border: 0;

        border-radius: 15px;

        padding: 11px 16px;

        background: #a97983;

        color: white;

        font-size: 12px;

        font-weight: 750;

        cursor: pointer;

        box-shadow:
          0 7px 18px rgba(132,91,101,.18);
      }

      .xd-primary:active {
        transform: scale(.98);
      }

      .xd-secondary {
        border: 1px solid rgba(140,104,112,.13);

        background: rgba(255,255,255,.65);

        color: var(--xd-pink-dark);

        border-radius: 15px;

        padding: 11px 16px;

        font-size: 12px;

        font-weight: 720;

        cursor: pointer;
      }

      .xd-archive {
        position: relative;

        padding: 18px;

        border-radius: 23px;

        background:
          linear-gradient(
            140deg,
            rgba(255,255,255,.88),
            rgba(245,229,231,.70)
          );

        border: 1px solid var(--xd-line);

        box-shadow: var(--xd-shadow);

        overflow: hidden;
      }

      .xd-archive::after {
        content: "ON AIR";

        position: absolute;

        right: -19px;
        top: 13px;

        transform: rotate(34deg);

        padding: 4px 27px;

        background: rgba(184,135,145,.12);

        color: var(--xd-pink);

        font-size: 8px;

        font-weight: 800;

        letter-spacing: .18em;
      }

      .xd-archive-title {
        font-size: 20px;

        font-weight: 800;

        letter-spacing: -.035em;
      }

      .xd-archive-meta {
        margin-top: 6px;

        font-size: 10px;

        color: var(--xd-muted);
      }

      .xd-archive-people {
        display: flex;

        margin-top: 15px;

        align-items: center;
      }

      .xd-mini-avatar {
        width: 34px;
        height: 34px;

        border-radius: 12px;

        overflow: hidden;

        background: #eadbde;

        border: 2px solid #fffafa;

        margin-left: -7px;

        display: grid;

        place-items: center;

        color: var(--xd-pink-dark);

        font-size: 11px;

        font-weight: 800;
      }

      .xd-mini-avatar:first-child {
        margin-left: 0;
      }

      .xd-mini-avatar img {
        width: 100%;
        height: 100%;

        object-fit: cover;
      }

      .xd-archive-summary {
        margin-top: 13px;

        color: #76696b;

        font-size: 11px;

        line-height: 1.7;
      }

      .xd-archive-actions {
        display: flex;

        gap: 8px;

        margin-top: 14px;
      }

      .xd-small-btn {
        flex: 1;

        border: 1px solid rgba(140,104,112,.13);

        background: rgba(255,255,255,.65);

        color: var(--xd-pink-dark);

        border-radius: 13px;

        padding: 9px;

        font-size: 10px;

        font-weight: 720;

        cursor: pointer;
      }

      .xd-new-archive {
        width: 100%;

        margin-top: 11px;

        padding: 15px;

        border-radius: 19px;

        border: 1px dashed rgba(167,121,131,.25);

        background: rgba(255,255,255,.36);

        color: var(--xd-pink-dark);

        font-size: 12px;

        font-weight: 750;

        cursor: pointer;
      }

      .xd-profile {
        display: flex;

        align-items: center;

        gap: 14px;

        padding: 17px;

        border-radius: 22px;

        background: rgba(255,255,255,.76);

        border: 1px solid var(--xd-line);
      }

      .xd-profile .xd-avatar {
        width: 62px;
        height: 62px;

        flex-basis: 62px;

        border-radius: 19px;
      }

      .xd-profile-name {
        font-size: 17px;

        font-weight: 800;
      }

      .xd-profile-handle {
        margin-top: 3px;

        color: var(--xd-pink);

        font-size: 10px;
      }

      .xd-profile-bio {
        margin-top: 6px;

        color: var(--xd-muted);

        font-size: 11px;

        line-height: 1.5;
      }

      .xd-modal-wrap {
        position: absolute;

        inset: 0;

        z-index: 100;

        background: rgba(67,51,55,.20);

        backdrop-filter: blur(5px);

        display: flex;

        align-items: flex-end;

        justify-content: center;
      }

      .xd-modal {
        width: 100%;

        max-height: 90%;

        overflow-y: auto;

        background: #fbf8f7;

        border-radius: 28px 28px 0 0;

        padding: 21px 17px 28px;

        box-shadow:
          0 -12px 45px rgba(72,51,57,.15);
      }

      .xd-modal-handle {
        width: 37px;
        height: 4px;

        border-radius: 99px;

        background: #d7c8ca;

        margin: -5px auto 17px;
      }

      .xd-modal-title {
        font-size: 20px;

        font-weight: 800;

        letter-spacing: -.03em;
      }

      .xd-stepper {
        display: grid;

        grid-template-columns: repeat(5, 1fr);

        gap: 5px;

        margin: 15px 0 17px;
      }

      .xd-step {
        text-align: center;

        padding: 7px 3px;

        border-radius: 10px;

        background: #f0e8e9;

        color: #a18f92;

        font-size: 8px;

        font-weight: 750;
      }

      .xd-step.active {
        background: var(--xd-pink-soft);

        color: var(--xd-pink-dark);
      }

      .xd-step.done {
        background: #eadfe1;

        color: #92727b;
      }

      .xd-field {
        margin-top: 15px;
      }

      .xd-field label {
        display: block;

        font-size: 10px;

        color: var(--xd-muted);

        font-weight: 700;

        margin-bottom: 7px;
      }

      .xd-field input,
      .xd-field textarea {
        width: 100%;

        border: 1px solid rgba(140,104,112,.15);

        background: white;

        color: var(--xd-text);

        border-radius: 14px;

        padding: 12px;

        outline: none;
      }

      .xd-field textarea {
        min-height: 90px;

        resize: vertical;
      }

      .xd-field input:focus,
      .xd-field textarea:focus {
        border-color: rgba(184,135,145,.45);

        box-shadow:
          0 0 0 3px rgba(184,135,145,.08);
      }

      .xd-select-card {
        display: flex;

        align-items: center;

        gap: 11px;

        padding: 11px;

        border-radius: 17px;

        background: white;

        border: 1px solid rgba(140,104,112,.10);

        cursor: pointer;

        margin-bottom: 7px;
      }

      .xd-select-card.selected {
        border-color: rgba(184,135,145,.48);

        background: #fff8f9;

        box-shadow:
          0 0 0 2px rgba(184,135,145,.07);
      }

      .xd-select-card.disabled {
        opacity: .55;
        cursor: default;
      }

      .xd-select-check {
        width: 23px;
        height: 23px;

        flex: 0 0 23px;

        border-radius: 8px;

        display: grid;

        place-items: center;

        background: #f0e7e8;

        color: transparent;

        font-size: 12px;

        font-weight: 800;
      }

      .xd-select-card.selected .xd-select-check {
        background: var(--xd-pink);

        color: white;
      }

      .xd-select-info {
        min-width: 0;
        flex: 1;
      }

      .xd-select-name {
        font-size: 12px;
        font-weight: 780;
      }

      .xd-select-sub {
        margin-top: 3px;

        font-size: 9px;

        color: var(--xd-muted);

        white-space: nowrap;

        overflow: hidden;

        text-overflow: ellipsis;
      }

      .xd-create-preview {
        padding: 14px;

        border-radius: 18px;

        background:
          linear-gradient(
            135deg,
            rgba(255,255,255,.9),
            rgba(245,229,231,.55)
          );

        border: 1px solid var(--xd-line);
      }

      .xd-create-preview-title {
        font-size: 16px;

        font-weight: 800;
      }

      .xd-create-preview-meta {
        margin-top: 5px;

        font-size: 10px;

        color: var(--xd-muted);
      }

      .xd-create-preview-list {
        margin-top: 11px;

        display: flex;

        flex-wrap: wrap;

        gap: 6px;
      }

      .xd-create-preview-tag {
        padding: 6px 9px;

        border-radius: 999px;

        background: rgba(255,255,255,.72);

        color: var(--xd-pink-dark);

        font-size: 9px;

        font-weight: 700;
      }

      .xd-modal-actions {
        display: flex;

        gap: 8px;

        margin-top: 18px;
      }

      .xd-modal-actions button {
        flex: 1;
      }

      .xd-message-list {
        display: grid;
        gap: 8px;
        margin-top: 10px;
      }

      .xd-message {
        padding: 11px 13px;

        border-radius: 15px;

        background: white;

        border: 1px solid var(--xd-line);

        font-size: 11px;

        line-height: 1.65;

        color: #675a5d;
      }

      .xd-message.me {
        background: #f1e3e5;
        margin-left: 30px;
      }

      .xd-message.them {
        margin-right: 30px;
      }

      .xd-message-time {
        display: block;

        margin-top: 4px;

        font-size: 8px;

        color: #a18f92;
      }

      .xd-custom-input {
        margin-top: 12px;

        width: 100%;

        min-height: 82px;

        border-radius: 16px;

        border: 1px solid rgba(140,104,112,.15);

        padding: 12px;

        resize: vertical;

        outline: none;

        background: white;
      }

      .xd-event {
        padding: 12px 13px;

        border-radius: 17px;

        background: rgba(255,255,255,.68);

        border: 1px solid var(--xd-line);

        font-size: 10px;

        color: #776a6c;

        line-height: 1.65;
      }

      .xd-event + .xd-event {
        margin-top: 7px;
      }

      @media (min-width: 700px) {
        .roche-plugin-xindong-xianchang {
          max-width: 520px;

          margin: 0 auto;

          border-left: 1px solid rgba(120,90,96,.08);

          border-right: 1px solid rgba(120,90,96,.08);
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
          >‹</button>

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
            >DAY 01</span>

            <span class="xd-topday-sub">
              ON AIR
            </span>

          </div>

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
            <span class="xd-tab-icon">▣</span>
            <span class="xd-tab-label">节目</span>
          </button>

          <button
            class="xd-tab"
            data-tab="guests"
          >
            <span class="xd-tab-icon">♧</span>
            <span class="xd-tab-label">嘉宾</span>
          </button>

          <button
            class="xd-tab"
            data-tab="relations"
          >
            <span class="xd-tab-icon">♡</span>
            <span class="xd-tab-label">关系</span>
          </button>

          <button
            class="xd-tab"
            data-tab="archives"
          >
            <span class="xd-tab-icon">▤</span>
            <span class="xd-tab-label">档案</span>
          </button>

        </nav>

      </div>
    `;

    state.container
      .querySelectorAll("[data-tab]")
      .forEach((button) => {

        const handler = () => {
          state.activeTab = button.dataset.tab;
          renderPage();
          updateTopDay();
        };

        button.addEventListener("click", handler);

        state.listeners.push(() => {
          button.removeEventListener("click", handler);
        });
      });

    const back =
      state.container.querySelector(
        "[data-action='back']"
      );

    const backHandler = () => {
      try {
        state.roche.ui.closeApp();
      } catch {
        toast("无法返回 Roche");
      }
    };

    back.addEventListener("click", backHandler);

    state.listeners.push(() => {
      back.removeEventListener("click", backHandler);
    });
  }

  /* =========================================================
     Avatar
     ========================================================= */

  function avatarHTML(item, className = "xd-avatar") {
    const src = avatar(item);

    if (src) {
      return `
        <div class="${className}">
          <img
            src="${escapeHTML(src)}"
            alt=""
          >
        </div>
      `;
    }

    const text = escapeHTML(
      realName(item, "♡").slice(0, 1)
    );

    return `
      <div class="${className}">
        ${text}
      </div>
    `;
  }

  /* =========================================================
     Page Head
     ========================================================= */

  function pageHead(kicker, title, note = "") {
    return `
      <div class="xd-kicker">
        ${escapeHTML(kicker)}
      </div>

      <div
        class="xd-section-head"
        style="margin-top:5px;"
      >

        <div class="xd-section-title">
          ${escapeHTML(title)}
        </div>

        ${
          note
            ? `
              <div class="xd-section-note">
                ${escapeHTML(note)}
              </div>
            `
            : ""
        }

      </div>
    `;
  }

  /* =========================================================
     Show Page
     ========================================================= */

  function renderShow() {
    const archive = state.currentArchive;

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

    const danmu =
      archive?.danmu?.length
        ? archive.danmu.slice(-8)
        : [
            "这气氛突然不对劲了",
            "救命谁先移开视线",
            "节目组你最好有事",
            "我已经开始期待了"
          ];

    return `
      <div class="xd-page">

        ${pageHead(
          "TONIGHT · LIVE",
          "正在播出",
          "实时节目现场"
        )}

        <section class="xd-hero">

          <div class="xd-kicker">
            EPISODE ${String(day).padStart(2, "0")}
          </div>

          <div class="xd-hero-title">
            ${escapeHTML(
              archive?.title || "心动小屋"
            )}
          </div>

          <div class="xd-hero-sub">
            一场关于靠近、试探与心动的真人秀。
            没有人知道下一秒谁会先动心。
          </div>

          <div class="xd-live">

            <span class="xd-live-dot"></span>

            LIVE · ${escapeHTML(scene)}

          </div>

        </section>

        <div class="xd-section-head">

          <div class="xd-section-title">
            今晚的现场
          </div>

          <div class="xd-section-note">
            DAY ${String(day).padStart(2, "0")}
            · ${escapeHTML(
              archive?.currentTime || "20:36"
            )}
          </div>

        </div>

        <section class="xd-scene">

          <div class="xd-scene-label">
            ${escapeHTML(scene)}
          </div>

          <div class="xd-narrative">
            ${escapeHTML(narrative)}
          </div>

          <div class="xd-quote">
            ${escapeHTML(quote)}
          </div>

        </section>

        <div class="xd-section-head">

          <div class="xd-section-title">
            你会怎么做？
          </div>

          <div class="xd-section-note">
            没有标准答案
          </div>

        </div>

        <div class="xd-choice-grid">

          <button
            class="xd-choice"
            data-choice="1"
          >
            <span class="xd-choice-no">
              01
            </span>
            抬起眼，直接回应他的目光。
          </button>

          <button
            class="xd-choice"
            data-choice="2"
          >
            <span class="xd-choice-no">
              02
            </span>
            若无其事地转身，把话题带向别处。
          </button>

          <button
            class="xd-choice"
            data-choice="3"
          >
            <span class="xd-choice-no">
              03
            </span>
            笑了一下，反过来问他为什么这么说。
          </button>

        </div>

        <button
          class="xd-custom-action"
          data-custom-action
        >
          ✎ 自定义行动
          <span style="float:right;">›</span>
        </button>

        <div class="xd-section-head">

          <div class="xd-section-title">
            观众席
          </div>

          <div class="xd-section-note">
            LIVE DANMU
          </div>

        </div>

        <div class="xd-danmu">

          ${danmu.map(item => `
            <span>
              ${escapeHTML(item)}
            </span>
          `).join("")}

        </div>

        ${
          archive?.events?.length
            ? `
              <div class="xd-section-head">
                <div class="xd-section-title">
                  今日事件
                </div>
                <div class="xd-section-note">
                  TIMELINE
                </div>
              </div>

              ${archive.events.slice(-5).reverse().map(event => `
                <div class="xd-event">
                  ${escapeHTML(event.text || event.summary || "")}
                </div>
              `).join("")}
            `
            : ""
        }

      </div>
    `;
  }

  /* =========================================================
     Guests
     ========================================================= */

  function getArchiveCharacters() {
    if (state.currentArchive?.characters?.length) {
      return state.currentArchive.characters;
    }

    return state.characters || [];
  }

  function renderGuests() {
    const chars = getArchiveCharacters();

    const userSnapshot =
      state.currentArchive?.userPersona ||
      state.user;

    return `
      <div class="xd-page">

        ${pageHead(
          "THE CAST",
          "本季嘉宾",
          `${chars.length} 位已加入`
        )}

        <div class="xd-profile">

          ${avatarHTML(userSnapshot)}

          <div>

            <div class="xd-profile-name">
              ${escapeHTML(
                realName(
                  userSnapshot,
                  "我的人设"
                )
              )}
            </div>

            <div class="xd-profile-handle">
              ${
                userSnapshot?.handle
                  ? "@" +
                    escapeHTML(
                      userSnapshot.handle
                    )
                  : "USER · LOCKED"
              }
            </div>

            <div class="xd-profile-bio">
              ${escapeHTML(
                userSnapshot?.personaSnapshot ||
                userSnapshot?.bio ||
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
            PERSONA LOCKED
          </div>

        </div>

        <div class="xd-card-grid">

          ${
            chars.length
              ? chars.map(char => `

                <div
                  class="xd-guest-card"
                  data-guest-id="${escapeHTML(
                    char.characterId ||
                    char.id ||
                    ""
                  )}"
                >

                  ${avatarHTML(char)}

                  <div class="xd-guest-main">

                    <div class="xd-guest-name">
                      ${escapeHTML(
                        realName(char)
                      )}
                    </div>

                    <div class="xd-guest-handle">
                      ${
                        char.handle
                          ? "@" +
                            escapeHTML(
                              char.handle
                            )
                          : "嘉宾"
                      }
                    </div>

                    <div class="xd-guest-bio">
                      ${escapeHTML(
                        char.personaSnapshot ||
                        char.bio ||
                        "这个人没有留下简介。"
                      )}
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
                    还没有嘉宾
                  </div>

                  <div class="xd-empty-text">
                    创建恋综档案后，从 Roche
                    角色中选择你的入住嘉宾。
                  </div>

                </div>
              `
          }

        </div>

      </div>
    `;
  }

  /* =========================================================
     Relations
     ========================================================= */

  function renderRelations() {
    const chars = getArchiveCharacters();

    const relations =
      state.currentArchive
        ?.relationships
        ?.userToChar || {};

    return `
      <div class="xd-page">

        ${pageHead(
          "RELATIONSHIP",
          "关系温度",
          "只记录故事留下的痕迹"
        )}

        <div
          class="xd-hero"
          style="min-height:150px;padding:19px;"
        >

          <div class="xd-kicker">
            NO SCORE · NO ANSWER
          </div>

          <div
            class="xd-hero-title"
            style="font-size:25px;"
          >
            心动没有刻度。
          </div>

          <div class="xd-hero-sub">
            这里不会告诉你谁“好感度最高”。
            关系只会随着节目里真正发生的事慢慢改变。
          </div>

        </div>

        <div class="xd-section-head">

          <div class="xd-section-title">
            USER × 嘉宾
          </div>

          <div class="xd-section-note">
            ${chars.length} 条关系线
          </div>

        </div>

        <div class="xd-card-grid">

          ${
            chars.length
              ? chars.map(char => {

                  const id =
                    char.characterId ||
                    char.id;

                  const relation =
                    relations[id] || {
                      tags: [],
                      statusLine: ""
                    };

                  const tags =
                    relation.tags?.length
                      ? relation.tags
                      : ["尚未定义"];

                  return `

                    <div class="xd-relation">

                      <div class="xd-relation-top">

                        ${avatarHTML(char)}

                        <div class="xd-relation-names">

                          <div class="xd-relation-name">
                            ${escapeHTML(
                              realName(char)
                            )}
                          </div>

                          <div class="xd-relation-status">
                            ${escapeHTML(
                              relation.statusLine ||
                              "你们的故事才刚刚开始。"
                            )}
                          </div>

                        </div>

                      </div>

                      <div class="xd-tags">

                        ${tags.map(tag => `
                          <span class="xd-tag">
                            ${escapeHTML(tag)}
                          </span>
                        `).join("")}

                      </div>

                    </div>

                  `;
                }).join("")
              : `
                <div class="xd-empty">

                  <div class="xd-empty-icon">
                    ♡
                  </div>

                  <div class="xd-empty-title">
                    关系线尚未展开
                  </div>

                  <div class="xd-empty-text">
                    先邀请一些嘉宾进入你的恋综吧。
                  </div>

                </div>
              `
          }

        </div>

      </div>
    `;
  }

  /* =========================================================
     Archives
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
          style="padding:27px 18px;margin-bottom:11px;"
        >

          <div class="xd-empty-icon">
            ✦
          </div>

          <div class="xd-empty-title">
            一个档案，就是一个完整世界
          </div>

          <div class="xd-empty-text">
            不同恋综之间的人设、剧情、关系和记忆彼此独立。
          </div>

        </div>

        <div class="xd-card-grid">

          ${
            state.archives.length
              ? state.archives.map(archive => `

                <article class="xd-archive">

                  <div class="xd-archive-title">
                    ${escapeHTML(
                      archive.title
                    )}
                  </div>

                  <div class="xd-archive-meta">

                    DAY
                    ${String(
                      archive.currentDay || 1
                    ).padStart(2, "0")}

                    ·

                    ${
                      escapeHTML(
                        String(
                          (
                            archive.characterNames ||
                            []
                          ).length
                        )
                      )
                    }

                    位嘉宾

                  </div>

                  <div class="xd-archive-people">

                    ${
                      (
                        archive.characterAvatars ||
                        []
                      )
                        .slice(0, 5)
                        .map((src, i) =>
                          src
                            ? `
                              <div class="xd-mini-avatar">
                                <img
                                  src="${escapeHTML(src)}"
                                  alt=""
                                >
                              </div>
                            `
                            : `
                              <div class="xd-mini-avatar">
                                ${i + 1}
                              </div>
                            `
                        )
                        .join("")
                    }

                  </div>

                  <div class="xd-archive-summary">
                    ${escapeHTML(
                      archive.lastSummary ||
                      "还没有发生故事。"
                    )}
                  </div>

                  <div class="xd-archive-actions">

                    <button
                      class="xd-small-btn"
                      data-open-archive="${escapeHTML(
                        archive.archiveId
                      )}"
                    >
                      ${
                        state.currentArchive?.archiveId ===
                        archive.archiveId
                          ? "当前档案"
                          : "进入档案"
                      }
                    </button>

                    <button
                      class="xd-small-btn"
                      data-delete-archive="${escapeHTML(
                        archive.archiveId
                      )}"
                    >
                      删除
                    </button>

                  </div>

                </article>

              `).join("")
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
     Render Page
     ========================================================= */

  function renderPage() {
    const content =
      state.container?.querySelector(
        "[data-content]"
      );

    if (!content) return;

    content.innerHTML =
      state.activeTab === "show"
        ? renderShow()
        : state.activeTab === "guests"
          ? renderGuests()
          : state.activeTab === "relations"
            ? renderRelations()
            : renderArchives();

    bindPageEvents();

    state.container
      .querySelectorAll("[data-tab]")
      .forEach(button => {
        button.classList.toggle(
          "active",
          button.dataset.tab ===
            state.activeTab
        );
      });
  }

  /* =========================================================
     Page Events
     ========================================================= */

  function bindPageEvents() {

    state.container
      .querySelectorAll("[data-choice]")
      .forEach(button => {

        const handler = async () => {

          if (!state.currentArchive) {
            toast("请先创建一个恋综档案");
            return;
          }

          const choice =
            Number(button.dataset.choice);

          await applyChoice(choice);
        };

        button.addEventListener(
          "click",
          handler
        );

        state.listeners.push(() => {
          button.removeEventListener(
            "click",
            handler
          );
        });
      });

    state.container
      .querySelectorAll("[data-custom-action]")
      .forEach(button => {

        const handler = () => {
          if (!state.currentArchive) {
            toast("请先创建一个恋综档案");
            return;
          }

          openCustomAction();
        };

        button.addEventListener(
          "click",
          handler
        );

        state.listeners.push(() => {
          button.removeEventListener(
            "click",
            handler
          );
        });
      });

    state.container
      .querySelectorAll("[data-new-archive]")
      .forEach(button => {

        const handler = () =>
          openCreateArchive();

        button.addEventListener(
          "click",
          handler
        );

        state.listeners.push(() => {
          button.removeEventListener(
            "click",
            handler
          );
        });
      });

    state.container
      .querySelectorAll("[data-open-archive]")
      .forEach(button => {

        const handler = async () => {

          const id =
            button.dataset.openArchive;

          const index =
            state.archives.find(
              archive =>
                archive.archiveId === id
            );

          if (!index) return;

          const full =
            await safeGet(
              `archive:${id}`,
              null
            );

          state.currentArchive =
            full || index;

          state.activeTab = "show";

          renderPage();
          updateTopDay();

          toast(
            `已进入《${state.currentArchive.title}》`
          );
        };

        button.addEventListener(
          "click",
          handler
        );

        state.listeners.push(() => {
          button.removeEventListener(
            "click",
            handler
          );
        });
      });

    state.container
      .querySelectorAll("[data-delete-archive]")
      .forEach(button => {

        const handler = async () => {

          const id =
            button.dataset.deleteArchive;

          let ok = true;

          try {
            ok =
              await state.roche.ui.confirm({
                title: "删除恋综档案",
                message:
                  "确定删除这个完整恋综世界吗？此操作无法恢复。"
              });
          } catch {}

          if (!ok) return;

          state.archives =
            state.archives.filter(
              archive =>
                archive.archiveId !== id
            );

          await safeSet(
            "archiveIndex",
            state.archives
          );

          await safeDelete(
            `archive:${id}`
          );

          if (
            state.currentArchive?.archiveId === id
          ) {
            state.currentArchive =
              state.archives.length
                ? await safeGet(
                    `archive:${state.archives[0].archiveId}`,
                    state.archives[0]
                  )
                : null;
          }

          toast("档案已删除");

          renderPage();
          updateTopDay();
        };

        button.addEventListener(
          "click",
          handler
        );

        state.listeners.push(() => {
          button.removeEventListener(
            "click",
            handler
          );
        });
      });

    state.container
      .querySelectorAll("[data-guest-id]")
      .forEach(card => {

        const handler = () => {

          const id =
            card.dataset.guestId;

          const char =
            getArchiveCharacters().find(
              item =>
                String(
                  item.characterId ||
                  item.id
                ) === String(id)
            );

          if (char) {
            openGuestDetail(char);
          }
        };

        card.addEventListener(
          "click",
          handler
        );

        state.listeners.push(() => {
          card.removeEventListener(
            "click",
            handler
          );
        });
      });
  }

  /* =========================================================
     Choice
     ========================================================= */

  async function applyChoice(choice) {

    const archive =
      state.currentArchive;

    if (!archive) return;

    const choices = [
      {
        text:
          "你选择了正面回应。你的目光没有躲开。",
        quote:
          "“原来你真的一直在看我。”",
        danmu:
          [
            "啊啊啊直接对视了",
            "这是什么偶像剧现场",
            "我宣布今晚有情况"
          ]
      },

      {
        text:
          "你选择了暂时回避。你若无其事地把话题带向别处。",
        quote:
          "“……好吧，当我没问。”",
        danmu:
          [
            "她跑了哈哈哈哈",
            "这个回避也太明显了",
            "对方好像有点失落"
          ]
      },

      {
        text:
          "你笑了一下，反过来问他为什么这么说。",
        quote:
          "“因为我也在看你。”",
        danmu:
          [
            "？？？？？？",
            "这句话谁顶得住",
            "节目组剪出来我循环一百遍"
          ]
      }
    ];

    const result =
      choices[choice - 1];

    if (!result) return;

    archive.lastNarrative =
      result.text;

    archive.lastQuote =
      result.quote;

    archive.currentTime =
      advanceTime(
        archive.currentTime ||
        "20:36",
        7
      );

    archive.danmu =
      [
        ...(archive.danmu || []),
        ...result.danmu
      ].slice(-20);

    archive.events =
      [
        ...(archive.events || []),
        {
          id: uid(),
          day: archive.currentDay,
          type: "choice",
          choice,
          text: result.text,
          createdAt: Date.now()
        }
      ];

    archive.lastSummary =
      result.text.slice(0, 90);

    updateRelationFromChoice(
      archive,
      choice
    );

    await saveCurrentArchive();

    renderPage();
    updateTopDay();
  }

  function advanceTime(time, minutes) {

    const match =
      String(time).match(
        /^(\\d{1,2}):(\\d{2})$/
      );

    if (!match) {
      return time;
    }

    let hour =
      Number(match[1]);

    let minute =
      Number(match[2]);

    minute += minutes;

    hour += Math.floor(
      minute / 60
    );

    minute %= 60;

    hour %= 24;

    return `${String(hour).padStart(2, "0")}:${String(
      minute
    ).padStart(2, "0")}`;
  }

  function updateRelationFromChoice(
    archive,
    choice
  ) {

    if (!archive.characters?.length) {
      return;
    }

    const first =
      archive.characters[0];

    const id =
      first.characterId ||
      first.id;

    archive.relationships =
      archive.relationships || {};

    archive.relationships.userToChar =
      archive.relationships.userToChar || {};

    const current =
      archive.relationships.userToChar[id] ||
      {
        tags: [],
        statusLine: ""
      };

    if (choice === 1) {
      current.statusLine =
        "你们之间第一次真正接住了彼此的目光。";

      current.tags = unique([
        ...(current.tags || []),
        "有回应",
        "视线交汇"
      ]);
    }

    if (choice === 2) {
      current.statusLine =
        "你选择了后退一步，他似乎察觉到了。";

      current.tags = unique([
        ...(current.tags || []),
        "试探",
        "保持距离"
      ]);
    }

    if (choice === 3) {
      current.statusLine =
        "一次反向试探，让空气突然变得暧昧。";

      current.tags = unique([
        ...(current.tags || []),
        "暧昧",
        "互相试探"
      ]);
    }

    archive.relationships.userToChar[id] =
      current;
  }

  function unique(array) {
    return [...new Set(array)];
  }

  /* =========================================================
     Custom Action
     ========================================================= */

  function openCustomAction() {

    const modal =
      document.createElement("div");

    modal.className =
      "xd-modal-wrap";

    modal.innerHTML = `
      <section class="xd-modal">

        <div class="xd-modal-handle"></div>

        <div class="xd-kicker">
          YOUR ACTION
        </div>

        <div
          class="xd-modal-title"
          style="margin-top:4px;"
        >
          自定义行动
        </div>

        <div
          style="
            margin-top:7px;
            color:#8e8183;
            font-size:10px;
            line-height:1.7;
          "
        >
          现在的行动会被保存进本季剧情记录。
          后续接入 AI 后，这里会真正影响剧情。
        </div>

        <textarea
          class="xd-custom-input"
          data-custom-text
          placeholder="例如：我起身去厨房倒了一杯水，然后故意坐到了他的旁边……"
        ></textarea>

        <div class="xd-modal-actions">

          <button
            class="xd-secondary"
            data-modal-close
          >
            取消
          </button>

          <button
            class="xd-primary"
            style="margin-top:0;"
            data-custom-submit
          >
            执行行动
          </button>

        </div>

      </section>
    `;

    state.container
      .querySelector(
        ".roche-plugin-xindong-xianchang"
      )
      .appendChild(modal);

    modal
      .querySelector("[data-modal-close]")
      .addEventListener(
        "click",
        () => modal.remove()
      );

    modal
      .querySelector("[data-custom-submit]")
      .addEventListener(
        "click",
        async () => {

          const text =
            modal
              .querySelector(
                "[data-custom-text]"
              )
              .value
              .trim();

          if (!text) {
            toast("先写下你的行动");
            return;
          }

          const archive =
            state.currentArchive;

          archive.lastNarrative =
            `你做出了自己的选择：${text}`;

          archive.lastQuote =
            "节目组没有打断你。镜头继续跟了下去。";

          archive.currentTime =
            advanceTime(
              archive.currentTime ||
                "20:36",
              10
            );

          archive.events =
            [
              ...(archive.events || []),
              {
                id: uid(),
                day: archive.currentDay,
                type: "custom_action",
                text,
                createdAt: Date.now()
              }
            ];

          archive.lastSummary =
            text.slice(0, 90);

          archive.danmu =
            [
              ...(archive.danmu || []),
              "她居然自己行动了",
              "这才是恋综玩家",
              "这个走向有点东西"
            ].slice(-20);

          await saveCurrentArchive();

          modal.remove();

          renderPage();
          updateTopDay();
        }
      );
  }

  /* =========================================================
     Guest Detail
     ========================================================= */

  function openGuestDetail(char) {

    const persona =
      char.personaSnapshot ||
      char.persona ||
      char.bio ||
      "暂无可展示的人设简介。";

    const modal =
      document.createElement("div");

    modal.className =
      "xd-modal-wrap";

    modal.innerHTML = `
      <section class="xd-modal">

        <div class="xd-modal-handle"></div>

        <div
          style="
            display:flex;
            align-items:center;
            gap:13px;
          "
        >

          ${avatarHTML(char)}

          <div>

            <div class="xd-modal-title">
              ${escapeHTML(
                realName(char)
              )}
            </div>

            <div
              style="
                font-size:10px;
                color:#a97983;
                margin-top:3px;
              "
            >
              ${
                char.handle
                  ? "@" +
                    escapeHTML(
                      char.handle
                    )
                  : "GUEST"
              }

              · PERSONA LOCKED
            </div>

          </div>

        </div>

        <div class="xd-field">

          <label>
            简介
          </label>

          <div
            style="
              font-size:12px;
              line-height:1.7;
              color:#75696b;
            "
          >
            ${escapeHTML(
              char.bio ||
              "这个人没有留下简介。"
            )}
          </div>

        </div>

        <div class="xd-field">

          <label>
            锁定的人设快照
          </label>

          <div
            style="
              font-size:12px;
              line-height:1.8;
              color:#75696b;
              background:white;
              border-radius:15px;
              padding:12px;
              white-space:pre-wrap;
            "
          >
            ${escapeHTML(
              persona
            )}
          </div>

        </div>

        <div class="xd-modal-actions">

          <button
            class="xd-secondary"
            data-modal-close
          >
            关闭
          </button>

          <button
            class="xd-primary"
            style="margin-top:0;"
            data-private-preview
          >
            💬 私信
          </button>

        </div>

      </section>
    `;

    state.container
      .querySelector(
        ".roche-plugin-xindong-xianchang"
      )
      .appendChild(modal);

    modal
      .querySelector("[data-modal-close]")
      .addEventListener(
        "click",
        () => modal.remove()
      );

    modal.addEventListener(
      "click",
      event => {
        if (event.target === modal) {
          modal.remove();
        }
      }
    );

    modal
      .querySelector("[data-private-preview]")
      .addEventListener(
        "click",
        () => {

          modal.remove();

          openPrivateMessage(char);
        }
      );
  }

  /* =========================================================
     Private Message
     ========================================================= */

  function openPrivateMessage(char) {

    const archive =
      state.currentArchive;

    if (!archive) {
      toast("请先进入一个恋综档案");
      return;
    }

    const id =
      char.characterId ||
      char.id;

    archive.privateMessages =
      archive.privateMessages || {};

    const messages =
      archive.privateMessages[id] ||
      [
        {
          role: "them",
          text:
            "刚才在客厅，你为什么突然看我？",
          time: "20:41"
        }
      ];

    const modal =
      document.createElement("div");

    modal.className =
      "xd-modal-wrap";

    modal.innerHTML = `
      <section class="xd-modal">

        <div class="xd-modal-handle"></div>

        <div
          style="
            display:flex;
            align-items:center;
            gap:11px;
          "
        >

          ${avatarHTML(char)}

          <div>

            <div class="xd-modal-title">
              ${escapeHTML(
                realName(char)
              )}
            </div>

            <div
              style="
                font-size:9px;
                color:#a97983;
                margin-top:3px;
              "
            >
              PRIVATE CHAT
            </div>

          </div>

        </div>

        <div class="xd-message-list">

          ${messages.map(message => `

            <div
              class="xd-message ${
                message.role === "me"
                  ? "me"
                  : "them"
              }"
            >

              ${escapeHTML(
                message.text
              )}

              <span class="xd-message-time">
                ${escapeHTML(
                  message.time || ""
                )}
              </span>

            </div>

          `).join("")}

        </div>

        <textarea
          class="xd-custom-input"
          data-private-text
          placeholder="给 TA 发消息……"
        ></textarea>

        <div class="xd-modal-actions">

          <button
            class="xd-secondary"
            data-modal-close
          >
            关闭
          </button>

          <button
            class="xd-primary"
            style="margin-top:0;"
            data-private-send
          >
            发送
          </button>

        </div>

      </section>
    `;

    state.container
      .querySelector(
        ".roche-plugin-xindong-xianchang"
      )
      .appendChild(modal);

    modal
      .querySelector("[data-modal-close]")
      .addEventListener(
        "click",
        () => modal.remove()
      );

    modal
      .querySelector("[data-private-send]")
      .addEventListener(
        "click",
        async () => {

          const text =
            modal
              .querySelector(
                "[data-private-text]"
              )
              .value
              .trim();

          if (!text) {
            toast("消息不能为空");
            return;
          }

          messages.push({
            role: "me",
            text,
            time:
              archive.currentTime ||
              "20:42"
          });

          archive.privateMessages[id] =
            messages.slice(-30);

          await saveCurrentArchive();

          modal.remove();

          toast("消息已记录");

          openPrivateMessage(char);
        }
      );
  }

  /* =========================================================
     Create Archive
     ========================================================= */

  function resetCreateDraft() {

    state.createStep = 1;

    state.createDraft = {
      userId:
        state.user?.id || "",

      characterIds: [],

      worldbookIds: [],

      worldbookEntries: [],

      title: "",

      tone:
        "温柔、暧昧、轻微修罗场",

      description:
        "一档以自然互动与真实心动为核心的恋爱真人秀。"
    };
  }

  function openCreateArchive() {

    resetCreateDraft();

    const modal =
      document.createElement("div");

    modal.className =
      "xd-modal-wrap";

    modal.innerHTML = `
      <section
        class="xd-modal"
        data-create-modal
      >
      </section>
    `;

    state.container
      .querySelector(
        ".roche-plugin-xindong-xianchang"
      )
      .appendChild(modal);

    renderCreateStep(modal);

    modal.addEventListener(
      "click",
      event => {
        if (event.target === modal) {
          modal.remove();
        }
      }
    );
  }

  /* =========================================================
     Create Step Render
     ========================================================= */

  function renderCreateStep(modal) {

    const root =
      modal.querySelector(
        "[data-create-modal]"
      );

    if (!root) return;

    const step =
      state.createStep;

    const draft =
      state.createDraft;

    const labels = [
      "USER",
      "嘉宾",
      "世界书",
      "本季设定",
      "创建"
    ];

    root.innerHTML = `

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

      <div class="xd-stepper">

        ${labels.map(
          (label, index) => {

            const number =
              index + 1;

            const className =
              number === step
                ? "active"
                : number < step
                  ? "done"
                  : "";

            return `
              <div
                class="xd-step ${className}"
              >
                ${number}. ${label}
              </div>
            `;
          }
        ).join("")}

      </div>

      ${
        step === 1
          ? renderCreateUserStep()
          : step === 2
            ? renderCreateGuestsStep()
            : step === 3
              ? renderCreateWorldbookStep()
              : step === 4
                ? renderCreateSeasonStep()
                : renderCreateConfirmStep()
      }

    `;

    bindCreateStepEvents(modal);
  }

  function renderCreateUserStep() {

    const user =
      state.user;

    return `

      <div class="xd-field">

        <label>
          选择本季 USER
        </label>

        ${
          user
            ? `
              <div
                class="xd-select-card selected"
                data-create-user="${escapeHTML(
                  user.id || ""
                )}"
              >

                ${avatarHTML(user)}

                <div class="xd-select-info">

                  <div class="xd-select-name">
                    ${escapeHTML(
                      realName(
                        user,
                        "我的人设"
                      )
                    )}
                  </div>

                  <div class="xd-select-sub">
                    ${
                      user.handle
                        ? "@" +
                          escapeHTML(
                            user.handle
                          )
                        : "当前 USER"
                    }
                  </div>

                </div>

                <div class="xd-select-check">
                  ✓
                </div>

              </div>
            `
            : `
              <div class="xd-empty">

                <div class="xd-empty-icon">
                  ♡
                </div>

                <div class="xd-empty-title">
                  没有读取到 USER
                </div>

                <div class="xd-empty-text">
                  请确认 Roche 当前已经存在可用的 USER 人设。
                </div>

              </div>
            `
        }

      </div>

      <div
        style="
          margin-top:13px;
          padding:12px;
          border-radius:15px;
          background:#f6eeee;
          color:#8e8183;
          font-size:10px;
          line-height:1.7;
        "
      >
        🔒 创建后会锁定这一刻的 USER 人设快照。
        后续修改 Roche 原人设不会影响已经创建的恋综。
      </div>

      ${createNavigation(true)}

    `;
  }

  function renderCreateGuestsStep() {

    const selected =
      state.createDraft.characterIds;

    const chars =
      state.characters || [];

    return `

      <div
        style="
          font-size:10px;
          color:#8e8183;
          line-height:1.7;
          margin-bottom:10px;
        "
      >
        选择本季入住嘉宾。
        每个恋综最多选择 8 位。
        创建后会锁定嘉宾的人设快照。
      </div>

      ${
        chars.length
          ? chars.map(char => {

              const id =
                char.id;

              const isSelected =
                selected.includes(id);

              return `

                <div
                  class="
                    xd-select-card
                    ${
                      isSelected
                        ? "selected"
                        : ""
                    }
                  "
                  data-create-character="${escapeHTML(
                    id || ""
                  )}"
                >

                  ${avatarHTML(char)}

                  <div class="xd-select-info">

                    <div class="xd-select-name">
                      ${escapeHTML(
                        realName(char)
                      )}
                    </div>

                    <div class="xd-select-sub">
                      ${
                        char.handle
                          ? "@" +
                            escapeHTML(
                              char.handle
                            )
                          : escapeHTML(
                              char.bio ||
                              "嘉宾"
                            )
                      }
                    </div>

                  </div>

                  <div class="xd-select-check">
                    ${
                      isSelected
                        ? "✓"
                        : ""
                    }
                  </div>

                </div>

              `;
            }).join("")
          : `
            <div class="xd-empty">

              <div class="xd-empty-icon">
                ♧
              </div>

              <div class="xd-empty-title">
                没有可选择的嘉宾
              </div>

              <div class="xd-empty-text">
                Roche 当前没有读取到角色列表。
              </div>

            </div>
          `
      }

      <div
        style="
          margin-top:8px;
          text-align:right;
          font-size:9px;
          color:#a18f92;
        "
      >
        已选择
        ${selected.length}
        / 8
      </div>

      ${createNavigation(false)}

    `;
  }

  function renderCreateWorldbookStep() {

    /*
      这里暂时不假设 Roche 的世界书 API。
      所以提供“本季世界观文本”入口。
      后续确认 API 后可以直接替换成真实世界书列表。
    */

    const entries =
      state.createDraft.worldbookEntries || [];

    return `

      <div class="xd-field">

        <label>
          世界书 / 世界观
        </label>

        <textarea
          data-worldbook-text
          placeholder="写下这一季的世界规则、节目背景、特殊设定……"
        >${escapeHTML(
          entries.join("\\n")
        )}</textarea>

      </div>

      <div
        style="
          margin-top:10px;
          padding:12px;
          border-radius:15px;
          background:#f6eeee;
          color:#8e8183;
          font-size:10px;
          line-height:1.7;
        "
      >
        📖 当前版本先保存世界书快照文本。
        等确认你这套 Roche 的世界书接口后，
        可以改成真正的世界书选择器。
      </div>

      ${createNavigation(false)}

    `;
  }

  function renderCreateSeasonStep() {

    const draft =
      state.createDraft;

    return `

      <div class="xd-field">

        <label>
          恋综名称
        </label>

        <input
          data-season-title
          maxlength="30"
          placeholder="例如：心动小屋"
          value="${escapeHTML(
            draft.title
          )}"
        >

      </div>

      <div class="xd-field">

        <label>
          本季氛围
        </label>

        <input
          data-season-tone
          maxlength="80"
          value="${escapeHTML(
            draft.tone
          )}"
        >

      </div>

      <div class="xd-field">

        <label>
          本季简介
        </label>

        <textarea
          data-season-description
        >${escapeHTML(
          draft.description
        )}</textarea>

      </div>

      ${createNavigation(false)}

    `;
  }

  function renderCreateConfirmStep() {

    const draft =
      state.createDraft;

    const user =
      state.user;

    const chars =
      state.characters.filter(
        char =>
          draft.characterIds.includes(
            char.id
          )
      );

    return `

      <div class="xd-create-preview">

        <div class="xd-create-preview-title">
          ${escapeHTML(
            draft.title ||
            "心动小屋"
          )}
        </div>

        <div class="xd-create-preview-meta">
          本季氛围：
          ${escapeHTML(
            draft.tone
          )}
        </div>

        <div class="xd-create-preview-meta">
          USER：
          ${escapeHTML(
            realName(
              user,
              "未选择"
            )
          )}
        </div>

        <div class="xd-create-preview-list">

          ${
            chars.length
              ? chars.map(char => `
                  <span class="xd-create-preview-tag">
                    ${escapeHTML(
                      realName(char)
                    )}
                  </span>
                `).join("")
              : `
                <span class="xd-create-preview-tag">
                  尚未选择嘉宾
                </span>
              `
          }

        </div>

      </div>

      <div class="xd-field">

        <label>
          本季设定
        </label>

        <div
          style="
            background:white;
            padding:12px;
            border-radius:15px;
            color:#75696b;
            font-size:11px;
            line-height:1.7;
            white-space:pre-wrap;
          "
        >
          ${escapeHTML(
            draft.description
          )}
        </div>

      </div>

      <div class="xd-field">

        <label>
          世界书快照
        </label>

        <div
          style="
            background:white;
            padding:12px;
            border-radius:15px;
            color:#75696b;
            font-size:11px;
            line-height:1.7;
            white-space:pre-wrap;
          "
        >
          ${
            escapeHTML(
              (
                draft.worldbookEntries ||
                []
              ).join("\\n")
            ) ||
            "未填写额外世界观。"
          }
        </div>

      </div>

      <div
        style="
          margin-top:12px;
          padding:12px;
          border-radius:15px;
          background:#f6eeee;
          color:#8e8183;
          font-size:10px;
          line-height:1.7;
        "
      >
        🔒 创建后：
        USER、嘉宾、世界书、本季设定都会成为本档案的独立快照。
      </div>

      ${createNavigation(false, true)}

    `;
  }

  function createNavigation(
    firstStep = false,
    finalStep = false
  ) {

    return `

      <div class="xd-modal-actions">

        <button
          class="xd-secondary"
          data-create-cancel
        >
          ${
            firstStep
              ? "取消"
              : "上一步"
          }
        </button>

        <button
          class="xd-primary"
          style="margin-top:0;"
          data-create-next
        >
          ${
            finalStep
              ? "创建恋综"
              : "下一步"
          }
        </button>

      </div>

    `;
  }

  /* =========================================================
     Create Events
     ========================================================= */

  function bindCreateStepEvents(modal) {

    const root =
      modal.querySelector(
        "[data-create-modal]"
      );

    root
      .querySelector(
        "[data-create-cancel]"
      )
      ?.addEventListener(
        "click",
        () => {

          if (state.createStep === 1) {
            modal.remove();
            return;
          }

          state.createStep--;

          renderCreateStep(modal);
        }
      );

    root
      .querySelector(
        "[data-create-next]"
      )
      ?.addEventListener(
        "click",
        async () => {

          if (
            state.createStep === 5
          ) {
            await createArchive(modal);
            return;
          }

          if (
            !validateCreateStep()
          ) {
            return;
          }

          collectCreateStepData();

          state.createStep++;

          renderCreateStep(modal);
        }
      );

    root
      .querySelector(
        "[data-create-user]"
      )
      ?.addEventListener(
        "click",
        () => {

          if (state.user?.id) {
            state.createDraft.userId =
              state.user.id;
          }
        }
      );

    root
      .querySelectorAll(
        "[data-create-character]"
      )
      .forEach(card => {

        card.addEventListener(
          "click",
          () => {

            const id =
              card.dataset.createCharacter;

            const selected =
              state.createDraft
                .characterIds;

            if (
              selected.includes(id)
            ) {

              state.createDraft
                .characterIds =
                selected.filter(
                  value =>
                    value !== id
                );

            } else {

              if (
                selected.length >= 8
              ) {
                toast(
                  "本季最多选择 8 位嘉宾"
                );
                return;
              }

              state.createDraft
                .characterIds =
                [
                  ...selected,
                  id
                ];
            }

            renderCreateStep(modal);
          }
        );
      });
  }

  function validateCreateStep() {

    const step =
      state.createStep;

    if (step === 1) {

      if (!state.user) {
        toast("没有可用的 USER");
        return false;
      }

      return true;
    }

    if (step === 2) {

      if (
        !state.createDraft
          .characterIds.length
      ) {
        toast("至少选择一位嘉宾");
        return false;
      }

      return true;
    }

    return true;
  }

  function collectCreateStepData() {

    const root =
      state.container.querySelector(
        "[data-create-modal]"
      );

    if (!root) return;

    if (state.createStep === 3) {

      const textarea =
        root.querySelector(
          "[data-worldbook-text]"
        );

      if (textarea) {

        const text =
          textarea.value.trim();

        state.createDraft
          .worldbookEntries =
          text
            ? text
                .split(/\n+/)
                .map(item => item.trim())
                .filter(Boolean)
            : [];
      }
    }

    if (state.createStep === 4) {

      const title =
        root.querySelector(
          "[data-season-title]"
        );

      const tone =
        root.querySelector(
          "[data-season-tone]"
        );

      const description =
        root.querySelector(
          "[data-season-description]"
        );

      state.createDraft.title =
        title?.value.trim() ||
        "心动小屋";

      state.createDraft.tone =
        tone?.value.trim() ||
        "温柔、暧昧、轻微修罗场";

      state.createDraft.description =
        description?.value.trim() ||
        "一档以自然互动与真实心动为核心的恋爱真人秀。";
    }
  }

  /* =========================================================
     Create Archive
     ========================================================= */

  async function createArchive(modal) {

    collectCreateStepData();

    const draft =
      state.createDraft;

    const user =
      state.user;

    const picked =
      state.characters
        .filter(char =>
          draft.characterIds.includes(
            char.id
          )
        )
        .map(char => ({

          characterId:
            char.id,

          name:
            char.name || "",

          handle:
            char.handle || "",

          avatar:
            char.avatar || "",

          bio:
            char.bio || "",

          /*
            核心：
            这里复制当前人设内容。
            创建之后不再依赖原角色对象。
          */

          personaSnapshot:
            char.persona ||
            char.personaText ||
            char.description ||
            char.bio ||
            "",

          joinedDay: 1,

          isNewGuest: false

        }));

    const archive = {

      archiveId: uid(),

      title:
        draft.title ||
        "心动小屋",

      createdAt:
        Date.now(),

      lastSavedAt:
        Date.now(),

      /*
        USER 人设快照锁
      */

      userPersona: {

        personaId:
          user?.id ||
          uid(),

        name:
          user?.name ||
          "",

        handle:
          user?.handle ||
          "",

        avatar:
          user?.avatar ||
          "",

        bio:
          user?.bio ||
          "",

        personaSnapshot:
          user?.persona ||
          user?.personaText ||
          user?.description ||
          user?.bio ||
          ""

      },

      /*
        嘉宾人设快照锁
      */

      characters: picked,

      /*
        世界书快照
      */

      worldbook: {

        selectedCategoryIds:
          draft.worldbookIds || [],

        selectedEntryIds: [],

        snapshotText:
          (
            draft.worldbookEntries ||
            []
          ).join("\n")

      },

      /*
        本季设定
      */

      seasonConfig: {

        description:
          draft.description,

        tone:
          draft.tone,

        forbiddenContent:
          ""

      },

      /*
        节目状态
      */

      currentDay: 1,

      currentTime:
        "20:36",

      currentSceneLabel:
        "心动小屋 · 客厅",

      /*
        时间线
      */

      timeline: [

        {
          day: 1,

          summary:
            "恋综正式开机。",

          fullNarrative:
            ""

        }

      ],

      /*
        阶段总结
      */

      stageSummaries: [],

      /*
        关系系统
      */

      relationships: {

        userToChar: {},

        charToChar: {}

      },

      /*
        私信
      */

      privateMessages: {},

      /*
        事件
      */

      events: [],

      /*
        弹幕
      */

      danmu: [

        "节目正式开机了",

        "今晚谁会先心动",

        "我已经坐好了"

      ],

      /*
        AI 相关预留
      */

      aiState: {

        lastRequest: "",

        lastResponse: "",

        pending: false

      },

      /*
        长期记忆预留
      */

      longTermMemory: [],

      pendingRequest: false,

      lastNarrative:
        "夕阳落进客厅的玻璃窗。节目组没有宣布新的任务，空气却比往常安静了一些。几个人各自做着手里的事，偶尔的目光交错，让今晚显得格外微妙。",

      lastQuote:
        "“你今天……好像一直在看我。”"

    };

    /*
      初始化关系
    */

    archive.characters.forEach(char => {

      const id =
        char.characterId;

      archive.relationships
        .userToChar[id] = {

          tags: [],

          statusLine:
            "你们的故事才刚刚开始。"

        };

    });

    /*
      写入档案索引
    */

    const indexEntry = {

      archiveId:
        archive.archiveId,

      title:
        archive.title,

      currentDay:
        1,

      characterNames:
        picked.map(
          char => char.name
        ),

      characterAvatars:
        picked.map(
          char => char.avatar
        ),

      lastSummary:
        "新的恋综世界刚刚开机。",

      lastSavedAt:
        archive.lastSavedAt

    };

    state.archives.unshift(
      indexEntry
    );

    state.currentArchive =
      archive;

    await safeSet(
      `archive:${archive.archiveId}`,
      archive
    );

    await safeSet(
      "archiveIndex",
      state.archives
    );

    modal.remove();

    state.activeTab = "show";

    toast(
      "《" +
        archive.title +
        "》已开机"
    );

    renderPage();

    updateTopDay();
  }

  /* =========================================================
     Save Archive
     ========================================================= */

  async function saveCurrentArchive() {

    if (!state.currentArchive) {
      return;
    }

    const archive =
      state.currentArchive;

    archive.lastSavedAt =
      Date.now();

    const indexEntry = {

      archiveId:
        archive.archiveId,

      title:
        archive.title,

      currentDay:
        archive.currentDay,

      characterNames:
        (
          archive.characters ||
          []
        ).map(
          char => char.name
        ),

      characterAvatars:
        (
          archive.characters ||
          []
        ).map(
          char => char.avatar
        ),

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

    const existing =
      state.archives.findIndex(
        item =>
          item.archiveId ===
          indexEntry.archiveId
      );

    if (existing >= 0) {

      state.archives[existing] =
        indexEntry;

    } else {

      state.archives.unshift(
        indexEntry
      );

    }

    await safeSet(
      `archive:${archive.archiveId}`,
      archive
    );

    await safeSet(
      "archiveIndex",
      state.archives
    );
  }

  /* =========================================================
     Top Day
     ========================================================= */

  function updateTopDay() {

    const el =
      state.container?.querySelector(
        "[data-top-day]"
      );

    if (!el) return;

    el.textContent =
      `DAY ${String(
        currentDay()
      ).padStart(2, "0")}`;
  }

  /* =========================================================
     Load Roche Data
     ========================================================= */

  async function loadRocheData(roche) {

    try {

      state.user =
        await roche
          .persona
          .getActiveUserPersona();

    } catch (error) {

      console.warn(
        "[心动现场] 无法读取当前 USER",
        error
      );

      state.user = null;
    }

    try {

      state.characters =
        (
          await roche
            .character
            .list()
        ) || [];

    } catch (error) {

      console.warn(
        "[心动现场] 无法读取 CHAR",
        error
      );

      state.characters = [];
    }

    state.archives =
      await safeGet(
        "archiveIndex",
        []
      );

    /*
      默认进入最近一个档案
    */

    if (state.archives.length) {

      const first =
        state.archives[0];

      state.currentArchive =
        await safeGet(
          `archive:${first.archiveId}`,
          first
        );

    } else {

      state.currentArchive =
        null;
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

    state.listeners.forEach(
      cleanup => {

        try {
          cleanup();
        } catch {}

      }
    );

    state.listeners = [];

    const modal =
      container.querySelector(
        ".xd-modal-wrap"
      );

    if (modal) {
      modal.remove();
    }

    container.replaceChildren();

    const style =
      document.getElementById(
        STYLE_ID
      );

    if (style) {
      style.remove();
    }

    state.container =
      null;

    state.roche =
      null;

    state.currentArchive =
      null;
  }

  /* =========================================================
     Roche Plugin Register
     ========================================================= */

  window.RochePlugin.register({

    id:
      PLUGIN_ID,

    name:
      "心动现场",

    version:
      "1.1.0",

    apps: [

      {

        id:
          APP_ID,

        name:
          "心动现场",

        icon:
          "heart",

        iconImage:
          "",

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

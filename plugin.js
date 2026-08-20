/* =========================================================
   《心动现场》 · 恋综模拟器
   v1.0.0 · UI First
   作者：linyin8945

   第一版重点：
   - 完整四底栏
   - 顶栏 + 返回 Roche
   - 低饱和高级粉色视觉
   - 节目 / 嘉宾 / 关系 / 档案页面
   - 从 Roche 读取当前 USER / CHAR
   - 使用 roche.storage 保存插件自己的档案
   - 暂不接入 AI，先把 UI 做完整、稳定
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
    listeners: [],
  };

  const escapeHTML = (value) => {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  const uid = () =>
    (globalThis.crypto && crypto.randomUUID)
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
    } catch {
      return fallback;
    }
  }

  async function safeSet(key, value) {
    try {
      await state.roche.storage.set(key, value);
    } catch (error) {
      console.error("[心动现场] storage.set failed", error);
    }
  }

  function toast(message) {
    try {
      state.roche.ui.toast(message);
    } catch {
      console.log(message);
    }
  }

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
          radial-gradient(circle at 92% 7%, rgba(210,169,176,.18), transparent 30%),
          radial-gradient(circle at 7% 75%, rgba(222,191,196,.18), transparent 28%),
          linear-gradient(145deg, #f8f4f3 0%, #f3eded 48%, #f7f1f1 100%);
        color: var(--xd-text);
        font-family:
          -apple-system, BlinkMacSystemFont, "SF Pro Display",
          "SF Pro Text", "Helvetica Neue", Arial, sans-serif;
        -webkit-font-smoothing: antialiased;
        display: flex;
        flex-direction: column;
      }

      .roche-plugin-xindong-xianchang button,
      .roche-plugin-xindong-xianchang input,
      .roche-plugin-xindong-xianchang textarea {
        font: inherit;
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
        box-shadow: 0 4px 18px rgba(101,73,80,.06);
      }

      .xd-back:active { transform: scale(.96); }

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

      .xd-page::-webkit-scrollbar { display: none; }

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
        box-shadow: inset 0 0 0 1px rgba(184,135,145,.10);
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
          linear-gradient(135deg, rgba(255,255,255,.90), rgba(245,229,231,.80));
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

      .xd-hero > * { position: relative; z-index: 1; }

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
        box-shadow: 0 0 0 4px rgba(184,135,145,.12);
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
        box-shadow: 0 8px 25px rgba(96,70,76,.045);
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
        box-shadow: 0 5px 16px rgba(100,73,79,.035);
        transition: .16s ease;
      }

      .xd-choice:hover {
        border-color: rgba(184,135,145,.35);
        background: #fffafa;
      }

      .xd-choice:active { transform: scale(.985); }

      .xd-choice-no {
        display: inline-block;
        width: 23px;
        color: var(--xd-pink);
        font-size: 11px;
        font-weight: 800;
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
        box-shadow: 0 7px 22px rgba(101,73,80,.045);
      }

      .xd-avatar {
        width: 54px;
        height: 54px;
        flex: 0 0 54px;
        border-radius: 17px;
        overflow: hidden;
        background: linear-gradient(145deg, #e8d5d8, #f4e8e9);
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
        box-shadow: 0 7px 22px rgba(101,73,80,.045);
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
        box-shadow: 0 7px 18px rgba(132,91,101,.18);
      }

      .xd-primary:active { transform: scale(.98); }

      .xd-archive {
        position: relative;
        padding: 18px;
        border-radius: 23px;
        background:
          linear-gradient(140deg, rgba(255,255,255,.88), rgba(245,229,231,.70));
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

      .xd-mini-avatar:first-child { margin-left: 0; }

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
        max-height: 86%;
        overflow-y: auto;
        background: #fbf8f7;
        border-radius: 28px 28px 0 0;
        padding: 21px 17px 28px;
        box-shadow: 0 -12px 45px rgba(72,51,57,.15);
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

      .xd-field input {
        width: 100%;
        border: 1px solid rgba(140,104,112,.15);
        background: white;
        color: var(--xd-text);
        border-radius: 14px;
        padding: 12px;
        outline: none;
      }

      .xd-field input:focus {
        border-color: rgba(184,135,145,.45);
        box-shadow: 0 0 0 3px rgba(184,135,145,.08);
      }

      .xd-modal-actions {
        display: flex;
        gap: 8px;
        margin-top: 18px;
      }

      .xd-modal-actions button {
        flex: 1;
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

  function renderShell() {
    state.container.innerHTML = `
      <div class="roche-plugin-xindong-xianchang">
        <header class="xd-topbar">
          <button class="xd-back" data-action="back" aria-label="返回 Roche">‹</button>
          <div class="xd-heading">
            <div class="xd-eyebrow">LOVE REALITY SHOW</div>
            <div class="xd-title">心动现场</div>
          </div>
          <div class="xd-topday">
            <span class="xd-topday-main" data-top-day>DAY 01</span>
            <span class="xd-topday-sub">ON AIR</span>
          </div>
        </header>

        <main class="xd-content" data-content></main>

        <nav class="xd-bottom" aria-label="心动现场导航">
          <button class="xd-tab active" data-tab="show">
            <span class="xd-tab-icon">▣</span>
            <span class="xd-tab-label">节目</span>
          </button>
          <button class="xd-tab" data-tab="guests">
            <span class="xd-tab-icon">♧</span>
            <span class="xd-tab-label">嘉宾</span>
          </button>
          <button class="xd-tab" data-tab="relations">
            <span class="xd-tab-icon">♡</span>
            <span class="xd-tab-label">关系</span>
          </button>
          <button class="xd-tab" data-tab="archives">
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
        };
        button.addEventListener("click", handler);
        state.listeners.push(() => button.removeEventListener("click", handler));
      });

    const back = state.container.querySelector("[data-action='back']");
    const backHandler = () => {
      try {
        state.roche.ui.closeApp();
      } catch {
        toast("无法返回 Roche");
      }
    };
    back.addEventListener("click", backHandler);
    state.listeners.push(() => back.removeEventListener("click", backHandler));
  }

  function avatarHTML(item, className = "xd-avatar") {
    const src = avatar(item);
    if (src) {
      return `<div class="${className}"><img src="${escapeHTML(src)}" alt=""></div>`;
    }
    const text = escapeHTML((realName(item, "♡")).slice(0, 1));
    return `<div class="${className}">${text}</div>`;
  }

  function pageHead(kicker, title, note = "") {
    return `
      <div class="xd-kicker">${escapeHTML(kicker)}</div>
      <div class="xd-section-head" style="margin-top:5px;">
        <div class="xd-section-title">${escapeHTML(title)}</div>
        ${note ? `<div class="xd-section-note">${escapeHTML(note)}</div>` : ""}
      </div>
    `;
  }

  function renderShow() {
    const archive = state.currentArchive;
    const day = archive?.currentDay || 1;
    const scene = archive?.currentSceneLabel || "心动小屋 · 客厅";
    const narrative = archive?.lastNarrative ||
      "夕阳落进客厅的玻璃窗。节目组没有宣布新的任务，空气却比往常安静了一些。几个人各自做着手里的事，偶尔的目光交错，让今晚显得格外微妙。";
    const quote = archive?.lastQuote ||
      "“你今天……好像一直在看我。”";

    return `
      <div class="xd-page">
        ${pageHead("TONIGHT · LIVE", "正在播出", "实时节目现场")}

        <section class="xd-hero">
          <div class="xd-kicker">EPISODE ${String(day).padStart(2, "0")}</div>
          <div class="xd-hero-title">${escapeHTML(archive?.title || "心动小屋")}</div>
          <div class="xd-hero-sub">
            一场关于靠近、试探与心动的真人秀。
            没有人知道下一秒谁会先动心。
          </div>
          <div class="xd-live"><span class="xd-live-dot"></span> LIVE · ${escapeHTML(scene)}</div>
        </section>

        <div class="xd-section-head">
          <div class="xd-section-title">今晚的现场</div>
          <div class="xd-section-note">DAY ${String(day).padStart(2, "0")} · ${escapeHTML(archive?.currentTime || "20:36")}</div>
        </div>

        <section class="xd-scene">
          <div class="xd-scene-label">${escapeHTML(scene)}</div>
          <div class="xd-narrative">${escapeHTML(narrative)}</div>
          <div class="xd-quote">${escapeHTML(quote)}</div>
        </section>

        <div class="xd-section-head">
          <div class="xd-section-title">你会怎么做？</div>
          <div class="xd-section-note">没有标准答案</div>
        </div>

        <div class="xd-choice-grid">
          <button class="xd-choice" data-choice="1">
            <span class="xd-choice-no">01</span>抬起眼，直接回应他的目光。
          </button>
          <button class="xd-choice" data-choice="2">
            <span class="xd-choice-no">02</span>若无其事地转身，把话题带向别处。
          </button>
          <button class="xd-choice" data-choice="3">
            <span class="xd-choice-no">03</span>笑了一下，反过来问他为什么这么说。
          </button>
        </div>

        <div class="xd-section-head">
          <div class="xd-section-title">观众席</div>
          <div class="xd-section-note">LIVE DANMU</div>
        </div>

        <div class="xd-danmu">
          <span>这气氛突然不对劲了</span>
          <span>救命谁先移开视线</span>
          <span>节目组你最好有事</span>
          <span>我已经开始期待了</span>
        </div>
      </div>
    `;
  }

  function renderGuests() {
    const chars = state.characters || [];

    return `
      <div class="xd-page">
        ${pageHead("THE CAST", "本季嘉宾", `${chars.length} 位已加入`)}

        <div class="xd-profile">
          ${avatarHTML(state.user)}
          <div>
            <div class="xd-profile-name">${escapeHTML(realName(state.user, "我的人设"))}</div>
            <div class="xd-profile-handle">${escapeHTML(state.user?.handle ? "@" + state.user.handle : "USER")}</div>
            <div class="xd-profile-bio">${escapeHTML(state.user?.bio || "本季恋综玩家")}</div>
          </div>
        </div>

        <div class="xd-section-head">
          <div class="xd-section-title">入住嘉宾</div>
          <div class="xd-section-note">LOCKED PERSONA</div>
        </div>

        <div class="xd-card-grid">
          ${
            chars.length
              ? chars.map((char) => `
                <div class="xd-guest-card" data-guest-id="${escapeHTML(char.id)}">
                  ${avatarHTML(char)}
                  <div class="xd-guest-main">
                    <div class="xd-guest-name">${escapeHTML(realName(char))}</div>
                    <div class="xd-guest-handle">${escapeHTML(char.handle ? "@" + char.handle : "嘉宾")}</div>
                    <div class="xd-guest-bio">${escapeHTML(char.bio || "这个人没有留下简介。")}</div>
                  </div>
                  <div class="xd-arrow">›</div>
                </div>
              `).join("")
              : `
                <div class="xd-empty">
                  <div class="xd-empty-icon">♡</div>
                  <div class="xd-empty-title">还没有嘉宾</div>
                  <div class="xd-empty-text">创建恋综档案后，从 Roche 角色中选择你的入住嘉宾。</div>
                </div>
              `
          }
        </div>
      </div>
    `;
  }

  function renderRelations() {
    const chars = state.characters || [];
    const relations = state.currentArchive?.relationships?.userToChar || {};

    return `
      <div class="xd-page">
        ${pageHead("RELATIONSHIP", "关系温度", "只记录故事留下的痕迹")}

        <div class="xd-hero" style="min-height:150px;padding:19px;">
          <div class="xd-kicker">NO SCORE · NO ANSWER</div>
          <div class="xd-hero-title" style="font-size:25px;">心动没有刻度。</div>
          <div class="xd-hero-sub">
            这里不会告诉你谁“好感度最高”。
            关系只会随着节目里真正发生的事慢慢改变。
          </div>
        </div>

        <div class="xd-section-head">
          <div class="xd-section-title">USER × 嘉宾</div>
          <div class="xd-section-note">${chars.length} 条关系线</div>
        </div>

        <div class="xd-card-grid">
          ${
            chars.length
              ? chars.map((char) => {
                  const relation = relations[char.id] || { tags: [], statusLine: "" };
                  const tags = relation.tags?.length ? relation.tags : ["尚未定义"];
                  return `
                    <div class="xd-relation">
                      <div class="xd-relation-top">
                        ${avatarHTML(char)}
                        <div class="xd-relation-names">
                          <div class="xd-relation-name">${escapeHTML(realName(char))}</div>
                          <div class="xd-relation-status">${escapeHTML(relation.statusLine || "你们的故事才刚刚开始。")}</div>
                        </div>
                      </div>
                      <div class="xd-tags">
                        ${tags.map(t => `<span class="xd-tag">${escapeHTML(t)}</span>`).join("")}
                      </div>
                    </div>
                  `;
                }).join("")
              : `
                <div class="xd-empty">
                  <div class="xd-empty-icon">♡</div>
                  <div class="xd-empty-title">关系线尚未展开</div>
                  <div class="xd-empty-text">先邀请一些嘉宾进入你的恋综吧。</div>
                </div>
              `
          }
        </div>
      </div>
    `;
  }

  function renderArchives() {
    return `
      <div class="xd-page">
        ${pageHead("YOUR SHOWS", "恋综档案", `${state.archives.length} 个世界`)}

        <div class="xd-empty" style="padding:27px 18px;margin-bottom:11px;">
          <div class="xd-empty-icon">✦</div>
          <div class="xd-empty-title">一个档案，就是一个完整世界</div>
          <div class="xd-empty-text">
            不同恋综之间的人设、剧情、关系和记忆彼此独立。
          </div>
        </div>

        <div class="xd-card-grid">
          ${
            state.archives.length
              ? state.archives.map((archive) => `
                <article class="xd-archive">
                  <div class="xd-archive-title">${escapeHTML(archive.title)}</div>
                  <div class="xd-archive-meta">
                    DAY ${String(archive.currentDay || 1).padStart(2, "0")} ·
                    ${escapeHTML((archive.characterNames || []).length + " 位嘉宾")}
                  </div>
                  <div class="xd-archive-people">
                    ${(archive.characterAvatars || []).slice(0, 5).map((src, i) =>
                      src
                        ? `<div class="xd-mini-avatar"><img src="${escapeHTML(src)}" alt=""></div>`
                        : `<div class="xd-mini-avatar">${i + 1}</div>`
                    ).join("")}
                  </div>
                  <div class="xd-archive-summary">
                    ${escapeHTML(archive.lastSummary || "还没有发生故事。")}
                  </div>
                  <div class="xd-archive-actions">
                    <button class="xd-small-btn" data-open-archive="${escapeHTML(archive.archiveId)}">进入档案</button>
                    <button class="xd-small-btn" data-delete-archive="${escapeHTML(archive.archiveId)}">删除</button>
                  </div>
                </article>
              `).join("")
              : ""
          }
        </div>

        <button class="xd-new-archive" data-new-archive>＋ 创建新的恋综世界</button>
      </div>
    `;
  }

  function renderPage() {
    const content = state.container.querySelector("[data-content]");
    if (!content) return;

    content.innerHTML =
      state.activeTab === "show" ? renderShow() :
      state.activeTab === "guests" ? renderGuests() :
      state.activeTab === "relations" ? renderRelations() :
      renderArchives();

    state.container.querySelectorAll("[data-choice]").forEach((button) => {
      const handler = () => {
        const choice = button.dataset.choice;
        const messages = [
          "你选择了正面回应。真正的剧情引擎将在下一版接管这一动作。",
          "你选择了暂时回避。真正的剧情引擎将在下一版接管这一动作。",
          "你选择了反问试探。真正的剧情引擎将在下一版接管这一动作."
        ];
        if (state.currentArchive) {
          state.currentArchive.lastNarrative = messages[Number(choice) - 1];
          state.currentArchive.lastQuote = "“原来你真的注意到了。”";
          saveCurrentArchive();
          renderPage();
        } else {
          toast("请先创建一个恋综档案");
        }
      };
      button.addEventListener("click", handler);
      state.listeners.push(() => button.removeEventListener("click", handler));
    });

    state.container.querySelectorAll("[data-new-archive]").forEach((button) => {
      const handler = () => openCreateArchive();
      button.addEventListener("click", handler);
      state.listeners.push(() => button.removeEventListener("click", handler));
    });

    state.container.querySelectorAll("[data-open-archive]").forEach((button) => {
      const handler = async () => {
        const archive = state.archives.find(a => a.archiveId === button.dataset.openArchive);
        if (!archive) return;
        const full = await safeGet(`archive:${archive.archiveId}`, null);
        state.currentArchive = full || archive;
        state.activeTab = "show";
        renderPage();
        updateTopDay();
      };
      button.addEventListener("click", handler);
      state.listeners.push(() => button.removeEventListener("click", handler));
    });

    state.container.querySelectorAll("[data-delete-archive]").forEach((button) => {
      const handler = async () => {
        const id = button.dataset.deleteArchive;
        let ok = true;
        try {
          ok = await state.roche.ui.confirm({
            title: "删除恋综档案",
            message: "确定删除这个完整恋综世界吗？此操作无法恢复。"
          });
        } catch {}
        if (!ok) return;

        state.archives = state.archives.filter(a => a.archiveId !== id);
        await safeSet("archiveIndex", state.archives);
        try { await state.roche.storage.delete(`archive:${id}`); } catch {}
        if (state.currentArchive?.archiveId === id) state.currentArchive = null;
        toast("档案已删除");
        renderPage();
        updateTopDay();
      };
      button.addEventListener("click", handler);
      state.listeners.push(() => button.removeEventListener("click", handler));
    });

    state.container.querySelectorAll("[data-guest-id]").forEach((card) => {
      const handler = () => {
        const char = state.characters.find(c => c.id === card.dataset.guestId);
        if (char) openGuestDetail(char);
      };
      card.addEventListener("click", handler);
      state.listeners.push(() => card.removeEventListener("click", handler));
    });

    state.container.querySelectorAll("[data-tab]").forEach((button) => {
      button.classList.toggle("active", button.dataset.tab === state.activeTab);
    });
  }

  function updateTopDay() {
    const el = state.container.querySelector("[data-top-day]");
    if (el) {
      el.textContent = `DAY ${String(state.currentArchive?.currentDay || 1).padStart(2, "0")}`;
    }
  }

  function closeModal() {
    const modal = state.container.querySelector(".xd-modal-wrap");
    if (modal) modal.remove();
  }

  function openGuestDetail(char) {
    const persona = char.persona || char.bio || "暂无可展示的人设简介。";
    const modal = document.createElement("div");
    modal.className = "xd-modal-wrap";
    modal.innerHTML = `
      <section class="xd-modal">
        <div class="xd-modal-handle"></div>
        <div style="display:flex;align-items:center;gap:13px;">
          ${avatarHTML(char)}
          <div>
            <div class="xd-modal-title">${escapeHTML(realName(char))}</div>
            <div style="font-size:10px;color:#a97983;margin-top:3px;">
              ${escapeHTML(char.handle ? "@" + char.handle : "GUEST")}
            </div>
          </div>
        </div>

        <div class="xd-field">
          <label>简介</label>
          <div style="font-size:12px;line-height:1.7;color:#75696b;">
            ${escapeHTML(char.bio || "这个人没有留下简介。")}
          </div>
        </div>

        <div class="xd-field">
          <label>节目人设预览</label>
          <div style="font-size:12px;line-height:1.8;color:#75696b;background:white;border-radius:15px;padding:12px;">
            ${escapeHTML(persona).slice(0, 500)}
          </div>
        </div>

        <div class="xd-modal-actions">
          <button class="xd-small-btn" data-modal-close>关闭</button>
          <button class="xd-primary" style="margin-top:0;" data-private-preview>💬 私信</button>
        </div>
      </section>
    `;

    state.container.querySelector(".roche-plugin-xindong-xianchang").appendChild(modal);

    const close = modal.querySelector("[data-modal-close]");
    close.addEventListener("click", closeModal);

    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });

    modal.querySelector("[data-private-preview]").addEventListener("click", () => {
      closeModal();
      toast("私信页面将在下一版接入");
    });
  }

  function openCreateArchive() {
    const modal = document.createElement("div");
    modal.className = "xd-modal-wrap";
    modal.innerHTML = `
      <section class="xd-modal">
        <div class="xd-modal-handle"></div>
        <div class="xd-kicker">NEW SEASON</div>
        <div class="xd-modal-title" style="margin-top:4px;">创建新的恋综</div>

        <div class="xd-field">
          <label>恋综名称</label>
          <input data-archive-title placeholder="例如：心动小屋" maxlength="30">
        </div>

        <div class="xd-field">
          <label>本季氛围</label>
          <input data-archive-tone value="温柔、暧昧、轻微修罗场" maxlength="60">
        </div>

        <div class="xd-field">
          <label>嘉宾</label>
          <div style="font-size:11px;line-height:1.7;color:#8e8183;">
            第一版会自动读取你当前 Roche 角色列表，并从中随机带入最多 4 位作为预览阵容。
          </div>
        </div>

        <div class="xd-modal-actions">
          <button class="xd-small-btn" data-modal-close>取消</button>
          <button class="xd-primary" style="margin-top:0;" data-create>创建档案</button>
        </div>
      </section>
    `;

    state.container.querySelector(".roche-plugin-xindong-xianchang").appendChild(modal);

    modal.querySelector("[data-modal-close]").addEventListener("click", closeModal);

    modal.querySelector("[data-create]").addEventListener("click", async () => {
      const title = modal.querySelector("[data-archive-title]").value.trim() || "心动小屋";
      const tone = modal.querySelector("[data-archive-tone]").value.trim() || "温柔、暧昧、轻微修罗场";

      const picked = state.characters.slice(0, 4).map((c) => ({
        characterId: c.id,
        name: c.name || "",
        handle: c.handle || "",
        avatar: c.avatar || "",
        bio: c.bio || "",
        personaSnapshot: c.persona || c.bio || "",
        joinedDay: 1,
        isNewGuest: false
      }));

      const archive = {
        archiveId: uid(),
        title,
        createdAt: Date.now(),
        lastSavedAt: Date.now(),
        userPersona: {
          personaId: state.user?.id || uid(),
          name: state.user?.name || "",
          handle: state.user?.handle || "",
          avatar: state.user?.avatar || "",
          personaSnapshot: state.user?.persona || state.user?.bio || ""
        },
        characters: picked,
        worldbook: {
          selectedCategoryIds: [],
          selectedEntryIds: [],
          snapshotText: ""
        },
        seasonConfig: {
          description: "一档以自然互动与真实心动为核心的恋爱真人秀。",
          tone,
          forbiddenContent: ""
        },
        currentDay: 1,
        currentTime: "20:36",
        currentSceneLabel: "心动小屋 · 客厅",
        timeline: [{
          day: 1,
          summary: "",
          fullNarrative: ""
        }],
        stageSummaries: [],
        relationships: {
          userToChar: {},
          charToChar: {}
        },
        privateMessages: {},
        events: [],
        pendingRequest: false,
        lastNarrative: "",
        lastQuote: ""
      };

      state.archives.unshift({
        archiveId: archive.archiveId,
        title: archive.title,
        currentDay: 1,
        characterNames: picked.map(c => c.name),
        characterAvatars: picked.map(c => c.avatar),
        lastSummary: "新的恋综世界刚刚开机。",
        lastSavedAt: archive.lastSavedAt
      });

      state.currentArchive = archive;
      await safeSet(`archive:${archive.archiveId}`, archive);
      await safeSet("archiveIndex", state.archives);

      closeModal();
      state.activeTab = "show";
      toast("《" + title + "》已开机");
      renderPage();
      updateTopDay();
    });
  }

  async function saveCurrentArchive() {
    if (!state.currentArchive) return;

    state.currentArchive.lastSavedAt = Date.now();

    const indexEntry = {
      archiveId: state.currentArchive.archiveId,
      title: state.currentArchive.title,
      currentDay: state.currentArchive.currentDay,
      characterNames: state.currentArchive.characters.map(c => c.name),
      characterAvatars: state.currentArchive.characters.map(c => c.avatar),
      lastSummary:
        state.currentArchive.lastSummary ||
        state.currentArchive.lastNarrative?.slice(0, 80) ||
        "暂无剧情",
      lastSavedAt: state.currentArchive.lastSavedAt
    };

    const existing = state.archives.findIndex(a => a.archiveId === indexEntry.archiveId);
    if (existing >= 0) state.archives[existing] = indexEntry;
    else state.archives.unshift(indexEntry);

    await safeSet(`archive:${state.currentArchive.archiveId}`, state.currentArchive);
    await safeSet("archiveIndex", state.archives);
  }

  async function loadRocheData(roche) {
    try {
      state.user = await roche.persona.getActiveUserPersona();
    } catch (error) {
      console.warn("[心动现场] 无法读取当前 USER", error);
      state.user = null;
    }

    try {
      state.characters = (await roche.character.list()) || [];
    } catch (error) {
      console.warn("[心动现场] 无法读取 CHAR", error);
      state.characters = [];
    }

    state.archives = await safeGet("archiveIndex", []);

    if (state.archives.length) {
      const first = state.archives[0];
      state.currentArchive = await safeGet(`archive:${first.archiveId}`, first);
    }
  }

  async function mount(container, roche) {
    state.container = container;
    state.roche = roche;
    state.activeTab = "show";
    state.listeners = [];

    injectStyle();
    renderShell();
    await loadRocheData(roche);
    renderPage();
    updateTopDay();
  }

  async function unmount(container) {
    state.listeners.forEach((cleanup) => {
      try { cleanup(); } catch {}
    });
    state.listeners = [];

    const modal = container.querySelector(".xd-modal-wrap");
    if (modal) modal.remove();

    container.replaceChildren();

    const style = document.getElementById(STYLE_ID);
    if (style) style.remove();

    state.container = null;
    state.roche = null;
    state.currentArchive = null;
  }

  window.RochePlugin.register({
    id: PLUGIN_ID,
    name: "心动现场",
    version: "1.0.0",
    apps: [
      {
        id: APP_ID,
        name: "心动现场",
        icon: "heart",
        iconImage: "",
        async mount(container, roche) {
          await mount(container, roche);
        },
        async unmount(container, roche) {
          await unmount(container);
        }
      }
    ]
  });
})();

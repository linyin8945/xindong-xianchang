
下面代码直接替换你现在的 `plugin.js`。

```javascript
/* =========================================================
   《心动现场》· 恋综模拟器
   V1.4.0 · House / Daily Events / Watch Room / My Phone
   作者：linyin8945

   本版核心：
   01. 心动小屋 → 地图式平面 UI
   02. 今日玩法 → 独立事件系统，与小屋地点联动
   03. 观察室 → 节目页入口，查看玩家不在时的屋内动态
   04. 我的手机 → 动态 / 微博 / 私信 / 备忘录
   05. 动态与微博严格分离
   06. 世界书 → 独立世界书库 + 创建档案时勾选
   07. USER → 支持多个 USER 人设选择
   08. 沉浸式 / 非沉浸式模式
   09. 嘉宾页面 UI 保持原版，不重新设计
   10. 启动插件时不再把 Roche 全部 CHAR 直接塞进本季嘉宾
   11. 只有创建档案并选择嘉宾后，本季嘉宾才正式出现
   12. 设置图标改为透明浅色爱心
   ========================================================= */

(() => {
  "use strict";

  const PLUGIN_ID = "xindong-xianchang";
  const APP_ID = "xindong-xianchang-home";
  const STYLE_ID = "xindong-xianchang-style";
  const VERSION = "1.4.0";

  const state = {
    roche: null,
    container: null,

    activeTab: "show",

    user: null,
    userPersonas: [],

    // 注意：
    // characters 不再作为“当前嘉宾列表”使用。
    // 当前嘉宾永远从 currentArchive.characters 读取。
    characterPool: [],

    worldbooks: [],
    archives: [],
    currentArchive: null,

    currentHouseView: "overview",
    currentPhoneView: "home",

    listeners: [],
  };

  /* =========================================================
     基础工具
     ========================================================= */

  const escapeHTML = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const uid = () =>
    globalThis.crypto?.randomUUID
      ? crypto.randomUUID()
      : `xd-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const displayName = (item, fallback = "未命名") =>
    item?.handle || item?.name || fallback;

  const realName = (item, fallback = "未命名") =>
    item?.name || item?.handle || fallback;

  const avatar = (item) => item?.avatar || "";

  const currentCharacters = () =>
    state.currentArchive?.characters || [];

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

  async function safeDelete(key) {
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

  async function confirmDialog(title, message) {
    try {
      return await state.roche.ui.confirm({
        title,
        message,
      });
    } catch {
      return window.confirm(message);
    }
  }

  function selectedCharacter(id) {
    return currentCharacters().find((c) => c.characterId === id || c.id === id);
  }

  /* =========================================================
     Roche 数据读取
     ========================================================= */

  async function loadUserPersonas(roche) {
    /*
      不同 Roche 版本可能提供不同的人设 API。
      优先尝试 list，再退回 active user。
    */

    let personas = [];

    try {
      if (roche.persona?.listUserPersonas) {
        personas = await roche.persona.listUserPersonas();
      } else if (roche.persona?.list) {
        personas = await roche.persona.list();
      } else if (roche.persona?.getUserPersonas) {
        personas = await roche.persona.getUserPersonas();
      }
    } catch (error) {
      console.warn("[心动现场] USER 人设列表读取失败", error);
    }

    if (!Array.isArray(personas) || !personas.length) {
      try {
        const active = await roche.persona.getActiveUserPersona();
        if (active) personas = [active];
      } catch {}
    }

    state.userPersonas = personas || [];
    state.user = state.userPersonas[0] || null;
  }

  async function loadCharacterPool() {
    /*
      这里依然读取 Roche CHAR。
      但它只是“候选池”。

      不会：
      - 自动加入本季
      - 自动显示到嘉宾页面
      - 自动生成关系线

      只有创建档案时用户勾选后才正式进入 archive。
    */

    try {
      state.characterPool =
        (await state.roche.character.list()) || [];
    } catch (error) {
      console.warn("[心动现场] CHAR 候选池读取失败", error);
      state.characterPool = [];
    }
  }

  async function loadWorldbooks() {
    /*
      世界书也只作为候选库。
      未勾选的世界书不会进入 currentArchive.worldbook。

      兼容几种可能的 Roche Worldbook API 命名。
    */

    let books = [];

    try {
      if (state.roche.worldbook?.list) {
        books = await state.roche.worldbook.list();
      } else if (state.roche.worldBook?.list) {
        books = await state.roche.worldBook.list();
      } else if (state.roche.worldbook?.getAll) {
        books = await state.roche.worldbook.getAll();
      } else if (state.roche.worldBook?.getAll) {
        books = await state.roche.worldBook.getAll();
      }
    } catch (error) {
      console.warn("[心动现场] 世界书读取失败", error);
    }

    state.worldbooks = Array.isArray(books) ? books : [];
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

        width: 100%;
        height: 100%;
        min-height: 100%;
        position: relative;
        overflow: hidden;

        display: flex;
        flex-direction: column;

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
      }

      .roche-plugin-xindong-xianchang button,
      .roche-plugin-xindong-xianchang input,
      .roche-plugin-xindong-xianchang textarea {
        font: inherit;
      }

      /* =====================================================
         顶栏
         ===================================================== */

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

      .xd-back,
      .xd-settings {
        width: 40px;
        height: 40px;
        flex: 0 0 40px;

        border: 0;
        border-radius: 14px;

        background: rgba(255,255,255,.64);

        display: grid;
        place-items: center;

        cursor: pointer;

        box-shadow:
          0 4px 18px rgba(101,73,80,.06);
      }

      .xd-back {
        color: var(--xd-pink-dark);
        font-size: 25px;
        line-height: 1;
      }

      /* 不再使用丑齿轮 */
      .xd-settings {
        color: #b88791;
        font-size: 21px;
      }

      .xd-settings-heart {
        opacity: .85;
        transform: translateY(-1px);
      }

      .xd-back:active,
      .xd-settings:active {
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

      /* =====================================================
         内容
         ===================================================== */

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

      /* =====================================================
         底栏
         ===================================================== */

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

      /* =====================================================
         通用
         ===================================================== */

      .xd-kicker {
        color: var(--xd-pink);
        font-size: 10px;
        letter-spacing: .18em;
        font-weight: 750;
        text-transform: uppercase;
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

      /* =====================================================
         主页面 Hero
         ===================================================== */

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

      /* =====================================================
         今日玩法
         ===================================================== */

      .xd-event-card {
        position: relative;

        padding: 16px;

        border-radius: 21px;

        background:
          linear-gradient(
            140deg,
            rgba(255,255,255,.86),
            rgba(247,233,235,.74)
          );

        border: 1px solid rgba(151,112,120,.13);

        box-shadow:
          0 8px 24px rgba(96,70,76,.055);

        cursor: pointer;

        transition: .18s ease;
      }

      .xd-event-card + .xd-event-card {
        margin-top: 9px;
      }

      .xd-event-card:active {
        transform: scale(.985);
      }

      .xd-event-top {
        display: flex;
        align-items: center;
        gap: 11px;
      }

      .xd-event-icon {
        width: 45px;
        height: 45px;

        flex: 0 0 45px;

        border-radius: 15px;

        display: grid;
        place-items: center;

        background: rgba(255,255,255,.76);

        font-size: 21px;
      }

      .xd-event-main {
        min-width: 0;
        flex: 1;
      }

      .xd-event-title {
        font-size: 14px;
        font-weight: 800;
      }

      .xd-event-meta {
        margin-top: 4px;

        font-size: 9px;
        color: var(--xd-pink);

        letter-spacing: .08em;
      }

      .xd-event-desc {
        margin-top: 11px;

        color: #75696b;

        font-size: 11px;
        line-height: 1.7;
      }

      .xd-event-arrow {
        color: #b6a7aa;
        font-size: 18px;
      }

      /* =====================================================
         小屋地图
         ===================================================== */

      .xd-house {
        position: relative;

        margin-top: 7px;

        min-height: 390px;

        border-radius: 29px;

        overflow: hidden;

        background:
          linear-gradient(
            145deg,
            #f8eeef 0%,
            #f4e2e5 45%,
            #ead5d9 100%
          );

        border: 1px solid rgba(147,105,114,.14);

        box-shadow:
          0 16px 42px rgba(102,73,80,.10);
      }

      .xd-house-wall {
        position: absolute;
        inset: 17px;

        border-radius: 23px;

        background:
          linear-gradient(
            135deg,
            rgba(255,255,255,.72),
            rgba(250,242,241,.66)
          );

        border: 1px solid rgba(147,105,114,.11);
      }

      .xd-house-title {
        position: absolute;

        top: 28px;
        left: 28px;

        z-index: 4;
      }

      .xd-house-name {
        margin-top: 4px;

        font-size: 21px;
        font-weight: 800;

        letter-spacing: -.04em;
      }

      .xd-room {
        position: absolute;

        border: 1px solid rgba(137,100,109,.13);

        background: rgba(255,255,255,.72);

        border-radius: 19px;

        box-shadow:
          0 7px 18px rgba(100,73,79,.055);

        cursor: pointer;

        transition: .18s ease;

        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;

        text-align: center;
      }

      .xd-room:active {
        transform: scale(.96);
      }

      .xd-room-icon {
        font-size: 22px;
      }

      .xd-room-name {
        margin-top: 5px;

        font-size: 12px;
        font-weight: 780;

        color: #514548;
      }

      .xd-room-sub {
        margin-top: 3px;

        font-size: 8px;
        color: #a28e92;
      }

      .xd-room.living {
        left: 32px;
        right: 32px;
        top: 92px;
        height: 106px;
      }

      .xd-room.kitchen {
        left: 32px;
        width: calc(50% - 38px);
        top: 212px;
        height: 92px;
      }

      .xd-room.garden {
        right: 32px;
        width: calc(50% - 38px);
        top: 212px;
        height: 92px;
      }

      .xd-room.bedroom {
        left: 32px;
        width: calc(50% - 38px);
        top: 318px;
        height: 54px;
      }

      .xd-room.balcony {
        right: 32px;
        width: calc(50% - 38px);
        top: 318px;
        height: 54px;
      }

      .xd-house-status {
        margin-top: 10px;

        padding: 12px 14px;

        border-radius: 17px;

        background: rgba(255,255,255,.58);

        border: 1px solid rgba(147,105,114,.10);

        font-size: 11px;
        line-height: 1.7;

        color: #75696b;
      }

      /* =====================================================
         房间详情
         ===================================================== */

      .xd-location-card {
        padding: 18px;

        border-radius: 24px;

        background: rgba(255,255,255,.78);

        border: 1px solid var(--xd-line);

        box-shadow:
          0 8px 25px rgba(96,70,76,.045);
      }

      .xd-location-title {
        font-size: 23px;
        font-weight: 800;
        letter-spacing: -.04em;
      }

      .xd-location-desc {
        margin-top: 7px;

        color: var(--xd-muted);

        font-size: 11px;
        line-height: 1.7;
      }

      .xd-presence {
        display: flex;
        flex-wrap: wrap;
        gap: 7px;

        margin-top: 14px;
      }

      .xd-presence-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;

        padding: 6px 9px;

        border-radius: 999px;

        background: var(--xd-pink-faint);

        color: var(--xd-pink-dark);

        font-size: 9px;
        font-weight: 700;
      }

      /* =====================================================
         观察室
         ===================================================== */

      .xd-observe-card {
        padding: 17px;

        border-radius: 23px;

        background:
          linear-gradient(
            145deg,
            rgba(255,255,255,.84),
            rgba(245,230,233,.72)
          );

        border: 1px solid var(--xd-line);

        box-shadow:
          0 9px 28px rgba(96,70,76,.055);
      }

      .xd-observe-row {
        display: flex;
        gap: 11px;

        padding: 12px 0;

        border-bottom: 1px solid rgba(117,91,97,.08);
      }

      .xd-observe-row:last-child {
        border-bottom: 0;
      }

      .xd-observe-avatar {
        width: 38px;
        height: 38px;

        flex: 0 0 38px;

        border-radius: 13px;

        overflow: hidden;

        background: #eadbde;

        display: grid;
        place-items: center;

        color: var(--xd-pink-dark);

        font-size: 13px;
        font-weight: 800;
      }

      .xd-observe-avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .xd-observe-text {
        flex: 1;

        font-size: 11px;
        line-height: 1.7;

        color: #66585b;
      }

      .xd-observe-time {
        margin-top: 3px;

        color: #a69498;

        font-size: 8px;
      }

      /* =====================================================
         手机
         ===================================================== */

      .xd-phone {
        border-radius: 28px;

        padding: 17px;

        background:
          linear-gradient(
            145deg,
            #f8eeef,
            #eee0e2
          );

        border: 1px solid rgba(147,105,114,.13);

        box-shadow:
          0 14px 38px rgba(96,70,76,.08);
      }

      .xd-phone-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .xd-phone-title {
        font-size: 23px;
        font-weight: 820;
        letter-spacing: -.04em;
      }

      .xd-phone-time {
        font-size: 10px;
        color: var(--xd-muted);
      }

      .xd-app-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 13px 8px;

        margin-top: 22px;
      }

      .xd-app {
        border: 0;
        background: transparent;

        cursor: pointer;

        text-align: center;
      }

      .xd-app-icon {
        width: 53px;
        height: 53px;

        margin: 0 auto;

        border-radius: 17px;

        display: grid;
        place-items: center;

        background: rgba(255,255,255,.74);

        border: 1px solid rgba(147,105,114,.10);

        box-shadow:
          0 6px 16px rgba(100,73,79,.045);

        font-size: 22px;
      }

      .xd-app-name {
        margin-top: 6px;

        font-size: 9px;
        color: #685b5e;
        font-weight: 680;
      }

      .xd-feed {
        display: grid;
        gap: 10px;
      }

      .xd-feed-card {
        padding: 15px;

        border-radius: 20px;

        background: rgba(255,255,255,.76);

        border: 1px solid var(--xd-line);
      }

      .xd-feed-top {
        display: flex;
        align-items: center;
        gap: 9px;
      }

      .xd-feed-avatar {
        width: 35px;
        height: 35px;

        border-radius: 12px;

        overflow: hidden;

        background: #eadbde;

        display: grid;
        place-items: center;

        color: var(--xd-pink-dark);

        font-size: 11px;
        font-weight: 800;
      }

      .xd-feed-avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .xd-feed-author {
        font-size: 12px;
        font-weight: 780;
      }

      .xd-feed-role {
        margin-top: 2px;

        color: var(--xd-pink);

        font-size: 8px;
      }

      .xd-feed-body {
        margin-top: 11px;

        font-size: 11px;
        line-height: 1.75;

        color: #65575a;
      }

      .xd-feed-time {
        margin-top: 9px;

        font-size: 8px;
        color: #a69498;
      }

      /* 微博分类 */

      .xd-weibo-tabs {
        display: flex;
        gap: 7px;

        overflow-x: auto;

        padding-bottom: 3px;

        scrollbar-width: none;
      }

      .xd-weibo-tabs::-webkit-scrollbar {
        display: none;
      }

      .xd-weibo-tab {
        flex: 0 0 auto;

        border: 0;

        padding: 7px 11px;

        border-radius: 999px;

        background: rgba(255,255,255,.64);

        color: #958689;

        font-size: 9px;

        cursor: pointer;
      }

      .xd-weibo-tab.active {
        background: var(--xd-pink-faint);
        color: var(--xd-pink-dark);
        font-weight: 750;
      }

      /* =====================================================
         嘉宾页面
         =====================================================
         注意：
         这里保持你原来的嘉宾页面结构。
         本版不重新设计嘉宾 UI。
         ===================================================== */

      .xd-profile {
        display: flex;
        align-items: center;
        gap: 14px;

        padding: 17px;

        border-radius: 22px;

        background: rgba(255,255,255,.76);

        border: 1px solid var(--xd-line);
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

      /* =====================================================
         档案
         ===================================================== */

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

      /* =====================================================
         Modal
         ===================================================== */

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
        max-height: 88%;

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
        min-height: 80px;
        resize: vertical;
      }

      .xd-check-list {
        display: grid;
        gap: 8px;
      }

      .xd-check {
        display: flex;
        align-items: center;
        gap: 10px;

        padding: 11px 12px;

        border-radius: 14px;

        background: white;

        border: 1px solid rgba(140,104,112,.10);

        cursor: pointer;
      }

      .xd-check input {
        width: 17px;
        height: 17px;
        flex: 0 0 17px;
      }

      .xd-check-main {
        min-width: 0;
        flex: 1;
      }

      .xd-check-title {
        font-size: 11px;
        font-weight: 750;
      }

      .xd-check-desc {
        margin-top: 3px;

        color: var(--xd-muted);

        font-size: 9px;
        line-height: 1.5;
      }

      .xd-modal-actions {
        display: flex;
        gap: 8px;
        margin-top: 18px;
      }

      .xd-modal-actions button {
        flex: 1;
      }

      /* =====================================================
         世界书库
         ===================================================== */

      .xd-library-card {
        padding: 15px;

        border-radius: 19px;

        background: rgba(255,255,255,.76);

        border: 1px solid var(--xd-line);
      }

      .xd-library-card + .xd-library-card {
        margin-top: 8px;
      }

      .xd-library-title {
        font-size: 13px;
        font-weight: 780;
      }

      .xd-library-meta {
        margin-top: 4px;

        font-size: 9px;
        color: var(--xd-muted);
      }

      /* =====================================================
         响应式
         ===================================================== */

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

          <button
            class="xd-settings"
            data-settings
            aria-label="设置"
          >
            <span class="xd-settings-heart">♡</span>
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
            data-tab="phone"
          >
            <span class="xd-tab-icon">⌕</span>
            <span class="xd-tab-label">我的手机</span>
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
        };

        button.addEventListener("click", handler);

        state.listeners.push(() =>
          button.removeEventListener("click", handler)
        );
      });

    const back =
      state.container.querySelector("[data-action='back']");

    const backHandler = () => {
      try {
        state.roche.ui.closeApp();
      } catch {
        toast("无法返回 Roche");
      }
    };

    back.addEventListener("click", backHandler);

    state.listeners.push(() =>
      back.removeEventListener("click", backHandler)
    );

    const settings =
      state.container.querySelector("[data-settings]");

    const settingsHandler = () => {
      openSettings();
    };

    settings.addEventListener("click", settingsHandler);

    state.listeners.push(() =>
      settings.removeEventListener("click", settingsHandler)
    );
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

    const text =
      escapeHTML(
        realName(item, "♡").slice(0, 1)
      );

    return `
      <div class="${className}">
        ${text}
      </div>
    `;
  }

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
     主节目页
     ========================================================= */

  function renderShow() {
    const archive = state.currentArchive;

    if (!archive) {
      return `
        <div class="xd-page">

          ${pageHead(
            "TONIGHT · LIVE",
            "还没有开始本季节目",
            "NEW SEASON"
          )}

          <section class="xd-hero">

            <div class="xd-kicker">
              WELCOME TO LOVE
            </div>

            <div class="xd-hero-title">
              心动现场
            </div>

            <div class="xd-hero-sub">
              先创建一个属于你的恋综世界，
              选择你的身份、嘉宾与世界书，
              然后节目才会真正开始。
            </div>

            <button
              class="xd-primary"
              data-new-archive
            >
              开始新的恋综
            </button>

          </section>

        </div>
      `;
    }

    const day =
      archive.currentDay || 1;

    const scene =
      archive.currentSceneLabel ||
      "心动小屋 · 客厅";

    const narrative =
      archive.lastNarrative ||
      "节目正式开机。今天没有人知道镜头之外会发生什么。";

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
            ${escapeHTML(archive.title)}
          </div>

          <div class="xd-hero-sub">
            一场关于靠近、试探、
            偶遇与心动的真人秀。
          </div>

          <div class="xd-live">
            <span class="xd-live-dot"></span>
            LIVE · ${escapeHTML(scene)}
          </div>

        </section>

        <!-- 小屋入口 -->
        <div class="xd-section-head">
          <div class="xd-section-title">
            心动小屋
          </div>

          <div class="xd-section-note">
            HOUSE MAP
          </div>
        </div>

        <section
          class="xd-house"
          data-open-house
        >

          <div class="xd-house-wall"></div>

          <div class="xd-house-title">
            <div class="xd-kicker">
              HOME
            </div>

            <div class="xd-house-name">
              心动小屋
            </div>
          </div>

          <div
            class="xd-room living"
            data-room="living"
          >
            <div class="xd-room-icon">🛋</div>
            <div class="xd-room-name">客厅</div>
            <div class="xd-room-sub">LIVING ROOM</div>
          </div>

          <div
            class="xd-room kitchen"
            data-room="kitchen"
          >
            <div class="xd-room-icon">🍳</div>
            <div class="xd-room-name">厨房</div>
            <div class="xd-room-sub">KITCHEN</div>
          </div>

          <div
            class="xd-room garden"
            data-room="garden"
          >
            <div class="xd-room-icon">🌿</div>
            <div class="xd-room-name">花园</div>
            <div class="xd-room-sub">GARDEN</div>
          </div>

          <div
            class="xd-room bedroom"
            data-room="bedroom"
          >
            <div class="xd-room-icon">♡</div>
            <div class="xd-room-name">房间</div>
            <div class="xd-room-sub">ROOMS</div>
          </div>

          <div
            class="xd-room balcony"
            data-room="balcony"
          >
            <div class="xd-room-icon">☾</div>
            <div class="xd-room-name">阳台</div>
            <div class="xd-room-sub">BALCONY</div>
          </div>

        </section>

        <!-- 今日玩法与小屋彻底分开 -->
        <div class="xd-section-head">

          <div class="xd-section-title">
            今日玩法
          </div>

          <div class="xd-section-note">
            TODAY'S EVENTS
          </div>

        </div>

        <div class="xd-card-grid">
          ${renderDailyEvents()}
        </div>

        <!-- 观察室只有节目页入口 -->
        <div class="xd-section-head">

          <div class="xd-section-title">
            观察室
          </div>

          <div class="xd-section-note">
            OFF CAMERA
          </div>

        </div>

        <section
          class="xd-observe-card"
          data-open-observe
        >

          <div class="xd-kicker">
            CAMERA OFF
          </div>

          <div
            style="
              margin-top:6px;
              font-size:18px;
              font-weight:800;
            "
          >
            当你不在的时候……
          </div>

          <div
            style="
              margin-top:6px;
              font-size:11px;
              color:#8e8183;
              line-height:1.7;
            "
          >
            看看镜头之外的小屋里，
            他们正在做什么。
          </div>

          <div
            style="
              margin-top:13px;
              color:#a97983;
              font-size:10px;
              font-weight:750;
            "
          >
            进入观察室 →
          </div>

        </section>

      </div>
    `;
  }

  /* =========================================================
     今日玩法
     ========================================================= */

  const DEFAULT_EVENTS = [
    {
      id: "kitchen-battle",
      icon: "🍳",
      title: "厨房挑战",
      place: "厨房",
      placeId: "kitchen",
      desc: "节目组突然宣布今天的晚餐由嘉宾共同完成。",
    },
    {
      id: "living-question",
      icon: "💗",
      title: "心动问答",
      place: "客厅",
      placeId: "living",
      desc: "节目组留下了一组不能轻易回答的问题。",
    },
    {
      id: "garden-time",
      icon: "🌿",
      title: "花园偶遇",
      place: "花园",
      placeId: "garden",
      desc: "晚风刚好，镜头没有跟得太紧。",
    },
  ];

  function getDailyEvents() {
    const archive = state.currentArchive;

    if (!archive) return [];

    if (
      Array.isArray(archive.dailyEvents) &&
      archive.dailyEvents.length
    ) {
      return archive.dailyEvents;
    }

    return DEFAULT_EVENTS;
  }

  function renderDailyEvents() {
    return getDailyEvents()
      .map((event) => `
        <article
          class="xd-event-card"
          data-event-id="${escapeHTML(event.id)}"
        >

          <div class="xd-event-top">

            <div class="xd-event-icon">
              ${escapeHTML(event.icon || "✦")}
            </div>

            <div class="xd-event-main">

              <div class="xd-event-title">
                ${escapeHTML(event.title)}
              </div>

              <div class="xd-event-meta">
                ${escapeHTML(event.place || "PROGRAM")}
              </div>

            </div>

            <div class="xd-event-arrow">
              ›
            </div>

          </div>

          <div class="xd-event-desc">
            ${escapeHTML(event.desc || "今日节目事件。")}
          </div>

        </article>
      `)
      .join("");
  }

  async function triggerDailyEvent(eventId) {
    const event =
      getDailyEvents().find(
        (item) => item.id === eventId
      );

    if (!event || !state.currentArchive) return;

    state.currentArchive.currentSceneLabel =
      `心动小屋 · ${event.place}`;

    state.currentArchive.activeEvent = {
      id: event.id,
      title: event.title,
      place: event.place,
      startedAt: Date.now(),
    };

    state.currentArchive.lastNarrative =
      `节目组临时宣布了「${event.title}」。所有人的注意力都开始向${event.place}聚拢。`;

    state.currentArchive.lastQuote =
      "“看来今晚不会像平时那么安静了。”";

    await saveCurrentArchive();

    state.currentHouseView =
      event.placeId || "living";

    renderPage();
    updateTopDay();

    toast(`已进入：${event.title}`);
  }

  /* =========================================================
     小屋地点
     ========================================================= */

  const HOUSE_INFO = {
    living: {
      title: "客厅",
      icon: "🛋",
      desc: "节目最容易发生交集的地方。有人聊天，有人观察，也有人故意坐在离某个人近一点的位置。",
    },

    kitchen: {
      title: "厨房",
      icon: "🍳",
      desc: "晚餐、偷偷帮忙、厨房挑战，以及一些镜头之外的小互动都会在这里发生。",
    },

    garden: {
      title: "花园",
      icon: "🌿",
      desc: "这里没有那么多摄像机。有人散步，有人透气，也可能发生一场没有被节目组安排的谈话。",
    },

    bedroom: {
      title: "房间",
      icon: "♡",
      desc: "一天结束之后，每个人回到自己的私人空间。这里更多记录独处状态。",
    },

    balcony: {
      title: "阳台",
      icon: "☾",
      desc: "夜晚的小屋最安静的地方。适合一个人吹风，也适合两个人偶然碰面。",
    },
  };

  function renderHouseLocation(locationId) {
    const info =
      HOUSE_INFO[locationId] ||
      HOUSE_INFO.living;

    const chars = currentCharacters();

    const present =
      state.currentArchive?.locationState?.[locationId]
        ?.characterIds || [];

    return `
      <div class="xd-page">

        <div
          style="
            display:flex;
            align-items:center;
            gap:8px;
            margin-bottom:12px;
          "
        >
          <button
            class="xd-small-btn"
            style="flex:0 0 auto;width:auto;"
            data-house-back
          >
            ← 小屋
          </button>

          <div class="xd-section-note">
            HOUSE / LOCATION
          </div>
        </div>

        <section class="xd-location-card">

          <div
            style="
              font-size:32px;
            "
          >
            ${info.icon}
          </div>

          <div class="xd-location-title">
            ${escapeHTML(info.title)}
          </div>

          <div class="xd-location-desc">
            ${escapeHTML(info.desc)}
          </div>

          <div class="xd-kicker" style="margin-top:17px;">
            NOW HERE
          </div>

          <div class="xd-presence">

            ${
              present.length
                ? present
                    .map((id) => {
                      const char =
                        selectedCharacter(id);

                      return char
                        ? `
                          <span class="xd-presence-chip">
                            ${escapeHTML(
                              realName(char)
                            )}
                          </span>
                        `
                        : "";
                    })
                    .join("")
                : `
                  <span
                    style="
                      color:#9a898d;
                      font-size:10px;
                    "
                  >
                    暂时没有记录到具体人物。
                  </span>
                `
            }

          </div>

        </section>

        <div class="xd-section-head">
          <div class="xd-section-title">
            这里可能发生
          </div>
        </div>

        <div class="xd-card-grid">

          ${
            getDailyEvents()
              .filter(
                (event) =>
                  event.placeId === locationId
              )
              .map(
                (event) => `
                  <article
                    class="xd-event-card"
                    data-event-id="${escapeHTML(event.id)}"
                  >

                    <div class="xd-event-top">

                      <div class="xd-event-icon">
                        ${escapeHTML(event.icon)}
                      </div>

                      <div class="xd-event-main">

                        <div class="xd-event-title">
                          ${escapeHTML(event.title)}
                        </div>

                        <div class="xd-event-meta">
                          TODAY'S EVENT
                        </div>

                      </div>

                      <div class="xd-event-arrow">
                        ›
                      </div>

                    </div>

                    <div class="xd-event-desc">
                      ${escapeHTML(event.desc)}
                    </div>

                  </article>
                `
              )
              .join("")
          }

        </div>

      </div>
    `;
  }

  /* =========================================================
     观察室
     ========================================================= */

  function renderObservationRoom() {
    const archive = state.currentArchive;

    const logs =
      archive?.observationLog || [];

    return `
      <div class="xd-page">

        <div
          style="
            display:flex;
            align-items:center;
            gap:8px;
            margin-bottom:12px;
          "
        >
          <button
            class="xd-small-btn"
            style="flex:0 0 auto;width:auto;"
            data-observe-back
          >
            ← 节目
          </button>

          <div class="xd-section-note">
            OFF CAMERA
          </div>
        </div>

        ${pageHead(
          "OBSERVATION ROOM",
          "观察室",
          "镜头之外"
        )}

        <section class="xd-observe-card">

          <div class="xd-kicker">
            WHEN YOU ARE AWAY
          </div>

          <div
            style="
              margin-top:7px;
              font-size:22px;
              font-weight:800;
              letter-spacing:-.04em;
            "
          >
            他们正在做什么？
          </div>

          <div
            style="
              margin-top:7px;
              color:#8e8183;
              font-size:11px;
              line-height:1.7;
            "
          >
            这里记录玩家不在场时，
            小屋里自然发生的互动。
          </div>

        </section>

        <div class="xd-section-head">
          <div class="xd-section-title">
            镜头外记录
          </div>

          <div class="xd-section-note">
            ${logs.length} 条
          </div>
        </div>

        <section class="xd-observe-card">

          ${
            logs.length
              ? logs
                  .map(
                    (item) => `
                      <div class="xd-observe-row">

                        <div class="xd-observe-avatar">
                          ${
                            item.avatar
                              ? `
                                <img
                                  src="${escapeHTML(item.avatar)}"
                                  alt=""
                                >
                              `
                              : "♡"
                          }
                        </div>

                        <div class="xd-observe-text">

                          <div>
                            ${escapeHTML(item.text)}
                          </div>

                          <div class="xd-observe-time">
                            ${escapeHTML(
                              item.time || "刚刚"
                            )}
                          </div>

                        </div>

                      </div>
                    `
                  )
                  .join("")
              : `
                <div class="xd-empty">
                  <div class="xd-empty-icon">
                    ◌
                  </div>

                  <div class="xd-empty-title">
                    观察室暂时安静
                  </div>

                  <div class="xd-empty-text">
                    随着剧情推进，
                    镜头之外也会逐渐留下记录。
                  </div>
                </div>
              `
          }

        </section>

      </div>
    `;
  }

  /* =========================================================
     嘉宾页面
     =========================================================
     重要：
     这里保持原版页面。
     唯一改变的是数据源：
     currentArchive.characters
     ========================================================= */

  function renderGuests() {
    const chars = currentCharacters();

    return `
      <div class="xd-page">

        ${pageHead(
          "THE CAST",
          "本季嘉宾",
          `${chars.length} 位已加入`
        )}

        <div class="xd-profile">

          ${avatarHTML(state.user)}

          <div>

            <div class="xd-profile-name">
              ${escapeHTML(
                realName(
                  state.user,
                  "我的人设"
                )
              )}
            </div>

            <div class="xd-profile-handle">
              ${
                state.user?.handle
                  ? "@" + escapeHTML(
                      state.user.handle
                    )
                  : "USER"
              }
            </div>

            <div class="xd-profile-bio">
              ${escapeHTML(
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
            LOCKED PERSONA
          </div>

        </div>

        <div class="xd-card-grid">

          ${
            chars.length
              ? chars
                  .map(
                    (char) => `
                      <div
                        class="xd-guest-card"
                        data-guest-id="${escapeHTML(
                          char.characterId || char.id
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
                              char.bio ||
                              "这个人没有留下简介。"
                            )}
                          </div>

                        </div>

                        <div class="xd-arrow">
                          ›
                        </div>

                      </div>
                    `
                  )
                  .join("")
              : `
                <div class="xd-empty">

                  <div class="xd-empty-icon">
                    ♡
                  </div>

                  <div class="xd-empty-title">
                    还没有嘉宾
                  </div>

                  <div class="xd-empty-text">
                    创建恋综档案后，
                    从 Roche 角色中选择你的入住嘉宾。
                  </div>

                </div>
              `
          }

        </div>

      </div>
    `;
  }

  /* =========================================================
     我的手机
     ========================================================= */

  function renderPhone() {
    return `
      <div class="xd-page">

        ${pageHead(
          "MY PHONE",
          "我的手机",
          "PERSONAL DEVICE"
        )}

        <section class="xd-phone">

          <div class="xd-phone-head">

            <div class="xd-phone-title">
              我的手机
            </div>

            <div class="xd-phone-time">
              ${new Date().toLocaleTimeString(
                "zh-CN",
                {
                  hour: "2-digit",
                  minute: "2-digit",
                }
              )}
            </div>

          </div>

          <div class="xd-app-grid">

            <button
              class="xd-app"
              data-phone-app="feed"
            >
              <div class="xd-app-icon">
                ♡
              </div>
              <div class="xd-app-name">
                动态
              </div>
            </button>

            <button
              class="xd-app"
              data-phone-app="weibo"
            >
              <div class="xd-app-icon">
                ◎
              </div>
              <div class="xd-app-name">
                微博
              </div>
            </button>

            <button
              class="xd-app"
              data-phone-app="messages"
            >
              <div class="xd-app-icon">
                ✉
              </div>
              <div class="xd-app-name">
                私信
              </div>
            </button>

            <button
              class="xd-app"
              data-phone-app="notes"
            >
              <div class="xd-app-icon">
                ▤
              </div>
              <div class="xd-app-name">
                备忘录
              </div>
            </button>

            <button
              class="xd-app"
              data-phone-app="notice"
            >
              <div class="xd-app-icon">
                ♧
              </div>
              <div class="xd-app-name">
                节目通知
              </div>
            </button>

            <button
              class="xd-app"
              data-phone-app="world"
            >
              <div class="xd-app-icon">
                ✦
              </div>
              <div class="xd-app-name">
                世界书
              </div>
            </button>

          </div>

        </section>

      </div>
    `;
  }

  function renderPhoneSubpage() {
    const view = state.currentPhoneView;

    if (view === "feed") {
      return renderPhoneFeed();
    }

    if (view === "weibo") {
      return renderWeibo();
    }

    if (view === "messages") {
      return renderPhoneMessages();
    }

    if (view === "notes") {
      return renderPhoneNotes();
    }

    if (view === "notice") {
      return renderPhoneNotice();
    }

    if (view === "world") {
      return renderPhoneWorld();
    }

    return renderPhone();
  }

  /* =========================================================
     动态
     ========================================================= */

  function renderPhoneFeed() {
    const archive = state.currentArchive;

    const posts =
      archive?.phone?.feed || [
        {
          author: "节目组",
          role: "PRODUCER",
          text: "今天的拍摄比想象中顺利。希望大家晚上都能放松一点。",
          time: "今天 18:20",
        },
        {
          author:
            currentCharacters()[0]?.name ||
            "某位嘉宾",
          role: "GUEST",
          text: "今天好像发生了很多事情。",
          time: "今天 19:04",
        },
      ];

    return `
      <div class="xd-page">

        <button
          class="xd-small-btn"
          style="width:auto;"
          data-phone-home
        >
          ← 我的手机
        </button>

        ${pageHead(
          "PERSONAL FEED",
          "动态",
          "与你有关的人"
        )}

        <div
          style="
            margin-bottom:12px;
            color:#8e8183;
            font-size:10px;
            line-height:1.6;
          "
        >
          这里只显示与你和本季节目直接有关的人。
          陌生网友不会出现在这里。
        </div>

        <div class="xd-feed">

          ${posts
            .map(
              (post) => `
                <article class="xd-feed-card">

                  <div class="xd-feed-top">

                    <div class="xd-feed-avatar">
                      ${
                        post.avatar
                          ? `
                            <img
                              src="${escapeHTML(
                                post.avatar
                              )}"
                              alt=""
                            >
                          `
                          : "♡"
                      }
                    </div>

                    <div>

                      <div class="xd-feed-author">
                        ${escapeHTML(
                          post.author
                        )}
                      </div>

                      <div class="xd-feed-role">
                        ${escapeHTML(
                          post.role || "节目相关"
                        )}
                      </div>

                    </div>

                  </div>

                  <div class="xd-feed-body">
                    ${escapeHTML(post.text)}
                  </div>

                  <div class="xd-feed-time">
                    ${escapeHTML(
                      post.time || "刚刚"
                    )}
                  </div>

                </article>
              `
            )
            .join("")}

        </div>

      </div>
    `;
  }

  /* =========================================================
     微博
     ========================================================= */

  function renderWeibo() {
    const archive = state.currentArchive;

    const category =
      archive?.phone?.weiboCategory ||
      "all";

    const posts =
      archive?.phone?.weibo || [
        {
          category: "gossip",
          author: "吃瓜群众A",
          text: "今晚这个恋综是不是有点东西？感觉某两个人之间真的很微妙。",
          time: "今天 19:22",
        },
        {
          category: "report",
          author: "娱乐现场",
          text: "《心动现场》今晚最新路透：嘉宾阵容逐渐公开。",
          time: "今天 18:45",
        },
        {
          category: "fan",
          author: "心动同人站",
          text: "如果他们真的在一起，我先写为敬。",
          time: "今天 17:18",
        },
      ];

    const filtered =
      category === "all"
        ? posts
        : posts.filter(
            (post) =>
              post.category === category
          );

    const labels = [
      ["all", "全部"],
      ["gossip", "吃瓜"],
      ["report", "报道"],
      ["fan", "同人"],
    ];

    return `
      <div class="xd-page">

        <button
          class="xd-small-btn"
          style="width:auto;"
          data-phone-home
        >
          ← 我的手机
        </button>

        ${pageHead(
          "PUBLIC INTERNET",
          "微博",
          "外部世界"
        )}

        <div class="xd-weibo-tabs">

          ${labels
            .map(
              ([id, label]) => `
                <button
                  class="xd-weibo-tab ${
                    category === id
                      ? "active"
                      : ""
                  }"
                  data-weibo-category="${id}"
                >
                  ${label}
                </button>
              `
            )
            .join("")}

        </div>

        <div
          class="xd-feed"
          style="margin-top:11px;"
        >

          ${
            filtered.length
              ? filtered
                  .map(
                    (post) => `
                      <article class="xd-feed-card">

                        <div class="xd-feed-top">

                          <div class="xd-feed-avatar">
                            ◎
                          </div>

                          <div>

                            <div class="xd-feed-author">
                              ${escapeHTML(
                                post.author
                              )}
                            </div>

                            <div class="xd-feed-role">
                              PUBLIC
                            </div>

                          </div>

                        </div>

                        <div class="xd-feed-body">
                          ${escapeHTML(
                            post.text
                          )}
                        </div>

                        <div class="xd-feed-time">
                          ${escapeHTML(
                            post.time ||
                            "刚刚"
                          )}
                        </div>

                      </article>
                    `
                  )
                  .join("")
              : `
                <div class="xd-empty">
                  <div class="xd-empty-icon">
                    ◎
                  </div>

                  <div class="xd-empty-title">
                    这个分类还没有消息
                  </div>

                  <div class="xd-empty-text">
                    随着节目推进，
                    外部舆论会慢慢产生变化。
                  </div>
                </div>
              `
          }

        </div>

      </div>
    `;
  }

  /* =========================================================
     私信
     ========================================================= */

  function renderPhoneMessages() {
    const messages =
      state.currentArchive?.privateMessages || {};

    const chars = currentCharacters();

    return `
      <div class="xd-page">

        <button
          class="xd-small-btn"
          style="width:auto;"
          data-phone-home
        >
          ← 我的手机
        </button>

        ${pageHead(
          "PRIVATE MESSAGES",
          "私信",
          "本季节目"
        )}

        <div class="xd-card-grid">

          ${
            chars.length
              ? chars
                  .map(
                    (char) => {
                      const id =
                        char.characterId ||
                        char.id;

                      const list =
                        messages[id] || [];

                      const last =
                        list[list.length - 1];

                      return `
                        <article
                          class="xd-guest-card"
                          data-chat-character="${escapeHTML(id)}"
                        >

                          ${avatarHTML(char)}

                          <div class="xd-guest-main">

                            <div class="xd-guest-name">
                              ${escapeHTML(
                                realName(char)
                              )}
                            </div>

                            <div class="xd-guest-bio">
                              ${
                                last?.text
                                  ? escapeHTML(
                                      last.text
                                    )
                                  : "还没有聊天记录"
                              }
                            </div>

                          </div>

                          <div class="xd-arrow">
                            ›
                          </div>

                        </article>
                      `;
                    }
                  )
                  .join("")
              : `
                <div class="xd-empty">
                  <div class="xd-empty-icon">
                    ✉
                  </div>

                  <div class="xd-empty-title">
                    还没有私信
                  </div>

                  <div class="xd-empty-text">
                    当角色主动联系你后，
                    对话会出现在这里。
                  </div>
                </div>
              `
          }

        </div>

      </div>
    `;
  }

  function openPrivateChat(char) {
    const id =
      char.characterId ||
      char.id;

    const list =
      state.currentArchive?.privateMessages?.[id] ||
      [];

    const modal =
      document.createElement("div");

    modal.className = "xd-modal-wrap";

    modal.innerHTML = `
      <section
        class="xd-modal"
        style="
          height:88%;
          max-height:88%;
        "
      >

        <div class="xd-modal-handle"></div>

        <div
          style="
            display:flex;
            align-items:center;
            gap:10px;
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
                margin-top:3px;
                color:#a97983;
                font-size:9px;
              "
            >
              PRIVATE MESSAGE
            </div>

          </div>

        </div>

        <div
          style="
            margin-top:17px;
            min-height:230px;
            padding:5px;
            border-radius:17px;
            background:#f6eeee;
          "
        >

          ${
            list.length
              ? list
                  .map(
                    (message) => `
                      <div
                        style="
                          margin:8px;
                          padding:10px 12px;
                          border-radius:15px;
                          background:white;
                          font-size:11px;
                          line-height:1.7;
                          color:#65575a;
                        "
                      >
                        ${escapeHTML(
                          message.text
                        )}
                      </div>
                    `
                  )
                  .join("")
              : `
                <div
                  style="
                    padding:45px 20px;
                    text-align:center;
                    color:#a09295;
                    font-size:10px;
                  "
                >
                  你们还没有开始聊天。
                </div>
              `
          }

        </div>

        <div class="xd-field">

          <label>
            回复
          </label>

          <textarea
            data-chat-input
            placeholder="输入消息……"
          ></textarea>

        </div>

        <div class="xd-modal-actions">

          <button
            class="xd-small-btn"
            data-chat-close
          >
            关闭
          </button>

          <button
            class="xd-primary"
            style="margin-top:0;"
            data-chat-send
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
      .querySelector("[data-chat-close]")
      .addEventListener(
        "click",
        () => modal.remove()
      );

    modal
      .querySelector("[data-chat-send]")
      .addEventListener(
        "click",
        async () => {

          const input =
            modal.querySelector(
              "[data-chat-input]"
            );

          const text =
            input.value.trim();

          if (!text) return;

          if (
            !state.currentArchive.privateMessages
          ) {
            state.currentArchive.privateMessages = {};
          }

          if (
            !state.currentArchive.privateMessages[id]
          ) {
            state.currentArchive.privateMessages[id] = [];
          }

          state.currentArchive
            .privateMessages[id]
            .push({
              from: "user",
              text,
              createdAt: Date.now(),
            });

          await saveCurrentArchive();

          input.value = "";

          modal.remove();

          renderPage();

          toast("消息已发送");
        }
      );
  }

  function renderPhoneNotes() {
    const notes =
      state.currentArchive?.phone?.notes || [];

    return `
      <div class="xd-page">

        <button
          class="xd-small-btn"
          style="width:auto;"
          data-phone-home
        >
          ← 我的手机
        </button>

        ${pageHead(
          "NOTES",
          "备忘录",
          "我的记录"
        )}

        ${
          notes.length
            ? `
              <div class="xd-feed">
                ${notes
                  .map(
                    (note) => `
                      <article class="xd-feed-card">
                        <div class="xd-feed-body">
                          ${escapeHTML(
                            note.text
                          )}
                        </div>

                        <div class="xd-feed-time">
                          ${escapeHTML(
                            note.time ||
                            "刚刚"
                          )}
                        </div>
                      </article>
                    `
                  )
                  .join("")}
              </div>
            `
            : `
              <div class="xd-empty">
                <div class="xd-empty-icon">
                  ▤
                </div>

                <div class="xd-empty-title">
                  还没有备忘
                </div>

                <div class="xd-empty-text">
                  可以把恋综里的重要事情记下来。
                </div>
              </div>
            `
        }

      </div>
    `;
  }

  function renderPhoneNotice() {
    return `
      <div class="xd-page">

        <button
          class="xd-small-btn"
          style="width:auto;"
          data-phone-home
        >
          ← 我的手机
        </button>

        ${pageHead(
          "PROGRAM",
          "节目通知",
          "制作组"
        )}

        <div class="xd-feed">

          <article class="xd-feed-card">

            <div class="xd-feed-author">
              《心动现场》节目组
            </div>

            <div class="xd-feed-body">
              欢迎进入本季节目。
              后续的重要节目安排、
              临时任务与特别通知都会在这里出现。
            </div>

            <div class="xd-feed-time">
              本季开机
            </div>

          </article>

        </div>

      </div>
    `;
  }

  function renderPhoneWorld() {
    const selected =
      state.currentArchive?.worldbook
        ?.selectedBookIds || [];

    const books =
      state.worldbooks.filter(
        (book) =>
          selected.includes(
            book.id ||
            book.worldbookId
          )
      );

    return `
      <div class="xd-page">

        <button
          class="xd-small-btn"
          style="width:auto;"
          data-phone-home
        >
          ← 我的手机
        </button>

        ${pageHead(
          "WORLD",
          "本季世界书",
          `${books.length} 本`
        )}

        ${
          books.length
            ? books
                .map(
                  (book) => `
                    <div class="xd-library-card">

                      <div class="xd-library-title">
                        ${escapeHTML(
                          book.name ||
                          book.title ||
                          "未命名世界书"
                        )}
                      </div>

                      <div class="xd-library-meta">
                        已加入本季世界
                      </div>

                    </div>
                  `
                )
                .join("")
            : `
              <div class="xd-empty">
                <div class="xd-empty-icon">
                  ✦
                </div>

                <div class="xd-empty-title">
                  本季没有选择世界书
                </div>

                <div class="xd-empty-text">
                  创建档案时可以选择已有世界书。
                </div>
              </div>
            `
        }

      </div>
    `;
  }

  /* =========================================================
     档案页面
     ========================================================= */

  function renderArchives() {
    return `
      <div class="xd-page">

        ${pageHead(
          "YOUR SHOWS",
          "恋综档案",
          `${state.archives.length} 个世界`
        )}

        <div class="xd-empty"
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
            关系、世界书与手机数据彼此独立。
          </div>

        </div>

        <div class="xd-card-grid">

          ${
            state.archives.length
              ? state.archives
                  .map(
                    (archive) => `
                      <article class="xd-archive">

                        <div class="xd-archive-title">
                          ${escapeHTML(
                            archive.title
                          )}
                        </div>

                        <div class="xd-archive-meta">
                          DAY
                          ${String(
                            archive.currentDay ||
                            1
                          ).padStart(2, "0")}
                          ·
                          ${
                            (
                              archive.characterNames ||
                              []
                            ).length
                          } 位嘉宾
                        </div>

                        <div
                          style="
                            margin-top:13px;
                            font-size:10px;
                            color:#8e8183;
                          "
                        >
                          ${
                            archive.userName
                              ? `参与者：${escapeHTML(
                                  archive.userName
                                )}`
                              : ""
                          }
                        </div>

                        <div class="xd-archive-actions">

                          <button
                            class="xd-small-btn"
                            data-open-archive="${escapeHTML(
                              archive.archiveId
                            )}"
                          >
                            进入档案
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
                    `
                  )
                  .join("")
              : ""
          }

        </div>

        <!-- 档案页面保留创建入口 -->
        <button
          class="xd-new-archive"
          data-new-archive
        >
          ＋ 创建新的恋综世界
        </button>

        <div style="margin-top:12px;">

          <button
            class="xd-new-archive"
            data-world-library
          >
            ✦ 世界书库
          </button>

        </div>

      </div>
    `;
  }

  /* =========================================================
     创建恋综
     ========================================================= */

  function openCreateArchive() {
    const modal =
      document.createElement("div");

    modal.className = "xd-modal-wrap";

    const users =
      state.userPersonas.length
        ? state.userPersonas
        : state.user
          ? [state.user]
          : [];

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

        <!-- USER -->

        <div class="xd-field">

          <label>
            ① 选择本季的你
          </label>

          <div class="xd-check-list">

            ${
              users.length
                ? users
                    .map(
                      (user, index) => `
                        <label class="xd-check">

                          <input
                            type="radio"
                            name="xd-user"
                            value="${escapeHTML(
                              user.id ||
                              user.personaId ||
                              index
                            )}"
                            ${
                              index === 0
                                ? "checked"
                                : ""
                            }
                          >

                          ${avatarHTML(
                            user,
                            "xd-avatar"
                          )}

                          <div class="xd-check-main">

                            <div class="xd-check-title">
                              ${escapeHTML(
                                realName(user)
                              )}
                            </div>

                            <div class="xd-check-desc">
                              ${
                                user.handle
                                  ? "@" +
                                    escapeHTML(
                                      user.handle
                                    )
                                  : "USER 人设"
                              }
                            </div>

                          </div>

                        </label>
                      `
                    )
                    .join("")
                : `
                  <div class="xd-empty">
                    暂时没有可用的 USER 人设。
                  </div>
                `
            }

          </div>

        </div>

        <!-- 嘉宾 -->

        <div class="xd-field">

          <label>
            ② 选择本季嘉宾
          </label>

          <div class="xd-check-list">

            ${
              state.characterPool.length
                ? state.characterPool
                    .map(
                      (char) => `
                        <label class="xd-check">

                          <input
                            type="checkbox"
                            name="xd-char"
                            value="${escapeHTML(
                              char.id
                            )}"
                          >

                          ${avatarHTML(char)}

                          <div class="xd-check-main">

                            <div class="xd-check-title">
                              ${escapeHTML(
                                realName(char)
                              )}
                            </div>

                            <div class="xd-check-desc">
                              ${
                                char.handle
                                  ? "@" +
                                    escapeHTML(
                                      char.handle
                                    )
                                  : "嘉宾"
                              }
                            </div>

                          </div>

                        </label>
                      `
                    )
                    .join("")
                : `
                  <div class="xd-empty">
                    Roche 中没有可选择的角色。
                  </div>
                `
            }

          </div>

        </div>

        <!-- 世界书 -->

        <div class="xd-field">

          <label>
            ③ 选择世界书
          </label>

          <div class="xd-check-list">

            ${
              state.worldbooks.length
                ? state.worldbooks
                    .map(
                      (book) => `
                        <label class="xd-check">

                          <input
                            type="checkbox"
                            name="xd-world"
                            value="${escapeHTML(
                              book.id ||
                              book.worldbookId
                            )}"
                          >

                          <div
                            style="
                              width:34px;
                              height:34px;
                              flex:0 0 34px;
                              border-radius:11px;
                              background:#f1e5e6;
                              display:grid;
                              place-items:center;
                            "
                          >
                            ✦
                          </div>

                          <div class="xd-check-main">

                            <div class="xd-check-title">
                              ${escapeHTML(
                                book.name ||
                                book.title ||
                                "未命名世界书"
                              )}
                            </div>

                            <div class="xd-check-desc">
                              加入本季世界
                            </div>

                          </div>

                        </label>
                      `
                    )
                    .join("")
                : `
                  <div class="xd-empty"
                    style="padding:22px 15px;"
                  >

                    <div class="xd-empty-icon">
                      ✦
                    </div>

                    <div class="xd-empty-title">
                      世界书库还是空的
                    </div>

                    <div class="xd-empty-text">
                      可以先去世界书库创建自己的世界书。
                    </div>

                    <button
                      class="xd-primary"
                      data-create-worldbook
                    >
                      创建世界书
                    </button>

                  </div>
                `
            }

          </div>

        </div>

        <!-- 节目设置 -->

        <div class="xd-field">

          <label>
            ④ 本季设定
          </label>

          <input
            data-archive-title
            placeholder="恋综名称，例如：心动小屋"
            maxlength="30"
          >

          <input
            data-archive-tone
            style="margin-top:8px;"
            value="温柔、暧昧、轻微修罗场"
            maxlength="60"
            placeholder="本季氛围"
          >

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

            <label class="xd-check">

              <input
                type="radio"
                name="xd-mode"
                value="immersive"
                checked
              >

              <div class="xd-check-main">

                <div class="xd-check-title">
                  沉浸式
                </div>

                <div class="xd-check-desc">
                  读取你的人设 + Roche 记忆，
                  保留你与角色过去的关系。
                </div>

              </div>

            </label>

            <label class="xd-check">

              <input
                type="radio"
                name="xd-mode"
                value="persona"
              >

              <div class="xd-check-main">

                <div class="xd-check-title">
                  非沉浸式
                </div>

                <div class="xd-check-desc">
                  只读取人设，不读取过去记忆，
                  按本季设定开始关系。
                </div>

              </div>

            </label>

          </div>

        </div>

        <div class="xd-modal-actions">

          <button
            class="xd-small-btn"
            data-modal-close
          >
            取消
          </button>

          <button
            class="xd-primary"
            style="margin-top:0;"
            data-create
          >
            开机
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

    const worldButton =
      modal.querySelector(
        "[data-create-worldbook]"
      );

    if (worldButton) {
      worldButton.addEventListener(
        "click",
        () => {
          modal.remove();
          openWorldbookLibrary(true);
        }
      );
    }

    modal
      .querySelector("[data-create]")
      .addEventListener(
        "click",
        async () => {

          const title =
            modal
              .querySelector(
                "[data-archive-title]"
              )
              .value
              .trim() ||
            "心动小屋";

          const tone =
            modal
              .querySelector(
                "[data-archive-tone]"
              )
              .value
              .trim() ||
            "温柔、暧昧、轻微修罗场";

          const selectedUserId =
            modal.querySelector(
              'input[name="xd-user"]:checked'
            )?.value;

          const selectedUser =
            users.find(
              (user, index) =>
                String(
                  user.id ||
                  user.personaId ||
                  index
                ) === String(
                  selectedUserId
                )
            ) || users[0];

          const selectedCharIds =
            Array.from(
              modal.querySelectorAll(
                'input[name="xd-char"]:checked'
              )
            ).map(
              (input) => input.value
            );

          const selectedWorldIds =
            Array.from(
              modal.querySelectorAll(
                'input[name="xd-world"]:checked'
              )
            ).map(
              (input) => input.value
            );

          const mode =
            modal.querySelector(
              'input[name="xd-mode"]:checked'
            )?.value ||
            "immersive";

          const picked =
            state.characterPool
              .filter((char) =>
                selectedCharIds.includes(
                  String(char.id)
                )
              )
              .map((char) => ({
                characterId: char.id,
                name: char.name || "",
                handle: char.handle || "",
                avatar: char.avatar || "",
                bio: char.bio || "",
                personaSnapshot:
                  char.persona ||
                  char.bio ||
                  "",
                joinedDay: 1,
                isNewGuest: false,
              }));

          const selectedWorldbooks =
            state.worldbooks.filter(
              (book) =>
                selectedWorldIds.includes(
                  String(
                    book.id ||
                    book.worldbookId
                  )
                )
            );

          const archive = {
            archiveId: uid(),

            title,

            createdAt: Date.now(),
            lastSavedAt: Date.now(),

            userPersona: {
              personaId:
                selectedUser?.id ||
                selectedUser?.personaId ||
                uid(),

              name:
                selectedUser?.name ||
                "",

              handle:
                selectedUser?.handle ||
                "",

              avatar:
                selectedUser?.avatar ||
                "",

              personaSnapshot:
                selectedUser?.persona ||
                selectedUser?.bio ||
                "",
            },

            characters: picked,

            /*
              只有勾选的世界书进入这里。
              没勾选的不属于本档案。
            */
            worldbook: {
              selectedBookIds:
                selectedWorldbooks.map(
                  (book) =>
                    book.id ||
                    book.worldbookId
                ),

              selectedBooks:
                selectedWorldbooks.map(
                  (book) => ({
                    id:
                      book.id ||
                      book.worldbookId,

                    name:
                      book.name ||
                      book.title ||
                      "未命名世界书",

                    snapshot:
                      book.content ||
                      book.description ||
                      "",
                  })
                ),
            },

            seasonConfig: {
              description:
                "一档以自然互动与真实心动为核心的恋爱真人秀。",

              tone,

              mode,

              memoryIncluded:
                mode === "immersive",

              forbiddenContent: "",
            },

            currentDay: 1,

            currentTime: "20:36",

            currentSceneLabel:
              "心动小屋 · 客厅",

            currentLocation:
              "living",

            timeline: [
              {
                day: 1,
                summary: "",
                fullNarrative: "",
              },
            ],

            relationships: {
              userToChar: {},
              charToChar: {},
            },

            privateMessages: {},

            observationLog: [],

            locationState: {
              living: {
                characterIds: [],
              },

              kitchen: {
                characterIds: [],
              },

              garden: {
                characterIds: [],
              },

              bedroom: {
                characterIds: [],
              },

              balcony: {
                characterIds: [],
              },
            },

            phone: {
              feed: [],
              weibo: [],
              weiboCategory: "all",
              notes: [],
            },

            dailyEvents:
              DEFAULT_EVENTS.map(
                (event) => ({
                  ...event,
                })
              ),

            activeEvent: null,

            events: [],

            lastNarrative:
              "节目正式开机。所有人第一次进入心动小屋。",

            lastQuote:
              "“欢迎来到《心动现场》。”",
          };

          /*
            初始化关系。
            只有选中的嘉宾。
          */

          picked.forEach((char) => {
            archive.relationships.userToChar[
              char.characterId
            ] = {
              tags: ["初次见面"],
              statusLine:
                "你们的故事才刚刚开始。",
            };
          });

          /*
            初始化小屋状态。
          */

          if (picked.length) {
            archive.locationState.living.characterIds =
              picked
                .slice(0, 2)
                .map(
                  (char) =>
                    char.characterId
                );
          }

          /*
            初始化动态。
          */

          archive.phone.feed = [
            {
              author:
                "《心动现场》节目组",

              role: "PRODUCER",

              text:
                "本季节目正式开机。欢迎来到心动小屋。",

              time:
                "本季 Day 01",
            },
          ];

          /*
            初始化微博。
          */

          archive.phone.weibo = [
            {
              category: "report",

              author:
                "娱乐现场",

              text:
                `《${title}》正式开机，新的恋综世界开始运行。`,

              time:
                "刚刚",
            },
          ];

          state.archives.unshift({
            archiveId:
              archive.archiveId,

            title:
              archive.title,

            currentDay: 1,

            characterNames:
              picked.map(
                (c) => c.name
              ),

            characterAvatars:
              picked.map(
                (c) => c.avatar
              ),

            userName:
              archive.userPersona.name,

            lastSummary:
              "新的恋综世界刚刚开机。",

            lastSavedAt:
              archive.lastSavedAt,
          });

          state.currentArchive =
            archive;

          state.user =
            selectedUser;

          await safeSet(
            `archive:${archive.archiveId}`,
            archive
          );

          await safeSet(
            "archiveIndex",
            state.archives
          );

          modal.remove();

          state.activeTab =
            "show";

          toast(
            `《${title}》已开机`
          );

          renderPage();
          updateTopDay();
        }
      );
  }

  /* =========================================================
     世界书库
     ========================================================= */

  function openWorldbookLibrary(fromCreate = false) {
    const modal =
      document.createElement("div");

    modal.className =
      "xd-modal-wrap";

    modal.innerHTML = `
      <section class="xd-modal">

        <div class="xd-modal-handle"></div>

        <div class="xd-kicker">
          WORLD LIBRARY
        </div>

        <div
          class="xd-modal-title"
          style="margin-top:4px;"
        >
          世界书库
        </div>

        <div
          style="
            margin-top:7px;
            color:#8e8183;
            font-size:10px;
            line-height:1.7;
          "
        >
          这里管理你提前准备好的世界书。
          创建恋综时再从这里勾选需要加入本季的世界。
        </div>

        <div
          style="
            margin-top:15px;
          "
        >

          ${
            state.worldbooks.length
              ? state.worldbooks
                  .map(
                    (book) => `
                      <div class="xd-library-card">

                        <div class="xd-library-title">
                          ${escapeHTML(
                            book.name ||
                            book.title ||
                            "未命名世界书"
                          )}
                        </div>

                        <div class="xd-library-meta">
                          ${escapeHTML(
                            book.description ||
                            book.content?.slice?.(
                              0,
                              80
                            ) ||
                            "Roche 世界书"
                          )}
                        </div>

                      </div>
                    `
                  )
                  .join("")
              : `
                <div class="xd-empty">

                  <div class="xd-empty-icon">
                    ✦
                  </div>

                  <div class="xd-empty-title">
                    世界书库为空
                  </div>

                  <div class="xd-empty-text">
                    如果你的 Roche 版本提供世界书写入 API，
                    可以在这里继续扩展“新建世界书”功能。
                  </div>

                </div>
              `
          }

        </div>

        <div class="xd-modal-actions">

          <button
            class="xd-small-btn"
            data-world-close
          >
            关闭
          </button>

          ${
            fromCreate
              ? `
                <button
                  class="xd-primary"
                  style="margin-top:0;"
                  data-world-back
                >
                  返回创建
                </button>
              `
              : ""
          }

        </div>

      </section>
    `;

    state.container
      .querySelector(
        ".roche-plugin-xindong-xianchang"
      )
      .appendChild(modal);

    modal
      .querySelector("[data-world-close]")
      .addEventListener(
        "click",
        () => modal.remove()
      );

    const back =
      modal.querySelector(
        "[data-world-back]"
      );

    if (back) {
      back.addEventListener(
        "click",
        () => {
          modal.remove();
          openCreateArchive();
        }
      );
    }
  }

  /* =========================================================
     设置
     ========================================================= */

  function openSettings() {
    if (!state.currentArchive) {
      toast("请先创建一个恋综档案");
      return;
    }

    const mode =
      state.currentArchive
        .seasonConfig?.mode ||
      "immersive";

    const modal =
      document.createElement("div");

    modal.className =
      "xd-modal-wrap";

    modal.innerHTML = `
      <section class="xd-modal">

        <div class="xd-modal-handle"></div>

        <div class="xd-kicker">
          SETTINGS
        </div>

        <div
          class="xd-modal-title"
          style="margin-top:4px;"
        >
          本季设置
        </div>

        <div class="xd-field">

          <label>
            参与模式
          </label>

          <div style="display:grid;gap:8px;">

            <label class="xd-check">

              <input
                type="radio"
                name="xd-setting-mode"
                value="immersive"
                ${
                  mode === "immersive"
                    ? "checked"
                    : ""
                }
              >

              <div class="xd-check-main">

                <div class="xd-check-title">
                  沉浸式
                </div>

                <div class="xd-check-desc">
                  读取当前 USER 人设与记忆。
                  角色会按照已有关系进入本季。
                </div>

              </div>

            </label>

            <label class="xd-check">

              <input
                type="radio"
                name="xd-setting-mode"
                value="persona"
                ${
                  mode === "persona"
                    ? "checked"
                    : ""
                }
              >

              <div class="xd-check-main">

                <div class="xd-check-title">
                  非沉浸式
                </div>

                <div class="xd-check-desc">
                  只读取人设，不使用过去记忆。
                </div>

              </div>

            </label>

          </div>

        </div>

        <div class="xd-field">

          <label>
            当前 USER
          </label>

          <div
            style="
              padding:12px;
              background:white;
              border-radius:14px;
              font-size:11px;
            "
          >
            ${escapeHTML(
              state.currentArchive
                .userPersona?.name ||
              "未命名"
            )}
          </div>

        </div>

        <div class="xd-field">

          <label>
            当前世界书
          </label>

          <div
            style="
              padding:12px;
              background:white;
              border-radius:14px;
              font-size:10px;
              line-height:1.7;
              color:#75696b;
            "
          >
            ${
              (
                state.currentArchive
                  .worldbook
                  ?.selectedBooks ||
                []
              )
                .map(
                  (book) =>
                    escapeHTML(
                      book.name
                    )
                )
                .join("、") ||
              "未选择世界书"
            }
          </div>

        </div>

        <div class="xd-modal-actions">

          <button
            class="xd-small-btn"
            data-setting-close
          >
            取消
          </button>

          <button
            class="xd-primary"
            style="margin-top:0;"
            data-setting-save
          >
            保存
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
      .querySelector("[data-setting-close]")
      .addEventListener(
        "click",
        () => modal.remove()
      );

    modal
      .querySelector("[data-setting-save]")
      .addEventListener(
        "click",
        async () => {

          const newMode =
            modal.querySelector(
              'input[name="xd-setting-mode"]:checked'
            )?.value ||
            "immersive";

          state.currentArchive
            .seasonConfig.mode =
            newMode;

          state.currentArchive
            .seasonConfig.memoryIncluded =
            newMode === "immersive";

          await saveCurrentArchive();

          modal.remove();

          toast("本季设置已保存");
        }
      );
  }

  /* =========================================================
     嘉宾详情
     保持原有思路
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
            节目人设
          </label>

          <details
            style="
              background:white;
              border-radius:15px;
              padding:12px;
            "
          >

            <summary
              style="
                cursor:pointer;
                color:#a97983;
                font-size:11px;
                font-weight:750;
              "
            >
              展开人设
            </summary>

            <div
              style="
                margin-top:9px;
                font-size:11px;
                line-height:1.8;
                color:#75696b;
              "
            >
              ${escapeHTML(
                persona
              ).slice(0, 500)}
            </div>

          </details>

        </div>

        <div class="xd-field">

          <label>
            当前关系
          </label>

          <div
            style="
              padding:12px;
              background:#fff;
              border-radius:15px;
              color:#75696b;
              font-size:11px;
              line-height:1.7;
            "
          >
            ${
              state.currentArchive
                ?.relationships
                ?.userToChar?.[
                  char.characterId ||
                  char.id
                ]?.statusLine ||
              "你们的故事才刚刚开始。"
            }
          </div>

        </div>

        <div class="xd-modal-actions">

          <button
            class="xd-small-btn"
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

    modal
      .querySelector("[data-private-preview]")
      .addEventListener(
        "click",
        () => {
          modal.remove();
          state.activeTab = "phone";
          state.currentPhoneView =
            "messages";
          renderPage();

          setTimeout(() => {
            const id =
              char.characterId ||
              char.id;

            const card =
              state.container.querySelector(
                `[data-chat-character="${CSS.escape(
                  String(id)
                )}"]`
              );

            if (card) {
              openPrivateChat(char);
            }
          }, 30);
        }
      );
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

    let html = "";

    if (state.activeTab === "show") {
      if (state.currentHouseView !== "overview") {
        html =
          renderHouseLocation(
            state.currentHouseView
          );
      } else {
        html = renderShow();
      }
    }

    else if (state.activeTab === "guests") {
      html = renderGuests();
    }

    else if (state.activeTab === "phone") {
      html =
        renderPhoneSubpage();
    }

    else {
      html = renderArchives();
    }

    content.innerHTML = html;

    bindPageEvents();

    state.container
      .querySelectorAll("[data-tab]")
      .forEach((button) => {
        button.classList.toggle(
          "active",
          button.dataset.tab ===
            state.activeTab
        );
      });

    updateTopDay();
  }

  /* =========================================================
     页面事件
     ========================================================= */

  function bindPageEvents() {

    /* 今日玩法 */

    state.container
      .querySelectorAll("[data-event-id]")
      .forEach((element) => {

        const handler = () => {
          triggerDailyEvent(
            element.dataset.eventId
          );
        };

        element.addEventListener(
          "click",
          handler
        );

        state.listeners.push(() =>
          element.removeEventListener(
            "click",
            handler
          )
        );
      });

    /* 小屋 */

    state.container
      .querySelectorAll("[data-room]")
      .forEach((room) => {

        const handler = (event) => {

          event.stopPropagation();

          state.currentHouseView =
            room.dataset.room;

          renderPage();
        };

        room.addEventListener(
          "click",
          handler
        );

        state.listeners.push(() =>
          room.removeEventListener(
            "click",
            handler
          )
        );
      });

    state.container
      .querySelectorAll("[data-house-back]")
      .forEach((button) => {

        button.addEventListener(
          "click",
          () => {
            state.currentHouseView =
              "overview";

            renderPage();
          }
        );
      });

    /* 观察室 */

    state.container
      .querySelectorAll(
        "[data-open-observe]"
      )
      .forEach((button) => {

        button.addEventListener(
          "click",
          () => {
            openObservationPage();
          }
        );
      });

    state.container
      .querySelectorAll(
        "[data-observe-back]"
      )
      .forEach((button) => {

        button.addEventListener(
          "click",
          () => {
            openObservationPage(
              false
            );
          }
        );
      });

    /* 创建 */

    state.container
      .querySelectorAll(
        "[data-new-archive]"
      )
      .forEach((button) => {

        button.addEventListener(
          "click",
          () => openCreateArchive()
        );
      });

    /* 档案 */

    state.container
      .querySelectorAll(
        "[data-open-archive]"
      )
      .forEach((button) => {

        button.addEventListener(
          "click",
          async () => {

            const archive =
              state.archives.find(
                (item) =>
                  item.archiveId ===
                  button.dataset.openArchive
              );

            if (!archive) return;

            const full =
              await safeGet(
                `archive:${archive.archiveId}`,
                null
              );

            state.currentArchive =
              full || archive;

            state.activeTab =
              "show";

            state.currentHouseView =
              "overview";

            state.currentPhoneView =
              "home";

            renderPage();
            updateTopDay();
          }
        );
      });

    /* 删除 */

    state.container
      .querySelectorAll(
        "[data-delete-archive]"
      )
      .forEach((button) => {

        button.addEventListener(
          "click",
          async () => {

            const id =
              button.dataset.deleteArchive;

            const ok =
              await confirmDialog(
                "删除恋综档案",
                "确定删除这个完整恋综世界吗？此操作无法恢复。"
              );

            if (!ok) return;

            state.archives =
              state.archives.filter(
                (archive) =>
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
              state.currentArchive
                ?.archiveId === id
            ) {
              state.currentArchive =
                null;
            }

            toast("档案已删除");

            renderPage();
            updateTopDay();
          }
        );
      });

    /* 嘉宾 */

    state.container
      .querySelectorAll(
        "[data-guest-id]"
      )
      .forEach((card) => {

        card.addEventListener(
          "click",
          () => {

            const char =
              selectedCharacter(
                card.dataset.guestId
              );

            if (char) {
              openGuestDetail(
                char
              );
            }
          }
        );
      });

    /* 手机 */

    state.container
      .querySelectorAll(
        "[data-phone-app]"
      )
      .forEach((button) => {

        button.addEventListener(
          "click",
          () => {

            state.currentPhoneView =
              button.dataset.phoneApp;

            renderPage();
          }
        );
      });

    state.container
      .querySelectorAll(
        "[data-phone-home]"
      )
      .forEach((button) => {

        button.addEventListener(
          "click",
          () => {

            state.currentPhoneView =
              "home";

            renderPage();
          }
        );
      });

    /* 微博分类 */

    state.container
      .querySelectorAll(
        "[data-weibo-category]"
      )
      .forEach((button) => {

        button.addEventListener(
          "click",
          async () => {

            if (
              state.currentArchive?.phone
            ) {
              state.currentArchive
                .phone
                .weiboCategory =
                button.dataset
                  .weiboCategory;

              await saveCurrentArchive();
            }

            renderPage();
          }
        );
      });

    /* 私信 */

    state.container
      .querySelectorAll(
        "[data-chat-character]"
      )
      .forEach((card) => {

        card.addEventListener(
          "click",
          () => {

            const char =
              selectedCharacter(
                card.dataset
                  .chatCharacter
              );

            if (char) {
              openPrivateChat(
                char
              );
            }
          }
        );
      });

    /* 世界书库 */

    state.container
      .querySelectorAll(
        "[data-world-library]"
      )
      .forEach((button) => {

        button.addEventListener(
          "click",
          () =>
            openWorldbookLibrary(
              false
            )
        );
      });
  }

  /* =========================================================
     观察室切换
     ========================================================= */

  function openObservationPage(
    open = true
  ) {
    if (!state.currentArchive) {
      toast("请先创建一个恋综档案");
      return;
    }

    if (!open) {
      state.activeTab = "show";
      state.currentHouseView =
        "overview";
      renderPage();
      return;
    }

    state.activeTab = "show";

    const content =
      state.container.querySelector(
        "[data-content]"
      );

    if (!content) return;

    content.innerHTML =
      renderObservationRoom();

    bindPageEvents();

    /*
      观察室不是底栏。
      也不是档案。
      它只是节目页中的一个独立观察页面。
    */
  }

  /* =========================================================
     Top Day
     ========================================================= */

  function updateTopDay() {
    const el =
      state.container.querySelector(
        "[data-top-day]"
      );

    if (!el) return;

    el.textContent =
      `DAY ${String(
        state.currentArchive?.currentDay ||
        1
      ).padStart(2, "0")}`;
  }

  /* =========================================================
     保存当前档案
     ========================================================= */

  async function saveCurrentArchive() {
    if (!state.currentArchive) return;

    state.currentArchive.lastSavedAt =
      Date.now();

    const indexEntry = {
      archiveId:
        state.currentArchive.archiveId,

      title:
        state.currentArchive.title,

      currentDay:
        state.currentArchive.currentDay,

      characterNames:
        state.currentArchive.characters
          .map((c) => c.name),

      characterAvatars:
        state.currentArchive.characters
          .map((c) => c.avatar),

      userName:
        state.currentArchive
          .userPersona?.name ||
        "",

      lastSummary:
        state.currentArchive.lastSummary ||
        state.currentArchive
          .lastNarrative
          ?.slice(0, 80) ||
        "暂无剧情",

      lastSavedAt:
        state.currentArchive.lastSavedAt,
    };

    const existing =
      state.archives.findIndex(
        (archive) =>
          archive.archiveId ===
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
      `archive:${state.currentArchive.archiveId}`,
      state.currentArchive
    );

    await safeSet(
      "archiveIndex",
      state.archives
    );
  }

  /* =========================================================
     初始数据
     ========================================================= */

  async function loadRocheData(roche) {

    await loadUserPersonas(roche);

    /*
      CHAR 只作为创建恋综时的候选池。
      不会自动写入 currentArchive。
    */
    await loadCharacterPool();

    /*
      世界书同理，只读取候选库。
    */
    await loadWorldbooks();

    state.archives =
      await safeGet(
        "archiveIndex",
        []
      );

    /*
      有历史档案：
      默认打开最近一次档案。

      没有档案：
      保持空壳欢迎页。
    */
    if (state.archives.length) {

      const first =
        state.archives[0];

      state.currentArchive =
        await safeGet(
          `archive:${first.archiveId}`,
          first
        );

      /*
        当前 USER 应该跟随档案，
        而不是跟随 Roche 当前 active user。
      */
      if (
        state.currentArchive
          ?.userPersona
      ) {
        const persona =
          state.userPersonas.find(
            (item) =>
              String(
                item.id ||
                item.personaId
              ) ===
              String(
                state.currentArchive
                  .userPersona
                  .personaId
              )
          );

        if (persona) {
          state.user =
            persona;
        }
      }
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

    state.currentHouseView =
      "overview";

    state.currentPhoneView =
      "home";

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
      (cleanup) => {
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

    state.characterPool =
      [];

    state.worldbooks =
      [];
  }

  /* =========================================================
     Roche Plugin
     ========================================================= */

  window.RochePlugin.register({

    id: PLUGIN_ID,

    name: "心动现场",

    version: VERSION,

    apps: [
      {
        id: APP_ID,

        name: "心动现场",

        icon: "heart",

        iconImage: "",

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
          container
        ) {
          await unmount(
            container
          );
        },
      },
    ],
  });

})();
```

### 这一版有一个特别重要的逻辑变化

现在 **Roche 里的角色 ≠ 本季嘉宾**。

启动插件时：

```text
Roche CHAR
   ↓
候选池
```

不会直接显示成嘉宾。

只有：

```text
创建恋综
   ↓
选择 USER
   ↓
选择嘉宾
   ↓
选择世界书
   ↓
选择沉浸模式
   ↓
开机
```

之后：

```text
本季档案
   ↓
本季嘉宾
   ↓
嘉宾页面
   ↓
关系 / 私信 / 剧情
```

这样不同恋综之间才真正隔离。

### 小屋和今日玩法也已经拆开

现在不是：

> 点小屋 → 看三个小游戏

而是：

**心动小屋 = 世界地图**

```text
🏠 心动小屋

🛋 客厅
🍳 厨房
🌿 花园
♡ 房间
☾ 阳台
```

而：

**今日玩法 = 节目组今天安排的事件**

例如：

```text
今日玩法

🍳 厨房挑战
💗 心动问答
🌿 花园偶遇
```

点「厨房挑战」以后，会直接把当前场景切到：

```text
心动小屋 · 厨房
```

所以以后真正接 AI 剧情时，**事件产生的结果可以同时改变小屋状态、角色关系、观察室、手机动态、微博和私信**，而不是每个功能各玩各的。

另外我特意没有给嘉宾页面加新的底栏，也没有重新设计它；**它仍然是你现在喜欢的那一版。**

这一版先把我们确定的架构和 UI 统一起来，后面再接真正的 AI 剧情引擎，会比现在直接往三个按钮里塞 AI 稳很多。

/* 《心动现场》 v2.0.2 Patch
 * 作者：linyin8945
 *
 * 本版：
 * - 全屏铺满
 * - 顶栏返回键保留
 * - 右上角恋综设置
 * - 沉浸模式：读取角色记忆库；非沉浸模式：仅按人设
 * - 创建档案后才确定本季嘉宾
 * - 嘉宾候选池读取 Roche 角色
 * - 嘉宾详情 + 关系
 * - 私信独立页面
 * - 观察室（仅从节目页进入）
 * - 手机中心（微博 / 匿名短信 / 备忘录 / 相册 / 动态 / 日历 / 地图 / 节目剪辑 / 成就 / 音乐）
 * - 世界书库：Roche 世界书 + 插件自建世界书
 * - 创建恋综时可勾选多个世界书
 * - 心动小屋地图
 * - 节目化流程：主持人→USER自我介绍→嘉宾逐位入场→比赛→投票→约会→小屋自由活动
 * - 小屋地点随机AI事件 + 三选一 + 结果回写
 * - 顶部直播弹幕，仅显示2-3条并自动滚动
 * - 微博顶部分类切换 + 同人生成设定选择
 * - 节目生成锁与全屏生成动画
 * - 嘉宾底栏入口、User短信联系人点击修复
 * - 玩法入口
 * - 档案彼此独立
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
    userPersonas: [],

    // Roche 中所有角色：只作为“创建恋综时”的候选池
    candidateCharacters: [],

    // 当前档案真正选中的嘉宾
    characters: [],

    archives: [],
    currentArchive: null,

    // 世界书：Roche 只作为来源读取；插件自建世界书独立保存
    rocheWorldbooks: [],
    customWorldbooks: [],

    // V2：弹幕、微博分类、当前嘉宾手机等页面状态
    danmuEnabled: true,
    weiboCategory: "节目报道",
    detailCharacter: null,
    detailExpanded: false,
    chatCharacter: null,
    generating: false,
    fanficDraft: {
      genres: ["青春校园"],
      characterIds: [],
      linkReality: true,
      worldbookIds: []
    },

    listeners: []
  };

  /* =========================================================
     基础工具
     ========================================================= */

  const esc = (value) =>
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

  const nameOf = (item, fallback = "未命名") =>
    item?.name || item?.handle || fallback;

  const handleOf = (item) =>
    item?.handle ? `@${item.handle}` : "";

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

  /* =========================================================
     V2 AI 引擎
     ========================================================= */

  function extractAIText(result) {
    if (typeof result === "string") return result.trim();
    return String(
      result?.text ||
      result?.content ||
      result?.message?.content ||
      result?.output?.text ||
      result?.output ||
      result?.choices?.[0]?.message?.content ||
      result?.choices?.[0]?.text ||
      ""
    ).trim();
  }

  async function aiText(prompt, options = {}) {
    const ai = state.roche?.ai;
    if (!ai) throw new Error("Roche AI API 不可用");
    const temperature = options.temperature ?? 0.85;
    const maxTokens = options.maxTokens ?? 900;
    const attempts = [];
    if (typeof ai.chat === "function") {
      attempts.push(() => ai.chat({ prompt, temperature, maxTokens }));
      attempts.push(() => ai.chat({ messages:[{ role:"user", content:prompt }], temperature, maxTokens }));
      attempts.push(() => ai.chat(prompt));
    }
    if (typeof ai.generate === "function") attempts.push(() => ai.generate({ prompt, temperature, maxTokens }));
    if (typeof ai.generateText === "function") attempts.push(() => ai.generateText({ prompt, temperature, maxTokens }));
    let lastError = null;
    for (const attempt of attempts) {
      try {
        const text = extractAIText(await attempt());
        if (text) return text;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("没有可用的 Roche AI 文本接口");
  }

  function buildAIContext(archive) {
    const selectedWorldbooks = (archive?.worldbooks || []).map(w => `${w.name}\n${w.content || w.description || ""}`).join("\n\n");
    const memories = archive?.participationMode === "immersive"
      ? Object.values(archive?.memorySnapshots || {}).map(s => `${s.characterName}: ${(s.memories || []).map(m => m.text).join("；")}`).join("\n")
      : "不读取过去记忆。";
    return {
      user: archive?.userPersona || {},
      characters: archive?.characters || [],
      worldbooks: selectedWorldbooks,
      memories
    };
  }

  async function generateAIOpening(archive) {
    const ctx = buildAIContext(archive);
    const prompt = `你是恋综《心动现场》的剧情导演。\n请根据以下资料生成第一天开场。主持人只负责欢迎与宣布节目开始；USER和每位嘉宾必须自己进行自我介绍。不要替他们写成主持人口吻。\nUSER人设：${JSON.stringify(ctx.user)}\n嘉宾：${JSON.stringify(ctx.characters)}\n世界书：${ctx.worldbooks}\n过去记忆：${ctx.memories}\n本季氛围：${archive.seasonConfig?.tone || "温柔、暧昧、轻微修罗场"}\n输出一段约300-500字的中文节目开场，包含主持人欢迎、USER自我介绍提示、嘉宾依次自我介绍的自然衔接，并在结尾引出第一天的任务：心动争夺战。不要使用 Markdown。`;
    return aiText(prompt, { maxTokens: 1200, temperature:0.8 });
  }

  function parseLooseJSON(text, fallback) {
    try {
      return JSON.parse(text);
    } catch {}
    const match = String(text || "").match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch {}
    }
    const arr = String(text || "").match(/\[[\s\S]*\]/);
    if (arr) {
      try { return JSON.parse(arr[0]); } catch {}
    }
    return fallback;
  }

  async function generateAIIntroCards(archive) {
    const ctx = buildAIContext(archive);
    const prompt = `你是恋综《心动现场》的节目导演。请把第一天开场设计成真人恋综节目卡片，不是小说。
主持人只负责欢迎、宣布开机和简单说明规则。
USER必须自己进行自我介绍。
每位嘉宾也必须自己进行自我介绍，必须符合各自人设。
请严格只输出JSON，不要Markdown：
{"host":"主持人欢迎词","userPrompt":"给USER的自我介绍提示","guests":[{"characterId":"角色ID","name":"角色名","intro":"角色本人说的自我介绍"}],"taskTease":"主持人引出第一天任务的一句话"}
USER：${JSON.stringify(ctx.user)}
嘉宾：${JSON.stringify(ctx.characters)}
世界书：${ctx.worldbooks}
过去记忆：${ctx.memories}
本季氛围：${archive.seasonConfig?.tone || "温柔、暧昧、轻微修罗场"}。`;
    const text = await aiText(prompt, { maxTokens: 1600, temperature:0.8 });
    const fallback = {
      host: "欢迎来到《心动现场》。从现在开始，镜头会记录每一次靠近、犹豫和心动。",
      userPrompt: "轮到你了。请用自己的方式告诉大家，你是谁，以及你为什么来到这里。",
      guests: (archive.characters || []).map(c => ({
        characterId: c.characterId || c.id,
        name: c.name,
        intro: c.bio || c.persona || `大家好，我是${c.name}。很高兴认识大家。`
      })),
      taskTease: "接下来，第一天的心动争夺战正式开始。"
    };
    const data = parseLooseJSON(text, fallback);
    if (!Array.isArray(data.guests)) data.guests = fallback.guests;
    return data;
  }

  async function generateAIHouseEvent(archive, room) {
    const names = { kitchen:"厨房", living:"客厅", bath:"卫生间", bedroom:"卧室", garden:"花园" };
    const ctx = buildAIContext(archive);
    const prompt = `你是《心动现场》的夜间自由活动导演。
地点：${names[room] || room}
请随机生成一个发生在这个地点的恋综事件。事件必须符合角色人设，所有恋爱线围绕USER，嘉宾之间可以竞争、友情、合作、吃醋，但不能发展同性恋爱。
请严格只输出JSON，不要Markdown：
{"title":"事件标题","scene":"80-180字现场描述","options":[{"label":"选项A","text":"玩家选择后的行动"},{"label":"选项B","text":"玩家选择后的行动"},{"label":"选项C","text":"玩家选择后的行动"}]}
USER：${JSON.stringify(ctx.user)}
嘉宾：${JSON.stringify(ctx.characters)}
关系：${JSON.stringify(archive.relationships || {})}
世界书：${ctx.worldbooks}
记忆：${ctx.memories}
最近事件：${JSON.stringify((archive.events || []).slice(-8))}`;
    const text = await aiText(prompt, { maxTokens:1200, temperature:1.0 });
    const fallbackChar = (archive.characters || [])[Math.floor(Math.random() * Math.max(archive.characters?.length || 1, 1))];
    return parseLooseJSON(text, {
      title: `${names[room] || "小屋"}里的意外偶遇`,
      scene: fallbackChar ? `${fallbackChar.name}正在这里做自己的事。你刚走近，气氛忽然安静了一瞬间，像是有人在等你先开口。` : "你走进这个地点，发现这里似乎刚刚有人来过。",
      options: [
        {label:"主动靠近", text:"走过去和他打招呼。"},
        {label:"先观察", text:"不急着开口，先看看现场。"},
        {label:"换个地方", text:"暂时离开，把这个瞬间留给之后。"}
      ]
    });
  }

  async function generateAIHouseOutcome(archive, event, option) {
    const ctx = buildAIContext(archive);
    const prompt = `你是《心动现场》的剧情引擎。玩家在小屋自由活动中选择了一个选项。
事件：${JSON.stringify(event)}
玩家选择：${JSON.stringify(option)}
请生成80-180字的后续结果，必须符合人设，并明确表现至少一个角色对USER的情绪或态度变化。不要Markdown。
USER：${JSON.stringify(ctx.user)}
嘉宾：${JSON.stringify(ctx.characters)}
关系：${JSON.stringify(archive.relationships || {})}
记忆：${ctx.memories}`;
    return aiText(prompt, { maxTokens:600, temperature:0.9 });
  }

  async function generateAIDanmu(archive, topic) {
    const prompt = `为恋综《心动现场》生成20条观众实时弹幕。\n当前环节：${topic}\n嘉宾：${(archive.characters || []).map(c => c.name).join("、")}\n要求：短句、像直播弹幕，有夸奖、吐槽、猜测、CP感、竞争感，但不要让所有人都喜欢同一个角色。每行一条，不要编号，不要 Markdown。`;
    const text = await aiText(prompt, { maxTokens:800, temperature:1.0 });
    return text.split(/\n+/).map(x => x.replace(/^[-*•\d.、]+\s*/, "").trim()).filter(Boolean).slice(0,20);
  }

  async function generateAIEvent(archive, eventTitle) {
    const ctx = buildAIContext(archive);
    const prompt = `你是《心动现场》的剧情引擎。请生成一次恋综事件：${eventTitle}。\nUSER：${JSON.stringify(ctx.user)}\n嘉宾：${JSON.stringify(ctx.characters)}\n关系：${JSON.stringify(archive.relationships || {})}\n世界书：${ctx.worldbooks}\n记忆：${ctx.memories}\n要求：每个角色必须符合自己的人设；所有恋爱线围绕USER；嘉宾之间可以竞争、友情、合作或吃醋，但不要发展同性恋爱。输出约400字中文剧情，不要 Markdown。`;
    return aiText(prompt, { maxTokens:1100, temperature:0.9 });
  }

  async function generateAIDatePlan(archive) {
    const ctx = buildAIContext(archive);
    const winner = (archive.characters || []).find(c => String(c.name) === String(archive.vote?.winner)) || {};
    const prompt = `你是《心动现场》的恋综导演。获胜嘉宾已经主动邀请USER约会，约会地点、活动和主题必须由角色根据自己的人设决定，不要让玩家选择地点。请严格只输出JSON，不要Markdown：{"place":"地点","activity":"活动","theme":"约会主题","opening":"约会开始时的场景"}。USER：${JSON.stringify(ctx.user)} 嘉宾：${JSON.stringify(winner)} 世界书：${ctx.worldbooks} 关系：${JSON.stringify(archive.relationships || {})}。内容必须符合世界书和角色人设。`;
    const text = await aiText(prompt, {maxTokens:900, temperature:0.9});
    return parseLooseJSON(text, {place:"由角色决定的约会地点", activity:"根据TA人设安排的活动", theme:"只属于你们的约会", opening:"他已经提前安排好了一切。"});
  }

  async function generateAIDateScene(archive, plan, phase = "start") {
    const ctx = buildAIContext(archive);
    const winner = (archive.characters || []).find(c => String(c.name) === String(archive.vote?.winner)) || {};
    const prompt = `你是《心动现场》的约会剧情导演。请继续展开USER与获胜嘉宾的约会。角色已经决定地点和活动，不要重新让玩家选择地点。当前阶段：${phase}。约会方案：${JSON.stringify(plan)}。请输出JSON：{"scene":"120-220字剧情","options":[{"label":"选项1","text":"玩家回应"},{"label":"选项2","text":"玩家回应"},{"label":"选项3","text":"玩家回应"}],"danmuTopic":"弹幕主题"}。USER：${JSON.stringify(ctx.user)} 嘉宾：${JSON.stringify(winner)} 世界书：${ctx.worldbooks} 记忆：${ctx.memories}。必须符合人设，约会内容根据角色决定，不要写成固定模板。`;
    const text = await aiText(prompt, {maxTokens:1200, temperature:0.95});
    return parseLooseJSON(text, {scene:plan?.opening || "约会开始了。", options:[{label:"自然回应",text:"顺着他的安排聊下去。"},{label:"主动靠近",text:"把话题引向你们之间。"},{label:"观察",text:"先看看他真正想做什么。"}], danmuTopic:"约会现场"});
  }

  async function generateAINightPlayPool(archive) {
    const ctx = buildAIContext(archive);
    const prompt = `你是《心动现场》的夜间玩法设计器。只为DAY ${archive.currentDay || 2}之后生成今晚的玩法。读取世界书、恋综基调、嘉宾人设、当前关系和剧情进度。生成5到7个不同的夜晚玩法，再额外生成一个自定义入口。不要固定使用厨房、电影、真心话等模板，必须让世界书决定玩法风格。严格只输出JSON：{"plays":[{"title":"玩法标题","desc":"一句话说明","type":"event"}]}。世界书：${ctx.worldbooks} 恋综基调：${archive.seasonConfig?.tone || ""} 嘉宾：${JSON.stringify(ctx.characters)} 关系：${JSON.stringify(archive.relationships || {})} 最近剧情：${JSON.stringify((archive.events || []).slice(-12))}`;
    const text = await aiText(prompt, {maxTokens:1500, temperature:1.0});
    const data = parseLooseJSON(text, {plays:[]});
    return Array.isArray(data.plays) ? data.plays.slice(0,7) : [];
  }

  async function generateAIWeiboCategory(archive, category) {
    const ctx = buildAIContext(archive);
    const prompts = {
      "节目报道":"生成4条像节目官方账号发布的节目报道，客观但有看点。",
      "网友讨论":"生成6条不同网友视角的讨论，有支持、质疑、猜测，不要重复。",
      "节目吃瓜":"生成6条围绕节目细节的吃瓜帖，可以有误会、扒细节和CP猜测，但不要凭空改变已经发生的剧情。",
      "同人文":"生成4-5个同人文选题卡。"
    };
    if (category === "同人文") return generateAIFanficTitles(archive, state.fanficDraft);
    const prompt = `为恋综《心动现场》的微博分类“${category}”生成内容。${prompts[category] || "生成节目相关内容。"}\nUSER：${JSON.stringify(ctx.user)} 嘉宾：${JSON.stringify(ctx.characters)} 世界书：${ctx.worldbooks} 最近事件：${JSON.stringify((archive.events || []).slice(-12))}\n严格每行输出：作者 | 正文 | 元信息。不要Markdown。`;
    const text = await aiText(prompt, {maxTokens:1200, temperature:1.0});
    return text.split(/\n+/).map(line => { const parts=line.split("|").map(x=>x.trim()); return {author:parts[0]||"网友", text:parts[1]||line.trim(), meta:parts[2]||"刚刚", time:"刚刚", category}; }).filter(x=>x.text).slice(0,6);
  }

  async function generateAIFanficTitles(archive, options = {}) {
    const selectedIds = options.characterIds?.length ? options.characterIds : (archive.characters || []).map(c => c.characterId || c.id);
    const selectedCharacters = (archive.characters || []).filter(c => selectedIds.map(String).includes(String(c.characterId || c.id)));
    const genres = options.genres?.length ? options.genres : ["青春校园"];
    const prompt = `请为《心动现场》生成5个同人文选题卡。
USER设定：${JSON.stringify(archive.userPersona || {})}
参与角色：${JSON.stringify(selectedCharacters)}
世界类型：${JSON.stringify(genres)}
是否关联恋综经历：是
恋综经历：${JSON.stringify((archive.events || []).slice(-12))}
要求每行格式：标题 | 标签1·标签2·标签3 | 一句话简介。
所有标题必须符合选中的世界类型，并遵守角色人设；可以同时出现多个选中的角色与USER。`;
    const text = await aiText(prompt, { maxTokens:900, temperature:1.0 });
    return text.split(/\n+/).map(line => {
      const parts = line.split("|").map(x => x.trim());
      return { title:parts[0] || "未命名故事", tags:parts[1] || "恋综·心动", intro:parts[2] || "一段从节目延伸出去的故事。" };
    }).filter(x => x.title).slice(0,5);
  }

  async function generateAIFanficFull(archive, card) {
    const ctx = buildAIContext(archive);
    const selectedIds = state.fanficDraft.characterIds?.length ? state.fanficDraft.characterIds : (archive.characters || []).map(c => c.characterId || c.id);
    const selectedCharacters = (archive.characters || []).filter(c => selectedIds.map(String).includes(String(c.characterId || c.id)));
    const prompt = `请完整创作一篇同人文。
标题：${card.title}
标签：${card.tags}
简介：${card.intro}
USER：${JSON.stringify(ctx.user)}
指定参与角色：${JSON.stringify(selectedCharacters)}
选中的世界类型：${JSON.stringify(state.fanficDraft.genres || [])}
关联本季恋综经历：${state.fanficDraft.linkReality !== false ? "是" : "否"}
恋综经历：${state.fanficDraft.linkReality !== false ? JSON.stringify((archive.events || []).slice(-20)) : "不读取恋综经历"}
选择世界书ID：${JSON.stringify(state.fanficDraft.worldbookIds || [])}
世界书：${ctx.worldbooks}
要求：人物行为必须遵守人设；自然引用节目中已经发生的事件；正文有完整情节、对话和结尾，约1500-2500字中文。`;
    return aiText(prompt, { maxTokens:3500, temperature:0.95 });
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

        background:transparent;

        border-bottom:1px solid rgba(117,91,97,.08);

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
        font-size:20px;
        color:#b88791;
        background:rgba(255,255,255,.42);
        border:1px solid rgba(184,135,145,.14);
        box-shadow:0 4px 18px rgba(101,73,80,.045), inset 0 0 0 1px rgba(255,255,255,.35);
        backdrop-filter:blur(14px);
        -webkit-backdrop-filter:blur(14px);
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

        background:transparent;

        border-top:1px solid rgba(117,91,97,.08);

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

        min-height:500px;

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

      .xd-house-floor {
        position:absolute;
        left:16px;
        right:16px;
        top:94px;
        bottom:18px;
        border-radius:25px;
        border:1px solid rgba(184,135,145,.13);
        background:
          linear-gradient(90deg, transparent 49.6%, rgba(184,135,145,.08) 50%, transparent 50.4%),
          linear-gradient(0deg, transparent 49.6%, rgba(184,135,145,.08) 50%, transparent 50.4%),
          rgba(255,255,255,.25);
        box-shadow:inset 0 0 0 8px rgba(255,255,255,.12);
      }

      .xd-house-floor::before {
        content:"LIVING HOUSE";
        position:absolute;
        left:50%;
        top:50%;
        transform:translate(-50%,-50%);
        font-size:8px;
        letter-spacing:.22em;
        color:rgba(133,93,103,.18);
        font-weight:800;
        pointer-events:none;
      }

      .xd-house-status {
        position:absolute;
        right:18px;
        top:22px;
        z-index:3;
        padding:7px 10px;
        border-radius:999px;
        background:rgba(255,255,255,.62);
        border:1px solid rgba(184,135,145,.12);
        color:#a97983;
        font-size:8px;
        font-weight:800;
        letter-spacing:.12em;
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

      .xd-house-note {
        margin-top:11px;
        padding:13px 14px;
        border-radius:18px;
        background:rgba(255,255,255,.58);
        border:1px solid var(--xd-line);
      }

      /* =====================================================
         手机
         ===================================================== */

      .xd-phone {
        position:relative;
        border-radius:32px;
        padding:16px;
        background:linear-gradient(145deg,#efe5e6,#f9f4f3);
        border:1px solid rgba(157,116,124,.14);
        box-shadow:var(--xd-shadow);
        overflow:hidden;
      }

      .xd-phone::before {
        content:"";
        position:absolute;
        width:170px;
        height:170px;
        border-radius:50%;
        right:-70px;
        top:-70px;
        background:rgba(184,135,145,.12);
      }

      .xd-phone-status {
        position:relative;
        z-index:1;
        display:flex;
        align-items:center;
        justify-content:space-between;
        padding:2px 6px 12px;
        font-size:9px;
        color:#75696b;
        font-weight:700;
      }

      .xd-phone-title {
        position:relative;
        z-index:1;
        font-size:26px;
        font-weight:820;
        letter-spacing:-.05em;
      }

      .xd-phone-sub {
        position:relative;
        z-index:1;
        margin-top:4px;
        font-size:10px;
        color:var(--xd-muted);
      }

      .xd-phone-apps {
        position:relative;
        z-index:1;
        display:grid;
        grid-template-columns:repeat(4,1fr);
        gap:12px 8px;
        margin-top:22px;
      }

      .xd-phone-app {
        border:0;
        background:transparent;
        cursor:pointer;
        text-align:center;
        color:var(--xd-text);
      }

      .xd-phone-icon {
        width:52px;
        height:52px;
        margin:0 auto 7px;
        border-radius:17px;
        display:grid;
        place-items:center;
        font-size:24px;
        background:rgba(255,255,255,.82);
        border:1px solid rgba(140,104,112,.10);
        box-shadow:0 7px 17px rgba(101,73,80,.06);
      }

      .xd-phone-label {
        font-size:9px;
        font-weight:720;
      }

      .xd-phone-widget {
        position:relative;
        z-index:1;
        margin-top:20px;
        padding:15px;
        border-radius:21px;
        background:rgba(255,255,255,.72);
        border:1px solid var(--xd-line);
      }

      .xd-feed-item {
        padding:12px 0;
        border-bottom:1px solid rgba(117,91,97,.08);
      }

      .xd-feed-item:last-child { border-bottom:0; }
      .xd-feed-head { display:flex; gap:9px; align-items:center; }
      .xd-feed-avatar {
        width:32px; height:32px; border-radius:11px; overflow:hidden;
        background:#eadbde; display:grid; place-items:center;
        color:var(--xd-pink-dark); font-size:11px; font-weight:800; flex:0 0 32px;
      }
      .xd-feed-avatar img { width:100%; height:100%; object-fit:cover; }
      .xd-feed-name { font-size:10px; font-weight:800; }
      .xd-feed-time { margin-top:2px; font-size:8px; color:var(--xd-muted); }
      .xd-feed-text { margin-top:8px; font-size:11px; line-height:1.7; color:#5f5356; }
      .xd-feed-meta { margin-top:7px; font-size:9px; color:var(--xd-pink); }

      .xd-phone-list { display:grid; gap:10px; }
      .xd-phone-list-card {
        padding:14px; border-radius:19px; background:rgba(255,255,255,.76);
        border:1px solid var(--xd-line); cursor:pointer;
      }
      .xd-phone-list-title { font-size:13px; font-weight:800; }
      .xd-phone-list-desc { margin-top:4px; font-size:10px; color:var(--xd-muted); line-height:1.6; }

      /* =====================================================
         世界书
         ===================================================== */

      .xd-worldbook-card {
        padding:15px;
        border-radius:21px;
        background:rgba(255,255,255,.76);
        border:1px solid var(--xd-line);
        box-shadow:0 7px 22px rgba(101,73,80,.04);
      }
      .xd-worldbook-type { font-size:8px; letter-spacing:.12em; color:var(--xd-pink); font-weight:800; }
      .xd-worldbook-name { margin-top:5px; font-size:14px; font-weight:800; }
      .xd-worldbook-desc { margin-top:5px; font-size:10px; line-height:1.6; color:var(--xd-muted); }
      .xd-worldbook-content {
        margin-top:10px; padding:10px; border-radius:13px; background:#fbf7f7;
        font-size:10px; line-height:1.7; color:#75696b; white-space:pre-wrap;
        max-height:95px; overflow:hidden;
      }
      .xd-worldbook-actions { display:flex; gap:7px; margin-top:10px; }

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
         V2：弹幕开关 / 浮动弹幕 / 投票 / AI 状态
         ===================================================== */
      .xd-v2-toolbar {
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
        margin:12px 0;
      }
      .xd-danmu-toggle {
        border:1px solid rgba(184,135,145,.18);
        background:rgba(255,255,255,.48);
        color:#8a626b;
        border-radius:999px;
        padding:6px 8px 6px 10px;
        display:inline-flex;
        align-items:center;
        gap:7px;
        cursor:pointer;
        backdrop-filter:blur(14px);
        -webkit-backdrop-filter:blur(14px);
      }
      .xd-danmu-toggle-track {
        width:30px;
        height:18px;
        padding:2px;
        border-radius:999px;
        background:#ded4d5;
        transition:.18s ease;
      }
      .xd-danmu-toggle-track::after {
        content:"";
        display:block;
        width:14px;
        height:14px;
        border-radius:50%;
        background:#fff;
        box-shadow:0 1px 4px rgba(80,55,61,.16);
        transition:.18s ease;
      }
      .xd-danmu-toggle.on .xd-danmu-toggle-track {
        background:#d9a9b3;
      }
      .xd-danmu-toggle.on .xd-danmu-toggle-track::after {
        transform:translateX(12px);
      }
      .xd-danmu-stage {
        position:relative;
        min-height:130px;
        overflow:hidden;
        border-radius:22px;
        background:linear-gradient(145deg,rgba(255,255,255,.66),rgba(245,225,229,.48));
        border:1px solid rgba(140,104,112,.10);
      }
      .xd-danmu-float {
        position:absolute;
        white-space:nowrap;
        padding:6px 10px;
        border-radius:999px;
        background:rgba(255,255,255,.76);
        border:1px solid rgba(184,135,145,.12);
        color:#75686b;
        font-size:10px;
        box-shadow:0 4px 16px rgba(101,73,80,.06);
        animation:xdDanmuMove 9s linear infinite;
      }
      .xd-danmu-float:nth-child(2n) { animation-duration:11s; }
      .xd-danmu-float:nth-child(3n) { animation-duration:13s; }
      @keyframes xdDanmuMove {
        from { transform:translateX(110%); }
        to { transform:translateX(-130%); }
      }
      .xd-vote-card {
        padding:16px;
        border-radius:22px;
        background:rgba(255,255,255,.72);
        border:1px solid var(--xd-line);
      }
      .xd-vote-row {
        display:grid;
        grid-template-columns:48px 1fr 42px;
        align-items:center;
        gap:9px;
        margin-top:11px;
      }
      .xd-vote-name { font-size:11px; font-weight:760; }
      .xd-vote-bar { height:8px; border-radius:999px; background:#eee6e7; overflow:hidden; }
      .xd-vote-fill { height:100%; border-radius:999px; background:linear-gradient(90deg,#e8c0c7,#b88791); }
      .xd-vote-num { font-size:9px; color:#8e8183; text-align:right; }
      .xd-ai-badge {
        display:inline-flex;
        align-items:center;
        gap:5px;
        padding:5px 8px;
        border-radius:999px;
        background:rgba(255,255,255,.58);
        border:1px solid rgba(184,135,145,.12);
        color:#9a6c76;
        font-size:8px;
        letter-spacing:.06em;
      }
      .xd-char-phone-apps {
        display:grid;
        grid-template-columns:repeat(3,1fr);
        gap:10px;
      }
      .xd-char-phone-app {
        border:1px solid rgba(140,104,112,.10);
        background:rgba(255,255,255,.72);
        border-radius:19px;
        padding:13px 8px;
        cursor:pointer;
        text-align:center;
      }
      .xd-char-phone-icon {
        width:40px; height:40px; margin:0 auto 7px;
        border-radius:14px; display:grid; place-items:center;
        background:#f1e2e4; color:#9a6c76; font-size:18px;
      }
      .xd-char-phone-label { font-size:10px; font-weight:760; }

      /* =====================================================
         V2.0.1：节目化 UI / 全屏 / 小屋事件 / 微博
         ===================================================== */

      .roche-plugin-xindong-xianchang {
        width:100% !important;
        min-height:100% !important;
        background:linear-gradient(180deg,#faf2f3 0%,#f7ebed 100%);
        overflow:hidden;
      }

      .xd-topbar,
      .xd-bottom {
        background:rgba(250,242,243,.72) !important;
        border-color:rgba(184,135,145,.10) !important;
      }

      .xd-bottom {
        pointer-events:auto !important;
        isolation:isolate;
      }

      .xd-tab {
        position:relative;
        z-index:3;
        pointer-events:auto !important;
        touch-action:manipulation;
      }

      .xd-content {
        z-index:1;
      }

      .xd-recording-hero {
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        padding:18px 16px;
        border-radius:24px;
        background:linear-gradient(135deg,rgba(255,255,255,.88),rgba(249,226,231,.72));
        border:1px solid rgba(184,135,145,.12);
        box-shadow:0 12px 30px rgba(113,79,87,.06);
      }
      .xd-recording-title { margin-top:4px; font-size:19px; font-weight:850; letter-spacing:-.03em; }
      .xd-recording-sub { margin-top:5px; font-size:9px; color:#9b8b8f; }
      .xd-recording-status {
        flex:0 0 auto; padding:7px 10px; border-radius:999px;
        background:rgba(255,255,255,.75); color:#9b6873; font-size:8px; font-weight:800;
      }

      .xd-program-card,
      .xd-intro-card,
      .xd-task-card,
      .xd-date-card,
      .xd-free-card {
        padding:22px 18px;
        border-radius:26px;
        background:rgba(255,255,255,.82);
        border:1px solid rgba(184,135,145,.13);
        box-shadow:0 14px 34px rgba(113,79,87,.06);
      }

      .xd-program-opening { text-align:center; padding:30px 20px; }
      .xd-program-kicker { font-size:9px; letter-spacing:.16em; color:#b17a85; font-weight:800; }
      .xd-program-title { margin-top:8px; font-size:21px; font-weight:850; letter-spacing:-.03em; color:#43383a; }
      .xd-program-host { margin-top:10px; font-size:11px; line-height:1.75; color:#827477; }
      .xd-stage-label { font-size:8px; letter-spacing:.14em; color:#b17a85; font-weight:850; }
      .xd-host-avatar,
      .xd-intro-avatar {
        width:70px; height:70px; margin:18px auto 12px;
        border-radius:22px; display:grid; place-items:center;
        background:#f3e1e4; color:#ad7b85; font-size:30px;
        overflow:hidden; border:1px solid rgba(184,135,145,.12);
      }
      .xd-intro-avatar img { width:100%; height:100%; object-fit:cover; }
      .xd-intro-speaker { text-align:center; font-size:20px; font-weight:850; color:#43383a; }
      .xd-intro-text { margin-top:16px; padding:15px 14px; border-radius:18px; background:#fbf2f3; color:#514649; font-size:13px; line-height:1.85; text-align:center; }
      .xd-user-intro-card .xd-intro-text { background:#f5e3e7; }
      .xd-intro-card .xd-primary { width:100%; margin-top:16px; }

      .xd-task-title { margin-top:6px; font-size:21px; font-weight:850; letter-spacing:-.03em; }
      .xd-task-sub { margin-top:8px; font-size:11px; line-height:1.7; color:#817376; }
      .xd-contestants { margin-top:16px; display:grid; gap:8px; }
      .xd-contestant {
        display:flex; align-items:center; gap:10px; padding:10px; border-radius:18px;
        background:#fcf7f7; border:1px solid rgba(184,135,145,.10);
      }
      .xd-contestant-avatar { width:42px; height:42px; border-radius:14px; background:#f1e2e4; overflow:hidden; display:grid; place-items:center; color:#a97983; font-weight:800; flex:0 0 42px; }
      .xd-contestant-avatar img { width:100%; height:100%; object-fit:cover; }
      .xd-contestant-main { min-width:0; flex:1; }
      .xd-contestant-name { font-size:11px; font-weight:820; }
      .xd-contestant-desc { margin-top:3px; font-size:9px; color:#95878a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .xd-contestant-status { font-size:8px; color:#b17a85; }
      .xd-program-result { margin-top:14px; padding:12px; border-radius:18px; background:#faf0f2; font-size:10px; line-height:1.7; color:#63575a; }
      .xd-scene-short { margin-top:7px; }

      .xd-vote-live { margin-top:0; }
      .xd-vote-winner { margin-top:14px; padding:12px; border-radius:16px; background:#f5e3e7; color:#8c616b; font-size:11px; font-weight:800; }
      .xd-date-title { margin-top:7px; font-size:20px; line-height:1.45; font-weight:850; }
      .xd-date-options { display:grid; gap:9px; margin-top:16px; }
      .xd-date-option {
        display:grid; grid-template-columns:38px 1fr; column-gap:10px; align-items:center;
        width:100%; padding:12px; text-align:left; border-radius:18px;
        border:1px solid rgba(184,135,145,.12); background:#fcf7f7; cursor:pointer;
      }
      .xd-date-option.active { background:#f5e3e7; border-color:rgba(184,135,145,.32); }
      .xd-date-option span { grid-row:1 / span 2; width:38px; height:38px; border-radius:13px; display:grid; place-items:center; background:#f2e0e3; font-size:19px; }
      .xd-date-option b { font-size:11px; }
      .xd-date-option small { margin-top:3px; font-size:8px; color:#95878a; }
      .xd-user-intro-input { width:100%; min-height:110px; margin-top:14px; padding:13px 14px; resize:vertical; border:1px solid rgba(184,135,145,.16); border-radius:18px; background:rgba(255,255,255,.76); color:#514649; font:inherit; font-size:12px; line-height:1.7; outline:none; }
      .xd-user-intro-input:focus { border-color:rgba(184,135,145,.42); box-shadow:0 0 0 4px rgba(184,135,145,.08); }
      .xd-inline-spinner { display:inline-block; width:11px; height:11px; margin-right:7px; border:2px solid rgba(184,135,145,.25); border-top-color:#b88791; border-radius:50%; vertical-align:-1px; animation:xdSpin .8s linear infinite; }
      .xd-primary.is-loading, .xd-small-btn.is-loading, .xd-date-option.is-loading { opacity:.7; pointer-events:none; }
      @keyframes xdSpin { to { transform:rotate(360deg); } }

      .xd-danmu-overlay {
        position:fixed;
        left:0; right:0;
        top:92px;
        height:145px;
        pointer-events:none;
        z-index:12;
        overflow:hidden;
      }
      .xd-danmu-overlay.is-off { display:none; }
      .xd-danmu-tv-line {
        position:absolute; left:100%;
        white-space:nowrap;
        padding:5px 10px;
        border-radius:999px;
        background:rgba(255,255,255,.78);
        border:1px solid rgba(255,255,255,.72);
        color:#66595c;
        font-size:10px;
        box-shadow:0 4px 16px rgba(85,62,68,.05);
        animation:xdTVDanmu 12s linear infinite;
      }
      .xd-danmu-tv-line.line-0 { top:12px; animation-duration:13s; }
      .xd-danmu-tv-line.line-1 { top:54px; animation-duration:16s; animation-delay:-4s; }
      .xd-danmu-tv-line.line-2 { top:96px; animation-duration:14s; animation-delay:-8s; }
      @keyframes xdTVDanmu { from { transform:translateX(0); } to { transform:translateX(-160vw); } }

      .xd-house-event-scene { margin-top:14px; padding:13px; border-radius:18px; background:#fbf1f3; color:#5c5053; font-size:12px; line-height:1.8; }
      .xd-house-event-options { display:grid; gap:8px; margin-top:12px; }
      .xd-house-option { display:flex; align-items:flex-start; gap:10px; padding:11px; text-align:left; border:1px solid rgba(184,135,145,.12); border-radius:17px; background:#fffafa; cursor:pointer; }
      .xd-house-option > span { width:25px; height:25px; flex:0 0 25px; display:grid; place-items:center; border-radius:50%; background:#f2dfe3; color:#9e6b76; font-size:9px; font-weight:850; }
      .xd-house-option b { display:block; font-size:11px; }
      .xd-house-option small { display:block; margin-top:3px; font-size:8px; line-height:1.5; color:#94868a; }

      .xd-weibo-tabs { position:sticky; top:0; z-index:5; display:flex; gap:7px; overflow:auto; padding:4px 0 10px; background:linear-gradient(#faf2f3 80%,rgba(250,242,243,0)); }
      .xd-weibo-tabs button { flex:0 0 auto; border:0; border-radius:999px; padding:8px 12px; background:rgba(255,255,255,.64); color:#9a8b8e; font-size:9px; cursor:pointer; }
      .xd-weibo-tabs button.active { background:#ead0d5; color:#805b65; font-weight:800; }
      .xd-weibo-category-title { margin:6px 0 10px; font-size:19px; font-weight:850; }
      .xd-setting-label { margin:14px 0 7px; font-size:9px; color:#9b8b8f; font-weight:800; }
      .xd-chip-grid { display:flex; flex-wrap:wrap; gap:7px; }
      .xd-setting-chip { border:1px solid rgba(184,135,145,.14); border-radius:999px; padding:7px 10px; background:#fbf5f6; color:#88797c; font-size:9px; cursor:pointer; }
      .xd-setting-chip.active { background:#e8c8ce; color:#7c5962; border-color:#d9aeb7; font-weight:800; }
      .xd-setting-fixed { margin-top:14px; padding:10px 11px; border-radius:14px; background:#f7e8eb; color:#8d6870; font-size:9px; }

      .xd-generating-overlay {
        position:absolute;
        inset:0;
        z-index:9999;
        display:flex;
        align-items:center;
        justify-content:center;
        background:rgba(248,237,239,.72);
        backdrop-filter:blur(9px);
        -webkit-backdrop-filter:blur(9px);
      }
      .xd-generating-card {
        width:min(310px,calc(100% - 42px));
        padding:28px 22px;
        border-radius:28px;
        background:rgba(255,255,255,.90);
        border:1px solid rgba(184,135,145,.16);
        box-shadow:0 20px 60px rgba(94,68,75,.13);
        text-align:center;
      }
      .xd-generating-orbit { position:relative; width:52px; height:52px; margin:0 auto 15px; border:2px solid #e7c5cb; border-top-color:#b88791; border-radius:50%; animation:xdSpin 1.1s linear infinite; }
      .xd-generating-orbit i { position:absolute; width:7px; height:7px; border-radius:50%; background:#dcaeb8; }
      .xd-generating-orbit i:nth-child(1){left:8px;top:9px;}
      .xd-generating-orbit i:nth-child(2){right:5px;top:19px;}
      .xd-generating-orbit i:nth-child(3){left:22px;bottom:3px;}
      @keyframes xdSpin { to { transform:rotate(360deg); } }
      .xd-generating-title { font-size:15px; font-weight:850; color:#4b3e41; }
      .xd-generating-sub { margin-top:7px; font-size:9px; line-height:1.7; color:#95878a; }
      .xd-generating-dots { margin-top:12px; display:flex; justify-content:center; gap:5px; }
      .xd-generating-dots span { width:5px; height:5px; border-radius:50%; background:#c89aa4; animation:xdDot 1s infinite alternate; }
      .xd-generating-dots span:nth-child(2){animation-delay:.18s}.xd-generating-dots span:nth-child(3){animation-delay:.36s}
      @keyframes xdDot { from{opacity:.25;transform:translateY(0)} to{opacity:1;transform:translateY(-3px)} }

      /* =====================================================
         桌面
         ===================================================== */

      @media (min-width:700px) {
        .roche-plugin-xindong-xianchang {
          max-width:none;
          width:100%;
          margin:0;
          border-left:0;
          border-right:0;
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
            ♡
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
            data-tab="phone"
          >
            <span class="xd-tab-icon">
              ◫
            </span>

            <span class="xd-tab-label">
              我的手机
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
    const archive = state.currentArchive;
    const day = archive?.currentDay || 1;

    if (!archive) {
      return `
        <div class="xd-page">
          ${pageHead("TONIGHT · LIVE","心动现场","还没有正在进行的恋综")}
          <section class="xd-hero">
            <div class="xd-kicker">READY TO START</div>
            <div class="xd-hero-title">开始一场新的心动。</div>
            <div class="xd-hero-sub">先创建属于你的恋综世界，再选择本季入住的嘉宾。Roche 中的其他角色不会自动进入节目。</div>
            <button class="xd-primary" data-new-archive>＋ 创建新的恋综</button>
          </section>
        </div>`;
    }

    const stage = archive.stage || "intro";
    const intro = archive.ai?.introCards;
    const introIndex = archive.ai?.introIndex || 0;
    const currentGuestIntro = intro?.guests?.[Math.max(0, introIndex - 2)];
    const stageNames = {
      intro:"嘉宾入场", task:"心动争夺战", vote:"观众投票",
      date:"心动约会", free:"夜间自由活动", dayEnd:"今日录制结束"
    };
    let mainContent = "";

    if (stage === "intro") {
      if (!intro) {
        mainContent = `
          <section class="xd-program-card xd-program-opening">
            <div class="xd-program-kicker">OPENING</div>
            <div class="xd-program-title">今天，心动现场正式开机。</div>
            <div class="xd-program-host">主持人、USER和嘉宾将依次入场。每个人都会用自己的方式介绍自己。</div>
            <button class="xd-primary" data-start-show>开始今日录制</button>
          </section>`;
      } else if (introIndex === 0) {
        mainContent = `
          <section class="xd-intro-card">
            <div class="xd-stage-label">主持人 · LIVE</div>
            <div class="xd-host-avatar">♡</div>
            <div class="xd-intro-speaker">主持人</div>
            <div class="xd-intro-text">${esc(intro.host)}</div>
            <button class="xd-primary" data-intro-next>进入自我介绍</button>
          </section>`;
      } else if (introIndex === 1) {
        mainContent = `
          <section class="xd-intro-card xd-user-intro-card">
            <div class="xd-stage-label">USER · YOUR TURN</div>
            <div class="xd-intro-speaker">现在轮到你。</div>
            <div class="xd-intro-text">${esc(intro.userPrompt || "请用自己的方式介绍一下自己。")}</div>
            <textarea class="xd-user-intro-input" data-user-intro placeholder="写下你想在节目里亲口介绍的内容……">${esc(archive.ai?.userIntro || "")}</textarea>
            <button class="xd-primary" data-intro-next>完成我的自我介绍</button>
          </section>`;
      } else if (currentGuestIntro) {
        const guest = (archive.characters || []).find(c => String(c.characterId || c.id) === String(currentGuestIntro.characterId)) || currentGuestIntro;
        const guestNo = introIndex - 1;
        mainContent = `
          <section class="xd-intro-card">
            <div class="xd-stage-label">嘉宾 ${guestNo} · LIVE</div>
            ${avatarHTML(guest, "xd-intro-avatar")}
            <div class="xd-intro-speaker">${esc(guest.name || currentGuestIntro.name)}</div>
            <div class="xd-intro-text">${esc(currentGuestIntro.intro || guest.bio || guest.persona || "")}</div>
            <button class="xd-primary" data-intro-next>${guestNo >= (intro.guests?.length || 0) ? "进入第一天任务" : "下一位嘉宾"}</button>
          </section>`;
      }
    } else if (stage === "task") {
      mainContent = `
        <section class="xd-task-card">
          <div class="xd-stage-label">DAY ${String(day).padStart(2,"0")} · CHALLENGE</div>
          <div class="xd-task-title">心动争夺战</div>
          <div class="xd-task-sub">每位嘉宾独自完成最符合自己人设的挑战。厨艺、画画、唱歌……今晚的约会机会只有一个。</div>
          <div class="xd-contestants">
            ${(archive.characters || []).map((c,i)=>`
              <article class="xd-contestant">
                ${avatarHTML(c,"xd-contestant-avatar")}
                <div class="xd-contestant-main"><div class="xd-contestant-name">${esc(c.name)}</div><div class="xd-contestant-desc">${esc(c.bio || c.persona || "正在准备自己的挑战。").slice(0,70)}</div></div>
                <div class="xd-contestant-status">${["准备中","挑战中","等待评分"][i % 3]}</div>
              </article>`).join("")}
          </div>
          <button class="xd-primary" data-start-show>开始比赛</button>
          ${archive.ai?.lastEvent ? `<div class="xd-program-result"><div class="xd-stage-label">节目片段</div><div class="xd-scene-short">${esc(archive.ai.lastEvent)}</div></div>` : ""}
        </section>`;
    } else if (stage === "vote") {
      mainContent = `
        <section class="xd-vote-card xd-vote-live">
          <div class="xd-stage-label">LIVE VOTE · 观众投票</div>
          <div class="xd-task-title">${esc(archive.vote?.title || "第一天心动争夺战")}</div>
          ${(archive.vote?.results || []).map(r=>`<div class="xd-vote-row"><div class="xd-vote-name">${esc(r.name)}</div><div class="xd-vote-bar"><div class="xd-vote-fill" style="width:${Math.round(r.score || 0)}%"></div></div><div class="xd-vote-num">${Math.round(r.score || 0)}%</div></div>`).join("")}
          <div class="xd-vote-winner">${archive.vote?.winner ? `今晚的约会资格：${esc(archive.vote.winner)}` : "等待投票结果"}</div>
          <button class="xd-primary" data-start-show>进入心动约会</button>
        </section>`;
    } else if (stage === "date") {
      const winner = archive.vote?.winner || "心动嘉宾";
      const plan = archive.ai?.datePlan || {};
      const scene = archive.ai?.dateScene;
      mainContent = `
        <section class="xd-date-card">
          <div class="xd-stage-label">DATE · TONIGHT</div>
          <div class="xd-date-title">${esc(winner)}已经为你安排好了今晚的约会。</div>
          ${plan.place ? `<div class="xd-phone-widget" style="margin-top:14px;"><div class="xd-kicker">TA CHOSE</div><div style="margin-top:6px;font-size:15px;font-weight:850;">${esc(plan.place)}</div><div style="margin-top:5px;font-size:10px;color:#8e8183;">${esc(plan.activity || "")}</div><div style="margin-top:8px;font-size:11px;line-height:1.7;">${esc(plan.theme || "")}</div></div>` : ""}
          ${scene ? `<div class="xd-program-result" style="margin-top:12px;"><div class="xd-stage-label">约会现场</div><div class="xd-scene-short">${esc(scene.scene || "")}</div></div>` : ""}
          ${scene && (scene.options || []).length ? `<div class="xd-date-options">${scene.options.slice(0,3).map((o,i)=>`<button class="xd-date-option" data-date-action="${i}"><span>${["♡","✦","☾"][i]}</span><b>${esc(o.label)}</b><small>${esc(o.text || "")}</small></button>`).join("")}</div>` : ""}
          <button class="xd-primary" data-start-date-stage style="margin-top:14px;">${scene ? "继续约会" : "开始约会"}</button>
        </section>`;
    } else if (stage === "free") {
      mainContent = `
        <section class="xd-free-card">
          <div class="xd-stage-label">NIGHT · FREE TIME</div>
          <div class="xd-task-title">晚上的时间，交给你。</div>
          <div class="xd-task-sub">进入心动小屋，点击地点触发随机事件。你可以自己决定今晚要靠近谁。</div>
          ${day > 1 && archive.ai?.nightPlays?.length ? `<div class="xd-phone-list" style="margin-top:14px;">${archive.ai.nightPlays.map((p,i)=>`<button class="xd-phone-list-card" data-night-play="${i}" style="width:100%;text-align:left;cursor:pointer;"><div class="xd-phone-list-title">${esc(p.title || "夜间玩法")}</div><div class="xd-phone-list-desc">${esc(p.desc || "")}</div></button>`).join("")}</div>` : ""}
          ${day > 1 ? `<button class="xd-small-btn" data-generate-night style="width:100%;margin-top:10px;">✦ 生成今晚玩法</button>` : ""}
          <button class="xd-primary" data-open-house>进入心动小屋</button>
          <button class="xd-small-btn" data-end-night style="margin-top:10px;width:100%;">结束今晚 · 进入明天</button>
        </section>`;
    } else {
      mainContent = `
        <section class="xd-program-card">
          <div class="xd-stage-label">DAY ${String(day).padStart(2,"0")} · END</div>
          <div class="xd-program-title">今天的录制结束了。</div>
          <div class="xd-program-host">角色手机、动态、日记、成就与节目舆论已经更新。</div>
          <button class="xd-primary" data-start-show>开始下一天</button>
        </section>`;
    }

    return `
      <div class="xd-page">
        <section class="xd-recording-hero">
          <div>
            <div class="xd-kicker">TODAY'S RECORDING</div>
            <div class="xd-recording-title">DAY ${String(day).padStart(2,"0")} · ${esc(stageNames[stage] || "LIVE")}</div>
            <div class="xd-recording-sub">${esc(archive.title)} · ${stage === "free" ? "夜间自由活动" : "节目正在进行"}</div>
          </div>
          <div class="xd-recording-status"><span class="xd-live-dot"></span> LIVE</div>
        </section>
        <div class="xd-v2-toolbar">
          <span class="xd-ai-badge">✦ AI 剧情引擎</span>
          <button class="xd-danmu-toggle ${archive.danmuEnabled !== false ? "on" : ""}" data-danmu-toggle>💬 弹幕 <span class="xd-danmu-toggle-track"></span></button>
        </div>
        ${mainContent}
        <div class="xd-danmu-overlay ${archive.danmuEnabled !== false ? "" : "is-off"}">
          ${(archive.danmu || []).filter(Boolean).slice(0,3).map((d,i)=>`<span class="xd-danmu-tv-line line-${i}">${esc(d)}</span>`).join("")}
        </div>
      </div>`;
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

            <div style="margin-top:14px;font-size:10px;color:#a97983;font-weight:700;">
              请前往「档案」创建新的恋综世界
            </div>

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

          ${avatarHTML(archive?.userPersona || state.user)}

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

  function renderCharacterPhone(char) {
    const archive = state.currentArchive || {};
    const data = archive.characterPhones?.[char.characterId] || {};
    const apps = [
      ["sms","✉","短信"],["private","♡","私信"],["dynamics","◉","动态"],
      ["diary","▤","日记"],["achievements","◇","成就"],["notes","✦","备忘录"],["weibo","◎","微博"]
    ];
    return `<div class="xd-page">
      ${pageHead("CHAR PHONE", nameOf(char), "他的手机，只属于这一季恋综")}
      <section class="xd-profile">${avatarHTML(char)}<div><div class="xd-profile-name">${esc(nameOf(char))}</div><div class="xd-profile-handle">${esc(handleOf(char) || "CHAR")}</div><div class="xd-profile-bio">${esc(char.bio || char.persona || "")}</div></div></section>
      <div class="xd-phone-widget" style="margin-top:12px;"><div class="xd-kicker">PRIVATE DEVICE</div><div style="margin-top:6px;font-size:12px;line-height:1.7;color:#75696b;">这里记录这个角色在节目中的手机生活。内容会根据人设、关系、当天事件和已经发生的故事逐步更新。</div></div>
      <div class="xd-char-phone-apps" style="margin-top:12px;">${apps.map(a => `<button class="xd-char-phone-app" data-char-phone-app="${a[0]}"><div class="xd-char-phone-icon">${a[1]}</div><div class="xd-char-phone-label">${a[2]}</div></button>`).join("")}</div>
      <div class="xd-phone-widget" style="margin-top:12px;"><div class="xd-kicker">AI STATUS</div><div style="margin-top:6px;font-size:11px;color:#75696b;line-height:1.7;">${esc(data.status || "角色手机会随着节目进展自动变化。")}</div></div>
    </div>`;
  }

  function renderCharacterPhoneSub(title, kicker, body) {
    return `<div class="xd-page"><div style="display:flex;align-items:center;gap:10px;margin-bottom:5px;"><button class="xd-small-btn" data-back-char-phone style="flex:0 0 auto;width:72px;">‹ 返回</button><div style="font-size:19px;font-weight:820;">${esc(title)}</div></div><div class="xd-kicker">${esc(kicker)}</div>${body}</div>`;
  }

  function renderCharacterSMS(char) {
    const archive = state.currentArchive || {};
    const items = archive.characterPhones?.[char?.characterId]?.sms || [];
    const peers = (archive.characters || []).filter(c => c.characterId !== char?.characterId);
    return `<div class="xd-phone-list" style="margin-top:14px;">${items.map(x => `<article class="xd-phone-list-card"><div class="xd-phone-list-title">${esc(x.from || "未知")}</div><div class="xd-phone-list-desc">${esc(x.text || "")}</div></article>`).join("")}${peers.map(p => `<article class="xd-phone-list-card"><div class="xd-phone-list-title">${esc(p.name)}</div><div class="xd-phone-list-desc">${esc((items.find(x => x.from === p.name)?.text) || "节目开始后，这里会出现来自其他嘉宾的短信。")}</div></article>`).join("")}</div>`;
  }

  function renderCharacterPrivate(char) {
    const archive = state.currentArchive || {};
    const items = archive.privateMessages?.[char?.characterId] || [];
    return `<div class="xd-phone-list" style="margin-top:14px;">${items.length ? items.map(x => `<article class="xd-phone-list-card"><div class="xd-phone-list-title">${esc(x.from === "me" ? "User" : x.from || "未知")}</div><div class="xd-phone-list-desc">${esc(x.text || "")}</div></article>`).join("") : `<div class="xd-empty"><div class="xd-empty-title">还没有私信</div><div class="xd-empty-text">随着节目中的竞争、吃醋和主动靠近，这里会自然出现消息。</div></div>`}</div>`;
  }

  function renderCharacterDynamics(char) {
    const archive = state.currentArchive || {};
    const items = archive.characterPhones?.[char?.characterId]?.dynamics || [];
    return `<div class="xd-phone-list" style="margin-top:14px;">${items.length ? items.map(x => `<article class="xd-phone-widget"><div class="xd-feed-head"><div class="xd-feed-avatar">${esc((char?.name || "♡").slice(0,1))}</div><div><div class="xd-feed-name">${esc(char?.name || "未署名")}</div><div class="xd-feed-time">${esc(x.time || "刚刚")}</div></div></div><div class="xd-feed-text">${esc(x.text || "")}</div></article>`).join("") : `<div class="xd-empty"><div class="xd-empty-title">还没有动态</div><div class="xd-empty-text">角色会根据当天经历发布类似朋友圈的动态。</div></div>`}</div>`;
  }

  function renderCharacterDiary(char) {
    const archive = state.currentArchive || {};
    const items = archive.characterPhones?.[char?.characterId]?.diary || [];
    return `<div class="xd-phone-list" style="margin-top:14px;">${items.length ? items.map(x => `<article class="xd-phone-list-card"><div class="xd-phone-list-title">${esc(x.title || "今天")}</div><div class="xd-phone-list-desc">${esc(x.text || "")}</div></article>`).join("") : `<div class="xd-empty"><div class="xd-empty-title">还没有日记</div><div class="xd-empty-text">日记会记录角色不想直接说出口的想法。</div></div>`}</div>`;
  }

  function renderCharacterAchievements(char) {
    const archive = state.currentArchive || {};
    const items = archive.characterPhones?.[char?.characterId]?.achievements || [];
    return `<div class="xd-phone-list" style="margin-top:14px;">${items.length ? items.map(x => `<article class="xd-phone-list-card"><div class="xd-phone-list-title">${esc(x.title || "成就")}</div><div class="xd-phone-list-desc">${esc(x.text || "")}</div></article>`).join("") : `<div class="xd-empty"><div class="xd-empty-title">尚未解锁成就</div><div class="xd-empty-text">约会、任务、特殊事件和关系变化都会产生新的成就。</div></div>`}</div>`;
  }

  function renderCharacterNotes(char) {
    const archive = state.currentArchive || {};
    const items = archive.characterPhones?.[char?.characterId]?.notes || [];
    return `<div class="xd-phone-list" style="margin-top:14px;">${items.length ? items.map(x => `<article class="xd-phone-list-card"><div class="xd-phone-list-title">${esc(x.title || "备忘")}</div><div class="xd-phone-list-desc">${esc(x.text || "")}</div></article>`).join("") : `<div class="xd-empty"><div class="xd-empty-title">备忘录是空的</div><div class="xd-empty-text">角色可以把观察、计划、User的喜好和自己的小心思写在这里。</div></div>`}</div>`;
  }

  function renderCharacterWeibo(char) {
    const archive = state.currentArchive || {};
    const items = archive.characterPhones?.[char?.characterId]?.weibo || [];
    return `<div class="xd-phone-list" style="margin-top:14px;">${items.length ? items.map(x => `<article class="xd-phone-widget"><div class="xd-feed-head"><div class="xd-feed-avatar">${esc((char?.name || "♡").slice(0,1))}</div><div><div class="xd-feed-name">${esc(char?.name || "未署名")}</div><div class="xd-feed-time">${esc(x.time || "刚刚")}</div></div></div><div class="xd-feed-text">${esc(x.text || "")}</div></article>`).join("") : `<div class="xd-empty"><div class="xd-empty-title">还没有微博</div><div class="xd-empty-text">这里只展示这个角色自己的公开内容。</div></div>`}</div>`;
  }

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
          <div class="xd-house-floor"></div>
          <div class="xd-house-status">LIVE HOUSE MAP</div>

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

        <div class="xd-house-note">
          <div class="xd-kicker">HOW IT WORKS</div>
          <div style="margin-top:6px;font-size:11px;font-weight:760;">小屋负责“人在哪里”，今日玩法负责“今天发生什么”。</div>
          <div style="margin-top:4px;font-size:9px;line-height:1.6;color:var(--xd-muted);">点击地点查看现场；玩法事件会自动把你带到对应地点，不需要退出小屋重新寻找。</div>
        </div>

        <button class="xd-small-btn" data-house-custom style="width:100%;margin-top:10px;">✎ 自定义：我想在小屋发生什么</button>

      </div>
    `;
  }

  /* =========================================================
     我的手机
     ========================================================= */

  function renderPhone() {
    const archive = state.currentArchive;
    const title = archive?.title || "尚未开始恋综";
    const day = archive?.currentDay || 1;
    const smsCount = archive?.phone?.sms?.length || 0;
    const weiboCount = archive?.phone?.weibo?.length || 0;
    const dynamicCount = archive?.phone?.dynamics?.length || 0;

    if (!archive) {
      return `<div class="xd-page">${pageHead("MY PHONE","我的手机","等待一季恋综开始")}<div class="xd-empty"><div class="xd-empty-icon">▣</div><div class="xd-empty-title">你的手机还没有故事</div><div class="xd-empty-text">开始一个恋综档案后，微博、短信、备忘录、相册与动态等数据会跟着这一季独立变化。</div></div></div>`;
    }

    return `
      <div class="xd-page">
        ${pageHead("MY PHONE","我的手机",`DAY ${String(day).padStart(2,"0")}`)}
        <section class="xd-phone">
          <div class="xd-phone-status"><span>9:41</span><span>● ● ▰</span></div>
          <div class="xd-phone-title">我的手机</div>
          <div class="xd-phone-sub">${esc(title)} · 这一季的生活都在这里</div>
          <div class="xd-phone-apps">
            <button class="xd-phone-app" data-phone-app="weibo"><div class="xd-phone-icon">◉</div><div class="xd-phone-label">微博 <span style="color:#a97983;">${weiboCount || ""}</span></div></button>
            <button class="xd-phone-app" data-phone-app="sms"><div class="xd-phone-icon">✉</div><div class="xd-phone-label">私信 <span style="color:#a97983;">${smsCount || ""}</span></div></button>
            <button class="xd-phone-app" data-phone-app="album"><div class="xd-phone-icon">▧</div><div class="xd-phone-label">相册</div></button>
            <button class="xd-phone-app" data-phone-app="notes"><div class="xd-phone-icon">▤</div><div class="xd-phone-label">备忘录</div></button>
            <button class="xd-phone-app" data-phone-app="dynamics"><div class="xd-phone-icon">♡</div><div class="xd-phone-label">动态 <span style="color:#a97983;">${dynamicCount || ""}</span></div></button>
            <button class="xd-phone-app placeholder" data-phone-app="calendar"><div class="xd-phone-icon">◫</div><div class="xd-phone-label">日历</div></button>
            <button class="xd-phone-app placeholder" data-phone-app="map"><div class="xd-phone-icon">⌖</div><div class="xd-phone-label">地图</div></button>
            <button class="xd-phone-app placeholder" data-phone-app="edit"><div class="xd-phone-icon">✦</div><div class="xd-phone-label">节目剪辑</div></button>
            <button class="xd-phone-app placeholder" data-phone-app="achievements"><div class="xd-phone-icon">◇</div><div class="xd-phone-label">成就</div></button>
            <button class="xd-phone-app placeholder" data-phone-app="music"><div class="xd-phone-icon">♫</div><div class="xd-phone-label">音乐</div></button>
          </div>
          <div class="xd-phone-widget">
            <div class="xd-kicker">TODAY ON YOUR PHONE</div>
            <div style="margin-top:7px;font-size:13px;font-weight:800;">${weiboCount} 条微博 · ${smsCount} 条私信 · ${dynamicCount} 条动态</div>
            <div style="margin-top:5px;font-size:10px;line-height:1.6;color:#8e8183;">手机内容属于当前恋综档案。切换档案后，数据也会一起切换。</div>
          </div>
        </section>
      </div>`;
  }

  function renderPhoneSub(title, kicker, body) {
    return `<div class="xd-page"><div style="display:flex;align-items:center;gap:10px;margin-bottom:5px;"><button class="xd-small-btn" data-back-phone style="flex:0 0 auto;width:72px;">‹ 返回</button><div style="font-size:19px;font-weight:820;">${esc(title)}</div></div><div class="xd-kicker">${esc(kicker)}</div>${body}</div>`;
  }

  function renderWeibo() {
    const items = state.currentArchive?.phone?.weibo || [];
    const chars = state.characters || [];
    const categories = ["节目报道","网友讨论","节目吃瓜","同人文"];
    const activeCategory = state.weiboCategory || "节目报道";
    const visibleItems = items.filter(item => (item.category || "网友讨论") === activeCategory || (activeCategory === "节目吃瓜" && item.category === "吃瓜") || (activeCategory === "同人文" && item.category === "同人"));
    const cards = state.currentArchive?.ai?.fanficCards || [];
    const reading = state.currentArchive?.ai?.fanficReading || [];
    const normal = activeCategory !== "同人文";
    const body = normal ? `
      <button class="xd-small-btn" data-generate-weibo-category style="width:100%;margin-bottom:10px;">✦ AI 生成本分类内容</button>
      <div class="xd-phone-list">
        ${visibleItems.length ? visibleItems.map(item => `<article class="xd-phone-widget"><div class="xd-feed-head"><div class="xd-feed-avatar">${activeCategory === "节目报道" ? "官" : activeCategory === "网友讨论" ? "网" : "瓜"}</div><div><div class="xd-feed-name">${esc(item.author)}</div><div class="xd-feed-time">${esc(item.time || "刚刚")}</div></div></div><div class="xd-feed-text">${esc(item.text)}</div><div class="xd-feed-meta">${esc(item.meta || "热议中")}</div></article>`).join("") : `<div class="xd-empty"><div class="xd-empty-title">暂时没有内容</div><div class="xd-empty-text">点击上方按钮，让AI生成本分类内容。</div></div>`}
        ${activeCategory === "网友讨论" || activeCategory === "节目吃瓜" ? `<article class="xd-phone-widget"><div class="xd-kicker">HOT SEARCH</div><div style="margin-top:8px;font-size:12px;font-weight:800;">#${esc(chars[0]?.name || "本季嘉宾")} 的节目表现正在被讨论</div></article>` : ""}
      </div>` : `
      <section class="xd-phone-widget">
        <div class="xd-kicker">AI FANFIC LAB</div>
        <div style="margin-top:5px;font-size:12px;font-weight:800;">先选择世界、角色与是否关联恋综经历，再生成4-5个故事选题。</div>
        <button class="xd-primary" data-generate-fanfic>选择设定并生成选题</button>
      </section>
      <div class="xd-phone-list" style="margin-top:10px;">
        ${cards.length ? cards.map((c,i)=>`<button class="xd-phone-list-card" data-fanfic-index="${i}" style="width:100%;text-align:left;cursor:pointer;"><div class="xd-phone-list-title">${esc(c.title)}</div><div style="margin-top:5px;font-size:9px;color:#a97983;">${esc(c.tags)}</div><div class="xd-phone-list-desc">${esc(c.intro)}</div></button>`).join("") : `<div class="xd-empty"><div class="xd-empty-title">还没有同人选题</div><div class="xd-empty-text">点击上方按钮生成。</div></div>`}
      </div>
      ${reading.length ? `<section class="xd-phone-widget" style="margin-top:10px;"><div class="xd-kicker">READING HISTORY</div><div style="margin-top:7px;font-size:10px;color:#8e8183;">已保存 ${reading.length} 篇阅读记录。</div></section>` : ""}`;
    return renderPhoneSub("微博", "PUBLIC FEED", `
      <div class="xd-weibo-tabs">${categories.map(c => `<button class="${activeCategory === c ? "active" : ""}" data-weibo-category="${esc(c)}">${esc(c)}</button>`).join("")}</div>
      <div class="xd-weibo-category-title">${esc(activeCategory)}</div>
      ${body}
    `);
  }

  function renderPhoneSMS() {
    const archive = state.currentArchive;
    const items = archive?.phone?.sms || [];
    const chars = archive?.characters || [];
    return renderPhoneSub("短信", "MESSAGES", `
      <div class="xd-phone-list" style="margin-top:14px;">
        ${chars.map(char => {
          const last = items.slice().reverse().find(x => String(x.from) === String(char.name));
          return `<button class="xd-phone-list-card xd-contact-card" data-sms-char="${esc(char.characterId || char.id)}" style="width:100%;text-align:left;cursor:pointer;"><div style="display:flex;align-items:center;gap:10px;">${avatarHTML(char, "xd-avatar")}<div><div class="xd-phone-list-title">${esc(char.name)}</div><div style="font-size:8px;color:#a09597;">${esc(last?.time || "节目开始后")}</div></div></div><div class="xd-phone-list-desc">${esc(last?.text || "暂无消息。随着节目推进，这里会收到来自这位嘉宾的短信。")}</div></button>`;
        }).join("")}
        <article class="xd-phone-list-card"><div class="xd-phone-list-title">匿名短信</div><div class="xd-phone-list-desc">匿名短信会单独显示在这里，不会代替嘉宾短信列表。</div></article>
      </div>
    `);
  }

  function renderPhoneNotes() {
    const items = state.currentArchive?.phone?.notes || [];
    return renderPhoneSub("备忘录", "MY NOTES", `
      <div class="xd-phone-list" style="margin-top:14px;">
        ${items.map(item => `<article class="xd-phone-list-card"><div class="xd-phone-list-title">${esc(item.title)}</div><div class="xd-phone-list-desc">${esc(item.text)}</div><div style="margin-top:6px;font-size:8px;color:#a09597;">${esc(item.time)}</div></article>`).join("")}
      </div>`);
  }

  function renderPhoneAlbum() {
    const chars = state.characters || [];
    return renderPhoneSub("相册", "MY ALBUM", `
      <div class="xd-section-head"><div class="xd-section-title">本季瞬间</div><div class="xd-section-note">${chars.length} 位嘉宾</div></div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
        ${chars.map((char,i) => `<div style="aspect-ratio:1;border-radius:17px;overflow:hidden;background:#eadbde;display:grid;place-items:center;color:#855d67;font-weight:800;">${avatarOf(char) ? `<img src="${esc(avatarOf(char))}" style="width:100%;height:100%;object-fit:cover;">` : esc(nameOf(char).slice(0,1))}</div>`).join("")}
        <div style="aspect-ratio:1;border-radius:17px;background:#f1e2e4;display:grid;place-items:center;color:#a97983;font-size:22px;">＋</div>
      </div>`);
  }

  function renderPhoneDynamics() {
    const items = state.currentArchive?.phone?.dynamics || [];
    return renderPhoneSub("动态", "INNER CIRCLE", `
      <div class="xd-section-head"><div class="xd-section-title">只属于恋综内部的人</div><div class="xd-section-note">嘉宾 / 导演 / 制片人</div></div>
      <div class="xd-phone-list">
        ${items.length ? items.map(item => `<article class="xd-phone-widget"><div class="xd-feed-head"><div class="xd-feed-avatar">${esc((item.author || "♡").slice(0,1))}</div><div><div class="xd-feed-name">${esc(item.author || "未署名")}</div><div class="xd-feed-time">${esc(item.time || "刚刚")}</div></div></div><div class="xd-feed-text">${esc(item.text || "")}</div><div class="xd-feed-meta">${esc(item.meta || "恋综内部动态")}</div></article>`).join("") : `<div class="xd-empty"><div class="xd-empty-icon">♡</div><div class="xd-empty-title">还没有动态</div><div class="xd-empty-text">嘉宾、导演和制片人的动态会随着节目进展出现。</div></div>`}
      </div>`);
  }

  function renderPhonePlaceholder(title, icon, desc) {
    return renderPhoneSub(title, "COMING SOON", `<div class="xd-empty" style="margin-top:14px;"><div class="xd-empty-icon">${icon}</div><div class="xd-empty-title">${esc(title)}正在准备</div><div class="xd-empty-text">${esc(desc)}</div></div>`);
  }

  /* =========================================================
     世界书库
     ========================================================= */

  function renderWorldbooks() {
    const selectedIds = new Set((state.currentArchive?.worldbooks || []).map(w => String(w.id)));
    const all = state.currentArchive
      ? [...state.rocheWorldbooks, ...state.customWorldbooks].filter(wb => selectedIds.has(String(wb.id)))
      : [...state.rocheWorldbooks, ...state.customWorldbooks];
    return `
      <div class="xd-page">
        ${pageHead("WORLDBOOK LIBRARY","世界书库","先准备世界，再开始恋综")}
        <div class="xd-empty" style="padding:20px 16px;margin-bottom:11px;">
          <div class="xd-empty-icon">📖</div>
          <div class="xd-empty-title">世界书先于恋综存在</div>
          <div class="xd-empty-text">这里可以管理 Roche 读取到的世界书，也可以提前写好多本自己的世界书。创建恋综时再自由勾选。</div>
        </div>
        ${state.currentArchive ? `<div class="xd-section-head"><div class="xd-section-title">本季已选世界</div><div class="xd-section-note">${(state.currentArchive.worldbooks || []).length} 本</div></div><div class="xd-card-grid" style="margin-bottom:12px;">${(state.currentArchive.worldbooks || []).length ? state.currentArchive.worldbooks.map(wb => `<article class="xd-worldbook-card"><div class="xd-worldbook-type">当前档案快照</div><div class="xd-worldbook-name">${esc(wb.name)}</div><div class="xd-worldbook-desc">${esc(wb.description || "暂无说明")}</div></article>`).join("") : `<div class="xd-empty" style="padding:18px;">当前档案没有勾选世界书。</div>`}</div>` : ""}
        <div class="xd-section-head"><div class="xd-section-title">世界书准备库</div><div class="xd-section-note">可供新档案选择</div></div>
        <div class="xd-card-grid">
          ${all.length ? all.map(wb => `<article class="xd-worldbook-card"><div class="xd-worldbook-type">${esc(wb.sourceLabel || "世界书")}</div><div class="xd-worldbook-name">${esc(wb.name)}</div><div class="xd-worldbook-desc">${esc(wb.description || "暂无说明")}</div><div class="xd-worldbook-content">${esc(wb.content || "暂无内容")}</div><div class="xd-worldbook-actions">${wb.builtin || wb.source === "roche" ? "" : `<button class="xd-small-btn" data-delete-worldbook="${esc(wb.id)}">删除</button>`}</div></article>`).join("") : `<div class="xd-empty"><div class="xd-empty-title">还没有世界书</div></div>`}
        </div>
        <button class="xd-new-archive" data-new-worldbook>＋ 提前创建一本世界书</button>
      </div>`;
  }

  function openCreateWorldbook() {
    const modal = document.createElement("div");
    modal.className = "xd-modal-wrap";
    modal.innerHTML = `<section class="xd-modal"><div class="xd-modal-handle"></div><div class="xd-kicker">NEW WORLDBOOK</div><div class="xd-modal-title" style="margin-top:4px;">创建世界书</div><div class="xd-field"><label>世界书名称</label><input data-wb-name maxlength="40" placeholder="例如：海岛恋综规则"></div><div class="xd-field"><label>简介</label><input data-wb-desc maxlength="100" placeholder="这本世界书负责什么"></div><div class="xd-field"><label>世界书内容</label><textarea data-wb-content rows="9" placeholder="写下世界观、节目规则、地点、人物规则、特殊事件……"></textarea></div><div class="xd-modal-actions"><button class="xd-small-btn" data-close-wb>取消</button><button class="xd-primary" style="margin-top:0;" data-save-wb>保存世界书</button></div></section>`;
    state.container.querySelector(".roche-plugin-xindong-xianchang").appendChild(modal);
    listen(modal.querySelector("[data-close-wb]"),"click",()=>modal.remove());
    listen(modal,"click",e=>{if(e.target===modal)modal.remove();});
    listen(modal.querySelector("[data-save-wb]"),"click",async()=>{
      const name=modal.querySelector("[data-wb-name]").value.trim()||"未命名世界书";
      const description=modal.querySelector("[data-wb-desc]").value.trim();
      const content=modal.querySelector("[data-wb-content]").value.trim();
      if(!content){toast("请先写一点世界书内容");return;}
      state.customWorldbooks.push({id:uid(),name,description,content,source:"custom",sourceLabel:"自建世界书",defaultSelected:false,builtin:false,createdAt:Date.now()});
      await storageSet("customWorldbooks",state.customWorldbooks);
      modal.remove(); renderPage(); toast("世界书已保存");
    });
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

        <button class="xd-new-archive" data-open-worldbooks style="margin-top:0;margin-bottom:11px;">📖 世界书库 · 提前准备你的世界</button>

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

    const rawMode = archive?.participationMode || "immersive";
    const mode = rawMode === "memory" ? "immersive" : (rawMode === "immersive" && archive?.version !== "1.4.0" ? "nonimmersive" : rawMode);

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
                读取你选中的 USER 人设、嘉宾人设，以及角色与你之间已经存在的记忆库。
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
                非沉浸式
              </div>

              <div class="xd-setting-desc">
                只读取人设，不读取角色与你过去发生过的记忆。
              </div>

            </div>

            <button
              class="
                xd-switch
                ${mode === "nonimmersive" ? "on" : ""}
              "
              data-mode="nonimmersive"
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

        <div class="xd-phone-placeholder" style="margin-top:12px;">
          <div style="font-size:11px;font-weight:800;color:#65575a;">本季记忆读取状态</div>
          <div style="margin-top:5px;">${mode === "immersive" ? (archive?.memoryReadout?.readAt ? `已读取 ${archive.memoryReadout.charactersWithMemory || 0} 位角色的记忆，共 ${archive.memoryReadout.memoryCount || 0} 条。` : "沉浸式记忆尚未读取。进入本季后会读取角色与你之间的记忆库。") : "非沉浸式不会读取角色与你之间的记忆库。"}</div>
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

    } else if (state.page === "phone-weibo") {

      html = renderWeibo();

    } else if (state.page === "phone-sms") {

      html = renderPhoneSMS();

    } else if (state.page === "phone-notes") {

      html = renderPhoneNotes();

    } else if (state.page === "phone-album") {

      html = renderPhoneAlbum();

    } else if (state.page === "phone-dynamics") {

      html = renderPhoneDynamics();

    } else if (state.page === "phone-calendar") {

      html = renderPhonePlaceholder("日历","◫","以后可以记录录制日程、节目安排和特殊日期。");

    } else if (state.page === "phone-map") {

      html = renderPhonePlaceholder("地图","⌖","以后可以记录小屋地图、拍摄地点和节目外出地点。");

    } else if (state.page === "phone-edit") {

      html = renderPhonePlaceholder("节目剪辑","✦","以后可以收集节目组剪出来的高光片段。");

    } else if (state.page === "phone-achievements") {

      html = renderPhonePlaceholder("成就","◇","以后可以记录你在本季恋综里解锁的经历。");

    } else if (state.page === "phone-music") {

      html = renderPhonePlaceholder("音乐","♫","以后可以保存节目里的 BGM 和你的本季歌单。");

    } else if (state.page === "worldbooks") {

      html = renderWorldbooks();

    } else if (state.page === "observe") {

      html = renderObserve();

    } else if (state.page === "char-phone") {

      html = state.detailCharacter ? renderCharacterPhone(state.detailCharacter) : renderGuests();

    } else if (state.page === "char-phone-weibo") {

      html = renderCharacterPhoneSub("微博", "CHAR WEIBO", renderCharacterWeibo(state.detailCharacter));

    } else if (state.page === "char-phone-sms") {

      html = renderCharacterPhoneSub("短信", "CHAR SMS", renderCharacterSMS(state.detailCharacter));

    } else if (state.page === "char-phone-dynamics") {

      html = renderCharacterPhoneSub("动态", "CHAR MOMENTS", renderCharacterDynamics(state.detailCharacter));

    } else if (state.page === "char-phone-diary") {

      html = renderCharacterPhoneSub("日记", "CHAR DIARY", renderCharacterDiary(state.detailCharacter));

    } else if (state.page === "char-phone-achievements") {

      html = renderCharacterPhoneSub("成就", "CHAR ACHIEVEMENTS", renderCharacterAchievements(state.detailCharacter));

    } else if (state.page === "char-phone-notes") {

      html = renderCharacterPhoneSub("备忘录", "CHAR NOTES", renderCharacterNotes(state.detailCharacter));

    } else if (state.page === "char-phone-private") {

      html = renderCharacterPhoneSub("私信", "CHAR PRIVATE", renderCharacterPrivate(state.detailCharacter));

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
          : state.activeTab === "phone"
          ? renderPhone()
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

    shell.querySelectorAll("[data-tab]").forEach(button => {
      listen(button, "click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const tab = button.dataset.tab;
        if (!tab) return;
        state.activeTab = tab;
        state.page = "tab";
        state.stack = [];
        renderPage();
      }, true);
    });

    listen(shell, "click", (event) => {
      const button = event.target.closest?.("[data-tab]");
      if (!button || !shell.contains(button)) return;
      event.preventDefault();
      event.stopPropagation();
      const tab = button.dataset.tab;
      if (!tab) return;
      state.activeTab = tab;
      state.page = "tab";
      renderPage();
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

    /* 嘉宾手机 */
    listen(root.querySelector("[data-open-char-phone]"), "click", () => {
      if (!state.detailCharacter) return;
      state.page = "char-phone";
      renderPage();
    });

    root.querySelectorAll("[data-char-phone-app]").forEach(button => {
      listen(button, "click", () => {
        state.page = `char-phone-${button.dataset.charPhoneApp}`;
        renderPage();
      });
    });

    root.querySelectorAll("[data-back-char-phone]").forEach(button => {
      listen(button, "click", () => {
        state.page = "char-phone";
        renderPage();
      });
    });

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
              "show";

            state.page =
              "observe";

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

    listen(root.querySelector("[data-end-night]"), "click", async () => {
      if (!state.currentArchive || state.generating) return;
      const archive = state.currentArchive;
      state.generating = true;
      showGenerating("正在结束今晚……", "正在保存今晚发生的事情并整理手机动态");
      try {
        archive.stage = "dayEnd";
        archive.currentSceneLabel = `DAY ${archive.currentDay || 1} · 今日录制结束`;
        archive.events = archive.events || [];
        archive.events.push({type:"night-end", day:archive.currentDay || 1, createdAt:Date.now()});
        archive.ai = archive.ai || {};
        archive.ai.nightPlays = null;
        await saveCurrentArchive();
        state.generating=false; hideGenerating(); renderPage();
      } catch { state.generating=false; hideGenerating(); toast("暂时无法结束今晚"); }
    });

    listen(root.querySelector("[data-house-custom]"), "click", async () => {
      const text = window.prompt("今晚你想在心动小屋发生什么？");
      if (!text?.trim() || !state.currentArchive || state.generating) return;
      const archive = state.currentArchive;
      state.generating = true;
      showGenerating("正在回应你的想法……", "AI会根据当前世界书、人设和关系判断这个事件");
      try {
        const result = await generateAIEvent(archive, `心动小屋自定义事件：${text.trim()}`);
        archive.lastNarrative=result; archive.events=archive.events||[]; archive.events.push({type:"house-custom", day:archive.currentDay||1, text:result, createdAt:Date.now(), ai:true});
        await saveCurrentArchive(); state.generating=false; hideGenerating(); renderPage();
      } catch { state.generating=false; hideGenerating(); toast("AI 暂时没有回应，请稍后再试"); }
    });

    listen(root.querySelector("[data-generate-night]"), "click", async () => {
      if (!state.currentArchive || state.generating) return;
      state.generating=true; showGenerating("正在生成今晚玩法……", "世界书正在决定今晚会发生什么");
      try { state.currentArchive.ai=state.currentArchive.ai||{}; state.currentArchive.ai.nightPlays=await generateAINightPlayPool(state.currentArchive); await saveCurrentArchive(); state.generating=false; hideGenerating(); renderPage(); }
      catch { state.generating=false; hideGenerating(); toast("AI 暂时没有回应，请稍后再试"); }
    });
    root.querySelectorAll("[data-night-play]").forEach(button=>listen(button,"click",async()=>{ const p=state.currentArchive?.ai?.nightPlays?.[Number(button.dataset.nightPlay)]; if(!p||state.generating)return; openPlay("custom-night"); }));

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

    /* V2：弹幕开关 */
    listen(root.querySelector("[data-danmu-toggle]"), "click", async () => {
      if (!state.currentArchive) return;
      state.currentArchive.danmuEnabled = state.currentArchive.danmuEnabled === false;
      await saveCurrentArchive();
      renderPage();
    });

    /* V2.0.1：节目流程 / 防重复生成 */
    listen(root.querySelector("[data-start-show]"), "click", async () => {
      if (!state.currentArchive || state.generating) return;
      const archive = state.currentArchive;
      state.generating = true;
      try {
        if (archive.stage === "intro") {
          if (!archive.ai?.introCards) {
            showGenerating("正在开启 DAY 01……", "正在读取本季嘉宾、人设与角色记忆，准备主持人和逐位入场");
            archive.ai = archive.ai || {};
            archive.ai.introCards = await generateAIIntroCards(archive);
            archive.ai.introIndex = 0;
            archive.currentSceneLabel = "节目现场 · 主持人开场";
            archive.events = archive.events || [];
            archive.events.push({type:"opening", day:archive.currentDay || 1, createdAt:Date.now(), ai:true});
            archive.danmu = await generateAIDanmu(archive, "主持人欢迎与嘉宾即将入场");
          } else {
            archive.ai.introIndex = (archive.ai.introIndex || 0) + 1;
          }
        } else if (archive.stage === "task") {
          showGenerating("比赛正在进行……", "正在让每位嘉宾根据人设完成自己的挑战，并生成观众反应");
          const event = await generateAIEvent(archive, "第一天心动争夺战：每位嘉宾独自完成一项最符合自己人设的特长挑战（如画画、厨艺、唱歌等），展示后由观众投票决定谁获得与USER单独约会的机会");
          archive.ai = archive.ai || {};
          archive.ai.lastEvent = event;
          archive.lastNarrative = event;
          archive.currentSceneLabel = "节目现场 · 心动争夺战";
          archive.events = archive.events || [];
          archive.events.push({type:"task", day:archive.currentDay || 1, title:"心动争夺战", text:event, createdAt:Date.now(), ai:true});
          archive.danmu = await generateAIDanmu(archive, "心动争夺战比赛现场");
          const chars = archive.characters || [];
          const results = chars.map((c,i) => ({name:c.name, score:Math.max(1, Math.round(55 + Math.random()*35 + (chars.length-i)*2))}));
          const total = results.reduce((a,b)=>a+b.score,0) || 1;
          results.forEach(r => r.score = Math.round(r.score / total * 100));
          const winner = results.slice().sort((a,b)=>b.score-a.score)[0]?.name || chars[0]?.name || "嘉宾";
          archive.vote = {title:"第一天心动争夺战", results, winner, createdAt:Date.now()};
          archive.stage = "vote";
          archive.events.push({type:"vote-ready", day:archive.currentDay || 1, winner, createdAt:Date.now()});
        } else if (archive.stage === "vote") {
          showGenerating("正在准备心动约会……", "由获胜嘉宾根据自己的人设决定地点与安排");
          archive.ai = archive.ai || {};
          archive.ai.datePlan = await generateAIDatePlan(archive);
          archive.ai.dateScene = null;
          archive.ai.datePhase = 0;
          archive.stage = "date";
          archive.currentSceneLabel = "节目现场 · 心动约会";
          archive.danmu = await generateAIDanmu(archive, "约会资格公布");
        } else if (archive.stage === "date") {
          showGenerating("正在展开约会……", "正在生成你们这一刻真正发生的事情");
          archive.ai = archive.ai || {};
          const plan = archive.ai.datePlan || {};
          const phase = (archive.ai.datePhase || 0) + 1;
          const scene = await generateAIDateScene(archive, plan, phase === 1 ? "约会刚开始" : "约会进行中");
          archive.ai.dateScene = scene;
          archive.ai.datePhase = phase;
          archive.lastNarrative = scene.scene || "";
          archive.currentSceneLabel = `约会现场 · ${plan.place || "约会"}`;
          archive.events = archive.events || [];
          archive.events.push({type:"date-scene", day:archive.currentDay || 1, winner:archive.vote?.winner, place:plan.place, activity:plan.activity, text:scene.scene, createdAt:Date.now(), ai:true});
          archive.danmu = await generateAIDanmu(archive, scene.danmuTopic || "心动约会");
          if (phase >= 2) archive.stage = "free";
        } else if (archive.stage === "free") {
          state.activeTab = "show";
          state.page = "house";
          archive.currentSceneLabel = "心动小屋 · 夜间自由活动";
        } else if (archive.stage === "dayEnd") {
          archive.currentDay = (archive.currentDay || 1) + 1;
          archive.stage = "task";
          archive.vote = null;
          archive.ai = {...(archive.ai || {}), introCards:null, introIndex:0, lastEvent:""};
          archive.currentSceneLabel = `节目现场 · DAY ${archive.currentDay} 新任务`;
          archive.danmu = await generateAIDanmu(archive, `DAY ${archive.currentDay} 新节目开始`);
        }
        await saveCurrentArchive();
        state.generating = false;
        hideGenerating();
        renderPage();
      } catch (error) {
        console.error("[心动现场] program flow", error);
        state.generating = false;
        hideGenerating();
        toast("AI 暂时没有回应，请稍后再试");
      }
    });

    root.querySelectorAll("[data-intro-next]").forEach(button => {
      listen(button, "click", async () => {
        if (!state.currentArchive || state.generating) return;
        const archive = state.currentArchive;
        if (!archive.ai?.introCards) return;
        state.generating = true;
        try {
          if ((archive.ai.introIndex || 0) === 1) {
            const input = root.querySelector("[data-user-intro]");
            const value = input?.value?.trim() || "";
            if (!value) { toast("先写下你的自我介绍吧"); state.generating = false; return; }
            archive.ai.userIntro = value;
            archive.userIntro = value;
          }
          button.disabled = true;
          button.classList.add("is-loading");
          const originalText = button.textContent;
          button.innerHTML = `<span class="xd-inline-spinner"></span>${esc(originalText || "下一步")}`;
          archive.ai.introIndex = (archive.ai.introIndex || 0) + 1;
          const total = (archive.ai.introCards.guests || []).length + 1;
          if (archive.ai.introIndex >= total + 1) {
            archive.stage = "task";
            archive.currentSceneLabel = "节目现场 · 第一日任务";
            archive.events = archive.events || [];
            archive.events.push({type:"intro-complete", day:archive.currentDay || 1, createdAt:Date.now()});
          } else {
            archive.currentSceneLabel = archive.ai.introIndex === 1 ? "节目现场 · USER自我介绍" : `节目现场 · 嘉宾${archive.ai.introIndex - 1}入场`;
          }
          archive.danmu = await generateAIDanmu(archive, archive.currentSceneLabel);
          await saveCurrentArchive();
          state.generating = false;
          hideGenerating();
          renderPage();
        } catch (error) {
          state.generating = false;
          hideGenerating();
          toast("AI 暂时没有回应，请稍后再试");
        }
      });
    });

    root.querySelectorAll("[data-date-action]").forEach(button => {
      listen(button, "click", async () => {
        if (!state.currentArchive || state.generating) return;
        const archive = state.currentArchive;
        const scene = archive.ai?.dateScene;
        const option = scene?.options?.[Number(button.dataset.dateAction)];
        if (!option) return;
        state.generating = true;
        button.disabled = true;
        button.classList.add("is-loading");
        showGenerating("正在回应你的选择……", "约会会根据你的回应继续变化");
        try {
          const result = await generateAIEvent(archive, `约会中USER选择：${option.label}；具体行动：${option.text}`);
          archive.lastNarrative = result;
          archive.events = archive.events || [];
          archive.events.push({type:"date-choice", day:archive.currentDay || 1, option:option.label, text:result, createdAt:Date.now(), ai:true});
          archive.ai.dateScene = {scene:result, options:[], danmuTopic:"约会现场回应"};
          await saveCurrentArchive();
          state.generating = false; hideGenerating(); renderPage();
        } catch { state.generating=false; hideGenerating(); toast("AI 暂时没有回应，请稍后再试"); }
      });
    });

    listen(root.querySelector("[data-start-date-stage]"), "click", async () => {
      if (!state.currentArchive || state.generating) return;
      const archive = state.currentArchive;
      state.generating = true;
      showGenerating("正在进入约会……", "请稍候，节目镜头正在切换");
      try {
        archive.ai = archive.ai || {};
        const plan = archive.ai.datePlan || {};
        const scene = await generateAIDateScene(archive, plan, "约会刚开始");
        archive.ai.dateScene = scene;
        archive.ai.datePhase = 1;
        archive.events = archive.events || [];
        archive.events.push({type:"date-start", day:archive.currentDay || 1, winner:archive.vote?.winner, plan, text:scene.scene, createdAt:Date.now(), ai:true});
        archive.lastNarrative = scene.scene || "";
        await saveCurrentArchive();
        state.generating=false; hideGenerating(); renderPage();
      } catch { state.generating=false; hideGenerating(); toast("AI 暂时没有回应，请稍后再试"); }
    });


    /* V2.0.1：AI 随机事件只从心动小屋地点进入。 */
    /* 微博分类 */
    root
      .querySelectorAll("[data-weibo-category]")
      .forEach(button => {
        listen(button, "click", () => {
          state.weiboCategory = button.dataset.weiboCategory || "全部";
          renderPage();
        });
      });

    listen(root.querySelector("[data-generate-weibo-category]"), "click", async () => {
      if (!state.currentArchive || state.generating) return;
      const category = state.weiboCategory || "节目报道";
      state.generating=true; showGenerating("正在生成微博内容……", `正在生成“${category}”`);
      try {
        state.currentArchive.phone=state.currentArchive.phone||{};
        state.currentArchive.ai=state.currentArchive.ai||{};
        const generated=await generateAIWeiboCategory(state.currentArchive, category);
        if (category === "同人文") state.currentArchive.ai.fanficCards=generated;
        else { const old=state.currentArchive.phone.weibo||[]; state.currentArchive.phone.weibo=[...old,...generated]; }
        await saveCurrentArchive(); state.generating=false; hideGenerating(); renderPage();
      } catch { state.generating=false; hideGenerating(); toast("AI 暂时没有回应，请稍后再试"); }
    });

    root.querySelectorAll("[data-generate-fanfic]").forEach(button => {
      listen(button, "click", () => {
        if (!state.currentArchive || state.generating) return;
        openFanficSettings();
      });
    });

    function openFanficSettings() {
      const genres = ["青春校园","古代架空","ABO","娱乐圈","豪门","职场","赛博都市","奇幻魔法","民国","悬疑推理","无限流","末世校园","神话传说","末日求生","都市治愈","仙侠","轻喜剧","惊悚悬疑"];
      const chars = state.characters || [];
      const root = state.container.querySelector(".roche-plugin-xindong-xianchang");
      const modal = document.createElement("div");
      modal.className = "xd-modal-wrap";
      modal.innerHTML = `
        <section class="xd-modal xd-fanfic-settings">
          <div class="xd-modal-handle"></div>
          <div class="xd-kicker">AI FANFIC LAB</div>
          <div class="xd-modal-title" style="margin-top:4px;">选择你的故事设定</div>
          <div class="xd-setting-label">世界类型</div>
          <div class="xd-chip-grid">${genres.map(g=>`<button class="xd-setting-chip ${state.fanficDraft.genres.includes(g) ? "active":""}" data-fanfic-genre="${esc(g)}">${esc(g)}</button>`).join("")}</div>
          <div style="margin-top:12px;font-size:10px;font-weight:800;">是否关联恋综经历</div>
          <button class="xd-setting-chip ${state.fanficDraft.linkReality !== false ? "active":""}" data-fanfic-link style="margin-top:7px;">${state.fanficDraft.linkReality !== false ? "☑ 关联本季经历" : "☐ 不关联本季经历"}</button>
          <div style="margin-top:12px;font-size:10px;font-weight:800;">选择世界书（可不选）</div>
          <div class="xd-chip-grid">${[...(state.rocheWorldbooks||[]),...(state.customWorldbooks||[])].map(w=>{const id=String(w.id); return `<button class="xd-setting-chip ${state.fanficDraft.worldbookIds?.map(String).includes(id) ? "active":""}" data-fanfic-wb="${esc(id)}">${esc(w.name)}</button>`}).join("")}</div>
          <div class="xd-setting-label">参与角色（可多选）</div>
          <div class="xd-chip-grid">${chars.map(c=>`<button class="xd-setting-chip ${state.fanficDraft.characterIds.includes(c.characterId || c.id) ? "active":""}" data-fanfic-char="${esc(c.characterId || c.id)}">${esc(c.name)}</button>`).join("")}</div>
          <div class="xd-setting-fixed">☑ 是否关联本季恋综经历：已关联</div>
          <div class="xd-modal-actions"><button class="xd-small-btn" data-close-fanfic-settings>取消</button><button class="xd-primary" style="margin-top:0;" data-confirm-fanfic-settings>生成4-5个选题</button></div>
        </section>`;
      root.appendChild(modal);
      modal.querySelectorAll("[data-fanfic-genre]").forEach(btn=>listen(btn,"click",()=>{
        const g=btn.dataset.fanficGenre;
        if (state.fanficDraft.genres.includes(g)) {
          if (state.fanficDraft.genres.length > 1) state.fanficDraft.genres = state.fanficDraft.genres.filter(x=>x!==g);
        } else state.fanficDraft.genres.push(g);
        btn.classList.toggle("active", state.fanficDraft.genres.includes(g));
      }));
      listen(modal.querySelector("[data-fanfic-link]"), "click", () => { state.fanficDraft.linkReality = state.fanficDraft.linkReality === false; modal.querySelector("[data-fanfic-link]").classList.toggle("active", state.fanficDraft.linkReality); modal.querySelector("[data-fanfic-link]").textContent = state.fanficDraft.linkReality ? "☑ 关联本季经历" : "☐ 不关联本季经历"; });
      modal.querySelectorAll("[data-fanfic-wb]").forEach(btn=>listen(btn,"click",()=>{ const id=btn.dataset.fanficWb; const ids=state.fanficDraft.worldbookIds||[]; state.fanficDraft.worldbookIds=ids.map(String).includes(String(id)) ? ids.filter(x=>String(x)!==String(id)) : [...ids,id]; btn.classList.toggle("active", state.fanficDraft.worldbookIds.map(String).includes(String(id))); }));
      modal.querySelectorAll("[data-fanfic-char]").forEach(btn=>listen(btn,"click",()=>{
        const id=btn.dataset.fanficChar;
        if (state.fanficDraft.characterIds.includes(id)) state.fanficDraft.characterIds=state.fanficDraft.characterIds.filter(x=>x!==id);
        else state.fanficDraft.characterIds.push(id);
        btn.classList.toggle("active", state.fanficDraft.characterIds.includes(id));
      }));
      listen(modal.querySelector("[data-close-fanfic-settings]"),"click",()=>modal.remove());
      listen(modal.querySelector("[data-confirm-fanfic-settings]"),"click",async()=>{
        if (!state.fanficDraft.characterIds.length) state.fanficDraft.characterIds = chars.map(c=>c.characterId || c.id);
        modal.remove();
        if (!state.currentArchive || state.generating) return;
        state.generating = true;
        showGenerating("正在生成同人选题……","正在按照你选择的世界设定、角色和本季经历生成4–5个故事");
        try {
          state.currentArchive.ai = state.currentArchive.ai || {};
          state.currentArchive.ai.fanficCards = await generateAIFanficTitles(state.currentArchive, state.fanficDraft);
          await saveCurrentArchive();
          state.generating = false;
          hideGenerating();
          renderPage();
        } catch(error) {
          state.generating = false;
          hideGenerating();
          console.error("[心动现场] fanfic", error);
          toast("AI 暂时没有回应，请稍后再试");
        }
      });
      listen(modal,"click",e=>{if(e.target===modal)modal.remove();});
    }

    root.querySelectorAll("[data-fanfic-index]").forEach(button => {
      listen(button, "click", async () => {
        const card = state.currentArchive?.ai?.fanficCards?.[Number(button.dataset.fanficIndex)];
        if (!card) return;
        try {
          toast("AI 正在生成完整同人文……");
          const full = await generateAIFanficFull(state.currentArchive, card);
          state.currentArchive.ai = state.currentArchive.ai || {};
          state.currentArchive.ai.fanficReading = state.currentArchive.ai.fanficReading || [];
          const record = {...card, full, readAt:Date.now()};
          const existingIndex = state.currentArchive.ai.fanficReading.findIndex(x => x.title === card.title);
          if (existingIndex >= 0) state.currentArchive.ai.fanficReading[existingIndex] = record; else state.currentArchive.ai.fanficReading.push(record);
          await saveCurrentArchive();
          const modal = document.createElement("div");
          modal.className = "xd-modal-wrap";
          modal.innerHTML = `<section class="xd-modal"><div class="xd-modal-handle"></div><div class="xd-kicker">AI FANFIC</div><div class="xd-modal-title" style="margin-top:4px;">${esc(card.title)}</div><div style="margin-top:6px;font-size:9px;color:#a97983;">${esc(card.tags)}</div><div style="margin-top:14px;font-size:12px;line-height:1.9;color:#514649;white-space:pre-wrap;">${esc(full)}</div><div class="xd-modal-actions"><button class="xd-primary" style="margin-top:0;" data-close-fanfic>关闭</button></div></section>`;
          state.container.querySelector(".roche-plugin-xindong-xianchang").appendChild(modal);
          listen(modal.querySelector("[data-close-fanfic]"), "click", () => modal.remove());
          listen(modal, "click", e => { if (e.target === modal) modal.remove(); });
        } catch (error) {
          console.error("[心动现场] fanfic full", error);
          toast("AI 暂时没有回应，请稍后再试");
        }
      });
    });

    /* User 手机短信联系人 */
    root.querySelectorAll("[data-sms-char]").forEach(card => {
      listen(card, "click", () => {
        const id = card.dataset.smsChar;
        const char = (state.characters || []).find(c => String(c.characterId || c.id) === String(id));
        if (!char) return;
        state.chatCharacter = char;
        state.page = "chat";
        renderPage();
      });
    });

    /* 手机应用 */
    root
      .querySelectorAll("[data-phone-app]")
      .forEach(button => {
        listen(button, "click", () => {
          state.page = `phone-${button.dataset.phoneApp}`;
          renderPage();
        });
      });

    root
      .querySelectorAll("[data-back-phone]")
      .forEach(button => {
        listen(button, "click", () => {
          state.page = "tab";
          state.activeTab = "phone";
          renderPage();
        });
      });

    /* 世界书入口 */
    root
      .querySelectorAll("[data-open-worldbooks]")
      .forEach(button => {
        listen(button, "click", () => {
          state.page = "worldbooks";
          renderPage();
        });
      });

    root
      .querySelectorAll("[data-new-worldbook]")
      .forEach(button => {
        listen(button, "click", openCreateWorldbook);
      });

    root
      .querySelectorAll("[data-delete-worldbook]")
      .forEach(button => {
        listen(button, "click", async () => {
          const id = button.dataset.deleteWorldbook;
          state.customWorldbooks = state.customWorldbooks.filter(w => w.id !== id);
          await storageSet("customWorldbooks", state.customWorldbooks);
          renderPage();
          toast("世界书已删除");
        });
      });

    /* 房子 / 观察室仍然只从节目页进入 */

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

            const nextMode = button.dataset.mode === "memory" ? "immersive" : button.dataset.mode;
            state.currentArchive.participationMode = nextMode;
            if (nextMode === "immersive" && !state.currentArchive.memoryReadout?.readAt) {
              const readout = await buildMemorySnapshots(state.currentArchive);
              state.currentArchive.memoryReadout = { ...(state.currentArchive.memoryReadout || {}), readAt:Date.now(), characterCount:state.currentArchive.characters?.length || 0, charactersWithMemory:readout.characters, memoryCount:readout.total };
            }
            await saveCurrentArchive();
            renderPage();
            toast(nextMode === "immersive" ? "已切换为沉浸式，并读取角色与你之间的记忆库" : "已切换为非沉浸式");

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

  async function openRoom(room) {
    if (!state.currentArchive || state.generating) return;
    const names = { kitchen:"厨房", living:"客厅", bath:"卫生间", bedroom:"卧室", garden:"花园" };
    const archive = state.currentArchive;
    state.generating = true;
    showGenerating(`正在观察${names[room] || "这个地点"}……`, "正在根据人设、关系、记忆和最近剧情生成随机事件");
    try {
      const event = await generateAIHouseEvent(archive, room);
      state.generating = false;
      hideGenerating();
      const modal = document.createElement("div");
      modal.className = "xd-modal-wrap";
      modal.innerHTML = `
        <section class="xd-modal xd-house-event-modal">
          <div class="xd-modal-handle"></div>
          <div class="xd-kicker">${esc(names[room] || "HOUSE EVENT")} · RANDOM EVENT</div>
          <div class="xd-modal-title" style="margin-top:4px;">${esc(event.title || "小屋里的意外")}</div>
          <div class="xd-house-event-scene">${esc(event.scene || "")}</div>
          <div class="xd-house-event-options">
            ${(event.options || []).slice(0,3).map((o,i)=>`<button class="xd-house-option" data-house-option="${i}"><span>${["A","B","C"][i]}</span><div><b>${esc(o.label || "做出选择")}</b><small>${esc(o.text || "")}</small></div></button>`).join("")}
          </div>
        </section>`;
      state.container.querySelector(".roche-plugin-xindong-xianchang").appendChild(modal);
      const options = (event.options || []).slice(0,3);
      modal.querySelectorAll("[data-house-option]").forEach(button => {
        listen(button, "click", async () => {
          if (state.generating) return;
          const option = options[Number(button.dataset.houseOption)];
          if (!option) return;
          state.generating = true;
          showGenerating("正在生成选择结果……", "这个选择会影响今晚的关系与角色记忆");
          try {
            const result = await generateAIHouseOutcome(archive, event, option);
            archive.lastNarrative = result;
            archive.lastQuote = option.label || "";
            archive.currentSceneLabel = `心动小屋 · ${names[room] || "地点"}`;
            archive.events = archive.events || [];
            archive.events.push({type:"house", day:archive.currentDay || 1, room, title:event.title, option:option.label, text:result, createdAt:Date.now(), ai:true});
            archive.ai = archive.ai || {};
            archive.ai.lastEvent = result;
            archive.danmu = await generateAIDanmu(archive, `心动小屋 · ${names[room] || "地点"} · ${option.label}`);
            await saveCurrentArchive();
            modal.remove();
            state.generating = false;
            hideGenerating();
            renderPage();
          } catch (error) {
            console.error("[心动现场] house outcome", error);
            state.generating = false;
            hideGenerating();
            toast("AI 暂时没有回应，请稍后再试");
          }
        });
      });
      listen(modal, "click", e => { if (e.target === modal) modal.remove(); });
    } catch (error) {
      console.error("[心动现场] house event", error);
      state.generating = false;
      hideGenerating();
      toast("AI 暂时没有回应，请稍后再试");
    }
  }

  function showGenerating(title, sub) {
    const root = state.container?.querySelector(".roche-plugin-xindong-xianchang");
    if (!root) return;
    let overlay = root.querySelector("[data-generating-overlay]");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "xd-generating-overlay";
      overlay.setAttribute("data-generating-overlay", "1");
      root.appendChild(overlay);
    }
    overlay.innerHTML = `<div class="xd-generating-card"><div class="xd-generating-orbit"><i></i><i></i><i></i></div><div class="xd-generating-title">${esc(title || "正在生成")}</div><div class="xd-generating-sub">${esc(sub || "请稍候")}</div><div class="xd-generating-dots"><span></span><span></span><span></span></div></div>`;
  }

  function hideGenerating() {
    const overlay = state.container?.querySelector("[data-generating-overlay]");
    if (overlay) overlay.remove();
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
        button:"进入厨房",
        room:"kitchen"
      },

      message: {
        icon:"💌",
        title:"匿名短信夜",
        text:
          "手机突然震动了一下。没有备注，没有名字，只有一条刚刚收到的匿名短信。",
        button:"查看短信",
        room:"phone"
      },

      "custom-night": {
        icon:"✦",
        title:"今晚的随机事件",
        text:"今晚的玩法已经根据当前世界书、人设与关系生成。进入小屋后选择地点，或者直接触发这个夜间事件。",
        button:"进入心动小屋",
        room:"living"
      },

      gift: {
        icon:"🎁",
        title:"心动礼物",
        text:
          "节目组把一个包装精致的小盒子放在了你的房间门口。卡片上没有写名字。",
        button:"拆开看看",
        room:"bedroom"
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
          room:item.room || "living",
          createdAt:Date.now()
        });

        state.currentArchive.activeGameplay = {
          type,
          title:item.title,
          room:item.room || "living",
          startedAt:Date.now()
        };

        if (item.room === "phone") {
          state.activeTab = "phone";
          state.page = "tab";
        } else {
          state.currentArchive.currentSceneLabel = item.room === "kitchen" ? "心动小屋 · 厨房" : item.room === "bedroom" ? "心动小屋 · 卧室" : "心动小屋 · 客厅";
          state.page = "house";
        }

        await saveCurrentArchive();
        renderPage();

        toast(item.title + "已开始");

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

    const personaCandidates = (state.userPersonas.length ? state.userPersonas : [state.user]).filter(Boolean);
    let selectedUserPersonaId = String(personaCandidates[0]?.id || personaCandidates[0]?.personaId || "");

    const selectedWorldbooks =
      new Set(
        [...state.rocheWorldbooks, ...state.customWorldbooks]
          .filter(wb => wb.defaultSelected)
          .map(wb => String(wb.id))
      );

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
            选择参与本季的我的人设
          </label>
          <div style="font-size:10px;color:#8e8183;line-height:1.6;">Roche 里有多个人设时，只把你选中的这一份带入本季。</div>
          <div class="xd-selector-list">
            ${personaCandidates.map((persona, index) => `
              <button class="xd-selector ${index === 0 ? "selected" : ""}" data-user-persona-select="${esc(persona.id || persona.personaId || index)}">
                ${avatarHTML(persona)}
                <div style="min-width:0;flex:1;text-align:left;"><div style="font-size:12px;font-weight:780;">${esc(nameOf(persona))}</div><div style="margin-top:3px;font-size:9px;color:#a97983;">${esc(handleOf(persona) || "USER PERSONA")}</div></div>
                <div class="xd-check">✓</div>
              </button>`).join("")}
          </div>
        </div>

        <div class="xd-field">

          <label>
            选择本季世界书
          </label>

          <div style="font-size:10px;color:#8e8183;line-height:1.6;">
            可以同时勾选 Roche 世界书与「心动现场」自建世界书。开始这一季后会保存本次快照，不影响其他恋综。
          </div>

          <div class="xd-selector-list" style="max-height:220px;">
            ${
              [...state.rocheWorldbooks, ...state.customWorldbooks].length
                ? [...state.rocheWorldbooks, ...state.customWorldbooks].map(wb => `
                    <button class="xd-selector ${wb.defaultSelected ? "selected" : ""}" data-worldbook-select="${esc(wb.id)}">
                      <div style="width:34px;height:34px;border-radius:11px;background:#f1e2e4;display:grid;place-items:center;flex:0 0 34px;">📖</div>
                      <div style="min-width:0;flex:1;">
                        <div style="font-size:12px;font-weight:780;">${esc(wb.name)}</div>
                        <div style="margin-top:3px;font-size:9px;color:#a97983;">${esc(wb.sourceLabel || "自建世界书")}</div>
                      </div>
                      <div class="xd-check">✓</div>
                    </button>
                  `).join("")
                : `<div class="xd-empty" style="padding:18px 10px;">还没有可用世界书。你可以先去「档案 → 世界书库」创建。</div>`
            }
          </div>
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
                  人设 + 角色与你的记忆库
                </div>

              </div>

              <div class="xd-check">
                ✓
              </div>

            </button>

            <button
              class="xd-selector"
              data-create-mode="nonimmersive"
            >

              <div style="flex:1;">

                <div
                  style="
                    font-size:12px;
                    font-weight:780;
                  "
                >
                  非沉浸式
                </div>

                <div
                  style="
                    margin-top:3px;
                    font-size:9px;
                    color:#8e8183;
                  "
                >
                  人设 + 角色与你之间的记忆库，不读取过去记忆
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

    /* USER 人设选择 */
    modal.querySelectorAll("[data-user-persona-select]").forEach(button => {
      listen(button, "click", () => {
        selectedUserPersonaId = String(button.dataset.userPersonaSelect);
        modal.querySelectorAll("[data-user-persona-select]").forEach(item => item.classList.toggle("selected", item.dataset.userPersonaSelect === selectedUserPersonaId));
      });
    });

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

    /* 世界书选择 */
    modal
      .querySelectorAll("[data-worldbook-select]")
      .forEach(button => {
        listen(button, "click", () => {
          const id = String(button.dataset.worldbookSelect);
          if (selectedWorldbooks.has(id)) {
            selectedWorldbooks.delete(id);
            button.classList.remove("selected");
          } else {
            selectedWorldbooks.add(id);
            button.classList.add("selected");
          }
        });
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

          version:"2.0.2",

          title,

          createdAt:Date.now(),

          lastSavedAt:Date.now(),

          participationMode:
            createMode,

          userPersona: (() => {
            const chosen = personaCandidates.find(p => String(p.id || p.personaId || "") === selectedUserPersonaId) || personaCandidates[0] || state.user || {};
            return {
              personaId: chosen.id || chosen.personaId || uid(),
              name: chosen.name || chosen.handle || "",
              handle: chosen.handle || "",
              avatar: chosen.avatar || "",
              personaSnapshot: chosen.persona || chosen.bio || ""
            };
          })(),

          characters:picked,

          worldbooks:
            [...state.rocheWorldbooks, ...state.customWorldbooks]
              .filter(wb => selectedWorldbooks.has(String(wb.id)))
              .map(wb => ({
                id: wb.id,
                name: wb.name,
                source: wb.source || "custom",
                sourceLabel: wb.sourceLabel || "自建世界书",
                description: wb.description || "",
                content: wb.content || "",
                snapshotAt: Date.now()
              })),

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

          phone:{
            weibo:[
              {
                author:"心动现场官方",
                text:`《${title}》正式开机。网友已经开始猜测，本季谁会成为最受关注的嘉宾。`,
                time:"刚刚",
                meta:"官方账号 · 热门",
                category:"节目报道"
              },
              {
                author:"吃瓜群众",
                text:"这一季的嘉宾阵容看起来很有故事，先蹲一个后续。",
                time:"今天",
                meta:"评论 128 · 转发 46",
                category:"网友讨论"
              }
            ],
            sms:[
              {from:"未知号码", text:"你觉得今晚谁会先主动？", time:"20:36"}
            ],
            notes:[
              {title:"本季规则", text:"世界书、人设与恋综档案彼此独立。", time:"今天"}
            ],
            dynamics:[
              {author:"节目导演", text:"今天的镜头安排临时调整了一下，某个瞬间可能会被留下。", time:"刚刚", meta:"节目组动态"},
              {author:"心动现场制片人", text:"晚餐之后还有一个小环节，先不剧透。", time:"今天", meta:"制作组动态"}
            ]
          },

          events:[],

          characterPhones: {},

          lastNarrative:"",

          lastQuote:"",

          lastSummary:
            "新的恋综世界刚刚开机。",

          memorySnapshots:{},
          memoryReadout:{
            readAt:0,
            characterCount:0,
            charactersWithMemory:0,
            memoryCount:0
          },

          stage:"intro",
          danmuEnabled:true,
          danmu:[],
          vote:null,
          ai:{
            opening:"",
            lastEvent:"",
            fanficCards:[]
          }

        };

        /*
         * 给每个嘉宾建立独立关系档案。
         */

        picked.forEach(char => {

          archive.characterPhones[char.characterId] = {
            sms: [], privateMessages: [], dynamics: [], diary: [], achievements: [], notes: [], weibo: [],
            status: "节目还没开始，这部手机正在等待第一天的故事。"
          };

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

        if (archive.participationMode === "immersive") {
          const readout = await buildMemorySnapshots(archive);
          archive.memoryReadout = { ...(archive.memoryReadout || {}), readAt:Date.now(), characterCount:archive.characters.length, charactersWithMemory:readout.characters, memoryCount:readout.total };
        }

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

  async function loadUserPersonas(roche) {
    const candidates = [
      [roche?.persona, "listUserPersonas"],
      [roche?.persona, "list"],
      [roche?.persona, "getAllUserPersonas"],
      [roche?.persona, "getUserPersonas"],
      [roche?.personas, "listUserPersonas"],
      [roche?.personas, "list"]
    ];
    let list = [];
    for (const [owner, key] of candidates) {
      const fn = owner?.[key];
      if (typeof fn !== "function") continue;
      try {
        const result = await fn.call(owner);
        if (Array.isArray(result)) { list = result; break; }
        if (Array.isArray(result?.items)) { list = result.items; break; }
        if (Array.isArray(result?.personas)) { list = result.personas; break; }
      } catch {}
    }
    if (!list.length && state.user) list = [state.user];
    state.userPersonas = list;
  }

  function normalizeMemoryItem(raw) {
    if (typeof raw === "string") return { text: raw, createdAt: Date.now() };
    return {
      id: raw?.id || raw?.memoryId || uid(),
      text: raw?.text || raw?.content || raw?.summary || raw?.description || "",
      createdAt: raw?.createdAt || raw?.updatedAt || raw?.timestamp || Date.now(),
      importance: raw?.importance ?? raw?.weight ?? null
    };
  }

  async function readCharacterMemory(characterId, userPersonaId) {
    const attempts = [
      [state.roche?.memory, "list", { characterId, userPersonaId }],
      [state.roche?.memory, "getByCharacter", { characterId, userPersonaId }],
      [state.roche?.memory, "search", { characterId, userPersonaId }],
      [state.roche?.character?.memory, "list", { characterId, userPersonaId }],
      [state.roche?.character?.memory, "get", { characterId, userPersonaId }]
    ];
    for (const [owner, key, args] of attempts) {
      const fn = owner?.[key];
      if (typeof fn !== "function") continue;
      try {
        const result = await fn.call(owner, args);
        const list = Array.isArray(result) ? result : result?.items || result?.memories || result?.results || [];
        if (Array.isArray(list)) return list.map(normalizeMemoryItem).filter(item => item.text);
      } catch {}
    }
    return [];
  }

  async function buildMemorySnapshots(archive) {
    if (!archive || archive.participationMode !== "immersive") return { total: 0, characters: 0 };
    const userPersonaId = archive.userPersona?.personaId;
    const snapshots = {};
    let total = 0;
    let characters = 0;
    for (const char of archive.characters || []) {
      const memories = await readCharacterMemory(char.characterId, userPersonaId);
      snapshots[char.characterId] = { characterId: char.characterId, characterName: char.name || "", userPersonaId: userPersonaId || "", readAt: Date.now(), memories };
      if (memories.length) characters += 1;
      total += memories.length;
    }
    archive.memorySnapshots = snapshots;
    archive.memoryReadout = { readAt: Date.now(), characterCount: archive.characters?.length || 0, charactersWithMemory: characters, memoryCount: total };
    return { total, characters };
  }

  /* =========================================================
     世界书读取
     ========================================================= */

  function normalizeWorldbook(raw, index = 0, source = "roche") {
    const name = raw?.name || raw?.title || raw?.comment || `世界书 ${index + 1}`;
    const content = raw?.content || raw?.text || raw?.description || raw?.entries?.map(e => e?.content || e?.text || "").filter(Boolean).join("\n\n") || "";
    return {
      id: String(raw?.id || raw?.worldbookId || `${source}-${index}-${name}`),
      name,
      description: raw?.description || raw?.desc || "",
      content,
      source,
      sourceLabel: source === "roche" ? "ROCHE 世界书" : "自建世界书",
      defaultSelected: source === "custom" && raw?.defaultSelected !== false
    };
  }

  async function loadRocheWorldbooks(roche) {
    let list = [];
    try {
      const candidates = [
        roche?.worldbook?.list,
        roche?.worldbooks?.list,
        roche?.worldBook?.list,
        roche?.worldbook?.getAll,
        roche?.worldbooks?.getAll
      ].filter(fn => typeof fn === "function");

      for (const fn of candidates) {
        try {
          const result = await fn.call(
            fn === roche?.worldbook?.list || fn === roche?.worldbook?.getAll ? roche.worldbook :
            fn === roche?.worldbooks?.list || fn === roche?.worldbooks?.getAll ? roche.worldbooks :
            roche.worldBook
          );
          if (Array.isArray(result)) { list = result; break; }
          if (Array.isArray(result?.items)) { list = result.items; break; }
          if (Array.isArray(result?.worldbooks)) { list = result.worldbooks; break; }
        } catch {}
      }
    } catch {}

    state.rocheWorldbooks = list.map((item, i) => normalizeWorldbook(item, i, "roche"));
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

    await loadUserPersonas(roche);

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

    await loadRocheWorldbooks(roche);

    state.customWorldbooks = await storageGet(
      "customWorldbooks",
      []
    );

    if (!state.customWorldbooks.length) {
      state.customWorldbooks = [
        {
          id:"xd-default-romance-world",
          name:"心动现场 · 恋综基础世界书",
          description:"默认恋综规则、节目氛围与核心世界设定。可在创建恋综时直接勾选。",
          content:"这是《心动现场》的基础世界规则。\n\n节目是一档以 USER 为唯一女嘉宾、其他角色作为男性嘉宾参与的恋爱真人秀。角色之间不会发展恋爱关系；所有情感主线只围绕 USER 展开。\n\n节目世界拥有独立的时间、地点、事件、关系、私信、观察记录与长期记忆。嘉宾会根据自身人设和当前档案规则行动。\n\n当 USER 不在场时，世界仍会继续运行，并可以通过观察室留下可被 USER 看到的片段。",
          source:"custom",
          sourceLabel:"心动现场内置",
          defaultSelected:true,
          builtin:true
        }
      ];
      await storageSet("customWorldbooks", state.customWorldbooks);
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

      if (state.currentArchive?.participationMode === "memory") {
        state.currentArchive.participationMode = "immersive";
      }

      loadCurrentCharacters();

      if (state.currentArchive?.participationMode === "immersive" && !state.currentArchive.memoryReadout?.readAt) {
        await buildMemorySnapshots(state.currentArchive);
        await storageSet(`archive:${state.currentArchive.archiveId}`, state.currentArchive);
      }

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

    version:"2.0.2",

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

(function () {
  "use strict";

  var PLUGIN_ID = "xindong-xianchang";
  var APP_ID = "xindong-xianchang-home";
  var RECENT_DAYS = 3;
  var STAGE_SPAN = 20;

  // ---------- 工具函数 ----------

  function uid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  var DANMU_NAMES = [
    "路过的吃瓜观众", "嗑到了", "本季颜值天花板", "剪辑鬼才",
    "已经在磕了", "弃剧警告", "冲了冲了", "理性观众",
    "护妻狂魔", "阴谋论选手", "求快进到下集", "已经代入编剧",
    "职业哈人", "深夜蹲直播", "客观分析师", "纯路人",
    "已经组CP", "退钱可还行", "节目组懂的", "弹幕护体",
    "刚追上", "二倍速追剧", "求个后续", "看戏不嫌事大",
    "已经磕上头", "编剧到底想干嘛", "本轮最佳", "求个官配",
    "催更选手", "吃瓜第一线"
  ];

  function pickDanmuName() {
    return DANMU_NAMES[Math.floor(Math.random() * DANMU_NAMES.length)];
  }

  function parseModelJson(text) {
    try {
      return JSON.parse(text);
    } catch (e) {
      var match = text && text.match(/\{[\s\S]*\}/);
      if (match) {
        try { return JSON.parse(match[0]); } catch (e2) {}
      }
      throw new Error("AI 返回内容无法解析为有效 JSON");
    }
  }

  // ---------- 存储 ----------

  async function getArchiveIndex(roche) {
    var index = await roche.storage.get("archiveIndex");
    return index || [];
  }

  async function loadArchive(roche, archiveId) {
    return await roche.storage.get("archive:" + archiveId);
  }

  async function saveArchive(archive, roche) {
    archive.lastSavedAt = Date.now();
    await roche.storage.set("archive:" + archive.archiveId, archive);

    var index = await getArchiveIndex(roche);
    var entry = null;
    for (var i = 0; i < index.length; i++) {
      if (index[i].archiveId === archive.archiveId) { entry = index[i]; break; }
    }
    var lastDay = archive.timeline[archive.timeline.length - 1];
    var lastSummaryText = "";
    if (lastDay) {
      lastSummaryText = lastDay.summary || (lastDay.fullNarrative ? lastDay.fullNarrative.slice(0, 40) : "");
    }
    var summaryEntry = {
      archiveId: archive.archiveId,
      title: archive.title,
      currentDay: archive.currentDay,
      characterNames: archive.characters.map(function (c) { return c.name; }),
      characterAvatars: archive.characters.map(function (c) { return c.avatar; }),
      lastSummary: lastSummaryText,
      lastSavedAt: archive.lastSavedAt
    };
    if (entry) {
      Object.assign(entry, summaryEntry);
    } else {
      index.push(summaryEntry);
    }
    await roche.storage.set("archiveIndex", index);
  }

  async function deleteArchiveData(roche, archiveId) {
    await roche.storage.delete("archive:" + archiveId);
    var index = await getArchiveIndex(roche);
    index = index.filter(function (i) { return i.archiveId !== archiveId; });
    await roche.storage.set("archiveIndex", index);
  }

  function createNewArchive(opts) {
    var day1 = { day: 1, summary: "", fullNarrative: "" };
    return {
      archiveId: uid(),
      title: opts.title,
      createdAt: Date.now(),
      lastSavedAt: Date.now(),
      userPersona: opts.userPersona,
      characters: opts.characters,
      worldbook: opts.worldbook,
      seasonConfig: opts.seasonConfig,
      currentDay: 1,
      currentTime: "20:00",
      currentSceneLabel: "心动小屋 · 初次见面",
      timeline: [day1],
      stageSummaries: [],
      relationships: { userToChar: {}, charToChar: {} },
      privateMessages: {},
      events: [],
      pendingRequest: false
    };
  }

  // ---------- AI：节目主循环 ----------

  function buildShowContext(archive) {
    var timeline = archive.timeline;
    var recentDays = timeline.slice(-RECENT_DAYS);
    var olderSummaries = timeline.slice(0, -RECENT_DAYS).map(function (t) { return t.summary; }).filter(Boolean);
    var stageSummaryText = archive.stageSummaries.map(function (s) { return s.summary; }).join("\n");

    var charBlock = archive.characters.map(function (c) {
      var head = "【" + c.name + (c.handle ? "（" + c.handle + "）" : "") + "】";
      var body = "人设：" + (c.personaSnapshot || "");
      var tag = c.isNewGuest ? "（本轮首次登场，无历史记忆）" : "";
      return head + "\n" + body + "\n" + tag;
    }).join("\n\n");

    var relationshipBlock = JSON.stringify(archive.relationships);
    var worldbookBlock = (archive.worldbook && archive.worldbook.snapshotText) || "";

    var recentText = recentDays.map(function (d) {
      return "DAY" + d.day + ": " + (d.fullNarrative || "（尚未发生）");
    }).join("\n\n");

    return [
      "【本季设定】",
      archive.seasonConfig.description || "（无特别设定）",
      "氛围：" + (archive.seasonConfig.tone || "自然发展"),
      "禁止内容：" + (archive.seasonConfig.forbiddenContent || "无"),
      "",
      "【世界设定】",
      worldbookBlock || "（无）",
      "",
      "【用户人设】",
      archive.userPersona.personaSnapshot || "",
      "",
      "【嘉宾人设】",
      charBlock,
      "",
      "【阶段回顾】",
      stageSummaryText || "（暂无）",
      "",
      "【近期剧情摘要】",
      olderSummaries.join("\n") || "（暂无）",
      "",
      "【最近剧情原文】",
      recentText,
      "",
      "【当前关系状态】",
      relationshipBlock,
      "",
      "【当前场景】",
      archive.currentSceneLabel + " · DAY" + archive.currentDay + " · " + archive.currentTime
    ].join("\n");
  }

  var SHOW_RULES_PROMPT = [
    "你是恋综节目的剧情引擎。规则：",
    "1. 每位嘉宾的行为完全基于其人设，不能被强制安排喜欢/拒绝/嫉妒 USER，一切由人设与当前剧情自然决定。",
    "2. 三个选项必须体现不同的应对方向（例如：正面回应/转移视线/试探反应），不能是同一动作的力度递进，不能暗示哪个是正确答案。",
    "3. 弹幕提到嘉宾时必须直接使用其真实姓名或昵称，不能使用泛称。",
    "4. 只有当剧情时间自然推进到下一天时，才将 dayAdvanced 设为 true，并附带 daySummary（该天的剧情摘要）。",
    "5. relationshipChanges 里的 pair 字段命名规则：USER 与某嘉宾的关系写成 \"user-嘉宾ID\"；两个嘉宾之间的关系写成 \"较小ID_较大ID\"（按字符串排序）。必须使用真实 characterId，不能编造。",
    "6. 如果剧情中提到有新嘉宾即将加入，只在 events 里生成一条预告事件，不要在 newGuestIntroduced 里编造角色，newGuestIntroduced 永远返回 null（新嘉宾由玩家在界面里手动从已有角色中选择加入）。",
    "7. 严格按照下面的 JSON 结构返回，不要输出多余文字，不要用代码块包裹。",
    "",
    "返回结构：",
    "{",
    "  \"narrative\": \"\",",
    "  \"sceneLabel\": \"\",",
    "  \"currentTime\": \"\",",
    "  \"charActions\": [{ \"characterId\": \"\", \"displayName\": \"\", \"action\": \"\" }],",
    "  \"choices\": [{ \"id\": \"1\", \"text\": \"\" }, { \"id\": \"2\", \"text\": \"\" }, { \"id\": \"3\", \"text\": \"\" }],",
    "  \"danmu\": [\"\", \"\"],",
    "  \"events\": [{ \"type\": \"\", \"title\": \"\", \"detail\": \"\" }],",
    "  \"relationshipChanges\": [{ \"pair\": \"\", \"tagsAdded\": [], \"tagsRemoved\": [], \"milestone\": \"\", \"statusLine\": \"\" }],",
    "  \"dayAdvanced\": false,",
    "  \"daySummary\": null,",
    "  \"stageSummary\": null,",
    "  \"newGuestIntroduced\": null",
    "}"
  ].join("\n");

  function computeStageRange(archive) {
    var doneDays = archive.stageSummaries.length * STAGE_SPAN;
    var pad = function (n) { return String(n).padStart(2, "0"); };
    return "DAY" + pad(doneDays + 1) + "-DAY" + pad(doneDays + STAGE_SPAN);
  }

  function applyRelationshipChange(archive, change) {
    if (!change || !change.pair) return;
    var isUserPair = change.pair.indexOf("user-") === 0;
    var bucket = isUserPair ? archive.relationships.userToChar : archive.relationships.charToChar;
    var key = isUserPair ? change.pair.replace("user-", "") : change.pair;

    if (!bucket[key]) bucket[key] = { tags: [], milestones: [] };
    var record = bucket[key];

    (change.tagsAdded || []).forEach(function (t) {
      if (record.tags.indexOf(t) === -1) record.tags.push(t);
    });
    (change.tagsRemoved || []).forEach(function (t) {
      record.tags = record.tags.filter(function (x) { return x !== t; });
    });
    if (change.milestone) {
      record.milestones.push({ day: archive.currentDay, event: change.milestone });
    }
    if (change.statusLine) record.statusLine = change.statusLine;
  }

  function applyStoryResult(archive, data) {
    archive.currentSceneLabel = data.sceneLabel || archive.currentSceneLabel;
    archive.currentTime = data.currentTime || archive.currentTime;

    var dayForThisNarrative = archive.currentDay;
    var dayEntry = null;
    for (var i = 0; i < archive.timeline.length; i++) {
      if (archive.timeline[i].day === dayForThisNarrative) { dayEntry = archive.timeline[i]; break; }
    }
    if (dayEntry) {
      dayEntry.fullNarrative = (dayEntry.fullNarrative ? dayEntry.fullNarrative + "\n" : "") + (data.narrative || "");
    } else {
      archive.timeline.push({ day: dayForThisNarrative, summary: "", fullNarrative: data.narrative || "" });
    }

    (data.relationshipChanges || []).forEach(function (change) {
      applyRelationshipChange(archive, change);
    });

    if (data.events && data.events.length) {
      data.events.forEach(function (e) {
        archive.events.push(Object.assign({}, e, { day: dayForThisNarrative }));
      });
    }

    if (data.dayAdvanced) {
      var finishedDay = null;
      for (var j = 0; j < archive.timeline.length; j++) {
        if (archive.timeline[j].day === dayForThisNarrative) { finishedDay = archive.timeline[j]; break; }
      }
      if (finishedDay) finishedDay.summary = data.daySummary || "";
      archive.currentDay += 1;
      archive.timeline.push({ day: archive.currentDay, summary: "", fullNarrative: "" });

      if (data.stageSummary) {
        archive.stageSummaries.push({
          range: computeStageRange(archive),
          summary: data.stageSummary
        });
      }
    }
  }

  async function advanceStory(archive, roche, userAction) {
    if (archive.pendingRequest) {
      roche.ui.toast("剧情正在生成，请稍候");
      return null;
    }
    archive.pendingRequest = true;
    await saveArchive(archive, roche);

    try {
      var systemPrompt = buildShowContext(archive) + "\n\n" + SHOW_RULES_PROMPT;
      var result = await roche.ai.chat({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userAction }
        ],
        temperature: 0.9
      });

      var data = parseModelJson(result.text);
      applyStoryResult(archive, data);
      archive.pendingRequest = false;
      await saveArchive(archive, roche);
      return data;
    } catch (err) {
      archive.pendingRequest = false;
      await saveArchive(archive, roche);
      roche.ui.toast("剧情生成失败，请重试");
      throw err;
    }
  }

  async function addNewGuestToArchive(archive, roche, characterId) {
    var rocheChar = await roche.character.get(characterId);
    archive.characters.push({
      characterId: rocheChar.id,
      name: rocheChar.name,
      handle: rocheChar.handle,
      avatar: rocheChar.avatar,
      bio: rocheChar.bio,
      personaSnapshot: rocheChar.persona || rocheChar.bio || "",
      joinedDay: archive.currentDay,
      isNewGuest: true
    });
    await saveArchive(archive, roche);
  }

  // ---------- AI：私信 ----------

  function buildPrivateMessageContext(archive, characterId) {
    var character = null;
    for (var i = 0; i < archive.characters.length; i++) {
      if (archive.characters[i].characterId === characterId) { character = archive.characters[i]; break; }
    }
    if (!character) return "";

    var relation = archive.relationships.userToChar[characterId] || { tags: [], statusLine: "" };
    var thread = archive.privateMessages[characterId] || { messages: [], summary: "" };
    var recentSummary = archive.timeline.slice(-2).map(function (t) { return t.summary; }).filter(Boolean).join("\n");

    return [
      "你正在扮演 " + character.name + "，通过私信和 USER 一对一聊天。",
      "人设：" + (character.personaSnapshot || ""),
      "当前关系标签：" + (relation.tags.join("、") || "无"),
      "关系状态：" + (relation.statusLine || "无"),
      "节目最近发生：" + (recentSummary || "无"),
      "早期私信摘要：" + (thread.summary || "无"),
      "",
      "请严格按以下 JSON 返回，不要输出多余文字，不要用代码块包裹：",
      "{ \"reply\": \"角色的回复文本\", \"relationshipChanges\": [{ \"pair\": \"user-" + characterId + "\", \"tagsAdded\": [], \"tagsRemoved\": [], \"milestone\": \"\", \"statusLine\": \"\" }] }",
      "如果这轮没有关系变化，relationshipChanges 返回空数组。"
    ].join("\n");
  }

  async function sendPrivateMessage(archive, roche, characterId, userText) {
    if (!archive.privateMessages[characterId]) {
      archive.privateMessages[characterId] = { messages: [], summary: "" };
    }
    var thread = archive.privateMessages[characterId];
    var systemPrompt = buildPrivateMessageContext(archive, characterId);

    var history = thread.messages.slice(-20).map(function (m) {
      return { role: m.role === "user" ? "user" : "assistant", content: m.text };
    });

    var result = await roche.ai.chat({
      messages: [{ role: "system", content: systemPrompt }].concat(history, [{ role: "user", content: userText }])
    });

    var data = parseModelJson(result.text);

    thread.messages.push({ role: "user", text: userText, timestamp: Date.now() });
    thread.messages.push({ role: "char", text: data.reply, timestamp: Date.now() });
    (data.relationshipChanges || []).forEach(function (change) {
      applyRelationshipChange(archive, change);
    });

    if (thread.messages.length > 40) {
      var toCompress = thread.messages.slice(0, 20);
      thread.summary = (thread.summary ? thread.summary + "\n" : "") +
        toCompress.map(function (m) { return (m.role === "user" ? "USER：" : "角色："); } ).join(" ");
      thread.messages = thread.messages.slice(20);
    }

    await saveArchive(archive, roche);
    return data.reply;
  }

  //  // ---------- 样式 ----------

  var STYLE_ID = "xindong-xianchang-style";
  var STYLE_TEXT = [
    ".roche-plugin-xindong { position:relative; width:100%; height:100%; display:flex; flex-direction:column; background:#0f0f14; color:#f0f0f5; font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif; overflow:hidden; box-sizing:border-box; }",
    ".roche-plugin-xindong * { box-sizing:border-box; }",
    ".xdxc-screen { flex:1; overflow-y:auto; padding:12px; padding-bottom:76px; }",
    ".xdxc-topbar { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; background:#17171f; border-bottom:1px solid #26262f; }",
    ".xdxc-topbar-left { display:flex; align-items:center; gap:8px; cursor:pointer; color:#c9c9d4; }",
    ".xdxc-topbar-mid { text-align:center; }",
    ".xdxc-topbar-mid .xdxc-title { font-size:14px; font-weight:600; }",
    ".xdxc-topbar-mid .xdxc-sub { font-size:11px; color:#e0668c; margin-top:2px; }",
    ".xdxc-topbar-right { display:flex; align-items:center; gap:10px; cursor:pointer; }",
    ".xdxc-tabbar { display:flex; border-top:1px solid #26262f; background:#17171f; position:absolute; left:0; right:0; bottom:0; }",
    ".xdxc-tab { flex:1; text-align:center; padding:10px 0; font-size:12px; color:#8a8a96; cursor:pointer; }",
    ".xdxc-tab.active { color:#f0f0f5; font-weight:600; }",
    ".xdxc-card { background:#1a1a22; border-radius:12px; padding:14px; margin-bottom:12px; }",
    ".xdxc-card-title { font-size:15px; font-weight:600; margin-bottom:4px; }",
    ".xdxc-card-sub { font-size:12px; color:#8a8a96; margin-bottom:6px; }",
    ".xdxc-card-quote { font-size:13px; color:#c9c9d4; }",
    ".xdxc-btn { display:inline-block; padding:9px 16px; border-radius:20px; background:#e0668c; color:#fff; font-size:13px; text-align:center; cursor:pointer; border:none; }",
    ".xdxc-btn.secondary { background:#2a2a34; color:#c9c9d4; }",
    ".xdxc-btn.block { display:block; width:100%; margin-top:10px; }",
    ".xdxc-btn-row { display:flex; gap:8px; margin-top:8px; }",
    ".xdxc-empty { text-align:center; color:#66666f; padding:60px 20px; font-size:13px; }",
    ".xdxc-avatar { width:44px; height:44px; border-radius:50%; object-fit:cover; background:#2a2a34; flex-shrink:0; }",
    ".xdxc-avatar-row { display:flex; margin-bottom:8px; }",
    ".xdxc-avatar-row img { margin-left:-10px; border:2px solid #1a1a22; }",
    ".xdxc-scene-box { background:#1a1a22; border-radius:12px; padding:16px; position:relative; overflow:hidden; min-height:140px; margin-bottom:12px; }",
    ".xdxc-scene-label { font-size:12px; color:#e0668c; margin-bottom:8px; }",
    ".xdxc-narrative { font-size:14px; line-height:1.8; white-space:pre-wrap; }",
    ".xdxc-char-actions { margin-top:10px; }",
    ".xdxc-char-action { font-size:12px; color:#a8a8b4; margin-top:4px; }",
    ".xdxc-danmu-layer { position:absolute; top:0; left:0; right:0; height:100%; pointer-events:none; overflow:hidden; }",
    ".xdxc-danmu-item { position:absolute; white-space:nowrap; font-size:11px; color:#fff; background:rgba(0,0,0,0.35); padding:2px 8px; border-radius:10px; animation:xdxc-danmu-move 7s linear forwards; }",
    "@keyframes xdxc-danmu-move { from { transform:translateX(100%); } to { transform:translateX(-220%); } }",
    ".xdxc-events { margin:10px 0; }",
    ".xdxc-event-card { background:#241a22; border-left:3px solid #e0668c; padding:8px 10px; border-radius:8px; font-size:12px; margin-bottom:6px; }",
    ".xdxc-event-title { font-weight:600; margin-bottom:2px; }",
    ".xdxc-choices { margin-top:12px; }",
    ".xdxc-choice-btn { display:block; width:100%; text-align:left; padding:12px 14px; margin-bottom:8px; border-radius:10px; background:#1a1a22; color:#f0f0f5; font-size:13px; border:1px solid #2a2a34; cursor:pointer; }",
    ".xdxc-choice-btn:active { background:#242430; }",
    ".xdxc-custom-box { display:flex; gap:8px; margin-top:6px; }",
    ".xdxc-custom-box textarea { flex:1; background:#1a1a22; border:1px solid #2a2a34; border-radius:10px; color:#f0f0f5; padding:10px; font-size:13px; resize:none; height:40px; }",
    ".xdxc-tag { display:inline-block; background:#2a2a34; color:#e0668c; font-size:11px; padding:3px 8px; border-radius:10px; margin-right:6px; margin-bottom:6px; }",
    ".xdxc-form-group { margin-bottom:16px; }",
    ".xdxc-form-label { font-size:13px; color:#c9c9d4; margin-bottom:6px; display:block; }",
    ".xdxc-form-group input[type=text], .xdxc-form-group textarea, .xdxc-form-group select { width:100%; background:#1a1a22; border:1px solid #2a2a34; border-radius:8px; color:#f0f0f5; padding:9px; font-size:13px; }",
    ".xdxc-form-group textarea { min-height:60px; resize:vertical; }",
    ".xdxc-checkbox-row { display:flex; align-items:center; gap:8px; padding:8px 0; border-bottom:1px solid #22222c; }",
    ".xdxc-checkbox-row label { font-size:13px; flex:1; }",
    ".xdxc-chat-list { display:flex; flex-direction:column; gap:8px; }",
    ".xdxc-bubble { max-width:78%; padding:9px 12px; border-radius:14px; font-size:13px; line-height:1.5; white-space:pre-wrap; }",
    ".xdxc-bubble.user { align-self:flex-end; background:#e0668c; color:#fff; }",
    ".xdxc-bubble.char { align-self:flex-start; background:#1a1a22; color:#f0f0f5; }",
    ".xdxc-loading { text-align:center; color:#8a8a96; font-size:12px; padding:20px; }"
  ].join("\n");

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = STYLE_TEXT;
    document.head.appendChild(style);
  }

  function removeStyle() {
    var style = document.getElementById(STYLE_ID);
    if (style) style.parentNode.removeChild(style);
  }

  // ---------- 顶层渲染调度 ----------

  function render(root, roche, state) {
    if (!state.archive) {
      return renderArchiveListScreen(root, roche, state);
    }
    if (state.screen === "newArchive") {
      return renderNewArchiveScreen(root, roche, state);
    }
    var body = "";
    if (state.screen === "show") body = renderShowScreenHtml(state);
    else if (state.screen === "guestList") body = renderGuestListHtml(state);
    else if (state.screen === "guestDetail") body = renderGuestDetailHtml(state);
    else if (state.screen === "privateMessage") body = renderPrivateMessageHtml(state);
    else if (state.screen === "relationship") body = renderRelationshipHtml(state);
    else body = renderShowScreenHtml(state);

    root.innerHTML =
      '<div class="xdxc-screen" data-role="screen">' + body + "</div>" +
      renderTabbarHtml(state);
  }

  function renderTabbarHtml(state) {
    var tabs = [
      { id: "show", icon: "📺", label: "节目" },
      { id: "guestList", icon: "👥", label: "嘉宾" },
      { id: "relationship", icon: "💗", label: "关系" },
      { id: "archiveManage", icon: "📂", label: "档案" }
    ];
    var isArchiveManage = state.screen === "archiveManage";
    var active = isArchiveManage ? "archiveManage" : state.screen;
    if (["show", "guestList", "guestDetail", "privateMessage"].indexOf(active) !== -1) {
      if (active === "guestDetail" || active === "privateMessage") active = "guestList";
    }
    var html = tabs.map(function (t) {
      var cls = "xdxc-tab" + (t.id === active ? " active" : "");
      return '<div class="' + cls + '" data-action="nav-tab" data-tab="' + t.id + '">' + t.icon + "<br/>" + t.label + "</div>";
    }).join("");
    return '<div class="xdxc-tabbar">' + html + "</div>";
  }

  // ---------- 档案列表（初始页面 / 档案 tab） ----------

  async function renderArchiveListScreen(root, roche, state) {
    var index = await getArchiveIndex(roche);
    var listHtml = "";
    if (index.length === 0) {
      listHtml = '<div class="xdxc-empty">还没有任何恋综档案<br/>点击下方按钮开始第一季</div>';
    } else {
      listHtml = index.map(function (item) {
        var avatarsHtml = (item.characterAvatars || []).slice(0, 3).map(function (a) {
          return '<img class="xdxc-avatar" style="width:32px;height:32px;" src="' + escapeHtml(a || "") + '" />';
        }).join("");
        return (
          '<div class="xdxc-card" data-action="open-archive" data-id="' + item.archiveId + '">' +
          '<div class="xdxc-avatar-row">' + avatarsHtml + "</div>" +
          '<div class="xdxc-card-title">' + escapeHtml(item.title) + "</div>" +
          '<div class="xdxc-card-sub">DAY ' + item.currentDay + " · " + escapeHtml((item.characterNames || []).join(" / ")) + "</div>" +
          '<div class="xdxc-card-quote">' + escapeHtml(item.lastSummary || "") + "</div>" +
          '<div class="xdxc-btn-row">' +
          '<button class="xdxc-btn secondary" data-action="delete-archive" data-id="' + item.archiveId + '">删除</button>' +
          "</div></div>"
        );
      }).join("");
    }

    root.innerHTML =
      '<div class="xdxc-screen" data-role="screen">' +
      '<div class="xdxc-card-title" style="font-size:18px;margin-bottom:12px;">📂 我的恋综档案</div>' +
      listHtml +
      '<button class="xdxc-btn block" data-action="new-archive">＋ 新建一季恋综</button>' +
      "</div>";
  }

  // ---------- 新建恋综向导（单页表单，简化流程） ----------

  async function renderNewArchiveScreen(root, roche, state) {
    if (!state.wizard) {
      var personas = await roche.persona.getUserPersonas();
      var chars = await roche.character.list();
      var worldbookCategories = [];
      try { worldbookCategories = await roche.worldbook.list(); } catch (e) { worldbookCategories = []; }
      state.wizard = {
        personas: personas || [],
        chars: chars || [],
        worldbookCategories: worldbookCategories || [],
        selectedPersonaId: (personas && personas[0] && personas[0].id) || "",
        selectedCharIds: [],
        selectedCategoryIds: [],
        title: "",
        tone: "自然发展",
        description: "",
        forbiddenContent: ""
      };
    }
    var w = state.wizard;

    var personaOptions = w.personas.map(function (p) {
      var sel = p.id === w.selectedPersonaId ? " selected" : "";
      return '<option value="' + escapeHtml(p.id) + '"' + sel + ">" + escapeHtml(p.name || p.handle || p.id) + "</option>";
    }).join("");

    var charRows = w.chars.map(function (c) {
      var checked = w.selectedCharIds.indexOf(c.id) !== -1 ? " checked" : "";
      return (
        '<div class="xdxc-checkbox-row">' +
        '<input type="checkbox" data-role="char-check" data-id="' + escapeHtml(c.id) + '"' + checked + " />" +
        "<label>" + escapeHtml(c.handle || c.name) + "</label>" +
        "</div>"
      );
    }).join("");

    var categoryRows = w.worldbookCategories.map(function (cat) {
      var checked = w.selectedCategoryIds.indexOf(cat.id) !== -1 ? " checked" : "";
      return (
        '<div class="xdxc-checkbox-row">' +
        '<input type="checkbox" data-role="wb-check" data-id="' + escapeHtml(cat.id) + '"' + checked + " />" +
        "<label>" + escapeHtml(cat.name || cat.id) + "</label>" +
        "</div>"
      );
    }).join("");

    root.innerHTML =
      '<div class="xdxc-screen" data-role="screen">' +
      '<div class="xdxc-topbar-left" data-action="cancel-new-archive" style="margin-bottom:12px;">‹ 返回</div>' +
      '<div class="xdxc-card-title" style="font-size:18px;margin-bottom:16px;">新建一季恋综</div>' +

      '<div class="xdxc-form-group">' +
      '<label class="xdxc-form-label">恋综名称</label>' +
      '<input type="text" data-role="input-title" value="' + escapeHtml(w.title) + '" placeholder="例如：心动小屋" />' +
      "</div>" +

      '<div class="xdxc-form-group">' +
      '<label class="xdxc-form-label">👤 你的人设</label>' +
      '<select data-role="select-persona">' + personaOptions + "</select>" +
      "</div>" +

      '<div class="xdxc-form-group">' +
      '<label class="xdxc-form-label">👥 选择嘉宾（至少 1 位）</label>' +
      charRows +
      "</div>" +

      '<div class="xdxc-form-group">' +
      '<label class="xdxc-form-label">🌍 世界书分类（可不选）</label>' +
      (categoryRows || '<div class="xdxc-card-sub">暂无世界书分类</div>') +
      "</div>" +

      '<div class="xdxc-form-group">' +
      '<label class="xdxc-form-label">🎬 本季玩法 / 剧情设定</label>' +
      '<textarea data-role="input-description" placeholder="例如：这一季主打甜宠，节奏偏慢热">' + escapeHtml(w.description) + "</textarea>" +
      "</div>" +

      '<div class="xdxc-form-group">' +
      '<label class="xdxc-form-label">节目氛围</label>' +
      '<select data-role="select-tone">' +
      ["温情向", "狗血向", "搞笑向", "自然发展"].map(function (t) {
        return '<option value="' + t + '"' + (t === w.tone ? " selected" : "") + ">" + t + "</option>";
      }).join("") +
      "</select>" +
      "</div>" +

      '<div class="xdxc-form-group">' +
      '<label class="xdxc-form-label">禁止出现的内容（可不填）</label>' +
      '<textarea data-role="input-forbidden" placeholder="例如：不要出现暴力情节">' + escapeHtml(w.forbiddenContent) + "</textarea>" +
      "</div>" +

      '<button class="xdxc-btn block" data-action="confirm-new-archive">开始这一季恋综</button>' +
      "</div>";
  }

  async function collectWorldbookSnapshot(roche, categoryIds) {
    if (!categoryIds || categoryIds.length === 0) return "";
    var parts = [];
    for (var i = 0; i < categoryIds.length; i++) {
      try {
        var entries = await roche.worldbook.getEntries({ categoryId: categoryIds[i] });
        (entries || []).forEach(function (entry) {
          var text = entry.content || entry.text || entry.summary || "";
          if (text) parts.push(text);
        });
      } catch (e) {}
    }
    return parts.join("\n\n");
  }

  async function confirmNewArchive(roche, state) {
    var w = state.wizard;
    if (!w.title) { roche.ui.toast("请填写恋综名称"); return; }
    if (w.selectedCharIds.length === 0) { roche.ui.toast("请至少选择一位嘉宾"); return; }

    var persona = null;
    for (var i = 0; i < w.personas.length; i++) {
      if (w.personas[i].id === w.selectedPersonaId) { persona = w.personas[i]; break; }
    }
    if (!persona) { roche.ui.toast("请选择你的人设"); return; }

    var characters = [];
    for (var j = 0; j < w.selectedCharIds.length; j++) {
      var full = await roche.character.get(w.selectedCharIds[j]);
      characters.push({
        characterId: full.id,
        name: full.name,
        handle: full.handle,
        avatar: full.avatar,
        bio: full.bio,
        personaSnapshot: full.persona || full.bio || "",
        joinedDay: 1,
        isNewGuest: false
      });
    }

    var worldbookSnapshot = await collectWorldbookSnapshot(roche, w.selectedCategoryIds);

    var archive = createNewArchive({
      title: w.title,
      userPersona: {
        personaId: persona.id,
        name: persona.name,
        handle: persona.handle,
        avatar: persona.avatar,
        personaSnapshot: persona.persona || persona.bio || ""
      },
      characters: characters,
      worldbook: {
        selectedCategoryIds: w.selectedCategoryIds,
        selectedEntryIds: [],
        snapshotText: worldbookSnapshot
      },
      seasonConfig: {
        description: w.description,
        tone: w.tone,
        forbiddenContent: w.forbiddenContent
      }
    });

    await saveArchive(archive, roche);
    state.archive = archive;
    state.screen = "show";
    state.wizard = null;
  }
  // ---------- 📺 节目页面 ----------

  function renderShowScreenHtml(state) {
    var archive = state.archive;
    var lastResult = state.lastResult || {};
    var narrativeText = "";
    var dayEntry = null;
    for (var i = 0; i < archive.timeline.length; i++) {
      if (archive.timeline[i].day === archive.currentDay) { dayEntry = archive.timeline[i]; break; }
    }
    narrativeText = dayEntry ? dayEntry.fullNarrative : "";

    var charActionsHtml = "";
    if (lastResult.charActions && lastResult.charActions.length) {
      charActionsHtml = '<div class="xdxc-char-actions">' + lastResult.charActions.map(function (a) {
        return '<div class="xdxc-char-action">· ' + escapeHtml(a.displayName || "") + " " + escapeHtml(a.action || "") + "</div>";
      }).join("") + "</div>";
    }

    var danmuHtml = "";
    if (state.settings.danmuEnabled && lastResult.danmu && lastResult.danmu.length) {
      danmuHtml = '<div class="xdxc-danmu-layer" data-role="danmu-layer">' +
        lastResult.danmu.map(function (text, idx) {
          var name = pickDanmuName();
          var top = 10 + (idx * 22) % 90;
          var delay = idx * 0.6;
          return '<div class="xdxc-danmu-item" style="top:' + top + '%;animation-delay:' + delay + 's;">' +
            escapeHtml(name) + "：" + escapeHtml(text) + "</div>";
        }).join("") +
        "</div>";
    }

    var eventsHtml = "";
    var todaysEvents = archive.events.filter(function (e) { return e.day === archive.currentDay; });
    if (todaysEvents.length) {
      eventsHtml = '<div class="xdxc-events">' + todaysEvents.map(function (e) {
        return '<div class="xdxc-event-card"><div class="xdxc-event-title">' + escapeHtml(e.title || "") + "</div><div>" + escapeHtml(e.detail || "") + "</div></div>";
      }).join("") + "</div>";
    }

    var choices = lastResult.choices || [];
    var choicesHtml = choices.map(function (c) {
      return '<button class="xdxc-choice-btn" data-action="pick-choice" data-text="' + escapeHtml(c.text) + '">' + escapeHtml(c.text) + "</button>";
    }).join("");

    var loadingHtml = archive.pendingRequest ? '<div class="xdxc-loading">剧情生成中...</div>' : "";

    return (
      '<div class="xdxc-topbar" style="margin:-12px -12px 12px -12px;">' +
      '<div class="xdxc-topbar-left" data-action="back-to-archive-list">‹ 返回</div>' +
      '<div class="xdxc-topbar-mid">' +
      '<div class="xdxc-title">' + escapeHtml(archive.title) + " DAY" + String(archive.currentDay).padStart(2, "0") + "</div>" +
      '<div class="xdxc-sub">● ON AIR · ' + escapeHtml(archive.currentTime) + "</div>" +
      "</div>" +
      '<div class="xdxc-topbar-right"><span data-action="manual-save">💾</span></div>' +
      "</div>" +

      '<div class="xdxc-scene-box">' +
      danmuHtml +
      '<div class="xdxc-scene-label">' + escapeHtml(archive.currentSceneLabel) + "</div>" +
      '<div class="xdxc-narrative">' + escapeHtml(narrativeText || "故事即将开始...") + "</div>" +
      charActionsHtml +
      "</div>" +

      eventsHtml +
      loadingHtml +

      '<div class="xdxc-choices">' +
      choicesHtml +
      '<div class="xdxc-custom-box">' +
      '<textarea data-role="custom-action-input" placeholder="✎ 自定义剧情走向..."></textarea>' +
      '<button class="xdxc-btn" data-action="submit-custom-action">发送</button>' +
      "</div>" +
      "</div>"
    );
  }

  // ---------- 👥 嘉宾列表页面 ----------

  function renderGuestListHtml(state) {
    var archive = state.archive;
    var cardsHtml = archive.characters.map(function (c) {
      var rel = archive.relationships.userToChar[c.characterId] || { tags: [] };
      var tagsHtml = rel.tags.slice(0, 3).map(function (t) {
        return '<span class="xdxc-tag">' + escapeHtml(t) + "</span>";
      }).join("");
      var joinedNote = c.isNewGuest ? "DAY" + c.joinedDay + " 中途加入" : "DAY01 加入";
      return (
        '<div class="xdxc-card" data-action="open-guest-detail" data-id="' + escapeHtml(c.characterId) + '">' +
        '<div style="display:flex;align-items:center;gap:10px;">' +
        '<img class="xdxc-avatar" src="' + escapeHtml(c.avatar || "") + '" />' +
        "<div>" +
        '<div class="xdxc-card-title">' + escapeHtml(c.handle || c.name) + "</div>" +
        '<div class="xdxc-card-sub">' + escapeHtml(joinedNote) + "</div>" +
        "</div></div>" +
        '<div style="margin-top:8px;">' + (tagsHtml || '<span class="xdxc-card-sub">暂无互动</span>') + "</div>" +
        "</div>"
      );
    }).join("");

    return (
      '<div class="xdxc-card-title" style="font-size:18px;margin-bottom:12px;">👥 本季嘉宾</div>' +
      cardsHtml +
      '<button class="xdxc-btn block secondary" data-action="add-guest">＋ 新嘉宾入住</button>'
    );
  }

  async function renderAddGuestPicker(root, roche, state) {
    var allChars = await roche.character.list();
    var existingIds = state.archive.characters.map(function (c) { return c.characterId; });
    var candidates = (allChars || []).filter(function (c) { return existingIds.indexOf(c.id) === -1; });

    var rowsHtml = candidates.map(function (c) {
      return (
        '<div class="xdxc-card" data-action="confirm-add-guest" data-id="' + escapeHtml(c.id) + '">' +
        '<div style="display:flex;align-items:center;gap:10px;">' +
        '<img class="xdxc-avatar" src="' + escapeHtml(c.avatar || "") + '" />' +
        '<div class="xdxc-card-title">' + escapeHtml(c.handle || c.name) + "</div>" +
        "</div></div>"
      );
    }).join("");

    root.querySelector('[data-role="screen"]').innerHTML =
      '<div class="xdxc-topbar-left" data-action="cancel-add-guest" style="margin-bottom:12px;">‹ 返回</div>' +
      '<div class="xdxc-card-title" style="font-size:16px;margin-bottom:12px;">选择新嘉宾</div>' +
      (rowsHtml || '<div class="xdxc-empty">没有更多可加入的角色了</div>');
  }

  // ---------- 👤 嘉宾详情页面 ----------

  function renderGuestDetailHtml(state) {
    var c = null;
    for (var i = 0; i < state.archive.characters.length; i++) {
      if (state.archive.characters[i].characterId === state.currentGuestId) { c = state.archive.characters[i]; break; }
    }
    if (!c) return '<div class="xdxc-empty">未找到该嘉宾</div>';

    var rel = state.archive.relationships.userToChar[c.characterId] || { tags: [], milestones: [], statusLine: "" };
    var tagsHtml = rel.tags.map(function (t) { return '<span class="xdxc-tag">' + escapeHtml(t) + "</span>"; }).join("");
    var lastMilestone = rel.milestones.length ? rel.milestones[rel.milestones.length - 1] : null;

    return (
      '<div class="xdxc-topbar-left" data-action="back-to-guest-list" style="margin-bottom:12px;">‹ 返回</div>' +
      '<div style="text-align:center;margin-bottom:16px;">' +
      '<img class="xdxc-avatar" style="width:80px;height:80px;" src="' + escapeHtml(c.avatar || "") + '" />' +
      '<div class="xdxc-card-title" style="margin-top:8px;">' + escapeHtml(c.name) + (c.handle ? " (@" + escapeHtml(c.handle) + ")" : "") + "</div>" +
      '<div class="xdxc-card-sub">' + escapeHtml(c.bio || "") + "</div>" +
      "</div>" +
      '<div class="xdxc-card">' +
      '<div class="xdxc-card-sub">' + (c.isNewGuest ? "DAY" + c.joinedDay + " 中途加入本季" : "DAY01 加入本季恋综") + "</div>" +
      "<div style='margin:8px 0;'>" + (tagsHtml || '<span class="xdxc-card-sub">暂无关系标签</span>') + "</div>" +
      '<div class="xdxc-card-quote">' + escapeHtml(rel.statusLine || "") + "</div>" +
      (lastMilestone ? '<div class="xdxc-card-sub" style="margin-top:8px;">最近互动：DAY' + lastMilestone.day + " · " + escapeHtml(lastMilestone.event) + "</div>" : "") +
      "</div>" +
      '<button class="xdxc-btn block" data-action="open-private-message" data-id="' + escapeHtml(c.characterId) + '">💬 私信</button>'
    );
  }

  // ---------- 💬 私信页面 ----------

  function renderPrivateMessageHtml(state) {
    var c = null;
    for (var i = 0; i < state.archive.characters.length; i++) {
      if (state.archive.characters[i].characterId === state.currentGuestId) { c = state.archive.characters[i]; break; }
    }
    if (!c) return '<div class="xdxc-empty">未找到该嘉宾</div>';

    var thread = state.archive.privateMessages[c.characterId] || { messages: [] };
    var bubblesHtml = thread.messages.map(function (m) {
      var cls = m.role === "user" ? "user" : "char";
      return '<div class="xdxc-bubble ' + cls + '">' + escapeHtml(m.text) + "</div>";
    }).join("");

    var loadingHtml = state.pmSending ? '<div class="xdxc-loading">对方正在输入...</div>' : "";

    return (
      '<div class="xdxc-topbar-left" data-action="back-to-guest-detail" style="margin-bottom:12px;">‹ 返回</div>' +
      '<div class="xdxc-card-title" style="margin-bottom:12px;">与 ' + escapeHtml(c.handle || c.name) + " 的私信</div>" +
      '<div class="xdxc-chat-list">' + bubblesHtml + "</div>" +
      loadingHtml +
      '<div class="xdxc-custom-box" style="margin-top:12px;">' +
      '<textarea data-role="pm-input" placeholder="输入私信内容..."></textarea>' +
      '<button class="xdxc-btn" data-action="send-pm">发送</button>' +
      "</div>"
    );
  }

  // ---------- 💗 关系页面 ----------

  function renderRelationshipHtml(state) {
    var archive = state.archive;
    var sub = state.relationshipSubTab || "user";

    var tabsHtml =
      '<div class="xdxc-btn-row" style="margin-bottom:12px;">' +
      '<button class="xdxc-btn' + (sub === "user" ? "" : " secondary") + '" data-action="rel-sub-tab" data-sub="user">与你的关系</button>' +
      '<button class="xdxc-btn' + (sub === "char" ? "" : " secondary") + '" data-action="rel-sub-tab" data-sub="char">嘉宾之间</button>' +
      "</div>";

    var bodyHtml = "";
    if (sub === "user") {
      var userEntries = Object.keys(archive.relationships.userToChar);
      if (userEntries.length === 0) {
        bodyHtml = '<div class="xdxc-empty">还没有任何关系发展</div>';
      } else {
        bodyHtml = userEntries.map(function (charId) {
          var rel = archive.relationships.userToChar[charId];
          var c = null;
          for (var i = 0; i < archive.characters.length; i++) {
            if (archive.characters[i].characterId === charId) { c = archive.characters[i]; break; }
          }
          if (!c) return "";
          var tagsHtml = rel.tags.map(function (t) { return '<span class="xdxc-tag">' + escapeHtml(t) + "</span>"; }).join("");
          var lastMilestone = rel.milestones.length ? rel.milestones[rel.milestones.length - 1] : null;
          return (
            '<div class="xdxc-card">' +
            '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">' +
            '<img class="xdxc-avatar" src="' + escapeHtml(c.avatar || "") + '" />' +
            '<div class="xdxc-card-title">' + escapeHtml(c.handle || c.name) + "</div>" +
            "</div>" +
            (tagsHtml || '<span class="xdxc-card-sub">暂无标签</span>') +
            '<div class="xdxc-card-quote" style="margin-top:8px;">' + escapeHtml(rel.statusLine || "") + "</div>" +
            (lastMilestone ? '<div class="xdxc-card-sub" style="margin-top:6px;">最近事件：DAY' + lastMilestone.day + " · " + escapeHtml(lastMilestone.event) + "</div>" : "") +
            "</div>"
          );
        }).join("");
      }
    } else {
      var charEntries = Object.keys(archive.relationships.charToChar);
      if (charEntries.length === 0) {
        bodyHtml = '<div class="xdxc-empty">嘉宾之间暂无产生过关系动态</div>';
      } else {
        bodyHtml = charEntries.map(function (pairKey) {
          var rel = archive.relationships.charToChar[pairKey];
          var ids = pairKey.split("_");
          var names = ids.map(function (id) {
            for (var i = 0; i < archive.characters.length; i++) {
              if (archive.characters[i].characterId === id) return archive.characters[i].handle || archive.characters[i].name;
            }
            return id;
          });
          var tagsHtml = rel.tags.map(function (t) { return '<span class="xdxc-tag">' + escapeHtml(t) + "</span>"; }).join("");
          var lastMilestone = rel.milestones.length ? rel.milestones[rel.milestones.length - 1] : null;
          return (
            '<div class="xdxc-card">' +
            '<div class="xdxc-card-title">' + escapeHtml(names[0] || "") + " ⇄ " + escapeHtml(names[1] || "") + "</div>" +
            '<div style="margin:6px 0;">' + (tagsHtml || '<span class="xdxc-card-sub">暂无标签</span>') + "</div>" +
            (lastMilestone ? '<div class="xdxc-card-sub">最近事件：DAY' + lastMilestone.day + " · " + escapeHtml(lastMilestone.event) + "</div>" : "") +
            "</div>"
          );
        }).join("");
      }
    }

    return (
      '<div class="xdxc-card-title" style="font-size:18px;margin-bottom:12px;">💗 关系</div>' +
      tabsHtml +
      bodyHtml
    );
  }

  // ---------- 事件绑定与主流程 ----------

  function bindEvents(root, roche, state, rerender) {
    root.onclick = async function (ev) {
      var el = ev.target.closest("[data-action]");
      if (!el) return;
      var action = el.getAttribute("data-action");

      try {
        if (action === "new-archive") {
          state.screen = "newArchive";
          state.wizard = null;
          await rerender();
        } else if (action === "cancel-new-archive") {
          state.wizard = null;
          state.screen = null;
          await rerender();
        } else if (action === "confirm-new-archive") {
          await confirmNewArchive(roche, state);
          await rerender();
        } else if (action === "open-archive") {
          var id = el.getAttribute("data-id");
          state.archive = await loadArchive(roche, id);
          state.screen = "show";
          state.lastResult = null;
          await rerender();
        } else if (action === "delete-archive") {
          ev.stopPropagation();
          var delId = el.getAttribute("data-id");
          var ok = await roche.ui.confirm({ title: "删除档案", message: "确定要删除这个恋综档案吗？此操作无法撤销。" });
          if (ok) {
            await deleteArchiveData(roche, delId);
            await rerender();
          }
        } else if (action === "back-to-archive-list") {
          state.archive = null;
          state.screen = null;
          await rerender();
        } else if (action === "nav-tab") {
          var tab = el.getAttribute("data-tab");
          if (tab === "archiveManage") {
            state.archive = null;
            state.screen = null;
          } else {
            state.screen = tab;
          }
          await rerender();
        } else if (action === "manual-save") {
          await saveArchive(state.archive, roche);
          roche.ui.toast("✓ 已保存 DAY" + String(state.archive.currentDay).padStart(2, "0") + " · " + state.archive.currentTime);
        } else if (action === "pick-choice") {
          var text = el.getAttribute("data-text");
          await runStoryAction(roche, state, rerender, text);
        } else if (action === "submit-custom-action") {
          var input = root.querySelector('[data-role="custom-action-input"]');
          var val = input ? input.value.trim() : "";
          if (!val) { roche.ui.toast("请输入内容"); return; }
          await runStoryAction(roche, state, rerender, val);
        } else if (action === "open-guest-detail") {
          state.currentGuestId = el.getAttribute("data-id");
          state.screen = "guestDetail";
          await rerender();
        } else if (action === "back-to-guest-list") {
          state.screen = "guestList";
          await rerender();
        } else if (action === "open-private-message") {
          state.currentGuestId = el.getAttribute("data-id");
          state.screen = "privateMessage";
          await rerender();
        } else if (action === "back-to-guest-detail") {
          state.screen = "guestDetail";
          await rerender();
        } else if (action === "send-pm") {
          var pmInput = root.querySelector('[data-role="pm-input"]');
          var pmVal = pmInput ? pmInput.value.trim() : "";
          if (!pmVal) { roche.ui.toast("请输入内容"); return; }
          state.pmSending = true;
          await rerender();
          try {
            await sendPrivateMessage(state.archive, roche, state.currentGuestId, pmVal);
          } catch (e) {
            roche.ui.toast("发送失败，请重试");
          }
          state.pmSending = false;
          await rerender();
        } else if (action === "rel-sub-tab") {
          state.relationshipSubTab = el.getAttribute("data-sub");
          await rerender();
        } else if (action === "add-guest") {
          await renderAddGuestPicker(root, roche, state);
        } else if (action === "cancel-add-guest") {
          await rerender();
        } else if (action === "confirm-add-guest") {
          var newCharId = el.getAttribute("data-id");
          await addNewGuestToArchive(state.archive, roche, newCharId);
          state.screen = "guestList";
          roche.ui.toast("新嘉宾已加入");
          await rerender();
        }
      } catch (err) {
        roche.ui.toast("操作失败：" + (err && err.message ? err.message : "未知错误"));
      }
    };
  }

  async function runStoryAction(roche, state, rerender, actionText) {
    if (state.archive.pendingRequest) {
      roche.ui.toast("剧情正在生成，请稍候");
      return;
    }
    await rerender();
    try {
      var data = await advanceStory(state.archive, roche, actionText);
      state.lastResult = data;
    } catch (e) {
      // 错误已在 advanceStory 内部通过 toast 提示
    }
    await rerender();
  }

  // ---------- 插件注册 ----------

  window.RochePlugin.register({
    id: PLUGIN_ID,
    name: "心动现场",
    version: "1.0.0",
    apps: [
      {
        id: APP_ID,
        name: "心动现场",
        icon: "favorite",
        iconImage: "",
        async mount(container, roche) {
          injectStyle();
          container.innerHTML = '<div class="roche-plugin-xindong"><div class="xdxc-screen">加载中...</div></div>';

          var state = {
            archive: null,
            screen: null,
            wizard: null,
            currentGuestId: null,
            relationshipSubTab: "user",
            lastResult: null,
            pmSending: false,
            settings: (await roche.storage.get("settings")) || { danmuEnabled: true }
          };

          var root = container.querySelector(".roche-plugin-xindong");

          async function rerender() {
            await render(root, roche, state);
          }

          bindEvents(root, roche, state, rerender);
          container._xdxcState = state;
          container._xdxcRerender = rerender;

          await rerender();
        },
        async unmount(container) {
          removeStyle();
          container.replaceChildren();
        }
      }
    ]
  });
})();


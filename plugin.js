/* 《心动现场》 v1.2.0

作者：linyin8945

本版：全屏、设置、沉浸/记忆模式、嘉宾详情、观察室、心动小屋、玩法入口
*/
(() => {
"use strict";

const PLUGIN_ID="xindong-xianchang";
const APP_ID="xindong-xianchang-home";
const STYLE_ID="xindong-xianchang-style";

const state={
roche,container,activeTab:"show",page:"tab",stack:[],
user,candidateCharacters:[],characters:[],archives:[],currentArchive,
listeners:[]
};

const esc=v=>String(v??"").replace(/&/g,"&").replace(/</g,"<")
.replace(/>/g,">").replace(/"/g,""").replace(/'/g,"'");
const uid=()=>globalThis.crypto?.randomUUID?crypto.randomUUID():
archive-${Date.now()}-${Math.random().toString(16).slice(2)};
const name=(x,f="未命名")=>x?.name||x?.handle||f;
const img=x=>x?.avatar||"";

async function get(k,f){try{return (await state.roche.storage.get(k))??f}catch{return f}}
async function set(k,v){try{await state.roche.storage.set(k,v)}catch(e){console.error("[心动现场]",e)}}
async function del(k){try{await state.roche.storage.delete(k)}catch{}}
function toast(t){try{state.roche.ui.toast(t)}catch{console.log(t)}}
function mode(){return state.currentArchive?.settings?.mode||"immersive"}
function modeText(m=mode()){return m==="memory"?"记忆融合":"沉浸恋综"}
function avatar(x,cl="xd-avatar"){
return img(x)?<div class="${cl}"><img src="${esc(img(x))}" alt=""></div>:
<div class="${cl}">${esc(name(x,"♡").slice(0,1))}</div>;
}
function mini(x){return avatar(x,"xd-mini-avatar")}
function head(k,t,n=""){return `<div class="xd-kicker">${esc(k)}</div>

<div class="xd-section-head" style="margin-top:5px"><div class="xd-section-title">${esc(t)}</div>
${n?`<div class="xd-section-note">${esc(n)}</div>`:""}</div>`}
function chars(){return state.currentArchive?.characters||[]}
function relation(c){
  return state.currentArchive?.relationships?.userToChar?.[c.id]||{
    status:"刚认识",statusLine:"你们的故事才刚刚开始。",
    tags:["尚未定义"],recentEvent:""
  };
}

function style(){
if(document.getElementById(STYLE_ID))return;
const s=document.createElement("style");s.id=STYLE_ID;s.textContent=.roche-plugin-xindong-xianchang,.roche-plugin-xindong-xianchang *{box-sizing:border-box}
.roche-plugin-xindong-xianchang{--p:#b88791;--pd:#855d67;--pf:#f1e5e6;--t:#41383a;--m:#8e8183;--line:rgba(117,91,97,.13);--shadow:0 14px 40px rgba(102,73,80,.08);position:relative!important;width:100%!important;height:100%!important;min-height:0!important;margin:0!important;padding:0!important;overflow:hidden!important;background:radial-gradient(circle at 92% 7%,rgba(210,169,176,.18),transparent 30%),radial-gradient(circle at 7% 75%,rgba(222,191,196,.18),transparent 28%),linear-gradient(145deg,#f8f4f3,#f3eded 48%,#f7f1f1);color:var(--t);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Helvetica Neue",Arial,sans-serif;display:flex;flex-direction:column}
.roche-plugin-xindong-xianchang button,.roche-plugin-xindong-xianchang input{font:inherit}
.xd-topbar{height:72px;min-height:72px;flex:0 0 auto;padding:12px 14px 8px;display:flex;align-items:flex-end;gap:8px;background:rgba(249,246,245,.78);border-bottom:1px solid var(--line);backdrop-filter:blur(22px) saturate(125%);position:relative;z-index:20}
.xd-back,.xd-setting{width:40px;height:40px;flex:0 0 40px;border:0;border-radius:14px;background:rgba(255,255,255,.64);color:var(--pd);display:grid;place-items:center;cursor:pointer;box-shadow:0 4px 18px rgba(101,73,80,.06)}
.xd-back{font-size:25px}.xd-setting{font-size:17px}.xd-back:active,.xd-setting:active{transform:scale(.95)}
.xd-heading{min-width:0;flex:1;padding-bottom:2px}.xd-eyebrow,.xd-kicker{font-size:10px;letter-spacing:.18em;color:var(--p);font-weight:750}.xd-title{font-size:21px;line-height:1.15;letter-spacing:-.03em;font-weight:760;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.xd-topday{flex:0 0 auto;padding:8px 11px;border-radius:13px;background:rgba(255,255,255,.65);border:1px solid rgba(145,110,118,.1);text-align:right;margin-bottom:1px}.xd-topday-main{display:block;font-size:11px;font-weight:750;letter-spacing:.08em;color:var(--pd)}.xd-topday-sub{display:block;margin-top:2px;font-size:9px;color:var(--m);letter-spacing:.12em}
.xd-content{flex:1 1 auto;min-height:0;overflow:hidden;position:relative}.xd-page{width:100%;height:100%;overflow-y:auto;padding:18px 16px 104px;scrollbar-width:none}.xd-page::-webkit-scrollbar{display:none}
.xd-bottom{height:82px;min-height:82px;flex:0 0 auto;padding:8px 10px 15px;display:grid;grid-template-columns:repeat(4,1fr);gap:5px;background:rgba(250,247,246,.88);border-top:1px solid var(--line);backdrop-filter:blur(22px) saturate(125%);position:relative;z-index:20}
.xd-tab{border:0;background:transparent;color:#a09597;border-radius:16px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px}.xd-tab-icon{width:29px;height:29px;border-radius:11px;display:grid;place-items:center;font-size:16px}.xd-tab-label{font-size:10px;font-weight:650}.xd-tab.active{color:var(--pd)}.xd-tab.active .xd-tab-icon{background:var(--pf);box-shadow:inset 0 0 0 1px rgba(184,135,145,.1);transform:translateY(-1px)}
.xd-section-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin:22px 2px 10px}.xd-section-title{font-size:17px;font-weight:780}.xd-section-note{font-size:10px;color:var(--m)}
.xd-hero{margin-top:7px;padding:22px 20px 20px;border-radius:27px;min-height:220px;position:relative;overflow:hidden;background:linear-gradient(135deg,rgba(255,255,255,.9),rgba(245,229,231,.8));border:1px solid rgba(157,116,124,.13);box-shadow:var(--shadow)}.xd-hero:before{content:"";position:absolute;width:190px;height:190px;border-radius:50%;right:-55px;top:-80px;background:rgba(184,135,145,.16)}.xd-hero>*{position:relative;z-index:1}.xd-hero-title{margin:8px 0 7px;font-size:32px;line-height:1.05;letter-spacing:-.055em;font-weight:800}.xd-hero-sub{max-width:320px;color:#75696b;font-size:13px;line-height:1.7}.xd-live{display:inline-flex;align-items:center;gap:6px;margin-top:19px;padding:7px 10px;border-radius:999px;background:rgba(255,255,255,.7);color:var(--pd);font-size:10px;font-weight:750}.xd-live-dot{width:6px;height:6px;border-radius:50%;background:var(--p);box-shadow:0 0 0 4px rgba(184,135,145,.12)}
.xd-scene{border-radius:23px;background:rgba(255,255,255,.72);border:1px solid var(--line);padding:17px;box-shadow:0 8px 25px rgba(96,70,76,.045)}.xd-scene+.xd-scene{margin-top:11px}.xd-scene-label{font-size:10px;color:var(--p);letter-spacing:.12em;font-weight:750}.xd-narrative{margin-top:10px;font-size:14px;line-height:1.85;color:#4b4143}.xd-quote{margin-top:13px;padding:12px 13px;border-left:2px solid var(--p);background:rgba(245,231,233,.48);border-radius:0 13px 13px 0;font-size:13px;line-height:1.65;color:#65575a}
.xd-choice-grid,.xd-card-grid{display:grid;gap:9px}.xd-choice,.xd-activity{width:100%;text-align:left;border:1px solid rgba(143,105,113,.12);background:rgba(255,255,255,.78);color:#514548;border-radius:17px;padding:14px 15px;cursor:pointer;transition:.16s}.xd-choice:hover,.xd-activity:hover{border-color:rgba(184,135,145,.35);background:#fffafa}.xd-choice-no{display:inline-block;width:23px;color:var(--p);font-size:11px;font-weight:800}
.xd-primary{margin-top:15px;border:0;border-radius:15px;padding:11px 16px;background:#a97983;color:white;font-size:12px;font-weight:750;cursor:pointer;box-shadow:0 7px 18px rgba(132,91,101,.18)}.xd-small{flex:1;border:1px solid rgba(140,104,112,.13);background:rgba(255,255,255,.65);color:var(--pd);border-radius:13px;padding:9px;font-size:10px;font-weight:720;cursor:pointer}
.xd-profile,.xd-guest{display:flex;align-items:center;gap:13px;padding:13px;border-radius:20px;background:rgba(255,255,255,.76);border:1px solid var(--line);box-shadow:0 7px 22px rgba(101,73,80,.045)}.xd-guest{width:100%;cursor:pointer;text-align:left}.xd-guest:active,.xd-activity:active{transform:scale(.985)}
.xd-avatar{width:54px;height:54px;flex:0 0 54px;border-radius:17px;overflow:hidden;background:linear-gradient(145deg,#e8d5d8,#f4e8e9);display:grid;place-items:center;color:var(--pd);font-size:19px;font-weight:800}.xd-avatar img,.xd-mini-avatar img{width:100%;height:100%;object-fit:cover;display:block}.xd-guest-main{min-width:0;flex:1}.xd-guest-name{font-size:15px;font-weight:780}.xd-guest-handle{margin-top:3px;font-size:10px;color:var(--p)}.xd-relation-pill,.xd-tag{display:inline-flex;margin-top:6px;padding:5px 8px;border-radius:999px;background:var(--pf);color:var(--pd);font-size:9px;font-weight:700}.xd-arrow{color:#b3a5a8;font-size:18px}
.xd-profile .xd-avatar{width:62px;height:62px;flex-basis:62px;border-radius:19px}.xd-profile-name{font-size:17px;font-weight:800}.xd-profile-handle{margin-top:3px;color:var(--p);font-size:10px}.xd-profile-bio{margin-top:6px;color:var(--m);font-size:11px}
.xd-empty{text-align:center;padding:38px 20px;border-radius:23px;border:1px dashed rgba(140,104,112,.18);background:rgba(255,255,255,.42)}.xd-empty-icon{font-size:27px;margin-bottom:9px}.xd-empty-title{font-size:15px;font-weight:780}.xd-empty-text{margin-top:6px;font-size:11px;line-height:1.7;color:var(--m)}
.xd-archive{position:relative;padding:18px;border-radius:23px;background:linear-gradient(140deg,rgba(255,255,255,.88),rgba(245,229,231,.7));border:1px solid var(--line);box-shadow:var(--shadow);overflow:hidden}.xd-archive-title{font-size:20px;font-weight:800}.xd-archive-meta{margin-top:6px;font-size:10px;color:var(--m)}.xd-archive-people{display:flex;margin-top:15px}.xd-mini-avatar{width:34px;height:34px;border-radius:12px;overflow:hidden;background:#eadbde;border:2px solid #fffafa;margin-left:-7px;display:grid;place-items:center;color:var(--pd);font-size:11px;font-weight:800}.xd-mini-avatar:first-child{margin-left:0}.xd-archive-summary{margin-top:13px;color:#76696b;font-size:11px;line-height:1.7}.xd-archive-actions{display:flex;gap:8px;margin-top:14px}.xd-new{width:100%;margin-top:11px;padding:15px;border-radius:19px;border:1px dashed rgba(167,121,131,.25);background:rgba(255,255,255,.36);color:var(--pd);font-size:12px;font-weight:750;cursor:pointer}
.xd-house{position:relative;margin-top:10px;min-height:390px;border-radius:29px;padding:21px 15px 19px;overflow:hidden;background:linear-gradient(155deg,rgba(255,255,255,.94),rgba(242,225,228,.86));border:1px solid rgba(157,116,124,.13);box-shadow:var(--shadow)}.xd-house-title{font-size:25px;font-weight:800}.xd-house-sub{margin-top:3px;font-size:10px;color:var(--m)}.xd-building{position:relative;margin:23px auto 0;width:min(100%,370px);height:285px;padding:18px;border-radius:27px;background:linear-gradient(145deg,rgba(255,255,255,.83),rgba(248,237,238,.78));border:1px solid rgba(157,116,124,.12);box-shadow:inset 0 0 0 8px rgba(255,255,255,.22),0 12px 30px rgba(101,73,80,.06)}.xd-room{position:absolute;border:1px solid rgba(154,112,121,.16);background:rgba(255,255,255,.72);color:#685b5e;border-radius:19px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-weight:760;transition:.17s}.xd-room:hover{background:#fffafa;border-color:rgba(184,135,145,.35);transform:translateY(-2px)}.xd-room-icon{font-size:22px}.xd-room-name{font-size:11px}.xd-room-note{font-size:8px;color:#a29295}.r1{left:7%;top:8%;width:39%;height:27%}.r2{right:7%;top:8%;width:39%;height:27%}.r3{left:7%;bottom:8%;width:39%;height:27%}.r4{right:7%;bottom:8%;width:39%;height:27%}.r5{left:31%;top:37%;width:38%;height:27%;background:linear-gradient(145deg,rgba(248,231,233,.9),rgba(255,255,255,.84))}
.xd-activity{display:flex;align-items:center;gap:13px}.xd-activity-icon{width:47px;height:47px;flex:0 0 47px;border-radius:16px;display:grid;place-items:center;background:var(--pf);font-size:22px}.xd-activity-main{min-width:0;flex:1}.xd-activity-title{font-size:14px;font-weight:800}.xd-activity-desc{margin-top:4px;color:var(--m);font-size:10px;line-height:1.55}
.xd-detail{margin-top:12px;padding:17px;border-radius:22px;background:rgba(255,255,255,.76);border:1px solid var(--line);box-shadow:0 7px 22px rgba(101,73,80,.035)}.xd-detail-label{font-size:10px;color:var(--p);font-weight:800;letter-spacing:.13em}.xd-detail-title{margin-top:5px;font-size:15px;font-weight:800}.xd-persona{margin-top:11px;border-radius:16px;background:rgba(247,240,240,.78);overflow:hidden}.xd-persona-text{padding:12px;color:#76696b;font-size:11px;line-height:1.7;max-height:78px;overflow:hidden}.xd-persona-text.open{max-height:none}.xd-persona-toggle{width:100%;border:0;border-top:1px solid rgba(117,91,97,.08);background:rgba(255,255,255,.5);color:var(--pd);padding:10px;font-size:10px;font-weight:750;cursor:pointer}.xd-relation-big{display:flex;align-items:center;gap:12px;margin-top:13px}.xd-heart{width:46px;height:46px;flex:0 0 46px;border-radius:15px;display:grid;place-items:center;background:var(--pf);color:var(--pd);font-size:21px}.xd-status{font-size:15px;font-weight:800}.xd-substatus{margin-top:3px;font-size:10px;color:var(--m)}.xd-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:13px}.xd-message{width:100%;display:flex;align-items:center;gap:12px;border:1px solid rgba(157,116,124,.11);padding:14px;border-radius:18px;background:linear-gradient(135deg,rgba(255,255,255,.92),rgba(245,229,231,.75));color:var(--t);cursor:pointer;text-align:left}.xd-message-icon{width:42px;height:42px;flex:0 0 42px;border-radius:14px;display:grid;place-items:center;background:rgba(255,255,255,.72);font-size:19px}
.xd-setting-mode{width:100%;text-align:left;margin-top:9px;padding:14px;border-radius:18px;border:1px solid rgba(143,105,113,.12);background:rgba(255,255,255,.78);color:#514548;cursor:pointer}.xd-setting-mode.active{background:var(--pf);border-color:rgba(184,135,145,.3)}.xd-setting-mode-title{font-size:13px;font-weight:800}.xd-setting-mode-desc{margin-top:5px;color:var(--m);font-size:10px;line-height:1.6}.xd-check{float:right;color:var(--pd);font-weight:900}
.xd-chat{height:100%;display:flex;flex-direction:column}.xd-chat-head{display:flex;align-items:center;gap:10px;padding:10px 2px 12px;border-bottom:1px solid var(--line)}.xd-chat-head .xd-avatar{width:43px;height:43px;flex-basis:43px;border-radius:14px}.xd-chat-body{flex:1;overflow-y:auto;padding:17px 3px}.xd-chat-placeholder{text-align:center;margin-top:50px;color:var(--m);font-size:11px;line-height:1.8}.xd-chat-disabled{padding:12px;text-align:center;color:var(--m);background:rgba(255,255,255,.55);border-top:1px solid var(--line);font-size:10px}
.xd-modal-wrap{position:absolute;inset:0;z-index:100;background:rgba(67,51,55,.2);backdrop-filter:blur(5px);display:flex;align-items:flex-end}.xd-modal{width:100%;max-height:88%;overflow-y:auto;background:#fbf8f7;border-radius:28px 28px 0 0;padding:21px 17px 28px;box-shadow:0 -12px 45px rgba(72,51,57,.15)}.xd-handle{width:37px;height:4px;border-radius:99px;background:#d7c8ca;margin:-5px auto 17px}.xd-field{margin-top:15px}.xd-field label{display:block;font-size:10px;color:var(--m);font-weight:700;margin-bottom:7px}.xd-field input{width:100%;border:1px solid rgba(140,104,112,.15);background:white;color:var(--t);border-radius:14px;padding:12px;outline:0}.xd-modal-actions{display:flex;gap:8px;margin-top:18px}.xd-modal-actions button{flex:1}
@media(max-width:380px){.xd-topbar{padding-left:10px;padding-right:10px}.xd-back,.xd-setting{width:36px;height:36px;flex-basis:36px}.xd-title{font-size:19px}.xd-page{padding-left:13px;padding-right:13px}}
@media(min-width:700px){.roche-plugin-xindong-xianchang{max-width:520px;margin:0 auto!important;border-left:1px solid rgba(120,90,96,.08);border-right:1px solid rgba(120,90,96,.08)}};document.head.appendChild(s);
}

function shell(){
state.container.innerHTML=`<div class="roche-plugin-xindong-xianchang">

<header class="xd-topbar">
<button class="xd-back" data-back>‹</button>
<div class="xd-heading"><div class="xd-eyebrow">LOVE REALITY SHOW</div><div class="xd-title">心动现场</div></div>
<button class="xd-setting" data-settings>⚙</button>
<div class="xd-topday"><span class="xd-topday-main" data-day>DAY 01</span><span class="xd-topday-sub">ON AIR</span></div>
</header>
<main class="xd-content" data-content></main>
<nav class="xd-bottom">
<button class="xd-tab active" data-tab="show"><span class="xd-tab-icon">▣</span><span class="xd-tab-label">节目</span></button>
<button class="xd-tab" data-tab="guests"><span class="xd-tab-icon">♧</span><span class="xd-tab-label">嘉宾档案</span></button>
<button class="xd-tab" data-tab="watch"><span class="xd-tab-icon">📺</span><span class="xd-tab-label">观察室</span></button>
<button class="xd-tab" data-tab="archives"><span class="xd-tab-icon">▤</span><span class="xd-tab-label">档案</span></button>
</nav></div>`;

state.container.querySelectorAll("[data-tab]").forEach(b=>{
const h=()=>{state.page="tab";state.stack=[];state.activeTab=b.dataset.tab;render()};
b.addEventListener("click",h);state.listeners.push(()=>b.removeEventListener("click",h));
});
const back=state.container.querySelector("[data-back]");
const bh=()=>{if(state.page!=="tab")backPlugin();else{try{state.roche.ui.closeApp()}catch{toast("无法返回 Roche")}}};
back.addEventListener("click",bh);state.listeners.push(()=>back.removeEventListener("click",bh));
const setb=state.container.querySelector("[data-settings]");
const sh=()=>openSettings();setb.addEventListener("click",sh);state.listeners.push(()=>setb.removeEventListener("click",sh));
}

function show(){
if(!state.currentArchive)return `<div class="xd-page">${head("WELCOME","还没有恋综","先创建一个属于你的世界")}

<section class="xd-hero"><div class="xd-kicker">YOUR REALITY SHOW</div><div class="xd-hero-title">心动现场</div><div class="xd-hero-sub">选择你的身份、嘉宾与世界，再让故事真正开始。</div><button class="xd-primary" data-new>＋ 创建第一档恋综</button></section></div>`;
 const a=state.currentArchive,d=a.currentDay||1;
 return `<div class="xd-page">${head("TONIGHT · LIVE","正在播出",`当前模式 · ${modeText()}`)}
<section class="xd-hero"><div class="xd-kicker">EPISODE ${String(d).padStart(2,"0")}</div><div class="xd-hero-title">${esc(a.title)}</div><div class="xd-hero-sub">一场关于靠近、试探与心动的真人秀。没有人知道下一秒谁会先动心。</div><div class="xd-live"><span class="xd-live-dot"></span> LIVE · ${esc(a.currentSceneLabel||"心动小屋 · 客厅")}</div></section>
<div class="xd-section-head"><div class="xd-section-title">今晚的现场</div><div class="xd-section-note">DAY ${String(d).padStart(2,"0")} · ${esc(a.currentTime||"20:36")}</div></div>
<section class="xd-scene"><div class="xd-scene-label">${esc(a.currentSceneLabel||"心动小屋 · 客厅")}</div><div class="xd-narrative">${esc(a.lastNarrative||"夕阳落进客厅的玻璃窗。节目组没有宣布新的任务，空气却比往常安静了一些。几个人各自做着手里的事，偶尔的目光交错，让今晚显得格外微妙。")}</div><div class="xd-quote">${esc(a.lastQuote||"“你今天……好像一直在看我。”")}</div></section>
<div class="xd-section-head"><div class="xd-section-title">心动小屋</div><div class="xd-section-note">场景探索</div></div>
<button class="xd-activity" data-house><div class="xd-activity-icon">🏡</div><div class="xd-activity-main"><div class="xd-activity-title">进入心动小屋</div><div class="xd-activity-desc">查看嘉宾现在在哪里，选择你想关注的镜头。</div></div><div class="xd-arrow">›</div></button>
<div class="xd-section-head"><div class="xd-section-title">今日玩法</div><div class="xd-section-note">PROGRAM</div></div>
<div class="xd-card-grid">
${activity("kitchen","🍳","厨房大战","一场恋综小游戏入口。")}
${activity("message","💌","匿名短信夜","给一位嘉宾发送一条秘密消息。")}
${activity("gift","🎁","心动礼物","选择一份礼物，等待它被谁收到。")}
</div>
<div class="xd-section-head"><div class="xd-section-title">观众席</div><div class="xd-section-note">LIVE DANMU</div></div>
<div class="xd-danmu"><span>这气氛突然不对劲了</span><span>救命谁先移开视线</span><span>节目组你最好有事</span></div>
</div>`;
}
function activity(id,icon,title,desc){return `<button class="xd-activity" data-activity="${id}"><div class="xd-activity-icon">${icon}</div><div class="xd-activity-main"><div class="xd-activity-title">${title}</div><div class="xd-activity-desc">${desc}</div></div><div class="xd-arrow">›</div></button>`}

function guests(){
if(!state.currentArchive)return <div class="xd-page">${head("THE CAST","本季嘉宾","尚未开机")}<div class="xd-empty"><div class="xd-empty-icon">♡</div><div class="xd-empty-title">嘉宾还没有入住</div><div class="xd-empty-text">Roche 中的角色只是候选池。创建恋综并选择嘉宾后，他们才会出现在这里。</div><button class="xd-primary" data-new>创建恋综</button></div></div>;
return <div class="xd-page">${head("THE CAST","本季嘉宾",${chars().length} 位已入住`)}

<div class="xd-profile">${avatar(state.user)}<div><div class="xd-profile-name">${esc(name(state.user,"我的人设"))}</div><div class="xd-profile-handle">${state.user?.handle?"@"+esc(state.user.handle):"USER"}</div><div class="xd-profile-bio">本季唯一女嘉宾</div></div></div>
<div class="xd-section-head"><div class="xd-section-title">入住嘉宾</div><div class="xd-section-note">点击查看详情</div></div>
<div class="xd-card-grid">${chars().length?chars().map(c=>{let r=relation(c);return `<button class="xd-guest" data-guest="${esc(c.id)}">${avatar(c)}<div class="xd-guest-main"><div class="xd-guest-name">${esc(name(c))}</div><div class="xd-guest-handle">${c.handle?"@"+esc(c.handle):"GUEST"}</div><span class="xd-relation-pill">${esc(r.status||"刚认识")}</span></div><div class="xd-arrow">›</div></button>`}).join(""):`<div class="xd-empty"><div class="xd-empty-title">本季还没有嘉宾</div></div>`}</div></div>`;
}

function watch(){
if(!state.currentArchive)return <div class="xd-page">${head("OBSERVATION","观察室","没有你的镜头")}<div class="xd-empty"><div class="xd-empty-icon">📺</div><div class="xd-empty-title">观察室还没有节目</div><div class="xd-empty-text">创建恋综并入住嘉宾之后，这里才会记录你不在场时发生的事情。</div></div></div>;
let o=state.currentArchive.observations||[];
return `<div class="xd-page">${head("OBSERVATION","观察室","没有你的镜头")}

<section class="xd-hero" style="min-height:175px"><div class="xd-kicker">OFF CAMERA</div><div class="xd-hero-title" style="font-size:26px">你离开镜头以后……</div><div class="xd-hero-sub">这里会记录嘉宾们在你没有参与时的聊天、活动与小插曲。</div></section>
<div class="xd-section-head"><div class="xd-section-title">今日观察</div><div class="xd-section-note">DAY ${String(state.currentArchive.currentDay||1).padStart(2,"0")}</div></div>
<div class="xd-card-grid">${o.length?o.map(x=>`<section class="xd-scene"><div class="xd-scene-label">${esc(x.location||"未知地点")}</div><div class="xd-narrative">${esc(x.text||"这一段观察还没有内容。")}</div></section>`).join(""):`<section class="xd-scene"><div class="xd-scene-label">厨房</div><div class="xd-narrative">你离开以后，厨房里依旧有人留下。节目组的镜头暂时没有跟着你。</div></section><section class="xd-scene"><div class="xd-scene-label">客厅</div><div class="xd-narrative">客厅里有人聊起了今天的晚餐。镜头已经悄悄切到了这里。</div></section>`}</div></div>`;
}

function archives(){
return <div class="xd-page">${head("YOUR SHOWS","恋综档案",${state.archives.length} 个世界`)}

<div class="xd-empty" style="padding:27px 18px"><div class="xd-empty-icon">✦</div><div class="xd-empty-title">一个档案，就是一个完整世界</div><div class="xd-empty-text">不同恋综之间的人设、剧情、关系和记忆彼此独立。</div></div>
<div class="xd-card-grid" style="margin-top:11px">${state.archives.map(a=>`<article class="xd-archive"><div class="xd-archive-title">${esc(a.title)}</div><div class="xd-archive-meta">DAY ${String(a.currentDay||1).padStart(2,"0")} · ${(a.characterNames||[]).length} 位嘉宾 · ${esc(a.modeLabel||"沉浸恋综")}</div><div class="xd-archive-people">${(a.characterSnapshots||[]).slice(0,5).map(mini).join("")}</div><div class="xd-archive-summary">${esc(a.lastSummary||"还没有发生故事。")}</div><div class="xd-archive-actions"><button class="xd-small" data-open="${esc(a.archiveId)}">进入档案</button><button class="xd-small" data-delete="${esc(a.archiveId)}">删除</button></div></article>`).join("")}</div>
<button class="xd-new" data-new>＋ 创建新的恋综世界</button></div>`;
}

function guest(c){
const r=relation(c),p=c.personaSnapshot||c.persona||c.bio||"这个人还没有留下节目人设。";
return `<div class="xd-page">${head("GUEST PROFILE",name(c),"嘉宾档案")}

<section class="xd-hero" style="min-height:0;text-align:center;padding:20px"><div style="display:flex;justify-content:center">${avatar(c)}</div><div class="xd-hero-title" style="font-size:23px">${esc(name(c))}</div><div class="xd-hero-sub" style="margin:auto">${c.handle?"@"+esc(c.handle):"GUEST"}</div></section>
<section class="xd-detail"><div class="xd-detail-label">PERSONA</div><div class="xd-detail-title">节目人设</div><div class="xd-persona"><div class="xd-persona-text" data-persona>${esc(p)}</div><button class="xd-persona-toggle" data-expand>展开完整人设 ↓</button></div></section>
<section class="xd-detail"><div class="xd-detail-label">RELATIONSHIP</div><div class="xd-detail-title">你们的关系</div><div class="xd-relation-big"><div class="xd-heart">♡</div><div><div class="xd-status">${esc(r.status||"刚认识")}</div><div class="xd-substatus">${esc(r.statusLine||"你们的故事才刚刚开始。")}</div></div></div><div class="xd-tags">${(r.tags?.length?r.tags:["尚未定义"]).map(t=>`<span class="xd-tag">${esc(t)}</span>`).join("")}</div>${r.recentEvent?`<div style="margin-top:12px;font-size:10px;color:#8e8183">最近事件：${esc(r.recentEvent)}</div>`:""}</section>
<section class="xd-detail"><div class="xd-detail-label">PRIVATE MESSAGE</div><div class="xd-detail-title">私信</div><button class="xd-message" data-chat="${esc(c.id)}" style="margin-top:12px"><div class="xd-message-icon">💬</div><div style="flex:1"><b style="font-size:13px">打开私信</b><div style="margin-top:3px;color:#8e8183;font-size:10px">进入完整私信页面</div></div><div class="xd-arrow">›</div></button></section></div>`;
}

function chat(c){
return <div class="xd-page"><div class="xd-chat"><div class="xd-chat-head"><button class="xd-back" data-inner-back style="width:36px;height:36px;flex-basis:36px">‹</button>${avatar(c)}<div><b>${esc(name(c))}</b><div style="margin-top:3px;color:#8e8183;font-size:9px">${esc(state.currentArchive?.title||"心动现场")}</div></div></div><div class="xd-chat-body"><div class="xd-chat-placeholder"><div style="font-size:25px">💬</div>这里是完整私信页面。<br>角色主动私信、匿名短信等将在剧情引擎接入后启用。</div></div><div class="xd-chat-disabled">私信输入与角色主动消息将在后续剧情系统接入后启用</div></div></div>;
}

function house(){
return <div class="xd-page">${head("HOUSE CAMERA","心动小屋",DAY ${String(state.currentArchive?.currentDay||1).padStart(2,"0")}`)}

<section class="xd-house"><div class="xd-house-title">今晚，镜头看向哪里？</div><div class="xd-house-sub">地点不是移动，而是你选择关注的节目镜头。</div>
<div class="xd-building">
<button class="xd-room r1" data-location="厨房"><span class="xd-room-icon">🍳</span><span class="xd-room-name">厨房</span><span class="xd-room-note">晚餐准备中</span></button>
<button class="xd-room r2" data-location="客厅"><span class="xd-room-icon">🛋</span><span class="xd-room-name">客厅</span><span class="xd-room-note">公共区域</span></button>
<button class="xd-room r3" data-location="花园"><span class="xd-room-icon">🌿</span><span class="xd-room-name">花园</span><span class="xd-room-note">安静角落</span></button>
<button class="xd-room r4" data-location="浴室"><span class="xd-room-icon">🛁</span><span class="xd-room-name">浴室</span><span class="xd-room-note">私人区域</span></button>
<button class="xd-room r5" data-location="大厅"><span class="xd-room-icon">🏠</span><span class="xd-room-name">大厅</span><span class="xd-room-note">心动小屋</span></button>
</div></section>
<div class="xd-section-head"><div class="xd-section-title">今日玩法</div><div class="xd-section-note">PROGRAM</div></div><div class="xd-card-grid">${activity("kitchen","🍳","厨房大战","一场恋综小游戏入口。")}${activity("message","💌","匿名短信夜","给一位嘉宾发送一条秘密消息。")}${activity("gift","🎁","心动礼物","选择一份礼物，等待它被谁收到。")}</div></div>`;
}

function locationPage(loc){
const text={厨房:"晚餐时间快到了。有人已经开始准备食材，厨房里的气氛比客厅更热闹一些。",客厅:"客厅是今晚公共镜头最容易停留的地方。有人坐着，有人聊天，也有人安静观察。",花园:"花园的灯刚刚亮起来。这里比屋内安静，适合两个人单独说几句话。",浴室:"这里暂时没有节目组公开镜头。你只能看到门口经过的人影。",大厅:"大厅连接着整栋小屋。节目组偶尔会在这里宣布新的安排。"}[loc]||"这个地点还没有发生特别的事情。";
return `<div class="xd-page">${head("HOUSE CAMERA",loc,"当前镜头")}<section class="xd-scene"><div class="xd-scene-label">${esc(loc)}</div><div class="xd-narrative">${esc(text)}</div></section>

<div class="xd-section-head"><div class="xd-section-title">当前人物</div><div class="xd-section-note">${chars().length+1} 人</div></div><div class="xd-card-grid">${state.user?`<div class="xd-profile">${avatar(state.user)}<div><div class="xd-profile-name">${esc(name(state.user,"我"))}</div><div class="xd-profile-handle">USER · 你</div></div></div>`:""}${chars().slice(0,3).map(c=>`<button class="xd-guest" data-guest="${esc(c.id)}">${avatar(c)}<div class="xd-guest-main"><div class="xd-guest-name">${esc(name(c))}</div><div class="xd-guest-handle">${c.handle?"@"+esc(c.handle):"GUEST"}</div></div><div class="xd-arrow">›</div></button>`).join("")}</div>
<div class="xd-section-head"><div class="xd-section-title">可以做什么？</div></div><div class="xd-choice-grid"><button class="xd-choice" data-preview><span class="xd-choice-no">01</span>找一个人聊聊</button><button class="xd-choice" data-preview><span class="xd-choice-no">02</span>留在这里观察</button><button class="xd-choice" data-inner-back><span class="xd-choice-no">03</span>离开 ${esc(loc)}</button></div></div>`;
}

function activityPage(id){
const x={kitchen:["🍳","厨房大战","KITCHEN BATTLE","节目组把晚餐变成了一场小小的竞赛。你可以选择队友、分配任务，看看谁会在混乱里露出真正的性格。"],message:["💌","匿名短信夜","ANONYMOUS MESSAGE","今晚，你可以给一位嘉宾留下一句话。匿名、短暂，但也许会改变之后的镜头。"],gift:["🎁","心动礼物","HEART GIFT","节目组准备了几份礼物。你可以决定把其中一份交给谁。"]}[id]||[];
return <div class="xd-page">${head(x[2],x[1],"节目玩法")}<section class="xd-hero"><div style="font-size:42px">${x[0]}</div><div class="xd-hero-title" style="font-size:27px">${esc(x[1])}</div><div class="xd-hero-sub">${esc(x[3])}</div></section><div class="xd-section-head"><div class="xd-section-title">本次玩法</div><div class="xd-section-note">PREVIEW</div></div><div class="xd-choice-grid"><button class="xd-choice" data-preview><span class="xd-choice-no">01</span>开始这个节目环节</button><button class="xd-choice" data-inner-back><span class="xd-choice-no">02</span>暂时不参加</button></div><div class="xd-empty" style="margin-top:15px"><div class="xd-empty-icon">✦</div><div class="xd-empty-title">玩法规则还在生长</div><div class="xd-empty-text">这一版先把“节目环节”的空间搭好，下一阶段再让它真正影响剧情、关系和 DAY。</div></div></div>;
}

function settingsPage(){
if(!state.currentArchive)return <div class="xd-page">${head("SEASON SETTINGS","恋综设置")}<div class="xd-empty"><div class="xd-empty-icon">⚙</div><div class="xd-empty-title">先创建恋综</div><button class="xd-primary" data-new>创建恋综</button></div></div>;
const m=mode();
return `<div class="xd-page">${head("SEASON SETTINGS","恋综设置","当前档案")}<section class="xd-scene"><div class="xd-scene-label">PARTICIPATION MODE</div><div class="xd-narrative">决定本季开始时，Roche 中与你和嘉宾之间的旧关系是否被带进这个恋综世界。</div></section>

<div class="xd-section-head"><div class="xd-section-title">参与模式</div></div>
<button class="xd-setting-mode ${m==="immersive"?"active":""}" data-mode="immersive">${m==="immersive"?'<span class="xd-check">✓</span>':""}<div class="xd-setting-mode-title">🌸 沉浸恋综模式</div><div class="xd-setting-mode-desc">只读取本季锁定的人设、世界书与恋综设定。不把 Roche 的旧关系直接带入节目。</div></button>
<button class="xd-setting-mode ${m==="memory"?"active":""}" data-mode="memory">${m==="memory"?'<span class="xd-check">✓</span>':""}<div class="xd-setting-mode-title">🪞 记忆融合模式</div><div class="xd-setting-mode-desc">以人设为基础；后续剧情引擎接入后，允许 Roche 中与你和该角色的相关记忆参与判断。</div></button>
<section class="xd-detail"><div class="xd-detail-label">CURRENT</div><div class="xd-detail-title">当前模式：${esc(modeText(m))}</div><div style="margin-top:7px;font-size:10px;color:#8e8183">设置绑定当前恋综，不会影响其他档案。</div></section></div>`;
}

function render(){
const c=state.container?.querySelector("[data-content]");if(!c)return;
let h;
if(state.page==="guest")h=guest(state.stack.at(-1));
else if(state.page==="chat")h=chat(state.stack.at(-1));
else if(state.page==="house")h=house();
else if(state.page==="location")h=locationPage(state.stack.at(-1));
else if(state.page==="activity")h=activityPage(state.stack.at(-1));
else if(state.page==="settings")h=settingsPage();
else h=state.activeTab==="show"?show().activeTab==="guests"?guests().activeTab==="watch"?watch()();
c.innerHTML=h;bind();update();
}

function update(){
state.container?.querySelectorAll("[data-tab]").forEach(b=>b.classList.toggle("active",state.page==="tab"&&b.dataset.tab===state.activeTab));
const d=state.container?.querySelector("[data-day]");if(d)d.textContent=DAY ${String(state.currentArchive?.currentDay||1).padStart(2,"0")};
}

function push(page,x){state.page=page;state.stack=x===undefined?[]:[x];render()}
function backPlugin(){
if(state.stack.length)state.stack.pop();
if(!state.stack.length){state.page="tab";render();return}
const x=state.stack.at(-1);
state.page=typeof x==="string"?(["kitchen","message","gift"].includes(x)?"activity":"location"):"guest";
render();
}

function bind(){
const on=(sel,fn)=>state.container.querySelectorAll(sel).forEach(b=>{const h=()=>fn(b);b.addEventListener("click",h);state.listeners.push(()=>b.removeEventListener("click",h))});
on("[data-new]",()=>openCreate());
on("[data-house]",()=>push("house"));
on("[data-activity]",b=>push("activity",b.dataset.activity));
on("[data-location]",b=>push("location",b.dataset.location));
on("[data-guest]",b=>{const c=chars().find(x=>String(x.id)===String(b.dataset.guest));if(c)push("guest",c)});
on("[data-chat]",b=>{const c=chars().find(x=>String(x.id)===String(b.dataset.chat));if(c)push("chat",c)});
on("[data-inner-back]",()=>backPlugin());
on("[data-preview]",()=>toast("这一版先把入口做好，真实规则将在玩法引擎接入后生效。"));
on("[data-expand]",b=>{const p=state.container.querySelector("[data-persona]");if(!p)return;p.classList.toggle("open");b.textContent=p.classList.contains("open")?"收起人设 ↑":"展开完整人设 ↓"});
on("[data-mode]",async b=>{if(!state.currentArchive)return;state.currentArchive.settings.mode=b.dataset.mode;await save();toast(b.dataset.mode==="immersive"?"已切换为沉浸恋综模式":"已切换为记忆融合模式");render()});
on("[data-open]",async b=>{const a=state.archives.find(x=>x.archiveId===b.dataset.open);if(!a)return;state.currentArchive=await get(archive:${a.archiveId},a);state.characters=chars();state.activeTab="show";state.page="tab";state.stack=[];render()});
on("[data-delete]",async b=>{let ok=true;try{ok=await state.roche.ui.confirm({title:"删除恋综档案",message:"确定删除这个完整恋综世界吗？此操作无法恢复。"})}catch{}if(!ok)return;const id=b.dataset.delete;state.archives=state.archives.filter(x=>x.archiveId!==id);await set("archiveIndex",state.archives);await del(archive:${id});if(state.currentArchive?.archiveId===id){state.currentArchive=null;state.characters=[]}toast("档案已删除");render()});
}

function openSettings(){push("settings")}
function openCreate(){
const m=document.createElement("div");m.className="xd-modal-wrap";
const cs=state.candidateCharacters;
m.innerHTML=`<section class="xd-modal"><div class="xd-handle"></div><div class="xd-kicker">NEW SEASON</div><div class="xd-title" style="margin-top:5px">创建新的恋综</div>

<div class="xd-field"><label>恋综名称</label><input data-title placeholder="例如：心动小屋" maxlength="30"></div>
<div class="xd-field"><label>本季氛围</label><input data-tone value="温柔、暧昧、轻微修罗场" maxlength="60"></div>
<div class="xd-field"><label>当前 USER</label><div class="xd-profile">${avatar(state.user)}<div><div class="xd-profile-name">${esc(name(state.user,"当前 USER"))}</div><div class="xd-profile-handle">本季唯一女嘉宾</div></div></div></div>
<div class="xd-field"><label>选择嘉宾</label><div style="font-size:10px;color:#8e8183;line-height:1.6;margin-bottom:8px">Roche 角色只是候选池。勾选后，他们才会成为本季入住嘉宾。</div>
<div style="display:grid;gap:7px;max-height:210px;overflow:auto">${cs.map((c,i)=>`<label style="display:flex;align-items:center;gap:8px;padding:9px;background:white;border:1px solid rgba(140,104,112,.1);border-radius:14px"><input type="checkbox" data-pick value="${esc(c.id)}" ${i<4?"checked":""}>${mini(c)}<span style="flex:1"><b style="display:block;font-size:11px">${esc(name(c))}</b><small style="color:#a97983">${c.handle?"@"+esc(c.handle):"GUEST"}</small></span></label>`).join("")||`<div style="font-size:10px;color:#8e8183">没有读取到 Roche 角色候选。</div>`}</div></div>
<div class="xd-field"><label>参与模式</label><div style="padding:11px;border-radius:14px;background:#f7eeee;color:#735d62;font-size:10px;line-height:1.7">默认 <b>🌸 沉浸恋综模式</b>。创建后可在右上角设置中切换。</div></div>
<div class="xd-modal-actions"><button class="xd-small" data-cancel>取消</button><button class="xd-primary" style="margin-top:0" data-create>创建档案</button></div></section>`;
 state.container.querySelector(".roche-plugin-xindong-xianchang").appendChild(m);
 m.querySelector("[data-cancel]").onclick=()=>m.remove();
 m.querySelector("[data-create]").onclick=async()=>{
  const title=m.querySelector("[data-title]").value.trim()||"心动小屋";
  const tone=m.querySelector("[data-tone]").value.trim()||"温柔、暧昧、轻微修罗场";
  const ids=[...m.querySelectorAll("[data-pick]:checked")].map(x=>x.value);
  const picked=cs.filter(c=>ids.includes(String(c.id))).map(c=>({id:c.id,characterId:c.id,name:c.name||"",handle:c.handle||"",avatar:c.avatar||"",bio:c.bio||"",personaSnapshot:c.persona||c.bio||"",joinedDay:1}));
  const a={archiveId:uid(),title,createdAt:Date.now(),lastSavedAt:Date.now(),
    userPersona:{personaId:state.user?.id||uid(),name:state.user?.name||"",handle:state.user?.handle||"",avatar:state.user?.avatar||"",personaSnapshot:state.user?.persona||state.user?.bio||""},
    characters:picked,worldbook:{selectedCategoryIds:[],selectedEntryIds:[],snapshotText:""},
    seasonConfig:{description:"一档以自然互动与真实心动为核心的恋爱真人秀。",tone,forbiddenContent:""},
    settings:{mode:"immersive"},currentDay:1,currentTime:"20:36",currentSceneLabel:"心动小屋 · 客厅",
    timeline:[{day:1,summary:"",fullNarrative:""}],observations:[],stageSummaries:[],
    relationships:{userToChar:{},charToChar:{}},privateMessages:{},events:[],locationScenes:{},pendingRequest:false,lastNarrative:"",lastQuote:""};
  picked.forEach(c=>a.relationships.userToChar[c.id]={status:"刚认识",statusLine:"你们的故事才刚刚开始。",tags:["初次入住"],recentEvent:"DAY 1 · 第一次入住"});
  state.currentArchive=a;state.characters=picked;
  const index={archiveId:a.archiveId,title:a.title,currentDay:1,characterNames:picked.map(x=>x.name),characterSnapshots:picked.map(x=>({id:x.id,name:x.name,handle:x.handle,avatar:x.avatar})),lastSummary:"新的恋综世界刚刚开机。",modeLabel:"沉浸恋综",lastSavedAt:a.lastSavedAt};
  state.archives.unshift(index);await set(`archive:${a.archiveId}`,a);await set("archiveIndex",state.archives);
  m.remove();state.activeTab="show";state.page="tab";state.stack=[];toast("《"+title+"》已开机");render();
 };
}

async function save(){
if(!state.currentArchive)return;
state.currentArchive.lastSavedAt=Date.now();
const a=state.currentArchive;
const i={archiveId.archiveId,title.title,currentDay.currentDay,characterNames.characters.map(x=>x.name),characterSnapshots.characters.map(x=>({id.id,name.name,handle.handle,avatar.avatar})),lastSummary.lastSummary||a.lastNarrative?.slice(0,80)||"暂无剧情",modeLabel(),lastSavedAt.lastSavedAt};
const n=state.archives.findIndex(x=>x.archiveId===i.archiveId);if(n>=0)state.archives[n]=i;else state.archives.unshift(i);
await set(archive:${a.archiveId},a);await set("archiveIndex",state.archives);
}

async function load(roche){
try{state.user=await roche.persona.getActiveUserPersona()}catch{state.user=null}
try{state.candidateCharacters=await roche.character.list()||[]}catch{state.candidateCharacters=[]}
state.archives=await get("archiveIndex",[]);
if(state.archives.length){const a=state.archives[0];state.currentArchive=await get(archive:${a.archiveId},a);state.characters=state.currentArchive?.characters||[]}
else{state.currentArchive=null;state.characters=[]}
}

async function mount(container,roche){state.container=container;state.roche=roche;state.activeTab="show";state.page="tab";state.stack=[];state.listeners=[];style();shell();await load(roche);render()}
async function unmount(container){state.listeners.forEach(f=>{try{f()}catch{}});state.listeners=[];container.replaceChildren();document.getElementById(STYLE_ID)?.remove();state.container=null;state.roche=null;state.currentArchive=null;state.characters=[];state.candidateCharacters=[]}

window.RochePlugin.register({id,name:"心动现场",version:"1.2.0",apps:[{id,name:"心动现场",icon:"heart",iconImage:"",async mount(c,r){await mount(c,r)},async unmount(c){await unmount(c)}}]});
})();

// Extension: clippy-tamagotchi
// C.L.I.P.P.Y. - Copilot's Living Interactive Personal Pet for You

import { createServer } from "node:http";
import https from "node:https";
import { execSync } from "node:child_process";
import { joinSession, createCanvas } from "@github/copilot-sdk/extension";

// Cache for agent files fetched from GitHub
const agentCache = new Map();
function fetchGitHub(path) {
    return new Promise((resolve, reject) => {
        if (agentCache.has(path)) { resolve(agentCache.get(path)); return; }
        const url = "https://raw.githubusercontent.com/clippyjs/clippy.js/master/agents/" + path;
        https.get(url, (resp) => {
            const chunks = [];
            resp.on("data", (c) => chunks.push(c));
            resp.on("end", () => { const buf = Buffer.concat(chunks); agentCache.set(path, { buf, ct: resp.headers["content-type"] || "application/octet-stream" }); resolve(agentCache.get(path)); });
        }).on("error", reject);
    });
}

const servers = new Map();
const petStates = new Map();
const AVAILABLE_PETS = ["Clippy","Bonzi","F1","Genie","Genius","Links","Merlin","Peedy","Rocky","Rover"];

function getDefaultState(petName) {
    return { name: petName||"Clippy", nickname:"", hunger:80, happiness:80, energy:80, hygiene:80, age:0, lastUpdate:Date.now(), alive:true };
}

function decayStats(state) {
    const now = Date.now();
    const ticks = Math.floor((now - state.lastUpdate) / 10000);
    if (ticks > 0 && state.alive) {
        state.hunger = Math.max(0, state.hunger - ticks * 2);
        state.happiness = Math.max(0, state.happiness - ticks * 1);
        state.energy = Math.max(0, state.energy - ticks * 0.6);
        state.hygiene = Math.max(0, state.hygiene - ticks * 0.8);
        state.age += ticks;
        state.lastUpdate = now;
        if (state.hunger <= 0 && state.happiness <= 0) state.alive = false;
    }
    return state;
}

function getThought(state) {
    if (!state.alive) return { text: "...", emoji: "\ud83d\udc80" };
    const stats = [
        { key:"hunger", val:state.hunger, thoughts:[
            {t:30, text:"I'm STARVING! Please feed me!", emoji:"\ud83e\udd7a"},
            {t:50, text:"My tummy is rumbling...", emoji:"\ud83c\udf55"},
            {t:70, text:"A snack would be nice", emoji:"\ud83e\udd14"},
        ]},
        { key:"happiness", val:state.happiness, thoughts:[
            {t:30, text:"I'm so lonely and sad...", emoji:"\ud83d\ude2d"},
            {t:50, text:"I'm getting bored...", emoji:"\ud83d\ude14"},
            {t:70, text:"Wanna play a game?", emoji:"\ud83c\udfae"},
        ]},
        { key:"energy", val:state.energy, thoughts:[
            {t:30, text:"So... tired... can't stay awake", emoji:"\ud83e\udd71"},
            {t:50, text:"I could really use a nap", emoji:"\ud83d\udca4"},
            {t:70, text:"Feeling a bit drowsy", emoji:"\ud83d\ude34"},
        ]},
        { key:"hygiene", val:state.hygiene, thoughts:[
            {t:30, text:"I smell TERRIBLE! Bath please!", emoji:"\ud83e\udd22"},
            {t:50, text:"Getting kinda grimy here...", emoji:"\ud83d\udca6"},
            {t:70, text:"A bath might be nice soon", emoji:"\ud83d\udec1"},
        ]},
    ];
    stats.sort((a,b) => a.val - b.val);
    const lowest = stats[0];
    for (const th of lowest.thoughts) { if (lowest.val <= th.t) return th; }
    const happy = [
        {text:"Life is great! I love you!",emoji:"\ud83d\udc96"},
        {text:"I'm the happiest pet ever!",emoji:"\u2728"},
        {text:"Best. Owner. Ever!",emoji:"\ud83c\udf1f"},
        {text:"Look at me, I'm thriving!",emoji:"\ud83d\ude0e"},
        {text:"Everything is awesome!",emoji:"\ud83c\udf08"},
    ];
    return happy[Math.floor(Math.random() * happy.length)];
}

function handleAction(state, action, body) {
    if (!state.alive && action !== "reset")
        return { state, message: state.name+" is no longer with us...", animation:null, effect:null, thought:getThought(state) };
    let message="", animation="", effect="";
    switch (action) {
        case "feed":
            state.hunger=Math.min(100,state.hunger+25); state.energy=Math.min(100,state.energy+5);
            message="Yum! That was delicious! \ud83c\udf55"; animation="Congratulate"; effect="feed"; break;
        case "play":
            state.happiness=Math.min(100,state.happiness+30); state.energy=Math.max(0,state.energy-15); state.hunger=Math.max(0,state.hunger-10);
            message="That was so fun! \ud83c\udf89"; animation="Pleased"; effect="play"; break;
        case "sleep":
            state.energy=Math.min(100,state.energy+35); state.hunger=Math.max(0,state.hunger-5);
            message="Zzz... feeling refreshed! \ud83d\udca4"; animation="Processing"; effect="sleep"; break;
        case "clean":
            state.hygiene=Math.min(100,state.hygiene+30); state.happiness=Math.min(100,state.happiness+5);
            message="Squeaky clean! \u2728"; animation="Searching"; effect="clean"; break;
        case "select_pet": {
            const oldNick = state.nickname;
            state = getDefaultState(body.pet||"Clippy");
            if (oldNick) state.nickname = oldNick;
            message="Hi! I am "+state.name+"! Take care of me! \ud83d\udc3e"; animation="Greeting"; effect="sparkle"; break;
        }
        case "rename":
            state.nickname = body.nickname||"";
            message = state.nickname ? ("Call me "+state.nickname+"! \ud83d\udc96") : "Back to "+state.name+"!";
            effect="sparkle"; break;
        case "reset": {
            const prev = state.name; state = getDefaultState(prev);
            message=prev+" is back! \ud83c\udf1f"; animation="Greeting"; effect="sparkle"; break;
        }
        default: message="Hmm, I don't understand that...";
    }
    return { state, message, animation, effect, thought: getThought(state) };
}

function renderHtml(instanceId) {
    const petsJson = JSON.stringify(AVAILABLE_PETS);
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>C.L.I.P.P.Y.</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/1.12.4/jquery.min.js"><\/script>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }

/* Theme-aware custom properties - dark is default */
:root, [data-color-mode="dark"] {
    --tg-bg: #0d1117;
    --tg-text: #e6edf3;
    --tg-muted: #8b949e;
    --tg-border: #30363d;
    --tg-surface: rgba(255,255,255,0.03);
    --tg-surface-hover: rgba(88,166,255,0.1);
    --tg-surface-active: rgba(88,166,255,0.2);
    --tg-input-bg: rgba(255,255,255,0.05);
    --tg-thought-bg: rgba(255,255,255,0.1);
    --tg-thought-border: rgba(255,255,255,0.15);
    --tg-toast-bg: rgba(30,30,30,0.95);
    --tg-toast-text: #e6edf3;
    --tg-overlay-bg: rgba(0,0,0,0.75);
    --tg-bar-track: #21262d;
    --tg-shadow: rgba(0,0,0,0.4);
    --tg-stage-gradient: rgba(88,166,255,0.03);
}
[data-color-mode="light"] {
    --tg-bg: #ffffff;
    --tg-text: #1f2328;
    --tg-muted: #656d76;
    --tg-border: #d0d7de;
    --tg-surface: rgba(0,0,0,0.03);
    --tg-surface-hover: rgba(88,166,255,0.08);
    --tg-surface-active: rgba(88,166,255,0.15);
    --tg-input-bg: rgba(0,0,0,0.04);
    --tg-thought-bg: rgba(0,0,0,0.06);
    --tg-thought-border: rgba(0,0,0,0.12);
    --tg-toast-bg: rgba(255,255,255,0.95);
    --tg-toast-text: #1f2328;
    --tg-overlay-bg: rgba(0,0,0,0.5);
    --tg-bar-track: #e1e4e8;
    --tg-shadow: rgba(0,0,0,0.15);
    --tg-stage-gradient: rgba(88,166,255,0.05);
}
body {
    font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
    background: var(--tg-bg); color: var(--tg-text);
    padding: 16px; min-height: 100vh; overflow-x: hidden;
    transition: background 0.3s, color 0.3s;
}
.container { max-width: 420px; margin: 0 auto; }
h1 {
    font-size: 28px; font-weight: 600; text-align: center; margin-bottom: 2px;
    letter-spacing: 6px;
    background: linear-gradient(135deg, #58a6ff, #bc8cff, #f0883e);
    background-size: 200% 200%;
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    animation: shimmer 3s ease infinite;
}
@keyframes shimmer { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }
.subtitle { text-align:center; color:var(--tg-muted); font-size:11px; margin-bottom:2px; font-style:italic; letter-spacing:0.5px; opacity:0.8; }
.subtitle2 { text-align:center; color:var(--tg-muted); font-size:12px; margin-bottom:14px; }
.name-area { display:flex; align-items:center; justify-content:center; gap:8px; margin-bottom:14px; }
.pet-display-name { font-size:16px; font-weight:600; }
.name-input-wrap { display:flex; gap:6px; align-items:center; }
.name-input-wrap input { padding:4px 8px; border-radius:6px; border:1px solid var(--tg-border); background:var(--tg-input-bg); color:var(--tg-text); font-size:13px; width:130px; outline:none; }
.name-input-wrap input:focus { border-color:#58a6ff; }
.name-btn { padding:4px 10px; border-radius:6px; border:1px solid var(--tg-border); background:transparent; color:var(--tg-text); cursor:pointer; font-size:12px; transition:all 0.2s; }
.name-btn:hover { border-color:#58a6ff; background:var(--tg-surface-hover); }
.name-btn.save { background:rgba(63,185,80,0.2); border-color:#3fb950; }
.pet-select { display:grid; grid-template-columns:repeat(5,1fr); gap:5px; margin-bottom:14px; }
.pet-btn { padding:5px 3px; border:2px solid var(--tg-border); border-radius:8px; background:transparent; color:var(--tg-text); cursor:pointer; font-size:10px; text-align:center; transition:all 0.2s; }
.pet-btn:hover { border-color:#58a6ff; background:var(--tg-surface-hover); }
.pet-btn.active { border-color:#58a6ff; background:var(--tg-surface-active); box-shadow:0 0 8px rgba(88,166,255,0.3); }
.pet-stage {
    position:relative; height:220px; border:2px solid var(--tg-border);
    border-radius:12px; margin-bottom:14px; display:flex; align-items:center; justify-content:center;
    overflow:hidden; background:linear-gradient(180deg,var(--tg-stage-gradient) 0%,transparent 100%);
    transition:border-color 0.5s, box-shadow 0.5s;
}
.pet-stage.effect-feed { border-color:#f0883e; box-shadow:inset 0 0 30px rgba(240,136,62,0.2); }
.pet-stage.effect-play { border-color:#bc8cff; box-shadow:inset 0 0 30px rgba(188,140,255,0.2); }
.pet-stage.effect-sleep { border-color:#3fb950; box-shadow:inset 0 0 30px rgba(63,185,80,0.15); }
.pet-stage.effect-clean { border-color:#58a6ff; box-shadow:inset 0 0 30px rgba(88,166,255,0.2); }
.pet-stage.effect-sparkle { border-color:#e3b341; box-shadow:inset 0 0 30px rgba(227,179,65,0.2); }

/* Thought bubble */
.thought-bubble {
    position:absolute; top:10px; right:12px;
    background:var(--tg-thought-bg); backdrop-filter:blur(6px);
    border:1px solid var(--tg-thought-border); border-radius:16px;
    padding:8px 14px; font-size:12px; max-width:180px; z-index:20;
    opacity:0; transform:scale(0.8) translateY(5px);
    transition:all 0.4s cubic-bezier(0.34,1.56,0.64,1); pointer-events:none;
}
.thought-bubble.show { opacity:1; transform:scale(1) translateY(0); }
.thought-bubble .thought-emoji { font-size:18px; margin-right:4px; vertical-align:middle; }
.thought-bubble .thought-text { vertical-align:middle; }
.thought-dots { position:absolute; bottom:-18px; right:20px; display:flex; gap:4px; align-items:flex-end; }
.thought-dots .dot { background:var(--tg-thought-bg); border:1px solid var(--tg-thought-border); border-radius:50%; }
.thought-dots .dot:nth-child(1) { width:6px; height:6px; }
.thought-dots .dot:nth-child(2) { width:9px; height:9px; }
.thought-dots .dot:nth-child(3) { width:12px; height:12px; }

/* Idle animations for emoji fallback */
.pet-emoji-wrap { font-size:64px; transition:all 0.8s cubic-bezier(0.34,1.56,0.64,1); position:relative; }
.pet-emoji-wrap.idle-bounce { animation:idleBounce 2s ease-in-out infinite; }
.pet-emoji-wrap.idle-wander { animation:idleWander 4s ease-in-out infinite; }
.pet-emoji-wrap.idle-sleep { animation:idleSleep 3s ease-in-out infinite; }
.pet-emoji-wrap.idle-dizzy { animation:idleDizzy 1.5s ease-in-out infinite; }
.pet-emoji-wrap.idle-excited { animation:idleExcited 0.6s ease-in-out infinite; }
@keyframes idleBounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
@keyframes idleWander { 0%,100%{transform:translateX(0) rotate(0)} 25%{transform:translateX(30px) rotate(5deg)} 75%{transform:translateX(-30px) rotate(-5deg)} }
@keyframes idleSleep { 0%,100%{transform:translateY(0) rotate(0);opacity:1} 50%{transform:translateY(4px) rotate(-10deg);opacity:0.6} }
@keyframes idleDizzy { 0%,100%{transform:rotate(0)} 25%{transform:rotate(8deg)} 75%{transform:rotate(-8deg)} }
@keyframes idleExcited { 0%,100%{transform:scale(1) rotate(0)} 25%{transform:scale(1.1) rotate(3deg)} 75%{transform:scale(1.1) rotate(-3deg)} }

.particles { position:absolute; inset:0; pointer-events:none; z-index:10; overflow:hidden; }
.particle { position:absolute; font-size:20px; animation:floatUp 1.5s ease-out forwards; opacity:0; }
@keyframes floatUp { 0%{transform:translateY(0) scale(0.5) rotate(0);opacity:0} 15%{opacity:1;transform:translateY(-10px) scale(1) rotate(15deg)} 100%{transform:translateY(-160px) scale(0.3) rotate(45deg);opacity:0} }

.zzz { position:absolute; pointer-events:none; z-index:15; top:30px; right:60px; }
.zzz span { position:absolute; font-size:16px; opacity:0; animation:zzzFloat 3s ease-out infinite; }
.zzz span:nth-child(2) { animation-delay:1s; left:10px; }
.zzz span:nth-child(3) { animation-delay:2s; left:20px; }
@keyframes zzzFloat { 0%{transform:translateY(0) scale(0.8);opacity:0} 20%{opacity:1} 100%{transform:translateY(-60px) translateX(15px) scale(1.2);opacity:0} }

.toast { position:fixed; top:16px; left:50%; transform:translateX(-50%) translateY(-100px); background:var(--tg-toast-bg); color:var(--tg-toast-text); border:1px solid var(--tg-border); padding:10px 20px; border-radius:10px; font-size:14px; z-index:200; transition:transform 0.4s cubic-bezier(0.34,1.56,0.64,1); backdrop-filter:blur(8px); box-shadow:0 8px 24px var(--tg-shadow); white-space:nowrap; }
.toast.show { transform:translateX(-50%) translateY(0); }
.dead-overlay { position:absolute; inset:0; background:var(--tg-overlay-bg); display:flex; flex-direction:column; align-items:center; justify-content:center; border-radius:10px; z-index:100; }
.dead-overlay span { font-size:48px; margin-bottom:8px; }
.dead-overlay p { color:#f85149; font-weight:600; margin-bottom:10px; }
/* Sleep/disconnected overlay */
.sleep-overlay { position:fixed; inset:0; background:rgba(13,17,23,0.92); display:flex; align-items:center; justify-content:center; z-index:9999; backdrop-filter:blur(4px); animation:fadeIn 0.3s ease; }
.sleep-content { text-align:center; padding:32px; }
.sleep-icon { font-size:64px; display:block; margin-bottom:12px; animation:sleepBob 2s ease-in-out infinite; }
.sleep-content p { color:#c9d1d9; font-size:16px; margin:8px 0; }
.sleep-hint { font-size:12px !important; color:#8b949e !important; }
.wake-btn { margin-top:16px; padding:12px 28px; background:linear-gradient(135deg,#58a6ff,#3fb950); border:none; border-radius:8px; color:#fff; font-size:14px; font-weight:600; cursor:pointer; transition:all 0.2s; box-shadow:0 4px 12px rgba(88,166,255,0.3); }
.wake-btn:hover { transform:scale(1.05); box-shadow:0 6px 20px rgba(88,166,255,0.4); }
@keyframes sleepBob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
.stats { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:14px; }
.stat { background:var(--tg-surface); border:1px solid var(--tg-border); border-radius:8px; padding:10px; transition:all 0.3s; }
.stat.highlight { border-color:#3fb950; background:rgba(63,185,80,0.08); }
.stat-label { font-size:11px; color:var(--tg-muted); margin-bottom:4px; }
.stat-bar { height:8px; background:var(--tg-bar-track); border-radius:4px; overflow:hidden; }
.stat-fill { height:100%; border-radius:4px; transition:width 0.6s cubic-bezier(0.34,1.56,0.64,1); }
.stat-fill.hunger { background:linear-gradient(90deg,#f85149,#ff7b72); }
.stat-fill.happiness { background:linear-gradient(90deg,#f0883e,#ffa657); }
.stat-fill.energy { background:linear-gradient(90deg,#3fb950,#56d364); }
.stat-fill.hygiene { background:linear-gradient(90deg,#58a6ff,#79c0ff); }
.actions { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:12px; }
.action-btn { padding:10px 4px; border:1px solid var(--tg-border); border-radius:8px; background:transparent; color:var(--tg-text); cursor:pointer; font-size:11px; text-align:center; transition:all 0.2s; display:flex; flex-direction:column; align-items:center; gap:4px; user-select:none; }
.action-btn:hover { background:var(--tg-surface-hover); border-color:#58a6ff; }
.action-btn:active { transform:scale(0.92); background:var(--tg-surface-active); }
.action-btn:disabled { opacity:0.4; cursor:not-allowed; }
.action-btn .icon { font-size:20px; }
.mood-indicator { text-align:center; font-size:13px; margin-bottom:10px; padding:6px; border-radius:8px; background:var(--tg-surface); }
.age-display { text-align:center; color:var(--tg-muted); font-size:11px; }
.reset-btn { padding:8px 16px; background:#f85149; border:none; border-radius:6px; color:white; cursor:pointer; font-size:12px; }
.reset-btn:hover { background:#ff7b72; }
.theme-toggle { position:absolute; top:12px; right:12px; background:var(--tg-surface); border:1px solid var(--tg-border); border-radius:50%; width:32px; height:32px; cursor:pointer; font-size:16px; display:flex; align-items:center; justify-content:center; transition:all 0.2s; z-index:10; }
.theme-toggle:hover { background:var(--tg-surface-hover); border-color:#58a6ff; }
.about-btn { position:absolute; top:12px; right:52px; background:var(--tg-surface); border:1px solid var(--tg-border); border-radius:50%; width:32px; height:32px; cursor:pointer; font-size:14px; display:flex; align-items:center; justify-content:center; transition:all 0.2s; z-index:10; color:var(--tg-muted); }
.about-btn:hover { background:var(--tg-surface-hover); border-color:#58a6ff; color:var(--tg-text); }
.mute-btn { position:absolute; top:12px; left:12px; background:var(--tg-surface); border:1px solid var(--tg-border); border-radius:50%; width:32px; height:32px; cursor:pointer; font-size:14px; display:flex; align-items:center; justify-content:center; transition:all 0.2s; z-index:10; color:var(--tg-muted); }
.mute-btn:hover { background:var(--tg-surface-hover); border-color:#58a6ff; color:var(--tg-text); }

/* Modal */
.modal-overlay { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:1000; align-items:center; justify-content:center; padding:16px; backdrop-filter:blur(3px); }
.modal-overlay.open { display:flex; animation:fadeIn 0.2s ease; }
.modal { background:var(--tg-bg); border:1px solid var(--tg-border); border-radius:12px; padding:24px; max-width:420px; width:100%; max-height:80vh; overflow-y:auto; position:relative; box-shadow:0 20px 60px rgba(0,0,0,0.3); }
.modal h2 { margin:0 0 8px; font-size:18px; color:var(--tg-text); }
.modal h3 { margin:16px 0 6px; font-size:13px; color:var(--tg-accent); text-transform:uppercase; letter-spacing:0.5px; }
.modal-intro { color:var(--tg-muted); font-size:12px; margin:0 0 12px; line-height:1.5; }
.modal-desc { color:var(--tg-muted); font-size:11px; margin:0 0 6px; }
.modal-close { position:absolute; top:12px; right:12px; background:none; border:none; color:var(--tg-muted); font-size:18px; cursor:pointer; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; }
.modal-close:hover { background:var(--tg-surface); color:var(--tg-text); }
.modal-grid { display:grid; gap:3px; }
.modal-row { font-size:11px; padding:5px 8px; border-radius:4px; color:var(--tg-text); line-height:1.4; }
.modal-row.boost { background:rgba(46,160,67,0.08); }
.modal-row.medium { background:rgba(56,132,244,0.08); }
.modal-row.small { background:var(--tg-surface); }
.modal-row.danger { background:rgba(248,81,73,0.08); }
@keyframes fadeIn { from{opacity:0} to{opacity:1} }
.clippy { position:absolute !important; z-index:5; }
.clippy-balloon { display:none !important; }
/* Session event feed */
.event-feed { max-height:120px; overflow-y:auto; }
.event-item { display:flex; align-items:flex-start; gap:8px; padding:6px 8px; border-radius:6px; background:var(--tg-surface); border:1px solid var(--tg-border); margin-bottom:4px; font-size:11px; animation:slideIn 0.3s ease; }
.event-item .event-emoji { font-size:16px; flex-shrink:0; }
.event-item .event-msg { flex:1; color:var(--tg-text); }
.event-item .event-time { color:var(--tg-muted); font-size:10px; white-space:nowrap; }
.event-feed-title { font-size:11px; color:var(--tg-muted); margin-bottom:6px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; }
@keyframes slideIn { from{opacity:0;transform:translateX(-10px)} to{opacity:1;transform:translateX(0)} }

/* Activity Section */
.activity-section { margin-top:16px; border-top:1px solid var(--tg-border); padding-top:12px; }
.activity-tabs { display:flex; gap:4px; margin-bottom:8px; }
.tab-btn { flex:1; padding:6px 8px; border:1px solid var(--tg-border); border-radius:6px; background:var(--tg-surface); color:var(--tg-muted); font-size:11px; font-weight:600; cursor:pointer; transition:all 0.2s; }
.tab-btn.active { background:var(--tg-accent); color:#fff; border-color:var(--tg-accent); }
.tab-btn:hover:not(.active) { background:var(--tg-border); color:var(--tg-text); }
.tab-panel.hidden { display:none; }
.activity-log { max-height:160px; overflow-y:auto; }
.log-empty { text-align:center; padding:16px 8px; color:var(--tg-muted); font-size:12px; }
.log-item { display:flex; align-items:center; gap:8px; padding:5px 8px; border-radius:5px; margin-bottom:3px; font-size:11px; animation:slideIn 0.3s ease; border-left:3px solid transparent; }
.log-item.positive { background:rgba(46,160,67,0.08); border-left-color:#2ea043; }
.log-item.negative { background:rgba(248,81,73,0.08); border-left-color:#f85149; }
.log-item.neutral { background:var(--tg-surface); border-left-color:var(--tg-border); }
.log-item .log-emoji { font-size:14px; flex-shrink:0; }
.log-item .log-msg { flex:1; color:var(--tg-text); }
.log-item .log-effect { font-size:10px; color:var(--tg-muted); white-space:nowrap; font-weight:600; }
.log-item .log-time { font-size:9px; color:var(--tg-muted); white-space:nowrap; }
.guide-grid { display:grid; gap:4px; }
.guide-item { display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:5px; font-size:11px; }
.guide-item.boost { background:rgba(46,160,67,0.08); }
.guide-item.medium { background:rgba(56,132,244,0.08); }
.guide-item.small { background:var(--tg-surface); }
.guide-item.danger { background:rgba(248,81,73,0.08); }
.guide-emoji { font-size:14px; width:20px; text-align:center; }
.guide-label { flex:1; color:var(--tg-text); }
.guide-reward { font-size:10px; color:var(--tg-muted); font-weight:600; }
</style>
</head>
<body>
<div class="container" style="position:relative;">
    <button class="theme-toggle" id="theme-toggle" title="Toggle light/dark mode">\ud83c\udf19</button>
    <button class="about-btn" id="about-btn" title="How it works">\u2753</button>
    <button class="mute-btn" id="mute-btn" title="Toggle sound">\ud83d\udd0a</button>
    <h1>\ud83d\udcce C.L.I.P.P.Y.</h1>
    <p class="subtitle">Copilot's Living Interactive Personal Pet for You</p>
    <p class="subtitle2">Choose & name your virtual companion!</p>
    <div class="name-area" id="name-area">
        <span class="pet-display-name" id="display-name">Clippy</span>
        <button class="name-btn" id="edit-name-btn">\u270f\ufe0f Rename</button>
    </div>
    <div class="pet-select" id="pet-select"></div>
    <div class="pet-stage" id="pet-stage">
        <div class="particles" id="particles"></div>
        <div class="thought-bubble" id="thought-bubble">
            <span class="thought-emoji" id="thought-emoji">\ud83d\udcad</span>
            <span class="thought-text" id="thought-text">Thinking...</span>
            <div class="thought-dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
        </div>
        <div id="clippy-container" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;">
            <div class="pet-emoji-wrap idle-bounce" id="pet-emoji">\ud83d\udcce</div>
        </div>
        <div class="zzz" id="zzz" style="display:none"><span>\ud83d\udca4</span><span>\ud83d\udca4</span><span>\ud83d\udca4</span></div>
    </div>
    <div class="toast" id="toast"></div>
    <div class="mood-indicator" id="mood"></div>
    <div class="stats">
        <div class="stat" id="stat-hunger"><div class="stat-label">\ud83c\udf55 Hunger</div><div class="stat-bar"><div class="stat-fill hunger" id="hunger-bar"></div></div></div>
        <div class="stat" id="stat-happiness"><div class="stat-label">\ud83d\ude0a Happiness</div><div class="stat-bar"><div class="stat-fill happiness" id="happiness-bar"></div></div></div>
        <div class="stat" id="stat-energy"><div class="stat-label">\u26a1 Energy</div><div class="stat-bar"><div class="stat-fill energy" id="energy-bar"></div></div></div>
        <div class="stat" id="stat-hygiene"><div class="stat-label">\ud83d\udec1 Hygiene</div><div class="stat-bar"><div class="stat-fill hygiene" id="hygiene-bar"></div></div></div>
    </div>
    <div class="actions">
        <button class="action-btn" id="btn-feed"><span class="icon">\ud83c\udf55</span>Feed</button>
        <button class="action-btn" id="btn-play"><span class="icon">\ud83c\udfae</span>Play</button>
        <button class="action-btn" id="btn-sleep"><span class="icon">\ud83d\udca4</span>Sleep</button>
        <button class="action-btn" id="btn-clean"><span class="icon">\ud83e\uddfc</span>Clean</button>
    </div>
    <div class="age-display" id="age-display">Age: 0</div>
    <div id="session-feed" style="margin-top:12px;"></div>
    <div id="poll-timer" style="font-size:10px;color:var(--tg-muted);text-align:center;margin-top:6px;">\ud83d\udd0d Next check in 30s</div>
    <div id="daily-summary" style="font-size:11px;color:var(--tg-accent);text-align:center;margin-top:4px;font-weight:600;"></div>

    <!-- Activity Log & Guide -->
    <div class="activity-section">
        <div class="activity-tabs">
            <button class="tab-btn active" id="tab-log">\ud83d\udcdc Activity Log</button>
            <button class="tab-btn" id="tab-guide">\ud83d\udca1 How to Level Up</button>
        </div>
        <div class="tab-panel" id="panel-log">
            <div class="activity-log" id="activity-log">
                <div class="log-empty">\ud83c\udf31 No activity yet \u2014 start coding and watch Clippy thrive!</div>
            </div>
        </div>
        <div class="tab-panel hidden" id="panel-guide">
            <div class="guide-grid">
                <div class="guide-item boost"><span class="guide-emoji">\ud83c\udf1f</span><span class="guide-label">Close an issue</span><span class="guide-reward">+10 \u2764\ufe0f +5 \u26a1</span></div>
                <div class="guide-item boost"><span class="guide-emoji">\u2705</span><span class="guide-label">Build succeeds</span><span class="guide-reward">+10 \u2764\ufe0f +5 \u26a1</span></div>
                <div class="guide-item boost"><span class="guide-emoji">\u2728</span><span class="guide-label">Tests pass</span><span class="guide-reward">+10 \u2764\ufe0f +5 \u26a1</span></div>
                <div class="guide-item boost"><span class="guide-emoji">\ud83c\udf89</span><span class="guide-label">PR merged</span><span class="guide-reward">+10 \u2764\ufe0f +5 \u26a1</span></div>
                <div class="guide-item medium"><span class="guide-emoji">\ud83d\udcdd</span><span class="guide-label">Create an issue</span><span class="guide-reward">+5 \u2764\ufe0f +3 \ud83c\udf55</span></div>
                <div class="guide-item medium"><span class="guide-emoji">\ud83d\udce8</span><span class="guide-label">Open a PR</span><span class="guide-reward">+5 \u2764\ufe0f +3 \ud83c\udf55</span></div>
                <div class="guide-item medium"><span class="guide-emoji">\ud83d\udcac</span><span class="guide-label">Comment on issue</span><span class="guide-reward">+5 \u2764\ufe0f +3 \ud83c\udf55</span></div>
                <div class="guide-item small"><span class="guide-emoji">\u270f\ufe0f</span><span class="guide-label">Edit an issue</span><span class="guide-reward">+3 \u2764\ufe0f</span></div>
                <div class="guide-item small"><span class="guide-emoji">\ud83d\udc64</span><span class="guide-label">Assign an issue</span><span class="guide-reward">+3 \u2764\ufe0f</span></div>
                <div class="guide-item danger"><span class="guide-emoji">\ud83d\udca5</span><span class="guide-label">Build fails</span><span class="guide-reward">-5 \u2764\ufe0f</span></div>
                <div class="guide-item danger"><span class="guide-emoji">\ud83d\udd34</span><span class="guide-label">Tests fail</span><span class="guide-reward">-5 \u2764\ufe0f</span></div>
            </div>
        </div>
    </div>
</div>

<!-- About Modal -->
<div class="modal-overlay" id="about-modal">
    <div class="modal">
        <button class="modal-close" id="modal-close">\u2715</button>
        <h2>\ud83d\udcce How C.L.I.P.P.Y. Works</h2>
        <p class="modal-intro">Clippy is your virtual coding companion. Keep them happy and healthy by staying productive in your sessions!</p>

        <h3>\ud83c\udfae Direct Actions</h3>
        <p class="modal-desc">Use the buttons to manually care for Clippy:</p>
        <div class="modal-grid">
            <div class="modal-row">\ud83c\udf55 <strong>Feed</strong> \u2014 Restores hunger</div>
            <div class="modal-row">\ud83c\udfae <strong>Play</strong> \u2014 Boosts happiness</div>
            <div class="modal-row">\ud83d\udca4 <strong>Sleep</strong> \u2014 Restores energy</div>
            <div class="modal-row">\ud83e\uddfc <strong>Clean</strong> \u2014 Improves hygiene</div>
        </div>

        <h3>\ud83d\ude80 Session Events (Automatic)</h3>
        <p class="modal-desc">When you work in coding sessions, Clippy notices and reacts:</p>
        <div class="modal-grid">
            <div class="modal-row boost">\ud83c\udf1f <strong>Close an issue</strong> \u2014 +10 happiness, +5 energy</div>
            <div class="modal-row boost">\u2705 <strong>Build succeeds</strong> \u2014 +10 happiness, +5 energy</div>
            <div class="modal-row boost">\u2728 <strong>Tests pass</strong> \u2014 +10 happiness, +5 energy</div>
            <div class="modal-row boost">\ud83c\udf89 <strong>PR merged</strong> \u2014 +10 happiness, +5 energy</div>
            <div class="modal-row boost">\ud83c\udfc6 <strong>Achievement</strong> \u2014 +10 happiness, +5 energy</div>
            <div class="modal-row medium">\ud83d\udcdd <strong>Create issue</strong> \u2014 +5 happiness, +3 hunger</div>
            <div class="modal-row medium">\ud83d\udce8 <strong>Open PR</strong> \u2014 +5 happiness, +3 hunger</div>
            <div class="modal-row medium">\ud83d\udcac <strong>Comment on issue</strong> \u2014 +5 happiness, +3 hunger</div>
            <div class="modal-row small">\u270f\ufe0f <strong>Edit issue</strong> \u2014 +3 happiness</div>
            <div class="modal-row small">\ud83d\udc64 <strong>Assign issue</strong> \u2014 +3 happiness</div>
            <div class="modal-row danger">\ud83d\udca5 <strong>Build fails</strong> \u2014 -5 happiness</div>
            <div class="modal-row danger">\ud83d\udd34 <strong>Tests fail</strong> \u2014 -5 happiness</div>
        </div>

        <h3>\u26a0\ufe0f Stat Decay</h3>
        <p class="modal-desc">Stats decay over time! If any stat hits 0, Clippy dies \ud83d\udc80. Keep working and caring to stay alive.</p>

        <h3>\ud83d\udca1 Tips</h3>
        <div class="modal-grid">
            <div class="modal-row">\ud83d\udc41\ufe0f Clippy shows thought bubbles about their lowest stat</div>
            <div class="modal-row">\ud83c\udfa8 Switch characters anytime \u2014 all stats carry over</div>
            <div class="modal-row">\u270d\ufe0f Name your pet by clicking the pencil icon</div>
            <div class="modal-row">\ud83c\udf19 Toggle dark/light mode with the moon icon</div>
        </div>
    </div>
</div>

<script>
var PETS = ${petsJson};
var currentPet = "Clippy";
var state = null;
var agent = null;
var isEditing = false;
var thoughtTimer = null;
var lastThought = "";
var IDLE_ANIMS = ["idle-bounce","idle-wander","idle-sleep","idle-dizzy","idle-excited"];
var PARTICLE_MAP = {
    feed:["\ud83c\udf55","\ud83c\udf54","\ud83c\udf5f","\ud83c\udf2e","\ud83c\udf70"],
    play:["\u2b50","\ud83c\udf88","\ud83c\udfb5","\ud83c\udf89","\ud83c\udfb2"],
    sleep:["\ud83d\udca4","\u2b50","\ud83c\udf1f","\u2601\ufe0f","\ud83c\udf19"],
    clean:["\ud83d\udca7","\u2728","\ud83e\uddfc","\ud83d\udca6"],
    sparkle:["\u2728","\ud83c\udf1f","\ud83d\udc96","\ud83d\udcab"],
};

document.getElementById("btn-feed").addEventListener("click",function(){doAction("feed")});
document.getElementById("btn-play").addEventListener("click",function(){doAction("play")});
document.getElementById("btn-sleep").addEventListener("click",function(){doAction("sleep")});
document.getElementById("btn-clean").addEventListener("click",function(){doAction("clean")});
document.getElementById("edit-name-btn").addEventListener("click",function(){toggleNameEdit()});
document.getElementById("theme-toggle").addEventListener("click",function(){
    var html=document.documentElement;
    var current=html.getAttribute("data-color-mode");
    var isDark = current === "dark" || (!current && window.matchMedia("(prefers-color-scheme:dark)").matches);
    html.setAttribute("data-color-mode", isDark ? "light" : "dark");
    document.getElementById("theme-toggle").textContent = isDark ? "\u2600\ufe0f" : "\ud83c\udf19";
});

// About modal
document.getElementById("about-btn").addEventListener("click",function(){
    document.getElementById("about-modal").classList.add("open");
});
document.getElementById("modal-close").addEventListener("click",function(){
    document.getElementById("about-modal").classList.remove("open");
});
document.getElementById("about-modal").addEventListener("click",function(e){
    if(e.target===this) this.classList.remove("open");
});

// Mute toggle — intercept Audio.prototype.play to suppress all sounds
var isMuted = false;
var _origAudioPlay = HTMLAudioElement.prototype.play;
HTMLAudioElement.prototype.play = function(){
    if(isMuted) return Promise.resolve();
    return _origAudioPlay.call(this);
};

document.getElementById("mute-btn").addEventListener("click",function(){
    isMuted = !isMuted;
    this.textContent = isMuted ? "\ud83d\udd07" : "\ud83d\udd0a";
    this.title = isMuted ? "Unmute sound" : "Mute sound";
    // Pause any currently playing audio
    document.querySelectorAll("audio").forEach(function(a){ a.pause(); a.currentTime=0; });
    try { localStorage.setItem("clippy-muted", isMuted ? "1" : "0"); } catch(e){}
});
// Restore mute pref
try {
    if(localStorage.getItem("clippy-muted")==="1"){
        isMuted=true;
        document.getElementById("mute-btn").textContent="\ud83d\udd07";
        document.getElementById("mute-btn").title="Unmute sound";
    }
} catch(e){}

// Activity log tabs
document.getElementById("tab-log").addEventListener("click",function(){
    document.getElementById("tab-log").classList.add("active");
    document.getElementById("tab-guide").classList.remove("active");
    document.getElementById("panel-log").classList.remove("hidden");
    document.getElementById("panel-guide").classList.add("hidden");
});
document.getElementById("tab-guide").addEventListener("click",function(){
    document.getElementById("tab-guide").classList.add("active");
    document.getElementById("tab-log").classList.remove("active");
    document.getElementById("panel-guide").classList.remove("hidden");
    document.getElementById("panel-log").classList.add("hidden");
});

// Add to activity log
function addLogEntry(emoji, message, effect, sentiment, timestamp){
    var log=document.getElementById("activity-log");
    var empty=log.querySelector(".log-empty");
    if(empty) empty.remove();
    var cls = sentiment==="positive"?"positive":sentiment==="negative"?"negative":"neutral";
    var t = timestamp ? new Date(timestamp) : new Date();
    var timeStr=t.getHours().toString().padStart(2,"0")+":"+t.getMinutes().toString().padStart(2,"0");
    var item=document.createElement("div");
    item.className="log-item "+cls;
    item.innerHTML='<span class="log-emoji">'+emoji+'</span><span class="log-msg">'+message+'</span>'+(effect?'<span class="log-effect">'+effect+'</span>':'')+'<span class="log-time">'+timeStr+'</span>';
    log.insertBefore(item,log.firstChild);
    while(log.children.length>20) log.removeChild(log.lastChild);
}

function pickIdleAnim(){
    if(!state||!state.alive) return "idle-sleep";
    var avg=(state.hunger+state.happiness+state.energy+state.hygiene)/4;
    if(state.energy<30) return "idle-sleep";
    if(avg<30) return "idle-dizzy";
    if(state.happiness>70&&avg>60) return "idle-excited";
    if(avg>50) return "idle-wander";
    return "idle-bounce";
}
function cycleIdleAnim(){
    var el=document.getElementById("pet-emoji"); if(!el) return;
    var anim=pickIdleAnim();
    IDLE_ANIMS.forEach(function(a){el.classList.remove(a)});
    el.classList.add(anim);
    var zzz=document.getElementById("zzz");
    if(zzz) zzz.style.display=(anim==="idle-sleep")?"block":"none";
}
function showThought(thought){
    if(!thought||!thought.text) return;
    if(thought.text===lastThought) return;
    lastThought=thought.text;
    var bubble=document.getElementById("thought-bubble");
    var em=document.getElementById("thought-emoji");
    var tx=document.getElementById("thought-text");
    if(!bubble) return;
    em.textContent=thought.emoji||"\ud83d\udcad";
    tx.textContent=thought.text;
    bubble.classList.add("show");
    clearTimeout(thoughtTimer);
    thoughtTimer=setTimeout(function(){bubble.classList.remove("show");lastThought="";},4000);
}
function spawnParticles(type){
    var c=document.getElementById("particles"); c.innerHTML="";
    var emojis=PARTICLE_MAP[type]||PARTICLE_MAP.sparkle;
    for(var i=0;i<12;i++){
        var p=document.createElement("div"); p.className="particle";
        p.textContent=emojis[Math.floor(Math.random()*emojis.length)];
        p.style.left=(5+Math.random()*90)+"%";
        p.style.bottom=(5+Math.random()*20)+"%";
        p.style.animationDelay=(Math.random()*0.6)+"s";
        p.style.fontSize=(16+Math.random()*14)+"px";
        c.appendChild(p);
    }
    setTimeout(function(){c.innerHTML=""},2200);
}
function showToast(msg){
    var t=document.getElementById("toast"); t.textContent=msg; t.classList.add("show");
    setTimeout(function(){t.classList.remove("show")},2500);
}
function flashStage(effect){
    var s=document.getElementById("pet-stage"); s.className="pet-stage effect-"+effect;
    setTimeout(function(){s.className="pet-stage"},1500);
}
function highlightStat(id){
    var el=document.getElementById(id);
    if(el){el.classList.add("highlight");setTimeout(function(){el.classList.remove("highlight")},1200);}
}
function toggleNameEdit(){
    if(isEditing) return; isEditing=true;
    var area=document.getElementById("name-area");
    var cur=(state&&state.nickname)||"";
    area.innerHTML='<div class="name-input-wrap"><input type="text" id="name-input" placeholder="Give a nickname..." maxlength="20" value="'+cur.replace(/"/g,"&quot;")+'" /><button class="name-btn save" id="save-name-btn">\u2705</button><button class="name-btn" id="cancel-name-btn">\u274c</button></div>';
    document.getElementById("name-input").focus();
    document.getElementById("save-name-btn").addEventListener("click",function(){saveName()});
    document.getElementById("cancel-name-btn").addEventListener("click",function(){cancelNameEdit()});
    document.getElementById("name-input").addEventListener("keydown",function(e){if(e.key==="Enter")saveName();if(e.key==="Escape")cancelNameEdit();});
}
function saveName(){
    var input=document.getElementById("name-input");
    var nick=input?input.value.trim():"";
    isEditing=false;
    fetch("/api/action",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"rename",nickname:nick})})
    .then(function(r){return r.json()}).then(function(data){
        state=data.state; updateUI();
        if(data.message) showToast(data.message);
        if(data.effect){spawnParticles(data.effect);flashStage(data.effect);}
        if(data.thought) showThought(data.thought);
    });
    renderNameArea();
}
function cancelNameEdit(){isEditing=false;renderNameArea();}
function renderNameArea(){
    var area=document.getElementById("name-area");
    var dn=(state&&state.nickname)?state.nickname+" ("+state.name+")":(state?state.name:"Clippy");
    area.innerHTML='<span class="pet-display-name" id="display-name">'+dn+'</span><button class="name-btn" id="edit-name-btn">\u270f\ufe0f Rename</button>';
    document.getElementById("edit-name-btn").addEventListener("click",function(){toggleNameEdit()});
}
function renderPetSelect(){
    var c=document.getElementById("pet-select"); c.innerHTML="";
    PETS.forEach(function(p){
        var btn=document.createElement("button");
        btn.className="pet-btn"+(p===currentPet?" active":"");
        btn.textContent=p;
        btn.addEventListener("click",function(){selectPet(p)});
        c.appendChild(btn);
    });
}
function selectPet(name){
    currentPet=name; renderPetSelect();
    fetch("/api/action",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"select_pet",pet:name})})
    .then(function(r){return r.json()}).then(function(data){
        state=data.state; updateUI();
        if(data.message) showToast(data.message);
        if(data.effect){spawnParticles(data.effect);flashStage(data.effect);}
        if(data.thought) showThought(data.thought);
    });
    loadAgent();
}
function loadAgent(){
    // Fully tear down old agent and remove all clippy DOM elements
    clearInterval(clippyIdleLoop); clippyIdleLoop=null;
    if(agent){try{agent.stop();agent.hide(true,function(){});}catch(e){} agent=null;}
    // Remove ALL leftover .clippy and .clippy-balloon elements from DOM
    document.querySelectorAll(".clippy, .clippy-balloon").forEach(function(el){el.remove();});
    var emoji=document.getElementById("pet-emoji");
    if(emoji){emoji.textContent="\u23f3";emoji.style.display="block";IDLE_ANIMS.forEach(function(a){emoji.classList.remove(a)});}
    if(!window.clippy){
        var s=document.createElement("script");
        s.src="https://cdn.jsdelivr.net/gh/clippyjs/clippy.js@master/build/clippy.min.js";
        s.onload=function(){
            clippy.BASE_PATH="https://cdn.jsdelivr.net/gh/clippyjs/clippy.js@master/agents/";
            doLoad();
        };
        s.onerror=function(){showFallback()};
        document.body.appendChild(s);
    } else {
        clippy.BASE_PATH="https://cdn.jsdelivr.net/gh/clippyjs/clippy.js@master/agents/";
        doLoad();
    }
    function doLoad(){
        try{
            clippy.load(currentPet,function(a){
                agent=a; agent.show();
                // Move all .clippy elements into the stage
                document.querySelectorAll(".clippy").forEach(function(el){
                    el.style.position="absolute";
                    el.style.left="50%";el.style.top="50%";
                    el.style.transform="translate(-50%,-50%)";
                    document.getElementById("pet-stage").appendChild(el);
                });
                if(emoji) emoji.style.display="none";
                agent.animate(); startClippyIdleLoop();
            }, function(){ showFallback(); });
        }catch(e){showFallback();}
    }
    function showFallback(){if(emoji){emoji.textContent="\ud83d\udcce";emoji.style.display="block";cycleIdleAnim();}}
}
var clippyIdleLoop=null;
function startClippyIdleLoop(){
    clearInterval(clippyIdleLoop);
    clippyIdleLoop=setInterval(function(){
        if(!agent||!state||!state.alive) return;
        var anims;
        if(state.energy<30) anims=["Processing","IdleRopePile","Idle1_1"];
        else if(state.happiness<30) anims=["Sad","Wave","LookDown"];
        else if(state.hunger<30) anims=["Searching","LookRight","LookLeft"];
        else if(state.hygiene<30) anims=["Surprised","Alert","IdleHeadScratch"];
        else anims=["Congratulate","Pleased","Wave","Writing","Thinking","GetAttention","IdleRopePile"];
        var pick=anims[Math.floor(Math.random()*anims.length)];
        try{agent.play(pick)}catch(e){try{agent.animate()}catch(e2){}}
    },6000);
}
function refreshState(){
    fetch("/api/state").then(function(r){
        if(!r.ok) throw new Error("offline");
        return r.json();
    }).then(function(s){
        state=s; updateUI();
        // Connection restored — remove sleep overlay if present
        var sleepOv=document.getElementById("sleep-overlay");
        if(sleepOv) sleepOv.remove();
        connectionFails=0;
    }).catch(function(){
        connectionFails++;
        if(connectionFails>=3) showSleepOverlay();
    });
}
var connectionFails=0;
function showSleepOverlay(){
    if(document.getElementById("sleep-overlay")) return;
    var ov=document.createElement("div");
    ov.id="sleep-overlay";
    ov.className="sleep-overlay";
    ov.innerHTML='<div class="sleep-content"><span class="sleep-icon">\ud83d\udca4</span><p>Clippy fell asleep...</p><p class="sleep-hint">The extension restarted. Click below to wake up!</p><button class="wake-btn" id="wake-btn">\u2615 Wake Up Clippy</button></div>';
    document.body.appendChild(ov);
    document.getElementById("wake-btn").addEventListener("click",function(){
        // Attempt to reload — if the extension restarted, the host will re-route to new port
        window.location.reload();
    });
}
function updateUI(){
    if(!state) return;
    document.getElementById("hunger-bar").style.width=state.hunger+"%";
    document.getElementById("happiness-bar").style.width=state.happiness+"%";
    document.getElementById("energy-bar").style.width=state.energy+"%";
    document.getElementById("hygiene-bar").style.width=state.hygiene+"%";
    document.getElementById("age-display").textContent="Age: "+state.age+" ticks";
    var avg=(state.hunger+state.happiness+state.energy+state.hygiene)/4;
    var dn=state.nickname||state.name;
    var mood="";
    if(!state.alive) mood="\ud83d\udc80 "+dn+" has passed away...";
    else if(avg>70) mood="\u2728 "+dn+" is thriving!";
    else if(avg>50) mood="\ud83d\ude0a "+dn+" is doing okay";
    else if(avg>30) mood="\ud83d\ude1f "+dn+" needs attention!";
    else mood="\ud83d\ude30 "+dn+" is in critical condition!";
    document.getElementById("mood").textContent=mood;
    if(!isEditing) renderNameArea();
    cycleIdleAnim();
    var existing=document.querySelector(".dead-overlay"); if(existing) existing.remove();
    if(!state.alive){
        var ov=document.createElement("div"); ov.className="dead-overlay";
        ov.innerHTML='<span>\ud83d\udc80</span><p>R.I.P. '+dn+'</p><button class="reset-btn" id="revive-btn">Revive Pet</button>';
        document.getElementById("pet-stage").appendChild(ov);
        document.getElementById("revive-btn").addEventListener("click",function(){doAction("reset")});
    }
}
function doAction(action){
    var btns=document.querySelectorAll(".action-btn");
    btns.forEach(function(b){b.disabled=true});
    fetch("/api/action",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:action})})
    .then(function(r){return r.json()}).then(function(data){
        state=data.state; updateUI();
        if(data.message) showToast(data.message);
        if(data.effect){spawnParticles(data.effect);flashStage(data.effect);}
        if(data.thought) showThought(data.thought);
        if(action==="feed"){highlightStat("stat-hunger");highlightStat("stat-energy");}
        if(action==="play") highlightStat("stat-happiness");
        if(action==="sleep") highlightStat("stat-energy");
        if(action==="clean"){highlightStat("stat-hygiene");highlightStat("stat-happiness");}
        if(agent&&data.animation){try{agent.play(data.animation)}catch(e){try{agent.animate()}catch(e2){}}}
        else if(agent){try{agent.animate()}catch(e){}}
        setTimeout(function(){btns.forEach(function(b){b.disabled=false})},600);
    }).catch(function(){btns.forEach(function(b){b.disabled=false})});
}
setInterval(function(){
    if(!state||!state.alive) return;
    fetch("/api/thought").then(function(r){return r.json()}).then(function(t){showThought(t)}).catch(function(){});
},8000);

// Session events polling
var EFFECT_MAP = {
    build_success:"+10\u2764\ufe0f +5\u26a1", build_failure:"-5\u2764\ufe0f", tests_passed:"+10\u2764\ufe0f +5\u26a1",
    tests_failed:"-5\u2764\ufe0f", pr_opened:"+5\u2764\ufe0f +3\ud83c\udf55", pr_merged:"+10\u2764\ufe0f +5\u26a1",
    issue_created:"+5\u2764\ufe0f +3\ud83c\udf55", issue_closed:"+10\u2764\ufe0f +5\u26a1",
    issue_edited:"+3\u2764\ufe0f", issue_assigned:"+3\u2764\ufe0f", issue_commented:"+5\u2764\ufe0f +3\ud83c\udf55",
    achievement:"+10\u2764\ufe0f +5\u26a1", error:"-5\u2764\ufe0f"
};
var SENTIMENT_MAP = {
    build_success:"positive", tests_passed:"positive", pr_merged:"positive", issue_closed:"positive", achievement:"positive",
    issue_created:"positive", pr_opened:"positive", issue_commented:"positive", issue_edited:"neutral", issue_assigned:"neutral",
    build_failure:"negative", tests_failed:"negative", error:"negative",
    session_start:"neutral", session_idle:"neutral", pr_review:"neutral", custom:"neutral"
};

// Poll countdown timer
var pollCountdown = 30;
var pollTimerEl = document.getElementById("poll-timer");
setInterval(function(){
    pollCountdown--;
    if(pollCountdown<=0) pollCountdown=30;
    if(pollTimerEl) pollTimerEl.textContent="\ud83d\udd0d Next check in "+pollCountdown+"s";
},1000);

function pollEvents(){
    pollCountdown=30;
    fetch("/api/events").then(function(r){return r.json()}).then(function(events){
        if(!events||!events.length) return;
        var feed=document.getElementById("session-feed");
        events.forEach(function(ev){
            showThought({text:ev.message, emoji:ev.emoji});
            // Add to activity log
            var effect=EFFECT_MAP[ev.type]||"";
            var sentiment=SENTIMENT_MAP[ev.type]||"neutral";
            addLogEntry(ev.emoji, ev.message, effect, sentiment, ev.timestamp);
            // Add to inline feed
            if(!feed.querySelector(".event-feed-title")){
                feed.innerHTML='<div class="event-feed-title">\ud83d\udce1 Session Activity</div><div class="event-feed" id="event-list"></div>';
            }
            var list=document.getElementById("event-list");
            var ago=Math.round((Date.now()-ev.timestamp)/1000);
            var timeStr=ago<60?ago+"s ago":Math.round(ago/60)+"m ago";
            var item=document.createElement("div");
            item.className="event-item";
            item.innerHTML='<span class="event-emoji">'+ev.emoji+'</span><span class="event-msg">'+ev.message+'</span><span class="event-time">'+timeStr+'</span>';
            list.insertBefore(item,list.firstChild);
            while(list.children.length>10) list.removeChild(list.lastChild);
        });
        if(agent){try{agent.animate()}catch(e){}}
        spawnParticles("sparkle"); flashStage("sparkle");
    }).catch(function(){});
}

// Also load today's activity history on startup
fetch("/api/today").then(function(r){return r.json()}).then(function(data){
    if(!data||!data.events||!data.events.length) return;
    // Sort by timestamp ascending so newest ends up on top
    data.events.sort(function(a,b){return a.timestamp-b.timestamp});
    data.events.forEach(function(ev){
        var effect=EFFECT_MAP[ev.type]||"";
        var sentiment=SENTIMENT_MAP[ev.type]||"neutral";
        addLogEntry(ev.emoji, ev.message, effect, sentiment, ev.timestamp);
    });
    // Show daily summary
    var summary=document.getElementById("daily-summary");
    if(summary) summary.textContent="\ud83d\udcc5 Today: "+data.events.length+" action"+(data.events.length===1?"":"s")+" \u2022 Keep going!";
}).catch(function(){});

setInterval(pollEvents,30000); pollEvents();

renderPetSelect(); loadAgent(); refreshState();
setInterval(refreshState,5000); setInterval(cycleIdleAnim,8000);
<\/script>
</body>
</html>`;
}

async function startServer(instanceId) {
    let state = petStates.get(instanceId) || getDefaultState("Clippy");
    petStates.set(instanceId, state);
    const server = createServer((req, res) => {
        state = petStates.get(instanceId) || state;
        state = decayStats(state);
        petStates.set(instanceId, state);
        if (req.url === "/api/state" && req.method === "GET") {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(state));
        } else if (req.url === "/api/thought" && req.method === "GET") {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(getThought(state)));
        } else if (req.url === "/api/events" && req.method === "GET") {
            // Return and clear pending session events
            const events = sessionEvents.get(instanceId) || [];
            sessionEvents.set(instanceId, []);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(events));
        } else if (req.url === "/api/today" && req.method === "GET") {
            // Return today's full activity history
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ events: todayEvents }));
        } else if (req.url === "/api/action" && req.method === "POST") {
            let body = "";
            req.on("data", (chunk) => { body += chunk; });
            req.on("end", () => {
                try {
                    const parsed = JSON.parse(body || "{}");
                    const result = handleAction(state, parsed.action, parsed);
                    state = result.state;
                    petStates.set(instanceId, state);
                    res.setHeader("Content-Type", "application/json");
                    res.end(JSON.stringify(result));
                } catch(e) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: "Bad request" }));
                }
            });
        } else if (req.url === "/clippy.css") {
            res.setHeader("Content-Type", "text/css");
            res.end(".clippy{position:absolute!important;z-index:5}.clippy-balloon{display:none!important}");
        } else if (req.url.startsWith("/agents/")) {
            // Proxy agent files from GitHub
            const agentPath = req.url.replace("/agents/", "");
            fetchGitHub(agentPath).then(({ buf, ct }) => {
                res.setHeader("Content-Type", ct);
                res.setHeader("Cache-Control", "public, max-age=86400");
                res.end(buf);
            }).catch(() => {
                res.statusCode = 404;
                res.end("Agent file not found");
            });
        } else {
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.end(renderHtml(instanceId));
        }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    return { server, url: `http://127.0.0.1:${port}/` };
}

// Session events queue - pushed by the agent tool, consumed by canvas via SSE
const sessionEvents = new Map(); // instanceId → [{type, message, emoji, timestamp}]

function pushSessionEvent(instanceId, event) {
    if (!sessionEvents.has(instanceId)) sessionEvents.set(instanceId, []);
    const queue = sessionEvents.get(instanceId);
    queue.push({ ...event, timestamp: Date.now() });
    if (queue.length > 20) queue.shift(); // keep last 20
}

// --- GitHub Activity Polling ---

const WATCHED_REPOS = ["github/devrel","softchris/mcp-book","softchris/agentic-book","softchris/mmm","softchris/mcp-workshop","microsoft/Web-Dev-For-Beginners"];
const lastSeenEventIds = new Set();
let ghPollInitialized = false;
let ghUsername = "";
const todayEvents = []; // All of today's events for the daily summary

// Resolve authenticated GitHub user
try {
    const loginResult = execSync("gh api graphql -f query=" + JSON.stringify("{viewer{login}}") + " 2>nul", { encoding: "utf-8", timeout: 5000 });
    const loginData = JSON.parse(loginResult);
    ghUsername = (loginData.data && loginData.data.viewer && loginData.data.viewer.login) || "";
} catch (e) {
    ghUsername = "";
}

function mapGitHubEvent(ghEvent) {
    const type = ghEvent.type;
    const payload = ghEvent.payload || {};
    const repo = (ghEvent.repo && ghEvent.repo.name) || "unknown";
    const actor = (ghEvent.actor && ghEvent.actor.login) || "someone";

    if (type === "IssuesEvent") {
        const action = payload.action; // opened, closed, edited, assigned, reopened
        const title = (payload.issue && payload.issue.title) || "";
        if (action === "opened") return { type: "issue_created", message: `${actor} opened issue: "${title}" in ${repo}`, emoji: "\ud83d\udcdd" };
        if (action === "closed") return { type: "issue_closed", message: `${actor} closed issue: "${title}" in ${repo}`, emoji: "\ud83c\udf1f" };
        if (action === "edited") return { type: "issue_edited", message: `${actor} edited issue: "${title}" in ${repo}`, emoji: "\u270f\ufe0f" };
        if (action === "assigned") return { type: "issue_assigned", message: `Issue "${title}" assigned in ${repo}`, emoji: "\ud83d\udc64" };
        if (action === "reopened") return { type: "issue_created", message: `${actor} reopened issue: "${title}" in ${repo}`, emoji: "\ud83d\udcdd" };
        return null;
    }
    if (type === "IssueCommentEvent") {
        const title = (payload.issue && payload.issue.title) || "";
        return { type: "issue_commented", message: `${actor} commented on "${title}" in ${repo}`, emoji: "\ud83d\udcac" };
    }
    if (type === "PullRequestEvent") {
        const action = payload.action;
        const title = (payload.pull_request && payload.pull_request.title) || "";
        if (action === "opened") return { type: "pr_opened", message: `${actor} opened PR: "${title}" in ${repo}`, emoji: "\ud83d\udce8" };
        if (action === "closed" && payload.pull_request && payload.pull_request.merged) return { type: "pr_merged", message: `PR merged: "${title}" in ${repo}`, emoji: "\ud83c\udf89" };
        if (action === "closed") return { type: "pr_review", message: `PR closed: "${title}" in ${repo}`, emoji: "\ud83d\udc40" };
        return null;
    }
    if (type === "PullRequestReviewEvent") {
        const title = (payload.pull_request && payload.pull_request.title) || "";
        return { type: "pr_review", message: `${actor} reviewed PR: "${title}" in ${repo}`, emoji: "\ud83d\udc40" };
    }
    return null;
}

function applyEventStats(eventType) {
    // Apply stat changes to all open pet instances
    for (const [instId, state] of petStates.entries()) {
        if (!state.alive) continue;
        if (["build_success", "tests_passed", "pr_merged", "achievement", "issue_closed"].includes(eventType)) {
            state.happiness = Math.min(100, state.happiness + 10);
            state.energy = Math.min(100, state.energy + 5);
        } else if (["issue_created", "pr_opened", "issue_commented"].includes(eventType)) {
            state.happiness = Math.min(100, state.happiness + 5);
            state.hunger = Math.min(100, state.hunger + 3);
        } else if (["issue_edited", "issue_assigned"].includes(eventType)) {
            state.happiness = Math.min(100, state.happiness + 3);
        } else if (["build_failure", "tests_failed", "error"].includes(eventType)) {
            state.happiness = Math.max(0, state.happiness - 5);
        }
    }
}

function pollGitHubActivity() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayIso = todayStart.toISOString();
    const todayMs = todayStart.getTime();

    // Use GraphQL for real-time issue/PR activity (no propagation delay)
    for (const repo of WATCHED_REPOS) {
        const [owner, name] = repo.split("/");
        try {
            const query = `{ repository(owner:"${owner}", name:"${name}") { issues(first:10, orderBy:{field:UPDATED_AT, direction:DESC}, filterBy:{since:"${todayIso}"}) { nodes { number title createdAt updatedAt state author { login } comments(last:1) { nodes { createdAt author { login } } } } } pullRequests(first:5, orderBy:{field:UPDATED_AT, direction:DESC}) { nodes { number title createdAt updatedAt state merged mergedAt author { login } } } } }`;
            const result = execSync("gh api graphql -f query=" + JSON.stringify(query) + " 2>nul", { encoding: "utf-8", timeout: 15000 });
            const data = JSON.parse(result || "{}");
            const repoData = data.data && data.data.repository;
            if (!repoData) continue;

            // Process issues
            const issues = (repoData.issues && repoData.issues.nodes) || [];
            for (const issue of issues) {
                const updatedAt = new Date(issue.updatedAt).getTime();
                const createdAt = new Date(issue.createdAt).getTime();
                if (updatedAt < todayMs) continue;

                // Check if the user authored or commented
                const isAuthor = issue.author && issue.author.login && issue.author.login.toLowerCase() === ghUsername.toLowerCase();
                const lastComment = issue.comments && issue.comments.nodes && issue.comments.nodes[0];
                const userCommented = lastComment && lastComment.author && lastComment.author.login && lastComment.author.login.toLowerCase() === ghUsername.toLowerCase();

                // Generate unique event IDs based on issue + timestamp
                if (userCommented) {
                    const commentTime = new Date(lastComment.createdAt).getTime();
                    const evId = `comment-${repo}-${issue.number}-${commentTime}`;
                    if (!lastSeenEventIds.has(evId)) {
                        lastSeenEventIds.add(evId);
                        const mapped = { type: "issue_commented", message: `Commented on "${issue.title}" in ${repo}`, emoji: "\ud83d\udcac" };
                        if (commentTime >= todayMs) todayEvents.push({ ...mapped, timestamp: commentTime });
                        if (!ghPollInitialized && (Date.now() - commentTime > 5 * 60 * 1000)) continue;
                        for (const instId of petStates.keys()) pushSessionEvent(instId, mapped);
                        applyEventStats(mapped.type);
                    }
                }

                if (isAuthor) {
                    if (issue.state === "CLOSED") {
                        const evId = `closed-${repo}-${issue.number}`;
                        if (!lastSeenEventIds.has(evId)) {
                            lastSeenEventIds.add(evId);
                            const mapped = { type: "issue_closed", message: `Closed issue: "${issue.title}" in ${repo}`, emoji: "\ud83c\udf1f" };
                            todayEvents.push({ ...mapped, timestamp: updatedAt });
                            if (!ghPollInitialized && (Date.now() - updatedAt > 5 * 60 * 1000)) continue;
                            for (const instId of petStates.keys()) pushSessionEvent(instId, mapped);
                            applyEventStats(mapped.type);
                        }
                    } else {
                        // Use createdAt for issue creation — not updatedAt
                        const evId = `issue-${repo}-${issue.number}`;
                        if (!lastSeenEventIds.has(evId)) {
                            lastSeenEventIds.add(evId);
                            const mapped = { type: "issue_created", message: `Opened issue: "${issue.title}" in ${repo}`, emoji: "\ud83d\udcdd" };
                            if (createdAt >= todayMs) todayEvents.push({ ...mapped, timestamp: createdAt });
                            if (!ghPollInitialized && (Date.now() - createdAt > 5 * 60 * 1000)) continue;
                            for (const instId of petStates.keys()) pushSessionEvent(instId, mapped);
                            applyEventStats(mapped.type);
                        }
                    }
                }
            }

            // Process PRs (only today's)
            const prs = (repoData.pullRequests && repoData.pullRequests.nodes) || [];
            for (const pr of prs) {
                const updatedAt = new Date(pr.updatedAt).getTime();
                const createdAt = new Date(pr.createdAt).getTime();
                const mergedAt = pr.mergedAt ? new Date(pr.mergedAt).getTime() : updatedAt;
                if (updatedAt < todayMs) continue;
                const isAuthor = pr.author && pr.author.login && pr.author.login.toLowerCase() === ghUsername.toLowerCase();
                if (!isAuthor) continue;

                if (pr.merged) {
                    const evId = `pr-merged-${repo}-${pr.number}`;
                    if (!lastSeenEventIds.has(evId)) {
                        lastSeenEventIds.add(evId);
                        const mapped = { type: "pr_merged", message: `PR merged: "${pr.title}" in ${repo}`, emoji: "\ud83c\udf89" };
                        if (mergedAt >= todayMs) todayEvents.push({ ...mapped, timestamp: mergedAt });
                        if (!ghPollInitialized && (Date.now() - mergedAt > 5 * 60 * 1000)) continue;
                        for (const instId of petStates.keys()) pushSessionEvent(instId, mapped);
                        applyEventStats(mapped.type);
                    }
                } else if (pr.state === "OPEN") {
                    const evId = `pr-open-${repo}-${pr.number}`;
                    if (!lastSeenEventIds.has(evId)) {
                        lastSeenEventIds.add(evId);
                        const mapped = { type: "pr_opened", message: `Opened PR: "${pr.title}" in ${repo}`, emoji: "\ud83d\udce8" };
                        if (createdAt >= todayMs) todayEvents.push({ ...mapped, timestamp: createdAt });
                        if (!ghPollInitialized && (Date.now() - createdAt > 5 * 60 * 1000)) continue;
                        for (const instId of petStates.keys()) pushSessionEvent(instId, mapped);
                        applyEventStats(mapped.type);
                    }
                }
            }
        } catch (e) {
            // gh CLI not available or rate limited — skip silently
        }
    }
    ghPollInitialized = true;
    // Trim seen set to avoid memory growth
    if (lastSeenEventIds.size > 500) {
        const arr = [...lastSeenEventIds];
        arr.splice(0, arr.length - 200);
        lastSeenEventIds.clear();
        arr.forEach(id => lastSeenEventIds.add(id));
    }
}

// Initial load + poll every 30s
pollGitHubActivity();
setInterval(pollGitHubActivity, 30000);

const session = await joinSession({
    tools: [
        {
            name: "notify_clippy",
            description: "Notify the Clippy Tamagotchi pet about session events. Use this to keep Clippy aware of what's happening - builds, tests, PR status, errors, or achievements. Clippy reacts with animations and thought bubbles. Call this when interesting things happen in the session.",
            parameters: {
                type: "object",
                properties: {
                    event_type: {
                        type: "string",
                        enum: ["build_success", "build_failure", "tests_passed", "tests_failed", "pr_opened", "pr_merged", "pr_review", "error", "achievement", "session_start", "session_idle", "issue_created", "issue_closed", "issue_edited", "issue_assigned", "issue_commented", "custom"],
                        description: "Type of event"
                    },
                    message: { type: "string", description: "Short description of what happened" },
                    details: { type: "string", description: "Optional extra details" },
                },
                required: ["event_type", "message"],
            },
            handler: async (ctx) => {
                const { event_type, message, details } = ctx.input;
                const emojiMap = {
                    build_success: "\u2705", build_failure: "\ud83d\udca5", tests_passed: "\u2728",
                    tests_failed: "\ud83d\udd34", pr_opened: "\ud83d\udce8", pr_merged: "\ud83c\udf89",
                    pr_review: "\ud83d\udc40", error: "\u26a0\ufe0f", achievement: "\ud83c\udfc6",
                    session_start: "\ud83d\ude80", session_idle: "\ud83d\ude34", custom: "\ud83d\udcac",
                    issue_created: "\ud83d\udcdd", issue_closed: "\ud83c\udf1f", issue_edited: "\u270f\ufe0f",
                    issue_assigned: "\ud83d\udc64", issue_commented: "\ud83d\udcac",
                };
                const event = { type: event_type, message, details, emoji: emojiMap[event_type] || "\ud83d\udcac" };

                // Push to all open canvas instances
                for (const [instId, state] of petStates.entries()) {
                    pushSessionEvent(instId, event);
                    // Positive events boost stats - rewards productivity!
                    if (["build_success", "tests_passed", "pr_merged", "achievement", "issue_closed"].includes(event_type)) {
                        state.happiness = Math.min(100, state.happiness + 10);
                        state.energy = Math.min(100, state.energy + 5);
                    } else if (["issue_created", "pr_opened", "issue_commented"].includes(event_type)) {
                        state.happiness = Math.min(100, state.happiness + 5);
                        state.hunger = Math.min(100, state.hunger + 3); // productive work feeds clippy!
                    } else if (["issue_edited", "issue_assigned"].includes(event_type)) {
                        state.happiness = Math.min(100, state.happiness + 3);
                    } else if (["build_failure", "tests_failed", "error"].includes(event_type)) {
                        state.happiness = Math.max(0, state.happiness - 5);
                    }
                }
                return { ok: true, message: "Clippy noticed: " + message };
            },
        },
    ],
    hooks: {
        onUserPromptSubmitted: async () => {
            return {
                additionalContext: "You have a Clippy Tamagotchi pet canvas open. When noteworthy events happen (builds pass/fail, tests complete, PRs opened/merged, issues created/closed/edited/assigned/commented, errors occur, or achievements), call the `notify_clippy` tool to keep the pet informed. Issue events are especially motivating \u2014 closing an issue gives Clippy a big happiness boost! Don't overdo it \u2014 only notify for meaningful events, not every small action.",
            };
        },
    },
    canvases: [
        createCanvas({
            id: "clippy-tamagotchi",
            displayName: "Clippy Tamagotchi",
            description: "A Tamagotchi-style virtual pet game featuring Clippy and MS Office assistant friends. Feed, play, rest, and clean your pet to keep it happy and alive!",
            inputSchema: { type: "object", properties: { pet: { type: "string", description: "Which pet to start with", enum: AVAILABLE_PETS } } },
            actions: [
                { name: "feed", description: "Feed the pet to increase hunger satisfaction",
                    handler: async (ctx) => { let s=petStates.get(ctx.instanceId)||getDefaultState("Clippy"); const r=handleAction(s,"feed",{}); petStates.set(ctx.instanceId,r.state); return r; } },
                { name: "play", description: "Play with the pet to increase happiness",
                    handler: async (ctx) => { let s=petStates.get(ctx.instanceId)||getDefaultState("Clippy"); const r=handleAction(s,"play",{}); petStates.set(ctx.instanceId,r.state); return r; } },
                { name: "sleep", description: "Let the pet rest to recover energy",
                    handler: async (ctx) => { let s=petStates.get(ctx.instanceId)||getDefaultState("Clippy"); const r=handleAction(s,"sleep",{}); petStates.set(ctx.instanceId,r.state); return r; } },
                { name: "clean", description: "Clean the pet to improve hygiene",
                    handler: async (ctx) => { let s=petStates.get(ctx.instanceId)||getDefaultState("Clippy"); const r=handleAction(s,"clean",{}); petStates.set(ctx.instanceId,r.state); return r; } },
                { name: "get_status", description: "Get current pet stats and mood",
                    handler: async (ctx) => { let s=petStates.get(ctx.instanceId)||getDefaultState("Clippy"); s=decayStats(s); petStates.set(ctx.instanceId,s); const avg=(s.hunger+s.happiness+s.energy+s.hygiene)/4; return {...s,mood:avg>70?"thriving":avg>50?"okay":avg>30?"needs attention":"critical",averageHealth:Math.round(avg),thought:getThought(s)}; } },
                { name: "session_event", description: "Push a session event to the canvas (build status, PR updates, etc.)",
                    inputSchema: { type: "object", properties: { event_type: { type: "string" }, message: { type: "string" }, emoji: { type: "string" } }, required: ["event_type", "message"] },
                    handler: async (ctx) => {
                        const { event_type, message, emoji } = ctx.input;
                        pushSessionEvent(ctx.instanceId, { type: event_type, message, emoji: emoji || "\ud83d\udcac" });
                        return { ok: true };
                    },
                },
            ],
            open: async (ctx) => {
                if (ctx.input && ctx.input.pet) petStates.set(ctx.instanceId, getDefaultState(ctx.input.pet));
                let entry = servers.get(ctx.instanceId);
                if (!entry) { entry = await startServer(ctx.instanceId); servers.set(ctx.instanceId, entry); }
                const pet = petStates.get(ctx.instanceId)?.name || "Clippy";
                return { title: "\ud83d\udcce C.L.I.P.P.Y. - " + pet, url: entry.url };
            },
            onClose: async (ctx) => {
                const entry = servers.get(ctx.instanceId);
                if (entry) { servers.delete(ctx.instanceId); await new Promise((r) => entry.server.close(() => r())); }
            },
        }),
    ],
});

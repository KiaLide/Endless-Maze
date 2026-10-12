'use strict';
// ============ 畫面與操作 ============
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const RARITY_COLOR = {'普通': '#b9b3a6', '優良': '#6cc36a', '稀有': '#5aa2ff', '史詩': '#b47aff', '傳說': '#ffa530', '神話': '#ff5a78'};
let ATLAS = null, AW = 1024, AH = 512;

function spr(key, scale = 2, frame = 0, extra = '') {
  const a = DATA.atlas[key]; if (!a) return '';
  let [x, y, w, h] = a;
  if (key.startsWith('wstrip:')) { x += frame * 32; w = 32; }
  return `<span class="spr ${extra}" style="width:${w * scale}px;height:${h * scale}px;background-position:-${x * scale}px -${y * scale}px;background-size:${AW * scale}px ${AH * scale}px"></span>`;
}
function equipIcon(type, item, scale = 2) {
  if (type === 'weapon') return spr('wstrip:' + item.cls, scale, item.tier - 1);
  if (type === 'armor') return spr('misc:armor_' + item.set, scale);
  if (type === 'acc') return spr(item.idx % 2 ? 'misc:acc_amulet' : 'misc:acc_ring', scale);
  return spr(itemIcon(item), scale);
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c])); }

function show(id) { $$('.screen').forEach(s => s.hidden = s.id !== id); }
let toastT = 0;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 1800); }

// ---------- 通用視窗 ----------
let modalResolve = null;
function modal(html, buttons = [], cls = '') {
  const m = $('#modal');
  m.className = 'modal ' + cls;
  $('#modal-body').innerHTML = html;
  const bar = $('#modal-btns'); bar.innerHTML = '';
  return new Promise(res => {
    modalResolve = v => { m.hidden = true; modalResolve = null; res(v); };
    buttons.forEach(([label, val, style]) => {
      const b = document.createElement('button'); b.className = 'btn ' + (style || ''); b.textContent = label;
      b.onclick = () => modalResolve(val); bar.appendChild(b);
    });
    m.hidden = false;
    const first = bar.querySelector('button'); if (first) first.focus({preventScroll: true});
  });
}

// ============ 場景渲染（簡易光線投射） ============
const VIEW_W = 160, VIEW_H = 160;
// 十字路口：玩家停在路口前，前、左、右三條通道都延伸到霧裡，看不到盡頭
const MAP_N = 31, MAP_C = 15;
const MAP = Array.from({length: MAP_N}, (_, y) => Array.from({length: MAP_N}, (_, x) => (x === MAP_C || y === MAP_C) && x > 0 && y > 0 && x < MAP_N - 1 && y < MAP_N - 1 ? '.' : '#').join(''));
const CAM0 = {x: MAP_C + 0.5, y: MAP_C + 2.5, a: -Math.PI / 2};
const TEX = {};
let view, vctx, vimg;
const cam = {x: CAM0.x, y: CAM0.y, a: CAM0.a, bob: 0, fade: 0, region: 0};
const scene = {mon: null, monScale: 2.6, monShake: 0, monFlash: 0, monDead: 0, ev: null, wpnKick: 0, playerHit: 0, special: 0};

function texFrom(key) {
  const [x, y, w, h] = DATA.atlas[key];
  const c = document.createElement('canvas'); c.width = 32; c.height = 32;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  try { g.drawImage(ATLAS, x, y, w, h, 0, 0, 32, 32); return g.getImageData(0, 0, 32, 32).data; }
  catch (e) {
    // 無法讀取像素時（例如 file:// 被視為跨來源），改用純色材質，避免整個畫面變黑
    const fb = {0: [92, 88, 84], 1: [52, 66, 48], 2: [30, 32, 36]}[key.split(':')[2]] || [80, 80, 80];
    const t = new Uint8ClampedArray(32 * 32 * 4);
    for (let i = 0; i < t.length; i += 4) { const n = ((i >> 2) % 32 === 0 || (i >> 7) % 16 === 0) ? 0.7 : 1; t[i] = fb[0] * n; t[i + 1] = fb[1] * n; t[i + 2] = fb[2] * n; t[i + 3] = 255; }
    return t;
  }
}
function regionTex(r) {
  if (TEX[r]) return TEX[r];
  const k = REGIONS[r].key;
  const floor = texFrom(`scene:${k}:1`), ceil = texFrom(`scene:${k}:2`);
  TEX[r] = {wall: texFrom(`scene:${k}:0`), floor, ceil, floorAvg: avgColor(floor), ceilAvg: avgColor(ceil), fog: hex(REGIONS[r].fog), sky: hex(REGIONS[r].sky)};
  return TEX[r];
}
function avgColor(t) {
  const c = [0, 0, 0];
  for (let i = 0; i < t.length; i += 4) { c[0] += t[i]; c[1] += t[i + 1]; c[2] += t[i + 2]; }
  return c.map(v => v / (t.length / 4));
}
function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
function cell(x, y) { const r = MAP[Math.floor(y)]; return !r || r[Math.floor(x)] !== '.'; }

function renderView() {
  if (!vctx) return;
  const T = regionTex(cam.region), d = vimg.data;
  const W = VIEW_W, H = VIEW_H, fov = 0.66;
  const dirX = Math.cos(cam.a), dirY = Math.sin(cam.a), plX = -dirY * fov, plY = dirX * fov;
  const horizon = H / 2 + Math.sin(cam.bob) * 2;
  const zbuf = new Float32Array(W);
  const fogMax = 7;
  const shade = (dist, base) => Math.max(0, 1 - dist / fogMax) * base;
  // 地板與天花板
  for (let y = 0; y < H; y++) {
    const isFloor = y > horizon;
    const p = isFloor ? y - horizon : horizon - y;
    if (p < 0.5) { for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; d[i] = T.fog[0]; d[i + 1] = T.fog[1]; d[i + 2] = T.fog[2]; d[i + 3] = 255; } continue; }
    const rowDist = (H * 0.5) / p;
    const sx = (dirX - plX) * rowDist / W * 2, sy = (dirY - plY) * rowDist / W * 2;
    let fx = cam.x + rowDist * (dirX - plX), fy = cam.y + rowDist * (dirY - plY);
    const tex = isFloor ? T.floor : T.ceil, avg = isFloor ? T.floorAvg : T.ceilAvg;
    const s = shade(rowDist, isFloor ? 1 : 0.45);
    const m = clamp((rowDist - 1.5) / 2.5, 0, 1); // 越遠越接近平均色，避免條紋
    for (let x = 0; x < W; x++) {
      const tx = (Math.floor(fx * 32) & 31), ty = (Math.floor(fy * 32) & 31);
      const ti = (ty * 32 + tx) * 4, i = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) d[i + c] = (tex[ti + c] * (1 - m) + avg[c] * m) * s + T.fog[c] * (1 - s);
      d[i + 3] = 255;
      fx += sx; fy += sy;
    }
  }
  // 牆
  for (let x = 0; x < W; x++) {
    const camX = 2 * x / W - 1;
    const rx = dirX + plX * camX, ry = dirY + plY * camX;
    let mx = Math.floor(cam.x), my = Math.floor(cam.y);
    const ddx = Math.abs(1 / rx), ddy = Math.abs(1 / ry);
    let stepX, stepY, sdx, sdy, side = 0;
    if (rx < 0) { stepX = -1; sdx = (cam.x - mx) * ddx; } else { stepX = 1; sdx = (mx + 1 - cam.x) * ddx; }
    if (ry < 0) { stepY = -1; sdy = (cam.y - my) * ddy; } else { stepY = 1; sdy = (my + 1 - cam.y) * ddy; }
    let hit = false, guard = 0;
    while (!hit && guard++ < 64) {
      if (sdx < sdy) { sdx += ddx; mx += stepX; side = 0; } else { sdy += ddy; my += stepY; side = 1; }
      if (cell(mx + 0.5, my + 0.5)) hit = true;
    }
    const dist = side === 0 ? sdx - ddx : sdy - ddy;
    zbuf[x] = dist;
    const lh = H / dist;
    const top = Math.floor(horizon - lh / 2), bot = Math.floor(horizon + lh / 2);
    let wx = side === 0 ? cam.y + dist * ry : cam.x + dist * rx; wx -= Math.floor(wx);
    const tx = Math.floor(wx * 32) & 31;
    const s = shade(dist, side ? 0.78 : 1);
    for (let y = Math.max(0, top); y < Math.min(H, bot); y++) {
      const ty = Math.floor((y - top) / lh * 32) & 31;
      const ti = (ty * 32 + tx) * 4, i = (y * W + x) * 4;
      d[i] = T.wall[ti] * s + T.fog[0] * (1 - s); d[i + 1] = T.wall[ti + 1] * s + T.fog[1] * (1 - s); d[i + 2] = T.wall[ti + 2] * s + T.fog[2] * (1 - s);
    }
  }
  // 受擊時畫面泛紅
  if (scene.playerHit > 0) for (let i = 0; i < d.length; i += 4) { d[i] = Math.min(255, d[i] + 90 * scene.playerHit); }
  vctx.putImageData(vimg, 0, 0);
  // 怪物或事件物件
  if (scene.mon && scene.monDead < 1) {
    const [x, y, w, h] = DATA.atlas[scene.mon];
    const s = scene.monScale;
    const dw = w * s, dh = h * s;
    const sx = (W - dw) / 2 + (scene.monShake ? (Math.random() - 0.5) * 6 * scene.monShake : 0);
    const sy = horizon + 46 - dh + Math.sin(performance.now() / 380) * 1.5 - (scene.special * 6);
    vctx.save();
    vctx.globalAlpha = 1 - scene.monDead;
    vctx.fillStyle = 'rgba(0,0,0,.45)'; vctx.beginPath(); vctx.ellipse(W / 2, horizon + 46, dw * 0.36, 5, 0, 0, Math.PI * 2); vctx.fill();
    vctx.drawImage(ATLAS, x, y, w, h, Math.round(sx), Math.round(sy), dw, dh);
    if (scene.monFlash > 0) {
      vctx.globalCompositeOperation = 'source-atop'; vctx.globalAlpha = scene.monFlash * 0.8;
      vctx.fillStyle = '#fff'; vctx.fillRect(sx, sy, dw, dh);
    }
    vctx.restore();
  }
  if (scene.ev) {
    const [x, y, w, h] = DATA.atlas[scene.ev];
    const s = 1.6, dw = w * s, dh = h * s, sx = (W - dw) / 2, sy = horizon + 40 - dh + Math.sin(performance.now() / 300) * 2;
    vctx.save(); vctx.globalAlpha = 0.35 + 0.15 * Math.sin(performance.now() / 250);
    vctx.fillStyle = '#ffe9a8'; vctx.beginPath(); vctx.ellipse(W / 2, horizon + 40, 22, 6, 0, 0, Math.PI * 2); vctx.fill(); vctx.restore();
    vctx.drawImage(ATLAS, x, y, w, h, Math.round(sx), Math.round(sy), dw, dh);
  }
  // 第一人稱武器（握在右下角）
  if (G) {
    const [x, y] = DATA.atlas['wstrip:' + G.weapon.cls];
    const k = scene.wpnKick;
    const s = 2.4, sx = W - 70 - k * 18 + Math.cos(cam.bob) * 3, sy = H - 62 - k * 22 + Math.abs(Math.sin(cam.bob)) * 4;
    vctx.drawImage(ATLAS, x + (G.weapon.tier - 1) * 32, y, 32, 32, Math.round(sx), Math.round(sy), 32 * s, 32 * s);
  }
  if (cam.fade > 0) { vctx.fillStyle = `rgba(6,5,10,${cam.fade})`; vctx.fillRect(0, 0, W, H); }
}
function loop() {
  try { renderView(); } catch (e) { if (!loop.warned) { loop.warned = true; console.error(e); } }
  decay(); requestAnimationFrame(loop);
}
function decay() {
  scene.monShake = Math.max(0, scene.monShake - 0.08); scene.monFlash = Math.max(0, scene.monFlash - 0.12);
  scene.wpnKick = Math.max(0, scene.wpnKick - 0.12); scene.playerHit = Math.max(0, scene.playerHit - 0.06);
  scene.special = Math.max(0, scene.special - 0.05);
}
function tween(ms, fn) {
  if (window.__fast) { fn(1); return Promise.resolve(); }
  return new Promise(res => {
    const t0 = performance.now();
    const f = now => { const t = Math.min(1, (now - t0) / ms); fn(t); if (t < 1) requestAnimationFrame(f); else res(); };
    requestAnimationFrame(f);
  });
}
const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
async function animateMove(dir) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const {x: x0, y: y0, a: a0} = CAM0;
  if (dir === 'f') {
    // 穿過路口繼續往前走
    await tween(reduce ? 120 : 500, t => { cam.y = y0 - ease(t) * 3.2; cam.bob = t * Math.PI * 2; });
  } else {
    // 走到路口中央、轉身、走進岔路
    await tween(reduce ? 80 : 260, t => { cam.y = y0 - ease(t) * 2.0; cam.bob = t * Math.PI; });
    const sgn = dir === 'l' ? -1 : 1;
    await tween(reduce ? 80 : 300, t => { cam.a = a0 + sgn * ease(t) * Math.PI / 2; });
    await tween(reduce ? 120 : 500, t => { cam.x = x0 + sgn * ease(t) * 1.6; cam.bob = Math.PI + t * Math.PI * 2; });
  }
  await tween(120, t => cam.fade = t);
  cam.x = x0; cam.y = y0; cam.a = a0; cam.bob = 0;
  await tween(160, t => cam.fade = 1 - t);
}

// ============ HUD ============
function refreshHud() {
  if (!G) return;
  const r = regionIdx(G.floor);
  $('#hud-floor').textContent = `地下 ${G.floor} 層`;
  $('#hud-region').textContent = REGIONS[r].name + (G.floor > 50 ? '・無限地城' : '');
  const pips = $('#hud-steps'); pips.innerHTML = '';
  for (let i = 0; i < STEPS_PER_FLOOR; i++) {
    const p = document.createElement('i');
    p.className = i < G.step ? 'done' : i === G.step ? 'now' : '';
    if (G.floor % 5 === 0 && i === 9) p.classList.add('boss');
    if (i === G.merchantStep) p.classList.add('shop');
    pips.appendChild(p);
  }
  const mh = maxHp();
  const hp = B && !B.over ? B.P.hp : G.hp, mhp = B && !B.over ? B.P.maxHp : mh;
  $('#hp-fill').style.width = (100 * hp / mhp) + '%';
  $('#hp-text').textContent = `${hp} / ${mhp}`;
  $('#hud-gold').textContent = G.gold;
  const st = [];
  if (G.phoenix) st.push('<b class="chip good">不死鳥之羽</b>');
  if (G.poison) st.push(`<b class="chip bad">中毒</b>`);
  if (G.blockHits) st.push(`<b class="chip good">結界 ×${G.blockHits}</b>`);
  const agg = {};
  G.buffs.forEach(b => { agg[b.stat] = (agg[b.stat] || 0) + b.val; });
  for (const k in agg) if (agg[k]) st.push(`<b class="chip ${agg[k] > 0 ? 'good' : 'bad'}">${STAT_NAMES[k]}${agg[k] > 0 ? '↑' : '↓'}</b>`);
  $('#hud-status').innerHTML = st.join('');
  cam.region = r;
}

// ============ 標題、命名、選角 ============
let chosenSex = '男', carIdx = 0, playerName = '';
function initTitle() {
  const row = $('#title-heroes');
  row.innerHTML = CLASSES.map(c => spr('hero:' + c, 1)).join('');
  $('#scr-title').onclick = () => { show('scr-name'); $('#name-input').focus(); };
  $('#scr-title').onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') $('#scr-title').click(); };
  $('#name-form').onsubmit = e => {
    e.preventDefault();
    const v = $('#name-input').value.trim();
    if (!v) { $('#name-err').hidden = false; return; }
    playerName = v.slice(0, 10); show('scr-class'); renderCarousel();
  };
  $$('.sex-tab').forEach(b => b.onclick = () => { chosenSex = b.dataset.sex; carIdx = 0; renderCarousel(); });
  $('#car-prev').onclick = () => { carIdx = (carIdx + 4) % 5; renderCarousel(-1); };
  $('#car-next').onclick = () => { carIdx = (carIdx + 1) % 5; renderCarousel(1); };
  $('#car-go').onclick = () => startRun(classesOf(chosenSex)[carIdx].id);
  swipe($('#car-stage'), d => { if (d === 'l') $('#car-next').click(); if (d === 'r') $('#car-prev').click(); });
  try { const best = JSON.parse(localStorage.getItem('em-best') || 'null'); if (best) $('#title-best').textContent = `最佳紀錄：${best.name}（${best.cls}）地下 ${best.floor} 層`; } catch (e) {}
}
function classesOf(sex) { return DATA.characters.filter(c => c.sex === sex); }
function renderCarousel(dir = 0) {
  $$('.sex-tab').forEach(b => b.setAttribute('aria-pressed', b.dataset.sex === chosenSex));
  const list = classesOf(chosenSex), c = list[carIdx];
  const stage = $('#car-stage');
  stage.innerHTML = list.map((x, i) => {
    const off = ((i - carIdx + 7) % 5) - 2;
    return `<div class="car-item off${off}">${spr('hero:' + x.id, off === 0 ? 3 : 1.6)}</div>`;
  }).join('');
  const sk = SKILLS[c.id];
  const b = c.base_stats;
  $('#car-info').innerHTML = `
    <h2>${c.class_name}<small>${c.hero}</small></h2>
    <p class="desc">${c.desc}</p>
    <dl class="stats">${['hp', 'atk', 'def', 'spd', 'crit', 'eva'].map(k => `<div><dt>${STAT_NAMES[k]}</dt><dd>${b[k]}${k === 'crit' || k === 'eva' ? '%' : ''}</dd></div>`).join('')}</dl>
    <p class="passive"><b>被動・${c.passive.name}</b>${c.passive.effect}</p>
    <ul class="skills">${sk.map((s, i) => `<li><b>${s.name}</b><span>通過第 ${(i + 1) * 5} 層解鎖・CD ${s.cd}</span></li>`).join('')}</ul>
    <p class="wtype">武器：${c.weapon_type}</p>`;
}

// ============ 一局 ============
async function startRun(cls) {
  newGame(playerName, cls);
  G.merchantStep = -1;
  show('scr-game');
  setMode('explore');
  refreshHud();
  await modal(`<div class="banner">${spr('hero:' + cls, 2)}<h2>${REGIONS[0].name}</h2><p>${esc(G.name)}踏進了無盡迷宮。每一步只能選左、前、右。</p><p class="hint">手機：在畫面上往上、左、右滑動。電腦：方向鍵或 W、A、D。</p></div>`, [['出發', 1, 'primary']], 'center');
}

let busy = false;
function setMode(m) {
  $('#ctrl-explore').hidden = m !== 'explore';
  $('#ctrl-battle').hidden = m !== 'battle';
  $('#battle-top').hidden = m !== 'battle';
  $('#scr-game').dataset.mode = m;
}

async function go(dir) {
  if (busy || !G || !$('#modal').hidden || $('#scr-game').hidden) return;
  busy = true;
  try {
    scene.ev = null; scene.mon = null;
    await animateMove(dir);
    await encounter();
    if (G && G.hp > 0) await afterStep();
  } finally { busy = false; refreshHud(); }
}

async function encounter() {
  const bossStep = G.floor % 5 === 0 && G.step === 9;
  if (bossStep) { await doBattle('boss'); return; }
  if (G.step === G.merchantStep) { await merchant(); return; }
  if (chance(0.5)) { await doBattle(chance(0.1) ? 'elite' : 'normal'); return; }
  if (chance(0.5)) await randomEvent(); else await choiceEvent();
}

async function afterStep() {
  G.step++;
  if (G.poison) {
    const v = Math.max(1, Math.round(maxHp() * G.poison.pct));
    G.hp = Math.max(1, G.hp - v); toast(`毒素發作，失去 ${v} 生命`);
    if (G.poison.left !== 'long') { G.poison.left--; if (G.poison.left <= 0) G.poison = null; }
  }
  tickStepBuffs();
  if (G.step >= STEPS_PER_FLOOR) await floorClear();
  refreshHud();
}

async function floorClear() {
  const passed = G.floor;
  clearBuffs(b => b.dur === 'floor');
  G.floor++; G.step = 0;
  const h = healPct(0.3);
  G.merchantStep = G.floor % 3 === 0 ? ri(0, 8) : -1;
  saveBest();
  const parts = [`<p>通過地下 ${passed} 層，回復 ${h.healed} 生命。</p>`];
  const unlockAt = {6: 0, 11: 1, 16: 2};
  if (unlockAt[G.floor] != null) {
    const sk = SKILLS[G.cls][unlockAt[G.floor]];
    parts.push(`<p class="unlock">解鎖技能：<b>${sk.name}</b><br><span>${sk.text}</span></p>`);
  }
  if ((G.floor - 1) % 10 === 0 || G.floor === 51) {
    const r = regionIdx(G.floor);
    parts.push(`<p class="region">進入新地區：<b>${REGIONS[r].name}</b>${G.floor === 51 ? '<br><span>無限地城開始了，怪物會越來越強。</span>' : ''}</p>`);
  }
  if (G.merchantStep >= 0) parts.push('<p class="hint">這一層的某一步會遇到暗商。</p>');
  refreshHud();
  await modal(`<div class="banner"><h2>地下 ${G.floor} 層</h2>${parts.join('')}</div>`, [['繼續', 1, 'primary']], 'center');
}

function saveBest() {
  try {
    const best = JSON.parse(localStorage.getItem('em-best') || 'null');
    if (!best || G.floor > best.floor) localStorage.setItem('em-best', JSON.stringify({name: G.name, cls: CHAR[G.cls].class_name, floor: G.floor}));
  } catch (e) {}
}

// ---------- 事件 ----------
function fxPreviewIcon(good) { return good ? 'misc:ev_good' : 'misc:ev_bad'; }
async function randomEvent() {
  const n = unlockedSkills(G.floor);
  let ev; do { ev = pick(EVENTS); } while ((ev.req || 0) > n);
  scene.ev = fxPreviewIcon(ev.good);
  const tierName = ['普通', '加重', '非常', '超級'][ev.tier];
  const res = applyFx(ev.fx, !ev.good);
  refreshHud();
  await modal(`<div class="ev ${ev.good ? 'good' : 'bad'}"><div class="ev-tag">${ev.good ? '好事' : '壞事'}・${tierName}</div>
    <div class="ev-icon">${spr(fxPreviewIcon(ev.good), 2)}</div><h3>${ev.name}</h3><p class="desc">${ev.desc}</p>
    <ul class="fx">${res.text.map(t => `<li>${t}</li>`).join('')}</ul></div>`, [['繼續', 1, 'primary']], 'center');
  scene.ev = null;
  if (res.battle) await doBattle(res.battle);
}
async function choiceEvent() {
  const ev = pick(CHOICES);
  scene.ev = 'misc:ev_choice';
  const tierName = ['普通', '加重', '非常', '超級'][ev.tier];
  const i = await modal(`<div class="ev choice"><div class="ev-tag">選擇・${tierName}</div>
    <div class="ev-icon">${spr('misc:ev_choice', 2)}</div><h3>${ev.name}</h3><p class="desc">${ev.desc}</p></div>`,
    ev.opts.map((o, k) => [o[0], k, 'opt']), 'center choice');
  const o = ev.opts[i];
  const res = applyFx(o[3], !o[2]);
  refreshHud();
  await modal(`<div class="ev ${o[2] ? 'good' : 'bad'}"><div class="ev-tag">${o[2] ? '好結果' : '壞結果'}</div><h3>${ev.name}・${o[0]}</h3>
    <p class="desc">${o[1]}</p><ul class="fx">${res.text.map(t => `<li>${t}</li>`).join('')}</ul></div>`, [['繼續', 1, 'primary']], 'center');
  scene.ev = null;
  if (res.battle) await doBattle(res.battle);
}

// ---------- 戰鬥 ----------
async function doBattle(kind) {
  setMode('battle');
  const res = await startBattle(kind);
  if (res.result === 'win') await tween(450, t => scene.monDead = t);
  setMode('explore');
  scene.mon = null; scene.monDead = 0;
  refreshHud();
  if (res.result === 'lose') { await gameOver(res.monster); return; }
  await modal(`<div class="banner"><h2>勝利</h2><p>打倒了${res.monster.name}，獲得 ${res.gold} 金幣。</p></div>`, [['拾取戰利品', 1, 'primary']], 'center');
  for (const d of res.drops) await takeDrop(d);
  B = null; refreshHud();
}

async function takeDrop(d) {
  if (d.type === 'item') { await gainItem(d.item); return; }
  const cur = d.type === 'weapon' ? G.weapon : d.type === 'armor' ? G.armor : G.acc;
  const card = (title, type, it) => {
    if (!it) return `<div class="cmp-card empty"><div class="cmp-title">${title}</div><p>（無）</p></div>`;
    const r = rarityOf(type, it);
    let extra = '';
    if (type === 'weapon') { const own = it.cls === G.cls; extra = `<p class="tag ${own ? 'good' : 'warn'}">${CHAR[it.cls].weapon_type}${own ? '・本職' : '・非本職（技能效果 ×0.75）'}</p>`; }
    if (type === 'acc') { const a = ACCS[it.idx]; extra = `<p class="tag">${a.class_name}・${a.style}${a.class_id === G.cls ? '' : '（非本職：技能詞條無效，其餘 ×0.75）'}</p><p class="affix">${a.affix}</p>`; }
    if (type === 'armor') extra = `<p class="tag">${ARMOR[it.set][0].set_name}・${ARMOR[it.set][0].type}</p>`;
    const tierT = type === 'acc' ? '' : `第 ${it.tier} 階・`;
    return `<div class="cmp-card"><div class="cmp-title">${title}</div><div class="cmp-head">${equipIcon(type, it, 2)}<div><b style="color:${RARITY_COLOR[r]}">${equipName(type, it)}</b><small>${tierT}${r}・數值 ${Math.round(it.roll * 100)}%</small></div></div>
      <p class="sline">${statLine(equipStats(type, it))}</p>${extra}</div>`;
  };
  const sv = sellValue(d.type, d.item);
  const v = await modal(`<div class="cmp"><h3>掉落了${{weapon: '武器', armor: '防具', acc: '飾品'}[d.type]}</h3>
    <div class="cmp-row">${card('目前', d.type, cur)}${card('新的', d.type, d.item)}</div></div>`,
    [['裝備', 'equip', 'primary'], [`換成金幣 ${sv}`, 'sell']], 'wide');
  if (v === 'equip') {
    if (cur) G.gold += sellValue(d.type, cur);
    withMaxHpChange(() => {
      if (d.type === 'weapon') G.weapon = d.item; else if (d.type === 'armor') G.armor = d.item; else G.acc = d.item;
    });
    toast(cur ? `換上${equipName(d.type, d.item)}，舊裝備換成 ${sellValue(d.type, cur)} 金幣` : `裝備了${equipName(d.type, d.item)}`);
  } else { G.gold += sv; toast(`獲得 ${sv} 金幣`); }
  refreshHud();
}

async function gainItem(id) {
  if (addItem(id)) { toast(`獲得 ${id}`); return; }
  const sell = Math.round(5 * floorF(G.floor));
  const v = await modal(`<div class="inv-full"><h3>道具欄已滿</h3><p>撿到了 ${spr(itemIcon(id), 1)} <b>${id}</b>。丟掉一格舊道具，或把它換成金幣。</p>
    <div class="inv-grid">${G.inv.map((s, i) => `<button class="slot" data-i="${i}">${spr(itemIcon(s.id), 2)}<span>${s.id} ×${s.n}</span></button>`).join('')}</div></div>`,
    [[`換成金幣 ${sell}`, 'sell', 'primary']], 'wide');
  if (v === 'sell') G.gold += sell;
  else { G.inv.splice(v, 1); addItem(id); toast(`丟掉舊道具，放入 ${id}`); }
}
// 道具欄裡的格子按鈕：點了就把索引交回 modal
document.addEventListener('click', e => {
  const s = e.target.closest('.inv-full .slot'); if (s && modalResolve) modalResolve(+s.dataset.i);
});

// ---------- 暗商 ----------
async function merchant() {
  scene.mon = 'misc:merchant';
  const F = floorF(G.floor), disc = hasAcc('金幣袋') ? 1 - 0.2 * accScale() : 1;
  const goods = [];
  for (let i = 0; i < 2; i++) {
    const t = clamp(Math.round(G.floor / 2) + ri(0, 2), 1, 20);
    const it = chance(0.5) ? {type: 'weapon', item: {cls: chance(0.5) ? G.cls : pick(CLASSES), tier: t, roll: rollRoll()}} : {type: 'armor', item: {set: pick(ARMOR_SETS), tier: t, roll: rollRoll()}};
    goods.push({...it, price: Math.round(t * 20 * disc)});
  }
  { const own = chance(0.5); const pool = ACCS.map((a, i) => i).filter(i => own ? ACCS[i].class_id === G.cls : ACCS[i].class_id !== G.cls);
    goods.push({type: 'acc', item: {idx: pick(pool), roll: rollRoll()}, price: Math.round(150 * F * disc)}); }
  const priceOf = id => { const it = ITEMS[id]; return Math.round((id.startsWith('女神') ? 600 : it.category === '永久' ? 300 : it.category === '回復' ? {小藥水: 25, 中藥水: 60, 大藥水: 120}[id] : {小: 20, 中: 45, 大: 90}[id.slice(-1)]) * F * disc); };
  for (let i = 0; i < 2; i++) { const id = rollItemId('normal').replace(/^(生命|力量|守護|迅捷|慧眼|幻影)之種$/, '中藥水').replace('女神之種', '大藥水'); goods.push({type: 'item', item: id, price: priceOf(id)}); }
  { const r = rnd(); const id = r < 0.05 ? '女神之種' : r < 0.35 ? SEED_NAMES[pick(['hp', 'atk', 'def', 'spd', 'crit', 'eva'])] : pick(['小藥水', '中藥水']); goods.push({type: 'item', item: id, price: priceOf(id)}); }
  while (true) {
    refreshHud();
    const html = `<div class="shop"><h3>暗商</h3><p class="desc">「要買點什麼嗎？」　持有 <b class="gold">${G.gold}</b> 金幣</p>
      <div class="shop-list">${goods.map((g, i) => {
        const name = g.type === 'item' ? g.item : equipName(g.type, g.item);
        const sub = g.type === 'item' ? itemDesc(g.item) : g.type === 'acc' ? `${ACCS[g.item.idx].class_name}・${ACCS[g.item.idx].style}：${ACCS[g.item.idx].affix}` : `第 ${g.item.tier} 階・${statLine(equipStats(g.type, g.item))}`;
        return `<button class="shop-item" data-i="${i}" ${g.sold || G.gold < g.price ? 'disabled' : ''}>${g.type === 'item' ? spr(itemIcon(g.item), 2) : equipIcon(g.type, g.item, 2)}
          <span class="si-name">${name}<small>${sub}</small></span><span class="si-price">${g.sold ? '售出' : g.price}</span></button>`;
      }).join('')}</div>
      <div class="shop-sell">${G.armor ? `<button class="btn small" data-sell="armor">賣掉防具 +${sellValue('armor', G.armor)}</button>` : ''}${G.acc ? `<button class="btn small" data-sell="acc">賣掉飾品 +${sellValue('acc', G.acc)}</button>` : ''}</div></div>`;
    const v = await modal(html, [['離開', 'leave', 'primary']], 'wide');
    if (v === 'leave') break;
    if (typeof v === 'string' && v.startsWith('sell:')) {
      const t = v.slice(5);
      G.gold += sellValue(t, G[t]); withMaxHpChange(() => { G[t] = null; }); continue;
    }
    const g = goods[v];
    if (!g || g.sold || G.gold < g.price) continue;
    if (g.type === 'item') { if (!addItem(g.item)) { toast('道具欄已滿'); continue; } G.gold -= g.price; g.sold = true; toast(`買下 ${g.item}`); }
    else {
      G.gold -= g.price; g.sold = true;
      const cur = g.type === 'weapon' ? G.weapon : g.type === 'armor' ? G.armor : G.acc;
      if (cur) G.gold += sellValue(g.type, cur);
      withMaxHpChange(() => { if (g.type === 'weapon') G.weapon = g.item; else if (g.type === 'armor') G.armor = g.item; else G.acc = g.item; });
      toast(`換上${equipName(g.type, g.item)}`);
    }
  }
  scene.mon = null;
}
document.addEventListener('click', e => {
  if (!modalResolve) return;
  const s = e.target.closest('.shop-item'); if (s && !s.disabled) { modalResolve(+s.dataset.i); return; }
  const t = e.target.closest('[data-sell]'); if (t) modalResolve('sell:' + t.dataset.sell);
});

// ---------- 裝備欄、道具欄 ----------
async function openEquip() {
  if (busy && !B) return;
  const s = baseStats(), c = CHAR[G.cls];
  const row = (label, type, it) => it ? `<div class="eq-row">${equipIcon(type, it, 2)}<div><small>${label}</small><b style="color:${RARITY_COLOR[rarityOf(type, it)]}">${equipName(type, it)}</b>
      <span>${type !== 'acc' ? `第 ${it.tier} 階・` : ''}數值 ${Math.round(it.roll * 100)}%・${statLine(equipStats(type, it))}</span>${type === 'acc' ? `<span class="affix">${ACCS[it.idx].affix}</span>` : ''}</div></div>`
    : `<div class="eq-row empty"><span class="spr-blank"></span><div><small>${label}</small><b>（無）</b></div></div>`;
  const n = unlockedSkills(G.floor);
  const buffs = G.buffs.map(b => `<li class="${b.val > 0 ? 'good' : 'bad'}">${STAT_NAMES[b.stat]} ${b.val > 0 ? '+' : ''}${b.val}%（${{steps: `剩 ${b.left} 步`, floor: '本層內', long: '長時間', next: '下一場戰鬥'}[b.dur]}）</li>`).join('');
  await modal(`<div class="equip">
    <div class="eq-hero">${spr('hero:' + G.cls, 1.6)}<div><h3>${esc(G.name)}</h3><p>${c.class_name}・${c.hero}</p><p class="gold">金幣 ${G.gold}</p></div></div>
    <dl class="stats">${['hp', 'atk', 'def', 'spd', 'crit', 'eva'].map(k => `<div><dt>${STAT_NAMES[k]}</dt><dd>${k === 'hp' ? `${G.hp}/${s.hp}` : fmtPct(s[k]) + (k === 'crit' || k === 'eva' ? '%' : '')}</dd></div>`).join('')}</dl>
    ${row('武器', 'weapon', G.weapon)}${row('防具', 'armor', G.armor)}${row('飾品', 'acc', G.acc)}
    <p class="passive"><b>被動・${c.passive.name}</b>${c.passive.effect}</p>
    <ul class="skills">${SKILLS[G.cls].map((k, i) => `<li class="${i < n ? '' : 'locked'}"><b>${k.name}</b><span>${i < n ? `CD ${k.cd}・${k.text}` : `通過第 ${(i + 1) * 5} 層解鎖`}</span></li>`).join('')}</ul>
    ${buffs || G.poison || G.phoenix ? `<ul class="buffs">${buffs}${G.poison ? '<li class="bad">中毒中</li>' : ''}${G.phoenix ? '<li class="good">持有不死鳥之羽</li>' : ''}</ul>` : ''}
    <p class="seeds">永久之種：${['hp', 'atk', 'def', 'spd', 'crit', 'eva'].map(k => `${STAT_NAMES[k]} ${G.seeds[k]}`).join('、')}</p>
  </div>`, [['關閉', 1, 'primary']], 'wide');
}

async function openInventory(inBattle) {
  if (!inBattle && busy) return null;
  while (true) {
    if (!G.inv.length) { await modal('<div class="inv"><h3>道具欄</h3><p class="desc">背包是空的。</p></div>', [['關閉', null, 'primary']], 'wide'); return null; }
    const v = await modal(`<div class="inv"><h3>道具欄 <small>${G.inv.length} / 6 格</small></h3>
      <div class="inv-list">${G.inv.map((s, i) => `<button class="inv-item" data-use="${i}">${spr(itemIcon(s.id), 2)}<span><b>${s.id}</b> ×${s.n}<small>${itemDesc(s.id)}</small></span><em>使用</em></button>`).join('')}</div>
      ${inBattle ? '<p class="hint">在戰鬥中使用道具會用掉這一回合。</p>' : '<p class="hint">暫時 buff 在戰鬥外使用，效果會保留到下一場戰鬥結束。</p>'}</div>`,
      [['關閉', null, 'primary']], 'wide');
    if (v == null) return null;
    const id = G.inv[v].id;
    if (inBattle) return id;
    await useItemOutside(id); refreshHud();
  }
}
document.addEventListener('click', e => { const s = e.target.closest('[data-use]'); if (s && modalResolve) modalResolve(+s.dataset.use); });

async function useItemOutside(id) {
  const it = ITEMS[id];
  if (it.category === '回復') {
    if (G.hp >= maxHp()) { toast('生命已滿'); return; }
    removeItem(id); const r = healPct(it.effect.heal_pct / 100, true); toast(`回復 ${r.healed} 生命`);
  } else if (it.category === '暫時') {
    removeItem(id); addBuff(it.stat, it.value, 'next'); toast(`${id}：效果保留到下一場戰鬥結束`);
  } else if (it.category === '永久') {
    const stat = it.stat === '任選' ? await chooseStat() : it.stat;
    if (!stat) return;
    removeItem(id); withMaxHpChange(() => { G.seeds[stat]++; }); toast(`${STAT_NAMES[stat]} 永久 +1 點`);
  }
}
async function chooseStat() {
  return modal('<div class="banner"><h3>女神之種</h3><p>選擇要提升的屬性（+1 點）</p></div>',
    ['hp', 'atk', 'def', 'spd', 'crit', 'eva'].map(k => [STAT_NAMES[k], k, 'opt']), 'center choice');
}

async function gameOver(mon) {
  saveBest();
  let best = null; try { best = JSON.parse(localStorage.getItem('em-best') || 'null'); } catch (e) {}
  await modal(`<div class="banner over"><h2>倒下了</h2><p>${esc(G.name)}在地下 ${G.floor} 層被${mon.name}打倒。</p>
    <dl class="stats"><div><dt>到達樓層</dt><dd>${G.floor}</dd></div><div><dt>打倒怪物</dt><dd>${G.kills}</dd></div><div><dt>武器</dt><dd>第 ${G.weapon.tier} 階</dd></div></dl>
    ${best ? `<p class="hint">最佳紀錄：地下 ${best.floor} 層（${best.name}・${best.cls}）</p>` : ''}</div>`, [['再挑戰一次', 1, 'primary']], 'center');
  G = null; B = null; scene.mon = null;
  show('scr-class'); renderCarousel();
}

// ============ 戰鬥介面（給 battle.js 呼叫） ============
let actResolve = null;
const UI = {
  async battleBegin(B) {
    scene.mon = 'mon:' + B.E.name; scene.monDead = 0;
    scene.monScale = B.E.rank === '頭目' ? 3 : B.E.rank === '精英' ? 2.6 : 2.2;
    $('#bt-name').innerHTML = `${B.E.rank !== '基本' ? `<em class="rank ${B.E.rank === '頭目' ? 'boss' : 'elite'}">${B.E.rank}</em>` : ''}${B.E.name}`;
    $('#bt-behavior').textContent = B.E.data.behavior;
    $('#log').textContent = '';
    this.battleRefresh(B);
    UI.log(B.E.rank === '頭目' ? `頭目「${B.E.name}」擋住了去路！` : `${B.E.name}出現了！`);
    await sleep(500);
  },
  battleRefresh(B) {
    const {P, E} = B;
    $('#bt-hp').style.width = (100 * E.hp / E.maxHp) + '%';
    $('#bt-hptext').textContent = `${E.hp} / ${E.maxHp}`;
    const tags = [];
    const add = (u, k, t, c) => { if (stHas(u, k)) tags.push(`<b class="chip ${c}">${t}</b>`); };
    add(E, 'poison', '中毒', 'bad'); add(E, 'burn', '灼燒', 'bad'); add(E, 'freeze', '凍結', 'bad'); add(E, 'slow', '減速', 'bad');
    add(E, 'cursed', '詛咒', 'bad'); add(E, 'shield', '護盾', 'good');
    if (E.enraged) tags.push('<b class="chip good">狂暴</b>');
    $('#bt-status').innerHTML = tags.join('');
    const order = predictOrder(6);
    $('#bt-order').innerHTML = order.map(o => o === 'P' ? `<i class="me">${spr('hero:' + G.cls, 0.32)}</i>` : `<i class="foe">${spr('mon:' + E.name, 0.6)}</i>`).join('');
    // 玩家
    $('#hp-fill').style.width = (100 * P.hp / P.maxHp) + '%';
    $('#hp-text').textContent = `${Math.round(P.hp)} / ${P.maxHp}`;
    const pt = [];
    const padd = (k, t, c) => { if (stHas(P, k)) pt.push(`<b class="chip ${c}">${t}</b>`); };
    padd('poison', '中毒', 'bad'); padd('burn', '灼燒', 'bad'); padd('slow', '減速', 'bad'); padd('freeze', '凍結', 'bad');
    padd('shield', '護盾', 'good'); padd('parry', '格擋', 'good'); padd('smoke', '煙幕', 'good'); padd('mikiri', '見切', 'good'); padd('rage', '狂怒', 'good');
    if (stSum(P, 'atkMod') > 0) pt.push('<b class="chip good">攻擊↑</b>'); if (stSum(P, 'atkMod') < 0) pt.push('<b class="chip bad">攻擊↓</b>');
    if (stSum(P, 'defMod') > 0) pt.push('<b class="chip good">防禦↑</b>'); if (stSum(P, 'defMod') < 0) pt.push('<b class="chip bad">防禦↓</b>');
    if (G.phoenix) pt.push('<b class="chip good">不死鳥之羽</b>');
    $('#hud-status').innerHTML = pt.join('');
    // 技能按鈕
    const n = unlockedSkills(G.floor);
    $$('.sk-btn').forEach((b, i) => {
      const sk = SKILLS[G.cls][i];
      const locked = i >= n, cd = P.cds[i];
      b.disabled = locked || cd > 0;
      b.innerHTML = `<b>${locked ? '未解鎖' : sk.name}</b><small>${locked ? `第 ${(i + 1) * 5} 層後` : cd > 0 ? `冷卻 ${cd}` : '可使用'}</small>`;
      b.title = locked ? '' : sk.text;
    });
    $('#bt-item').disabled = !G.inv.length;
  },
  waitAction(B) {
    this.battleRefresh(B);
    $('#ctrl-battle').classList.add('ready');
    UI.log('輪到你了');
    return new Promise(res => { actResolve = a => { actResolve = null; $('#ctrl-battle').classList.remove('ready'); res(a); }; });
  },
  float(u, text, cls) {
    const el = document.createElement('div');
    el.className = 'float ' + (cls || '') + (u.isP ? ' onp' : ' one');
    el.textContent = text;
    el.style.left = (u.isP ? 50 : 42 + Math.random() * 16) + '%';
    $('#floats').appendChild(el);
    setTimeout(() => el.remove(), 1100);
  },
  log(t) { const l = $('#log'); l.textContent = t; },
  attackAnim() { scene.wpnKick = 1; },
  hitEnemy(crit) { scene.monShake = crit ? 1.6 : 1; scene.monFlash = 1; },
  hitPlayer() { scene.playerHit = 1; $('#scr-game').classList.remove('shake'); void $('#scr-game').offsetWidth; $('#scr-game').classList.add('shake'); },
  enemyAttackAnim() { scene.special = 0.5; },
  enemySpecial() { scene.special = 1; },
  skillBanner(name) { const b = $('#skill-banner'); b.textContent = name; b.hidden = false; b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); setTimeout(() => b.hidden = true, 900); },
  chooseStat,
};

function act(a) { if (actResolve) actResolve(a); }

// ============ 輸入 ============
function swipe(el, cb) {
  let sx = 0, sy = 0, t0 = 0;
  el.addEventListener('touchstart', e => { const t = e.changedTouches[0]; sx = t.clientX; sy = t.clientY; t0 = Date.now(); }, {passive: true});
  el.addEventListener('touchend', e => {
    const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 30) { cb('tap'); return; }
    if (Math.abs(dy) > Math.abs(dx)) cb(dy < 0 ? 'u' : 'd'); else cb(dx < 0 ? 'l' : 'r');
  });
}
function initInput() {
  $('#btn-l').onclick = () => go('l'); $('#btn-f').onclick = () => go('f'); $('#btn-r').onclick = () => go('r');
  swipe($('#view-wrap'), d => {
    const mode = $('#scr-game').dataset.mode;
    if (mode === 'explore') { if (d === 'u') go('f'); if (d === 'l') go('l'); if (d === 'r') go('r'); }
    else if (d === 'tap') act({type: 'attack'});
  });
  $('#view-wrap').addEventListener('click', e => { if ($('#scr-game').dataset.mode === 'battle' && !('ontouchstart' in window)) act({type: 'attack'}); });
  $('#bt-attack').onclick = () => act({type: 'attack'});
  $$('.sk-btn').forEach((b, i) => b.onclick = () => act({type: 'skill', idx: i}));
  $('#bt-item').onclick = async () => { if (!actResolve) return; const id = await openInventory(true); if (id) act({type: 'item', id}); };
  $('#btn-equip').onclick = () => openEquip();
  $('#btn-inv').onclick = () => { if ($('#scr-game').dataset.mode === 'battle') $('#bt-item').click(); else openInventory(false); };
  document.addEventListener('keydown', e => {
    if ($('#scr-game').hidden || e.target.tagName === 'INPUT') return;
    if (!$('#modal').hidden) { if (e.key === 'Enter' || e.key === ' ') { const b = $('#modal-btns .primary') || $('#modal-btns button'); if (b && document.activeElement?.tagName !== 'BUTTON') { e.preventDefault(); b.click(); } } if (e.key === 'Escape') { const b = $('#modal-btns .primary'); if (b) b.click(); } return; }
    const mode = $('#scr-game').dataset.mode, k = e.key.toLowerCase();
    if (mode === 'explore') {
      if (k === 'w' || k === 'arrowup') go('f'); else if (k === 'a' || k === 'arrowleft') go('l'); else if (k === 'd' || k === 'arrowright') go('r');
      else if (k === 'e') openEquip(); else if (k === 'i') openInventory(false); else return;
    } else {
      if (k === ' ' || k === 'enter' || k === 'w' || k === 'arrowup') act({type: 'attack'});
      else if (['1', '2', '3'].includes(k)) { const b = $$('.sk-btn')[+k - 1]; if (!b.disabled) b.click(); }
      else if (k === 'i') $('#bt-item').click(); else return;
    }
    e.preventDefault();
  });
}

// ============ 啟動 ============
function boot() {
  let started = false;
  const start = () => {
    if (started) return; started = true;
    if (ATLAS.naturalWidth) { AW = ATLAS.naturalWidth; AH = ATLAS.naturalHeight; }
    document.documentElement.style.setProperty('--atlas', `url("${ATLAS.src}")`);
    view = $('#view'); view.width = VIEW_W; view.height = VIEW_H;
    vctx = view.getContext('2d'); vctx.imageSmoothingEnabled = false; vimg = vctx.createImageData(VIEW_W, VIEW_H);
    initTitle(); initInput(); show('scr-title'); loop();
  };
  ATLAS = new Image();
  ATLAS.onload = start;
  // 內嵌圖集若失敗就改讀圖片檔；兩者都失敗仍啟動遊戲（以純色顯示），不讓畫面卡在全黑
  ATLAS.onerror = () => { if (ATLAS.src.startsWith('data:')) ATLAS.src = 'assets/atlas.png'; else start(); };
  ATLAS.src = typeof ATLAS_SRC === 'string' ? ATLAS_SRC : 'assets/atlas.png';
}
boot();

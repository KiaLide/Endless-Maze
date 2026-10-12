'use strict';
/* =========================================================
 * Endless Maze 無盡迷宮
 * 第一人稱迷宮探索 Roguelike（手機手勢操作）
 * ========================================================= */
const DATA = window.GAME_DATA;
const W = 192, H = 240, HALF = H / 2, TEX = 16;
const PROJ = (W / 2) / 0.66;                          // 投影距離：牆高比例固定，畫面加高只會多看到地板與天花板
const FP_DY = H - 144;                               // 第一人稱圖層以 192×144 設計，往下對齊
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];      // 東 南 西 北（y 向下）
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const $ = id => document.getElementById(id);
const CLASS = Object.fromEntries(DATA.classes.map(c => [c.id, c]));

/* ---------- 圖片預載 ---------- */
const IMG = {};
function loadImg(key, src) {
  return new Promise(res => { const im = new Image(); im.onload = im.onerror = () => res(); im.src = src; IMG[key] = im; });
}
const loading = Promise.all([
  ...DATA.classes.map(c => loadImg('fp_' + c.id, `assets/fp/${c.id}.png`)),
  ...DATA.classes.map(c => loadImg('hero_' + c.id, `assets/heroes/${c.id}.png`)),
]);

/* ---------- 顏色 ---------- */
function rgb(r, g, b) { return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0; }
function hex(h) { const n = parseInt(h.slice(1), 16); return rgb(n >> 16 & 255, n >> 8 & 255, n & 255); }
function shade(c, f) { return ((255 << 24) | (((c >> 16 & 255) * f) << 16) | (((c >> 8 & 255) * f) << 8) | ((c & 255) * f)) >>> 0; }
function vary(c, a) { return rgb(clamp((c & 255) + a, 0, 255), clamp((c >> 8 & 255) + a, 0, 255), clamp((c >> 16 & 255) + a, 0, 255)); }

/* ---------- 主題材質 ---------- */
const THEMES = [
  { name: '幽暗石窟', wall: ['#4a5068', '#565d7a', '#3e435a'], mortar: '#1e2030', floor: ['#3a3940', '#2e2d33'], ceil: ['#1a1922', '#211f2a'] },
  { name: '苔蘚地道', wall: ['#3f5a3a', '#4b6a44', '#344c30'], mortar: '#18241a', floor: ['#38402f', '#2c3326'], ceil: ['#141a12', '#1a2117'] },
  { name: '赤焰城塞', wall: ['#7a3328', '#8a3e30', '#652a21'], mortar: '#2a1210', floor: ['#4a3028', '#3a251f'], ceil: ['#1f0f0c', '#2a1410'] },
  { name: '紫晶深淵', wall: ['#4a2f6b', '#58397e', '#3c2658'], mortar: '#170e26', floor: ['#2f2840', '#251f33'], ceil: ['#120c1c', '#181024'] },
  { name: '白骨墓穴', wall: ['#8a8470', '#9a937c', '#76705e'], mortar: '#2e2a22', floor: ['#4a463c', '#3c382f'], ceil: ['#1c1a16', '#24211b'] },
];
let wallTex, floorTex, ceilTex;
function makeTextures(theme) {
  const wall = theme.wall.map(hex), mortar = hex(theme.mortar);
  wallTex = new Uint32Array(TEX * TEX);
  for (let y = 0; y < TEX; y++) {
    const row = y >> 2, off = (row & 1) * 4;
    for (let x = 0; x < TEX; x++) {
      let c;
      if (y % 4 === 3 || (x + off) % 8 === 7) c = mortar;
      else { c = vary(wall[(row * 7 + Math.floor((x + off) / 8) * 13) % 3], rnd(-10, 10)); if (y % 4 === 0) c = vary(c, 14); }
      wallTex[y * TEX + x] = c;
    }
  }
  const fl = theme.floor.map(hex);
  floorTex = new Uint32Array(TEX * TEX);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    let c = vary(fl[((x >> 3) + (y >> 3)) & 1], rnd(-8, 8));
    if (x % 8 === 0 || y % 8 === 0) c = vary(c, -18);
    floorTex[y * TEX + x] = c;
  }
  const ce = theme.ceil.map(hex);
  ceilTex = new Uint32Array(TEX * TEX);
  for (let i = 0; i < TEX * TEX; i++) ceilTex[i] = vary(ce[Math.random() < 0.3 ? 1 : 0], rnd(-5, 5));
}

/* ---------- 怪物與物品像素圖 (16×16) ---------- */
const PAL = { K: '#1a1020', W: '#ecebe4', G: '#4caf50', g: '#9be36b', R: '#d03838', P: '#8a4fbf', B: '#8b5a2b', b: '#b5793e',
  Y: '#f0c040', O: '#b07818', S: '#8e8e9e', D: '#5a5a68', C: '#3a7bd5', c: '#9ad8ff', E: '#2a1a40' };
const SPR_SRC = {
  slime: ['', '', '', '', '', '......KKKK......', '....KKGGGGKK....', '...KGGgGGGGGK...', '..KGGggGGGGGGK..', '..KGGGWKGGWKGK..',
    '.KGGGGWKGGWKGGK.', '.KGGGGGGGGGGGGK.', '.KGGGGKKKKGGGGK.', '.KGGGGGGGGGGGGK.', '..KKKKKKKKKKKK..', ''],
  bat: ['', '', '', '.K............K.', '.KK..K....K..KK.', '.KPK.KK..KK.KPK.', '.KPPKKPKKPKKPPK.', '.KPPPPPPPPPPPPK.', '..KPPPRPPRPPPK..',
    '..KPPPPPPPPPPK..', '...KPKPPPPKPK...', '...K..KWWK..K...', '.......KK.......', '', '', ''],
  goblin: ['', '', '.....KKKKKK.....', '..KK.KGGGGK.KK..', '..KGKGRGGRGKGK..', '...KGGGGGGGGK...', '....KGKKKKGK....', '.....KGGGGK.....',
    '....KBBBBBBK....', '...KGKBBBBKGK...', '...KGKBBBBKGK.S.', '....KKBBBBKK..S.', '.....KBKKBK..S..', '.....KBK.KBK....', '....KKK..KKK....', ''],
  skeleton: ['', '.....KKKKKK.....', '....KWWWWWWK....', '....KWKWWKWK....', '....KWWWWWWK....', '.....KWKKWK.....', '......KWWK......',
    '....KKWWWWKK....', '...KW.KWWK.WK...', '...KW.WKKW.WK...', '......KWWK......', '.....KW..WK.....', '.....KW..WK.....', '.....KW..WK.....', '....KWW..WWK....', ''],
  eye: ['', '.....KKKKKK.....', '...KKPPPPPPKK...', '..KPPWWWWWWPPK..', '.KPPWWWWWWWWPPK.', '.KPWWWRRRRWWWPK.', 'KPPWWRRKKRRWWPPK',
    'KPPWWRRKKRRWWPPK', '.KPWWWRRRRWWWPK.', '.KPPWWWWWWWWPPK.', '..KPPWWWWWWPPK..', '...KKPPPPPPKK...', '.....KKKKKK.....', '......K..K......', '.....K....K.....', ''],
  golem: ['', '....KKKKKKKK....', '....KSSSSSSK....', '....KSYSSYSK....', '....KSSSSSSK....', '..KKKKSSSSKKKK..', '.KSSSSSSSSSSSSK.',
    '.KSSKSSSSSSKSSK.', '.KSSKSSDDSSKSSK.', '.KSSKSSSSSSKSSK.', '.KKKKSSSSSSKKKK.', '....KSSKKSSK....', '....KSSK.KSSK...', '...KSSSK.KSSSK..', '...KKKKK.KKKKK..', ''],
  demon: ['.K............K.', '.KK..........KK.', '..KRK.KKKK.KRK..', '..KRRKRRRRKRRK..', '...KRRRRRRRRK...', '...KRYKRRKYRK...', '...KRRRRRRRRK...',
    '....KRKWWKRK....', '..KKKRRRRRRKKK..', '.KRRKRRRRRRKRRK.', '.KRKKRREERRKKRK.', '.KRK.KRRRRK.KRK.', '..K..KRKKRK..K..', '.....KRK.KRK....', '....KKKK.KKKK...', ''],
  potion: ['', '', '', '', '', '', '......KKKK......', '.......KK.......', '......KWWK......', '.....KRRRRK.....', '....KRRWRRRK....',
    '....KRRRRRRK....', '....KRRRRRRK....', '.....KKKKKK.....', '', ''],
  gold: ['', '', '', '', '', '', '', '', '', '.....KKKKKK.....', '...KKYYYYYYKK...', '..KYYYOYYOYYYK..', '..KYYYYYYYYYYK..', '...KKYYYYYYKK...', '.....KKKKKK.....', ''],
  chest: ['', '', '', '', '', '', '', '...KKKKKKKKKK...', '..KBBBBBBBBBBK..', '..KbbbbbbbbbbK..', '..KKKKKYYKKKKK..',
    '..KBBBBYYBBBBK..', '..KBBBBBBBBBBK..', '..KBBBBBBBBBBK..', '..KKKKKKKKKKKK..', ''],
  stairs: ['', '', '', '', '', '', '', '', '', '', '...KKKKKKKKKK...', '..KCCCCCCCCCCK..', '.KCCccccccccCCK.', '.KCcccEEEEcccCK.', '..KCCCCCCCCCCK..', '...KKKKKKKKKK...'],
};
const SPR = {};
for (const k in SPR_SRC) {
  const a = new Uint32Array(256);
  SPR_SRC[k].forEach((row, y) => { for (let x = 0; x < 16; x++) { const ch = row[x] || '.'; a[y * 16 + x] = ch === '.' ? 0 : hex(PAL[ch]); } });
  SPR[k] = a;
}

const MONSTERS = {
  slime:    { name: '史萊姆', hp: 8, atk: 3, def: 0, xp: 3, minF: 1 },
  bat:      { name: '洞窟蝙蝠', hp: 6, atk: 3, def: 0, xp: 3, minF: 1, fast: true, fly: true },
  goblin:   { name: '哥布林', hp: 12, atk: 4, def: 1, xp: 5, minF: 2 },
  skeleton: { name: '骷髏兵', hp: 16, atk: 5, def: 2, xp: 7, minF: 3 },
  eye:      { name: '凝視魔眼', hp: 18, atk: 6, def: 2, xp: 9, minF: 5, fly: true },
  golem:    { name: '石像魔', hp: 30, atk: 7, def: 4, xp: 13, minF: 7 },
  demon:    { name: '深淵魔王', hp: 70, atk: 9, def: 4, xp: 40, minF: 99, boss: true },
};

/* ---------- 武器（數值為暫定） ---------- */
const weaponAtk = tier => Math.round(1 + tier * 2.4);
const weaponName = (cls, tier) => CLASS[cls].weapons[tier - 1];
function iconStyle(cls, tier, size = 64) {
  return `background-image:url(assets/icons/${cls}.png);background-size:${size * 20}px ${size}px;background-position:${-(tier - 1) * size}px 0;width:${size}px;height:${size}px`;
}
function setIcon(el, cls, tier, size = 64) { el.setAttribute('style', iconStyle(cls, tier, size)); }

/* ---------- 天賦 ---------- */
const PERKS = [
  { id: 'hp', t: '強健體魄', d: '最大生命 +10，並回復 10', w: 3, f: p => { p.maxHp += 10; p.hp += 10; } },
  { id: 'atk', t: '磨利武器', d: '攻擊力 +3', w: 3, f: p => { p.atk += 3; } },
  { id: 'def', t: '鐵壁', d: '防禦力 +2', w: 3, f: p => { p.def += 2; } },
  { id: 'crit', t: '鷹眼', d: '爆擊率 +8%', w: 3, f: p => { p.crit += 8; } },
  { id: 'critd', t: '致命一擊', d: '爆擊傷害 +50%', w: 2, r: 'rare', f: p => { p.critDmg += 0.5; } },
  { id: 'steal', t: '吸血', d: '造成傷害的 12% 轉為生命', w: 2, r: 'rare', max: 3, f: p => { p.steal += 0.12; } },
  { id: 'thorns', t: '荊棘護甲', d: '被攻擊時反彈 4 點傷害', w: 2, r: 'rare', f: p => { p.thorns += 4; } },
  { id: 'dodge', t: '殘影步', d: '閃避率 +8%', w: 2, r: 'rare', max: 4, f: p => { p.dodge += 8; } },
  { id: 'regen', t: '再生', d: '每走 4 步回復 1 生命（可疊加）', w: 2, r: 'rare', f: p => { p.regen += 1; } },
  { id: 'potion', t: '藥劑師', d: '藥水效果 +50%，並獲得 1 瓶藥水', w: 2, f: p => { p.potionPow = Math.round(p.potionPow * 1.5); p.potions++; } },
  { id: 'map', t: '製圖師', d: '每層樓開局即顯示完整地圖', w: 1, r: 'epic', max: 1, f: p => { p.mapper = true; revealAll(); } },
  { id: 'double', t: '連擊', d: '15% 機率連續攻擊兩次', w: 1, r: 'epic', max: 2, f: p => { p.double += 15; } },
  { id: 'greed', t: '貪婪', d: '金幣 +50%，寶箱更容易開出武器', w: 1, r: 'epic', max: 1, f: p => { p.greed = true; } },
];

/* =========================================================
 * 狀態
 * ========================================================= */
let state = 'title';           // title | name | select | play | modal | dead
let G = null;                  // 目前這局
const cam = { x: 1.5, y: 1.5, a: 0 };
let anim = null, queued = null, shake = 0, swing = 0, punchSide = 1, popups = [], now = 0, lastT = 0;
let world = null;              // 目前渲染的世界（遊戲或標題展示）
let profile = { name: '', cls: 'swordsman', sex: 'M' };

function loadBest() { try { return JSON.parse(localStorage.getItem('em_best') || 'null'); } catch (e) { return null; } }
function saveBest() {
  const b = loadBest();
  if (!b || G.floor > b.floor || (G.floor === b.floor && G.p.kills > b.kills)) {
    try { localStorage.setItem('em_best', JSON.stringify({ floor: G.floor, kills: G.p.kills, name: G.name, cls: G.cls })); } catch (e) { }
    return true;
  }
  return false;
}

/* =========================================================
 * 地圖
 * ========================================================= */
function genMap(floor) {
  const size = Math.min(13 + floor * 2, 33) | 1;
  const map = new Uint8Array(size * size).fill(1);
  const at = (x, y) => map[y * size + x], set = (x, y, v) => { map[y * size + x] = v; };
  const stack = [[1, 1]]; set(1, 1, 0);
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const opts = DIRS.filter(([dx, dy]) => { const nx = cx + dx * 2, ny = cy + dy * 2; return nx > 0 && ny > 0 && nx < size - 1 && ny < size - 1 && at(nx, ny) === 1; });
    if (!opts.length) { stack.pop(); continue; }
    const [dx, dy] = pick(opts);
    set(cx + dx, cy + dy, 0); set(cx + dx * 2, cy + dy * 2, 0); stack.push([cx + dx * 2, cy + dy * 2]);
  }
  for (let i = 0, n = 2 + Math.min(floor, 4); i < n; i++) {
    const rw = pick([3, 3, 5]), rh = pick([3, 3, 5]);
    const rx = 1 + 2 * rnd(0, (size - 2 - rw) >> 1), ry = 1 + 2 * rnd(0, (size - 2 - rh) >> 1);
    for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) set(x, y, 0);
  }
  for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
    if (at(x, y) !== 1 || Math.random() > 0.07) continue;
    if ((at(x - 1, y) === 0 && at(x + 1, y) === 0 && at(x, y - 1) === 1 && at(x, y + 1) === 1) ||
        (at(x, y - 1) === 0 && at(x, y + 1) === 0 && at(x - 1, y) === 1 && at(x + 1, y) === 1)) set(x, y, 0);
  }
  return { map, MW: size, MH: size, seen: new Uint8Array(size * size), monsters: [], items: [], stairs: { x: 0, y: 0 } };
}
function bfs(w, sx, sy) {
  const dist = new Int16Array(w.MW * w.MH).fill(-1), q = [sx + sy * w.MW]; dist[q[0]] = 0;
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % w.MW, y = (i / w.MW) | 0;
    for (const [dx, dy] of DIRS) { const ni = (x + dx) + (y + dy) * w.MW; if (w.map[ni] === 0 && dist[ni] === -1) { dist[ni] = dist[i] + 1; q.push(ni); } }
  }
  return dist;
}
const isWall = (w, x, y) => x < 0 || y < 0 || x >= w.MW || y >= w.MH || w.map[y * w.MW + x] === 1;
const monsterAt = (x, y) => world.monsters.find(m => m.x === x && m.y === y);
const itemAt = (x, y) => world.items.find(it => it.x === x && it.y === y);
function revealAll() { if (G && world) world.seen.fill(1); }

/* =========================================================
 * 新遊戲 / 樓層
 * ========================================================= */
function newGame() {
  const c = CLASS[profile.cls];
  G = {
    name: profile.name, cls: c.id, floor: 0,
    p: { x: 0, y: 0, face: 0, hp: c.hp, maxHp: c.hp, atk: c.atk, def: c.def_, crit: c.crit, critDmg: 2, potions: 2,
      potionPow: 14 * (c.id === 'cleric' ? 2 : 1), lvl: 1, xp: 0, next: 10, gold: 0, kills: 0,
      steal: c.id === 'witch' ? 0.1 : 0, thorns: 0, dodge: c.id === 'ranger' ? 10 : c.id === 'rogue' ? 6 : 0,
      regen: 0, steps: 0, mapper: false, double: c.id === 'monk' ? 20 : c.id === 'fencer' ? 10 : 0, greed: false,
      perks: {}, pendingLv: 0, weapon: 1 },
  };
  $('log').innerHTML = '';
  nextFloor();
  showScreen('game');
  state = 'play';
  log(`<span class="c-gold">${G.name}</span>（${c.name}）踏入了無盡迷宮……`);
  log('找到藍色的 <span class="c-blue">傳送門</span> 前往下一層。');
  const hint = $('swipe-hint'); hint.classList.remove('hide');
  setTimeout(() => hint.classList.add('hide'), 4200);
}

function nextFloor() {
  G.floor++;
  const f = G.floor, theme = THEMES[Math.floor((f - 1) / 3) % THEMES.length];
  G.theme = theme; makeTextures(theme);
  const w = genMap(f); world = w;
  const cells = [];
  for (let y = 0; y < w.MH; y++) for (let x = 0; x < w.MW; x++) if (w.map[y * w.MW + x] === 0) cells.push([x, y]);
  const [sx, sy] = pick(cells), p = G.p;
  p.x = sx; p.y = sy;
  const dist = bfs(w, sx, sy);
  let far = 0, st = [sx, sy];
  for (const [x, y] of cells) { const d = dist[y * w.MW + x]; if (d > far) { far = d; st = [x, y]; } }
  w.stairs = { x: st[0], y: st[1] };
  p.face = Math.max(0, DIRS.findIndex(([dx, dy]) => w.map[(sy + dy) * w.MW + sx + dx] === 0));
  cam.x = sx + 0.5; cam.y = sy + 0.5; cam.a = p.face * Math.PI / 2;
  const used = new Set([sx + ',' + sy, st.join(',')]);
  const free = cells.filter(([x, y]) => dist[y * w.MW + x] >= 4 && !used.has(x + ',' + y));
  const take = () => { while (free.length) { const c = free.splice(rnd(0, free.length - 1), 1)[0]; if (!used.has(c.join(','))) { used.add(c.join(',')); return c; } } return null; };
  if (f % 5 === 0) {
    const g = DIRS.map(([dx, dy]) => [st[0] + dx, st[1] + dy]).find(([x, y]) => w.map[y * w.MW + x] === 0 && dist[y * w.MW + x] === far - 1);
    if (g) { used.add(g.join(',')); spawn('demon', g[0], g[1]); }
  }
  const pool = Object.keys(MONSTERS).filter(k => MONSTERS[k].minF <= f);
  for (let i = 0, n = Math.min(4 + Math.floor(f * 1.4), 22); i < n; i++) { const c = take(); if (c) spawn(pick(pool), c[0], c[1]); }
  for (let i = 0, n = rnd(1, 2) + (f % 3 === 0 ? 1 : 0); i < n; i++) { const c = take(); if (c) w.items.push({ kind: 'potion', x: c[0], y: c[1] }); }
  for (let i = 0, n = rnd(3, 5); i < n; i++) { const c = take(); if (c) w.items.push({ kind: 'gold', x: c[0], y: c[1], v: rnd(3, 8) + f * 2 }); }
  for (let i = 0, n = rnd(1, 3); i < n; i++) { const c = take(); if (c) w.items.push({ kind: 'chest', x: c[0], y: c[1] }); }
  if (p.mapper) revealAll();
  popups = [];
  updateHud();
  log(`<span class="c-purple">— 地下 ${f} 層・${theme.name} —</span>` + (f % 5 === 0 ? ' <span class="c-red">魔王守護著傳送門！</span>' : ''));
}

function spawn(type, x, y) {
  const b = MONSTERS[type], f = G.floor;
  const m = { type, name: b.name, x, y, fx: x, fy: y, t0: 0, fast: !!b.fast, fly: !!b.fly, boss: !!b.boss, flash: 0, awake: false,
    maxHp: Math.round(b.hp * (1 + (f - 1) * 0.3)), atk: b.atk + Math.floor((f - 1) * 1.5), def: b.def + Math.floor((f - 1) * 0.7),
    xp: Math.round(b.xp * (1 + (f - 1) * 0.15)) };
  m.hp = m.maxHp; world.monsters.push(m);
}

/* =========================================================
 * 音效
 * ========================================================= */
let ac = null;
function beep(freq, dur, type = 'square', vol = 0.04, slide = 0) {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur);
  } catch (e) { }
}
const SFX = {
  step: () => beep(90, 0.05, 'triangle', 0.03), bump: () => beep(60, 0.08, 'square', 0.03),
  swing: () => beep(500, 0.08, 'sawtooth', 0.025, -350), hit: () => beep(180, 0.1, 'square', 0.05, -100),
  crit: () => { beep(880, 0.06); setTimeout(() => beep(1320, 0.1, 'square', 0.04), 50); },
  hurt: () => beep(120, 0.2, 'sawtooth', 0.06, -60), pick: () => { beep(660, 0.06); setTimeout(() => beep(990, 0.08), 60); },
  heal: () => beep(440, 0.1, 'sine', 0.06, 300), ui: () => beep(700, 0.05),
  level: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.12, 'square', 0.04), i * 90)),
  portal: () => beep(200, 0.6, 'sine', 0.06, 600),
  die: () => [300, 220, 160, 100].forEach((f, i) => setTimeout(() => beep(f, 0.25, 'sawtooth', 0.05), i * 180)),
};

/* =========================================================
 * 訊息 / 特效
 * ========================================================= */
function log(html) {
  const el = $('log'), d = document.createElement('div'); d.innerHTML = html; el.appendChild(d);
  while (el.children.length > 4) el.removeChild(el.firstChild);
}
function flash(color) {
  const f = $('flash'); f.style.transition = 'none'; f.style.background = color; f.style.opacity = '0.45';
  requestAnimationFrame(() => { f.style.transition = 'opacity .3s'; f.style.opacity = '0'; });
}

/* =========================================================
 * 玩家行動（不能後退：只有前進、左轉、右轉）
 * ========================================================= */
function act(cmd) {
  if (state !== 'play') return;
  if (anim) { queued = cmd; return; }
  const p = G.p;
  if (cmd === 'fw') stepForward();
  else if (cmd === 'left' || cmd === 'right') {
    // 轉向該路線；若那邊是通道就順勢走進去
    const d = cmd === 'left' ? -1 : 1;
    const nf = (p.face + d + 4) % 4, [dx, dy] = DIRS[nf];
    const open = !isWall(world, p.x + dx, p.y + dy) && !monsterAt(p.x + dx, p.y + dy);
    turn(d, open ? () => stepForward(true) : null);
  }
  else if (cmd === 'atk') attackFront();
  else if (cmd === 'pot') drink();
  else if (cmd === 'back') log('<span class="c-red">迷宮中無法後退！</span>往左或右轉身吧。');
}

function turn(d, then) {
  const from = cam.a; G.p.face = (G.p.face + d + 4) % 4;
  anim = { kind: 'turn', t0: now, dur: 150, fa: from, ta: from + d * Math.PI / 2, then };
}

function stepForward(auto) {
  const p = G.p, [dx, dy] = DIRS[p.face], nx = p.x + dx, ny = p.y + dy;
  const m = monsterAt(nx, ny);
  if (m) { if (!auto) attack(m); return; }
  if (isWall(world, nx, ny)) { if (!auto) { SFX.bump(); shake = 3; } return; }
  anim = { kind: 'move', t0: now, dur: 160, fx: p.x + 0.5, fy: p.y + 0.5, tx: nx + 0.5, ty: ny + 0.5 };
  p.x = nx; p.y = ny; p.steps++; SFX.step();
  if (p.regen && p.steps % 4 === 0 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + p.regen);
  pickup();
  endTurn();
  if (state === 'play' && p.x === world.stairs.x && p.y === world.stairs.y) onStairs();
}

function pickup() {
  const p = G.p, it = itemAt(p.x, p.y);
  if (!it) return;
  world.items.splice(world.items.indexOf(it), 1); SFX.pick();
  if (it.kind === 'potion') { p.potions++; log('撿到了 <span class="c-green">回復藥水</span>。'); }
  else if (it.kind === 'gold') { const v = Math.round(it.v * (p.greed ? 1.5 : 1)); p.gold += v; log(`撿到 <span class="c-gold">${v} 金幣</span>。`); }
  else if (it.kind === 'chest') openChest();
  else if (it.kind === 'weapon') offerWeapon(it.tier);
  updateHud();
}

function rollWeaponTier() { return clamp(G.floor + rnd(-1, 1) + (Math.random() < 0.12 ? 2 : 0), 1, 20); }

function openChest() {
  const p = G.p, f = G.floor;
  if (Math.random() < (p.greed ? 0.75 : 0.55)) { offerWeapon(rollWeaponTier()); return; }
  const loot = pick([
    () => { const v = 1 + Math.floor(f / 6); p.def += v; return `<span class="c-gold">${pick(['鎖子甲', '騎士盾', '龍鱗護手'])}</span>！防禦 +${v}`; },
    () => { p.crit += 5; return '<span class="c-gold">鷹之護符</span>！爆擊率 +5%'; },
    () => { p.maxHp += 6; p.hp += 6; return '<span class="c-gold">生命寶石</span>！最大生命 +6'; },
    () => { p.potions += 2; return '<span class="c-green">藥水 ×2</span>'; },
  ])();
  log('打開寶箱：' + loot);
}

function offerWeapon(tier) {
  const p = G.p, cur = p.weapon, cls = G.cls, r = DATA.rarity[tier - 1];
  if (tier === cur) { const g = 10 + tier * 5; p.gold += g; log(`獲得重複的武器，換成 <span class="c-gold">${g} 金幣</span>。`); updateHud(); return; }
  state = 'modal';
  showModal(`<h2>獲得武器！</h2>
    <div class="wcompare">
      <div class="wbox"><span class="wicon" style="${iconStyle(cls, cur)}"></span>${weaponName(cls, cur)}<br><small>攻擊 +${weaponAtk(cur)}</small></div>
      <div class="arrow">▶</div>
      <div class="wbox" style="border-color:${r.color}"><span class="wicon" style="${iconStyle(cls, tier)}"></span><span style="color:${r.color}">${weaponName(cls, tier)}</span><br><small>${r.name}・攻擊 +${weaponAtk(tier)}</small></div>
    </div>
    <button class="btn primary" data-ui="equip" data-t="${tier}">裝備</button>
    <button class="btn" data-ui="sell" data-t="${tier}">賣掉（${10 + tier * 5} 金幣）</button>`);
}

function drink() {
  const p = G.p;
  if (p.potions <= 0) { log('沒有藥水了！'); return; }
  if (p.hp >= p.maxHp) { log('生命已滿。'); return; }
  p.potions--;
  const v = Math.min(p.potionPow + Math.floor(p.maxHp * 0.15), p.maxHp - p.hp);
  p.hp += v; SFX.heal(); flash('#40ff80');
  log(`喝下藥水，回復 <span class="c-green">${v}</span> 生命。`);
  endTurn();
}

function attackFront() {
  const p = G.p, [dx, dy] = DIRS[p.face], m = monsterAt(p.x + dx, p.y + dy);
  if (m) attack(m); else { swing = 1; punchSide = -punchSide; SFX.swing(); endTurn(); }
}

function playerAtk() { return G.p.atk + weaponAtk(G.p.weapon); }

function attack(m) {
  const p = G.p;
  swing = 1; punchSide = -punchSide;
  const hits = Math.random() * 100 < p.double ? 2 : 1;
  for (let i = 0; i < hits && m.hp > 0; i++) {
    const crit = Math.random() * 100 < p.crit;
    let dmg = Math.max(1, playerAtk() + rnd(-2, 2) - m.def);
    if (crit) dmg = Math.round(dmg * p.critDmg);
    m.hp -= dmg; m.flash = 1; m.awake = true;
    popups.push({ m, text: (crit ? '爆擊 ' : '') + dmg, color: crit ? '#ffd76a' : '#ffffff', t: 0, off: i * 8 });
    crit ? SFX.crit() : SFX.hit();
    if (p.steal) p.hp = Math.min(p.maxHp, p.hp + Math.max(1, Math.round(dmg * p.steal)));
    if (i === 1) log('<span class="c-purple">連擊！</span>');
  }
  if (m.hp <= 0) kill(m);
  endTurn();
}

function kill(m) {
  const p = G.p;
  world.monsters.splice(world.monsters.indexOf(m), 1);
  p.kills++;
  log(`擊敗了 <span class="c-red">${m.name}</span>，獲得 ${m.xp} 經驗。`);
  if (m.boss) {
    log('<span class="c-gold">魔王倒下了！傳送門的封印解除。</span>');
    world.items.push({ kind: 'weapon', x: m.x, y: m.y, tier: clamp(G.floor + 2, 1, 20) });
  } else if (Math.random() < 0.06) world.items.push({ kind: 'weapon', x: m.x, y: m.y, tier: rollWeaponTier() });
  else if (Math.random() < (p.greed ? 0.2 : 0.1)) world.items.push({ kind: Math.random() < 0.5 ? 'potion' : 'gold', x: m.x, y: m.y, v: rnd(4, 10) + G.floor * 2 });
  p.xp += m.xp;
  while (p.xp >= p.next) {
    p.xp -= p.next; p.lvl++; p.next = Math.round(p.next * 1.45 + 4);
    p.maxHp += 5; p.hp = Math.min(p.maxHp, p.hp + Math.ceil(p.maxHp * 0.3)); p.atk += 1; p.pendingLv++;
  }
}

function endTurn() {
  const p = G.p, dist = bfs(world, p.x, p.y);
  for (const m of world.monsters.slice()) {
    if (m.hp <= 0) continue;
    for (let a = 0; a < (m.fast ? 2 : 1) && state === 'play'; a++) monsterTurn(m, dist);
  }
  if (p.hp <= 0) return gameOver();
  updateHud();
  if (p.pendingLv > 0) setTimeout(showPerks, 260);
}

function monsterTurn(m, dist) {
  const p = G.p, md = Math.abs(m.x - p.x) + Math.abs(m.y - p.y);
  if (md === 1) { monsterAttack(m); return; }
  const d = dist[m.y * world.MW + m.x];
  if (!m.awake && d >= 0 && d <= 6) m.awake = true;
  if (m.boss && !m.awake) return;
  const opts = [];
  if (m.awake && d > 0 && d <= 14) {
    for (const [dx, dy] of DIRS) { const nx = m.x + dx, ny = m.y + dy; if (dist[ny * world.MW + nx] === d - 1 && !monsterAt(nx, ny) && !(nx === p.x && ny === p.y)) opts.push([nx, ny]); }
  } else if (!m.boss && Math.random() < 0.35) {
    for (const [dx, dy] of DIRS) { const nx = m.x + dx, ny = m.y + dy; if (!isWall(world, nx, ny) && !monsterAt(nx, ny) && !(nx === p.x && ny === p.y)) opts.push([nx, ny]); }
  }
  if (!opts.length) return;
  const [nx, ny] = pick(opts); m.fx = m.x; m.fy = m.y; m.t0 = now; m.x = nx; m.y = ny;
}

function monsterAttack(m) {
  const p = G.p;
  if (Math.random() * 100 < p.dodge) { log(`閃避了 ${m.name} 的攻擊！`); popups.push({ self: true, text: 'MISS', color: '#7ab8ff', t: 0 }); return; }
  const dmg = Math.max(1, m.atk + rnd(-1, 1) - p.def);
  p.hp -= dmg; shake = 6; SFX.hurt(); flash('#ff2020');
  // 被看不見的怪物攻擊時提示方向
  const rel = (DIRS.findIndex(([dx, dy]) => p.x + dx === m.x && p.y + dy === m.y) - p.face + 4) % 4;
  const where = ['', '右邊', '背後', '左邊'][rel];
  log(`${where ? `<span class="c-red">${where}</span>的` : ''}${m.name} 攻擊你，造成 <span class="c-red">${dmg}</span> 傷害。`);
  if (p.thorns && p.hp > 0) { m.hp -= p.thorns; m.flash = 1; if (m.hp <= 0) kill(m); }
}

function onStairs() {
  if (world.monsters.some(m => m.boss)) { log('<span class="c-red">魔王的力量封印著傳送門！</span>'); return; }
  state = 'modal';
  showModal(`<h2>傳送門</h2><p>要前往 <b>地下 ${G.floor + 1} 層</b> 嗎？<br>穿過傳送門會回復 20% 生命。</p>
    <button class="btn primary" data-ui="descend">前往下一層</button><button class="btn" data-ui="close">繼續探索</button>`);
}

/* ---------- 天賦 ---------- */
let perkChoices = [];
function showPerks() {
  if (state !== 'play' || G.p.pendingLv <= 0) return;
  state = 'modal'; SFX.level();
  const p = G.p, avail = PERKS.filter(k => !k.max || (p.perks[k.id] || 0) < k.max);
  perkChoices = [];
  while (perkChoices.length < 3 && avail.length) {
    let r = Math.random() * avail.reduce((s, k) => s + k.w, 0);
    perkChoices.push(avail.splice(avail.findIndex(k => (r -= k.w) < 0), 1)[0]);
  }
  showModal(`<h2>等級提升！Lv ${p.lvl - p.pendingLv + 1}</h2><p>選擇一項天賦：</p>` +
    perkChoices.map((k, i) => `<button class="btn card ${k.r || ''}" data-ui="perk" data-i="${i}"><span class="t">${k.t}</span><span class="d">${k.d}</span></button>`).join(''));
}

function gameOver() {
  state = 'dead'; G.p.hp = 0; updateHud(); SFX.die();
  const rec = saveBest(), p = G.p, c = CLASS[G.cls];
  showModal(`<h1>YOU DIED</h1><p>${G.name}（${c.name}）倒在了地下 ${G.floor} 層</p>
    ${rec ? '<p class="c-gold">★ 新紀錄！</p>' : ''}
    <div class="statgrid"><div>到達樓層<b>B${G.floor}</b></div><div>等級<b>${p.lvl}</b></div>
      <div>擊殺數<b>${p.kills}</b></div><div>金幣<b>${p.gold}</b></div>
      <div style="grid-column:span 2">武器<b>${weaponName(G.cls, p.weapon)}</b></div></div>
    <button class="btn primary" data-ui="retry">再次挑戰</button><button class="btn" data-ui="title">回到標題</button>`);
}

/* ---------- 對話框 ---------- */
function showModal(html) { $('modal-panel').innerHTML = html; $('modal').classList.add('show'); }
function closeModal() { $('modal').classList.remove('show'); }
function resume() { closeModal(); state = 'play'; updateHud(); if (G.p.pendingLv > 0) setTimeout(showPerks, 200); }
$('modal-panel').addEventListener('click', e => {
  const b = e.target.closest('[data-ui]'); if (!b) return;
  SFX.ui();
  const ui = b.dataset.ui, p = G && G.p;
  if (ui === 'equip') { p.weapon = +b.dataset.t; log(`裝備了 <span class="c-gold">${weaponName(G.cls, p.weapon)}</span>！`); resume(); }
  else if (ui === 'sell') { const g = 10 + (+b.dataset.t) * 5; p.gold += g; log(`賣掉武器，獲得 <span class="c-gold">${g} 金幣</span>。`); resume(); }
  else if (ui === 'perk') { const k = perkChoices[+b.dataset.i]; k.f(p); p.perks[k.id] = (p.perks[k.id] || 0) + 1; p.pendingLv--; log(`獲得天賦 <span class="c-gold">${k.t}</span>。`); resume(); }
  else if (ui === 'descend') { SFX.portal(); p.hp = Math.min(p.maxHp, p.hp + Math.ceil(p.maxHp * 0.2)); nextFloor(); resume(); }
  else if (ui === 'close') resume();
  else if (ui === 'retry') { closeModal(); newGame(); }
  else if (ui === 'title') { closeModal(); goTitle(); }
  else if (ui === 'winfo') resume();
});

/* ---------- HUD ---------- */
function updateHud() {
  if (!G) return;
  const p = G.p, c = CLASS[G.cls], r = DATA.rarity[p.weapon - 1];
  $('hud-floor').textContent = 'B' + G.floor; $('hud-lvl').textContent = 'Lv' + p.lvl;
  $('hud-name').textContent = `${G.name}・${c.name}`;
  $('hp-fill').style.width = (100 * Math.max(0, p.hp) / p.maxHp) + '%';
  $('hp-text').textContent = `${Math.max(0, p.hp)} / ${p.maxHp}`;
  $('xp-fill').style.width = (100 * p.xp / p.next) + '%';
  $('st-atk').textContent = playerAtk(); $('st-def').textContent = p.def; $('st-crit').textContent = Math.min(100, p.crit) + '%';
  $('st-gold').textContent = p.gold; $('st-kills').textContent = p.kills; $('pot-n').textContent = '×' + p.potions;
  setIcon($('hud-wicon'), G.cls, p.weapon, 48);
  $('hud-wname').innerHTML = `<span style="color:${r.color}">${weaponName(G.cls, p.weapon)}</span><small style="color:${r.color}">${r.name}・${p.weapon} 階・攻擊 +${weaponAtk(p.weapon)}</small>`;
}

/* =========================================================
 * 渲染
 * ========================================================= */
const view = $('view'), vctx = view.getContext('2d');
const titleCv = $('title-bg'), tctx = titleCv.getContext('2d');
const img = vctx.createImageData(W, H), buf = new Uint32Array(img.data.buffer), zbuf = new Float32Array(W);
const mm = $('minimap'), mctx = mm.getContext('2d');

function lightF(d, L) { let v = 1 - d / L; if (v < 0.05) v = 0.05; return Math.ceil(v * 7) / 7; }

function renderWorld(ctx, w, playerCell) {
  buf.fill(0xff050308);
  if (playerCell) w.seen[playerCell[1] * w.MW + playerCell[0]] = 1;
  const sh = shake > 0 ? (Math.random() - 0.5) * shake * 0.01 : 0;
  const px = cam.x, py = cam.y, a = cam.a + sh, dx = Math.cos(a), dy = Math.sin(a), plx = -dy * 0.66, ply = dx * 0.66;
  const L = 7.2 + Math.sin(now * 0.006) * 0.25 + Math.sin(now * 0.017) * 0.15;
  const rdx0 = dx - plx, rdy0 = dy - ply, rdx1 = dx + plx, rdy1 = dy + ply;
  for (let y = HALF + 1; y < H; y++) {
    const rd = PROJ * 0.5 / (y - HALF), sx = rd * (rdx1 - rdx0) / W, sy = rd * (rdy1 - rdy0) / W;
    let fx = px + rd * rdx0, fy = py + rd * rdy0;
    const f = lightF(rd, L), fc = f * 0.8, yo = y * W, yc = (H - y - 1) * W;
    for (let x = 0; x < W; x++) {
      const ti = (((fy - Math.floor(fy)) * TEX) & 15) * TEX + (((fx - Math.floor(fx)) * TEX) & 15);
      fx += sx; fy += sy;
      buf[yo + x] = shade(floorTex[ti], f); buf[yc + x] = shade(ceilTex[ti], fc);
    }
  }
  for (let x = 0; x < W; x++) {
    const cx = 2 * x / W - 1, rdx = dx + plx * cx, rdy = dy + ply * cx;
    let mx = Math.floor(px), my = Math.floor(py);
    const ddx = Math.abs(1 / rdx), ddy = Math.abs(1 / rdy);
    let stx, sty, sdx, sdy, side = 0;
    if (rdx < 0) { stx = -1; sdx = (px - mx) * ddx; } else { stx = 1; sdx = (mx + 1 - px) * ddx; }
    if (rdy < 0) { sty = -1; sdy = (py - my) * ddy; } else { sty = 1; sdy = (my + 1 - py) * ddy; }
    for (let n = 0; n < 80; n++) {
      if (sdx < sdy) { sdx += ddx; mx += stx; side = 0; } else { sdy += ddy; my += sty; side = 1; }
      if (mx < 0 || my < 0 || mx >= w.MW || my >= w.MH) break;
      if (Math.min(sdx, sdy) < 5.5) w.seen[my * w.MW + mx] = 1;
      if (w.map[my * w.MW + mx] === 1) break;
    }
    const perp = Math.max(0.05, side === 0 ? sdx - ddx : sdy - ddy); zbuf[x] = perp;
    const lh = PROJ / perp, ds = Math.max(0, Math.floor(HALF - lh / 2)), de = Math.min(H, Math.ceil(HALF + lh / 2));
    let wx = side === 0 ? py + perp * rdy : px + perp * rdx; wx -= Math.floor(wx);
    let tx = Math.floor(wx * TEX) & 15;
    if ((side === 0 && rdx > 0) || (side === 1 && rdy < 0)) tx = 15 - tx;
    const f = lightF(perp, L) * (side ? 0.78 : 1), step = TEX / lh;
    let tp = (ds - HALF + lh / 2) * step;
    for (let y = ds; y < de; y++) { buf[y * W + x] = shade(wallTex[((tp | 0) & 15) * TEX + tx], f); tp += step; }
  }
  // 精靈
  const sprites = [{ x: w.stairs.x + 0.5, y: w.stairs.y + 0.5, s: SPR.stairs, glow: true }];
  for (const it of w.items) sprites.push({ x: it.x + 0.5, y: it.y + 0.5, s: SPR[it.kind === 'weapon' ? 'chest' : it.kind], bob: it.kind !== 'gold' });
  for (const m of w.monsters) {
    const t = clamp((now - m.t0) / 150, 0, 1);
    sprites.push({ x: m.fx + (m.x - m.fx) * t + 0.5, y: m.fy + (m.y - m.fy) * t + 0.5, s: SPR[m.type], m, scale: m.boss ? 1.25 : 1, fly: m.fly });
  }
  const invDet = 1 / (plx * dy - dx * ply);
  for (const s of sprites) s.d = (s.x - px) ** 2 + (s.y - py) ** 2;
  sprites.sort((a, b) => b.d - a.d);
  for (const s of sprites) {
    const rx = s.x - px, ry = s.y - py, tX = invDet * (dy * rx - dx * ry), tY = invDet * (-ply * rx + plx * ry);
    if (tY <= 0.15) { if (s.m) s.m.vis = false; continue; }
    const sx = (W / 2) * (1 + tX / tY), unit = PROJ / tY, size = unit * (s.scale || 1);
    let bottom = HALF + unit / 2;
    if (s.fly) bottom -= unit * (0.18 + Math.sin(now * 0.008 + s.x * 3) * 0.05);
    if (s.bob) bottom -= unit * Math.abs(Math.sin(now * 0.004)) * 0.05;
    const top = bottom - size, left = sx - size / 2, f = s.glow ? 1 : lightF(Math.sqrt(s.d), L + 0.5);
    const x0 = Math.max(0, Math.floor(left)), x1 = Math.min(W, Math.ceil(left + size)), y0 = Math.max(0, Math.floor(top)), y1 = Math.min(H, Math.ceil(bottom));
    const white = s.m && s.m.flash > 0.5;
    for (let x = x0; x < x1; x++) {
      if (tY >= zbuf[x]) continue;
      const tx = Math.floor((x - left) * 16 / size); if (tx < 0 || tx > 15) continue;
      for (let y = y0; y < y1; y++) {
        const ty = Math.floor((y - top) * 16 / size); if (ty < 0 || ty > 15) continue;
        const c = s.s[ty * 16 + tx]; if (c) buf[y * W + x] = white ? 0xffffffff : shade(c, f);
      }
    }
    if (s.m) { s.m.sx = sx; s.m.sy = top; s.m.size = size; s.m.vis = tY < zbuf[clamp(Math.floor(sx), 0, W - 1)]; }
  }
  ctx.putImageData(img, 0, 0);
}

/* 第一人稱武器：手臂 → 武器 → 拳頭，三層疊加；換武器只換中間那層 */
function renderFP(ctx) {
  const c = CLASS[G.cls], sheet = IMG['fp_' + c.id], FS = DATA.fpSize, fp = c.fp;
  if (!sheet || !sheet.complete) return;
  const moving = anim && anim.kind === 'move';
  const bobY = moving ? Math.abs(Math.sin((now - anim.t0) / anim.dur * Math.PI)) * 4 : Math.sin(now * 0.003) * 1.2;
  const bobX = moving ? Math.sin((now - anim.t0) / anim.dur * Math.PI) * 2 : 0;
  const s = swing > 0 ? Math.sin(swing * Math.PI) : 0;
  const frames = [0, G.p.weapon, 21];
  ctx.imageSmoothingEnabled = false;
  if (fp.mirror) {
    // 武鬥家：左右雙拳，輪流出拳
    for (const side of [1, -1]) {
      const hit = side === punchSide ? s : 0;
      const ox = Math.round(fp.x + bobX - hit * 20), oy = Math.round(fp.y + FP_DY + bobY - hit * 22);
      ctx.save();
      if (side === -1) { ctx.translate(W, 0); ctx.scale(-1, 1); }
      for (const fr of frames) ctx.drawImage(sheet, fr * FS, 0, FS, FS, ox, oy, FS, FS);
      ctx.restore();
    }
    return;
  }
  const ox = Math.round(fp.x + bobX - s * (c.id === 'ranger' ? -6 : 26)), oy = Math.round(fp.y + FP_DY + bobY - s * (c.id === 'ranger' ? 4 : 18));
  for (const fr of frames) ctx.drawImage(sheet, fr * FS, 0, FS, FS, ox, oy, FS, FS);
}

function renderOverlay(ctx) {
  ctx.textAlign = 'center'; ctx.font = 'bold 9px monospace';
  for (const m of world.monsters) {
    if (!m.vis || m.hp >= m.maxHp || m.size < 8) continue;
    const bw = Math.min(34, m.size * 0.6), bx = m.sx - bw / 2, by = Math.max(1, m.sy - 3);
    ctx.fillStyle = '#000'; ctx.fillRect(bx - 1, by - 1, bw + 2, 4);
    ctx.fillStyle = '#d03838'; ctx.fillRect(bx, by, bw * m.hp / m.maxHp, 2);
  }
  for (const pp of popups) {
    let x, y;
    if (pp.self) { x = W / 2; y = H / 2 + 20; } else if (pp.m && pp.m.sx !== undefined) { x = pp.m.sx; y = pp.m.sy + 8; } else continue;
    y -= pp.t * 20 + (pp.off || 0);
    ctx.globalAlpha = 1 - pp.t;
    ctx.fillStyle = '#000'; ctx.fillText(pp.text, x + 1, y + 1);
    ctx.fillStyle = pp.color; ctx.fillText(pp.text, x, y);
    ctx.globalAlpha = 1;
  }
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

function renderMinimap() {
  const cs = 3, w = world, size = w.MW * cs;
  if (mm.width !== size) { mm.width = size; mm.height = size; }
  mctx.fillStyle = '#08070c'; mctx.fillRect(0, 0, size, size);
  for (let y = 0; y < w.MH; y++) for (let x = 0; x < w.MW; x++) {
    if (!w.seen[y * w.MW + x]) continue;
    mctx.fillStyle = w.map[y * w.MW + x] ? '#5b4b8a' : '#221d30'; mctx.fillRect(x * cs, y * cs, cs, cs);
  }
  for (const it of w.items) if (w.seen[it.y * w.MW + it.x]) {
    mctx.fillStyle = it.kind === 'potion' ? '#d03838' : it.kind === 'gold' ? '#f0c040' : '#b5793e'; mctx.fillRect(it.x * cs + 1, it.y * cs + 1, 1, 1);
  }
  const p = G.p;
  for (const m of w.monsters) if (Math.abs(m.x - p.x) + Math.abs(m.y - p.y) <= 5 && w.seen[m.y * w.MW + m.x]) { mctx.fillStyle = '#ff5050'; mctx.fillRect(m.x * cs, m.y * cs, cs, cs); }
  if (w.seen[w.stairs.y * w.MW + w.stairs.x]) { mctx.fillStyle = '#5ab8ff'; mctx.fillRect(w.stairs.x * cs, w.stairs.y * cs, cs, cs); }
  mctx.fillStyle = '#fff'; mctx.fillRect(p.x * cs, p.y * cs, cs, cs);
  const [fdx, fdy] = DIRS[p.face]; mctx.fillStyle = '#ffd76a'; mctx.fillRect((p.x + fdx) * cs + 1, (p.y + fdy) * cs + 1, 1, 1);
}

/* ---------- 標題背景：自動走迷宮 ---------- */
const demo = { w: null, x: 1, y: 1, face: 0, t0: 0, phase: 'idle' };
function initDemo() {
  makeTextures(THEMES[Math.floor(Math.random() * THEMES.length)]);
  demo.w = genMap(6);
  const w = demo.w;
  for (let y = 1; y < w.MH - 1; y++) for (let x = 1; x < w.MW - 1; x++) if (!w.map[y * w.MW + x]) { demo.x = x; demo.y = y; y = w.MH; break; }
  demo.face = Math.max(0, DIRS.findIndex(([dx, dy]) => !isWall(w, demo.x + dx, demo.y + dy)));
  cam.x = demo.x + 0.5; cam.y = demo.y + 0.5; cam.a = demo.face * Math.PI / 2;
  w.stairs = { x: -5, y: -5 };
}
function updateDemo() {
  const w = demo.w;
  if (anim) return;
  const opts = [0, -1, 1].map(d => (demo.face + d + 4) % 4).filter(f => !isWall(w, demo.x + DIRS[f][0], demo.y + DIRS[f][1]));
  const nf = opts.length ? (Math.random() < 0.7 && opts.includes(demo.face) ? demo.face : pick(opts)) : (demo.face + 1) % 4;
  if (nf !== demo.face) {
    const d = ((nf - demo.face + 4) % 4) === 1 ? 1 : -1;
    anim = { kind: 'turn', t0: now, dur: 700, fa: cam.a, ta: cam.a + d * Math.PI / 2 }; demo.face = (demo.face + d + 4) % 4;
  } else {
    const [dx, dy] = DIRS[demo.face];
    anim = { kind: 'move', t0: now, dur: 900, fx: demo.x + 0.5, fy: demo.y + 0.5, tx: demo.x + dx + 0.5, ty: demo.y + dy + 0.5 };
    demo.x += dx; demo.y += dy;
  }
}

/* ---------- 主迴圈 ---------- */
function stepAnim() {
  if (!anim) return;
  const k = clamp((now - anim.t0) / anim.dur, 0, 1), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
  if (anim.kind === 'move') { cam.x = anim.fx + (anim.tx - anim.fx) * e; cam.y = anim.fy + (anim.ty - anim.fy) * e; }
  else cam.a = anim.fa + (anim.ta - anim.fa) * e;
  if (k >= 1) {
    if (anim.kind === 'turn') cam.a = ((Math.round(cam.a / (Math.PI / 2)) % 4) + 4) % 4 * Math.PI / 2;
    const then = anim.then; anim = null;
    if (then && state === 'play') then();
    if (!anim && queued && state === 'play') { const q = queued; queued = null; act(q); }
  }
}
function frame(t) {
  const dt = Math.min(50, t - (lastT || t)); lastT = t; now = t;
  stepAnim();
  if (state === 'title' && demo.w) {
    updateDemo(); world = demo.w;
    renderWorld(tctx, demo.w, null);
  } else if (G && ['play', 'modal', 'dead'].includes(state)) {
    if (shake > 0) shake = Math.max(0, shake - dt * 0.03);
    if (swing > 0) swing = Math.max(0, swing - dt / 240);
    for (const m of world.monsters) if (m.flash > 0) m.flash -= dt / 160;
    for (const pp of popups) pp.t += dt / 700;
    popups = popups.filter(pp => pp.t < 1);
    renderWorld(vctx, world, [G.p.x, G.p.y]);
    renderFP(vctx);
    renderOverlay(vctx);
    renderMinimap();
  }
  requestAnimationFrame(frame);
}

/* =========================================================
 * 畫面流程：標題 → 名稱 → 選角 → 遊戲
 * ========================================================= */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === 'scr-' + id));
}
function goTitle() {
  state = 'title'; G = null; anim = null; initDemo(); showScreen('title');
  const b = loadBest();
  $('title-best').textContent = b ? `最佳紀錄：${b.name || ''} B${b.floor}` : '';
}
$('title-heroes').innerHTML = ['knight', 'swordsman', 'wizard', 'fencer', 'cleric', 'witch', 'ranger', 'rogue', 'berserker', 'monk']
  .map(id => `<img src="assets/heroes/${id}.png" alt="">`).join('');
$('scr-title').addEventListener('click', () => {
  if (state !== 'title') return;
  SFX.ui(); state = 'name'; anim = null; showScreen('name');
  const inp = $('name-input'); inp.value = profile.name || '';
  setTimeout(() => inp.focus(), 50);
});
function confirmName() {
  const v = $('name-input').value.trim().slice(0, 10);
  profile.name = v || '無名的冒險者';
  $('name-input').blur(); SFX.ui();
  state = 'select'; showScreen('select'); buildCarousel();
}
$('name-ok').addEventListener('click', confirmName);
$('name-input').addEventListener('keydown', e => { if (e.key === 'Enter') confirmName(); e.stopPropagation(); });

/* ---------- 轉盤選角 ---------- */
let carIdx = 0, carList = [];
function buildCarousel() {
  carList = DATA.classes.filter(c => c.sex === profile.sex);
  document.querySelectorAll('.sex-tab').forEach(b => b.classList.toggle('active', b.dataset.sex === profile.sex));
  const ring = $('car-ring'), n = carList.length, R = 190;
  ring.innerHTML = carList.map((c, i) => `<div class="car-item" style="transform:rotateY(${i * 360 / n}deg) translateZ(${R}px)"><img src="assets/heroes/${c.id}.png" alt="${c.name}"></div>`).join('');
  carIdx = Math.max(0, carList.findIndex(c => c.id === profile.cls));
  ring.dataset.rot = -carIdx * 360 / n;
  updateCarousel();
}
function updateCarousel() {
  const n = carList.length, ring = $('car-ring');
  ring.style.transform = `translateZ(-190px) rotateY(${ring.dataset.rot}deg)`;
  const i = ((carIdx % n) + n) % n, c = carList[i];
  ring.querySelectorAll('.car-item').forEach((el, j) => el.classList.toggle('front', j === i));
  profile.cls = c.id;
  $('ci-name').textContent = c.name; $('ci-hero').textContent = c.hero; $('ci-desc').textContent = c.desc;
  const st = [['生命', c.hp, 45], ['攻擊', c.atk, 9], ['防禦', c.def_, 5], ['爆擊', c.crit, 20]];
  $('ci-stats').innerHTML = st.map(([k, v, mx]) => `<span>${k}</span><div class="sbar"><i style="width:${Math.min(100, v / mx * 100)}%"></i></div><b>${v}${k === '爆擊' ? '%' : ''}</b>`).join('');
  setIcon($('ci-wicon'), c.id, 1, 48);
  $('ci-wname').innerHTML = `初始武器：${c.weapons[0]}<br><small style="color:var(--dim)">武器種類：${c.weaponType}（共 20 階）</small>`;
}
function rotateCar(d) {
  const n = carList.length, ring = $('car-ring');
  carIdx += d; ring.dataset.rot = +ring.dataset.rot - d * 360 / n; SFX.ui(); updateCarousel();
}
$('car-prev').addEventListener('click', () => rotateCar(-1));
$('car-next').addEventListener('click', () => rotateCar(1));
document.querySelectorAll('.sex-tab').forEach(b => b.addEventListener('click', () => {
  if (profile.sex === b.dataset.sex) return;
  profile.sex = b.dataset.sex; profile.cls = DATA.classes.find(c => c.sex === profile.sex).id; SFX.ui(); buildCarousel();
}));
$('select-ok').addEventListener('click', () => { SFX.ui(); newGame(); });
(() => {   // 轉盤滑動
  let x0 = null;
  const el = $('carousel');
  el.addEventListener('pointerdown', e => { if (!e.target.closest('button')) x0 = e.clientX; });
  el.addEventListener('pointerup', e => { if (x0 === null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 30) rotateCar(dx < 0 ? 1 : -1); });
  el.addEventListener('pointercancel', () => { x0 = null; });
})();

/* =========================================================
 * 遊戲中的輸入：手勢（手機）＋ 鍵盤 / 小鍵盤（網頁）
 * ========================================================= */
(() => {
  let t0 = null;
  const zone = $('scr-game');
  zone.addEventListener('pointerdown', e => {
    if (e.target.closest('button, #bottom, #keypad, #hud')) return;
    t0 = { x: e.clientX, y: e.clientY, t: performance.now() };
  });
  zone.addEventListener('pointerup', e => {
    if (!t0) return;
    const dx = e.clientX - t0.x, dy = e.clientY - t0.y, dt = performance.now() - t0.t; t0 = null;
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax < 14 && ay < 14) { if (dt < 500) act('atk'); return; }
    if (Math.max(ax, ay) < 28) return;
    if (ax > ay) act(dx < 0 ? 'left' : 'right');
    else act(dy < 0 ? 'fw' : 'back');
    $('swipe-hint').classList.add('hide');
  });
  zone.addEventListener('pointercancel', () => { t0 = null; });
})();
$('pot-btn').addEventListener('click', () => act('pot'));
$('weapon-slot').addEventListener('click', () => {
  if (state !== 'play') return;
  const p = G.p, r = DATA.rarity[p.weapon - 1];
  state = 'modal';
  showModal(`<h2>目前武器</h2><div class="wcompare"><div class="wbox" style="border-color:${r.color}"><span class="wicon" style="${iconStyle(G.cls, p.weapon)}"></span>
    <span style="color:${r.color}">${weaponName(G.cls, p.weapon)}</span><br><small>${r.name}・${p.weapon} 階・攻擊 +${weaponAtk(p.weapon)}</small></div></div>
    <p>打開寶箱或擊敗怪物有機會獲得更高階的武器。</p><button class="btn primary" data-ui="winfo">關閉</button>`);
});
document.querySelectorAll('#keypad button').forEach(b => {
  b.addEventListener('pointerdown', e => { e.preventDefault(); b.classList.add('down'); act(b.dataset.cmd); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, () => b.classList.remove('down')));
});
const KEYS = { w: 'fw', W: 'fw', ArrowUp: 'fw', a: 'left', A: 'left', ArrowLeft: 'left', d: 'right', D: 'right', ArrowRight: 'right',
  ' ': 'atk', j: 'atk', J: 'atk', Enter: 'atk', f: 'pot', F: 'pot', r: 'pot', s: 'back', S: 'back', ArrowDown: 'back' };
window.addEventListener('keydown', e => {
  if (state === 'title' && (e.key === 'Enter' || e.key === ' ')) { $('scr-title').click(); return; }
  if (state === 'select') {
    if (e.key === 'ArrowLeft' || e.key === 'a') rotateCar(-1);
    else if (e.key === 'ArrowRight' || e.key === 'd') rotateCar(1);
    else if (e.key === 'Enter') $('select-ok').click();
    return;
  }
  const c = KEYS[e.key]; if (c && state === 'play') { e.preventDefault(); act(c); }
});

/* Android 返回鍵 */
window.onAndroidBack = function () {
  if (state === 'modal' && $('modal-panel').querySelector('[data-ui="close"],[data-ui="winfo"]')) { resume(); return true; }
  if (state === 'select') { state = 'name'; showScreen('name'); return true; }
  if (state === 'name') { goTitle(); return true; }
  return false;
};

/* ---------- 啟動 ---------- */
loading.then(() => {});
goTitle();
requestAnimationFrame(frame);

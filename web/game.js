'use strict';
/* =========================================================
 * Endless Maze 無盡迷宮 — 像素風第一人稱迷宮探索 Roguelike
 * 光線投射 (raycasting) 引擎 + 回合制戰鬥 + 隨機生成地城
 * ========================================================= */

const W = 160, H = 120, HALF = H / 2, TEX = 16;
const view = document.getElementById('view');
const vctx = view.getContext('2d');
const img = vctx.createImageData(W, H);
const buf = new Uint32Array(img.data.buffer);
const zbuf = new Float32Array(W);
const mm = document.getElementById('minimap');
const mctx = mm.getContext('2d');

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // E S W N (y 向下)
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

/* ---------- 顏色工具 ---------- */
function rgb(r, g, b) { return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0; }
function hex(h) { const n = parseInt(h.slice(1), 16); return rgb(n >> 16 & 255, n >> 8 & 255, n & 255); }
function shade(c, f) {
  return ((255 << 24) | (((c >> 16 & 255) * f) << 16) | (((c >> 8 & 255) * f) << 8) | ((c & 255) * f)) >>> 0;
}
function vary(c, amt) {
  const r = clamp((c & 255) + amt, 0, 255), g = clamp((c >> 8 & 255) + amt, 0, 255), b = clamp((c >> 16 & 255) + amt, 0, 255);
  return rgb(r, g, b);
}

/* ---------- 主題與材質 ---------- */
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
      else {
        const brick = (row * 7 + Math.floor((x + off) / 8) * 13) % 3;
        c = vary(wall[brick], rnd(-10, 10));
        if (y % 4 === 0) c = vary(c, 14);             // 磚頭上緣高光
      }
      wallTex[y * TEX + x] = c;
    }
  }
  const fl = theme.floor.map(hex);
  floorTex = new Uint32Array(TEX * TEX);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const tile = ((x >> 3) + (y >> 3)) & 1;
    let c = vary(fl[tile], rnd(-8, 8));
    if (x % 8 === 0 || y % 8 === 0) c = vary(c, -18);
    floorTex[y * TEX + x] = c;
  }
  const ce = theme.ceil.map(hex);
  ceilTex = new Uint32Array(TEX * TEX);
  for (let i = 0; i < TEX * TEX; i++) ceilTex[i] = vary(ce[Math.random() < 0.3 ? 1 : 0], rnd(-5, 5));
}

/* ---------- 像素圖 (16x16) ---------- */
const PAL = {
  K: '#1a1020', W: '#ecebe4', G: '#4caf50', g: '#9be36b', R: '#d03838', r: '#ff8a6a', P: '#8a4fbf', p: '#c08ae8',
  B: '#8b5a2b', b: '#b5793e', Y: '#f0c040', O: '#b07818', S: '#8e8e9e', D: '#5a5a68', C: '#3a7bd5', c: '#9ad8ff', E: '#2a1a40',
};
const SPR_SRC = {
  slime: [
    '................', '................', '................', '................', '................',
    '......KKKK......', '....KKGGGGKK....', '...KGGgGGGGGK...', '..KGGggGGGGGGK..', '..KGGGWKGGWKGK..',
    '.KGGGGWKGGWKGGK.', '.KGGGGGGGGGGGGK.', '.KGGGGKKKKGGGGK.', '.KGGGGGGGGGGGGK.', '..KKKKKKKKKKKK..', '................'],
  bat: [
    '................', '................', '................', '.K............K.', '.KK..K....K..KK.',
    '.KPK.KK..KK.KPK.', '.KPPKKPKKPKKPPK.', '.KPPPPPPPPPPPPK.', '..KPPPRPPRPPPK..', '..KPPPPPPPPPPK..',
    '...KPKPPPPKPK...', '...K..KWWK..K...', '.......KK.......', '................', '................', '................'],
  goblin: [
    '................', '................', '.....KKKKKK.....', '..KK.KGGGGK.KK..', '..KGKGRGGRGKGK..',
    '...KGGGGGGGGK...', '....KGKKKKGK....', '.....KGGGGK.....', '....KBBBBBBK....', '...KGKBBBBKGK...',
    '...KGKBBBBKGK.S.', '....KKBBBBKK..S.', '.....KBKKBK..S..', '.....KBK.KBK....', '....KKK..KKK....', '................'],
  skeleton: [
    '................', '.....KKKKKK.....', '....KWWWWWWK....', '....KWKWWKWK....', '....KWWWWWWK....',
    '.....KWKKWK.....', '......KWWK......', '....KKWWWWKK....', '...KW.KWWK.WK...', '...KW.WKKW.WK...',
    '......KWWK......', '.....KW..WK.....', '.....KW..WK.....', '.....KW..WK.....', '....KWW..WWK....', '................'],
  eye: [
    '................', '.....KKKKKK.....', '...KKPPPPPPKK...', '..KPPWWWWWWPPK..', '.KPPWWWWWWWWPPK.',
    '.KPWWWRRRRWWWPK.', 'KPPWWRRKKRRWWPPK', 'KPPWWRRKKRRWWPPK', '.KPWWWRRRRWWWPK.', '.KPPWWWWWWWWPPK.',
    '..KPPWWWWWWPPK..', '...KKPPPPPPKK...', '.....KKKKKK.....', '......K..K......', '.....K....K.....', '................'],
  golem: [
    '................', '....KKKKKKKK....', '....KSSSSSSK....', '....KSYSSYSK....', '....KSSSSSSK....',
    '..KKKKSSSSKKKK..', '.KSSSSSSSSSSSSK.', '.KSSKSSSSSSKSSK.', '.KSSKSSDDSSKSSK.', '.KSSKSSSSSSKSSK.',
    '.KKKKSSSSSSKKKK.', '....KSSKKSSK....', '....KSSK.KSSK...', '...KSSSK.KSSSK..', '...KKKKK.KKKKK..', '................'],
  demon: [
    '.K............K.', '.KK..........KK.', '..KRK.KKKK.KRK..', '..KRRKRRRRKRRK..', '...KRRRRRRRRK...',
    '...KRYKRRKYRK...', '...KRRRRRRRRK...', '....KRKWWKRK....', '..KKKRRRRRRKKK..', '.KRRKRRRRRRKRRK.',
    '.KRKKRREERRKKRK.', '.KRK.KRRRRK.KRK.', '..K..KRKKRK..K..', '.....KRK.KRK....', '....KKKK.KKKK...', '................'],
  potion: [
    '................', '................', '................', '................', '................', '................',
    '......KKKK......', '.......KK.......', '......KWWK......', '.....KRRRRK.....', '....KRRWRRRK....',
    '....KRRRRRRK....', '....KRRRRRRK....', '.....KKKKKK.....', '................', '................'],
  gold: [
    '................', '................', '................', '................', '................', '................',
    '................', '................', '................', '.....KKKKKK.....', '...KKYYYYYYKK...',
    '..KYYYOYYOYYYK..', '..KYYYYYYYYYYK..', '...KKYYYYYYKK...', '.....KKKKKK.....', '................'],
  chest: [
    '................', '................', '................', '................', '................', '................',
    '................', '...KKKKKKKKKK...', '..KBBBBBBBBBBK..', '..KbbbbbbbbbbK..', '..KKKKKYYKKKKK..',
    '..KBBBBYYBBBBK..', '..KBBBBBBBBBBK..', '..KBBBBBBBBBBK..', '..KKKKKKKKKKKK..', '................'],
  stairs: [
    '................', '................', '................', '................', '................', '................',
    '................', '................', '................', '................', '...KKKKKKKKKK...',
    '..KCCCCCCCCCCK..', '.KCCccccccccCCK.', '.KCcccEEEEcccCK.', '..KCCCCCCCCCCK..', '...KKKKKKKKKK...'],
  sword: [
    '...............W', '..............Wc', '.............Wc.', '............WS..', '...........WS...',
    '..........WS....', '.........WS.....', '........WS......', '...KK..WS.......', '...KYKWS........',
    '....KYS.........', '....BKYK........', '...BB.KYK.......', '..BB...KK.......', '.BB.............', 'KB..............'],
};
const SPR = {};
for (const k in SPR_SRC) {
  const a = new Uint32Array(TEX * TEX);
  SPR_SRC[k].forEach((row, y) => {
    for (let x = 0; x < TEX; x++) { const ch = row[x] || '.'; a[y * TEX + x] = ch === '.' ? 0 : hex(PAL[ch]); }
  });
  SPR[k] = a;
}

/* ---------- 怪物資料 ---------- */
const MONSTERS = {
  slime:    { name: '史萊姆', hp: 7,  atk: 3, def: 0, xp: 3,  minF: 1 },
  bat:      { name: '洞窟蝙蝠', hp: 5,  atk: 3, def: 0, xp: 3,  minF: 1, fast: true, fly: true },
  goblin:   { name: '哥布林', hp: 10, atk: 4, def: 1, xp: 5,  minF: 2 },
  skeleton: { name: '骷髏兵', hp: 13, atk: 5, def: 1, xp: 7,  minF: 3 },
  eye:      { name: '凝視魔眼', hp: 15, atk: 6, def: 2, xp: 9,  minF: 5, fly: true },
  golem:    { name: '石像魔', hp: 26, atk: 7, def: 4, xp: 13, minF: 7 },
  demon:    { name: '深淵魔王', hp: 55, atk: 8, def: 3, xp: 40, minF: 99, boss: true },
};

/* ---------- 天賦 (升級三選一) ---------- */
const PERKS = [
  { id: 'hp',     t: '強健體魄', d: '最大生命 +10，並回復 10', w: 3, f: p => { p.maxHp += 10; p.hp += 10; } },
  { id: 'atk',    t: '磨利刀鋒', d: '攻擊力 +2', w: 3, f: p => { p.atk += 2; } },
  { id: 'def',    t: '鐵壁',     d: '防禦力 +1', w: 3, f: p => { p.def += 1; } },
  { id: 'crit',   t: '鷹眼',     d: '爆擊率 +8%', w: 3, f: p => { p.crit += 8; } },
  { id: 'critd',  t: '致命一擊', d: '爆擊傷害 +50%', w: 2, r: 'rare', f: p => { p.critDmg += 0.5; } },
  { id: 'steal',  t: '吸血',     d: '造成傷害的 15% 轉為生命', w: 2, r: 'rare', max: 3, f: p => { p.steal += 0.15; } },
  { id: 'thorns', t: '荊棘護甲', d: '被攻擊時反彈 3 點傷害', w: 2, r: 'rare', f: p => { p.thorns += 3; } },
  { id: 'dodge',  t: '殘影步',   d: '閃避率 +8%', w: 2, r: 'rare', max: 4, f: p => { p.dodge += 8; } },
  { id: 'regen',  t: '再生',     d: '每走 4 步回復 1 生命（可疊加）', w: 2, r: 'rare', f: p => { p.regen += 1; } },
  { id: 'potion', t: '藥劑師',   d: '藥水效果 +50%，並獲得 1 瓶藥水', w: 2, f: p => { p.potionPow = Math.round(p.potionPow * 1.5); p.potions++; } },
  { id: 'map',    t: '製圖師',   d: '每層樓開局即顯示完整地圖', w: 1, r: 'epic', max: 1, f: p => { p.mapper = true; revealAll(); } },
  { id: 'double', t: '連擊',     d: '15% 機率連續攻擊兩次', w: 1, r: 'epic', max: 2, f: p => { p.double += 15; } },
  { id: 'greed',  t: '貪婪',     d: '金幣獲得 +50%，擊殺有機率掉落藥水', w: 1, r: 'epic', max: 1, f: p => { p.greed = true; } },
];

/* ---------- 遊戲狀態 ---------- */
let G = null;          // 目前這一局
let MW = 0, MH = 0, map = null, seen = null;
let state = 'title';   // title | play | perk | stairs | dead
const cam = { x: 1.5, y: 1.5, a: 0 };
let anim = null, queued = null, shake = 0, swing = 0;
let popups = [];
let lastT = 0, now = 0;

function best() { try { return JSON.parse(localStorage.getItem('endless_maze_best') || '{"floor":0,"kills":0}'); } catch (e) { return { floor: 0, kills: 0 }; } }
function saveBest() {
  const b = best();
  if (G.floor > b.floor || (G.floor === b.floor && G.p.kills > b.kills)) {
    try { localStorage.setItem('endless_maze_best', JSON.stringify({ floor: G.floor, kills: G.p.kills })); } catch (e) { }
    return true;
  }
  return false;
}

function newGame() {
  G = {
    floor: 0,
    p: {
      x: 0, y: 0, face: 0, hp: 30, maxHp: 30, atk: 5, def: 1, crit: 5, critDmg: 2, potions: 2, potionPow: 14,
      lvl: 1, xp: 0, next: 10, gold: 0, kills: 0, steal: 0, thorns: 0, dodge: 0, regen: 0, steps: 0,
      mapper: false, double: 0, greed: false, perks: {}, pendingLv: 0,
    },
    monsters: [], items: [],
  };
  document.getElementById('log').innerHTML = '';
  nextFloor();
  state = 'play';
  hideOverlay();
  log('你踏入了無盡迷宮……找到 <span class="c-blue">傳送門</span> 前往下一層。');
}

/* ---------- 地圖生成 ---------- */
function genMap(floor) {
  const size = Math.min(13 + floor * 2, 33) | 1;
  MW = MH = size;
  map = new Uint8Array(size * size).fill(1);
  seen = new Uint8Array(size * size);
  const at = (x, y) => map[y * size + x];
  const set = (x, y, v) => { map[y * size + x] = v; };

  // 1. 遞迴回溯迷宮
  const stack = [[1, 1]]; set(1, 1, 0);
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const opts = DIRS.filter(([dx, dy]) => {
      const nx = cx + dx * 2, ny = cy + dy * 2;
      return nx > 0 && ny > 0 && nx < size - 1 && ny < size - 1 && at(nx, ny) === 1;
    });
    if (!opts.length) { stack.pop(); continue; }
    const [dx, dy] = pick(opts);
    set(cx + dx, cy + dy, 0); set(cx + dx * 2, cy + dy * 2, 0);
    stack.push([cx + dx * 2, cy + dy * 2]);
  }
  // 2. 房間
  const rooms = 2 + Math.min(floor, 4);
  for (let i = 0; i < rooms; i++) {
    const rw = pick([3, 3, 5]), rh = pick([3, 3, 5]);
    const rx = 1 + 2 * rnd(0, (size - 2 - rw) >> 1), ry = 1 + 2 * rnd(0, (size - 2 - rh) >> 1);
    for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) set(x, y, 0);
  }
  // 3. 打通部分牆壁製造迴圈
  for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
    if (at(x, y) !== 1 || Math.random() > 0.07) continue;
    if ((at(x - 1, y) === 0 && at(x + 1, y) === 0 && at(x, y - 1) === 1 && at(x, y + 1) === 1) ||
        (at(x, y - 1) === 0 && at(x, y + 1) === 0 && at(x - 1, y) === 1 && at(x + 1, y) === 1)) set(x, y, 0);
  }
}

function bfs(sx, sy, blockMonsters) {
  const dist = new Int16Array(MW * MH).fill(-1);
  const q = [sx + sy * MW]; dist[q[0]] = 0;
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % MW, y = (i / MW) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy, ni = nx + ny * MW;
      if (map[ni] !== 0 || dist[ni] !== -1) continue;
      if (blockMonsters && monsterAt(nx, ny)) continue;
      dist[ni] = dist[i] + 1; q.push(ni);
    }
  }
  return dist;
}

function nextFloor() {
  G.floor++;
  const f = G.floor;
  const theme = THEMES[Math.floor((f - 1) / 3) % THEMES.length];
  G.theme = theme;
  makeTextures(theme);
  genMap(f);

  const cells = [];
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (map[y * MW + x] === 0) cells.push([x, y]);
  const [sx, sy] = pick(cells);
  const p = G.p;
  p.x = sx; p.y = sy;
  G.monsters = []; G.items = [];
  const dist = bfs(sx, sy, false);
  let far = 0, stairs = [sx, sy];
  for (const [x, y] of cells) { const d = dist[y * MW + x]; if (d > far) { far = d; stairs = [x, y]; } }
  G.stairs = { x: stairs[0], y: stairs[1] };
  // 起始朝向：面向一條通道
  p.face = DIRS.findIndex(([dx, dy]) => map[(sy + dy) * MW + sx + dx] === 0);
  if (p.face < 0) p.face = 0;
  cam.x = sx + 0.5; cam.y = sy + 0.5; cam.a = p.face * Math.PI / 2;

  const used = new Set([sx + ',' + sy, stairs.join(',')]);
  const free = cells.filter(([x, y]) => dist[y * MW + x] >= 4 && !used.has(x + ',' + y));
  const take = () => {
    while (free.length) {
      const i = rnd(0, free.length - 1); const c = free.splice(i, 1)[0];
      if (!used.has(c.join(','))) { used.add(c.join(',')); return c; }
    }
    return null;
  };

  // 魔王層：每 5 層
  const bossFloor = f % 5 === 0;
  if (bossFloor) {
    // 魔王站在階梯旁
    const sd = bfs(stairs[0], stairs[1], false);
    let guard = null;
    for (const [dx, dy] of DIRS) {
      const gx = stairs[0] + dx, gy = stairs[1] + dy;
      if (map[gy * MW + gx] === 0 && dist[gy * MW + gx] === far - 1) guard = [gx, gy];
    }
    if (!guard) guard = DIRS.map(([dx, dy]) => [stairs[0] + dx, stairs[1] + dy]).find(([x, y]) => map[y * MW + x] === 0 && sd[y * MW + x] === 1);
    if (guard) { used.add(guard.join(',')); spawn('demon', guard[0], guard[1]); }
  }

  const pool = Object.keys(MONSTERS).filter(k => MONSTERS[k].minF <= f);
  const nMon = Math.min(4 + Math.floor(f * 1.4), 22);
  for (let i = 0; i < nMon; i++) { const c = take(); if (c) spawn(pick(pool), c[0], c[1]); }
  const nPot = rnd(1, 2) + (f % 3 === 0 ? 1 : 0), nGold = rnd(3, 5), nChest = rnd(1, 2);
  for (let i = 0; i < nPot; i++) { const c = take(); if (c) G.items.push({ kind: 'potion', x: c[0], y: c[1] }); }
  for (let i = 0; i < nGold; i++) { const c = take(); if (c) G.items.push({ kind: 'gold', x: c[0], y: c[1], v: rnd(3, 8) + f * 2 }); }
  for (let i = 0; i < nChest; i++) { const c = take(); if (c) G.items.push({ kind: 'chest', x: c[0], y: c[1] }); }

  if (p.mapper) revealAll();
  popups = [];
  updateHud();
  log(`<span class="c-purple">— 地下 ${f} 層・${theme.name} —</span>` + (bossFloor ? ' <span class="c-red">強大的氣息……魔王守護著傳送門！</span>' : ''));
}

function spawn(type, x, y) {
  const b = MONSTERS[type], f = G.floor;
  const s = 1 + (f - 1) * 0.22;
  const m = {
    type, name: b.name, x, y, fx: x, fy: y, t0: 0,
    maxHp: Math.round(b.hp * s * (b.boss ? 1 + f * 0.05 : 1)), atk: b.atk + Math.floor((f - 1) * 0.9), def: b.def + Math.floor((f - 1) / 4),
    xp: Math.round(b.xp * (1 + (f - 1) * 0.15)), fast: !!b.fast, fly: !!b.fly, boss: !!b.boss, flash: 0, awake: false,
  };
  m.hp = m.maxHp;
  G.monsters.push(m);
}

function revealAll() { if (seen) seen.fill(1); }
const monsterAt = (x, y) => G.monsters.find(m => m.x === x && m.y === y);
const itemAt = (x, y) => G.items.find(it => it.x === x && it.y === y);
const isWall = (x, y) => x < 0 || y < 0 || x >= MW || y >= MH || map[y * MW + x] === 1;

/* ---------- 音效 ---------- */
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
  step: () => beep(90, 0.05, 'triangle', 0.03),
  bump: () => beep(60, 0.08, 'square', 0.03),
  swing: () => beep(500, 0.08, 'sawtooth', 0.025, -350),
  hit: () => { beep(180, 0.1, 'square', 0.05, -100); },
  crit: () => { beep(880, 0.06, 'square', 0.05); setTimeout(() => beep(1320, 0.1, 'square', 0.04), 50); },
  hurt: () => beep(120, 0.2, 'sawtooth', 0.06, -60),
  pick: () => { beep(660, 0.06); setTimeout(() => beep(990, 0.08), 60); },
  heal: () => { beep(440, 0.1, 'sine', 0.06, 300); },
  level: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.12, 'square', 0.04), i * 90)),
  portal: () => beep(200, 0.6, 'sine', 0.06, 600),
  die: () => [300, 220, 160, 100].forEach((f, i) => setTimeout(() => beep(f, 0.25, 'sawtooth', 0.05), i * 180)),
};

/* ---------- 訊息 ---------- */
function log(html) {
  const el = document.getElementById('log');
  const d = document.createElement('div'); d.innerHTML = html; el.appendChild(d);
  while (el.children.length > 6) el.removeChild(el.firstChild);
}
function flash(color) {
  const f = document.getElementById('flash');
  f.style.transition = 'none'; f.style.background = color; f.style.opacity = '0.45';
  requestAnimationFrame(() => { f.style.transition = 'opacity .3s'; f.style.opacity = '0'; });
}

/* ---------- 玩家行動 ---------- */
function act(cmd) {
  if (state !== 'play') return;
  if (anim) { queued = cmd; return; }
  const p = G.p;
  switch (cmd) {
    case 'tl': turn(-1); break;
    case 'tr': turn(1); break;
    case 'fw': move(p.face); break;
    case 'bk': move((p.face + 2) % 4); break;
    case 'sl': move((p.face + 3) % 4); break;
    case 'sr': move((p.face + 1) % 4); break;
    case 'atk': attackFront(); break;
    case 'pot': drink(); break;
    case 'wait': log('你屏息等待……'); endTurn(); break;
  }
}

function turn(d) {
  const p = G.p;
  const from = cam.a;
  p.face = (p.face + d + 4) % 4;
  anim = { kind: 'turn', t0: now, dur: 150, fa: from, ta: from + d * Math.PI / 2 };
}

function move(dir) {
  const p = G.p;
  const [dx, dy] = DIRS[dir];
  const nx = p.x + dx, ny = p.y + dy;
  const m = monsterAt(nx, ny);
  if (m) {
    if (dir === p.face) attack(m); else { SFX.bump(); log(`${m.name} 擋住了去路！`); }
    return;
  }
  if (isWall(nx, ny)) { SFX.bump(); shake = 3; return; }
  anim = { kind: 'move', t0: now, dur: 150, fx: p.x + 0.5, fy: p.y + 0.5, tx: nx + 0.5, ty: ny + 0.5 };
  p.x = nx; p.y = ny; p.steps++;
  SFX.step();
  if (p.regen && p.steps % 4 === 0 && p.hp < p.maxHp) { p.hp = Math.min(p.maxHp, p.hp + p.regen); }
  pickup();
  endTurn();
  if (state === 'play' && p.x === G.stairs.x && p.y === G.stairs.y) onStairs();
}

function pickup() {
  const p = G.p, it = itemAt(p.x, p.y);
  if (!it) return;
  G.items.splice(G.items.indexOf(it), 1);
  SFX.pick();
  if (it.kind === 'potion') { p.potions++; log('撿到了 <span class="c-green">回復藥水</span>。'); }
  else if (it.kind === 'gold') { const v = Math.round(it.v * (p.greed ? 1.5 : 1)); p.gold += v; log(`撿到 <span class="c-gold">${v} 金幣</span>。`); }
  else if (it.kind === 'chest') openChest();
  updateHud();
}

function openChest() {
  const p = G.p, f = G.floor;
  const loot = pick([
    () => { const v = 1 + Math.floor(f / 3) + rnd(0, 1); p.atk += v; return `<span class="c-gold">${pick(['精鋼長劍', '獵人之弓', '符文斧', '暗影匕首'])}</span>！攻擊 +${v}`; },
    () => { const v = 1 + Math.floor(f / 6); p.def += v; return `<span class="c-gold">${pick(['鎖子甲', '騎士盾', '龍鱗護手'])}</span>！防禦 +${v}`; },
    () => { p.crit += 5; return `<span class="c-gold">鷹之護符</span>！爆擊率 +5%`; },
    () => { p.maxHp += 6; p.hp += 6; return `<span class="c-gold">生命寶石</span>！最大生命 +6`; },
    () => { p.potions += 2; return `<span class="c-green">藥水 ×2</span>`; },
  ])();
  log('打開寶箱：' + loot);
}

function drink() {
  const p = G.p;
  if (p.potions <= 0) { log('沒有藥水了！'); return; }
  if (p.hp >= p.maxHp) { log('生命已滿。'); return; }
  p.potions--;
  const v = Math.min(p.potionPow + Math.floor(p.maxHp * 0.15), p.maxHp - p.hp);
  p.hp += v;
  SFX.heal(); flash('#40ff80');
  log(`喝下藥水，回復 <span class="c-green">${v}</span> 生命。`);
  endTurn();
}

function attackFront() {
  const p = G.p, [dx, dy] = DIRS[p.face];
  const m = monsterAt(p.x + dx, p.y + dy);
  if (m) attack(m);
  else { swing = 1; SFX.swing(); endTurn(); }
}

function attack(m) {
  const p = G.p;
  swing = 1;
  const hits = Math.random() * 100 < p.double ? 2 : 1;
  for (let i = 0; i < hits && m.hp > 0; i++) {
    const crit = Math.random() * 100 < p.crit;
    let dmg = Math.max(1, p.atk + rnd(-1, 2) - m.def);
    if (crit) dmg = Math.round(dmg * p.critDmg);
    m.hp -= dmg; m.flash = 1; m.awake = true;
    popups.push({ m, x: m.x, y: m.y, text: (crit ? '爆' : '') + dmg, color: crit ? '#ffd76a' : '#ffffff', t: 0, off: i * 6 });
    if (crit) SFX.crit(); else SFX.hit();
    if (p.steal) p.hp = Math.min(p.maxHp, p.hp + Math.max(1, Math.round(dmg * p.steal)));
    if (i === 1) log('<span class="c-purple">連擊！</span>');
  }
  if (m.hp <= 0) kill(m);
  endTurn();
}

function kill(m) {
  const p = G.p;
  G.monsters.splice(G.monsters.indexOf(m), 1);
  p.kills++;
  log(`擊敗了 <span class="c-red">${m.name}</span>，獲得 ${m.xp} 經驗。`);
  if (m.boss) {
    log('<span class="c-gold">魔王倒下了！傳送門的封印解除。</span>');
    G.items.push({ kind: 'chest', x: m.x, y: m.y });
  } else if (Math.random() < (p.greed ? 0.22 : 0.12)) {
    G.items.push({ kind: Math.random() < 0.5 ? 'potion' : 'gold', x: m.x, y: m.y, v: rnd(4, 10) + G.floor * 2 });
  }
  gainXp(m.xp);
}

function gainXp(v) {
  const p = G.p;
  p.xp += v;
  while (p.xp >= p.next) {
    p.xp -= p.next; p.lvl++; p.next = Math.round(p.next * 1.45 + 4);
    p.maxHp += 4; p.hp = Math.min(p.maxHp, p.hp + Math.ceil(p.maxHp * 0.3)); p.atk += 1;
    p.pendingLv++;
  }
}

function endTurn() {
  const p = G.p;
  const dist = bfs(p.x, p.y, false);
  for (const m of G.monsters.slice()) {
    if (m.hp <= 0) continue;
    const acts = m.fast ? 2 : 1;
    for (let a = 0; a < acts && state === 'play'; a++) monsterTurn(m, dist);
  }
  if (p.hp <= 0) return gameOver();
  updateHud();
  if (p.pendingLv > 0) setTimeout(showPerks, 250);
}

function monsterTurn(m, dist) {
  const p = G.p;
  const md = Math.abs(m.x - p.x) + Math.abs(m.y - p.y);
  if (md === 1) { monsterAttack(m); return; }
  const d = dist[m.y * MW + m.x];
  if (!m.awake && d >= 0 && d <= 6) m.awake = true;
  if (m.boss && !m.awake) return;
  let opts = [];
  if (m.awake && d > 0 && d <= 14) {
    for (const [dx, dy] of DIRS) {
      const nx = m.x + dx, ny = m.y + dy;
      if (dist[ny * MW + nx] === d - 1 && !monsterAt(nx, ny) && !(nx === p.x && ny === p.y)) opts.push([nx, ny]);
    }
  } else if (!m.boss && Math.random() < 0.35) {
    for (const [dx, dy] of DIRS) {
      const nx = m.x + dx, ny = m.y + dy;
      if (!isWall(nx, ny) && !monsterAt(nx, ny) && !(nx === p.x && ny === p.y)) opts.push([nx, ny]);
    }
  }
  if (!opts.length) return;
  const [nx, ny] = pick(opts);
  m.fx = m.x; m.fy = m.y; m.t0 = now; m.x = nx; m.y = ny;
}

function monsterAttack(m) {
  const p = G.p;
  if (Math.random() * 100 < p.dodge) { log(`閃避了 ${m.name} 的攻擊！`); popups.push({ x: p.x, y: p.y, self: true, text: 'MISS', color: '#7ab8ff', t: 0 }); return; }
  const dmg = Math.max(1, m.atk + rnd(-1, 1) - p.def);
  p.hp -= dmg;
  shake = 6; SFX.hurt(); flash('#ff2020');
  log(`${m.name} 攻擊你，造成 <span class="c-red">${dmg}</span> 傷害。`);
  if (p.thorns && p.hp > 0) {
    m.hp -= p.thorns; m.flash = 1;
    if (m.hp <= 0) kill(m);
  }
}

function onStairs() {
  if (G.monsters.some(m => m.boss)) { log('<span class="c-red">魔王的力量封印著傳送門！</span>'); return; }
  state = 'stairs';
  showPanel(`<h2>傳送門</h2><p>要前往 <b>地下 ${G.floor + 1} 層</b> 嗎？<br>穿過傳送門會回復 20% 生命。</p>
    <button class="primary" data-ui="descend">前往下一層</button><button data-ui="stay">繼續探索</button>`);
}

function descend() {
  const p = G.p;
  SFX.portal();
  p.hp = Math.min(p.maxHp, p.hp + Math.ceil(p.maxHp * 0.2));
  nextFloor();
  state = 'play';
  hideOverlay();
}

/* ---------- 天賦選擇 ---------- */
function rollPerks() {
  const p = G.p;
  const avail = PERKS.filter(k => !k.max || (p.perks[k.id] || 0) < k.max);
  const out = [];
  while (out.length < 3 && avail.length) {
    const total = avail.reduce((s, k) => s + k.w, 0);
    let r = Math.random() * total;
    const i = avail.findIndex(k => (r -= k.w) < 0);
    out.push(avail.splice(i, 1)[0]);
  }
  return out;
}
let perkChoices = [];
function showPerks() {
  if (state !== 'play' || G.p.pendingLv <= 0) return;
  state = 'perk';
  SFX.level();
  perkChoices = rollPerks();
  showPanel(`<h2>等級提升！Lv ${G.p.lvl - G.p.pendingLv + 1}</h2><p>選擇一項天賦：</p>` +
    perkChoices.map((k, i) => `<button class="card ${k.r || ''}" data-ui="perk" data-i="${i}"><span class="t">${k.t}</span><span class="d">${k.d}</span></button>`).join(''));
}
function choosePerk(i) {
  const p = G.p, k = perkChoices[i];
  if (!k) return;
  k.f(p);
  p.perks[k.id] = (p.perks[k.id] || 0) + 1;
  p.pendingLv--;
  log(`獲得天賦 <span class="c-gold">${k.t}</span>。`);
  state = 'play';
  hideOverlay();
  updateHud();
  if (p.pendingLv > 0) showPerks();
}

/* ---------- 結束 / 標題 ---------- */
function gameOver() {
  state = 'dead';
  G.p.hp = 0;
  updateHud();
  SFX.die();
  const rec = saveBest();
  const p = G.p;
  showPanel(`<h1>YOU DIED</h1><div class="sub">你倒在了地下 ${G.floor} 層</div>
    ${rec ? '<p class="c-gold">★ 新紀錄！</p>' : ''}
    <div class="statgrid">
      <div>到達樓層<b>B${G.floor}</b></div><div>等級<b>${p.lvl}</b></div>
      <div>擊殺數<b>${p.kills}</b></div><div>金幣<b>${p.gold}</b></div>
      <div>攻擊<b>${p.atk}</b></div><div>防禦<b>${p.def}</b></div>
    </div>
    <button class="primary" data-ui="start">再次挑戰</button><button data-ui="title">回到標題</button>`);
}

function showTitle() {
  state = 'title';
  const b = best();
  showPanel(`<h1>ENDLESS<br>MAZE</h1><div class="sub">無盡迷宮 · PIXEL ROGUELIKE</div>
    <p>在不斷變化的迷宮中往下深入，<br>擊敗怪物、收集寶物、選擇天賦。<br>死亡即重來——你能走多深？</p>
    ${b.floor ? `<p class="c-gold">最佳紀錄：地下 ${b.floor} 層（擊殺 ${b.kills}）</p>` : ''}
    <button class="primary" data-ui="start">開始冒險</button>
    <button data-ui="help">操作說明</button>`);
}
function showHelp() {
  showPanel(`<h2>操作說明</h2><div class="help"><p>
    ▲▼◀▶：前進、後退、左右平移<br>↺ ↻：向左 / 向右轉<br>
    朝怪物前進或按「攻擊」即可攻擊正前方<br>
    畫面上滑動：左右滑轉向、上滑前進、點擊攻擊<br>
    每次移動或攻擊都是一個回合，怪物也會行動。<br>
    踩上寶物自動拾取，找到藍色 <span class="c-blue">傳送門</span> 下樓。<br>
    每 5 層有魔王守門。升級時可三選一天賦。</p></div>
    <button class="primary" data-ui="title">返回</button>`);
}

/* ---------- UI ---------- */
const overlay = document.getElementById('overlay'), panel = document.getElementById('panel');
function showPanel(html) { panel.innerHTML = html; overlay.classList.add('show'); }
function hideOverlay() { overlay.classList.remove('show'); }
panel.addEventListener('click', e => {
  const b = e.target.closest('button[data-ui]');
  if (!b) return;
  beep(700, 0.05);
  const ui = b.dataset.ui;
  if (ui === 'start') newGame();
  else if (ui === 'title') showTitle();
  else if (ui === 'help') showHelp();
  else if (ui === 'perk') choosePerk(+b.dataset.i);
  else if (ui === 'descend') { descend(); showPerks(); }
  else if (ui === 'stay') { state = 'play'; hideOverlay(); showPerks(); }
});

const $ = id => document.getElementById(id);
function updateHud() {
  const p = G.p;
  $('hud-floor').textContent = 'B' + G.floor;
  $('hud-lvl').textContent = 'Lv' + p.lvl;
  $('hp-fill').style.width = (100 * Math.max(0, p.hp) / p.maxHp) + '%';
  $('hp-text').textContent = `${Math.max(0, p.hp)} / ${p.maxHp}`;
  $('xp-fill').style.width = (100 * p.xp / p.next) + '%';
  $('st-atk').textContent = p.atk; $('st-def').textContent = p.def;
  $('st-crit').textContent = Math.min(100, p.crit) + '%'; $('st-gold').textContent = p.gold; $('st-kills').textContent = p.kills;
  $('pot-n').textContent = '×' + p.potions;
}

/* 按鈕：支援長按連續移動 */
document.querySelectorAll('#controls button').forEach(b => {
  let timer = null;
  const stop = () => { clearTimeout(timer); clearInterval(timer); timer = null; b.classList.remove('down'); };
  b.addEventListener('pointerdown', e => {
    e.preventDefault();
    b.classList.add('down');
    act(b.dataset.cmd);
    if (b.hasAttribute('data-repeat')) timer = setTimeout(() => { timer = setInterval(() => act(b.dataset.cmd), 190); }, 320);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, stop));
  b.addEventListener('contextmenu', e => e.preventDefault());
});

/* 畫面手勢 */
let touch0 = null;
view.addEventListener('pointerdown', e => { touch0 = { x: e.clientX, y: e.clientY }; });
view.addEventListener('pointerup', e => {
  if (!touch0) return;
  const dx = e.clientX - touch0.x, dy = e.clientY - touch0.y; touch0 = null;
  if (Math.abs(dx) < 20 && Math.abs(dy) < 20) act('atk');
  else if (Math.abs(dx) > Math.abs(dy)) act(dx > 0 ? 'tr' : 'tl');
  else act(dy < 0 ? 'fw' : 'bk');
});

/* 鍵盤（電腦測試用） */
const KEYS = { w: 'fw', ArrowUp: 'fw', s: 'bk', ArrowDown: 'bk', a: 'sl', d: 'sr', q: 'tl', ArrowLeft: 'tl', e: 'tr', ArrowRight: 'tr', ' ': 'atk', f: 'pot', r: 'pot', z: 'wait' };
window.addEventListener('keydown', e => {
  const c = KEYS[e.key]; if (c) { e.preventDefault(); act(c); }
});

/* ---------- 渲染 ---------- */
function lightF(d, L) {
  let v = 1 - d / L;
  if (v < 0.05) v = 0.05;
  return Math.ceil(v * 7) / 7;   // 量化成色階，保留像素風
}

function render() {
  buf.fill(0xff050308);
  seen[G.p.y * MW + G.p.x] = 1;
  const sh = shake > 0 ? (Math.random() - 0.5) * shake * 0.01 : 0;
  const px = cam.x, py = cam.y, a = cam.a + sh;
  const dx = Math.cos(a), dy = Math.sin(a);
  const plx = -dy * 0.66, ply = dx * 0.66;
  const L = 7.2 + Math.sin(now * 0.006) * 0.25 + Math.sin(now * 0.017) * 0.15;  // 火把閃爍

  // 地板與天花板
  const rdx0 = dx - plx, rdy0 = dy - ply, rdx1 = dx + plx, rdy1 = dy + ply;
  for (let y = HALF + 1; y < H; y++) {
    const rowDist = HALF / (y - HALF);
    const sx = rowDist * (rdx1 - rdx0) / W, sy = rowDist * (rdy1 - rdy0) / W;
    let fx = px + rowDist * rdx0, fy = py + rowDist * rdy0;
    const f = lightF(rowDist, L), fc = f * 0.8;
    const yo = y * W, yc = (H - y - 1) * W;
    for (let x = 0; x < W; x++) {
      const tx = ((fx - Math.floor(fx)) * TEX) & 15, ty = ((fy - Math.floor(fy)) * TEX) & 15;
      fx += sx; fy += sy;
      const ti = ty * TEX + tx;
      buf[yo + x] = shade(floorTex[ti], f);
      buf[yc + x] = shade(ceilTex[ti], fc);
    }
  }

  // 牆壁
  for (let x = 0; x < W; x++) {
    const camX = 2 * x / W - 1;
    const rdx = dx + plx * camX, rdy = dy + ply * camX;
    let mx = Math.floor(px), my = Math.floor(py);
    const ddx = Math.abs(1 / rdx), ddy = Math.abs(1 / rdy);
    let stx, sty, sdx, sdy, side = 0;
    if (rdx < 0) { stx = -1; sdx = (px - mx) * ddx; } else { stx = 1; sdx = (mx + 1 - px) * ddx; }
    if (rdy < 0) { sty = -1; sdy = (py - my) * ddy; } else { sty = 1; sdy = (my + 1 - py) * ddy; }
    for (let n = 0; n < 80; n++) {
      if (sdx < sdy) { sdx += ddx; mx += stx; side = 0; } else { sdy += ddy; my += sty; side = 1; }
      if (mx < 0 || my < 0 || mx >= MW || my >= MH) break;
      if (Math.min(sdx, sdy) < 5.5) seen[my * MW + mx] = 1;
      if (map[my * MW + mx] === 1) break;
    }
    const perp = Math.max(0.05, side === 0 ? sdx - ddx : sdy - ddy);
    zbuf[x] = perp;
    const lineH = H / perp;
    const ds = Math.max(0, Math.floor(HALF - lineH / 2)), de = Math.min(H, Math.ceil(HALF + lineH / 2));
    let wx = side === 0 ? py + perp * rdy : px + perp * rdx; wx -= Math.floor(wx);
    let tx = Math.floor(wx * TEX) & 15;
    if ((side === 0 && rdx > 0) || (side === 1 && rdy < 0)) tx = 15 - tx;
    const f = lightF(perp, L) * (side ? 0.78 : 1);
    const step = TEX / lineH;
    let tp = (ds - HALF + lineH / 2) * step;
    for (let y = ds; y < de; y++) {
      buf[y * W + x] = shade(wallTex[((tp | 0) & 15) * TEX + tx], f);
      tp += step;
    }
  }

  // 精靈 (怪物、物品、傳送門)
  const sprites = [];
  sprites.push({ x: G.stairs.x + 0.5, y: G.stairs.y + 0.5, s: SPR.stairs, glow: true });
  for (const it of G.items) sprites.push({ x: it.x + 0.5, y: it.y + 0.5, s: SPR[it.kind], bob: it.kind === 'potion' ? 1 : 0 });
  for (const m of G.monsters) {
    const t = clamp((now - m.t0) / 150, 0, 1);
    sprites.push({
      x: m.fx + (m.x - m.fx) * t + 0.5, y: m.fy + (m.y - m.fy) * t + 0.5, s: SPR[m.type], m,
      scale: m.boss ? 1.25 : 1, fly: m.fly,
    });
  }
  const invDet = 1 / (plx * dy - dx * ply);
  for (const s of sprites) s.d = (s.x - px) ** 2 + (s.y - py) ** 2;
  sprites.sort((a, b) => b.d - a.d);
  for (const s of sprites) {
    const rx = s.x - px, ry = s.y - py;
    const tX = invDet * (dy * rx - dx * ry);
    const tY = invDet * (-ply * rx + plx * ry);
    if (tY <= 0.15) continue;
    const scrX = (W / 2) * (1 + tX / tY);
    const unit = H / tY;
    const size = unit * (s.scale || 1);
    let bottom = HALF + unit / 2;
    if (s.fly) bottom -= unit * (0.18 + Math.sin(now * 0.008 + s.x * 3) * 0.05);
    if (s.bob) bottom -= unit * Math.abs(Math.sin(now * 0.004)) * 0.05;
    const top = bottom - size, left = scrX - size / 2;
    const f = s.glow ? 1 : lightF(Math.sqrt(s.d), L + 0.5);
    const x0 = Math.max(0, Math.floor(left)), x1 = Math.min(W, Math.ceil(left + size));
    const y0 = Math.max(0, Math.floor(top)), y1 = Math.min(H, Math.ceil(bottom));
    const white = s.m && s.m.flash > 0.5;
    for (let x = x0; x < x1; x++) {
      if (tY >= zbuf[x]) continue;
      const tx = Math.floor((x - left) * TEX / size);
      if (tx < 0 || tx > 15) continue;
      for (let y = y0; y < y1; y++) {
        const ty = Math.floor((y - top) * TEX / size);
        if (ty < 0 || ty > 15) continue;
        const c = s.s[ty * TEX + tx];
        if (!c) continue;
        buf[y * W + x] = white ? 0xffffffff : shade(c, f);
      }
    }
    if (s.m) { s.m.sx = scrX; s.m.sy = top; s.m.vis = tY < zbuf[clamp(Math.floor(scrX), 0, W - 1)]; s.m.size = size; }
  }

  // 第一人稱武器
  const swingOff = swing > 0 ? Math.sin(swing * Math.PI) : 0;
  const bobY = anim && anim.kind === 'move' ? Math.abs(Math.sin((now - anim.t0) / anim.dur * Math.PI)) * 3 : 0;
  const wx0 = Math.round(W - 50 - swingOff * 28), wy0 = Math.round(H - 40 + bobY - swingOff * 16);
  const sw = SPR.sword;
  for (let ty = 0; ty < 16; ty++) for (let tx = 0; tx < 16; tx++) {
    const c = sw[ty * 16 + tx]; if (!c) continue;
    for (let yy = 0; yy < 3; yy++) for (let xx = 0; xx < 3; xx++) {
      const X = wx0 + tx * 3 + xx, Y = wy0 + ty * 3 + yy;
      if (X >= 0 && X < W && Y >= 0 && Y < H) buf[Y * W + X] = shade(c, 0.9);
    }
  }

  vctx.putImageData(img, 0, 0);

  // 怪物血條與傷害數字
  vctx.textAlign = 'center';
  vctx.font = 'bold 8px monospace';
  for (const m of G.monsters) {
    if (!m.vis || m.hp >= m.maxHp || m.size < 8) continue;
    const bw = Math.min(30, m.size * 0.6), bx = m.sx - bw / 2, by = Math.max(1, m.sy - 3);
    vctx.fillStyle = '#000'; vctx.fillRect(bx - 1, by - 1, bw + 2, 4);
    vctx.fillStyle = '#d03838'; vctx.fillRect(bx, by, bw * m.hp / m.maxHp, 2);
  }
  for (const pp of popups) {
    let x, y;
    if (pp.self) { x = W / 2; y = H / 2 + 20; }
    else if (pp.m && pp.m.sx !== undefined) { x = pp.m.sx; y = pp.m.sy + 6; }
    else continue;
    y -= pp.t * 18 + (pp.off || 0);
    vctx.globalAlpha = 1 - pp.t;
    vctx.fillStyle = '#000'; vctx.fillText(pp.text, x + 1, y + 1);
    vctx.fillStyle = pp.color; vctx.fillText(pp.text, x, y);
    vctx.globalAlpha = 1;
  }
  // 暗角
  const g = vctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
  vctx.fillStyle = g; vctx.fillRect(0, 0, W, H);
}

function renderMinimap() {
  const cs = 3, size = Math.max(MW, MH) * cs;
  if (mm.width !== size) { mm.width = size; mm.height = size; }
  mctx.fillStyle = '#08070c'; mctx.fillRect(0, 0, size, size);
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    if (!seen[y * MW + x]) continue;
    mctx.fillStyle = map[y * MW + x] ? '#5b4b8a' : '#221d30';
    mctx.fillRect(x * cs, y * cs, cs, cs);
  }
  for (const it of G.items) if (seen[it.y * MW + it.x]) {
    mctx.fillStyle = it.kind === 'potion' ? '#d03838' : it.kind === 'gold' ? '#f0c040' : '#b5793e';
    mctx.fillRect(it.x * cs + 1, it.y * cs + 1, 1, 1);
  }
  const p = G.p;
  for (const m of G.monsters) {
    if (Math.abs(m.x - p.x) + Math.abs(m.y - p.y) > 5 || !seen[m.y * MW + m.x]) continue;
    mctx.fillStyle = '#ff5050'; mctx.fillRect(m.x * cs, m.y * cs, cs, cs);
  }
  if (seen[G.stairs.y * MW + G.stairs.x]) { mctx.fillStyle = '#5ab8ff'; mctx.fillRect(G.stairs.x * cs, G.stairs.y * cs, cs, cs); }
  // 玩家（帶朝向）
  mctx.fillStyle = '#ffffff';
  mctx.fillRect(p.x * cs, p.y * cs, cs, cs);
  const [fdx, fdy] = DIRS[p.face];
  mctx.fillStyle = '#ffd76a';
  mctx.fillRect((p.x + fdx) * cs + 1, (p.y + fdy) * cs + 1, 1, 1);
}

/* ---------- 主迴圈 ---------- */
function frame(t) {
  const dt = Math.min(50, t - (lastT || t)); lastT = t; now = t;
  if (G) {
    if (anim) {
      const k = clamp((now - anim.t0) / anim.dur, 0, 1);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      if (anim.kind === 'move') { cam.x = anim.fx + (anim.tx - anim.fx) * e; cam.y = anim.fy + (anim.ty - anim.fy) * e; }
      else cam.a = anim.fa + (anim.ta - anim.fa) * e;
      if (k >= 1) {
        if (anim.kind === 'turn') cam.a = G.p.face * Math.PI / 2;
        anim = null;
        if (queued) { const q = queued; queued = null; act(q); }
      }
    }
    if (shake > 0) shake = Math.max(0, shake - dt * 0.03);
    if (swing > 0) swing = Math.max(0, swing - dt / 220);
    for (const m of G.monsters) if (m.flash > 0) m.flash -= dt / 160;
    for (const pp of popups) pp.t += dt / 700;
    popups = popups.filter(pp => pp.t < 1);
    render();
    renderMinimap();
  }
  requestAnimationFrame(frame);
}

/* 標題背景：先生成一層地圖當作展示 */
G = { floor: 0, p: { x: 0, y: 0, face: 0, mapper: false, hp: 1, maxHp: 1, xp: 0, next: 1, perks: {} }, monsters: [], items: [] };
nextFloor();
G.p.atk = 0; G.p.def = 0; G.p.crit = 0; G.p.gold = 0; G.p.kills = 0; G.p.potions = 0; G.p.lvl = 1;
updateHud();
document.getElementById('log').innerHTML = '';
showTitle();
requestAnimationFrame(frame);

// 給 Android 返回鍵使用
window.onAndroidBack = function () {
  if (state === 'stairs') { state = 'play'; hideOverlay(); return true; }
  return false;
};

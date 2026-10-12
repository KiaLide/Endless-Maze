'use strict';
/* =========================================================
 * Endless Maze 無盡迷宮
 * 第一人稱迷宮 Roguelike：每次選擇左／前／右 → 轉身、走一段路 → 遭遇怪物或事件
 * 10 次選擇為一層，樓層無上限
 * ========================================================= */
const DATA = window.GAME_DATA;
const W = 192, H = 240, TEX = 32, TM = TEX - 1;
const PROJ = (W / 2) / 0.66;              // 投影距離
const FP_DY = H - 144;                    // 第一人稱圖層（以 192×144 設計）往下對齊
const STEPS_PER_FLOOR = 10;
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];   // 東 南 西 北（y 向下）
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const chance = p => Math.random() < p;
const $ = id => document.getElementById(id);
const CLASS = Object.fromEntries(DATA.classes.map(c => [c.id, c]));
const EVI = Object.fromEntries(DATA.eventIcons.map((n, i) => [n, i]));

/* =========================================================
 * 圖片
 * ========================================================= */
const IMG = {};
function loadImg(key, src) {
  return new Promise(res => { const im = new Image(); im.onload = im.onerror = () => res(im); im.src = src; IMG[key] = im; });
}
/* 依距離變暗：預先做好 8 階亮度與受擊白光版本（不讀取像素，Android 本機檔案也能用） */
function shadedSet(im) {
  if (!im || !im.naturalWidth) return null;
  const mk = (fill, alpha) => {
    const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(im, 0, 0);
    if (alpha > 0) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = fill; g.globalAlpha = alpha; g.fillRect(0, 0, c.width, c.height); }
    return c;
  };
  const levels = [];
  for (let i = 0; i <= 7; i++) levels.push(mk('#050308', 1 - Math.max(0.1, i / 7)));
  return { w: im.naturalWidth, h: im.naturalHeight, levels, white: mk('#ffffff', 1) };
}
const ART = {};
const loading = Promise.all([
  ...DATA.classes.map(c => loadImg('fp_' + c.id, `assets/fp/${c.id}.png`)),
  ...DATA.monsterArt.map(id => loadImg('mon_' + id, `assets/monsters/${id}.png`).then(im => { ART[id] = shadedSet(im); })),
  loadImg('events', 'assets/events.png').then(im => { ART.events = shadedSet(im); }),
]);

/* =========================================================
 * 顏色與材質
 * ========================================================= */
function rgb(r, g, b) { return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0; }
function hex(h) { const n = parseInt(h.slice(1), 16); return rgb(n >> 16 & 255, n >> 8 & 255, n & 255); }
function shade(c, f) { return ((255 << 24) | (((c >> 16 & 255) * f) << 16) | (((c >> 8 & 255) * f) << 8) | ((c & 255) * f)) >>> 0; }
function vary(c, a) { return rgb(clamp((c & 255) + a, 0, 255), clamp((c >> 8 & 255) + a, 0, 255), clamp((c >> 16 & 255) + a, 0, 255)); }

const THEMES = [
  { name: '幽暗石窟', wall: ['#4a5068', '#565d7a', '#3e435a'], mortar: '#1e2030', floor: ['#3a3940', '#2e2d33'], ceil: ['#1a1922', '#211f2a'] },
  { name: '苔蘚地道', wall: ['#3f5a3a', '#4b6a44', '#344c30'], mortar: '#18241a', floor: ['#38402f', '#2c3326'], ceil: ['#141a12', '#1a2117'] },
  { name: '赤焰城塞', wall: ['#7a3328', '#8a3e30', '#652a21'], mortar: '#2a1210', floor: ['#4a3028', '#3a251f'], ceil: ['#1f0f0c', '#2a1410'] },
  { name: '紫晶深淵', wall: ['#4a2f6b', '#58397e', '#3c2658'], mortar: '#170e26', floor: ['#2f2840', '#251f33'], ceil: ['#120c1c', '#181024'] },
  { name: '白骨墓穴', wall: ['#8a8470', '#9a937c', '#76705e'], mortar: '#2e2a22', floor: ['#4a463c', '#3c382f'], ceil: ['#1c1a16', '#24211b'] },
];
let wallTex, floorTex, ceilTex;
function makeTextures(theme) {
  const T = TEX, wall = theme.wall.map(hex), mortar = hex(theme.mortar);
  const moss = theme.name === '苔蘚地道', bone = theme.name === '白骨墓穴';
  wallTex = new Uint32Array(T * T);
  for (let row = 0; row < 4; row++) {
    const off = (row & 1) * 8;
    for (let col = -1; col < 3; col++) {
      const x0 = col * 16 + off, y0 = row * 8, base = vary(wall[rnd(0, 2)], rnd(-8, 8));
      const crack = chance(0.3), cx = rnd(3, 12), cy = rnd(1, 5);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) {
        const X = (x0 + x + T) % T, Y = y0 + y;
        let c;
        if (y === 7 || x === 15) c = mortar;
        else {
          c = vary(base, rnd(-6, 6));
          if (y === 0 || x === 0) c = vary(c, 20); else if (y === 6 || x === 14) c = vary(c, -20);
          if (y === 1 && x > 0 && x < 14) c = vary(c, 8);
          if (chance(0.04)) c = vary(c, -16);
          if (crack && (x - cx === y - cy || x - cx === y - cy + 1) && y > 0 && y < 6) c = vary(base, -34);
          if (moss && y < 2 + ((x * 7) % 3) && chance(0.6)) c = vary(rgb(70, 120, 60), rnd(-15, 15));
          if (bone && chance(0.015)) c = rgb(220, 214, 196);
        }
        wallTex[Y * T + X] = c;
      }
    }
  }
  const fl = theme.floor.map(hex);
  floorTex = new Uint32Array(T * T);
  for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
    const base = vary(fl[(tx + ty) & 1], rnd(-6, 6));
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let c;
      if (x === 15 || y === 15) c = vary(base, -30);
      else { c = vary(base, rnd(-5, 5)); if (x === 0 || y === 0) c = vary(c, 12); else if (x === 14 || y === 14) c = vary(c, -14); if (chance(0.05)) c = vary(c, -12); }
      floorTex[(ty * 16 + y) * T + tx * 16 + x] = c;
    }
  }
  const ce = theme.ceil.map(hex);
  ceilTex = new Uint32Array(T * T);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    let c = vary(ce[(y >> 4) & 1], rnd(-4, 4));
    if (y % 16 === 15 || x % 32 === 31) c = vary(c, -12);
    if (y % 16 === 0) c = vary(c, 6);
    ceilTex[y * T + x] = c;
  }
}

/* 火把（程式繪製的小像素圖，兩格動畫） */
const TORCH = [0, 1].map(fr => {
  const c = document.createElement('canvas'); c.width = 12; c.height = 24; const g = c.getContext('2d');
  const px = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  px(4, 11, 4, 2, '#3a2a1a'); px(5, 13, 2, 9, '#6a4428'); px(5, 13, 1, 9, '#8a5a34'); px(3, 10, 6, 2, '#8a8a9a');
  const flm = fr ? [[5, 1, 2, 2], [4, 3, 4, 3], [3, 5, 6, 4], [4, 9, 4, 1]] : [[6, 0, 2, 3], [4, 3, 4, 3], [3, 5, 6, 4], [4, 9, 4, 1]];
  flm.forEach(([x, y, w, h], i) => px(x, y, w, h, ['#ffe080', '#ffb040', '#ff7020', '#c03a10'][i]));
  px(5, 6, 2, 3, '#fff6c0');
  return { w: 12, h: 24, levels: Array(8).fill(c), white: c };
});

/* =========================================================
 * 怪物（數值為暫定）
 * ========================================================= */
const MONSTERS = {
  slime_green: { name: '史萊姆', hp: 16, atk: 5, def: 0, xp: 4, gold: 4, minF: 1, size: 0.62 },
  bat_purple:  { name: '洞窟蝙蝠', hp: 12, atk: 6, def: 0, xp: 4, gold: 3, minF: 1, size: 0.62, fly: true },
  slime_blue:  { name: '冰晶史萊姆', hp: 24, atk: 7, def: 2, xp: 7, gold: 6, minF: 2, size: 0.66 },
  bat_red:     { name: '吸血蝙蝠', hp: 20, atk: 8, def: 1, xp: 8, gold: 6, minF: 3, size: 0.64, fly: true, drain: true },
  slime_red:   { name: '赤炎史萊姆', hp: 32, atk: 10, def: 3, xp: 11, gold: 9, minF: 4, size: 0.7 },
  bat_yellow:  { name: '雷鳴蝙蝠', hp: 28, atk: 12, def: 2, xp: 13, gold: 10, minF: 6, size: 0.66, fly: true },
  slime_dark:  { name: '暗影史萊姆', hp: 44, atk: 13, def: 5, xp: 17, gold: 13, minF: 8, size: 0.74 },
  bat_dark:    { name: '幽冥蝙蝠', hp: 38, atk: 16, def: 4, xp: 20, gold: 15, minF: 10, size: 0.7, fly: true },
  slime_gold:  { name: '黃金史萊姆', hp: 22, atk: 4, def: 8, xp: 25, gold: 80, minF: 2, size: 0.62, rare: true },
  slime_king:  { name: '史萊姆王', hp: 140, atk: 14, def: 4, xp: 70, gold: 60, minF: 99, size: 1.05, boss: true },
  bat_lord:    { name: '蝙蝠領主', hp: 120, atk: 18, def: 3, xp: 70, gold: 60, minF: 99, size: 1.0, fly: true, boss: true, drain: true },
};

/* =========================================================
 * 武器（數值暫定）
 * ========================================================= */
const weaponAtk = tier => Math.round(1 + tier * 2.4);
const weaponName = (cls, tier) => CLASS[cls].weapons[tier - 1];
function iconStyle(cls, tier, size = 64) {
  return `background-image:url(assets/icons/${cls}.png);background-size:${size * 20}px ${size}px;background-position:${-(tier - 1) * size}px 0;width:${size}px;height:${size}px`;
}
function setIcon(el, cls, tier, size = 64) { el.setAttribute('style', iconStyle(cls, tier, size)); }
const evStyle = (icon, size = 32) => `background-size:${DATA.eventIcons.length * size}px ${size}px;background-position:${-EVI[icon] * size}px 0;width:${size}px;height:${size}px`;

/* =========================================================
 * 道具
 * ========================================================= */
const ITEMS = {
  potion: { name: '回復藥水', icon: 'potion', desc: '回復生命' },
  bomb:   { name: '炸彈', icon: 'bomb', desc: '戰鬥中對敵人造成大量傷害' },
  knife:  { name: '飛刀', icon: 'knife', desc: '戰鬥中造成固定傷害，不消耗回合' },
  smoke:  { name: '煙霧彈', icon: 'smoke', desc: '從戰鬥中逃跑（頭目戰無效）' },
};

/* =========================================================
 * 隨機事件：好事 50／壞事 50，各分 普通 25・加重 15・非常 8・超級 2
 * ========================================================= */
const RANK = ['普通', '加重', '非常', '超級'];
const fl = () => G.floor;
const EVENTS = [
  // ---------- 好事・普通 ----------
  { g: 1, t: 0, icon: 'potion', title: '小藥瓶', text: '牆角躺著一瓶沒開封的藥水。', fx: () => item('potion', 1) },
  { g: 1, t: 0, icon: 'coins', title: '散落的金幣', text: '前一個冒險者掉了些零錢。', fx: () => gold(10 + fl() * 3) },
  { g: 1, t: 0, icon: 'fountain', title: '清澈的泉水', text: '冰涼的泉水讓你精神一振。', fx: () => heal(0.15) },
  { g: 1, t: 0, icon: 'fire', title: '營火餘燼', text: '你在溫暖的餘燼旁休息片刻。', fx: () => heal(0.1) + '，' + battleMod({ playerAtk: 1.1 }, '下一場戰鬥攻擊 +10%') },
  { g: 1, t: 0, icon: 'knife', title: '磨刀石', text: '你把武器磨得更鋒利了。', fx: () => buff('磨利', 'knife', 1, 3, { atkPct: 15 }) },
  { g: 1, t: 0, icon: 'shield', title: '舊皮甲碎片', text: '拿來補強護具剛剛好。', fx: () => stat('def', 1) },
  { g: 1, t: 0, icon: 'star', title: '四葉幸運草', text: '好運降臨在你身上。', fx: () => buff('幸運', 'star', 1, 3, { crit: 10 }) },
  { g: 1, t: 0, icon: 'scroll', title: '冒險者的筆記', text: '前人留下的戰鬥心得。', fx: () => xp(6 + fl() * 2) },
  { g: 1, t: 0, icon: 'heart', title: '野莓叢', text: '酸甜的野莓補充了體力。', fx: () => heal(0.08) },
  { g: 1, t: 0, icon: 'scroll', title: '乾淨的繃帶', text: '你重新包紮了傷口。', fx: () => cure(1) + '，' + heal(0.05) },
  { g: 1, t: 0, icon: 'coins', title: '小錢袋', text: '袋子裡叮噹作響。', fx: () => gold(20 + fl() * 4) },
  { g: 1, t: 0, icon: 'shield', title: '守護者石像', text: '向石像祈禱後，身體變得堅韌。', fx: () => buff('石之守護', 'shield', 1, 3, { def: 2 }) },
  { g: 1, t: 0, icon: 'star', title: '小精靈的祝福', text: '小精靈在你身邊轉了一圈。', fx: () => buff('身輕如燕', 'feather', 1, 3, { dodge: 10 }) },
  { g: 1, t: 0, icon: 'orb', title: '陳舊的護符', text: '護符上的符文微微發光。', fx: () => stat('crit', 2) },
  { g: 1, t: 0, icon: 'heart', title: '迷途的小黑貓', text: '小黑貓跟了你一段路，帶來好運。', fx: () => buff('招財', 'coins', 1, 3, { goldMult: 50 }) },
  { g: 1, t: 0, icon: 'smoke', title: '遺落的煙霧彈', text: '撿到一顆煙霧彈。', fx: () => item('smoke', 1) },
  { g: 1, t: 0, icon: 'knife', title: '投擲用飛刀', text: '一把平衡極佳的飛刀。', fx: () => item('knife', 2) },
  { g: 1, t: 0, icon: 'fire', title: '熱騰騰的湯', text: '有人在這裡留了一鍋湯。', fx: () => stat('maxHp', 3) + '，' + heal(0.05) },
  { g: 1, t: 0, icon: 'fountain', title: '小憩', text: '你靠著牆打了個盹。', fx: () => heal(0.12) },
  { g: 1, t: 0, icon: 'scroll', title: '牆上的地圖', text: '你找到一條捷徑。', fx: () => progress(1) },
  { g: 1, t: 0, icon: 'orb', title: '閃亮的寶石', text: '可以賣個好價錢。', fx: () => gold(30 + fl() * 3) },
  { g: 1, t: 0, icon: 'skull', title: '戰士的遺骸', text: '你從遺骸身上學到了一些教訓。', fx: () => xp(10 + fl() * 2) },
  { g: 1, t: 0, icon: 'fire', title: '驅魔香', text: '點燃後，周圍的怪物顯得虛弱。', fx: () => battleMod({ enemyHp: 0.85 }, '下一個敵人生命 -15%') },
  { g: 1, t: 0, icon: 'up', title: '古老的鍛造台', text: '你稍微調整了武器。', fx: () => stat('atk', 1) },
  { g: 1, t: 0, icon: 'fountain', title: '安全的角落', text: '一個沒有怪物的角落。', fx: () => heal(0.1) + '，' + cure(1) },
  // ---------- 好事・加重 ----------
  { g: 1, t: 1, icon: 'bigpotion', title: '大藥瓶', text: '一整瓶濃縮的回復藥。', fx: () => item('potion', 2) },
  { g: 1, t: 1, icon: 'chest', title: '寶箱', text: '寶箱裡裝滿了金幣。', fx: () => gold(50 + fl() * 6) },
  { g: 1, t: 1, icon: 'fountain', title: '治癒之泉', text: '泉水散發著柔和的光芒。', fx: () => heal(0.5) },
  { g: 1, t: 1, icon: 'fire', title: '戰神祭壇', text: '戰意從心底湧出。', fx: () => buff('戰神之怒', 'fire', 1, 5, { atkPct: 30 }) },
  { g: 1, t: 1, icon: 'shield', title: '鐵匠的饋贈', text: '路過的鐵匠幫你修好了護甲。', fx: () => stat('def', 2) },
  { g: 1, t: 1, icon: 'scroll', title: '秘傳卷軸', text: '記載著攻擊要害的訣竅。', fx: () => stat('crit', 5) },
  { g: 1, t: 1, icon: 'scroll', title: '經驗之書', text: '讀完後你感覺自己變強了。', fx: () => xp(30 + fl() * 5) },
  { g: 1, t: 1, icon: 'heart', title: '生命果實', text: '吃下後全身充滿活力。', fx: () => stat('maxHp', 10) },
  { g: 1, t: 1, icon: 'bomb', title: '火藥桶', text: '你做了兩顆炸彈。', fx: () => item('bomb', 2) },
  { g: 1, t: 1, icon: 'orb', title: '鷹眼藥劑', text: '視野變得異常清晰。', fx: () => buff('鷹眼', 'orb', 1, 5, { crit: 25 }) },
  { g: 1, t: 1, icon: 'shield', title: '守護結界', text: '一層光膜包覆著你，可擋下兩次攻擊。', fx: () => buff('結界', 'shield', 1, 4, { shield: 2 }) },
  { g: 1, t: 1, icon: 'fountain', title: '聖水', text: '聖水洗去了身上的污穢。', fx: () => cure(99) + '，' + heal(0.3) },
  { g: 1, t: 1, icon: 'hourglass', title: '秘密通道', text: '牆後藏著一條近路。', fx: () => progress(2) },
  { g: 1, t: 1, icon: 'coins', title: '流浪商人的禮物', text: '商人塞給你一些東西就走了。', fx: () => item('potion', 1) + '，' + gold(30 + fl() * 3) },
  { g: 1, t: 1, icon: 'up', title: '狩獵本能', text: '你的戰鬥直覺被喚醒了。', fx: () => buff('狩獵本能', 'up', 1, 5, { xpMult: 100 }) },
  // ---------- 好事・非常 ----------
  { g: 1, t: 2, icon: 'up', title: '武器強化', text: '神秘的工匠強化了你的武器。', fx: () => weapon(1) },
  { g: 1, t: 2, icon: 'feather', title: '不死鳥之羽', text: '倒下時會讓你復活一次。', fx: () => feather(1) },
  { g: 1, t: 2, icon: 'chest', title: '黃金寶箱', text: '閃閃發光的大寶箱！', fx: () => gold(150 + fl() * 10) + '，' + item('potion', 2) },
  { g: 1, t: 2, icon: 'star', title: '英雄的雕像', text: '英雄的意志注入你的身體。', fx: () => stat('atk', 4) + '，' + stat('def', 2) },
  { g: 1, t: 2, icon: 'heart', title: '女神的祝福', text: '溫暖的光芒籠罩全身。', fx: () => stat('maxHp', 15) + '，' + heal(1) },
  { g: 1, t: 2, icon: 'hourglass', title: '時之沙漏', text: '時間倒流，你瞬間前進了一大段。', fx: () => progress(3) },
  { g: 1, t: 2, icon: 'fire', title: '狂戰之血', text: '血液沸騰，力量暴增。', fx: () => buff('狂戰之血', 'fire', 1, 5, { atkPct: 60 }) },
  { g: 1, t: 2, icon: 'orb', title: '天賦啟示', text: '你領悟了新的能力。', fx: () => { G.p.pendingLv++; return '獲得一次天賦選擇'; } },
  // ---------- 好事・超級 ----------
  { g: 1, t: 3, icon: 'up', title: '傳說的鍛造師', text: '傳說中的鍛造師為你打造了更強的武器！', fx: () => weapon(2) },
  { g: 1, t: 3, icon: 'star', title: '神之寵愛', text: '神明眷顧了你。', fx: () => [stat('maxHp', 25), heal(1), stat('atk', 5), stat('def', 3), stat('crit', 5), feather(1)].join('，') },

  // ---------- 壞事・普通 ----------
  { g: 0, t: 0, icon: 'spikes', title: '絆倒', text: '你被石頭絆了一跤。', fx: () => hurt(0.05) },
  { g: 0, t: 0, icon: 'spikes', title: '小陷阱', text: '踩到了地板上的尖刺。', fx: () => hurt(0.08) },
  { g: 0, t: 0, icon: 'coins', title: '扒手', text: '錢袋似乎變輕了。', fx: () => loseGold(0.15) },
  { g: 0, t: 0, icon: 'poison', title: '毒蘑菇', text: '肚子餓的你吃錯了蘑菇。', fx: () => buff('中毒', 'poison', 0, 3, { poison: 4 }) },
  { g: 0, t: 0, icon: 'cloud', title: '刺骨冷風', text: '冷風讓你的手腳發僵。', fx: () => buff('凍僵', 'ice', 0, 3, { atkPct: -10 }) },
  { g: 0, t: 0, icon: 'cloud', title: '迷路', text: '你繞了一大圈又回到原處。', fx: () => progress(-1) },
  { g: 0, t: 0, icon: 'potion', title: '打翻藥水', text: '藥水瓶從包包裡滑了出去。', fx: () => G.p.items.potion > 0 ? item('potion', -1) : hurt(0.05) },
  { g: 0, t: 0, icon: 'poison', title: '腐臭沼澤', text: '泥濘拖慢了你的腳步。', fx: () => hurt(0.06) + '，' + buff('泥濘', 'cloud', 0, 3, { def: -1 }) },
  { g: 0, t: 0, icon: 'cloud', title: '疲勞', text: '連日的探索讓你疲憊不堪。', fx: () => buff('疲勞', 'cloud', 0, 3, { crit: -10 }) },
  { g: 0, t: 0, icon: 'cloud', title: '蜘蛛網', text: '你被黏住了，敵人會搶先攻擊。', fx: () => battleMod({ firstStrike: 1 }, '下一場戰鬥敵人先攻') },
  { g: 0, t: 0, icon: 'spikes', title: '碎石落下', text: '頭頂掉下了碎石。', fx: () => hurt(0.1) },
  { g: 0, t: 0, icon: 'skull', title: '不祥的烏鴉', text: '烏鴉的叫聲讓你運氣變差。', fx: () => buff('霉運', 'skull', 0, 3, { goldMult: -50 }) },
  { g: 0, t: 0, icon: 'poison', title: '霉味', text: '吸入了發霉的空氣。', fx: () => stat('maxHp', -2) },
  { g: 0, t: 0, icon: 'skull', title: '小小的詛咒', text: '你踩到了詛咒的符文。', fx: () => stat('atk', -1) },
  { g: 0, t: 0, icon: 'cloud', title: '濃霧', text: '霧氣讓你看不清敵人。', fx: () => buff('視線不清', 'cloud', 0, 3, { miss: 15 }) },
  { g: 0, t: 0, icon: 'spikes', title: '腐朽的地板', text: '地板塌了一角。', fx: () => hurt(0.07) },
  { g: 0, t: 0, icon: 'coins', title: '惡作劇精靈', text: '精靈偷走了一些金幣。', fx: () => loseGold(0.1) },
  { g: 0, t: 0, icon: 'ice', title: '寒氣', text: '寒氣滲入了護甲。', fx: () => buff('寒冷', 'ice', 0, 3, { def: -2 }) },
  { g: 0, t: 0, icon: 'spikes', title: '荊棘', text: '荊棘劃破了你的皮膚。', fx: () => hurt(0.09) },
  { g: 0, t: 0, icon: 'cloud', title: '失眠', text: '你一直睡不好，回復效果減半。', fx: () => buff('失眠', 'cloud', 0, 3, { healMult: -50 }) },
  { g: 0, t: 0, icon: 'knife', title: '鏽蝕', text: '武器表面長出了鏽斑。', fx: () => battleMod({ playerAtk: 0.8 }, '下一場戰鬥攻擊 -20%') },
  { g: 0, t: 0, icon: 'skull', title: '突襲', text: '一隻怪物從暗處撲了過來！', fx: () => ambush(1, 1) },
  { g: 0, t: 0, icon: 'poison', title: '惡臭', text: '臭味讓你無法專心。', fx: () => buff('作嘔', 'poison', 0, 2, { atkPct: -5 }) },
  { g: 0, t: 0, icon: 'smoke', title: '包包破洞', text: '有東西從破洞掉出去了。', fx: () => loseItem() },
  { g: 0, t: 0, icon: 'skull', title: '噩夢', text: '噩夢讓你忘記了一些事。', fx: () => { const v = Math.floor(G.p.xp * 0.3); G.p.xp -= v; return `失去 ${v} 經驗`; } },
  // ---------- 壞事・加重 ----------
  { g: 0, t: 1, icon: 'spikes', title: '大型陷阱', text: '巨大的尖刺從地面竄出！', fx: () => hurt(0.2) },
  { g: 0, t: 1, icon: 'coins', title: '強盜', text: '一群強盜搶走了你的錢。', fx: () => loseGold(0.4) },
  { g: 0, t: 1, icon: 'poison', title: '劇毒孢子', text: '空氣中瀰漫著毒孢子。', fx: () => buff('劇毒', 'poison', 0, 5, { poison: 6 }) },
  { g: 0, t: 1, icon: 'skull', title: '詛咒之霧', text: '黑色的霧氣纏繞全身。', fx: () => buff('詛咒', 'skull', 0, 5, { atkPct: -30 }) },
  { g: 0, t: 1, icon: 'shield', title: '碎甲', text: '護甲被腐蝕了。', fx: () => stat('def', -2) },
  { g: 0, t: 1, icon: 'skull', title: '怪物巢穴', text: '你闖進了強化怪物的巢穴！', fx: () => ambush(1.5, 1.2) },
  { g: 0, t: 1, icon: 'cloud', title: '迷宮變動', text: '牆壁移動了，你被送回後方。', fx: () => progress(-2) },
  { g: 0, t: 1, icon: 'potion', title: '藥水變質', text: '藥水全都變得混濁。', fx: () => G.p.items.potion > 0 ? item('potion', -Math.min(2, G.p.items.potion)) : hurt(0.1) },
  { g: 0, t: 1, icon: 'skull', title: '衰弱詛咒', text: '生命力被吸走了。', fx: () => stat('maxHp', -8) },
  { g: 0, t: 1, icon: 'orb', title: '石化之眼', text: '你被凝視，下一場戰鬥身體僵硬。', fx: () => battleMod({ firstStrike: 2 }, '下一場戰鬥敵人先攻兩次') },
  { g: 0, t: 1, icon: 'spikes', title: '落石', text: '天花板崩落了！', fx: () => hurt(0.25) },
  { g: 0, t: 1, icon: 'knife', title: '鏽蝕之雨', text: '酸雨腐蝕了武器。', fx: () => stat('atk', -2) },
  { g: 0, t: 1, icon: 'skull', title: '恐懼', text: '莫名的恐懼攫住了你。', fx: () => buff('恐懼', 'skull', 0, 5, { crit: -30, dodge: -10 }) },
  { g: 0, t: 1, icon: 'cloud', title: '暗之帳幕', text: '你幾乎看不見任何東西。', fx: () => buff('失明', 'cloud', 0, 5, { miss: 30 }) },
  { g: 0, t: 1, icon: 'orb', title: '魔力乾涸', text: '身上的祝福全部消散了。', fx: () => dispel() + '，' + hurt(0.1) },
  // ---------- 壞事・非常 ----------
  { g: 0, t: 2, icon: 'knife', title: '武器損壞', text: '武器在撞擊中崩了一角。', fx: () => weapon(-1) },
  { g: 0, t: 2, icon: 'spikes', title: '致命陷阱', text: '你掉進了深坑！', fx: () => hurt(0.4) },
  { g: 0, t: 2, icon: 'skull', title: '惡魔契約', text: '不知不覺間你簽下了契約。', fx: () => stat('maxHp', -15) },
  { g: 0, t: 2, icon: 'skull', title: '精英伏擊', text: '強大的精英怪物擋住了去路！', fx: () => ambush(2, 1.5, true) },
  { g: 0, t: 2, icon: 'coins', title: '大盜', text: '傳說中的大盜把你洗劫一空。', fx: () => loseGold(0.8) + '，' + loseAllItems() },
  { g: 0, t: 2, icon: 'skull', title: '深淵詛咒', text: '深淵的力量侵蝕著你。', fx: () => stat('atk', -4) + '，' + stat('def', -2) },
  { g: 0, t: 2, icon: 'poison', title: '瘟疫', text: '你染上了瘟疫。', fx: () => buff('瘟疫', 'poison', 0, 8, { poison: 8 }) },
  { g: 0, t: 2, icon: 'hourglass', title: '空間扭曲', text: '空間扭曲，你回到了這層的起點。', fx: () => progress(-99) },
  // ---------- 壞事・超級 ----------
  { g: 0, t: 3, icon: 'knife', title: '武器碎裂', text: '武器發出刺耳的聲響，碎成兩半。', fx: () => weapon(-2) },
  { g: 0, t: 3, icon: 'skull', title: '死神的凝視', text: '死神從黑暗中看著你……', fx: () => { G.p.hp = 1; return '生命降為 1，' + dispel() + '，' + buff('死亡印記', 'skull', 0, 10, { atkPct: -30 }); } },
];

/* ---------- 事件效果 ---------- */
function stat2(k) { return G.p.buffs.reduce((s, b) => s + (b.mods[k] || 0), 0); }
function heal(pct) {
  const p = G.p, m = 1 + stat2('healMult') / 100;
  const v = Math.max(0, Math.min(p.maxHp - p.hp, Math.round(p.maxHp * pct * m)));
  p.hp += v; if (v) SFX.heal(); return v ? `回復 ${v} 生命` : '生命已經是滿的';
}
function hurt(pct) { const p = G.p, v = Math.max(1, Math.round(p.maxHp * pct)); p.hp = Math.max(1, p.hp - v); flash('#ff2020'); shake = 6; SFX.hurt(); return `受到 ${v} 傷害`; }
function gold(v) { const p = G.p; v = Math.round(v * (1 + stat2('goldMult') / 100) * (p.greed ? 1.5 : 1)); p.gold += v; return `獲得 ${v} 金幣`; }
function loseGold(pct) { const p = G.p, v = Math.floor(p.gold * pct); p.gold -= v; return v ? `失去 ${v} 金幣` : '幸好身上沒什麼錢'; }
function xp(v) { const n = Math.round(v * (1 + stat2('xpMult') / 100)); gainXp(n); return `獲得 ${n} 經驗`; }
function item(k, n) { const p = G.p; p.items[k] = Math.max(0, p.items[k] + n); return `${ITEMS[k].name} ${n >= 0 ? '+' : ''}${n}`; }
function loseItem() { const p = G.p, ks = Object.keys(p.items).filter(k => p.items[k] > 0); if (!ks.length) return '幸好包包是空的'; return item(pick(ks), -1); }
function loseAllItems() { for (const k in G.p.items) G.p.items[k] = 0; return '失去所有道具'; }
function feather(n) { G.p.feather += n; return `不死鳥之羽 +${n}`; }
const STATN = { atk: '攻擊', def: '防禦', crit: '爆擊率', maxHp: '最大生命' };
function stat(k, v) {
  const p = G.p; p[k] = Math.max(k === 'maxHp' ? 10 : k === 'atk' ? 1 : 0, p[k] + v);
  if (k === 'maxHp') p.hp = clamp(p.hp + Math.max(0, v), 1, p.maxHp);
  return `${STATN[k]} ${v >= 0 ? '+' : ''}${v}${k === 'crit' ? '%' : ''}`;
}
function weapon(d) {
  const p = G.p, nt = clamp(p.weapon + d, 1, 20);
  if (nt === p.weapon) return d > 0 ? '武器已是最高階' : '武器已是最低階';
  p.weapon = nt; return `武器${d > 0 ? '升' : '降'}為「${weaponName(G.cls, nt)}」（${nt} 階）`;
}
function progress(d) {
  const before = G.step; G.step = clamp(G.step + d, 0, STEPS_PER_FLOOR - 1);
  const v = G.step - before; return v === 0 ? '進度沒有變化' : v > 0 ? `前進 ${v} 步` : `進度退回 ${-v} 步`;
}
function buff(name, icon, good, steps, mods) {
  const p = G.p, ex = p.buffs.find(b => b.name === name);
  if (ex) ex.steps = Math.max(ex.steps, steps); else p.buffs.push({ name, icon, good, steps, mods: { ...mods } });
  return `${good ? '獲得' : '陷入'}「${name}」${steps} 步`;
}
function cure(n) { const p = G.p, bad = p.buffs.filter(b => !b.good).slice(0, n); p.buffs = p.buffs.filter(b => !bad.includes(b)); return bad.length ? `解除 ${bad.map(b => b.name).join('、')}` : '身體狀況良好'; }
function dispel() { const p = G.p, n = p.buffs.filter(b => b.good).length; p.buffs = p.buffs.filter(b => !b.good); return n ? '失去所有增益' : '沒有增益可失去'; }
function battleMod(mod, text) { Object.assign(G.p.nextBattle, mod); return text; }
function ambush(hpM, atkM, elite) { G.pendingAmbush = { hpM, atkM, elite }; return elite ? '精英怪物出現了！' : '怪物出現了！'; }

/* ---------- 天賦 ---------- */
const PERKS = [
  { id: 'hp', t: '強健體魄', d: '最大生命 +12，並回復 12', w: 3, f: p => { p.maxHp += 12; p.hp += 12; } },
  { id: 'atk', t: '磨利武器', d: '攻擊力 +3', w: 3, f: p => { p.atk += 3; } },
  { id: 'def', t: '鐵壁', d: '防禦力 +2', w: 3, f: p => { p.def += 2; } },
  { id: 'crit', t: '鷹眼', d: '爆擊率 +8%', w: 3, f: p => { p.crit += 8; } },
  { id: 'critd', t: '致命一擊', d: '爆擊傷害 +50%', w: 2, r: 'rare', f: p => { p.critDmg += 0.5; } },
  { id: 'steal', t: '吸血', d: '造成傷害的 12% 轉為生命', w: 2, r: 'rare', max: 3, f: p => { p.steal += 0.12; } },
  { id: 'thorns', t: '荊棘護甲', d: '被攻擊時反彈 4 點傷害', w: 2, r: 'rare', f: p => { p.thorns += 4; } },
  { id: 'dodge', t: '殘影步', d: '閃避率 +8%', w: 2, r: 'rare', max: 4, f: p => { p.dodge += 8; } },
  { id: 'regen', t: '再生', d: '每次選擇路線回復 3% 生命', w: 2, r: 'rare', max: 3, f: p => { p.regen += 3; } },
  { id: 'potion', t: '藥劑師', d: '藥水效果 +50%，並獲得 1 瓶藥水', w: 2, f: p => { p.potionPow = Math.round(p.potionPow * 1.5); p.items.potion++; } },
  { id: 'double', t: '連擊', d: '15% 機率連續攻擊兩次', w: 1, r: 'epic', max: 2, f: p => { p.double += 15; } },
  { id: 'greed', t: '貪婪', d: '金幣獲得 +50%', w: 1, r: 'epic', max: 1, f: p => { p.greed = true; } },
  { id: 'lucky', t: '幸運星', d: '遇到好事件的機率提高（50% → 65%）', w: 1, r: 'epic', max: 1, f: p => { p.lucky = true; } },
];

/* =========================================================
 * 狀態
 * ========================================================= */
let state = 'title';     // title | name | select | play | dead
let phase = 'choose';    // choose | moving | battle | event | modal
let G = null;
const cam = { x: 16.5, y: 16.5, a: 0 };
let animQ = [], anim = null, shake = 0, swing = 0, punchSide = 1, popups = [], now = 0, lastT = 0, walkPhase = 0;
let world = null, horizon = H / 2;
let profile = { name: '', cls: 'swordsman', sex: 'M' };

function loadBest() { try { return JSON.parse(localStorage.getItem('em_best2') || 'null'); } catch (e) { return null; } }
function saveBest() {
  const b = loadBest(), score = G.floor * 100 + G.step;
  if (!b || score > b.score) { try { localStorage.setItem('em_best2', JSON.stringify({ score, floor: G.floor, step: G.step, name: G.name })); } catch (e) { } return true; }
  return false;
}

/* =========================================================
 * 局部地圖：每個路口有 左／前／右 三條岔路，選擇後延伸成走廊並接到下一個路口
 * ========================================================= */
const MS = 33, MC = 16;
/* 玩家站在路口前一格，才看得到左右兩側的岔路 */
function standPos(face) { const [dx, dy] = DIRS[face]; return [MC + 0.5 - dx, MC + 0.5 - dy]; }
function newWorld() { return { map: new Uint8Array(MS * MS).fill(1), MW: MS, MH: MS, sprites: [] }; }
function carve(w, x, y) { if (x > 0 && y > 0 && x < MS - 1 && y < MS - 1) w.map[y * MS + x] = 0; }
function carveArm(w, x, y, dir, len) { const [dx, dy] = DIRS[dir]; for (let i = 1; i <= len; i++) carve(w, x + dx * i, y + dy * i); }
function addDecor(w, x, y, dir, len) {
  // 走廊兩側牆上的火把，與地上偶爾出現的骷髏
  const [dx, dy] = DIRS[dir], px = -dy, py = dx;
  for (let i = 1; i <= len; i++) {
    const cx = x + dx * i, cy = y + dy * i;
    if (chance(0.5)) {
      const s = chance(0.5) ? 1 : -1;
      if (w.map[(cy + py * s) * MS + cx + px * s] === 1) w.sprites.push({ kind: 'torch', x: cx + 0.5 + px * s * 0.44, y: cy + 0.5 + py * s * 0.44 });
    }
    if (chance(0.12)) { const s = chance(0.5) ? 0.3 : -0.3; w.sprites.push({ kind: 'deco', icon: 'skull', x: cx + 0.5 + px * s, y: cy + 0.5 + py * s, size: 0.2 }); }
  }
}
/* 以路口 (MC,MC) 為中心、面向 face：後方走廊 + 左前右三條岔路；chosen 那條延伸 len 格並在終點再開三條岔路 */
function buildJunction(face, chosen, len) {
  const w = newWorld();
  carve(w, MC, MC);
  carveArm(w, MC, MC, (face + 2) % 4, 6);
  for (const d of [-1, 0, 1]) {
    const dir = (face + d + 4) % 4;
    if (chosen === d) {
      carveArm(w, MC, MC, dir, len);
      const [dx, dy] = DIRS[dir], ex = MC + dx * len, ey = MC + dy * len;
      for (const e of [-1, 0, 1]) carveArm(w, ex, ey, (dir + e + 4) % 4, 2);
    } else carveArm(w, MC, MC, dir, 2);
  }
  // 裝飾在挖完所有通道後才放，確保火把貼著牆
  addDecor(w, MC, MC, (face + 2) % 4, 6);
  if (chosen !== null) addDecor(w, MC, MC, (face + chosen + 4) % 4, len);
  return w;
}

/* =========================================================
 * 新遊戲 / 樓層
 * ========================================================= */
function newGame() {
  const c = CLASS[profile.cls];
  G = {
    name: profile.name, cls: c.id, floor: 1, step: 0, face: 3, totalSteps: 0, pendingAmbush: null, enemy: null, busy: false,
    p: { hp: c.hp, maxHp: c.hp, atk: c.atk, def: c.def_, crit: c.crit, critDmg: 2, potionPow: 14 * (c.id === 'cleric' ? 2 : 1),
      lvl: 1, xp: 0, next: 12, gold: 0, kills: 0, steal: c.id === 'witch' ? 0.1 : 0, thorns: 0,
      dodge: c.id === 'ranger' ? 10 : c.id === 'rogue' ? 6 : 0, regen: 0, double: c.id === 'monk' ? 20 : c.id === 'fencer' ? 10 : 0,
      greed: false, lucky: false, perks: {}, pendingLv: 0, weapon: 1, feather: 0,
      items: { potion: 2, bomb: 0, knife: 1, smoke: 1 }, buffs: [], nextBattle: {} },
  };
  G.theme = THEMES[0]; makeTextures(G.theme);
  world = buildJunction(G.face, null, 0);
  [cam.x, cam.y] = standPos(G.face); cam.a = G.face * Math.PI / 2;
  animQ = []; anim = null; popups = [];
  $('log').innerHTML = '';
  showScreen('game'); state = 'play';
  log(`<span class="c-gold">${G.name}</span>（${c.name}）踏入了無盡迷宮……`);
  showBanner('地下 1 層・' + G.theme.name);
  setPhase('choose');
  const hint = $('swipe-hint'); hint.classList.remove('hide'); setTimeout(() => hint.classList.add('hide'), 4500);
}

function nextFloor() {
  G.floor++; G.step = 0;
  G.theme = THEMES[Math.floor((G.floor - 1) / 3) % THEMES.length]; makeTextures(G.theme);
  const p = G.p; p.hp = Math.min(p.maxHp, p.hp + Math.ceil(p.maxHp * 0.15));
  SFX.portal(); flash('#8a6aff');
  log(`<span class="c-purple">— 地下 ${G.floor} 層・${G.theme.name} —</span>`);
  showBanner(`地下 ${G.floor} 層・${G.theme.name}`);
  if (G.floor % 5 === 0) log('<span class="c-red">這一層的最深處有頭目坐鎮……</span>');
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
  step: () => beep(80 + Math.random() * 20, 0.06, 'triangle', 0.035), turn: () => beep(200, 0.08, 'triangle', 0.02, -80),
  swing: () => beep(500, 0.08, 'sawtooth', 0.025, -350), hit: () => beep(180, 0.1, 'square', 0.05, -100),
  crit: () => { beep(880, 0.06); setTimeout(() => beep(1320, 0.1, 'square', 0.04), 50); },
  hurt: () => beep(120, 0.2, 'sawtooth', 0.06, -60),
  heal: () => beep(440, 0.1, 'sine', 0.06, 300), ui: () => beep(700, 0.05),
  good: () => [523, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.1, 'square', 0.035), i * 70)),
  bad: () => [300, 220].forEach((f, i) => setTimeout(() => beep(f, 0.18, 'sawtooth', 0.04), i * 120)),
  encounter: () => [220, 330, 220].forEach((f, i) => setTimeout(() => beep(f, 0.1, 'square', 0.045), i * 90)),
  level: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.12, 'square', 0.04), i * 90)),
  portal: () => beep(200, 0.6, 'sine', 0.06, 600), boom: () => beep(90, 0.35, 'sawtooth', 0.08, -60),
  die: () => [300, 220, 160, 100].forEach((f, i) => setTimeout(() => beep(f, 0.25, 'sawtooth', 0.05), i * 180)),
};

/* =========================================================
 * 訊息 / 特效
 * ========================================================= */
function log(html) { const el = $('log'), d = document.createElement('div'); d.innerHTML = html; el.appendChild(d); while (el.children.length > 3) el.removeChild(el.firstChild); }
function flash(color) { const f = $('flash'); f.style.transition = 'none'; f.style.background = color; f.style.opacity = '0.45'; requestAnimationFrame(() => { f.style.transition = 'opacity .3s'; f.style.opacity = '0'; }); }
let bannerT = 0;
function showBanner(text) { const b = $('banner'); b.textContent = text; b.hidden = false; clearTimeout(bannerT); bannerT = setTimeout(() => { b.hidden = true; }, 1600); }

/* =========================================================
 * 流程
 * ========================================================= */
function setPhase(ph) {
  phase = ph;
  $('choice').hidden = !(ph === 'choose' && state === 'play');
  $('enemy-bar').hidden = ph !== 'battle';
  updateHud();
}

function act(cmd) {
  if (state !== 'play') return;
  if (cmd in ITEMS) return useItem(cmd);
  if (phase === 'choose') {
    if (cmd === 'fw') choose(0); else if (cmd === 'left') choose(-1); else if (cmd === 'right') choose(1);
    else if (cmd === 'back') log('<span class="c-red">迷宮中無法後退！</span>');
  } else if (phase === 'battle') {
    if (cmd === 'atk') playerAttack();
    else if (['fw', 'left', 'right', 'back'].includes(cmd)) log('戰鬥中無法移動！點擊畫面攻擊。');
  }
}

/* 選擇路線：轉身 → 走一段 → 遭遇 */
function choose(d) {
  const len = rnd(2, 4);
  world = buildJunction(G.face, d, len);
  const nf = (G.face + d + 4) % 4;
  setPhase('moving');
  tickBuffs();
  if (state !== 'play') return;
  queueWalk(G.face, d, len, 340);
  animQ.push({ kind: 'call', fn: () => arrive(nf) });
  G.face = nf;
}

/* 走進路口 → 轉身 → 沿新方向走到下一個路口前一格 */
function queueWalk(face, d, len, dur) {
  const [fx, fy] = DIRS[face], [sx, sy] = standPos(face);
  animQ.push({ kind: 'move', dur, fx: sx, fy: sy, tx: MC + 0.5, ty: MC + 0.5 });
  if (d !== 0) { animQ.push({ kind: 'turn', dur: dur, fa: face * Math.PI / 2, ta: face * Math.PI / 2 + d * Math.PI / 2 }); if (state === 'play') SFX.turn(); }
  const [dx, dy] = DIRS[(face + d + 4) % 4];
  for (let i = 0; i < len - 1; i++) animQ.push({ kind: 'move', dur, fx: MC + 0.5 + dx * i, fy: MC + 0.5 + dy * i, tx: MC + 0.5 + dx * (i + 1), ty: MC + 0.5 + dy * (i + 1) });
}

function arrive(face) {
  // 走到下一個路口前：以新路口為中心重建地圖（畫面不變）
  world = buildJunction(face, null, 0);
  [cam.x, cam.y] = standPos(face); cam.a = face * Math.PI / 2;
  G.step++; G.totalSteps++;
  if (G.step >= STEPS_PER_FLOOR && G.floor % 5 === 0) return startBattle(G.floor % 10 === 0 ? 'bat_lord' : 'slime_king');
  if (chance(0.5)) startBattle(); else startEvent();
}

function afterEncounter() {
  if (state !== 'play') return;
  if (G.pendingAmbush) { const a = G.pendingAmbush; G.pendingAmbush = null; return startBattle(null, a); }
  if (G.p.pendingLv > 0) return showPerks();
  if (G.step >= STEPS_PER_FLOOR) nextFloor();
  setPhase('choose');
}

/* ---------- 每步結算增益／減益 ---------- */
function tickBuffs() {
  const p = G.p;
  if (p.regen) p.hp = Math.min(p.maxHp, p.hp + Math.ceil(p.maxHp * p.regen / 100));
  const poison = stat2('poison');
  if (poison > 0) {
    const v = Math.max(1, Math.round(p.maxHp * poison / 100)); p.hp -= v;
    log(`<span class="c-green">毒素</span>侵蝕身體，受到 <span class="c-red">${v}</span> 傷害。`);
    if (p.hp <= 0) { p.hp = 0; die(); if (state !== 'play') return; }
  }
  for (const b of p.buffs) b.steps--;
  const gone = p.buffs.filter(b => b.steps <= 0);
  p.buffs = p.buffs.filter(b => b.steps > 0);
  if (gone.length) log(`${gone.map(b => '「' + b.name + '」').join('')}的效果結束了。`);
  updateHud();
}

/* =========================================================
 * 戰鬥（回合制：點擊攻擊 → 敵人反擊）
 * ========================================================= */
function pickMonster() {
  const f = G.floor;
  if (f >= 2 && chance(0.06)) return 'slime_gold';
  const pool = Object.keys(MONSTERS).filter(k => !MONSTERS[k].boss && !MONSTERS[k].rare && MONSTERS[k].minF <= f);
  pool.sort((a, b) => MONSTERS[b].minF - MONSTERS[a].minF);
  return chance(0.55) ? pick(pool.slice(0, 2)) : pick(pool);
}
function startBattle(id, mod = {}) {
  id = id || pickMonster();
  const b = MONSTERS[id], f = G.floor, s = 1 + (f - 1) * 0.2, nb = G.p.nextBattle;
  const e = {
    id, name: (mod.elite ? '精英・' : '') + b.name, boss: !!b.boss, fly: !!b.fly, drain: !!b.drain, size: b.size * (mod.elite ? 1.15 : 1),
    maxHp: Math.round(b.hp * s * (mod.hpM || 1) * (nb.enemyHp || 1)), atk: Math.round(b.atk * (1 + (f - 1) * 0.16) * (mod.atkM || 1)),
    def: b.def + Math.floor((f - 1) / 3), xp: Math.round(b.xp * (1 + (f - 1) * 0.2) * (mod.elite ? 2 : 1)), gold: Math.round(b.gold * (1 + (f - 1) * 0.2)),
    flash: 0, appear: now, dead: 0,
  };
  e.hp = e.maxHp;
  G.enemy = e; G.battleAtk = nb.playerAtk || 1;
  const first = nb.firstStrike || 0;
  G.p.nextBattle = {};
  const [dx, dy] = DIRS[G.face];
  world.sprites.push({ kind: 'enemy', e, x: MC + 0.5 + dx * 0.25, y: MC + 0.5 + dy * 0.25 });
  setPhase('battle'); SFX.encounter();
  $('en-name').textContent = e.name + (e.boss ? '（頭目）' : '');
  updateEnemyBar();
  log(`<span class="c-red">${e.name}</span> 出現了！`);
  showBanner(e.boss ? '⚠ 頭目戰 ⚠' : '遭遇敵人！');
  if (first > 0) { G.busy = true; setTimeout(() => { for (let i = 0; i < first; i++) enemyAttack(); if (state === 'play') G.busy = false; }, 600); }
}
function updateEnemyBar() { const e = G.enemy; if (e) $('en-hp').style.width = (100 * Math.max(0, e.hp) / e.maxHp) + '%'; }
function playerAtkVal() { return Math.max(1, Math.round((G.p.atk + weaponAtk(G.p.weapon)) * (1 + stat2('atkPct') / 100))); }

function playerAttack() {
  const e = G.enemy, p = G.p;
  if (!e || G.busy || e.hp <= 0) return;
  G.busy = true; swing = 1; punchSide = -punchSide;
  if (chance(stat2('miss') / 100)) { SFX.swing(); popups.push({ e, text: 'MISS', color: '#9a9aaa', t: 0 }); log('攻擊落空了！'); }
  else {
    const hits = chance(p.double / 100) ? 2 : 1;
    for (let i = 0; i < hits && e.hp > 0; i++) {
      const crit = chance(Math.min(100, p.crit + stat2('crit')) / 100);
      let dmg = Math.max(1, Math.round(playerAtkVal() * G.battleAtk) + rnd(-2, 2) - e.def);
      if (crit) dmg = Math.round(dmg * p.critDmg);
      e.hp -= dmg; e.flash = 1;
      popups.push({ e, text: (crit ? '爆擊 ' : '') + dmg, color: crit ? '#ffd76a' : '#ffffff', t: 0, off: i * 10 });
      crit ? SFX.crit() : SFX.hit();
      if (p.steal) p.hp = Math.min(p.maxHp, p.hp + Math.max(1, Math.round(dmg * p.steal)));
      if (i === 1) log('<span class="c-purple">連擊！</span>');
    }
  }
  updateEnemyBar(); updateHud();
  if (e.hp <= 0) return setTimeout(winBattle, 300);
  setTimeout(() => { enemyAttack(); if (state === 'play' && G.enemy === e) G.busy = false; }, 420);
}

function enemyAttack() {
  const e = G.enemy, p = G.p;
  if (!e || e.hp <= 0 || state !== 'play') return;
  e.lunge = now;
  if (chance(Math.min(60, p.dodge + stat2('dodge')) / 100)) { popups.push({ self: true, text: 'MISS', color: '#7ab8ff', t: 0 }); log(`閃避了 ${e.name} 的攻擊！`); return; }
  const shieldB = p.buffs.find(b => b.mods.shield);
  if (shieldB) { shieldB.mods.shield--; if (shieldB.mods.shield <= 0) p.buffs = p.buffs.filter(b => b !== shieldB); log('結界擋下了攻擊！'); popups.push({ self: true, text: 'BLOCK', color: '#7ab8ff', t: 0 }); updateHud(); return; }
  const dmg = Math.max(1, e.atk + rnd(-1, 2) - (p.def + stat2('def')));
  p.hp -= dmg; shake = 7; SFX.hurt(); flash('#ff2020');
  popups.push({ self: true, text: '-' + dmg, color: '#ff6060', t: 0 });
  if (e.drain) e.hp = Math.min(e.maxHp, e.hp + Math.ceil(dmg * 0.3));
  if (p.thorns) { e.hp -= p.thorns; e.flash = 1; }
  updateEnemyBar(); updateHud();
  if (p.hp <= 0) return die();
  if (e.hp <= 0) setTimeout(winBattle, 300);
}

function winBattle() {
  const e = G.enemy, p = G.p;
  if (!e || e.dead) return;
  e.dead = now; p.kills++;
  const g = Math.round(e.gold * (1 + stat2('goldMult') / 100) * (p.greed ? 1.5 : 1));
  const x = Math.round(e.xp * (1 + stat2('xpMult') / 100));
  p.gold += g;
  log(`擊敗了 <span class="c-red">${e.name}</span>！獲得 ${x} 經驗、<span class="c-gold">${g} 金幣</span>。`);
  gainXp(x);
  setTimeout(() => {
    G.enemy = null; G.busy = false;
    world.sprites = world.sprites.filter(s => s.kind !== 'enemy');
    setPhase('modal');
    if (e.boss || chance(0.1)) return offerWeapon(clamp(G.floor + rnd(0, 2) + (e.boss ? 1 : 0), 1, 20));
    if (chance(0.15)) { const k = pick(['potion', 'potion', 'bomb', 'knife', 'smoke']); p.items[k]++; log(`敵人掉落了 <span class="c-green">${ITEMS[k].name}</span>。`); }
    afterEncounter();
  }, 650);
}

function gainXp(v) {
  const p = G.p; p.xp += v;
  while (p.xp >= p.next) {
    p.xp -= p.next; p.lvl++; p.next = Math.round(p.next * 1.4 + 6);
    p.maxHp += 6; p.hp = Math.min(p.maxHp, p.hp + Math.ceil(p.maxHp * 0.3)); p.atk += 1; p.pendingLv++;
    log(`<span class="c-gold">等級提升！Lv ${p.lvl}</span>`);
  }
  updateHud();
}

function die() {
  const p = G.p;
  if (p.feather > 0) {
    p.feather--; p.hp = Math.ceil(p.maxHp * 0.5); flash('#ffb040'); SFX.level();
    log('<span class="c-gold">不死鳥之羽燃燒起來，你復活了！</span>'); showBanner('復活！'); updateHud(); return;
  }
  gameOver();
}

/* ---------- 道具 ---------- */
function useItem(k) {
  const p = G.p;
  if (state !== 'play' || !['choose', 'battle'].includes(phase) || G.busy) return;
  if (p.items[k] <= 0) { log(`沒有${ITEMS[k].name}了。`); return; }
  const e = G.enemy;
  if (k === 'potion') {
    if (p.hp >= p.maxHp) { log('生命已滿。'); return; }
    p.items.potion--; const m = 1 + stat2('healMult') / 100;
    const v = Math.min(p.maxHp - p.hp, Math.round((p.potionPow + p.maxHp * 0.2) * m)); p.hp += v;
    SFX.heal(); flash('#40ff80'); log(`喝下藥水，回復 <span class="c-green">${v}</span> 生命。`); updateHud();
    if (phase === 'battle') { G.busy = true; setTimeout(() => { enemyAttack(); if (state === 'play') G.busy = false; }, 450); }
    return;
  }
  if (phase !== 'battle') { log(`${ITEMS[k].name}只能在戰鬥中使用。`); return; }
  if (k === 'smoke') {
    if (e.boss) { log('頭目擋住了退路，煙霧彈沒有用！'); return; }
    p.items.smoke--; log('你丟出煙霧彈，趁亂逃走了。'); flash('#c8c8d8');
    G.enemy = null; world.sprites = world.sprites.filter(s => s.kind !== 'enemy'); setPhase('modal'); setTimeout(afterEncounter, 400); return;
  }
  const dmg = k === 'bomb' ? Math.round(25 + G.floor * 8 + p.maxHp * 0.2) : Math.round(8 + G.floor * 3);
  p.items[k]--; e.hp -= dmg; e.flash = 1;
  popups.push({ e, text: String(dmg), color: '#ffb040', t: 0 });
  if (k === 'bomb') { SFX.boom(); flash('#ffb040'); shake = 8; } else SFX.swing();
  log(`${ITEMS[k].name}造成 <span class="c-gold">${dmg}</span> 傷害！`);
  updateEnemyBar(); updateHud();
  if (e.hp <= 0) { G.busy = true; return setTimeout(winBattle, 300); }
  if (k === 'bomb') { G.busy = true; setTimeout(() => { enemyAttack(); if (state === 'play') G.busy = false; }, 500); }
}

/* =========================================================
 * 事件
 * ========================================================= */
function startEvent() {
  const p = G.p, good = chance(p.lucky ? 0.65 : 0.5);
  const ev = pick(EVENTS.filter(x => !!x.g === good));
  const [dx, dy] = DIRS[G.face];
  world.sprites.push({ kind: 'event', icon: ev.icon, x: MC + 0.5 + dx * 0.4, y: MC + 0.5 + dy * 0.4, size: 0.42, float: true });
  setPhase('event');
  setTimeout(() => {
    if (state !== 'play') return;
    const res = ev.fx();
    good ? SFX.good() : SFX.bad();
    setPhase('modal');
    const cls = (good ? 'g' : 'b') + ev.t;
    log(`${good ? '<span class="c-green">' : '<span class="c-red">'}${ev.title}</span>：${res}`);
    showModal(`<div class="evcard"><span class="ev" style="${evStyle(ev.icon, 96)}"></span>
      <span class="rank ${cls}">${good ? '好事' : '壞事'}・${RANK[ev.t]}</span>
      <h2>${ev.title}</h2><p>${ev.text}</p><div class="fx ${good ? 'c-green' : 'c-red'}">${res}</div></div>
      <button class="btn primary" data-ui="evok">繼續前進</button>`);
    updateHud();
  }, 520);
}

function offerWeapon(tier) {
  const p = G.p, cur = p.weapon, cls = G.cls, r = DATA.rarity[tier - 1];
  if (tier <= cur) { const g = 10 + tier * 6; p.gold += g; log(`獲得「${weaponName(cls, tier)}」，比目前的武器弱，換成 <span class="c-gold">${g} 金幣</span>。`); updateHud(); return afterEncounter(); }
  showModal(`<h2>獲得武器！</h2>
    <div class="wcompare">
      <div class="wbox"><span class="wicon" style="${iconStyle(cls, cur)}"></span>${weaponName(cls, cur)}<br><small>攻擊 +${weaponAtk(cur)}</small></div>
      <div class="arrow">▶</div>
      <div class="wbox" style="border-color:${r.color}"><span class="wicon" style="${iconStyle(cls, tier)}"></span><span style="color:${r.color}">${weaponName(cls, tier)}</span><br><small>${r.name}・攻擊 +${weaponAtk(tier)}</small></div>
    </div>
    <button class="btn primary" data-ui="equip" data-t="${tier}">裝備</button>
    <button class="btn" data-ui="sell" data-t="${tier}">賣掉（${10 + tier * 6} 金幣）</button>`);
}

/* ---------- 天賦 ---------- */
let perkChoices = [];
function showPerks() {
  const p = G.p, avail = PERKS.filter(k => !k.max || (p.perks[k.id] || 0) < k.max);
  setPhase('modal'); SFX.level();
  perkChoices = [];
  while (perkChoices.length < 3 && avail.length) { let r = Math.random() * avail.reduce((s, k) => s + k.w, 0); perkChoices.push(avail.splice(avail.findIndex(k => (r -= k.w) < 0), 1)[0]); }
  showModal(`<h2>等級提升！Lv ${p.lvl - p.pendingLv + 1}</h2><p>選擇一項天賦：</p>` +
    perkChoices.map((k, i) => `<button class="btn card ${k.r || ''}" data-ui="perk" data-i="${i}"><span class="t">${k.t}</span><span class="d">${k.d}</span></button>`).join(''));
}

function gameOver() {
  state = 'dead'; G.p.hp = 0; G.busy = false; setPhase('modal'); SFX.die();
  const rec = saveBest(), p = G.p, c = CLASS[G.cls];
  showModal(`<h1>YOU DIED</h1><p>${G.name}（${c.name}）倒在了地下 ${G.floor} 層（第 ${G.step}/${STEPS_PER_FLOOR} 步）</p>
    ${rec ? '<p class="c-gold">★ 新紀錄！</p>' : ''}
    <div class="statgrid"><div>到達樓層<b>B${G.floor}</b></div><div>總步數<b>${G.totalSteps}</b></div>
      <div>等級<b>${p.lvl}</b></div><div>擊敗<b>${p.kills}</b></div>
      <div>金幣<b>${p.gold}</b></div><div>武器<b>${p.weapon} 階</b></div></div>
    <button class="btn primary" data-ui="retry">再次挑戰</button><button class="btn" data-ui="title">回到標題</button>`);
}

/* ---------- 對話框 ---------- */
function showModal(html) { $('modal-panel').innerHTML = html; $('modal').classList.add('show'); }
function closeModal() { $('modal').classList.remove('show'); }
$('modal-panel').addEventListener('click', e => {
  const b = e.target.closest('[data-ui]'); if (!b) return;
  SFX.ui();
  const ui = b.dataset.ui, p = G && G.p;
  if (ui === 'equip') { p.weapon = +b.dataset.t; log(`裝備了 <span class="c-gold">${weaponName(G.cls, p.weapon)}</span>！`); closeModal(); afterEncounter(); }
  else if (ui === 'sell') { const g = 10 + (+b.dataset.t) * 6; p.gold += g; log(`賣掉武器，獲得 <span class="c-gold">${g} 金幣</span>。`); closeModal(); afterEncounter(); }
  else if (ui === 'perk') { const k = perkChoices[+b.dataset.i]; k.f(p); p.perks[k.id] = (p.perks[k.id] || 0) + 1; p.pendingLv--; log(`獲得天賦 <span class="c-gold">${k.t}</span>。`); closeModal(); afterEncounter(); }
  else if (ui === 'evok') { closeModal(); world.sprites = world.sprites.filter(s => s.kind !== 'event'); afterEncounter(); }
  else if (ui === 'winfo') { closeModal(); setPhase(G.enemy ? 'battle' : 'choose'); }
  else if (ui === 'retry') { closeModal(); newGame(); }
  else if (ui === 'title') { closeModal(); goTitle(); }
  updateHud();
});

/* ---------- HUD ---------- */
function updateHud() {
  if (!G) return;
  const p = G.p, c = CLASS[G.cls], r = DATA.rarity[p.weapon - 1];
  $('hud-floor').textContent = 'B' + G.floor; $('hud-lvl').textContent = 'Lv' + p.lvl;
  $('hud-name').textContent = `${G.name}・${c.name}` + (p.feather ? `　不死鳥之羽 ×${p.feather}` : '');
  $('hud-steps').innerHTML = Array.from({ length: STEPS_PER_FLOOR }, (_, i) => `<i class="${i < G.step ? 'done' : i === G.step && phase !== 'choose' ? 'now' : ''}"></i>`).join('');
  $('hp-fill').style.width = (100 * Math.max(0, p.hp) / p.maxHp) + '%';
  $('hp-text').textContent = `${Math.max(0, p.hp)} / ${p.maxHp}`;
  $('xp-fill').style.width = (100 * p.xp / p.next) + '%';
  const atkB = stat2('atkPct'), defB = stat2('def'), critB = stat2('crit');
  $('st-atk').innerHTML = playerAtkVal() + (atkB ? `<small class="${atkB > 0 ? 'c-green' : 'c-red'}">${atkB > 0 ? '↑' : '↓'}</small>` : '');
  $('st-def').innerHTML = Math.max(0, p.def + defB) + (defB ? `<small class="${defB > 0 ? 'c-green' : 'c-red'}">${defB > 0 ? '↑' : '↓'}</small>` : '');
  $('st-crit').textContent = clamp(p.crit + critB, 0, 100) + '%';
  $('st-gold').textContent = p.gold; $('st-kills').textContent = p.kills;
  $('buffs').innerHTML = p.buffs.map(b => `<span class="buff ${b.good ? 'good' : 'bad'}"><span class="ev" style="${evStyle(b.icon, 18)}"></span>${b.name} ${b.steps}</span>`).join('');
  setIcon($('hud-wicon'), G.cls, p.weapon, 40);
  $('hud-wname').innerHTML = `<span style="color:${r.color}">${weaponName(G.cls, p.weapon)}</span><small style="color:${r.color}">${r.name}・${p.weapon} 階・攻擊 +${weaponAtk(p.weapon)}</small>`;
  $('items').innerHTML = Object.keys(ITEMS).map(k => `<button class="item ${p.items[k] ? '' : 'empty'}" data-item="${k}" title="${ITEMS[k].name}：${ITEMS[k].desc}"><span class="ev" style="${evStyle(ITEMS[k].icon, 32)}"></span><b>${p.items[k]}</b></button>`).join('');
}
$('items').addEventListener('click', e => { const b = e.target.closest('[data-item]'); if (b) act(b.dataset.item); });

/* =========================================================
 * 渲染
 * ========================================================= */
const view = $('view'), vctx = view.getContext('2d');
const titleCv = $('title-bg'), tctx = titleCv.getContext('2d');
const img = vctx.createImageData(W, H), buf = new Uint32Array(img.data.buffer), zbuf = new Float32Array(W);
function lightF(d, L) { let v = 1 - d / L; if (v < 0.05) v = 0.05; return Math.ceil(v * 7) / 7; }

function renderWorld(ctx, w) {
  buf.fill(0xff050308);
  const sh = shake > 0 ? (Math.random() - 0.5) * shake * 0.01 : 0;
  const px = cam.x, py = cam.y, a = cam.a + sh, dx = Math.cos(a), dy = Math.sin(a), plx = -dy * 0.66, ply = dx * 0.66;
  const HZ = horizon, L = 7.4 + Math.sin(now * 0.006) * 0.25 + Math.sin(now * 0.017) * 0.15;
  const rdx0 = dx - plx, rdy0 = dy - ply, rdx1 = dx + plx, rdy1 = dy + ply;
  for (let y = 0; y < H; y++) {
    const isFloor = y > HZ, p = isFloor ? y - HZ : HZ - y;
    if (p < 0.5) continue;
    const rd = PROJ * 0.5 / p, sx = rd * (rdx1 - rdx0) / W, sy = rd * (rdy1 - rdy0) / W;
    let fx = px + rd * rdx0, fy = py + rd * rdy0;
    const f = lightF(rd, L) * (isFloor ? 1 : 0.8), tex = isFloor ? floorTex : ceilTex, yo = y * W;
    for (let x = 0; x < W; x++) {
      buf[yo + x] = shade(tex[(((fy - Math.floor(fy)) * TEX) & TM) * TEX + (((fx - Math.floor(fx)) * TEX) & TM)], f);
      fx += sx; fy += sy;
    }
  }
  for (let x = 0; x < W; x++) {
    const cx = 2 * x / W - 1, rdx = dx + plx * cx, rdy = dy + ply * cx;
    let mx = Math.floor(px), my = Math.floor(py);
    const ddx = Math.abs(1 / rdx), ddy = Math.abs(1 / rdy);
    let stx, sty, sdx, sdy, side = 0;
    if (rdx < 0) { stx = -1; sdx = (px - mx) * ddx; } else { stx = 1; sdx = (mx + 1 - px) * ddx; }
    if (rdy < 0) { sty = -1; sdy = (py - my) * ddy; } else { sty = 1; sdy = (my + 1 - py) * ddy; }
    for (let n = 0; n < 64; n++) {
      if (sdx < sdy) { sdx += ddx; mx += stx; side = 0; } else { sdy += ddy; my += sty; side = 1; }
      if (mx < 0 || my < 0 || mx >= w.MW || my >= w.MH || w.map[my * w.MW + mx] === 1) break;
    }
    const perp = Math.max(0.05, side === 0 ? sdx - ddx : sdy - ddy); zbuf[x] = perp;
    const lh = PROJ / perp, top = HZ - lh / 2, ds = Math.max(0, Math.floor(top)), de = Math.min(H, Math.ceil(HZ + lh / 2));
    let wx = side === 0 ? py + perp * rdy : px + perp * rdx; wx -= Math.floor(wx);
    let tx = Math.floor(wx * TEX) & TM;
    if ((side === 0 && rdx > 0) || (side === 1 && rdy < 0)) tx = TM - tx;
    const f = lightF(perp, L) * (side ? 0.78 : 1), step = TEX / lh;
    let tp = (ds - top) * step;
    for (let y = ds; y < de; y++) { buf[y * W + x] = shade(wallTex[((tp | 0) & TM) * TEX + tx], f); tp += step; }
  }
  ctx.putImageData(img, 0, 0);
  // 所有精靈（怪物、事件物件、火把、裝飾）由遠到近、逐欄繪製（被牆擋住的欄位跳過）
  const invDet = 1 / (plx * dy - dx * ply), list = [];
  for (const s of w.sprites) {
    const rx = s.x - px, ry = s.y - py, tX = invDet * (dy * rx - dx * ry), tY = invDet * (-ply * rx + plx * ry);
    if (tY > 0.12) list.push({ s, tX, tY });
  }
  list.sort((p1, p2) => p2.tY - p1.tY);
  ctx.imageSmoothingEnabled = false;
  for (const { s, tX, tY } of list) {
    let art, frame = null, hgt, lift = 0, lightOverride = null, alpha = 1;
    const unit = PROJ / tY;
    if (s.kind === 'enemy') {
      const e = s.e; art = ART[e.id]; if (!art) continue;
      hgt = unit * e.size;
      const ap = clamp((now - e.appear) / 400, 0, 1);
      lift = e.fly ? unit * (0.24 + Math.sin(now * 0.008) * 0.05) : Math.abs(Math.sin(now * 0.005)) * unit * 0.015;
      if (e.lunge && now - e.lunge < 260) hgt *= 1 + Math.sin((now - e.lunge) / 260 * Math.PI) * 0.18;
      hgt *= 0.6 + 0.4 * ap;
      if (e.dead) { const k = clamp((now - e.dead) / 600, 0, 1); if (k >= 1) continue; hgt *= 1 - k * 0.3; alpha = 1 - k; }
    } else if (s.kind === 'event' || s.kind === 'deco') {
      art = ART.events; if (!art) continue;
      frame = EVI[s.icon]; hgt = unit * s.size;
      if (s.float) lift = unit * (0.18 + Math.sin(now * 0.004) * 0.03);
    } else if (s.kind === 'torch') {
      art = TORCH[Math.floor(now / 140 + s.x * 7) % 2]; hgt = unit * 0.3; lift = unit * 0.36; lightOverride = 7;
    } else continue;
    const fw = frame !== null ? 32 : art.w, fh = frame !== null ? 32 : art.h;
    const wid = hgt * fw / fh, sx = (W / 2) * (1 + tX / tY);
    const bottom = HZ + unit / 2 - lift, top = bottom - hgt, left = sx - wid / 2;
    const lvl = lightOverride !== null ? lightOverride : Math.round(lightF(tY, 7.9) * 7);
    const src = s.kind === 'enemy' && s.e.flash > 0.5 ? art.white : art.levels[clamp(lvl, 0, 7)];
    const x0 = Math.max(0, Math.floor(left)), x1 = Math.min(W, Math.ceil(left + wid)), fx0 = frame !== null ? frame * 32 : 0;
    ctx.globalAlpha = alpha;
    let run = -1;
    for (let x = x0; x <= x1; x++) {
      const vis = x < x1 && tY < zbuf[x];
      if (vis && run < 0) run = x;
      if (!vis && run >= 0) {
        const u0 = (run - left) / wid * fw, u1 = (x - left) / wid * fw;
        ctx.drawImage(src, fx0 + u0, 0, Math.max(0.01, u1 - u0), fh, run, top, x - run, hgt);
        run = -1;
      }
    }
    ctx.globalAlpha = 1;
    if (s.kind === 'enemy') { s.e.sx = sx; s.e.sy = top; }
    if (s.kind === 'torch' && tY < 6 && tY < zbuf[clamp(Math.floor(sx), 0, W - 1)] + 0.5) {   // 火光
      const cy = top + hgt * 0.2, r = unit * 0.6, g = ctx.createRadialGradient(sx, cy, 0, sx, cy, r);
      g.addColorStop(0, `rgba(255,170,60,${0.22 * (1 - tY / 6)})`); g.addColorStop(1, 'rgba(255,120,30,0)');
      ctx.fillStyle = g; ctx.fillRect(sx - r, cy - r, r * 2, r * 2);
    }
  }
}

/* 第一人稱武器：手臂 → 武器 → 拳頭三層；走路時上下左右擺動 */
function renderFP(ctx) {
  const c = CLASS[G.cls], sheet = IMG['fp_' + c.id], FS = DATA.fpSize, fp = c.fp;
  if (!sheet || !sheet.complete) return;
  const walking = anim && anim.kind === 'move';
  const bobY = walking ? Math.abs(Math.sin(walkPhase * Math.PI)) * 7 : Math.sin(now * 0.003) * 1.2;
  const bobX = walking ? Math.sin(walkPhase * Math.PI) * 5 * (anim.side || 1) : 0;
  const s = swing > 0 ? Math.sin(swing * Math.PI) : 0;
  const frames = [0, G.p.weapon, 21];
  ctx.imageSmoothingEnabled = false;
  if (fp.mirror) {
    for (const side of [1, -1]) {
      const hit = side === punchSide ? s : 0;
      const ox = Math.round(fp.x + bobX * side - hit * 20), oy = Math.round(fp.y + FP_DY + bobY - hit * 22);
      ctx.save(); if (side === -1) { ctx.translate(W, 0); ctx.scale(-1, 1); }
      for (const fr of frames) ctx.drawImage(sheet, fr * FS, 0, FS, FS, ox, oy, FS, FS);
      ctx.restore();
    }
    return;
  }
  const ox = Math.round(fp.x + bobX - s * (c.id === 'ranger' ? -6 : 26)), oy = Math.round(fp.y + FP_DY + bobY - s * (c.id === 'ranger' ? 4 : 18));
  for (const fr of frames) ctx.drawImage(sheet, fr * FS, 0, FS, FS, ox, oy, FS, FS);
}

function renderOverlay(ctx) {
  ctx.textAlign = 'center'; ctx.font = 'bold 10px monospace';
  for (const pp of popups) {
    let x, y;
    if (pp.self) { x = W / 2; y = H * 0.62; } else if (pp.e && pp.e.sx !== undefined) { x = pp.e.sx; y = pp.e.sy + 14; } else continue;
    y -= pp.t * 22 + (pp.off || 0);
    ctx.globalAlpha = 1 - pp.t;
    ctx.fillStyle = '#000'; ctx.fillText(pp.text, x + 1, y + 1); ctx.fillStyle = pp.color; ctx.fillText(pp.text, x, y);
    ctx.globalAlpha = 1;
  }
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.78);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

/* ---------- 標題背景：自動走迷宮 ---------- */
let demoFace = 0;
function demoStep() {
  const d = pick([0, 0, -1, 1]), len = rnd(2, 4);
  world = buildJunction(demoFace, d, len);
  const nf = (demoFace + d + 4) % 4;
  queueWalk(demoFace, d, len, 900);
  animQ.push({ kind: 'call', fn: () => { world = buildJunction(nf, null, 0); [cam.x, cam.y] = standPos(nf); cam.a = nf * Math.PI / 2; } });
  animQ.push({ kind: 'wait', dur: 500 });
  demoFace = nf;
}

/* ---------- 動畫佇列 ---------- */
let stepCount = 0;
function stepAnim() {
  while (!anim && animQ.length) {
    anim = animQ.shift(); anim.t0 = now;
    if (anim.kind === 'call') { const fn = anim.fn; anim = null; fn(); }
    else if (anim.kind === 'move') anim.side = (++stepCount % 2) ? 1 : -1;
  }
  if (!anim) return;
  const k = clamp((now - anim.t0) / anim.dur, 0, 1), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
  if (anim.kind === 'move') {
    cam.x = anim.fx + (anim.tx - anim.fx) * k; cam.y = anim.fy + (anim.ty - anim.fy) * k;   // 走路等速
    walkPhase = k;
    if (!anim.stepped && k > 0.45) { anim.stepped = true; if (state === 'play') SFX.step(); }
  } else if (anim.kind === 'turn') cam.a = anim.fa + (anim.ta - anim.fa) * e;
  if (k >= 1) {
    if (anim.kind === 'turn') cam.a = (((Math.round(cam.a / (Math.PI / 2)) % 4) + 4) % 4) * Math.PI / 2;
    anim = null;
  }
}

function frame(t) {
  const dt = Math.min(50, t - (lastT || t)); lastT = t; now = t;
  stepAnim();
  horizon = H / 2 + (anim && anim.kind === 'move' ? Math.sin(walkPhase * Math.PI * 2) * 2.2 : 0);
  if (state === 'title') {
    if (!anim && !animQ.length) demoStep();
    renderWorld(tctx, world);
  } else if (G && (state === 'play' || state === 'dead')) {
    if (shake > 0) shake = Math.max(0, shake - dt * 0.03);
    if (swing > 0) swing = Math.max(0, swing - dt / 240);
    if (G.enemy && G.enemy.flash > 0) G.enemy.flash -= dt / 160;
    for (const pp of popups) pp.t += dt / 750;
    popups = popups.filter(pp => pp.t < 1);
    renderWorld(vctx, world); renderFP(vctx); renderOverlay(vctx);
  }
  requestAnimationFrame(frame);
}

/* =========================================================
 * 畫面流程：標題 → 名稱 → 選角 → 遊戲
 * ========================================================= */
function showScreen(id) { document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === 'scr-' + id)); }
function goTitle() {
  state = 'title'; G = null; anim = null; animQ = [];
  $('choice').hidden = true; $('enemy-bar').hidden = true;
  makeTextures(pick(THEMES)); demoFace = 0; world = buildJunction(0, null, 0);
  [cam.x, cam.y] = standPos(0); cam.a = 0;
  showScreen('title');
  const b = loadBest(); $('title-best').textContent = b ? `最佳紀錄：${b.name || ''} B${b.floor}` : '';
}
$('title-heroes').innerHTML = ['knight', 'swordsman', 'wizard', 'fencer', 'cleric', 'witch', 'ranger', 'rogue', 'berserker', 'monk']
  .map(id => `<img src="assets/heroes/${id}.png" alt="">`).join('');
$('scr-title').addEventListener('click', () => {
  if (state !== 'title') return;
  SFX.ui(); state = 'name'; anim = null; animQ = []; showScreen('name');
  const inp = $('name-input'); inp.value = profile.name || ''; setTimeout(() => inp.focus(), 50);
});
function confirmName() {
  profile.name = $('name-input').value.trim().slice(0, 10) || '無名的冒險者';
  $('name-input').blur(); SFX.ui(); state = 'select'; showScreen('select'); buildCarousel();
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
  ring.dataset.rot = -carIdx * 360 / n; updateCarousel();
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
function rotateCar(d) { const n = carList.length, ring = $('car-ring'); carIdx += d; ring.dataset.rot = +ring.dataset.rot - d * 360 / n; SFX.ui(); updateCarousel(); }
$('car-prev').addEventListener('click', () => rotateCar(-1));
$('car-next').addEventListener('click', () => rotateCar(1));
document.querySelectorAll('.sex-tab').forEach(b => b.addEventListener('click', () => {
  if (profile.sex === b.dataset.sex) return;
  profile.sex = b.dataset.sex; profile.cls = DATA.classes.find(c => c.sex === profile.sex).id; SFX.ui(); buildCarousel();
}));
$('select-ok').addEventListener('click', () => { SFX.ui(); newGame(); });
(() => {
  let x0 = null; const el = $('carousel');
  el.addEventListener('pointerdown', e => { if (!e.target.closest('button')) x0 = e.clientX; });
  el.addEventListener('pointerup', e => { if (x0 === null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 30) rotateCar(dx < 0 ? 1 : -1); });
  el.addEventListener('pointercancel', () => { x0 = null; });
})();

/* =========================================================
 * 輸入：手勢（手機）＋ 鍵盤／小鍵盤（網頁）
 * ========================================================= */
(() => {
  let t0 = null; const zone = $('scr-game');
  zone.addEventListener('pointerdown', e => { if (e.target.closest('button, #bottom, #keypad, #hud')) return; t0 = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  zone.addEventListener('pointerup', e => {
    if (!t0) return;
    const dx = e.clientX - t0.x, dy = e.clientY - t0.y, dt = performance.now() - t0.t; t0 = null;
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax < 14 && ay < 14) { if (dt < 500) act('atk'); return; }
    if (Math.max(ax, ay) < 28) return;
    $('swipe-hint').classList.add('hide');
    if (ax > ay) act(dx < 0 ? 'left' : 'right'); else act(dy < 0 ? 'fw' : 'back');
  });
  zone.addEventListener('pointercancel', () => { t0 = null; });
})();
$('weapon-slot').addEventListener('click', () => {
  if (state !== 'play' || !['choose', 'battle'].includes(phase) || G.busy) return;
  const p = G.p, r = DATA.rarity[p.weapon - 1];
  setPhase('modal');
  showModal(`<h2>目前武器</h2><div class="wcompare"><div class="wbox" style="border-color:${r.color}"><span class="wicon" style="${iconStyle(G.cls, p.weapon)}"></span>
    <span style="color:${r.color}">${weaponName(G.cls, p.weapon)}</span><br><small>${r.name}・${p.weapon} 階・攻擊 +${weaponAtk(p.weapon)}</small></div></div>
    <p>擊敗頭目、打倒怪物或遇到好事件，都有機會獲得更高階的武器。</p><button class="btn primary" data-ui="winfo">關閉</button>`);
});
document.querySelectorAll('#keypad button').forEach(b => {
  b.addEventListener('pointerdown', e => { e.preventDefault(); b.classList.add('down'); act(b.dataset.cmd); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, () => b.classList.remove('down')));
});
const KEYS = { w: 'fw', W: 'fw', ArrowUp: 'fw', a: 'left', A: 'left', ArrowLeft: 'left', d: 'right', D: 'right', ArrowRight: 'right',
  ' ': 'atk', j: 'atk', J: 'atk', s: 'back', S: 'back', ArrowDown: 'back', 1: 'potion', f: 'potion', F: 'potion', 2: 'bomb', 3: 'knife', 4: 'smoke' };
window.addEventListener('keydown', e => {
  if (state === 'title' && (e.key === 'Enter' || e.key === ' ')) { $('scr-title').click(); return; }
  if (state === 'select') { if (e.key === 'ArrowLeft' || e.key === 'a') rotateCar(-1); else if (e.key === 'ArrowRight' || e.key === 'd') rotateCar(1); else if (e.key === 'Enter') $('select-ok').click(); return; }
  if ($('modal').classList.contains('show') && (e.key === 'Enter' || e.key === ' ')) { const b = $('modal-panel').querySelector('.btn.primary'); if (b) { e.preventDefault(); b.click(); } return; }
  const c = KEYS[e.key]; if (c && state === 'play') { e.preventDefault(); act(c); }
});
window.onAndroidBack = function () {
  if (state === 'select') { state = 'name'; showScreen('name'); return true; }
  if (state === 'name') { goTitle(); return true; }
  return false;
};

/* ---------- 啟動 ---------- */
goTitle();
requestAnimationFrame(frame);

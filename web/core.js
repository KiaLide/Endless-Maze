'use strict';
// ============ 共用工具 ============
const rnd = Math.random;
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = a => a[Math.floor(rnd() * a.length)];
const chance = p => rnd() < p;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sleep = ms => window.__fast ? Promise.resolve() : new Promise(r => setTimeout(r, ms));
const fmtPct = v => (Math.round(v * 10) / 10).toString().replace(/\.0$/, '');

const STEPS_PER_FLOOR = 10, SHORT_STEPS = 3;
const CLASSES = DATA.characters.map(c => c.id);
const CHAR = Object.fromEntries(DATA.characters.map(c => [c.id, c]));
const CLASS_IDX = Object.fromEntries(CLASSES.map((c, i) => [c, i]));
const WEAPON = {}; DATA.weapons.forEach(w => { (WEAPON[w.class_id] = WEAPON[w.class_id] || [])[w.tier - 1] = w; });
const ARMOR = {}; DATA.armor.forEach(a => { (ARMOR[a.set_id] = ARMOR[a.set_id] || [])[a.tier - 1] = a; });
const ARMOR_SETS = Object.keys(ARMOR);
const ACCS = DATA.accessories;
const ITEMS = Object.fromEntries(DATA.items.items.map(i => [i.id, i]));
const MONS = DATA.monsters.monsters;

function regionIdx(f) { return f > 50 ? 5 : Math.floor((f - 1) / 10); }
function floorF(f) { return 1 + 0.1 * (f - 1); }
// 技能解鎖：技能 1 開局就有，技能 2 通過第 5 層、絕招通過第 15 層
const SKILL_UNLOCK = [0, 5, 15];
function unlockedSkills(f) { return SKILL_UNLOCK.filter(u => f > u).length; }
const unlockText = i => SKILL_UNLOCK[i] ? `通過第 ${SKILL_UNLOCK[i]} 層解鎖` : '開局就有';

// ============ 遊戲狀態 ============
let G = null;
function newGame(name, cls) {
  G = {
    name, cls, floor: 1, step: 0, gold: 0,
    weapon: {cls, tier: 1, roll: 1},
    armor: {set: 'hp', tier: 1, roll: 1}, acc: null,   // 開局：第 1 階武器＋粗布戰袍
    inv: [{id: '小藥水', n: 2}],
    seeds: {hp: 0, atk: 0, def: 0, spd: 0, crit: 0, eva: 0},
    buffs: [],            // {stat, val, dur:'steps'|'floor'|'long'|'next', left}
    poison: null,         // {pct, left|'long'}
    phoenix: false,
    next: {},             // 下一場戰鬥的特殊效果
    cds: [0, 0, 0],       // 技能冷卻：跨戰鬥共通，新戰鬥不重置
    blockHits: 0,
    dropFloor: 0,         // 掉落保底剩餘步數
    merchantStep: -1,
    lastCastleBoss: null,
    kills: 0, hp: 1,
  };
  G.hp = maxHp();
}

// ============ 能力值 ============
function weaponStats(w) {
  const d = WEAPON[w.cls][w.tier - 1];
  const s = {...d.stats};
  s.atk = Math.round(s.atk * w.roll);
  return s;
}
function armorStats(a) {
  const d = ARMOR[a.set][a.tier - 1];
  const s = {...d.stats};
  const main = a.set;   // 套裝 id 等於側重的能力
  if (s[main] != null) s[main] = main === 'crit' || main === 'eva' ? Math.round(s[main] * a.roll * 2) / 2 : Math.round(s[main] * a.roll);
  return s;
}
function accStats(a) {
  const d = ACCS[a.idx];
  const s = {...d.stats};
  const m = d.main_stat;
  s[m] = m === 'crit' || m === 'eva' ? Math.round(s[m] * a.roll * 2) / 2 : Math.round(s[m] * a.roll);
  return s;
}
function accName() { return G.acc ? ACCS[G.acc.idx].name : null; }
function accOwn() { return G.acc && ACCS[G.acc.idx].class_id === G.cls; }
function hasAcc(name) { return accName() === name; }
function accScale() { return accOwn() ? 1 : 0.75; }   // 非本職飾品：詞條 ×0.75（針對技能的部分本來就不會觸發）

function buffSum(stat) { return G.buffs.filter(b => b.stat === stat).reduce((s, b) => s + b.val, 0); }

// 戰鬥外的能力值（不含戰鬥中的暫時效果）
function baseStats() {
  const b = CHAR[G.cls].base_stats;
  const s = {hp: b.hp, atk: b.atk, def: b.def, spd: b.spd, crit: b.crit, eva: b.eva};
  const add = o => { for (const k in o) s[k] = (s[k] || 0) + o[k]; };
  add(weaponStats(G.weapon));
  if (G.armor) add(armorStats(G.armor));
  if (G.acc) add(accStats(G.acc));
  s.hp += G.seeds.hp * 10; s.atk += G.seeds.atk * 2; s.def += G.seeds.def * 2;
  s.spd += G.seeds.spd; s.crit += G.seeds.crit; s.eva += G.seeds.eva;
  if (hasAcc('城塞之心')) s.atk += Math.round(s.def * 0.2 * accScale());
  for (const k of ['hp', 'atk', 'def', 'spd']) s[k] = Math.max(1, Math.round(s[k] * (1 + buffSum(k) / 100)));
  s.crit = Math.max(0, s.crit + buffSum('crit'));
  s.eva = clamp(s.eva + buffSum('eva'), 0, 50);
  s.hit = 100 + buffSum('hit');
  s.goldMul = Math.max(0, 1 + buffSum('gold') / 100);
  s.healMul = Math.max(0, 1 + buffSum('heal') / 100);
  return s;
}
function maxHp() { return baseStats().hp; }
function setHp(v) { G.hp = clamp(Math.round(v), 0, maxHp()); }
// 回復（套用回復效果倍率）；回傳溢出量
function healPct(p, isPotion) {
  const s = baseStats();
  let amt = s.hp * p * s.healMul;
  if (isPotion && G.cls === 'cleric') amt *= 2;   // 聖女被動：藥水效果 ×2
  const before = G.hp;
  setHp(G.hp + amt);
  return {healed: G.hp - before, over: Math.max(0, before + amt - s.hp)};
}

// 最大生命變動時，保持「目前生命」不超過上限；最大生命提升時同時加上同量
function withMaxHpChange(fn) {
  const before = maxHp();
  fn();
  const after = maxHp();
  if (after > before) G.hp += after - before;
  G.hp = clamp(G.hp, 1, after);
}

// ============ 道具 ============
function itemIcon(id) {
  const it = ITEMS[id] || {};
  if (id === '小藥水') return 'misc:potion_s';
  if (id === '中藥水') return 'misc:potion_m';
  if (id === '大藥水') return 'misc:potion_l';
  if (id === '女神之種') return 'misc:seed_god';
  if (id === '不死鳥之羽') return 'misc:phoenix';
  if (it.category === '永久') return 'misc:seed';
  if (it.category === '特殊道具') return 'misc:sp_' + it.key;
  return 'misc:scroll';
}
function itemDesc(id) {
  const it = ITEMS[id];
  if (!it) return '';
  if (it.category === '回復') return `回復最大生命 ${it.effect.heal_pct}%` + (G && G.cls === 'cleric' ? '（聖女 ×2）' : '');
  if (it.category === '特殊道具') return `${it.effect}（${{battle: '戰鬥中', any: '隨時', explore: '探索時'}[it.use]}）`;
  if (id === '女神之種') return '任選一個屬性 +1 點';
  if (it.category === '永久') return `${STAT_NAMES[it.stat]} 永久 +${it.value}${it.stat === 'crit' || it.stat === 'eva' ? '%' : ''}`;
  return it.effect || '';
}
function invCount() { return G.inv.length; }
// 放入道具欄；放不下回傳 false
// 道具欄：6 格，同一種道具只佔 1 格、最多 5 個；滿 5 個後多撿到的自動換成金幣
const STACK_MAX = 5, INV_SLOTS = 6;
function addItem(id, n = 1) {
  const r = {added: 0, sold: 0, ok: true};
  for (let i = 0; i < n; i++) {
    let slot = G.inv.find(s => s.id === id);
    if (!slot) {
      if (G.inv.length >= INV_SLOTS) { r.ok = false; break; }
      slot = {id, n: 0}; G.inv.push(slot);
    }
    if (slot.n < STACK_MAX) { slot.n++; r.added++; }
    else r.sold += itemSellValue(id);
  }
  G.gold += r.sold;
  return r;
}
function addItemText(id, r) {
  const t = [];
  if (r.added) t.push(`獲得 ${id}${r.added > 1 ? ' ×' + r.added : ''}`);
  if (r.sold) t.push(`${id}已滿 ${STACK_MAX} 個，多的換成 ${r.sold} 金幣`);
  if (!r.ok) t.push(`道具欄已滿，${id} 放不下`);
  return t.join('；');
}
function canStack(id) { const s = G.inv.find(x => x.id === id); return s ? s.n < STACK_MAX : G.inv.length < INV_SLOTS; }
function removeItem(id, n = 1) {
  const s = G.inv.find(x => x.id === id); if (!s) return 0;
  const t = Math.min(s.n, n); s.n -= t;
  G.inv = G.inv.filter(x => x.n > 0);
  return t;
}
// 消耗指定格子的道具
function removeAt(idx, n = 1) {
  const s = G.inv[idx]; if (!s) return 0;
  const t = Math.min(s.n, n); s.n -= t;
  G.inv = G.inv.filter(x => x.n > 0);
  return t;
}
// 合併重複的格子（舊存檔用），超過上限的換成金幣
function normalizeInv() {
  const out = [];
  for (const s of G.inv) {
    const o = out.find(x => x.id === s.id);
    if (!o) { out.push({id: s.id, n: Math.min(s.n, STACK_MAX)}); if (s.n > STACK_MAX) G.gold += (s.n - STACK_MAX) * itemSellValue(s.id); continue; }
    const room = STACK_MAX - o.n, add = Math.min(room, s.n); o.n += add; G.gold += (s.n - add) * itemSellValue(s.id);
  }
  G.inv = out;
}
function rollSpecial(rarity) { return pick(DATA.items.items.filter(i => i.category === '特殊道具' && i.rarity === rarity)).id; }
function rollItemId(table) {
  const t = ITEM_DROP[table];
  let r = rnd() * t.reduce((s, x) => s + x[1], 0);
  for (const [id, w] of t) {
    if ((r -= w) > 0) continue;
    const stat = pick(['hp', 'atk', 'def', 'spd', 'crit', 'eva']);
    if (id === 'sp0' || id === 'sp1') return rollSpecial(id === 'sp0' ? '常見' : '珍品');
    if (id === 'seed') return SEED_NAMES[stat];
    return id;
  }
  return '小藥水';
}

// ============ 裝備掉落 ============
function dropTier(kind) {
  let t = Math.round(G.floor / 2) + ri(-1, 1);
  if (kind === 'elite' && chance(0.4)) t += 1;
  if (kind === 'boss') { const r = rnd(); t += r < 0.2 ? 2 : r < 0.7 ? 1 : 0; }
  return clamp(t, 1, 20);
}
function rollRoll() {
  let lo = 0.85;
  if (G.dropFloor > 0) lo = 1.0;
  if (hasAcc('狩獵護符')) lo = Math.max(lo, 0.85 + 0.10 * accScale());
  return Math.round((lo + rnd() * (1.15 - lo)) * 100) / 100;
}
function makeDrop(kind) {
  if (kind === 'boss') return {type: 'weapon', item: {cls: G.cls, tier: dropTier('boss'), roll: rollRoll()}};
  let r = rnd() * 100;
  if (r < 30) {
    const own = chance(kind === 'elite' ? 0.75 : 0.5);
    const cls = own ? G.cls : pick(CLASSES.filter(c => c !== G.cls));
    return {type: 'weapon', item: {cls, tier: dropTier(kind), roll: rollRoll()}};
  }
  if (r < 60) return {type: 'armor', item: {set: pick(ARMOR_SETS), tier: dropTier(kind), roll: rollRoll()}};
  if (r < 75) {
    const own = chance(kind === 'elite' ? 0.75 : 0.5);
    const pool = ACCS.map((a, i) => i).filter(i => own ? ACCS[i].class_id === G.cls : ACCS[i].class_id !== G.cls);
    return {type: 'acc', item: {idx: pick(pool), roll: rollRoll()}};
  }
  return {type: 'item', item: rollItemId(kind === 'elite' ? 'elite' : 'normal')};
}
// 道具售價基準（未乘樓層係數 F）；賣回給暗商為售價的 40%
function itemBasePrice(id) {
  const it = ITEMS[id];
  if (id.startsWith('女神')) return 600;
  if (it.category === '永久') return 300;
  if (it.category === '回復') return {小藥水: 25, 中藥水: 60, 大藥水: 120}[id] || 40;
  return it.price_F || 30;
}
function itemSellValue(id) { return Math.max(1, Math.round(itemBasePrice(id) * floorF(G.floor) * 0.4)); }
function sellValue(type, item) {
  if (type === 'acc') return Math.round(15 * floorF(G.floor));
  return item.tier * 3;
}
function equipName(type, item) {
  if (type === 'weapon') return WEAPON[item.cls][item.tier - 1].name;
  if (type === 'armor') return ARMOR[item.set][item.tier - 1].name;
  if (type === 'acc') return ACCS[item.idx].name;
  return item;
}
function equipStats(type, item) {
  if (type === 'weapon') return weaponStats(item);
  if (type === 'armor') return armorStats(item);
  if (type === 'acc') return accStats(item);
  return {};
}
function statLine(s) {
  return Object.entries(s).filter(([k, v]) => v).map(([k, v]) =>
    `${STAT_NAMES[k] || k} ${v > 0 ? '+' : ''}${fmtPct(v)}${k === 'crit' || k === 'eva' ? '%' : ''}`).join('、');
}
function rarityOf(type, item) {
  if (type === 'weapon') return WEAPON[item.cls][item.tier - 1].rarity;
  if (type === 'armor') return ARMOR[item.set][item.tier - 1].rarity;
  return '優良';
}

// ============ 暫時效果 ============
function addBuff(stat, val, dur) {
  const left = dur === 'steps' ? SHORT_STEPS : null;
  if (stat === 'hp') withMaxHpChange(() => G.buffs.push({stat, val, dur, left}));
  else G.buffs.push({stat, val, dur, left});
}
function clearBuffs(pred) { withMaxHpChange(() => { G.buffs = G.buffs.filter(b => !pred(b)); }); }
function tickStepBuffs() {
  withMaxHpChange(() => {
    G.buffs.forEach(b => { if (b.dur === 'steps') b.left--; });
    G.buffs = G.buffs.filter(b => b.dur !== 'steps' || b.left > 0);
  });
  if (G.dropFloor > 0) G.dropFloor--;
}

// ============ 事件效果 ============
// 回傳 {text:[], battle:null|kind}
function applyFx(fx, isBad) {
  const out = {text: [], battle: null};
  const half = isBad && hasAcc('黑貓鈴鐺') ? 1 - 0.5 * accScale() : 1;   // 黑貓流：壞事件效果減半
  const F = floorF(G.floor);
  for (const e of fx) {
    const [k, a, b, c, d] = e;
    switch (k) {
      case 'heal': { const r = healPct(a); out.text.push(`回復 ${r.healed} 生命`); break; }
      case 'dmg': { const v = Math.round(maxHp() * a * half); setHp(Math.max(1, G.hp - v)); out.text.push(`受到 ${v} 傷害`); break; }
      case 'gold': {
        let v = Math.round(a * F * (a > 0 ? baseStats().goldMul : half));
        if (v < 0) v = -Math.min(G.gold, -v);
        G.gold += v; out.text.push(v >= 0 ? `獲得 ${v} 金幣` : `失去 ${-v} 金幣`); break;
      }
      case 'buff': {
        const v = a === 'heal' || a === 'gold' ? b : (b < 0 ? Math.round(b * half) : b);
        addBuff(a, v, c);
        const durT = {steps: '數步', floor: '本層內', long: '長時間', next: '下一場戰鬥'}[c];
        out.text.push(`${STAT_NAMES[a]} ${v > 0 ? '+' : ''}${v}%（${durT}）`); break;
      }
      case 'item': { out.text.push(addItemText(a, addItem(a, b))); break; }
      case 'randitem': {
        for (let i = 0; i < b; i++) {
          let id; do { id = rollItemId('normal'); } while (a === 'rare' && (id === '小藥水' || id.endsWith('・小')));
          out.text.push(addItemText(id, addItem(id)));
        }
        break;
      }
      case 'loseitem': {
        const n = removeItem(a, b);
        if (n) out.text.push(`失去 ${a} ×${n}`);
        else if (c) { const v = Math.round(maxHp() * c * half); setHp(Math.max(1, G.hp - v)); out.text.push(`沒有${a}，受到 ${v} 傷害`); }
        else out.text.push(`你沒有${a}，什麼也沒失去`);
        break;
      }
      case 'loserand': {
        if (!G.inv.length) { out.text.push('背包是空的，什麼也沒掉'); break; }
        const s = pick(G.inv); removeItem(s.id, 1); out.text.push(`失去 ${s.id}`); break;
      }
      case 'loseall': { G.inv = []; out.text.push('失去所有道具'); break; }
      case 'poison': {
        G.poison = {pct: a * half, left: b};
        out.text.push(`中毒（${b === 'long' ? '長時間' : b + ' 步'}，每步損失 ${fmtPct(a * half * 100)}% 生命）`); break;
      }
      case 'progress': {
        const before = G.step;
        G.step = clamp(G.step + a, 0, STEPS_PER_FLOOR - (G.floor % 5 === 0 ? 2 : 1));   // 頭目層保留最後一步給頭目
        const d = G.step - before;
        out.text.push(d >= 0 ? `本層進度 +${d} 步` : `本層進度 ${d} 步`); break;
      }
      case 'progress0': { G.step = 0; out.text.push('本層進度歸零'); break; }
      case 'weapon': {
        const t0 = G.weapon.tier;
        G.weapon.tier = clamp(t0 + a, 1, 20);
        out.text.push(`武器 ${a > 0 ? '+' : ''}${G.weapon.tier - t0} 階：${equipName('weapon', G.weapon)}`); break;
      }
      case 'phoenix': {
        if (G.phoenix) { G.gold += Math.round(60 * F); out.text.push(`已持有不死鳥之羽，改為獲得 ${Math.round(60 * F)} 金幣`); }
        else { G.phoenix = true; out.text.push('獲得不死鳥之羽'); }
        break;
      }
      case 'cleanse': {
        const neg = G.buffs.filter(b => b.val < 0);
        if (a === 'all') { clearBuffs(b => b.val < 0); G.poison = null; out.text.push('解除所有負面狀態'); }
        else if (G.poison) { G.poison = null; out.text.push('解除中毒'); }
        else if (neg.length) { const t = neg[0]; clearBuffs(b => b === t); out.text.push(`解除 ${STAT_NAMES[t.stat]}下降`); }
        else out.text.push('身上沒有負面狀態');
        break;
      }
      case 'removepos': { clearBuffs(b => b.val > 0); G.blockHits = 0; out.text.push('失去所有正面狀態'); break; }
      case 'sethp1': { G.hp = 1; out.text.push('生命降為 1'); break; }
      case 'blockhits': { G.blockHits = Math.max(G.blockHits, a); out.text.push(`擋下接下來的 ${a} 次攻擊`); break; }
      case 'first': { G.next.first = a; out.text.push({player: '下一場戰鬥由你先攻', enemy: '下一場戰鬥由敵人先攻', enemy2: '下一場戰鬥敵人連續先攻兩次'}[a]); break; }
      case 'enemyhp': { G.next.enemyHp = a; out.text.push('下一個敵人生命 −10%'); break; }
      case 'battle': { out.battle = a; out.text.push({normal: '立刻遭遇戰鬥！', strong: '立刻遭遇強化怪物！', elite: '立刻遭遇精英怪物！'}[a]); break; }
      case 'skill': {
        G.next.skill = a;
        out.text.push(a === 'cdhalf' ? '下一場戰鬥：技能 CD 減半' : '下一場戰鬥：技能從冷卻中開始'); break;
      }
      case 'dropfloor': { G.dropFloor = SHORT_STEPS; out.text.push('數步內掉落的裝備數值保底 100%'); break; }
    }
  }
  return out;
}

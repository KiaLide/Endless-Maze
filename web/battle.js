'use strict';
// ============ 戰鬥引擎 ============
// 回合 = 該角色自己的一次行動；行動條 0～100，每一刻增加的量等於速度

let B = null;   // 目前戰鬥

// 怪物基礎值與成長（第 1 層標準怪物）
// 生命、攻擊、防禦：第 1～40 層每層 ×g1；第 41～50 層（裝備已封頂）每層 ×g2；第 51 層起每層 ×g3；速度每層 ×gs
const MON_CFG = {hp: 50, atk: 4, def: 4, spd: 9, g1: 1.06, g2: 1.03, g3: 1.05, gs: 1.01};
function monGrowth(f) {
  const C = MON_CFG;
  return Math.pow(C.g1, Math.min(f, 40) - 1) * Math.pow(C.g2, clamp(f - 40, 0, 10)) * Math.pow(C.g3, Math.max(0, f - 50));
}
function monsterStats(m, f, kind) {
  const [h, a, d, s, e] = ROLES[m.role] || ROLES['標準'];
  const [rh, ra] = RANKS[m.rank];
  const C = MON_CFG;
  const mult = monGrowth(f);
  const sm = Math.pow(C.gs, f - 1);
  const fx = MON_FX[m.name] || {};
  const st = {
    hp: Math.round(C.hp * h * rh * mult * (fx.hpMul || 1)), atk: Math.max(1, Math.round(C.atk * a * ra * mult)),
    def: Math.round(C.def * d * mult), spd: Math.round(C.spd * s * sm * (fx.spdMul || 1)), crit: 5, eva: 3 + e + (fx.evaBonus || 0),
  };
  if (kind === 'strong') { st.hp = Math.round(st.hp * 1.3); st.atk = Math.round(st.atk * 1.3); }
  return st;
}

function pickMonster(kind) {
  const f = G.floor, r = regionIdx(f);
  const regName = REGIONS[r].name;
  const pool = MONS.filter(m => m.region === regName);
  if (kind === 'boss') {
    const bosses = pool.filter(m => m.rank === '頭目');
    if (r === 5) {
      let b; do { b = pick(bosses); } while (bosses.length > 1 && b.name === G.lastCastleBoss);
      G.lastCastleBoss = b.name; return b;
    }
    return bosses[(f - 1) % 10 < 5 ? 0 : 1];
  }
  if (kind === 'elite') return pick(pool.filter(m => m.rank === '精英'));
  const basics = pool.filter(m => m.rank === '基本');
  if (r === 5) return pick(basics);
  const fin = (f - 1) % 10 + 1;
  return pick(fin <= 5 ? basics.slice(0, 5) : basics.slice(2, 7));
}

// ---------- 狀態工具 ----------
function stSum(u, k) { return u.st.filter(s => s.k === k).reduce((a, s) => a + s.v, 0); }
function stHas(u, k) { return u.st.some(s => s.k === k); }
function stGet(u, k) { return u.st.find(s => s.k === k); }
function stAdd(u, k, v, turns, extra = {}) {
  // 女神之淚：負面狀態反轉
  if (u.isP && G && G.weapon && mythic('cleric')) {
    if (k.endsWith('Mod') && v < 0) v = -v;
    else if (k === 'slow') k = 'haste';
  }
  u.st.push({k, v, turns, ...extra});
}
function stDel(u, k) { u.st = u.st.filter(s => s.k !== k); }
function hpFrac(u) { return u.hp / u.maxHp; }

// ---------- 數值設定：機制放大 ----------
const SKILL_POWER = 1.3;    // 技能倍率整體 ×1.3
const BREAK_DMG = 2.0;      // 破防中受到的傷害
// 第 20 階神話武器：效果依武器種類決定，不受「非本職 ×0.75」影響
function mythic(k) { return G.weapon.tier === 20 && G.weapon.cls === k; }
const MYTHIC = {
  swordsman: {name: '終焉', text: '敵人破防中且生命低於 30% 時，攻擊直接處決；頭目不會被處決，改為受到 2 倍傷害。'},
  knight:    {name: '貫天', text: '攻擊永遠用對敵人最有利的傷害類型計算，自動打弱點並削減破防值；效果只有本職的 75%（與附魔相同）。'},
  rogue:     {name: '噬時', text: '每次攻擊命中，偷走敵人一部分行動條給自己（每次行動最多偷 40）。'},
  wizard:    {name: '回響', text: '使用的技能會在你的下一回合自動以 1/3 威力再施放一次（不重現凍結、格擋、煙幕、召喚等效果，也不影響冷卻）。'},
  berserker: {name: '劈開萬物', text: '每次攻擊都會削減破防值，不必打弱點；打中弱點時一次削 2 點。'},
  fencer:    {name: '永恆之舞', text: '閃避成功時連擊不中斷而且 +1；連擊每累積到基本上限的一半（單發型 5、多段型 10、武鬥家 20），立刻多行動一次。'},
  cleric:    {name: '慈悲反轉', text: '身上的負面狀態反轉成正面效果：中毒、灼燒變成每回合回復，減速變加速，能力下降變上升。'},
  witch:     {name: '痛苦轉嫁', text: '受到的傷害會在敵人接下來 3 次行動時，以詛咒傷害還給牠（算持續傷害，構造體受到加成）。'},
  ranger:    {name: '先見', text: '意圖預告改為顯示敵人接下來 3 次行動；打斷蓄力或打出破防時回復 10% 生命。'},
  monk:      {name: '無雙', text: '被攻擊命中時連擊不歸零，只減半；連擊上限 ×1.5（單發型 15、多段型 30、武鬥家 60）。'},
};
// 連擊：每打中一段 +1 層；每層加成與上限依職業（最多都是 +100%）
// 單發型（騎士、法師、聖女、魔女）+10%×10、多段型（劍士、盜賊、狂戰士、劍姬、遊俠）+5%×20、武鬥家 +2.5%×40
const COMBO_TIER = {monk: [0.025, 40], swordsman: [0.05, 20], rogue: [0.05, 20], berserker: [0.05, 20], fencer: [0.05, 20], ranger: [0.05, 20]};
function comboBase() { return COMBO_TIER[G.cls] || [0.10, 10]; }
function comboCap() { return Math.round(comboBase()[1] * (mythic('monk') ? 1.5 : 1)); }
function comboPer() { return comboBase()[0]; }
function addCombo(n = 1) {
  const P = B.P;
  P.combo = Math.min(comboCap(), P.combo + n);
  if (mythic('fencer')) {   // 永恆之舞：連擊每累積「基本上限的一半」多行動一次（5／10／20）
    const step = comboBase()[1] / 2, before = P.dance; P.dance += n;
    if (Math.floor(P.dance / step) > Math.floor(before / step)) { P.extraAct = true; UI.log('永恆之舞！你將再行動一次'); }
  }
}
function comboBreak() {
  const P = B.P; if (!P.combo) return;
  P.combo = mythic('monk') ? Math.floor(P.combo / 2) : 0;
}
// 世界樹、終焉等的回復
function mythicHeal(P, why) { if (mythic('ranger')) { UI.log(`世界樹的祝福（${why}）`); healUnit(P, P.maxHp * 0.1); } }

function atkOf(u) {
  let a = u.atk * (1 + stSum(u, 'atkMod'));
  if (u.isP) {
    if (G.cls === 'swordsman' && hpFrac(u) > 0.5) a *= 1.1;
  } else {
    if (u.enraged) a *= 1 + u.enraged;
    a *= 1 + (u.stack || 0);
    if (u.phase >= 2) a *= 1.3;
  }
  return Math.max(1, a);
}
function defOf(u) {
  let d = u.def * (1 + stSum(u, 'defMod'));
  if (u.isP) {
    if (G.cls === 'swordsman' && hpFrac(u) > 0.5) d *= 1.1;
  } else if (u.fx.defUpLow && hpFrac(u) < u.fx.defUpLow[0]) d *= u.fx.defUpLow[1];
  return Math.max(0, d);
}
function spdOf(u) {
  let s = u.spd * (1 + stSum(u, 'spdMod'));
  if (stHas(u, 'slow')) s *= 0.5;
  if (stHas(u, 'haste')) s *= 1.5;
  if (u.isP && hasAcc('疾風腰帶') && B && B.E) s = Math.max(s, spdOf(B.E) * (1 + 0.2 * accScale()));   // 至少比敵人快 20%
  if (!u.isP) {
    if (stHas(u, 'poison') && hasAcc('毒藤箭袋')) s *= 1 - 0.3 * accScale();
    if (u.fx.spdUpLow && hpFrac(u) < u.fx.spdUpLow[0]) s *= 1 + u.fx.spdUpLow[1];
    if (u.fx.spdUpByHp) s *= 2 - hpFrac(u);
    if (u.phase >= 2) s *= 1.3;
  }
  return Math.max(1, s);
}
function evaOf(u) {
  let e = u.eva + stSum(u, 'evaMod');
  if (!u.isP && u.batTurns > 0) e += 40;
  return clamp(e, 0, u.isP ? 50 : 70);
}

// ---------- 開始戰鬥 ----------
async function startBattle(kind) {
  const m = pickMonster(kind === 'strong' ? 'normal' : kind);
  const ms = monsterStats(m, G.floor, kind);
  const bs = baseStats();
  const P = {isP: true, name: G.name, hp: G.hp, maxHp: bs.hp, atk: bs.atk, def: bs.def, spd: bs.spd, crit: bs.crit,
    eva: bs.eva, hit: bs.hit, gauge: 0, st: [], cds: G.cds, turns: 0, noDmgTurns: 0, roseStacks: 0, dragonStack: 0,
    firstAttackDone: false, vetBreak: false, holy: 0, angel: 0, nextBoost: 1,
    combo: 0, chain: 0, bulwark: 0, judge: 0, delayPool: 0, delayChunk: 0, volt: 0, lastSkill: -1, debt: 0, pact: 0, qi: 0,
    normals: 0, oathBlocks: 0, skillMul: 1, dance: 0, extraAct: false, echo: null, voidG: 0};
  const E = {isP: false, name: m.name, data: m, fx: MON_FX[m.name] || {}, rank: m.rank, hp: ms.hp, maxHp: ms.hp,
    atk: ms.atk, def: ms.def, spd: ms.spd, crit: ms.crit, eva: ms.eva, hit: 100, gauge: 0, st: [], turns: 0,
    stack: 0, revived: false, summonAtDone: false, potionDone: false, batDone: false, batTurns: 0, iceHits: 0,
    stolen: 0, phase: 1, cursed: false, body: MON_BODY[m.name] || '肉體', venom: 0, pain: [], future: []};
  E.breakMax = E.breakV = BREAK_MAX[m.rank] || 2;
  if (E.fx.mirror) {
    for (const k of ['atk', 'def', 'spd']) E[k] = Math.max(E[k], Math.round(P[k] * E.fx.mirror));
    E.maxHp = E.hp = Math.max(E.hp, Math.round(P.maxHp * E.fx.mirror * 3));
  }
  if (G.next.enemyHp) E.hp = E.maxHp = Math.round(E.maxHp * (1 + G.next.enemyHp / 100));
  B = {P, E, kind, over: false, result: null, summonsE: [], summonP: null, skillHalf: G.next.skill === 'cdhalf'};
  // 先攻相關
  if (G.next.first === 'player') P.gauge = 100;
  if (G.next.first === 'enemy' || G.next.first === 'enemy2') E.gauge = 100;
  if (G.next.first === 'enemy2') E.extraFirst = true;
  if (hasAcc('疾風腰帶') || hasAcc('獵人斗篷扣')) P.gauge = Math.max(P.gauge, 100);
  if (G.next.skill === 'cdstart') {
    const n = unlockedSkills(G.floor); for (let i = 0; i < n; i++) P.cds[i] = Math.max(P.cds[i], SKILLS[G.cls][i].cd);
  }
  planIntent();
  await UI.battleBegin(B);
  // 主迴圈
  while (!B.over) {
    const actor = advance();
    if (actor === P) await playerTurn(); else await enemyTurn();
    UI.battleRefresh(B);
  }
  return finishBattle();
}

function advance() {
  const {P, E} = B;
  const tP = (100 - P.gauge) / spdOf(P), tE = (100 - E.gauge) / spdOf(E);
  const t = Math.max(0, Math.min(tP, tE));
  P.gauge += spdOf(P) * t; E.gauge += spdOf(E) * t;
  return P.gauge >= 100 - 1e-9 ? P : E;
}
// 預測接下來 n 次行動的順序（給畫面上的行動條顯示）
function predictOrder(n) {
  const {P, E} = B;
  // 減速、加速只到該單位下一次行動結束；之後用一般速度
  const base = u => { let s = spdOf(u); if (stHas(u, 'slow')) s /= 0.5; if (stHas(u, 'haste')) s /= 1.5; return s; };
  let gp = P.gauge, ge = E.gauge, sp = spdOf(P), se = spdOf(E); const out = [];
  for (let i = 0; i < n; i++) {
    const tP = (100 - gp) / sp, tE = (100 - ge) / se, t = Math.max(0, Math.min(tP, tE));
    gp += sp * t; ge += se * t;
    if (gp >= 100 - 1e-9) { out.push('P'); gp = 0; sp = base(P); } else { out.push('E'); ge = 0; se = base(E); }
  }
  return out;
}

// 回合開始：持續傷害、回復、凍結判定；回傳 false 表示這回合跳過
async function turnStart(u) {
  const other = u.isP ? B.E : B.P;
  for (const k of ['poison', 'burn']) {
    const s = stGet(u, k);
    if (s) {
      let d = Math.max(1, Math.round(s.v * (u.isP ? 1 : BODY[u.body].dot)));
      await dealRaw(u, d, k === 'poison' ? '中毒' : '灼燒', k === 'poison' ? 'poison' : 'burn');
      if (B.over) return false;
    }
  }
  if (u.isP) {
    // 不屈紋章：延後的傷害分 3 回合扣（最低留 1 點）
    if (u.delayPool > 0 && !stHas(u, 'unyield')) {
      if (!u.delayChunk) u.delayChunk = Math.ceil(u.delayPool / 3);
      const pay = Math.min(u.delayPool, u.delayChunk); u.delayPool -= pay; if (u.delayPool <= 0) u.delayChunk = 0;
      u.hp = Math.max(1, u.hp - pay); UI.float(u, pay, 'dmg'); UI.log(`延遲的傷害到來：${pay}`);
    }
    const hot = stGet(u, 'hot'); if (hot) healUnit(u, u.maxHp * hot.v);
    const mercy = stGet(u, 'mercy'); if (mercy) { UI.log('慈悲之淚化為回復'); healUnit(u, mercy.v); }
    if (hasAcc('龍紋腰帶')) u.dragonStack = Math.min(0.5, u.dragonStack + 0.1 * accScale());
    stDel(u, 'guard'); stDel(u, 'mikiriStance');
    for (let i = 0; i < 3; i++) if (u.cds[i] > 0) u.cds[i]--;
  } else {
    if (u.fx.regen) healUnit(u, u.maxHp * u.fx.regen);
    // 痛苦轉嫁：受到的傷害分 3 次還給敵人
    if (u.pain.length) {
      const d = u.pain.reduce((a, p) => a + p.per, 0) * BODY[u.body].dot;
      u.pain.forEach(p => p.left--); u.pain = u.pain.filter(p => p.left > 0);
      if (d >= 1) { await dealRaw(u, Math.round(d), '痛苦轉嫁', 'poison'); if (B.over) return false; }
    }
    if (u.batTurns > 0) u.batTurns--;
  }
  if (!u.isP && stHas(u, 'broken')) {
    stDel(u, 'broken'); u.breakV = u.breakMax;
    UI.float(u, '破防中', 'status'); UI.log(`${u.name}破防了，無法行動`);
    await sleep(500); return false;
  }
  if (stHas(u, 'freeze')) {
    const fz = stGet(u, 'freeze'); fz.v--; if (fz.v <= 0) stDel(u, 'freeze');
    UI.float(u, '凍結中', 'status'); UI.log(`${u.name}被凍結，無法行動`);
    await sleep(500); return false;
  }
  return true;
}
// 回合結束：狀態持續時間 −1
function turnEnd(u) {
  u.st.forEach(s => { if (s.turns < 900) s.turns--; });
  u.st = u.st.filter(s => s.turns > 0);
  stDel(u, 'slow'); stDel(u, 'haste');
  if (!u.isP && !stHas(u, 'poison')) u.venom = 0;
  u.gauge = 0;
}

function healUnit(u, amt) {
  amt = Math.round(amt);
  if (amt <= 0) return 0;
  const before = u.hp; u.hp = Math.min(u.maxHp, u.hp + amt);
  const healed = u.hp - before, over = amt - healed;
  if (healed > 0) UI.float(u, '+' + healed, 'heal');
  if (u.isP && healed > 0 && hasAcc('聖印護符') && B && !B.over) u.holy = Math.min(3, (u.holy || 0) + 1);   // 每次回復累積聖印
  // 溢愈流：溢出的回復轉成神聖傷害
  if (u.isP && over > 0 && hasAcc('慈光念珠') && !B.over) {
    const d = Math.round(over * accScale());
    if (d > 0) { B.E.hp = Math.max(0, B.E.hp - d); UI.float(B.E, d, 'holy'); checkDeath(B.E); }
  }
  return healed;
}

// 不經命中判定、無視防禦的固定傷害
async function dealRaw(u, d, label, cls) {
  if (u.isP) d = applyTakenMods(u, d);
  u.hp = Math.max(0, u.hp - Math.round(d));
  UI.float(u, Math.round(d), cls || 'dmg'); UI.log(`${u.name}受到${label} ${Math.round(d)} 傷害`);
  if (u.isP) { u.noDmgTurns = 0; if (hasAcc('龍紋腰帶')) u.dragonStack = 0; painStore(Math.round(d)); }
  await checkDeathAsync(u);
}
function painStore(d) { if (d > 0 && mythic('witch') && B.E.hp > 0) B.E.pain.push({per: d / 3, left: 3}); }
// commit = false 時只計算不改狀態（給意圖預告用）；noShield 時不經過護盾
function applyTakenMods(P, d, commit = true, noShield = false) {
  if (G.cls === 'knight') d *= 0.85;
  if (G.cls === 'wizard') d *= 1.1;
  if (stHas(P, 'guard')) {   // 防禦姿態；城塞之心改為架盾 −75%，擋下的量累積成下一擊的追加傷害
    const f = hasAcc('城塞之心') ? 0.5 - 0.25 * accScale() : 0.5;
    if (hasAcc('城塞之心') && commit) P.bulwark += d * (1 - f);
    d *= f;
  }
  if (stHas(P, 'potRage')) d *= 1.3;  // 狂暴藥
  // 護盾吸收
  const sh = stGet(P, 'shield');
  if (sh && commit && !noShield) { const a = Math.min(sh.v, d); sh.v -= a; d -= a; if (sh.v <= 0) stDel(P, 'shield'); }
  return d;
}

// 一次攻擊判定：命中、爆擊、傷害；回傳 {dmg, crit, miss}
function attackRoll(att, def, mult, o = {}) {
  // 命中
  let miss = false;
  if (!o.sure) {
    let eva = evaOf(def);
    if (!att.isP && att.fx.halfEva) eva /= 2;
    if (att.isP && G.cls === 'ranger') eva = 0;   // 箭無虛發
    const hitc = (att.isP ? att.hit + stSum(att, 'hitMod') : 100) - eva;
    if (def.isP && stHas(def, 'smoke')) miss = true;
    else miss = !chance(hitc / 100);
  }
  if (miss) return {dmg: 0, crit: false, miss: true};
  // 爆擊
  let critC = (att.crit + stSum(att, 'critMod') + (o.critBonus || 0)) / 100;
  let crit = o.forceCrit || chance(critC);
  if (att.isP && stHas(att, 'nextCrit')) { crit = true; stDel(att, 'nextCrit'); }
  if (!def.isP && def.fx.critImmune) crit = false;
  let critMul = 1.5;
  if (att.isP) {
    if (o.critMul2) critMul = 1.5 + 0.5 * accScale();
  }
  const d = defOf(def) * (o.defMul || 1);
  let dmg = (o.flat != null ? o.flat : atkOf(att) * mult) * (1 - d / (d + 50)) * (0.9 + rnd() * 0.2);
  if (crit) dmg *= critMul;
  dmg *= o.dmgMul || 1;
  return {dmg: Math.max(1, Math.round(dmg)), crit, miss: false};
}

// 玩家造成傷害的加成
function playerDmgMul(o = {}) {
  const {P, E} = B; let m = 1;
  if (G.cls === 'berserker' && hpFrac(P) < 0.7) {
    const steps = Math.floor((0.7 - hpFrac(P)) / 0.05 + 1e-9);
    const per = hasAcc('狂戰士之血') ? 0.03 + 0.03 * accScale() : 0.03;
    const cap = hasAcc('狂戰士之血') ? 0.4 + 0.4 * accScale() : 0.4;
    m *= 1 + Math.min(cap, steps * per);
  }
  if (hasAcc('審判天秤') && P.hp >= P.maxHp) m *= 1 + 0.2 * accScale();
  if (hasAcc('毒蛛胸針')) m *= 1 + 0.2 * accScale() * ((stHas(E, 'poison') ? 1 : 0) + (stHas(E, 'burn') ? 1 : 0));
  if (o.skill) { m *= SKILL_POWER * (P.skillMul || 1); if (ownAcc('魔力護盾') && stHas(P, 'shield')) m *= 1 + 0.2 * accScale(); }
  if (hasAcc('龍紋腰帶')) m *= 1 + P.dragonStack;
  if (!P.firstAttackDone && hasAcc('獵人斗篷扣')) m *= 1 + 0.5 * accScale();
  m *= P.nextBoost;
  m *= 1 + comboPer() * Math.min(P.combo, comboCap());   // 連擊
  if (o.skill && G.weapon.cls !== G.cls) m *= 0.75;    // 非本職武器：技能 ×0.75
  return m;
}

// ---------- 體質、傷害類型、破防 ----------
function ownAcc(n) { return hasAcc(n) && accOwn(); }
function nativeType() { return CLASS_DMG[G.cls] || 'slash'; }
function hitType() { return B.enchant && B.enchant !== 'dot' ? B.enchant : nativeType(); }
// 對目前敵人的傷害類型倍率；附魔改變類型時，效果只有本職的 75%（1.4 → 1.3、0.7 → 0.78）
function typeMul() {
  const eff = t => { const m = BODY[B.E.body][t]; return t !== nativeType() ? 1 + (m - 1) * 0.75 : m; };
  let v = eff(hitType());
  if (mythic('knight')) v = Math.max(v, eff('slash'), eff('magic'));   // 天穿：自動用最有利的類型
  return v;
}
function doBreak(E) {
  E.breakV = 0; E.charging = false; E.intent = null;
  stDel(E, 'freeze'); stAdd(E, 'broken', 1, 999);
  UI.float(E, '破防！', 'crit'); UI.log(`${E.name}被打出破綻！跳過下一次行動，受到傷害 ×${BREAK_DMG}`);
  mythicHeal(B.P, '破防');
}
// 打斷蓄力（巨人腕環、流星箭羽）：一般與精英暈眩 1 回合，頭目只取消
function interruptCharge(E, src) {
  if (!E.charging && !(E.intent && E.intent.k === 'heavy')) return false;
  E.charging = false; E.future = [];
  mythicHeal(B.P, '打斷');
  if (E.rank === '頭目') { E.intent = {k: 'attack', m: 1, hits: 1, extra: []}; UI.log(`${src}打斷了${E.name}的蓄力！`); }
  else { E.intent = null; stAdd(E, 'freeze', 1, 99); UI.float(E, '暈眩', 'status'); UI.log(`${src}打斷了蓄力，${E.name}暈眩了！`); }
  return true;
}

// 玩家打敵人一下
async function pHit(mult, o = {}) {
  const {P, E} = B;
  if (B.over) return {miss: true, dmg: 0};
  let dm = playerDmgMul(o) * (o.dmgMul || 1) * (o.echo || 1);
  if (!P.firstAttackDone && hasAcc('居合之鍔')) o.forceCrit = true;
  // 影刃耳環：敵人行動條低於一半（剛出完手）時必定爆擊
  if (shadowReady()) o.forceCrit = true;
  if (hasAcc('破軍護符') && E.charging) { o.forceCrit = true; dm *= 1 + 0.5 * accScale(); }
  if (P.iai) { P.iai = false; o.forceCrit = true; dm *= 1 + 0.5 * accScale(); UI.log('拔刀！'); }
  if (P.shout) { P.shout = false; o.forceCrit = true; o.lifesteal = (o.lifesteal || 0) + 0.3 * accScale(); }
  const holy = P.holy > 0; if (holy) { dm *= 1 + 0.25 * P.holy * accScale(); UI.log(`聖印 ×${P.holy}！`); P.holy = 0; }
  const shatter = hasAcc('永凍水晶') && stHas(E, 'freeze');
  if (shatter) { dm *= 1 + 1 * accScale(); stDel(E, 'freeze'); UI.log('碎冰！'); }
  if (G.cls === 'wizard') o.defMul = (o.defMul || 1) * 0.85;   // 魔力轟擊
  const r = attackRoll(P, E, mult, {...o, dmgMul: dm});
  const volt = !r.miss && hasAcc('雷鳴指環') && P.volt >= 3 && !o.noProc;
  P.firstAttackDone = true; P.nextBoost = 1;
  UI.attackAnim();
  if (r.miss) {
    UI.float(E, '落空', 'miss'); UI.log(`${E.name}閃開了攻擊`);
    if (E.fx.counterDodge) await enemyCounter(1);
    return r;
  }
  let d = r.dmg;
  P.landed = true;
  const tm = typeMul();
  d *= tm;
  let execute = false;
  if (stHas(E, 'broken')) {
    d *= BREAK_DMG;
    if (mythic('swordsman') && hpFrac(E) < 0.3) {   // 終焉
      if (E.rank === '頭目') { d *= 2; UI.log('終焉之誓！'); } else execute = true;
    }
  }
  const cleave = mythic('berserker');
  if (!stHas(E, 'broken')) {
    let red = 0;
    if ((tm > 1 || cleave) && !P.breakDone) { P.breakDone = true; red += cleave && tm > 1 ? 2 : 1; }
    if (P.vetBreak) { P.vetBreak = false; red += accOwn() ? 2 : 1; UI.log('老兵的反擊撼動了敵人的架勢！'); }   // 老兵勳章：不必打弱點
    if (red) { E.breakV -= red; if (E.breakV <= 0) doBreak(E); }
  }
  addCombo(1);   // 每打中一段就累積連擊
  if (mythic('rogue') && P.voidG < 40) {   // 噬時：偷行動條
    const g = Math.min(10, 40 - P.voidG); P.voidG += g; E.gauge -= g;
  }
  if (B.enchant === 'dot' && !P.enchDotDone) { P.enchDotDone = true; addDot(E, 'poison', atkOf(P) * 0.25, 3); }
  if (!E.isP && E.fx.dr) d *= 1 - E.fx.dr;
  if (E.fx.stoneStart && E.turns < E.fx.stoneStart) d *= 0.5;
  if (E.fx.iceArmor && E.iceHits < E.fx.iceArmor) { d *= 0.7; E.iceHits++; if (E.iceHits === E.fx.iceArmor) UI.log('冰甲碎裂了！'); }
  if (P.bulwark > 0) { d += P.bulwark; UI.log(`架盾累積的力量 +${Math.round(P.bulwark)}`); P.bulwark = 0; }
  const sh = stGet(E, 'shield');
  if (sh && !holy) { const a = Math.min(sh.v, d); sh.v -= a; d -= a; if (sh.v <= 0) stDel(E, 'shield'); }
  d = Math.max(r.dmg > 0 ? 1 : 0, Math.round(d));
  if (execute) { d = Math.max(d, E.hp); UI.log(`終焉之誓！${E.name}被處決了`); }
  E.hp = Math.max(0, E.hp - d);
  UI.float(E, d, r.crit ? 'crit' : 'dmg'); UI.hitEnemy(r.crit);
  // 吸血
  let ls = 0;
  if (G.cls === 'witch') ls += 0.08;
  if (o.lifesteal) ls += o.lifesteal;
  if (hasAcc('不死圖騰') && stHas(P, 'rage')) ls += undyingSteal();
  if (ls > 0) {
    const over = d * ls - (P.maxHp - P.hp);
    healUnit(P, d * ls);
    if (over > 0 && ownAcc('血月墜飾')) P.pact = Math.min(10, P.pact + 1);   // 血契
  }
  // 血牙項鍊：用攻擊討回血債
  if (hasAcc('血牙項鍊') && P.debt > 0) { const h = Math.min(d * 0.5 * accScale(), P.debt); P.debt -= h; healUnit(P, h); }
  if (volt) { P.volt = 0; UI.log('雷鳴！'); E.gauge -= 30; await pHit(1.5 * accScale(), {sure: true, noProc: true}); if (B.over) return {...r, dmg: d}; }
  // 爆擊相關
  if (r.crit) {
    if (ownAcc('劍心之石')) { const c = P.cds.map((v, i) => i).filter(i => P.cds[i] > 0); if (c.length) P.cds[pick(c)]--; }
  }
  if (hasAcc('薔薇胸針')) P.roseStacks = Math.min(5, P.roseStacks + 1);
  // 反彈、反擊、灼燒攻擊者
  if (E.fx.reflect && E.hp > 0) await dealRaw(P, d * E.fx.reflect, '反彈', 'dmg');
  if (E.fx.burnAttacker && chance(E.fx.burnAttacker)) addDot(P, 'burn', E.atk * 0.3, 3);
  await checkDeathAsync(E);
  if (!B.over && E.fx.counter && chance(E.fx.counter)) await enemyCounter(1);
  // 爆擊追擊（劍姬被動）
  if (!B.over && r.crit && G.cls === 'fencer' && !o.noProc && chance(0.25)) { UI.log('華麗連刺！'); await pHit(0.5, {noProc: true}); }
  return {...r, dmg: d};
}
function addDot(u, k, v, turns) {
  if (u.isP && mythic('cleric')) k = 'mercy';   // 女神之淚：中毒、灼燒變成回復
  const s = stGet(u, k);
  if (s) { s.v = Math.max(s.v, v); s.turns += turns; }
  else stAdd(u, k, v, turns);
  UI.float(u, k === 'mercy' ? '慈悲' : k === 'poison' ? '中毒' : '灼燒', k === 'mercy' ? 'heal' : 'status');
}
async function enemyCounter(mult) {
  const {P, E} = B;
  UI.log(`${E.name}反擊！`);
  await eHit(mult, {counter: true});
}

// 防禦：部分飾品會把防禦換成別的動作；按鈕顯示與實際效果共用這個判斷
function guardKind() {
  const {P} = B;
  if (hasAcc('月影耳墜')) return 'mikiri';
  if (ownAcc('鷹眼單片鏡')) return 'aim';
  if (hasAcc('魔力護盾')) return 'mshield';
  if (hasAcc('狂戰士之血') && hpFrac(P) < 0.3) return 'shout';
  if (ownAcc('氣功念珠')) return 'qi';
  if (hasAcc('城塞之心')) return 'bulwark';
  if (hasAcc('居合之鍔')) return 'iai';
  return 'guard';
}
const GUARD_INFO = {
  guard:   {name: '防禦', sub: '減傷・冷卻 −1', tip: '防禦：到你下一次行動前，受到的傷害減半，並讓技能冷卻多減 1。'},
  bulwark: {name: '架盾', sub: '大幅減傷・蓄力', tip: '架盾（城塞之心）：大幅減少受到的傷害，擋下的力量會加到下一次攻擊；技能冷卻多減 1。'},
  iai:     {name: '納刀', sub: '減傷・下一擊拔刀', tip: '納刀（居合之鍔）：受到的傷害減半，下一次攻擊必定爆擊並強化；技能冷卻多減 1。'},
  mikiri:  {name: '見切架式', sub: '讀招・反擊', tip: '見切架式（月影耳墜）：到你下一次行動前，蓄力重擊與強力攻擊必定閃開並強力反擊；一般攻擊只會減半傷害；技能冷卻多減 1。'},
  aim:     {name: '瞄準', sub: '強化瞄準射擊', tip: '瞄準（鷹眼單片鏡）：下一次瞄準射擊大幅強化並必定爆擊；這次不會減傷；技能冷卻多減 1。'},
  mshield: {name: '魔力護盾', sub: '護盾・技能強化', tip: '魔力護盾：產生吸收傷害的護盾，護盾存在時技能更強；技能冷卻多減 1。'},
  shout:   {name: '怒吼', sub: '下一擊必爆・吸血', tip: '怒吼（狂戰士之血，生命低時）：不減傷，下一次攻擊必定爆擊並吸取生命；技能冷卻多減 1。'},
  qi:      {name: '運氣', sub: '回復・累積氣', tip: '運氣（氣功念珠）：回復生命並累積氣，氣功護體會依氣的層數持續更久；不減傷；技能冷卻多減 1。'},
};
async function doGuard() {
  const {P} = B, kind = guardKind(), info = GUARD_INFO[kind];
  for (let i = 0; i < 3; i++) if (P.cds[i] > 0) P.cds[i]--;
  switch (kind) {
    case 'mikiri': stAdd(P, 'guard', 1, 999); stAdd(P, 'mikiriStance', 1, 999); break;
    case 'aim': stAdd(P, 'aim', 1, 999); break;
    case 'mshield': stAdd(P, 'shield', Math.round(atkOf(P) * 2 * accScale()), 999); break;
    case 'shout': P.shout = true; break;
    case 'qi': healUnit(P, P.maxHp * 0.08); P.qi = Math.min(3, P.qi + 1); break;
    case 'iai': stAdd(P, 'guard', 1, 999); P.iai = true; break;
    default: stAdd(P, 'guard', 1, 999);
  }
  UI.float(P, info.name, 'status'); UI.log(`${G.name}：${info.name}`);
  await sleep(300);
}

// ---------- 玩家回合 ----------
async function playerTurn() {
  const {P} = B;
  P.turns++;
  if (!(await turnStart(P))) { turnEnd(P); return; }
  if (B.over) return;
  // 使用道具不消耗回合：用完繼續選擇行動
  let act = await UI.waitAction(B);
  while (act.type === 'item' && !B.over) {
    await useItemInBattle(act.idx);
    if (B.over) break;
    act = await UI.waitAction(B, true);
  }
  if (B.over) return;
  P.noDmgTurns++;
  P.landed = false; P.breakDone = false; P.enchDotDone = false; P.voidG = 0;
  const echo = P.echo; P.echo = null;
  if (act.type === 'attack') await normalAttack();
  else if (act.type === 'skill') await useSkill(act.idx);
  else if (act.type === 'guard') await doGuard();
  if (act.type !== 'attack') P.chain = 0;
  // 騎兵號角：速度比敵人快時，第一次行動附帶衝鋒，敵人行動條 −50
  if (P.turns === 1 && hasAcc('騎兵號角') && act.type !== 'guard' && spdOf(P) > spdOf(B.E) && !B.over) { B.E.gauge -= 50 * accScale(); UI.log('衝鋒！敵人的行動被延後了'); }
  // 創世：上一回合的技能以 1/3 威力回響
  if (echo != null && !B.over) { P.landed = false; P.breakDone = false; await useSkill(echo, true); }
  // 召喚物追擊
  if (!B.over && B.summonP && B.summonP.turns > 0) {
    B.summonP.turns--;
    UI.log('深淵魔物攻擊！');
    await pHit(0.8 * B.summonP.mul, {sure: true, lifesteal: 0.3, skill: true});
  }
  turnEnd(P);
  afterPlayerTurnGauge(P);
  if (!B.over) updateIntentHP();
}

// 噬時偷到的行動條、永恆之舞的再行動
function afterPlayerTurnGauge(P) {
  if (P.voidG > 0) { P.gauge = Math.min(90, P.voidG); P.voidG = 0; }
  if (P.extraAct) { P.extraAct = false; P.gauge = 100; }
}
async function normalAttack() {
  const {P} = B;
  let mult = 1;
  if (P.noDmgTurns >= 4 && hasAcc('舞者腳鍊')) { P.nextBoost *= 1 + 1 * accScale(); P.noDmgTurns = 0; UI.log('舞姬之步！傷害加倍'); }
  const hits = hasAcc('百裂綁手') ? 2 : 1;
  const hm = hasAcc('百裂綁手') ? 0.6 * accScale() + (1 - accScale()) * 1 : 1;
  for (let i = 0; i < hits && !B.over; i++) {
    const r = await pHit(mult * hm, {normal: true});
    if (!r.miss) {
      if (hasAcc('蛇牙項鍊')) {   // 疊毒：每次 1 層，最多 5 層
        const E = B.E; if (!stHas(E, 'poison')) E.venom = 0; E.venom = Math.min(5, E.venom + 1);
        stDel(E, 'poison'); stAdd(E, 'poison', atkOf(P) * 0.15 * E.venom * accScale(), 3); UI.float(E, `毒 ×${E.venom}`, 'status');
      }
      if (hasAcc('巨人腕環') && i === 0) interruptCharge(B.E, '重擊');
      if (hasAcc('咒術人偶') && stHas(B.E, 'cursed')) {   // 普通攻擊延長詛咒（最多 5 回合）
        B.E.st.forEach(x => { if (x.k === 'cursed' || x.curse) x.turns = Math.min(5, x.turns + 1); });
      }
      if (hasAcc('金幣袋') && !B.stole && chance(0.2 * accScale())) {
        B.stole = true; const sid = rollSpecial('常見'); const rr = addItem(sid); UI.log(rr.ok ? `偷到了 ${sid}！` : '偷到東西，但道具欄滿了');
      }
      if (hasAcc('熔岩寶珠') && chance(0.2 * accScale())) addDot(B.E, 'burn', atkOf(P) * 0.3 * dotMul(), 3);
    }
    if (hits > 1) await sleep(180);
  }
  if (B.over) return;
  // 雙刃徽章：連續普通攻擊累積連斬（第 2 次 +1 斬、第 3 次起 +2 斬）
  if (hasAcc('雙刃徽章')) {
    P.chain++;
    const extra = P.chain >= 3 ? 2 : P.chain >= 2 ? 1 : 0;
    for (let k = 0; k < extra && !B.over; k++) { UI.log('連斬！'); await pHit(0.6 * accScale(), {}); await sleep(120); }
  }
  if (hasAcc('百裂綁手') && ++P.normals % 3 === 0 && accOwn()) P.cds[0] = Math.max(0, P.cds[0] - 2);
  if (!B.over && G.cls === 'monk' && chance(0.25)) { UI.log('連打！'); await pHit(0.5, {}); }
}
function dotMul() { return 1; }

// 實際會套用的冷卻（事件、飾品會改變）；技能按鈕也用這個顯示
function skillCd(i) {
  let cd = SKILLS[G.cls][i].cd;
  if (B && B.skillHalf) cd = Math.ceil(cd / 2);
  if (G.cls === 'knight' && i === 2 && hasAcc('騎兵號角')) cd -= 2;
  if (G.cls === 'cleric' && i === 2 && hasAcc('審判天秤')) cd -= 3;
  return Math.max(1, cd);
}
async function useSkill(i, echo = false) {
  const {P, E} = B;
  const sk = SKILLS[G.cls][i];
  if (echo) return echoSkill(i, sk);
  P.cds[i] = skillCd(i);
  P.chain = 0;
  P.skillMul = 1;
  if (ownAcc('審判之槍穗') && P.judge) { P.skillMul *= 1 + 0.2 * P.judge * accScale(); UI.log(`審判 ×${P.judge}！`); P.judge = 0; }
  if (ownAcc('血月墜飾') && P.pact) { P.skillMul *= 1 + 0.05 * P.pact * accScale(); P.pact = 0; }
  if (hasAcc('雷鳴指環') && P.lastSkill !== i) P.volt = Math.min(3, P.volt + 1);
  P.lastSkill = i;
  if (ownAcc('賢者之石')) P.cds.forEach((v, j) => { if (j !== i && v > 0) P.cds[j]--; });
  if (mythic('wizard')) P.echo = i;
  UI.skillBanner(sk.name);
  UI.log(`${G.name}使用了${sk.name}`);
  await skillBody(i, 1);
  P.skillMul = 1;
}
// 回響：不設冷卻、不觸發飾品，只重現傷害與數值效果
async function echoSkill(i, sk) {
  const {P} = B;
  P.skillMul = 1;
  UI.skillBanner('回響・' + sk.name);
  UI.log(`${sk.name}的回響！`);
  await skillBody(i, 1 / 3);
  P.skillMul = 1;
}
async function skillBody(i, pw) {
  const {P, E} = B;
  const echo = pw < 1;
  const s = (G.weapon.cls === G.cls ? 1 : 0.75) * pw;   // 非本職武器：效果 ×0.75；回響再 ×1/3
  const o = echo ? {skill: true, echo: pw} : {skill: true};
  const multiHit = async (n, m, extra = {}) => { for (let k = 0; k < n && !B.over; k++) { await pHit(m, {...o, ...extra}); await sleep(110); } };
  switch (G.cls + i) {
    case 'swordsman0': await multiHit(2, 0.8); break;
    case 'swordsman1': if (!echo) { stAdd(P, 'parry', 1, 999); UI.float(P, '格擋架勢', 'status'); } break;
    case 'swordsman2': await pHit(3.5, {...o, forceCrit: true}); break;
    case 'knight0': { const r = await pHit(1.3, o); if (!r.miss) stAdd(E, 'atkMod', -0.2 * s, 2); break; }
    case 'knight1': stAdd(P, 'defMod', 1 * s, 3); UI.float(P, '防禦 ×2', 'status'); break;
    case 'knight2': await pHit(0, {...o, flat: atkOf(P) * 3 + defOf(P) * 2}); break;
    case 'rogue0': {
      await pHit(1.2, {...o, critBonus: 50});
      const ps = stGet(E, 'poison');
      if (!B.over && ps && ownAcc('蛇牙項鍊') && !echo) { stDel(E, 'poison'); E.venom = 0; await dealRaw(E, Math.round(ps.v * ps.turns * BODY[E.body].dot), '毒爆', 'poison'); }
      break;
    }
    case 'rogue1': if (!echo) { stAdd(P, 'smoke', 1, 999); stAdd(P, 'nextCrit', 1, 999); UI.float(P, '煙幕', 'status'); } break;
    case 'rogue2': await multiHit(6, 0.6); break;
    case 'wizard0': {
      const bs = stGet(E, 'burn');
      const r = await pHit(1.6, {...o, defMul: 0.7});
      if (!r.miss && !B.over && bs && ownAcc('熔岩寶珠') && !echo) { stDel(E, 'burn'); await dealRaw(E, Math.round(bs.v * bs.turns * BODY[E.body].dot), '爆燃', 'burn'); }
      break;
    }
    case 'wizard1': {
      const r = await pHit(1.8, o);
      if (!r.miss && !B.over && !echo) {
        const resist = E.rank === '頭目' || (E.rank === '精英' && chance(0.5));
        if (resist) { stAdd(E, 'slow', 1, 1); UI.float(E, '減速', 'status'); }
        else { stAdd(E, 'freeze', 1 + (hasAcc('永凍水晶') ? 1 : 0), 99); UI.float(E, '凍結', 'status'); }
      }
      break;
    }
    case 'wizard2': await pHit(5.0, o); break;
    case 'berserker0': await pHit(1.8, o); break;
    case 'berserker1': stAdd(P, 'atkMod', 0.5 * s, 3); stAdd(P, 'defMod', -0.3 * pw, 3); if (!echo) stAdd(P, 'rage', 1, 3); UI.float(P, '狂怒', 'status'); break;
    case 'berserker2': await multiHit(5 + (hasAcc('暴風腰帶') ? 2 : 0), 0.8, {lifesteal: 0.2 * s}); break;
    case 'cleric0': { await pHit(1.3, o); healUnit(P, P.maxHp * 0.08 * s * baseStats().healMul); break; }
    case 'cleric1': {
      const h = healUnit(P, P.maxHp * 0.4 * s * baseStats().healMul);
      P.st = P.st.filter(x => !['poison', 'burn', 'slow'].includes(x.k) && !(x.k.endsWith('Mod') && x.v < 0));
      if (hasAcc('聖盾徽章') && !echo) stAdd(P, 'shield', Math.round(P.maxHp * 0.4 * 0.5), 999);
      UI.float(P, '淨化', 'status'); break;
    }
    case 'cleric2': await pHit(3.5, o); stAdd(P, 'hot', 0.08 * s, 3); break;
    case 'fencer0': { await pHit(1.4, o); if (!B.over && chance(0.4)) await pHit(0.7, o); break; }
    case 'fencer1': stAdd(P, 'evaMod', 30 * s, 3); if (!echo) stAdd(P, 'mikiri', 1, 3); UI.float(P, '見切', 'status'); break;
    case 'fencer2': {
      const rose = hasAcc('薔薇胸針') && !echo ? 1 + 0.2 * P.roseStacks : 1; if (!echo) P.roseStacks = 0;
      await multiHit(4, 0.7 * rose); if (!B.over) await pHit(1.2 * rose, {...o, forceCrit: true}); break;
    }
    case 'witch0': await pHit(1.3, {...o, lifesteal: 0.5 * s}); break;
    case 'witch1': {
      stAdd(E, 'atkMod', -0.25 * s, 3, {curse: true}); stAdd(E, 'defMod', -0.25 * s, 3, {curse: true});
      if (!echo) { stAdd(E, 'cursed', 1, 3); E.cursed = true; } UI.float(E, '詛咒', 'status'); break;
    }
    case 'witch2': await pHit(2.5, {...o, lifesteal: 0.3}); if (!echo) B.summonP = {turns: 2 + (hasAcc('深淵之鑰') ? 2 : 0), mul: 1}; break;
    case 'ranger0': {
      const aim = !echo && stHas(P, 'aim'); if (aim) { stDel(P, 'aim'); UI.log('瞄準完成！'); }
      await pHit(1.6, {...o, sure: true, forceCrit: aim || undefined, dmgMul: aim ? 2 : 1}); break;
    }
    case 'ranger1': {
      const r = await pHit(1.2, o);
      if (!r.miss) addDot(E, 'poison', atkOf(P) * 0.4 * s, 4);
      break;
    }
    case 'ranger2': if (ownAcc('流星箭羽') && !echo) interruptCharge(E, '箭雨'); await multiHit(8, 0.5); break;
    case 'monk0': await multiHit(4, 0.4); break;
    case 'monk1': {
      const ext = ownAcc('氣功念珠') && !echo ? P.qi : 0; if (!echo) P.qi = 0;
      healUnit(P, P.maxHp * 0.2 * s * baseStats().healMul); stAdd(P, 'defMod', 0.5 * s, 3 + ext); if (!echo) stAdd(P, 'qigong', 1, 3 + ext); break;
    }
    case 'monk2': await multiHit(8, 0.3); if (!B.over) await pHit(2.0, o); break;
  }
}

// 回傳 null 表示可以用；否則回傳不能用的原因
function itemBlock(id) {
  const it = ITEMS[id], {E} = B;
  if (it.category !== '特殊道具') return null;
  if (it.use === 'explore') return `${id}不能在戰鬥中使用`;
  if (it.key === 'escape' && E.rank === '頭目') return '頭目戰無法逃跑';
  if (it.key === 'stun' && E.rank === '頭目' && !(E.charging || (E.intent && ['charge', 'heavy', 'special'].includes(E.intent.k)))) return '頭目現在沒有可以打斷的行動';
  return null;
}
async function useItemInBattle(idx) {
  const {P, E} = B;
  const id = G.inv[idx].id;
  const block = itemBlock(id);
  if (block) { toast(block); return; }
  removeAt(idx, 1);
  const it = ITEMS[id];
  UI.log(`${G.name}使用了${id}`);
  if (it.category === '回復') {
    let amt = P.maxHp * it.effect.heal_pct / 100 * baseStats().healMul;
    if (G.cls === 'cleric') amt *= 2;
    const over = amt - (P.maxHp - P.hp);
    healUnit(P, amt);
    if (over > 0 && hasAcc('天使之羽')) {   // 溢出的回復變成守護天使：每 20% 最大生命擋下一次攻擊
      const n = Math.min(3, Math.floor(over * accScale() / (P.maxHp * 0.2) + 1e-9));
      if (n > 0) { P.angel = Math.min(3, (P.angel || 0) + n); UI.float(P, `守護天使 ×${P.angel}`, 'status'); UI.log(`守護天使降臨，會擋下接下來 ${P.angel} 次攻擊`); }
    }
  } else if (it.category === '特殊道具') {
    switch (it.key) {
      case 'stun':
        if (E.charging || (E.intent && E.intent.k === 'heavy')) mythicHeal(P, '打斷');
        E.charging = false; E.future = [];
        if (E.rank === '頭目') { E.intent = {k: 'attack', m: 1, hits: 1, extra: []}; UI.log(`${E.name}的行動被打斷了！`); }
        else { E.intent = null; stAdd(E, 'freeze', 1, 99); UI.float(E, '暈眩', 'status'); UI.log(`${E.name}被震暈了，下一次行動跳過！`); }
        break;
      case 'escape': B.over = true; B.result = 'flee'; UI.log('你丟出煙霧彈，趁亂逃走了'); break;
      case 'fire': await dealRaw(E, Math.round(atkOf(P) * 2), '火焰', 'burn'); if (!B.over) addDot(E, 'burn', atkOf(P) * 0.3 * dotMul(), 3); break;
      case 'ice': {
        const resist = E.rank === '頭目' || (E.rank === '精英' && chance(0.5));
        if (resist) { stAdd(E, 'slow', 1, 1); UI.float(E, '減速', 'status'); }
        else { stAdd(E, 'freeze', 1, 99); UI.float(E, '凍結', 'status'); }
        break;
      }
      case 'cure':
        P.st = P.st.filter(s => !(['poison', 'burn', 'slow', 'freeze', 'cursed'].includes(s.k) || (s.k.endsWith('Mod') && s.v < 0)));
        healUnit(P, P.maxHp * 0.15); UI.float(P, '淨化', 'status'); break;
      case 'mirror': stAdd(P, 'mirror', 1, 999); UI.float(P, '鏡盾', 'status'); break;
      case 'hourglass': for (let i = 0; i < 3; i++) P.cds[i] = 0; UI.float(P, '冷卻歸零', 'status'); break;
      case 'berserk': stAdd(P, 'atkMod', 0.5, 999); stAdd(P, 'potRage', 1, 999); UI.float(P, '狂暴', 'status'); break;
      case 'lucky': B.lucky = true; UI.float(P, '好運', 'status'); break;
      case 'ench_slash': case 'ench_magic': case 'ench_dot':
        B.enchant = it.key.slice(5); UI.float(P, `附魔：${DMG_NAMES[B.enchant]}`, 'status');
        UI.log(B.enchant === 'dot' ? '武器塗上腐蝕毒液，攻擊會讓敵人中毒' : `武器附上${DMG_NAMES[B.enchant]}之力，攻擊改為${DMG_NAMES[B.enchant]}傷害`); break;
    }
  } else if (it.category === '永久') {
    const stat = it.stat === '任選' ? await UI.chooseStat() : it.stat;
    withMaxHpChange(() => { G.seeds[stat]++; });
    const bs = baseStats(); if (bs.hp > P.maxHp) P.hp += bs.hp - P.maxHp; P.maxHp = bs.hp; P.atk = bs.atk; P.def = bs.def; P.spd = bs.spd; P.crit = bs.crit; P.eva = bs.eva;
    UI.float(P, `${STAT_NAMES[stat]} +1 點`, 'status');
  }
  await sleep(300);
}

// ---------- 敵人回合 ----------
// ---------- 敵人意圖：事先決定下一次行動並顯示給玩家 ----------
// 週期性特殊技能：精英與頭目第一次行動就發動，之後每 n 次行動一次；一般怪物第 n 次才發動
function onCycle(E, n, t) { return E.rank === '基本' ? t % n === 0 : (t - 1) % n === 0; }
function chargeChance(E) { return E.rank === '頭目' ? 0.25 : E.rank === '精英' ? 0.2 : 0.15; }
// 依回合數與蓄力狀態擲出一個意圖（不含依血量觸發的自爆、喝藥）
function rollIntent(E, t, charging) {
  const fx = E.fx;
  let it;
  if (charging) it = {k: 'heavy', m: E.rank === '頭目' ? 3 : 2.5};
  else if (fx.healEvery && t % fx.healEvery[0] === 0) it = {k: 'heal'};
  else if (fx.shieldEvery && onCycle(E, fx.shieldEvery[0], t)) it = {k: 'shield'};
  else if (fx.randomAct) it = {k: 'rand', r: ri(0, 2)};
  else if (fx.every && onCycle(E, fx.every[0], t)) { const ex = fx.every[2] || {}; it = {k: 'special', m: ex.hits ? 1 : fx.every[1], hits: ex.hits || 1}; }
  else if (t > 1 && chance(chargeChance(E))) it = {k: 'charge'};
  else {
    let hits = 1, m = 1;
    if (fx.multi) { hits = fx.multi[0]; m = fx.multi[1]; }
    if (fx.dualLow && hpFrac(E) < fx.dualLow) hits = 2;
    if (fx.first && t === 1) m *= fx.first;
    it = {k: 'attack', m, hits};
  }
  it.extra = [];
  if (fx.summon && onCycle(E, fx.summon[0], t)) it.extra.push('召喚幫手');
  if (fx.cdEvery && onCycle(E, fx.cdEvery[0], t)) it.extra.push('封印技能');
  if (fx.stripEvery && onCycle(E, fx.stripEvery, t)) it.extra.push('消除增益');
  return it;
}
function planIntent() {
  const {E} = B, fx = E.fx, t = E.turns + 1;
  // 世界樹：意圖事先排好，玩家能看到接下來 3 次
  let it = E.future.shift();
  if (!it || (it.k === 'heavy') !== !!E.charging) { E.future = []; it = rollIntent(E, t, E.charging); }
  if (!E.charging) {
    if (fx.selfDestruct && hpFrac(E) < fx.selfDestruct[0]) it = {k: 'boom', m: fx.selfDestruct[1], extra: it.extra};
    else if (fx.potionOnce && !E.potionDone && hpFrac(E) < fx.potionOnce[0]) it = {k: 'potion', extra: it.extra};
  }
  E.intent = it;
  // 獵人斗篷扣：敵人開始蓄力或預告強力攻擊時，行動條 +50
  if (hasAcc('獵人斗篷扣') && (it.k === 'heavy' || it.k === 'special') && E.turns > 0) { B.P.gauge = Math.min(100, B.P.gauge + 50 * accScale()); UI.log('察覺到危險，你搶先一步行動！'); }
  if (mythic('ranger')) {
    let ch = it.k === 'charge';
    while (E.future.length < 2) {
      const last = E.future[E.future.length - 1]; if (last) ch = last.k === 'charge';
      E.future.push(rollIntent(E, t + 1 + E.future.length, ch));
    }
  } else E.future = [];
}
// 玩家行動後，血量觸發的行為（自爆、喝藥）要即時反映在意圖上
function updateIntentHP() {
  const {E} = B, fx = E.fx, it = E.intent;
  if (!it || ['heavy', 'boom', 'potion'].includes(it.k)) return;
  const extra = it.extra;
  if (fx.selfDestruct && hpFrac(E) < fx.selfDestruct[0]) E.intent = {k: 'boom', m: fx.selfDestruct[1], extra};
  else if (fx.potionOnce && !E.potionDone && hpFrac(E) < fx.potionOnce[0]) E.intent = {k: 'potion', extra};
}
// 預估一下對玩家的傷害（不含爆擊與浮動）
function shadowReady() { return hasAcc('影刃耳環') && B.E.gauge < 50 * accScale(); }   // 影刃耳環：敵人剛出完手
// 不死圖騰：狂怒期間生命越低吸取越多（每少 10% 生命 +6%，最多 50%）
function undyingSteal() { return Math.min(0.5, Math.floor((1 - hpFrac(B.P)) * 10 + 1e-9) * 0.06) * accScale(); }
function oathReady() { return stHas(B.P, 'guard') && hasAcc('守誓者之盾') && B.P.oathBlocks < 2; }
// 敵人回合開始時才會觸發的強化（狂暴、第 2 階段），預告要先算進去
function pendingAtkMul(E) {
  let k = 1; const fx = E.fx;
  if (fx.enrage && !E.enraged && hpFrac(E) < fx.enrage[0]) k *= 1 + fx.enrage[1];
  if (fx.phases && E.phase < 2 && hpFrac(E) < 0.66) k *= 1.3;
  return k;
}
// 預估一下對玩家的單下傷害（與 eHit 同一套減傷，不含爆擊、浮動與護盾）
function estOne(m, o = {}) {
  const {P, E} = B, d = defOf(P);
  if ((o.heavy || o.special) && oathReady()) return 0;
  let mult = m;
  if (E.fx.execute && hpFrac(P) < E.fx.execute[0]) mult *= E.fx.execute[1];
  let x = atkOf(E) * pendingAtkMul(E) * mult * (1 - d / (d + 50));
  if ((o.heavy || o.special) && hasAcc('鐵布衫')) x *= 1 - 0.5 * accScale();
  return applyTakenMods(P, x, false);
}
// 第一下會被完全擋掉的狀態
function firstBlock(o = {}) {
  const P = B.P;
  if (stHas(P, 'parry')) return '格擋';
  if (stHas(P, 'mikiriStance') && (o.heavy || o.special)) return '見切';
  if (stHas(P, 'mirror')) return '鏡盾';
  if (P.angel > 0) return '守護天使';
  if (G.blockHits > 0) return '結界';
  if (!o.sure && stHas(P, 'smoke')) return '煙幕';
  return null;
}
// 預告文字：「約 N」或「0（格擋）」
function estText(m, hits = 1, o = {}) {
  const P = B.P, blk = firstBlock(o), n = hits - (blk ? 1 : 0);
  if (n <= 0) return `0，${blk}擋下`;
  if ((o.heavy || o.special) && oathReady()) return '0，守誓之盾擋下';
  let total = estOne(m, o) * n;
  const sh = stGet(P, 'shield'); if (sh) total = Math.max(0, total - sh.v);
  if (stHas(P, 'unyield')) return `約 ${Math.round(total)}，延後承受`;
  return `約 ${Math.max(blk ? 0 : 1, Math.round(total))}${blk ? `，${blk}擋下第一下` : ''}${sh ? '，護盾吸收後' : ''}`;
}
function estHit(m) { return Math.max(1, Math.round(estOne(m))); }
function intentInfo() {
  if (B && stHas(B.E, 'broken')) return {text: `破防中：跳過下一次行動，受到傷害 ×${BREAK_DMG}`, warn: false};
  if (B && stHas(B.E, 'freeze')) return {text: '凍結／暈眩中：跳過下一次行動', warn: false};
  const it = B && B.E.intent; if (!it) return null;
  let t, warn = false;
  switch (it.k) {
    case 'attack': t = `攻擊${it.hits > 1 ? ` ${it.hits} 連擊` : ''}（${estText(it.m, it.hits)}）`; break;
    case 'charge':
      if (stHas(B.E, 'cursed') && hasAcc('咒術人偶')) { t = '想要蓄力，但會被詛咒反噬'; break; }
      t = '蓄力中：下一次行動會重擊'; warn = true; break;
    case 'heavy': t = `蓄力重擊 ×${it.m}（${estText(it.m, 1, {heavy: true})}）`; warn = true; break;
    case 'special': t = `強力攻擊${it.hits > 1 ? ` ${it.hits} 連擊` : ''}（${estText(it.m, it.hits, {special: true})}）${stHas(B.E, 'cursed') && hasAcc('咒術人偶') ? '，有一半機率被詛咒反噬' : ''}`; warn = true; break;
    case 'boom': t = `準備自爆（${estText(it.m, 1, {sure: true})}）`; warn = true; break;
    case 'potion': t = '準備喝藥回復'; break;
    case 'heal': t = '準備回復生命'; break;
    case 'shield': t = '準備展開護盾'; break;
    case 'rand': t = ['準備重擊 ×2（' + estText(2) + '）', '準備吃糖回復', '準備讓你頭昏（減速）'][it.r]; warn = it.r === 0; break;
  }
  if (it.extra && it.extra.length) t += '＋' + it.extra.join('、');
  // 第 3 階段每 3 次行動追加終焉一擊；手下每回合攻擊
  const E = B.E;
  if (it.k === 'attack' && E.fx.phases && (E.phase >= 3 || hpFrac(E) < 0.33) && (E.turns + 1) % 3 === 0) { t += `＋終焉一擊（${estText(4)}）`; warn = true; }
  const mons = B.summonsE.filter(x => x.turns > 0);
  if (mons.length) { const d = defOf(B.P); t += `＋手下攻擊（約 ${Math.round(mons.reduce((a, x) => a + applyTakenMods(B.P, atkOf(E) * x.mul * (1 - d / (d + 50)), false), 0))}）`; }
  if (mythic('ranger') && B.E.future.length) t += '　→ ' + B.E.future.map(intentShort).join(' → ');
  return {text: t, warn};
}
function intentShort(it) {
  const m = {attack: it.hits > 1 ? '連擊' : '攻擊', charge: '蓄力', heavy: '重擊', special: '強力攻擊', boom: '自爆', potion: '喝藥', heal: '回復', shield: '護盾',
    rand: ['重擊', '吃糖', '頭昏'][it.r]}[it.k] || '？';
  return m + (it.extra && it.extra.length ? '＋' + it.extra.join('、') : '');
}

async function enemyTurn() {
  await enemyAct();
  if (!B.over && !B.E.intent) planIntent();
}
async function enemyAct() {
  const {P, E} = B;
  E.turns++;
  if (!(await turnStart(E))) { turnEnd(E); return; }
  if (B.over) return;
  const fx = E.fx;
  // 一次性的狀態變化
  if (fx.curseOnce && E.turns === 1) { stAdd(P, 'atkMod', -fx.curseOnce, 3); stAdd(P, 'defMod', -fx.curseOnce, 3); UI.float(P, '詛咒', 'status'); UI.log(`${E.name}對你施加了詛咒`); }
  if (fx.enrage && !E.enraged && hpFrac(E) < fx.enrage[0]) { E.enraged = fx.enrage[1]; UI.log(`${E.name}狂暴了！`); UI.float(E, '狂暴', 'status'); }
  if (fx.phases) { const p = hpFrac(E) < 0.33 ? 3 : hpFrac(E) < 0.66 ? 2 : 1; if (p > E.phase) { E.phase = p; UI.log(`${E.name}進入第 ${p} 階段！`); } }
  if (fx.batForm && !E.batDone && hpFrac(E) < 0.5) { E.batDone = true; E.batTurns = 2; UI.log(`${E.name}化為蝙蝠群！`); }
  if (fx.summonAt && !E.summonAtDone && hpFrac(E) < fx.summonAt[0]) { E.summonAtDone = true; B.summonsE.push({turns: 99, mul: fx.summonAt[1]}); UI.log(`${E.name}召喚了手下！`); }
  if (fx.randBuff) { const k = pick(['atkMod', 'defMod', 'spdMod']); stAdd(E, k, fx.randBuff, 999); UI.float(E, '強化', 'status'); }
  const it = E.intent || {k: 'attack', m: 1, hits: 1};
  E.intent = null;
  // 自爆
  if (it.k === 'boom') {
    UI.log(`${E.name}自爆了！`);
    await eHit(fx.selfDestruct[1], {sure: true});
    E.hp = 0; E.selfDestructed = true; await checkDeathAsync(E); turnEnd(E); return;
  }
  // 喝藥
  if (it.k === 'potion') {
    E.potionDone = true; healUnit(E, E.maxHp * fx.potionOnce[1]); UI.log(`${E.name}喝下了藥水`); await sleep(400); turnEnd(E); return;
  }
  // 週期行為
  if (it.k === 'heal') { healUnit(E, E.maxHp * fx.healEvery[1]); UI.log(`${E.name}回復了生命`); await sleep(400); turnEnd(E); return; }
  if (it.k === 'shield') { stAdd(E, 'shield', Math.round(atkOf(E) * fx.shieldEvery[1]), 999); UI.float(E, '護盾', 'status'); UI.log(`${E.name}展開了護盾`); await sleep(400); turnEnd(E); return; }
  if (fx.cleanseEvery && E.turns % fx.cleanseEvery[0] === 0) { E.st = E.st.filter(s => !(['poison', 'burn', 'slow', 'cursed'].includes(s.k) || (s.k.endsWith('Mod') && s.v < 0))); healUnit(E, E.maxHp * fx.cleanseEvery[1]); UI.log(`${E.name}淨化了自己`); }
  if (fx.stripEvery && onCycle(E, fx.stripEvery, E.turns)) {
    const pos = P.st.filter(s => (s.k.endsWith('Mod') && s.v > 0) || ['shield', 'smoke', 'nextCrit', 'parry', 'mikiri', 'hot'].includes(s.k));
    if (pos.length) { const t = pick(pos); P.st = P.st.filter(s => s !== t); UI.log(`${E.name}消除了你的一個增益`); }
  }
  if (fx.cdEvery && onCycle(E, fx.cdEvery[0], E.turns)) { const n = unlockedSkills(G.floor); if (n) { P.cds[ri(0, n - 1)] += fx.cdEvery[1]; UI.log('技能被封印了！'); } }
  if (fx.summon && onCycle(E, fx.summon[0], E.turns)) { B.summonsE.push({turns: fx.summon[2], mul: fx.summon[1]}); UI.log(`${E.name}召喚了幫手`); }
  // 攻擊
  if (it.k === 'charge' && stHas(E, 'cursed') && hasAcc('咒術人偶')) {
    UI.log(`${E.name}想蓄力，卻被詛咒反噬！`); await dealRaw(E, Math.round(atkOf(P) * accScale()), '詛咒反噬', 'dmg');
  } else if (it.k === 'charge') {
    E.charging = true; UI.enemySpecial(); UI.float(E, '蓄力', 'status'); UI.log(`${E.name}正在蓄力……`); await sleep(400);
  } else if (it.k === 'heavy') {
    E.charging = false; UI.enemySpecial(); UI.log(`${E.name}釋放了蓄力重擊！`); await eHit(it.m, {heavy: true});
  } else if (it.k === 'rand') {
    const r = it.r;
    if (r === 0) { UI.log(`${E.name}耍了一記重擊`); await eHit(2); }
    else if (r === 1) { healUnit(E, E.maxHp * 0.2); UI.log(`${E.name}吃了一顆糖`); }
    else { stAdd(P, 'slow', 1, 1); UI.float(P, '減速', 'status'); UI.log(`${E.name}讓你頭昏眼花`); }
  } else if (it.k === 'special' && stHas(E, 'cursed') && hasAcc('咒術人偶') && chance(0.5)) {
    UI.log(`${E.name}的強力攻擊被詛咒反噬了！`); await dealRaw(E, Math.round(atkOf(P) * accScale()), '詛咒反噬', 'dmg');
  } else if (it.k === 'special') {
    const [, m, ex = {}] = fx.every;
    UI.enemySpecial();
    UI.log(`${E.name}發動了強力攻擊！`);
    const hits = ex.hits || 1;
    for (let i = 0; i < hits && !B.over; i++) {
      const r = await eHit(ex.hits ? 1 : m, {special: ex});
      if (!r.miss && ex.drain) healUnit(E, r.dmg);
      await sleep(150);
    }
    if (ex.slow) { stAdd(P, 'slow', 1, 1); UI.float(P, '減速', 'status'); }
    if (ex.gauge) { P.gauge = Math.max(0, P.gauge - ex.gauge); UI.float(P, '行動條 −' + ex.gauge, 'status'); }
    if (ex.atkDown) stAdd(P, 'atkMod', -ex.atkDown[0], ex.atkDown[1]);
    if (ex.burn) addDot(P, 'burn', atkOf(E) * 0.3, 3);
  } else {
    const hits = it.hits || 1, m = it.m || 1;
    for (let i = 0; i < hits && !B.over; i++) { await eHit(m); if (hits > 1) await sleep(150); }
    if (E.phase >= 3 && E.turns % 3 === 0 && !B.over) { UI.log('終焉！'); await eHit(4); }
  }
  if (fx.stackAtk) E.stack += fx.stackAtk;
  // 敵方召喚物
  for (const s of B.summonsE) if (s.turns > 0 && !B.over) { s.turns--; comboBreak(); await dealRaw(P, atkOf(E) * s.mul * (1 - defOf(P) / (defOf(P) + 50)), '召喚物攻擊', 'dmg'); }
  B.summonsE = B.summonsE.filter(s => s.turns > 0);
  turnEnd(E);
  if (E.extraFirst) { E.extraFirst = false; E.gauge = 100; }
  if (B.P.extraAct) { B.P.extraAct = false; B.P.gauge = 100; }
}

// 敵人打玩家一下
async function eHit(mult, o = {}) {
  const {P, E} = B;
  if (B.over) return {miss: true, dmg: 0};
  UI.enemyAttackAnim();
  // 格擋反擊、事件的守護結界
  if (!o.counter && stHas(P, 'parry')) {
    const p = stGet(P, 'parry'); stDel(P, 'parry');
    UI.float(P, '格擋', 'status'); UI.log('你擋下了攻擊並反擊！');
    if ((o.heavy || o.special) && ownAcc('鐵壁戒指')) { P.cds[1] = 0; UI.log('完美格擋！格擋反擊冷卻歸零'); }
    await pHit(0, {skill: true, flat: atkOf(E) * 2.0 * p.v, sure: true});
    return {miss: true, dmg: 0};
  }
  if (stHas(P, 'mikiriStance') && (o.heavy || o.special)) {   // 月影耳墜：只看穿大招
    stDel(P, 'mikiriStance'); UI.float(P, '見切', 'miss'); UI.log('看穿了攻擊！');
    await pHit(2 * accScale(), {sure: true}); return {miss: true, dmg: 0};
  }
  if (stHas(P, 'mirror')) {
    stDel(P, 'mirror');
    const rr = attackRoll(E, P, mult, {...o, sure: true});
    UI.float(P, '反彈', 'status'); UI.log(`鏡盾把攻擊反彈了回去！`);
    await dealRaw(E, rr.dmg, '反彈', 'dmg');
    return {miss: true, dmg: 0};
  }
  if (P.angel > 0) { P.angel--; UI.float(P, '天使擋下', 'status'); UI.log('守護天使擋下了攻擊'); await sleep(300); return {miss: true, dmg: 0}; }
  if (G.blockHits > 0) { G.blockHits--; UI.float(P, '結界擋下', 'status'); UI.log('守護結界擋下了攻擊'); await sleep(300); return {miss: true, dmg: 0}; }
  let execute = 1;
  if (E.fx.execute && hpFrac(P) < E.fx.execute[0]) execute = E.fx.execute[1];
  const r = attackRoll(E, P, mult * execute, o);
  if (stHas(P, 'smoke')) stDel(P, 'smoke');
  if (r.miss) {
    UI.float(P, '閃避', 'miss'); UI.log('你閃開了攻擊');
    if (G.cls === 'rogue') { P.gauge = Math.min(99, P.gauge + 30); }
    if (hasAcc('煙霧戒指')) stAdd(P, 'nextCrit', 1, 999);
    if (hasAcc('疾風髮飾')) { P.gauge = Math.min(99, P.gauge + 50 * accScale()); UI.float(P, '疾風', 'status'); }
    if (hasAcc('流水腕輪')) { healUnit(P, P.maxHp * 0.05 * accScale()); P.nextBoost *= 1 + 0.3 * accScale(); }
    if (mythic('fencer')) addCombo(1);   // 永恆之舞：閃避也累積連擊
    if (stHas(P, 'mikiri')) await pHit(0.8, {skill: true, sure: true});
    return r;
  }
  comboBreak();   // 被攻擊命中（含防禦中）就中斷連擊；閃避、格擋、鏡盾、見切不算（無雙：減半）
  let d = r.dmg;
  const big = o.heavy || o.special;
  // 完全擋下、延後承受的傷害不會消耗護盾
  if (big && oathReady()) { P.oathBlocks++; d = 0; UI.float(P, '完全擋下', 'status'); UI.log(`守誓之盾擋下了這一擊（剩 ${2 - P.oathBlocks} 次）`); }
  else {
    if (big && hasAcc('鐵布衫')) { d *= 1 - 0.5 * accScale(); E.gauge -= 50; UI.log('鐵布衫硬吃下來，反震延後了敵人的行動'); }
    if (stHas(P, 'unyield')) { P.delayPool += Math.round(applyTakenMods(P, d, true, true)); d = 0; UI.float(P, '不屈', 'status'); }
    else d = applyTakenMods(P, d);
  }
  d = Math.round(d);
  P.hp = Math.max(0, P.hp - d);
  painStore(d);
  if (d > 0) {
    if (hasAcc('血牙項鍊')) P.debt += d;
    if (ownAcc('審判之槍穗')) P.judge = Math.min(5, P.judge + 1);
    if (big && hasAcc('老兵勳章')) { P.nextBoost *= 1 + 1 * accScale(); P.vetBreak = true; UI.log('老兵的反擊時機到了！'); }
  }
  if (P.hp > 0 && hasAcc('不屈紋章') && !P.unyieldUsed && hpFrac(P) < 0.3) { P.unyieldUsed = true; stAdd(P, 'unyield', 1, 2); UI.float(P, '不屈', 'status'); UI.log('不屈！接下來 2 回合的傷害延後承受'); }
  P.noDmgTurns = 0; if (hasAcc('龍紋腰帶')) P.dragonStack = 0;
  UI.float(P, d, r.crit ? 'crit' : 'dmg'); UI.hitPlayer();
  if (E.fx.lifesteal) healUnit(E, d * E.fx.lifesteal);
  // 命中後的附加效果
  const oh = E.fx.onHit || {};
  if (oh.poison && chance(oh.poison[0])) addDot(P, 'poison', atkOf(E) * oh.poison[1], oh.poison[2]);
  if (oh.burn && chance(oh.burn[0])) addDot(P, 'burn', atkOf(E) * oh.burn[1], oh.burn[2]);
  if (oh.randDot) addDot(P, chance(0.5) ? 'poison' : 'burn', atkOf(E) * 0.3, 3);
  if (oh.slow && chance(oh.slow)) { stAdd(P, 'slow', 1, 1); UI.float(P, '減速', 'status'); }
  if (oh.gauge && chance(oh.gauge[0])) { P.gauge = Math.max(0, P.gauge - oh.gauge[1]); UI.float(P, '行動條 −' + oh.gauge[1], 'status'); }
  if (oh.freeze && chance(oh.freeze)) { stAdd(P, 'freeze', 1, 99); UI.float(P, '凍結', 'status'); }
  if (oh.atkDown && chance(oh.atkDown[0])) stAdd(P, 'atkMod', -oh.atkDown[1], oh.atkDown[2]);
  if (oh.defBreak && chance(oh.defBreak[0])) { stAdd(P, 'defMod', -oh.defBreak[1], oh.defBreak[2]); UI.float(P, '破甲', 'status'); }
  if (oh.spdDown && chance(oh.spdDown[0])) stAdd(P, 'spdMod', -oh.spdDown[1], oh.spdDown[2]);
  if (oh.cdUp && chance(oh.cdUp[0])) { const n = unlockedSkills(G.floor); if (n) P.cds[ri(0, n - 1)] += oh.cdUp[1]; }
  if (oh.steal && chance(oh.steal)) { const v = Math.min(G.gold, Math.round(10 * floorF(G.floor))); G.gold -= v; E.stolen += v; if (v) UI.log(`${E.name}偷走了 ${v} 金幣`); }
  // 鐵壁戒指：被打時反擊
  if (!B.over && P.hp > 0 && hasAcc('鐵壁戒指') && stHas(P, 'guard')) { UI.log('防禦反擊！'); await pHit(1.0 * accScale(), {sure: true}); }
  await checkDeathAsync(P);
  return {...r, dmg: d};
}

function checkDeath(u) { if (u.hp <= 0) checkDeathAsync(u); }
async function checkDeathAsync(u) {
  if (B.over || u.hp > 0) return;
  if (u.isP) {
    if (G.phoenix) {
      G.phoenix = false; u.hp = Math.round(u.maxHp * 0.3);
      UI.log('不死鳥之羽燃起了火焰，你復活了！'); UI.float(u, '復活', 'heal'); await sleep(600); return;
    }
    B.over = true; B.result = 'lose'; return;
  }
  if (u.fx.revive && !u.revived && !u.selfDestructed) {
    u.revived = true; u.hp = Math.max(1, Math.round(u.maxHp * u.fx.revive));
    UI.log(`${u.name}再次站了起來！`); UI.float(u, '復活', 'heal'); await sleep(500); return;
  }
  B.over = true; B.result = 'win';
  if (u.fx.explodeDeath) { UI.log(`${u.name}爆炸了！`); const d = Math.round(u.atk * u.fx.explodeDeath); B.P.hp = Math.max(1, B.P.hp - d); UI.float(B.P, d, 'dmg'); }
  if (hasAcc('暴風腰帶')) healUnit(B.P, B.P.maxHp * 0.1 * accScale());
}

async function finishBattle() {
  const {P, E, kind} = B;
  G.hp = Math.max(0, Math.min(P.hp, maxHp()));
  // 戰鬥結束時清除「下一場戰鬥」效果；精英戰、頭目戰後清除「長時間」效果
  clearBuffs(b => b.dur === 'next');
  G.next = {};
  const isBig = E.rank !== '基本';
  if (isBig) { clearBuffs(b => b.dur === 'long'); if (G.poison && G.poison.left === 'long') G.poison = null; }
  if (B.result === 'lose') return {result: 'lose', monster: E};
  if (B.result === 'flee') return {result: 'flee', monster: E};
  G.kills++;
  const F = floorF(G.floor);
  const base = E.rank === '頭目' ? 30 : E.rank === '精英' ? 15 : 5;
  const gold = Math.round(base * F * (0.8 + rnd() * 0.4) * baseStats().goldMul * (B.lucky ? 2 : 1)) + E.stolen;
  G.gold += gold;
  const dropKind = E.rank === '頭目' ? 'boss' : E.rank === '精英' ? 'elite' : 'normal';
  const drops = [makeDrop(dropKind)];
  if (B.lucky) drops.forEach(d => { if (d.item && d.item.tier) d.item.tier = Math.min(20, d.item.tier + 1); });
  if (E.fx.extraDrop) drops.push(makeDrop('normal'));
  // 狩獵護符：精英、頭目必定多掉珍品道具；一般戰鬥 25% 多掉常見道具
  if (hasAcc('狩獵護符')) {
    if (E.rank !== '基本') { if (chance(accScale())) drops.push({type: 'item', item: rollSpecial('珍品')}); }
    else if (chance(0.25 * accScale())) drops.push({type: 'item', item: rollSpecial('常見')});
  }
  return {result: 'win', monster: E, gold, drops};
}

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
function stAdd(u, k, v, turns, extra = {}) { u.st.push({k, v, turns, ...extra}); }
function stDel(u, k) { u.st = u.st.filter(s => s.k !== k); }
function hpFrac(u) { return u.hp / u.maxHp; }

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
    if (hasAcc('老兵勳章') && hpFrac(u) < 0.5) d *= 1 + 0.5 * accScale();
  } else if (u.fx.defUpLow && hpFrac(u) < u.fx.defUpLow[0]) d *= u.fx.defUpLow[1];
  return Math.max(0, d);
}
function spdOf(u) {
  let s = u.spd * (1 + stSum(u, 'spdMod'));
  if (stHas(u, 'slow')) s *= 0.5;
  if (!u.isP) {
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
    firstAttackDone: false, veteranUsed: false, nextBoost: 1};
  const E = {isP: false, name: m.name, data: m, fx: MON_FX[m.name] || {}, rank: m.rank, hp: ms.hp, maxHp: ms.hp,
    atk: ms.atk, def: ms.def, spd: ms.spd, crit: ms.crit, eva: ms.eva, hit: 100, gauge: 0, st: [], turns: 0,
    stack: 0, revived: false, summonAtDone: false, potionDone: false, batDone: false, batTurns: 0, iceHits: 0,
    stolen: 0, phase: 1, cursed: false};
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
  if (hasAcc('魔力護盾')) stAdd(P, 'shield', Math.round(P.atk * 3 * accScale()), 999);
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
  let gp = P.gauge, ge = E.gauge; const sp = spdOf(P), se = spdOf(E); const out = [];
  for (let i = 0; i < n; i++) {
    const tP = (100 - gp) / sp, tE = (100 - ge) / se, t = Math.max(0, Math.min(tP, tE));
    gp += sp * t; ge += se * t;
    if (gp >= 100 - 1e-9) { out.push('P'); gp = 0; } else { out.push('E'); ge = 0; }
  }
  return out;
}

// 回合開始：持續傷害、回復、凍結判定；回傳 false 表示這回合跳過
async function turnStart(u) {
  const other = u.isP ? B.E : B.P;
  for (const k of ['poison', 'burn']) {
    const s = stGet(u, k);
    if (s) {
      let d = Math.max(1, Math.round(s.v));
      await dealRaw(u, d, k === 'poison' ? '中毒' : '灼燒', k === 'poison' ? 'poison' : 'burn');
      if (B.over) return false;
    }
  }
  if (u.isP) {
    if (hasAcc('不屈紋章')) healUnit(u, u.maxHp * 0.03 * accScale());
    const hot = stGet(u, 'hot'); if (hot) healUnit(u, u.maxHp * hot.v);
    if (hasAcc('龍紋腰帶')) u.dragonStack = Math.min(0.5, u.dragonStack + 0.1 * accScale());
    if (hasAcc('氣功念珠') && stHas(u, 'qigong')) healUnit(u, u.maxHp * 0.05);
    for (let i = 0; i < 3; i++) if (u.cds[i] > 0) u.cds[i]--;
  } else {
    if (u.fx.regen) healUnit(u, u.maxHp * u.fx.regen);
    if (u.batTurns > 0) u.batTurns--;
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
  stDel(u, 'slow');
  u.gauge = 0;
}

function healUnit(u, amt) {
  amt = Math.round(amt);
  if (amt <= 0) return 0;
  const before = u.hp; u.hp = Math.min(u.maxHp, u.hp + amt);
  const healed = u.hp - before, over = amt - healed;
  if (healed > 0) UI.float(u, '+' + healed, 'heal');
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
  if (u.isP) { u.noDmgTurns = 0; if (hasAcc('龍紋腰帶')) u.dragonStack = 0; }
  await checkDeathAsync(u);
}
function applyTakenMods(P, d) {
  if (G.cls === 'knight') d *= 0.85;
  if (G.cls === 'wizard') d *= 1.1;
  if (hasAcc('守誓者之盾')) d *= 1 - 0.1 * accScale();
  if (hasAcc('鐵布衫')) d *= 1 - 0.15 * accScale();
  if (hasAcc('狂戰士之血') && hpFrac(P) < 0.3) d *= 1 - 0.2 * accScale();
  // 護盾吸收
  const sh = stGet(P, 'shield');
  if (sh) { const a = Math.min(sh.v, d); sh.v -= a; d -= a; if (sh.v <= 0) stDel(P, 'shield'); }
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
    if (hasAcc('影刃耳環')) critMul = 1.5 + 0.5 * accScale();
    if (hasAcc('鷹眼單片鏡')) critMul = 1.5 + 0.25 * accScale();
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
  if ((hasAcc('審判之槍穗') || hasAcc('聖印護符')) && E.rank !== '基本') m *= 1 + 0.25 * accScale();
  if (hasAcc('破軍護符') && hpFrac(E) < 0.3) m *= 1 + 0.3 * accScale();
  if (hasAcc('審判天秤') && P.hp >= P.maxHp) m *= 1 + 0.2 * accScale();
  if (hasAcc('咒術人偶') && E.cursed && stHas(E, 'cursed')) m *= 1 + 0.15 * accScale();
  if (hasAcc('永凍水晶') && stHas(E, 'freeze')) m *= 1 + 0.3 * accScale();
  if (hasAcc('龍紋腰帶')) m *= 1 + P.dragonStack;
  if (!P.firstAttackDone && (hasAcc('騎兵號角') || hasAcc('獵人斗篷扣'))) m *= 1 + 0.5 * accScale();
  m *= P.nextBoost;
  if (o.skill && G.weapon.cls !== G.cls) m *= 0.75;    // 非本職武器：技能 ×0.75
  return m;
}

// 玩家打敵人一下
async function pHit(mult, o = {}) {
  const {P, E} = B;
  if (B.over) return {miss: true, dmg: 0};
  const dm = playerDmgMul(o) * (o.dmgMul || 1);
  if (!P.firstAttackDone && hasAcc('居合之鍔')) o.forceCrit = true;
  if (G.cls === 'wizard') o.defMul = (o.defMul || 1) * 0.85;   // 魔力轟擊
  const r = attackRoll(P, E, mult, {...o, dmgMul: dm});
  P.firstAttackDone = true; P.nextBoost = 1;
  UI.attackAnim();
  if (r.miss) {
    UI.float(E, '落空', 'miss'); UI.log(`${E.name}閃開了攻擊`);
    if (E.fx.counterDodge) await enemyCounter(1);
    return r;
  }
  let d = r.dmg;
  if (!E.isP && E.fx.dr) d *= 1 - E.fx.dr;
  if (E.fx.stoneStart && E.turns < E.fx.stoneStart) d *= 0.5;
  if (E.fx.iceArmor && E.iceHits < E.fx.iceArmor) { d *= 0.7; E.iceHits++; if (E.iceHits === E.fx.iceArmor) UI.log('冰甲碎裂了！'); }
  const sh = stGet(E, 'shield');
  if (sh) { const a = Math.min(sh.v, d); sh.v -= a; d -= a; if (sh.v <= 0) stDel(E, 'shield'); }
  d = Math.max(r.dmg > 0 ? 1 : 0, Math.round(d));
  E.hp = Math.max(0, E.hp - d);
  UI.float(E, d, r.crit ? 'crit' : 'dmg'); UI.hitEnemy(r.crit);
  // 吸血
  let ls = 0;
  if (G.cls === 'witch') ls += 0.08;
  if (hasAcc('血牙項鍊')) ls += 0.1 * accScale();
  if (o.normal && hasAcc('血月墜飾')) ls += 0.05 * accScale();
  if (o.lifesteal) ls += o.lifesteal;
  if (ls > 0) healUnit(P, d * ls);
  // 爆擊相關
  if (r.crit) {
    if (hasAcc('劍心之石')) { const c = P.cds.map((v, i) => i).filter(i => P.cds[i] > 0); if (c.length) P.cds[pick(c)]--; }
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
  const s = stGet(u, k);
  if (s) { s.v = Math.max(s.v, v); s.turns += turns; }
  else stAdd(u, k, v, turns);
  UI.float(u, k === 'poison' ? '中毒' : '灼燒', 'status');
}
async function enemyCounter(mult) {
  const {P, E} = B;
  UI.log(`${E.name}反擊！`);
  await eHit(mult, {counter: true});
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
    await useItemInBattle(act.id);
    act = await UI.waitAction(B, true);
  }
  if (B.over) return;
  P.noDmgTurns++;
  if (act.type === 'attack') await normalAttack();
  else if (act.type === 'skill') await useSkill(act.idx);
  // 召喚物追擊
  if (!B.over && B.summonP && B.summonP.turns > 0) {
    B.summonP.turns--;
    UI.log('深淵魔物攻擊！');
    await pHit(0.8 * B.summonP.mul, {sure: true, lifesteal: 0.3, skill: true});
  }
  if (!B.over && hasAcc('疾風髮飾') && chance(0.2 * accScale())) { turnEnd(P); P.gauge = 50; UI.float(P, '疾風！', 'status'); return; }
  if (P.turns === 1 && hasAcc('疾風腰帶')) { turnEnd(P); P.gauge = 50; return; }
  turnEnd(P);
}

async function normalAttack() {
  const {P} = B;
  let mult = 1;
  if (hasAcc('巨人腕環')) mult *= 1 + 0.2 * accScale();
  if (P.noDmgTurns >= 4 && hasAcc('舞者腳鍊')) { P.nextBoost *= 1 + 1 * accScale(); P.noDmgTurns = 0; UI.log('舞姬之步！傷害加倍'); }
  const hits = hasAcc('百裂綁手') ? 2 : 1;
  const hm = hasAcc('百裂綁手') ? 0.6 * accScale() + (1 - accScale()) * 1 : 1;
  for (let i = 0; i < hits && !B.over; i++) {
    const r = await pHit(mult * hm, {normal: true});
    if (!r.miss) {
      if (hasAcc('蛇牙項鍊') && chance(0.3 * accScale())) addDot(B.E, 'poison', atkOf(P) * 0.5 * dotMul(), 3);
      if (hasAcc('熔岩寶珠') && chance(0.2 * accScale())) addDot(B.E, 'burn', atkOf(P) * 0.3 * dotMul(), 3);
    }
    if (hits > 1) await sleep(180);
  }
  if (B.over) return;
  if (hasAcc('雙刃徽章') && chance(0.25 * accScale())) { UI.log('追加斬擊！'); await pHit(0.5, {}); }
  if (!B.over && G.cls === 'monk' && chance(0.25)) { UI.log('連打！'); await pHit(0.5, {}); }
  if (!B.over && hasAcc('雷鳴指環') && chance(0.15 * accScale())) { UI.log('落雷！'); await pHit(0.6, {sure: true}); }
}
function dotMul() { return hasAcc('毒蛛胸針') ? 1 + 0.5 * accScale() : 1; }

async function useSkill(i) {
  const {P, E} = B;
  const sk = SKILLS[G.cls][i];
  let cd = sk.cd;
  if (B.skillHalf) cd = Math.ceil(cd / 2);
  if (G.cls === 'knight' && i === 2 && hasAcc('騎兵號角')) cd -= 1;
  if (G.cls === 'cleric' && i === 2 && hasAcc('審判天秤')) cd -= 2;
  P.cds[i] = Math.max(1, cd);
  if (hasAcc('賢者之石')) P.cds.forEach((v, j) => { if (j !== i && v > 0) P.cds[j]--; });
  const s = G.weapon.cls === G.cls ? 1 : 0.75;   // 非本職武器：效果 ×0.75
  UI.skillBanner(sk.name);
  UI.log(`${G.name}使用了${sk.name}`);
  const o = {skill: true};
  const multiHit = async (n, m, extra = {}) => { for (let k = 0; k < n && !B.over; k++) { await pHit(m, {...o, ...extra}); await sleep(110); } };
  switch (G.cls + i) {
    case 'swordsman0': await multiHit(2 + (hasAcc('雙刃徽章') ? 1 : 0), 0.8); break;
    case 'swordsman1': stAdd(P, 'parry', hasAcc('鐵壁戒指') ? 1.5 : 1, 999); UI.float(P, '格擋架勢', 'status'); break;
    case 'swordsman2': await pHit(3.5, {...o, forceCrit: true}); break;
    case 'knight0': { const r = await pHit(1.3, o); if (!r.miss) stAdd(E, 'atkMod', -0.2 * s, 2); break; }
    case 'knight1': stAdd(P, 'defMod', 1 * s, 3 + (hasAcc('守誓者之盾') ? 1 : 0)); UI.float(P, '防禦 ×2', 'status'); break;
    case 'knight2': await pHit(0, {...o, flat: atkOf(P) * 3 + defOf(P) * 2}); break;
    case 'rogue0': await pHit(1.2, {...o, critBonus: 50}); break;
    case 'rogue1': stAdd(P, 'smoke', 1, 999); stAdd(P, 'nextCrit', 1, 999); UI.float(P, '煙幕', 'status'); break;
    case 'rogue2': await multiHit(6, 0.6); break;
    case 'wizard0': { const r = await pHit(1.6, {...o, defMul: 0.7}); if (!r.miss && hasAcc('熔岩寶珠')) addDot(E, 'burn', atkOf(P) * 0.3 * dotMul(), 3); break; }
    case 'wizard1': {
      const r = await pHit(1.8, o);
      if (!r.miss && !B.over) {
        const resist = E.rank === '頭目' || (E.rank === '精英' && chance(0.5));
        if (resist) { stAdd(E, 'slow', 1, 1); UI.float(E, '減速', 'status'); }
        else { stAdd(E, 'freeze', 1 + (hasAcc('永凍水晶') ? 1 : 0), 99); UI.float(E, '凍結', 'status'); }
      }
      break;
    }
    case 'wizard2': await pHit(5.0, o); break;
    case 'berserker0': { const r = await pHit(1.8, o); if (!r.miss && hasAcc('巨人腕環') && E.rank === '基本' && chance(0.2)) { stAdd(E, 'freeze', 1, 99); UI.float(E, '暈眩', 'status'); } break; }
    case 'berserker1': stAdd(P, 'atkMod', 0.5 * s, 3); stAdd(P, 'defMod', -0.3, 3); stAdd(P, 'rage', 1, 3); UI.float(P, '狂怒', 'status'); break;
    case 'berserker2': await multiHit(5 + (hasAcc('暴風腰帶') ? 2 : 0), 0.8, {lifesteal: 0.2 * s}); break;
    case 'cleric0': { await pHit(1.3, o); healUnit(P, P.maxHp * 0.08 * s * baseStats().healMul); break; }
    case 'cleric1': {
      const h = healUnit(P, P.maxHp * 0.4 * s * baseStats().healMul);
      P.st = P.st.filter(x => !['poison', 'burn', 'slow'].includes(x.k) && !(x.k.endsWith('Mod') && x.v < 0));
      if (hasAcc('聖盾徽章')) stAdd(P, 'shield', Math.round(P.maxHp * 0.4 * 0.5), 999);
      UI.float(P, '淨化', 'status'); break;
    }
    case 'cleric2': await pHit(3.5, o); stAdd(P, 'hot', 0.08 * s, 3); break;
    case 'fencer0': { await pHit(1.4, o); if (!B.over && chance(0.4)) await pHit(0.7, o); break; }
    case 'fencer1': stAdd(P, 'evaMod', 30 * s, 3); stAdd(P, 'mikiri', 1, 3); UI.float(P, '見切', 'status'); break;
    case 'fencer2': {
      const rose = hasAcc('薔薇胸針') ? 1 + 0.2 * P.roseStacks : 1; P.roseStacks = 0;
      await multiHit(4, 0.7 * rose); if (!B.over) await pHit(1.2 * rose, {...o, forceCrit: true}); break;
    }
    case 'witch0': await pHit(1.3, {...o, lifesteal: 0.5 * s * (hasAcc('血月墜飾') ? 2 : 1)}); break;
    case 'witch1': {
      stAdd(E, 'atkMod', -0.25 * s, 3); stAdd(E, 'defMod', -0.25 * s - (hasAcc('咒術人偶') ? 0.2 : 0), 3);
      stAdd(E, 'cursed', 1, 3); E.cursed = true; UI.float(E, '詛咒', 'status'); break;
    }
    case 'witch2': await pHit(2.5, {...o, lifesteal: 0.3}); B.summonP = {turns: 2 + (hasAcc('深淵之鑰') ? 2 : 0), mul: 1}; break;
    case 'ranger0': await pHit(1.6, {...o, sure: true, forceCrit: hasAcc('鷹眼單片鏡') || undefined}); break;
    case 'ranger1': {
      const r = await pHit(1.2, o);
      if (!r.miss) { const box = hasAcc('毒藤箭袋'); addDot(E, 'poison', atkOf(P) * 0.4 * s * (box ? 2 : 1) * dotMul(), 4 + (box ? 2 : 0)); }
      break;
    }
    case 'ranger2': await multiHit(8 + (hasAcc('流星箭羽') ? 3 : 0), 0.5); break;
    case 'monk0': await multiHit(4, 0.4); break;
    case 'monk1': healUnit(P, P.maxHp * 0.2 * s * baseStats().healMul); stAdd(P, 'defMod', 0.5 * s, 3); stAdd(P, 'qigong', 1, 3); break;
    case 'monk2': await multiHit(8, 0.3); if (!B.over) await pHit(2.0, o); break;
  }
}

async function useItemInBattle(id) {
  const {P} = B;
  removeItem(id, 1);
  const it = ITEMS[id];
  UI.log(`${G.name}使用了${id}`);
  if (it.category === '回復') {
    let amt = P.maxHp * it.effect.heal_pct / 100 * baseStats().healMul;
    if (G.cls === 'cleric') amt *= 2;
    healUnit(P, amt);
  } else if (it.category === '暫時') {
    const map = {hp: null, atk: 'atkMod', def: 'defMod', spd: 'spdMod', crit: 'critMod', eva: 'evaMod'};
    if (it.stat === 'hp') { const add = Math.round(P.maxHp * it.value / 100); P.maxHp += add; P.hp += add; UI.float(P, '最大生命 +' + add, 'status'); }
    else {
      const k = map[it.stat]; const v = it.stat === 'crit' || it.stat === 'eva' ? it.value : it.value / 100;
      const cur = P.st.filter(s => s.k === k && s.fromItem);
      if (!cur.length || cur[0].v < v) { P.st = P.st.filter(s => !(s.k === k && s.fromItem)); stAdd(P, k, v, 999, {fromItem: true}); }
      UI.float(P, `${STAT_NAMES[it.stat]} +${it.value}%`, 'status');
    }
  } else if (it.category === '永久') {
    const stat = it.stat === '任選' ? await UI.chooseStat() : it.stat;
    withMaxHpChange(() => { G.seeds[stat]++; });
    const bs = baseStats(); P.maxHp = bs.hp; P.atk = bs.atk; P.def = bs.def; P.spd = bs.spd; P.crit = bs.crit; P.eva = bs.eva;
    UI.float(P, `${STAT_NAMES[stat]} +1 點`, 'status');
  }
  await sleep(300);
}

// ---------- 敵人回合 ----------
async function enemyTurn() {
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
  // 自爆
  if (fx.selfDestruct && hpFrac(E) < fx.selfDestruct[0]) {
    UI.log(`${E.name}自爆了！`);
    await eHit(fx.selfDestruct[1], {sure: true});
    E.hp = 0; E.selfDestructed = true; await checkDeathAsync(E); turnEnd(E); return;
  }
  // 喝藥
  if (fx.potionOnce && !E.potionDone && hpFrac(E) < fx.potionOnce[0]) {
    E.potionDone = true; healUnit(E, E.maxHp * fx.potionOnce[1]); UI.log(`${E.name}喝下了藥水`); await sleep(400); turnEnd(E); return;
  }
  // 週期行為
  if (fx.healEvery && E.turns % fx.healEvery[0] === 0) { healUnit(E, E.maxHp * fx.healEvery[1]); UI.log(`${E.name}回復了生命`); await sleep(400); turnEnd(E); return; }
  if (fx.shieldEvery && E.turns % fx.shieldEvery[0] === 0) { stAdd(E, 'shield', Math.round(atkOf(E) * fx.shieldEvery[1]), 999); UI.float(E, '護盾', 'status'); UI.log(`${E.name}展開了護盾`); await sleep(400); turnEnd(E); return; }
  if (fx.cleanseEvery && E.turns % fx.cleanseEvery[0] === 0) { E.st = E.st.filter(s => !(['poison', 'burn', 'slow', 'cursed'].includes(s.k) || (s.k.endsWith('Mod') && s.v < 0))); healUnit(E, E.maxHp * fx.cleanseEvery[1]); UI.log(`${E.name}淨化了自己`); }
  if (fx.stripEvery && E.turns % fx.stripEvery === 0) {
    const pos = P.st.filter(s => (s.k.endsWith('Mod') && s.v > 0) || ['shield', 'smoke', 'nextCrit', 'parry', 'mikiri', 'hot'].includes(s.k));
    if (pos.length) { const t = pick(pos); P.st = P.st.filter(s => s !== t); UI.log(`${E.name}消除了你的一個增益`); }
  }
  if (fx.cdEvery && E.turns % fx.cdEvery[0] === 0) { const n = unlockedSkills(G.floor); if (n) { P.cds[ri(0, n - 1)] += fx.cdEvery[1]; UI.log('技能被封印了！'); } }
  if (fx.summon && E.turns % fx.summon[0] === 0) { B.summonsE.push({turns: fx.summon[2], mul: fx.summon[1]}); UI.log(`${E.name}召喚了幫手`); }
  // 攻擊
  if (fx.randomAct) {
    const r = ri(0, 2);
    if (r === 0) { UI.log(`${E.name}耍了一記重擊`); await eHit(2); }
    else if (r === 1) { healUnit(E, E.maxHp * 0.2); UI.log(`${E.name}吃了一顆糖`); }
    else { stAdd(P, 'slow', 1, 1); UI.float(P, '減速', 'status'); UI.log(`${E.name}讓你頭昏眼花`); }
  } else if (fx.every && E.turns % fx.every[0] === 0) {
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
    let hits = 1, m = 1;
    if (fx.multi) { hits = fx.multi[0]; m = fx.multi[1]; }
    if (fx.dualLow && hpFrac(E) < fx.dualLow) hits = 2;
    if (fx.first && E.turns === 1) m *= fx.first;
    for (let i = 0; i < hits && !B.over; i++) { await eHit(m); if (hits > 1) await sleep(150); }
    if (E.phase >= 3 && E.turns % 3 === 0 && !B.over) { UI.log('終焉！'); await eHit(4); }
  }
  if (fx.stackAtk) E.stack += fx.stackAtk;
  // 敵方召喚物
  for (const s of B.summonsE) if (s.turns > 0 && !B.over) { s.turns--; await dealRaw(P, atkOf(E) * s.mul * (1 - defOf(P) / (defOf(P) + 50)), '召喚物攻擊', 'dmg'); }
  B.summonsE = B.summonsE.filter(s => s.turns > 0);
  turnEnd(E);
  if (E.extraFirst) { E.extraFirst = false; E.gauge = 100; }
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
    await pHit(0, {skill: true, flat: atkOf(E) * 2.0 * p.v, sure: true});
    return {miss: true, dmg: 0};
  }
  if (G.blockHits > 0) { G.blockHits--; UI.float(P, '結界擋下', 'status'); UI.log('守護結界擋下了攻擊'); await sleep(300); return {miss: true, dmg: 0}; }
  let execute = 1;
  if (E.fx.execute && hpFrac(P) < E.fx.execute[0]) execute = E.fx.execute[1];
  const r = attackRoll(E, P, mult * execute, o);
  if (stHas(P, 'smoke')) stDel(P, 'smoke');
  if (r.miss) {
    UI.float(P, '閃避', 'miss'); UI.log('你閃開了攻擊');
    if (G.cls === 'rogue') { P.gauge = Math.min(99, P.gauge + 30); }
    if (hasAcc('煙霧戒指')) stAdd(P, 'nextCrit', 1, 999);
    if (hasAcc('流水腕輪')) { healUnit(P, P.maxHp * 0.05 * accScale()); P.nextBoost *= 1 + 0.3 * accScale(); }
    if (stHas(P, 'mikiri')) await pHit(0.8, {skill: true, sure: true});
    else if (hasAcc('月影耳墜')) await pHit(0.7 * accScale(), {sure: true});
    return r;
  }
  let d = applyTakenMods(P, r.dmg);
  d = Math.round(d);
  // 不死圖騰、老兵勳章
  if (P.hp - d <= 0) {
    if (hasAcc('不死圖騰') && stHas(P, 'rage')) d = P.hp - 1;
    else if (hasAcc('老兵勳章') && !P.veteranUsed) { P.veteranUsed = true; d = P.hp - 1; UI.log('老兵的意志讓你撐了下來！'); }
  }
  P.hp = Math.max(0, P.hp - d);
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
  if (!B.over && P.hp > 0 && hasAcc('鐵壁戒指') && chance(0.2 * accScale())) await pHit(0.8, {sure: true});
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
  G.kills++;
  const F = floorF(G.floor);
  const base = E.rank === '頭目' ? 30 : E.rank === '精英' ? 15 : 5;
  const gold = Math.round(base * F * (0.8 + rnd() * 0.4) * baseStats().goldMul) + E.stolen;
  G.gold += gold;
  const dropKind = E.rank === '頭目' ? 'boss' : E.rank === '精英' ? 'elite' : 'normal';
  const drops = [makeDrop(dropKind)];
  if (E.fx.extraDrop) drops.push(makeDrop('normal'));
  return {result: 'win', monster: E, gold, drops};
}

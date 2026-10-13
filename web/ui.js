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

// 技能簡介（長按技能按鈕時顯示，不寫數值；完整倍率在說明頁）
const SKILL_BRIEF = {
  swordsman0: '快速連砍兩刀。', swordsman1: '架起劍擋下敵人下一次攻擊，並借敵人的力量反擊。', swordsman2: '蓄滿力的一擊，必定爆擊。',
  knight0: '盾擊後突刺，並削弱敵人的攻擊力。', knight1: '數回合內防禦大幅提升。', knight2: '結合攻擊與防禦力的猛烈衝鋒。',
  rogue0: '從死角刺擊，非常容易爆擊。', rogue1: '敵人下一次攻擊必定落空，你的下一擊必定爆擊。', rogue2: '多段連刺，每一刀都可能爆擊。',
  wizard0: '火球轟擊，部分無視敵人防禦。', wizard1: '冰霜傷害並凍結敵人；強敵改為減速。', wizard2: '召喚天雷，單發傷害極高。',
  berserker0: '沉重的一擊。', berserker1: '數回合內攻擊大增、防禦下降。', berserker2: '連續旋轉劈砍，並吸取生命。',
  cleric0: '聖光攻擊並回復少量生命。', cleric1: '大量回復並解除負面狀態。', cleric2: '強力的神聖一擊，之後數回合持續回復。',
  fencer0: '快速突刺，有機會追加一擊。', fencer1: '數回合內閃避提升，閃避成功時反擊。', fencer2: '華麗的連續突刺，最後一擊必定爆擊。',
  witch0: '攻擊並吸取大量生命。', witch1: '數回合內降低敵人的攻擊與防禦。', witch2: '重擊並召喚深淵魔物協助攻擊數回合。',
  ranger0: '精準射擊，必定命中。', ranger1: '射擊並讓敵人長時間中毒。', ranger2: '大量箭矢連續落下。',
  monk0: '快速的多段連打。', monk1: '回復生命並在數回合內提升防禦。', monk2: '一陣百裂拳後接上昇龍收尾。',
};
// 第 20 階神話武器的特殊效果說明（不受非本職影響）
function mythicLine(it, tag = 'p') { if (it.tier !== 20) return ''; const m = MYTHIC[it.cls]; return `<${tag} class="affix">神話・${m.name}：${m.text}（不受非本職影響）</${tag}>`; }
// 狀態說明（只寫效果，不寫數值）
const TIPS = {
  poison: '中毒：每回合開始時受到毒傷害。', burn: '灼燒：每回合開始時受到火焰傷害。', freeze: '凍結／暈眩：跳過下一次行動。',
  slow: '減速：速度下降，行動變慢。', cursed: '詛咒：攻擊與防禦下降。', shield: '護盾：先吸收受到的傷害，打破後才會扣生命。',
  broken: '破防中：跳過下一次行動，這段期間受到的傷害大幅增加。', enraged: '狂暴：攻擊力上升。',
  guard: '防禦中：到你下一次行動前，受到的傷害減半；被攻擊命中仍會中斷連擊。', bulwarkGuard: '架盾：到你下一次行動前，大幅減少受到的傷害，擋下的力量會加到下一次攻擊。',
  parry: '格擋：擋下敵人下一次攻擊並反擊。', smoke: '煙幕：敵人下一次攻擊必定落空，你的下一擊必定爆擊。', mikiri: '見切：閃避提高，閃避成功時反擊。',
  rage: '狂怒：攻擊大幅上升，防禦下降。', mikiriStance: '見切架式：下一次攻擊必定閃開並反擊。', aim: '瞄準：下一次瞄準射擊大幅強化並必定爆擊。',
  mirror: '鏡盾：下一次受到的攻擊會完全反彈給敵人。', potRage: '狂暴藥：攻擊上升，但受到的傷害也增加。',
  unyield: '不屈：這段期間受到的傷害會延後，之後分幾回合慢慢扣。', delay: '延遲傷害：不屈期間延後的傷害，之後每回合扣一部分。',
  combo: '連擊：連續命中的攻擊會讓傷害越來越高；被攻擊命中就會中斷。中毒、灼燒不會中斷。武鬥家的多段攻擊每打中一段都會累積。',
  haste: '加速：速度上升，行動變快。', mercy: '慈悲：每回合開始時回復生命。', echo: '回響：上一個技能會在這回合以較弱的威力自動再施放一次。',
  pain: '痛苦轉嫁：你受到的傷害，會在牠接下來的行動時以詛咒傷害還給牠。', future: '先見：看得到敵人接下來的數次行動。',
  lucky: '幸運金幣：這場戰鬥獲勝時，掉落更好、金幣更多。', phoenix: '不死鳥之羽：倒下時會自動復活一次。',
  poisonWalk: '中毒：每走一步都會扣生命。', barrier: '守護結界：擋下接下來的攻擊。',
  judge: '審判：使用技能時消耗，層數越多技能越痛。', pact: '血契：使用技能時消耗，層數越多技能越痛。', volt: '電荷：滿層時下一次攻擊追加落雷。',
  qi: '氣：氣功護體會依層數持續更久。', bulwark: '架盾力量：會加到下一次攻擊上。', debt: '血債：之後的攻擊會依此回復生命。',
  iai: '拔刀：下一次攻擊必定爆擊並強化。', shout: '怒吼：下一次攻擊必定爆擊並吸取生命。', holyMark: '審判印記：下一次攻擊強化並無視護盾。',
  chain: '連斬：連續普通攻擊會追加斬擊；用技能或防禦會歸零。', atkUp: '攻擊上升。', atkDown: '攻擊下降。', defUp: '防禦上升。', defDown: '防禦下降。', evaUp: '閃避上升。',
  evaDown: '閃避下降。', spdUp: '速度上升，行動變快。', spdDown: '速度下降，行動變慢。', hitUp: '命中上升。', hitDown: '命中下降，攻擊比較容易落空。',
  critUp: '爆擊率上升。', critDown: '爆擊率下降。',
  stack: '越戰越強：每次行動後攻擊力都會再提高。', phase2: '第二階段：攻擊與速度提升。', phase3: '最終階段：攻擊與速度提升，並會定期發動終焉一擊。',
  bat: '蝙蝠化：化成蝙蝠群，非常難以命中。', minion: '手下：每次敵人行動後，手下也會攻擊你，並中斷連擊。',
  iceArmor: '冰甲：前幾次受到的攻擊傷害降低，打碎後恢復正常。', stone: '石化：開場幾回合身體堅硬，受到的傷害降低。',
  nextCrit: '必定爆擊：你的下一次攻擊必定爆擊。', hot: '持續回復：每回合開始時回復生命。', qigong: '氣功護體：防禦提升中。',
  summon: '深淵魔物：每次你行動後追擊敵人並吸取生命，數字是剩餘回合。', nextBoost: '下一擊強化：你的下一次攻擊傷害提高。',
  dragon: '龍紋：沒有受傷的回合會累積增傷，受到傷害就歸零。', rose: '薔薇：命中會累積，薔薇終舞會依層數強化。',
  oath: '守誓之盾：防禦中可以完全擋下蓄力重擊或強力攻擊，數字是本場剩餘次數。', veteran: '老兵意志：本場戰鬥第一次受到致命傷時會撐住。',
  unyieldReady: '不屈待命：生命第一次低於一定程度時，之後的傷害會延後承受。', cdhalf: '這場戰鬥使用技能後的冷卻減半。',
  nextFirst: '下一場戰鬥由你先攻。', nextEnemyFirst: '下一場戰鬥由敵人先攻。', nextEnemyHp: '下一個敵人的生命降低。',
  nextCdStart: '下一場戰鬥開始時，技能都在冷卻中。', dropGuard: '裝備保底：接下來幾步拿到的裝備，數值不會低於標準。',
};
// 能力增減的標籤（依正負顯示上升或下降）
function modChips(u) {
  const out = [];
  for (const [k, n, up, dn] of [['atkMod', '攻擊', 'atkUp', 'atkDown'], ['defMod', '防禦', 'defUp', 'defDown'], ['spdMod', '速度', 'spdUp', 'spdDown'],
    ['evaMod', '閃避', 'evaUp', 'evaDown'], ['hitMod', '命中', 'hitUp', 'hitDown'], ['critMod', '爆擊', 'critUp', 'critDown']]) {
    const v = stSum(u, k); if (v) out.push(chip(n + (v > 0 ? '↑' : '↓'), v > 0 ? 'good' : 'bad', TIPS[v > 0 ? up : dn]));
  }
  if (stHas(u, 'haste')) out.push(chip('加速', 'good', TIPS.haste));
  return out;
}
// 下一次攻擊必定爆擊的條件（與 pHit 相同）
function sureCrit() {
  const {P, E} = B, it = E.intent;
  if (P.iai || P.shout) return true;
  if (!P.firstAttackDone && hasAcc('居合之鍔')) return true;
  if (hasAcc('破軍護符') && E.charging) return true;
  return hasAcc('影刃耳環') && it && !['attack', 'heavy', 'special', 'boom'].includes(it.k) && !(it.k === 'rand' && it.r === 0);
}
// 攻擊按鈕說明：依飾品變化
function attackTip(P) {
  const t = ['攻擊：用目前的武器普通攻擊。'];
  if (hasAcc('百裂綁手')) t.push(`普通攻擊改成打兩下${accOwn() ? '，每 3 次讓連環拳冷卻縮短' : ''}。`);
  if (hasAcc('雙刃徽章')) t.push('連續普通攻擊會追加連斬。');
  if (hasAcc('蛇牙項鍊')) t.push('命中會讓敵人中毒並疊加。');
  if (hasAcc('熔岩寶珠')) t.push('命中有機會讓敵人灼燒。');
  if (hasAcc('巨人腕環')) t.push('命中可以打斷敵人的蓄力。');
  if (hasAcc('金幣袋') && !B.stole) t.push('命中有機會偷到道具。');
  if (hasAcc('舞者腳鍊')) t.push(P.noDmgTurns >= 4 ? '舞姬之步已就緒：這次攻擊傷害大幅提高！' : '連續數回合沒受傷時，下一次普通攻擊大幅強化。');
  if (G.cls === 'monk') t.push('有機會追加連打。');
  t.push('連續命中會累積連擊。');
  return t.join('');
}
// 技能按鈕說明：飾品、武器帶來的變化
function skillNotes(i) {
  const c = G.cls, n = [];
  if (B && B.skillHalf) n.push('這場戰鬥冷卻減半');
  if (c === 'knight' && i === 2 && hasAcc('騎兵號角')) n.push('騎兵號角：冷卻縮短');
  if (c === 'cleric' && i === 2 && hasAcc('審判天秤')) n.push('審判天秤：冷卻縮短');
  if (c === 'berserker' && i === 2 && hasAcc('暴風腰帶')) n.push('暴風腰帶：段數增加');
  if (c === 'witch' && i === 2 && hasAcc('深淵之鑰')) n.push('深淵之鑰：召喚物留場更久');
  if (c === 'wizard' && i === 1 && hasAcc('永凍水晶')) n.push('永凍水晶：凍結更久');
  if (c === 'ranger' && i === 0 && stHas(B.P, 'aim')) n.push('瞄準完成：這次大幅強化並必定爆擊');
  if (c === 'ranger' && i === 2 && ownAcc('流星箭羽')) n.push('流星箭羽：可以打斷蓄力');
  if (c === 'rogue' && i === 0 && ownAcc('蛇牙項鍊')) n.push('蛇牙項鍊：引爆敵人身上的毒');
  if (c === 'wizard' && i === 0 && ownAcc('熔岩寶珠')) n.push('熔岩寶珠：引爆敵人身上的灼燒');
  if (c === 'monk' && i === 1 && ownAcc('氣功念珠') && B.P.qi) n.push('氣功念珠：依氣的層數持續更久');
  if (G.weapon.cls !== c) n.push('非本職武器：效果較弱');
  if (mythic('wizard')) n.push('創世：下一回合會回響一次');
  return n.length ? '（' + n.join('；') + '）' : '';
}
function bodyTip(b) {
  const d = BODY[b], weak = [], res = [];
  for (const k of ['slash', 'magic', 'dot']) { if (d[k] > 1) weak.push(DMG_NAMES[k]); if (d[k] < 1) res.push(DMG_NAMES[k]); }
  return `${b}：${d.desc}。弱點：${weak.join('、') || '無'}；抗性：${res.join('、') || '無'}。`;
}
// 狀態標籤：data-tip 是懸停（電腦）或長按（手機）時顯示的實際效果
function chip(text, cls, tip) { return `<b class="chip ${cls}" data-tip="${esc(tip || text)}" tabindex="0">${text}</b>`; }
const pct = v => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`;
function initTips() {
  const tip = document.createElement('div'); tip.id = 'tip'; tip.hidden = true; $('#app').appendChild(tip);
  const showTip = el => {
    tip.textContent = el.dataset.tip; tip.hidden = false;
    const r = el.getBoundingClientRect(), a = $('#app').getBoundingClientRect();
    const w = Math.min(260, a.width - 24); tip.style.maxWidth = w + 'px';
    let x = r.left - a.left, y = r.bottom - a.top + 6;
    x = Math.max(8, Math.min(x, a.width - tip.offsetWidth - 8));
    if (y + tip.offsetHeight > a.height - 8) y = r.top - a.top - tip.offsetHeight - 6;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  };
  const hide = () => { tip.hidden = true; };
  document.addEventListener('mouseover', e => { const el = e.target.closest('[data-tip]'); if (el && matchMedia('(hover: hover)').matches) showTip(el); });
  document.addEventListener('mouseout', e => { if (e.target.closest('[data-tip]')) hide(); });
  document.addEventListener('focusin', e => { const el = e.target.closest('[data-tip]'); if (el) showTip(el); });
  document.addEventListener('focusout', hide);
  let pressEl = null, pressT0 = 0;
  document.addEventListener('touchstart', e => { const el = e.target.closest('[data-tip]'); pressEl = el; pressT0 = Date.now(); if (el) showTip(el); }, {passive: true});
  // 長按按鈕只看說明，放開時不觸發按鈕
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-tip]');
    if (el && el === pressEl && Date.now() - pressT0 > 400) { e.stopImmediatePropagation(); e.preventDefault(); }
    pressEl = null;
  }, true);
  const end = () => hide();
  document.addEventListener('touchend', end); document.addEventListener('touchmove', end, {passive: true}); document.addEventListener('touchcancel', end);
  document.addEventListener('contextmenu', e => { if (e.target.closest('[data-tip]')) e.preventDefault(); });
}
// 依迷宮視窗的長寬比決定畫布高度（寬固定 160 像素）
function fitView() {
  if (!view) return;
  const r = $('#view-wrap').getBoundingClientRect();
  const h = r.width ? clamp(Math.round(VIEW_W * r.height / r.width), 120, 340) : 200;
  if (h === VIEW_H && view.height === h) return;
  VIEW_H = h; view.width = VIEW_W; view.height = VIEW_H;
  vctx.imageSmoothingEnabled = false; vimg = vctx.createImageData(VIEW_W, VIEW_H);
}
function show(id) { $$('.screen').forEach(s => s.hidden = s.id !== id); if (id === 'scr-game') requestAnimationFrame(fitView); }
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
const VIEW_W = 160;
let VIEW_H = 200;   // 依畫面比例調整，讓迷宮填滿可用空間
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
    const rowDist = (W * 0.5) / p;
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
    const lh = W / dist;
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
  $('#hp-text').textContent = `${Math.round(hp)} / ${mhp}`;
  $('#hud-gold').textContent = G.gold;
  $$('.mi-equip').forEach(e => e.innerHTML = spr('wstrip:' + G.weapon.cls, 0.7, G.weapon.tier - 1));
  $$('.mi-inv').forEach(e => { if (!e.firstChild) e.innerHTML = spr('misc:potion_s', 0.7); });
  const st = [];
  if (G.phoenix) st.push(chip('不死鳥之羽', 'good', TIPS.phoenix));
  if (G.poison) st.push(chip('中毒', 'bad', TIPS.poisonWalk));
  if (G.blockHits) st.push(chip(`結界 ×${G.blockHits}`, 'good', TIPS.barrier));
  if (G.next.first) st.push(G.next.first === 'player' ? chip('下一戰先攻', 'good', TIPS.nextFirst) : chip('下一戰敵人先攻', 'bad', TIPS.nextEnemyFirst));
  if (G.next.enemyHp) st.push(chip('下一敵人生命↓', 'good', TIPS.nextEnemyHp));
  if (G.next.skill === 'cdhalf') st.push(chip('下一戰冷卻減半', 'good', TIPS.cdhalf));
  if (G.next.skill === 'cdstart') st.push(chip('下一戰技能冷卻中', 'bad', TIPS.nextCdStart));
  if (G.dropFloor > 0) st.push(chip('裝備保底', 'good', TIPS.dropGuard));
  const agg = {};
  G.buffs.forEach(b => { agg[b.stat] = (agg[b.stat] || 0) + b.val; });
  for (const k in agg) if (agg[k]) st.push(chip(`${STAT_NAMES[k]}${agg[k] > 0 ? '↑' : '↓'}`, agg[k] > 0 ? 'good' : 'bad', `${STAT_NAMES[k]}${agg[k] > 0 ? '上升' : '下降'}中（事件效果）。`));
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
  $('#title-load').hidden = !hasAnySave();
  $('#title-load').onclick = e => { e.stopPropagation(); doLoad(true); };
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
    <ul class="skills">${sk.map((s, i) => `<li><b>${s.name}</b><span>${unlockText(i)}・CD ${s.cd}</span></li>`).join('')}</ul>
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
  if (m !== 'battle') $('#bt-intent').hidden = true;
  requestAnimationFrame(fitView);
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
  const unlockAt = {[SKILL_UNLOCK[1] + 1]: 1, [SKILL_UNLOCK[2] + 1]: 2};
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
// 事件分級：好事、壞事用籤詩的吉凶，選擇型事件用風險程度
const GOOD_TIER = ['小吉', '中吉', '大吉', '天選'], BAD_TIER = ['小凶', '中凶', '大凶', '天譴'], CHOICE_TIER = ['尋常', '可疑', '危險', '命運'];
function fxPreviewIcon(good) { return good ? 'misc:ev_good' : 'misc:ev_bad'; }
async function randomEvent() {
  const n = unlockedSkills(G.floor);
  let ev; do { ev = pick(EVENTS); } while ((ev.req || 0) > n);
  scene.ev = fxPreviewIcon(ev.good);
  const tierName = (ev.good ? GOOD_TIER : BAD_TIER)[ev.tier];
  const res = applyFx(ev.fx, !ev.good);
  refreshHud();
  await modal(`<div class="ev ${ev.good ? 'good' : 'bad'}"><div class="ev-tag">${tierName}</div>
    <div class="ev-icon">${spr(fxPreviewIcon(ev.good), 2)}</div><h3>${ev.name}</h3><p class="desc">${ev.desc}</p>
    <ul class="fx">${res.text.map(t => `<li>${t}</li>`).join('')}</ul></div>`, [['繼續', 1, 'primary']], 'center');
  scene.ev = null;
  if (res.battle) await doBattle(res.battle);
}
async function choiceEvent() {
  const ev = pick(CHOICES);
  scene.ev = 'misc:ev_choice';
  const tierName = CHOICE_TIER[ev.tier];
  const i = await modal(`<div class="ev choice"><div class="ev-tag">抉擇・${tierName}</div>
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
  if (res.result === 'flee') { toast('你逃離了戰鬥'); B = null; refreshHud(); return; }
  await modal(`<div class="banner"><h2>勝利</h2><p>打倒了${res.monster.name}，獲得 ${res.gold} 金幣。</p></div>`, [['拾取戰利品', 1, 'primary']], 'center');
  for (const d of res.drops) await takeDrop(d);
  B = null; refreshHud();
}

// 裝備比較卡片；base 有值時，在數值下方標出與目前裝備的差距
// 與目前裝備的數值差（▲ 綠、▼ 紅）
// 非本職裝備的提示
function offTag(type, it) {
  if (type === 'weapon' && it.cls !== G.cls) return '<span class="tag warn">非本職：技能效果 ×0.75</span>';
  if (type === 'acc' && ACCS[it.idx].class_id !== G.cls) return '<span class="tag warn">非本職：技能詞條無效，其餘 ×0.75</span>';
  return '';
}
// 換上這件裝備後整體能力的變化（含城塞之心這類依其他能力計算的加成）
function statsIfEquip(type, it) {
  const key = type === 'weapon' ? 'weapon' : type === 'armor' ? 'armor' : 'acc', old = G[key];
  G[key] = it; const s = baseStats(); G[key] = old; return s;
}
function deltaHtml(type, it, base) {
  const keys0 = ['hp', 'atk', 'def', 'spd', 'crit', 'eva'];
  const sa = statsIfEquip(type, it), sb = statsIfEquip(type, base || null);
  const a = Object.fromEntries(keys0.map(k => [k, sa[k]])), b = Object.fromEntries(keys0.map(k => [k, sb[k]]));
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => Math.round(((a[k] || 0) - (b[k] || 0)) * 10));
  return keys.length ? `<p class="delta">${keys.map(k => { const v = (a[k] || 0) - (b[k] || 0); return `<span class="${v > 0 ? 'up' : 'down'}">${STAT_NAMES[k] || k} ${v > 0 ? '▲+' : '▼'}${fmtPct(v)}${k === 'crit' || k === 'eva' ? '%' : ''}</span>`; }).join('')}</p>` : '<p class="delta">數值與目前相同</p>';
}
function cmpCard(title, type, it, base) {
  if (!it) return `<div class="cmp-card empty"><div class="cmp-title">${title}</div><p>（無）</p></div>`;
  const r = rarityOf(type, it);
  let extra = '';
  if (type === 'weapon') { const own = it.cls === G.cls; extra = `<p class="tag ${own ? 'good' : 'warn'}">${CHAR[it.cls].weapon_type}${own ? '・本職' : '・非本職（技能效果 ×0.75）'}</p>${mythicLine(it)}`; }
  if (type === 'acc') { const a = ACCS[it.idx]; extra = `<p class="tag">${a.class_name}・${a.style}${a.class_id === G.cls ? '' : '（非本職：技能詞條無效，其餘 ×0.75）'}</p><p class="affix">${a.affix}</p>`; }
  if (type === 'armor') extra = `<p class="tag">${ARMOR[it.set][0].set_name}・${ARMOR[it.set][0].type}</p>`;
  const tierT = type === 'acc' ? '' : `第 ${it.tier} 階・`;
  const delta = base !== undefined && title !== '目前' ? deltaHtml(type, it, base) : '';
  return `<div class="cmp-card"><div class="cmp-title">${title}</div><div class="cmp-head">${equipIcon(type, it, 2)}<div><b style="color:${RARITY_COLOR[r]}">${equipName(type, it)}</b><small>${tierT}${r}・數值 ${Math.round(it.roll * 100)}%</small></div></div>
    <p class="sline">${statLine(equipStats(type, it))}</p>${delta}${extra}</div>`;
}
const curEquip = type => type === 'weapon' ? G.weapon : type === 'armor' ? G.armor : G.acc;

async function takeDrop(d) {
  if (d.type === 'item') { await gainItem(d.item); return; }
  const cur = d.type === 'weapon' ? G.weapon : d.type === 'armor' ? G.armor : G.acc;
  const card = (title, type, it) => cmpCard(title, type, it, it === d.item ? cur : null);
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
  const r0 = addItem(id);
  if (r0.ok) { toast(addItemText(id, r0)); return; }
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
  const priceOf = id => Math.round(itemBasePrice(id) * F * disc);
  const rollGoods = () => {
    const goods = [];
    for (let i = 0; i < 2; i++) {
      const t = clamp(Math.round(G.floor / 2) + ri(0, 2), 1, 20);
      const it = chance(0.5) ? {type: 'weapon', item: {cls: chance(0.5) ? G.cls : pick(CLASSES), tier: t, roll: rollRoll()}} : {type: 'armor', item: {set: pick(ARMOR_SETS), tier: t, roll: rollRoll()}};
      goods.push({...it, price: Math.round(t * 20 * disc)});
    }
    { const own = chance(0.5); const pool = ACCS.map((a, i) => i).filter(i => own ? ACCS[i].class_id === G.cls : ACCS[i].class_id !== G.cls);
      goods.push({type: 'acc', item: {idx: pick(pool), roll: rollRoll()}, price: Math.round(150 * F * disc)}); }
    for (let i = 0; i < 2; i++) { const id = rollItemId('normal').replace(/^(生命|力量|守護|迅捷|慧眼|幻影)之種$/, '中藥水').replace('女神之種', '大藥水'); goods.push({type: 'item', item: id, price: priceOf(id)}); }
    { const r = rnd(); const id = r < 0.05 ? '女神之種' : r < 0.3 ? SEED_NAMES[pick(['hp', 'atk', 'def', 'spd', 'crit', 'eva'])] : r < 0.7 ? rollSpecial('珍品') : pick(['小藥水', '中藥水']); goods.push({type: 'item', item: id, price: priceOf(id)}); }
    return goods;
  };
  let goods = rollGoods();
  // 刷新商品：第 1 次 20F，之後每次價格翻倍
  let refreshes = 0;
  const refreshCost = () => Math.round(20 * F * Math.pow(2, refreshes));
  let tab = 'buy';
  while (true) {
    refreshHud();
    const tabs = `<div class="shop-tabs" role="tablist">${[['buy', '購買'], ['sell', '出售']].map(([k, n]) => `<button class="shop-tab${tab === k ? ' on' : ''}" role="tab" aria-selected="${tab === k}" data-tab="${k}">${n}</button>`).join('')}</div>`;
    const buyList = `<div class="shop-list">${goods.map((g, i) => {
      const name = g.type === 'item' ? g.item : equipName(g.type, g.item);
      let sub;
      if (g.type === 'item') sub = `<small>${itemDesc(g.item)}</small>`;
      else {
        const a = g.type === 'acc' ? ACCS[g.item.idx] : null;
        const head = a ? `${a.class_name}・${a.style}${a.class_id === G.cls ? '' : '（非本職）'}` : g.type === 'weapon' ? `第 ${g.item.tier} 階・${CHAR[g.item.cls].weapon_type}${g.item.cls === G.cls ? '・本職' : '・非本職'}` : `第 ${g.item.tier} 階・防具`;
        sub = `<small>${head}</small>${a ? `<small class="affix">${a.affix}</small>` : ''}<small class="vs">比目前：</small>${deltaHtml(g.type, g.item, curEquip(g.type))}`;
      }
      const poor = G.gold < g.price;
      return `<button class="shop-item${poor ? ' poor' : ''}" data-i="${i}" ${g.sold ? 'disabled' : ''}>${g.type === 'item' ? spr(itemIcon(g.item), 2) : equipIcon(g.type, g.item, 2)}
        <span class="si-name">${name}${sub}</span><span class="si-price">${g.sold ? '售出' : g.price}</span></button>`;
    }).join('')}</div>
      <button class="btn shop-refresh" data-refresh="1" ${G.gold < refreshCost() ? 'disabled' : ''}>刷新商品　<b class="gold">${refreshCost()}</b> 金幣</button>`;
    const sellList = `<p class="desc">點一下賣掉 1 個。</p>
      <div class="inv-grid">${G.inv.length ? G.inv.map((it, i) => `<button class="slot" data-sellitem="${i}">${spr(itemIcon(it.id), 2)}<span>${it.id} ×${it.n}</span><b class="gold">+${itemSellValue(it.id)}</b></button>`).join('') : '<p class="desc">道具欄是空的</p>'}</div>
      <h4 class="shop-h">裝備</h4>
      <div class="shop-sell">${G.armor ? `<button class="btn small" data-sell="armor">賣掉${equipName('armor', G.armor)} +${sellValue('armor', G.armor)}</button>` : ''}${G.acc ? `<button class="btn small" data-sell="acc">賣掉${equipName('acc', G.acc)} +${sellValue('acc', G.acc)}</button>` : ''}<p class="desc">武器不能賣（不能空手）。</p></div>`;
    const html = `<div class="shop"><h3>暗商</h3><p class="desc">「要買點什麼嗎？」　持有 <b class="gold">${G.gold}</b> 金幣</p>${tabs}${tab === 'buy' ? buyList : sellList}</div>`;
    const v = await modal(html, [['離開', 'leave', 'primary']], 'wide');
    if (v === 'leave') break;
    if (typeof v === 'string' && v.startsWith('tab:')) { tab = v.slice(4); continue; }
    if (v === 'refresh') {
      const c = refreshCost(); if (G.gold < c) continue;
      G.gold -= c; refreshes++; goods = rollGoods(); toast(`商品刷新了（-${c} 金幣）`); continue;
    }
    if (typeof v === 'string' && v.startsWith('sellitem:')) {
      const slot = G.inv[+v.slice(9)]; if (!slot) continue;
      const gain = itemSellValue(slot.id); G.gold += gain; removeAt(+v.slice(9), 1); toast(`賣掉 ${slot.id}，+${gain} 金幣`); continue;
    }
    if (typeof v === 'string' && v.startsWith('sell:')) {
      const t = v.slice(5), gain = sellValue(t, G[t]);
      G.gold += gain; toast(`賣掉${equipName(t, G[t])}，+${gain} 金幣`); withMaxHpChange(() => { G[t] = null; }); continue;
    }
    const g = goods[v];
    if (!g || g.sold) continue;
    if (g.type === 'item') {
      if (G.gold < g.price) { toast('金幣不夠，可以到「出售」賣掉用不到的道具'); continue; }
      if (!canStack(g.item)) { toast(G.inv.some(s => s.id === g.item) ? `${g.item}已經有 5 個了` : '道具欄已滿，先賣掉一些道具'); continue; }
      addItem(g.item);
      G.gold -= g.price; g.sold = true; toast(`買下 ${g.item}`); continue;
    }
    // 裝備：先跟目前的比較，再決定要不要買
    const cur = curEquip(g.type), back = cur ? sellValue(g.type, cur) : 0, enough = G.gold + back >= g.price;
    const pick2 = await modal(`<div class="cmp"><h3>${{weapon: '武器', armor: '防具', acc: '飾品'}[g.type]}・${g.price} 金幣</h3>
      <div class="cmp-row">${cmpCard('目前', g.type, cur)}${cmpCard('商品', g.type, g.item, cur)}</div>
      <p class="desc">${cur ? `買下後，舊裝備自動換成 ${back} 金幣。` : ''}持有 ${G.gold} 金幣${enough ? '' : '，不夠買（可以到「出售」賣掉用不到的道具）'}</p></div>`,
      enough ? [[`買下並裝備（${g.price}）`, 'buy', 'primary'], ['返回', 'back']] : [['返回', 'back', 'primary']], 'wide');
    if (pick2 !== 'buy') continue;
    G.gold += back - g.price; g.sold = true;
    withMaxHpChange(() => { if (g.type === 'weapon') G.weapon = g.item; else if (g.type === 'armor') G.armor = g.item; else G.acc = g.item; });
    toast(`換上${equipName(g.type, g.item)}`);
  }
  scene.mon = null;
}
document.addEventListener('click', e => {
  if (!modalResolve) return;
  const s = e.target.closest('.shop-item'); if (s && !s.disabled) { modalResolve(+s.dataset.i); return; }
  const t = e.target.closest('[data-sell]'); if (t) { modalResolve('sell:' + t.dataset.sell); return; }
  const tb = e.target.closest('[data-tab]'); if (tb) { modalResolve('tab:' + tb.dataset.tab); return; }
  const rf = e.target.closest('[data-refresh]'); if (rf && !rf.disabled) { modalResolve('refresh'); return; }
  const it = e.target.closest('[data-sellitem]'); if (it) modalResolve('sellitem:' + it.dataset.sellitem);
});

// ---------- 裝備欄、道具欄 ----------
async function openEquip() {
  if (busy && !B) return;
  const s = baseStats(), c = CHAR[G.cls];
  const row = (label, type, it) => it ? `<div class="eq-row">${equipIcon(type, it, 2)}<div><small>${label}</small><b style="color:${RARITY_COLOR[rarityOf(type, it)]}">${equipName(type, it)}</b>${offTag(type, it)}
      <span>${type !== 'acc' ? `第 ${it.tier} 階・` : ''}數值 ${Math.round(it.roll * 100)}%・${statLine(equipStats(type, it))}</span>${type === 'acc' ? `<span class="affix">${ACCS[it.idx].affix}</span>` : ''}${type === 'weapon' ? mythicLine(it, 'span') : ''}</div></div>`
    : `<div class="eq-row empty"><span class="spr-blank"></span><div><small>${label}</small><b>（無）</b></div></div>`;
  const n = unlockedSkills(G.floor);
  const buffs = G.buffs.map(b => `<li class="${b.val > 0 ? 'good' : 'bad'}">${STAT_NAMES[b.stat]} ${b.val > 0 ? '+' : ''}${b.val}%（${{steps: `剩 ${b.left} 步`, floor: '本層內', long: '長時間', next: '下一場戰鬥'}[b.dur]}）</li>`).join('');
  await modal(`<div class="equip">
    <div class="eq-hero">${spr('hero:' + G.cls, 1.6)}<div><h3>${esc(G.name)}</h3><p>${c.class_name}・${c.hero}</p><p class="gold">金幣 ${G.gold}</p></div></div>
    <dl class="stats">${['hp', 'atk', 'def', 'spd', 'crit', 'eva'].map(k => `<div><dt>${STAT_NAMES[k]}</dt><dd>${k === 'hp' ? `${Math.round(B && !B.over ? B.P.hp : G.hp)}/${B && !B.over ? B.P.maxHp : s.hp}` : fmtPct(s[k]) + (k === 'crit' || k === 'eva' ? '%' : '')}</dd></div>`).join('')}</dl>
    ${row('武器', 'weapon', G.weapon)}${row('防具', 'armor', G.armor)}${row('飾品', 'acc', G.acc)}
    <p class="passive"><b>被動・${c.passive.name}</b>${c.passive.effect}</p>
    <ul class="skills">${SKILLS[G.cls].map((k, i) => `<li class="${i < n ? '' : 'locked'}"><b>${k.name}</b><span>${i < n ? `CD ${k.cd}・${k.text}` : unlockText(i)}</span></li>`).join('')}</ul>
    ${buffs || G.poison || G.phoenix ? `<ul class="buffs">${buffs}${G.poison ? '<li class="bad">中毒中</li>' : ''}${G.phoenix ? '<li class="good">持有不死鳥之羽</li>' : ''}</ul>` : ''}
    <p class="seeds">永久之種：${['hp', 'atk', 'def', 'spd', 'crit', 'eva'].map(k => `${STAT_NAMES[k]} ${G.seeds[k]}`).join('、')}</p>
  </div>`, [['關閉', 1, 'primary']], 'wide');
}

// 現在不能用的原因（null 表示可以用）
function itemWhyNot(id, inBattle) {
  const it = ITEMS[id];
  if (inBattle) return B && !B.over ? itemBlock(id) : null;
  if (it.category === '特殊道具' && it.use === 'battle') return `${id}只能在戰鬥中使用`;
  if (it.category === '回復' && G.hp >= maxHp()) return '生命已滿';
  return null;
}
async function openInventory(inBattle) {
  if (!inBattle && busy) return null;
  while (true) {
    if (!G.inv.length) { await modal('<div class="inv"><h3>道具欄</h3><p class="desc">背包是空的。</p></div>', [['關閉', null, 'primary']], 'wide'); return null; }
    const v = await modal(`<div class="inv"><h3>道具欄 <small>${G.inv.length} / 6 格</small></h3>
      <div class="inv-list">${G.inv.map((s, i) => { const why = itemWhyNot(s.id, inBattle); return `<button class="inv-item${why ? ' off' : ''}" data-use="${i}"${why ? ` data-tip="${esc(why)}"` : ''}>${spr(itemIcon(s.id), 2)}<span><b>${s.id}</b> ×${s.n}<small>${itemDesc(s.id)}</small></span><em>${why ? '不能用' : '使用'}</em></button>`; }).join('')}</div>
      ${inBattle ? '<p class="hint">使用道具不消耗回合，用完可以繼續行動。</p>' : '<p class="hint">標示「戰鬥中」的特殊道具只能在戰鬥裡使用。</p>'}</div>`,
      [['關閉', null, 'primary']], 'wide');
    if (v == null) return null;
    if (inBattle) return v;
    await useItemOutside(v); refreshHud();
  }
}
document.addEventListener('click', e => { const s = e.target.closest('[data-use]'); if (s && modalResolve) modalResolve(+s.dataset.use); });

async function useItemOutside(idx) {
  const id = G.inv[idx].id, it = ITEMS[id];
  if (it.category === '回復') {
    if (G.hp >= maxHp()) { toast('生命已滿'); return; }
    removeAt(idx); const r = healPct(it.effect.heal_pct / 100, true); toast(`回復 ${r.healed} 生命`);
  } else if (it.category === '特殊道具') {
    if (it.use === 'battle') { toast(`${id}只能在戰鬥中使用`); return; }
    if (it.key === 'cure') {
      removeAt(idx); G.poison = null; clearBuffs(b => b.val < 0);
      const r = healPct(0.15, true); toast(`解除負面狀態，回復 ${r.healed} 生命`);
    } else if (it.key === 'teleport') {
      if (G.floor % 5 === 0 && G.step >= STEPS_PER_FLOOR - 2) { toast('前方就是頭目，傳送不過去'); return; }
      removeAt(idx); const res = applyFx([['progress', 3]]); toast(res.text.join('；') || '前進了 3 步');
    }
  } else if (it.category === '永久') {
    const stat = it.stat === '任選' ? await chooseStat() : it.stat;
    if (!stat) return;
    removeAt(idx); withMaxHpChange(() => { G.seeds[stat]++; }); toast(`${STAT_NAMES[stat]} 永久 +1 點`);
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


// ---------- 說明頁 ----------
const HELP_TABS = [['basic', '操作'], ['battle', '戰鬥'], ['class', '職業'], ['skill', '技能'], ['status', '狀態'], ['body', '體質'], ['weapon', '武器'], ['acc', '飾品'], ['item', '道具'], ['event', '事件']];
function helpBody(tab) {
  const dl = rows => `<dl class="help-dl">${rows.map(([t, d]) => `<div><dt>${t}</dt><dd>${d}</dd></div>`).join('')}</dl>`;
  if (tab === 'basic') return dl([
    ['選路', '手機在畫面上往上、左、右滑動；電腦用方向鍵或 W、A、D。每一步會遇到戰鬥或事件，10 步為一層。'],
    ['樓層', '每 5 層最後一步是頭目；第 3、6、9…層會在某一步遇到暗商。每過一層回復部分生命。'],
    ['裝備', '武器、防具、飾品各一格。撿到裝備時可以比較後換上或換成金幣。非本職武器的技能效果較弱。'],
    ['道具欄', '6 格，同種道具只佔一格、最多 5 個，點哪一格就用哪一格。'],
    ['存檔', '設定裡可以存檔、讀取，共 3 格，只能在探索時使用。'],
    ['狀態標籤', '生命條與敵人名稱下方的小標籤，電腦滑鼠移上去、手機按住，就會顯示效果。'],
  ]);
  if (tab === 'battle') return dl([
    ['行動順序', '速度決定行動條累積快慢，畫面下方顯示接下來的出手順序。'],
    ['攻擊／技能', '每回合選一個。技能有冷卻，冷卻整局共通、跨戰鬥延續；技能 1 開局就有，技能 2、絕招隨樓層解鎖。'],
    ['防禦', '到你下一次行動前受到的傷害減半，並讓技能冷卻多減 1。部分飾品會把防禦換成別的動作。'],
    ['道具', '戰鬥中使用道具不消耗回合，用完可以繼續行動。'],
    ['意圖預告', '敵人下一步要做什麼會先顯示出來。看到蓄力、強力攻擊時，可以防禦、打斷或先下手。'],
    ['蓄力', '所有怪物都可能蓄力：蓄力那次不攻擊，下一次行動會重擊。'],
    ['特殊技能', '精英與頭目的特殊技能會在第一次行動就發動，之後固定間隔再發動。'],
    ['連擊', '每次攻擊或技能命中 +1 層，每層傷害 +10%，最多 10 層。武鬥家改為多段攻擊每打中一段 +1 層，每層 +2.5%，最多 40 層。被攻擊命中就中斷（防禦中被打也會中斷），閃避、格擋、中毒、灼燒不算。'],
    ['弱點與破防', '打中體質弱點傷害 ×1.4，打到抗性 ×0.7。用弱點類型攻擊會削減破防值，歸零時敵人破防：跳過下一次行動，期間受到的傷害 ×2。'],
  ]);
  if (tab === 'class') {
    const order = G ? [G.cls, ...CLASSES.filter(c => c !== G.cls)] : CLASSES;
    return '<p class="hint">任何職業都能用任何武器；用自己職業的武器，技能才能發揮完整效果。</p>' + order.map(c => {
      const ch = CHAR[c], s = ch.base_stats;
      return `<h4 class="help-h">${ch.class_name}<small> ${ch.hero}${G && c === G.cls ? '（目前）' : ''}</small></h4>` + dl([
        ['介紹', ch.desc],
        ['武器', `${ch.weapon_type}・${DMG_NAMES[CLASS_DMG[c] || 'slash']}傷害`],
        ['初始能力', ['hp', 'atk', 'def', 'spd', 'crit', 'eva'].map(k => `${STAT_NAMES[k]} ${s[k]}${k === 'crit' || k === 'eva' ? '%' : ''}`).join('、')],
        [`被動<small>${ch.passive.name}</small>`, ch.passive.effect],
        ['技能', SKILLS[c].map((k, i) => `<b>${k.name}</b>：${SKILL_BRIEF[c + i]}`).join('<br>')],
      ]);
    }).join('');
  }
  if (tab === 'skill') {
    const order = G ? [G.cls, ...CLASSES.filter(c => c !== G.cls)] : CLASSES;
    return `<p class="hint">傷害 ＝ 你的攻擊 × 技能倍率 × 防禦減免 × 浮動（0.9～1.1）。防禦減免 ＝ 1 − 敵方防禦 ÷（敵方防禦 ＋ 50）。爆擊時 ×1.5。技能傷害另外整體 ×1.3（下面列的是原始倍率）。用非本職武器時，技能倍率與效果 ×0.75。另外會乘上連擊、體質弱點、破防等加成。</p>` +
      order.map(c => `<h4 class="help-h">${CHAR[c].class_name}${G && c === G.cls ? '（目前）' : ''}</h4>` +
        dl(SKILLS[c].map((s, i) => [`${s.name}<small>${unlockText(i)}・CD ${s.cd}</small>`, `${SKILL_BRIEF[c + i]}<br><span class="formula">${s.text}</span>`])) +
        `<p class="hint">被動・${CHAR[c].passive.name}：${CHAR[c].passive.effect}</p>`).join('');
  }
  if (tab === 'weapon') return '<p class="hint">任何職業都能拿任何武器，非本職武器的技能效果 ×0.75。第 20 階的神話武器各有一個特殊效果，這個效果不受非本職影響，可以拿來跟其他職業混搭。</p>' +
    dl(CLASSES.map(c => [`${WEAPON[c][19].name}<small>${CHAR[c].weapon_type}・${MYTHIC[c].name}</small>`, MYTHIC[c].text]));
  if (tab === 'event') return dl([
    ['一般事件', '走到某一步時自動發生，分好事與壞事。'],
    ['好事分級', GOOD_TIER.join(' → ') + '，越後面越少見、效果越大。'],
    ['壞事分級', BAD_TIER.join(' → ') + '，越後面越少見、後果越嚴重。'],
    ['抉擇事件', '給你三個選項，選完才揭曉結果。分級：' + CHOICE_TIER.join(' → ') + '。'],
    ['持續時間', '「數步」為接下來 3 步；「本層內」到這層結束；「長時間」到打完一場精英或頭目戰；「下一場戰鬥」到下一場戰鬥結束。'],
  ]);
  if (tab === 'status') return dl(Object.entries({
    中毒: TIPS.poison, 灼燒: TIPS.burn, '凍結／暈眩': TIPS.freeze, 減速: TIPS.slow, 詛咒: TIPS.cursed, 護盾: TIPS.shield, 破防: TIPS.broken,
    防禦中: TIPS.guard, 格擋: TIPS.parry, 煙幕: TIPS.smoke, 見切: TIPS.mikiri, 狂怒: TIPS.rage, 鏡盾: TIPS.mirror, 不屈: TIPS.unyield,
    連擊: TIPS.combo, 加速: TIPS.haste, 慈悲: TIPS.mercy, 回響: TIPS.echo, 痛苦轉嫁: TIPS.pain, 不死鳥之羽: TIPS.phoenix,
  }).map(([k, v]) => [k, v.replace(/^[^：]+：/, '')]));
  if (tab === 'body') return `<p class="hint">法師、聖女、魔女是魔法傷害，其他職業是斬擊傷害；中毒、灼燒是持續傷害。附魔道具可以改變傷害類型，但效果比本職稍弱。</p>` +
    dl(Object.keys(BODY).map(b => [b, bodyTip(b).replace(/^[^：]+：/, '')]));
  if (tab === 'acc') return CLASSES.map(c => `<h4 class="help-h">${CHAR[c].class_name}</h4>` +
    dl(ACCS.filter(a => a.class_id === c).map(a => [`${a.style}<small>${a.name}</small>`, a.affix]))).join('') +
    '<p class="hint">飾品任何職業都能裝備；非本職時，跟技能有關的效果無效，其餘效果較弱。</p>';
  if (tab === 'item') {
    const SP = {stun: '打斷敵人的蓄力或強力攻擊，讓牠跳過下一次行動（頭目只會被打斷）。', escape: '逃離戰鬥，沒有掉落；頭目戰不能用。',
      fire: '造成無視防禦的火焰傷害，並讓敵人灼燒。', ice: '凍結敵人；精英可能抵抗、頭目免疫，這時改為減速。', cure: '解除所有負面狀態並回復少量生命。',
      mirror: '下一次受到的攻擊完全反彈給敵人。', hourglass: '所有技能冷卻歸零。', berserk: '這場戰鬥攻擊上升，但受到的傷害也增加。',
      lucky: '這場戰鬥獲勝時，掉落更好、金幣更多。', teleport: '在本層直接前進幾步（不會跳過頭目）。',
      ench_slash: '這場戰鬥的攻擊改為斬擊傷害（比本職稍弱）。', ench_magic: '這場戰鬥的攻擊改為魔法傷害（比本職稍弱）。', ench_dot: '這場戰鬥每次攻擊都讓敵人中毒。'};
    const USE = {battle: '戰鬥中', any: '隨時', explore: '探索時'};
    return dl(DATA.items.items.map(i => {
      if (i.category === '回復') return [i.id, `回復${i.id === '大藥水' ? '大量' : i.id === '中藥水' ? '中量' : '少量'}生命；聖女使用效果加倍。`];
      if (i.category === '特殊道具') return [`${i.id}<small>${USE[i.use]}・${i.rarity}</small>`, SP[i.key]];
      if (i.id === '女神之種') return [i.id, '任選一個能力永久提升。'];
      if (i.category === '永久') return [i.id, `${STAT_NAMES[i.stat]}永久提升。`];
      return [i.id, '倒下時自動復活一次；只能從事件取得。'];
    }));
  }
  return '';
}
async function openHelp() {
  let tab = 'basic';
  while (true) {
    const v = await modal(`<div class="help"><h3>說明</h3><div class="help-tabs" role="tablist">${HELP_TABS.map(([k, n]) => `<button class="help-tab${k === tab ? ' on' : ''}" role="tab" aria-selected="${k === tab}" data-help="${k}">${n}</button>`).join('')}</div><div class="help-body">${helpBody(tab)}</div></div>`, [['返回', 0, 'primary']], 'wide');
    if (typeof v === 'string' && v.startsWith('help:')) { tab = v.slice(5); continue; }
    return;
  }
}
document.addEventListener('click', e => { const t = e.target.closest('[data-help]'); if (t && modalResolve) modalResolve('help:' + t.dataset.help); });

// ============ 設定、存檔、讀取 ============
const SAVE_SLOTS = 3;
const saveKey = i => 'em-save-' + i;
function readSlot(i) { try { return JSON.parse(localStorage.getItem(saveKey(i)) || 'null'); } catch (e) { return null; } }
function hasAnySave() { for (let i = 1; i <= SAVE_SLOTS; i++) if (readSlot(i)) return true; return false; }
function fmtTime(t) { const d = new Date(t), p = n => String(n).padStart(2, '0'); return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`; }
function slotText(i) {
  const s = readSlot(i);
  return s ? `${i}．${s.name}・${s.cls}・地下 ${s.floor} 層（${fmtTime(s.time)}）` : `${i}．（空）`;
}
// 選擇存檔欄位；回傳 1～3 或 null
async function pickSlot(title) {
  const btns = [];
  for (let i = 1; i <= SAVE_SLOTS; i++) btns.push([slotText(i), i, 'opt slot-btn']);
  btns.push(['返回', 0]);
  const v = await modal(`<div class="banner"><h3>${title}</h3><p class="hint">存檔只保存在這台裝置上。</p></div>`, btns, 'center choice');
  return v || null;
}
function saveGame(i) {
  try {
    localStorage.setItem(saveKey(i), JSON.stringify({v: 1, time: Date.now(), name: G.name, cls: CHAR[G.cls].class_name, floor: G.floor, G}));
    return true;
  } catch (e) { return false; }
}
function loadGame(i) {
  const s = readSlot(i); if (!s || !s.G) return false;
  newGame(s.G.name, s.G.cls);
  Object.assign(G, s.G);        // 以新局的預設值補齊舊存檔缺少的欄位
  normalizeInv();
  B = null; busy = false; scene.mon = null; scene.ev = null; scene.monDead = 0;
  playerName = G.name;
  show('scr-game'); setMode('explore'); refreshHud();
  $('#log').textContent = `讀取存檔：地下 ${G.floor} 層`;
  return true;
}
async function doSave() {
  const i = await pickSlot('存檔'); if (!i) return;
  if (readSlot(i)) {
    const ok = await modal(`<div class="banner"><h3>覆蓋存檔？</h3><p>${esc(slotText(i))}</p></div>`, [['覆蓋', 1, 'primary'], ['取消', 0]], 'center');
    if (!ok) return;
  }
  toast(saveGame(i) ? `已存到欄位 ${i}` : '存檔失敗：這個環境不允許保存資料');
}
async function doLoad(fromTitle) {
  const i = await pickSlot('讀取'); if (!i) return false;
  if (!readSlot(i)) { toast('這個欄位是空的'); return false; }
  if (!fromTitle) {
    const ok = await modal('<div class="banner"><h3>讀取存檔？</h3><p>目前沒有存檔的進度會遺失。</p></div>', [['讀取', 1, 'primary'], ['取消', 0]], 'center');
    if (!ok) return false;
  }
  if (!loadGame(i)) { toast('存檔損毀，無法讀取'); return false; }
  toast(`已讀取欄位 ${i}`);
  return true;
}
function backToTitle() {
  G = null; B = null; busy = false; scene.mon = null; scene.ev = null;
  $('#title-load').hidden = !hasAnySave();
  show('scr-title');
}
async function openSettings() {
  if (!G || !$('#modal').hidden) return;
  if (B && !B.over) {   // 戰鬥中：只能看說明
    while (true) {
      const v = await modal('<div class="banner"><h3>設定</h3><p class="hint">戰鬥中不能存檔、讀取或回到標題。</p></div>', [['說明', 'help', 'opt'], ['關閉', 0, 'primary']], 'center choice');
      if (v === 'help') { await openHelp(); continue; }
      return;
    }
  }
  if (busy) { toast('事件進行中，請稍候'); return; }
  busy = true;
  try {
    while (true) {
      const v = await modal('<div class="banner"><h3>設定</h3></div>', [['存檔', 'save', 'opt'], ['讀取', 'load', 'opt'], ['說明', 'help', 'opt'], ['回到標題', 'title', 'opt'], ['關閉', 0, 'primary']], 'center choice');
      if (v === 'save') { await doSave(); continue; }
      if (v === 'load') { if (await doLoad(false)) return; continue; }
      if (v === 'help') { await openHelp(); continue; }
      if (v === 'title') {
        const ok = await modal('<div class="banner"><h3>回到標題？</h3><p>目前沒有存檔的進度會遺失。</p></div>', [['回到標題', 1, 'primary'], ['取消', 0]], 'center');
        if (ok) { backToTitle(); return; }
        continue;
      }
      return;
    }
  } finally { busy = false; }
}

// ============ 戰鬥介面（給 battle.js 呼叫） ============
let actResolve = null;
const UI = {
  async battleBegin(B) {
    scene.mon = 'mon:' + B.E.name; scene.monDead = 0;
    scene.monScale = B.E.rank === '頭目' ? 3 : B.E.rank === '精英' ? 2.6 : 2.2;
    $('#bt-name').innerHTML = `${B.E.rank !== '基本' ? `<em class="rank ${B.E.rank === '頭目' ? 'boss' : 'elite'}">${B.E.rank}</em>` : ''}${B.E.name}`;
    $('#bt-name').dataset.tip = `${B.E.name}：${B.E.data.behavior}`;
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
    const tm = typeMul();
    tags.push(chip(E.body, 'body', bodyTip(E.body)));
    if (stHas(E, 'broken')) tags.push(chip('破防中', 'bad', TIPS.broken));
    else {
      const cleave = mythic('berserker'), hot = tm > 1 || cleave;
      tags.push(chip(`破防 ${E.breakV}/${E.breakMax}`, hot ? 'warn' : '', `破防值：用牠弱點的傷害類型攻擊會削減，歸零時破防（跳過行動、受到更多傷害）。${tm > 1 ? '你現在打的是弱點！' : cleave ? '劈開萬物：你的每次攻擊都會削減破防值。' : '你現在打的不是弱點。'}`));
    }
    if (stHas(E, 'poison')) tags.push(chip(E.venom ? `中毒 ×${E.venom}` : '中毒', 'bad', TIPS.poison));
    if (stHas(E, 'burn')) tags.push(chip('灼燒', 'bad', TIPS.burn));
    if (stHas(E, 'freeze')) tags.push(chip('凍結', 'bad', TIPS.freeze));
    if (stHas(E, 'slow')) tags.push(chip('減速', 'bad', TIPS.slow));
    if (stHas(E, 'cursed')) tags.push(chip('詛咒', 'bad', TIPS.cursed));
    if (E.pain.length) tags.push(chip('痛苦轉嫁', 'bad', TIPS.pain));
    if (stHas(E, 'shield')) tags.push(chip(`護盾 ${Math.round(stGet(E, 'shield').v)}`, 'good', TIPS.shield));
    tags.push(...modChips(E));
    if (E.enraged) tags.push(chip('狂暴', 'good', TIPS.enraged));
    if (E.stack) tags.push(chip(`攻擊 +${Math.round(E.stack * 100)}%`, 'good', TIPS.stack));
    if (E.phase >= 2) tags.push(chip(`第 ${E.phase} 階段`, 'good', E.phase >= 3 ? TIPS.phase3 : TIPS.phase2));
    if (E.batTurns > 0) tags.push(chip('蝙蝠化', 'good', TIPS.bat));
    const mons = B.summonsE.filter(x => x.turns > 0).length;
    if (mons) tags.push(chip(`手下 ×${mons}`, 'good', TIPS.minion));
    if (E.fx.iceArmor && E.iceHits < E.fx.iceArmor) tags.push(chip(`冰甲 ${E.fx.iceArmor - E.iceHits}`, 'good', TIPS.iceArmor));
    if (E.fx.stoneStart && E.turns < E.fx.stoneStart) tags.push(chip('石化', 'good', TIPS.stone));
    if (E.fx.defUpLow && hpFrac(E) < E.fx.defUpLow[0]) tags.push(chip('防禦↑', 'good', TIPS.defUp));
    if (E.fx.spdUpLow && hpFrac(E) < E.fx.spdUpLow[0]) tags.push(chip('速度↑', 'good', TIPS.spdUp));
    $('#bt-status').innerHTML = tags.join('');
    const ii = intentInfo();
    const ie = $('#bt-intent'); ie.hidden = !ii;
    if (ii) { ie.textContent = (mythic('ranger') ? '先見：' : '下一步：') + ii.text; ie.classList.toggle('warn', ii.warn); }
    const order = predictOrder(6);
    $('#bt-order').innerHTML = order.map(o => o === 'P' ? `<i class="me">${spr('hero:' + G.cls, 0.32)}</i>` : `<i class="foe">${spr('mon:' + E.name, 0.6)}</i>`).join('');
    // 玩家
    $('#hp-fill').style.width = (100 * P.hp / P.maxHp) + '%';
    $('#hp-text').textContent = `${Math.round(P.hp)} / ${P.maxHp}`;
    const pt = [];
    const has = k => stHas(P, k);
    if (P.combo) pt.push(chip(`連擊 ${P.combo}`, 'combo', TIPS.combo));
    if (has('poison')) pt.push(chip('中毒', 'bad', TIPS.poison));
    if (has('burn')) pt.push(chip('灼燒', 'bad', TIPS.burn));
    if (has('slow')) pt.push(chip('減速', 'bad', TIPS.slow));
    if (has('haste')) pt.push(chip('加速', 'good', TIPS.haste));
    if (has('mercy')) pt.push(chip('慈悲', 'good', TIPS.mercy));
    if (P.echo != null) pt.push(chip('回響・' + SKILLS[G.cls][P.echo].name, 'good', TIPS.echo));
    if (has('freeze')) pt.push(chip('凍結', 'bad', TIPS.freeze));
    if (has('guard')) pt.push(hasAcc('城塞之心') ? chip('架盾', 'good', TIPS.bulwarkGuard) : chip('防禦中', 'good', TIPS.guard));
    if (has('shield')) pt.push(chip(`護盾 ${Math.round(stGet(P, 'shield').v)}`, 'good', TIPS.shield));
    if (G.blockHits) pt.push(chip(`結界 ×${G.blockHits}`, 'good', TIPS.barrier));
    if (has('nextCrit') || sureCrit()) pt.push(chip('必定爆擊', 'good', TIPS.nextCrit));
    if (has('hot') || has('qigong')) pt.push(chip(has('hot') ? '持續回復' : '氣功護體', 'good', has('hot') ? TIPS.hot : TIPS.qigong));
    if (B.summonP && B.summonP.turns > 0) pt.push(chip(`深淵魔物 ×${B.summonP.turns}`, 'good', TIPS.summon));
    if (P.nextBoost > 1) pt.push(chip('下一擊強化', 'good', TIPS.nextBoost));
    if (hasAcc('龍紋腰帶') && P.dragonStack > 0) pt.push(chip(`龍紋 +${Math.round(P.dragonStack * 100)}%`, 'good', TIPS.dragon));
    if (hasAcc('薔薇胸針') && P.roseStacks > 0) pt.push(chip(`薔薇 ×${P.roseStacks}`, 'good', TIPS.rose));
    if (hasAcc('守誓者之盾')) pt.push(chip(`守誓 ${2 - P.oathBlocks}`, P.oathBlocks < 2 ? 'good' : '', TIPS.oath));
    if (hasAcc('老兵勳章') && !P.veteranUsed) pt.push(chip('老兵意志', 'good', TIPS.veteran));
    if (hasAcc('不屈紋章') && !P.unyieldUsed) pt.push(chip('不屈待命', 'good', TIPS.unyieldReady));
    if (B.skillHalf) pt.push(chip('技能冷卻減半', 'good', TIPS.cdhalf));
    for (const [k, n] of [['parry', '格擋'], ['smoke', '煙幕'], ['mikiri', '見切'], ['rage', '狂怒'], ['mikiriStance', '見切架式'], ['aim', '瞄準'], ['mirror', '鏡盾'], ['potRage', '狂暴藥'], ['unyield', '不屈']])
      if (has(k)) pt.push(chip(n, 'good', TIPS[k]));
    if (!has('unyield') && P.delayPool > 0) pt.push(chip('延遲傷害', 'bad', TIPS.delay));
    if (B.enchant) pt.push(chip(`附魔・${DMG_NAMES[B.enchant]}`, 'good', B.enchant === 'dot' ? '附魔：每次攻擊讓敵人中毒。' : `附魔：攻擊改為${DMG_NAMES[B.enchant]}傷害（效果比本職稍弱）。`));
    if (B.lucky) pt.push(chip('幸運金幣', 'good', TIPS.lucky));
    const acc = [[P.judge && ownAcc('審判之槍穗'), `審判 ×${P.judge}`, 'judge'], [P.pact && ownAcc('血月墜飾'), `血契 ×${P.pact}`, 'pact'], [P.volt, `電荷 ×${P.volt}`, 'volt'], [P.qi, `氣 ×${P.qi}`, 'qi'],
      [P.bulwark > 0, '架盾力量', 'bulwark'], [P.debt > 0, '血債', 'debt'], [P.iai, '拔刀', 'iai'], [P.shout, '怒吼', 'shout'], [P.holyMark, '審判印記', 'holyMark'], [P.chain > 0 && hasAcc('雙刃徽章'), `連斬 ${P.chain}`, 'chain']];
    for (const [on, t, k] of acc) if (on) pt.push(chip(t, 'good', TIPS[k]));
    pt.push(...modChips(P));
    if (G.phoenix) pt.push(chip('不死鳥之羽', 'good', TIPS.phoenix));
    $('#hud-status').innerHTML = pt.join('');
    $('#hud-gold').textContent = G.gold;
    // 防禦按鈕：依飾品與狀態變成不同動作
    const gi = GUARD_INFO[guardKind()], gb = $('#bt-guard');
    const gk = guardKind(), gnote = [];
    if (['guard', 'bulwark', 'iai'].includes(gk)) {
      if (hasAcc('守誓者之盾')) gnote.push(P.oathBlocks < 2 ? '守誓之盾：防禦中能完全擋下蓄力重擊或強力攻擊。' : '守誓之盾：本場的次數已用完。');
      if (hasAcc('鐵壁戒指')) gnote.push('鐵壁戒指：防禦中被攻擊時會反擊。');
    }
    gb.innerHTML = `${gi.name}<small>${gi.sub}</small>`; gb.dataset.tip = gi.tip + gnote.join('');
    gb.classList.toggle('alt', gi !== GUARD_INFO.guard);
    $('#bt-attack').dataset.tip = attackTip(P);
    $('#bt-item').dataset.tip = '道具：使用道具不消耗回合，用完還能繼續行動。';
    // 技能按鈕
    const n = unlockedSkills(G.floor);
    $$('.sk-btn').forEach((b, i) => {
      const sk = SKILLS[G.cls][i];
      const locked = i >= n, cd = P.cds[i];
      b.disabled = false; b.classList.toggle('off', locked || cd > 0);
      b.dataset.tip = locked ? `${sk.name}：${SKILL_BRIEF[G.cls + i]}（通過第 ${SKILL_UNLOCK[i]} 層後解鎖）` : `${sk.name}：${SKILL_BRIEF[G.cls + i]}${skillNotes(i)}`;
      b.innerHTML = `<b>${locked ? '未解鎖' : sk.name}</b><small>${locked ? `第 ${SKILL_UNLOCK[i]} 層後` : cd > 0 ? `冷卻 ${cd}` : '可使用'}</small>`;
      b.title = locked ? '' : `${sk.text}；冷卻 ${skillCd(i)}`;
    });
    $('#bt-item').disabled = !G.inv.length;
  },
  waitAction(B, again) {
    this.battleRefresh(B);
    $('#ctrl-battle').classList.add('ready');
    if (!again) UI.log('輪到你了');
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
    if (e.target.closest('[data-tip]')) return;
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
    else if (d === 'd') act({type: 'guard'});
  });
  $('#view-wrap').addEventListener('click', e => { if (e.target.closest('[data-tip]')) return; if ($('#scr-game').dataset.mode === 'battle' && !('ontouchstart' in window)) act({type: 'attack'}); });
  $('#bt-attack').onclick = () => act({type: 'attack'});
  $('#bt-guard').onclick = () => act({type: 'guard'});
  $$('.sk-btn').forEach((b, i) => b.onclick = () => { if (!b.classList.contains('off')) act({type: 'skill', idx: i}); });
  $('#bt-item').onclick = async () => { if (!actResolve) return; const idx = await openInventory(true); if (idx != null) act({type: 'item', idx}); };
  $('#btn-equip').onclick = () => openEquip();
  $('#btn-set').onclick = () => openSettings();
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
      else if (k === 's' || k === 'arrowdown') act({type: 'guard'});
      else if (['1', '2', '3'].includes(k)) { const b = $$('.sk-btn')[+k - 1]; if (!b.classList.contains('off')) b.click(); }
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
    view = $('#view'); vctx = view.getContext('2d'); fitView();
    addEventListener('resize', fitView);
    initTitle(); initInput(); initTips(); show('scr-title'); loop();
  };
  ATLAS = new Image();
  ATLAS.onload = start;
  // 內嵌圖集若失敗就改讀圖片檔；兩者都失敗仍啟動遊戲（以純色顯示），不讓畫面卡在全黑
  ATLAS.onerror = () => { if (ATLAS.src.startsWith('data:')) ATLAS.src = 'assets/atlas.png'; else start(); };
  ATLAS.src = typeof ATLAS_SRC === 'string' ? ATLAS_SRC : 'assets/atlas.png';
}
boot();

// 規則資料：技能、怪物特殊行為、地區、道具掉落表
// 數值依企畫書「技能系統」「怪物系統」「道具與金幣」

const REGIONS = [
  {key:'forest',  name:'幽暗森林', sky:'#0d1410', fog:'#1b2a1c'},
  {key:'waterway',name:'沉沒水道', sky:'#0a1218', fog:'#14283a'},
  {key:'lava',    name:'熔岩礦坑', sky:'#170a08', fog:'#3a160c'},
  {key:'frost',   name:'冰封墓城', sky:'#0c1118', fog:'#22324a'},
  {key:'abyss',   name:'深淵魔域', sky:'#12060f', fog:'#2e0f26'},
  {key:'castle',  name:'古堡',     sky:'#0d0b12', fog:'#241d2c'},
];

// 技能：type 0 普通 / 1 強力 / 2 絕招；CD 2/6/6（只在自己的回合倒數，跨戰鬥延續）
const SKILLS = {
  swordsman: [
    {name:'雙連斬', cd:2, text:'2 段，每段攻擊 ×0.8'},
    {name:'格擋反擊', cd:6, text:'擋下敵人下一次攻擊，並反擊敵方攻擊 ×2.0'},
    {name:'破軍一閃', cd:6, text:'攻擊 ×3.5，必定爆擊'}],
  knight: [
    {name:'盾擊突刺', cd:2, text:'攻擊 ×1.3；敵人攻擊 −20%，2 回合'},
    {name:'鋼鐵壁壘', cd:6, text:'自己防禦 ×2，3 回合'},
    {name:'聖騎衝鋒', cd:6, text:'攻擊 ×3 ＋ 防禦 ×2'}],
  rogue: [
    {name:'死角突刺', cd:2, text:'攻擊 ×1.2；這一擊爆擊率 +50%'},
    {name:'煙幕潛行', cd:6, text:'敵人下一次攻擊必定落空；自己下一擊必定爆擊'},
    {name:'影襲・千刃', cd:6, text:'6 段，每段攻擊 ×0.6，各自判定爆擊'}],
  wizard: [
    {name:'火球術', cd:2, text:'攻擊 ×1.6，敵人防禦只算 70%'},
    {name:'冰霜新星', cd:6, text:'攻擊 ×1.8，凍結 1 回合（精英抵抗或頭目免疫時改為減速）'},
    {name:'天雷殞落', cd:6, text:'攻擊 ×5.0'}],
  berserker: [
    {name:'裂地重擊', cd:2, text:'攻擊 ×1.8'},
    {name:'嗜血狂怒', cd:6, text:'自己攻擊 +50%、防禦 −30%，3 回合'},
    {name:'狂戰旋風', cd:6, text:'5 段，每段攻擊 ×0.8；吸取 20%'}],
  cleric: [
    {name:'聖光彈', cd:2, text:'攻擊 ×1.3；回復 8%'},
    {name:'治癒祈禱', cd:6, text:'回復 40%，解除所有負面狀態'},
    {name:'女神審判', cd:6, text:'攻擊 ×3.5；之後 3 回合每回合回復 8%'}],
  fencer: [
    {name:'疾風突刺', cd:2, text:'攻擊 ×1.4；40% 機率追加一擊 ×0.7'},
    {name:'見切', cd:6, text:'閃避 +30%，3 回合；閃避成功時反擊 ×0.8'},
    {name:'薔薇終舞', cd:6, text:'4 段，每段攻擊 ×0.7；最後一擊 ×1.2 必定爆擊'}],
  witch: [
    {name:'暗影吸取', cd:2, text:'攻擊 ×1.3；吸取 50%'},
    {name:'詛咒之印', cd:6, text:'敵人攻擊、防禦各 −25%，3 回合'},
    {name:'深淵召喚', cd:6, text:'攻擊 ×2.5；召喚物留場 2 回合，每回合 ×0.8；吸取 30%'}],
  ranger: [
    {name:'瞄準射擊', cd:2, text:'攻擊 ×1.6，無視閃避'},
    {name:'毒藤之箭', cd:6, text:'攻擊 ×1.2；中毒 4 回合，每回合 ×0.4'},
    {name:'流星箭雨', cd:6, text:'8 段，每段攻擊 ×0.5'}],
  monk: [
    {name:'連環拳', cd:2, text:'4 段，每段攻擊 ×0.4'},
    {name:'氣功護體', cd:6, text:'回復 20%；防禦 +50%，3 回合'},
    {name:'昇龍百裂拳', cd:6, text:'8 段 ×0.3 ＋ 收尾 ×2.0'}],
};

// 怪物特殊行為（名稱 → 行為標籤，引擎依標籤執行）
const MON_FX = {
  // 幽暗森林
  '森林史萊姆': {},
  '野狼': {multi:[2,0.6]},
  '毒菇人': {onHit:{poison:[0.3,0.3,3]}},
  '哥布林斥候': {onHit:{steal:0.2}},
  '荊棘樹精': {reflect:0.15},
  '巨角野豬': {first:1.5},
  '哥布林薩滿': {healEvery:[3,0.2]},
  '狼王・灰鬃': {multi:[2,0.6], spdUpLow:[0.5,0.5]},
  '哥布林戰將': {every:[3,2]},
  '古樹守衛': {regen:0.05},
  '毒蛛女王': {onHit:{poison:[1,0.3,3]}, every:[3,1,{slow:1}], summonAt:[0.5,0.3]},
  '腐根巨人': {hpMul:1.3, every:[4,1,{gauge:50}], enrage:[0.3,0.5]},
  // 沉沒水道
  '水泡史萊姆': {revive:0.3},
  '鋸齒魚人': {multi:[2,0.6]},
  '毒刺水母': {onHit:{poison:[1,0.3,3]}, evaBonus:15},
  '甲殼蟹': {critImmune:1},
  '沼澤蛙': {onHit:{slow:0.2}},
  '鱷魚獵手': {enrage:[0.3,0.5]},
  '魚人祭司': {shieldEvery:[3,3]},
  '深潭電鰻': {onHit:{gauge:[0.2,30]}},
  '魚人隊長': {every:[3,1,{hits:3}]},
  '巨鉗蟹王': {counter:0.2},
  '沉沒的巫女': {every:[3,1,{atkDown:[0.25,3]}], summon:[4,0.3,3]},
  '深海巨鯨': {every:[4,3], spdUpByHp:1},
  // 熔岩礦坑
  '熔岩史萊姆': {onHit:{burn:[1,0.3,3]}},
  '火蜥蜴': {every:[2,1.3,{burn:1}]},
  '礦坑地精': {selfDestruct:[0.3,3]},
  '岩石魔像': {dr:0.2},
  '火焰蝙蝠': {evaBonus:20},
  '黑曜騎士': {onHit:{defBreak:[1,0.2,3]}},
  '地獄犬': {multi:[2,0.6], onHit:{burn:[1,0.3,3]}},
  '熔岩魔像': {burnAttacker:0.3},
  '礦坑監工': {stackAtk:0.1},
  '炎之精靈': {every:[3,2,{burn:1}]},
  '鍛造巨人': {every:[4,3], defUpLow:[0.5,2]},
  '炎龍': {every:[3,2.5,{burn:1}], evaBonus:20, enrage:[0.3,0.5]},
  // 冰封墓城
  '骷髏士兵': {revive:0.01},
  '冰霜幽靈': {evaBonus:25, onHit:{slow:0.2}},
  '殭屍': {onHit:{poison:[1,0.3,3]}},
  '冰狼': {multi:[2,0.6], onHit:{slow:0.2}},
  '屍鴉群': {multi:[3,0.4]},
  '骸骨弓手': {halfEva:1},
  '吸血鬼侍從': {lifesteal:0.5},
  '死靈法師': {summon:[3,0.4,3]},
  '冰霜騎士': {onHit:{freeze:0.2}},
  '無頭騎士': {dualLow:0.5},
  '冰之女王': {every:[3,1.5,{slow:1}], iceArmor:3},
  '巫妖王': {summon:[4,0.4,3], curseOnce:0.25, revive:0.5},
  // 深淵魔域
  '小惡魔': {onHit:{cdUp:[0.2,1]}},
  '混沌史萊姆': {randBuff:0.2},
  '夢魘': {onHit:{gauge:[0.25,50]}},
  '深淵觸手': {regen:0.05},
  '魅魔': {lifesteal:0.3, onHit:{atkDown:[1,0.15,3]}},
  '惡魔騎士': {onHit:{defBreak:[1,0.2,3]}},
  '混沌之眼': {stripEvery:3},
  '地獄領主': {onHit:{burn:[1,0.3,3]}, enrage:[0.5,0.5]},
  '虛空行者': {evaBonus:30, counterDodge:1},
  '墮落天使': {cleanseEvery:[3,0.15]},
  '深淵魔將': {multi:[2,0.7], summonAt:[0.5,0.6]},
  '深淵之主': {phases:1},
  // 古堡
  '古堡蝙蝠群': {multi:[3,0.4]},
  '活化盔甲': {dr:0.2},
  '石像鬼': {stoneStart:2},
  '幽靈女僕': {evaBonus:25},
  '詛咒畫像': {onHit:{spdDown:[1,0.2,3]}},
  '舞動人偶': {multi:[2,0.6]},
  '吸血蝙蝠': {lifesteal:0.3},
  '骷髏衛兵': {revive:0.01},
  '地牢獄卒': {onHit:{gauge:[0.2,30]}},
  '鬼火': {onHit:{burn:[1,0.3,3]}},
  '瘟疫鼠群': {multi:[3,0.4], onHit:{poison:[1,0.2,3]}},
  '斷頭台處刑者': {execute:[0.3,2]},
  '鏡中魔影': {evaBonus:20, counterDodge:1},
  '煉金失敗品': {explodeDeath:1.5},
  '古堡獵犬': {multi:[2,0.6]},
  '血族侍從': {lifesteal:0.5},
  '怨靈騎士': {onHit:{defBreak:[1,0.2,3]}},
  '黑魔導書': {cdEvery:[3,2]},
  '寶箱怪': {extraDrop:1},
  '宮廷小丑': {randomAct:1},
  '吸血伯爵': {lifesteal:0.5, batForm:1},
  '黑騎士': {every:[3,1,{hits:3}]},
  '古堡管家': {summon:[3,0.4,3]},
  '血腥伯爵夫人': {stackAtk:0.1},
  '石像鬼領主': {regen:0.05},
  '處刑人': {execute:[0.4,2]},
  '瘋狂煉金術士': {onHit:{randDot:1}},
  '幽靈新娘': {evaBonus:30, onHit:{atkDown:[1,0.2,3]}},
  '魔像衛士': {dr:0.3, spdMul:0.6},
  '夢魘騎士': {onHit:{gauge:[0.25,50]}},
  '吸血鬼真祖': {lifesteal:0.5, every:[3,2,{drain:1}], revive:0.3},
  '亡靈國王': {summon:[3,0.4,3], curseOnce:0.25, enrage:[0.3,0.5]},
  '鍊金之王': {onHit:{randDot:1, slow:0.33}, potionOnce:[0.5,0.3]},
  '鐘樓巨像': {dr:0.4, every:[4,3,{gauge:50}]},
  '鏡之魔王': {mirror:1.2},
};

// 類型倍率（生命、攻擊、防禦、速度、閃避加成）與階級倍率
const ROLES = {'標準':[1,1,1,1,0],'坦克':[1.5,0.8,1.8,0.8,0],'速攻':[0.7,1,0.7,1.5,10],
  '重擊':[1.1,1.4,1,0.7,0],'術者':[0.8,1.2,0.6,1,0],'群聚':[0.6,0.7,0.5,1.2,0]};
const RANKS = {'基本':[1,1],'精英':[1.8,1.3],'頭目':[3,1.5]};

// 道具掉落表（%）
const ITEM_DROP = {
  normal:[['小藥水',30],['中藥水',15],['大藥水',5],['buff0',25],['buff1',15],['buff2',5],['seed',4.5],['女神之種',0.5]],
  elite: [['小藥水',20],['中藥水',15],['大藥水',10],['buff0',15],['buff1',20],['buff2',10],['seed',9],['女神之種',1]],
};
const BUFF_NAMES = {hp:'活力藥劑',atk:'力量藥劑',def:'鐵壁藥劑',spd:'疾風藥劑',crit:'鷹眼藥劑',eva:'幻影藥劑'};
const SEED_NAMES = {hp:'生命之種',atk:'力量之種',def:'守護之種',spd:'迅捷之種',crit:'慧眼之種',eva:'幻影之種'};
const STAT_NAMES = {hp:'生命',atk:'攻擊',def:'防禦',spd:'速度',crit:'爆擊率',eva:'閃避',hit:'命中',gold:'金幣獲得量',heal:'回復效果'};

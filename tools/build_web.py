"""產生網頁版需要的素材圖集（web/assets/atlas.png）與資料檔（web/data.js）。

怪物、道具、場景圖暫時使用 Dungeon Crawl Stone Soup 的開源圖塊（CC0）。
用法：python3 tools/build_web.py <DCSS rltiles 資料夾>
"""
import json, os, sys, glob
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
RL = sys.argv[1]
WEB = os.path.join(ROOT, 'web')

# 怪物名稱 → DCSS 圖塊
MON_TILE = {
    '森林史萊姆': 'amorphous/slime_creature', '野狼': 'animals/wolf', '毒菇人': 'fungi_plants/wandering_mushroom',
    '哥布林斥候': 'humanoids/goblin', '荊棘樹精': 'fungi_plants/alderking0', '巨角野豬': 'animals/hog',
    '哥布林薩滿': 'humanoids/gnoll_shaman', '狼王・灰鬃': 'animals/warg', '哥布林戰將': 'humanoids/hobgoblin',
    '古樹守衛': 'fungi_plants/alderking1', '毒蛛女王': 'animals/broodmother', '腐根巨人': 'fungi_plants/fungal_shambler',
    '水泡史萊姆': 'amorphous/azure_jelly', '鋸齒魚人': 'demihumanoids/merfolk/merfolk', '毒刺水母': 'aquatic/jellyfish',
    '甲殼蟹': 'animals/ghost_crab', '沼澤蛙': 'animals/bullfrog', '鱷魚獵手': 'animals/crocodile',
    '魚人祭司': 'demihumanoids/merfolk/merfolk_aquamancer', '深潭電鰻': 'aquatic/electric_eel',
    '魚人隊長': 'demihumanoids/merfolk/merfolk_impaler', '巨鉗蟹王': 'abyss/apocalypse_crab',
    '沉沒的巫女': 'demihumanoids/merfolk/merfolk_siren', '深海巨鯨': 'aquatic/kraken_head',
    '熔岩史萊姆': 'amorphous/rockslime', '火蜥蜴': 'demihumanoids/salamander', '礦坑地精': 'humanoids/kobold_blastminer',
    '岩石魔像': 'nonliving/iron_golem', '火焰蝙蝠': 'animals/fire_bat', '黑曜騎士': 'humanoids/humans/hell_knight',
    '地獄犬': 'animals/hell_hound', '熔岩魔像': 'nonliving/blazeheart_golem', '礦坑監工': 'humanoids/ogre',
    '炎之精靈': 'nonliving/fire_elemental', '鍛造巨人': 'humanoids/giants/fire_giant', '炎龍': 'dragons/fire_dragon',
    '骷髏士兵': 'undead/skeletal_warrior', '冰霜幽靈': 'undead/freezing_wraith', '殭屍': 'undead/zombies/zombie_human',
    '冰狼': 'animals/ice_beast', '屍鴉群': 'animals/raven', '骸骨弓手': 'undead/wight', '吸血鬼侍從': 'undead/vampire',
    '死靈法師': 'humanoids/humans/necromancer', '冰霜騎士': 'humanoids/humans/ironbound_frostheart',
    '無頭騎士': 'humanoids/humans/death_knight', '冰之女王': 'demons/blizzard_demon', '巫妖王': 'undead/ancient_lich',
    '小惡魔': 'demons/crimson_imp', '混沌史萊姆': 'demons/chaos_spawn1', '夢魘': 'undead/phantom',
    '深淵觸手': 'aberrations/tentacled_monstrosity', '魅魔': 'demons/drude', '惡魔騎士': 'demons/hell_sentinel',
    '混沌之眼': 'eyes/great_orb_of_eyes', '地獄領主': 'demons/brimstone_fiend', '虛空行者': 'abyss/lurking_horror',
    '墮落天使': 'holy/angel', '深淵魔將': 'demons/executioner', '深淵之主': 'demons/balrug',
    '古堡蝙蝠群': 'animals/bat', '活化盔甲': 'nonliving/armour_echo', '石像鬼': 'nonliving/gargoyle',
    '幽靈女僕': 'undead/ghost', '詛咒畫像': 'undead/curse_skull', '舞動人偶': 'nonliving/shadow_puppet',
    '吸血蝙蝠': 'animals/vampire_bat', '骷髏衛兵': 'undead/ancient_champion', '地牢獄卒': 'humanoids/humans/vault_guard',
    '鬼火': 'nonliving/foxfire', '瘟疫鼠群': 'animals/rat', '斷頭台處刑者': 'humanoids/giants/juggernaut',
    '鏡中魔影': 'undead/shadow_wraith', '煉金失敗品': 'nonliving/flesh_golem', '古堡獵犬': 'animals/hound',
    '血族侍從': 'undead/vampire_mage', '怨靈騎士': 'nonliving/ancestor_knight', '黑魔導書': 'nonliving/crystal_tome',
    '寶箱怪': '../item/misc/misc_box_of_beasts', '宮廷小丑': 'humanoids/humans/killer_klown_purple',
    '吸血伯爵': 'undead/vampire_knight', '黑騎士': 'humanoids/elves/deep_elf_knight',
    '古堡管家': 'humanoids/humans/servant_of_whispers', '血腥伯爵夫人': 'humanoids/humans/occultist',
    '石像鬼領主': 'nonliving/war_gargoyle', '處刑人': 'humanoids/iron_troll', '瘋狂煉金術士': 'humanoids/humans/arcanist',
    '幽靈新娘': 'undead/eidolon', '魔像衛士': 'nonliving/crystal_guardian', '夢魘騎士': 'draco/draco-job-knight',
    '吸血鬼真祖': 'undead/vampire_bloodprince', '亡靈國王': 'undead/royal_mummy',
    '鍊金之王': 'humanoids/humans/ragged_hierophant', '鐘樓巨像': 'humanoids/giants/titan', '鏡之魔王': 'abyss/worldbinder',
}
# 道具、防具、飾品、事件用的圖塊（相對 rltiles/）
MISC_TILE = {
    'potion_s': 'item/potion/ruby', 'potion_m': 'item/potion/pink', 'potion_l': 'item/potion/golden',
    'sp_stun': 'item/misc/misc_tremorstones', 'sp_escape': 'item/potion/cloudy', 'sp_fire': 'item/potion/orange',
    'sp_ice': 'item/potion/brilliant_blue', 'sp_cure': 'item/potion/emerald', 'sp_mirror': 'item/misc/misc_phantom_mirror',
    'sp_hourglass': 'item/misc/misc_lantern', 'sp_berserk': 'item/potion/black', 'sp_lucky': 'item/gold/',
    'sp_teleport': 'item/scroll/i-teleportation', 'sp_ench_slash': 'item/misc/misc_stone_inert',
    'sp_ench_magic': 'item/potion/silver', 'sp_ench_dot': 'item/potion/murky',
    'seed': 'item/gem/', 'seed_god': 'item/misc/orb_of_zot1', 'phoenix': 'item/misc/misc_fan',
    'gold': 'item/gold/', 'chest': 'item/misc/misc_box_of_beasts', 'scroll': 'item/scroll/',
    'armor_hp': 'item/armour/robe1', 'armor_atk': 'item/armour/troll_leather_armour', 'armor_def': 'item/armour/plate1',
    'armor_spd': 'item/armour/leather_armour1', 'armor_crit': 'item/armour/animal_skin1', 'armor_eva': 'item/armour/cloak2',
    'acc_ring': 'item/ring/gold', 'acc_amulet': 'item/amulet/ruby',
    'ev_good': 'item/misc/misc_lamp', 'ev_bad': 'item/misc/misc_stone', 'ev_choice': 'item/misc/misc_crystal',
    'merchant': 'dngn/shops/', 'stairs': 'dngn/gateways/',
}
# 地區場景：牆、地板
SCENE_TILE = {
    'forest': ('dngn/wall/stone_mossy', 'dngn/floor/grass', 'dngn/trees/tree'),
    'waterway': ('dngn/wall/wall_stone_shoals', 'dngn/floor/swamp', 'dngn/water/shallow_water'),
    'lava': ('dngn/wall/volcanic_wall', 'dngn/floor/volcanic_floor', 'dngn/floor/lava'),
    'frost': ('dngn/wall/ice_wall', 'dngn/floor/ice', 'dngn/wall/icy_stone'),
    'abyss': ('dngn/wall/wall_stone_abyss_a', 'dngn/floor/demonic_red', 'dngn/wall/abyss'),
    'castle': ('dngn/wall/brick_dark_1_', 'dngn/floor/crypt', 'dngn/wall/church'),
}

def find(prefix):
    p = os.path.join(RL, prefix)
    if os.path.isfile(p + '.png'): return p + '.png'
    c = sorted(glob.glob(p + '*.png')) or sorted(glob.glob(os.path.join(p, '*.png')))
    if not c: raise SystemExit('找不到圖塊：' + prefix)
    return c[0]

def main():
    tiles = {}   # key -> Image
    for n, t in MON_TILE.items(): tiles['mon:' + n] = Image.open(find('mon/' + t if not t.startswith('..') else t[3:])).convert('RGBA')
    for k, t in MISC_TILE.items(): tiles['misc:' + k] = Image.open(find(t)).convert('RGBA')
    for reg, ts in SCENE_TILE.items():
        for i, t in enumerate(ts): tiles['scene:%s:%d' % (reg, i)] = Image.open(find(t)).convert('RGBA')
    chars = json.load(open(os.path.join(ROOT, 'characters/characters.json'), encoding='utf-8'))
    for c in chars:
        tiles['hero:' + c['id']] = Image.open(os.path.join(ROOT, 'characters', c['image_pixel'])).convert('RGBA')
        tiles['wstrip:' + c['id']] = Image.open(os.path.join(ROOT, 'weapons/icons/%s_strip.png' % c['id'])).convert('RGBA')
    # 簡單的分層裝箱
    items = sorted(tiles.items(), key=lambda kv: -kv[1].height)
    W = 1024; x = y = rowh = 0; pos = {}
    for k, im in items:
        if x + im.width > W: x = 0; y += rowh + 1; rowh = 0
        pos[k] = [x, y, im.width, im.height]; x += im.width + 1; rowh = max(rowh, im.height)
    H = y + rowh
    atlas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    for k, im in tiles.items(): atlas.paste(im, tuple(pos[k][:2]))
    os.makedirs(os.path.join(WEB, 'assets'), exist_ok=True)
    atlas.save(os.path.join(WEB, 'assets/atlas.png'), optimize=True)

    data = dict(
        atlas=pos,
        characters=chars,
        weapons=json.load(open(os.path.join(ROOT, 'weapons/weapons.json'), encoding='utf-8')),
        armor=json.load(open(os.path.join(ROOT, 'armor/armor.json'), encoding='utf-8')),
        accessories=json.load(open(os.path.join(ROOT, 'accessories/accessories.json'), encoding='utf-8')),
        items=json.load(open(os.path.join(ROOT, 'items/items.json'), encoding='utf-8')),
        monsters=json.load(open(os.path.join(ROOT, 'monsters/monsters.json'), encoding='utf-8')),
    )
    for w in data['weapons']: w.pop('icon', None)
    with open(os.path.join(WEB, 'data.js'), 'w', encoding='utf-8') as f:
        f.write('// 由 tools/build_web.py 產生，請勿手動修改\nconst DATA = ')
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')
    # 圖集另外內嵌成 data URI：不需額外載入圖片檔，任何來源（file://、其他網域）都不會讓畫布被視為跨來源
    import base64
    with open(os.path.join(WEB, 'assets/atlas.png'), 'rb') as f: b64 = base64.b64encode(f.read()).decode()
    with open(os.path.join(WEB, 'atlas.js'), 'w', encoding='utf-8') as f:
        f.write('// 由 tools/build_web.py 產生，請勿手動修改\nconst ATLAS_SRC = "data:image/png;base64,' + b64 + '";\n')
    print('atlas', W, H, len(tiles), 'tiles')

if __name__ == '__main__':
    main()

"""產生遊戲所需的全部美術資源 → web/assets/ 與 web/data.js
用法：python3 tools/build_assets.py
"""
import os, sys, json, math
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import binary_dilation, label

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(HERE, '..', 'web')
ASSETS = os.path.join(WEB, 'assets')
sys.path.insert(0, HERE)
import weapons as W
import fp as FP

CJK = '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc'
SERIF_B = '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'

# 職業資料（遊戲內顯示用；數值為暫定，之後再調整）
CLASS_INFO = {
    'swordsman': dict(sex='M', name='劍士', hero='雷恩', desc='攻守平衡的劍術家，穩紮穩打地深入迷宮。', hp=34, atk=6, def_=2, crit=8),
    'knight':    dict(sex='M', name='騎士', hero='格雷', desc='重甲長槍，以厚實的防禦守護同伴。', hp=40, atk=5, def_=4, crit=4),
    'rogue':     dict(sex='M', name='盜賊', hero='凱', desc='身手敏捷，擅長爆擊與閃避。', hp=28, atk=5, def_=1, crit=18),
    'wizard':    dict(sex='M', name='法師', hero='馬林', desc='以魔力轟擊敵人，攻擊力極高但身體虛弱。', hp=24, atk=8, def_=1, crit=6),
    'berserker': dict(sex='M', name='狂戰士', hero='布魯', desc='揮舞巨斧的猛將，血量越高越能硬撐。', hp=42, atk=7, def_=1, crit=6),
    'cleric':    dict(sex='F', name='聖女', hero='露西', desc='受神祝福的祭司，藥水效果加倍。', hp=30, atk=5, def_=2, crit=5),
    'fencer':    dict(sex='F', name='劍姬', hero='艾莉亞', desc='優雅的細劍使，連擊與爆擊兼具。', hp=30, atk=6, def_=2, crit=14),
    'witch':     dict(sex='F', name='魔女', hero='莉莉絲', desc='操縱詭譎魔法的魔女，攻擊吸取生命。', hp=26, atk=7, def_=1, crit=8),
    'ranger':    dict(sex='F', name='遊俠', hero='菲娜', desc='精靈弓手，箭無虛發，閃避率高。', hp=28, atk=6, def_=1, crit=12),
    'monk':      dict(sex='F', name='武鬥家', hero='美玲', desc='以拳腳為武器，攻擊有機率連打。', hp=36, atk=6, def_=2, crit=10),
}


# ---------- 角色立繪：去背 ----------
def cut_hero(src, dst):
    im = Image.open(src).convert('RGB')
    a = np.asarray(im).astype(int)
    bg = np.median(np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]]), axis=0)
    diff = np.abs(a - bg).sum(axis=2)
    cand = diff < 30
    lab, _ = label(cand)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bgmask = np.isin(lab, list(border))
    # 柔化邊緣：與背景相鄰且接近背景色的像素半透明
    alpha = np.where(bgmask, 0, 255).astype(np.uint8)
    edge = binary_dilation(bgmask) & ~bgmask
    alpha[edge & (diff < 60)] = 150
    out = np.dstack([a.astype(np.uint8), alpha])
    img = Image.fromarray(out, 'RGBA')
    bbox = img.getbbox()
    img.crop(bbox).save(dst, optimize=True)


# ---------- LOGO ----------
def pixel_text(text, font_path, size):
    f = ImageFont.truetype(font_path, size)
    l, t, r, b = f.getbbox(text)
    im = Image.new('L', (r - l + 4, b - t + 4), 0)
    d = ImageDraw.Draw(im); d.fontmode = '1'
    d.text((2 - l, 2 - t), text, font=f, fill=255)
    return np.asarray(im) > 0

def style_text(mask, top, bottom, outline='#3a1a08', outer='#0c0610', shadow=2):
    m = np.pad(mask, 4)
    h, w = m.shape
    out = np.zeros((h + shadow, w + shadow, 4), np.uint8)
    o1 = binary_dilation(m) & ~m
    o2 = binary_dilation(m | o1) & ~(m | o1)
    full = m | o1 | o2
    out[shadow:, shadow:][full] = (0, 0, 0, 200)
    ys = np.nonzero(m.any(axis=1))[0]; y0, y1 = ys.min(), ys.max()
    T, B = W.hx(top), W.hx(bottom)
    for y in range(h):
        k = min(1, max(0, (y - y0) / max(1, y1 - y0)))
        k = round(k * 4) / 4                      # 量化色階
        c = tuple(int(T[i] * (1 - k) + B[i] * k) for i in range(3))
        row = m[y]
        out[y, :w][row] = c + (255,)
    # 上緣高光
    hl = m & ~np.roll(m, 1, axis=0)
    out[:h, :w][hl] = (255, 250, 220, 255)
    out[:h, :w][o1] = W.hx(outline) + (255,)
    out[:h, :w][o2] = W.hx(outer) + (255,)
    return Image.fromarray(out, 'RGBA')

def build_logo(dst):
    a = style_text(pixel_text('ENDLESS', SERIF_B, 30), '#fff2a8', '#d8781c')
    b = style_text(pixel_text('MAZE', SERIF_B, 40), '#fff2a8', '#c8501c')
    c = style_text(pixel_text('無 盡 迷 宮', CJK, 14), '#e8f0ff', '#8aa8e8', outline='#101838')
    Wd = max(a.width, b.width) + 30
    H = a.height + b.height + c.height + 8
    logo = Image.new('RGBA', (Wd, H), (0, 0, 0, 0))
    logo.alpha_composite(a, ((Wd - a.width) // 2, 0))
    logo.alpha_composite(b, ((Wd - b.width) // 2, a.height - 6))
    logo.alpha_composite(c, ((Wd - c.width) // 2, a.height + b.height - 4))
    logo = logo.crop(logo.getbbox())
    logo.save(dst, optimize=True)
    return logo.size


# ---------- 武器圖示 sprite sheet ----------
def build_icons(dst_dir):
    for cls_id, cname, wname, fn, names in W.CLASSES:
        sheet = Image.new('RGBA', (32 * 20, 32), (0, 0, 0, 0))
        for t in range(20):
            sheet.alpha_composite(fn(t, W.MATS[t]), (t * 32, 0))
        sheet.save(os.path.join(dst_dir, f'{cls_id}.png'), optimize=True)


def main():
    for d in ('heroes', 'icons', 'fp'):
        os.makedirs(os.path.join(ASSETS, d), exist_ok=True)
    for cid in CLASS_INFO:
        cut_hero(os.path.join(HERE, 'src', 'heroes', f'{cid}.jpg'), os.path.join(ASSETS, 'heroes', f'{cid}.png'))
    print('heroes ok')
    print('logo', build_logo(os.path.join(ASSETS, 'logo.png')))
    build_icons(os.path.join(ASSETS, 'icons')); print('icons ok')
    fpmeta = FP.main(os.path.join(ASSETS, 'fp'))
    # data.js：職業、武器名稱、稀有度、第一人稱擺放
    classes = []
    for cls_id, cname, wname, fn, names in W.CLASSES:
        info = CLASS_INFO[cls_id]
        classes.append(dict(id=cls_id, sex=info['sex'], name=info['name'], hero=info['hero'], desc=info['desc'],
                            hp=info['hp'], atk=info['atk'], def_=info['def_'], crit=info['crit'], weaponType=wname,
                            weapons=names, fp=fpmeta[cls_id]))
    data = dict(classes=classes,
                rarity=[dict(name=W.rarity(t)[0], color=W.rarity(t)[1]) for t in range(20)],
                materials=[m['name'] for m in W.MATS],
                fpSize=FP.FS)
    with open(os.path.join(WEB, 'data.js'), 'w', encoding='utf-8') as f:
        f.write('// 由 tools/build_assets.py 自動產生，請勿手動修改\n')
        f.write('window.GAME_DATA = ' + json.dumps(data, ensure_ascii=False, indent=1) + ';\n')
    print('data.js ok')


if __name__ == '__main__':
    main()

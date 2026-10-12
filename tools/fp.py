"""第一人稱持武器畫面產生器
每個職業輸出一張 sprite sheet（每格 FS×FS）：
  第 0 格：手臂（畫在武器後面）
  第 1~20 格：該職業 20 把武器（第一人稱握持角度）
  第 21 格：拳頭／手指（畫在武器前面）
遊戲中依序疊加三層，換武器時只換中間那一格。
"""
import math, os, json
import numpy as np
from PIL import Image
import weapons as W

FS = 160          # 每格尺寸
K = 3.0           # 武器放大倍率（相對於 32px 圖示）
Z = K / 2.2       # 手部尺寸倍率

# 每個職業：握持角度、錨點（拳頭位置）、握把 u 座標、左右手、服裝顏色
POSES = {
    'swordsman': dict(theta=-118, ax=108, ay=134, ugrip=5.6, side=1, sleeve='#2f5fc8', cuff='#e8e2d8', hand='#7a4a2a'),
    'knight':    dict(theta=-112, ax=108, ay=136, ugrip=9.0, side=1, sleeve='#8890a4', cuff='#c8d0dc', hand='#aab2c2'),
    'rogue':     dict(theta=-128, ax=104, ay=130, ugrip=6.5, side=1, sleeve='#3a3f4a', cuff='#3f6b4a', hand='#4a3a2e'),
    'wizard':    dict(theta=-104, ax=110, ay=136, ugrip=9.0, side=1, sleeve='#3b4fb0', cuff='#f0c040', hand='#f6d0b0'),
    'berserker': dict(theta=-114, ax=108, ay=136, ugrip=7.0, side=1, sleeve='#d79a6c', cuff='#7a5a3a', hand='#d79a6c'),
    'fencer':    dict(theta=-122, ax=106, ay=134, ugrip=5.0, side=1, sleeve='#c8344a', cuff='#f4f0e8', hand='#f4f0e8'),
    'cleric':    dict(theta=-108, ax=110, ay=136, ugrip=7.0, side=1, sleeve='#eeeef6', cuff='#e0b840', hand='#fbe0cf'),
    'witch':     dict(theta=-116, ax=106, ay=134, ugrip=9.0, side=1, sleeve='#6a3a9a', cuff='#2a1a3a', hand='#fbe0cf'),
    'ranger':    dict(theta=-90,  ax=54,  ay=112, ugrip=16.0, side=-1, sleeve='#4a8a3a', cuff='#7a4a26', hand='#8a5a30', bow=True),
    'monk':      dict(theta=0,    ax=80,  ay=104, ugrip=16.0, side=1, sleeve='#d83838', cuff='#f0c040', hand=None, fist=True, k=2.3),
}
# 在 192×144 遊戲畫面中的放置位置（sprite 左上角）
PLACE = {k: (40, -22) for k in POSES}
PLACE['ranger'] = (-4, -12)
PLACE['monk'] = (66, 6)


def _canvas():
    W.FP = None
    ic = W.Icon.__new__(W.Icon)
    # 手部用螢幕座標作畫：建立一個純像素座標的 Icon
    ic.diag = False; ic.n = FS; ic.k = 1.0; ic.flip = 1; ic.ax = 16; ic.ay = 16
    ic.rgb = np.zeros((FS, FS, 3), np.uint8); ic.alpha = np.zeros((FS, FS), bool)
    ys, xs = np.mgrid[0:FS, 0:FS] + 0.5
    ic.U, ic.V = xs, ys
    return ic

def _ellipse(ic, cx, cy, rx, ry):
    return ic._raster(lambda d: d.ellipse(((cx - rx) * W.SS, (cy - ry) * W.SS, (cx + rx) * W.SS, (cy + ry) * W.SS), fill=255))

def _limb(ic, p0, p1, w0, w1):
    (x0, y0), (x1, y1) = p0, p1
    L = math.hypot(x1 - x0, y1 - y0); nx, ny = -(y1 - y0) / L, (x1 - x0) / L
    pts = [(x0 + nx * w0 / 2, y0 + ny * w0 / 2), (x1 + nx * w1 / 2, y1 + ny * w1 / 2), (x1 - nx * w1 / 2, y1 - ny * w1 / 2), (x0 - nx * w0 / 2, y0 - ny * w0 / 2)]
    S = W.SS
    def fn(d):
        d.polygon([(x * S, y * S) for x, y in pts], fill=255)
        for (x, y), w in ((p0, w0), (p1, w1)): d.ellipse(((x - w / 2) * S, (y - w / 2) * S, (x + w / 2) * S, (y + w / 2) * S), fill=255)
    return ic._raster(fn)


def arm_layer(p):
    """手臂（武器後方）：從畫面下緣伸向拳頭"""
    ic = _canvas()
    ax, ay, sd = p['ax'], p['ay'], p['side']
    if p.get('fist'):
        # 武鬥家：手臂接到拳套護腕
        cx, cy = ax + 9 * p.get('k', K), ay + 4 * p.get('k', K)
        ic.paint(_limb(ic, (cx + 4 * Z, cy + 6 * Z), (cx + 40 * Z, cy + 60 * Z), 22 * Z, 30 * Z), p['sleeve'], 'dome', R=6 * Z)
        return ic.render()
    elbow = (ax + sd * 34 * Z, ay + 40 * Z)
    ic.paint(_limb(ic, (ax + sd * 6 * Z, ay + 8 * Z), elbow, 17 * Z, 26 * Z), p['sleeve'], 'dome', R=6 * Z)
    ic.paint(_limb(ic, (ax + sd * 8 * Z, ay + 10 * Z), (ax + sd * 12 * Z, ay + 15 * Z), 21 * Z, 22 * Z), p['cuff'], 'dome', R=4 * Z)
    return ic.render()


def fist_layer(p):
    """拳頭（武器前方）：手背 + 四根彎曲手指 + 拇指"""
    if p.get('fist'): return Image.new('RGBA', (FS, FS), (0, 0, 0, 0))
    ic = _canvas()
    ax, ay, sd = p['ax'], p['ay'], p['side']
    th = math.radians(p['theta']); dx, dy = math.cos(th), math.sin(th)
    px_, py_ = -dy, dx
    hc = p['hand']
    # 手背
    ic.paint(_ellipse(ic, ax + sd * 3 * Z, ay + 3 * Z, 9.5 * Z, 8.5 * Z), hc, 'dome', R=5 * Z)
    # 手指：沿握把方向排列，位在拳頭外側
    for i in range(4):
        o = (i - 1.5) * 3.6 * Z
        cx = ax + dx * o - 6.5 * sd * Z
        cy = ay + dy * o + 1.5 * Z
        ic.paint(_ellipse(ic, cx, cy, 3.4 * Z, 2.6 * Z), hc, 'dome', R=2.5 * Z)
    # 拇指：壓在握把上
    tx, ty = ax + (dx * 5 + sd * 1.5) * Z, ay + dy * 5 * Z
    ic.paint(_limb(ic, (ax + sd * 6 * Z, ay - 1 * Z), (tx, ty), 6 * Z, 4.5 * Z), hc, 'dome', R=2.5 * Z)
    return ic.render()


def weapon_frames(cls_id, fn, p):
    frames = []
    for t in range(20):
        W.FP = dict(size=FS, k=p.get('k', K), theta=p['theta'], ax=p['ax'], ay=p['ay'], flip=-1 if p.get('fist') else 1)
        ugrip = p['ugrip']
        if p.get('bow'):
            # 弓：握把在弓臂彎曲處，錨點往右修正
            W.FP['ax'] = p['ax'] + (4.6 + min(t, 12) * 0.15) * K
        # 讓各武器的 Icon 使用職業指定的握把位置
        orig = W.Icon.__init__
        def patched(self, u_mid=18.0, diag=True, ugrip=None, _o=orig, _g=ugrip):
            _o(self, u_mid=u_mid, diag=diag, ugrip=_g)
        W.Icon.__init__ = patched
        try:
            frames.append(fn(t, W.MATS[t]))
        finally:
            W.Icon.__init__ = orig
    W.FP = None
    return frames


def main(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    meta = {}
    for cls_id, cname, wname, fn, names in W.CLASSES:
        p = POSES[cls_id]
        frames = [arm_layer(p)] + weapon_frames(cls_id, fn, p) + [fist_layer(p)]
        sheet = Image.new('RGBA', (FS * len(frames), FS), (0, 0, 0, 0))
        for i, f in enumerate(frames): sheet.alpha_composite(f, (i * FS, 0))
        sheet.save(os.path.join(out_dir, f'{cls_id}.png'), optimize=True)
        meta[cls_id] = dict(x=PLACE[cls_id][0], y=PLACE[cls_id][1], mirror=bool(p.get('fist')), size=FS)
        print('fp', cls_id)
    return meta


if __name__ == '__main__':
    import sys
    m = main(sys.argv[1] if len(sys.argv) > 1 else 'out_fp')
    print(json.dumps(m))

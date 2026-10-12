"""10 職業 × 20 階武器 像素圖示產生器（32×32，斜 45° 經典 RPG 圖示）"""
import math, os, colorsys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import distance_transform_edt, binary_dilation, binary_erosion

N = 32; SS = 4
OUT = os.path.dirname(os.path.abspath(__file__))
OUTLINE = (16, 9, 20)
R2 = math.sqrt(0.5)


# ================= 顏色 =================
def hx(h):
    if isinstance(h, tuple): return h
    h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

def _sh(h, t, a):
    d = ((t - h + 0.5) % 1) - 0.5; return (h + d * a) % 1

def tone(c, k):
    r, g, b = [v / 255 for v in hx(c)]
    h, s, v = colorsys.rgb_to_hsv(r, g, b)
    if k < 0:
        a = -k; v *= max(0, 1 - 0.22 * a); s = min(1, s * (1 + 0.15 * a) + 0.05 * a); h = _sh(h, 0.72, 0.07 * a)
    elif k > 0:
        v = min(1, v * (1 + 0.15 * k) + 0.04 * k); s *= max(0, 1 - 0.22 * k); h = _sh(h, 0.13, 0.05 * k)
    return tuple(round(x * 255) for x in colorsys.hsv_to_rgb(h, s, v))

def mix(a, b, t):
    a, b = hx(a), hx(b); return tuple(round(a[i] * (1 - t) + b[i] * t) for i in range(3))

def ramp(c): return [tone(c, -2.0), tone(c, -1.0), hx(c), tone(c, 1.0), tone(c, 2.4)]


# ================= 材質（20 階） =================
# metal: 主體/刀刃, accent: 護手/裝飾, grip: 握把, gem: 寶石, glow: 光暈
MATS = [
    dict(key='wood',    name='木',   metal='#a8703c', accent='#8a5a2e', grip='#c8a070', gem=None,      glow=None),
    dict(key='bronze',  name='青銅', metal='#c8853a', accent='#a86a2a', grip='#6a4428', gem=None,      glow=None),
    dict(key='iron',    name='鐵',   metal='#8c929e', accent='#6e727c', grip='#5a3a24', gem=None,      glow=None),
    dict(key='steel',   name='鋼',   metal='#b6bfcf', accent='#8a909c', grip='#4a3a3a', gem=None,      glow=None),
    dict(key='fine',    name='精鋼', metal='#c8d2e2', accent='#a87a3a', grip='#7a3a2a', gem=None,      glow=None),
    dict(key='silver',  name='白銀', metal='#e2e8f2', accent='#b8c0d0', grip='#3a4a7a', gem='#4a8ae8', glow=None),
    dict(key='royal',   name='王國', metal='#ccd6e6', accent='#e8b440', grip='#2a4aa8', gem='#e83a4a', glow=None),
    dict(key='dark',    name='黑鐵', metal='#5a5a6e', accent='#3a3a48', grip='#8a2a2a', gem='#e83a3a', glow=None),
    dict(key='mithril', name='秘銀', metal='#a8dcf4', accent='#e2eef8', grip='#3a6aa8', gem='#5ae8d8', glow='#7ae0ff'),
    dict(key='flame',   name='烈焰', metal='#ff8a3a', accent='#c8382a', grip='#4a1a1a', gem='#ffd040', glow='#ff6a20'),
    dict(key='frost',   name='霜寒', metal='#9ae8ff', accent='#4a8ad8', grip='#2a3a6a', gem='#e8faff', glow='#6ad8ff'),
    dict(key='thunder', name='雷鳴', metal='#f6e060', accent='#7a4ad8', grip='#2a1a4a', gem='#c89aff', glow='#ffe84a'),
    dict(key='jade',    name='翠玉', metal='#4ad08a', accent='#e8c050', grip='#2a5a3a', gem='#ff7aa8', glow='#5ae890'),
    dict(key='gold',    name='黃金', metal='#f4c440', accent='#fff0a0', grip='#8a2a2a', gem='#e83a5a', glow='#ffd84a'),
    dict(key='shadow',  name='暗影', metal='#6a40a0', accent='#2a1a3a', grip='#1a1020', gem='#ff3a8a', glow='#9a4aff'),
    dict(key='holy',    name='聖光', metal='#fff6dc', accent='#f0c850', grip='#f2f0f6', gem='#5ac8ff', glow='#fff0a0'),
    dict(key='dragon',  name='龍',   metal='#d8483a', accent='#f0b840', grip='#3a1a1a', gem='#ffe060', glow='#ff5a3a'),
    dict(key='astral',  name='星辰', metal='#4a5ae8', accent='#c8d8ff', grip='#1a1a4a', gem='#ffffff', glow='#6a8aff'),
    dict(key='chaos',   name='混沌', metal='#d040b0', accent='#2a0a2a', grip='#1a0a1a', gem='#40ffd0', glow='#ff40c8'),
    dict(key='divine',  name='神',   metal='#ffffff', accent='#ffd860', grip='#e8f0ff', gem='#ff6ad0', glow='rainbow'),
]

RARITY = [(0, 3, '普通', '#c8c8c8'), (4, 7, '優良', '#5ad06a'), (8, 11, '稀有', '#4a9aff'),
          (12, 15, '史詩', '#b46aff'), (16, 18, '傳說', '#ffa030'), (19, 19, '神話', '#ff4a6a')]
def rarity(t):
    for a, b, n, c in RARITY:
        if a <= t <= b: return n, c


# ================= 畫布 =================
# 第一人稱模式：設定後 Icon 會改用此視角（尺寸、縮放、角度、握把錨點）
FP = None   # dict(size=, k=, theta=度, ax=, ay=, ugrip=, flip=1)


class Icon:
    def __init__(s, u_mid=18.0, diag=True, ugrip=None):
        s.diag = diag
        if FP:
            s.n, s.k = FP['size'], FP['k']
            th = math.radians(FP.get('theta', -45))
            ax, ay = FP['ax'], FP['ay']
            ua = ugrip if ugrip is not None else u_mid
            s.flip = FP.get('flip', 1)
        else:
            s.n, s.k = N, 1.0
            th = math.radians(-45); ax = ay = 16; ua = u_mid; s.flip = 1
        n = s.n
        s.rgb = np.zeros((n, n, 3), np.uint8); s.alpha = np.zeros((n, n), bool)
        s.dx, s.dy = math.cos(th), math.sin(th)
        s.px_, s.py_ = -math.sin(th), math.cos(th)
        ys, xs = np.mgrid[0:n, 0:n] + 0.5
        if diag:
            s.ox = ax - ua * s.k * s.dx; s.oy = ay - ua * s.k * s.dy
            rx, ry = xs - s.ox, ys - s.oy
            s.U = (rx * s.dx + ry * s.dy) / s.k; s.V = (rx * s.px_ + ry * s.py_) / s.k
        else:
            # 非斜向（拳套）：以 32×32 圖示座標作畫，(16,16) 對到錨點
            s.ax, s.ay = ax, ay
            s.U = (xs - ax) / (s.k * s.flip) + 16; s.V = (ys - ay) / s.k + 16

    def to_xy(s, u, v):
        if not s.diag:
            return (s.ax + (u - 16) * s.k * s.flip, s.ay + (v - 16) * s.k)
        return (s.ox + (u * s.dx + v * s.px_) * s.k, s.oy + (u * s.dy + v * s.py_) * s.k)

    def _raster(s, fn):
        n = s.n
        im = Image.new('L', (n * SS, n * SS), 0); fn(ImageDraw.Draw(im))
        return np.asarray(im.resize((n, n), Image.BOX), dtype=np.float32) / 255 > 0.42

    def poly(s, pts):
        P = [tuple(c * SS for c in s.to_xy(u, v)) for u, v in pts]
        return s._raster(lambda d: d.polygon(P, fill=255))

    def circle(s, u, v, r):
        x, y = s.to_xy(u, v); r = r * s.k
        return s._raster(lambda d: d.ellipse(((x - r) * SS, (y - r) * SS, (x + r) * SS, (y + r) * SS), fill=255))

    def band(s, u0, u1, w0, w1, c=0.0):
        return s.poly([(u0, c - w0 / 2), (u1, c - w1 / 2), (u1, c + w1 / 2), (u0, c + w0 / 2)])

    def thick(s, pts, w):
        P = [tuple(c * SS for c in s.to_xy(u, v)) for u, v in pts]
        w = w * s.k
        def fn(d):
            d.line(P, fill=255, width=max(1, int(w * SS)), joint='curve')
            for x, y in P: d.ellipse((x - w * SS / 2, y - w * SS / 2, x + w * SS / 2, y + w * SS / 2), fill=255)
        return s._raster(fn)

    # ---------- 上色 ----------
    def paint(s, mask, color, style='cyl', c=0.0, hw=1.5, R=2.5, line=True, shine=True):
        if not mask.any(): return
        r = ramp(color); n = s.n
        if style in ('cyl', 'blade'):
            sv = (s.V - c) / max(hw, 0.5)
            if style == 'blade':
                t = np.where(sv < -0.05, 3, 2)
                t = np.where(sv < -0.72, 4 if shine else 3, t)
                t = np.where(sv > 0.75, 1, t)
            else:
                t = np.select([sv < -0.45, sv < 0.35], [3, 2], 1)
        elif style == 'dome':
            R = R * s.k
            d = distance_transform_edt(np.pad(mask, 2))[2:-2, 2:-2]
            h = R * np.sqrt(np.clip(d / R, 0, 1))
            gy, gx = np.gradient(h)
            nn = np.dstack([-gx, -gy, np.ones_like(gx) * 0.9]); nn /= np.linalg.norm(nn, axis=2, keepdims=True)
            L = np.array([-0.6, -0.7, 0.8]); L /= np.linalg.norm(L)
            I = nn @ L
            t = np.select([I > 0.95, I > 0.78, I > 0.45, I > 0.1], [4 if shine else 3, 3, 2, 1], 0)
        else:
            t = np.full((n, n), 2)
        t = t.astype(int)
        if line:
            edge = mask & ~binary_erosion(mask)
            under = binary_dilation(s.alpha & ~mask) & edge
            t[under] = -1
        for kk in range(-1, 5):
            m = mask & (t == kk)
            if not m.any(): continue
            s.rgb[m] = mix(r[0], OUTLINE, 0.5) if kk == -1 else r[kk]
        s.alpha |= mask

    def px(s, pts, color):
        b = max(1, int(round(s.k)))
        for (u, v) in pts:
            x, y = s.to_xy(u, v); x, y = int(x - b / 2 + 0.5), int(y - b / 2 + 0.5)
            for yy in range(y, y + b):
                for xx in range(x, x + b):
                    if 0 <= xx < s.n and 0 <= yy < s.n: s.rgb[yy, xx] = hx(color); s.alpha[yy, xx] = True

    def gem(s, u, v, r, color):
        m = s.circle(u, v, r); s.paint(m, color, 'dome', R=r + 0.5)
        x, y = s.to_xy(u - r * 0.3, v - r * 0.3); x, y = int(x), int(y)
        b = max(1, int(round(s.k * 0.8)))
        for yy in range(y, y + b):
            for xx in range(x, x + b):
                if 0 <= xx < s.n and 0 <= yy < s.n and s.alpha[yy, xx]: s.rgb[yy, xx] = (255, 255, 255)

    def render(s, glow=None, sparkle=0):
        n = s.n
        out = np.zeros((n, n, 4), np.uint8)
        A = s.alpha
        if glow:
            alphas = (150, 95, 50) if s.k <= 1 else (140, 110, 80, 55, 30)
            ring_prev = A.copy()
            for a in alphas:
                ring = binary_dilation(ring_prev) & ~ring_prev
                ring_prev = ring_prev | ring
                if glow == 'rainbow':
                    ys, xs = np.nonzero(ring)
                    for y, x in zip(ys, xs):
                        hh = ((x + y) / (40 * s.k)) % 1
                        c = tuple(int(v * 255) for v in colorsys.hsv_to_rgb(hh, 0.55, 1))
                        out[y, x] = c + (a,)
                else:
                    out[ring] = hx(glow) + (a,)
        ol = binary_dilation(A) & ~A
        out[ol] = OUTLINE + (255,)
        out[A, :3] = s.rgb[A]; out[A, 3] = 255
        rng = np.random.default_rng(sparkle * 7 + 3)
        for _ in range(sparkle if s.k <= 1 else 0):
            for _try in range(20):
                x, y = rng.integers(2, n - 2, 2)
                if not (A | ol)[y - 1:y + 2, x - 1:x + 2].any():
                    out[y, x] = (255, 255, 240, 255)
                    for ddx, ddy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        out[y + ddy, x + ddx] = (255, 250, 200, 170)
                    break
        return Image.fromarray(out, 'RGBA')


def finish(ic, t, m):
    g = m['glow']
    sp = 0 if t < 15 else (2 if t < 18 else 4)
    return ic.render(glow=g, sparkle=sp)


# ================= 武器畫法 =================
def grip_wrap(ic, u0, u1, w, m, t):
    ic.paint(ic.band(u0, u1, w, w), m['grip'], 'cyl', hw=w / 2)
    if t >= 4:     # 纏繞紋
        for u in np.arange(u0 + 1, u1, 2):
            ic.px([(u, -0.3)], tone(m['grip'], -1.4))


def draw_sword(t, m):
    ic = Icon(u_mid=18)
    L = 31 + t * 0.25                         # 刀刃越來越長
    bw = 2.6 + min(t, 19) * 0.045            # 刀身寬
    g0 = 9.5
    k = m['key']
    # 握把 & 柄頭
    grip_wrap(ic, 2, g0, 2.2, m, t)
    ic.paint(ic.circle(1.6, 0, 1.6 + t * 0.04), m['accent'], 'dome', R=2)
    if t >= 6 and m['gem']: ic.gem(1.6, 0, 1.1, m['gem'])
    # 刀身形狀
    if t == 0:        # 木劍：圓頭
        blade = ic.band(g0, L - 1.5, bw + 0.4, bw + 0.4) | ic.circle(L - 1.5, 0, (bw + 0.4) / 2)
    elif t == 1:      # 青銅：葉形劍
        blade = ic.poly([(g0, -bw / 2), (g0 + 10, -bw / 2 - 0.9), (L - 5, -bw / 2 - 0.4), (L, 0), (L - 5, bw / 2 + 0.4), (g0 + 10, bw / 2 + 0.9), (g0, bw / 2)])
    elif k == 'flame':
        pts = [(g0, -bw / 2)] + [(g0 + j * 3.2, -bw / 2 - (1.7 if j % 2 else 0)) for j in range(1, 7)] + [(L, 0)] + \
              [(g0 + j * 3.2, bw / 2 + (1.7 if j % 2 else 0)) for j in range(6, 0, -1)] + [(g0, bw / 2)]
        blade = ic.poly(pts)
    elif k in ('frost', 'astral'):   # 冰晶 / 星芒：尖端外擴
        blade = ic.poly([(g0, -bw / 2), (L - 9, -bw / 2), (L - 5, -bw / 2 - 2.2), (L, 0), (L - 5, bw / 2 + 2.2), (L - 9, bw / 2), (g0, bw / 2)])
    elif k in ('dragon', 'chaos'):   # 鋸齒刃
        pts = [(g0, -bw / 2)] + [(g0 + j * 2.6, -bw / 2 - (1.6 if j % 2 else 0)) for j in range(1, 8)] + [(L, 0)] + [(L - 4, bw / 2), (g0, bw / 2)]
        blade = ic.poly(pts)
    elif k == 'thunder':  # 閃電折刃
        blade = ic.poly([(g0, -bw / 2), (g0 + 8, -bw / 2), (g0 + 10, -bw / 2 - 1.6), (L - 6, -bw / 2 - 1.6), (L, 0), (L - 7, bw / 2), (g0 + 10, bw / 2), (g0 + 8, bw / 2 + 1.6), (g0, bw / 2 + 1.6)])
    else:
        blade = ic.poly([(g0, -bw / 2), (L - 3.5, -bw / 2), (L, 0), (L - 3.5, bw / 2), (g0, bw / 2)])
    ic.paint(blade, m['metal'], 'blade', hw=bw / 2 + 0.4)
    if 3 <= t:   # 血槽
        ic.paint(ic.band(g0 + 2, L - 9, 0.9, 0.9, 0.2), tone(m['metal'], -0.9), 'flat', line=False)
    # 護手：隨階級變寬、變華麗
    gw = 7 + min(t, 16) * 0.35
    if t == 0:
        guard = ic.band(g0 - 0.8, g0 + 0.8, 5, 5)
    elif t >= 13:      # 翼形護手
        guard = ic.poly([(g0 - 1, -1.4), (g0 + 4, -gw / 2 - 2), (g0 + 1.3, -gw / 2 + 0.6), (g0 + 1.6, 0),
                         (g0 + 1.3, gw / 2 - 0.6), (g0 + 4, gw / 2 + 2), (g0 - 1, 1.4)])
    elif t >= 6:     # 彎曲護手
        guard = ic.poly([(g0 - 0.8, -gw / 2), (g0 + 2.4, -gw / 2 - 1.2), (g0 + 1.6, 0), (g0 + 2.4, gw / 2 + 1.2), (g0 - 0.8, gw / 2), (g0 - 1.4, 0)])
    else:
        guard = ic.band(g0 - 0.9, g0 + 1.3, gw, gw)
    ic.paint(guard, m['accent'], 'cyl', hw=gw / 2)
    if t >= 6 and m['gem']: ic.gem(g0 + 0.3, 0, 1.4 + (0.3 if t >= 13 else 0), m['gem'])
    if t >= 16:      # 刀身符文
        for u in (g0 + 5, g0 + 9, g0 + 13):
            ic.px([(u, -0.2)], m['gem'] or '#ffffff')
    return finish(ic, t, m)


def draw_spear(t, m):
    ic = Icon(u_mid=18.5)
    head0 = 23 - min(t, 10) * 0.2
    sw = 1.7
    ic.paint(ic.band(0.5, head0 + 1, sw, sw), m['grip'] if t >= 5 else mix(m['metal'], '#8a5a30', 0.6) if t else m['metal'], 'cyl', hw=sw / 2)
    if t >= 4:
        for u in np.arange(2, 9, 2): ic.px([(u, -0.3)], tone(m['grip'], -1.3))
    ic.paint(ic.circle(0.8, 0, 1.4), m['accent'], 'dome', R=1.5)
    # 槍頭
    hl = 11 + t * 0.12; hw = 3.2 + min(t, 14) * 0.1
    if m['key'] in ('flame', 'dragon', 'chaos'):
        head = ic.poly([(head0, -1), (head0 + 3, -hw - 0.8), (head0 + 5, -hw + 0.4), (head0 + hl, 0), (head0 + 5, hw - 0.4), (head0 + 3, hw + 0.8), (head0, 1)])
    else:
        head = ic.poly([(head0, -1), (head0 + 3.5, -hw), (head0 + hl, 0), (head0 + 3.5, hw), (head0, 1)])
    ic.paint(head, m['metal'], 'blade', hw=hw)
    # 頸環
    ic.paint(ic.band(head0 - 1.6, head0 + 0.6, 2.8, 2.8), m['accent'], 'cyl', hw=1.4)
    if t >= 7:   # 戟刃（側邊斧刃）
        ax = ic.poly([(head0 + 0.3, 1.0), (head0 - 1.8, 5.8 + t * 0.06), (head0 + 1.5, 6.6 + t * 0.06), (head0 + 4.5, 5.6 + t * 0.06), (head0 + 3.8, 1.0)])
        ic.paint(ax, m['metal'], 'dome', R=1.6)
    if t >= 13:  # 另一側鉤刺
        ic.paint(ic.poly([(head0 + 0.5, -1.2), (head0 + 4.5, -5.2), (head0 + 2.6, -1.2)]), m['accent'], 'dome', R=1.2)
    if t >= 3:   # 流蘇
        tas = '#d03a3a' if t < 9 else (m['glow'] if m['glow'] != 'rainbow' else '#ff8ad0')
        ic.paint(ic.poly([(head0 - 1.4, 1.2), (head0 - 5.5, 2.6), (head0 - 6, 1.4), (head0 - 2.2, 0.5)]), tas, 'cyl', c=1.4, hw=1)
    if t >= 6 and m['gem']: ic.gem(head0 - 0.5, 0, 1.2, m['gem'])
    return finish(ic, t, m)


def draw_dagger(t, m):
    ic = Icon(u_mid=15)
    g0 = 9
    L = 23 + t * 0.15
    bw = 2.5 + min(t, 12) * 0.05
    grip_wrap(ic, 4, g0, 2.0, m, t)
    ic.paint(ic.circle(3.6, 0, 1.4), m['accent'], 'dome', R=1.5)
    if t >= 8:   # 彎刃
        blade = ic.poly([(g0, -bw / 2), (g0 + 6, -bw / 2 - 0.4), (L - 3, -bw / 2 + 0.6), (L, 1.6), (L - 4, bw / 2 + 0.6), (g0 + 6, bw / 2 + 0.2), (g0, bw / 2)])
    elif t >= 4:
        blade = ic.poly([(g0, -bw / 2), (L - 4, -bw / 2), (L, 0.8), (L - 4, bw / 2), (g0, bw / 2)])
    else:
        blade = ic.poly([(g0, -bw / 2), (L - 3, -bw / 2), (L, 0), (L - 3, bw / 2), (g0, bw / 2)])
    if m['key'] == 'flame' or t >= 16:   # 波浪刃
        pts = [(g0, -bw / 2)] + [(g0 + k * 2.4, -bw / 2 - (0.9 if k % 2 else 0)) for k in range(1, 6)] + [(L, 0.4)] + \
              [(g0 + k * 2.4, bw / 2 + (0.9 if k % 2 else 0)) for k in range(5, 0, -1)] + [(g0, bw / 2)]
        blade = ic.poly(pts)
    ic.paint(blade, m['metal'], 'blade', hw=bw / 2 + 0.4)
    gw = 4 + min(t, 14) * 0.3
    if t >= 10:
        guard = ic.poly([(g0 - 0.5, -gw / 2), (g0 + 2.2, -gw / 2 - 1), (g0 + 1, 0), (g0 - 1.5, gw / 2 + 1), (g0 - 0.5, 0)])
    else:
        guard = ic.band(g0 - 0.5, g0 + 1, gw, gw)
    ic.paint(guard, m['accent'], 'cyl', hw=gw / 2)
    if t >= 6 and m['gem']: ic.gem(g0 + 0.2, 0, 1.1, m['gem'])
    if t >= 12:  # 毒液/魔力滴
        ic.px([(L - 6, 0.6)], m['gem'] or '#7aff7a')
    return finish(ic, t, m)


def draw_staff(t, m):
    ic = Icon(u_mid=18)
    top = 27
    shaft = '#7a4a26' if t < 5 else mix(m['grip'], m['accent'], 0.25)
    if t == 0:   # 樹枝：歪曲
        ic.paint(ic.thick([(0, 0), (8, 0.6), (16, -0.4), (24, 0.5), (29, -0.6)], 2.0), m['metal'], 'cyl', hw=1)
        ic.paint(ic.thick([(20, 0.2), (23, -3.5)], 1.2), m['metal'], 'cyl', hw=0.6)
        ic.paint(ic.circle(25.5, -3.8, 1.3), '#6ac850', 'dome', R=1.4)
        return finish(ic, t, m)
    ic.paint(ic.band(0, top, 1.9, 1.9), shaft, 'cyl', hw=1)
    for u in (3, 9, 15):
        if t >= 3: ic.paint(ic.band(u, u + 1.2, 2.6, 2.6), m['accent'], 'cyl', hw=1.3)
    ic.paint(ic.circle(0.5, 0, 1.3), m['accent'], 'dome', R=1.4)
    orb_r = 2.6 + min(t, 16) * 0.08
    oc = m['gem'] or m['metal']
    if t <= 3:   # 金屬杖頭
        ic.paint(ic.poly([(top - 1, -1.2), (top + 2, -2.8), (top + 6, -1.2), (top + 6.5, 0), (top + 6, 1.2), (top + 2, 2.8), (top - 1, 1.2)]), m['metal'], 'dome', R=2)
    else:
        # 爪架
        claw = m['metal'] if t < 13 else m['accent']
        for side in (-1, 1):
            ic.paint(ic.thick([(top - 0.5, 0), (top + 1.8, side * (orb_r + 0.7)), (top + orb_r + 2.2, side * (orb_r + 0.4)), (top + orb_r * 2 + 1.2, side * 1.0)], 1.2), claw, 'cyl', c=side * orb_r, hw=1)
        ic.paint(ic.circle(top + orb_r + 1.6, 0, orb_r), oc, 'dome', R=orb_r)
        if t >= 13:   # 環
            ring = ic.circle(top + orb_r + 1.6, 0, orb_r + 2.6) & ~ic.circle(top + orb_r + 1.6, 0, orb_r + 1.5)
            ring &= ~ic.alpha
            ic.paint(ring, m['accent'], 'dome', R=1.2)
        if t >= 16:   # 頂端星
            ic.px([(top + orb_r * 2 + 4, 0)], '#ffffff')
    if t >= 9:   # 飄帶
        rib = m['glow'] if m['glow'] not in (None, 'rainbow') else '#ff8ad0'
        ic.paint(ic.poly([(top - 2, 1), (top - 7, 3.2), (top - 9, 2.2), (top - 5.5, 1.4), (top - 7.5, 4.6), (top - 3, 1.8)]), rib, 'cyl', c=2, hw=1.6)
    return finish(ic, t, m)


def draw_axe(t, m):
    ic = Icon(u_mid=17)
    top = 31
    ic.paint(ic.band(0.5, top, 2.2, 2.2), m['grip'] if t >= 4 else '#8a5a2e', 'cyl', hw=1.1)
    if t >= 4:
        for u in np.arange(2, 10, 2): ic.px([(u, -0.4)], tone(m['grip'], -1.3))
    ic.paint(ic.circle(0.8, 0, 1.5), m['accent'], 'dome', R=1.5)
    hs = 0.85 + min(t, 16) * 0.025    # 斧頭尺寸係數
    a0, a1 = top - 10 * hs, top - 1.5
    def head(side):
        reach = (5.8 + t * 0.07) * side
        if t >= 14 or m['key'] in ('dragon', 'chaos'):
            pts = [(a0 + 2, side * 1.4), (a0 - 1.5, reach * 0.8), (a0 + 1, reach * 1.05), (a0 + 4, reach * 0.75), ((a0 + a1) / 2, reach * 1.05),
                   (a1 - 3, reach * 0.75), (a1, reach * 1.05), (a1 + 1.5, reach * 0.8), (a1 - 1.5, side * 1.4)]
        else:
            pts = [(a0 + 2, side * 1.4), (a0 - 1, reach * 0.85), (a0 + 1, reach), ((a0 + a1) / 2, reach * 1.08),
                   (a1 - 1, reach), (a1 + 1, reach * 0.85), (a1 - 2, side * 1.4)]
        return ic.poly(pts)
    ic.paint(head(1), m['metal'], 'dome', R=2.2)
    if t >= 7: ic.paint(head(-1), m['metal'], 'dome', R=2.2)      # 雙刃
    else: ic.paint(ic.poly([(a0 + 3, -1), (a0 + 5, -3.8), (a1 - 3, -1)]), m['accent'], 'dome', R=1.2)   # 背刺
    ic.paint(ic.band(a0 + 1, a1 - 1, 3.4, 3.4), m['accent'], 'cyl', hw=1.7)
    ic.paint(ic.poly([(top - 1, -1), (top + 3 + t * 0.06, 0), (top - 1, 1)]), m['metal'], 'blade', hw=1)   # 頂刺
    if t >= 6 and m['gem']: ic.gem((a0 + a1) / 2, 0, 1.4, m['gem'])
    return finish(ic, t, m)


def draw_rapier(t, m):
    ic = Icon(u_mid=18.5)
    g0 = 8
    L = 34 + t * 0.1
    grip_wrap(ic, 2.5, g0, 1.8, m, t)
    ic.paint(ic.circle(2, 0, 1.6), m['accent'], 'dome', R=1.7)
    ic.paint(ic.poly([(g0, -0.9), (L - 2, -0.5), (L, 0), (L - 2, 0.5), (g0, 0.9)]), m['metal'], 'blade', hw=1)
    # 杯形 / 籃形護手
    cup = 2.2 + min(t, 14) * 0.12
    ic.paint(ic.circle(g0 + 0.6, 0, cup), m['accent'], 'dome', R=cup)
    # 弧形護指
    ic.paint(ic.thick([(g0 + 0.5, cup * 0.8), (g0 - 2.5, cup + 0.8), (2.5, 1.6)], 1.0), m['accent'], 'cyl', c=1.5, hw=0.8)
    if t >= 6:
        ic.paint(ic.thick([(g0 + 0.5, -cup * 0.8), (g0 - 2, -cup - 1.4), (3.5, -1.4)], 1.0), m['accent'], 'cyl', c=-1.5, hw=0.8)
    if t >= 12:   # 薔薇裝飾
        rose = m['gem'] if m['key'] != 'jade' else '#ff5a8a'
        ic.paint(ic.circle(g0 + 0.6, 0, 1.6), rose, 'dome', R=1.6)
        ic.px([(g0 + 0.2, -0.4)], tone(rose, 2))
    elif t >= 6 and m['gem']:
        ic.gem(g0 + 0.6, 0, 1.2, m['gem'])
    if t >= 9:   # 刃上紋路
        for u in (g0 + 5, g0 + 10):
            ic.px([(u, 0)], m['gem'] or '#ffffff')
    return finish(ic, t, m)


def draw_scepter(t, m):
    ic = Icon(u_mid=16.5)
    top = 22
    ic.paint(ic.band(1, top, 1.9, 1.9), m['grip'] if t >= 5 else m['metal'], 'cyl', hw=1)
    ic.paint(ic.circle(1, 0, 1.5), m['accent'], 'dome', R=1.5)
    for u in (6, 12):
        if t >= 2: ic.paint(ic.band(u, u + 1.1, 2.7, 2.7), m['accent'], 'cyl', hw=1.3)
    if t <= 3:   # 錘頭
        ic.paint(ic.circle(top + 3.5, 0, 3.4), m['metal'], 'dome', R=3)
        if t >= 2:
            for a in range(4):
                ang = a * math.pi / 2 + math.pi / 4
                ic.paint(ic.circle(top + 3.5 + math.cos(ang) * 3.5, math.sin(ang) * 3.5, 1.1), m['accent'], 'dome', R=1)
        return finish(ic, t, m)
    # 十字聖印 + 光環 + 翅膀
    ccol = m['metal']
    if t >= 13:   # 翅膀
        for side in (-1, 1):
            ic.paint(ic.poly([(top + 1, side * 1.5), (top + 0.5, side * 6.5), (top + 4, side * 8.5), (top + 4, side * 6), (top + 6.5, side * 7),
                              (top + 5.5, side * 4.5), (top + 7.5, side * 4), (top + 5, side * 1.5)]), '#f6f2ff' if m['key'] != 'shadow' else '#3a2a4a', 'dome', R=1.6)
    if t >= 8:    # 光環
        ring = ic.circle(top + 5, 0, 5.2) & ~ic.circle(top + 5, 0, 4)
        ic.paint(ring, m['accent'], 'dome', R=1)
    cross = ic.band(top, top + 10, 2.2, 2.2) | ic.band(top + 4.5, top + 6.5, 7.5, 7.5)
    ic.paint(cross, ccol, 'cyl', hw=1.1)
    if m['gem']: ic.gem(top + 5.5, 0, 1.5, m['gem'])
    return finish(ic, t, m)


def draw_wand(t, m):
    ic = Icon(u_mid=15)
    top = 21
    ic.paint(ic.band(4, top, 1.6 if t < 8 else 1.8, 1.4), m['grip'] if t else m['metal'], 'cyl', hw=0.9)
    ic.paint(ic.circle(4, 0, 1.3), m['accent'], 'dome', R=1.3)
    if t >= 2:
        ic.paint(ic.band(top - 3, top - 1.8, 2.6, 2.6), m['accent'], 'cyl', hw=1.3)
    if t == 0:
        ic.paint(ic.circle(top + 1, 0, 1.4), '#7ad850', 'dome', R=1.5)
        return finish(ic, t, m)
    cx = top + 4.5
    star_c = m['gem'] or m['metal']
    kind = ['star', 'heart', 'moon', 'crystal'][t % 4] if t >= 4 else 'star'
    sz = 3.6 + min(t, 16) * 0.1
    if kind == 'star':
        pts = []
        for k in range(10):
            ang = -math.pi / 2 + k * math.pi / 5; r = sz if k % 2 == 0 else sz * 0.45
            pts.append((cx + math.cos(ang) * r, math.sin(ang) * r))
        # 星形以 u 為上方
        sh = ic.poly([(u, v) for u, v in [(cx + (p[1]), (p[0] - cx)) for p in pts]])
        ic.paint(sh, '#ffd84a' if t < 4 else star_c, 'dome', R=2)
    elif kind == 'heart':
        h = ic.circle(cx + 0.8, -1.5, sz * 0.55) | ic.circle(cx + 0.8, 1.5, sz * 0.55) | ic.poly([(cx + 1, -sz * 0.95), (cx - sz * 0.9, 0), (cx + 1, sz * 0.95)])
        ic.paint(h, '#ff5a9a' if m['key'] not in ('frost', 'astral') else star_c, 'dome', R=2)
    elif kind == 'moon':
        mo = ic.circle(cx, 0, sz * 0.85) & ~ic.circle(cx + 1.6, -1.6, sz * 0.7)
        ic.paint(mo, '#ffe88a' if t < 13 else star_c, 'dome', R=1.6)
    else:
        cr = ic.poly([(cx - sz, 0), (cx - 0.5, -sz * 0.6), (cx + sz * 1.2, 0), (cx - 0.5, sz * 0.6)])
        ic.paint(cr, star_c, 'blade', hw=sz * 0.6)
    if t >= 6 and m['gem'] and kind != 'crystal': ic.gem(cx, 0, 1.0, '#ffffff' if kind != 'star' else m['gem'])
    if t >= 5:   # 蝴蝶結
        rib = m['glow'] if m['glow'] not in (None, 'rainbow') else '#ff6ab0'
        if t < 8: rib = '#e04a8a'
        ic.paint(ic.poly([(top - 2.4, 0), (top - 0.5, -3), (top - 3.8, -2.2)]) | ic.poly([(top - 2.4, 0), (top - 0.5, 3), (top - 3.8, 2.2)]), rib, 'dome', R=1.2)
        ic.paint(ic.poly([(top - 2.6, 0.5), (top - 7, 2.4), (top - 6.5, 3.4), (top - 2.2, 1.2)]), rib, 'cyl', c=2, hw=1)
    return finish(ic, t, m)


def draw_bow(t, m):
    ic = Icon(u_mid=16)
    L = 32
    bend = 4.6 + min(t, 12) * 0.15
    pts = []
    for k in range(17):
        u = k / 16 * L
        v = -bend * math.sin(math.pi * k / 16)
        pts.append((u, v))
    limb_col = m['metal'] if t != 0 else '#a8703c'
    if m['key'] in ('wood',): limb_col = '#a8703c'
    ic.paint(ic.thick(pts, 2.0), limb_col, 'cyl', c=-bend * 0.6, hw=3)
    # 弦
    sc = '#e8e0d0' if not m['glow'] or m['glow'] == 'rainbow' else tone(m['glow'], 1.5)
    s0, s1 = pts[0], pts[-1]
    ic.paint(ic.thick([(s0[0] + 0.6, s0[1] + 0.9), (s1[0] - 0.6, s1[1] + 0.9)], 1.1), sc, 'flat', line=False)
    # 握把
    ic.paint(ic.thick([(L / 2 - 2.6, -bend), (L / 2 + 2.6, -bend)], 2.8), m['grip'], 'cyl', c=-bend, hw=1.4)
    if t >= 3:   # 弓臂裝飾
        for uu in (L / 2 - 5.5, L / 2 + 5.5):
            k = uu / L
            ic.paint(ic.circle(uu, -bend * math.sin(math.pi * k), 1.3), m['accent'], 'dome', R=1.3)
    if t >= 13:  # 羽翼弓臂
        for end in (0, 1):
            k = 0.18 if end == 0 else 0.82
            uu = k * L; vv = -bend * math.sin(math.pi * k)
            d = -1 if end == 0 else 1
            ic.paint(ic.poly([(uu, vv - 0.5), (uu + d * 1.5, vv - 5), (uu + d * 4, vv - 4.5), (uu + d * 3, vv - 1.5)]),
                     '#f6f2ff' if m['key'] not in ('shadow', 'chaos', 'dragon') else tone(m['metal'], -1), 'dome', R=1.4)
    if t >= 6 and m['gem']: ic.gem(L / 2, -bend - 0.2, 1.3, m['gem'])
    return finish(ic, t, m)


def draw_gauntlet(t, m):
    ic = Icon(diag=False)
    mc, ac = m['metal'], m['accent']
    if t == 0:   # 布纏手
        hand = ic.poly([(9, 10), (23, 9), (25, 14), (24, 23), (9, 24)])
        ic.paint(hand, '#e8dcc8', 'dome', R=3)
        for y in (12, 15, 18, 21):
            ic.paint(ic.poly([(9, y), (24, y - 1), (24, y), (9, y + 1)]), '#c8b898', 'flat', line=False)
        return finish(ic, t, m)
    # 護腕
    cuff = ic.poly([(5, 13), (11, 12), (11, 25), (5, 25)])
    ic.paint(cuff, m['grip'] if t < 6 else ac, 'cyl', c=18.5, hw=6)
    # 手背
    hand = ic.poly([(10, 10), (22, 9), (25, 12), (25, 23), (21, 25), (10, 25)])
    ic.paint(hand, mc, 'dome', R=3.2)
    # 指節板
    for i, y in enumerate((10, 14, 18, 22)):
        k = ic.poly([(21, y - 0.5), (26.5, y - 0.2), (27, y + 3.2), (21, y + 3.4)])
        ic.paint(k, mc, 'dome', R=1.4)
    if t >= 2:   # 指虎尖刺
        n = 1 if t < 8 else 2
        for y in (11.5, 15.5, 19.5, 23.5):
            ic.paint(ic.poly([(26.5, y - 1.2), (28.5 + n, y + 0.2), (26.5, y + 1.4)]), ac if t >= 6 else mc, 'blade', c=y, hw=1.3)
    if t >= 10:  # 爪
        for y in (12, 17, 22):
            ic.paint(ic.poly([(24, y - 0.6), (30.5, y - 2.6), (29.5, y - 0.8), (24.5, y + 0.9)]), m['metal'], 'blade', c=y - 1, hw=1.2)
    if t >= 4:   # 手背飾帶
        ic.paint(ic.poly([(11, 15), (20, 14.5), (20, 16.5), (11, 17)]), ac, 'cyl', c=15.8, hw=1.2)
    if t >= 6 and m['gem']: ic.gem(16, 19.5, 2.0 + (0.4 if t >= 13 else 0), m['gem'])
    if t >= 13:  # 護腕翼飾
        ic.paint(ic.poly([(5, 13), (2, 8), (8, 11.5)]) | ic.poly([(5, 25), (2, 29), (8, 25)]), ac, 'dome', R=1.2)
    return finish(ic, t, m)


# ================= 名稱 =================
CLASSES = [
    ('swordsman', '劍士', '長劍', draw_sword, [
        '練習木劍', '青銅劍', '鐵劍', '鋼鐵長劍', '傭兵之劍', '白銀劍', '王國騎士劍', '黑鐵劍', '秘銀劍', '烈焰劍「炎牙」',
        '霜寒劍「冰華」', '雷鳴劍「迅雷」', '翠玉劍「森羅」', '黃金劍「王權」', '暗影劍「夜魘」', '聖光劍「曙光」', '龍牙劍「赤龍」',
        '星辰劍「天穹」', '混沌劍「深淵」', '神劍「終焉之誓」']),
    ('knight', '騎士', '長槍', draw_spear, [
        '練習木槍', '青銅矛', '鐵槍', '鋼鐵長槍', '衛兵長槍', '白銀槍', '王國騎士槍', '黑鐵戰戟', '秘銀戰戟', '烈焰戟「焚天」',
        '霜寒戟「凍原」', '雷鳴戟「轟雷」', '翠玉戟「青嵐」', '黃金戟「榮耀」', '暗影戟「冥府」', '聖光戟「審判」', '龍騎槍「屠龍」',
        '星辰槍「流星」', '混沌槍「虛無」', '神槍「天穿」']),
    ('rogue', '盜賊', '匕首', draw_dagger, [
        '生鏽小刀', '青銅匕首', '鐵匕首', '鋼製短刃', '盜賊短刀', '白銀匕首', '刺客之刃', '黑鐵彎刀', '秘銀短劍', '烈焰匕首「火舌」',
        '霜寒匕首「冰牙」', '雷鳴匕首「電光」', '翠玉匕首「毒藤」', '黃金匕首「貪婪」', '暗影匕首「無聲」', '聖光匕首「破邪」',
        '龍爪匕首「逆鱗」', '星辰匕首「流螢」', '混沌匕首「噬魂」', '神器「虛空之牙」']),
    ('wizard', '法師', '法杖', draw_staff, [
        '樹枝法杖', '青銅法杖', '鐵頭法杖', '學徒法杖', '水晶法杖', '白銀法杖', '宮廷魔導杖', '黑曜法杖', '秘銀法杖', '烈焰法杖「熔核」',
        '霜寒法杖「永凍」', '雷鳴法杖「天雷」', '翠玉法杖「生命之樹」', '黃金法杖「賢者」', '暗影法杖「禁咒」', '聖光法杖「光輝」',
        '龍眼法杖「龍瞳」', '星辰法杖「星界」', '混沌法杖「萬象歸零」', '神杖「創世」']),
    ('berserker', '狂戰士', '戰斧', draw_axe, [
        '伐木斧', '青銅斧', '鐵斧', '鋼鐵戰斧', '蠻族巨斧', '白銀戰斧', '王國重斧', '黑鐵雙刃斧', '秘銀戰斧', '烈焰巨斧「爆炎」',
        '霜寒巨斧「冰河」', '雷鳴巨斧「雷神」', '翠玉巨斧「荒野」', '黃金巨斧「霸王」', '暗影巨斧「斷頭台」', '聖光巨斧「天罰」',
        '龍顎巨斧「龍噬」', '星辰巨斧「隕星」', '混沌巨斧「狂亂」', '神斧「開天」']),
    ('fencer', '劍姬', '細劍', draw_rapier, [
        '練習細劍', '青銅細劍', '鐵製細劍', '鋼製刺劍', '決鬥細劍', '白銀細劍', '宮廷細劍', '黑鐵刺劍', '秘銀細劍', '烈焰細劍「緋紅」',
        '霜寒細劍「雪舞」', '雷鳴細劍「紫電」', '翠玉細劍「薔薇」', '黃金細劍「女王」', '暗影細劍「月下」', '聖光細劍「純白」',
        '龍鱗細劍「龍姬」', '星辰細劍「銀河」', '混沌細劍「血薔薇」', '神劍「永恆之舞」']),
    ('cleric', '聖女', '聖杖', draw_scepter, [
        '修女木杖', '青銅錫杖', '鐵製錘矛', '鋼製錘矛', '祈禱權杖', '白銀聖杖', '主教權杖', '黑鐵懺悔杖', '秘銀聖杖', '烈焰聖杖「淨火」',
        '霜寒聖杖「慈雪」', '雷鳴聖杖「神鳴」', '翠玉聖杖「豐饒」', '黃金聖杖「教皇」', '暗影聖杖「墮天」', '聖光聖杖「天使之環」',
        '龍骨聖杖「龍之祈禱」', '星辰聖杖「星之巫女」', '混沌聖杖「背德」', '神杖「女神之淚」']),
    ('witch', '魔女', '魔杖', draw_wand, [
        '樹枝魔杖', '青銅魔杖', '鐵製魔杖', '見習魔杖', '糖果魔杖', '白銀魔杖', '月光魔杖', '黑貓魔杖', '秘銀魔杖', '烈焰魔杖「火精靈」',
        '霜寒魔杖「雪精靈」', '雷鳴魔杖「雷精靈」', '翠玉魔杖「妖精之森」', '黃金魔杖「蜜糖」', '暗影魔杖「夜之魔女」', '聖光魔杖「心願之星」',
        '龍心魔杖「龍之心」', '星辰魔杖「流星雨」', '混沌魔杖「惡夢」', '神杖「魔女之王冠」']),
    ('ranger', '遊俠', '弓', draw_bow, [
        '樹枝短弓', '青銅反曲弓', '鐵臂弓', '鋼製長弓', '獵人長弓', '白銀弓', '王國長弓', '黑鐵重弓', '秘銀弓', '烈焰弓「火鳥」',
        '霜寒弓「冰晶」', '雷鳴弓「雷鷹」', '翠玉弓「精靈之森」', '黃金弓「日輪」', '暗影弓「夜梟」', '聖光弓「天使之翼」',
        '龍筋弓「龍翼」', '星辰弓「月與星」', '混沌弓「災厄」', '神弓「世界樹」']),
    ('monk', '武鬥家', '拳套', draw_gauntlet, [
        '布纏手', '青銅指虎', '鐵拳套', '鋼鐵拳套', '鬥士拳套', '白銀拳套', '武僧護手', '黑鐵爪', '秘銀拳套', '烈焰拳套「炎拳」',
        '霜寒拳套「冰拳」', '雷鳴拳套「雷拳」', '翠玉拳套「龍虎」', '黃金拳套「百裂」', '暗影拳套「修羅」', '聖光拳套「金剛」',
        '龍爪拳套「昇龍」', '星辰拳套「天罡」', '混沌拳套「阿修羅」', '神器「天地無雙」']),
]


# ================= 輸出 =================
FONT = '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc'

def sheet_for(cls_id, cname, wname, fn, names):
    S = 4; cell_w, cell_h = N * S + 60, N * S + 64
    cols = 5
    W = cols * cell_w + 40; H = 4 * cell_h + 90
    sh = Image.new('RGBA', (W, H), '#150f1c'); d = ImageDraw.Draw(sh)
    ft = ImageFont.truetype(FONT, 28); fn_ = ImageFont.truetype(FONT, 17); fs = ImageFont.truetype(FONT, 14)
    d.text((22, 20), f'{cname}・{wname}（20 階）', font=ft, fill='#ffd76a')
    icons = []
    for t in range(20):
        im = fn(t, MATS[t]); icons.append(im)
        im.save(os.path.join(OUT, 'png', cls_id, f'{t + 1:02d}.png'))
        im.resize((N * 8, N * 8), Image.NEAREST).save(os.path.join(OUT, 'png', cls_id, f'{t + 1:02d}_x8.png'))
        r, rc = rarity(t)
        col, row = t % cols, t // cols
        x, y = 20 + col * cell_w, 70 + row * cell_h
        d.rounded_rectangle((x + 4, y, x + cell_w - 4, y + cell_h - 8), 8, fill='#211a2c', outline=rc, width=2)
        sh.alpha_composite(im.resize((N * S, N * S), Image.NEAREST), (x + (cell_w - N * S) // 2, y + 4))
        d.text((x + 10, y + 6), f'{t + 1}', font=fs, fill=rc)
        nm = names[t]
        tw = d.textlength(nm, font=fn_)
        if tw > cell_w - 12:
            fsz = ImageFont.truetype(FONT, 14); tw = d.textlength(nm, font=fsz)
        else: fsz = fn_
        d.text((x + (cell_w - tw) / 2, y + N * S + 10), nm, font=fsz, fill='#f0ece0')
        tw2 = d.textlength(r, font=fs)
        d.text((x + (cell_w - tw2) / 2, y + N * S + 32), r, font=fs, fill=rc)
    sh.save(os.path.join(OUT, f'{cls_id}_weapons.png'))
    return icons


if __name__ == '__main__':
    only = os.environ.get('ONLY')
    import json
    catalog = []
    for cls_id, cname, wname, fn, names in CLASSES:
        if only and cls_id not in only.split(','): continue
        os.makedirs(os.path.join(OUT, 'png', cls_id), exist_ok=True)
        sheet_for(cls_id, cname, wname, fn, names)
        for t, nm in enumerate(names):
            catalog.append(dict(class_id=cls_id, class_name=cname, type=wname, tier=t + 1, name=nm,
                                material=MATS[t]['name'], rarity=rarity(t)[0], icon=f'png/{cls_id}/{t + 1:02d}.png'))
        print('ok', cls_id)
    if not only:
        with open(os.path.join(OUT, 'weapons.json'), 'w', encoding='utf-8') as f:
            json.dump(catalog, f, ensure_ascii=False, indent=1)

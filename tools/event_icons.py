"""隨機事件圖示（32×32，與武器圖示同一套畫法）
順序即遊戲中的圖示編號，見 EVENT_ICONS。
"""
import math
import numpy as np
from PIL import Image
import weapons as W

EVENT_ICONS = ['potion', 'bigpotion', 'chest', 'coins', 'heart', 'up', 'skull', 'spikes', 'scroll', 'fountain',
               'orb', 'bomb', 'feather', 'poison', 'cloud', 'shield', 'hourglass', 'knife', 'smoke', 'fire', 'ice', 'star']


def _ic():
    ic = W.Icon(diag=False)
    return ic

def C(ic, x, y, r): return ic._raster(lambda d: d.ellipse(((x - r) * W.SS, (y - r) * W.SS, (x + r) * W.SS, (y + r) * W.SS), fill=255))
def P(ic, pts): return ic._raster(lambda d: d.polygon([(x * W.SS, y * W.SS) for x, y in pts], fill=255))
def R(ic, x0, y0, x1, y1): return P(ic, [(x0, y0), (x1, y0), (x1, y1), (x0, y1)])


def draw(name):
    ic = _ic()
    if name in ('potion', 'bigpotion'):
        big = name == 'bigpotion'; r = 8.5 if big else 6.5; col = '#e83a4a' if not big else '#d0306a'
        ic.paint(R(ic, 13.5, 6, 18.5, 12), '#c8d8e8', 'dome', R=2)
        ic.paint(R(ic, 12.5, 4, 19.5, 7), '#8a5a2a', 'dome', R=1.5)
        ic.paint(C(ic, 16, 20, r), '#b8d8f0', 'dome', R=r)
        ic.paint(C(ic, 16, 21, r - 1.5) & ~R(ic, 0, 0, 32, 21 - r * 0.25), col, 'dome', R=r - 1)
        ic.px([(12, 15)], '#ffffff')
    elif name == 'chest':
        ic.paint(R(ic, 5, 14, 27, 27), '#8b5a2b', 'dome', R=3)
        ic.paint(P(ic, [(5, 14), (7, 8), (25, 8), (27, 14)]), '#a8703c', 'dome', R=3)
        ic.paint(R(ic, 5, 13, 27, 15.5), '#e8b440', 'cyl', c=14, hw=1.5)
        for x in (8, 23): ic.paint(R(ic, x, 8, x + 2, 27), '#e8b440', 'cyl', c=x + 1, hw=1)
        ic.paint(R(ic, 14, 13, 18, 19), '#f6d060', 'dome', R=1.5)
    elif name == 'coins':
        for x, y in ((11, 22), (20, 22), (15.5, 16), (24, 15)):
            ic.paint(C(ic, x, y, 5.5), '#f0c040', 'dome', R=5)
            ic.px([(x - 1, y - 1)], '#fff8c0')
    elif name == 'heart':
        ic.paint(C(ic, 11, 12, 6) | C(ic, 21, 12, 6) | P(ic, [(5, 14), (16, 28), (27, 14), (16, 12)]), '#ff4a6a', 'dome', R=5)
        ic.px([(9, 10)], '#ffffff')
    elif name == 'up':
        ic.paint(P(ic, [(16, 3), (28, 15), (21, 15), (21, 28), (11, 28), (11, 15), (4, 15)]), '#5ae07a', 'dome', R=4)
    elif name == 'skull':
        ic.paint(C(ic, 16, 13, 10), '#ecebe4', 'dome', R=6)
        ic.paint(R(ic, 10, 18, 22, 27), '#ecebe4', 'dome', R=3)
        for x in (11.5, 20.5): ic.paint(C(ic, x, 14, 3), '#2a1a2a', 'flat')
        ic.paint(P(ic, [(16, 17), (14, 21), (18, 21)]), '#2a1a2a', 'flat')
        for x in (13, 16, 19): ic.paint(R(ic, x - 0.5, 23, x + 0.5, 27), '#6a6a72', 'flat', line=False)
    elif name == 'spikes':
        ic.paint(R(ic, 3, 24, 29, 29), '#5a5a68', 'dome', R=2)
        for x in (6, 12, 18, 24):
            ic.paint(P(ic, [(x - 3, 24), (x + 1, 5 + (x % 4) * 2), (x + 4, 24)]), '#b8c0cc', 'dome', R=2)
    elif name == 'scroll':
        ic.paint(R(ic, 7, 7, 25, 25), '#f0e2b8', 'dome', R=3)
        for y in (7, 25): ic.paint(C(ic, 7, y, 2.6) | C(ic, 25, y, 2.6) | R(ic, 7, y - 2.4, 25, y + 2.4), '#c89a50', 'dome', R=2)
        for y in (12, 16, 20): ic.paint(R(ic, 10, y, 22, y + 1), '#8a6a4a', 'flat', line=False)
    elif name == 'fountain':
        ic.paint(P(ic, [(4, 20), (28, 20), (24, 28), (8, 28)]), '#8e8e9e', 'dome', R=3)
        ic.paint(R(ic, 14, 10, 18, 21), '#a8a8b8', 'dome', R=2)
        ic.paint(C(ic, 16, 8, 4) | P(ic, [(7, 19), (16, 9), (25, 19)]), '#5ab8ff', 'dome', R=3)
    elif name == 'orb':
        ic.paint(P(ic, [(9, 28), (23, 28), (20, 23), (12, 23)]), '#8a5a2a', 'dome', R=2)
        ic.paint(C(ic, 16, 14, 10), '#9a5ae8', 'dome', R=8)
        ic.px([(12, 10), (13, 9)], '#ffffff')
    elif name == 'bomb':
        ic.paint(C(ic, 15, 19, 10), '#3a3a4a', 'dome', R=8)
        ic.paint(R(ic, 18, 6, 22, 11), '#8a8a9a', 'dome', R=1.5)
        ic.paint(P(ic, [(21, 6), (25, 2), (27, 4), (23, 7)]), '#c8a060', 'flat')
        ic.paint(C(ic, 26, 3, 2.4), '#ffb040', 'dome', R=2)
        ic.px([(11, 14)], '#ffffff')
    elif name == 'feather':
        ic.paint(P(ic, [(7, 28), (12, 16), (20, 6), (27, 3), (24, 11), (17, 22)]), '#ff8a3a', 'dome', R=4)
        ic.paint(P(ic, [(7, 28), (25, 4), (25.8, 4.6), (8, 28.6)]), '#ffe0a0', 'flat', line=False)
    elif name == 'poison':
        ic.paint(C(ic, 16, 20, 9) | P(ic, [(8, 17), (16, 3), (24, 17)]), '#5ad04a', 'dome', R=7)
        ic.paint(C(ic, 13, 20, 1.8) | C(ic, 19, 20, 1.8), '#1a3a1a', 'flat')
    elif name == 'cloud':
        ic.paint(C(ic, 10, 19, 6) | C(ic, 17, 14, 8) | C(ic, 23, 19, 6) | R(ic, 9, 18, 24, 25), '#9a9aaa', 'dome', R=5)
    elif name == 'shield':
        ic.paint(P(ic, [(5, 5), (27, 5), (27, 16), (16, 29), (5, 16)]), '#4a7ad8', 'dome', R=4)
        ic.paint(R(ic, 14.5, 8, 17.5, 24) | R(ic, 9, 12, 23, 15), '#f0c040', 'flat', line=False)
    elif name == 'hourglass':
        ic.paint(R(ic, 7, 3, 25, 6) | R(ic, 7, 26, 25, 29), '#8b5a2b', 'dome', R=1.5)
        ic.paint(P(ic, [(9, 6), (23, 6), (17, 16), (23, 26), (9, 26), (15, 16)]), '#c8e8f8', 'dome', R=3)
        ic.paint(P(ic, [(11, 25), (21, 25), (16, 19)]) | P(ic, [(12, 8), (20, 8), (16, 13)]), '#f0c040', 'flat', line=False)
    elif name == 'knife':
        ic.paint(P(ic, [(5, 27), (18, 12), (26, 4), (21, 15), (8, 28)]), '#cfd6e0', 'dome', R=2)
        ic.paint(P(ic, [(4, 24), (10, 22), (9, 27)]), '#6a3a22', 'dome', R=1.5)
    elif name == 'smoke':
        ic.paint(C(ic, 12, 21, 7) | C(ic, 20, 18, 7) | C(ic, 16, 11, 6), '#c8c8d8', 'dome', R=5)
        ic.paint(C(ic, 10, 26, 3.5), '#3a3a4a', 'dome', R=3)
    elif name == 'fire':
        ic.paint(P(ic, [(16, 2), (24, 14), (25, 22), (16, 29), (7, 22), (9, 13), (13, 16)]), '#ff6a20', 'dome', R=5)
        ic.paint(P(ic, [(16, 13), (20, 21), (16, 27), (12, 21)]), '#ffe060', 'dome', R=3)
    elif name == 'ice':
        ic.paint(P(ic, [(16, 2), (21, 12), (30, 16), (21, 20), (16, 30), (11, 20), (2, 16), (11, 12)]), '#9ae8ff', 'dome', R=5)
    elif name == 'star':
        pts = []
        for k in range(10):
            a = -math.pi / 2 + k * math.pi / 5; r = 14 if k % 2 == 0 else 6
            pts.append((16 + math.cos(a) * r, 17 + math.sin(a) * r))
        ic.paint(P(ic, pts), '#ffd84a', 'dome', R=4)
    return ic.render()


def build(dst):
    W.FP = None
    sheet = Image.new('RGBA', (32 * len(EVENT_ICONS), 32), (0, 0, 0, 0))
    for i, n in enumerate(EVENT_ICONS):
        sheet.alpha_composite(draw(n), (i * 32, 0))
    sheet.save(dst, optimize=True)

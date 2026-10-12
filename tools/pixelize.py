"""把插畫轉成真正的像素圖：縮到像素網格 → 減色 → 透明度二值化 → 黑色外框
也負責產生怪物的換色變體（同一張原圖換色成不同屬性的怪物）。
"""
import colorsys
import numpy as np
from PIL import Image
from scipy.ndimage import binary_dilation, binary_erosion

OUTLINE = (16, 9, 20)


def pixelize(img, height, colors=36, outline=True):
    img = img.convert('RGBA')
    w = max(1, round(img.width * height / img.height))
    # 先預乘 alpha 再縮小，避免邊緣出現背景色殘影
    a = np.asarray(img).astype(np.float32) / 255
    a[..., :3] *= a[..., 3:4]
    pre = Image.fromarray((a * 255).astype(np.uint8), 'RGBA')
    small = np.asarray(pre.resize((w, height), Image.BOX)).astype(np.float32) / 255
    alpha = small[..., 3]
    rgb = np.where(alpha[..., None] > 0.01, small[..., :3] / np.maximum(alpha[..., None], 1e-3), 0)
    mask = alpha > 0.5
    mask = binary_erosion(binary_dilation(mask)) | mask          # 補小洞
    # 減色（只對不透明像素）
    rgb8 = (np.clip(rgb, 0, 1) * 255).astype(np.uint8)
    q = Image.fromarray(rgb8, 'RGB').quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
    out = np.zeros((height, w, 4), np.uint8)
    out[..., :3] = np.asarray(q); out[..., 3] = np.where(mask, 255, 0)
    if outline:
        # 外框：透明且貼著角色的像素塗深色
        ring = binary_dilation(mask) & ~mask
        out[ring] = OUTLINE + (255,)
        # 內側最外一圈稍微壓暗，讓輪廓更俐落
        edge = mask & ~binary_erosion(mask)
        out[edge, :3] = (out[edge, :3].astype(int) * 0.72).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def recolor(img, hue=None, hue_shift=0.0, sat=1.0, val=1.0):
    """換色：hue 指定絕對色相（0~1），或用 hue_shift 旋轉；sat/val 為倍率"""
    a = np.asarray(img.convert('RGBA')).astype(np.float32) / 255
    rgb = a[..., :3]
    mx, mn = rgb.max(axis=2), rgb.min(axis=2)
    h = np.zeros_like(mx); d = mx - mn + 1e-6
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) / 6
    s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0); v = mx
    colorful = s > 0.18
    if hue is not None:
        h = np.where(colorful, hue + (h - np.median(h[colorful])) * 0.35, h)
    else:
        h = np.where(colorful, h + hue_shift, h)
    h %= 1; s = np.clip(s * np.where(colorful, sat, 1), 0, 1); v = np.clip(v * val, 0, 1)
    i = np.floor(h * 6).astype(int) % 6; f = h * 6 - np.floor(h * 6)
    p, q_, t = v * (1 - s), v * (1 - f * s), v * (1 - (1 - f) * s)
    out = np.stack([np.choose(i, [v, q_, p, p, t, v]), np.choose(i, [t, v, v, q_, p, p]), np.choose(i, [p, p, t, v, v, q_])], axis=2)
    res = np.dstack([out, a[..., 3]])
    return Image.fromarray((np.clip(res, 0, 1) * 255).astype(np.uint8), 'RGBA')

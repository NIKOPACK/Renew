#!/usr/bin/env python3
"""生成全部图标与启动图。

源图：resources/icon-symbol.png（透明背景的主体图形：一叠卡片 + 新芽）
用法：python3 scripts/make_icons.py      （需要 Pillow：pip install pillow）

输出：
  Android  自适应图标（前景 / 渐变背景 / 主题单色层）、旧版方形与圆形图标、启动图、通知小图标
  iOS      AppIcon 1024、启动图
  网页     www 用的 favicon 与 apple-touch-icon（resources/web/，构建时复制）
  文档     docs/images/icon.png
"""
import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'resources', 'icon-symbol.png')
TOP, BOTTOM = (88, 132, 255), (47, 84, 224)   # 背景渐变：品牌蓝
SPLASH_BG = (242, 242, 247)                   # 与 App 浅色背景一致
SCALE_ICON = 0.66                             # 完整图标中主体占的比例
SCALE_ADAPTIVE = 0.40                         # 自适应图标前景（需落在 66/108 的安全区内）
DENS = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
RES = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')
IOS = os.path.join(ROOT, 'ios', 'App', 'App', 'Assets.xcassets')


def out(path, im):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, optimize=True)


def gradient(w, h):
    g = Image.new('RGB', (1, 512))
    for y in range(512):
        t = y / 511
        g.putpixel((0, y), tuple(round(TOP[i] * (1 - t) + BOTTOM[i] * t) for i in range(3)))
    return g.resize((w, h), Image.BICUBIC)


SYMBOL = Image.open(SRC).convert('RGBA')
SYMBOL = SYMBOL.crop(SYMBOL.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox())


def symbol_layer(size, scale):
    w, h = SYMBOL.size
    k = scale * size / max(w, h)
    s = SYMBOL.resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)
    layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    layer.alpha_composite(s, ((size - s.size[0]) // 2, (size - s.size[1]) // 2))
    return layer


def full_icon(size, scale=SCALE_ICON):
    """方形完整图标（不带圆角，系统负责裁切）"""
    base = gradient(size, size).convert('RGBA')
    base.alpha_composite(symbol_layer(size, scale))
    return base


def masked(im, shape):
    size = im.size[0]
    big = Image.new('L', (size * 4, size * 4), 0)
    d = ImageDraw.Draw(big)
    if shape == 'circle':
        d.ellipse((0, 0, size * 4 - 1, size * 4 - 1), fill=255)
    else:
        d.rounded_rectangle((0, 0, size * 4 - 1, size * 4 - 1), radius=round(size * 4 * 0.225), fill=255)
    m = big.resize((size, size), Image.LANCZOS)
    o = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    o.paste(im, (0, 0), m)
    return o


def silhouette(size, scale):
    """白色单色图：用于通知小图标与 Android 13 主题图标。
    新芽和最前面的卡片不透明，后面两张卡片半透明，保留「一叠卡片」的层次。"""
    lay = symbol_layer(size, scale)
    px, a = lay.load(), Image.new('L', (size, size), 0)
    ap = a.load()
    for y in range(size):
        for x in range(size):
            r, g, b, al = px[x, y]
            if al < 100:
                continue
            sprout = g > r + 25 and g > b + 25
            front = min(r, g, b) > 228
            ap[x, y] = 255 if (sprout or front) else 120
    o = Image.new('RGBA', (size, size), (255, 255, 255, 0))
    o.putalpha(a)
    return o


def splash(w, h):
    bg = Image.new('RGBA', (w, h), SPLASH_BG + (255,))
    s = round(min(w, h) * 0.28)
    ic = masked(full_icon(s * 2), 'rounded').resize((s, s), Image.LANCZOS)
    shadow = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    sm = Image.new('L', (s, s), 0)
    ImageDraw.Draw(sm).rounded_rectangle((0, 0, s - 1, s - 1), radius=round(s * 0.225), fill=60)
    shadow.paste((40, 60, 140, 255), ((w - s) // 2, (h - s) // 2 + round(s * 0.04)), sm)
    shadow = shadow.filter(ImageFilter.GaussianBlur(s * 0.05))
    bg.alpha_composite(shadow)
    bg.alpha_composite(ic, ((w - s) // 2, (h - s) // 2))
    return bg.convert('RGB')


def android():
    for d, k in DENS.items():
        legacy = round(48 * k)
        full = full_icon(legacy * 4)
        out(f'{RES}/mipmap-{d}/ic_launcher.png', masked(full, 'rounded').resize((legacy, legacy), Image.LANCZOS))
        out(f'{RES}/mipmap-{d}/ic_launcher_round.png', masked(full, 'circle').resize((legacy, legacy), Image.LANCZOS))
        a = round(108 * k)
        out(f'{RES}/mipmap-{d}/ic_launcher_foreground.png', symbol_layer(a * 2, SCALE_ADAPTIVE).resize((a, a), Image.LANCZOS))
        out(f'{RES}/mipmap-{d}/ic_launcher_background.png', gradient(a, a))
        out(f'{RES}/mipmap-{d}/ic_launcher_monochrome.png', silhouette(a * 2, SCALE_ADAPTIVE).resize((a, a), Image.LANCZOS))
        n = round(24 * k)
        out(f'{RES}/drawable-{d}/ic_stat_renew.png', silhouette(n * 4, 0.92).resize((n, n), Image.LANCZOS))
        pw, ph = {'mdpi': (320, 480), 'hdpi': (480, 800), 'xhdpi': (720, 1280), 'xxhdpi': (960, 1600), 'xxxhdpi': (1280, 1920)}[d]
        out(f'{RES}/drawable-port-{d}/splash.png', splash(pw, ph))
        out(f'{RES}/drawable-land-{d}/splash.png', splash(ph, pw))
    out(f'{RES}/drawable/splash.png', splash(480, 320))
    with open(f'{RES}/mipmap-anydpi-v26/ic_launcher.xml', 'w') as f:
        f.write('''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
''')
    with open(f'{RES}/mipmap-anydpi-v26/ic_launcher_round.xml', 'w') as f:
        f.write(open(f'{RES}/mipmap-anydpi-v26/ic_launcher.xml').read())


def ios():
    out(f'{IOS}/AppIcon.appiconset/AppIcon-512@2x.png', full_icon(1024).convert('RGB'))  # iOS 图标不能带透明通道
    sp = splash(2732, 2732)
    for n in ('splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'):
        out(f'{IOS}/Splash.imageset/{n}', sp)


def web():
    full = full_icon(1024)
    out(f'{ROOT}/resources/web/icon-512.png', masked(full, 'rounded').resize((512, 512), Image.LANCZOS))
    out(f'{ROOT}/resources/web/apple-touch-icon.png', full.convert('RGB').resize((180, 180), Image.LANCZOS))
    out(f'{ROOT}/resources/web/favicon-64.png', masked(full, 'rounded').resize((64, 64), Image.LANCZOS))
    out(f'{ROOT}/docs/images/icon.png', masked(full, 'rounded').resize((256, 256), Image.LANCZOS))
    out(f'{ROOT}/resources/brand-128.png', masked(full, 'rounded').resize((128, 128), Image.LANCZOS))  # 界面内的品牌标志（构建时内联）


if __name__ == '__main__':
    if os.path.isdir(RES):
        android()
    if os.path.isdir(IOS):
        ios()
    web()
    print('icons ok')

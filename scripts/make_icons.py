#!/usr/bin/env python3
"""生成全部图标与启动图。

源图：resources/icon-symbol.png（透明背景的主体图形：一叠卡片 + 雏菊，丝网印刷海报风格：黑色硬边光影、奶油色、菱格三角纹）
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
TOP, BOTTOM = (46, 85, 235), (46, 85, 235)     # 背景：平涂品牌蓝（海报风格，不用渐变）
SPLASH_BG = (242, 242, 247)                   # 与 App 浅色背景一致
SCALE_ICON = 0.74                             # 完整图标中主体占的比例
SCALE_ADAPTIVE = 0.52                         # 自适应图标前景（需落在 66/108 的安全区内）
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
    奶油色部分不透明，浅蓝点缀稍透明，黑色光影只留淡淡一层，保留花瓣与菱格纹的轮廓。"""
    lay = symbol_layer(size, scale)
    px, a = lay.load(), Image.new('L', (size, size), 0)
    ap = a.load()
    for y in range(size):
        for x in range(size):
            r, g, b, al = px[x, y]
            if al < 100:
                continue
            if min(r, g, b) > 150:
                ap[x, y] = 255            # 奶油色
            elif b > r + 40:
                ap[x, y] = 190            # 浅蓝点缀
            else:
                ap[x, y] = 70             # 黑色光影
    o = Image.new('RGBA', (size, size), (255, 255, 255, 0))
    o.putalpha(a)
    return o


def on_dark(im):
    """深色背景用：把接近黑色的部分换成中灰"""
    px = im.copy(); p = px.load()
    for y in range(px.size[1]):
        for x in range(px.size[0]):
            r, g, b, a = p[x, y]
            if a and max(r, g, b) < 90:
                k = max(r, g, b) / 90
                p[x, y] = (round(92 + 60 * k), round(96 + 60 * k), round(108 + 50 * k), a)
    return px


def small(path, im):
    """内联进页面的图片：减少颜色数，控制体积"""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.quantize(colors=96, method=Image.Quantize.FASTOCTREE).save(path, optimize=True)


def splash(w, h):
    """启动图：浅色底上只放主体图形（不加底板和阴影）"""
    bg = Image.new('RGBA', (w, h), SPLASH_BG + (255,))
    s = round(min(w, h) * 0.34)
    ic = symbol_layer(s * 2, 1).resize((s, s), Image.LANCZOS)
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
    mark = symbol_layer(480, 1).resize((240, 240), Image.LANCZOS)  # 界面内的品牌标志：透明背景的主体图形（构建时内联）
    small(f'{ROOT}/resources/brand-mark.png', mark)
    small(f'{ROOT}/resources/brand-mark-dark.png', on_dark(mark))  # 深色模式：黑色光影提亮成灰色，避免融进黑底


if __name__ == '__main__':
    if os.path.isdir(RES):
        android()
    if os.path.isdir(IOS):
        ios()
    web()
    print('icons ok')

"""Generate brand-kit share cards (1200x630) from the built snapshot."""
import json, os, math
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = os.path.join(ROOT, 'public', 'assets')
FONTS = os.path.join(ROOT, 'scripts', 'fonts')
SNAP = json.load(open(os.path.join(ROOT, 'public', 'data', 'data.json')))
GROUND = (18, 16, 14); MAROON = (58, 20, 32); PANEL = (34, 30, 26); LINE = (69, 62, 55)
CREAM = (239, 233, 226); PAPER = (255, 246, 232); MUTED = (176, 167, 157); MAGENTA = (231, 64, 121); SALMON = (217, 160, 151)
W, H = 1200, 630


def f(name, size):
    return ImageFont.truetype(os.path.join(FONTS, name), size)


def glow(img):
    px = img.load()
    cx, cy = W * 0.86, -H * 0.15
    r = W * 0.85
    for y in range(0, H, 2):
        for x in range(0, W, 2):
            d = math.hypot(x - cx, y - cy) / r
            a = max(0.0, 1.0 - d) ** 2 * 0.95
            if a <= 0.01:
                continue
            base = px[x, y]
            px[x, y] = tuple(int(base[i] * (1 - a) + MAROON[i] * a) for i in range(3))
            if x + 1 < W: px[x + 1, y] = px[x, y]
            if y + 1 < H: px[x, y + 1] = px[x, y]
    return img


def card(eyebrow, headline_parts, big, big_label, footnote, out):
    img = Image.new('RGB', (W, H), GROUND)
    img = glow(img)
    d = ImageDraw.Draw(img)
    # border + panels
    d.rectangle([28, 28, W - 28, H - 28], outline=LINE, width=1)
    lock = Image.open(os.path.join(A, 'taskmarket-lockup.png')).convert('RGBA')
    lw = 210; lh = int(lock.height * lw / lock.width)
    lock = lock.resize((lw, lh), Image.Resampling.LANCZOS)
    # tint lockup to cream
    cream = Image.new('RGBA', lock.size, CREAM + (255,))
    cream.putalpha(lock.split()[-1])
    img.paste(cream, (62, 56), cream)
    d = ImageDraw.Draw(img)

    d.text((62, 128), eyebrow.upper(), font=f('DepartureMono-Regular.woff2', 17) if False else f('InstrumentSerif-Regular.ttf', 18), fill=MUTED)
    x = 60
    y = 160
    for text, italic in headline_parts:
        ft = f('InstrumentSerif-Italic.ttf' if italic else 'InstrumentSerif-Regular.ttf', 76)
        d.text((x, y), text, font=ft, fill=MAGENTA if italic else PAPER)
        x += d.textlength(text, font=ft)
    # big number block
    if big:
        d.rectangle([60, 300, 1140, 486], fill=PANEL, outline=LINE)
        d.text((84, 316), big, font=f('InstrumentSerif-Regular.ttf', 108), fill=PAPER)
        d.text((86, 438), big_label.upper(), font=f('InstrumentSerif-Regular.ttf', 18), fill=MUTED)
    d.text((60 if not big else 84, 512), footnote, font=f('InstrumentSerif-Regular.ttf', 20), fill=CREAM)
    d.line([60, 556, W - 60, 556], fill=LINE, width=1)
    d.text((60, 570), 'taskmarket.dev', font=f('InstrumentSerif-Regular.ttf', 20), fill=CREAM)
    d.text((W - 60 - d.textlength('made for a paid Taskmarket bounty - not an official Taskmarket product', font=f('InstrumentSerif-Regular.ttf', 15)), 572),
           'made for a paid Taskmarket bounty - not an official Taskmarket product', font=f('InstrumentSerif-Regular.ttf', 15), fill=MUTED)
    img.save(os.path.join(A, out), optimize=True)
    print(out, img.size)


t = SNAP['chains']['4217']
st = SNAP['chains']['4217']['stats']
gen = SNAP['generatedAt'][:16].replace('T', ' ') + ' UTC'
card('live market visualizer', [('Taskmarket, ', 0), ('in the open', 1)], f"{st['openTasks']}", 'open tasks right now', f"data as of {gen} - refreshed hourly", 'share-overview.png')
card('money flow', [('Where the ', 0), ('money', 1), (' goes', 0)], f"${t['flow30d']['posted']:,.0f}", 'reward put up in 30 days', f"${t['flow30d']['paid']:,.0f} paid out in the same window - data as of {gen}", 'share-money.png')
card('posters', [('Who is ', 0), ('posting', 1)], f"{t['concentration']['posters30d']}", 'distinct posters in 30 days', f"top 10 posters created {round(t['concentration']['top10Share']*100)}% of tasks - data as of {gen}", 'share-posters.png')
card('live activity', [('The market, ', 0), ('right now', 1)], f"{st['activeAgents7d']}", 'agents active in 7 days', f"{st['registeredWorkers']:,} registered workers - data as of {gen}", 'share-feed.png')

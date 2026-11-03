"""Backdrop titantron: the logo and tagline playing on the curved screen in stage.jpg.
usage: python3 backdrop.py OUT.mp4            render the 6s loop (1680x944)
       python3 backdrop.py OUT 0,80,150       write those frames as OUT_000.png ..."""
import sys, subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

import os
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'stage.jpg')
OUT = sys.argv[1]
STILLS = len(sys.argv) > 2
FONTS = os.path.join(HERE, '..', '..', 'www', 'fonts') + os.sep
TAGLINE = 'Tangential thoughts from a tangential kind of person.'
FPS, SECS = 30, 6
N = FPS * SECS

base_img = Image.open(SRC).convert('RGB')
W, H = base_img.size
base = np.asarray(base_img).astype(np.float32) / 255

# ---- screen geometry (curved screen, top edge sags towards the middle)
TL, TR, BL, BR = (240, 72), (1492, 132), (207, 754), (1510, 752)
TOPMID = (900, 183)
A = np.array([[x * x, x, 1] for x, _ in (TL, TOPMID, TR)], float)
top_c = np.linalg.solve(A, [TL[1], TOPMID[1], TR[1]])
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
top = top_c[0] * xx ** 2 + top_c[1] * xx + top_c[2]
bot = BL[1] + (BR[1] - BL[1]) * (xx - BL[0]) / (BR[0] - BL[0])
v = (yy - top) / (bot - top)
left = TL[0] + (BL[0] - TL[0]) * v
right = TR[0] + (BR[0] - TR[0]) * v
u = (xx - left) / (right - left)
inside = (u >= 0) & (u <= 1) & (v >= 0) & (v <= 1)
edge = np.clip(np.minimum.reduce([u, 1 - u, v * 0.5, 1 - v]) * 300, 0, 1) * inside

# ---- graphic, drawn flat in screen space
CW, CH = 2400, 1200

def font(name, size, axes=None):
    f = ImageFont.truetype(FONTS + name, size)
    if axes: f.set_variation_by_axes(axes)
    return f

def text_mask(word, f, tracking, cx, cy, angle=0):
    widths = [f.getlength(c) for c in word]
    total = sum(widths) + tracking * (len(word) - 1)
    l, t_, r, b = f.getbbox('TANGH')
    im = Image.new('L', (CW, CH), 0)
    d = ImageDraw.Draw(im)
    x = cx * CW - total / 2
    y = cy * CH - (t_ + f.getbbox('TANGH')[3]) / 2
    for c, w in zip(word, widths):
        d.text((x, y), c, font=f, fill=255)
        x += w + tracking
    if angle:
        im = im.rotate(angle, resample=Image.BICUBIC, center=(cx * CW, cy * CH))
    return np.asarray(im).astype(np.float32) / 255, total

def drop_points(x0, y_bottom, w, h, n=80):
    # svg path M10 1 C10 1 1.5 11 1.5 16.5 a8.5 8.5 0 0 0 17 0 C18.5 11 10 1 10 1Z in a 20x26 box
    def bez(p0, p1, p2, p3):
        ts = np.linspace(0, 1, n)[:, None]
        return ((1 - ts) ** 3 * p0 + 3 * (1 - ts) ** 2 * ts * p1 + 3 * (1 - ts) * ts ** 2 * p2 + ts ** 3 * p3)
    P = np.array
    a = bez(P([10, 1]), P([10, 1]), P([1.5, 11]), P([1.5, 16.5]))
    ang = np.linspace(np.pi, 0, n)
    arc = np.stack([10 + 8.5 * np.cos(ang), 16.5 + 8.5 * np.sin(ang)], -1)
    b = bez(P([18.5, 16.5]), P([18.5, 11]), P([10, 1]), P([10, 1]))
    pts = np.concatenate([a, arc, b])
    sx, sy = w / 20, h / 26
    return [(x0 + px * sx, y_bottom - h + py * sy) for px, py in pts]

def logo_masks(f, em, cx, cy):
    track = -0.015 * em
    dw, dh = 0.585 * em, 0.76 * em
    parts = ['B', 'a', 'c', 'k', 'd', 'r', None, 'p']
    widths = [(f.getlength(c) + track) if c else (-0.02 + 0.585 - 0.05) * em for c in parts]
    total = sum(widths)
    asc = f.getbbox('Bk', anchor='ls')[1]   # negative: top of ascenders above baseline
    xh = f.getbbox('x', anchor='ls')[1]
    # centre the x-height/ascender block vertically; descender of p hangs below
    base_y = cy * CH - asc / 2
    letters = Image.new('L', (CW, CH), 0); drop = Image.new('L', (CW, CH), 0)
    dl, dd = ImageDraw.Draw(letters), ImageDraw.Draw(drop)
    x = cx * CW - total / 2
    x_start = x
    for c, w in zip(parts, widths):
        if c:
            dl.text((x, base_y), c, font=f, fill=255, anchor='ls')
        else:
            dd.polygon(drop_points(x - 0.02 * em, base_y + 0.04 * em, dw, dh), fill=255)
        x += w
    m = lambda im: np.asarray(im).astype(np.float32) / 255
    return m(letters), m(drop), (x_start / CW, x / CW)

def morph(m, op, size):
    im = Image.fromarray((m * 255).astype(np.uint8))
    im = im.filter(ImageFilter.MaxFilter(size) if op == 'grow' else ImageFilter.MinFilter(size))
    return np.asarray(im).astype(np.float32) / 255

def gblur(m, r):
    if m.ndim == 3:
        return np.stack([gblur(m[..., c], r) for c in range(3)], -1)
    # three box passes per axis ~ gaussian
    out = m.astype(np.float32)
    k = max(1, int(round(np.sqrt(12 * r * r / 3 + 1))))
    k += (k % 2 == 0)
    for ax in (0, 1):
        for _ in range(3):
            p = k // 2
            pad = [(0, 0), (0, 0)]; pad[ax] = (p + 1, p)
            c = np.cumsum(np.pad(out, pad, mode='edge'), axis=ax, dtype=np.float64)
            out = ((np.take(c, range(k, c.shape[ax]), axis=ax) - np.take(c, range(0, c.shape[ax] - k), axis=ax)) / k).astype(np.float32)
    return out

def hexc(h):
    return np.array([int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)], np.float32)

def hgrad(stops):
    xs = np.linspace(0, 1, CW)
    pos = [p for p, _ in stops]
    cols = np.stack([np.interp(xs, pos, [c[k] for _, c in stops]) for k in range(3)], -1)
    return np.broadcast_to(cols[None], (CH, CW, 3)).astype(np.float32)

def vgrad_in(mask, stops):
    ys = np.nonzero(mask.max(axis=1) > 0.5)[0]
    y0, y1 = ys.min(), ys.max()
    yn = np.clip((np.arange(CH) - y0) / (y1 - y0), 0, 1)
    pos = [p for p, _ in stops]
    cols = np.stack([np.interp(yn, pos, [c[k] for _, c in stops]) for k in range(3)], -1)
    return np.broadcast_to(cols[:, None], (CH, CW, 3)).astype(np.float32)

ORANGE, ORANGE_B, NAVY = hexc('#E8622C'), hexc('#FF7A3D'), hexc('#7FA8D9')
WHITE = np.array([1, 0.97, 0.92], np.float32)
WORD_F = font('bricolage-grotesque.woff2', 360, [96, 800])
TAG_F = font('karla-700.woff2', 74)

emis = np.zeros((CH, CW, 3), np.float32)   # light the screen emits
black = np.zeros((CH, CW), np.float32)     # where the screen shows dark pixels
LOGO_F = font('bricolage-grotesque.woff2', 400, [96, 800])
letters, dropm, (lx0, lx1) = logo_masks(LOGO_F, 400, 0.5, 0.45)
word = np.maximum(letters, dropm)

def over(dst, col, m):
    return dst * (1 - m[..., None]) + col * m[..., None]

# logo fill from the site: peach -> white -> white -> ice blue, orange drop, orange + blue glow
xs = np.clip((np.arange(CW) / CW - lx0) / (lx1 - lx0), 0, 1)
stops = [(0, hexc('#FFE3C2')), (0.4, hexc('#FFFFFF')), (0.6, hexc('#FFFFFF')), (1, hexc('#D6E8FF'))]
fillg = np.stack([np.interp(xs, [p for p, _ in stops], [c[k] for _, c in stops]) for k in range(3)], -1)
fillg = np.broadcast_to(fillg[None], (CH, CW, 3)).astype(np.float32)
wm = word[..., None]
emis += gblur(hexc('#FFAA6E') * wm, 22) * 0.35
emis += gblur(hexc('#8CB4E6') * wm, 50) * 0.35
emis = over(emis, fillg, letters)
emis = over(emis, hexc('#FF7A3D') * 0.95, dropm)
black = np.clip(gblur(morph(word, 'grow', 27), 10) * 1.5, 0, 0.92)
tag, tw = text_mask(TAGLINE.upper(), font('karla-700.woff2', 52), 8, 0.5, 0.735)
emis = over(emis, WHITE * 0.85, tag)
rule = np.zeros((CH, CW), np.float32)
ry = int(0.735 * CH)
gap = tw / 2 + 36
rlen = min(220, CW * 0.47 - gap)
rule[ry - 3:ry + 3, int(CW * 0.5 - gap - rlen):int(CW * 0.5 - gap)] = 1
rule[ry - 3:ry + 3, int(CW * 0.5 + gap):int(CW * 0.5 + gap + rlen)] = 1
emis = over(emis, hexc('#D9B455'), gblur(rule, 1))
black = np.maximum(black, gblur(morph(tag, 'grow', 13), 6) * 0.8)
TAGM = tag

word_soft = gblur(word, 1.2)
emis = gblur(np.clip(emis, 0, 2), 1.0)
black = gblur(black, 1.0)

# LED pixel grid (screen space, follows the perspective)
gx, gy = np.meshgrid(np.arange(CW), np.arange(CH))
pitch = 6
led = (0.6 + 0.4 * (np.sin(gx * np.pi / pitch) ** 2) * (np.sin(gy * np.pi / pitch) ** 2)).astype(np.float32)

# ---- sample flat graphic onto the curved screen (bilinear)
iy, ix = np.nonzero(inside)
su = u[iy, ix] * (CW - 1); sv = v[iy, ix] * (CH - 1)
x0 = np.floor(su).astype(int); y0 = np.floor(sv).astype(int)
x1 = np.minimum(x0 + 1, CW - 1); y1 = np.minimum(y0 + 1, CH - 1)
fx = su - x0; fy = sv - y0
def sample(tex):
    shp = (H, W) + tex.shape[2:]
    out = np.zeros(shp, np.float32)
    w = lambda a: a if tex.ndim == 2 else a[:, None]
    out[iy, ix] = (tex[y0, x0] * w((1 - fx) * (1 - fy)) + tex[y0, x1] * w(fx * (1 - fy))
                   + tex[y1, x0] * w((1 - fx) * fy) + tex[y1, x1] * w(fx * fy))
    return out

S_emis = sample(emis) * edge[..., None]
S_black = sample(black) * edge
S_word = sample(word_soft) * edge
S_tagm = sample(gblur(TAGM, 1.0)) * edge 
S_led = sample(led)

tint = np.asarray(base_img.filter(ImageFilter.GaussianBlur(60))).astype(np.float32) / 255
tint = tint / (tint.max(axis=2, keepdims=True) + 1e-4)

rng = np.random.default_rng(7)
def periodic_noise(h, w, scale):
    f = np.fft.fft2(rng.standard_normal((h, w)))
    ky = np.fft.fftfreq(h)[:, None]; kx = np.fft.fftfreq(w)[None, :]
    f *= np.exp(-(kx ** 2 + ky ** 2) * scale)
    n = np.real(np.fft.ifft2(f))
    return ((n - n.min()) / (n.max() - n.min())).astype(np.float32)
smoke = periodic_noise(H, W, 4000)

ramp = np.clip((yy - 762) / 12, 0, 1) * np.clip((860 - yy) / 60, 0, 1)
floor = ramp * np.clip((xx - 120) / 80, 0, 1) * np.clip((1300 - xx) / 120, 0, 1)


GRIME = True
if GRIME:
    gr = np.random.default_rng(11)
    # blotchy dirt and streaks on the panel surface
    def pn(h, w, scale):
        f = np.fft.fft2(gr.standard_normal((h, w)))
        ky = np.fft.fftfreq(h)[:, None]; kx = np.fft.fftfreq(w)[None, :]
        f *= np.exp(-(kx ** 2 + ky ** 2) * scale)
        n = np.real(np.fft.ifft2(f)); return (n - n.min()) / (n.max() - n.min())
    small = (CH // 4, CW // 4)
    blot = np.asarray(Image.fromarray(pn(*small, 900).astype(np.float32)).resize((CW, CH), Image.BILINEAR))
    fine = np.asarray(Image.fromarray(pn(*small, 30).astype(np.float32)).resize((CW, CH), Image.BILINEAR))
    streak = np.asarray(Image.fromarray(pn(CH // 16, CW // 4, 4).astype(np.float32)).resize((CW, CH), Image.BILINEAR))
    dirt = 1 - 0.22 * np.clip((blot - 0.5) * 2.2, 0, 1) - 0.07 * fine - 0.08 * np.clip((streak - 0.5) * 3, 0, 1)
    # LED modules: uneven brightness, a few dead or dim tiles, visible seams
    tile = 96
    ty, tx = np.arange(CH) // tile, np.arange(CW) // tile
    tvals = gr.uniform(0.93, 1.02, (ty.max() + 1, tx.max() + 1))
    dead = gr.random(tvals.shape)
    busy = gblur(morph(np.maximum(word, TAGM), 'grow', 41), 20)
    busy_t = np.array([[busy[r * tile:(r + 1) * tile, c * tile:(c + 1) * tile].max() for c in range(tvals.shape[1])] for r in range(tvals.shape[0])])
    ok = busy_t < 0.02
    modules = tvals[ty][:, tx]
    seam = np.ones((CH, CW), np.float32)
    seam[(np.arange(CH) % tile) < 2, :] = 0.9
    seam[:, (np.arange(CW) % tile) < 2] = 0.9
    panel = (dirt * modules * seam).astype(np.float32)
    S_panel = sample(panel)
    S_panel[~inside] = 1
    vign = 1 - 0.32 * np.clip(((xx / W - 0.5) ** 2 + ((yy / H - 0.5) * 0.9) ** 2) * 2.6, 0, 1) ** 1.3
    vign = vign.astype(np.float32)

def smooth(x):
    x = np.clip(x, 0, 1); return x * x * (3 - 2 * x)

def frame(i):
    t = i / N
    breathe = 0.93 + 0.07 * np.sin(2 * np.pi * t)
    flick = 1 + 0.02 * np.sin(2 * np.pi * 17 * t) * np.sin(2 * np.pi * 5 * t)
    sweep = -0.3 + 1.6 * smooth((t - 0.15) / 0.35)
    glint = np.exp(-((u - sweep - (v - 0.5) * 0.15) / 0.035) ** 2) * S_word

    sweep2 = -0.3 + 1.6 * smooth((t - 0.38) / 0.35)
    glint2 = np.exp(-((u - sweep2) / 0.03) ** 2) * S_tagm
    e = S_emis + (glint + glint2 * 0.6)[..., None] * WHITE * 0.8
    e = e * (S_led[..., None] * 0.8 + 0.2) * breathe * flick
    if 0.62 <= t < 0.62 + 4 / N:
        e = np.stack([np.roll(e[..., 0], 9, 1), e[..., 1] * 0.7, np.roll(e[..., 2], -9, 1)], -1)
        band = ((yy // 14).astype(int) % 7 == 3)
        e = np.where(band[..., None], np.roll(e, 25, 1), e)

    e = e * (1 + 0.45 * S_word[..., None])
    e = e / np.maximum(e.max(axis=2, keepdims=True), 1)  # brighten without bleaching hue
    veil = 0.86 + 0.14 * np.roll(smoke, int(round(t * W)), axis=1)
    e = e * veil[..., None]

    bloom_k = 0.55
    glow = bloom_k * (gblur(np.clip(e, 0, 1), 18) * 0.45 + gblur(np.clip(e, 0, 1) * 0.6, 55) * 0.5) * (1 - 0.6 * S_word[..., None])
    glow *= (0.15 * tint + 0.85)
    src_rows = np.clip(2 * 770 - np.arange(H) + 20, 0, H - 1)
    refl = gblur(np.clip(e[src_rows], 0, 1), 10) * (floor * 0.3)[..., None]

    # dark LED pixels replace the screen's haze, but the haze in the air still sits on top
    haze_front = 0.12 * gblur(base, 25)
    bg = base * (1 - S_black[..., None]) + haze_front * S_black[..., None]
    add = np.clip(e + glow + refl, 0, 1)
    out = 1 - (1 - bg) * (1 - add)
    if GRIME:
        scr = inside[..., None]
        out = np.where(scr, out * S_panel[..., None], out)
        # a dim band rolling down the screen once per loop
        band = 1 - 0.1 * np.exp(-((v - ((t * 1.4) % 1.4 - 0.2)) / 0.05) ** 2) * inside
        out *= band[..., None]
        # faint scanlines
        out *= (1 - 0.06 * ((yy.astype(int) // 2) % 2))[..., None]
        # muted, grubby grade: desaturate, crush, warm-green cast, vignette
        lum = (out * np.array([0.3, 0.59, 0.11], np.float32)).sum(-1, keepdims=True)
        out = lum + (out - lum) * 0.42
        out = np.clip(out, 0, 1) ** 1.08 * np.array([1.0, 0.97, 0.86], np.float32) + np.array([0.025, 0.022, 0.012], np.float32)
        out *= vign[..., None]
        # heavy grain, per-frame dust specks and the odd scratch
        g = rng.standard_normal((H // 2, W // 2)).astype(np.float32)
        g = np.asarray(Image.fromarray(g).resize((W, H), Image.BILINEAR))
        out += (g * 0.022)[..., None] + rng.standard_normal((H, W, 3)).astype(np.float32) * 0.01
        n_specks = rng.integers(3, 9)
        for _ in range(n_specks):
            sx, sy = rng.integers(0, W), rng.integers(0, H); r = rng.integers(1, 4)
            out[max(0, sy - r):sy + r, max(0, sx - r):sx + r] *= rng.uniform(0.4, 0.7)
        if rng.random() < 0.12:
            sx = rng.integers(0, W)
            out[:, sx:sx + 1] = out[:, sx:sx + 1] * 0.85 + 0.05
    if not GRIME:
        out += rng.standard_normal((H, W, 1)).astype(np.float32) * 0.012
    return (np.clip(out, 0, 1) * 255).astype(np.uint8)

if STILLS:
    for i in [int(a) for a in sys.argv[2].split(',')]:
        Image.fromarray(frame(i)).save(f'{OUT}_{i:03d}.png')
    sys.exit()

ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
                       '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'slow',
                       '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT], stdin=subprocess.PIPE)
for i in range(N):
    ff.stdin.write(frame(i).tobytes())
ff.stdin.close(); ff.wait()
print('done', OUT)

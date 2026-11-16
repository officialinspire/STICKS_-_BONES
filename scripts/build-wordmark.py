#!/usr/bin/env python3
"""
npm run wordmark:build — vector masters of the STICKS & BONES wordmark.

Letterforms are outlines of Bricolage Grotesque (SIL OFL 1.1; outlining a
licensed font into artwork is permitted) at weight 800, width 75, optical size
96, given a restrained hand-painted character: each letter is tilted and
nudged by a small deterministic amount. The ampersand is custom: two linked
dominoes (ivory faces, divider, guava pips), not a font glyph.

Outputs (src/assets/brand/):
  wordmark.svg          full colour: ivory face, deep-sea outline + extrusion, guava pips
  wordmark-mono.svg     one colour (currentColor) for stamps, watermarks, print
  wordmark-compact.svg  single line for short screens and tight headers
Usage: python3 scripts/build-wordmark.py <dir with BricolageGrotesque[opsz,wdth,wght].ttf>
"""
import os, sys, math
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

SRC = sys.argv[1] if len(sys.argv) > 1 else '/tmp/fonts'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src/assets/brand')
font = instancer.instantiateVariableFont(TTFont(os.path.join(SRC, 'bricolagegrotesque/BricolageGrotesque[opsz,wdth,wght].ttf')), {'wght': 800, 'wdth': 75, 'opsz': 96})
gs = font.getGlyphSet(); cmap = font.getBestCmap(); hmtx = font['hmtx']
DEEP, IVORY, GUAVA = '#083F43', '#FFF2D8', '#D94F45'
fmt = lambda v: f'{v:.1f}'.rstrip('0').rstrip('.')

# Small, fixed "painted" irregularities per letter: (tilt degrees, dy font units).
JITTER = [(-2.2, -14), (1.4, 8), (-1.0, -6), (2.0, 12), (-1.6, -10), (1.1, 6), (1.8, -8), (-1.3, 10), (2.3, -12), (-1.9, 6)]

def glyph_path(ch, x, y, scale, k):
    g = cmap[ord(ch)]
    adv = hmtx[g][0]
    bp = BoundsPen(gs); gs[g].draw(bp)
    xmin, ymin, xmax, ymax = bp.bounds
    cx, cy = (xmin + xmax) / 2, (ymin + ymax) / 2
    tilt, dy = JITTER[k % len(JITTER)]
    a = math.radians(tilt)
    # font units → svg: flip y, rotate about the glyph centre, place at (x, y) baseline.
    def m(px, py):
        rx, ry = px - cx, py - cy
        qx, qy = rx * math.cos(a) - ry * math.sin(a), rx * math.sin(a) + ry * math.cos(a)
        return (x + (qx + cx) * scale, y - (qy + cy + dy) * scale)
    sp = SVGPathPen(gs, ntos=fmt)
    class P(TransformPen):
        pass
    # Apply the full affine via a matrix: compute from three points.
    o = m(0, 0); ex = m(1, 0); ey = m(0, 1)
    mat = (ex[0] - o[0], ex[1] - o[1], ey[0] - o[0], ey[1] - o[1], o[0], o[1])
    gs[g].draw(TransformPen(sp, mat))
    return sp.getCommands(), adv * scale

def line(text, x, y, scale, k0, tracking=0):
    paths = []
    for i, ch in enumerate(text):
        d, adv = glyph_path(ch, x, y, scale, k0 + i)
        paths.append(d); x += adv + tracking
    return ' '.join(paths), x

def amp_mark(x, y, scale, k, mono=False):
    """The ampersand: the Bricolage '&' silhouette (guava) with a small ivory domino laid
    across its tail as the connecting link — readable as '&' at every size."""
    d, adv = glyph_path('&', x, y, scale, k)
    bp = BoundsPen(gs); gs[cmap[ord('&')]].draw(bp)
    xmin, ymin, xmax, ymax = bp.bounds
    # Domino link over the lower-right tail of the ampersand.
    cx = x + (xmin + (xmax - xmin) * 0.70) * scale
    cy = y - (ymin + (ymax - ymin) * 0.22) * scale
    tw, th = (ymax - ymin) * scale * 0.50, (ymax - ymin) * scale * 0.24
    r, pr = th * 0.28, th * 0.15
    stroke = 'currentColor' if mono else DEEP
    face = 'none' if mono else IVORY
    pip = 'currentColor' if mono else '#14252B'
    link = (f'<g transform="rotate(-38 {fmt(cx)} {fmt(cy)})">'
            f'<rect x="{fmt(cx - tw/2)}" y="{fmt(cy - th/2)}" width="{fmt(tw)}" height="{fmt(th)}" rx="{fmt(r)}" fill="{face}" stroke="{stroke}" stroke-width="5"/>'
            f'<line x1="{fmt(cx)}" y1="{fmt(cy - th*0.3)}" x2="{fmt(cx)}" y2="{fmt(cy + th*0.3)}" stroke="{stroke}" stroke-width="3"/>'
            f'<circle cx="{fmt(cx - tw*0.25)}" cy="{fmt(cy)}" r="{fmt(pr)}" fill="{pip}"/>'
            f'<circle cx="{fmt(cx + tw*0.18)}" cy="{fmt(cy - th*0.18)}" r="{fmt(pr)}" fill="{pip}"/>'
            f'<circle cx="{fmt(cx + tw*0.32)}" cy="{fmt(cy + th*0.18)}" r="{fmt(pr)}" fill="{pip}"/></g>')
    if mono:
        body = f'<path d="{d}" fill="currentColor"/>' + link.replace('fill="none"', 'fill="none" stroke-opacity="1"')
        # Knock the link out of the glyph so it stays visible in one colour.
        body = f'<path d="{d}" fill="currentColor"/>' + link.replace(f'fill="{face}"', 'fill="#fff" fill-opacity="0"')
    else:
        body = (f'<path d="{d}" transform="translate(6 7)" fill="{DEEP}"/>'
                f'<path d="{d}" fill="{GUAVA}" stroke="{DEEP}" stroke-width="10" stroke-linejoin="round" paint-order="stroke"/>' + link)
    return body, adv

def build(variant):
    S = 0.16  # font units → px
    pad = 24
    if variant == 'compact':
        y = 128
        a, x = line('STICKS', pad, y, S * 0.9, 0)
        amp, aw = amp_mark(x + 10, y, S * 0.78, 9, variant == 'mono')
        b, x2 = line('BONES', x + aw + 18, y, S * 0.9, 6)
        width, height = x2 + pad, y + 40
        lines = [(a, None), (b, None)]
        amp_parts = [amp]
    else:
        y1, y2 = 150, 300
        a, x1 = line('STICKS', pad, y1, S, 0)
        amp, aw = amp_mark(pad, y2, S * 0.86, 9, variant == 'mono')
        b, x2 = line('BONES', pad + aw + 8, y2, S, 6)
        width, height = max(x1, x2) + pad, y2 + 46
        amp_parts = [amp]
        lines = [(a, None), (b, None)]
    d = ' '.join(p for p, _ in lines)
    title = '<title>STICKS &amp; BONES</title>'
    vb = f'0 0 {fmt(width)} {fmt(height)}'
    if variant == 'mono':
        body = f'<path d="{d}" fill="currentColor"/>{amp_parts[0]}'
    else:
        ext = f'<path d="{d}" transform="translate(7 8)" fill="{DEEP}"/>'
        face = f'<path d="{d}" fill="{IVORY}" stroke="{DEEP}" stroke-width="10" stroke-linejoin="round" paint-order="stroke"/>'
        body = ext + face + amp_parts[0]
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" role="img" aria-label="STICKS &amp; BONES">{title}{body}</svg>\n'

os.makedirs(OUT, exist_ok=True)
for name, v in [('wordmark.svg', 'master'), ('wordmark-mono.svg', 'mono'), ('wordmark-compact.svg', 'compact')]:
    s = build(v)
    open(os.path.join(OUT, name), 'w').write(s)
    print(name, len(s), 'bytes')

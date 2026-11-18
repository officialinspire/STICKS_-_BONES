#!/usr/bin/env python3
"""
npm run fonts:build — compact, self-hosted WOFF2 subsets of the two UI fonts.

Sources (SIL Open Font License 1.1, no Reserved Font Name declared, so subsets
may keep their names). Download them from the official google/fonts repository
into a working folder and pass it as the first argument:
  ofl/dmsans/DMSans[opsz,wght].ttf                         (Colophon Foundry)
  ofl/bricolagegrotesque/BricolageGrotesque[opsz,wdth,wght].ttf  (Mathieu Triay)
  ofl/dmsans/OFL.txt, ofl/bricolagegrotesque/OFL.txt

Requires: pip install fonttools brotli

Subset: Basic Latin + Latin-1 (all Spanish accents, ñ/Ñ, ü, ¿, ¡, «», ·), the
typographic quotes and dashes the script uses (‘ ’ “ ” – — …), bullet, euro.
Kept features: kerning, ligatures, case, tabular/lining figures (tnum for scores).
Axes are trimmed to the ranges the UI uses, which keeps the files small.
"""
import json, hashlib, os, sys, shutil
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

SRC = sys.argv[1] if len(sys.argv) > 1 else '/tmp/fonts'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src/assets/fonts')
LIC = os.path.join(ROOT, 'public/licenses')
UNICODES = list(range(0x20, 0x7F)) + list(range(0xA0, 0x100)) + [0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2026, 0x2022, 0x20AC, 0x2032, 0x2033]
FEATURES = ['kern', 'liga', 'calt', 'ccmp', 'locl', 'mark', 'mkmk', 'case', 'tnum', 'lnum', 'pnum']

JOBS = [
    # (source, output, axis limits, family label)
    ('dmsans/DMSans[opsz,wght].ttf', 'dm-sans-latin-var.woff2', {'opsz': 14, 'wght': (400, 800)}, 'DM Sans'),
    ('bricolagegrotesque/BricolageGrotesque[opsz,wdth,wght].ttf', 'bricolage-grotesque-latin-var.woff2', {'opsz': 48, 'wdth': (75, 100), 'wght': (600, 800)}, 'Bricolage Grotesque'),
]

records = []
for src, out, axes, family in JOBS:
    font = TTFont(os.path.join(SRC, src))
    font = instancer.instantiateVariableFont(font, axes)
    opts = subset.Options()
    opts.layout_features = FEATURES
    opts.flavor = 'woff2'
    opts.name_IDs = ['*']
    opts.name_languages = ['*']
    opts.notdef_outline = True
    opts.hinting = False
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=UNICODES)
    sub.subset(font)
    font.flavor = 'woff2'
    path = os.path.join(OUT, out)
    font.save(path)
    data = open(path, 'rb').read()
    cmap = font.getBestCmap()
    missing = [hex(u) for u in UNICODES if u not in cmap and u != 0xA0]
    hhea, os2, head = font['hhea'], font['OS/2'], font['head']
    records.append({
        'family': family, 'file': f'src/assets/fonts/{out}', 'source': src, 'license': 'SIL OFL 1.1',
        'axes': {k: v for k, v in axes.items()}, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
        'glyphs': len(font.getGlyphOrder()), 'missingCodepoints': missing,
        'features': sorted({fr.FeatureTag for fr in font['GSUB'].table.FeatureList.FeatureRecord} | {fr.FeatureTag for fr in font['GPOS'].table.FeatureList.FeatureRecord}) if 'GSUB' in font and 'GPOS' in font else [],
        # Metrics for fallback @font-face overrides (prevent layout shift while the font loads).
        'unitsPerEm': head.unitsPerEm, 'ascent': hhea.ascent, 'descent': hhea.descent, 'lineGap': hhea.lineGap, 'xAvgCharWidth': os2.xAvgCharWidth,
    })
    print(f'{out}: {len(data)} B, {len(font.getGlyphOrder())} glyphs, missing {missing}')

for lic, name in [('dmsans/OFL.txt', 'DM-Sans-OFL.txt'), ('bricolagegrotesque/OFL.txt', 'Bricolage-Grotesque-OFL.txt')]:
    shutil.copy(os.path.join(SRC, lic), os.path.join(LIC, name))
    shutil.copy(os.path.join(SRC, lic), os.path.join(OUT, name))
json.dump({'generator': 'scripts/build-fonts.py', 'fonts': records}, open(os.path.join(OUT, 'fonts.json'), 'w'), indent=1)
open(os.path.join(OUT, 'fonts.json'), 'a').write('\n')

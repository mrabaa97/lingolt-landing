# =============================================================================
#  Screenshot encoder:  _src/img/*  ->  img/*.webp
#
#      python _src/images.py
#
#  Run it when a screenshot in _src/img/ changes. It is NOT part of
#  `node _src/build.mjs` on purpose — that one must run anywhere Node runs,
#  and this one needs Pillow. Screenshots change a few times a year; pages
#  change every week.
#
#  WHY. The eight phone screenshots were PNG at full resolution and weighed
#  2.8 MB together, on a page whose whole job is to be found and read by
#  people on phones — several of them arriving on mobile data, which is most
#  of this audience. At q85 the same eight come to about 320 KB with nothing
#  visible lost, because the strip displays them 230 CSS px wide.
#
#  WIDTH. 720, kept from the originals rather than reduced: 230 CSS px on a
#  3x phone screen is 690 device pixels, so 720 is already the right size and
#  anything smaller would soften the app's own UI text on good screens. Only
#  achievements.png was larger (921) and comes down to match.
#
#  QUALITY. 85. Measured against 72 and 88 on this exact set: 72 saves another
#  50 KB over the eight and starts to tell on the screenshots that are mostly
#  flat panels of text; 88 costs 55 KB and shows nothing 85 does not.
#
#  NO FALLBACK. Every browser has read WebP since 2020 (Safari 14), and the
#  app this page advertises requires iOS 16.4 — a visitor who cannot see a
#  WebP cannot run the thing being advertised. A <picture> with PNG beside it
#  would double the files to serve the empty set.
# =============================================================================

import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit('Pillow is missing:  python -m pip install Pillow')

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'img')
OUT = os.path.join(HERE, '..', 'img')

MAX_WIDTH = 720
QUALITY = 85

# Assets that are not screenshots and have their own ceiling. The logo is
# drawn at 96 CSS px at its largest (the hero mark), so 288 covers a 3x
# screen and the 538px original was carrying four times the pixels anyone
# sees. It keeps its transparency — it sits on white in the header and on
# dark green in the footer, so a baked-in background would show on one of
# them. img/favicon.svg is NOT a substitute: that one draws the whole app
# tile, cream rounded square and all, and this is the bubble alone.
SPECIAL = {'logo': 288}

# Left alone on purpose: og-image.png (some link scrapers still do not read
# WebP, and a preview that fails is worse than 59 KB), the favicons, and
# apple-touch-icon.png, which iOS wants as a plain square PNG.

total_before = total_after = 0
rows = []

for name in sorted(os.listdir(SRC)):
    stem, ext = os.path.splitext(name)
    if ext.lower() not in ('.png', '.jpg', '.jpeg'):
        continue
    src = os.path.join(SRC, name)
    im = Image.open(src)
    # Keep an alpha channel where there is one; flatten everything else, so a
    # screenshot does not carry a pointless fourth channel.
    im = im.convert('RGBA' if 'A' in im.getbands() else 'RGB')
    ceiling = SPECIAL.get(stem, MAX_WIDTH)
    w, h = im.size
    if w > ceiling:
        h = round(h * ceiling / w)
        w = ceiling
        im = im.resize((w, h), Image.LANCZOS)
    dest = os.path.join(OUT, stem + '.webp')
    # method=6 is the slowest, smallest setting. This runs a few times a year.
    im.save(dest, 'WEBP', quality=QUALITY, method=6)
    before, after = os.path.getsize(src), os.path.getsize(dest)
    total_before += before
    total_after += after
    rows.append((stem, before, after, w, h))

for stem, before, after, w, h in rows:
    print(f'{stem + ".webp":22} {before / 1024:7.0f}K -> {after / 1024:6.0f}K   '
          f'width="{w}" height="{h}"')

print(f'{"TOTAL":22} {total_before / 1024:7.0f}K -> {total_after / 1024:6.0f}K   '
      f'({100 - total_after * 100 // total_before}% smaller)')
print('\nThe width/height above belong in the <img> tags in _src/home.html —')
print('without them the strip has no height until it loads and the page jumps.')

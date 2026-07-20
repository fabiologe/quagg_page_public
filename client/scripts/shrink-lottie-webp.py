#!/usr/bin/env python3
"""Verkleinert die eingebetteten WebP-Frames in den rat_*.json-Lotties.

Die deklarierten Asset-Maße (w/h) bleiben unverändert — der Browser skaliert
die kleinere Bitmap aufs alte Layout, die Animation sieht bei 150px
Anzeigegröße identisch aus. Nur die Dekodier-Last und Dateigröße sinken.
"""
import base64
import io
import json
import sys
from pathlib import Path

from PIL import Image

TARGET_WIDTH = 400  # >= 2.5x der Anzeigegröße (150px) — verlustfrei unsichtbar
QUALITY = 85

tutorial_dir = Path('/home/fabio/quagg_page/client/public/saintv1d/tutorial')

for path in sorted(tutorial_dir.glob('rat_*.json')):
    data = json.loads(path.read_text())
    before = path.stat().st_size
    shrunk = 0
    for asset in data.get('assets', []):
        p = asset.get('p', '')
        if not isinstance(p, str) or not p.startswith('data:image/webp;base64,'):
            continue
        raw = base64.b64decode(p.split(',', 1)[1])
        img = Image.open(io.BytesIO(raw))
        if img.width <= TARGET_WIDTH:
            continue
        ratio = TARGET_WIDTH / img.width
        small = img.convert('RGBA').resize(
            (TARGET_WIDTH, max(1, round(img.height * ratio))), Image.LANCZOS
        )
        buf = io.BytesIO()
        small.save(buf, format='WEBP', quality=QUALITY, method=6)
        # w/h des Assets absichtlich NICHT anfassen — Layout bleibt identisch.
        asset['p'] = 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode()
        shrunk += 1

    if shrunk:
        path.write_text(json.dumps(data, separators=(',', ':')))
    after = path.stat().st_size
    print(f'{path.name}: {before//1024} KB -> {after//1024} KB ({shrunk} Frames verkleinert)')

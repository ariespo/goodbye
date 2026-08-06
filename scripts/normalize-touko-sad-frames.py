from pathlib import Path
from PIL import Image

SRC_DIR = Path('G:/灯织难过/matted_frames')
OUT_DIR = Path('public/assets/characters/animated/touko/talk-sad')
CANVAS_W, CANVAS_H = 430, 606

OUT_DIR.mkdir(parents=True, exist_ok=True)

files = sorted(SRC_DIR.glob('matte_*.png'))
if len(files) != 12:
    raise SystemExit(f'Expected 12 frames, found {len(files)}')

for idx, src in enumerate(files):
    img = Image.open(src).convert('RGBA')
    # Height-fit while preserving aspect ratio.
    ratio = CANVAS_H / img.height
    new_w = int(round(img.width * ratio))
    resized = img.resize((new_w, CANVAS_H), Image.Resampling.LANCZOS)

    canvas = Image.new('RGBA', (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
    x = (CANVAS_W - new_w) // 2
    canvas.paste(resized, (x, 0), resized)

    out = OUT_DIR / f'{idx:02d}.png'
    canvas.save(out)
    print(f'Wrote {out}')

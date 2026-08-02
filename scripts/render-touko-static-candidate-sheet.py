"""Render a compact review sheet for Touko's normalized static portraits."""

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = ROOT / "public" / "assets" / "characters" / "candidates" / "touko-static-v4" / "normalized"
OUTPUT_PATH = ROOT / "tmp" / "touko-static-v4-contact-sheet.png"
EMOTIONS = ("calm", "happy", "sad", "angry", "horror", "insane")
CELL = (296, 640)
PADDING = 18
LABEL_HEIGHT = 28


def main() -> None:
    sheet = Image.new("RGBA", (CELL[0] * 3 + PADDING * 4, CELL[1] * 2 + PADDING * 3), "#34383d")
    draw = ImageDraw.Draw(sheet)
    for index, emotion in enumerate(EMOTIONS):
        with Image.open(SOURCE_ROOT / f"touko-{emotion}.png") as source:
            portrait = source.convert("RGBA").resize((CELL[0], CELL[1] - LABEL_HEIGHT), Image.Resampling.NEAREST)
        column = index % 3
        row = index // 3
        left = PADDING + column * (CELL[0] + PADDING)
        top = PADDING + row * (CELL[1] + PADDING)
        sheet.alpha_composite(portrait, (left, top))
        draw.text((left + 8, top + CELL[1] - LABEL_HEIGHT + 7), emotion.upper(), fill="#f0f0ec")
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert("RGB").save(OUTPUT_PATH)


if __name__ == "__main__":
    main()

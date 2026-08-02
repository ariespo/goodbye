"""Render a review sheet for Lin Jing's normalized static candidates."""

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = ROOT / "public" / "assets" / "characters" / "candidates" / "lin-jing-static-v2" / "normalized"
OUTPUT_PATH = ROOT / "tmp" / "lin-jing-static-v2-contact-sheet.png"
EMOTIONS = ("calm", "angry")
CELL = (296, 640)
PADDING = 18
LABEL_HEIGHT = 28


def main() -> None:
    sheet = Image.new("RGBA", (CELL[0] * 2 + PADDING * 3, CELL[1] + PADDING * 2), "#34383d")
    draw = ImageDraw.Draw(sheet)
    for index, emotion in enumerate(EMOTIONS):
        with Image.open(SOURCE_ROOT / f"lin-jing-{emotion}.png") as source:
            portrait = source.convert("RGBA").resize((CELL[0], CELL[1] - LABEL_HEIGHT), Image.Resampling.NEAREST)
        left = PADDING + index * (CELL[0] + PADDING)
        top = PADDING
        sheet.alpha_composite(portrait, (left, top))
        draw.text((left + 8, top + CELL[1] - LABEL_HEIGHT + 7), emotion.upper(), fill="#f0f0ec")
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert("RGB").save(OUTPUT_PATH)


if __name__ == "__main__":
    main()

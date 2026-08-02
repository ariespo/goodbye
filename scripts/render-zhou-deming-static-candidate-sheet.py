"""Render a review sheet for Zhou Deming's normalized static candidates."""

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = ROOT / "public" / "assets" / "characters" / "candidates" / "zhou-deming-static-v1" / "normalized"
OUTPUT_PATH = ROOT / "tmp" / "zhou-deming-static-v1-contact-sheet.png"
EMOTIONS = ("normal", "happy", "sad", "angry")
CELL = (296, 640)
PADDING = 18
LABEL_HEIGHT = 28


def main() -> None:
    columns = 2
    rows = (len(EMOTIONS) + columns - 1) // columns
    sheet = Image.new(
        "RGBA",
        (CELL[0] * columns + PADDING * (columns + 1), CELL[1] * rows + PADDING * (rows + 1)),
        "#34383d",
    )
    draw = ImageDraw.Draw(sheet)
    for index, emotion in enumerate(EMOTIONS):
        with Image.open(SOURCE_ROOT / f"zhou-deming-{emotion}.png") as source:
            portrait = source.convert("RGBA").resize((CELL[0], CELL[1] - LABEL_HEIGHT), Image.Resampling.NEAREST)
        column = index % columns
        row = index // columns
        left = PADDING + column * (CELL[0] + PADDING)
        top = PADDING + row * (CELL[1] + PADDING)
        sheet.alpha_composite(portrait, (left, top))
        draw.text((left + 8, top + CELL[1] - LABEL_HEIGHT + 7), emotion.upper(), fill="#f0f0ec")
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert("RGB").save(OUTPUT_PATH)


if __name__ == "__main__":
    main()

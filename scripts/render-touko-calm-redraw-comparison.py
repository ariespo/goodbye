"""Render the current and revised Touko calm portraits for review."""

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
CURRENT_PATH = ROOT / "public" / "assets" / "characters" / "touko-normal.png"
CANDIDATE_PATH = ROOT / "public" / "assets" / "characters" / "candidates" / "touko-calm-redraw-v1" / "normalized" / "touko-calm.png"
OUTPUT_PATH = ROOT / "tmp" / "touko-calm-redraw-v1-comparison.png"
CELL = (296, 640)
PADDING = 18
LABEL_HEIGHT = 28


def main() -> None:
    sheet = Image.new("RGBA", (CELL[0] * 2 + PADDING * 3, CELL[1] + PADDING * 2), "#34383d")
    draw = ImageDraw.Draw(sheet)
    for index, (label, path) in enumerate((("CURRENT", CURRENT_PATH), ("CANDIDATE", CANDIDATE_PATH))):
        with Image.open(path) as source:
            portrait = source.convert("RGBA").resize((CELL[0], CELL[1] - LABEL_HEIGHT), Image.Resampling.NEAREST)
        left = PADDING + index * (CELL[0] + PADDING)
        top = PADDING
        sheet.alpha_composite(portrait, (left, top))
        draw.text((left + 8, top + CELL[1] - LABEL_HEIGHT + 7), label, fill="#f0f0ec")
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert("RGB").save(OUTPUT_PATH)


if __name__ == "__main__":
    main()

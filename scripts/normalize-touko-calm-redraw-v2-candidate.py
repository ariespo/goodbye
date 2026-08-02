"""Normalize Touko's v2 calm redraw to the shared monochrome canvas."""

from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = ROOT / "public" / "assets" / "characters" / "candidates" / "touko-calm-redraw-v2"
OUTPUT_PATH = ASSET_ROOT / "normalized" / "touko-calm.png"
TARGET_SIZE = (592, 1280)


def main() -> None:
    with Image.open(ASSET_ROOT / "touko-calm.png") as source:
        rgba = source.convert("RGBA")
    grayscale = ImageOps.grayscale(rgba.convert("RGB"))
    normalized = Image.merge("RGBA", (grayscale, grayscale, grayscale, rgba.getchannel("A"))).resize(
        TARGET_SIZE,
        Image.Resampling.NEAREST,
    )
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    normalized.save(OUTPUT_PATH)
    print(f"alpha_bbox={normalized.getchannel('A').getbbox()}")


if __name__ == "__main__":
    main()

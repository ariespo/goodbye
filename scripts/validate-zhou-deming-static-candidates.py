"""Validate Zhou Deming candidate canvases and chroma-key removal."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = ROOT / "public" / "assets" / "characters" / "candidates" / "zhou-deming-static-v1" / "normalized"
EMOTIONS = ("normal", "happy", "sad", "angry")
TARGET_SIZE = (592, 1280)


def main() -> None:
    for emotion in EMOTIONS:
        path = ASSET_ROOT / f"zhou-deming-{emotion}.png"
        with Image.open(path) as image:
            if image.mode != "RGBA" or image.size != TARGET_SIZE:
                raise ValueError(f"{path.name}: expected RGBA {TARGET_SIZE}, got {image.mode} {image.size}")
            alpha = image.getchannel("A")
            bbox = alpha.getbbox()
            corners = [alpha.getpixel(point) for point in ((0, 0), (591, 0), (0, 1279), (591, 1279))]
            if bbox is None or any(corner != 0 for corner in corners):
                raise ValueError(f"{path.name}: invalid alpha matte")
            print(f"{emotion}: alpha_bbox={bbox}")


if __name__ == "__main__":
    main()

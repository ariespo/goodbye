"""Validate Lin Jing v2 candidate canvases and monochrome output."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = ROOT / "public" / "assets" / "characters" / "candidates" / "lin-jing-static-v2" / "normalized"
EMOTIONS = ("calm", "angry")
TARGET_SIZE = (592, 1280)


def main() -> None:
    for emotion in EMOTIONS:
        path = ASSET_ROOT / f"lin-jing-{emotion}.png"
        with Image.open(path) as image:
            if image.mode != "RGBA" or image.size != TARGET_SIZE:
                raise ValueError(f"{path.name}: expected RGBA {TARGET_SIZE}, got {image.mode} {image.size}")
            alpha = image.getchannel("A")
            bbox = alpha.getbbox()
            corners = [alpha.getpixel(point) for point in ((0, 0), (591, 0), (0, 1279), (591, 1279))]
            non_gray_pixels = sum(
                1
                for red, green, blue, opacity in image.get_flattened_data()
                if opacity != 0 and (red != green or green != blue)
            )
            if bbox is None or any(corner != 0 for corner in corners) or non_gray_pixels:
                raise ValueError(f"{path.name}: invalid alpha matte or non-monochrome pixels")
            print(f"{emotion}: alpha_bbox={bbox}")


if __name__ == "__main__":
    main()

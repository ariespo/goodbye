"""Report canvas and alpha coverage for Touko's static-portrait candidates."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = ROOT / "public" / "assets" / "characters" / "candidates" / "touko-static-v4" / "normalized"
EMOTIONS = ("calm", "happy", "sad", "angry", "horror", "insane")


def main() -> None:
    expected_size: tuple[int, int] | None = None
    for emotion in EMOTIONS:
        path = ASSET_ROOT / f"touko-{emotion}.png"
        with Image.open(path) as image:
            if image.mode != "RGBA":
                raise ValueError(f"{path.name}: expected RGBA, got {image.mode}")
            if expected_size is None:
                expected_size = image.size
            elif image.size != expected_size:
                raise ValueError(f"{path.name}: expected canvas {expected_size}, got {image.size}")
            alpha = image.getchannel("A")
            bbox = alpha.getbbox()
            corners = [alpha.getpixel(point) for point in ((0, 0), (image.width - 1, 0), (0, image.height - 1), (image.width - 1, image.height - 1))]
            if bbox is None:
                raise ValueError(f"{path.name}: empty image")
            if any(corner != 0 for corner in corners):
                raise ValueError(f"{path.name}: opaque chroma-key corner remains")
            print(f"{emotion}: size={image.size} alpha_bbox={bbox}")


if __name__ == "__main__":
    main()

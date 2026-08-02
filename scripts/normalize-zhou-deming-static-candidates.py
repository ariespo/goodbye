"""Normalize Zhou Deming's static candidates to the shared large-half-body canvas."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = ROOT / "public" / "assets" / "characters" / "candidates" / "zhou-deming-static-v1"
OUTPUT_ROOT = ASSET_ROOT / "normalized"
EMOTIONS = ("normal", "happy", "sad", "angry")
TARGET_SIZE = (592, 1280)


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("Image has no visible pixels")
    return bbox


def scaled(image: Image.Image) -> Image.Image:
    return image.convert("RGBA").resize(TARGET_SIZE, Image.Resampling.NEAREST)


def main() -> None:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)

    with Image.open(ASSET_ROOT / "zhou-deming-normal.png") as source:
        normal = scaled(source)
    normal_bbox = alpha_bbox(normal)
    normal_center_x = round((normal_bbox[0] + normal_bbox[2]) / 2)
    normal.save(OUTPUT_ROOT / "zhou-deming-normal.png")
    print(f"normal: final_bbox={normal_bbox}")

    for emotion in EMOTIONS[1:]:
        with Image.open(ASSET_ROOT / f"zhou-deming-{emotion}.png") as source:
            portrait = scaled(source)
        bbox = alpha_bbox(portrait)
        center_x = round((bbox[0] + bbox[2]) / 2)
        offset = (normal_center_x - center_x, normal_bbox[1] - bbox[1])
        normalized = Image.new("RGBA", TARGET_SIZE, (0, 0, 0, 0))
        normalized.alpha_composite(portrait, offset)
        normalized.save(OUTPUT_ROOT / f"zhou-deming-{emotion}.png")
        print(f"{emotion}: scaled_bbox={bbox}, offset={offset}, final_bbox={alpha_bbox(normalized)}")


if __name__ == "__main__":
    main()

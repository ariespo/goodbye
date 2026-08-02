"""Normalize Zhao Gang's static candidates to the shared large-half-body canvas."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = ROOT / "public" / "assets" / "characters" / "candidates" / "zhao-gang-static-v1"
OUTPUT_ROOT = ASSET_ROOT / "normalized"
EMOTIONS = ("calm", "sad")
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

    with Image.open(ASSET_ROOT / "zhao-gang-calm.png") as source:
        calm = scaled(source)
    calm_bbox = alpha_bbox(calm)
    calm_center_x = round((calm_bbox[0] + calm_bbox[2]) / 2)
    calm.save(OUTPUT_ROOT / "zhao-gang-calm.png")
    print(f"calm: final_bbox={calm_bbox}")

    with Image.open(ASSET_ROOT / "zhao-gang-sad.png") as source:
        sad = scaled(source)
    sad_bbox = alpha_bbox(sad)
    sad_center_x = round((sad_bbox[0] + sad_bbox[2]) / 2)
    offset = (calm_center_x - sad_center_x, calm_bbox[1] - sad_bbox[1])
    normalized = Image.new("RGBA", TARGET_SIZE, (0, 0, 0, 0))
    normalized.alpha_composite(sad, offset)
    normalized.save(OUTPUT_ROOT / "zhao-gang-sad.png")
    print(f"sad: scaled_bbox={sad_bbox}, offset={offset}, final_bbox={alpha_bbox(normalized)}")


if __name__ == "__main__":
    main()

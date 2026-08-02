"""Normalize Touko emotion candidates to the approved matte_00001 canvas and anchors."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = ROOT / "public" / "assets" / "characters" / "candidates" / "touko-static-v4"
OUTPUT_ROOT = ASSET_ROOT / "normalized"
EMOTIONS = ("happy", "sad", "angry", "horror", "insane")


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("Image has no visible pixels")
    return bbox


def main() -> None:
    with Image.open(ASSET_ROOT / "touko-calm.png") as calm_source:
        calm = calm_source.convert("RGBA")
    target_size = calm.size
    target_bbox = alpha_bbox(calm)
    target_center_x = round((target_bbox[0] + target_bbox[2]) / 2)

    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    calm.save(OUTPUT_ROOT / "touko-calm.png")

    for emotion in EMOTIONS:
        with Image.open(ASSET_ROOT / f"touko-{emotion}.png") as source:
            # Preserve hard pixel blocks; this is canvas normalization only.
            scaled = source.convert("RGBA").resize(target_size, Image.Resampling.NEAREST)
        bbox = alpha_bbox(scaled)
        center_x = round((bbox[0] + bbox[2]) / 2)
        offset = (target_center_x - center_x, target_bbox[1] - bbox[1])
        normalized = Image.new("RGBA", target_size, (0, 0, 0, 0))
        normalized.alpha_composite(scaled, offset)
        normalized.save(OUTPUT_ROOT / f"touko-{emotion}.png")
        print(f"{emotion}: scaled_bbox={bbox}, offset={offset}, final_bbox={alpha_bbox(normalized)}")


if __name__ == "__main__":
    main()

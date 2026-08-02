"""Normalize Lin Jing's monochrome static candidates to the shared canvas."""

from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = ROOT / "public" / "assets" / "characters" / "candidates" / "lin-jing-static-v2"
OUTPUT_ROOT = ASSET_ROOT / "normalized"
TARGET_SIZE = (592, 1280)


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("Image has no visible pixels")
    return bbox


def monochrome_scaled(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    grayscale = ImageOps.grayscale(rgba.convert("RGB"))
    rgba_grayscale = Image.merge("RGBA", (grayscale, grayscale, grayscale, rgba.getchannel("A")))
    return rgba_grayscale.resize(TARGET_SIZE, Image.Resampling.NEAREST)


def main() -> None:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    with Image.open(ASSET_ROOT / "lin-jing-calm.png") as source:
        calm = monochrome_scaled(source)
    calm_bbox = alpha_bbox(calm)
    calm_center_x = round((calm_bbox[0] + calm_bbox[2]) / 2)
    calm.save(OUTPUT_ROOT / "lin-jing-calm.png")
    print(f"calm: final_bbox={calm_bbox}")

    with Image.open(ASSET_ROOT / "lin-jing-angry.png") as source:
        angry = monochrome_scaled(source)
    angry_bbox = alpha_bbox(angry)
    angry_center_x = round((angry_bbox[0] + angry_bbox[2]) / 2)
    offset = (calm_center_x - angry_center_x, calm_bbox[1] - angry_bbox[1])
    normalized = Image.new("RGBA", TARGET_SIZE, (0, 0, 0, 0))
    normalized.alpha_composite(angry, offset)
    normalized.save(OUTPUT_ROOT / "lin-jing-angry.png")
    print(f"angry: scaled_bbox={angry_bbox}, offset={offset}, final_bbox={alpha_bbox(normalized)}")


if __name__ == "__main__":
    main()

"""Clean and install Zhou Deming's supplied happy blink frames."""

from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(r"C:\Users\a\Downloads\开心眨眼\matted_frames")
OUTPUT = ROOT / "public/assets/characters/animated/old-man/tail-blink-happy-cleaned"
EXPECTED_FRAMES = 8
SOURCE_SIZE = (720, 1280)
CANVAS_SIZE = (430, 606)


def is_crotch_matte(pixel: tuple[int, int, int, int]) -> bool:
    red, green, blue, alpha = pixel
    return (
        alpha > 0
        and min(red, green, blue) >= 60
        and max(red, green, blue) - min(red, green, blue) <= 45
    )


def remove_bottom_white_wedge(frame: Image.Image) -> tuple[Image.Image, int]:
    cleaned = frame.convert("RGBA")
    pixels = cleaned.load()
    width, height = cleaned.size
    min_x, max_x = round(width * 0.42), round(width * 0.58)
    min_y = round(height * 0.86)
    seeds = [
        (x, height - 1)
        for x in range(min_x, max_x + 1)
        if is_crotch_matte(pixels[x, height - 1])
    ]
    if not seeds:
        raise ValueError("No bottom-connected white wedge found in frame")

    matte = set(seeds)
    queue = deque(seeds)
    while queue:
        x, y = queue.popleft()
        for next_x, next_y in (
            (x - 1, y),
            (x + 1, y),
            (x, y - 1),
            (x, y + 1),
        ):
            point = (next_x, next_y)
            if not (min_x <= next_x <= max_x and min_y <= next_y < height):
                continue
            if point in matte or not is_crotch_matte(pixels[next_x, next_y]):
                continue
            matte.add(point)
            queue.append(point)

    for x, y in matte:
        red, green, blue, _alpha = pixels[x, y]
        pixels[x, y] = (red, green, blue, 0)
    return cleaned, len(matte)


def normalize_to_canvas(frame: Image.Image) -> Image.Image:
    source_width, source_height = frame.size
    canvas_width, canvas_height = CANVAS_SIZE
    scale = min(canvas_width / source_width, canvas_height / source_height)
    target_size = (round(source_width * scale), round(source_height * scale))
    resized = frame.convert("RGBa").resize(
        target_size,
        Image.Resampling.LANCZOS,
    ).convert("RGBA")
    canvas = Image.new("RGBA", CANVAS_SIZE, (0, 0, 0, 0))
    offset = ((canvas_width - target_size[0]) // 2, canvas_height - target_size[1])
    canvas.alpha_composite(resized, offset)
    return canvas


def main() -> None:
    sources = sorted(SOURCE.glob("*.png"))
    if len(sources) != EXPECTED_FRAMES:
        raise ValueError(f"Expected {EXPECTED_FRAMES} frames, got {len(sources)}")

    OUTPUT.mkdir(parents=True, exist_ok=True)
    for index, source in enumerate(sources):
        with Image.open(source) as source_image:
            frame = source_image.convert("RGBA")
        if frame.size != SOURCE_SIZE:
            raise ValueError(f"{source.name}: expected {SOURCE_SIZE}, got {frame.size}")
        cleaned, removed_pixels = remove_bottom_white_wedge(frame)
        normalized = normalize_to_canvas(cleaned)
        destination = OUTPUT / f"{index:02d}.png"
        normalized.save(destination, optimize=True)
        print(f"{destination.name}: removed {removed_pixels} matte pixels")


if __name__ == "__main__":
    main()

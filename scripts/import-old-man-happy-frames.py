"""Clean and install Zhou Deming's supplied happy animation sheet."""

from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(r"C:\Users\a\Downloads\sprite_sheet (2).png")
OUTPUT = ROOT / "public/assets/characters/animated/old-man/talk-happy-cleaned"
GRID = (4, 4)
FRAME_SIZE = (720, 1280)
EXPECTED_FRAMES = 14
CANVAS_SIZE = (430, 606)


def is_bottom_matte(pixel: tuple[int, int, int, int]) -> bool:
    red, green, blue, alpha = pixel
    return (
        alpha > 0
        and min(red, green, blue) >= 60
        and max(red, green, blue) - min(red, green, blue) <= 45
    )


def is_disconnected_pale_residue(pixel: tuple[int, int, int, int]) -> bool:
    red, green, blue, alpha = pixel
    return (
        alpha > 0
        and min(red, green, blue) >= 130
        and max(red, green, blue) - min(red, green, blue) <= 45
    )


def remove_bottom_white_residue(frame: Image.Image) -> tuple[Image.Image, int]:
    cleaned = frame.convert("RGBA")
    pixels = cleaned.load()
    width, height = cleaned.size
    min_x, max_x = round(width * 0.42), round(width * 0.58)
    min_y = round(height * 0.86)
    seeds = [
        (x, height - 1)
        for x in range(min_x, max_x + 1)
        if is_bottom_matte(pixels[x, height - 1])
    ]

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
            if point in matte or not is_bottom_matte(pixels[next_x, next_y]):
                continue
            matte.add(point)
            queue.append(point)

    # A few antialiased white flecks are separated from the bottom-connected
    # component by already-transparent pixels. They occur only inside the
    # confirmed narrow gap between the trouser legs.
    residue_min_x, residue_max_x = round(width * 0.48), round(width * 0.54)
    residue_min_y = round(height * 0.93)
    for y in range(residue_min_y, height):
        for x in range(residue_min_x, residue_max_x + 1):
            if is_disconnected_pale_residue(pixels[x, y]):
                matte.add((x, y))

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
    if not SOURCE.is_file():
        raise FileNotFoundError(SOURCE)

    with Image.open(SOURCE) as source_image:
        sheet = source_image.convert("RGBA")
    expected_size = (FRAME_SIZE[0] * GRID[0], FRAME_SIZE[1] * GRID[1])
    if sheet.size != expected_size:
        raise ValueError(f"Expected sheet size {expected_size}, got {sheet.size}")

    frames: list[Image.Image] = []
    for index in range(GRID[0] * GRID[1]):
        column = index % GRID[0]
        row = index // GRID[0]
        left = column * FRAME_SIZE[0]
        top = row * FRAME_SIZE[1]
        frame = sheet.crop((left, top, left + FRAME_SIZE[0], top + FRAME_SIZE[1]))
        if frame.getchannel("A").getbbox() is not None:
            frames.append(frame)
    if len(frames) != EXPECTED_FRAMES:
        raise ValueError(f"Expected {EXPECTED_FRAMES} visible frames, got {len(frames)}")

    OUTPUT.mkdir(parents=True, exist_ok=True)
    for index, frame in enumerate(frames):
        cleaned, removed_pixels = remove_bottom_white_residue(frame)
        normalized = normalize_to_canvas(cleaned)
        destination = OUTPUT / f"{index:02d}.png"
        normalized.save(destination, optimize=True)
        print(f"{destination.name}: removed {removed_pixels} bottom-matte pixels")


if __name__ == "__main__":
    main()

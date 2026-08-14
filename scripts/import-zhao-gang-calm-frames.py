"""Clean and install Zhao Gang's supplied calm/profile/blink sheet."""

from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(r"C:\Users\a\AppData\Local\Temp\codex-clipboard-2e66218f-79ee-4793-b774-7855cfd2b106.png")
OUTPUT = ROOT / "public/assets/characters/animated/detective-a/talk-calm-cleaned"
STATIC_OUTPUT = ROOT / "public/assets/characters/detective-a-normal-v8.png"
GRID = (4, 3)
FRAME_SIZE = (800, 1136)
CANVAS_SIZE = (430, 606)
EXPECTED_FRAMES = 9


def is_white_core(pixel: tuple[int, int, int, int]) -> bool:
    red, green, blue, alpha = pixel
    return alpha > 128 and min(red, green, blue) >= 235 and max(red, green, blue) - min(red, green, blue) <= 15


def is_white_matte(pixel: tuple[int, int, int, int]) -> bool:
    red, green, blue, alpha = pixel
    return alpha > 0 and min(red, green, blue) >= 175 and max(red, green, blue) - min(red, green, blue) <= 20


def remove_arm_body_gap(frame: Image.Image) -> tuple[Image.Image, int]:
    """Remove only the tiny matte trapped by Zhao Gang's pocket-side arm."""
    cleaned = frame.convert("RGBA")
    pixels = cleaned.load()
    width, height = cleaned.size
    search_box = (
        round(width * 0.65),
        round(height * 0.55),
        round(width * 0.75),
        round(height * 0.68),
    )
    seen: set[tuple[int, int]] = set()
    targets: list[tuple[list[tuple[int, int]], tuple[int, int, int, int]]] = []

    for y in range(search_box[1], search_box[3] + 1):
        for x in range(search_box[0], search_box[2] + 1):
            point = (x, y)
            if point in seen or not is_white_core(pixels[x, y]):
                continue
            component: list[tuple[int, int]] = []
            queue = deque([point])
            seen.add(point)
            while queue:
                current_x, current_y = queue.popleft()
                component.append((current_x, current_y))
                for next_x, next_y in (
                    (current_x - 1, current_y),
                    (current_x + 1, current_y),
                    (current_x, current_y - 1),
                    (current_x, current_y + 1),
                ):
                    next_point = (next_x, next_y)
                    if not (search_box[0] <= next_x <= search_box[2] and search_box[1] <= next_y <= search_box[3]):
                        continue
                    if next_point in seen or not is_white_core(pixels[next_x, next_y]):
                        continue
                    seen.add(next_point)
                    queue.append(next_point)

            xs = [item[0] for item in component]
            ys = [item[1] for item in component]
            bbox = (min(xs), min(ys), max(xs), max(ys))
            # The unwanted component is tiny. Reject the much larger forearm
            # even if future source variants shift a few pixels.
            if 8 <= len(component) <= 250 and bbox[0] >= width * 0.67 and bbox[2] <= width * 0.73:
                targets.append((component, bbox))

    if len(targets) != 1:
        raise ValueError(f"Expected one trapped arm/body matte component, found {len(targets)}")

    matte: set[tuple[int, int]] = set()
    for component, (min_x, min_y, max_x, max_y) in targets:
        local_matte = set(component)
        queue = deque(component)
        while queue:
            x, y = queue.popleft()
            for next_x, next_y in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                point = (next_x, next_y)
                if not (max(0, min_x - 3) <= next_x <= min(width - 1, max_x + 3)):
                    continue
                if not (max(0, min_y - 3) <= next_y <= min(height - 1, max_y + 3)):
                    continue
                if point in local_matte or not is_white_matte(pixels[next_x, next_y]):
                    continue
                local_matte.add(point)
                queue.append(point)
        matte.update(local_matte)

    for x, y in matte:
        red, green, blue, _alpha = pixels[x, y]
        pixels[x, y] = (red, green, blue, 0)
    return cleaned, len(matte)


def normalize_to_canvas(frame: Image.Image) -> Image.Image:
    source_width, source_height = frame.size
    canvas_width, canvas_height = CANVAS_SIZE
    scale = min(canvas_width / source_width, canvas_height / source_height)
    target_size = (round(source_width * scale), round(source_height * scale))
    resized = frame.convert("RGBa").resize(target_size, Image.Resampling.LANCZOS).convert("RGBA")
    canvas = Image.new("RGBA", CANVAS_SIZE, (0, 0, 0, 0))
    canvas.alpha_composite(
        resized,
        ((canvas_width - target_size[0]) // 2, canvas_height - target_size[1]),
    )
    return canvas


def main() -> None:
    with Image.open(SOURCE) as source_image:
        sheet = source_image.convert("RGBA")
    expected_size = (FRAME_SIZE[0] * GRID[0], FRAME_SIZE[1] * GRID[1])
    if sheet.size != expected_size:
        raise ValueError(f"Expected sheet size {expected_size}, got {sheet.size}")

    OUTPUT.mkdir(parents=True, exist_ok=True)
    frames: list[Image.Image] = []
    for index in range(GRID[0] * GRID[1]):
        column = index % GRID[0]
        row = index // GRID[0]
        frame = sheet.crop(
            (
                column * FRAME_SIZE[0],
                row * FRAME_SIZE[1],
                (column + 1) * FRAME_SIZE[0],
                (row + 1) * FRAME_SIZE[1],
            )
        )
        if frame.getchannel("A").getbbox() is None:
            continue
        cleaned, removed = remove_arm_body_gap(frame)
        normalized = normalize_to_canvas(cleaned)
        frames.append(normalized)
        normalized.save(OUTPUT / f"{len(frames) - 1:02d}.png", optimize=True)
        print(f"{len(frames) - 1:02d}.png: removed {removed} trapped pixels")

    if len(frames) != EXPECTED_FRAMES:
        raise ValueError(f"Expected {EXPECTED_FRAMES} visible frames, got {len(frames)}")
    frames[0].save(STATIC_OUTPUT, optimize=True)


if __name__ == "__main__":
    main()

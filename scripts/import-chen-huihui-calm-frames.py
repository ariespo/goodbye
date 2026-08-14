"""Clean and install Chen Huihui's supplied calm/default animation sheet."""

from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(
    r"C:\Users\a\AppData\Local\Temp\codex-clipboard-e9e118cb-058b-48d8-9ab8-bf3d9b05d7e8.png"
)
OUTPUT = ROOT / "public/assets/characters/animated/chen-huihui/talk-calm-cleaned"
GRID = (5, 5)
FRAME_SIZE = (720, 1264)
CANVAS_SIZE = (430, 606)
EXPECTED_FRAMES = 25


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


def is_white_core(pixel: tuple[int, int, int, int]) -> bool:
    red, green, blue, alpha = pixel
    return alpha > 128 and min(red, green, blue) >= 235 and max(red, green, blue) - min(red, green, blue) <= 12


def is_white_matte(pixel: tuple[int, int, int, int]) -> bool:
    red, green, blue, alpha = pixel
    return alpha > 0 and min(red, green, blue) >= 175 and max(red, green, blue) - min(red, green, blue) <= 18


def remove_trapped_hair_background(frame: Image.Image) -> tuple[Image.Image, int]:
    """Remove pale background enclosed beside Huihui's loose hair strands."""

    cleaned = frame.convert("RGBA")
    pixels = cleaned.load()
    width, height = cleaned.size
    seen: set[tuple[int, int]] = set()
    targets: list[tuple[list[tuple[int, int]], tuple[int, int, int, int]]] = []

    for y in range(height):
        for x in range(width):
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
                    if not (0 <= next_x < width and 0 <= next_y < height):
                        continue
                    if next_point in seen or not is_white_core(pixels[next_x, next_y]):
                        continue
                    seen.add(next_point)
                    queue.append(next_point)

            xs = [item[0] for item in component]
            ys = [item[1] for item in component]
            min_x, max_x = min(xs), max(xs)
            min_y, max_y = min(ys), max(ys)
            left_of_head = (
                min_x >= width * 0.28
                and max_x <= width * 0.38
                and min_y < height * 0.30
            )
            right_of_head = (
                min_x >= width * 0.66
                and max_x <= width * 0.75
                and min_y < height * 0.34
            )
            left_hair_cavity = (
                width * 0.37 <= min_x <= width * 0.41
                and max_x <= width * 0.46
                and min_y < height * 0.27
                and max_y <= height * 0.31
            )
            right_hair_cavity = (
                min_x >= width * 0.68
                and max_x <= width * 0.74
                and max_y <= height * 0.30
            )
            if left_of_head or right_of_head or left_hair_cavity or right_hair_cavity:
                targets.append((component, (min_x, min_y, max_x, max_y)))

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


def remove_bottom_white_residue(frame: Image.Image) -> tuple[Image.Image, int]:
    """Remove only the pale, bottom-connected strip between the trouser legs."""

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
    if not seeds:
        raise ValueError("No bottom-connected white residue found in frame")

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

    # Antialiased pale flecks can be separated from the bottom-connected
    # component by transparent pixels. Limit this cleanup to the confirmed
    # narrow gap between the trouser legs.
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

    # Premultiplied resizing prevents hidden RGB from producing a pale fringe.
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

    OUTPUT.mkdir(parents=True, exist_ok=True)
    frames_written = 0
    for index in range(GRID[0] * GRID[1]):
        column = index % GRID[0]
        row = index // GRID[0]
        left = column * FRAME_SIZE[0]
        top = row * FRAME_SIZE[1]
        frame = sheet.crop((left, top, left + FRAME_SIZE[0], top + FRAME_SIZE[1]))
        if frame.getchannel("A").getbbox() is None:
            continue
        cleaned, removed_hair_pixels = remove_trapped_hair_background(frame)
        cleaned, removed_bottom_pixels = remove_bottom_white_residue(cleaned)
        normalized = normalize_to_canvas(cleaned)
        destination = OUTPUT / f"{frames_written:02d}.png"
        normalized.save(destination, optimize=True)
        print(
            f"{destination.name}: removed {removed_hair_pixels} hair-matte pixels; "
            f"{removed_bottom_pixels} bottom-matte pixels"
        )
        frames_written += 1

    if frames_written != EXPECTED_FRAMES:
        raise ValueError(f"Expected {EXPECTED_FRAMES} visible frames, got {frames_written}")


if __name__ == "__main__":
    main()

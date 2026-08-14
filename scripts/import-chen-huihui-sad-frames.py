"""Clean and install Chen Huihui's supplied sad talk/blink sheet.

The sad sheet uses the same character, grid, matte defects, and target canvas as
the already verified angry sheet, so reuse that deterministic cleanup pipeline
instead of sending the art through a generative image edit.
"""

from __future__ import annotations

import importlib.util
from collections import deque
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
HELPER = Path(__file__).with_name("import-chen-huihui-angry-frames.py")


def remove_sad_side_hair_matte(frame: Image.Image) -> tuple[Image.Image, int]:
    """Remove the white matte trapped around Huihui's ears and loose hair."""
    cleaned = frame.convert("RGBA")
    pixels = cleaned.load()
    width, height = cleaned.size
    seen: set[tuple[int, int]] = set()
    matte: set[tuple[int, int]] = set()

    def is_white_core(pixel: tuple[int, int, int, int]) -> bool:
        red, green, blue, alpha = pixel
        return alpha > 128 and min(red, green, blue) >= 235 and max(red, green, blue) - min(red, green, blue) <= 12

    def is_white_matte(pixel: tuple[int, int, int, int]) -> bool:
        red, green, blue, alpha = pixel
        return alpha > 0 and min(red, green, blue) >= 175 and max(red, green, blue) - min(red, green, blue) <= 18

    for y in range(round(height * 0.14), round(height * 0.36)):
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
            is_side_background = (
                (max_x <= width * 0.42 and min_y < height * 0.30 and max_y <= height * 0.31)
                or (min_x >= width * 0.58 and min_y < height * 0.31 and max_y <= height * 0.31)
                or (
                    width * 0.38 <= min_x
                    and max_x <= width * 0.47
                    and height * 0.23 <= min_y
                    and max_y <= height * 0.355
                )
            )
            if not is_side_background:
                continue

            local_matte = set(component)
            queue = deque(component)
            while queue:
                current_x, current_y = queue.popleft()
                for next_x, next_y in (
                    (current_x - 1, current_y),
                    (current_x + 1, current_y),
                    (current_x, current_y - 1),
                    (current_x, current_y + 1),
                ):
                    next_point = (next_x, next_y)
                    if not (max(0, min_x - 3) <= next_x <= min(width - 1, max_x + 3)):
                        continue
                    if not (max(0, min_y - 3) <= next_y <= min(height - 1, max_y + 3)):
                        continue
                    if next_point in local_matte:
                        continue
                    if not is_white_matte(pixels[next_x, next_y]):
                        continue
                    local_matte.add(next_point)
                    queue.append(next_point)
            matte.update(local_matte)

    for x, y in matte:
        red, green, blue, _alpha = pixels[x, y]
        pixels[x, y] = (red, green, blue, 0)
    return cleaned, len(matte)


def main() -> None:
    spec = importlib.util.spec_from_file_location("chen_huihui_frame_cleanup", HELPER)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load cleanup helper: {HELPER}")
    cleanup = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cleanup)

    cleanup.SOURCE = Path(r"C:\Users\a\Downloads\sprite_sheet (12).png")
    cleanup.OUTPUT = ROOT / "public/assets/characters/animated/chen-huihui/talk-sad-cleaned"
    cleanup.STATIC_OUTPUT = ROOT / "public/assets/characters/chen-huihui-sad.png"
    cleanup.GRID = (5, 5)
    cleanup.FRAME_SIZE = (720, 1264)
    cleanup.CANVAS_SIZE = (430, 606)
    cleanup.EXPECTED_FRAMES = 25
    base_remove_trapped_background = cleanup.remove_trapped_background

    def remove_all_trapped_background(frame: Image.Image) -> tuple[Image.Image, int]:
        cleaned, common_removed = base_remove_trapped_background(frame)
        cleaned, sad_removed = remove_sad_side_hair_matte(cleaned)
        return cleaned, common_removed + sad_removed

    cleanup.remove_trapped_background = remove_all_trapped_background
    cleanup.main()


if __name__ == "__main__":
    main()

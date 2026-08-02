"""Create a cleaned copy of Touko blink frames without touching the source files.

Only fully opaque white islands in the known accidental cutout gaps are removed.
The white face, hands, earring details, and the centre trouser/belt button are
deliberately outside these regions and remain unchanged.
"""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

from PIL import Image


# (left, top, right, bottom).  These surround the known background islands,
# rather than using a global "remove white" rule that would damage the art.
REMOVAL_REGIONS = {
    "left_arm_body_gap": (190, 680, 270, 880),
    "left_hair_inner_gap": (90, 470, 150, 610),
    "right_arm_body_gap": (470, 730, 530, 840),
    "right_hair_upper_inner_gap": (470, 300, 530, 390),
    "right_hair_lower_inner_gap": (500, 410, 545, 480),
}


def is_opaque_white(pixel: tuple[int, int, int, int]) -> bool:
    red, green, blue, alpha = pixel
    return red >= 230 and green >= 230 and blue >= 230 and alpha >= 240


def opaque_white_components(image: Image.Image) -> list[tuple[list[int], tuple[int, int, int, int]]]:
    """Return 8-connected opaque-white components as flat indexes plus bbox."""
    width, height = image.size
    pixels = list(image.getdata())
    visited = bytearray(width * height)
    components: list[tuple[list[int], tuple[int, int, int, int]]] = []

    for start in range(width * height):
        if visited[start] or not is_opaque_white(pixels[start]):
            continue

        visited[start] = 1
        queue = deque([start])
        members: list[int] = []
        min_x = max_x = start % width
        min_y = max_y = start // width

        while queue:
            current = queue.popleft()
            members.append(current)
            x, y = current % width, current // width
            min_x, max_x = min(min_x, x), max(max_x, x)
            min_y, max_y = min(min_y, y), max(max_y, y)

            for next_y in range(max(0, y - 1), min(height, y + 2)):
                row_start = next_y * width
                for next_x in range(max(0, x - 1), min(width, x + 2)):
                    neighbor = row_start + next_x
                    if not visited[neighbor] and is_opaque_white(pixels[neighbor]):
                        visited[neighbor] = 1
                        queue.append(neighbor)

        components.append((members, (min_x, min_y, max_x + 1, max_y + 1)))

    return components


def overlaps(first: tuple[int, int, int, int], second: tuple[int, int, int, int]) -> bool:
    return first[0] < second[2] and first[2] > second[0] and first[1] < second[3] and first[3] > second[1]


def clean_frame(source: Path, destination: Path) -> list[tuple[str, int, tuple[int, int, int, int]]]:
    image = Image.open(source).convert("RGBA")
    pixels = list(image.getdata())
    removed: list[tuple[str, int, tuple[int, int, int, int]]] = []

    for members, bbox in opaque_white_components(image):
        matching_regions = [name for name, region in REMOVAL_REGIONS.items() if overlaps(bbox, region)]
        if not matching_regions:
            continue
        for index in members:
            pixels[index] = (0, 0, 0, 0)
        removed.append((", ".join(matching_regions), len(members), bbox))

    cleaned = Image.new("RGBA", image.size)
    cleaned.putdata(pixels)
    cleaned.save(destination)
    return removed


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source_dir", type=Path)
    parser.add_argument("output_dir", type=Path)
    args = parser.parse_args()

    source_files = sorted(args.source_dir.glob("matte_*.png"))
    if not source_files:
        raise SystemExit(f"No matte_*.png files found in {args.source_dir}")

    args.output_dir.mkdir(parents=True, exist_ok=True)
    for source in source_files:
        destination = args.output_dir / source.name
        removed = clean_frame(source, destination)
        summary = "; ".join(f"{name}: {count}px @ {bbox}" for name, count, bbox in removed) or "no changes"
        print(f"{source.name}: {summary}")


if __name__ == "__main__":
    main()

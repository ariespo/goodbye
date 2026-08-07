from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE_GROUPS = (
    (
        ROOT / "public/assets/characters/animated/touko/talk-insane",
        ROOT / "public/assets/characters/animated/touko/talk-insane-cleaned",
    ),
    (
        ROOT / "public/assets/characters/animated/touko/tail-blink-insane",
        ROOT / "public/assets/characters/animated/touko/tail-blink-insane-cleaned",
    ),
)


def is_white_core(pixel: tuple[int, int, int, int]) -> bool:
    red, green, blue, alpha = pixel
    return alpha > 128 and min(red, green, blue) >= 235 and max(red, green, blue) - min(red, green, blue) <= 12


def is_white_matte(pixel: tuple[int, int, int, int]) -> bool:
    red, green, blue, alpha = pixel
    return alpha > 0 and min(red, green, blue) >= 175 and max(red, green, blue) - min(red, green, blue) <= 18


def is_protected_component(points: list[tuple[int, int]]) -> bool:
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)

    # The face is the large central pale region. Hands sit below the hair gaps.
    is_face = min_x >= 175 and max_x <= 270 and min_y < 180
    is_hand = min_y >= 390
    return is_face or is_hand


def connected_components(
    image: Image.Image,
    predicate,
) -> list[list[tuple[int, int]]]:
    width, height = image.size
    pixels = image.load()
    seen: set[tuple[int, int]] = set()
    components: list[list[tuple[int, int]]] = []

    for y in range(height):
        for x in range(width):
            if (x, y) in seen or not predicate(pixels[x, y]):
                continue
            queue = deque([(x, y)])
            seen.add((x, y))
            component: list[tuple[int, int]] = []
            while queue:
                current_x, current_y = queue.popleft()
                component.append((current_x, current_y))
                for next_x, next_y in (
                    (current_x - 1, current_y),
                    (current_x + 1, current_y),
                    (current_x, current_y - 1),
                    (current_x, current_y + 1),
                ):
                    if not (0 <= next_x < width and 0 <= next_y < height):
                        continue
                    point = (next_x, next_y)
                    if point in seen or not predicate(pixels[next_x, next_y]):
                        continue
                    seen.add(point)
                    queue.append(point)
            components.append(component)
    return components


def clean_frame(source: Path, destination: Path) -> tuple[int, int]:
    image = Image.open(source).convert("RGBA")
    pixels = image.load()

    # Large white islands outside the protected face/hands are the original
    # white backdrop trapped inside closed hair contours.
    white_islands = {
        point
        for component in connected_components(image, is_white_core)
        if len(component) >= 60 and not is_protected_component(component)
        for point in component
    }

    # Grow only through neutral bright matte pixels. The dark inked hair edge
    # stops the expansion, so intentional hair and grayscale shading remain.
    matte = set(white_islands)
    queue = deque(white_islands)
    width, height = image.size
    while queue:
        x, y = queue.popleft()
        for next_x, next_y in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if not (0 <= next_x < width and 0 <= next_y < height):
                continue
            point = (next_x, next_y)
            if point in matte or not is_white_matte(pixels[next_x, next_y]):
                continue
            matte.add(point)
            queue.append(point)

    for x, y in matte:
        red, green, blue, _alpha = pixels[x, y]
        pixels[x, y] = (red, green, blue, 0)

    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, optimize=True)
    return len(white_islands), len(matte)


def main() -> None:
    for source_dir, destination_dir in SOURCE_GROUPS:
        for source in sorted(source_dir.glob("*.png")):
            destination = destination_dir / source.name
            core_count, matte_count = clean_frame(source, destination)
            print(f"{source.name}: removed {core_count} white pixels, {matte_count} including matte")


if __name__ == "__main__":
    main()

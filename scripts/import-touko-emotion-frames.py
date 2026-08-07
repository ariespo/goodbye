from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
CANVAS_SIZE = (430, 606)


@dataclass(frozen=True)
class EmotionSource:
    name: str
    source: Path
    output: Path
    expected_frames: int


EMOTIONS = (
    EmotionSource(
        name="angry",
        source=Path(r"G:\灯织愤怒\matted_frames"),
        output=ROOT / "public/assets/characters/animated/touko/talk-angry-cleaned",
        expected_frames=22,
    ),
    EmotionSource(
        name="happy",
        source=Path(r"G:\灯织开心"),
        output=ROOT / "public/assets/characters/animated/touko/talk-happy-cleaned",
        expected_frames=14,
    ),
    EmotionSource(
        name="sad",
        source=Path(r"G:\灯织难过\matted_frames"),
        output=ROOT / "public/assets/characters/animated/touko/talk-sad-cleaned",
        expected_frames=12,
    ),
)


def is_white_core(pixel: tuple[int, int, int, int]) -> bool:
    red, green, blue, alpha = pixel
    return alpha > 128 and min(red, green, blue) >= 235 and max(red, green, blue) - min(red, green, blue) <= 12


def is_white_matte(pixel: tuple[int, int, int, int]) -> bool:
    red, green, blue, alpha = pixel
    return alpha > 0 and min(red, green, blue) >= 175 and max(red, green, blue) - min(red, green, blue) <= 18


def connected_components(image: Image.Image) -> list[list[tuple[int, int]]]:
    width, height = image.size
    pixels = image.load()
    seen: set[tuple[int, int]] = set()
    components: list[list[tuple[int, int]]] = []

    for y in range(height):
        for x in range(width):
            if (x, y) in seen or not is_white_core(pixels[x, y]):
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
                    point = (next_x, next_y)
                    if not (0 <= next_x < width and 0 <= next_y < height):
                        continue
                    if point in seen or not is_white_core(pixels[next_x, next_y]):
                        continue
                    seen.add(point)
                    queue.append(point)
            components.append(component)
    return components


def protected_component(points: list[tuple[int, int]], size: tuple[int, int]) -> bool:
    width, height = size
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)

    # Preserve the central face and its small white facial/jewelry details.
    face_or_earring = min_x >= width * 0.30 and max_x <= width * 0.70 and min_y < height * 0.35
    # Preserve the two large hand components plus the upper hand's finger
    # segments. The black ink between its fingers splits the pale skin into
    # several small white components, so an area-only rule mistakes those
    # fingertips for trapped background.
    large_hand = len(points) >= 1_000 and min_y >= height * 0.50
    upper_hand_detail = (
        min_x >= width * 0.38
        and max_x <= width * 0.63
        and min_y >= height * 0.62
        and max_y <= height * 0.75
    )
    # Preserve the bright belt buckle shared by all three poses.
    belt_buckle = min_x >= width * 0.53 and min_y >= height * 0.55 and max_y <= height * 0.66
    return face_or_earring or large_hand or upper_hand_detail or belt_buckle


def lies_in_hair_background_zone(points: list[tuple[int, int]], size: tuple[int, int]) -> bool:
    width, height = size
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    beside_head_or_torso = max_x < width * 0.43 or min_x > width * 0.57
    within_hair_height = max_y > height * 0.14 and min_y < height * 0.68
    return beside_head_or_torso and within_hair_height


def remove_trapped_white_background(image: Image.Image) -> tuple[Image.Image, int]:
    image = image.convert("RGBA")
    pixels = image.load()
    width, height = image.size
    minimum_component_size = max(100, round(width * height * 0.0001))

    components = connected_components(image)
    protected_core = {
        point
        for component in components
        if protected_component(component, image.size)
        for point in component
    }
    white_islands = {
        point
        for component in components
        if (
            len(component) >= minimum_component_size
            or lies_in_hair_background_zone(component, image.size)
        ) and not protected_component(component, image.size)
        for point in component
    }

    # A small barrier around skin and jewelry prevents the lower matte
    # threshold from crossing a pale antialiased seam into a hand or face.
    protected_barrier = set(protected_core)
    for x, y in protected_core:
        for offset_y in range(-2, 3):
            for offset_x in range(-2, 3):
                if abs(offset_x) + abs(offset_y) > 2:
                    continue
                next_x, next_y = x + offset_x, y + offset_y
                if 0 <= next_x < width and 0 <= next_y < height:
                    protected_barrier.add((next_x, next_y))

    # Grow through the neutral white/gray matte until the dark ink outline.
    matte = set(white_islands)
    queue = deque(white_islands)
    while queue:
        x, y = queue.popleft()
        for next_x, next_y in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            point = (next_x, next_y)
            if not (0 <= next_x < width and 0 <= next_y < height):
                continue
            if point in matte or point in protected_barrier or not is_white_matte(pixels[next_x, next_y]):
                continue
            matte.add(point)
            queue.append(point)

    for x, y in matte:
        red, green, blue, _alpha = pixels[x, y]
        pixels[x, y] = (red, green, blue, 0)
    return image, len(matte)


def normalize_to_canvas(image: Image.Image) -> Image.Image:
    source_width, source_height = image.size
    canvas_width, canvas_height = CANVAS_SIZE
    scale = min(canvas_width / source_width, canvas_height / source_height)
    target_size = (round(source_width * scale), round(source_height * scale))

    # Resize premultiplied RGBA so transparent white source pixels cannot
    # create a pale fringe around the dark hair.
    resized = image.convert("RGBa").resize(target_size, Image.Resampling.LANCZOS).convert("RGBA")
    canvas = Image.new("RGBA", CANVAS_SIZE, (0, 0, 0, 0))
    x = (canvas_width - target_size[0]) // 2
    y = canvas_height - target_size[1]
    canvas.alpha_composite(resized, (x, y))
    return canvas


def import_emotion(emotion: EmotionSource) -> None:
    sources = sorted(emotion.source.glob("*.png"))
    if len(sources) != emotion.expected_frames:
        raise RuntimeError(
            f"{emotion.name}: expected {emotion.expected_frames} frames in {emotion.source}, found {len(sources)}",
        )

    emotion.output.mkdir(parents=True, exist_ok=True)
    for index, source in enumerate(sources):
        cleaned, removed_pixels = remove_trapped_white_background(Image.open(source))
        normalized = normalize_to_canvas(cleaned)
        destination = emotion.output / f"{index:02d}.png"
        normalized.save(destination, optimize=True)
        print(f"{emotion.name}/{destination.name}: removed {removed_pixels} matte pixels")


def main() -> None:
    for emotion in EMOTIONS:
        import_emotion(emotion)


if __name__ == "__main__":
    main()

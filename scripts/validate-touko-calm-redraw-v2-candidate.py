"""Validate Touko's v2 calm redraw for alpha and grayscale integrity."""

from collections import deque
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "public" / "assets" / "characters" / "candidates" / "touko-calm-redraw-v2" / "normalized" / "touko-calm.png"
TARGET_SIZE = (592, 1280)
ALPHA_THRESHOLD = 16


def largest_component_ratio(alpha: Image.Image) -> float:
    width, height = alpha.size
    pixels = list(alpha.get_flattened_data())
    foreground = [value > ALPHA_THRESHOLD for value in pixels]
    total = sum(foreground)
    if not total:
        return 0.0

    seen = bytearray(width * height)
    largest = 0
    for start, active in enumerate(foreground):
        if not active or seen[start]:
            continue
        seen[start] = 1
        size = 0
        queue = deque([start])
        while queue:
            current = queue.popleft()
            size += 1
            x = current % width
            y = current // width
            for neighbor in (current - 1 if x else None, current + 1 if x + 1 < width else None,
                             current - width if y else None, current + width if y + 1 < height else None):
                if neighbor is not None and foreground[neighbor] and not seen[neighbor]:
                    seen[neighbor] = 1
                    queue.append(neighbor)
        largest = max(largest, size)
    return largest / total


def main() -> None:
    with Image.open(PATH) as image:
        if image.mode != "RGBA" or image.size != TARGET_SIZE:
            raise ValueError(f"expected RGBA {TARGET_SIZE}, got {image.mode} {image.size}")
        alpha = image.getchannel("A")
        bbox = alpha.getbbox()
        corners = [alpha.getpixel(point) for point in ((0, 0), (591, 0), (0, 1279), (591, 1279))]
        non_gray_pixels = sum(
            1
            for red, green, blue, opacity in image.get_flattened_data()
            if opacity != 0 and (red != green or green != blue)
        )
        connected_ratio = largest_component_ratio(alpha)
        if bbox is None or any(corner != 0 for corner in corners) or non_gray_pixels:
            raise ValueError("invalid alpha matte or non-monochrome pixels")
        if connected_ratio < 0.995:
            raise ValueError(f"subject silhouette is fragmented: largest component ratio={connected_ratio:.5f}")
        print(f"alpha_bbox={bbox}, non_gray_visible_pixels={non_gray_pixels}, largest_component_ratio={connected_ratio:.5f}")


if __name__ == "__main__":
    main()

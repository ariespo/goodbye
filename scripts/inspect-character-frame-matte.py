"""Inspect a folder of PNG animation frames and render a visual matte diagnostic."""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("frames_dir", type=Path)
    parser.add_argument("output", type=Path)
    return parser.parse_args()


def alpha_stats(image: Image.Image) -> tuple[tuple[int, int, int, int] | None, int, int, int, int, int]:
    alpha = image.getchannel("A")
    values = list(alpha.get_flattened_data())
    transparent = values.count(0)
    opaque = values.count(255)
    partial = len(values) - transparent - opaque
    green_fringe = 0
    white_fringe = 0
    for red, green, blue, opacity in image.get_flattened_data():
        if not 0 < opacity < 255:
            continue
        green_fringe += int(green > red * 1.25 and green > blue * 1.25 and green > 64)
        white_fringe += int(red > 220 and green > 220 and blue > 220)
    return alpha.getbbox(), transparent, partial, opaque, green_fringe, white_fringe


def opaque_white_components(image: Image.Image) -> list[tuple[int, tuple[int, int, int, int]]]:
    """Return 8-connected near-white opaque regions as (pixel_count, bbox)."""
    width, height = image.size
    pixels = list(image.get_flattened_data())
    white = [red >= 230 and green >= 230 and blue >= 230 and opacity >= 240 for red, green, blue, opacity in pixels]
    seen = bytearray(width * height)
    components: list[tuple[int, tuple[int, int, int, int]]] = []
    for start, active in enumerate(white):
        if not active or seen[start]:
            continue
        seen[start] = 1
        queue = deque([start])
        count = 0
        left = right = start % width
        top = bottom = start // width
        while queue:
            current = queue.popleft()
            x = current % width
            y = current // width
            count += 1
            left, right = min(left, x), max(right, x)
            top, bottom = min(top, y), max(bottom, y)
            for ny in range(max(0, y - 1), min(height, y + 2)):
                for nx in range(max(0, x - 1), min(width, x + 2)):
                    neighbor = ny * width + nx
                    if white[neighbor] and not seen[neighbor]:
                        seen[neighbor] = 1
                        queue.append(neighbor)
        components.append((count, (left, top, right + 1, bottom + 1)))
    return sorted(components, reverse=True)


def main() -> None:
    args = parse_args()
    paths = sorted(args.frames_dir.glob("matte_*.png"))
    if not paths:
        raise ValueError(f"No matte_*.png files in {args.frames_dir}")

    cell = (190, 420)
    label_height = 24
    columns = 3
    padding = 16
    rows = (len(paths) + columns - 1) // columns
    sheet = Image.new(
        "RGBA",
        (columns * cell[0] + (columns + 1) * padding, rows * cell[1] + (rows + 1) * padding),
        "#ff00ff",
    )
    draw = ImageDraw.Draw(sheet)

    for index, path in enumerate(paths):
        with Image.open(path) as source:
            image = source.convert("RGBA")
        bbox, transparent, partial, opaque, green_fringe, white_fringe = alpha_stats(image)
        white_components = opaque_white_components(image)
        corners = [image.getchannel("A").getpixel(point) for point in ((0, 0), (image.width - 1, 0), (0, image.height - 1), (image.width - 1, image.height - 1))]
        print(
            f"{path.name}: mode={image.mode} size={image.size} alpha_bbox={bbox} "
            f"transparent={transparent} partial={partial} opaque={opaque} "
            f"green_fringe={green_fringe} white_fringe={white_fringe} corners={corners}"
        )
        print(f"  opaque_white_components={white_components[:12]}")

        portrait = image.resize((cell[0], cell[1] - label_height), Image.Resampling.NEAREST)
        column = index % columns
        row = index // columns
        left = padding + column * (cell[0] + padding)
        top = padding + row * (cell[1] + padding)
        sheet.alpha_composite(portrait, (left, top))
        scale_x = cell[0] / image.width
        scale_y = (cell[1] - label_height) / image.height
        for count, (box_left, box_top, box_right, box_bottom) in white_components:
            if 200 <= count < 5_000:
                draw.rectangle(
                    (
                        left + round(box_left * scale_x),
                        top + round(box_top * scale_y),
                        left + round(box_right * scale_x),
                        top + round(box_bottom * scale_y),
                    ),
                    outline="#ff2d2d",
                    width=1,
                )
        draw.rectangle((left, top + cell[1] - label_height, left + cell[0], top + cell[1]), fill="#24262b")
        draw.text((left + 6, top + cell[1] - label_height + 5), path.stem.upper(), fill="#ffffff")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert("RGB").save(args.output)
    print(f"Wrote {args.output}")


if __name__ == "__main__":
    main()

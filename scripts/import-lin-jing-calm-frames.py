"""Install Lin Jing's supplied calm/profile/blink animation sheet."""

from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(r"C:\Users\a\AppData\Local\Temp\codex-clipboard-e45d364d-2885-4172-b276-552ae5480883.png")
OUTPUT = ROOT / "public/assets/characters/animated/detective-b/talk-calm-cleaned"
STATIC_OUTPUT = ROOT / "public/assets/characters/detective-b-normal-v7.png"
GRID = (4, 2)
FRAME_SIZE = (800, 1136)
CANVAS_SIZE = (430, 606)
EXPECTED_FRAMES = 5


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
        normalized = normalize_to_canvas(frame)
        frames.append(normalized)
        normalized.save(OUTPUT / f"{len(frames) - 1:02d}.png", optimize=True)

    if len(frames) != EXPECTED_FRAMES:
        raise ValueError(f"Expected {EXPECTED_FRAMES} visible frames, got {len(frames)}")
    frames[0].save(STATIC_OUTPUT, optimize=True)
    print(f"Installed {len(frames)} Lin Jing calm frames on {CANVAS_SIZE[0]}x{CANVAS_SIZE[1]} canvases")


if __name__ == "__main__":
    main()

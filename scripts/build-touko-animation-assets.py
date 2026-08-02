"""Build Touko's dialogue/action clips around the approved full-frame rig."""

from collections.abc import Iterable
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
CHARACTER_ROOT = ROOT / "public" / "assets" / "characters"
ANIMATION_ROOT = CHARACTER_ROOT / "animated" / "touko"
BLINK_ROOT = ANIMATION_ROOT / "blink-calm"
BASE_PATH = BLINK_ROOT / "open.png"
CUFF_BOARD_PATH = CHARACTER_ROOT / "concepts" / "touko-reset-cuff-strip-v1.png"
CANVAS = (430, 606)
TARGET_BBOX = (105, 26, 342, 606)


def remove_magenta(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            red, green, blue, alpha = pixels[x, y]
            if red > 55 and blue > 50 and green < 110 and red + blue > green * 2.5:
                pixels[x, y] = (0, 0, 0, 0)
            else:
                pixels[x, y] = (red, green, blue, alpha)
    return rgba


def split_board(path: Path, columns: int, rows: int) -> list[Image.Image]:
    board = remove_magenta(Image.open(path))
    cell_width = board.width // columns
    cell_height = board.height // rows
    return [
        board.crop((
            (index % columns) * cell_width,
            (index // columns) * cell_height,
            (index % columns + 1) * cell_width,
            (index // columns + 1) * cell_height,
        ))
        for index in range(columns * rows)
    ]


def normalized_character(cell: Image.Image) -> Image.Image:
    safe = cell.crop((max(0, cell.width // 10), 0, cell.width - cell.width // 10, cell.height))
    bbox = safe.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("Generated cell does not contain a character.")
    character = safe.crop(bbox).resize(
        (TARGET_BBOX[2] - TARGET_BBOX[0], TARGET_BBOX[3] - TARGET_BBOX[1]),
        Image.Resampling.NEAREST,
    )
    frame = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    frame.alpha_composite(character, (TARGET_BBOX[0], TARGET_BBOX[1]))
    return frame


def talk_frame(base: Image.Image, amount: str) -> Image.Image:
    if amount == "closed":
        return base.copy()
    result = base.copy()
    pixels = result.load()
    for y in range(156, 168):
        skin = pixels[211, y]
        for x in range(213, 236):
            pixels[x, y] = skin
    draw = ImageDraw.Draw(result)
    dark = (54, 38, 40, 255)
    lip = (122, 73, 76, 255)
    if amount == "small":
        draw.ellipse((219, 158, 229, 164), fill=dark)
        draw.line((221, 163, 227, 163), fill=lip, width=1)
    else:
        draw.ellipse((217, 157, 232, 167), fill=dark)
        draw.line((220, 165, 229, 165), fill=lip, width=2)
    return result


def save_frames(folder: str, frames: Iterable[Image.Image]) -> None:
    output = ANIMATION_ROOT / folder
    output.mkdir(parents=True, exist_ok=True)
    for index, frame in enumerate(frames):
        frame.save(output / f"{index:02d}.png", optimize=True)


def save_sheet(filename: str, frames: list[Image.Image]) -> None:
    sheet = Image.new("RGBA", (CANVAS[0] * len(frames), CANVAS[1]), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        sheet.alpha_composite(frame, (index * CANVAS[0], 0))
    sheet.save(ANIMATION_ROOT / filename, optimize=True)


def main() -> None:
    base = Image.open(BASE_PATH).convert("RGBA")
    blink_frames = [
        Image.open(BLINK_ROOT / name).convert("RGBA")
        for name in ("open.png", "half-close.png", "closed.png", "half-open.png", "open.png")
    ]
    talk_frames = [base.copy(), talk_frame(base, "small"), talk_frame(base, "medium"), base.copy()]

    cuff_cells = split_board(CUFF_BOARD_PATH, 3, 2)
    cuff_frames = [
        base.copy(),
        normalized_character(cuff_cells[1]),
        normalized_character(cuff_cells[2]),
        normalized_character(cuff_cells[3]),
        normalized_character(cuff_cells[4]),
        base.copy(),
    ]

    save_frames("idle-calm", blink_frames)
    save_frames("talk-calm", talk_frames)
    save_frames("gesture-reset-cuff", cuff_frames)
    save_sheet("touko-idle-calm.sheet.png", blink_frames)
    save_sheet("touko-talk-calm.sheet.png", talk_frames)
    save_sheet("touko-gesture-reset-cuff.sheet.png", cuff_frames)


if __name__ == "__main__":
    main()

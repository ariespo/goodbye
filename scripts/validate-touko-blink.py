"""Validate Touko's unmodified 14-frame blink sequence and packed sheet."""

from pathlib import Path

from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parents[1]
CHARACTER_ROOT = ROOT / "public" / "assets" / "characters"
SOURCE_ROOT = CHARACTER_ROOT / "concepts" / "touko-blink-frames-user-v2"
SHEET_PATH = CHARACTER_ROOT / "animated" / "touko" / "touko-blink-calm.sheet.png"
EXPECTED_NAMES = tuple(f"matte_{index:05d}.png" for index in range(1, 15))


def main() -> None:
    source_paths = sorted(SOURCE_ROOT.glob("matte_*.png"))
    source_names = tuple(path.name for path in source_paths)
    if source_names != EXPECTED_NAMES:
        raise ValueError(f"Sequence mismatch: {source_names}")

    with Image.open(source_paths[0]) as first:
        frame_size = first.size
        frame_mode = first.mode

    with Image.open(SHEET_PATH) as sheet:
        expected_sheet_size = (frame_size[0] * len(source_paths), frame_size[1])
        if sheet.size != expected_sheet_size:
            raise ValueError(f"Sheet expected {expected_sheet_size}, got {sheet.size}")
        if sheet.mode != frame_mode:
            raise ValueError(f"Sheet expected mode {frame_mode}, got {sheet.mode}")

        for index, source_path in enumerate(source_paths):
            with Image.open(source_path) as source:
                if source.size != frame_size or source.mode != frame_mode:
                    raise ValueError(
                        f"{source_path.name}: expected {frame_size} {frame_mode}, "
                        f"got {source.size} {source.mode}"
                    )
                packed_frame = sheet.crop(
                    (index * frame_size[0], 0, (index + 1) * frame_size[0], frame_size[1])
                )
                if ImageChops.difference(source, packed_frame).getbbox() is not None:
                    raise ValueError(f"Packed frame {index + 1} differs from {source_path.name}")

    print(f"validated exact sequence: {', '.join(EXPECTED_NAMES)}")
    print(f"frames: {len(source_paths)} x {frame_size} {frame_mode}")
    print(f"sheet: {expected_sheet_size}")


if __name__ == "__main__":
    main()

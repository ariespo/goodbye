"""Pack the user-authored Touko frames in filename order without altering them."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
CHARACTER_ROOT = ROOT / "public" / "assets" / "characters"
SOURCE_ROOT = CHARACTER_ROOT / "concepts" / "touko-blink-frames-user-v2"
SHEET_PATH = CHARACTER_ROOT / "animated" / "touko" / "touko-blink-calm.sheet.png"
EXPECTED_NAMES = tuple(f"matte_{index:05d}.png" for index in range(1, 15))


def main() -> None:
    source_paths = sorted(SOURCE_ROOT.glob("matte_*.png"))
    source_names = tuple(path.name for path in source_paths)
    if source_names != EXPECTED_NAMES:
        raise ValueError(f"Expected {EXPECTED_NAMES}, got {source_names}")

    frames = [Image.open(path) for path in source_paths]
    try:
        frame_size = frames[0].size
        frame_mode = frames[0].mode
        for path, frame in zip(source_paths, frames, strict=True):
            if frame.size != frame_size:
                raise ValueError(f"{path.name}: expected size {frame_size}, got {frame.size}")
            if frame.mode != frame_mode:
                raise ValueError(f"{path.name}: expected mode {frame_mode}, got {frame.mode}")

        # Each frame is pasted at native resolution. No crop, resize, alignment,
        # colour adjustment, interpolation, selection, or reordering is applied.
        packed = Image.new(frame_mode, (frame_size[0] * len(frames), frame_size[1]))
        for index, frame in enumerate(frames):
            packed.paste(frame, (index * frame_size[0], 0))

        SHEET_PATH.parent.mkdir(parents=True, exist_ok=True)
        packed.save(SHEET_PATH)
        print(f"packed {len(frames)} frames: {frame_size} {frame_mode}")
        print(f"sheet: {packed.size} -> {SHEET_PATH}")
    finally:
        for frame in frames:
            frame.close()


if __name__ == "__main__":
    main()

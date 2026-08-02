"""Build blink frames from each action tail without replacing the head.

The approved closed-eye pixels already exist in idle-calm/02.png.  Copy only
that small eye band onto each action's exact tail frame.  Everything outside
the band, including the silhouette and alpha channel, stays untouched.
"""

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
ANIMATION_ROOT = ROOT / "public" / "assets" / "characters" / "animated" / "fumi"
OUTPUT_ROOT = ANIMATION_ROOT / "tail-blink"
CLOSED_EYE_SOURCE = ANIMATION_ROOT / "idle-calm" / "02.png"


def build_tail_blink(target_path: Path, output_name: str, shift_x: int) -> None:
    target = Image.open(target_path).convert("RGBA")
    closed = Image.open(CLOSED_EYE_SOURCE).convert("RGBA")

    # Two tight, irregular eye-socket masks avoid the artificial oval edge
    # produced by the previous procedural skin patches.
    source_mask = Image.new("L", target.size, 0)
    draw = ImageDraw.Draw(source_mask)
    draw.polygon(
        [(164, 139), (170, 130), (185, 127), (199, 134), (203, 145),
         (198, 158), (185, 163), (170, 158), (164, 149)],
        fill=255,
    )
    draw.polygon(
        [(210, 138), (217, 130), (232, 127), (247, 132), (253, 142),
         (250, 155), (237, 161), (221, 158), (212, 150)],
        fill=255,
    )

    shifted_closed = Image.new("RGBA", target.size, (0, 0, 0, 0))
    shifted_closed.alpha_composite(closed, (shift_x, 0))
    shifted_mask = Image.new("L", target.size, 0)
    shifted_mask.paste(source_mask, (shift_x, 0))
    target.paste(shifted_closed, (0, 0), shifted_mask)

    # The action tail owns transparency; copied eye pixels may never change it.
    target.putalpha(Image.open(target_path).convert("RGBA").getchannel("A"))
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    target.save(OUTPUT_ROOT / output_name, optimize=True)


if __name__ == "__main__":
    build_tail_blink(ANIMATION_ROOT / "idle-calm" / "03.png", "idle-tail-blink.png", 0)
    build_tail_blink(ANIMATION_ROOT / "talk-calm" / "03.png", "talk-tail-blink.png", 0)
    build_tail_blink(ANIMATION_ROOT / "gesture-fold-cloth" / "05.png", "fold-tail-blink.png", 0)

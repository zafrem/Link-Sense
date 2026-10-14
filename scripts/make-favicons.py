#!/usr/bin/env python3
"""Draw site/favicon.ico and site/apple-touch-icon.png from the shared mark geometry.

The geometry and colours match site/favicon.svg and
docs/superpowers/specs/2026-10-14-favicon-design.md. Run by hand from the
repository root when the mark changes:

    python3 scripts/make-favicons.py

The generated files are committed; CI never runs this script.
"""
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:
    sys.exit("Pillow is required to regenerate the favicons: pip install pillow")

SITE = Path(__file__).resolve().parents[1] / "site"

BACKGROUND = "#0f766e"
RIBBON = "#ffffff"
CORNER_RADIUS = 14  # in units of the 64x64 canvas
RIBBON_POINTS = [(20, 12), (44, 12), (44, 48), (32, 40), (20, 48)]
SUPERSAMPLE = 8


def draw_mark(size: int, rounded: bool) -> Image.Image:
    """Draw the mark at `size` px. `rounded=False` gives an opaque full-bleed square."""
    big = size * SUPERSAMPLE
    unit = big / 64
    if rounded:
        image = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    else:
        image = Image.new("RGB", (big, big), BACKGROUND)
    draw = ImageDraw.Draw(image)
    if rounded:
        draw.rounded_rectangle([0, 0, big - 1, big - 1], radius=CORNER_RADIUS * unit, fill=BACKGROUND)
    draw.polygon([(x * unit, y * unit) for x, y in RIBBON_POINTS], fill=RIBBON)
    return image.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    # iOS rounds the touch icon itself and paints transparent corners black, so keep it opaque.
    draw_mark(180, rounded=False).save(SITE / "apple-touch-icon.png", optimize=True)
    draw_mark(256, rounded=True).save(SITE / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    print(f"wrote {SITE / 'apple-touch-icon.png'} and {SITE / 'favicon.ico'}")


if __name__ == "__main__":
    main()

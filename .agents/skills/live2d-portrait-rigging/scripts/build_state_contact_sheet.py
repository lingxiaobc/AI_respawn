#!/usr/bin/env python3
"""Build a labeled state contact sheet from full-canvas PNG layers."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


def parse_item(value: str) -> tuple[str, Path]:
    if "=" not in value:
        raise ValueError(f"image must use LABEL=PATH: {value}")
    label, raw_path = value.split("=", 1)
    if not label.strip() or not raw_path.strip():
        raise ValueError(f"image must use LABEL=PATH: {value}")
    return label.strip(), Path(raw_path.strip())


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", action="append", required=True, help="LABEL=PATH; repeatable")
    parser.add_argument("--output", required=True)
    parser.add_argument("--columns", type=int, default=3)
    parser.add_argument("--tile-width", type=int, default=320)
    parser.add_argument("--tile-height", type=int, default=420)
    args = parser.parse_args()
    if args.columns < 1:
        parser.error("--columns must be positive")

    items = [parse_item(value) for value in args.image]
    font = ImageFont.load_default()
    margin = 12
    label_height = 28
    tiles: list[Image.Image] = []
    source_size: tuple[int, int] | None = None
    for label, path in items:
        with Image.open(path) as opened:
            image = opened.convert("RGBA")
        source_size = source_size or image.size
        if image.size != source_size:
            raise SystemExit(f"image {label} size {image.size} does not match {source_size}")
        tile = Image.new("RGBA", (args.tile_width, args.tile_height + label_height), (245, 245, 245, 255))
        preview = ImageOps.contain(image, (args.tile_width - 2 * margin, args.tile_height - 2 * margin))
        x = (args.tile_width - preview.width) // 2
        y = margin + (args.tile_height - 2 * margin - preview.height) // 2
        tile.alpha_composite(preview, (x, y))
        draw = ImageDraw.Draw(tile)
        draw.rectangle((0, 0, args.tile_width - 1, args.tile_height - 1), outline=(40, 40, 40, 255), width=1)
        draw.text((margin, args.tile_height + 7), label, fill=(20, 20, 20, 255), font=font)
        tiles.append(tile)

    rows = (len(tiles) + args.columns - 1) // args.columns
    sheet = Image.new(
        "RGBA",
        (args.columns * args.tile_width + (args.columns + 1) * margin,
         rows * (args.tile_height + label_height) + (rows + 1) * margin),
        (225, 225, 225, 255),
    )
    for index, tile in enumerate(tiles):
        row, column = divmod(index, args.columns)
        x = margin + column * args.tile_width + column * margin
        y = margin + row * (args.tile_height + label_height) + row * margin
        sheet.alpha_composite(tile, (x, y))
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output, format="PNG")
    print(f"wrote {output} ({sheet.width}x{sheet.height})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

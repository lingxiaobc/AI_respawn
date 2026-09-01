#!/usr/bin/env python3
"""Audit portrait layers before PSD/Cubism work.

The script intentionally checks PNG/manifest invariants only. Cubism GUI
visual quality and model parameter bindings still require manual verification.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from PIL import Image, ImageChops


def load_rgba(path: Path) -> Image.Image:
    with Image.open(path) as image:
        return image.convert("RGBA")


def load_mask(path: Path, expected: tuple[int, int]) -> Image.Image:
    with Image.open(path) as image:
        mask = image.convert("L")
    if mask.size != expected:
        raise ValueError(f"mask {path} has size {mask.size}, expected {expected}")
    if mask.getbbox() is None:
        raise ValueError(f"mask {path} is empty")
    return mask


def diff_outside(source: Image.Image, candidate: Image.Image, union: Image.Image) -> int:
    diff = ImageChops.difference(source, candidate).convert("RGB")
    pixels = diff.load()
    allowed = union.load()
    changed = 0
    for y in range(diff.height):
        for x in range(diff.width):
            if allowed[x, y] == 0 and pixels[x, y] != (0, 0, 0):
                changed += 1
    return changed


def parse_layer(value: str) -> tuple[str, Path]:
    if "=" not in value:
        raise ValueError(f"layer must use NAME=PATH: {value}")
    name, raw_path = value.split("=", 1)
    if not name.strip() or not raw_path.strip():
        raise ValueError(f"layer must use NAME=PATH: {value}")
    return name.strip(), Path(raw_path.strip())


def read_manifest(path: Path) -> tuple[tuple[int, int] | None, list[tuple[str, Path]]]:
    data: Any = json.loads(path.read_text(encoding="utf-8"))
    canvas = data.get("canvas")
    canvas_size = tuple(canvas) if isinstance(canvas, list) and len(canvas) == 2 else None
    layers: list[tuple[str, Path]] = []
    for item in data.get("layers", []):
        if not isinstance(item, dict) or not item.get("name") or not item.get("path"):
            raise ValueError("manifest layers must contain name and path")
        layer_path = Path(item["path"])
        if not layer_path.is_absolute():
            layer_path = path.parent / layer_path
        layers.append((str(item["name"]), layer_path))
    return canvas_size, layers


def audit(args: argparse.Namespace) -> dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = []
    source_path = Path(args.source)
    base_path = Path(args.base)

    try:
        source = load_rgba(source_path)
        base = load_rgba(base_path)
    except (OSError, ValueError) as exc:
        return {"ok": False, "errors": [str(exc)], "warnings": []}

    expected = source.size
    if base.size != expected:
        errors.append(f"base size {base.size} does not match source {expected}")
    if base.getchannel("A").getextrema()[0] < 255:
        errors.append("base is not fully opaque; static_locked_base must be non-empty")

    masks: list[Image.Image] = []
    for raw_mask in args.mask:
        try:
            masks.append(load_mask(Path(raw_mask), expected))
        except (OSError, ValueError) as exc:
            errors.append(str(exc))
    union = Image.new("L", expected, 0)
    for mask in masks:
        union = ImageChops.lighter(union, mask)
    if not masks:
        warnings.append("no local masks supplied; outside-mask diff cannot be evaluated")
    elif base.size == expected:
        changed = diff_outside(source, base, union)
        if changed:
            errors.append(f"base differs from source outside approved masks at {changed} pixels")

    layer_specs: list[tuple[str, Path]] = []
    if args.manifest:
        try:
            canvas_size, manifest_layers = read_manifest(Path(args.manifest))
            if canvas_size and tuple(canvas_size) != expected:
                errors.append(f"manifest canvas {canvas_size} does not match source {expected}")
            layer_specs.extend(manifest_layers)
        except (OSError, ValueError, json.JSONDecodeError) as exc:
            errors.append(f"manifest: {exc}")
    for raw_layer in args.layer:
        try:
            layer_specs.append(parse_layer(raw_layer))
        except ValueError as exc:
            errors.append(str(exc))

    names = [name for name, _ in layer_specs]
    duplicates = sorted({name for name in names if names.count(name) > 1})
    if duplicates:
        errors.append("duplicate layer names: " + ", ".join(duplicates))
    for name, path in layer_specs:
        try:
            layer = load_rgba(path)
            if layer.size != expected:
                errors.append(f"layer {name} size {layer.size} does not match source {expected}")
        except (OSError, ValueError) as exc:
            errors.append(f"layer {name}: {exc}")

    expected_names = [item.strip() for item in args.expected_layer_name if item.strip()]
    if expected_names:
        missing = [name for name in expected_names if name not in names]
        extra = [name for name in names if name not in expected_names]
        if missing:
            errors.append("missing expected layers: " + ", ".join(missing))
        if extra:
            errors.append("unexpected layers: " + ", ".join(sorted(set(extra))))

    return {
        "ok": not errors,
        "source": str(source_path),
        "base": str(base_path),
        "canvas": list(expected),
        "layer_count": len(layer_specs),
        "layer_names": names,
        "errors": errors,
        "warnings": warnings,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, help="immutable source portrait")
    parser.add_argument("--base", required=True, help="candidate full-face base layer")
    parser.add_argument("--mask", action="append", default=[], help="approved local mask; repeatable")
    parser.add_argument("--layer", action="append", default=[], help="NAME=PATH layer; repeatable")
    parser.add_argument("--manifest", help="optional JSON manifest with canvas and layers")
    parser.add_argument("--expected-layer-name", action="append", default=[], help="required layer name; repeatable")
    args = parser.parse_args()
    report = audit(args)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())

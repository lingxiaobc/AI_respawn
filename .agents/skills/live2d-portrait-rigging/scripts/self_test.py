#!/usr/bin/env python3
"""Create controlled fixtures and exercise the portrait audit script."""

from __future__ import annotations

import json
import argparse
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw


def run_audit(script: Path, root: Path, source: Path, base: Path, mask: Path, manifest: Path) -> tuple[int, str]:
    command = [
        sys.executable, str(script), "--source", str(source), "--base", str(base),
        "--mask", str(mask), "--manifest", str(manifest),
        "--expected-layer-name", "static_locked_base", "--expected-layer-name", "mouth_open_local",
    ]
    completed = subprocess.run(command, cwd=root, capture_output=True, text=True, check=False)
    return completed.returncode, completed.stdout + completed.stderr


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--size", default="32x32", help="synthetic fixture size, for example 48x40")
    args = parser.parse_args()
    try:
        width, height = (int(value) for value in args.size.lower().split("x", 1))
        if width < 22 or height < 22:
            raise ValueError
    except ValueError:
        parser.error("--size must be at least 22x22 and use WIDTHxHEIGHT")

    script = Path(__file__).with_name("audit_portrait_assets.py")
    with tempfile.TemporaryDirectory(prefix="live2d-audit-") as raw:
        root = Path(raw)
        size = (width, height)
        source = Image.new("RGBA", size, (150, 120, 100, 255))
        base = source.copy()
        mask = Image.new("L", size, 0)
        ImageDraw.Draw(mask).rectangle((10, 10, 20, 20), fill=255)
        mouth = source.copy()
        ImageDraw.Draw(mouth).ellipse((11, 14, 19, 21), fill=(80, 30, 30, 255))
        source_path, base_path, mask_path, mouth_path = (root / name for name in ("source.png", "base.png", "mask.png", "mouth.png"))
        source.save(source_path)
        base.save(base_path)
        mask.save(mask_path)
        mouth.save(mouth_path)
        manifest = root / "manifest.json"
        manifest.write_text(json.dumps({"canvas": list(size), "layers": [
            {"name": "static_locked_base", "path": "base.png"},
            {"name": "mouth_open_local", "path": "mouth.png"},
        ]}), encoding="utf-8")

        code, output = run_audit(script, root, source_path, base_path, mask_path, manifest)
        if code != 0 or '"ok": true' not in output:
            print("positive fixture failed")
            print(output)
            return 1

        def expect_failure(label: str, expected_text: str, manifest_path: Path = manifest, candidate: Path = base_path) -> bool:
            code, output = run_audit(script, root, source_path, candidate, mask_path, manifest_path)
            if code == 0 or expected_text not in output:
                print(f"negative fixture was not rejected: {label}")
                print(output)
                return False
            return True

        outside = source.copy()
        ImageDraw.Draw(outside).point((0, 0), fill=(255, 0, 0, 255))
        outside.save(base_path)
        if not expect_failure("outside-mask pixel", "outside approved masks"):
            return 1

        alpha_bad = source.copy()
        alpha_bad.putalpha(0)
        alpha_path = root / "alpha-bad.png"
        alpha_bad.save(alpha_path)
        if not expect_failure("transparent full-face base", "not fully opaque", candidate=alpha_path):
            return 1

        duplicate_manifest = root / "duplicate.json"
        duplicate_manifest.write_text(json.dumps({"canvas": list(size), "layers": [
            {"name": "static_locked_base", "path": "base.png"},
            {"name": "static_locked_base", "path": "mouth.png"},
        ]}), encoding="utf-8")
        if not expect_failure("duplicate layer name", "duplicate layer names", manifest_path=duplicate_manifest):
            return 1

        small = Image.new("RGBA", (16, 16), (1, 2, 3, 255))
        small_path = root / "small.png"
        small.save(small_path)
        size_manifest = root / "size.json"
        size_manifest.write_text(json.dumps({"canvas": list(size), "layers": [
            {"name": "static_locked_base", "path": "base.png"},
            {"name": "mouth_open_local", "path": "small.png"},
        ]}), encoding="utf-8")
        if not expect_failure("layer dimension", "does not match source", manifest_path=size_manifest):
            return 1
    print("self-test passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

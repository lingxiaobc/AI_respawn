"""CPU-only immutable portrait contract and landmark-derived local masks."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import time

os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MPLBACKEND", "Agg")
os.environ.setdefault("MPLCONFIGDIR", str(Path(".motion-models/matplotlib").resolve()))
import cv2
import mediapipe as mp
import numpy as np
from PIL import Image, ImageDraw

cv2.setNumThreads(1)
VERSION = "portrait-motion-v1"
FEATURES = {
    "mouth": [61, 40, 37, 0, 267, 270, 291, 321, 314, 17, 84, 91],
    "eyeLeft": [33, 160, 158, 133, 153, 144],
    "eyeRight": [362, 385, 387, 263, 373, 380],
}


def load_rgb(path):
    with Image.open(path) as im:
        if im.size != (1024, 1536):
            raise ValueError("Canonical must be 1024x1536")
        rgba = np.array(im.convert("RGBA"))
    if np.any(rgba[:, :, 3] != 255):
        raise ValueError("Base must be completely opaque")
    return rgba[:, :, :3].copy()


def detect(rgb, model):
    options = mp.tasks.vision.FaceLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=str(model),
                                         delegate=mp.tasks.BaseOptions.Delegate.CPU),
        running_mode=mp.tasks.vision.RunningMode.IMAGE,
        num_faces=2, min_face_detection_confidence=0.6,
        min_face_presence_confidence=0.6)
    with mp.tasks.vision.FaceLandmarker.create_from_options(options) as detector:
        result = detector.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))
    if len(result.face_landmarks) != 1:
        raise ValueError("Exactly one detectable face is required")
    return np.array([[p.x * rgb.shape[1], p.y * rgb.shape[0]]
                     for p in result.face_landmarks[0]], dtype=np.float32)


def make_mask(points, key, shape):
    if points.shape != (478, 2) or not np.all(np.isfinite(points)):
        raise ValueError("Invalid face landmark array")
    feature = points[FEATURES[key]]
    lo, hi = feature.min(axis=0), feature.max(axis=0)
    width = float(hi[0] - lo[0])
    if width < 24:
        raise ValueError(f"{key}: feature too small")
    center = (lo + hi) / 2
    # Relative reserves include moving lip/lid and a narrow feathering ring.
    rx = width * (0.67 if key == "mouth" else 0.63)
    ry = max(float(hi[1] - lo[1]) * 0.8, width * (0.36 if key == "mouth" else 0.27))
    if key == "mouth":
        center[1] += width * 0.025
    yy, xx = np.mgrid[:shape[0], :shape[1]]
    distance = np.sqrt(((xx - center[0]) / rx) ** 2 + ((yy - center[1]) / ry) ** 2)
    alpha = np.clip((1 - distance) / 0.22, 0, 1)
    mask = np.round(alpha * 255).astype(np.uint8)
    ys, xs = np.where(mask > 0)
    if min(xs.min(), ys.min()) < 1 or xs.max() >= shape[1]-1 or ys.max() >= shape[0]-1:
        raise ValueError("Mask touches image boundary")
    box = [int(xs.min()), int(ys.min()), int(xs.max()+1), int(ys.max()+1)]
    return mask, box


def prepare(source, output, model):
    start = time.monotonic()
    source, output = Path(source), Path(output)
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    contract_path = output / "landmarks.json"
    if contract_path.exists():
        old = json.loads(contract_path.read_text(encoding="utf-8"))
        if old["sourceHash"] != digest or old["version"] != VERSION:
            raise ValueError("Existing output belongs to another source/version")
        if hashlib.sha256((output / "static_locked_base.png").read_bytes()).hexdigest() != digest:
            raise ValueError("Cached base hash mismatch")
        rgb = load_rgb(source)
        if hashlib.sha256(rgb.tobytes()).hexdigest() != old["pixelHash"]:
            raise ValueError("Cached pixel hash mismatch")
        if hashlib.sha256(Path(model).read_bytes()).hexdigest() != old["modelHash"]:
            raise ValueError("Cached landmark model changed")
        union = np.zeros(rgb.shape[:2], np.uint8)
        for key in FEATURES:
            expected, box = make_mask(np.array(old["landmarks"], dtype=np.float32), key, rgb.shape)
            actual = np.array(Image.open(output / f"mask-{key}.png").convert("L"))
            if not np.array_equal(expected, actual) or old["regions"][key]["box"] != box:
                raise ValueError(f"Cached {key} mask/ROI mismatch")
            union = np.maximum(union, actual)
        if not np.array_equal(union, np.array(Image.open(output / "mask-union.png").convert("L"))):
            raise ValueError("Cached union mask mismatch")
        return old
    rgb = load_rgb(source)
    points = detect(rgb, model)
    from preflight import validate_geometry
    validate_geometry(points, rgb.shape)
    eye_line = points[263] - points[33]
    if abs(float(eye_line[1] / eye_line[0])) > 0.25:
        raise ValueError("Face tilt exceeds normalization contract")
    output.mkdir(parents=True, exist_ok=True)
    base_path = output / "static_locked_base.png"
    if base_path.exists() and hashlib.sha256(base_path.read_bytes()).hexdigest() != digest:
        raise ValueError("Refusing to replace existing base")
    base_path.write_bytes(source.read_bytes())
    regions, union = {}, np.zeros(rgb.shape[:2], np.uint8)
    overlay = Image.fromarray(rgb)
    draw = ImageDraw.Draw(overlay)
    for key in FEATURES:
        mask, box = make_mask(points, key, rgb.shape)
        if np.any((union > 0) & (mask > 0)):
            raise ValueError("Movement masks overlap")
        Image.fromarray(mask).save(output / f"mask-{key}.png")
        union = np.maximum(union, mask)
        regions[key] = {"box": box, "mask": f"mask-{key}.png"}
        draw.rectangle(box, outline="#00ffaa", width=2)
        for x, y in points[FEATURES[key]]:
            draw.ellipse((x-2, y-2, x+2, y+2), fill="#ffdd00")
    Image.fromarray(union).save(output / "mask-union.png")
    overlay.save(output / "landmark-review.png")
    result = {"version": VERSION, "sourceHash": digest,
              "pixelHash": hashlib.sha256(rgb.tobytes()).hexdigest(),
              "width": 1024, "height": 1536, "opaque": True,
              "base": "static_locked_base.png", "regions": regions,
              "landmarks": points.tolist(), "elapsedSeconds": time.monotonic()-start,
              "modelHash": hashlib.sha256(Path(model).read_bytes()).hexdigest()}
    contract_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source")
    parser.add_argument("output")
    parser.add_argument("--model", default=".motion-models/face_landmarker.task")
    args = parser.parse_args()
    result = prepare(args.source, args.output, args.model)
    print(json.dumps({k: v for k, v in result.items() if k != "landmarks"}, ensure_ascii=False))

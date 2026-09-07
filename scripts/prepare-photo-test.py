"""Prepare three local photos for the DH_live_mini talking preview.

Run with .cache/dh-prep-py312/Scripts/python.exe. Original images are read-only;
intermediate files go to ignored artifacts/.
"""
from pathlib import Path
import hashlib
import html
import json
import pickle
import sys

import cv2
import imageio_ffmpeg
import mediapipe as mp
import numpy as np
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
UPSTREAM = ROOT / ".cache/dh-live-upstream"
OUTPUT = ROOT / "artifacts/photo-test"
SAMPLES = [("young", "青年.png"), ("woman", "50多岁女性.png"), ("elder", "老人1.png")]


def checkpoint_status():
    import torch
    sys.path.insert(0, str(UPSTREAM))
    from talkingface.models.DINet_mini import DINet_mini

    target = DINet_mini(3, 12).state_dict()
    result = {}
    for name in ("epoch_40.pth", "epoch_40_new.pth"):
        path = UPSTREAM / "checkpoint/DINet_mini" / name
        if not path.exists():
            result[name] = {"status": "missing"}
            continue
        state = torch.load(path, map_location="cpu", weights_only=True)["state_dict"]["net_g"]
        missing = sorted(set(target) - set(state))
        unexpected = sorted(set(state) - set(target))
        mismatched = [key for key in target.keys() & state.keys() if target[key].shape != state[key].shape]
        result[name] = {
            "status": "compatible" if not (missing or unexpected or mismatched) else "incompatible",
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "missing_keys": missing, "unexpected_keys": unexpected, "shape_mismatches": mismatched,
        }
    return result


def prepare(detector, slug, name):
    source = ROOT / "test_images" / name
    original_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    with Image.open(source) as loaded:
        photo = ImageOps.exif_transpose(loaded).convert("RGB")
        original_size = photo.size
        scale = min(1, 960 / max(photo.size))
        size = tuple(max(2, int(v * scale) // 2 * 2) for v in photo.size)
        photo = photo.resize(size, Image.Resampling.LANCZOS)
    rgb = np.asarray(photo)
    found = detector.process(rgb)
    count = len(found.multi_face_landmarks or [])
    if count != 1:
        raise ValueError(f"{name}: expected one face, detected {count}")
    w, h = size
    pts = np.array([[p.x * w, p.y * h, p.z * w] for p in found.multi_face_landmarks[0].landmark], dtype=np.float32)
    assert pts.shape == (478, 3) and np.isfinite(pts).all()
    destination = OUTPUT / slug
    data = destination / "data"
    data.mkdir(parents=True, exist_ok=True)
    photo.save(destination / "source.jpg", quality=95)
    np.save(data / "landmarks.npy", pts)
    # Repeat a genuinely static photo; no head/neck motion or borrowed identity.
    with (data / "processed.pkl").open("wb") as stream:
        pickle.dump(np.repeat(pts[None], 80, axis=0), stream)
    writer = imageio_ffmpeg.write_frames(str(data / "processed.mp4"), size, fps=25,
                                       codec="libx264", pix_fmt_out="yuv420p", macro_block_size=2,
                                       output_params=["-crf", "18", "-movflags", "+faststart"], ffmpeg_log_level="error")
    writer.send(None)
    for index in range(80):
        frame = rgb.copy()
        # Match upstream's 2x2 top-right frame-index encoding.
        for bit in range(4):
            frame[bit // 2, w - 1 - bit % 2] = 255 if (index % 16) & (1 << bit) else 0
        writer.send(frame)
    writer.close()
    cap = cv2.VideoCapture(str(data / "processed.mp4"))
    frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    ok, decoded = cap.read()
    cap.release()
    assert ok and frames == 80 and decoded.shape[:2] == (h, w)
    assert hashlib.sha256(source.read_bytes()).hexdigest() == original_hash
    from data_preparation_web import step1_crop_mouth
    rectangles, _ = step1_crop_mouth(np.repeat(pts[None], 80, axis=0).copy(), w, h)
    rect = rectangles[0].astype(int)
    assert 0 <= rect[0] < rect[2] <= w and 0 <= rect[1] < rect[3] <= h
    outline = rgb.copy()
    for p in pts:
        cv2.circle(outline, tuple(np.rint(p[:2]).astype(int)), 1, (50, 225, 175), -1)
    cv2.rectangle(outline, tuple(rect[:2]), tuple(rect[2:]), (255, 190, 60), 2)
    Image.fromarray(outline).save(destination / "landmarks.jpg", quality=95)
    result = {"id": slug, "file": name, "source_sha256": original_hash,
              "original_size": original_size, "working_size": size,
              "landmarks": 478, "face_count": count, "crop": rect.tolist(),
              "static_video_frames": frames, "animation_test": "pending_matching_weights"}
    (destination / "preflight.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return result


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    sys.path.insert(0, str(UPSTREAM))
    # max_num_faces=2 makes multi-face rejection meaningful.
    with mp.solutions.face_mesh.FaceMesh(static_image_mode=True, max_num_faces=2,
                                        refine_landmarks=True, min_detection_confidence=0.5) as detector:
        results = [prepare(detector, slug, name) for slug, name in SAMPLES]
    report = {"samples": results, "checkpoints": checkpoint_status(),
              "scope": "Local input preflight only; no animated results yet."}
    (OUTPUT / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    cards = "".join(f'<article><h2>{html.escape(row["file"])}</h2>'
                    f'<div><img src="{row["id"]}/source.jpg" alt="原图预览">'
                    f'<img src="{row["id"]}/landmarks.jpg" alt="人脸定位检查"></div>'
                    '<p>单人脸 · 478 个关键点 · 裁剪区域有效 · 原文件未改动</p></article>' for row in results)
    (OUTPUT / "index.html").write_text('<!doctype html><meta charset="utf-8">'
        '<title>三张照片 · 输入检查</title><style>'
        'body{font:16px system-ui;background:#12191d;color:#edf2f4;margin:32px}'
        'main{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}'
        'article{background:#1e2a30;padding:18px;border-radius:14px}h2{font-size:18px}'
        'article div{display:flex;gap:8px}img{width:calc(50% - 4px);object-fit:contain}'
        'p{line-height:1.8;color:#c5d3da}@media(max-width:900px){main{grid-template-columns:1fr}}'
        '</style><h1>三张照片 · 输入检查</h1>'
        '<p>左：照片预览；右：人脸关键点与模型裁剪区域。这是静态输入检查，尚未生成说话效果。<br>'
        '待提供匹配的 epoch_40_new.pth 权重后，继续嘴型生成与面部固定测试。</p>'
        f'<main>{cards}</main>', encoding="utf-8")
    print(json.dumps({"samples": results, "checkpoints": {key: value["status"] for key, value in report["checkpoints"].items()}}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

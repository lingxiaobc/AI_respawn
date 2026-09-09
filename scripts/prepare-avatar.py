"""Local single-photo -> DH_live mini2 assets. JSON progress on stdout, no cloud calls."""
from pathlib import Path
import argparse
import contextlib
import gzip
import hashlib
import json
import os
import pickle
import random
import sys
import subprocess
import threading
import time

ROOT = Path(__file__).resolve().parents[1]
REVISION = "4467e97cd97194c2c54762043cf121c6d313db12"


def watch_parent(pid):
    # Hold the exact gateway process handle, so PID reuse cannot target another app.
    # A kernel wait also avoids blocking Python's standard-input initialization.
    import ctypes
    from ctypes import wintypes
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel.OpenProcess.restype = wintypes.HANDLE
    kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
    kernel.WaitForSingleObject.restype = wintypes.DWORD
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    handle = kernel.OpenProcess(0x00100000, False, pid)  # SYNCHRONIZE only.
    if not handle:
        raise OSError("人物制作服务已退出")
    finished = threading.Event()

    def wait():
        try:
            while not finished.is_set():
                result = kernel.WaitForSingleObject(handle, 250)
                if result != 258:  # WAIT_TIMEOUT; exit/failure must stop this tree.
                    stop_owned_tree()
        finally:
            kernel.CloseHandle(handle)

    thread = threading.Thread(target=wait, daemon=True)
    thread.start()

    def close():
        finished.set()
        thread.join(timeout=1)
    return close


def stop_owned_tree():
    if os.name == "nt":
        try:
            subprocess.run([str(Path(os.environ["SystemRoot"]) / "System32/taskkill.exe"),
                            "/PID", str(os.getpid()), "/T", "/F"],
                           stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                           creationflags=subprocess.CREATE_NO_WINDOW, timeout=10, check=False)
        except (OSError, subprocess.TimeoutExpired):
            pass
    os._exit(1)


def progress(stage, percent):
    print(json.dumps({"stage": stage, "percent": percent}), flush=True)


def prepare(source, destination, upstream, weights, public_url):
    import cv2
    import imageio_ffmpeg
    import mediapipe as mp
    import numpy as np
    import torch
    from PIL import Image, ImageOps

    torch.set_num_threads(min(4, os.cpu_count() or 1))
    random.seed(0)
    np.random.seed(0)
    torch.manual_seed(0)
    sys.path.insert(0, str(upstream))
    from talkingface.models.DINet_mini import DINet_mini
    progress("checking", 5)
    # Explicit safe loading and strict matching: never deserialize arbitrary uploaded models.
    checkpoint = torch.load(weights, map_location="cpu", weights_only=True)
    DINet_mini(3, 12).load_state_dict(checkpoint["state_dict"]["net_g"], strict=True)
    source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    Image.MAX_IMAGE_PIXELS = 20_000_000
    with Image.open(source) as loaded:
        if loaded.format not in ("JPEG", "PNG", "WEBP"):
            raise ValueError("只支持 JPG、PNG 或 WebP 图片")
        if getattr(loaded, "n_frames", 1) != 1:
            raise ValueError("请上传单张静态照片")
        if loaded.width * loaded.height > 20_000_000 or min(loaded.size) < 128:
            raise ValueError("图片尺寸不合适：最短边至少 128 像素，总像素不超过 2000 万")
        photo = ImageOps.exif_transpose(loaded).convert("RGB")
        scale = min(1, 960 / max(photo.size))
        size = tuple(max(2, int(v * scale) // 2 * 2) for v in photo.size)
        photo = photo.resize(size, Image.Resampling.LANCZOS)
    rgb = np.asarray(photo)
    progress("landmarks", 20)
    with mp.solutions.face_mesh.FaceMesh(static_image_mode=True, max_num_faces=2,
                                       refine_landmarks=True, min_detection_confidence=0.5) as detector:
        found = detector.process(rgb)
    if len(found.multi_face_landmarks or []) != 1:
        raise ValueError("请使用清晰、无遮挡且只有一张人脸的照片")
    w, h = size
    pts = np.array([[p.x * w, p.y * h, p.z * w]
                    for p in found.multi_face_landmarks[0].landmark], dtype=np.float32)
    if pts.shape != (478, 3) or not np.isfinite(pts).all():
        raise ValueError("人脸关键点无效，请更换照片")
    from data_preparation_web import step1_crop_mouth, data_preparation_web
    repeated = np.repeat(pts[None], 80, axis=0)
    rectangles, _ = step1_crop_mouth(repeated.copy(), w, h)
    x1, y1, x2, y2 = rectangles[0].astype(int)
    if not (0 <= x1 < x2 <= w and 0 <= y1 < y2 <= h):
        raise ValueError("人脸距离图片边缘过近，请使用完整头像照片")
    data = destination / "data"
    data.mkdir(parents=True, exist_ok=True)
    photo.save(destination / "source.jpg", quality=95)
    np.save(data / "landmarks.npy", pts)
    with (data / "processed.pkl").open("wb") as stream:
        pickle.dump(repeated, stream)
    progress("video", 40)
    writer = imageio_ffmpeg.write_frames(str(data / "processed.mp4"), size, fps=25,
        codec="libx264", pix_fmt_out="yuv420p", macro_block_size=2,
        output_params=["-crf", "18", "-movflags", "+faststart"], ffmpeg_log_level="error")
    writer.send(None)
    try:
        for index in range(80):
            frame = rgb.copy()
            for bit in range(4):
                frame[bit // 2, w - 1 - bit % 2] = 255 if (index % 16) & (1 << bit) else 0
            writer.send(frame)
    finally:
        writer.close()
    progress("identity", 60)
    # Keep upstream code unchanged; inject the trusted, already validated weights path.
    from talkingface.render_model_mini import RenderModel_Mini
    original_load = RenderModel_Mini.loadModel
    RenderModel_Mini.loadModel = lambda self, _path: original_load(self, str(weights))
    previous_dir = Path.cwd()
    try:
        os.chdir(upstream)
        with contextlib.redirect_stdout(sys.stderr), torch.inference_mode():
            data_preparation_web(str(destination))
    finally:
        RenderModel_Mini.loadModel = original_load
        os.chdir(previous_dir)
    with gzip.open(destination / "assets/combined_data.json.gz", "rt", encoding="utf-8") as stream:
        model = json.load(stream)
    if len(model["ref_data"]) != 80 or len(model["json_data"]) != 80 or not np.isfinite(model["ref_data"]).all():
        raise ValueError("人物资源与 mini2 播放器不兼容")
    center = (pts[13, :2] + pts[14, :2]) / 2
    axis = pts[291, :2] - pts[61, :2]
    width = float(np.linalg.norm(axis))
    chin_gap = float(np.linalg.norm(pts[152, :2] - center))
    profile = {"video": public_url + "assets/01.mp4", "data": public_url + "assets/combined_data.json.gz",
        "mouth": {"x": float(center[0]), "y": float(center[1]), "rx": width * .72,
                  "ry": min(width * .49, chin_gap * .72), "angle": float(np.arctan2(axis[1], axis[0]))}}
    (destination / "profile.json").write_text(json.dumps(profile), encoding="utf-8")
    frame = (ROOT / "apps/web/public/dh-live/frame.html").read_text(encoding="utf-8")
    frame = frame.replace("<head>", '<head><base href="/dh-live/">')
    frame = frame.replace('<script src="js/pako.min.js">',
        '<script>window.PHOTO=' + json.dumps(profile).replace("<", "\\u003c") + ';</script><script src="js/pako.min.js">')
    frame = frame.replace("固定人物", "照片人物").replace("正在加载示例人物", "正在加载照片人物")
    (destination / "frame.html").write_text(frame, encoding="utf-8")
    if hashlib.sha256(source.read_bytes()).hexdigest() != source_hash:
        raise ValueError("原始照片发生变化")
    (destination / "preparation.json").write_text(json.dumps({"source_sha256": source_hash,
        "weights_sha256": hashlib.sha256(weights.read_bytes()).hexdigest(), "upstream_revision": REVISION,
        "working_size": size, "landmarks": 478, "frames": 80, "identity_values": 80,
        "seconds": round(time.monotonic() - START, 2)}, indent=2), encoding="utf-8")
    progress("ready", 100)


if __name__ == "__main__":
    START = time.monotonic()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--upstream", type=Path, default=ROOT / ".cache/dh-live-upstream")
    parser.add_argument("--weights", type=Path, default=ROOT / "epoch_40_new.pth")
    parser.add_argument("--public-url", required=True)
    parser.add_argument("--parent-pid", type=int)
    args = parser.parse_args()
    close_watcher = None
    try:
        if args.parent_pid:
            close_watcher = watch_parent(args.parent_pid)
        prepare(args.input.resolve(), args.output.resolve(), args.upstream.resolve(),
                args.weights.resolve(), args.public_url)
    except Exception as error:
        try:
            print(json.dumps({"stage": "failed", "message": str(error)}, ensure_ascii=False), flush=True)
        except (OSError, ValueError):
            if args.parent_pid:
                stop_owned_tree()
        raise SystemExit(1)
    finally:
        if close_watcher:
            close_watcher()

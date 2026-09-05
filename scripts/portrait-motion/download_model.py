"""Explicit one-time model download. Not called by the processing service."""
import hashlib
from pathlib import Path
import urllib.request

URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task"
EXPECTED = "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff"
target = Path(".motion-models/face_landmarker.task")
target.parent.mkdir(parents=True, exist_ok=True)
if not target.exists():
    with urllib.request.urlopen(URL, timeout=120) as response:
        data = response.read(20 * 1024 * 1024)
    if not 1000000 < len(data) < 20 * 1024 * 1024:
        raise ValueError("Unexpected model size")
    if hashlib.sha256(data).hexdigest() != EXPECTED:
        raise ValueError("Model changed upstream; review before use")
    with target.open("xb") as output:
        output.write(data)
digest = hashlib.sha256(target.read_bytes()).hexdigest()
if digest != EXPECTED:
    raise ValueError("Local model hash mismatch")
print(digest, target)

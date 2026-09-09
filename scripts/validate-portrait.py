"""Decode and validate a generated portrait without loading the rendering network."""
import sys
from PIL import Image, ImageOps, UnidentifiedImageError
import numpy as np
import mediapipe as mp

def validate():
    Image.MAX_IMAGE_PIXELS = 20_000_000
    try:
        with Image.open(sys.argv[1]) as image:
            if image.format not in ("JPEG", "PNG", "WEBP") or getattr(image, "n_frames", 1) != 1:
                raise ValueError("static photo required")
            if min(image.size) < 256 or image.width * image.height > 20_000_000:
                raise ValueError("unsupported dimensions")
            photo = ImageOps.exif_transpose(image).convert("RGB")
            photo.thumbnail((960, 960))
    except OSError as error:
        # Decoder errors have no OS errno. Missing/denied files are infrastructure errors.
        if error.errno is not None:
            raise
        raise ValueError("invalid image data") from error
    with mp.solutions.face_mesh.FaceMesh(static_image_mode=True, max_num_faces=2,
            refine_landmarks=True, min_detection_confidence=0.5) as detector:
        result = detector.process(np.asarray(photo))
    faces = result.multi_face_landmarks or []
    if len(faces) != 1:
        raise ValueError("one clear face required")
    pts = faces[0].landmark
    span = abs(pts[263].x - pts[33].x)
    if span < 0.07:
        raise ValueError("face too small for animation")
    # Natural tilt and a smile are allowed; this check is not an identity test.
    if any(not (0.02 < pts[i].x < 0.98 and 0.02 < pts[i].y < 0.98) for i in (61, 291, 13, 14)):
        raise ValueError("mouth too close to frame edge")


try:
    validate()
except (ValueError, UnidentifiedImageError, Image.DecompressionBombError):
    # Dedicated code avoids Python's own exit 2 for a missing script.
    sys.exit(42)

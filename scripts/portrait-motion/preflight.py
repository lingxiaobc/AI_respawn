"""Local CPU input gate; metrics are heuristics, not identity/visibility guarantees."""
import argparse
import json
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageOps
from prepare import detect


def validate_geometry(points, shape):
    height, width = shape[:2]
    if points.shape != (478, 2) or not np.isfinite(points).all():
        raise ValueError('LANDMARK_INVALID: expected 478 finite coordinates')
    selected = points[[33, 133, 362, 263, 61, 291, 13, 14]]
    if np.any(selected < 1) or np.any(selected[:, 0] >= width - 1) or np.any(selected[:, 1] >= height - 1):
        raise ValueError('FEATURE_OUTSIDE_IMAGE')
    left, right = points[[33, 133]].mean(axis=0), points[[362, 263]].mean(axis=0)
    mouth = points[[61, 291]].mean(axis=0)
    span = float(np.linalg.norm(right-left))
    if span < 30 or right[0] <= left[0]:
        raise ValueError('EYE_GEOMETRY_INVALID')
    if np.any(points[[61, 291, 13, 14], 1] <= max(left[1], right[1])) or abs(mouth[0]-(left[0]+right[0])/2) > span * .55:
        raise ValueError('FACE_NOT_FRONTAL_OR_LANDMARK_MISALIGNED')
    tilt = abs(float(np.arctan2(right[1]-left[1], right[0]-left[0])))
    if tilt > .25:
        raise ValueError('FACE_TILT_EXCEEDED: normalize requires a near-frontal input')
    return {'eyeSpanPixels': span, 'tiltRadians': tilt}


def preflight(source, output, model):
    with Image.open(source) as original:
        im = ImageOps.exif_transpose(original).convert('RGB')
        if min(im.size) < 512 or max(im.size) > 8192:
            raise ValueError('INPUT_RESOLUTION: short edge >=512, long edge <=8192')
        im.thumbnail((1536, 1536))
        rgb = np.array(im)
    points = detect(rgb, model)
    metrics = validate_geometry(points, rgb.shape)
    lo = np.floor(points.min(axis=0)).astype(int)
    hi = np.ceil(points.max(axis=0)).astype(int)
    crop = rgb[max(0, lo[1]):min(rgb.shape[0], hi[1]+1), max(0, lo[0]):min(rgb.shape[1], hi[0]+1)]
    gray = cv2.cvtColor(cv2.resize(crop, (256, 256)), cv2.COLOR_RGB2GRAY)
    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    if sharpness < 15:
        raise ValueError(f'FACE_TOO_BLURRY: Laplacian variance {sharpness:.2f} < 15')
    result = {'passed': True, **metrics, 'sharpness': sharpness, 'thresholds': {'sharpnessMin': 15, 'tiltMaxRadians': .25}, 'scope': 'local heuristic gate; not a guarantee of unobscured identity'}
    Path(output).write_text(json.dumps(result, indent=2), encoding='utf-8')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('source'); parser.add_argument('output'); parser.add_argument('--model', default='.motion-models/face_landmarker.task')
    a = parser.parse_args(); print(json.dumps(preflight(a.source, a.output, a.model)))

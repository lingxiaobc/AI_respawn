"""Basic source gate and separate strict canonical quality checks."""
import argparse
import json
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageOps


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
        raise ValueError('FACE_TILT_EXCEEDED: canonical must be near-frontal')
    return {'eyeSpanPixels': span, 'tiltRadians': tilt}


def preflight(source, output, model=None):
    # The model argument remains compatible with existing callers, but source
    # admission deliberately never loads a landmark model.
    if Path(source).stat().st_size>12*1024*1024:
        raise ValueError('SOURCE_TOO_LARGE: maximum 12MiB')
    with Image.open(source) as original:
        if original.format not in {'PNG','JPEG','WEBP'} or getattr(original,'n_frames',1)!=1:
            raise ValueError('SOURCE_FORMAT: single-frame PNG/JPEG/WebP required')
        if min(original.size) < 512 or max(original.size) > 8192:
            raise ValueError('SOURCE_RESOLUTION: short edge >=512, long edge <=8192')
        original.load()
        im = ImageOps.exif_transpose(original)
        result={'passed':True,'stage':'source-basic','width':im.width,'height':im.height,
                'facialQualityAssessed':False,'scope':'file validity only; facial quality must pass after normalization'}
    Path(output).write_text(json.dumps(result,indent=2),encoding='utf-8')
    return result


def validate_canonical_quality(rgb, points):
    if rgb.shape[:2]!=(1536,1024):
        raise ValueError('CANONICAL_SIZE: expected 1024x1536')
    metrics = validate_geometry(points, rgb.shape)
    lo = np.floor(points.min(axis=0)).astype(int)
    hi = np.ceil(points.max(axis=0)).astype(int)
    crop = rgb[max(0, lo[1]):min(rgb.shape[0], hi[1]+1), max(0, lo[0]):min(rgb.shape[1], hi[0]+1)]
    if crop.size==0:raise ValueError('FACE_CROP_EMPTY')
    gray = cv2.cvtColor(cv2.resize(crop, (256, 256)), cv2.COLOR_RGB2GRAY)
    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    if sharpness < 15:
        raise ValueError(f'FACE_TOO_BLURRY: Laplacian variance {sharpness:.2f} < 15')
    return {'passed':True,'stage':'canonical-strict','faceCount':1,**metrics,'sharpness':sharpness,
            'thresholds':{'sharpnessMin':15,'tiltMaxRadians':.25},'scope':'canonical local geometry and clarity; not identity verification'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('source'); parser.add_argument('output'); parser.add_argument('--model', default='.motion-models/face_landmarker.task')
    a = parser.parse_args(); print(json.dumps(preflight(a.source, a.output, a.model)))

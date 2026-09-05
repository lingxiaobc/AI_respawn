import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
from PIL import Image
from prepare import FEATURES, load_rgb, make_mask, prepare


def fixture_points():
    points = np.full((478, 2), [512, 650], dtype=np.float32)
    for key, center in [("mouth", [512, 800]), ("eyeLeft", [430, 630]), ("eyeRight", [590, 630])]:
        for i, index in enumerate(FEATURES[key]):
            angle = i / len(FEATURES[key]) * 2 * np.pi
            points[index] = np.array(center) + [np.cos(angle)*40, np.sin(angle)*12]
    return points


class PrepareTests(unittest.TestCase):
    def test_masks_are_local_and_follow_translation(self):
        points = fixture_points()
        mask, box = make_mask(points, "mouth", (1536, 1024, 3))
        shifted, other = make_mask(points + [10, 15], "mouth", (1536, 1024, 3))
        self.assertEqual(other, [box[0]+10, box[1]+15, box[2]+10, box[3]+15])
        self.assertTrue(np.array_equal(mask[:-15, :-10], shifted[15:, 10:]))
        self.assertLess(np.count_nonzero(mask), 1024*1536*.01)
        self.assertEqual(int(mask.max()), 255)

    def test_invalid_landmarks_rejected(self):
        points = fixture_points()
        points[0, 0] = np.nan
        with self.assertRaisesRegex(ValueError, "Invalid face"):
            make_mask(points, "mouth", (1536, 1024, 3))

    def test_transparency_and_size_are_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)/"source.png"
            Image.new("RGBA", (1024, 1536), (100, 90, 80, 254)).save(path)
            with self.assertRaisesRegex(ValueError, "opaque"):
                load_rgb(path)
            Image.new("RGB", (512, 512)).save(path)
            with self.assertRaisesRegex(ValueError, "1024x1536"):
                load_rgb(path)

    @patch('prepare.detect',return_value=fixture_points())
    def test_immutable_base_and_corrupt_cache_rejected(self, detector):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source, model, output = root/"source.png", root/"model.task", root/"out"
            Image.fromarray(np.random.default_rng(7).integers(0,256,(1536,1024,3),dtype=np.uint8)).save(source)
            model.write_bytes(b"unit-test-model")
            original = source.read_bytes()
            with patch("prepare.detect", return_value=fixture_points()):
                first = prepare(source, output, model)
            self.assertEqual(original, (output/"static_locked_base.png").read_bytes())
            self.assertEqual(first["sourceHash"], hashlib.sha256(original).hexdigest())
            self.assertEqual(prepare(source, output, model)["sourceHash"], first["sourceHash"])
            with patch('prepare.detect', side_effect=ValueError('FACE_COUNT_INVALID: detected=0')):
                with self.assertRaisesRegex(ValueError, 'CANONICAL_INVALID: FACE_COUNT_INVALID'):
                    prepare(source, output, model)
            tilted = fixture_points()
            tilted[263, 1] += 60
            tilted[362, 1] -= 60
            with patch('prepare.detect', return_value=tilted):
                for destination in [output, root/'fresh-tilted']:
                    with self.assertRaisesRegex(ValueError, 'tilt exceeds'):
                        prepare(source, destination, model)
            # Simulate internally consistent but overlapping cached masks.
            mask = np.array(Image.open(output/'mask-mouth.png'))
            box = first['regions']['mouth']['box']
            for key in FEATURES:
                Image.fromarray(mask).save(output/f'mask-{key}.png')
                first['regions'][key]['box'] = box
            Image.fromarray(mask).save(output/'mask-union.png')
            (output/'landmarks.json').write_text(json.dumps(first), encoding='utf-8')
            with patch('prepare.make_mask', return_value=(mask, box)):
                for destination in [output, root/'fresh-overlap']:
                    with self.assertRaisesRegex(ValueError, 'Movement masks overlap'):
                        prepare(source, destination, model)
            Image.new("L", (1024, 1536)).save(output/"mask-mouth.png")
            with self.assertRaisesRegex(ValueError, "mask/ROI mismatch"):
                prepare(source, output, model)
            self.assertEqual(source.read_bytes(), original)


if __name__ == "__main__":
    unittest.main()

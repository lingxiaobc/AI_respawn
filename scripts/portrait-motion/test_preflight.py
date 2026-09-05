import unittest
import numpy as np
from pathlib import Path
import tempfile
from unittest.mock import patch
from types import SimpleNamespace
from PIL import Image
from preflight import validate_geometry,preflight,validate_canonical_quality
from prepare import detect,prepare


class GeometryGate(unittest.TestCase):
    def test_source_does_not_require_landmarks_and_invalid_files_still_fail(self):
        with tempfile.TemporaryDirectory() as temp:
            source,report=Path(temp)/'source.png',Path(temp)/'report.json'
            Image.new('RGB',(512,512)).save(source)
            with patch('prepare.detect',side_effect=AssertionError('source must not detect')):
                result=preflight(source,report,'missing-model')
            self.assertFalse(result['facialQualityAssessed']);self.assertEqual(result['stage'],'source-basic')
            Image.new('RGB',(32,32)).save(source)
            with self.assertRaisesRegex(ValueError,'SOURCE_RESOLUTION'):preflight(source,report)
            source.write_bytes(b'not an image')
            with self.assertRaises(OSError):preflight(source,report)
            Image.new('RGB',(512,512)).save(source,format='BMP')
            with self.assertRaisesRegex(ValueError,'SOURCE_FORMAT'):preflight(source,report)

    def test_canonical_clarity_size_and_geometry_are_strict(self):
        noise=np.random.default_rng(4).integers(0,256,(1536,1024,3),dtype=np.uint8)
        self.assertTrue(validate_canonical_quality(noise,self.points())['passed'])
        with self.assertRaisesRegex(ValueError,'FACE_TOO_BLURRY'):validate_canonical_quality(np.zeros_like(noise),self.points())
        with self.assertRaisesRegex(ValueError,'CANONICAL_SIZE'):validate_canonical_quality(noise[:500],self.points())

    def test_face_count_diagnostics_and_canonical_stage(self):
        for count in (0,2):
            with patch('prepare.mp.tasks.vision.FaceLandmarker.create_from_options') as factory:
                factory.return_value.__enter__.return_value.detect.return_value=SimpleNamespace(face_landmarks=[[]]*count)
                with self.assertRaisesRegex(ValueError,f'detected={count}, expected=1'):detect(np.zeros((512,512,3),np.uint8),'unused.task')
        with tempfile.TemporaryDirectory() as temp:
            source=Path(temp)/'canonical.png';Image.new('RGB',(1024,1536)).save(source)
            with patch('prepare.detect',side_effect=ValueError('FACE_COUNT_INVALID: detected=0, expected=1')):
                with self.assertRaisesRegex(ValueError,'CANONICAL_INVALID: FACE_COUNT_INVALID'):prepare(source,Path(temp)/'out','unused.task')

    def points(self):
        p = np.full((478, 2), 100., dtype=np.float32)
        p[[33, 133]] = [100, 100]; p[[362, 263]] = [200, 100]
        p[[61, 291, 13, 14]] = [150, 200]
        return p

    def test_valid(self):
        self.assertEqual(validate_geometry(self.points(), (500, 500))['eyeSpanPixels'], 100)

    def test_rejects_unsafe_coordinates(self):
        for index, value in [(33, [float('nan'), 100]), (13, [-1, 100]), (61, [150, 1]), (263, [200, 250])]:
            p = self.points(); p[index] = value
            with self.subTest(index=index), self.assertRaises(ValueError): validate_geometry(p, (500, 500))

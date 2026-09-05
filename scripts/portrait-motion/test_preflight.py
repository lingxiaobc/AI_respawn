import unittest
import numpy as np
from preflight import validate_geometry


class GeometryGate(unittest.TestCase):
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

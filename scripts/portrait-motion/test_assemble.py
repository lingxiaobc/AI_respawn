import unittest
import numpy as np
from assemble import boundary_points, triangles, mesh_warp, morph_frames, composite, FRAME_COUNT


class AssembleTests(unittest.TestCase):
    def test_invalid_morph_triangles_fail_closed(self):
        image = np.zeros((20,20,3),np.uint8)
        good = np.array([[2,2],[16,2],[8,16]],np.float32)
        bad = [np.array([[2,2],[8,2],[16,2]],np.float32), good[[0,2,1]], good*np.nan]
        for points in bad:
            with self.assertRaises(ValueError):
                mesh_warp(image,points,good,[[0,1,2]])
            with self.assertRaises(ValueError):
                mesh_warp(image,good,points,[[0,1,2]])

    def test_identity_mesh_and_endpoints(self):
        yy,xx = np.mgrid[:32,:48]
        image = np.stack([xx*4,yy*6,np.full_like(xx,100)],axis=-1).astype(np.uint8)
        points = np.concatenate([np.array([[20,12],[25,20]],np.float32),boundary_points(48,32)])
        tri = triangles(points,48,32)
        self.assertGreater(len(tri),4)
        np.testing.assert_array_equal(mesh_warp(image,points,points,tri), image)
        states = [image,np.minimum(image.astype(int)+5,255).astype(np.uint8),np.minimum(image.astype(int)+10,255).astype(np.uint8)]
        frames = list(morph_frames(states,[points,points,points]))
        self.assertEqual(len(frames),FRAME_COUNT)
        for index,source in [(0,0),(10,1),(20,2)]:
            np.testing.assert_array_equal(frames[index],states[source])

    def test_composite_preserves_every_external_pixel_and_parameters(self):
        base = np.full((80,100,3),73,np.uint8)
        tracks = {}
        union = np.zeros(base.shape[:2],bool)
        for key,x in [("mouth",5),("eyeLeft",35),("eyeRight",65)]:
            mask = np.zeros((16,16),np.uint8); mask[3:13,3:13]=255
            frames = [np.dstack([np.full((16,16,3),i*10,np.uint8),mask]) for i in range(FRAME_COUNT)]
            tracks[key] = {"box":[x,20,x+16,36],"frames":frames}
            union[20:36,x:x+16]=mask>0
        frame = composite(base,tracks,[1,0,.5])
        np.testing.assert_array_equal(frame[~union],base[~union])
        self.assertEqual(int(frame[25,10,0]),200)
        self.assertEqual(int(frame[25,40,0]),0)
        self.assertEqual(int(frame[25,70,0]),100)


if __name__ == "__main__": unittest.main()

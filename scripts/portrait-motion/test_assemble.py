import unittest
from unittest.mock import patch
import numpy as np
import cv2
from assemble import boundary_points, triangles, mesh_warp, morph_frames, composite, FRAME_COUNT, texture_alignment, align_donor, FEATURES, MOUTH_OUTER


class AssembleTests(unittest.TestCase):
    def test_topology_search_covers_between_quarter_candidates_and_rejects_no_solution(self):
        images=[np.zeros((20,20,3),np.uint8) for _ in range(3)]
        triangle=np.array([[2,2],[12,2],[7,12]],np.float32)
        points=[triangle+[i,0] for i in range(3)]
        def narrow_window(p,w,h):
            phase=float(p[0,0])%1
            return [[0,1,2]] if .04<phase<.16 else []
        with patch('assemble.triangles',side_effect=narrow_window):
            self.assertEqual(len(list(morph_frames(images,points))),FRAME_COUNT)
        with patch('assemble.triangles',return_value=[]):
            with self.assertRaisesRegex(ValueError,'No non-flipping'):list(morph_frames(images,points))

    def test_mouth_displacement_uses_independent_texture_without_relaxing_gate(self):
        points=np.zeros((478,2),np.float32);points[61]=[10,10];points[291]=[110,10]
        base=np.zeros((128,128,3),np.uint8)
        bad=np.array([[1,0,0],[0,1,20]],np.float32)
        good=np.array([[1,0,0],[0,1,0]],np.float32)
        with patch('assemble.cv2.estimateAffinePartial2D',return_value=(bad,np.ones((17,1),np.uint8))),patch('assemble.texture_alignment',return_value=(good,{'method':'stable-face-texture','textureCorrelation':.99})) as texture:
            _,result,report=align_donor(base,base,points,points)
            texture.assert_called_once();np.testing.assert_array_equal(result,points)
            self.assertEqual(report['fallbackReason'],'landmark-mouth-displacement')
        with patch('assemble.cv2.estimateAffinePartial2D',return_value=(bad,np.ones((17,1),np.uint8))),patch('assemble.texture_alignment',side_effect=ValueError('correlation rejected')):
            with self.assertRaisesRegex(ValueError,'correlation rejected'):align_donor(base,base,points,points)

    def test_texture_registration_recovers_small_shift_and_rejects_unrelated_image(self):
        rng=np.random.default_rng(71)
        gray=cv2.GaussianBlur(rng.integers(0,256,(1536,1024),dtype=np.uint8),(9,9),0)
        base=np.repeat(gray[:,:,None],3,axis=2)
        theta=np.linspace(0,2*np.pi,478)
        points=np.column_stack([512+220*np.cos(theta),720+300*np.sin(theta)]).astype(np.float32)
        for ids,center in [(MOUTH_OUTER,(512,850)),(FEATURES['eyeLeft'],(420,660)),(FEATURES['eyeRight'],(604,660))]:
            angles=np.linspace(0,2*np.pi,len(ids),endpoint=False)
            points[ids]=np.array(center)+np.column_stack([35*np.cos(angles),10*np.sin(angles)])
        donor=cv2.warpAffine(base,np.array([[1,0,3],[0,1,-2]],np.float32),(1024,1536))
        matrix,report=texture_alignment(base,donor,points)
        self.assertGreater(report['textureCorrelation'],.97)
        np.testing.assert_allclose(matrix[:,2],[-3,2],atol=.5)
        with self.assertRaises(ValueError):
            texture_alignment(base,np.zeros_like(base),points)

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

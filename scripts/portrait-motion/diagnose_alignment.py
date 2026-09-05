"""Read-only geometry diagnostics for cached donors; no generation."""
import json
import sys
from pathlib import Path
import cv2
import numpy as np
from prepare import load_rgb, detect
from assemble import STABLE, transform_points, MOUTH_OUTER, FEATURES

folder=Path(sys.argv[1])
reference=np.array(json.loads((folder/'landmarks.json').read_text())['landmarks'],np.float32)
for state in ['mouth-half','mouth-open','eyes-half','eyes-closed']:
    points=detect(load_rgb(folder/'donors'/f'{state}.png'),'.motion-models/face_landmarker.task')
    matrix,inliers=cv2.estimateAffinePartial2D(points[STABLE],reference[STABLE],method=cv2.RANSAC,ransacReprojThreshold=3)
    moved=transform_points(points,matrix)
    robust,_=cv2.estimateAffinePartial2D(points[STABLE],reference[STABLE],method=cv2.LMEDS)
    distances=np.linalg.norm(transform_points(points[STABLE],robust)-reference[STABLE],axis=1)
    print(json.dumps({'candidate':'LMEDS','state':state,'inliers3px':int((distances<=3).sum()),'median':float(np.median(distances)),'matrix':robust.tolist()}))
    if state=='eyes-closed':
        base=load_rgb(folder/'static_locked_base.png');donor=load_rgb(folder/'donors'/f'{state}.png')
        mask=np.zeros(base.shape[:2],np.uint8);cv2.fillConvexPoly(mask,cv2.convexHull(reference.astype(np.int32)),255)
        for ids in [MOUTH_OUTER,FEATURES['eyeLeft'],FEATURES['eyeRight']]:
            lo=np.floor(reference[ids].min(axis=0)-25).astype(int);hi=np.ceil(reference[ids].max(axis=0)+25).astype(int)
            mask[lo[1]:hi[1],lo[0]:hi[0]]=0
        gray=lambda x:cv2.resize(cv2.GaussianBlur(cv2.cvtColor(x,cv2.COLOR_RGB2GRAY),(9,9),0),(512,768))
        try:
            score,ecc=cv2.findTransformECC(gray(base),gray(donor),np.eye(2,3,dtype=np.float32),cv2.MOTION_EUCLIDEAN,(cv2.TERM_CRITERIA_EPS|cv2.TERM_CRITERIA_COUNT,100,1e-5),cv2.resize(mask,(512,768)),5)
            print(json.dumps({'candidate':'ECC','score':score,'matrix':ecc.tolist()}))
        except cv2.error as e:print(str(e))
    print(json.dumps({'state':state,'inliers':int(inliers.sum()),'matrix':matrix.tolist(),
      'residuals':dict(zip(STABLE,np.linalg.norm(moved[STABLE]-reference[STABLE],axis=1).tolist())),
      'cornerOffsets':(moved[[33,133,362,263]]-reference[[33,133,362,263]]).tolist()}))

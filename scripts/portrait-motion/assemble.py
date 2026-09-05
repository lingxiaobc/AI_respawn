"""Align local donors and bake small CPU-morphed mouth/eye sprite atlases.

The immutable base is never punched out. Independent half-state donors anchor
each morph; adjacent textures are geometrically registered before blending.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import tempfile
import time

import cv2
import numpy as np
from PIL import Image, ImageDraw
from prepare import detect, load_rgb, prepare, FEATURES

MOUTH_OUTER = [61, 40, 37, 0, 267, 270, 291, 321, 314, 17, 84, 91]
MOUTH_INNER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95]
STABLE = [1, 4, 5, 6, 168, 197, 195, 33, 133, 362, 263, 234, 454, 10, 152, 127, 356]
FRAME_COUNT = 21


def transform_points(points, matrix):
    return points @ matrix[:, :2].T + matrix[:, 2]


def align_donor(base, donor, base_points, donor_points):
    matrix, inliers = cv2.estimateAffinePartial2D(donor_points[STABLE], base_points[STABLE],
        method=cv2.RANSAC, ransacReprojThreshold=3.0)
    if matrix is None or inliers.sum() < 8:
        raise ValueError("Donor cannot be aligned using stable facial features")
    scale = float(np.linalg.norm(matrix[0, :2]))
    if not .85 < scale < 1.15:
        raise ValueError("Donor changed face scale too much")
    aligned = cv2.warpAffine(donor, matrix, (base.shape[1], base.shape[0]), flags=cv2.INTER_CUBIC,
                             borderMode=cv2.BORDER_REFLECT_101)
    points = transform_points(donor_points, matrix).astype(np.float32)
    residual = float(np.median(np.linalg.norm(points[STABLE] - base_points[STABLE], axis=1)))
    if residual > 4:
        raise ValueError("Donor stable-feature residual exceeds 4px")
    return aligned, points, {"matrix": matrix.tolist(), "stableMedianErrorPx": residual}


def boundary_points(width, height):
    return np.array([[0,0], [(width-1)/2,0], [width-1,0], [width-1,(height-1)/2],
        [width-1,height-1], [(width-1)/2,height-1], [0,height-1], [0,(height-1)/2]], np.float32)


def triangles(points, width, height):
    subdivision = cv2.Subdiv2D((0, 0, width, height))
    for x,y in points:
        subdivision.insert((float(np.clip(x, .01, width-1.01)), float(np.clip(y, .01, height-1.01))))
    result = []
    for triangle in subdivision.getTriangleList().reshape(-1, 3, 2):
        ids = [int(np.argmin(np.linalg.norm(points-p, axis=1))) for p in triangle]
        if len(set(ids)) == 3 and all(np.linalg.norm(points[i]-p) < 1 for i,p in zip(ids,triangle)):
            result.append(ids)
    return result


def mesh_warp(image, source, target, topology):
    if not np.all(np.isfinite(source)) or not np.all(np.isfinite(target)):
        raise ValueError("Non-finite morph control points")
    height, width = image.shape[:2]
    output = image.astype(np.float32).copy()
    for ids in topology:
        a, b = source[ids].astype(np.float32), target[ids].astype(np.float32)
        area_a = float(np.linalg.det(np.stack([a[1]-a[0], a[2]-a[0]])))
        area_b = float(np.linalg.det(np.stack([b[1]-b[0], b[2]-b[0]])))
        if min(abs(area_a), abs(area_b)) < .05 or area_a * area_b <= 0:
            raise ValueError("Degenerate or flipped morph triangle; resource cannot be published")
        transform = cv2.getAffineTransform(a, b)
        if not np.all(np.isfinite(transform)):
            raise ValueError("Non-finite morph transform")
        warped = cv2.warpAffine(image, transform, (width, height), flags=cv2.INTER_LINEAR,
                               borderMode=cv2.BORDER_REFLECT_101)
        mask = np.zeros((height, width), np.uint8)
        cv2.fillConvexPoly(mask, np.round(b*16).astype(np.int32), 255, shift=4)
        output[mask > 0] = warped[mask > 0]
    return output


def control_points(points, key, box):
    ids = MOUTH_OUTER + MOUTH_INNER if key == "mouth" else FEATURES[key]
    local = points[ids] - np.array(box[:2], np.float32)
    w,h = box[2]-box[0], box[3]-box[1]
    if np.any(local[:,0] < 1) or np.any(local[:,0] > w-2) or np.any(local[:,1] < 1) or np.any(local[:,1] > h-2):
        raise ValueError(f"{key}: moving feature exceeds approved ROI; do not silently enlarge mask")
    return np.concatenate([local, boundary_points(w,h)])


def close_original_mouth(crop, points, box):
    """Remove a small pre-existing lip gap with local geometry, not a new face."""
    source = control_points(points, "mouth", box)
    target = source.copy()
    upper_ids = [78,191,80,81,82,13,312,311,310,415,308]
    lower_ids = [78,95,88,178,87,14,317,402,318,324,308]
    upper = points[upper_ids]
    lower = points[lower_ids]
    order = np.argsort(upper[:,0]); upper = upper[order]
    order = np.argsort(lower[:,0]); lower = lower[order]
    ids = MOUTH_OUTER + MOUTH_INNER
    for i,index in enumerate(ids):
        x,y = points[index]
        top = float(np.interp(x, upper[:,0], upper[:,1]))
        bottom = float(np.interp(x, lower[:,0], lower[:,1]))
        gap = max(0, bottom-top-.7)
        target[i,1] += gap*.5 if y <= (top+bottom)/2 else -gap*.5
    topology = triangles((source+target)/2, crop.shape[1], crop.shape[0])
    return np.clip(mesh_warp(crop, source, target, topology),0,255).astype(np.uint8), target


def calibrate_mouth(crop, controls, target_ratio, reference_width):
    """Invertible local vertical remap; retain identity at top/bottom crop edges.

    Compress oral interior for closure instead of cross-fading visible teeth.
    Lip profile is expressed in the original mouth-corner coordinate system.
    """
    ids = MOUTH_OUTER + MOUTH_INNER
    a,b = controls[ids.index(61)],controls[ids.index(291)]
    direction=(b-a)/np.linalg.norm(b-a); normal=np.array([-direction[1],direction[0]])
    origin=(a+b)/2
    uv=(controls-origin)@np.stack([direction,normal]).T
    upper_ids=[78,191,80,81,82,13,312,311,310,415,308]
    lower_ids=[78,95,88,178,87,14,317,402,318,324,308]
    up=uv[[ids.index(i) for i in upper_ids]];down=uv[[ids.index(i) for i in lower_ids]]
    up=up[np.argsort(up[:,0])];down=down[np.argsort(down[:,0])]
    h,w=crop.shape[:2]; yy,xx=np.mgrid[:h,:w].astype(np.float32)
    x=(xx-origin[0])*direction[0]+(yy-origin[1])*direction[1]
    y=(xx-origin[0])*normal[0]+(yy-origin[1])*normal[1]
    gap=abs(float(uv[ids.index(14),1]-uv[ids.index(13),1]))
    # A subpixel closure keeps the inverse mapping finite without a visible cavity.
    wanted=max(.15,target_ratio*reference_width)
    scale=wanted/max(gap,.15)
    if scale>1.5:raise ValueError('Mouth donor opening too small for safe geometric calibration')
    radius=max(abs(float(uv[-8:,1].min())),abs(float(uv[-8:,1].max())))+1
    def profile(xs):
        top=np.interp(xs,up[:,0],up[:,1]);bottom=np.interp(xs,down[:,0],down[:,1])
        bottom=np.maximum(bottom,top+.15)
        midpoint=(top+bottom)/2
        return top,bottom,midpoint-(bottom-top)*scale/2,midpoint+(bottom-top)*scale/2
    top,bottom,new_top,new_bottom=profile(x)
    original_y=np.where(y<new_top,-radius+(y+radius)*(top+radius)/np.maximum(new_top+radius,.01),
                 np.where(y>new_bottom,radius-(radius-y)*(radius-bottom)/np.maximum(radius-new_bottom,.01),
                          top+(y-new_top)*(bottom-top)/np.maximum(new_bottom-new_top,.01)))
    if target_ratio == 0:
        # Never resample teeth into a subpixel closed slit. Use adjoining lip tissue.
        middle=(new_top+new_bottom)/2
        original_y=np.where(np.abs(y-middle)<1.0,np.where(y<=middle,top-1.25,bottom+1.25),original_y)
    # Do not move skin beyond the mouth corners or crop's normal extent.
    active=(x>=up[0,0])&(x<=up[-1,0])&(np.abs(y)<radius)
    original_y=np.where(active,original_y,y)
    map_x=origin[0]+x*direction[0]+original_y*normal[0]
    map_y=origin[1]+x*direction[1]+original_y*normal[1]
    result=cv2.remap(crop,map_x.astype(np.float32),map_y.astype(np.float32),cv2.INTER_LINEAR,borderMode=cv2.BORDER_REFLECT_101)
    target=controls.copy()
    top,bottom,new_top,new_bottom=profile(uv[:-8,0]);ys=uv[:-8,1]
    ty=np.where(ys<top,-radius+(ys+radius)*(new_top+radius)/np.maximum(top+radius,.01),
        np.where(ys>bottom,radius-(radius-ys)*(radius-new_bottom)/np.maximum(radius-bottom,.01),
                 new_top+(ys-top)*(new_bottom-new_top)/np.maximum(bottom-top,.01)))
    target[:-8]=origin+uv[:-8,0,None]*direction+ty[:,None]*normal
    return result,target,{'rawRatio':gap/reference_width,'targetRatio':target_ratio,'scale':scale}


def local_donor(base, aligned, donor_points, base_points, key, box, mask, mouth_target=None):
    # Lock eye/mouth corners locally after stable-face similarity registration.
    corners = [61,291] if key == "mouth" else ([33,133] if key == "eyeLeft" else [362,263])
    shift = np.mean(base_points[corners] - donor_points[corners], axis=0)
    reference_width = float(np.linalg.norm(base_points[corners[1]]-base_points[corners[0]]))
    if np.linalg.norm(shift) > (reference_width*.12 if key=='mouth' else 10):
        raise ValueError(f"{key}: donor local displacement too large")
    va = donor_points[corners[1]]-donor_points[corners[0]]
    vb = base_points[corners[1]]-base_points[corners[0]]
    ratio = reference_width/float(np.linalg.norm(va))
    angle = float(np.arctan2(vb[1],vb[0])-np.arctan2(va[1],va[0]))
    if not .85 <= ratio <= 1.15 or abs(angle) > .20:
        raise ValueError(f"{key}: donor changed local width or tilt excessively")
    rotation = ratio*np.array([[np.cos(angle),-np.sin(angle)],[np.sin(angle),np.cos(angle)]],np.float32)
    translation = base_points[corners].mean(axis=0)-rotation@donor_points[corners].mean(axis=0)
    matrix = np.column_stack([rotation,translation])
    shifted = cv2.warpAffine(aligned, matrix,
                            (base.shape[1], base.shape[0]), borderMode=cv2.BORDER_REFLECT_101)
    x0,y0,x1,y1 = box
    aligned_points = transform_points(donor_points,matrix)
    if key == 'mouth' and mouth_target is not None:
        # Sample a larger donor-only scratch patch before contraction; final ROI stays unchanged.
        pad = int(reference_width*.5)
        scratch = [max(0,x0-pad),max(0,y0-pad),min(base.shape[1],x1+pad),min(base.shape[0],y1+pad)]
        sx,sy,sr,sb=scratch
        work,cp,_=calibrate_mouth(shifted[sy:sb,sx:sr],control_points(aligned_points,key,scratch),mouth_target,reference_width)
        crop=work[y0-sy:y1-sy,x0-sx:x1-sx].astype(np.float32)
        ids=MOUTH_OUTER+MOUTH_INNER
        for i,index in enumerate(ids):aligned_points[index]=cp[i]+[sx,sy]
    else:
        crop = shifted[y0:y1,x0:x1].astype(np.float32)
    original = base[y0:y1,x0:x1]
    ring = (mask > 0) & (mask < 100)
    offset = np.median(original[ring].astype(np.float32)-crop[ring],axis=0)
    if np.max(np.abs(offset)) > 30:
        raise ValueError(f"{key}: donor lighting differs excessively")
    crop = np.clip(crop+offset,0,255).astype(np.uint8)
    return crop, control_points(aligned_points,key,box), offset.tolist()


def morph_frames(images, points):
    h,w = images[0].shape[:2]
    topology = [triangles((points[i]+points[i+1])/2,w,h) for i in range(2)]
    for index in range(FRAME_COUNT):
        value = index/(FRAME_COUNT-1)*2
        segment = min(1,int(value)); t = value-segment
        if t == 0:
            yield images[segment].copy(); continue
        if t == 1:
            yield images[segment+1].copy(); continue
        target = points[segment]*(1-t)+points[segment+1]*t
        left = mesh_warp(images[segment],points[segment],target,topology[segment])
        right = mesh_warp(images[segment+1],points[segment+1],target,topology[segment])
        yield np.clip(left*(1-t)+right*t,0,255).astype(np.uint8)


def composite(base, tracks, values):
    output = base.copy()
    for key,value in zip(["mouth","eyeLeft","eyeRight"],values):
        region = tracks[key]
        x0,y0,x1,y1 = region["box"]
        rgba = region["frames"][round(value*(FRAME_COUNT-1))]
        alpha = rgba[:,:,3:4].astype(np.float32)/255
        original = output[y0:y1,x0:x1]
        mixed = np.round(rgba[:,:,:3]*alpha+original*(1-alpha)).astype(np.uint8)
        # Exact external pixels, independent of floating point rounding.
        original[rgba[:,:,3] > 0] = mixed[rgba[:,:,3] > 0]
    return output


def assemble(directory, model):
    start = time.monotonic(); directory = Path(directory)
    base_path = directory/"static_locked_base.png"
    # Revalidate all cached masks, geometry and model before trusting the ROI.
    contract = prepare(base_path, directory, model)
    if hashlib.sha256(base_path.read_bytes()).hexdigest() != contract["sourceHash"]:
        raise ValueError("Immutable base hash mismatch")
    base = load_rgb(base_path); base_points = np.array(contract["landmarks"],np.float32)
    donors, alignment = {}, {}
    for state in ["mouth-half","mouth-open","eyes-half","eyes-closed"]:
        path = directory/"donors"/f"{state}.png"
        rgb = load_rgb(path)
        aligned,points,report = align_donor(base,rgb,base_points,detect(rgb,model))
        donors[state] = (aligned,points)
        alignment[state] = {**report,"sha256":hashlib.sha256(path.read_bytes()).hexdigest()}
    # Never overwrite a previously usable atlas when a later track fails.
    # Failed builds remain inspectable; consumers only follow the success pointer.
    tracks = {}; out = Path(tempfile.mkdtemp(prefix="resource-build-",dir=directory))
    union = np.array(Image.open(directory/"mask-union.png").convert("L"))
    manifest = {"version":"portrait-motion-v1", "width":1024,"height":1536,
        "sourceHash":contract["sourceHash"],"base":"../static_locked_base.png",
        "eyeConvention":"viewer-left/right; 0=open, 1=closed", "tracks":{}}
    for key,region in contract["regions"].items():
        box = region["box"]; x0,y0,x1,y1 = box
        mask = np.array(Image.open(directory/region["mask"]).convert("L"))[y0:y1,x0:x1]
        original = base[y0:y1,x0:x1]
        p0 = control_points(base_points,key,box)
        if key == "mouth":
            first,p0,closed_report = calibrate_mouth(original,p0,0,float(np.linalg.norm(base_points[291]-base_points[61])))
            alignment['mouth-closed'] = closed_report
        else:
            first = original
        state_names = ["mouth-half","mouth-open"] if key == "mouth" else ["eyes-half","eyes-closed"]
        images,points = [first],[p0]
        for state in state_names:
            target = (.10 if state=='mouth-half' else .22) if key=='mouth' else None
            crop,p,offset = local_donor(base,*donors[state],base_points,key,box,mask,mouth_target=target)
            if target is not None:
                # Measure the actual masked composite, not only transformed control points.
                internal_target=target
                axis=base_points[291]-base_points[61];width=float(np.linalg.norm(axis));normal=np.array([-axis[1],axis[0]])/width
                for attempt in range(3):
                    candidate=base.copy();alpha=mask[:,:,None].astype(np.float32)/255
                    candidate[y0:y1,x0:x1]=np.round(crop*alpha+original*(1-alpha)).astype(np.uint8)
                    measured_points=detect(candidate,model)
                    measured=abs(float(np.dot(measured_points[14]-measured_points[13],normal)))/width
                    if target-.02 <= measured <= target+.02:break
                    if attempt==2 or measured<.025:raise ValueError(f'{state}: calibrated mouth amplitude failed ({measured:.3f})')
                    internal_target+=float(np.clip(internal_target*(target/measured-1),-.01,.01))
                    if not .05<=internal_target<=.35:raise ValueError('Unsafe amplitude correction requested')
                    crop,p,offset=local_donor(base,*donors[state],base_points,key,box,mask,mouth_target=internal_target)
                alignment[state]['calibration']={'requestedRatio':target,'internalTargetRatio':internal_target,'measuredCompositeRatio':measured}
            images.append(crop); points.append(p)
            alignment[state][key+"ColorOffset"] = offset
        frames = [np.dstack([frame,mask]) for frame in morph_frames(images,points)]
        tracks[key] = {"box":box,"frames":frames}
        w,h = x1-x0,y1-y0
        atlas = Image.new("RGBA",(w*7,h*3))
        for i,frame in enumerate(frames):
            atlas.paste(Image.fromarray(frame),(i%7*w,i//7*h))
        atlas.save(out/f"{key}-atlas.png")
        for i,label in [(0,"neutral"),(10,"half"),(20,"end")]:
            Image.fromarray(frames[i]).save(out/f"{key}-{label}.png")
        manifest["tracks"][key] = {"box":box,"atlas":f"{key}-atlas.png","columns":7,"frameCount":FRAME_COUNT,"frameWidth":w,"frameHeight":h}
    checks = [(0,0,0),(.3,0,0),(.5,0,0),(.8,0,0),(1,0,0),
              (0,.3,.3),(0,.5,.5),(0,.8,.8),(0,1,1),(1,1,1),(.5,1,0),(.8,0,1)]
    sheet = Image.new("RGB",(4*300,3*330),(30,30,30)); draw = ImageDraw.Draw(sheet)
    relevant = base_points[MOUTH_OUTER + FEATURES["eyeLeft"] + FEATURES["eyeRight"]]
    lo,hi = relevant.min(axis=0), relevant.max(axis=0)
    extent = max(float(hi[0]-lo[0]),float(hi[1]-lo[1]))*1.55
    center = (lo+hi)/2
    face_box = (max(0,int(center[0]-extent/2)), max(0,int(center[1]-extent/2)),
                min(1024,int(center[0]+extent/2)), min(1536,int(center[1]+extent/2)))
    outside_errors = 0
    for i,values in enumerate(checks):
        frame = composite(base,tracks,values)
        errors = int(np.count_nonzero(np.any(frame!=base,axis=2)&(union==0)))
        outside_errors += errors
        # Close face crop for honest visual inspection, not distant full portrait.
        face = Image.fromarray(frame).crop(face_box).resize((300,300))
        sheet.paste(face,(i%4*300,i//4*330+30))
        draw.text((i%4*300+5,i//4*330+7),f"mouth/L/R {values}",fill="white")
    if outside_errors: raise ValueError("Pixels changed outside approved movement masks")
    sheet.save(out/"contact-sheet.png")
    Image.fromarray(composite(base,tracks,(0,0,0))).save(out/"neutral-preview.png")
    report = {"outsideMaskChangedPixels":outside_errors,"statesChecked":checks,"alignment":alignment,
        "elapsedSeconds":time.monotonic()-start,"visualReview":"pending","interpolation":"piecewise-affine adjacent independent half-state morph"}
    (out/"manifest.json").write_text(json.dumps(manifest,indent=2),encoding="utf-8")
    (out/"qa.json").write_text(json.dumps(report,indent=2),encoding="utf-8")
    pointer = directory/f".{out.name}-pointer.json"
    pointer.write_text(json.dumps({"resource":out.name,"visualReview":"pending"}),encoding="utf-8")
    os.replace(pointer,directory/"resource-candidate.json")
    print(json.dumps({"resource":str(out),"outsideMaskChangedPixels":outside_errors,"elapsedSeconds":report["elapsedSeconds"]}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(); parser.add_argument("directory")
    parser.add_argument("--model",default=".motion-models/face_landmarker.task")
    args = parser.parse_args(); assemble(args.directory,args.model)

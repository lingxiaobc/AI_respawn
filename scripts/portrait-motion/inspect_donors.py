"""Measure donor opening ratios and export a registered static comparison."""
import argparse
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from prepare import detect, load_rgb
from assemble import align_donor


def opening(points, reference):
    axis=reference[291]-reference[61]
    width=float(np.linalg.norm(axis)); normal=np.array([-axis[1],axis[0]])/width
    return abs(float(np.dot(points[14]-points[13],normal)))/width


def inspect(directory, model):
    directory=Path(directory);contract=json.loads((directory/'landmarks.json').read_text())
    base=load_rgb(directory/'static_locked_base.png');reference=np.array(contract['landmarks'],np.float32)
    images=[('base',base,reference,{})]
    for state in ['mouth-half','mouth-open','eyes-half','eyes-closed']:
        path=directory/'donors'/f'{state}.png'
        if not path.exists():continue
        rgb=load_rgb(path)
        aligned,points,report=align_donor(base,rgb,reference,detect(rgb,model))
        images.append((state,aligned,points,report))
    sheet=Image.new('RGB',(320*len(images),460),'#222222');draw=ImageDraw.Draw(sheet)
    regions=list(contract['regions'].values());boxes=[r['box'] for r in regions]
    lo=np.array([min(b[0] for b in boxes),min(b[1] for b in boxes)])-30
    hi=np.array([max(b[2] for b in boxes),max(b[3] for b in boxes)])+30
    box=tuple(np.r_[lo,hi].astype(int));report={}
    for i,(state,rgb,points,alignment) in enumerate(images):
        ratio=opening(points,reference)
        report[state]={'estimatedMouthOpeningRatio':ratio,**alignment}
        sheet.paste(Image.fromarray(rgb).crop(box).resize((320,400)),(i*320,40))
        draw.text((i*320+8,8),f'{state} H/W={ratio:.3f}',fill='white')
    half=report.get('mouth-half',{}).get('estimatedMouthOpeningRatio')
    opened=report.get('mouth-open',{}).get('estimatedMouthOpeningRatio')
    report['measurement']='MediaPipe central inner lip landmarks projected normal to original corner line; visual verification required'
    if half is not None and opened is not None:
        report['mouthAmplitudeGate']={'halfInRange':.08<=half<=.12,'openInRange':.20<=opened<=.24,'separationAtLeast008':opened-half>=.08}
    sheet.save(directory/'donor-contact-sheet.png')
    (directory/'donor-inspection.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(report))


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('directory');parser.add_argument('--model',default='.motion-models/face_landmarker.task');args=parser.parse_args();inspect(args.directory,args.model)

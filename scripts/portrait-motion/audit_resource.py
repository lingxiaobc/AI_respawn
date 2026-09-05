"""Audit every atlas frame and measure the final mouth anchors after compositing."""
import argparse
import json
from pathlib import Path
import numpy as np
from PIL import Image
from prepare import load_rgb,detect
from inspect_donors import opening
from assemble import composite


def audit(directory,model):
    directory=Path(directory);pointer=directory/'resource-candidate.json'
    if not pointer.exists():pointer=directory/'resource-current.json'
    resource=directory/json.loads(pointer.read_text())['resource']
    manifest=json.loads((resource/'manifest.json').read_text());contract=json.loads((directory/'landmarks.json').read_text())
    base=load_rgb(directory/'static_locked_base.png');reference=np.array(contract['landmarks'],np.float32)
    tracks={};errors=0;frames_checked=0
    union=np.array(Image.open(directory/'mask-union.png'))
    for key,t in manifest['tracks'].items():
        atlas=Image.open(resource/t['atlas']).convert('RGBA');w,h=t['frameWidth'],t['frameHeight']
        frames=[np.array(atlas.crop((i%7*w,i//7*h,i%7*w+w,i//7*h+h))) for i in range(t['frameCount'])]
        x0,y0,x1,y1=t['box'];mask=np.array(Image.open(directory/contract['regions'][key]['mask']))[y0:y1,x0:x1]
        for frame in frames:
            if not np.array_equal(frame[:,:,3],mask):raise ValueError('Atlas alpha differs from approved mask')
        tracks[key]={'box':t['box'],'frames':frames}
    for k,key in enumerate(tracks):
        for i in range(21):
            values=[0,0,0];values[k]=i/20
            frame=composite(base,tracks,values)
            errors+=int(np.count_nonzero(np.any(frame!=base,axis=2)&(union==0)));frames_checked+=1
    ratios={}
    for label,value in [('closed',0),('half',.5),('open',1)]:
        frame=composite(base,tracks,(value,0,0))
        Image.fromarray(frame).save(resource/f'final-mouth-{label}.png')
        ratios[label]=opening(detect(frame,model),reference)
    report={'atlasFramesChecked':frames_checked,'outsideMaskChangedPixels':errors,'finalMouthRatios':ratios,
            'mouthGate':{'closed':ratios['closed']<=.01,'half':.08<=ratios['half']<=.12,'open':.20<=ratios['open']<=.24,'separation':ratios['open']-ratios['half']>=.08},
            'measurement':'Estimated by face landmarks; human visual review remains required'}
    (resource/'final-audit.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report))
    if errors or not all(report['mouthGate'].values()):raise ValueError('Resource pixel or mouth amplitude gate failed')


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('directory');p.add_argument('--model',default='.motion-models/face_landmarker.task');a=p.parse_args();audit(a.directory,a.model)

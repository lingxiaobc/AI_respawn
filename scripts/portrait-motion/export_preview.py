"""Export an offline HTML player and lossless animated PNG from baked atlases."""
import argparse
import base64
import json
from pathlib import Path
import numpy as np
from PIL import Image
from assemble import composite


def export_preview(directory):
    directory = Path(directory)
    pointer=directory/'resource-candidate.json'
    if not pointer.exists():pointer=directory/'resource-current.json'
    resource = directory / json.loads(pointer.read_text())['resource']
    manifest = json.loads((resource/'manifest.json').read_text())
    qa = json.loads((resource/'qa.json').read_text())
    def url(path):
        return 'data:image/png;base64,'+base64.b64encode(path.read_bytes()).decode('ascii')
    data = {'manifest':manifest, 'qa':qa, 'base':url(directory/'static_locked_base.png'),
            'atlases':{k:url(resource/t['atlas']) for k,t in manifest['tracks'].items()}}
    template = Path(__file__).with_name('preview.html').read_text(encoding='utf-8')
    (resource/'preview.html').write_text(template.replace('/*RESOURCE_DATA*/null',json.dumps(data)),encoding='utf-8')
    base = np.array(Image.open(directory/'static_locked_base.png').convert('RGB'))
    tracks = {}
    for key,t in manifest['tracks'].items():
        atlas = Image.open(resource/t['atlas']).convert('RGBA');w,h=t['frameWidth'],t['frameHeight']
        tracks[key]={'box':t['box'],'frames':[np.array(atlas.crop((i%7*w,i//7*h,i%7*w+w,i//7*h+h))) for i in range(t['frameCount'])]}
    # Full-resolution cropped face makes subtle edge artifacts visible, not hidden by scaling.
    boxes=[t['box'] for t in tracks.values()]
    box=(max(0,min(b[0] for b in boxes)-60), max(0,min(b[1] for b in boxes)-60),
         min(1024,max(b[2] for b in boxes)+60),min(1536,max(b[3] for b in boxes)+60))
    frames=[]
    for i in range(100):
        t=i/25;mouth=(1-np.cos(t*np.pi/2))/2
        phase=t%2;blink=np.sin(phase/.32*np.pi) if phase<.32 else 0
        frames.append(Image.fromarray(composite(base,tracks,(mouth,blink,blink))).crop(box))
    frames[0].save(resource/'motion-preview.png',save_all=True,append_images=frames[1:],duration=40,loop=0,disposal=0,blend=0)
    print(json.dumps({'html':str(resource/'preview.html'),'animation':str(resource/'motion-preview.png')}))


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('directory');args=parser.parse_args();export_preview(args.directory)

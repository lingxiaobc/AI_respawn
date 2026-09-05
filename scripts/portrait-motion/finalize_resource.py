"""Activate a locally verified candidate and create a portable review ZIP."""
import argparse
import json
import os
from pathlib import Path
import zipfile
import uuid


def finalize(directory):
    directory=Path(directory).resolve()
    candidate=json.loads((directory/'resource-candidate.json').read_text())
    resource=(directory/candidate['resource']).resolve()
    if resource.parent!=directory:raise ValueError('Candidate path escapes portrait directory')
    audit=json.loads((resource/'final-audit.json').read_text())
    browser=json.loads((resource/'browser-qa.json').read_text())
    if audit['outsideMaskChangedPixels']!=0 or audit['atlasFramesChecked']!=63 or not all(audit['mouthGate'].values()):
        raise ValueError('Pixel or mouth audit failed')
    if browser['pageErrors'] or browser['mobileHorizontalOverflow'] or not all(browser[k] for k in ['automaticAnimation','stopClosesMouth','localAudioAmplitudeAndSilence']):
        raise ValueError('Browser audit failed')
    if len(browser['independentParameters'])!=3 or any(x['outsideOwnRegion'] or x['changedPixels']<=0 for x in browser['independentParameters']):
        raise ValueError('Independent parameter audit failed')
    for name in ['manifest.json','preview.html','motion-preview.png','mouth-atlas.png','eyeLeft-atlas.png','eyeRight-atlas.png']:
        if not (resource/name).is_file():raise ValueError(f'Missing resource {name}')
    # Candidate QA remains a human visual-review request, not production approval.
    pointer_data=json.dumps({**candidate,'technicalReview':'passed','visualReview':'pending'},indent=2).encode('utf-8')
    archive=directory/f'{resource.name}-review.zip'
    expected = {'static_locked_base.png': (directory/'static_locked_base.png').read_bytes(), 'resource-current.json': pointer_data}
    expected.update({f'{resource.name}/{p.name}': p.read_bytes() for p in resource.iterdir() if p.is_file()})
    cached=archive.exists()
    if archive.exists():
        with zipfile.ZipFile(archive) as previous:
            if set(previous.namelist()) != set(expected) or any(previous.read(name) != data for name, data in expected.items()):
                raise ValueError('Existing archive differs; preserve and reconcile before rebuilding')
    else:
        temporary=directory/f'.review-{uuid.uuid4()}.zip.tmp'
        with zipfile.ZipFile(temporary,'x',compression=zipfile.ZIP_DEFLATED) as output:
            for name,data in expected.items():output.writestr(name,data)
        with temporary.open('r+b') as file:os.fsync(file.fileno())
        os.replace(temporary,archive)
    pointer=directory/f'.verified-pointer-{uuid.uuid4()}.json'
    with pointer.open('xb') as file:
        file.write(pointer_data);file.flush();os.fsync(file.fileno())
    os.replace(pointer,directory/'resource-current.json')
    print(json.dumps({'resource':str(resource),'archive':str(archive),'technicalReview':'passed','visualReview':'pending','cached':cached}))


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('directory');a=p.parse_args();finalize(a.directory)

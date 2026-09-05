"""Non-paid corpus preflight. Originals are immutable; negative controls are isolated."""
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageFilter, ImageDraw
from preflight import preflight

root=Path(__file__).resolve().parents[2]
out=root/'AI_output/canonical-gate'
out.mkdir(parents=True,exist_ok=True)
names=['40多岁男性.png','50多岁女性.png','50多岁男性侧身.png','50多岁，女性侧身.png','90多岁男性.png']
expected={name:('boundary' if '侧身' in name or '90' in name else 'positive') for name in names}
records=[]
def inspect(path,label,group):
    digest=hashlib.sha256(path.read_bytes()).hexdigest()
    report={'file':str(path.relative_to(root)),'sha256':digest,'expected':label,'group':group}
    try:
        report['metrics']=preflight(path,out/(digest+'.json'),root/'.motion-models/face_landmarker.task')
        report['status']='passed'
    except Exception as error:
        report.update(status='rejected',error=str(error))
    records.append(report)
for path in sorted((root/'image').glob('*.png')):
    inspect(path,expected.get(path.name,'existing-regression'),'new' if path.name in names else 'existing')
negative=out/'negative-controls';negative.mkdir(exist_ok=True)
with Image.open(root/'image'/names[0]) as source:
    source=source.convert('RGB')
    source.filter(ImageFilter.GaussianBlur(55)).save(negative/'blur.png')
    pair=Image.new('RGB',(source.width*2,source.height));pair.paste(source,(0,0));pair.paste(source,(source.width,0));pair.save(negative/'multiple.png')
    occluded=source.copy();ImageDraw.Draw(occluded).rectangle((0,0,source.width,int(source.height*.6)),fill='gray');occluded.save(negative/'occluded.png')
for path in sorted(negative.glob('*.png')):inspect(path,'source-valid-canonical-pending','negative-control')
baseline={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for folder in ['scripts/portrait-motion','packages/role-resource/src','packages/image-normalization/src'] for p in (root/folder).glob('*') if p.suffix in ['.py','.ts','.mjs']}
report={'schema':'source-preflight-v2','scope':'basic source admission only; not facial quality approval; strict checks follow normalization','baseline':baseline,'records':records}
(out/'preflight-matrix.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
for row in records:print(json.dumps({k:row[k] for k in ['file','group','expected','status']},ensure_ascii=False))
if any(r['status']!='passed' for r in records if r['group']=='negative-control'):raise SystemExit('VALID_SOURCE_FILE_REJECTED')

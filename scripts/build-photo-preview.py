"""Build an isolated, local three-photo preview from prepared mini2 assets."""
from pathlib import Path
import gzip
import json
import shutil
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts/photo-test"
VENDOR = ROOT / "apps/web/public/dh-live"
shutil.copytree(VENDOR, OUT / "runtime", dirs_exist_ok=True)
renderer = (VENDOR / "js/MiniLive2.js").read_text(encoding="utf-8")
renderer = renderer.replace('let CONFIG = {', 'const photo = window.PHOTO;\nlet CONFIG = {', 1)
renderer = renderer.replace('chromaKeyEnabled: true,', 'chromaKeyEnabled: false,', 1)
renderer = renderer.replace('videoSrc: "assets/01.mp4",', 'videoSrc: photo.video,', 1)
renderer = renderer.replace('dataSrc: "assets/combined_data.json.gz",', 'dataSrc: photo.data,', 1)
start = renderer.index('async function prepareFaceLayers()')
end = renderer.index('\nasync function newVideoTask()', start)
renderer = renderer[:start] + '''async function prepareFaceLayers() {
    attributionCaptured = false;
    for (const c of [bodyBase, faceLayer, mouthMask, blinkLayer]) {
        c.width = canvas_video.width; c.height = canvas_video.height;
    }
    bodyBaseCtx.drawImage(videoProcessor.video, 0, 0);
    const m = photo.mouth;
    const context = mouthMask.getContext('2d');
    context.save(); context.translate(m.x, m.y); context.rotate(m.angle);
    ellipseMask(context, 0, 0, m.rx, m.ry); context.restore();
}
function compositeFace() {
    // Preserve the complete first WASM output, including its original attribution.
    // Later frames replace only an internal mouth/cheek patch, never chin or neck.
    if (!attributionCaptured) {
        bodyBaseCtx.drawImage(canvas_video, 0, 0);
        attributionCaptured = true;
    }
    faceLayerCtx.clearRect(0, 0, faceLayer.width, faceLayer.height);
    faceLayerCtx.drawImage(canvas_video, 0, 0);
    faceLayerCtx.globalCompositeOperation = 'destination-in';
    faceLayerCtx.drawImage(mouthMask, 0, 0);
    faceLayerCtx.globalCompositeOperation = 'source-over';
    ctx_video.clearRect(0, 0, canvas_video.width, canvas_video.height);
    ctx_video.drawImage(bodyBase, 0, 0); ctx_video.drawImage(faceLayer, 0, 0);
}
''' + renderer[end:]
(OUT / "runtime/js/MiniLive2.js").write_text(renderer, encoding="utf-8")
frame = (VENDOR / "frame.html").read_text(encoding="utf-8")
frame = frame.replace('<script src="js/pako.min.js">', '<script src="profile.js"></script><script src="js/pako.min.js">')
samples = [("young", "青年"), ("woman", "50多岁女性"), ("elder", "老人1")]
for slug, title in samples:
    pts = np.load(OUT / slug / "data/landmarks.npy")
    center = (pts[13, :2] + pts[14, :2]) / 2
    axis = pts[291, :2] - pts[61, :2]
    width = float(np.linalg.norm(axis))
    chin_gap = float(np.linalg.norm(pts[152, :2] - center))
    profile = {"video": f"../{slug}/assets/01.mp4", "data": f"../{slug}/assets/combined_data.json.gz",
               "mouth": {"x": float(center[0]), "y": float(center[1]), "rx": width * .72,
                         "ry": min(width * .49, chin_gap * .72), "angle": float(np.arctan2(axis[1], axis[0]))}}
    with gzip.open(OUT / slug / "assets/combined_data.json.gz", "rt", encoding="utf-8") as stream:
        data = json.load(stream)
    assert len(data["ref_data"]) == 80 and len(data["json_data"]) == 80
    assert np.isfinite(data["ref_data"]).all()
    # Each iframe shares runtime files through base, but has its own inline profile.
    document = frame.replace('<head>', '<head><base href="../runtime/">')
    document = document.replace('<script src="profile.js"></script>', '<script>window.PHOTO=' + json.dumps(profile) + ';</script>')
    document = document.replace('正在加载示例人物', f'正在加载{title}')
    (OUT / slug / "frame.html").write_text(document, encoding="utf-8")
    (OUT / slug / "profile.json").write_text(json.dumps(profile, indent=2), encoding="utf-8")
cards = ''.join(f'<article><h2>{title}</h2><iframe id="{slug}" src="{slug}/frame.html" title="{title}"></iframe>'
                f'<button data-id="{slug}" disabled>播放测试语音</button><p id="s-{slug}">正在加载…</p></article>' for slug,title in samples)
(OUT / "preview.html").write_text('''<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<title>三张照片 · 嘴型测试</title><style>
body{font:16px system-ui;background:#12191d;color:#edf2f4;margin:24px}
h1{font-size:26px}main{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
article{background:#1e2a30;padding:16px;border-radius:14px}h2{font-size:18px;margin-top:0}
iframe{border:0;width:100%;height:60vh;background:#11191b}button{background:#69dec6;border:0;
padding:12px 20px;border-radius:8px;font-size:16px;cursor:pointer;margin-top:12px}
button:disabled{opacity:.45}p{line-height:1.6;color:#c5d3da}
@media(max-width:800px){main{grid-template-columns:1fr}}</style>
<h1>三张照片 · 嘴型测试</h1><p>点击各自按钮，用同一段音频比较嘴型。头部轮廓、颈部、肩膀和背景保持静止。<br>
本轮使用单张照片，不含眨眼动画；此页为本地效果测试。</p><main>''' + cards + '''</main>
<script>
const rounds = {};
window.addEventListener('message', e => {
 if(e.origin!==location.origin || e.data?.source!=='dh-live') return;
 const frame=[...document.querySelectorAll('iframe')].find(f=>f.contentWindow===e.source);
 if(!frame)return;
 const button=document.querySelector(`[data-id="${frame.id}"]`), status=document.getElementById('s-'+frame.id);
 if(e.data.type==='ready'){button.disabled=false;status.textContent='准备好了';}
 if(e.data.type==='started')status.textContent='正在说话…';
 if(e.data.type==='done'){button.disabled=false;status.textContent='播放完成';}
 if(e.data.type==='error')status.textContent='失败：'+e.data.message;
});
async function playPhoto(id){
 const frame=document.getElementById(id),button=document.querySelector(`[data-id="${id}"]`);
 button.disabled=true;
 try{
 const wav=await(await fetch('runtime/common/test.wav')).arrayBuffer();
 const ac=new AudioContext({sampleRate:16000}); const decoded=await ac.decodeAudioData(wav); await ac.close();
 const pcm=decoded.getChannelData(0); const round=rounds[id]=(rounds[id]||0)+1;
 const send=(type,extra={})=>frame.contentWindow.postMessage({source:'respawn',type,round,...extra},location.origin);
 send('begin');
 for(let offset=0;offset<pcm.length;offset+=5120){
 const n=Math.min(5120,pcm.length-offset),buffer=new ArrayBuffer(44+n*2),view=new DataView(buffer);
 const word=(at,s)=>{for(let i=0;i<s.length;i++)view.setUint8(at+i,s.charCodeAt(i));};
 word(0,'RIFF');view.setUint32(4,36+n*2,true);word(8,'WAVE');word(12,'fmt ');view.setUint32(16,16,true);
 view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);
 view.setUint16(32,2,true);view.setUint16(34,16,true);word(36,'data');view.setUint32(40,n*2,true);
 for(let i=0;i<n;i++)view.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,pcm[offset+i]))*32767),true);
 send('audio',{wav:buffer});
 }send('end');
 }catch(e){document.getElementById('s-'+id).textContent='失败：'+e.message;button.disabled=false;}
}
document.querySelectorAll('button').forEach(b=>b.onclick=()=>playPhoto(b.dataset.id));
</script></html>''', encoding="utf-8")
print('Built artifacts/photo-test/preview.html (3 independent 80-value identity profiles).')

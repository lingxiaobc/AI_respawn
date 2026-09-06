import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';
import {RoleStore,hash,STAGES} from '../packages/role-resource/src/state.ts';

const root=resolve(process.argv[2]||'AI_output/roles');
const out=resolve(process.argv[3]||'AI_output/batch-review');
const store=new RoleStore(root);
const escape=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const cards=[];
const displayedSources=new Set<string>();
await mkdir(out,{recursive:true});
for(const job of await store.list()) {
  // The review surface is intentionally limited to technically complete,
  // playable resources. Paused, failed, queued/running and rejected jobs
  // remain in the store for diagnostics but must not be exposed here.
  if(!['awaiting_review','approved'].includes(job.status)) continue;
  // RoleStore.list() is newest-first. Keep only the newest completed resource
  // for each uploaded source, so repeated test/replay jobs do not duplicate
  // the same character in the review surface.
  if(displayedSources.has(job.sourceHash)) continue;
  displayedSources.add(job.sourceHash);
  let link='';let detail=job.error||'正在处理';
  if(['awaiting_review','approved'].includes(job.status)) {
    if(STAGES.some(stage=>!job.completed[stage]))throw new Error('Incomplete ready role');
    const folder=store.directory(job.id);
    for(const cp of Object.values(job.completed))for(const [file,digest] of Object.entries(cp.files)) {
      const path=resolve(folder,file.replaceAll('\\','/'));
      if(!path.startsWith(folder+sep)||hash(await readFile(path))!==digest)throw new Error('Resource checkpoint mismatch');
    }
    const resource=resolve(folder,job.resource!);
    if(!resource.startsWith(folder+sep))throw new Error('Invalid resource directory');
    await writeFile(join(out,`${job.id}.html`),await readFile(join(resource,'preview.html')));
    link=`<p><a href="${job.id}.html">播放嘴部与眨眼动画</a></p>`;
    detail='制作及技术检查通过，运动自然度待你确认';
  }
  cards.push(`<article><h2>${escape(job.fileName)}</h2><p>${escape(job.status)} · ${escape(job.stage)}</p><p>${escape(detail)}</p>${link}</article>`);
}
await writeFile(join(out,'index.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>角色动画测试结果</title><style>body{max-width:900px;margin:40px auto;padding:0 20px;background:#f5f5f2;color:#222;font:17px/1.7 system-ui}article{background:white;border-radius:16px;padding:24px;margin:20px 0}a{color:#235b8c}h2{overflow-wrap:anywhere}</style><h1>角色动画测试结果</h1><p>每个上传源仅展示最新的可播放资源。点击“播放嘴部与眨眼动画”，观察嘴唇、牙齿、眼角的跳变、重影及接缝。</p>${cards.join('')}</html>`);
console.log(out);

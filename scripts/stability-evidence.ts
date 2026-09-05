/** Read-only source evidence aggregation; writes only its generated review report. */
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {RoleStore,STAGES,hash,atomicJson} from '../packages/role-resource/src/state.ts';
const root=resolve('AI_output/stability-v1/roles'),out=resolve('AI_output/gemini-stability-review');
const jobs=await new RoleStore(root).list();
const files=['40多岁男性.png','50多岁女性.png','50多岁男性侧身.png','50多岁，女性侧身.png','90多岁男性.png'];
const readJson=async(path:string)=>JSON.parse(await readFile(path,'utf8'));
const results=[];
await mkdir(out,{recursive:true});
for(const file of files){
 const matches=jobs.filter(j=>j.fileName.replaceAll('\\','/').split('/').at(-1)===file).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
 const job=matches.find(j=>j.status==='awaiting_review')??matches[0];
 if(!job){results.push({file,status:'not_generated',error:'尚无角色构建记录，不能据此判定定位失败；需生成标准图后进行严格检查。'});continue;}
 if(job.status!=='awaiting_review'){results.push({file,id:job.id,status:job.status,stage:job.stage,error:job.error});continue;}
 if(STAGES.some(s=>!job.completed[s]))throw new Error('INCOMPLETE_READY_ROLE');
 for(const cp of Object.values(job.completed))for(const [name,digest] of Object.entries(cp.files)){
  if(hash(await readFile(join(root,job.id,name)))!==digest)throw new Error('CHECKPOINT_MISMATCH');
 }
 const resource=join(root,job.id,job.resource!);
 const audit=await readJson(join(resource,'final-audit.json')),browser=await readJson(join(resource,'browser-qa.json'));
 if(audit.outsideMaskChangedPixels!==0||audit.atlasFramesChecked!==63||!Object.values(audit.mouthGate).every(Boolean)||browser.pageErrors.length)throw new Error('AUDIT_FAILED');
 await writeFile(join(out,`${job.id}.html`),await readFile(join(resource,'preview.html')));
 results.push({file,id:job.id,status:job.status,resource,version:job.pipelineVersion,audit,browser});
}
const calls=await Promise.all((await readdir('AI_output/motion/.calls')).filter(n=>n.endsWith('.json')).map(n=>readJson(join('AI_output/motion/.calls',n))));
const thisRun=calls.filter(c=>c.startedAt>='2026-09-05T15:23:33Z');
const linux=await Promise.all(['man-verified','woman-verified','side-man-verified'].map(async name=>({name,memory:await readJson(`AI_output/stability-linux/${name}-memory.json`),job:await readJson(`AI_output/stability-linux/${name}/replay-report.json`)})));
const ui=await readJson('AI_output/role-ui-test/gemini-stability-final/ui-qa/report.json');
const passed=results.filter(r=>r.status==='awaiting_review');
const report={results,callCount:calls.length,thisRun:{attempts:thisRun.length,succeeded:thisRun.filter(c=>c.status==='succeeded').length},linux:linux.map(({name,memory,job})=>({name,memory,id:job.id,status:job.status,stages:Object.keys(job.completed).length,version:job.pipelineVersion})),ui,
 technicalTargetMet:passed.length>=3&&new Set(passed.map(r=>r.version)).size===1&&linux.every(l=>l.memory.exitCode===0&&l.memory.memoryPassed&&l.job.status==='awaiting_review'&&Object.keys(l.job.completed).length===12)&&ui.completedPipeline,
 visualReview:'pending user confirmation; a failed role remains failed'};
await atomicJson(join(out,'evidence.json'),report);
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
await writeFile(join(out,'latest.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gemini新角色验证</title><style>body{max-width:850px;margin:32px auto;padding:16px;font:17px/1.7 system-ui;background:#f6f6f4}article{background:white;padding:20px;margin:16px 0;border-radius:12px}a{color:#185790}</style><h1>Gemini新角色验证</h1><p>${passed.length}/5个输入已完成动画，已完成角色自然度待你确认。共${thisRun.length}次新请求，${report.thisRun.succeeded}次返回图片；其他结果如下。</p>${results.map(r=>`<article><h2>${escape(r.file)}</h2>${r.status==='awaiting_review'?`<p>63帧、遮罩外零变化及嘴幅度检查通过。</p><a href="${r.id}.html">播放动画并确认流畅度</a>`:`<p>${escape('error' in r?r.error??r.status:'输入未通过可靠定位检查，未付费生成')}</p>`}</article>`).join('')}<p>四个进入生成的角色中，首次全链路1/4，代码通用修复后3/4；不是100%成功。</p></html>`);
console.log(JSON.stringify({technicalTargetMet:report.technicalTargetMet,successes:passed.length,callCount:calls.length,thisRun:report.thisRun,results:results.map(r=>({file:r.file,id:r.id,status:r.status,version:'version'in r?r.version:undefined}))}));

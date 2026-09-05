/** Deterministic no-paid replay of existing images through the real pipeline. */
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {loadLocalEnv} from './env.ts';
import {RolePipeline} from '../packages/role-resource/src/pipeline.ts';
import {PaidImages} from '../packages/role-resource/src/paid-images.ts';
import {hash,atomicJson} from '../packages/role-resource/src/state.ts';
await loadLocalEnv();
const [directory,sourceFile,outputRoot]=process.argv.slice(2);
if(!directory||!sourceFile||!outputRoot)throw new Error('Usage: role-replay.ts <cached role/donor directory> <original input> <isolated output root>');
const source=await readFile(sourceFile);
const images:Record<string,{path:string;sha256:string}>={};
for(const state of ['normalize','mouth-half','mouth-open','eyes-half','eyes-closed']){
 const path=resolve(directory,state==='normalize'?'static_locked_base.png':`donors/${state}.png`);
 images[state]={path,sha256:hash(await readFile(path))};
}
const root=resolve(outputRoot);
if(root===resolve(directory)||root===resolve('AI_output/motion'))throw new Error('Replay output must be isolated');
const pipeline=new RolePipeline({root,python:process.env.MOTION_PYTHON||(process.platform==='win32'?resolve('.venv-motion/Scripts/python.exe'):resolve('.venv-motion/bin/python')),fixture:{inputHash:hash(source),images},paid:new PaidImages(join(root,'disabled-paid'),{edit:async()=>{throw new Error('REPLAY_NETWORK_FORBIDDEN');}},false)});
try{
 await pipeline.initialize();const job=await pipeline.submit(sourceFile,source,`replay-${hash(source)}`);await pipeline.wait();
 const result=await pipeline.store.get(job.id);await atomicJson(join(root,'replay-report.json'),result);
 console.log(JSON.stringify({id:result.id,status:result.status,stage:result.stage,error:result.error,resource:result.resource,completed:Object.keys(result.completed).length}));
 if(result.status!=='awaiting_review')process.exitCode=1;
}finally{await pipeline.close();}

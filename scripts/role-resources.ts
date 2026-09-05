import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { loadLocalEnv } from "./env.ts";
import { RolePipeline } from "../packages/role-resource/src/pipeline.ts";
import { PaidImages } from "../packages/role-resource/src/paid-images.ts";
import { hash, atomicJson } from "../packages/role-resource/src/state.ts";
import { ZenMuxImageProvider } from "../packages/image-normalization/src/zenmux.ts";

await loadLocalEnv();
const [command, ...inputs] = process.argv.slice(2);
const input = inputs[0];
const replay = process.env.ROLE_REPLAY_YOUTH === "1";
let fixture;
if(replay){
  const source=resolve("AI_output/normalized/青年-cf1a11df052a/source.png");
  const images: Record<string,{path:string;sha256:string}>={};
  for(const state of ["normalize","mouth-half","mouth-open","eyes-half","eyes-closed"]){
    const path=state==="normalize"?resolve("AI_output/motion/youth-v2/static_locked_base.png"):resolve("AI_output/motion/youth-v2/donors",`${state}.png`);
    images[state]={path,sha256:hash(await readFile(path))};
  }
  fixture={inputHash:hash(await readFile(source)),images};
}
const pipeline=new RolePipeline({root:process.env.ROLE_OUTPUT_DIR||"AI_output/roles",python:process.env.MOTION_PYTHON||(process.platform==="win32"?resolve(".venv-motion/Scripts/python.exe"):resolve(".venv-motion/bin/python")),fixture,
  paid:new PaidImages(resolve("AI_output/motion"),new ZenMuxImageProvider({apiKey:process.env.ZENMUX_API_KEY??"disabled",baseUrl:process.env.ZENMUX_BASE_URL,stream:true,timeoutMs:300000}),process.env.ROLE_ALLOW_PAID==="1"&&!replay,resolve(process.env.NORMALIZATION_OUTPUT_DIR||'AI_output/normalized'))});
await pipeline.initialize();
if(command==="serve"){
  const {serveRoles}=await import("../apps/server/src/role-http.ts");
  await serveRoles(pipeline,Number(process.env.ROLE_PORT??8878),process.env.ROLE_ADMIN_TOKEN??"");
}else{
  try{
    if(command==='batch' && inputs.length) {
      const results=[];
      for(const file of inputs) {
        const bytes=await readFile(file);
        const job=await pipeline.submit(file,bytes,`batch-${hash(bytes)}`);
        console.log(JSON.stringify({file,id:job.id,status:'submitted'}));
        await pipeline.wait();
        const result=await pipeline.store.get(job.id);
        results.push(result);
        await atomicJson(join(pipeline.store.root,'batch-report.json'),{createdAt:new Date().toISOString(),results});
        console.log(JSON.stringify({file,id:result.id,status:result.status,stage:result.stage,error:result.error}));
        if(result.status==='paused') {process.exitCode=1;break;}
      }
    }
    else if(command==="submit"&&input){const job=await pipeline.submit(input,await readFile(input),randomUUID());await pipeline.wait();const result=await pipeline.store.get(job.id);console.log(JSON.stringify(result,null,2));if(result.status==='paused')process.exitCode=1;}
    else if(command==="resume"&&input){await pipeline.resume(input);await pipeline.wait();const result=await pipeline.store.get(input);console.log(JSON.stringify(result,null,2));if(result.status==='paused')process.exitCode=1;}
    else if(command==="list")console.log(JSON.stringify(await pipeline.store.list(),null,2));
    else throw new Error("Usage: role-resources.ts serve | submit <image> | batch <images...> | resume <id> | list");
  }finally{await pipeline.close();}
}

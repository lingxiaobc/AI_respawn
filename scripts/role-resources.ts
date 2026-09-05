import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { loadLocalEnv } from "./env.ts";
import { RolePipeline } from "../packages/role-resource/src/pipeline.ts";
import { PaidImages } from "../packages/role-resource/src/paid-images.ts";
import { hash } from "../packages/role-resource/src/state.ts";
import { ZenMuxImageProvider } from "../packages/image-normalization/src/zenmux.ts";

await loadLocalEnv();
const [command, input] = process.argv.slice(2);
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
  paid:new PaidImages(resolve("AI_output/motion"),new ZenMuxImageProvider({apiKey:process.env.ZENMUX_API_KEY??"disabled",baseUrl:process.env.ZENMUX_BASE_URL,stream:true,timeoutMs:300000}),process.env.ROLE_ALLOW_PAID==="1"&&!replay)});
await pipeline.initialize();
if(command==="serve"){
  const {serveRoles}=await import("../apps/server/src/role-http.ts");
  await serveRoles(pipeline,Number(process.env.ROLE_PORT??8878),process.env.ROLE_ADMIN_TOKEN??"");
}else{
  try{
    if(command==="submit"&&input){const job=await pipeline.submit(input,await readFile(input),randomUUID());await pipeline.wait();console.log(JSON.stringify(await pipeline.store.get(job.id),null,2));}
    else if(command==="resume"&&input){await pipeline.resume(input);await pipeline.wait();console.log(JSON.stringify(await pipeline.store.get(input),null,2));}
    else if(command==="list")console.log(JSON.stringify(await pipeline.store.list(),null,2));
    else throw new Error("Usage: role-resources.ts serve | submit <image> | resume <id> | list");
  }finally{await pipeline.close();}
}

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { loadLocalEnv } from "./env.ts";
import { ZenMuxPortraitStandardizer } from "../apps/server/src/portrait-standardizer.ts";
await loadLocalEnv();
const revised=process.argv.includes("--revised-prompt");
const root=resolve(revised?"artifacts/portrait-verification-v3":"artifacts/portrait-verification"), ledgerPath=resolve(root,"requests.json");
await mkdir(root,{recursive:true});
type Entry={name:string;model:string;status:string;source:string;file?:string;error?:string;elapsedMs?:number;usage?:Record<string,number>;sha256?:string};
const entries:Entry[]=await readFile(ledgerPath,"utf8").then(JSON.parse).catch(()=>[]);
// Only used after independently confirming the sandbox blocked connect with EACCES.
if(process.argv.includes("--retry-blocked-network")) {
  if(entries.some(e=>e.file||e.error!=="图片服务连接或响应异常"))throw new Error("不能重放结果不明的付费请求");
  await writeFile(resolve(root,"sandbox-blocked-requests.json"),JSON.stringify(entries,null,2),{flag:"wx"});
  entries.length=0;
}
const save=()=>writeFile(ledgerPath,JSON.stringify(entries,null,2));
const client=new ZenMuxPortraitStandardizer();
async function attempt(name:string,model:string) {
  const existing=entries.find(e=>e.name===name&&e.model===model);if(existing)return existing.status==="valid";
  if(entries.length>=(revised?4:6))throw new Error("已达到批准的调用上限");
  const entry:Entry={name,model,status:"submitted",source:resolve("测试图片",name+".png")};entries.push(entry);await save();
  console.log(JSON.stringify({event:"image-request",name,model,count:entries.length}));
  try {
    const result=await client.generate(entry.source,model);
    entry.file=resolve(root,`${entries.length}-${name}.png`);
    await writeFile(entry.file,result.bytes,{flag:"wx"});
    entry.status="received";entry.elapsedMs=result.elapsedMs;entry.usage=result.usage;entry.sha256=createHash("sha256").update(result.bytes).digest("hex");await save();
    await client.validate(entry.file,new AbortController().signal);entry.status="valid";
  } catch(error) {entry.status="failed";entry.error=error instanceof Error?error.message:"图片验证失败";}
  await save();console.log(JSON.stringify(entry));return entry.status==="valid";
}
for(const name of revised?["青年","老人-女2-远"]:["青年","50多岁女性","老人1"]){if(!await attempt(name,client.primary))await attempt(name,client.fallback);}
if(!revised&&!entries.some(e=>e.model===client.fallback))await attempt("青年",client.fallback);
console.log(JSON.stringify({ledger:ledgerPath,requests:entries.length,valid:entries.filter(e=>e.status==="valid").length}));

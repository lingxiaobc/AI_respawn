/** Make only completed local verification roles available in the user's library. */
import { cp, readFile, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AvatarStore, AVATAR_ID, type AvatarRecord } from "../apps/server/src/avatar-store.ts";
import { loadLocalEnv } from "./env.ts";
await loadLocalEnv();
const reportPath=resolve(process.argv[2]??"");
if(!reportPath.startsWith(resolve("artifacts/role-flow")+sep)||!reportPath.endsWith(sep+"verification.json"))throw Error("请选择本项目已通过的流程验证记录");
const report=JSON.parse(await readFile(reportPath,"utf8")) as {passed:boolean;root:string;jobs:AvatarRecord[]};
if(!report.passed)throw Error("验证尚未通过");
const root=resolve(process.env.AVATAR_STORAGE_DIR??"artifacts/avatars");
const readOnly=new DatabaseSync(resolve(root,"avatars.sqlite"),{readOnly:true});
const busy=readOnly.prepare("SELECT count(*) n FROM calls WHERE ended_at IS NULL").get()!.n||readOnly.prepare("SELECT count(*) n FROM avatars WHERE DELET_OR_NOT=0 AND status IN ('queued','processing','paused')").get()!.n;
readOnly.close();if(busy)throw Error("请在当前通话或制作结束后添加验证角色");
const store=new AvatarStore(root);const added:string[]=[];
try{
  for(const job of report.jobs.filter(j=>j.status==="ready")) {
    if(!AVATAR_ID.test(job.id)||!AVATAR_ID.test(job.batchId))throw Error("验证角色标识无效");
    if(store.get(job.id))continue;
    const source=resolve(report.root,job.id),destination=resolve(root,job.id);
    if(!source.startsWith(resolve("artifacts/role-flow")+sep)||!destination.startsWith(root+sep))throw Error("验证角色目录无效");
    const remap=(path:string)=>{if(!path.startsWith(source+sep))throw Error("角色资源不在验证目录中");return destination+path.slice(source.length);};
    const record={...job,sourcePath:remap(job.sourcePath),assetPath:remap(job.assetPath!),normalizedPath:remap(job.normalizedPath!),
      normalization:{...job.normalization!,candidatePath:remap(job.normalization!.candidatePath!)}};
    await stat(job.assetPath!);await cp(source,destination,{recursive:true,errorOnExist:true,force:false});
    store.transaction(()=>{if(!store.batchByKey("verified:"+job.batchId))store.addBatch(job.batchId,"verified:"+job.batchId);store.save(record);});added.push(job.id);
  }
}finally{store.close();}
console.log(JSON.stringify({added,cloudCalls:0}));

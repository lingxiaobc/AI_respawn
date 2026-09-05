import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { RolePipeline } from "../../../packages/role-resource/src/pipeline.ts";
import { sanitizeProviderError } from "../../../packages/image-normalization/src/validation.ts";

export async function serveRoles(pipeline: RolePipeline, port: number, token: string) {
  if(token.length<16){await pipeline.close();throw new Error("ROLE_ADMIN_TOKEN must contain at least 16 characters; not logged");}
  const server=createServer(async(req,res)=>{
    const send=(status:number,data:unknown)=>{res.writeHead(status,{"content-type":"application/json","cache-control":"no-store","x-content-type-options":"nosniff"});res.end(JSON.stringify(data));};
    const host=req.headers.host, actualPort=(server.address() as {port:number}).port;
    if(host!==`127.0.0.1:${actualPort}`&&host!==`localhost:${actualPort}`){send(403,{error:"HOST_DENIED"});return;}
    const url=new URL(req.url??"/",`http://${host}`);
    if(req.headers.origin&&req.headers.origin!==`http://${host}`){send(403,{error:"ORIGIN_DENIED"});return;}
    try{
      if(req.method==="GET"&&url.pathname==="/"){res.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store"});res.end(await readFile(resolve("apps/web/role-admin.html")));return;}
      const supplied=Buffer.from(req.headers.authorization??""),expected=Buffer.from(`Bearer ${token}`);
      if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected)){send(401,{error:"ADMIN_AUTH_REQUIRED"});return;}
      if(req.method==="GET"&&url.pathname==="/api/roles"){send(200,{jobs:await pipeline.store.list()});return;}
      const match=/^\/api\/roles\/([a-f0-9-]{36})(?:\/(resume|review|preview|archive))?$/.exec(url.pathname);
      if(match&&req.method==="GET"){
        const job=await pipeline.store.get(match[1]!);
        if(!match[2]){send(200,job);return;}
        if(!job.resource||!job.completed.finalize){send(409,{error:"RESOURCE_NOT_READY"});return;}
        if(!await pipeline.verify(job)){send(409,{error:"RESOURCE_HASH_MISMATCH"});return;}
        const file=match[2]==="preview"?`${job.resource}/preview.html`:match[2]==="archive"?`${job.resource}-review.zip`:undefined;
        if(!file){send(404,{error:"NOT_FOUND"});return;}
        res.writeHead(200,{"content-type":match[2]==="preview"?"text/html; charset=utf-8":"application/zip","cache-control":"no-store"});res.end(await readFile(pipeline.safePath(job.id,file)));return;
      }
      if(req.method!=="POST"){send(404,{error:"NOT_FOUND"});return;}
      let length=0;const chunks:Buffer[]=[];
      for await(const part of req){const b=Buffer.from(part);length+=b.length;if(length>17*1024*1024){send(413,{error:"UPLOAD_TOO_LARGE"});return;}chunks.push(b);}
      let data;try{data=JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{send(400,{error:"INVALID_JSON"});return;}
      if(url.pathname==="/api/roles"){
        if(!data||data.files||typeof data.name!=="string"||typeof data.base64!=="string"||typeof data.key!=="string"||!/^[A-Za-z0-9+/]+={0,2}$/.test(data.base64)){send(400,{error:"EXACTLY_ONE_IMAGE_REQUIRED"});return;}
        send(202,await pipeline.submit(data.name.slice(0,200),Buffer.from(data.base64,"base64"),data.key));return;
      }
      if(match?.[2]==="resume"){send(202,await pipeline.resume(match[1]!));return;}
      if(match?.[2]==="review"){
        if(!["approved","rejected"].includes(data.decision)||typeof data.note!=="string"||data.note.length>2000||typeof data.resourceHash!=="string"){send(400,{error:"INVALID_REVIEW"});return;}
        send(200,await pipeline.review(match[1]!,data.decision,data.note,data.resourceHash));return;
      }
      send(404,{error:"NOT_FOUND"});
    }catch(e){send(400,{error:sanitizeProviderError(e)});}
  });
  await new Promise<void>((r,j)=>{server.once("error",j);server.listen(port,"127.0.0.1",r);}).catch(async e=>{await pipeline.close();throw e;});
  console.log(`Role admin: http://127.0.0.1:${(server.address() as {port:number}).port} (loopback only; ${pipeline.options.fixture?"FIXTURE REPLAY, no paid calls":"live transport disabled unless explicitly enabled"})`);
  const stop=()=>{server.close(()=>{void pipeline.close().then(()=>process.exit(0));});};
  const ipcStop=(message:unknown)=>{if(message==="shutdown-role-test")stop();};
  process.on("message",ipcStop);
  process.once("SIGINT",stop);process.once("SIGTERM",stop);
  server.once("close",()=>{process.off("SIGINT",stop);process.off("SIGTERM",stop);process.off("message",ipcStop);});
  return server;
}

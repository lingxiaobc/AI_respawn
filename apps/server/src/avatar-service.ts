import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve, sep } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { AvatarStore, AVATAR_ID, type AvatarRecord } from "./avatar-store.ts";
import { prepareAvatar, WorkerStopError, type ProcessJob } from "./avatar-worker.ts";
import { PortraitValidationUnavailableError, type PortraitStandardizer } from "./portrait-standardizer.ts";

export const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
const MAX_BATCH_BYTES = MAX_PHOTO_BYTES * 4 + 64 * 1024;
const TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const ASSETS: Record<string,string> = { "frame.html":"text/html; charset=utf-8", "profile.json":"application/json",
  "source.jpg":"image/jpeg", "assets/01.mp4":"video/mp4", "assets/combined_data.json.gz":"application/gzip" };
const pendingStatus = (job: AvatarRecord) => ["queued","processing","paused"].includes(job.status);
export type AvatarJob = Omit<AvatarRecord, "sourcePath" | "assetPath" | "attempt" | "normalizedPath" | "normalization">;
function publicJob(job: AvatarRecord): AvatarJob {
  const { sourcePath, assetPath, attempt, normalizedPath, normalization, ...safe } = job; return safe;
}
function json(response: ServerResponse, status: number, data: unknown) {
  response.writeHead(status, { "content-type":"application/json; charset=utf-8", "cache-control":"no-store", "x-content-type-options":"nosniff" });
  response.end(JSON.stringify(data));
}
class RequestError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export function isLocalRequest(request: IncomingMessage): boolean {
  const host = request.headers.host ?? "", origin = request.headers.origin;
  return ["127.0.0.1","localhost"].some(name => host === `${name}:5173` || host === `${name}:${request.socket.localPort}`)
    && (!origin || /^http:\/\/(127\.0\.0\.1|localhost):(5173|8787|8877)$/.test(origin))
    && request.headers["sec-fetch-site"] !== "cross-site";
}
export function hasImageSignature(bytes: Buffer, type: string): boolean {
  if (type === "image/png") return bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (type === "image/jpeg") return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  return type === "image/webp" && bytes.toString("ascii",0,4) === "RIFF" && bytes.toString("ascii",8,12) === "WEBP";
}
async function body(request: IncomingMessage, max: number): Promise<Buffer> {
  if (Number(request.headers["content-length"] ?? 0) > max) throw new RequestError(413,"照片或批次过大");
  const timer = setTimeout(() => request.destroy(),30_000);
  try {
    const chunks: Buffer[] = []; let size = 0;
    for await (const raw of request) { const part = Buffer.from(raw); size += part.length;
      if (size > max) throw new RequestError(413,"照片或批次过大"); chunks.push(part); }
    return Buffer.concat(chunks);
  } finally { clearTimeout(timer); }
}

export class AvatarService {
  readonly root: string;
  readonly store: AvatarStore;
  readonly initialized: Promise<void>;
  #runner: ProcessJob;
  #accepting = true;
  #uploading = false;
  #running?: Promise<void>;
  #abort?: AbortController;
  #hold?: string;
  #holdAvatar?: string;
  #runningId?: string;
  #phase: "local"|"cloud" = "local";
  #standardizer?: PortraitStandardizer;
  #fault?: string;
  constructor(root = resolve("artifacts/avatars"), runner: ProcessJob = prepareAvatar, standardizer?: PortraitStandardizer) {
    this.root = root; this.#runner = runner; this.store = new AvatarStore(root);
    this.#standardizer=standardizer;
    this.initialized = this.store.importLegacy();
  }
  get callActive() { return !!this.#hold; }
  async acquireCall(avatarId: string | undefined, token: string, signal: AbortSignal) {
    await this.initialized; signal.throwIfAborted();
    if (!this.#accepting || this.#hold || this.#uploading) throw new Error("服务正在准备或已有通话，请稍后再试");
    if (avatarId && this.store.active(avatarId)?.status !== "ready") throw new Error("人物尚未制作成功或已删除");
    this.#hold = token; this.#holdAvatar=avatarId; this.store.startCall(token,avatarId);
    for (const job of this.store.list().filter(pendingStatus))
      this.store.save({ ...job, status:"paused", stage:"paused", message:undefined });
    this.#abort?.abort(new Error("call priority"));
    // A submitted cloud edit does not own the local rendering worker. Let it settle
    // into a checkpoint; the aborted signal prevents validation/rendering until hangup.
    if(this.#phase!=="cloud")await this.#running;
    if(this.#fault){this.releaseCall(token,"WORKER_STOP_FAILED");throw new Error(this.#fault);}
    if (signal.aborted || this.#hold !== token) {
      this.releaseCall(token,"CANCELLED"); throw new Error("通话已取消");
    }
  }
  releaseCall(token: string, reason = "ENDED", input = 0, output = 0) {
    this.store.endCall(token,reason,input,output);
    if (this.#hold !== token) return;
    this.#hold = undefined;
    this.#holdAvatar = undefined;
    for (const job of this.store.list()) if (job.status === "paused")
      this.store.save({ ...job, status:"queued",stage:"queued",message:undefined });
    this.#pump();
  }
  #pump() {
    if (!this.#accepting || this.#hold || this.#running) return;
    const job = this.store.list().find(job => job.status === "queued");
    if (!job) return;
    this.#abort = new AbortController();
    this.#phase="local";
    this.#runningId=job.id;
    this.#running = this.#run(job, this.#abort.signal).finally(() => {
      this.#running = undefined; this.#abort = undefined; this.#runningId=undefined; this.#pump();
    });
  }
  async #run(job: AvatarRecord, signal: AbortSignal) {
    const attemptId = randomUUID(), directory = resolve(this.root,job.id,"attempts",attemptId);
    job = this.store.patch(job.id,{attempt:job.attempt+1, status:"processing", stage:"checking", percent:0, message:undefined});
    this.store.startAttempt(attemptId,job.id);
    try {
      const source=await this.#normalize(job.id,signal);
      signal.throwIfAborted();
      this.#phase="local";
      await mkdir(directory,{ recursive:true }); signal.throwIfAborted();
      await this.#runner(directory,job.id,(stage,percent) => {
        if (!signal.aborted && ["checking","landmarks","video","identity"].includes(stage) && Number.isFinite(percent)) {
          job=this.store.patch(job.id,{stage,percent:Math.min(99,Math.max(job.percent,percent))});
        }
      },signal,source);
      signal.throwIfAborted();
      for (const name of Object.keys(ASSETS)) if (!(await stat(resolve(directory,name))).size) throw new Error("人物资源不完整");
      signal.throwIfAborted();
      this.store.patch(job.id,{status:"ready",stage:"ready",percent:100,assetPath:directory,frameUrl:`/api/avatars/${job.id}/frame.html` });
      this.store.finishAttempt(attemptId,"ready");
    } catch (error) {
      if(error instanceof WorkerStopError){this.#fault=error.message;this.#accepting=false;}
      const archived=!!this.store.get(job.id)?.DELET_OR_NOT;
      const status = archived?"interrupted":signal.aborted ? !this.#accepting ? "interrupted" : this.#hold ? "paused" : "queued" : "failed";
      this.store.patch(job.id,{status,stage:status,percent:0,
        message: status === "failed" ? (error instanceof Error ? error.message.slice(0,200) : "制作失败，请重试")
          : status === "interrupted" && !archived ? "处理已中断，请点击重试" : undefined });
      this.store.finishAttempt(attemptId,status);
      // Only discard this invocation's unpublished output, after its worker has exited.
      const attemptsRoot=resolve(this.root,job.id,"attempts")+sep;
      if(!archived&&!(error instanceof WorkerStopError)&&directory.startsWith(attemptsRoot)&&this.store.get(job.id)?.assetPath!==directory) {
        await rm(directory,{recursive:true,force:true}).catch(()=>this.store.finishAttempt(attemptId,"cleanup_failed"));
      }
    }
  }
  async #normalize(id:string,signal:AbortSignal):Promise<string> {
    const client=this.#standardizer;
    let job=this.store.get(id)!;
    // Existing roles retain their original production path. Only new uploads opt in.
    if(!job.normalization)return job.sourcePath;
    if(!client)throw new Error("图片标准化服务不可用");
    while(true) {
      signal.throwIfAborted();job=this.store.active(id)!;
      if(!job)throw new Error("人物已删除");
      let normalization=job.normalization!;
      if(normalization.state==="ready"&&job.normalizedPath) {
        await stat(job.normalizedPath).catch(()=>{throw new Error("标准照片不可用，请重新上传照片");});
        return job.normalizedPath;
      }
      if(normalization.state==="requesting")throw new Error("上次图片请求结果未确认，请手动重试");
      if(normalization.state==="failed")throw new Error("照片标准化失败，请重试或更换照片");
      if(normalization.state==="pending") {
        const model=normalization.slot==="primary"?client.primary:client.fallback;
        normalization={state:"requesting",slot:normalization.slot,model};
        this.store.patch(id,{normalization,stage:normalization.slot==="primary"?"standardizing":"standardizing_fallback",percent:2});
        this.#phase="cloud";
        let result;
        try {result=await client.generate(job.sourcePath,model);}
        catch(error) {
          const next=normalization.slot==="primary"?{state:"pending" as const,slot:"fallback" as const}:{...normalization,state:"failed" as const};
          this.store.patch(id,{normalization:{...next,error:error instanceof Error?error.message:"图片服务异常"}});
          // Pause/archive is not a model failure; no new paid request while interrupted.
          signal.throwIfAborted();
          if(next.state==="failed")throw new Error("照片标准化失败，备用模型也未能生成，请重试或更换照片");
          continue;
        }
        // Save a completed paid output outside disposable rendering attempts.
        const folder=resolve(this.root,id,"standardized"),candidatePath=resolve(folder,randomUUID()+".png");
        await mkdir(folder,{recursive:true});await writeFile(candidatePath,result.bytes,{flag:"wx"});
        normalization={...normalization,state:"received",candidatePath,elapsedMs:result.elapsedMs,usage:result.usage};
        this.store.patch(id,{normalization});
        signal.throwIfAborted();
      }
      this.#phase="local";
      this.store.patch(id,{stage:"checking_portrait",percent:4});
      try {await client.validate(normalization.candidatePath!,signal);}
      catch(error) {
        signal.throwIfAborted();
        if(error instanceof PortraitValidationUnavailableError)throw error;
        const next=normalization.slot==="primary"?{state:"pending" as const,slot:"fallback" as const}:{...normalization,state:"failed" as const};
        this.store.patch(id,{normalization:{...next,error:"图片未通过人物校验"}});
        if(next.state==="failed")throw new Error("照片标准化失败，请使用清晰、无遮挡的单人照片重试");
        continue;
      }
      signal.throwIfAborted();
      this.store.patch(id,{normalization:{...normalization,state:"ready"},normalizedPath:normalization.candidatePath});
      return normalization.candidatePath!;
    }
  }
  async handle(request: IncomingMessage,response: ServerResponse): Promise<void> {
    if (!isLocalRequest(request)) { json(response,403,{message:"仅允许本机页面访问"}); return; }
    const pathname = (request.url ?? "").split("?")[0]!;
    try {
      await this.initialized;
      if (request.method === "GET" && pathname === "/api/avatars") {
        json(response,200,{avatars:this.store.list().map(publicJob),callActive:this.callActive,message:this.#fault}); return;
      }
      if (request.method === "GET" && pathname === "/api/avatars/current") {
        const jobs=this.store.list();
        json(response,200,{avatar:jobs.filter(j=>j.status==="ready").map(publicJob).at(-1)??null,
          processing:jobs.filter(pendingStatus).map(publicJob)[0]??null}); return;
      }
      if (request.method === "POST" && ["/api/avatars","/api/avatars/batches"].includes(pathname)) {
        await this.#upload(request,response,pathname.endsWith("/batches")); return;
      }
      const roleMatch=/^\/api\/avatars\/([^/]+)$/.exec(pathname);
      if(roleMatch&&AVATAR_ID.test(roleMatch[1]!)&&["PATCH","DELETE"].includes(request.method??"")) {
        const id=roleMatch[1]!;
        if(request.headers["x-avatar-upload"]!=="1")throw new RequestError(403,"请从人物列表操作");
        if(!this.store.active(id))throw new RequestError(404,"人物不存在");
        if(request.method==="DELETE") {
          if(this.#holdAvatar===id)throw new RequestError(409,"请先挂断该人物的通话");
          this.store.patch(id,{DELET_OR_NOT:true,deletedAt:new Date().toISOString()});
          if(this.#runningId===id)this.#abort?.abort(new Error("archived"));
          json(response,200,{archived:true});return;
        }
        if(request.headers["content-type"]!=="application/json")throw new RequestError(415,"请提交人物设置");
        let data;
        try{data=JSON.parse((await body(request,20_000)).toString("utf8"));}catch{throw new RequestError(400,"人物设置格式无效");}
        if(!data||typeof data!=="object"||Array.isArray(data)||Object.keys(data).some(k=>!["name","persona"].includes(k)))throw new RequestError(400,"人物设置字段无效");
        const changes:Partial<AvatarRecord>={};
        if(Object.hasOwn(data,"name")) {
          if(typeof data.name!=="string"||!data.name.trim()||data.name.trim().length>100||/[\x00-\x1f]/.test(data.name))throw new RequestError(400,"人物名称需为 1—100 个字符");
          changes.name=data.name.trim();
        }
        if(Object.hasOwn(data,"persona")) {
          if(typeof data.persona!=="string"||data.persona.length>2000||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(data.persona))throw new RequestError(400,"角色设定最多 2000 个字符");
          changes.persona=data.persona.trim();
        }
        if(!this.store.active(id))throw new RequestError(404,"人物不存在");
        json(response,200,publicJob(this.store.patch(id,changes)));return;
      }
      const match=/^\/api\/avatars\/([^/]+)\/(.+)$/.exec(pathname);
      if (!match || !AVATAR_ID.test(match[1]!)) throw new RequestError(404,"人物不存在");
      const id=match[1]!, asset=match[2]!;
      const job=this.store.active(id);
      if (asset === "retry" && request.method === "POST") {
        if (request.headers["x-avatar-upload"]!=="1") throw new RequestError(403,"请从人物列表重试");
        if (!this.#accepting || this.#fault) throw new RequestError(503,this.#fault??"制作服务正在关闭，请稍后重试");
        if (!job) throw new RequestError(404,"人物不存在");
        if (!["failed","interrupted"].includes(job.status)) { json(response,200,publicJob(job)); return; }
        if (this.#hold || this.#uploading) throw new RequestError(409,"请在通话或上传结束后重试");
        await stat(job.sourcePath).catch(()=>{throw new RequestError(409,"原照片不可用，请重新上传");});
        // Filesystem checks yield: a call, shutdown or another retry may have won.
        if (!this.#accepting) throw new RequestError(503,"制作服务正在关闭，请稍后重试");
        if (this.#hold || this.#uploading) throw new RequestError(409,"请在通话或上传结束后重试");
        const current=this.store.active(id);
        if(!current)throw new RequestError(404,"人物不存在");
        if(!["failed","interrupted"].includes(current.status)){json(response,200,publicJob(current));return;}
        const normalization=current.normalization;
        this.store.patch(id,{status:"queued",stage:"queued",percent:0,message:undefined,
          normalization:normalization&&["failed","requesting"].includes(normalization.state)?{state:"pending",slot:"primary"}:normalization});
        this.#pump(); json(response,202,publicJob(this.store.get(id)!)); return;
      }
      if (!["GET","HEAD"].includes(request.method??"")) throw new RequestError(404,"接口不存在");
      if (asset==="status") {
        // Import interrupted old jobs that may have been copied into the local library.
        if (!job) await this.store.importLegacy();
        const found=this.store.active(id); json(response,found?200:404,found?publicJob(found):{message:"人物不存在"}); return;
      }
      if (!job || job.status!=="ready" || !job.assetPath || !Object.hasOwn(ASSETS,asset)) throw new RequestError(404,"人物资源不可用");
      const file=resolve(job.assetPath,asset), info=await stat(file);
      let start=0,end=info.size-1;
      if(request.headers.range) {
        const range=/^bytes=(\d+)-(\d*)$/.exec(request.headers.range);
        if(!range) {response.writeHead(416,{"content-range":`bytes */${info.size}`}).end();return;}
        start=Number(range[1]);end=range[2]?Math.min(Number(range[2]),end):end;
        if(start>end||start>=info.size){response.writeHead(416,{"content-range":`bytes */${info.size}`}).end();return;}
      }
      response.writeHead(request.headers.range?206:200,{"content-type":ASSETS[asset]!,"content-length":end-start+1,
        "accept-ranges":"bytes","cache-control":"private, no-cache","x-content-type-options":"nosniff",
        "cross-origin-resource-policy":"same-origin",...(request.headers.range?{"content-range":`bytes ${start}-${end}/${info.size}`}:{})});
      if(request.method==="HEAD"){response.end();return;}
      const stream=createReadStream(file,{start,end});
      response.once("close",()=>stream.destroy());stream.once("error",()=>response.destroy());stream.pipe(response);
    } catch(error) {
      if(!response.headersSent) json(response,error instanceof RequestError?error.status:500,
        {message:error instanceof RequestError?error.message:"本地人物服务异常，请重试"});
      else response.destroy();
    }
  }
  async #upload(request: IncomingMessage,response: ServerResponse,batch: boolean) {
    if(request.headers["x-avatar-upload"]!=="1") throw new RequestError(403,"请从本机上传页面提交");
    if(this.#uploading) throw new RequestError(409,"正在接收照片，请稍后再试");
    const type=request.headers["content-type"]??"";
    if(batch ? type!=="application/json" : !TYPES.has(type)) throw new RequestError(415,"上传格式不支持");
    this.#uploading=true;
    try {
      const bytes=await body(request,batch?MAX_BATCH_BYTES:MAX_PHOTO_BYTES);
      let files: Array<{name:string;type:string;data:string}>;
      let key:string;
      if(batch) {
        let value;
        try {value=JSON.parse(bytes.toString("utf8"));}catch{throw new RequestError(400,"批次数据无效");}
        if(!Array.isArray(value.files)||value.files.length<1||value.files.length>3) throw new RequestError(400,"每批请选择 1—3 张照片");
        if(typeof value.requestId!=="string"||!AVATAR_ID.test(value.requestId)) throw new RequestError(400,"提交标识无效");
        files=value.files;key=value.requestId;
      } else {
        if(!hasImageSignature(bytes,type)) throw new RequestError(415,"图片内容与格式不匹配");
        files=[{name:"照片人物",type,data:bytes.toString("base64")}];key=randomUUID();
      }
      const existing=this.store.batchByKey(key);
      if(existing) {json(response,200,{batchId:existing,avatars:this.store.list().filter(j=>j.batchId===existing).map(publicJob)});return;}
      if(!this.#accepting||this.#hold||this.store.list().some(pendingStatus)) throw new RequestError(409,"请等待当前批次或通话结束");
      const batchId=randomUUID(), jobs:AvatarRecord[]=[];
      for(const file of files) {
        const id=randomUUID(),directory=resolve(this.root,id);
        const name=typeof file?.name==="string"?file.name.replace(/[\x00-\x1f]/g,"").replace(/\.(png|jpe?g|webp)$/i,"").slice(0,100):"照片人物";
        let photo:Buffer|undefined, message:string|undefined;
        if(!file||!TYPES.has(file.type)||typeof file.data!=="string"||file.data.length>MAX_PHOTO_BYTES*4/3+4
          ||file.data.length%4!==0||/[^A-Za-z0-9+/=]/.test(file.data)) message="请选择不超过 12 MB 的 JPG、PNG 或 WebP 照片";
        else {
          photo=Buffer.from(file.data,"base64");
          if(photo.length>MAX_PHOTO_BYTES||photo.toString("base64")!==file.data||!hasImageSignature(photo,file.type)) message="图片内容与格式不匹配";
        }
        await mkdir(directory,{recursive:true});
        const sourcePath=resolve(directory,"upload.bin");
        if(photo) await writeFile(sourcePath,photo,{flag:"wx"});
        jobs.push({id,batchId,name:name||"照片人物",status:message?"failed":"queued",stage:message?"failed":"queued",
          percent:0,createdAt:new Date().toISOString(),sourcePath,attempt:0,message,
          ...(this.#standardizer?{normalization:{state:"pending" as const,slot:"primary" as const}}:{})});
      }
      if(!this.#accepting) throw new RequestError(503,"服务正在关闭");
      this.store.transaction(()=>{this.store.addBatch(batchId,key);for(const job of jobs)this.store.save(job);});
      this.#pump();
      json(response,202,batch?{batchId,avatars:jobs.map(publicJob)}:publicJob(this.store.get(jobs[0]!.id)!));
    } finally {this.#uploading=false;}
  }
  async stop() {
    this.#accepting=false;this.#abort?.abort(new Error("shutdown"));
    await this.initialized;await this.#running;
    for(const job of this.store.list().filter(pendingStatus))
      this.store.save({...job,status:"interrupted",stage:"interrupted",message:"处理已中断，请点击重试"});
  }
  async dispose() {await this.stop();this.store.close();}
}

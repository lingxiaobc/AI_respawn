import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { RolePipeline } from "./src/pipeline.ts";
import { PaidImages } from "./src/paid-images.ts";
import { STAGES, type RoleJob, type Stage } from "./src/state.ts";

class FakePipeline extends RolePipeline {
  executed: string[]=[]; fail?: Stage;
  override async execute(job: RoleJob, stage: Stage) {
    this.executed.push(stage);if(stage===this.fail)throw new Error("INJECTED_FAILURE");
    const file=join(this.store.directory(job.id),`${stage}.fixture`);await writeFile(file,"test");return [file];
  }
}
test("pipeline serializes duplicate submits, pauses and resumes only missing stages",async()=>{
  const root=await mkdtemp(join(tmpdir(),"role-pipeline-"));
  const pipeline=new FakePipeline({root,python:"unused",paid:new PaidImages(join(root,"paid"),{edit:async()=>{throw new Error("must not call provider");}})});
  try{
    await pipeline.initialize();pipeline.fail="mouth-open";const bytes=await createCanvas(512,512).encode("png");
    const [a,b]=await Promise.all([pipeline.submit("a.png",bytes,"same-key"),pipeline.submit("a.png",bytes,"same-key")]);assert.equal(a.id,b.id);
    await pipeline.wait();const stopped=await pipeline.store.get(a.id);assert.equal(stopped.status,"paused");assert.equal(pipeline.executed.filter(x=>x==="normalize").length,1,JSON.stringify(stopped));
    pipeline.fail=undefined;await pipeline.resume(a.id);await pipeline.wait();
    const ready=await pipeline.store.get(a.id);assert.equal(ready.status,"awaiting_review");assert.equal(Object.keys(ready.completed).length,STAGES.length);
    assert.equal(pipeline.executed.filter(x=>x==="normalize").length,1);
    await assert.rejects(pipeline.review(a.id,"approved","","wrong"),/STALE/);
    const results=await Promise.allSettled([pipeline.review(a.id,"approved","ok",ready.resourceHash!),pipeline.review(a.id,"rejected","no",ready.resourceHash!)]);
    assert.equal(results.filter(x=>x.status==="fulfilled").length,1);
    assert.equal((await pipeline.store.get(a.id)).status,"approved");
    assert.throws(()=>pipeline.safePath(a.id,"../outside"),/OUTSIDE/);
  }finally{await pipeline.close();await rm(root,{recursive:true,force:true});}
});
test("corrupt completed checkpoint blocks resume without repeating work",async()=>{
  const root=await mkdtemp(join(tmpdir(),"role-checkpoint-"));
  const pipeline=new FakePipeline({root,python:"unused",paid:new PaidImages(join(root,"paid"),{edit:async()=>{throw new Error("forbidden");}})});
  try{
    await pipeline.initialize();pipeline.fail="normalize";
    const a=await pipeline.submit("a.png",await createCanvas(512,512).encode("png"),"checkpoint-key");await pipeline.wait();
    await writeFile(join(pipeline.store.directory(a.id),"preflight.fixture"),"corrupt");
    const count=pipeline.executed.length;await pipeline.resume(a.id);await pipeline.wait();
    assert.match((await pipeline.store.get(a.id)).error!,/HASH_MISMATCH/);assert.equal(pipeline.executed.length,count);
  }finally{await pipeline.close();await rm(root,{recursive:true,force:true});}
});

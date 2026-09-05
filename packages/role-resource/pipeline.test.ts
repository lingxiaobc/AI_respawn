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
test('strict canonical failure happens after normalization and before any donor request',async()=>{
  const root=await mkdtemp(join(tmpdir(),'canonical-gate-'));let generated=0;const commands:string[]=[];
  class CanonicalFailure extends RolePipeline {
    override async command(program:string,args:string[]){
      if(args[0].endsWith('preflight.py')){commands.push('source-basic');assert.ok(args[1].endsWith('source.upload'));await writeFile(args[2],JSON.stringify({passed:true,facialQualityAssessed:false}));return;}
      assert.ok(args[0].endsWith('prepare.py'));assert.ok(args[1].endsWith('canonical.png'));commands.push('canonical-strict');
      throw new Error('CANONICAL_INVALID: FACE_COUNT_INVALID: detected=0, expected=1');
    }
  }
  const pipeline=new CanonicalFailure({root,python:'mock-local',paid:new PaidImages(join(root,'paid'),{edit:async()=>{generated++;return {bytes:await createCanvas(1024,1536).encode('png'),model:'test'};}},true)});
  try{
    await pipeline.initialize();const job=await pipeline.submit('source.png',await createCanvas(512,512).encode('png'),'canonical-failure');await pipeline.wait();
    const result=await pipeline.store.get(job.id);assert.equal(result.status,'paused');assert.equal(result.stage,'locate');assert.match(result.error!,/CANONICAL_INVALID/);
    assert.equal(generated,1);assert.ok(result.completed.normalize);assert.equal(result.completed['mouth-half'],undefined);assert.deepEqual(commands,['source-basic','canonical-strict']);
  }finally{await pipeline.close();await rm(root,{recursive:true,force:true});}
});
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
test('changed derived version pauses before execution and preserves existing checkpoints',async()=>{
  const root=await mkdtemp(join(tmpdir(),'role-version-'));
  const pipeline=new FakePipeline({root,python:'unused',paid:new PaidImages(join(root,'paid'),{edit:async()=>{throw new Error('forbidden');}})});
  try{
    await pipeline.initialize();pipeline.fail='normalize';
    const a=await pipeline.submit('a.png',await createCanvas(512,512).encode('png'),'version-test');await pipeline.wait();
    const job=await pipeline.store.get(a.id);job.pipelineVersion='old-version';await pipeline.store.save(job);
    const before=pipeline.executed.length;await pipeline.resume(a.id);await pipeline.wait();
    const result=await pipeline.store.get(a.id);assert.match(result.error!,/PIPELINE_VERSION_CHANGED/);assert.equal(pipeline.executed.length,before);assert.ok(result.completed.preflight);
  }finally{await pipeline.close();await rm(root,{recursive:true,force:true});}
});

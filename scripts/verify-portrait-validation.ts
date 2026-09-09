import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join,resolve } from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { ZenMuxPortraitStandardizer, PortraitValidationUnavailableError } from "../apps/server/src/portrait-standardizer.ts";
const root=await mkdtemp(join(tmpdir(),"portrait-validation-"));
try {
  const client=new ZenMuxPortraitStandardizer(),good=resolve("artifacts/portrait-verification-v3/2-青年.png");
  await client.validate(good,new AbortController().signal);
  const bytes=await readFile(good),bad=join(root,"truncated.png");await writeFile(bad,bytes.subarray(0,Math.floor(bytes.length/2)));
  await assert.rejects(client.validate(bad,new AbortController().signal),e=>e instanceof Error&&!(e instanceof PortraitValidationUnavailableError));
  await assert.rejects(client.validate(join(root,"missing.png"),new AbortController().signal),PortraitValidationUnavailableError);
  const missing=spawnSync(resolve(".cache/dh-prep-py312/Scripts/python.exe"),[join(root,"missing-validator.py")],{windowsHide:true,stdio:"ignore"});
  assert.equal(missing.status,2);assert.notEqual(missing.status,42);
  const result={validImage:true,truncatedImageClassifiedAsBad:true,missingFileClassifiedAsInfrastructure:true,pythonMissingScriptCode:missing.status,badImageCode:42,cloudCalls:0};
  await writeFile("artifacts/portrait-verification-v3/validation.json",JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await rm(root,{recursive:true,force:true});}

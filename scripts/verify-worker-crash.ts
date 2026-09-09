/** Explicit Windows real-worker parent-crash check, isolated from the user's library. */
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { prepareAvatar } from "../apps/server/src/avatar-worker.ts";
const run=promisify(execFile);
if(process.argv[2]==="child"){
  try{await prepareAvatar(process.argv[3]!,"crash-verification",stage=>process.send?.({stage}),new AbortController().signal,resolve("测试图片/青年.png"));}
  catch(error){process.send?.({error:String(error)});process.exitCode=1;}
} else {
  assert.equal(process.platform,"win32");
  const output=resolve("artifacts/worker-crash",String(Date.now()));
  await mkdir(output,{recursive:true});
  const child=spawn(process.execPath,["--experimental-strip-types",resolve("scripts/verify-worker-crash.ts"),"child",output],
    {stdio:["ignore","ignore","pipe","ipc"],windowsHide:true});
  let failure="";
  child.stderr?.on("data",chunk=>{failure=(failure+String(chunk)).slice(-1800);});
  const processes=async()=>{
    const query="Get-CimInstance Win32_Process | Where-Object { ($_.Name -like '*python*' -or $_.Name -like '*ffmpeg*') -and $_.CommandLine -like '*"+output.replaceAll("'","''")+"*' } | Select-Object ProcessId,ParentProcessId,Name | ConvertTo-Json -Compress";
    const {stdout}=await run("powershell",["-NoProfile","-Command",query],{windowsHide:true});
    const value=stdout.trim()?JSON.parse(stdout):[];return Array.isArray(value)?value:[value];
  };
  const before=await new Promise<unknown[]>((done,reject)=>{
    const timeout=setTimeout(()=>{child.kill();reject(Error("Worker did not start"));},30_000);
    child.on("message",message=>{if(message&&typeof message==="object"&&"error" in message){clearTimeout(timeout);reject(Error(String(message.error)));}
      if(message&&typeof message==="object"&&"stage" in message&&message.stage==="checking"){
      clearTimeout(timeout);void processes().then(done,reject);
    }});
    child.once("error",reject);
    child.once("exit",code=>{clearTimeout(timeout);reject(Error(`Worker host exited (${code}): ${failure}`));});
  });
  assert.ok(before.length>0);
  const crashed=performance.now();child.kill(); // Only this test's owned Node PID, without /T.
  let after=await processes();
  for(let n=0;after.length&&n<20;n++){await new Promise(r=>setTimeout(r,250));after=await processes();}
  const result={before,after,cleanupMs:Math.round(performance.now()-crashed),result:after.length?"FAIL":"PASS"};
  await writeFile(resolve(output,"verification.json"),JSON.stringify(result,null,2));
  console.log(JSON.stringify({output,...result}));assert.equal(after.length,0);
}

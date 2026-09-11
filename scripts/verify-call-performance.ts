/** Opt-in Windows comparison: real serial preparation + real gateway, isolated library. */
import assert from "node:assert/strict";
import { spawn,execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir,readFile,writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "node:net";
import { randomUUID, randomBytes } from "node:crypto";
import { diagnosticSession } from "./account-session.ts";
import { WebSocket } from "ws";
import { parsePcm16Wav,splitPcmFrames } from "../packages/audio/src/wav.ts";
const exec=promisify(execFile),wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const root=resolve("artifacts/call-performance",String(Date.now()));await mkdir(root,{recursive:true});
const portHolder=createServer();await new Promise<void>(r=>portHolder.listen(0,"127.0.0.1",r));
const port=(portHolder.address() as {port:number}).port;await new Promise<void>(r=>portHolder.close(()=>r()));
const base=`http://127.0.0.1:${port}`;
const testPassword=randomBytes(24).toString("base64url");
let account: Awaited<ReturnType<typeof diagnosticSession>>;
const fetch=(input:string,init?:RequestInit)=>account.request(input,init);
const host=spawn(process.execPath,["--experimental-strip-types",resolve("apps/server/src/server.ts")],{
  windowsHide:true,stdio:["ignore","pipe","pipe","ipc"],env:{...process.env,ADMIN_INITIAL_PASSWORD:testPassword,PORT:String(port),AVATAR_STORAGE_DIR:root,DIAGNOSTICS_DIR:resolve(root,"logs")}});
host.stderr?.resume();
const report:Record<string,unknown>={root,method:"Gateway-only CPU and memory; no browser renderer or microphone"};
const library=async()=>await(await fetch(base+"/api/avatars")).json();
async function until(check:()=>Promise<boolean>,timeout=180_000){const deadline=Date.now()+timeout;while(Date.now()<deadline){if(await check())return;await wait(20);}throw Error("State deadline");}
async function resources(){
  const escaped=root.replaceAll("'","''");
  const command=`$gateway=Get-Process -Id ${host.pid}; $workers=@(Get-CimInstance Win32_Process | Where-Object { ($_.Name -like '*python*' -or $_.Name -like '*ffmpeg*') -and $_.CommandLine -like '*${escaped}*' }); @{gatewayCpuSeconds=$gateway.CPU; gatewayWorkingSetBytes=$gateway.WorkingSet64; preparationProcesses=$workers.Count} | ConvertTo-Json -Compress`;
  return JSON.parse((await exec("powershell",["-NoProfile","-Command",command],{windowsHide:true})).stdout);
}
const frames=splitPcmFrames(parsePcm16Wav(await readFile("fixtures/input/test-utterance.wav")).pcm);
async function call(avatar:string){
  const began=performance.now();let prepared=0,ready=0,committed=0,firstAudio=0,bytes=0,firstResources:ReturnType<typeof resources>|undefined;
  const ws=new WebSocket(base.replace("http","ws")+"/ws?avatar="+avatar,{origin:"http://127.0.0.1:5173",headers:{cookie:account.cookie}});
  let watchdog:NodeJS.Timeout|undefined,playback:NodeJS.Timeout|undefined;
  try{
    await new Promise<void>((done,reject)=>{
      watchdog=setTimeout(()=>reject(Error("Call deadline")),60_000);
      ws.once("error",reject);
      ws.on("message",(data,binary)=>{
        if(binary){firstAudio ||= performance.now();bytes+=Array.isArray(data)?data.reduce((n,b)=>n+b.byteLength,0):data.byteLength;return;}
        const message=JSON.parse(data.toString());
        if(message.type==="error"){reject(Error(String(message.code)));return;}
        if(message.type==="prepared"){prepared=performance.now();firstResources=resources();}
        if(message.type==="state"&&message.state==="ready"){
          if(ready){done();return;}
          ready=performance.now();ws.send(JSON.stringify({type:"session.active"}));ws.send(JSON.stringify({type:"ptt.start"}));
          void(async()=>{for(const frame of frames){if(ws.readyState!==WebSocket.OPEN)return;ws.send(frame);await wait(20);}committed=performance.now();if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:"ptt.commit"}));})().catch(reject);
        }
        if(message.type==="turn"&&message.event==="audio.done")playback=setTimeout(()=>ws.readyState===WebSocket.OPEN&&ws.send(JSON.stringify({type:"playback.done"})),Math.ceil(bytes/48));
      });
      ws.once("close",()=>reject(Error("Unexpected close")));
    });
    const start=await firstResources!,end=await resources();
    assert.equal(start.preparationProcesses,0);assert.equal(end.preparationProcesses,0);assert.ok(bytes>0);
    return{preparedMs:Math.round(prepared-began),connectionReadyMs:Math.round(ready-began),commitToGatewayAudioMs:Math.round(firstAudio-committed),outputPcmBytes:bytes,
      gatewayCpuMs:Math.round((end.gatewayCpuSeconds-start.gatewayCpuSeconds)*1000),gatewayWorkingSetStartBytes:start.gatewayWorkingSetBytes,
      gatewayWorkingSetEndBytes:end.gatewayWorkingSetBytes,preparationProcessesAtStart:start.preparationProcesses,preparationProcessesAtEnd:end.preparationProcesses};
  }finally{
    clearTimeout(watchdog);clearTimeout(playback);
    const closed=new Promise<void>(r=>ws.once("close",()=>r()));
    if(ws.readyState===WebSocket.OPEN){ws.send(JSON.stringify({type:"session.close"}));await closed;}else ws.terminate();
    await until(async()=>!(await library()).callActive,10_000);
  }
}
try{
  await new Promise<void>((done,reject)=>{host.stdout?.on("data",v=>{if(String(v).includes("gateway-ready"))done();});host.once("error",reject);host.once("exit",code=>reject(Error(`Host exited ${code}`)));});
  account=await diagnosticSession(base,"lenox",testPassword);
  const files=await Promise.all(["青年.png","50多岁女性.png","老人1.png"].map(async name=>({name,type:"image/png",data:(await readFile(resolve("测试图片",name))).toString("base64")})));
  assert.equal((await fetch(base+"/api/avatars/batches",{method:"POST",headers:{"content-type":"application/json","x-avatar-upload":"1"},body:JSON.stringify({requestId:randomUUID(),files})})).status,202);
  await until(async()=>{const roles=(await library()).avatars;return roles[0]?.status==="ready"&&roles[1]?.status==="processing";});
  const roles=(await library()).avatars;report.interruptedCall=await call(roles[0].id);
  await until(async()=>(await library()).avatars.every((a:{status:string})=>a.status==="ready"));
  report.idleBaseline=await call(roles[0].id);report.result="PASS";
}catch(error){report.result="FAIL";report.error=String(error);process.exitCode=1;}
finally{
  if(host.connected){const exit=new Promise<void>(r=>host.once("exit",()=>r()));host.send({type:"shutdown"});await exit;}
  await writeFile(resolve(root,"verification.json"),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}

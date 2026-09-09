/** Opt-in real provider connection/clock soak; no microphone or chat recording. */
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { WebSocket } from "ws";
import { parsePcm16Wav, splitPcmFrames } from "../packages/audio/src/wav.ts";
const frames=splitPcmFrames(parsePcm16Wav(await readFile("fixtures/input/test-utterance.wav")).pcm);
const base="http://127.0.0.1:8877";
const root=resolve("artifacts/call-lifecycle",String(Date.now()));
await mkdir(root,{recursive:true});
async function released(){
  for(let n=0;n<100;n++){
    if(!(await(await fetch(base+"/api/avatars")).json()).callActive)return;
    await new Promise(r=>setTimeout(r,100));
  }
  throw new Error("Call ownership was not released");
}
const library=await(await fetch(base+"/api/avatars")).json();
assert.equal(library.callActive,false,"Finish the current browser call before starting");
const avatarId=library.avatars.filter((a:{status:string})=>a.status==="ready").at(-1)?.id;
assert.ok(avatarId);
const report:{avatarId:string;cycles:unknown[];soak?:unknown;result?:string}={avatarId,cycles:[]};
async function session(soak:boolean) {
  const started=performance.now();
  return await new Promise<Record<string,unknown>>((done,reject)=>{
    const ws=new WebSocket(base.replace("http","ws")+"/ws?avatar="+avatarId,{origin:"http://127.0.0.1:5173"});
    let active=0,expected=false,warning=false,lastMinute=-1,ended:string|undefined;
    let state="connecting", bytes=0,committed=0,firstAudio=0,rounds=0;
    const latencies:number[]=[];
    let playback:NodeJS.Timeout|undefined;
    const speak=async()=>{
      if(state!=="ready"||ws.readyState!==WebSocket.OPEN)return;
      state="listening";bytes=0;firstAudio=0;
      ws.send(JSON.stringify({type:"ptt.start"}));
      for(const frame of frames){if(ws.readyState!==WebSocket.OPEN)return;ws.send(frame);await new Promise(r=>setTimeout(r,20));}
      committed=performance.now();if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:"ptt.commit"}));
    };
    let keep:NodeJS.Timeout|undefined;
    const timeout=setTimeout(()=>{ws.terminate();reject(Error("Lifecycle deadline exceeded"));},soak?930_000:30_000);
    ws.on("message",(data,binary)=>{
      if(binary){bytes+=Array.isArray(data)?data.reduce((sum,item)=>sum+item.byteLength,0):data.byteLength;firstAudio ||= performance.now();return;}
      const message=JSON.parse(data.toString());
      if(message.type==="state")state=message.state;
      if(message.type==="turn"&&message.event==="audio.done"){
        rounds++;latencies.push(Math.round(firstAudio-committed));
        // Gateway soak only: simulate the reply duration, not browser rendering or hearing.
        playback=setTimeout(()=>ws.readyState===WebSocket.OPEN&&ws.send(JSON.stringify({type:"playback.done"})),Math.ceil(bytes/48000*1000));
      }
      if(message.type==="state"&&message.state==="ready"&&!active){
        active=performance.now();ws.send(JSON.stringify({type:"session.active"}));
        if(!soak){expected=true;ws.send(JSON.stringify({type:"session.close"}));}
        else {void speak();keep=setInterval(()=>void speak(),60_000);}
      }
      if(message.type==="clock"){
        if(message.maxRemaining<=10&&message.maxRemaining>0)warning=true;
        const minute=Math.floor(message.elapsedSeconds/60);
        if(minute!==lastMinute){lastMinute=minute;console.log(JSON.stringify({soakMinute:minute,elapsedSeconds:message.elapsedSeconds}));}
      }
      if(message.type==="error"){
        ended=message.code;expected=soak&&ended==="MAX_DURATION";
        if(!expected){ws.terminate();reject(Error(`Unexpected gateway error ${message.code}`));}
      }
    });
    ws.once("error",reject);
    ws.once("close",()=>{
      clearTimeout(timeout);clearInterval(keep);clearTimeout(playback);
      const activeMs=active?Math.round(performance.now()-active):0;
      if(!expected){reject(Error("Unexpected close"));return;}
      if(soak&&(!warning||activeMs<899_000||activeMs>920_000)){reject(Error(`Clock limit failed: ${activeMs}, warning=${warning}`));return;}
      done({connectionMs:Math.round(active-started),activeMs,warning,ended:ended??"USER_HANGUP",rounds,commitToFirstAudioMs:latencies});
    });
  });
}
try {
  for(let n=0;n<(process.argv.includes("--soak-only")?0:10);n++){
    report.cycles.push(await session(false));await released();
    console.log(JSON.stringify({cycle:n+1,result:"released"}));
  }
  await writeFile(resolve(root,"verification.json"),JSON.stringify(report,null,2));
  report.soak=await session(true);await released();report.result="PASS";
} catch(error){report.result="FAIL: "+String(error);throw error;}
finally{await writeFile(resolve(root,"verification.json"),JSON.stringify(report,null,2));console.log(JSON.stringify({report:resolve(root,"verification.json"),result:report.result}));}

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join,resolve } from "node:path";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { WebSocketServer,WebSocket } from "ws";
import { AvatarStore } from "../../apps/server/src/avatar-store.ts";
import { randomUUID } from "node:crypto";
const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
test("slow preparation resets heartbeat; upstream disconnect and shutdown release calls",{timeout:35_000},async t=>{
  const root=await mkdtemp(join(tmpdir(),"avatar-gateway-"));
  const roleIds=[randomUUID(),randomUUID()],batchId=randomUUID();
  const seed=new AvatarStore(join(root,"artifacts/avatars"));seed.addBatch(batchId,batchId);
  for(const [i,id] of roleIds.entries())seed.save({id,batchId,name:i?"角色乙":"角色甲",persona:i?"我是用户的老师，说话严谨":"我是用户的同学，语气轻松",status:"ready",stage:"ready",percent:100,createdAt:new Date().toISOString(),sourcePath:join(root,"unused"),attempt:0});
  seed.close();
  const mock=new WebSocketServer({host:"127.0.0.1",port:0});
  await new Promise<void>(r=>mock.once("listening",r));
  const holder=createServer();await new Promise<void>(r=>holder.listen(0,"127.0.0.1",r));
  const port=(holder.address() as {port:number}).port;await new Promise<void>(r=>holder.close(()=>r()));
  let connects=0,upstream:WebSocket|undefined;
  const instructions:string[]=[];
  mock.on("connection",ws=>{upstream=ws;const initial=++connects===1;
    ws.on("message",data=>{const event=JSON.parse(data.toString());
      if(event.type==="session.create"){instructions.push(event.session.instructions);setTimeout(()=>ws.readyState===WebSocket.OPEN&&ws.send(JSON.stringify({type:"session.created"})),initial?16_000:0);}
      if(event.type==="session.close")ws.send(JSON.stringify({type:"session.closed"}));
    });
  });
  const server=spawn(process.execPath,["--experimental-strip-types",resolve("apps/server/src/server.ts")],{
    cwd:root,windowsHide:true,stdio:["ignore","pipe","pipe","ipc"],
    env:{...process.env,PORT:String(port),AVATAR_STORAGE_DIR:join(root,"artifacts/avatars"),DIAGNOSTICS_DIR:join(root,"logs"),
      DOUBAO_API_KEY:"test-only",DOUBAO_WS_URL:`ws://127.0.0.1:${(mock.address() as {port:number}).port}`}
  });
  server.stderr?.resume();
  const browserSockets:WebSocket[]=[];
  t.after(async()=>{
    for(const ws of browserSockets)ws.terminate();
    for(const ws of mock.clients)ws.terminate();
    await new Promise<void>(r=>mock.close(()=>r()));
    if(server.exitCode===null){server.kill();await new Promise<void>(r=>server.once("exit",()=>r()));}
    await rm(root,{recursive:true,force:true});
  });
  await new Promise<void>((done,reject)=>{
    server.stdout?.on("data",data=>{if(String(data).includes("gateway-ready"))done();});
    server.once("error",reject);server.once("exit",code=>reject(Error(`Gateway exited ${code}`)));
  });
  async function connect(avatarId:string){
    const ws=new WebSocket(`ws://127.0.0.1:${port}/ws?avatar=${avatarId}`,{origin:"http://127.0.0.1:5173"});browserSockets.push(ws);
    const errors:string[]=[];ws.on("message",data=>{const m=JSON.parse(data.toString());if(m.type==="error")errors.push(m.code);});
    await new Promise<void>((done,reject)=>{
      ws.on("message",data=>{const m=JSON.parse(data.toString());if(m.type==="state"&&m.state==="ready")done();if(m.type==="error")reject(Error(m.code));});
      ws.once("error",reject);
    });
    ws.send(JSON.stringify({type:"session.active"}));return{ws,errors};
  }
  const first=await connect(roleIds[0]!);await delay(2200);
  assert.ok(instructions[0]?.includes("同学"));assert.ok(!instructions[0]?.includes("老师"));
  assert.equal(first.ws.readyState,WebSocket.OPEN);assert.deepEqual(first.errors,[]);
  const closed=new Promise<void>(r=>first.ws.once("close",()=>r()));upstream!.terminate();await closed;
  assert.deepEqual(first.errors,["UPSTREAM_DISCONNECTED"]);
  assert.equal((await(await fetch(`http://127.0.0.1:${port}/api/avatars`)).json()).callActive,false);
  const second=await connect(roleIds[1]!);await delay(100);
  assert.ok(instructions[1]?.includes("老师"));assert.ok(!instructions[1]?.includes("同学"));
  const exited=new Promise<void>(r=>server.once("exit",()=>r()));server.send({type:"shutdown"});await exited;
  assert.equal(server.exitCode,0);assert.deepEqual(second.errors,[]);
  const db=new DatabaseSync(join(root,"artifacts/avatars/avatars.sqlite"),{readOnly:true});
  try{
    const calls=db.prepare("SELECT reason,ended_at FROM calls ORDER BY rowid").all();
    assert.deepEqual(calls.map(c=>c.reason),["UPSTREAM_DISCONNECTED","SERVICE_SHUTDOWN"]);
    assert.ok(calls.every(c=>c.ended_at));
  }finally{db.close();}
});

import assert from "node:assert/strict";
import test from "node:test";
import { ZenMuxImageProvider } from "./src/zenmux.ts";
const input={pngBytes:Buffer.from([1]),sourceHash:"test",width:1024,height:1536,fileName:"a",mimeType:"image/png" as const};
const secret="test-only-never-log-credential";
const cases: Array<{name:string;stage:string;status:string;fetch:typeof fetch}>=[
  {name:"before headers",stage:"request-awaiting-headers",status:"none",fetch:async()=>{throw new TypeError("fetch failed",{cause:{code:"ECONNRESET"}});}},
  {name:"body interrupted",stage:"response-body",status:"200",fetch:async()=>new Response(new ReadableStream({start(c){c.error(new TypeError("terminated",{cause:{code:"UND_ERR_SOCKET"}}));}}))},
  {name:"bad JSON",stage:"response-json",status:"200",fetch:async()=>new Response(secret)},
  {name:"HTML gateway error",stage:"response-json",status:"502",fetch:async()=>new Response("<html>bad gateway</html>",{status:502})},
  {name:"missing image",stage:"response-schema",status:"200",fetch:async()=>Response.json({})},
  {name:"null JSON",stage:"response-schema",status:"200",fetch:async()=>Response.json(null)},
  {name:"wrong type",stage:"response-schema",status:"200",fetch:async()=>Response.json({data:[{b64_json:123}]})},
  {name:"HTTP JSON error",stage:"response-schema",status:"429",fetch:async()=>Response.json({error:{message:secret}},{status:429})},
  {name:"timeout",stage:"request-awaiting-headers",status:"none",fetch:async(_u,i)=>new Promise((_r,j)=>i!.signal!.addEventListener("abort",()=>j(new Error("aborted"))))},
];
for(const c of cases)test(`response error classification: ${c.name}`,async()=>{
  let calls=0;const p=new ZenMuxImageProvider({apiKey:secret,timeoutMs:30,fetchImpl:async(...args)=>{calls++;return c.fetch(...args);}});
  await assert.rejects(p.edit(input,"test"), (e:Error)=>{assert.ok(e.message.includes(`stage=${c.stage}`));assert.ok(e.message.includes(`http=${c.status}`));assert.ok(!e.message.includes(secret));assert.ok(e.message.length<=500);if(c.name==="body interrupted"){assert.match(e.message,/UND_ERR_SOCKET/);assert.doesNotMatch(e.message,/b64_json/);}return true;});
  assert.equal(calls,1);
});
test("response classification preserves valid JSON",async()=>{const p=new ZenMuxImageProvider({apiKey:secret,fetchImpl:async()=>Response.json({data:[{b64_json:"dGVzdA=="}]})});assert.equal((await p.edit(input,"test")).bytes.toString(),"test");});

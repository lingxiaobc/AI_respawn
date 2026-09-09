import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AvatarService, MAX_PHOTO_BYTES } from "../../apps/server/src/avatar-service.ts";

const png = Buffer.from([137,80,78,71,13,10,26,10,0]);
const headers = { origin: "http://127.0.0.1:5173", "x-avatar-upload": "1", "content-type": "image/png" };
async function fixture(t: TestContext, runner?: ConstructorParameters<typeof AvatarService>[1]) {
  const root = await mkdtemp(join(tmpdir(), "avatar-service-"));
  const service = new AvatarService(root, runner);
  const server = createServer((req,res) => { void service.handle(req,res); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  t.after(async () => { await service.dispose(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root,{recursive:true,force:true}); });
  const request = (path: string, options: RequestInit = {}) => fetch(`http://127.0.0.1:${address.port}${path}`, { ...options, headers: { ...headers, ...options.headers } });
  return { service, request, root };
}
test("photo upload rejects cross-site, missing marker, invalid type/signature and oversized declarations", async t => {
  const {request} = await fixture(t);
  for (const [extra,status,body] of [
    [{origin:"https://evil.example"},403,png], [{"x-avatar-upload":""},403,png],
    [{"content-type":"text/plain"},415,png], [{},415,Buffer.from("not a photo")],
  ] as Array<[Record<string,string>,number,Buffer]>) {
    const response = await request("/api/avatars",{method:"POST",headers:extra,body:Uint8Array.from(body)}); assert.equal(response.status,status);
  }
  const bytes = new Uint8Array(MAX_PHOTO_BYTES + 1);
  assert.equal((await request("/api/avatars",{method:"POST",body:bytes})).status,413);
  assert.equal((await request("/api/avatars/../../.env")).status,404);
});
test("only completed verified assets become current; concurrent uploads rejected; private files never served", async t => {
  let release!: () => void; const gate = new Promise<void>(resolve => { release=resolve; });
  const {request,root} = await fixture(t, async directory => {
    await gate; await mkdir(join(directory,"assets"));
    for(const name of ["frame.html","profile.json","source.jpg","assets/01.mp4","assets/combined_data.json.gz"])
      await writeFile(join(directory,name),"test asset bytes");
  });
  const response=await request("/api/avatars",{method:"POST",body:png}); assert.equal(response.status,202);
  const job=await response.json() as {id:string};
  assert.equal((await request("/api/avatars",{method:"POST",body:png})).status,409);
  assert.equal((await request(`/api/avatars/${job.id}/frame.html`)).status,404);
  release();
  let current;
  for(let i=0;i<100;i++) { current=await (await request("/api/avatars/current")).json() as {avatar:{id:string}|null}; if(current.avatar)break; await new Promise(r=>setTimeout(r,10)); }
  assert.equal(current?.avatar?.id,job.id);
  assert.equal((await request(`/api/avatars/${job.id}/upload.bin`)).status,404);
  assert.equal((await request(`/api/avatars/${job.id}/job.json`)).status,404);
  const partial=await request(`/api/avatars/${job.id}/assets/01.mp4`,{headers:{range:"bytes=1-3"}});
  assert.equal(partial.status,206); assert.equal((await partial.arrayBuffer()).byteLength,3);
  assert.equal((await request(`/api/avatars/${job.id}/assets/01.mp4`,{headers:{range:"bytes=999-"}})).status,416);
  assert.equal((await request(`/api/avatars/${job.id}/constructor`)).status,404);
  // An interrupted on-disk job must never appear ready after restart.
  const interrupted="11111111-1111-1111-1111-111111111111";
  await mkdir(join(root,interrupted)); await writeFile(join(root,interrupted,"job.json"),JSON.stringify({id:interrupted,status:"processing"}));
  const status=await (await request(`/api/avatars/${interrupted}/status`)).json() as {status:string};assert.equal(status.status,"interrupted");
});

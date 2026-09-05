import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCanvas} from '@napi-rs/canvas';
import {PaidImages} from './src/paid-images.ts';
import {hash} from './src/state.ts';
import {ZenMuxImageProvider} from '../image-normalization/src/zenmux.ts';

const input={sourceHash:'test-source',pngBytes:Buffer.from([1]),width:1024,height:1536,fileName:'a.png',mimeType:'image/png' as const};
test('exact approved retry preserves original failure and consumes at most one new call',async()=>{
 const root=await mkdtemp(join(tmpdir(),'role-approved-retry-'));let calls=0;
 const source={...input,sourceHash:'28fc670c26c2220b57730a02178b68fa3048d64e2ddbe0d7a8fe5db950a63ead'};
 const id=hash(`${source.sourceHash}:portrait-normalization-v1:normalize`);
 const original=JSON.stringify({id,state:'normalize',sourceHash:source.sourceHash,status:'failed-or-unknown'});
 const provider={edit:async()=>{calls++;return {bytes:await createCanvas(1024,1536).encode('png'),model:'test'};}};
 try{
  await mkdir(join(root,'.calls'));await writeFile(join(root,'.calls',`${id}.json`),original);
  await assert.rejects(new PaidImages(root,provider,false).image(source,'normalize','portrait-normalization-v1','test'),/DISABLED/);
  const paid=new PaidImages(root,provider,true);await paid.image(source,'normalize','portrait-normalization-v1','test');await paid.image(source,'normalize','portrait-normalization-v1','test');
  assert.equal(calls,1);assert.equal(await readFile(join(root,'.calls',`${id}.json`),'utf8'),original);
  const replacement=JSON.parse(await readFile(join(root,'.calls',`${id}-approved-retry-1.json`),'utf8'));assert.equal(replacement.retryOf,id);assert.equal(replacement.status,'succeeded');
 }finally{await rm(root,{recursive:true,force:true});}
});
for(const failure of ['headers','stream','save','malformed'] as const)test(`paid failure ${failure}: retain phase, never repeat after restart`,async()=>{
 const root=await mkdtemp(join(tmpdir(),'role-fault-'));let calls=0;
 const id=hash(`${input.sourceHash}:v1:normalize`);
 const output=join(root,'shared-images',`${id}.png`);
 const provider={edit:async(_input:typeof input,_prompt:string,onResponse?: (id?:string)=>Promise<void>)=>{
  calls++;
  if(failure==='headers')throw new Error('ECONNRESET before response headers');
  await onResponse?.('test-request-id');
  if(failure==='stream')throw new Error('stream interrupted before completed');
  if(failure==='save')await mkdir(output);
  return {bytes:failure==='malformed'?Buffer.from('not an image'):await createCanvas(1024,1536).encode('png'),requestId:'test-request-id',model:'test'};
 }};
 try{
  await assert.rejects(new PaidImages(root,provider,true).image(input,'normalize','v1','test'));
  const ledger=JSON.parse(await readFile(join(root,'.calls',`${id}.json`),'utf8'));
  assert.equal(ledger.status,'failed-or-unknown');
  assert.equal(ledger.phase,{headers:'request',stream:'response-headers',save:'save-image',malformed:'validate-image'}[failure]);
  if(failure!=='headers')assert.equal(ledger.requestId,'test-request-id');
  if(['save','malformed'].includes(failure))assert.match(ledger.receivedHash,/^[a-f0-9]{64}$/);
  await assert.rejects(new PaidImages(root,provider,true).image(input,'normalize','v1','test'),/UNKNOWN/);
  assert.equal(calls,1);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('actual streaming transport disconnect retains response phase',async()=>{
 const provider=new ZenMuxImageProvider({apiKey:'test-only',stream:true,fetchImpl:async()=>new Response(new ReadableStream({start(c){c.error(new Error('socket interrupted'));}}),{headers:{'content-type':'text/event-stream','x-request-id':'test-id'}})});
 let seen='';await assert.rejects(provider.edit(input,'test',async id=>{seen=id!;}),/stage=response-stream/);assert.equal(seen,'test-id');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir,readFile,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createCanvas} from '@napi-rs/canvas';
import {PaidImages} from './src/paid-images.ts';
import {GeminiImages} from './src/gemini-images.ts';
import {ZenMuxImageProvider} from '../image-normalization/src/zenmux.ts';
import {hash} from './src/state.ts';
import {validateAndConvertInput} from '../image-normalization/src/validation.ts';
const input={sourceHash:'fallback-fixture',pngBytes:Buffer.from([1]),width:1024,height:1536,fileName:'test',mimeType:'image/png' as const};
test('Gemini primary preserves validated historical normalization and fails closed on corruption',async()=>{
 const root=await mkdtemp(join(tmpdir(),'gemini-history-'));const previous=process.env.ZENMUX_IMAGE_MODEL;process.env.ZENMUX_IMAGE_MODEL='google/gemini-3-pro-image';
 try{
  const source=await validateAndConvertInput({fileName:'source.png',bytes:await createCanvas(512,512).encode('png')});
  const bytes=await createCanvas(1024,1536).encode('png');const cache=join(root,'cache'),folder=join(cache,'sample');await mkdir(folder,{recursive:true});
  await writeFile(join(folder,'source.png'),source.pngBytes);await writeFile(join(folder,'canonical.png'),bytes);
  await writeFile(join(folder,'metadata.json'),JSON.stringify({source:{sha256:source.sourceHash},canonical:{sha256:hash(bytes)},status:'succeeded',promptVersion:'v1'}));
  let calls=0;const primary=new ZenMuxImageProvider({apiKey:'test'});primary.edit=async()=>{calls++;throw new Error('NO_NETWORK');};
  const gemini=new GeminiImages(root,{edit:async()=>{calls++;throw new Error('NO_NETWORK');}},true);
  const service=new PaidImages(root,primary,true,cache,gemini);
  assert.deepEqual(await service.image(source,'normalize','v1','prompt'),bytes);
  await writeFile(join(folder,'canonical.png'),'corrupt');await assert.rejects(service.image(source,'normalize','v1','prompt'),/HASH_MISMATCH/);
  assert.equal(calls,0);
 }finally{if(previous===undefined)delete process.env.ZENMUX_IMAGE_MODEL;else process.env.ZENMUX_IMAGE_MODEL=previous;await rm(root,{recursive:true,force:true});}
});
test('explicit Gemini primary bypasses GPT and caches one call',async()=>{
 const root=await mkdtemp(join(tmpdir(),'gemini-primary-'));const previous=process.env.ZENMUX_IMAGE_MODEL;let calls=0;
 process.env.ZENMUX_IMAGE_MODEL='google/gemini-3-pro-image';
 try{
  const gemini=new GeminiImages(root,{edit:async()=>{calls++;return {bytes:await createCanvas(1024,1536).encode('png'),model:'google/gemini-3-pro-image'};}},true);
  const primary=new ZenMuxImageProvider({apiKey:'test'});primary.edit=async()=>{throw new Error('GPT_MUST_NOT_RUN');};
  const service=new PaidImages(root,primary,true,undefined,gemini);
  assert.equal((await service.normalize(input)).model,'google/gemini-3-pro-image');await service.normalize(input);
  assert.equal(calls,1);assert.equal((await readdir(join(root,'.calls'))).length,1);
 }finally{if(previous===undefined)delete process.env.ZENMUX_IMAGE_MODEL;else process.env.ZENMUX_IMAGE_MODEL=previous;await rm(root,{recursive:true,force:true});}
});
for(const fail of [false,true])test(`GPT failure switches once, separate ledger; Gemini fails=${fail}`,async()=>{
 const root=await mkdtemp(join(tmpdir(),'model-fallback-'));let gpt=0,gemini=0;
 const primary={edit:async()=>{gpt++;throw new Error('connection reset');}};
 const fallback=new GeminiImages(root,{edit:async()=>{gemini++;if(fail)throw new Error('Gemini403');return {bytes:await createCanvas(1024,1536).encode('png'),model:'google/gemini-3-pro-image'};}},true);
 const service=new PaidImages(root,primary,true,undefined,fallback);
 try{
  if(fail){await assert.rejects(service.image(input,'normalize','v1','test'),/Gemini403/);await assert.rejects(service.image(input,'normalize','v1','test'),/GEMINI_COMPLETION_UNKNOWN/);}
  else{const first=await service.image(input,'normalize','v1','test');assert.deepEqual(await service.image(input,'normalize','v1','test'),first);}
  assert.equal(gpt,1);assert.equal(gemini,1);
  const names=await readdir(join(root,'.calls'));assert.equal(names.length,2);
  const entries=await Promise.all(names.map(async n=>JSON.parse(await readFile(join(root,'.calls',n),'utf8'))));assert.ok(entries.some(e=>e.model==='google/gemini-3-pro-image'));
 }finally{await rm(root,{recursive:true,force:true});}
});
test('malformed GPT image is local validation failure, not a second paid request',async()=>{
 const root=await mkdtemp(join(tmpdir(),'no-local-fallback-'));let fallbackCalls=0;
 const service=new PaidImages(root,{edit:async()=>({bytes:Buffer.from('bad'),model:'test'})},true,undefined,new GeminiImages(root,{edit:async()=>{fallbackCalls++;throw new Error('forbidden');}},true));
 try{await assert.rejects(service.image(input,'mouth-open','v1','test'));await assert.rejects(service.image(input,'mouth-open','v1','test'));assert.equal(fallbackCalls,0);}finally{await rm(root,{recursive:true,force:true});}
});

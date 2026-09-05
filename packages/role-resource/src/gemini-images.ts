import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {hash,atomicJson} from './state.ts';
import {reserveCall,withCallLock} from '../../portrait-motion/src/donors.ts';
import {validateAndConvertInput,sanitizeProviderError} from '../../image-normalization/src/validation.ts';
import {GEMINI_IMAGE_MODEL,type ZenMuxGeminiProvider} from '../../image-normalization/src/gemini.ts';
import type {ValidatedImage} from '../../image-normalization/src/types.ts';
export class GeminiImages {
 readonly root:string;readonly provider:Pick<ZenMuxGeminiProvider,'edit'>;readonly enabled:boolean;
 constructor(root:string,provider:Pick<ZenMuxGeminiProvider,'edit'>,enabled:boolean){this.root=root;this.provider=provider;this.enabled=enabled;}
 async image(input:ValidatedImage,state:string,version:string,prompt:string):Promise<Buffer>{
  return withCallLock(this.root,async()=>{
   const id=hash(`${GEMINI_IMAGE_MODEL}:${input.sourceHash}:${version}:${state}`);const path=join(this.root,'.calls',`${id}.json`);
   const old=await readFile(path,'utf8').catch(e=>{if(e.code==='ENOENT')return undefined;throw e;});
   if(old){const entry=JSON.parse(old);if(entry.status!=='succeeded')throw new Error('GEMINI_COMPLETION_UNKNOWN: no automatic retry');const bytes=await readFile(entry.output);if(hash(bytes)!==entry.outputHash)throw new Error('GEMINI_CACHE_HASH_MISMATCH');return bytes;}
   if(!this.enabled)throw new Error('PAID_CALL_DISABLED');
   const output=resolve(this.root,'shared-images',`${id}.png`),rawOutput=resolve(this.root,'shared-images',`${id}.raw`);
   await mkdir(join(this.root,'shared-images'),{recursive:true});
   const details={id,model:GEMINI_IMAGE_MODEL,sourceHash:input.sourceHash,state,promptVersion:version,output,rawOutput,promptHash:hash(prompt),startedAt:new Date().toISOString()};
   await reserveCall(this.root,id,details);let phase='request',requestId:string|undefined;
   try{
    const result=await this.provider.edit(input,prompt,async value=>{requestId=value;phase='response-headers';await atomicJson(path,{...details,status:'reserved',phase,requestId});});
    requestId=result.requestId??requestId;phase='save-raw';await writeFile(rawOutput,result.bytes,{flag:'wx'});
    phase='validate-image';const decoded=await validateAndConvertInput({fileName:'gemini.png',bytes:result.bytes});
    if(Math.abs(decoded.width/decoded.height-2/3)>.015)throw new Error('Gemini aspect ratio differs from portrait contract');
    const canvas=createCanvas(1024,1536);canvas.getContext('2d').drawImage(await loadImage(decoded.pngBytes),0,0,1024,1536);
    const bytes=await canvas.encode('png');phase='save-output';await writeFile(output,bytes,{flag:'wx'});
    await atomicJson(path,{...details,status:'succeeded',requestId,outputHash:hash(bytes),rawHash:hash(result.bytes),nativeWidth:decoded.width,nativeHeight:decoded.height,conversion:'resize to 1024x1536 PNG; no crop',finishedAt:new Date().toISOString()});return bytes;
   }catch(error){await atomicJson(path,{...details,status:'failed-or-unknown',phase,requestId,error:sanitizeProviderError(error),finishedAt:new Date().toISOString()});throw error;}
  });
 }
}

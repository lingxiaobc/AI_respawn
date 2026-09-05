import type {ValidatedImage,ProviderResult} from './types.ts';
import {sanitizeProviderError} from './validation.ts';
export const GEMINI_IMAGE_MODEL='google/gemini-3-pro-image';
type Options={apiKey:string;baseUrl?:string;fetchImpl?:typeof fetch;timeoutMs?:number};
export class ZenMuxGeminiProvider {
 readonly options:Options;
 readonly #apiKey:string;
 constructor(options:Options){this.#apiKey=options.apiKey.trim();this.options={...options,apiKey:this.#apiKey};if(!this.#apiKey)throw new Error('ZENMUX_API_KEY required');}
 async edit(input:ValidatedImage,prompt:string,onResponse?:(id?:string)=>Promise<void>):Promise<ProviderResult>{
  const started=Date.now();let stage='request-awaiting-headers';let http:number|undefined;
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),this.options.timeoutMs??300000);
  try{
   const response=await (this.options.fetchImpl??fetch)(`${(this.options.baseUrl??'https://zenmux.ai/api/vertex-ai').replace(/\/$/,'')}/v1/publishers/google/models/gemini-3-pro-image:generateContent`,{
    method:'POST',headers:{authorization:`Bearer ${this.#apiKey}`,'content-type':'application/json'},signal:controller.signal,
    body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt},{inlineData:{mimeType:'image/png',data:input.pngBytes.toString('base64')}}]}],generationConfig:{candidateCount:1,responseModalities:['TEXT','IMAGE'],imageConfig:{aspectRatio:'2:3',imageSize:'2K'}}})
   });
   http=response.status;const requestId=response.headers.get('x-request-id')??response.headers.get('request-id')??undefined;
   stage='response-headers';await onResponse?.(requestId);stage='response-body';
   const text=await response.text();stage='response-json';let data;
   try{data=JSON.parse(text);}catch{throw new Error('Response is not JSON; body omitted');}
   if(!response.ok){
    const code=String(data?.error?.code??data?.error?.status??'');
    const safeCode=/^[A-Za-z0-9_-]{1,80}$/.test(code)?code:'unknown';
    const reason=typeof data?.error?.message==='string'?data.error.message.split(this.#apiKey).join('[REDACTED]'):'provider message unavailable';
    throw new Error(`Gemini HTTP ${http}; code=${safeCode}; ${sanitizeProviderError(reason)}`);
   }
   stage='response-schema';
   const candidates=data?.candidates;
   if(!Array.isArray(candidates)||candidates.length!==1)throw new Error('Expected exactly one candidate');
   const candidate=candidates[0];
   if(candidate.finishReason&&!['STOP','FINISH_REASON_STOP'].includes(candidate.finishReason))throw new Error('Candidate did not finish normally');
   const parts=candidate.content?.parts;
   const images=Array.isArray(parts)?parts.filter(p=>!p.thought&&(p.inlineData??p.inline_data)):[];
   if(images.length!==1)throw new Error('Expected exactly one final inline image');
   const image=images[0].inlineData??images[0].inline_data;
   if(!['image/png','image/jpeg','image/webp'].includes(image.mimeType??image.mime_type)||typeof image.data!=='string'||!image.data||image.data.length>32*1024*1024||!/^[A-Za-z0-9+/]+={0,2}$/.test(image.data))throw new Error('Invalid inline image encoding');
   return {bytes:Buffer.from(image.data,'base64'),model:GEMINI_IMAGE_MODEL,requestId:requestId??data.responseId};
  }catch(error){
   const e=error as Error&{cause?:{code?:string}};const code=/^[A-Z0-9_]+$/.test(e.cause?.code??'')?e.cause!.code:'';
   throw new Error(sanitizeProviderError(`[model=${GEMINI_IMAGE_MODEL} stage=${stage} http=${http??'none'} elapsedMs=${Date.now()-started}] ${code} ${(e.message??'Request failed').split(this.#apiKey).join('[REDACTED]')}`));
  }finally{clearTimeout(timer);}
 }
}

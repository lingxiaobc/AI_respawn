import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { hash, atomicJson } from "./state.ts";
import { reserveCall, withCallLock } from "../../portrait-motion/src/donors.ts";
import { sanitizeProviderError, validateAndConvertInput } from "../../image-normalization/src/validation.ts";
import type { ValidatedImage } from "../../image-normalization/src/types.ts";
import { ZenMuxImageProvider } from "../../image-normalization/src/zenmux.ts";
import {ZenMuxGeminiProvider,GEMINI_IMAGE_MODEL} from '../../image-normalization/src/gemini.ts';
import {GeminiImages} from './gemini-images.ts';
import { NORMALIZATION_CONTRACT, NORMALIZATION_PROMPT } from "../../image-normalization/src/contract.ts";
import { normalizedCache } from './normalization-cache.ts';

// One exact manual retry authorized by user on 2026-09-05; never a general retry policy.
const MANUAL_RETRIES:Readonly<Record<string,string>>={
  'd3182972ea563c4a8cf8d1ab2e96789a5d6545b2c77bd9bd3a1e4fa5739d04b5':'d3182972ea563c4a8cf8d1ab2e96789a5d6545b2c77bd9bd3a1e4fa5739d04b5-approved-retry-1',
};

export class PaidImages {
  readonly root: string;
  readonly provider: Pick<ZenMuxImageProvider, "edit">;
  readonly enabled: boolean;
  readonly normalizationRoot?: string;
  readonly fallback?:GeminiImages;
  readonly geminiPrimary?:GeminiImages;
  readonly resolvedModels=new Map<string,string>();
  constructor(root: string, provider: Pick<ZenMuxImageProvider, "edit">, enabled = false, normalizationRoot?: string, fallback?:GeminiImages) {
    this.root = root; this.provider = provider; this.enabled = enabled; this.normalizationRoot = normalizationRoot;
    this.fallback=fallback??(provider instanceof ZenMuxImageProvider && process.env.ZENMUX_IMAGE_FALLBACK===GEMINI_IMAGE_MODEL?new GeminiImages(root,new ZenMuxGeminiProvider({apiKey:process.env.ZENMUX_API_KEY??'',baseUrl:process.env.ZENMUX_GEMINI_BASE_URL}),enabled):undefined);
    if(provider instanceof ZenMuxImageProvider && process.env.ZENMUX_IMAGE_MODEL===GEMINI_IMAGE_MODEL){
      this.geminiPrimary=fallback??new GeminiImages(root,new ZenMuxGeminiProvider({apiKey:process.env.ZENMUX_API_KEY??'',baseUrl:process.env.ZENMUX_GEMINI_BASE_URL}),enabled);
    }
  }
  async normalize(input: ValidatedImage) {
    const bytes=await this.image(input, "normalize", NORMALIZATION_CONTRACT.promptVersion, NORMALIZATION_PROMPT);
    return {bytes,model:this.resolvedModels.get(`${input.sourceHash}:normalize`)??NORMALIZATION_CONTRACT.model};
  }
  async image(input: ValidatedImage, state: string, version: string, prompt: string): Promise<Buffer> {
    if(this.geminiPrimary){
      if(state==='normalize'&&this.normalizationRoot){const cached=await normalizedCache(this.normalizationRoot,input,version);if(cached){this.resolvedModels.set(`${input.sourceHash}:${state}`,NORMALIZATION_CONTRACT.model);return cached;}}
      const bytes=await this.geminiPrimary.image(input,state,version,prompt);this.resolvedModels.set(`${input.sourceHash}:${state}`,GEMINI_IMAGE_MODEL);return bytes;
    }
    try {const bytes=await this.primaryImage(input,state,version,prompt);this.resolvedModels.set(`${input.sourceHash}:${state}`,NORMALIZATION_CONTRACT.model);return bytes;}
    catch(error){
      // Only a recorded GPT request failure can trigger one model fallback.
      // Local cache/save/validation errors and reserved/active calls do not.
      if(!this.fallback)throw error;
      const originalId=hash(`${input.sourceHash}:${version}:${state}`);
      const paths=[originalId,MANUAL_RETRIES[originalId]].filter(Boolean);
      const records=[];
      for(const id of paths){const text=await readFile(join(this.root,'.calls',`${id}.json`),'utf8').catch(e=>{if(e.code==='ENOENT')return undefined;throw e;});if(text)records.push(JSON.parse(text));}
      const last=records.at(-1);
      if(last?.status!=='failed-or-unknown'||!['request','response-headers'].includes(last.phase))throw error;
      const bytes=await this.fallback.image(input,state,version,prompt);this.resolvedModels.set(`${input.sourceHash}:${state}`,GEMINI_IMAGE_MODEL);return bytes;
    }
  }
  private async primaryImage(input: ValidatedImage, state: string, version: string, prompt: string): Promise<Buffer> {
    return withCallLock(this.root, async () => {
      const originalId = hash(`${input.sourceHash}:${version}:${state}`);
      let id=originalId;
      let path = join(this.root, ".calls", `${id}.json`);
      const readPrevious=()=>readFile(path, "utf8").catch((e) => { if (e.code === "ENOENT") return undefined; throw e; });
      let previous=await readPrevious();
      if(previous && JSON.parse(previous).status==='failed-or-unknown' && MANUAL_RETRIES[originalId]) {
        id=MANUAL_RETRIES[originalId];path=join(this.root,'.calls',`${id}.json`);previous=await readPrevious();
      }
      if (previous) {
        const entry = JSON.parse(previous);
        if (entry.status !== "succeeded") throw new Error("PAID_COMPLETION_UNKNOWN: automatic retry prohibited");
        const bytes = await readFile(entry.output);
        if (hash(bytes) !== entry.outputHash) throw new Error("PAID_CACHE_HASH_MISMATCH");
        return bytes;
      }
      for (const name of await readdir(join(this.root, ".calls")).catch((e) => { if (e.code === "ENOENT") return []; throw e; })) {
        if (!name.endsWith(".json")) continue;
        if(id!==originalId && name===`${originalId}.json`)continue;
        const entry = JSON.parse(await readFile(join(this.root, ".calls", name), "utf8"));
        if(entry.model===GEMINI_IMAGE_MODEL)continue;
        if (entry.sourceHash === input.sourceHash && entry.state === state) throw new Error("PRIOR_CALL_REQUIRES_RECONCILIATION: changed prompt or historical replacement exists");
      }
      if(state === 'normalize' && this.normalizationRoot) {
        const cached = await normalizedCache(this.normalizationRoot, input, version);
        if(cached) return cached;
      }
      if (!this.enabled) throw new Error("PAID_CALL_DISABLED: development run permits no new generation");
      await mkdir(join(this.root, "shared-images"), { recursive: true });
      const output = resolve(this.root, "shared-images", `${id}.png`);
      const details = { id, ...(id!==originalId?{retryOf:originalId,approval:'user-2026-09-05-once'}:{}), state, sourceHash: input.sourceHash, promptVersion: version, output, startedAt: new Date().toISOString() };
      await reserveCall(this.root, id, details); // Shared historical ledger and approved attempt limit.
      let phase='request';
      let requestId:string|undefined;
      let receivedHash:string|undefined;
      try {
        const result = await this.provider.edit(input, prompt,async id=>{
          requestId=id;phase='response-headers';
          await atomicJson(path,{...details,status:'reserved',phase,requestId,headersAt:new Date().toISOString()});
        });
        requestId=result.requestId??requestId;receivedHash=hash(result.bytes);phase='response-received';
        await atomicJson(path,{...details,status:'reserved',phase,requestId,receivedHash,receivedBytes:result.bytes.length,receivedAt:new Date().toISOString()});
        phase='save-image';
        await writeFile(output, result.bytes, { flag: "wx" });
        phase='validate-image';
        const decoded = await validateAndConvertInput({ fileName: "generated.png", bytes: result.bytes });
        if (decoded.width !== 1024 || decoded.height !== 1536) throw new Error("OUTPUT_SIZE_MISMATCH");
        phase='commit-success';
        await atomicJson(path, { ...details, status: "succeeded", phase, requestId, outputHash: hash(result.bytes), finishedAt: new Date().toISOString() });
        return result.bytes;
      } catch (e) {
        await atomicJson(path, { ...details, status: "failed-or-unknown", phase, requestId, receivedHash, error: sanitizeProviderError(e), finishedAt: new Date().toISOString() });
        throw e;
      }
    });
  }
}

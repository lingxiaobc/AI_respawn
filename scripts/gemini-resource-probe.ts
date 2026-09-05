import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {loadLocalEnv} from './env.ts';
import {ZenMuxGeminiProvider} from '../packages/image-normalization/src/gemini.ts';
import {GeminiImages} from '../packages/role-resource/src/gemini-images.ts';
import {validateAndConvertInput,sanitizeProviderError} from '../packages/image-normalization/src/validation.ts';
import {donorPrompt,donorPromptVersion} from '../packages/portrait-motion/src/donors.ts';
import {atomicJson} from '../packages/role-resource/src/state.ts';
await loadLocalEnv();
const permissionRetry=process.argv.includes('--approved-permission-retry-1');
const attempt=permissionRetry?'approved-permission-retry-1':'initial';
const source=resolve('AI_output/motion/youth-v2/static_locked_base.png');
const out=resolve('AI_output/gemini-probe',...(permissionRetry?[attempt]:[]));await mkdir(out,{recursive:true});
const input=await validateAndConvertInput({fileName:'reference.png',bytes:await readFile(source)});
const images=new GeminiImages(resolve('AI_output/motion'),new ZenMuxGeminiProvider({apiKey:process.env.ZENMUX_API_KEY??'',baseUrl:process.env.ZENMUX_GEMINI_BASE_URL}),process.env.ROLE_ALLOW_PAID==='1');
const results=[];
for(const state of ['mouth-open','eyes-closed'] as const){
 const started=Date.now();console.log(JSON.stringify({state,status:'started'}));
 await writeFile(resolve(out,`${state}-prompt.txt`),donorPrompt(state));
 try{const version=donorPromptVersion(state)+(permissionRetry?`:${attempt}`:'');const bytes=await images.image(input,state,version,donorPrompt(state));const output=resolve(out,`${state}.png`);await writeFile(output,bytes);results.push({state,status:'succeeded',output,elapsedMs:Date.now()-started});}
 catch(error){results.push({state,status:'failed',error:sanitizeProviderError(error),elapsedMs:Date.now()-started});process.exitCode=1;}
 await atomicJson(resolve(out,'report.json'),{model:'google/gemini-3-pro-image',source,attempt,results});console.log(JSON.stringify(results.at(-1)));
}

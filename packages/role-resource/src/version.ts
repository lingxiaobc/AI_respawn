import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {hash} from './state.ts';

const root=new URL('../../../',import.meta.url);
export const VERSION_FILES=['scripts/portrait-motion/preflight.py','scripts/portrait-motion/prepare.py','scripts/portrait-motion/assemble.py','scripts/portrait-motion/inspect_donors.py','scripts/portrait-motion/audit_resource.py','scripts/portrait-motion/export_preview.py','scripts/portrait-motion/preview.html','scripts/portrait-motion/verify-preview.mjs','scripts/portrait-motion/finalize_resource.py','scripts/portrait-motion/requirements.txt','packages/role-resource/src/pipeline.ts','packages/role-resource/src/state.ts','packages/role-resource/src/version.ts','packages/role-resource/src/paid-images.ts','packages/role-resource/src/normalization-cache.ts','packages/portrait-motion/src/donors.ts','packages/image-normalization/src/contract.ts','packages/image-normalization/src/validation.ts','packages/image-normalization/src/zenmux.ts','packages/image-normalization/src/image-stream.ts','.motion-models/face_landmarker.task'];
export function versionFromParts(parts:Array<[string,string]>):string{return hash(JSON.stringify(parts));}
export async function pipelineVersion():Promise<string>{
  const files=[...VERSION_FILES,'packages/image-normalization/src/gemini.ts','packages/role-resource/src/gemini-images.ts','package.json','package-lock.json'];
  return versionFromParts([...await Promise.all(files.map(async path=>[path,hash(await readFile(fileURLToPath(new URL(path,root))))] as [string,string])),['node-runtime',process.version]]);
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {VERSION_FILES,versionFromParts} from './src/version.ts';
test('every declared behavior dependency changes the pipeline fingerprint',()=>{
 const parts=VERSION_FILES.map(path=>[path,'original'] as [string,string]);const original=versionFromParts(parts);
 for(let i=0;i<parts.length;i++)assert.notEqual(versionFromParts(parts.map((p,j)=>j===i?[p[0],'changed']:p)),original,parts[i][0]);
 for(const path of ['packages/portrait-motion/src/donors.ts','packages/image-normalization/src/contract.ts','packages/role-resource/src/paid-images.ts','packages/role-resource/src/normalization-cache.ts'])assert.ok(VERSION_FILES.includes(path));
});

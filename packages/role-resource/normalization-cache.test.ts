import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCanvas} from '@napi-rs/canvas';
import {normalizedCache} from './src/normalization-cache.ts';
import {hash} from './src/state.ts';
import {validateAndConvertInput} from '../image-normalization/src/validation.ts';

test('historical cache verifies converted source pixels and canonical hash, corrupt output fails closed',async()=>{
  const root=await mkdtemp(join(tmpdir(),'normalized-cache-'));
  try {
    const original=await createCanvas(512,512).encode('jpeg');
    const input=await validateAndConvertInput({fileName:'photo.jpg',bytes:original});
    const canonical=await createCanvas(1024,1536).encode('png');
    const dir=join(root,'sample');await mkdir(dir);
    await writeFile(join(dir,'source.png'),input.pngBytes);
    await writeFile(join(dir,'canonical.png'),canonical);
    await writeFile(join(dir,'metadata.json'),JSON.stringify({source:{sha256:input.sourceHash},canonical:{sha256:hash(canonical)},status:'succeeded',promptVersion:'v1'}));
    assert.notEqual(hash(input.pngBytes),input.sourceHash);
    assert.deepEqual(await normalizedCache(root,input,'v1'),canonical);
    await assert.rejects(normalizedCache(root,input,'v2'),/REQUIRES_REVIEW/);
    await writeFile(join(dir,'canonical.png'),'bad');
    await assert.rejects(normalizedCache(root,input,'v1'),/HASH_MISMATCH/);
  } finally {await rm(root,{recursive:true,force:true});}
});

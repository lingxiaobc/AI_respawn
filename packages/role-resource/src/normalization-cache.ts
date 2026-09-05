import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { hash } from './state.ts';
import { validateAndConvertInput } from '../../image-normalization/src/validation.ts';
import type { ValidatedImage } from '../../image-normalization/src/types.ts';

/** Read historical normalized images without rewriting or charging their ledger. */
export async function normalizedCache(root: string, input: ValidatedImage, version: string): Promise<Buffer | undefined> {
  const directories = await readdir(root, { withFileTypes: true }).catch(e => { if(e.code === 'ENOENT') return []; throw e; });
  for (const directory of directories) {
    if (!directory.isDirectory()) continue;
    const folder = join(root, directory.name);
    const raw = await readFile(join(folder, 'metadata.json'), 'utf8').catch(e => { if(e.code === 'ENOENT') return undefined; throw e; });
    if (!raw) continue;
    const metadata = JSON.parse(raw);
    if (metadata.source?.sha256 !== input.sourceHash) continue;
    if(metadata.status !== 'succeeded' || metadata.promptVersion !== version) throw new Error('NORMALIZATION_CACHE_REQUIRES_REVIEW');
    const source = await readFile(join(folder, 'source.png'));
    const bytes = await readFile(join(folder, 'canonical.png'));
    // The historical queue stored a PNG conversion, not the original file bytes.
    const storedInput = await validateAndConvertInput({fileName:'source.png',bytes:source});
    if(hash(storedInput.pngBytes) !== hash(input.pngBytes) || hash(bytes) !== metadata.canonical?.sha256) throw new Error('NORMALIZATION_CACHE_HASH_MISMATCH');
    const decoded = await validateAndConvertInput({fileName:'canonical.png',bytes});
    if(decoded.width !== 1024 || decoded.height !== 1536) throw new Error('NORMALIZATION_CACHE_SIZE_MISMATCH');
    return bytes;
  }
}

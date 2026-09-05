import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { applyRootEnv, ROOT_ENV_PATH } from '../../scripts/env.ts';

test('root .env overrides inherited credentials and all project settings', () => {
  const env = { ZENMUX_API_KEY:'machine-sentinel', ROLE_ALLOW_PAID:'1', PORT:'9999', PATH:'system-path', CUSTOM:'inherited' };
  applyRootEnv('ZENMUX_API_KEY=file-sentinel\nROLE_ALLOW_PAID=0\nPORT=8787\nCUSTOM=file-value',env);
  assert.deepEqual(env,{ZENMUX_API_KEY:'file-sentinel',ROLE_ALLOW_PAID:'0',PORT:'8787',PATH:'system-path',CUSTOM:'file-value'});
});
test('missing settings never inherit machine keys, payment switches or browser paths', () => {
  const env:NodeJS.ProcessEnv = {ZENMUX_API_KEY:'machine',DOUBAO_API_KEY:'machine',ROLE_ALLOW_PAID:'1',PLAYWRIGHT_MODULE:'machine',MOTION_PYTHON:'machine',PORT:'9999',VITE_SENTINEL:'machine',PATH:'keep'};
  applyRootEnv('# intentionally empty',env);
  assert.deepEqual(env,{PATH:'keep'});
});
test('empty keys, quotes, comments, BOM and multiline values use dotenv syntax', () => {
  const env:NodeJS.ProcessEnv={ZENMUX_API_KEY:'machine'};
  applyRootEnv('\uFEFFZENMUX_API_KEY=\nDOUBAO_INSTRUCTIONS="line one\nline two"\nROLE_PORT=8878 # note\n',env);
  assert.equal(env.ZENMUX_API_KEY,'');
  assert.equal(env.DOUBAO_INSTRUCTIONS,'line one\nline two');
  assert.equal(env.ROLE_PORT,'8878');
});
test('root env location is anchored to repository rather than cwd', () => {
  assert.equal(ROOT_ENV_PATH,fileURLToPath(new URL('../../.env',import.meta.url)));
});
test('Vite disables its secondary environment-file loader', async () => {
  const config=await readFile(new URL('../../apps/web/vite.config.ts',import.meta.url),'utf8');
  assert.match(config,/envDir:\s*false/);
  assert.ok(config.indexOf('await loadLocalEnv()')<config.indexOf('process.env.LIVE2D_SDK_PATH'));
});

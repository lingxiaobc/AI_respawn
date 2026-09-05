import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { loadLocalEnv } from './env.ts';
await loadLocalEnv();
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const token=process.env.ROLE_ADMIN_TOKEN??'';
const testRoot=resolve('AI_output/role-ui-test');
const output=resolve(process.env.ROLE_OUTPUT_DIR||'.');
const cachedSource=process.argv[2];
if(process.env.ROLE_ALLOW_PAID!=='0'||process.env.ROLE_REPLAY_YOUTH!==(cachedSource?'0':'1')||process.env.ROLE_PORT!=='8879'||token.length<16||!output.startsWith(testRoot+sep))throw new Error('UI_TEST_CONFIG_REQUIRED: root .env must explicitly select unpaid mode, port 8879, a private test token and isolated AI_output/role-ui-test/ output');
const child=spawn(process.execPath,['--experimental-strip-types','scripts/role-resources.ts','serve'],{windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
let browser;
try{
  await new Promise((ok,no)=>{const timer=setTimeout(()=>no(new Error('service startup timeout')),15000);child.stdout.on('data',d=>{if(d.toString().includes('Role admin:')){clearTimeout(timer);ok();}});child.once('error',no);child.once('exit',code=>{clearTimeout(timer);no(new Error('service exited '+code));});});
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8879');await page.locator('#token').fill(token);await page.locator('#connect').click();
  await page.locator('#file').setInputFiles(resolve(cachedSource||'AI_output/normalized/青年-cf1a11df052a/source.png'));await page.locator('#submit').click();
  await page.waitForFunction(()=>document.querySelector('#jobs').textContent.includes('等待你审查'),{},{timeout:120000});
  const card=page.locator('article').first();await card.getByRole('button',{name:'查看动画',exact:true}).click();
  await page.frameLocator('iframe').locator('#status').filter({hasText:'资源已载入'}).waitFor();
  await page.reload();await page.locator('#token').fill(token);await page.locator('#connect').click();
  await page.waitForFunction(()=>document.querySelector('#jobs').textContent.includes('等待你审查'));
  const restored=page.locator('article').first();await restored.locator('textarea').fill('自动化测试：不代表用户审查；验证不通过及备注持久化。');await restored.getByRole('button',{name:'不通过',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#jobs').textContent.includes('你未通过'));
  const out=cachedSource?resolve(output,'ui-qa'):resolve('AI_output/role-ui-qa');await mkdir(out,{recursive:true});
  await page.setViewportSize({width:390,height:844});const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  await page.screenshot({path:resolve(out,'mobile.png'),fullPage:true});
  if(overflow||errors.length)throw new Error('UI QA failed');
  await writeFile(resolve(out,'report.json'),JSON.stringify({mode:cachedSource?'real upload with verified image cache, zero paid calls':'fixture replay, zero paid calls',source:cachedSource,upload:true,completedPipeline:true,preview:true,reloadRestoresJob:true,rejectionNotePersisted:true,mobileOverflow:overflow,pageErrors:errors},null,2));
  console.log(`Role admin UI QA passed; report: ${resolve(out,'report.json')}`);
}finally{
  if(browser)await browser.close();
  // Ask the loopback service to stop gracefully via signal; worker completed before this point.
  if(child.connected)child.send('shutdown-role-test');
  else child.kill('SIGTERM');
}

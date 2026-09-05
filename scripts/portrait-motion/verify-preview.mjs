import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadLocalEnv } from '../env.ts';
await loadLocalEnv();
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [url,out]=process.argv.slice(2);
if(!url||!out)throw new Error('Usage: verify-preview.mjs <local preview URL> <output directory>');
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL ? {channel:process.env.PLAYWRIGHT_CHANNEL} : {})});
try{
 const page=await browser.newPage({viewport:{width:1100,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);
 await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('资源已载入'));
 const result=await page.evaluate(()=>{
  const capture=()=>{draw();return ctx.getImageData(0,0,1024,1536).data.slice()};
  keys.forEach(k=>set(k,0));const neutral=capture();const checks=[];
  for(const key of keys){keys.forEach(k=>set(k,0));set(key,1);const current=capture();let changed=0,outside=0;const [x0,y0,x1,y1]=data.manifest.tracks[key].box;
   for(let y=0;y<1536;y++)for(let x=0;x<1024;x++){const i=(y*1024+x)*4;if(current[i]!==neutral[i]||current[i+1]!==neutral[i+1]||current[i+2]!==neutral[i+2]){changed++;if(x<x0||x>=x1||y<y0||y>=y1)outside++}}
   checks.push({key,changedPixels:changed,outsideOwnRegion:outside})
  }
  keys.forEach(k=>set(k,0));draw();return checks;
 });
 if(result.some(x=>x.changedPixels===0||x.outsideOwnRegion!==0))throw new Error('Independent region check failed: '+JSON.stringify(result));
 await page.screenshot({path:resolve(out,'preview-desktop.png'),fullPage:true});
 await page.getByRole('button',{name:'自动开合与眨眼',exact:true}).click();
 await page.waitForFunction(()=>Number(document.querySelector('#mouth').value)>.7);
 await page.getByRole('button',{name:'停止并闭嘴睁眼',exact:true}).click();
 const stopped=await page.locator('#mouth').inputValue();if(stopped!=='0')throw new Error('Stop did not close mouth');
 // Synthetic local WAV exercises the actual file input, Web Audio and silence closure.
 const rate=16000,count=rate*2,wav=Buffer.alloc(44+count*2);
 wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(count*2,40);
 for(let i=0;i<count;i++)wav.writeInt16LE(i<rate?Math.round(Math.sin(i/rate*440*2*Math.PI)*10000):0,44+i*2);
 await page.locator('#audioFile').setInputFiles({name:'test-tone-silence.wav',mimeType:'audio/wav',buffer:wav});
 await page.waitForFunction(()=>Number(document.querySelector('#mouth').value)>.1);
 await page.waitForFunction(()=>document.querySelector('audio').ended&&Number(document.querySelector('#mouth').value)===0);
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:resolve(out,'preview-mobile.png'),fullPage:true});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);if(overflow)throw new Error('Mobile horizontal overflow');
 if(errors.length)throw new Error(errors.join(';'));
 const report={independentParameters:result,automaticAnimation:true,stopClosesMouth:true,localAudioAmplitudeAndSilence:true,mobileHorizontalOverflow:overflow,pageErrors:errors};
 await writeFile(resolve(out,'browser-qa.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close()}

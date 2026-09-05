import test from 'node:test';
import assert from 'node:assert/strict';
import {ZenMuxGeminiProvider} from './src/gemini.ts';
const input={sourceHash:'fixture',pngBytes:Buffer.from('fixture'),width:1024,height:1536,fileName:'reference.png',mimeType:'image/png' as const};
test('Gemini uses Vertex protocol, reference image, exact model and one candidate',async()=>{
 const provider=new ZenMuxGeminiProvider({apiKey:'test-key',fetchImpl:async(url,options)=>{
  assert.match(String(url),/publishers\/google\/models\/gemini-3-pro-image:generateContent$/);
  const body=JSON.parse(String(options?.body));assert.equal(body.contents[0].parts[1].inlineData.data,input.pngBytes.toString('base64'));
  assert.equal(body.generationConfig.candidateCount,1);assert.deepEqual(body.generationConfig.responseModalities,['TEXT','IMAGE']);
  return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{inlineData:{mimeType:'image/png',data:'YWJj'}}]}}]});
 }});
 assert.equal((await provider.edit(input,'test')).bytes.toString(),'abc');
});
test('Gemini rejection retains HTTP status and redacts the exact secret',async()=>{
 const p=new ZenMuxGeminiProvider({apiKey:'  private-test-sentinel  ',fetchImpl:async(_url,options)=>{assert.equal(new Headers(options?.headers).get('authorization'),'Bearer private-test-sentinel');return Response.json({error:{code:'PERMISSION_DENIED',message:'blocked private-test-sentinel'}},{status:403});}});
 await assert.rejects(p.edit(input,'test'),error=>{const text=String(error);assert.match(text,/http=403/);assert.match(text,/PERMISSION_DENIED/);assert.ok(!text.includes('private-test-sentinel'));return true;});
});
test('text-only, thought-only and multiple-image results are rejected',async()=>{
 for(const parts of [[{text:'no image'}],[{thought:true,inlineData:{mimeType:'image/png',data:'YWJj'}}],[{inlineData:{mimeType:'image/png',data:'YWJj'}},{inlineData:{mimeType:'image/png',data:'YWJj'}}]]){
  const p=new ZenMuxGeminiProvider({apiKey:'test',fetchImpl:async()=>Response.json({candidates:[{finishReason:'STOP',content:{parts}}]})});await assert.rejects(p.edit(input,'test'),/exactly one final/);
 }
});

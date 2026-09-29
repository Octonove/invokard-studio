import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdtemp,rm,copyFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';

test('isolated bundle without node_modules serves MCP and renders a persistent project',async()=>{
 const root=await mkdtemp(join(tmpdir(),'studio-mcp-'));
 const bundle=join(root,'studio.mjs');await copyFile(resolve('plugins/invokard-studio/dist/studio.mjs'),bundle);
 const require=createRequire(import.meta.url);
 const client=new Client({name:'studio-test',version:'1.0.0'});
 const transport=new StdioClientTransport({command:process.execPath,args:[bundle,'serve','--workspace',root],cwd:tmpdir(),stderr:'pipe',env:{FFMPEG_PATH:require('ffmpeg-static'),FFPROBE_PATH:require('ffprobe-static').path}});
 try{
  await client.connect(transport);
  const listed=await client.listTools();assert.ok(listed.tools.some(t=>t.name==='studio_render'));assert.ok(listed.tools.some(t=>t.name==='studio_provider_submit'));
  const result=await client.callTool({name:'studio_create_project',arguments:{title:'Test MCP',format:{width:128,height:192,fps:12}}});
  assert.ok(!result.isError,JSON.stringify(result));
  const p=JSON.parse((result.content as any)[0].text);
  const updated=await client.callTool({name:'studio_update_project',arguments:{projectId:p.id,patch:{scenes:[{id:'one',text:'Listo',duration:1}]},expectedUpdatedAt:p.updatedAt}});
  assert.ok(!updated.isError,JSON.stringify(updated));
  const timed=await client.callTool({name:'studio_set_captions',arguments:{projectId:p.id,captions:[{start:0,end:1,text:'Hola mundo',words:[{start:0,end:.4,text:'Hola'},{start:.5,end:.9,text:'mundo'}]}],captionStyle:{mode:'word',activeColor:'#F1B553'}}});
  assert.ok(!timed.isError,JSON.stringify(timed));
  const timedProject=JSON.parse((timed.content as any)[0].text);
  assert.equal(timedProject.captionStyle?.mode,'word');
  assert.equal(timedProject.captions[0].words[1].start,.5);
  const invalid=await client.callTool({name:'studio_set_captions',arguments:{projectId:p.id,captions:[{start:0,end:1,text:'Late',words:[{start:.9,end:1.2,text:'Late'}]}]}});
  assert.equal(invalid.isError,true);
  const rendering=await client.callTool({name:'studio_render',arguments:{projectId:p.id}});
  assert.ok(!rendering.isError,JSON.stringify(rendering));
  const job=JSON.parse((rendering.content as any)[0].text);
  let status=job;
  for(let i=0;i<100 && status.status==='running';i++){
    await new Promise(r=>setTimeout(r,50));
    const res=await client.callTool({name:'studio_job_status',arguments:{projectId:p.id,jobId:job.id}});
    assert.ok(!res.isError,JSON.stringify(res));status=JSON.parse((res.content as any)[0].text);
  }
  assert.equal(status.status,'completed',JSON.stringify(status));
  assert.match(status.result.styledSubtitles,/captions\.ass$/);
  assert.equal(status.result.captionTiming.wordTimedCaptions,1);
  assert.deepEqual(status.result.captionTiming.warnings,[]);
  const inspected=await client.callTool({name:'studio_inspect_media',arguments:{file:status.result.video}});
  assert.ok(!inspected.isError,JSON.stringify(inspected));
  assert.equal(JSON.parse((inspected.content as any)[0].text).streams[0].width,128);
  const bad=await client.callTool({name:'studio_get_project',arguments:{projectId:'../escape'}});assert.equal(bad.isError,true);
 }finally{await client.close();await rm(root,{recursive:true,force:true});}
});

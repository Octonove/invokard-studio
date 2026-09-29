import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {z} from 'zod';
import {unlink} from 'node:fs/promises';
import {ProjectStore,patchSchema,projectSchema,captionsSchema,parseSrt,slidesSchema} from './project.js';
import {doctorMedia,inspectMedia,renderVideo,renderCarousel} from './media.js';
import {Jobs} from './jobs.js';
import {providerCatalog,getProviderStatus,providerSetup,submitHiggsfield,pollHiggsfield,listProviderJobs,submitMagnificMusic,pollMagnificMusic,reconcileProviderJob} from './providers.js';
import type {Asset} from './types.js';

const projectId=z.string().describe('ID returned by studio_create_project.');
const provider=z.enum(['higgsfield','magnific']);
export {slidesSchema};
export async function importSource(store:ProjectStore,id:string,input:{file?:string;url?:string;kind:Asset['kind'];provider?:string;creationId?:string}){
 if(Boolean(input.file)===Boolean(input.url))throw new Error('Provide exactly one file or HTTPS url');
 let temporary:string|undefined;
 try{
  const file=input.file || (temporary=await (await import('./download.js')).downloadToTemp(await store.dir(id),input.url!,input.kind));
  return await store.importAsset(id,file,input.kind,input.provider?{provider:input.provider,creationId:input.creationId}:undefined);
 }finally{if(temporary)await unlink(temporary).catch(()=>{});}
}
export function createServer(workspace:string){
 const store=new ProjectStore(workspace);const jobs=new Jobs();
 const server=new McpServer({name:'invokard-studio',version:'0.1.0'},{instructions:'Create and export social content locally. Read the production and scriptwriter skills. Ask users to choose providers only when generation is needed. Never request API secrets as tool arguments. Paid generations require approval for the specific generation. Import generated resources promptly, save the editable timeline, and reuse assets on edits.'});
 const tool=(name:string,description:string,shape:z.ZodRawShape,handler:(args:any)=>Promise<unknown>|unknown,readOnly=false)=>{
  server.registerTool(name,{description,inputSchema:shape,annotations:{readOnlyHint:readOnly,destructiveHint:false,idempotentHint:readOnly,openWorldHint:name.includes('provider')||name==='studio_import_asset'}},async args=>{
   try{return {content:[{type:'text' as const,text:JSON.stringify(await handler(args),null,2)}]};}
   catch(error){return {isError:true,content:[{type:'text' as const,text:error instanceof Error?error.message:'Studio operation failed'}]};}
  });
 };
 tool('studio_doctor','Check local FFmpeg/ffprobe and configured provider credentials without exposing secrets.',{},async()=>({version:'0.1.0',workspace:store.root,node:process.version,media:await doctorMedia(),providers:getProviderStatus(),transcription:{executableConfigured:Boolean(process.env.WHISPER_CPP_PATH),modelConfigured:Boolean(process.env.WHISPER_MODEL_PATH)}}),true);
 tool('studio_create_project','Create an editable social content project. Default format: 1080×1920 at 30 fps.',{title:z.string(),format:projectSchema.shape.format.optional()},a=>store.create(a.title,a.format));
 tool('studio_get_project','Read project.json with scene, asset, audio and caption references.',{projectId},a=>store.get(a.projectId),true);
 tool('studio_update_project','Update editable project fields. Arrays replace entire arrays; read first and pass expectedUpdatedAt to prevent stale edits. Assets are added only through import.',{projectId,patch:patchSchema,expectedUpdatedAt:z.string().optional()},a=>store.update(a.projectId,a.patch,a.expectedUpdatedAt));
 tool('studio_import_asset','Copy a local media file or download a public HTTPS generated asset into the project. Validates media; preserves original. URLs are not stored in asset provenance.',{projectId,file:z.string().optional(),url:z.string().url().optional(),kind:z.enum(['image','video','audio']),provider:z.string().optional(),creationId:z.string().optional()},a=>importSource(store,a.projectId,a));
 tool('studio_inspect_media','Inspect dimensions, streams and duration of a local media file with ffprobe.',{file:z.string()},a=>inspectMedia(a.file),true);
 tool('studio_set_captions','Set real timed captions. Provide exactly one captions array or SRT text; times are seconds.',{projectId,captions:captionsSchema.optional(),srt:z.string().optional(),expectedUpdatedAt:z.string().optional()},a=>{if((a.captions!==undefined)===(a.srt!==undefined))throw new Error('Provide captions or srt, exclusively');return store.update(a.projectId,{captions:a.captions??parseSrt(a.srt)},a.expectedUpdatedAt);});
 tool('studio_render','Start a local render in background. Returns a job ID; poll studio_job_status. Exports MP4, timed SRT, cover PNG, caption text and HTML preview. Prior exports remain.',{projectId,preview:z.boolean().optional()},async a=>{const p=await store.get(a.projectId);const dir=await store.dir(a.projectId);return jobs.start(dir,signal=>renderVideo(dir,p,{preview:a.preview,signal}));});
 tool('studio_job_status','Read progress/result of a local render or transcription job.',{projectId,jobId:z.string()},async a=>jobs.status(await store.dir(a.projectId),a.jobId),true);
 tool('studio_cancel_job','Cancel a local render job owned by this server; preserves earlier completed exports.',{projectId,jobId:z.string()},async a=>jobs.cancel(await store.dir(a.projectId),a.jobId));
 tool('studio_render_carousel','Save the editable carousel plan and render PNG slides plus HTML preview. Omit slides to reuse the saved plan. A single slide creates a post; dimensions come from project.',{projectId,slides:slidesSchema.min(1).optional()},async a=>{let p=await store.get(a.projectId);if(a.slides)p=await store.update(p.id,{carousel:a.slides},p.updatedAt);const slides=slidesSchema.min(1).parse(p.carousel);const dir=await store.dir(a.projectId);return jobs.start(dir,signal=>renderCarousel(dir,p,slides,{signal}));});
 tool('studio_provider_status','List implemented provider integrations and credential presence. Presence is not proof of a live connection.',{},()=>({catalog:providerCatalog(),status:getProviderStatus()}),true);
 tool('studio_provider_setup','Get optional connection steps. Magnific image/video/voice runs via its official OAuth MCP in the host. Higgsfield and music use environment credentials.',{provider},a=>providerSetup(a.provider),true);
 tool('studio_provider_submit','Submit ONE explicitly approved paid generation. Use stable requestKey to avoid duplicate charges. Higgsfield requires model+input from current provider schema; Magnific here supports music only (images/video/voices use official host MCP).',{
  projectId,provider,model:z.string().optional(),input:z.record(z.unknown()).optional(),prompt:z.string().optional(),musicModel:z.enum(['clip','pro']).optional(),requestKey:z.string().min(1),budgetApproved:z.boolean().default(false)
 },async a=>{const dir=await store.dir(a.projectId);if(a.provider==='higgsfield'){if(!a.model||!a.input)throw new Error('Higgsfield requires model and input');return submitHiggsfield(dir,a);}if(!a.prompt)throw new Error('Magnific music requires prompt');return submitMagnificMusic(dir,{prompt:a.prompt,model:a.musicModel,requestKey:a.requestKey,budgetApproved:a.budgetApproved});});
 tool('studio_provider_poll','Check a persisted paid generation without resubmitting. Import completed output URLs immediately using studio_import_asset.',{projectId,provider,jobId:z.string()},async a=>{const dir=await store.dir(a.projectId);return a.provider==='higgsfield'?pollHiggsfield(dir,a.jobId):pollMagnificMusic(dir,a.jobId);},true);
 tool('studio_provider_jobs','List saved provider jobs for a project to resume polling after restart.',{projectId},async a=>listProviderJobs(await store.dir(a.projectId)),true);
 tool('studio_provider_reconcile','Recover an ambiguous submission by binding the existing remote request ID verified in provider history. Does not create another generation.',{projectId,jobId:z.string(),remoteId:z.string()},async a=>reconcileProviderJob(await store.dir(a.projectId),a.jobId,a.remoteId));
 tool('studio_transcribe','Transcribe an imported audio/video asset with local whisper.cpp. Returns SRT and captions timed relative to the SOURCE asset. Align timings with trims/scene placement, then call studio_set_captions explicitly. Requires WHISPER_CPP_PATH and WHISPER_MODEL_PATH.',{projectId,assetId:z.string(),language:z.string().optional()},async a=>{const p=await store.get(a.projectId),dir=await store.dir(a.projectId);return jobs.start(dir,async signal=>{const {transcribe}=await import('./transcription.js');const result=await transcribe(dir,p,a.assetId,{language:a.language,signal});return {...result,assetId:a.assetId,timingBasis:'source_asset_seconds',nextStep:'Align with project timeline and apply using studio_set_captions.'};});});
 return server;
}
export async function serve(workspace:string){await createServer(workspace).connect(new StdioServerTransport());}

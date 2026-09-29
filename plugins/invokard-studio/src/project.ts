import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, realpath, copyFile, stat, lstat, unlink, open } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute, extname } from 'node:path';
import type { Project, Caption, Asset } from './types.js';

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/, 'Invalid project or asset id');
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a six digit hex color');
const nonempty = z.string().trim().min(1);
export const sceneSchema = z.object({id,assetId:id.optional(),duration:z.number().positive().max(300),trimStart:z.number().min(0).optional(),audioVolume:z.number().min(0).max(2).optional(),text:z.string().max(2000).optional(),background:color.optional(),motion:z.enum(['none','zoom']).optional()}).strict();
export const captionSchema = z.object({start:z.number().min(0),end:z.number().positive(),text:nonempty.max(4000)}).strict();
export const captionsSchema = z.array(captionSchema).max(500).superRefine((items,ctx)=>{
  items.forEach((c,i)=>{ if(c.end<=c.start || (i>0 && c.start<items[i-1].end)) ctx.addIssue({code:'custom',message:'Caption timing must be ordered, non-overlapping, with end after start',path:[i]}); });
});
const sourceSchema = z.object({provider:nonempty,creationId:z.string().optional(),model:z.string().optional(),url:z.string().url().optional()}).strict();
export const slidesSchema=z.array(z.object({title:nonempty.max(500),body:z.string().max(4000).optional(),assetId:id.optional(),background:color.optional()}).strict()).max(20);
export const projectSchema = z.object({
  schemaVersion:z.literal(1),id,title:nonempty.max(200),script:z.string().max(100000).optional(),createdAt:z.string().datetime(),updatedAt:z.string().datetime(),
  format:z.object({width:z.number().int().min(128).max(3840).multipleOf(2),height:z.number().int().min(128).max(3840).multipleOf(2),fps:z.number().int().min(12).max(60)}).strict(),
  assets:z.array(z.object({id,kind:z.enum(['image','video','audio']),path:nonempty,source:sourceSchema.optional()}).strict()).max(1000),
  scenes:z.array(sceneSchema).max(200),captions:captionsSchema,carousel:slidesSchema.optional(),
  brand:z.object({background:color,color,accent:color,fontFamily:nonempty.max(80),fontFile:z.string().optional()}).strict(),
  audio:z.object({voiceAssetId:id.optional(),musicAssetId:id.optional(),musicVolume:z.number().min(0).max(2),voiceVolume:z.number().min(0).max(2)}).strict(),
  copy:z.object({caption:z.string().max(20000),hashtags:z.array(z.string().max(100)).max(100)}).strict()
}).strict();
export const patchSchema = projectSchema.pick({title:true,script:true,format:true,scenes:true,captions:true,carousel:true,brand:true,audio:true,copy:true}).partial().strict();

export function validateProject(value:unknown):Project {
  const p=projectSchema.parse(value);
  const seen=new Set<string>();
  for(const a of p.assets){
    if(seen.has(a.id)) throw new Error('Duplicate asset id');
    seen.add(a.id);
    if(!/^assets\/[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(a.path)) throw new Error('Unsafe asset path');
  }
  const sceneIds=new Set<string>();
  for(const s of p.scenes){if(sceneIds.has(s.id))throw new Error('Duplicate scene id');sceneIds.add(s.id);if(s.assetId && !seen.has(s.assetId))throw new Error('Unknown scene asset');if(s.assetId && p.assets.find(a=>a.id===s.assetId)?.kind==='audio')throw new Error('Scene asset must be image or video');}
  for(const aid of [p.audio.voiceAssetId,p.audio.musicAssetId])if(aid && !p.assets.some(a=>a.id===aid && a.kind==='audio'))throw new Error('Unknown audio asset');
  const duration=p.scenes.reduce((sum,s)=>sum+s.duration,0);
  if(p.scenes.some(s=>s.duration<1/p.format.fps))throw new Error('Scene duration must be at least one frame');
  for(const s of p.carousel||[])if(s.assetId && !p.assets.some(a=>a.id===s.assetId && a.kind==='image'))throw new Error('Carousel asset must be an imported image');
  if(duration>1800)throw new Error('Maximum project duration is 30 minutes');
  if(duration && p.captions.some(c=>c.end>duration+.001))throw new Error('Caption extends beyond project duration');
  return p;
}

export async function atomicJson(file:string,value:unknown):Promise<void>{
  const tmp=file+'.'+randomUUID()+'.tmp';
  try{
    await writeFile(tmp,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
    for(let attempt=0;;attempt++){
      try{await rename(tmp,file);break;}catch(error){if(process.platform!=='win32'||!['EPERM','EACCES','EBUSY'].includes((error as NodeJS.ErrnoException).code||'')||attempt>=7)throw error;await new Promise(r=>setTimeout(r,25*(attempt+1)));}
    }
  }finally{await unlink(tmp).catch(()=>{});}
}
const queue=new Map<string,Promise<unknown>>();
async function withFileLock<T>(dir:string,fn:()=>Promise<T>):Promise<T>{
  const file=join(dir,'.project.lock');let handle;
  for(let attempt=0;;attempt++){
    try{handle=await open(file,'wx',0o600);break;}
    catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;if(attempt>=50)throw new Error('Project is busy or a previous writer was interrupted. Retry after it finishes. If it crashed, verify no writer is running before removing .project.lock.');await new Promise(r=>setTimeout(r,100));}
  }
  try{await handle.writeFile(JSON.stringify({pid:process.pid,createdAt:new Date().toISOString()}));return await fn();}
  finally{await handle.close();await unlink(file);}
}
async function serialize<T>(key:string,fn:()=>Promise<T>):Promise<T>{
  const prior=queue.get(key)||Promise.resolve();
  const current=prior.catch(()=>{}).then(fn);queue.set(key,current);
  try{return await current;}finally{if(queue.get(key)===current)queue.delete(key);}
}
export class ProjectStore {
  root:string;
  constructor(root:string){this.root=resolve(root);}
  async dir(projectId:string):Promise<string>{
    id.parse(projectId);const dir=join(this.root,projectId);
    const [base,actual]=await Promise.all([realpath(this.root),realpath(dir)]);
    const rel=relative(base,actual);
    if(rel.startsWith('..') || isAbsolute(rel) || !rel)throw new Error('Project path escapes workspace');
    return actual;
  }
  async create(title:string,format?:Project['format']):Promise<Project>{
    const now=new Date().toISOString();
    const p=validateProject({schemaVersion:1,id:randomUUID(),title,createdAt:now,updatedAt:now,format:format||{width:1080,height:1920,fps:30},assets:[],scenes:[],captions:[],brand:{background:'#101827',color:'#ffffff',accent:'#a3e635',fontFamily:'Arial'},audio:{musicVolume:.18,voiceVolume:1},copy:{caption:'',hashtags:[]}});
    await mkdir(join(this.root,p.id,'assets'),{recursive:true});
    await atomicJson(join(await this.dir(p.id),'project.json'),p);return p;
  }
  async get(projectId:string):Promise<Project>{
    const dir=await this.dir(projectId);const file=join(dir,'project.json');const metadata=await lstat(file);
    if(metadata.isSymbolicLink() || !metadata.isFile() || metadata.size>8_000_000 || relative(dir,await realpath(file))!=='project.json')throw new Error('Invalid project file');
    const p=validateProject(JSON.parse(await readFile(file,'utf8')));if(p.id!==projectId)throw new Error('Project id mismatch');return p;
  }
  async update(projectId:string,patch:unknown,expectedUpdatedAt?:string):Promise<Project>{
    return serialize(join(this.root,projectId),async()=>withFileLock(await this.dir(projectId),async()=>{
      const current=await this.get(projectId);if(expectedUpdatedAt && current.updatedAt!==expectedUpdatedAt)throw new Error('Project revision changed; read latest project before editing');
      const changes=patchSchema.parse(patch);
      const next=validateProject({...current,...changes,updatedAt:new Date(Math.max(Date.now(),Date.parse(current.updatedAt)+1)).toISOString()});
      await atomicJson(join(await this.dir(projectId),'project.json'),next);return next;
    }));
  }
  async importAsset(projectId:string,file:string,kind:Asset['kind'],source?:Asset['source']):Promise<Asset>{
    return serialize(join(this.root,projectId),async()=>withFileLock(await this.dir(projectId),async()=>{
      const current=await this.get(projectId);const dir=await this.dir(projectId);
      const input=await realpath(resolve(file));const size=(await stat(input)).size;
      if(size===0 || size>2*1024**3)throw new Error('Asset must contain data and be at most 2 GiB');
      const ext=extname(input).toLowerCase();
      const extensions={image:['.png','.jpg','.jpeg','.webp'],video:['.mp4','.mov','.mkv','.webm'],audio:['.wav','.mp3','.m4a','.aac','.flac','.ogg']};
      if(!extensions[kind]?.includes(ext))throw new Error('Unsupported media file extension');
      const {inspectMedia}=await import('./media.js');const info=await inspectMedia(input) as {streams?:{codec_type?:string}[]};
      const expected=kind==='audio'?'audio':'video';if(!info.streams?.some(s=>s.codec_type===expected))throw new Error('Asset has no matching media stream');
      const asset:Asset={id:randomUUID(),kind,path:'assets/'+randomUUID()+ext,...(source?{source:sourceSchema.parse(source)}:{})};
      const assetsDir=await realpath(join(dir,'assets'));if(relative(dir,assetsDir)!=='assets')throw new Error('Asset directory escapes project');
      const destination=join(dir,asset.path);await copyFile(input,destination,1);
      try{const next=validateProject({...current,assets:[...current.assets,asset],updatedAt:new Date(Math.max(Date.now(),Date.parse(current.updatedAt)+1)).toISOString()});await atomicJson(join(dir,'project.json'),next);}catch(error){await unlink(destination).catch(()=>{});throw error;}
      return asset;
    }));
  }
}

export function parseSrt(srt:string):Caption[]{
  const blocks=srt.replace(/^\uFEFF/,'').replace(/\r/g,'').trim().split(/\n\s*\n/);if(!srt.trim())return [];
  const stamp=(h:string,m:string,s:string,ms:string)=>Number(h)*3600+Number(m)*60+Number(s)+Number(ms)/1000;
  return captionsSchema.parse(blocks.map(block=>{
    const lines=block.split('\n');if(/^\d+$/.test(lines[0]))lines.shift();
    const match=lines.shift()?.match(/^(\d{2,}):([0-5]\d):([0-5]\d)[,.](\d{3})\s+-->\s+(\d{2,}):([0-5]\d):([0-5]\d)[,.](\d{3})$/);
    if(!match || !lines.length)throw new Error('Invalid SRT caption block');
    return {start:stamp(...match.slice(1,5) as [string,string,string,string]),end:stamp(...match.slice(5,9) as [string,string,string,string]),text:lines.join('\n')};
  }));
}

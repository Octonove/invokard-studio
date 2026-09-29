import {randomUUID} from 'node:crypto';
import {mkdir,readFile,realpath,lstat} from 'node:fs/promises';
import {join,relative} from 'node:path';
import {atomicJson} from './project.js';
export interface RenderJob {id:string;pid:number;status:'running'|'completed'|'failed'|'cancelled'|'interrupted';createdAt:string;updatedAt:string;result?:unknown;error?:string;}
export class Jobs {
 private reserved=0;
 private active=new Map<string,{controller:AbortController;promise:Promise<void>}>();
 private async file(dir:string,id:string):Promise<string>{
  if(!/^[a-f0-9-]{36}$/.test(id))throw new Error('Invalid job id');
  const base=await realpath(dir);await mkdir(join(base,'render-jobs'),{recursive:true});
  const jobs=await realpath(join(base,'render-jobs'));
  if(relative(base,jobs)!=='render-jobs')throw new Error('Job directory escapes project');
  return join(jobs,id+'.json');
 }
 async start(dir:string,task:(signal:AbortSignal)=>Promise<unknown>):Promise<RenderJob>{
  if(this.reserved>=2)throw new Error('Two local jobs are already running; wait for completion before starting another');
  this.reserved++;
  const now=new Date().toISOString();const job:RenderJob={id:randomUUID(),pid:process.pid,status:'running',createdAt:now,updatedAt:now};
  let file:string;
  try{file=await this.file(dir,job.id);await atomicJson(file,job);}catch(error){this.reserved--;throw error;}
  const controller=new AbortController();
  const promise=(async()=>{
   try{job.result=await task(controller.signal);job.status=controller.signal.aborted?'cancelled':'completed';}
   catch(error){job.status=controller.signal.aborted?'cancelled':'failed';job.error=error instanceof Error?error.message.slice(0,2000):'Local job failed';}
   finally{job.updatedAt=new Date().toISOString();try{await atomicJson(file,job);}finally{this.active.delete(job.id);this.reserved--;}}
  })();
  this.active.set(job.id,{controller,promise});
  // Avoid unhandled rejection if persistence itself fails; wait() still reports it.
  void promise.catch(()=>{});
  return {...job};
 }
 async status(dir:string,id:string):Promise<RenderJob>{
  const file=await this.file(dir,id);const metadata=await lstat(file);
  if(metadata.isSymbolicLink() || !metadata.isFile() || metadata.size>4_000_000)throw new Error('Invalid job file');
  const job=JSON.parse(await readFile(file,'utf8')) as RenderJob;
  if(job.id!==id || !Number.isInteger(job.pid) || job.pid<1)throw new Error('Invalid job record');
  if(job.status==='running' && !this.active.has(id)){
   let alive=job.pid!==process.pid;try{if(alive)process.kill(job.pid,0);}catch(e){if((e as NodeJS.ErrnoException).code==='ESRCH')alive=false;}
   if(!alive){job.status='interrupted';job.error='The render process exited. Start a new render using the saved project; previous exports remain available.';await atomicJson(file,job);}
  }
  return job;
 }
 async cancel(dir:string,id:string):Promise<RenderJob>{await this.status(dir,id);const running=this.active.get(id);if(!running)throw new Error('Job is not running in this server');running.controller.abort();await running.promise;return this.status(dir,id);}
 async wait(id:string):Promise<void>{await this.active.get(id)?.promise;}
}

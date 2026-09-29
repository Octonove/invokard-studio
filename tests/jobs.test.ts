import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Jobs} from '../plugins/invokard-studio/src/jobs.js';
test('background jobs return immediately, persist completion and support cancellation',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'studio-jobs-'));
 try{
  const jobs=new Jobs();let finish!:(v:unknown)=>void;
  const job=await jobs.start(dir,()=>new Promise(resolve=>{finish=resolve;}));
  assert.equal((await jobs.status(dir,job.id)).status,'running');
  finish({video:'export.mp4'});await jobs.wait(job.id);
  assert.deepEqual((await new Jobs().status(dir,job.id)).result,{video:'export.mp4'});
  const pending=await jobs.start(dir,signal=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true})));
  await jobs.cancel(dir,pending.id);await jobs.wait(pending.id);
  assert.equal((await jobs.status(dir,pending.id)).status,'cancelled');
  await assert.rejects(jobs.status(dir,'../escape'),/id/i);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('concurrent starts reserve the two worker slots before awaiting disk',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'studio-slots-'));
 try{
  const jobs=new Jobs();const release:Array<()=>void>=[];
  const task=()=>new Promise<void>(resolve=>release.push(resolve));
  const results=await Promise.allSettled(Array.from({length:5},()=>jobs.start(dir,task)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,2);
  release.forEach(fn=>fn());
  await Promise.all(results.filter(r=>r.status==='fulfilled').map(r=>jobs.wait(r.value.id)));
 }finally{await rm(dir,{recursive:true,force:true});}
});

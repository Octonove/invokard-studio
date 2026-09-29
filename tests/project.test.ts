import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectStore, parseSrt } from '../plugins/invokard-studio/src/project.js';

test('editable projects persist validated updates and reject stale revisions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'studio-project-'));
  try {
    const store = new ProjectStore(root);
    const p = await store.create('Café creativo');
    assert.equal(p.title, 'Café creativo');
    const next = await store.update(p.id, { scenes: [{id:'one',duration:2,text:'Hola'}] }, p.updatedAt);
    assert.equal((await store.get(p.id)).scenes[0].text, 'Hola');
    assert.notEqual(next.updatedAt,p.updatedAt);
    await assert.rejects(store.update(p.id, {title:'lost edit'},p.updatedAt), /revision|changed/i);
    await assert.rejects(store.update(p.id, {scenes:[{id:'x',duration:-1}]}), /duration|greater/i);
    await assert.rejects(store.update(p.id, {scenes:[{id:'x',duration:2,assetId:'missing'}]}), /asset/i);
    await assert.rejects(store.update(p.id, {assets:[{id:'evil',kind:'image',path:'../../secret.png'}]}), /asset|path/i);
    await assert.rejects(store.get('../escape'), /project|id/i);
    assert.equal(JSON.parse(await readFile(join(root,p.id,'project.json'),'utf8')).title,'Café creativo');
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('import copies validated media into the project and preserves the original',async()=>{
 const root=await mkdtemp(join(tmpdir(),'studio-import-'));
 try{
  const source=join(root,'café.png');
  const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aU1sAAAAASUVORK5CYII=','base64');
  await writeFile(source,bytes);
  const store=new ProjectStore(join(root,'projects'));const p=await store.create('Import');
  const asset=await store.importAsset(p.id,source,'image');
  assert.equal((await store.get(p.id)).assets[0].id,asset.id);
  assert.deepEqual(await readFile(join(await store.dir(p.id),asset.path)),bytes);
  assert.deepEqual(await readFile(source),bytes);
  await assert.rejects(store.importAsset(p.id,source,'audio'),/extension|stream/i);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('an external project lock prevents writes until the owning writer releases it',async()=>{
 const root=await mkdtemp(join(tmpdir(),'studio-lock-'));
 try{
  const store=new ProjectStore(root);const p=await store.create('Shared');const lock=join(root,p.id,'.project.lock');
  await writeFile(lock,'another writer');
  let completed=false;const writing=store.update(p.id,{title:'After lock'}).then(value=>{completed=true;return value;});
  await new Promise(r=>setTimeout(r,180));
  const ignoredLock=completed;
  await unlink(lock);await writing;
  assert.equal(ignoredLock,false,'write must wait for the other process lock');
  assert.equal((await store.get(p.id)).title,'After lock');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('project timeline limits match renderer and carousel plans persist',async()=>{
 const root=await mkdtemp(join(tmpdir(),'studio-validation-'));
 try{
  const store=new ProjectStore(root);const p=await store.create('Timeline');
  await assert.rejects(store.update(p.id,{scenes:[{id:'x',duration:.5}],captions:[{start:0,end:.54,text:'late'}]}),/caption/i);
  await assert.rejects(store.update(p.id,{scenes:[{id:'x',duration:.001}]}),/frame|duration/i);
  const slides=[{title:'Hello',body:'Editable'}];
  await store.update(p.id,{carousel:slides});
  assert.deepEqual((await store.get(p.id)).carousel,slides);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('SRT parser preserves real timings and rejects malformed or overlapping captions', () => {
  assert.deepEqual(parseSrt('1\n00:00:00,200 --> 00:00:01,400\n¡Hola!\nDos líneas\n\n2\n00:00:01,500 --> 00:00:02,000\nAdiós\n'),[
    {start:.2,end:1.4,text:'¡Hola!\nDos líneas'},{start:1.5,end:2,text:'Adiós'}
  ]);
  assert.throws(()=>parseSrt('This is not an SRT file'),/SRT|caption/i);
  assert.throws(()=>parseSrt('1\n00:00:02,000 --> 00:00:01,000\nNo'),/end|timing|caption/i);
});

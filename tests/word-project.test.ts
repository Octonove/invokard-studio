import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ProjectStore,captionsSchema} from '../plugins/invokard-studio/src/project.js';

test('word captions retain measured gaps and styling across project reload',async()=>{
 const root=await mkdtemp(join(tmpdir(),'studio-words-'));
 try{
  const store=new ProjectStore(root),p=await store.create('Palabras');
  const captions=[{start:0,end:2,text:'Sigue adelante.',words:[{start:.2,end:.65,text:'Sigue'},{start:1.2,end:1.9,text:'adelante.'}]}];
  await store.update(p.id,{scenes:[{id:'one',duration:2}],captions,captionStyle:{mode:'word',fontSize:96,activeColor:'#F1B553',maxWordsPerLine:3,maxLines:2,marginBottom:.22}});
  const loaded=await store.get(p.id);
  assert.deepEqual(loaded.captions,captions);
  assert.equal((loaded as any).captionStyle.mode,'word');
  assert.equal((loaded as any).captionStyle.fontSize,96);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('word captions reject outside, overlapping, empty and mismatched word timing',()=>{
 const caption={start:1,end:3,text:'Hola mundo',words:[{start:1,end:1.5,text:'Hola'},{start:2,end:2.8,text:'mundo'}]};
 assert.equal(captionsSchema.safeParse([caption]).success,true);
 for(const words of [
  [{start:.9,end:1.5,text:'Hola'},{start:2,end:2.8,text:'mundo'}],
  [{start:1,end:1.5,text:'Hola'},{start:1.4,end:2.8,text:'mundo'}],
  [{start:1,end:1.5,text:'Hola'},{start:2,end:3.1,text:'mundo'}],
  [{start:1,end:1,text:'Hola'},{start:2,end:2.8,text:'mundo'}],
  [{start:1,end:1.5,text:'Otro'},{start:2,end:2.8,text:'mundo'}],
  [{start:1,end:1.5,text:'Hola mundo'}],
  []
 ])assert.equal(captionsSchema.safeParse([{...caption,words}]).success,false,JSON.stringify(words));
});

test('caption styling rejects unsafe margins, font dimensions and ASS-like color input',async()=>{
 const root=await mkdtemp(join(tmpdir(),'studio-style-'));
 try{
  const store=new ProjectStore(root),p=await store.create('Safe captions');
  for(const captionStyle of [{marginBottom:-1},{marginBottom:.9},{fontSize:0},{fontSize:500},{activeColor:'{\\pos(0,0)}'},{maxWordsPerLine:0},{maxLines:5}])
   await assert.rejects(store.update(p.id,{captionStyle}));
  const legacy=await store.update(p.id,{captions:[{start:0,end:1,text:'Existing SRT'}]});
  assert.equal(legacy.captions[0].text,'Existing SRT');
 }finally{await rm(root,{recursive:true,force:true});}
});

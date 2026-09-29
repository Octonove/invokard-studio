import {build} from 'esbuild';
import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
await mkdir('plugins/invokard-studio/dist',{recursive:true});
const result=await build({entryPoints:['plugins/invokard-studio/src/cli.ts'],outfile:'plugins/invokard-studio/dist/studio.mjs',bundle:true,platform:'node',target:'node22',format:'esm',legalComments:'linked',banner:{js:"#!/usr/bin/env node\nimport { createRequire as __studioCreateRequire } from 'node:module'; const require = __studioCreateRequire(import.meta.url);"},sourcemap:false,minify:false,metafile:true,logLevel:'info'});
const notices=new Map();
for(const input of Object.keys(result.metafile.inputs)){
 if(!input.includes('node_modules'))continue;
 let dir=dirname(resolve(input));
 while(dir!==dirname(dir)){
  let pkg;try{pkg=JSON.parse(await readFile(join(dir,'package.json'),'utf8'));}catch{dir=dirname(dir);continue;}
  if(!pkg.name){dir=dirname(dir);continue;}
  const key=pkg.name+'@'+pkg.version;
  if(!notices.has(key)){
   const names=(await readdir(dir)).filter(name=>/^(license|licence|copying|notice)(\..*)?$/i.test(name));
   const texts=await Promise.all(names.map(async name=>name+'\n'+await readFile(join(dir,name),'utf8')));
   if(!texts.length)throw new Error('Missing third-party license text for '+key);
   notices.set(key,key+' · '+(pkg.license||'See license')+'\n\n'+texts.join('\n\n'));
  }
  break;
 }
}
await writeFile('plugins/invokard-studio/dist/THIRD_PARTY_NOTICES.txt',('Bundled JavaScript dependencies\n\n'+[...notices.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,v])=>v).join('\n\n========================================\n\n')).trimEnd()+'\n');
await writeFile('plugins/invokard-studio/dist/BUILD.json',JSON.stringify({version:JSON.parse(await readFile('package.json','utf8')).version,entry:'studio.mjs',node:'>=22'},null,2)+'\n');

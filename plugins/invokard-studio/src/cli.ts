import {parseArgs} from 'node:util';
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {homedir} from 'node:os';
import {ProjectStore,parseSrt} from './project.js';
import {doctorMedia,renderVideo,renderCarousel} from './media.js';
import {serve,slidesSchema,importSource} from './server.js';
import {getProviderStatus} from './providers.js';
import {transcriptionStatus} from './transcription.js';
const {positionals,values}=parseArgs({allowPositionals:true,options:{workspace:{type:'string'},title:{type:'string'},project:{type:'string'},file:{type:'string'},url:{type:'string'},kind:{type:'string'},json:{type:'string'},preview:{type:'boolean'},'install-tools':{type:'boolean'},'tools-dir':{type:'string'},help:{type:'boolean'}}});
const workspace=resolve(values.workspace||process.env.INVOKARD_WORKSPACE||join(homedir(),'.invokard-studio','projects'));
const store=new ProjectStore(workspace);
const required=(value:string|undefined,name:string)=>{if(!value)throw new Error('Missing --'+name);return value;};
const output=(value:unknown)=>process.stdout.write(JSON.stringify(value,null,2)+'\n');
async function main(){
 if(Number(process.versions.node.split('.')[0])<22)throw new Error('Invokard Studio needs Node.js 22 or newer');
 const command=values.help?'help':positionals[0]||'help';
 switch(command){
  case 'serve':await serve(workspace);return;
  case 'doctor':output({version:'0.2.0',node:process.version,workspace,media:await doctorMedia(),providers:getProviderStatus(),transcription:transcriptionStatus()});return;
  case 'setup':{const moduleUrl=new URL('../scripts/setup.mjs',import.meta.url).href;const {setup}=await import(moduleUrl);const result=await setup({installTools:Boolean(values['install-tools']),toolsDir:values['tools-dir']});output(result);process.exitCode=result.ready?0:1;return;}
  case 'create':output(await store.create(required(values.title,'title')));return;
  case 'get':output(await store.get(required(values.project,'project')));return;
  case 'update':output(await store.update(required(values.project,'project'),JSON.parse(await readFile(required(values.json,'json'),'utf8'))));return;
  case 'import':{if(!['image','video','audio'].includes(values.kind||''))throw new Error('--kind must be image, video or audio');output(await importSource(store,required(values.project,'project'),{file:values.file,url:values.url,kind:values.kind as 'image'|'video'|'audio'}));return;}
  case 'captions':output(await store.update(required(values.project,'project'),{captions:parseSrt(await readFile(required(values.file,'file'),'utf8'))}));return;
  case 'render':{const p=await store.get(required(values.project,'project'));output(await renderVideo(await store.dir(p.id),p,{preview:values.preview}));return;}
  case 'carousel':{let p=await store.get(required(values.project,'project'));const slides=slidesSchema.min(1).parse(values.json?JSON.parse(await readFile(values.json,'utf8')):p.carousel);p=await store.update(p.id,{carousel:slides},p.updatedAt);output(await renderCarousel(await store.dir(p.id),p,slides));return;}
  case 'demo':{
   let p=await store.create('Invokard Studio · Demo',{width:540,height:960,fps:24});
   p=await store.update(p.id,{scenes:[{id:'idea',duration:2,text:'DE UNA IDEA\nA TU PRÓXIMO REEL',background:'#101827'},{id:'create',duration:2,text:'GUION · IMÁGENES\nVOZ · EDICIÓN',background:'#25342b'},{id:'export',duration:2,text:'TU ESTUDIO CREATIVO\nEN CODEX',background:'#253047'}],captions:[{start:.2,end:1.8,text:'Invokard Studio'},{start:2.2,end:3.8,text:'Crea. Edita. Exporta.'},{start:4.2,end:5.8,text:'Todo desde un mismo plugin.'}],copy:{caption:'De una idea a una pieza lista para compartir. Invokard Studio: tu estudio creativo en Codex.',hashtags:['#InvokardStudio','#ContenidoCreativo']}});
   const dir=await store.dir(p.id);const video=await renderVideo(dir,p);
   const square=await store.update(p.id,{format:{width:1080,height:1080,fps:24}});
   const carousel=await renderCarousel(dir,square,[{title:'Tu próxima idea\nempieza aquí.',body:'INVOKARD STUDIO\nGuion · Generación · Edición'},{title:'Del guion\na la pieza final.',body:'Reels, posts y carruseles.\nProyectos editables. Recursos reutilizables.'},{title:'Crea a tu manera.',body:'Conecta tus herramientas cuando las necesites.\nExporta y comparte.'}]);
   await store.update(p.id,{format:p.format});
   output({project:p.id,directory:dir,video,carousel});return;
  }
  case 'help':output({name:'Invokard Studio',version:'0.2.0',commands:['doctor','setup [--install-tools] [--tools-dir path]','serve','create --title text','get --project id','update --project id --json patch.json','import --project id --file path --kind image|video|audio','captions --project id --file subtitles.srt','render --project id [--preview]','carousel --project id --json slides.json','demo'],workspace:'Set --workspace or INVOKARD_WORKSPACE. Default ~/.invokard-studio/projects.'});return;
  default:throw new Error('Unknown command. Run with --help.');
 }
}
main().catch(error=>{process.stderr.write((error instanceof Error?error.message:'Studio failed')+'\n');process.exitCode=1;});

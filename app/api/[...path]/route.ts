import {randomUUID} from 'node:crypto';
import {normalizeArgentineMobile} from '../../../lib/phone';
import {createClient} from '@supabase/supabase-js';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
async function handle(req:Request){
 try{
 const url=new URL(req.url),path=url.pathname.slice(5);
 const get=new Set(['init','public','ticket','bands','manage','door','export','sponsors']);
 const post=new Set(['tickets','redeem','bands','band','confirm','cancel','checkin','settings','staff','rotate','sponsor','band_logo','band_delete','event_create','general_settings','panel','panel_guest','panel_payment','panel_confirm','panel_cancel','panel_logo']);
 if(!(req.method==='GET'?get:post).has(path))return reply({error:'Ruta no encontrada'},404);
 const requestOrigin=url.protocol+'//'+(req.headers.get('host')||url.host);
 if(req.method==='POST'&&req.headers.get('origin')!==requestOrigin)return reply({error:'Origen no permitido'},403);
 const maxBytes=path==='panel_logo'?1024*1024:8192;
 if(Number(req.headers.get('content-length')||0)>maxBytes)return reply({error:'Solicitud demasiado grande'},413);
 const sburl=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!sburl||!key)return reply({error:'Falta configurar el servicio'},503);
 if(path==='panel_logo'){
   const panelKey=req.headers.get('x-pena-panel-key');
   const bandId=req.headers.get('x-pena-participant');
   if(!panelKey||!bandId||!/^[a-zA-Z0-9_-]+$/.test(bandId))return reply({error:'Enlace del panel inválido'},400);
   if(req.headers.get('content-type')!=='image/webp')return reply({error:'El logo debe estar en formato WebP'},415);
   const bytes=Buffer.from(await req.arrayBuffer());
   if(bytes.length>maxBytes)return reply({error:'El logo debe pesar hasta 1 MB'},413);
   if(bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WEBP')return reply({error:'El logo debe estar en formato WebP'},415);
   const sb=createClient(sburl,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{'x-pena-panel-key':panelKey}}});
   const logo_path='participants/'+bandId+'/'+randomUUID()+'.webp';
   const {error:uploadError}=await sb.storage.from('pena-logos').upload(logo_path,bytes,{contentType:'image/webp',cacheControl:'31536000',upsert:false});
   if(uploadError)return reply({error:'No pudimos subir el logo. Revisá el enlace del panel y volvé a intentar.'},400);
   const {data,error}=await sb.rpc('pena_api',{a:'panel_logo',p:{panelKey,logo_path}});
   if(error)return reply({error:'No pudimos guardar el logo. Volvé a intentar.'},500);
   return reply(data,data?.status||200);
 }
 const bearer=req.headers.get('authorization');
 const sb=createClient(sburl,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:bearer?{Authorization:bearer}:{}}});
 if(bearer){if(!bearer.startsWith('Bearer '))return reply({error:'Sesión inválida'},401);const {error}=await sb.auth.getUser(bearer.slice(7));if(error)return reply({error:'Tu sesión venció. Volvé a ingresar con Google'},401)}
 let payload:Record<string,unknown>=Object.fromEntries(url.searchParams);
 if(req.method==='POST'){const raw=await req.text();if(raw.length>8192)return reply({error:'Solicitud demasiado grande'},413);try{payload=JSON.parse(raw)}catch{return reply({error:'Solicitud inválida'},400)}if(!payload||Array.isArray(payload)||typeof payload!=='object')return reply({error:'Solicitud inválida'},400)}
 if(req.method==='POST'&&(path==='tickets'||path==='band'||path==='panel_payment')){try{payload.phone=normalizeArgentineMobile(payload.phone)}catch(e){return reply({error:(e as Error).message},400)}}
 const action=path==='bands'?(req.method==='GET'?'bands_list':'bands_create'):path;
 const {data,error}=await sb.rpc('pena_api',{a:action,p:payload});
 if(error){console.error('Supabase RPC',error.code,error.message);return reply({error:'No pudimos procesar la operación. Actualizá e intentá de nuevo.'},500)}
 if(data?.error)return reply({error:data.error},data.status||400);
 return reply(data);
 }catch(error){console.error('API request failed',error instanceof Error?error.message:'unknown');return reply({error:'No pudimos conectar con el sistema. Intentá nuevamente.'},503)}
}
export const GET=handle;
export const POST=handle;

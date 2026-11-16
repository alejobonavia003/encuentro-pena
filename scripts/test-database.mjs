import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import areaCodes from '../lib/argentine-area-codes.mjs';
const db=new PGlite();let checks=0;
const ids={admin:'10000000-0000-4000-8000-000000000001',rep:'10000000-0000-4000-8000-000000000002',other:'10000000-0000-4000-8000-000000000003',door:'10000000-0000-4000-8000-000000000004',mati:'10000000-0000-4000-8000-000000000005'};
await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create table auth.sessions(id uuid primary key,user_id uuid);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'$$;` .replace("select nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'", "select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid"));
await db.exec(`create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid(),auth.jwt() to anon,authenticated;`);
await db.exec(readFileSync('supabase/schema.sql','utf8'));
// Upgrade an existing band before exercising both participant types.
await db.exec(`insert into public.bands(id,name,phone) values('legacy-band','Banda anterior','0358 15 4928722');
insert into public.tickets(id,band_id,slot,name,phone,method,status,expires,created,confirmed_at,request_key) values('legacy-ticket','legacy-band',1,'Persona anterior','358 4928722','cash','confirmed',9999999999999,1,2,'legacy-key');`);
const beforeBand=(await db.query("select to_jsonb(b) value from public.bands b where id='legacy-band'")).rows[0].value;
const beforeTicket=(await db.query("select to_jsonb(t) value from public.tickets t where id='legacy-ticket'")).rows[0].value;
await db.exec(readFileSync('supabase/migrations/20261116220155_participants_whatsapp.sql','utf8'));
assert.equal((await db.query("select kind from public.bands where id='legacy-band'")).rows[0].kind,'band');
assert.deepEqual((await db.query("select to_jsonb(b)-'kind' value from public.bands b where id='legacy-band'")).rows[0].value,beforeBand);
assert.deepEqual((await db.query("select to_jsonb(t)-'expired' value from public.tickets t where id='legacy-ticket'")).rows[0].value,beforeTicket);
console.log('PASS Migration preserves existing IDs, invitations, payment profiles and confirmed tickets');
await db.exec("delete from public.tickets where id='legacy-ticket'");
await db.exec("delete from public.bands where id='legacy-band'");
const phoneCases=JSON.parse(readFileSync('scripts/phone-cases.json','utf8'));
for(const area of areaCodes){const national=area+'4'.repeat(10-area.length);assert.equal((await db.query('select pena_private.normalize_mobile($1) value',[national])).rows[0].value,'549'+national);assert.equal((await db.query('select pena_private.normalize_mobile($1) value',['0'+area+'15'+'4'.repeat(10-area.length)])).rows[0].value,'549'+national)}
for(const [raw,expected] of phoneCases.valid)assert.equal((await db.query('select pena_private.normalize_mobile($1) value',[raw])).rows[0].value,expected);
// SQL text normalizer receives strings; JSON type is separately enforced by the RPC.
for(const raw of phoneCases.invalid.filter(x=>typeof x!=='number'))assert.equal((await db.query('select pena_private.normalize_mobile($1) value',[raw===null?null:String(raw)])).rows[0].value,null);
await db.exec(`insert into public.settings(id,title,date,time,location,open) values(1,'Prueba','2026-11-22','20:00','Lugar prueba',0);insert into pena_private.admins values('admin1@example.test'),('admin2@example.test');`);
for(const [name,id]of Object.entries(ids)){const email=name==='admin'?'admin1@example.test':name==='mati'?'admin2@example.test':name+'@example.test';await db.query('insert into auth.users values($1,$2,now())',[id,email]);await db.query('insert into auth.sessions values($1,$1)',[id])}
async function call(a,p={},as=null){await db.exec('begin');try{await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify(as?{sub:ids[as],session_id:ids[as]}:{})]);await db.exec('set local role '+(as?'authenticated':'anon'));const {rows}=await db.query('select public.pena_api($1,$2::jsonb) value',[a,JSON.stringify(p)]);await db.exec('commit');return rows[0].value}catch(e){await db.exec('rollback');throw e}}
function ok(v,msg){assert.ok(v,msg);checks++;console.log('PASS '+msg)}
try{
 ok((await call('init')).signed===false,'Public visitors need no account');
 ok((await call('init',{},'admin')).isAdmin&&(await call('init',{},'mati')).isAdmin,'Both requested Google email addresses are administrators');
 ok(!(await call('init',{},'other')).isAdmin,'Other verified identities are not administrators');
 ok((await call('bands_list')).status===401,'Anonymous cannot list bands and guests');
 const a=(await call('bands_create',{name:'Banda prueba'},'admin')).id;
 const b=(await call('bands_create',{name:'Grupo de danza',kind:'dance'},'admin')).id;
 ok((await call('bands_create',{name:'No autorizado',kind:'dance'},'other')).status===403,'Only admin can create dancers');
 ok((await call('bands_create',{name:'Tipo inválido',kind:'invalid'},'admin')).status===400,'Unknown participant type rejected');
 ok((await call('manage',{band:a},'other')).status===403,'Unassigned band is protected from unrelated users');
 let bands=(await call('bands_list',{},'admin')).bands;
 ok(bands.find(x=>x.id===a).kind==='band'&&bands.find(x=>x.id===b).kind==='dance','Participants preserve type and default bands');
 const inv=bands.find(x=>x.id===a).invite;
 ok((await call('redeem',{invite:inv},'rep')).ok,'Representative claims private invitation');
 ok((await call('redeem',{invite:inv},'other')).status===403,'Private invitation cannot be claimed twice');
 ok((await call('manage',{band:b},'rep')).status===403,'Representative cannot read another band');
 const profile={id:a,representative:'Persona prueba',alias:'prueba.alias',holder:'Titular prueba',phone:'358 4928722'};
 ok((await call('band',profile,'rep')).ok,'Representative can configure own payment profile');
 const reserve=(bandId=a,key=crypto.randomUUID())=>({bandId,name:'Persona prueba',phone:'358 4928722',method:'transfer',requestKey:key,accept:true});
 ok((await call('tickets',{...reserve(),phone:3584928722})).status===400,'RPC rejects non-text phone payload');
 ok((await call('tickets',{...reserve(),phone:'4928722'})).status===400,'RPC rejects incomplete buyer mobile');
 ok((await call('band',{...profile,phone:'4928722'},'rep')).status===400,'RPC rejects incomplete representative mobile');
 ok((await call('tickets',reserve())).status===400,'Closed event prevents reservations');
 await call('band',{...profile,id:b},'admin');
 await call('settings',{title:'Peña prueba',date:'2026-11-22',time:'20:00',location:'Lugar prueba',open:true,reservation_minutes:60},'admin');
 ok((await call('public',{band:b})).band.kind==='dance'&&!(await call('public',{band:b})).band.invite,'Public dancer sale excludes private invitations');
 const ts=[];for(let i=0;i<25;i++){const r=await call('tickets',reserve());if(r.id)ts.push(r.id);else assert.equal(r.status,409)}
 ok((await call('manage',{band:a},'rep')).tickets.every(t=>t.phone==='5493584928722'),'Buyer mobile is normalized by SQL');
 ok(ts.length===20,'Band can have no more than twenty active reservations');
 const rows=(await call('manage',{band:a},'rep')).tickets;
 ok(rows.filter(x=>x.slot<=10).length===10&&rows.filter(x=>x.slot>10).length===10,'Ten tickets per price tier');
 ok(rows.reduce((n,t)=>n+(t.slot<=10?7000:10000),0)===170000,'All twenty tickets total ARS 170000');
 ok((await call('confirm',{id:ts[0],accept:true},'other')).status===403,'Unrelated identity cannot confirm payments');
 ok((await call('confirm',{id:ts[0]},'rep')).status===400,'Confirmation requires responsibility acceptance');
 ok((await call('confirm',{id:ts[0],accept:true},'rep')).ok,'Representative confirms an active request');
 ok((await call('confirm',{id:ts[0],accept:true},'rep')).status===409,'Repeated confirmation is rejected');
 ok((await call('cancel',{id:ts[0]},'rep')).status===403,'Representative cannot revoke a confirmed ticket');
 ok((await call('door',{},'rep')).status===403,'Representative has no door access');
 ok((await call('door',{},'admin')).tickets.length===1,'Only confirmed tickets appear at door');
 ok((await call('checkin',{id:ts[0]},'admin')).ok&&(await call('checkin',{id:ts[0]},'admin')).status===409,'Door accepts each ticket only once');
 ok((await call('cancel',{id:ts[0]},'admin')).status===409,'Entered tickets cannot be cancelled');
 ok((await call('ticket',{id:ts[0]})).ticket.confirmed_by===undefined,'Public ticket response excludes internal actor IDs');
 const exp=(await call('tickets',reserve(b))).id;
 await db.query('update public.tickets set expires=1 where id=$1',[exp]);
 ok((await call('confirm',{id:exp,accept:true},'admin')).status===409,'Expired reservation cannot be confirmed');
 ok((await call('public',{band:b})).available===20,'Expired request releases its slot');
 ok((await call('ticket',{id:exp})).ticket.status==='cancelled','Expired ticket reports cancelled status');
 const danceTickets=[];for(let i=0;i<21;i++){const result=await call('tickets',reserve(b));if(result.id)danceTickets.push(result.id);else assert.equal(result.status,409)}
 ok(danceTickets.length===20,'Dancers share the twenty ticket limit');
 const danceRows=(await call('manage',{band:b},'admin')).tickets.filter(t=>t.status==='pending');
 ok(danceRows.filter(t=>t.slot<=10).length===10&&danceRows.reduce((n,t)=>n+(t.slot<=10?7000:10000),0)===170000,'Dancers share both price tiers');
 ok((await call('confirm',{id:danceTickets[0],accept:true},'rep')).status===403,'Band representative cannot confirm dancer sales');
 await call('confirm',{id:danceTickets[0],accept:true},'admin');
 ok((await call('door',{},'admin')).tickets.some(t=>t.band==='Grupo de danza'),'Dancers appear on door list');
 for(const id of danceTickets)await call('cancel',{id},'admin');
 const retry=reserve(b);const r1=await call('tickets',retry),r2=await call('tickets',retry);
 ok(r1.id===r2.id,'Idempotency preserves the same ticket on retry');
 await call('staff',{name:'Puerta prueba'},'admin');const staff=(await call('bands_list',{},'admin')).staff[0];await call('redeem',{invite:staff.invite},'door');
 ok((await call('door',{},'door')).tickets.length===1&&(await call('confirm',{id:ts[1],accept:true},'door')).status===403,'Door staff cannot confirm payments');
 await call('rotate',{id:a},'admin');ok((await call('manage',{band:a},'rep')).status===403,'Renewal revokes previous representative access');
 ok((await call('export',{},'admin')).tickets.length===42&&(await call('export',{},'other')).status===403,'Full backup requires administrator');
 const danceBand=(await call('bands_list',{},'admin')).bands.find(x=>x.id===b);
 ok((await call('redeem',{invite:danceBand.invite},'other')).ok,'Dancer representative claims own private access');
 ok((await call('manage',{band:b},'other')).band.kind==='dance'&&(await call('manage',{band:a},'other')).status===403,'Dancer representative can only manage assigned participant');
 ok((await call('confirm',{id:r1.id,accept:true},'other')).ok,'Dancer representative confirms own payment');
 ok((await call('export',{},'admin')).tickets.some(t=>t.band_id===b&&t.status==='confirmed'),'Export includes confirmed dancer tickets');
 await db.query('delete from auth.sessions where user_id=$1',[ids.admin]);
 ok((await call('bands_create',{name:'No session'},'admin')).status===401,'Revoked session cannot perform privileged operations');
 await db.exec('set role anon');let denied=false;try{await db.query('select * from public.tickets')}catch{denied=true}await db.exec('reset role');ok(denied,'Direct table access denied to public role');
 console.log(`${checks} checks passed`);
}finally{await db.close()}

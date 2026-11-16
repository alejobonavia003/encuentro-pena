import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();let checks=0;
const ids={admin:'10000000-0000-4000-8000-000000000001',rep:'10000000-0000-4000-8000-000000000002',other:'10000000-0000-4000-8000-000000000003',door:'10000000-0000-4000-8000-000000000004',mati:'10000000-0000-4000-8000-000000000005'};
await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create table auth.sessions(id uuid primary key,user_id uuid);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'$$;` .replace("select nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'", "select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid"));
await db.exec(`create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid(),auth.jwt() to anon,authenticated;`);
await db.exec(readFileSync('supabase/schema.sql','utf8'));
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
 const b=(await call('bands_create',{name:'Otra banda'},'admin')).id;
 ok((await call('manage',{band:a},'other')).status===403,'Unassigned band is protected from unrelated users');
 let bands=(await call('bands_list',{},'admin')).bands;
 const inv=bands.find(x=>x.id===a).invite;
 ok((await call('redeem',{invite:inv},'rep')).ok,'Representative claims private invitation');
 ok((await call('redeem',{invite:inv},'other')).status===403,'Private invitation cannot be claimed twice');
 ok((await call('manage',{band:b},'rep')).status===403,'Representative cannot read another band');
 const profile={id:a,representative:'Persona prueba',alias:'prueba.alias',holder:'Titular prueba',phone:'5493580000000'};
 ok((await call('band',profile,'rep')).ok,'Representative can configure own payment profile');
 const reserve=(bandId=a,key=crypto.randomUUID())=>({bandId,name:'Persona prueba',phone:'5493580000000',method:'transfer',requestKey:key,accept:true});
 ok((await call('tickets',reserve())).status===400,'Closed event prevents reservations');
 await call('band',{...profile,id:b},'admin');
 await call('settings',{title:'Peña prueba',date:'2026-11-22',time:'20:00',location:'Lugar prueba',open:true,reservation_minutes:60},'admin');
 const ts=[];for(let i=0;i<25;i++){const r=await call('tickets',reserve());if(r.id)ts.push(r.id);else assert.equal(r.status,409)}
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
 const retry=reserve(b);const r1=await call('tickets',retry),r2=await call('tickets',retry);
 ok(r1.id===r2.id,'Idempotency preserves the same ticket on retry');
 await call('staff',{name:'Puerta prueba'},'admin');const staff=(await call('bands_list',{},'admin')).staff[0];await call('redeem',{invite:staff.invite},'door');
 ok((await call('door',{},'door')).tickets.length===1&&(await call('confirm',{id:ts[1],accept:true},'door')).status===403,'Door staff cannot confirm payments');
 await call('rotate',{id:a},'admin');ok((await call('manage',{band:a},'rep')).status===403,'Renewal revokes previous representative access');
 ok((await call('export',{},'admin')).tickets.length===22&&(await call('export',{},'other')).status===403,'Full backup requires administrator');
 await db.query('delete from auth.sessions where user_id=$1',[ids.admin]);
 ok((await call('bands_create',{name:'No session'},'admin')).status===401,'Revoked session cannot perform privileged operations');
 await db.exec('set role anon');let denied=false;try{await db.query('select * from public.tickets')}catch{denied=true}await db.exec('reset role');ok(denied,'Direct table access denied to public role');
 console.log(`${checks} checks passed`);
}finally{await db.close()}

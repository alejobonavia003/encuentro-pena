-- Admin-only deletion; confirmed tickets and attendance must remain protected.
begin;
create or replace function pena_private.handle(a text,p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 u uuid:=auth.uid(); actor_email text; adm boolean:=false; isdoor boolean:=false;
 ms bigint:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
 sponsor_list jsonb; logo text; cfg public.settings%rowtype; bandrow public.bands%rowtype; ticketrow public.tickets%rowtype;
 sid text; inv text; slotn integer; qty integer; n text; ph text; mid text; targetid text;
 value jsonb; rows jsonb; rec record;
begin
 -- Actor comes exclusively from verified Supabase auth, never request JSON or user_metadata.
 if u is not null then
   select lower(x.email) into actor_email from auth.users x where x.id=u and x.email_confirmed_at is not null;
   if actor_email is null then return jsonb_build_object('error','Verificá tu identidad antes de continuar','status',401); end if;
   select exists(select 1 from pena_private.admins x where x.email=actor_email) into adm;
   select adm or exists(select 1 from public.staff s where s.user_id=u) into isdoor;
 end if;
 select * into cfg from public.settings where id=1;
 if cfg.id is null then return jsonb_build_object('error','Configuración pendiente','status',503); end if;
 select coalesce(jsonb_agg(to_jsonb(s) order by s.position,s.name,s.id),'[]'::jsonb) into sponsor_list from public.sponsors s where s.active;
 if a='init' then
   select coalesce(jsonb_agg(to_jsonb(x)-'legacy_user_id'),'[]'::jsonb) into rows from public.bands x where x.user_id=u;
   return jsonb_build_object('sponsors',sponsor_list,'settings',to_jsonb(cfg),'isAdmin',adm,'door',isdoor,'signed',u is not null,'bands',rows);
 elsif a='public' then
   select * into bandrow from public.bands where id=p->>'band' and active=1;
   if bandrow.id is null then return jsonb_build_object('error','Participante no disponible','status',404); end if;
   select count(*) into qty from public.tickets where band_id=bandrow.id and (status='confirmed' or(status='pending' and expires>ms));
   select min(s) into slotn from generate_series(1,20) s where not exists(select 1 from public.tickets q where q.band_id=bandrow.id and q.slot=s and(q.status='confirmed' or(q.status='pending' and q.expires>ms)));
   return jsonb_build_object('settings',to_jsonb(cfg),'band',jsonb_build_object('id',bandrow.id,'name',bandrow.name,'representative',bandrow.representative,'alias',bandrow.alias,'holder',bandrow.holder,'phone',bandrow.phone,'kind',bandrow.kind,'logo_path',bandrow.logo_path,'active',bandrow.active),'available',20-qty,'price',case when slotn<=10 then 7000 else 10000 end,'ready',bandrow.representative<>'' and bandrow.alias<>'' and bandrow.holder<>'' and pena_private.normalize_mobile(bandrow.phone) is not null);
 elsif a='ticket' then
   select * into ticketrow from public.tickets where id=p->>'id';
   if ticketrow.id is null then return jsonb_build_object('error','Entrada no encontrada','status',404); end if;
   select * into bandrow from public.bands where id=ticketrow.band_id;
   value:=to_jsonb(ticketrow)-'confirmed_by'-'entered_by'-'request_key';
   if ticketrow.status='pending' and ticketrow.expires<=ms then value:=jsonb_set(jsonb_set(value,'{status}','"cancelled"'),'{expired}','true'); end if;
   return jsonb_build_object('sponsors',sponsor_list,'settings',to_jsonb(cfg),'ticket',value||jsonb_build_object('band',bandrow.name,'band_logo_path',bandrow.logo_path,'representative_phone',bandrow.phone,'alias',bandrow.alias,'holder',bandrow.holder));
 elsif a='tickets' then
   n:=left(trim(coalesce(p->>'name','')),120); ph:=pena_private.normalize_mobile(p->>'phone');mid:=p->>'method';sid:=p->>'requestKey';
   if jsonb_typeof(p->'phone') is distinct from 'string' or ph is null then return jsonb_build_object('error','Ingresá código de área y número completos (por ejemplo, 358 4928722). No incluyas internos.','status',400);end if;
   if length(n)<3 or length(regexp_replace(ph,'[^0-9]','','g'))<8 or mid not in('cash','transfer') or mid is null or (p->>'accept') is distinct from 'true' or length(coalesce(sid,''))<20 or length(sid)>80 then return jsonb_build_object('error','Completá nombre, WhatsApp y condiciones','status',400); end if;
   -- Two locks: retries share one key; per-band row lock serializes slot allocation.
   perform pg_advisory_xact_lock(hashtextextended(sid,0));
   select * into ticketrow from public.tickets where request_key=sid;
   if ticketrow.id is not null then return jsonb_build_object('id',ticketrow.id);end if;
   select * into bandrow from public.bands where id=p->>'bandId' for update;
   select * into cfg from public.settings where id=1 for share;
   if bandrow.id is null or bandrow.active<>1 or cfg.open<>1 or bandrow.alias='' or bandrow.holder='' or bandrow.representative='' or pena_private.normalize_mobile(bandrow.phone) is null then return jsonb_build_object('error','La venta todavía no está habilitada','status',400);end if;
   update public.tickets set status='cancelled',expired=true where band_id=bandrow.id and status='pending' and expires<=ms;
   select min(s) into slotn from generate_series(1,20) s where not exists(select 1 from public.tickets q where q.band_id=bandrow.id and q.slot=s and q.status!='cancelled');
   if slotn is null then return jsonb_build_object('error','Se agotaron las 20 entradas de este participante','status',409);end if;
   insert into public.tickets(band_id,slot,name,phone,method,expires,created,request_key) values(bandrow.id,slotn,n,ph,mid,ms+cfg.reservation_minutes*60000,ms,sid) returning id into targetid;
   return jsonb_build_object('id',targetid);
 end if;
 -- All remaining operations require a verified identity and an active Supabase session.
 if u is null then return jsonb_build_object('error','Ingresá con Google para acceder','status',401);end if;
 if not exists(select 1 from auth.sessions s where s.user_id=u and s.id::text=auth.jwt()->>'session_id') then return jsonb_build_object('error','Tu sesión venció. Volvé a ingresar','status',401);end if;
 if a='sponsors' then
   if not adm then return jsonb_build_object('error','Sin permiso','status',403);end if;
   return jsonb_build_object('sponsors',(select coalesce(jsonb_agg(to_jsonb(s) order by s.position,s.name,s.id),'[]'::jsonb) from public.sponsors s));
 elsif a='sponsor' then
   if not adm then return jsonb_build_object('error','Sin permiso','status',403);end if;
   targetid:=p->>'id';n:=trim(coalesce(p->>'name',''));logo:=p->>'logo_path';
   if targetid is null or targetid!~'^[a-f0-9-]{36}$' or length(n) not between 1 and 100 or coalesce(p->>'position','')!~'^[0-9]{1,3}$' or jsonb_typeof(p->'active') is distinct from 'boolean' then
     return jsonb_build_object('error','Revisá el nombre, orden y estado del sponsor','status',400);end if;
   if logo is null or logo!~('^sponsors/'||targetid||'/[a-f0-9-]{36}\.webp$') or not exists(select 1 from storage.objects o where o.bucket_id='pena-logos' and o.name=logo) then
     return jsonb_build_object('error','Cargá un logo válido para este sponsor','status',400);end if;
   insert into public.sponsors(id,name,logo_path,position,active) values(targetid,n,logo,(p->>'position')::integer,(p->>'active')::boolean)
   on conflict(id) do update set name=excluded.name,logo_path=excluded.logo_path,position=excluded.position,active=excluded.active;
 elsif a='band_logo' then
   select * into bandrow from public.bands where id=p->>'id' for update;
   if bandrow.id is null or not(adm or coalesce(bandrow.user_id=u,false)) or bandrow.active<>1 then return jsonb_build_object('error','Sin permiso','status',403);end if;
   logo:=p->>'logo_path';
   if logo is null or left(logo,length('participants/'||bandrow.id||'/'))<>'participants/'||bandrow.id||'/' or logo!~'^participants/[a-zA-Z0-9_-]+/[a-f0-9-]{36}\.webp$' or not exists(select 1 from storage.objects o where o.bucket_id='pena-logos' and o.name=logo) then
     return jsonb_build_object('error','Cargá un logo válido para tu participante','status',400);end if;
   update public.bands set logo_path=logo where id=bandrow.id;targetid:=bandrow.id;
 elsif a='redeem' then
   inv:=p->>'invite';
   select * into bandrow from public.bands where invite=inv for update;
   if bandrow.id is not null then
     if bandrow.user_id is not null and bandrow.user_id<>u then return jsonb_build_object('error','Esta invitación ya fue utilizada','status',403);end if;
     update public.bands set user_id=u where id=bandrow.id;targetid:=bandrow.id;
   else
     select * into rec from public.staff where invite=inv for update;
     if rec.id is null then return jsonb_build_object('error','Invitación inválida o renovada','status',404);end if;
     if rec.user_id is not null and rec.user_id<>u then return jsonb_build_object('error','Esta invitación ya fue utilizada','status',403);end if;
     update public.staff set user_id=u where id=rec.id;targetid:=rec.id;
   end if;
 elsif a='bands_list' then
   if not adm then return jsonb_build_object('error','Sin permiso','status',403);end if;
   return jsonb_build_object('bands',(select coalesce(jsonb_agg(to_jsonb(x)-'legacy_user_id' order by x.name),'[]') from public.bands x),'staff',(select coalesce(jsonb_agg(to_jsonb(x)-'legacy_user_id'),'[]') from public.staff x),'tickets',(select coalesce(jsonb_agg(to_jsonb(q)||jsonb_build_object('band',bb.name) order by q.created desc),'[]') from public.tickets q join public.bands bb on bb.id=q.band_id));
 elsif a='manage' then
   select * into bandrow from public.bands where id=p->>'band';
   if bandrow.id is null or not(adm or coalesce(bandrow.user_id=u,false)) then return jsonb_build_object('error','Sin acceso a este participante','status',403);end if;
   update public.tickets set status='cancelled',expired=true where band_id=bandrow.id and status='pending' and expires<=ms;
   return jsonb_build_object('band',to_jsonb(bandrow)-'legacy_user_id','tickets',(select coalesce(jsonb_agg(to_jsonb(q) order by q.created desc),'[]') from public.tickets q where q.band_id=bandrow.id));
 elsif a='band_delete' then
   if not adm then return jsonb_build_object('error','Sólo la organización puede eliminar participantes','status',403);end if;
   if (p->>'accept') is distinct from 'true' then return jsonb_build_object('error','Confirmá la eliminación del participante','status',400);end if;
   select * into bandrow from public.bands where id=p->>'id' for update;
   if bandrow.id is null then return jsonb_build_object('error','Participante no encontrado','status',404);end if;
   perform 1 from public.tickets where band_id=bandrow.id for update;
   if exists(select 1 from public.tickets where band_id=bandrow.id and (status='confirmed' or entered_at is not null)) then
     return jsonb_build_object('error','No se puede eliminar: tiene entradas confirmadas o personas que ya ingresaron. Anulá primero las confirmaciones que correspondan.','status',409);end if;
   delete from public.tickets where band_id=bandrow.id;
   delete from public.bands where id=bandrow.id;
   targetid:=bandrow.id;
 elsif a='bands_create' then
   if not adm then return jsonb_build_object('error','Sin permiso','status',403);end if;
   n:=left(trim(coalesce(p->>'name','')),120);if n='' then return jsonb_build_object('error','Ingresá el nombre de el participante','status',400);end if;
   if coalesce(p->>'kind','band') not in ('band','dance','solo') then return jsonb_build_object('error','Elegí Banda, Solista o Bailarines / grupo de danza','status',400);end if;
   insert into public.bands(name,kind) values(n,coalesce(p->>'kind','band')) returning id into targetid;
 elsif a='band' then
   select * into bandrow from public.bands where id=p->>'id' for update;
   if bandrow.id is null or not(adm or coalesce(bandrow.user_id=u,false)) then return jsonb_build_object('error','Sin permiso','status',403);end if;
   if trim(coalesce(p->>'representative',''))='' or trim(coalesce(p->>'alias',''))='' or trim(coalesce(p->>'holder',''))='' or jsonb_typeof(p->'phone') is distinct from 'string' or pena_private.normalize_mobile(p->>'phone') is null then return jsonb_build_object('error','Completá representante, alias, titular y WhatsApp con código de área y número','status',400);end if;
   update public.bands set representative=left(trim(p->>'representative'),120),alias=left(trim(p->>'alias'),120),holder=left(trim(p->>'holder'),120),phone=pena_private.normalize_mobile(p->>'phone') where id=bandrow.id;targetid:=bandrow.id;
 elsif a in('confirm','cancel') then
   select * into ticketrow from public.tickets where id=p->>'id' for update;
   select * into bandrow from public.bands where id=ticketrow.band_id;
   if ticketrow.id is null or not(adm or coalesce(bandrow.user_id=u,false)) then return jsonb_build_object('error','Sin permiso','status',403);end if;
   if a='confirm' then
     if (p->>'accept') is distinct from 'true' then return jsonb_build_object('error','Aceptá la responsabilidad de habilitar esta entrada','status',400);end if;
     if ticketrow.status<>'pending' or ticketrow.expires<=ms then return jsonb_build_object('error','La solicitud venció o ya fue procesada','status',409);end if;
     update public.tickets set status='confirmed',confirmed_at=ms,confirmed_by=u::text where id=ticketrow.id;
   else
     if ticketrow.entered_at is not null then return jsonb_build_object('error','La entrada ya ingresó','status',409);end if;
     if ticketrow.status<>'pending' and not adm then return jsonb_build_object('error','Sólo Encuentro puede anular confirmaciones','status',403);end if;
     update public.tickets set status='cancelled' where id=ticketrow.id;
   end if;targetid:=ticketrow.id;
 elsif a='door' then
   if not isdoor then return jsonb_build_object('error','Sin acceso a puerta','status',403);end if;
   return jsonb_build_object('tickets',(select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'name',q.name,'slot',q.slot,'status',q.status,'entered_at',q.entered_at,'band',bb.name) order by q.name),'[]') from public.tickets q join public.bands bb on bb.id=q.band_id where q.status='confirmed'));
 elsif a='checkin' then
   if not isdoor then return jsonb_build_object('error','Sin acceso a puerta','status',403);end if;
   update public.tickets set entered_at=ms,entered_by=u::text where id=p->>'id' and status='confirmed' and entered_at is null returning id into targetid;
   if targetid is null then return jsonb_build_object('error','Entrada ya utilizada o no confirmada','status',409);end if;
 elsif a='settings' then
   if not adm then return jsonb_build_object('error','Sin permiso','status',403);end if;
   if (p->>'open')='true' and(trim(coalesce(p->>'date',''))='' or trim(coalesce(p->>'time',''))='' or trim(coalesce(p->>'location',''))='') then return jsonb_build_object('error','Definí fecha, horario y lugar antes de abrir ventas','status',400);end if;
   update public.settings set title=left(coalesce(nullif(trim(p->>'title'),''),'Peña de Encuentro'),120),date=left(coalesce(p->>'date',''),12),time=left(coalesce(p->>'time',''),8),location=left(coalesce(p->>'location',''),240),open=case when(p->>'open')='true' then 1 else 0 end,reservation_minutes=coalesce((p->>'reservation_minutes')::integer,reservation_minutes) where id=1;targetid:='1';
 elsif a='staff' then
   if not adm then return jsonb_build_object('error','Sin permiso','status',403);end if;
   n:=left(trim(coalesce(p->>'name','')),120);if n='' then return jsonb_build_object('error','Ingresá un nombre','status',400);end if;
   insert into public.staff(name) values(n) returning id into targetid;
 elsif a='rotate' then
   if not adm then return jsonb_build_object('error','Sin permiso','status',403);end if;
   if (p->>'staff')='true' then update public.staff set user_id=null,invite=gen_random_uuid()::text||replace(gen_random_uuid()::text,'-','') where id=p->>'id' returning id into targetid;
   else update public.bands set user_id=null,invite=gen_random_uuid()::text||replace(gen_random_uuid()::text,'-','') where id=p->>'id' returning id into targetid;end if;
 elsif a='export' then
   if not adm then return jsonb_build_object('error','Sin permiso','status',403);end if;
   return jsonb_build_object('sponsors',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from public.sponsors s),'exported_at',now(),'settings',to_jsonb(cfg),'bands',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.bands x),'tickets',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.tickets x),'staff',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.staff x),'audit',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from pena_private.audit x));
 else return jsonb_build_object('error','Ruta no encontrada','status',404);
 end if;
 insert into pena_private.audit(actor,action,entity_id) values(u,a,targetid);
 return jsonb_build_object('ok',true,'id',targetid);
end $$;
commit;

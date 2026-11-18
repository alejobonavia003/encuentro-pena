-- Give every existing participant a fresh link and retire Google-based participant access.
begin;
update public.bands
set user_id=null, invite=gen_random_uuid()::text||replace(gen_random_uuid()::text,'-','')
where not is_general;
alter table public.bands add constraint bands_no_account check(user_id is null);

alter table public.tickets drop constraint tickets_method_check;
alter table public.tickets add constraint tickets_method_check check(method in ('transfer','cash','guest'));
alter table public.tickets drop constraint tickets_amount_check;
alter table public.tickets add constraint tickets_amount_check check(
 (method='guest' and amount=0 and phone='') or (method<>'guest' and amount between 1 and 10000000)
);

create or replace function pena_private.can_upload_logo(object_name text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); verified_email text; adm boolean;
begin
 if u is null or not exists(select 1 from auth.sessions s where s.user_id=u and s.id::text=auth.jwt()->>'session_id') then return false;end if;
 select lower(x.email) into verified_email from auth.users x where x.id=u and x.email_confirmed_at is not null;
 if verified_email is null then return false;end if;
 select exists(select 1 from pena_private.admins a where a.email=verified_email) into adm;
 if object_name~'^sponsors/[a-f0-9-]{36}/[a-f0-9-]{36}\.webp$' then return adm;end if;
 if object_name!~'^participants/[a-zA-Z0-9_-]+/[a-f0-9-]{36}\.webp$' then return false;end if;
 return exists(select 1 from public.bands b where b.id=split_part(object_name,'/',2) and b.active=1 and adm);
end $$;
create or replace function pena_private.handle(a text,p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 u uuid:=auth.uid(); actor_email text; adm boolean:=false; isdoor boolean:=false;
 ms bigint:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
 sponsor_list jsonb; logo text; cfg public.settings%rowtype; bandrow public.bands%rowtype; ticketrow public.tickets%rowtype;
 sid text; inv text; slotn integer; qty integer; n text; ph text; mid text; targetid text;
 eventid integer; event_list jsonb;
 panel_id text; first_name text; last_name text;
 value jsonb; rec record;
begin
 -- Actor comes exclusively from verified Supabase auth, never request JSON or user_metadata.
 if u is not null then
   select lower(x.email) into actor_email from auth.users x where x.id=u and x.email_confirmed_at is not null;
   if actor_email is null then return jsonb_build_object('error','Verificá tu identidad antes de continuar','status',401); end if;
   select exists(select 1 from pena_private.admins x where x.email=actor_email) into adm;
   select adm or exists(select 1 from public.staff s where s.user_id=u) into isdoor;
 end if;
 if p ? 'event' and coalesce(p->>'event','') !~ '^[1-9][0-9]{0,8}$' then
   return jsonb_build_object('error','Evento inválido','status',400);end if;
 eventid:=coalesce((p->>'event')::integer,1);
 if a in ('panel','panel_guest','panel_payment','panel_confirm','panel_cancel') then
   -- Serialize panel writes, reservations and link renewal on this participant.
   select * into bandrow from public.bands
   where invite=p->>'panelKey' and active=1 and not is_general for update;
   if bandrow.id is null then
     return jsonb_build_object('error','Este enlace no está disponible. Pedile el enlace actualizado a la organización.','status',404);
   end if;
   panel_id:=bandrow.id;
   eventid:=bandrow.event_id;
 elsif a in ('public','manage') then select event_id into eventid from public.bands where id=p->>'band';
 elsif a='ticket' then select b.event_id into eventid from public.tickets t join public.bands b on b.id=t.band_id where t.id=p->>'id';end if;
 select * into cfg from public.settings where id=eventid;
 if cfg.id is null then return jsonb_build_object('error','Evento no encontrado','status',404); end if;
 select coalesce(jsonb_agg(to_jsonb(s) order by s.position,s.name,s.id),'[]'::jsonb) into sponsor_list from public.sponsors s where s.active;
 select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('general_band_id',b.id) order by e.date,e.id),'[]') into event_list from public.settings e left join public.bands b on b.event_id=e.id and b.is_general;
 if a='init' then
   return jsonb_build_object('sponsors',sponsor_list,'settings',to_jsonb(cfg),'events',event_list,'isAdmin',adm,'door',isdoor,'signed',u is not null,'bands','[]'::jsonb);
 elsif a='public' then
   select * into bandrow from public.bands where id=p->>'band' and active=1;
   if bandrow.id is null then return jsonb_build_object('error','Participante no disponible','status',404); end if;
   select count(*) into qty from public.tickets where band_id=bandrow.id and (status='confirmed' or(status='pending' and expires>ms));
   select min(s) into slotn from generate_series(1,bandrow.capacity) s where not exists(select 1 from public.tickets q where q.band_id=bandrow.id and q.slot=s and(q.status='confirmed' or(q.status='pending' and q.expires>ms)));
   return jsonb_build_object('settings',to_jsonb(cfg),'band',jsonb_build_object('id',bandrow.id,'name',bandrow.name,'representative',bandrow.representative,'alias',bandrow.alias,'holder',bandrow.holder,'phone',bandrow.phone,'kind',bandrow.kind,'logo_path',bandrow.logo_path,'active',bandrow.active,'is_general',bandrow.is_general,'capacity',bandrow.capacity,'event_id',bandrow.event_id),'available',greatest(0,bandrow.capacity-qty),'price',case when bandrow.is_general then bandrow.general_price when slotn<=10 then 7000 else 10000 end,'ready',bandrow.representative<>'' and bandrow.alias<>'' and bandrow.holder<>'' and pena_private.normalize_mobile(bandrow.phone) is not null);
 elsif a='ticket' then
   select * into ticketrow from public.tickets where id=p->>'id';
   if ticketrow.id is null or ticketrow.method='guest' then return jsonb_build_object('error','Entrada no encontrada','status',404); end if;
   select * into bandrow from public.bands where id=ticketrow.band_id;
   value:=to_jsonb(ticketrow)-'confirmed_by'-'entered_by'-'request_key';
   if ticketrow.status='pending' and ticketrow.expires<=ms then value:=jsonb_set(jsonb_set(value,'{status}','"cancelled"'),'{expired}','true'); end if;
   return jsonb_build_object('sponsors',sponsor_list,'settings',to_jsonb(cfg),'ticket',value||jsonb_build_object('is_general',bandrow.is_general,'event_id',bandrow.event_id,'band',bandrow.name,'band_logo_path',bandrow.logo_path,'representative_phone',bandrow.phone,'alias',bandrow.alias,'holder',bandrow.holder));
 elsif a='tickets' then
   n:=left(trim(coalesce(p->>'name','')),120); ph:=pena_private.normalize_mobile(p->>'phone');mid:=p->>'method';sid:=p->>'requestKey';
   if jsonb_typeof(p->'phone') is distinct from 'string' or ph is null then return jsonb_build_object('error','Ingresá código de área y número completos (por ejemplo, 358 4928722). No incluyas internos.','status',400);end if;
   if length(n)<3 or length(regexp_replace(ph,'[^0-9]','','g'))<8 or mid not in('cash','transfer') or mid is null or (p->>'accept') is distinct from 'true' or length(coalesce(sid,''))<20 or length(sid)>80 or sid like 'guest:%' then return jsonb_build_object('error','Completá nombre, WhatsApp y condiciones','status',400); end if;
   -- Two locks: retries share one key; per-band row lock serializes slot allocation.
   perform pg_advisory_xact_lock(hashtextextended(sid,0));
   select * into ticketrow from public.tickets where request_key=sid;
   if ticketrow.id is not null then return jsonb_build_object('id',ticketrow.id);end if;
   select * into bandrow from public.bands where id=p->>'bandId' for update;
   select * into cfg from public.settings where id=bandrow.event_id for share;
   if bandrow.id is null or bandrow.active<>1 or cfg.open<>1 or bandrow.alias='' or bandrow.holder='' or bandrow.representative='' or pena_private.normalize_mobile(bandrow.phone) is null then return jsonb_build_object('error','La venta todavía no está habilitada','status',400);end if;
   update public.tickets set status='cancelled',expired=true where band_id=bandrow.id and status='pending' and expires<=ms;
   select min(s) into slotn from generate_series(1,bandrow.capacity) s where not exists(select 1 from public.tickets q where q.band_id=bandrow.id and q.slot=s and q.status!='cancelled');
   if slotn is null then return jsonb_build_object('error','Se agotaron las entradas disponibles','status',409);end if;
   insert into public.tickets(band_id,slot,name,phone,method,expires,created,request_key,amount) values(bandrow.id,slotn,n,ph,mid,ms+cfg.reservation_minutes*60000,ms,sid,case when bandrow.is_general then bandrow.general_price when slotn<=10 then 7000 else 10000 end) returning id into targetid;
   return jsonb_build_object('id',targetid);
 end if;
 -- Panel links grant narrowly scoped operations. Other operations require a staff session.
 if panel_id is null then
   if u is null then return jsonb_build_object('error','Ingresá con Google para acceder','status',401);end if;
   if not exists(select 1 from auth.sessions s where s.user_id=u and s.id::text=auth.jwt()->>'session_id') then return jsonb_build_object('error','Tu sesión venció. Volvé a ingresar','status',401);end if;
 end if;
 if a='panel' then
   return jsonb_build_object('settings',to_jsonb(cfg),'band',to_jsonb(bandrow)-'invite'-'user_id'-'legacy_user_id',
     'tickets',(select coalesce(jsonb_agg(jsonb_build_object(
       'id',q.id,'name',q.name,'phone',q.phone,'method',q.method,'amount',q.amount,'status',q.status,'entered_at',q.entered_at
     ) order by q.created desc,q.id),'[]') from public.tickets q
     where q.band_id=panel_id and (q.status='confirmed' or (q.status='pending' and q.expires>ms))));
 elsif a='panel_guest' then
   first_name:=regexp_replace(coalesce(p->>'firstName',''),'[[:space:]]+',' ','g');
   last_name:=regexp_replace(coalesce(p->>'lastName',''),'[[:space:]]+',' ','g');
   n:=trim(first_name)||' '||trim(last_name);
   if jsonb_typeof(p->'firstName') is distinct from 'string' or jsonb_typeof(p->'lastName') is distinct from 'string'
     or trim(first_name)='' or trim(last_name)='' or length(n)>120 then
     return jsonb_build_object('error','Completá el nombre y el apellido (hasta 120 caracteres en total).','status',400);
   end if;
   if coalesce(p->>'requestKey','') !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' then
     return jsonb_build_object('error','No pudimos identificar la carga. Volvé a intentarlo.','status',400);
   end if;
   sid:='guest:'||panel_id||':'||(p->>'requestKey');
   select id into targetid from public.tickets where request_key=sid;
   if targetid is not null then return jsonb_build_object('ok',true,'id',targetid);end if;
   update public.tickets set status='cancelled',expired=true where band_id=panel_id and status='pending' and expires<=ms;
   select min(s) into slotn from generate_series(1,bandrow.capacity) s
   where not exists(select 1 from public.tickets q where q.band_id=panel_id and q.slot=s and q.status<>'cancelled');
   if slotn is null then return jsonb_build_object('error','El cupo de este participante está completo.','status',409);end if;
   insert into public.tickets(band_id,slot,name,phone,method,status,expires,created,confirmed_at,request_key,amount)
   values(panel_id,slotn,n,'','guest','confirmed',ms,ms,ms,sid,0) returning id into targetid;
 elsif a='sponsors' then
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
   if bandrow.id is null or not adm or bandrow.active<>1 then return jsonb_build_object('error','Sin permiso','status',403);end if;
   logo:=p->>'logo_path';
   if logo is null or left(logo,length('participants/'||bandrow.id||'/'))<>'participants/'||bandrow.id||'/' or logo!~'^participants/[a-zA-Z0-9_-]+/[a-f0-9-]{36}\.webp$' or not exists(select 1 from storage.objects o where o.bucket_id='pena-logos' and o.name=logo) then
     return jsonb_build_object('error','Cargá un logo válido para tu participante','status',400);end if;
   update public.bands set logo_path=logo where id=bandrow.id;targetid:=bandrow.id;
 elsif a='redeem' then
   inv:=p->>'invite';
   select * into rec from public.staff where invite=inv for update;
   if rec.id is null then return jsonb_build_object('error','Invitación inválida o renovada','status',404);end if;
   if rec.user_id is not null and rec.user_id<>u then return jsonb_build_object('error','Esta invitación ya fue utilizada','status',403);end if;
   update public.staff set user_id=u where id=rec.id;targetid:=rec.id;
 elsif a='bands_list' then
   if not adm then return jsonb_build_object('error','Sin permiso','status',403);end if;
   return jsonb_build_object('bands',(select coalesce(jsonb_agg(to_jsonb(x)-'legacy_user_id' order by x.name),'[]') from public.bands x where x.event_id=cfg.id),'staff',(select coalesce(jsonb_agg(to_jsonb(x)-'legacy_user_id'),'[]') from public.staff x),'tickets',(select coalesce(jsonb_agg(to_jsonb(q)||jsonb_build_object('is_general',bb.is_general,'band',bb.name) order by q.created desc),'[]') from public.tickets q join public.bands bb on bb.id=q.band_id where bb.event_id=cfg.id));
 elsif a='manage' then
   select * into bandrow from public.bands where id=p->>'band';
   if bandrow.id is null or not adm then return jsonb_build_object('error','Sin acceso a este participante','status',403);end if;
   update public.tickets set status='cancelled',expired=true where band_id=bandrow.id and status='pending' and expires<=ms;
   return jsonb_build_object('settings',to_jsonb(cfg),'band',to_jsonb(bandrow)-'legacy_user_id','tickets',(select coalesce(jsonb_agg(to_jsonb(q) order by q.created desc),'[]') from public.tickets q where q.band_id=bandrow.id));
 elsif a='band_delete' then
   if not adm then return jsonb_build_object('error','Sólo la organización puede eliminar participantes','status',403);end if;
   if (p->>'accept') is distinct from 'true' then return jsonb_build_object('error','Confirmá la eliminación del participante','status',400);end if;
   select * into bandrow from public.bands where id=p->>'id' for update;
   if bandrow.id is null then return jsonb_build_object('error','Participante no encontrado','status',404);end if;
   if bandrow.is_general then return jsonb_build_object('error','El organizador se configura desde Configuración y no se puede eliminar','status',409);end if;
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
   insert into public.bands(name,kind,event_id) values(n,coalesce(p->>'kind','band'),cfg.id) returning id into targetid;
 elsif a in ('band','panel_payment') then
   if panel_id is null then select * into bandrow from public.bands where id=p->>'id' for update;end if;
   if bandrow.id is null or (panel_id is null and not adm) then return jsonb_build_object('error','Sin permiso','status',403);end if;
   if trim(coalesce(p->>'representative',''))='' or trim(coalesce(p->>'alias',''))='' or trim(coalesce(p->>'holder',''))='' or jsonb_typeof(p->'phone') is distinct from 'string' or pena_private.normalize_mobile(p->>'phone') is null then return jsonb_build_object('error','Completá representante, alias, titular y WhatsApp con código de área y número','status',400);end if;
   update public.bands set representative=left(trim(p->>'representative'),120),alias=left(trim(p->>'alias'),120),holder=left(trim(p->>'holder'),120),phone=pena_private.normalize_mobile(p->>'phone') where id=bandrow.id;targetid:=bandrow.id;
 elsif a in('confirm','cancel','panel_confirm','panel_cancel') then
   select * into ticketrow from public.tickets where id=p->>'id' and (panel_id is null or band_id=panel_id) for update;
   if ticketrow.id is null or (panel_id is null and not adm) then return jsonb_build_object('error','Sin permiso','status',403);end if;
   if a in ('confirm','panel_confirm') then
     if (p->>'accept') is distinct from 'true' then return jsonb_build_object('error','Aceptá la responsabilidad de habilitar esta entrada','status',400);end if;
     if ticketrow.status<>'pending' or ticketrow.expires<=ms then return jsonb_build_object('error','La solicitud venció o ya fue procesada','status',409);end if;
     update public.tickets set status='confirmed',confirmed_at=ms,confirmed_by=case when panel_id is null then u::text end where id=ticketrow.id;
   else
     if ticketrow.entered_at is not null then return jsonb_build_object('error','La entrada ya ingresó','status',409);end if;
     if ticketrow.status<>'pending' and not (panel_id is null and adm) and not (ticketrow.method='guest' and ticketrow.status='confirmed') then return jsonb_build_object('error','Sólo Encuentro puede anular confirmaciones','status',403);end if;
     update public.tickets set status='cancelled' where id=ticketrow.id;
   end if;targetid:=ticketrow.id;
 elsif a='door' then
   if not isdoor then return jsonb_build_object('error','Sin acceso a puerta','status',403);end if;
   return jsonb_build_object('tickets',(select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'name',q.name,'slot',q.slot,'amount',q.amount,'method',q.method,'event_id',bb.event_id,'status',q.status,'entered_at',q.entered_at,'is_general',bb.is_general,'band',bb.name) order by q.name),'[]') from public.tickets q join public.bands bb on bb.id=q.band_id where q.status='confirmed' and bb.event_id=cfg.id));
 elsif a='checkin' then
   if not isdoor then return jsonb_build_object('error','Sin acceso a puerta','status',403);end if;
   update public.tickets set entered_at=ms,entered_by=u::text where id=p->>'id' and status='confirmed' and entered_at is null and band_id in(select id from public.bands where event_id=cfg.id) returning id into targetid;
   if targetid is null then return jsonb_build_object('error','Entrada ya utilizada o no confirmada','status',409);end if;
 elsif a='settings' then
   if not adm then return jsonb_build_object('error','Sin permiso','status',403);end if;
   if (p->>'open')='true' and(trim(coalesce(p->>'date',''))='' or trim(coalesce(p->>'time',''))='' or trim(coalesce(p->>'location',''))='') then return jsonb_build_object('error','Definí fecha, horario y lugar antes de abrir ventas','status',400);end if;
   perform 1 from public.bands where event_id=cfg.id and is_general for update;
   update public.settings set title=left(coalesce(nullif(trim(p->>'title'),''),'Peña de Encuentro'),120),date=left(coalesce(p->>'date',''),12),time=left(coalesce(p->>'time',''),8),location=left(coalesce(p->>'location',''),240),open=case when(p->>'open')='true' then 1 else 0 end,reservation_minutes=coalesce((p->>'reservation_minutes')::integer,reservation_minutes) where id=cfg.id;
   update public.bands set name=left(coalesce(nullif(trim(p->>'title'),''),'Peña de Encuentro'),120) where event_id=cfg.id and is_general;targetid:=cfg.id::text;
 elsif a='event_create' then
   if not adm then return jsonb_build_object('error','Sin permiso','status',403);end if;
   n:=left(trim(coalesce(p->>'title','')),120);
   if n='' then return jsonb_build_object('error','Ingresá el nombre del evento','status',400);end if;
   insert into public.settings(title) values(n) returning id into eventid;
   insert into public.bands(name,event_id,is_general) values(n,eventid,true);
   targetid:=eventid::text;
 elsif a='general_settings' then
   if not adm then return jsonb_build_object('error','Sin permiso','status',403);end if;
   if coalesce(p->>'capacity','') !~ '^[0-9]{1,6}$' or coalesce(p->>'general_price','') !~ '^[0-9]{1,8}$' then return jsonb_build_object('error','Ingresá precio y cupo válidos','status',400);end if;
   if (p->>'capacity')::integer not between 1 and 100000 or (p->>'general_price')::integer not between 1 and 10000000 then return jsonb_build_object('error','Revisá precio y cupo','status',400);end if;
   if trim(coalesce(p->>'representative',''))='' or trim(coalesce(p->>'alias',''))='' or trim(coalesce(p->>'holder',''))='' or pena_private.normalize_mobile(p->>'phone') is null then return jsonb_build_object('error','Completá encargado, alias, titular y WhatsApp','status',400);end if;
   select * into bandrow from public.bands where event_id=cfg.id and is_general for update;
   if exists(select 1 from public.tickets where band_id=bandrow.id and slot>(p->>'capacity')::integer and (status='confirmed' or (status='pending' and expires>ms))) then return jsonb_build_object('error','El cupo no puede excluir entradas confirmadas o reservas vigentes','status',409);end if;
   update public.bands set capacity=(p->>'capacity')::integer,general_price=(p->>'general_price')::integer,representative=left(trim(p->>'representative'),120),alias=left(trim(p->>'alias'),120),holder=left(trim(p->>'holder'),120),phone=pena_private.normalize_mobile(p->>'phone') where id=bandrow.id;
   targetid:=bandrow.id;
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
   return jsonb_build_object('sponsors',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from public.sponsors s),'exported_at',now(),'events',event_list,'settings',to_jsonb(cfg),'bands',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.bands x),'tickets',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.tickets x),'staff',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.staff x),'audit',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from pena_private.audit x));
 else return jsonb_build_object('error','Ruta no encontrada','status',404);
 end if;
 insert into pena_private.audit(actor,action,entity_id) values(u,a,targetid);
 return jsonb_build_object('ok',true,'id',targetid);
end $$;
commit;

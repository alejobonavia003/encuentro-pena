-- Apply after the existing schema.sql installation. No IDs or existing phone values are rewritten.
begin;
alter table public.bands add column kind text not null default 'band' check(kind in ('band','dance'));
alter table public.tickets add column expired boolean not null default false;
-- Structural mobile validation. Short subscriber-only numbers are deliberately rejected.
create or replace function pena_private.normalize_mobile(raw text) returns text
language plpgsql immutable set search_path='' as $$
declare digits text; candidate text; matches text[]:='{}'; area integer;
 -- Same ENACOM codes as lib/argentine-area-codes.mjs; parity checked by tests.
 areas text[]:=array['11','220','221','223','230','236','237','249','260','261','263','264','266','280','291','294','297','298','299','336','341','342','343','345','348','351','353','358','362','364','370','376','379','380','381','383','385','387','388','2202','2221','2223','2224','2225','2226','2227','2229','2241','2242','2243','2244','2245','2246','2252','2254','2255','2257','2261','2262','2264','2265','2266','2267','2268','2271','2272','2273','2274','2281','2283','2284','2285','2286','2291','2292','2296','2297','2302','2314','2316','2317','2320','2323','2324','2325','2326','2331','2333','2334','2335','2336','2337','2338','2342','2343','2344','2345','2346','2352','2353','2354','2355','2356','2357','2358','2392','2393','2394','2395','2396','2473','2474','2475','2477','2478','2622','2624','2625','2626','2646','2647','2648','2651','2655','2656','2657','2658','2901','2902','2903','2920','2921','2922','2923','2924','2925','2926','2927','2928','2929','2931','2932','2933','2934','2935','2936','2940','2942','2945','2946','2948','2952','2953','2954','2962','2963','2964','2966','2972','2982','2983','3327','3329','3382','3385','3387','3388','3400','3401','3402','3404','3405','3406','3407','3408','3409','3435','3436','3437','3438','3442','3444','3445','3446','3447','3454','3455','3456','3458','3460','3462','3463','3464','3465','3466','3467','3468','3469','3471','3472','3476','3482','3483','3487','3489','3491','3492','3493','3496','3497','3498','3521','3522','3524','3525','3532','3533','3537','3541','3542','3543','3544','3546','3547','3548','3549','3562','3563','3564','3571','3572','3573','3574','3575','3576','3582','3583','3584','3585','3711','3715','3716','3718','3721','3725','3731','3734','3735','3741','3743','3751','3754','3755','3756','3757','3758','3772','3773','3774','3775','3777','3781','3782','3786','3821','3825','3826','3827','3832','3835','3837','3838','3841','3843','3844','3845','3846','3854','3855','3856','3857','3858','3861','3862','3863','3865','3867','3868','3869','3873','3876','3877','3878','3885','3886','3887','3888','3891','3892','3894'];
 area_pattern text:='^(11|220|221|223|230|236|237|249|260|261|263|264|266|280|291|294|297|298|299|336|341|342|343|345|348|351|353|358|362|364|370|376|379|380|381|383|385|387|388|2202|2221|2223|2224|2225|2226|2227|2229|2241|2242|2243|2244|2245|2246|2252|2254|2255|2257|2261|2262|2264|2265|2266|2267|2268|2271|2272|2273|2274|2281|2283|2284|2285|2286|2291|2292|2296|2297|2302|2314|2316|2317|2320|2323|2324|2325|2326|2331|2333|2334|2335|2336|2337|2338|2342|2343|2344|2345|2346|2352|2353|2354|2355|2356|2357|2358|2392|2393|2394|2395|2396|2473|2474|2475|2477|2478|2622|2624|2625|2626|2646|2647|2648|2651|2655|2656|2657|2658|2901|2902|2903|2920|2921|2922|2923|2924|2925|2926|2927|2928|2929|2931|2932|2933|2934|2935|2936|2940|2942|2945|2946|2948|2952|2953|2954|2962|2963|2964|2966|2972|2982|2983|3327|3329|3382|3385|3387|3388|3400|3401|3402|3404|3405|3406|3407|3408|3409|3435|3436|3437|3438|3442|3444|3445|3446|3447|3454|3455|3456|3458|3460|3462|3463|3464|3465|3466|3467|3468|3469|3471|3472|3476|3482|3483|3487|3489|3491|3492|3493|3496|3497|3498|3521|3522|3524|3525|3532|3533|3537|3541|3542|3543|3544|3546|3547|3548|3549|3562|3563|3564|3571|3572|3573|3574|3575|3576|3582|3583|3584|3585|3711|3715|3716|3718|3721|3725|3731|3734|3735|3741|3743|3751|3754|3755|3756|3757|3758|3772|3773|3774|3775|3777|3781|3782|3786|3821|3825|3826|3827|3832|3835|3837|3838|3841|3843|3844|3845|3846|3854|3855|3856|3857|3858|3861|3862|3863|3865|3867|3868|3869|3873|3876|3877|3878|3885|3886|3887|3888|3891|3892|3894)';
begin
 if raw is null or length(raw)>40 or btrim(raw,E' \t\n\r\f')!~'^\+?[0-9\s()\-]+$' then return null;end if;
 digits:=regexp_replace(raw,'[^0-9]','','g');
 if left(digits,3)='549' and length(digits)=13 then digits:=substr(digits,4);
 elsif left(digits,2)='54' and length(digits)=12 then digits:=substr(digits,3);
 elsif left(btrim(raw,E' \t\n\r\f'),1)='+' then return null;end if;
 if left(digits,1)='0' then digits:=substr(digits,2);end if;
 if length(digits)=12 then
  for area in 2..4 loop
   if substr(digits,area+1,2)='15' then
    candidate:=left(digits,area)||substr(digits,area+3);
    if length(candidate)=10 and candidate~area_pattern and left(digits,area)=any(areas) and not(candidate=any(matches)) then matches:=array_append(matches,candidate);end if;
   end if;
  end loop;
  if cardinality(matches)<>1 then return null;end if;
  digits:=matches[1];
 end if;
 if length(digits)<>10 or digits!~area_pattern then return null;end if;
 return '549'||digits;
end $$;
revoke all on function pena_private.normalize_mobile(text) from public,anon,authenticated;
create or replace function pena_private.handle(a text,p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 u uuid:=auth.uid(); actor_email text; adm boolean:=false; isdoor boolean:=false;
 ms bigint:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
 cfg public.settings%rowtype; bandrow public.bands%rowtype; ticketrow public.tickets%rowtype;
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
 if a='init' then
   select coalesce(jsonb_agg(to_jsonb(x)-'legacy_user_id'),'[]'::jsonb) into rows from public.bands x where x.user_id=u;
   return jsonb_build_object('settings',to_jsonb(cfg),'isAdmin',adm,'door',isdoor,'signed',u is not null,'bands',rows);
 elsif a='public' then
   select * into bandrow from public.bands where id=p->>'band' and active=1;
   if bandrow.id is null then return jsonb_build_object('error','Participante no disponible','status',404); end if;
   select count(*) into qty from public.tickets where band_id=bandrow.id and (status='confirmed' or(status='pending' and expires>ms));
   select min(s) into slotn from generate_series(1,20) s where not exists(select 1 from public.tickets q where q.band_id=bandrow.id and q.slot=s and(q.status='confirmed' or(q.status='pending' and q.expires>ms)));
   return jsonb_build_object('settings',to_jsonb(cfg),'band',jsonb_build_object('id',bandrow.id,'name',bandrow.name,'representative',bandrow.representative,'alias',bandrow.alias,'holder',bandrow.holder,'phone',bandrow.phone,'kind',bandrow.kind,'active',bandrow.active),'available',20-qty,'price',case when slotn<=10 then 7000 else 10000 end,'ready',bandrow.representative<>'' and bandrow.alias<>'' and bandrow.holder<>'' and pena_private.normalize_mobile(bandrow.phone) is not null);
 elsif a='ticket' then
   select * into ticketrow from public.tickets where id=p->>'id';
   if ticketrow.id is null then return jsonb_build_object('error','Entrada no encontrada','status',404); end if;
   select * into bandrow from public.bands where id=ticketrow.band_id;
   value:=to_jsonb(ticketrow)-'confirmed_by'-'entered_by'-'request_key';
   if ticketrow.status='pending' and ticketrow.expires<=ms then value:=jsonb_set(jsonb_set(value,'{status}','"cancelled"'),'{expired}','true'); end if;
   return jsonb_build_object('settings',to_jsonb(cfg),'ticket',value||jsonb_build_object('band',bandrow.name,'representative_phone',bandrow.phone,'alias',bandrow.alias,'holder',bandrow.holder));
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
 if a='redeem' then
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
 elsif a='bands_create' then
   if not adm then return jsonb_build_object('error','Sin permiso','status',403);end if;
   n:=left(trim(coalesce(p->>'name','')),120);if n='' then return jsonb_build_object('error','Ingresá el nombre de el participante','status',400);end if;
   if coalesce(p->>'kind','band') not in ('band','dance') then return jsonb_build_object('error','Elegí Banda o Bailarines / grupo de danza','status',400);end if;
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
   return jsonb_build_object('exported_at',now(),'settings',to_jsonb(cfg),'bands',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.bands x),'tickets',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.tickets x),'staff',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.staff x),'audit',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from pena_private.audit x));
 else return jsonb_build_object('error','Ruta no encontrada','status',404);
 end if;
 insert into pena_private.audit(actor,action,entity_id) values(u,a,targetid);
 return jsonb_build_object('ok',true,'id',targetid);
end $$;

commit;

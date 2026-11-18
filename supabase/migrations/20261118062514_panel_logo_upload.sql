begin;

create function pena_private.can_upload_panel_logo(object_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select object_name ~ '^participants/[a-zA-Z0-9_-]+/[a-f0-9-]{36}[.]webp$'
    and exists (
      select 1 from public.bands b
      where b.id=split_part(object_name,'/',2) and b.active=1 and not b.is_general
        and b.invite=nullif(current_setting('request.headers',true),'')::jsonb->>'x-pena-panel-key'
    );
$$;
revoke all on function pena_private.can_upload_panel_logo(text) from public,anon,authenticated;
grant execute on function pena_private.can_upload_panel_logo(text) to anon;

create policy pena_panel_logo_upload on storage.objects for insert to anon
with check(bucket_id='pena-logos' and pena_private.can_upload_panel_logo(name));

create function pena_private.attach_panel_logo(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 band_id text;
 logo text:=p->>'logo_path';
begin
 select b.id into band_id from public.bands b
 where b.invite=p->>'panelKey' and not b.is_general and b.active=1 for update;
 if band_id is null then
   return jsonb_build_object('error','Este enlace no está disponible. Pedile el enlace actualizado a la organización.','status',404);
 end if;
 if logo is null or logo !~ '^participants/[a-zA-Z0-9_-]+/[a-f0-9-]{36}[.]webp$'
   or split_part(logo,'/',2)<>band_id
   or not exists(select 1 from storage.objects o where o.bucket_id='pena-logos' and o.name=logo) then
   return jsonb_build_object('error','Cargá un logo válido para tu participante','status',400);
 end if;
 update public.bands set logo_path=logo where id=band_id;
 insert into pena_private.audit(actor,action,entity_id) values(null,'panel_logo',band_id);
 return jsonb_build_object('ok',true,'id',band_id);
end;
$$;
revoke all on function pena_private.attach_panel_logo(jsonb) from public,anon,authenticated;
grant execute on function pena_private.attach_panel_logo(jsonb) to anon,authenticated;

create or replace function public.pena_api(a text,p jsonb default '{}'::jsonb) returns jsonb
language sql security invoker set search_path='' as $$
 select case when a='panel_logo' then pena_private.attach_panel_logo(p) else pena_private.handle(a,p) end;
$$;

commit;

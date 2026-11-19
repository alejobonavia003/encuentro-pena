begin;

alter table public.tickets drop constraint tickets_amount_check;

create function pena_private.price_manual_guest_ticket() returns trigger
language plpgsql set search_path='' as $$
begin
  new.amount := case when new.slot <= 10 then 7000 else 10000 end;
  return new;
end;
$$;
revoke all on function pena_private.price_manual_guest_ticket() from public, anon, authenticated;

create trigger price_manual_guest_ticket
before insert on public.tickets
for each row when (new.method = 'guest')
execute function pena_private.price_manual_guest_ticket();

update public.tickets
set amount = case when slot <= 10 then 7000 else 10000 end
where method = 'guest' and amount = 0;

alter table public.tickets add constraint tickets_amount_check check (
  (method = 'guest' and phone = '' and amount = case when slot <= 10 then 7000 else 10000 end)
  or (method <> 'guest' and amount between 1 and 10000000)
);

commit;

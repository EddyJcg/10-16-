-- Supabase Dashboard > SQL Editor에서 실행하세요.
-- ADMIN_USER_IDS에 지정된 기존 초기 관리자 UUID가 다르면 아래 초기 UUID를 먼저 바꾸세요.
create table if not exists public.inventory_admins (
  slot smallint primary key check (slot between 1 and 3),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.inventory_admins enable row level security;
revoke all on public.inventory_admins from public, anon, authenticated;
grant select on public.inventory_admins to service_role;

do $$
begin
  if not exists (select 1 from public.inventory_admins) then
    insert into public.inventory_admins(slot,user_id)
    values (1,'1a5b77e2-e8b2-4f7f-980d-e1974834be5c'::uuid);
  end if;
end;
$$;

create or replace function public.set_inventory_admin(target_user_id uuid, make_admin boolean)
returns table (is_admin boolean, admin_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_slot smallint;
  available_slot smallint;
  total_admins integer;
begin
  if target_user_id is null or make_admin is null then
    raise exception 'INVALID_ADMIN_CHANGE';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(190410263, 3);
  select slot into current_slot
  from public.inventory_admins
  where user_id = target_user_id;

  if make_admin and current_slot is null then
    select candidate.slot into available_slot
    from pg_catalog.generate_series(1,3) as candidate(slot)
    where not exists (
      select 1 from public.inventory_admins assigned
      where assigned.slot = candidate.slot
    )
    order by candidate.slot
    limit 1;
    if available_slot is null then raise exception 'ADMIN_LIMIT'; end if;
    insert into public.inventory_admins(slot,user_id)
    values (available_slot,target_user_id);
  elsif not make_admin and current_slot is not null then
    select count(*) into total_admins from public.inventory_admins;
    if total_admins <= 1 then raise exception 'LAST_ADMIN'; end if;
    delete from public.inventory_admins where user_id = target_user_id;
  end if;

  return query
  select exists (
    select 1 from public.inventory_admins where user_id = target_user_id
  ), (select count(*)::integer from public.inventory_admins);
end;
$$;

revoke all on function public.set_inventory_admin(uuid,boolean) from public, anon, authenticated;
grant execute on function public.set_inventory_admin(uuid,boolean) to service_role;

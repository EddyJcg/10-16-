-- Supabase Dashboard > SQL Editor에서 실행하세요.
-- 활성 로그인 사용자만 같은 재고를 조회·등록·수정·삭제합니다.
begin;
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  category text not null check (category in ('사무용품','전자기기','생활용품','식품','기타')),
  quantity integer not null default 0 check (quantity between 0 and 1000000),
  minimum integer not null default 5 check (minimum between 0 and 1000000),
  price bigint not null default 0 check (price between 0 and 1000000000),
  created_at timestamptz not null default now(),
  version bigint not null default 1
);
alter table public.inventory_items add column if not exists version bigint not null default 1;
alter table public.inventory_items enable row level security;
grant usage on schema public to anon, authenticated;
revoke all on public.inventory_items from anon;
grant select, insert, update, delete on public.inventory_items to authenticated;
drop policy if exists shared_inventory_authenticated on public.inventory_items;
drop policy if exists shared_inventory_public on public.inventory_items;
-- 사용자가 지정한 최초 관리자에게 재고 접근 권한을 부여합니다.
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"inventory_access":true}'::jsonb
where id = '1a5b77e2-e8b2-4f7f-980d-e1974834be5c'::uuid;
-- ban은 기존 액세스 토큰의 만료를 기다리지 않고 DB 접근에도 즉시 적용합니다.
create or replace function public.inventory_access_allowed()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users
    where id = (select auth.uid())
      and deleted_at is null
      and (banned_until is null or banned_until <= now())
      and raw_app_meta_data @> '{"inventory_access":true}'::jsonb
  );
$$;
revoke all on function public.inventory_access_allowed() from public, anon;
grant execute on function public.inventory_access_allowed() to authenticated;
create policy shared_inventory_authenticated on public.inventory_items
  for all to authenticated using ((select public.inventory_access_allowed()))
  with check ((select public.inventory_access_allowed()));

-- 수정마다 버전을 부여하여 오래된 화면의 저장이 최신 값을 덮어쓰지 않게 합니다.
create or replace function public.bump_inventory_version()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.version := old.version + 1;
  return new;
end;
$$;
revoke all on function public.bump_inventory_version() from public;
drop trigger if exists inventory_version on public.inventory_items;
create trigger inventory_version before update on public.inventory_items
  for each row execute function public.bump_inventory_version();

-- DB에서 직접 수량을 가감하여 동시 입출고 시 변경 누락을 방지합니다.
create or replace function public.adjust_inventory_quantity(item_id uuid, delta integer)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if delta not in (-1, 1) or delta is null then
    raise exception 'delta must be -1 or 1';
  end if;
  update public.inventory_items set quantity = quantity + delta where id = item_id;
  if not found then raise exception 'Item not found or access denied'; end if;
end;
$$;
revoke all on function public.adjust_inventory_quantity(uuid, integer) from public, anon;
grant execute on function public.adjust_inventory_quantity(uuid, integer) to authenticated;

-- 이미 활성화된 프로젝트에서도 중복 등록 없이 다시 실행할 수 있습니다.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'inventory_items'
  ) then
    alter publication supabase_realtime add table public.inventory_items;
  end if;
end;
$$;
commit;

-- Supabase Dashboard > SQL Editor에서 실행하세요.
-- 이 앱 전용 테이블입니다. 프로젝트에 로그인할 수 있는 모든 계정이 공유합니다.
begin;
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  category text not null check (category in ('사무용품','전자기기','생활용품','식품','기타')),
  quantity integer not null default 0 check (quantity between 0 and 1000000),
  minimum integer not null default 5 check (minimum between 0 and 1000000),
  price bigint not null default 0 check (price between 0 and 1000000000),
  created_at timestamptz not null default now()
);
alter table public.inventory_items enable row level security;
revoke all on public.inventory_items from anon;
grant select, insert, update, delete on public.inventory_items to authenticated;
drop policy if exists shared_inventory_authenticated on public.inventory_items;
create policy shared_inventory_authenticated on public.inventory_items
  for all to authenticated using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

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
commit;

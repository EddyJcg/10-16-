-- supabase/item-asset-classification.sql 및 supabase/user-admins.sql 실행 후에 실행하세요.
-- 분류설정(stock_product_classifications) 변경은 관리자만 가능하도록 DB에서 제한합니다.
-- auth.uid()가 없는 세션(대시보드, 서비스 롤)은 기존처럼 허용합니다.
begin;

create or replace function public.inventory_admin_allowed()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.inventory_admins where user_id = auth.uid());
$$;
revoke all on function public.inventory_admin_allowed() from public,anon;
grant execute on function public.inventory_admin_allowed() to authenticated;

create or replace function public.guard_stock_product_classification_admin()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.inventory_admin_allowed() then
    raise exception 'CLASSIFICATION_ADMIN_REQUIRED' using errcode='42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.guard_stock_product_classification_admin() from public,anon,authenticated;

drop trigger if exists guard_stock_product_classification_admin on public.stock_product_classifications;
create trigger guard_stock_product_classification_admin
  before insert or update or delete on public.stock_product_classifications
  for each row execute function public.guard_stock_product_classification_admin();

commit;

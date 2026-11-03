-- Run after supabase/procurement-schema.sql and supabase/edit-records.sql.
begin;

create or replace function public.delete_stock_product(p_product_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_product public.stock_products%rowtype;
begin
  if not public.inventory_access_allowed() then raise exception 'ACCOUNT_DISABLED' using errcode='42501'; end if;
  select * into v_product from public.stock_products where id=p_product_id for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND' using errcode='P0002'; end if;
  if exists(select 1 from public.purchase_order_lines where product_id=p_product_id) then
    raise exception 'PRODUCT_USED_IN_PURCHASE' using errcode='22023';
  end if;
  if exists(select 1 from public.stock_movements where product_id=p_product_id) then
    raise exception 'PRODUCT_HAS_LEDGER_HISTORY' using errcode='22023';
  end if;
  delete from public.stock_products where id=p_product_id;
  return jsonb_build_object('id',v_product.id,'product_code',v_product.product_code);
end;
$$;
revoke all on function public.delete_stock_product(uuid) from public,anon;
grant execute on function public.delete_stock_product(uuid) to authenticated;

commit;

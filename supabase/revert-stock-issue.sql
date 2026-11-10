-- Run after supabase/fifo.sql and supabase/revert-stock-receipt.sql.
begin;

create or replace function public.revert_stock_issue(p_movement_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_movement public.stock_movements%rowtype;
  v_alloc record;
begin
  if not public.inventory_access_allowed() then raise exception 'ACCOUNT_DISABLED' using errcode='42501'; end if;
  if p_movement_id is null then raise exception 'INVALID_INPUT' using errcode='22023'; end if;
  select * into v_movement from public.stock_movements where id=p_movement_id;
  if not found then raise exception 'MOVEMENT_NOT_FOUND' using errcode='P0002'; end if;
  perform 1 from public.stock_products where id=v_movement.product_id for update;
  select * into v_movement from public.stock_movements where id=p_movement_id for update;
  if not found then raise exception 'MOVEMENT_NOT_FOUND' using errcode='P0002'; end if;
  if v_movement.kind<>'issue' then raise exception 'NOT_AN_ISSUE' using errcode='22023'; end if;

  for v_alloc in select lot_id,quantity from public.stock_allocations where issue_id=p_movement_id loop
    update public.stock_lots set remaining_quantity=remaining_quantity+v_alloc.quantity where id=v_alloc.lot_id;
  end loop;
  delete from public.stock_allocations where issue_id=p_movement_id;
  delete from public.stock_movements where id=p_movement_id;
  return jsonb_build_object('id',v_movement.id);
end;
$$;
revoke all on function public.revert_stock_issue(uuid) from public,anon;
grant execute on function public.revert_stock_issue(uuid) to authenticated;

commit;

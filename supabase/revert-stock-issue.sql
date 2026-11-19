-- Run after supabase/fifo.sql and supabase/revert-stock-receipt.sql.
begin;

create or replace function public.revert_stock_issue(p_movement_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_movement public.stock_movements%rowtype;
  v_alloc record;
  v_shipped integer;
  v_shipped_date date;
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
  if v_movement.sales_order_id is not null then
    select coalesce(sum(m.quantity),0),max(m.movement_date) into v_shipped,v_shipped_date
    from public.stock_movements m where m.sales_order_id=v_movement.sales_order_id;
    update public.sales_orders so set
      shipped_quantity=v_shipped,
      shipped_date=v_shipped_date,
      sales_status=case when v_shipped>0 and v_shipped>=so.quantity then '매출완료' else '매출미완료' end,
      sales_progress_status=case when so.sales_progress_status='중단' then '중단'
        when v_shipped>0 and v_shipped>=so.quantity then '완료' else '진행' end
    where so.id=v_movement.sales_order_id;
  end if;
  return jsonb_build_object('id',v_movement.id);
end;
$$;
revoke all on function public.revert_stock_issue(uuid) from public,anon;
grant execute on function public.revert_stock_issue(uuid) to authenticated;

commit;

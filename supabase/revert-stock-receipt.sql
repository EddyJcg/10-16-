-- Run after supabase/edit-records.sql and supabase/classification-procurement-workflow.sql.
begin;

create or replace function public.revert_stock_receipt(p_movement_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_movement public.stock_movements%rowtype;
  v_receipt public.purchase_order_receipts%rowtype;
  v_line public.purchase_order_lines%rowtype;
  v_order public.purchase_orders%rowtype;
  v_row public.stock_movements%rowtype;
  v_lot public.stock_lots%rowtype;
  v_left integer;
  v_take integer;
  v_amount numeric(24,2);
begin
  if not public.inventory_access_allowed() then raise exception 'ACCOUNT_DISABLED' using errcode='42501'; end if;
  if p_movement_id is null then raise exception 'INVALID_INPUT' using errcode='22023'; end if;
  select * into v_movement from public.stock_movements where id=p_movement_id;
  if not found then raise exception 'MOVEMENT_NOT_FOUND' using errcode='P0002'; end if;
  perform 1 from public.stock_products where id=v_movement.product_id for update;
  select * into v_movement from public.stock_movements where id=p_movement_id for update;
  if not found then raise exception 'MOVEMENT_NOT_FOUND' using errcode='P0002'; end if;
  if v_movement.kind<>'receipt' then raise exception 'NOT_A_RECEIPT' using errcode='22023'; end if;

  select * into v_receipt from public.purchase_order_receipts where stock_movement_id=p_movement_id for update;
  if found then
    select * into v_line from public.purchase_order_lines where id=v_receipt.purchase_order_line_id for update;
    select * into v_order from public.purchase_orders where id=v_line.purchase_order_id for update;
    delete from public.purchase_order_receipts where id=v_receipt.id;
  end if;

  delete from public.stock_allocations where issue_id in
    (select id from public.stock_movements where product_id=v_movement.product_id and kind='issue');
  delete from public.stock_lots where product_id=v_movement.product_id;
  delete from public.stock_movements where id=p_movement_id;

  for v_row in select * from public.stock_movements where product_id=v_movement.product_id
    order by movement_date,sequence_id for update loop
    if v_row.kind in ('opening','receipt') then
      insert into public.stock_lots(product_id,movement_id,received_date,quantity,remaining_quantity,unit_cost)
      values(v_movement.product_id,v_row.id,v_row.movement_date,v_row.quantity,v_row.quantity,v_row.unit_cost);
    else
      v_left:=v_row.quantity;v_amount:=0;
      for v_lot in select * from public.stock_lots
        where product_id=v_movement.product_id and remaining_quantity>0 and received_date<=v_row.movement_date
        order by received_date,id for update loop
        v_take:=least(v_left,v_lot.remaining_quantity);
        update public.stock_lots set remaining_quantity=remaining_quantity-v_take where id=v_lot.id;
        insert into public.stock_allocations(issue_id,lot_id,quantity,unit_cost,amount)
        values(v_row.id,v_lot.id,v_take,v_lot.unit_cost,v_take*v_lot.unit_cost);
        v_amount:=v_amount+v_take*v_lot.unit_cost;v_left:=v_left-v_take;
        exit when v_left=0;
      end loop;
      if v_left<>0 then raise exception 'INSUFFICIENT_STOCK'; end if;
      update public.stock_movements set amount=v_amount,unit_cost=round(v_amount/v_row.quantity,2) where id=v_row.id;
    end if;
  end loop;

  if v_receipt.id is not null then
    update public.purchase_order_lines set received_quantity=received_quantity-v_receipt.quantity
    where id=v_line.id and received_quantity>=v_receipt.quantity;
    if not found then raise exception 'PURCHASE_RECEIPT_STATE_MISMATCH' using errcode='22023'; end if;
    update public.purchase_orders po set status=case
      when po.status='취소' then po.status
      when not exists(select 1 from public.purchase_order_lines l where l.purchase_order_id=po.id and l.received_quantity>0) then '발주완료'
      when not exists(select 1 from public.purchase_order_lines l where l.purchase_order_id=po.id and l.received_quantity<l.quantity) then '입고완료'
      else '부분입고' end,updated_at=clock_timestamp()
    where po.id=v_order.id;
  end if;
  return jsonb_build_object('id',v_movement.id,'purchase_order_id',v_order.id,'purchase_order_line_id',v_line.id);
end;
$$;
revoke all on function public.revert_stock_receipt(uuid) from public,anon;
grant execute on function public.revert_stock_receipt(uuid) to authenticated;

commit;

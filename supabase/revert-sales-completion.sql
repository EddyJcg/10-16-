-- Run after supabase/sales-status-workflow.sql and supabase/revert-stock-issue.sql.
begin;

create or replace function public.guard_sales_order_progress_status()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_progress_status text;
  v_shipped integer;
  v_quantity integer;
  v_existing_issue boolean:=false;
begin
  if new.kind<>'issue' or new.sales_order_id is null then return new; end if;
  if tg_op='UPDATE' and new.sales_order_id=old.sales_order_id then
    v_existing_issue:=new.quantity<=old.quantity;
  end if;
  select so.sales_progress_status,so.shipped_quantity,so.quantity
    into v_progress_status,v_shipped,v_quantity
  from public.sales_orders so where so.id=new.sales_order_id for update;
  if not found then return new; end if;
  if v_progress_status='중단' and not v_existing_issue then
    raise exception 'SALES_ORDER_STOPPED' using errcode='22023';
  end if;
  if v_progress_status='완료' and not v_existing_issue then
    raise exception 'SALES_ORDER_QUANTITY_EXCEEDED' using errcode='22023';
  end if;
  if v_progress_status='진행' and v_shipped>0 and v_shipped>=v_quantity and not v_existing_issue then
    raise exception 'SALES_ORDER_COMPLETION_REVERTED' using errcode='22023';
  end if;
  return new;
end;
$$;

create or replace function public.revert_sales_order_completion(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_order public.sales_orders%rowtype;
begin
  if not public.inventory_access_allowed() then raise exception 'ACCOUNT_DISABLED' using errcode='42501'; end if;
  if p_order_id is null then raise exception 'INVALID_INPUT' using errcode='22023'; end if;
  select * into v_order from public.sales_orders where id=p_order_id for update;
  if not found then raise exception 'SALES_ORDER_NOT_FOUND' using errcode='P0002'; end if;
  if v_order.sales_progress_status<>'완료' then raise exception 'SALES_ORDER_NOT_COMPLETED' using errcode='22023'; end if;
  update public.sales_orders set sales_progress_status='진행', sales_status='매출미완료'
  where id=p_order_id returning * into v_order;
  return to_jsonb(v_order);
end;
$$;
revoke all on function public.guard_sales_order_progress_status() from public,anon,authenticated;
revoke all on function public.revert_sales_order_completion(uuid) from public,anon;
grant execute on function public.revert_sales_order_completion(uuid) to authenticated;

commit;

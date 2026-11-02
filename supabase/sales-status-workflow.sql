-- Run after supabase/fifo.sql, supabase/edit-records.sql, and supabase/sales-order-groups.sql.
begin;

alter table public.sales_orders add column if not exists sales_progress_status text;
update public.sales_orders
set sales_progress_status=case
  when sales_status='매출완료' then '완료'
  else '진행'
end
where sales_progress_status is null;
alter table public.sales_orders alter column sales_progress_status set default '진행';
alter table public.sales_orders alter column sales_progress_status set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.sales_orders'::regclass
      and conname='sales_orders_sales_progress_status_check'
  ) then
    alter table public.sales_orders add constraint sales_orders_sales_progress_status_check
      check (sales_progress_status in ('진행','완료','중단'));
  end if;
end;
$$;

create or replace function public.sync_sales_progress_status()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.shipped_quantity>=new.quantity then
    new.sales_progress_status:='완료';
    new.sales_status:='매출완료';
  elsif old.shipped_quantity>=old.quantity and old.sales_progress_status='완료' then
    new.sales_progress_status:='진행';
    new.sales_status:='매출미완료';
  end if;
  return new;
end;
$$;
drop trigger if exists sales_orders_sync_progress_status on public.sales_orders;
create trigger sales_orders_sync_progress_status
  before update of shipped_quantity,quantity on public.sales_orders
  for each row execute function public.sync_sales_progress_status();

create or replace function public.guard_sales_order_progress_status()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_progress_status text;
  v_existing_issue boolean:=false;
begin
  if new.kind<>'issue' or new.sales_order_id is null then return new; end if;
  if tg_op='UPDATE' and new.sales_order_id=old.sales_order_id then
    v_existing_issue:=new.quantity<=old.quantity;
  end if;
  select so.sales_progress_status into v_progress_status
  from public.sales_orders so where so.id=new.sales_order_id for update;
  if not found then return new; end if;
  if v_progress_status='중단' and not v_existing_issue then
    raise exception 'SALES_ORDER_STOPPED' using errcode='22023';
  end if;
  if v_progress_status='완료' and not v_existing_issue then
    raise exception 'SALES_ORDER_QUANTITY_EXCEEDED' using errcode='22023';
  end if;
  return new;
end;
$$;
drop trigger if exists stock_movements_guard_sales_progress on public.stock_movements;
create trigger stock_movements_guard_sales_progress
  before insert or update on public.stock_movements
  for each row execute function public.guard_sales_order_progress_status();

create or replace function public.set_sales_order_status(p_order_id uuid,p_sales_status text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_order public.sales_orders%rowtype;
begin
  if not public.inventory_access_allowed() then raise exception 'ACCOUNT_DISABLED' using errcode='42501'; end if;
  if p_sales_status is null or p_sales_status not in ('진행','완료','중단') then
    raise exception 'INVALID_SALES_STATUS' using errcode='22023';
  end if;
  select * into v_order from public.sales_orders where id=p_order_id for update;
  if not found then raise exception 'SALES_ORDER_NOT_FOUND' using errcode='P0002'; end if;
  if v_order.shipped_quantity>0 and p_sales_status='완료' and v_order.shipped_quantity<v_order.quantity then
    raise exception 'SALES_ORDER_HAS_SHIPMENTS' using errcode='22023';
  end if;
  if v_order.shipped_quantity>=v_order.quantity and p_sales_status<>'완료' then
    raise exception 'SHIPMENT_STATUS_LOCKED' using errcode='22023';
  end if;
  update public.sales_orders set
    sales_progress_status=p_sales_status,
    sales_status=case when p_sales_status='완료' then '매출완료' else '매출미완료' end
  where id=p_order_id returning * into v_order;
  return to_jsonb(v_order);
end;
$$;
revoke all on function public.sync_sales_progress_status() from public,anon,authenticated;
revoke all on function public.guard_sales_order_progress_status() from public,anon,authenticated;
revoke all on function public.set_sales_order_status(uuid,text) from public,anon;
grant execute on function public.set_sales_order_status(uuid,text) to authenticated;

commit;

-- Run after fifo.sql, item-asset-classification.sql and procurement-schema.sql.
begin;

do $$ begin
  if to_regclass('public.stock_product_classifications') is null
    or to_regclass('public.purchase_orders') is null
    or to_regclass('public.purchase_order_lines') is null
    or to_regprocedure('public.post_stock_movement(uuid,text,date,jsonb,integer,numeric)') is null then
    raise exception 'Run fifo.sql, item-asset-classification.sql and procurement-schema.sql first';
  end if;
end $$;

create table if not exists public.purchase_order_receipts (
  id uuid primary key default gen_random_uuid(),
  sequence_id bigint generated always as identity unique,
  request_id uuid not null unique,
  request_payload jsonb not null,
  purchase_order_line_id uuid not null references public.purchase_order_lines(id) on delete restrict,
  received_date date not null check (received_date >= date '1900-01-01'),
  quantity integer not null check (quantity between 1 and 1000000),
  unit_cost numeric(18,2) not null check (unit_cost between 0 and 1000000000),
  stock_movement_id uuid unique references public.stock_movements(id) on delete restrict,
  stock_tracked boolean not null,
  created_by uuid not null,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists purchase_order_receipts_line_date
  on public.purchase_order_receipts(purchase_order_line_id,received_date,sequence_id);
alter table public.purchase_order_receipts enable row level security;
revoke all on public.purchase_order_receipts from anon,authenticated;
grant select on public.purchase_order_receipts to authenticated;
drop policy if exists purchase_order_receipts_read on public.purchase_order_receipts;
create policy purchase_order_receipts_read on public.purchase_order_receipts
  for select to authenticated using ((select public.inventory_access_allowed()));

create or replace function public.apply_stock_product_movement_policy()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_quantity_disabled boolean; v_value_disabled boolean;
begin
  select coalesce(c.quantity_management_disabled,false),coalesce(c.value_management_disabled,false)
    into v_quantity_disabled,v_value_disabled
    from public.stock_products p left join public.stock_product_classifications c on c.id=p.classification_id
    where p.id=new.product_id;
  if not found then raise exception 'PRODUCT_NOT_FOUND' using errcode='P0002'; end if;
  if v_quantity_disabled or v_value_disabled then
    raise exception 'STOCK_LEDGER_DISABLED' using errcode='22023';
  end if;
  return new;
end;
$$;
revoke all on function public.apply_stock_product_movement_policy() from public,anon,authenticated;
drop trigger if exists stock_movement_classification_policy on public.stock_movements;
create trigger stock_movement_classification_policy before insert or update of product_id,unit_cost,amount
  on public.stock_movements for each row execute function public.apply_stock_product_movement_policy();

drop view if exists public.stock_aging;
drop view if exists public.stock_summary;
create view public.stock_summary with (security_invoker = true) as
with movements as (
  select m.product_id,
    coalesce(sum(m.quantity) filter(where m.kind='opening'),0) as opening_quantity,
    coalesce(sum(m.amount) filter(where m.kind='opening'),0) as opening_amount,
    coalesce(sum(m.quantity) filter(where m.kind='receipt'),0) as receipt_quantity,
    coalesce(sum(m.amount) filter(where m.kind='receipt'),0) as receipt_amount,
    coalesce(sum(m.quantity) filter(where m.kind='issue'),0) as issue_quantity,
    coalesce(sum(m.amount) filter(where m.kind='issue'),0) as issue_amount
  from public.stock_movements m
  join public.stock_products p on p.id=m.product_id
  left join public.stock_product_classifications c on c.id=p.classification_id
  where not coalesce(c.quantity_management_disabled,false)
    and not coalesce(c.value_management_disabled,false)
  group by m.product_id
), stock as (
  select l.product_id,sum(l.remaining_quantity) as stock_quantity,
    sum(l.remaining_quantity*l.unit_cost) as stock_amount
  from public.stock_lots l
  join public.stock_products p on p.id=l.product_id
  left join public.stock_product_classifications c on c.id=p.classification_id
  where not coalesce(c.quantity_management_disabled,false)
    and not coalesce(c.value_management_disabled,false)
  group by l.product_id
)
select p.id,p.product_category,p.product_code,p.product_name,p.specification,p.material,p.storage_location,p.supplier,p.created_at,
  case when coalesce(c.quantity_management_disabled,false) or coalesce(c.value_management_disabled,false) then 0 else coalesce(m.opening_quantity,0) end as opening_quantity,
  coalesce(m.opening_amount/nullif(m.opening_quantity,0),0) as opening_unit_cost,
  case when coalesce(c.quantity_management_disabled,false) or coalesce(c.value_management_disabled,false) then 0 else coalesce(m.opening_amount,0) end as opening_amount,
  case when coalesce(c.quantity_management_disabled,false) or coalesce(c.value_management_disabled,false) then 0 else coalesce(m.receipt_quantity,0) end as receipt_quantity,
  coalesce(m.receipt_amount/nullif(m.receipt_quantity,0),0) as receipt_unit_cost,
  case when coalesce(c.quantity_management_disabled,false) or coalesce(c.value_management_disabled,false) then 0 else coalesce(m.receipt_amount,0) end as receipt_amount,
  case when coalesce(c.quantity_management_disabled,false) or coalesce(c.value_management_disabled,false) then 0 else coalesce(m.issue_quantity,0) end as issue_quantity,
  coalesce(m.issue_amount/nullif(m.issue_quantity,0),0) as issue_unit_cost,
  case when coalesce(c.quantity_management_disabled,false) or coalesce(c.value_management_disabled,false) then 0 else coalesce(m.issue_amount,0) end as issue_amount,
  case when coalesce(c.quantity_management_disabled,false) or coalesce(c.value_management_disabled,false) then 0 else coalesce(s.stock_quantity,0) end as stock_quantity,
  case when coalesce(c.quantity_management_disabled,false) or coalesce(c.value_management_disabled,false) then 0::numeric else coalesce(s.stock_amount/nullif(s.stock_quantity,0),0) end as stock_unit_cost,
  case when coalesce(c.quantity_management_disabled,false) or coalesce(c.value_management_disabled,false) then 0::numeric else coalesce(s.stock_amount,0) end as stock_amount,
  p.color,p.unit,p.standard_stock_quantity,p.classification_id,c.name as classification_name,c.inventory_asset_type,
  coalesce(c.quantity_management_disabled,false) as quantity_management_disabled,
  coalesce(c.value_management_disabled,false) as value_management_disabled,
  coalesce(c.shortage_control_enabled,true) as shortage_control_enabled,
  coalesce(c.is_set_item,false) as is_set_item
from public.stock_products p
left join movements m on m.product_id=p.id
left join stock s on s.product_id=p.id
left join public.stock_product_classifications c on c.id=p.classification_id;
revoke all on public.stock_summary from anon;
grant select on public.stock_summary to authenticated;

create view public.stock_aging with (security_invoker = true) as
select l.id as lot_id,l.product_id,l.movement_id,m.sequence_id,m.movement_date::text as received_date,
  m.created_at as received_at,l.remaining_quantity,l.unit_cost,l.remaining_quantity*l.unit_cost as amount,
  p.product_category,p.product_code,p.product_name,p.specification,p.material,p.color,p.unit,p.storage_location,p.supplier,
  coalesce(c.quantity_management_disabled,false) as quantity_management_disabled
from public.stock_lots l
join public.stock_movements m on m.id=l.movement_id
join public.stock_products p on p.id=l.product_id
left join public.stock_product_classifications c on c.id=p.classification_id
where m.kind in ('opening','receipt')
  and not coalesce(c.quantity_management_disabled,false)
  and not coalesce(c.value_management_disabled,false);
revoke all on public.stock_aging from anon;
grant select on public.stock_aging to authenticated;

create or replace function public.create_purchase_order(
  p_order_number text,p_supplier text,p_order_date date,p_expected_date date,p_notes text,p_lines jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_order public.purchase_orders%rowtype;
  v_line jsonb;
  v_product public.stock_products%rowtype;
  v_count integer:=0;
  v_quantity integer;
  v_unit_cost numeric;
  v_expected_date date;
  v_order_number text;
  v_next_order_number integer;
  v_user_id uuid:=auth.uid();
begin
  if not public.inventory_access_allowed() or v_user_id is null then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
  if p_order_date is not null and p_order_date<(now() at time zone 'Asia/Seoul')::date then
    raise exception 'PURCHASE_ORDER_DATE_IN_PAST' using errcode='22023';
  end if;
  if char_length(coalesce(p_supplier,''))>120 or p_order_date is null or p_order_date<date '1900-01-01'
    or (p_expected_date is not null and p_expected_date<date '1900-01-01')
    or char_length(coalesce(p_notes,''))>2000 then
    raise exception 'INVALID_PURCHASE_ORDER' using errcode='22023';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) is distinct from 'array' then
    raise exception 'INVALID_PURCHASE_ORDER' using errcode='22023';
  end if;
  if jsonb_array_length(p_lines)<1 or jsonb_array_length(p_lines)>100 then
    raise exception 'INVALID_PURCHASE_ORDER' using errcode='22023';
  end if;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    if coalesce(v_line->>'product_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'INVALID_PURCHASE_ORDER_LINE' using errcode='22023';
    end if;
    v_quantity:=nullif(v_line->>'quantity','')::integer;
    v_unit_cost:=nullif(v_line->>'unit_cost','')::numeric;
    v_expected_date:=nullif(v_line->>'expected_date','')::date;
    if v_quantity is null or v_quantity not between 1 and 1000000
      or v_unit_cost is null or v_unit_cost not between 0 and 1000000000 or round(v_unit_cost,2)<>v_unit_cost
      or (v_expected_date is not null and v_expected_date<date '1900-01-01')
      or char_length(coalesce(v_line->>'notes',''))>1000 then
      raise exception 'INVALID_PURCHASE_ORDER_LINE' using errcode='22023';
    end if;
    select * into v_product from public.stock_products where id=(v_line->>'product_id')::uuid;
    if not found then raise exception 'PRODUCT_INFO_REQUIRED' using errcode='22023'; end if;
    v_count:=v_count+1;
  end loop;

  perform pg_advisory_xact_lock(hashtext('purchase-order-number'),hashtext(p_order_date::text));
  select coalesce(max(substring(order_number from 14)::integer),0)+1 into v_next_order_number
    from public.purchase_orders
    where order_number ~ ('^ISPO'||to_char(p_order_date,'YYYYMMDD')||'-[0-9]{4}$');
  if v_next_order_number>9999 then
    raise exception 'PURCHASE_ORDER_NUMBER_EXHAUSTED' using errcode='22023';
  end if;
  v_order_number:='ISPO'||to_char(p_order_date,'YYYYMMDD')||'-'||lpad(v_next_order_number::text,4,'0');
  insert into public.purchase_orders(order_number,supplier,order_date,expected_date,status,notes,created_by)
  values(v_order_number,trim(coalesce(p_supplier,'')),p_order_date,p_expected_date,'발주완료',trim(coalesce(p_notes,'')),v_user_id)
  returning * into v_order;
  v_count:=0;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_count:=v_count+1;
    insert into public.purchase_order_lines(purchase_order_id,line_number,product_id,quantity,unit_cost,expected_date,notes)
    values(v_order.id,v_count,(v_line->>'product_id')::uuid,(v_line->>'quantity')::integer,
      (v_line->>'unit_cost')::numeric,nullif(v_line->>'expected_date','')::date,trim(coalesce(v_line->>'notes','')));
  end loop;
  return to_jsonb(v_order);
exception
  when unique_violation then raise exception 'PURCHASE_ORDER_NUMBER_EXISTS' using errcode='23505';
end;
$$;
revoke all on function public.create_purchase_order(text,text,date,date,text,jsonb) from public,anon;
grant execute on function public.create_purchase_order(text,text,date,date,text,jsonb) to authenticated;

create or replace function public.receive_purchase_order_line(
  p_request_id uuid,p_line_id uuid,p_received_date date,p_quantity integer,p_unit_cost numeric
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_line public.purchase_order_lines%rowtype;
  v_order public.purchase_orders%rowtype;
  v_product public.stock_products%rowtype;
  v_quantity_disabled boolean;
  v_value_disabled boolean;
  v_payload jsonb;
  v_existing public.purchase_order_receipts%rowtype;
  v_movement jsonb;
  v_receipt public.purchase_order_receipts%rowtype;
  v_stock_tracked boolean;
  v_user_id uuid:=auth.uid();
begin
  if not public.inventory_access_allowed() or v_user_id is null then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
  if p_request_id is null or p_line_id is null or p_received_date is null or p_received_date<date '1900-01-01'
    or p_received_date>(now() at time zone 'Asia/Seoul')::date
    or p_quantity is null or p_quantity not between 1 and 1000000
    or p_unit_cost is null or p_unit_cost not between 0 and 1000000000 or round(p_unit_cost,2)<>p_unit_cost then
    raise exception 'INVALID_PURCHASE_RECEIPT' using errcode='22023';
  end if;
  v_payload:=jsonb_build_object('line_id',p_line_id,'received_date',p_received_date,'quantity',p_quantity,'unit_cost',p_unit_cost);
  select * into v_existing from public.purchase_order_receipts where request_id=p_request_id;
  if found then
    if v_existing.created_by<>v_user_id or v_existing.request_payload<>v_payload then raise exception 'REQUEST_ID_REUSED' using errcode='22023'; end if;
    return to_jsonb(v_existing)||jsonb_build_object('idempotent',true);
  end if;

  select * into v_line from public.purchase_order_lines where id=p_line_id for update;
  if not found then raise exception 'PURCHASE_ORDER_LINE_NOT_FOUND' using errcode='P0002'; end if;
  select * into v_order from public.purchase_orders where id=v_line.purchase_order_id for update;
  if v_order.status='취소' then raise exception 'PURCHASE_ORDER_CANCELLED' using errcode='22023'; end if;
  if v_line.received_quantity+p_quantity>v_line.quantity then raise exception 'PURCHASE_RECEIPT_EXCEEDS_ORDER' using errcode='22023'; end if;
  select * into v_product from public.stock_products where id=v_line.product_id;
  if not found then raise exception 'PRODUCT_INFO_REQUIRED' using errcode='22023'; end if;
  select coalesce(c.quantity_management_disabled,false),coalesce(c.value_management_disabled,false)
    into v_quantity_disabled,v_value_disabled
    from public.stock_products p left join public.stock_product_classifications c on c.id=p.classification_id
    where p.id=v_product.id;
  v_stock_tracked:=not v_quantity_disabled and not v_value_disabled;

  if v_stock_tracked then
    v_movement:=public.post_stock_movement(
      p_request_id,'receipt',p_received_date,
      jsonb_build_object('classification_id',v_product.classification_id,'product_category',v_product.product_category,
        'product_code',v_product.product_code,'product_name',v_product.product_name,'specification',v_product.specification,
        'material',v_product.material,'color',v_product.color,'unit',v_product.unit,
        'storage_location',v_product.storage_location,'supplier',coalesce(nullif(v_product.supplier,''),v_order.supplier)),
      p_quantity,p_unit_cost
    );
  end if;
  insert into public.purchase_order_receipts(request_id,request_payload,purchase_order_line_id,received_date,quantity,
    unit_cost,stock_movement_id,stock_tracked,created_by)
  values(p_request_id,v_payload,p_line_id,p_received_date,p_quantity,p_unit_cost,
    case when v_stock_tracked then (v_movement->>'id')::uuid else null end,v_stock_tracked,v_user_id)
  returning * into v_receipt;
  update public.purchase_order_lines set received_quantity=received_quantity+p_quantity where id=p_line_id returning * into v_line;
  update public.purchase_orders po set status=case
    when not exists(select 1 from public.purchase_order_lines l where l.purchase_order_id=po.id and l.received_quantity<l.quantity) then '입고완료'
    else '부분입고' end,updated_at=clock_timestamp()
  where po.id=v_order.id returning * into v_order;
  return jsonb_build_object('receipt',to_jsonb(v_receipt),'line',to_jsonb(v_line),'order',to_jsonb(v_order),'stock_tracked',v_stock_tracked);
end;
$$;
revoke all on function public.receive_purchase_order_line(uuid,uuid,date,integer,numeric) from public,anon;
grant execute on function public.receive_purchase_order_line(uuid,uuid,date,integer,numeric) to authenticated;

do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
    and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='purchase_order_receipts') then
      alter publication supabase_realtime add table public.purchase_order_receipts;
  end if;
end $$;
commit;

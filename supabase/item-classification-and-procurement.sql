-- supabase/fifo.sql 적용 후 실행하세요. 첨부된 품목자산분류등록 기준과 발주 확장용 DB를 추가합니다.
begin;

create table if not exists public.stock_product_classifications (
  product_asset_class text primary key check (char_length(trim(product_asset_class)) between 1 and 120),
  inventory_asset_type text not null check (inventory_asset_type in ('프로젝트 제품','원자재','소모자재','저장품','제품','상품')),
  stock_quantity_unmanaged boolean not null default false,
  stock_amount_unmanaged boolean not null default false,
  stock_shortage_control boolean not null default true,
  is_set_product boolean not null default false,
  lot_management_default integer not null default 0 check (lot_management_default between 0 and 1000000),
  sort_order integer not null default 0 check (sort_order between 0 and 999999),
  notes text not null default '' check (char_length(notes)<=2000),
  updated_at timestamptz not null default clock_timestamp()
);

insert into public.stock_product_classifications
  (product_asset_class,inventory_asset_type,stock_quantity_unmanaged,stock_amount_unmanaged,stock_shortage_control,is_set_product,lot_management_default,sort_order,notes)
values
  ('제품(장비)','프로젝트 제품',true,true,false,false,0,11,''),
  ('원자재(장비)','원자재',false,false,true,false,0,12,''),
  ('소모자재(전체)','소모자재',true,true,false,false,0,13,''),
  ('외주가공비_조립인건비(장비)','소모자재',true,true,false,false,0,14,''),
  ('외주가공비_전장인건비(장비)','소모자재',true,true,false,false,0,15,''),
  ('외주가공비_기타인건비(장비)','소모자재',true,true,false,false,0,16,''),
  ('외주가공비_PLC인건비(장비)','소모자재',true,true,false,false,0,17,''),
  ('외주가공비_설계인건비(장비)','소모자재',true,true,false,false,0,18,''),
  ('외주가공비_UMAC인건비(장비)','소모자재',true,true,false,false,0,19,''),
  ('기계설치비_항공료(장비)','소모자재',true,true,false,false,0,21,''),
  ('기계설치비_숙박비(장비)','소모자재',true,true,false,false,0,22,''),
  ('기계설치비_출장비(장비)','소모자재',true,true,false,false,0,23,''),
  ('기계설치비_기타(장비)','소모자재',true,true,false,false,0,24,''),
  ('포장비(장비)','소모자재',true,true,false,false,0,25,''),
  ('운반비_운송비(장비)','소모자재',true,true,false,false,0,26,''),
  ('운반비_도비비(장비)','소모자재',true,true,false,false,0,27,''),
  ('경상연구개발비','소모자재',true,true,false,false,0,28,''),
  ('운반비_특송비(장비)','소모자재',true,true,false,false,0,29,''),
  ('운반비_지게차(장비)','소모자재',true,true,false,false,0,30,''),
  ('팬텀자재(장비)','저장품',true,true,false,false,0,49,''),
  ('제품(비전)','프로젝트 제품',true,true,false,false,0,51,''),
  ('원자재(비전)','원자재',false,false,true,false,0,52,''),
  ('외주가공비_비전인건비(비전)','소모자재',true,true,false,false,0,53,''),
  ('제품(필름)','프로젝트 제품',true,true,false,false,0,61,''),
  ('원자재(필름)','원자재',false,false,true,false,0,62,''),
  ('포장자재(필름)','원자재',true,true,false,false,0,63,''),
  ('소모품(필름)','소모자재',true,true,false,false,0,64,''),
  ('운반비_운송비(필름)','소모자재',true,true,false,false,0,65,''),
  ('수선비(필름)','소모자재',true,true,false,false,0,66,''),
  ('제품(필름-재고)','제품',false,false,true,false,0,67,''),
  ('상품(장비)','상품',false,false,true,false,0,68,''),
  ('임가공(필름)','소모자재',true,true,false,false,0,69,''),
  ('설비개조(필름)','소모자재',true,true,false,false,0,70,''),
  ('운반비_운송비(비전)','소모자재',true,true,false,false,0,71,''),
  ('외주가공(필름)','소모자재',true,true,false,false,0,72,''),
  ('소모품(비전)','소모자재',true,true,false,false,0,73,''),
  ('포장자재(비전)','소모자재',true,true,false,false,0,73,''),
  ('운반비-지게차(비전)','소모자재',true,true,false,false,0,75,'')
on conflict(product_asset_class) do nothing;

alter table public.stock_products
  add column if not exists inventory_asset_type text not null default '상품' check (inventory_asset_type in ('프로젝트 제품','원자재','소모자재','저장품','제품','상품')),
  add column if not exists stock_quantity_unmanaged boolean not null default false,
  add column if not exists stock_amount_unmanaged boolean not null default false,
  add column if not exists stock_shortage_control boolean not null default true,
  add column if not exists is_set_product boolean not null default false,
  add column if not exists lot_management_default integer not null default 0 check (lot_management_default between 0 and 1000000),
  add column if not exists notes text not null default '' check (char_length(notes)<=2000);

update public.stock_products p set inventory_asset_type=c.inventory_asset_type,
  stock_quantity_unmanaged=c.stock_quantity_unmanaged,stock_amount_unmanaged=c.stock_amount_unmanaged,
  stock_shortage_control=c.stock_shortage_control,is_set_product=c.is_set_product,
  lot_management_default=c.lot_management_default,notes=c.notes
from public.stock_product_classifications c where c.product_asset_class=p.product_category;

alter table public.stock_product_classifications enable row level security;
revoke all on public.stock_product_classifications from anon,authenticated;
grant select on public.stock_product_classifications to authenticated;
drop policy if exists stock_product_classifications_read on public.stock_product_classifications;
create policy stock_product_classifications_read on public.stock_product_classifications
  for select to authenticated using ((select public.inventory_access_allowed()));

create or replace function public.register_stock_product(p_details jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_code text; v_standard_stock_quantity integer; v_classification public.stock_product_classifications%rowtype; v_product public.stock_products%rowtype;
begin
  if not public.inventory_access_allowed() then raise exception 'ACCOUNT_DISABLED' using errcode='42501'; end if;
  if p_details is null or jsonb_typeof(p_details)<>'object' then raise exception 'INVALID_PRODUCT_DETAILS'; end if;
  v_code:=upper(trim(p_details->>'product_code'));
  v_standard_stock_quantity:=case when p_details->>'standard_stock_quantity' ~ '^[0-9]{1,7}$' then (p_details->>'standard_stock_quantity')::integer else null end;
  select * into v_classification from public.stock_product_classifications where product_asset_class=trim(p_details->>'product_category');
  if not found or v_code is null or char_length(v_code) not between 1 and 80
    or coalesce(char_length(trim(p_details->>'product_name')),0) not between 1 and 120
    or char_length(coalesce(p_details->>'specification',''))>200 or char_length(coalesce(p_details->>'material',''))>120
    or char_length(coalesce(p_details->>'color',''))>120
    or coalesce(p_details->>'unit','') not in ('EA(개)','벌','Set(세트)','M','Cm','mm','Box','Kg','g','L','mL','봉','식')
    or v_standard_stock_quantity is null or v_standard_stock_quantity not between 1 and 1000000 then
    raise exception 'INVALID_PRODUCT_DETAILS';
  end if;
  insert into public.stock_products(product_category,product_code,product_name,specification,material,color,unit,standard_stock_quantity,
    inventory_asset_type,stock_quantity_unmanaged,stock_amount_unmanaged,stock_shortage_control,is_set_product,lot_management_default,notes)
  values(v_classification.product_asset_class,v_code,trim(p_details->>'product_name'),coalesce(p_details->>'specification',''),
    coalesce(p_details->>'material',''),coalesce(p_details->>'color',''),p_details->>'unit',v_standard_stock_quantity,
    v_classification.inventory_asset_type,v_classification.stock_quantity_unmanaged,v_classification.stock_amount_unmanaged,
    v_classification.stock_shortage_control,v_classification.is_set_product,v_classification.lot_management_default,v_classification.notes)
  on conflict(product_code) do nothing returning * into v_product;
  if not found then raise exception 'PRODUCT_CODE_ALREADY_EXISTS'; end if;
  return to_jsonb(v_product);
end;
$$;
revoke all on function public.register_stock_product(jsonb) from public,anon;
grant execute on function public.register_stock_product(jsonb) to authenticated;

create or replace function public.set_stock_product_classification_settings(p_settings jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_class text; v_classification public.stock_product_classifications%rowtype;
begin
  if not public.inventory_access_allowed() then raise exception 'ACCOUNT_DISABLED' using errcode='42501'; end if;
  if p_settings is null or jsonb_typeof(p_settings)<>'object' then raise exception 'INVALID_PRODUCT_CLASSIFICATION'; end if;
  v_class:=p_settings->>'product_asset_class';
  if v_class is null or jsonb_typeof(p_settings->'stock_quantity_unmanaged')<>'boolean'
    or jsonb_typeof(p_settings->'stock_amount_unmanaged')<>'boolean'
    or jsonb_typeof(p_settings->'stock_shortage_control')<>'boolean'
    or jsonb_typeof(p_settings->'is_set_product')<>'boolean'
    or coalesce(p_settings->>'inventory_asset_type','') not in ('프로젝트 제품','원자재','소모자재','저장품','제품','상품')
    or coalesce(p_settings->>'lot_management_default','') !~ '^[0-9]{1,7}$'
    or coalesce(p_settings->>'sort_order','') !~ '^[0-9]{1,6}$'
    or char_length(coalesce(p_settings->>'notes',''))>2000 then
    raise exception 'INVALID_PRODUCT_CLASSIFICATION' using errcode='22023';
  end if;
  update public.stock_product_classifications set inventory_asset_type=p_settings->>'inventory_asset_type',
    stock_quantity_unmanaged=(p_settings->>'stock_quantity_unmanaged')::boolean,stock_amount_unmanaged=(p_settings->>'stock_amount_unmanaged')::boolean,
    stock_shortage_control=(p_settings->>'stock_shortage_control')::boolean,is_set_product=(p_settings->>'is_set_product')::boolean,
    lot_management_default=(p_settings->>'lot_management_default')::integer,sort_order=(p_settings->>'sort_order')::integer,
    notes=coalesce(p_settings->>'notes',''),updated_at=clock_timestamp()
  where product_asset_class=v_class returning * into v_classification;
  if not found then raise exception 'PRODUCT_CLASSIFICATION_NOT_FOUND' using errcode='P0002'; end if;
  update public.stock_products set inventory_asset_type=v_classification.inventory_asset_type,
    stock_quantity_unmanaged=v_classification.stock_quantity_unmanaged,stock_amount_unmanaged=v_classification.stock_amount_unmanaged,
    stock_shortage_control=v_classification.stock_shortage_control,is_set_product=v_classification.is_set_product,
    lot_management_default=v_classification.lot_management_default,notes=v_classification.notes where product_category=v_class;
  return to_jsonb(v_classification);
end;
$$;
revoke all on function public.set_stock_product_classification_settings(jsonb) from public,anon;
grant execute on function public.set_stock_product_classification_settings(jsonb) to authenticated;

create or replace view public.stock_summary with (security_invoker=true) as
with movements as (
  select m.product_id,coalesce(sum(m.quantity) filter(where m.kind='opening' and not p.stock_quantity_unmanaged),0) as opening_quantity,
    coalesce(sum(m.amount) filter(where m.kind='opening' and not p.stock_amount_unmanaged),0) as opening_amount,
    coalesce(sum(m.quantity) filter(where m.kind='receipt' and not p.stock_quantity_unmanaged),0) as receipt_quantity,
    coalesce(sum(m.amount) filter(where m.kind='receipt' and not p.stock_amount_unmanaged),0) as receipt_amount,
    coalesce(sum(m.quantity) filter(where m.kind='issue' and not p.stock_quantity_unmanaged),0) as issue_quantity,
    coalesce(sum(m.amount) filter(where m.kind='issue' and not p.stock_amount_unmanaged),0) as issue_amount
  from public.stock_movements m join public.stock_products p on p.id=m.product_id group by m.product_id
), stock as (
  select l.product_id,sum(l.remaining_quantity) as stock_quantity,
    sum(case when p.stock_amount_unmanaged then 0 else l.remaining_quantity*l.unit_cost end) as stock_amount
  from public.stock_lots l join public.stock_products p on p.id=l.product_id where not p.stock_quantity_unmanaged group by l.product_id
)
select p.id,p.product_category,p.product_code,p.product_name,p.specification,p.material,p.storage_location,p.supplier,p.created_at,
  m.opening_quantity,coalesce(m.opening_amount/nullif(m.opening_quantity,0),0) as opening_unit_cost,m.opening_amount,
  m.receipt_quantity,coalesce(m.receipt_amount/nullif(m.receipt_quantity,0),0) as receipt_unit_cost,m.receipt_amount,
  m.issue_quantity,coalesce(m.issue_amount/nullif(m.issue_quantity,0),0) as issue_unit_cost,m.issue_amount,
  coalesce(s.stock_quantity,0) as stock_quantity,coalesce(s.stock_amount/nullif(s.stock_quantity,0),0) as stock_unit_cost,
  coalesce(s.stock_amount,0) as stock_amount,p.color,p.unit,p.standard_stock_quantity,p.product_category as product_asset_class,
  p.inventory_asset_type,p.stock_quantity_unmanaged,p.stock_amount_unmanaged,p.stock_shortage_control,p.is_set_product,p.lot_management_default,p.notes
from public.stock_products p left join movements m on m.product_id=p.id left join stock s on s.product_id=p.id;
revoke all on public.stock_summary from anon;
grant select on public.stock_summary to authenticated;

create or replace view public.stock_aging with (security_invoker=true) as
select l.id as lot_id,l.product_id,l.movement_id,m.sequence_id,m.movement_date::text as received_date,m.created_at as received_at,
  l.remaining_quantity,(case when p.stock_amount_unmanaged then 0 else l.unit_cost end)::numeric(18,2) as unit_cost,
  case when p.stock_amount_unmanaged then 0 else l.remaining_quantity*l.unit_cost end as amount,
  p.product_category,p.product_code,p.product_name,p.specification,p.material,p.color,p.unit,p.storage_location,p.supplier,
  p.product_category as product_asset_class,p.inventory_asset_type,p.stock_quantity_unmanaged,p.stock_amount_unmanaged,
  p.stock_shortage_control,p.is_set_product,p.lot_management_default,p.notes
from public.stock_lots l join public.stock_movements m on m.id=l.movement_id join public.stock_products p on p.id=l.product_id
where m.kind in ('opening','receipt') and not p.stock_quantity_unmanaged;
revoke all on public.stock_aging from anon;
grant select on public.stock_aging to authenticated;

create or replace view public.raw_material_ledger with (security_invoker=true) as
select m.id,m.sequence_id,m.request_id,m.product_id,p.product_code,p.product_name,p.specification,p.unit,p.product_category as product_asset_class,
  p.inventory_asset_type,m.kind,m.movement_date,case when p.stock_quantity_unmanaged then 0 else m.quantity end as quantity,
  case when p.stock_amount_unmanaged then 0 else m.unit_cost end as unit_cost,
  case when p.stock_amount_unmanaged then 0 else m.amount end as amount,
  p.stock_quantity_unmanaged,p.stock_amount_unmanaged,p.stock_shortage_control,p.is_set_product,p.lot_management_default,p.notes,m.created_by,m.created_at
from public.stock_movements m join public.stock_products p on p.id=m.product_id where p.inventory_asset_type='원자재';
revoke all on public.raw_material_ledger from anon;
grant select on public.raw_material_ledger to authenticated;

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),sequence_id bigint generated always as identity unique,
  order_number text not null unique check (char_length(trim(order_number)) between 1 and 80),
  supplier text not null default '' check (char_length(supplier)<=120),
  order_date date not null default ((now() at time zone 'Asia/Seoul')::date) check (order_date>=date '1900-01-01'),
  expected_date date check (expected_date is null or expected_date>=date '1900-01-01'),
  status text not null default '작성중' check (status in ('작성중','발주완료','부분입고','입고완료','취소')),
  notes text not null default '' check (char_length(notes)<=2000),created_by uuid not null,
  created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp()
);
create table if not exists public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),purchase_order_id uuid not null references public.purchase_orders(id) on delete restrict,
  line_number integer not null check (line_number>0),product_id uuid not null references public.stock_products(id),
  quantity integer not null check (quantity between 1 and 1000000),
  unit_cost numeric(18,2) check (unit_cost is null or unit_cost between 0 and 1000000000),
  received_quantity integer not null default 0 check (received_quantity between 0 and quantity),
  expected_date date check (expected_date is null or expected_date>=date '1900-01-01'),
  notes text not null default '' check (char_length(notes)<=1000),created_at timestamptz not null default clock_timestamp(),
  unique(purchase_order_id,line_number)
);
create index if not exists purchase_orders_status_date on public.purchase_orders(status,order_date desc,sequence_id desc);
create index if not exists purchase_order_lines_product on public.purchase_order_lines(product_id,purchase_order_id);
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_lines enable row level security;
revoke all on public.purchase_orders,public.purchase_order_lines from anon,authenticated;
grant select on public.purchase_orders,public.purchase_order_lines to authenticated;
drop policy if exists purchase_orders_read on public.purchase_orders;
create policy purchase_orders_read on public.purchase_orders for select to authenticated using ((select public.inventory_access_allowed()));
drop policy if exists purchase_order_lines_read on public.purchase_order_lines;
create policy purchase_order_lines_read on public.purchase_order_lines for select to authenticated using ((select public.inventory_access_allowed()));

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='stock_product_classifications') then alter publication supabase_realtime add table public.stock_product_classifications; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='purchase_orders') then alter publication supabase_realtime add table public.purchase_orders; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='purchase_order_lines') then alter publication supabase_realtime add table public.purchase_order_lines; end if;
end $$;
create or replace function public.post_stock_movement(
  p_request_id uuid,p_kind text,p_date date,p_details jsonb,p_quantity integer,p_unit_cost numeric default 0
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_product public.stock_products%rowtype;
  v_existing public.stock_movements%rowtype;
  v_lot public.stock_lots%rowtype;
  v_payload jsonb;
  v_id uuid;
  v_code text;
  v_left integer;
  v_take integer;
  v_amount numeric(24,2) := 0;
  v_last_date date;
  v_sales_order_id uuid;
  v_sales_order public.sales_orders%rowtype;
begin
  if not public.inventory_access_allowed() then raise exception 'ACCOUNT_DISABLED' using errcode='42501'; end if;
  if p_request_id is null or p_kind is null or p_kind not in ('opening','receipt','issue') or p_date is null
    or p_date < date '1900-01-01' or p_date > (now() at time zone 'Asia/Seoul')::date
    or p_quantity is null or p_quantity not between 1 and 1000000
    or p_unit_cost is null or p_unit_cost < 0 or p_unit_cost > 1000000000 or p_unit_cost <> round(p_unit_cost,2)
    or p_details is null or jsonb_typeof(p_details) <> 'object' then
    raise exception 'INVALID_INPUT' using errcode='22023';
  end if;
  v_code := upper(trim(p_details->>'product_code'));
  if v_code is null or char_length(v_code) not between 1 and 80 then raise exception 'INVALID_PRODUCT_CODE'; end if;
  begin
    v_sales_order_id := nullif(p_details->>'sales_order_id','')::uuid;
  exception when invalid_text_representation then
    raise exception 'INVALID_SALES_ORDER_LINK' using errcode='22023';
  end;
  if v_sales_order_id is not null and p_kind<>'issue' then raise exception 'INVALID_SALES_ORDER_LINK' using errcode='22023'; end if;
  v_payload := jsonb_build_object('kind',p_kind,'date',p_date,'details',p_details,'quantity',p_quantity,'unit_cost',p_unit_cost);
  select * into v_existing from public.stock_movements where request_id=p_request_id;
  if found then
    if v_existing.created_by <> auth.uid() or v_existing.request_payload <> v_payload then raise exception 'REQUEST_CONFLICT'; end if;
    return to_jsonb(v_existing);
  end if;
  if p_kind <> 'issue' then
    if coalesce(char_length(trim(p_details->>'product_category')),0) not between 1 and 80
      or coalesce(char_length(trim(p_details->>'product_name')),0) not between 1 and 120
      or char_length(coalesce(p_details->>'specification','')) > 200
      or char_length(coalesce(p_details->>'material','')) > 120
      or char_length(coalesce(p_details->>'color','')) > 120
      or coalesce(p_details->>'unit','') not in ('EA(개)','벌','Set(세트)','M','Cm','mm','Box','Kg','g','L','mL','봉','식')
      or char_length(coalesce(p_details->>'storage_location','')) > 120
      or char_length(coalesce(p_details->>'supplier','')) > 120 then raise exception 'INVALID_PRODUCT_DETAILS'; end if;
  end if;
  -- 같은 품목의 입출고를 직렬 처리합니다. 부족하면 함수 전체가 롤백됩니다.
  select * into v_product from public.stock_products where product_code=v_code for update;
  if not found then
    if p_kind <> 'issue' then raise exception 'PRODUCT_INFO_REQUIRED'; end if;
    raise exception 'PRODUCT_NOT_FOUND';
  end if;
  select * into v_existing from public.stock_movements where request_id=p_request_id;
  if found then
    if v_existing.created_by <> auth.uid() or v_existing.request_payload <> v_payload then raise exception 'REQUEST_CONFLICT'; end if;
    return to_jsonb(v_existing);
  end if;
  if p_kind <> 'issue' and (
    v_product.product_category <> trim(p_details->>'product_category') or v_product.product_name <> trim(p_details->>'product_name')
    or v_product.specification <> coalesce(p_details->>'specification','') or v_product.material <> coalesce(p_details->>'material','')
    or v_product.color <> coalesce(p_details->>'color','')
    or (v_product.storage_location <> '' and v_product.storage_location <> coalesce(p_details->>'storage_location',''))
    or (v_product.supplier <> '' and v_product.supplier <> coalesce(p_details->>'supplier',''))
  ) then raise exception 'PRODUCT_DETAILS_CONFLICT'; end if;
  if v_product.unit <> coalesce(p_details->>'unit','') then raise exception 'PRODUCT_DETAILS_CONFLICT'; end if;
  if v_sales_order_id is not null then
    select * into v_sales_order from public.sales_orders where id=v_sales_order_id for update;
    if not found then raise exception 'SALES_ORDER_NOT_FOUND' using errcode='P0002'; end if;
    if trim(v_sales_order.product_name)<>trim(v_product.product_name)
      or trim(v_sales_order.specification)<>trim(v_product.specification)
      or v_sales_order.unit<>v_product.unit then raise exception 'SALES_ORDER_PRODUCT_MISMATCH' using errcode='22023'; end if;
    if v_sales_order.shipped_quantity+p_quantity>v_sales_order.quantity
      or v_sales_order.sales_status='매출완료' then raise exception 'SALES_ORDER_QUANTITY_EXCEEDED' using errcode='22023'; end if;
  end if;
  if p_kind <> 'issue' then
    update public.stock_products
    set storage_location=case when storage_location='' then coalesce(p_details->>'storage_location','') else storage_location end,
      supplier=case when supplier='' then coalesce(p_details->>'supplier','') else supplier end
    where id=v_product.id returning * into v_product;
  end if;
  if p_kind='opening' and exists(select 1 from public.stock_movements where product_id=v_product.id) then raise exception 'OPENING_ALREADY_STARTED'; end if;
  -- 이미 확정한 출고의 원가를 바꿀 수 있는 과거 입고는 허용하지 않습니다.
  select max(movement_date) into v_last_date from public.stock_movements
    where product_id=v_product.id and (p_kind='issue' or kind='issue');
  if p_date < v_last_date then raise exception 'BACKDATE_CONFLICT'; end if;
  if p_kind='issue' and not v_product.stock_quantity_unmanaged and v_product.stock_shortage_control
    and coalesce((select sum(remaining_quantity) from public.stock_lots where product_id=v_product.id and received_date<=p_date),0) < p_quantity then
    raise exception 'INSUFFICIENT_STOCK';
  end if;
  insert into public.stock_movements(request_id,request_payload,product_id,kind,movement_date,quantity,unit_cost,amount,sales_order_id,created_by)
  values(p_request_id,v_payload,v_product.id,p_kind,p_date,p_quantity,
    case when p_kind='issue' or v_product.stock_amount_unmanaged then 0 else p_unit_cost end,
    case when p_kind='issue' or v_product.stock_amount_unmanaged then 0 else p_quantity*p_unit_cost end,
    v_sales_order_id,auth.uid()) returning id into v_id;
  if p_kind in ('opening','receipt') and not v_product.stock_quantity_unmanaged then
    insert into public.stock_lots(product_id,movement_id,received_date,quantity,remaining_quantity,unit_cost)
    values(v_product.id,v_id,p_date,p_quantity,p_quantity,case when v_product.stock_amount_unmanaged then 0 else p_unit_cost end);
  elsif p_kind='issue' and not v_product.stock_quantity_unmanaged then
    v_left := p_quantity;
    for v_lot in select * from public.stock_lots where product_id=v_product.id and remaining_quantity>0 and received_date<=p_date order by received_date,id for update loop
      v_take := least(v_left,v_lot.remaining_quantity);
      update public.stock_lots set remaining_quantity=remaining_quantity-v_take where id=v_lot.id;
      insert into public.stock_allocations(issue_id,lot_id,quantity,unit_cost,amount)
      values(v_id,v_lot.id,v_take,case when v_product.stock_amount_unmanaged then 0 else v_lot.unit_cost end,
        case when v_product.stock_amount_unmanaged then 0 else v_take*v_lot.unit_cost end);
      if not v_product.stock_amount_unmanaged then v_amount := v_amount + v_take*v_lot.unit_cost; end if;
      v_left := v_left-v_take;
      exit when v_left=0;
    end loop;
    if v_left<>0 and v_product.stock_shortage_control then raise exception 'INSUFFICIENT_STOCK'; end if;
    update public.stock_movements set amount=v_amount,unit_cost=round(v_amount/p_quantity,2) where id=v_id;
  end if;
  if p_kind='issue' and v_sales_order_id is not null then
    update public.sales_orders set shipped_quantity=shipped_quantity+p_quantity,
      shipped_date=greatest(shipped_date,p_date),
      sales_status=case when shipped_quantity+p_quantity>=quantity then '매출완료' else '매출미완료' end
      where id=v_sales_order_id;
  end if;
  select * into v_existing from public.stock_movements where id=v_id;
  return to_jsonb(v_existing);
end;
$$;
revoke all on function public.post_stock_movement(uuid,text,date,jsonb,integer,numeric) from public, anon;
grant execute on function public.post_stock_movement(uuid,text,date,jsonb,integer,numeric) to authenticated;

commit;

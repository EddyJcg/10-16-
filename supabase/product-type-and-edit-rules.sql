-- Run after supabase/edit-records.sql, supabase/product-info-controls.sql,
-- supabase/item-master-classification-enforcement.sql and procurement-schema.sql.
begin;

alter table public.stock_products
  add column if not exists product_type text not null default '';
alter table public.stock_products drop constraint if exists stock_products_product_type_length;
alter table public.stock_products add constraint stock_products_product_type_length
  check (char_length(product_type)<=120);

create table if not exists public.input_box_settings(
  box_key text primary key,
  title text not null,
  apply_to_existing boolean not null,
  decided_by uuid,
  decided_at timestamptz not null default now()
);
alter table public.input_box_settings enable row level security;
drop policy if exists input_box_settings_read on public.input_box_settings;
create policy input_box_settings_read on public.input_box_settings
  for select to authenticated using ((select public.inventory_access_allowed()));
revoke all on public.input_box_settings from public,anon,authenticated;
grant select on public.input_box_settings to authenticated;

-- A product counts as processed once it is used by stock movements, purchase
-- order lines, or a sales order linked to it by product_id.
create or replace function public.stock_product_is_processed(p_product_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  return exists(select 1 from public.stock_movements m where m.product_id=p_product_id)
    or exists(select 1 from public.purchase_order_lines l where l.product_id=p_product_id)
    or exists(select 1 from public.sales_orders so where so.product_id=p_product_id);
end;
$$;
revoke all on function public.stock_product_is_processed(uuid) from public,anon;
grant execute on function public.stock_product_is_processed(uuid) to authenticated;

create or replace function public.enforce_stock_product_info_rules()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.created_by is distinct from old.created_by
    or new.created_by_name is distinct from old.created_by_name then
    raise exception 'PRODUCT_INFO_ALREADY_ASSIGNED' using errcode='22023';
  end if;
  if (new.product_code is distinct from old.product_code
    or new.product_name is distinct from old.product_name
    or new.specification is distinct from old.specification
    or new.color is distinct from old.color
    or new.unit is distinct from old.unit
    or new.product_category is distinct from old.product_category
    or new.classification_id is distinct from old.classification_id)
    and public.stock_product_is_processed(old.id) then
    raise exception 'PRODUCT_INFO_ALREADY_ASSIGNED' using errcode='22023';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_stock_product_info_rules() from public,anon,authenticated;

create or replace function public.register_stock_product(p_details jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_code text;
  v_standard_stock_quantity integer;
  v_classification_id uuid;
  v_class public.stock_product_classifications%rowtype;
  v_product public.stock_products%rowtype;
begin
  if not public.inventory_access_allowed() then raise exception 'ACCOUNT_DISABLED' using errcode='42501'; end if;
  if p_details is null or jsonb_typeof(p_details)<>'object' then raise exception 'INVALID_PRODUCT_DETAILS'; end if;
  v_code:=upper(trim(p_details->>'product_code'));
  v_standard_stock_quantity:=case
    when p_details->>'standard_stock_quantity' ~ '^[0-9]{1,7}$' then (p_details->>'standard_stock_quantity')::integer
    else null end;
  begin v_classification_id:=nullif(p_details->>'classification_id','')::uuid;
  exception when invalid_text_representation then raise exception 'PRODUCT_CLASSIFICATION_REQUIRED' using errcode='22023'; end;
  if v_classification_id is null then raise exception 'PRODUCT_CLASSIFICATION_REQUIRED' using errcode='22023'; end if;
  select * into v_class from public.stock_product_classifications
    where id=v_classification_id and is_active for share;
  if not found then raise exception 'PRODUCT_CLASSIFICATION_REQUIRED' using errcode='22023'; end if;
  if v_class.inventory_asset_type is null then raise exception 'PRODUCT_CLASSIFICATION_TYPE_REQUIRED' using errcode='22023'; end if;
  if nullif(trim(coalesce(p_details->>'product_category','')),'') is not null
    and trim(p_details->>'product_category')<>v_class.name then
    raise exception 'PRODUCT_CLASSIFICATION_REQUIRED' using errcode='22023';
  end if;
  if v_code is null or char_length(v_code) not between 1 and 80
    or char_length(trim(coalesce(p_details->>'product_name',''))) not between 1 and 120
    or char_length(coalesce(p_details->>'specification',''))>200
    or char_length(coalesce(p_details->>'material',''))>120
    or char_length(coalesce(p_details->>'color',''))>120
    or char_length(trim(coalesce(p_details->>'product_type','')))>120
    or coalesce(p_details->>'unit','') not in ('EA(개)','벌','Set(세트)','M','Cm','mm','Box','Kg','g','L','mL','봉','식')
    or v_standard_stock_quantity is null or v_standard_stock_quantity not between 1 and 1000000 then
    raise exception 'INVALID_PRODUCT_DETAILS' using errcode='22023';
  end if;
  insert into public.stock_products
    (classification_id,product_category,product_code,product_name,specification,material,color,unit,standard_stock_quantity,product_type)
  values
    (v_class.id,v_class.name,v_code,trim(p_details->>'product_name'),coalesce(p_details->>'specification',''),
      coalesce(p_details->>'material',''),coalesce(p_details->>'color',''),p_details->>'unit',v_standard_stock_quantity,
      trim(coalesce(p_details->>'product_type','')))
  on conflict (product_code) do nothing returning * into v_product;
  if not found then raise exception 'PRODUCT_CODE_ALREADY_EXISTS' using errcode='23505'; end if;
  return to_jsonb(v_product);
end;
$$;
revoke all on function public.register_stock_product(jsonb) from public,anon;
grant execute on function public.register_stock_product(jsonb) to authenticated;

create or replace function public.update_stock_product(p_product_id uuid,p_details jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_product public.stock_products%rowtype;
  v_classification public.stock_product_classifications%rowtype;
  v_code text;
  v_standard_stock_quantity integer;
  v_classification_id uuid;
begin
  if not public.inventory_access_allowed() then raise exception 'ACCOUNT_DISABLED' using errcode='42501'; end if;
  if p_details is null or jsonb_typeof(p_details)<>'object' then raise exception 'INVALID_PRODUCT_DETAILS'; end if;
  v_code:=upper(trim(p_details->>'product_code'));
  v_standard_stock_quantity:=case when p_details->>'standard_stock_quantity' ~ '^[0-9]{1,7}$'
    then (p_details->>'standard_stock_quantity')::integer else null end;
  begin
    v_classification_id:=nullif(p_details->>'classification_id','')::uuid;
  exception when invalid_text_representation then
    raise exception 'PRODUCT_CLASSIFICATION_REQUIRED' using errcode='22023';
  end;
  if v_code is null or char_length(v_code) not between 1 and 80
    or coalesce(char_length(trim(p_details->>'product_name')),0) not between 1 and 120
    or char_length(coalesce(p_details->>'specification',''))>200
    or char_length(coalesce(p_details->>'material',''))>120
    or char_length(coalesce(p_details->>'color',''))>120
    or char_length(trim(coalesce(p_details->>'product_type','')))>120
    or p_details->>'unit' not in ('EA(개)','벌','Set(세트)','M','Cm','mm','Box','Kg','g','L','mL','봉','식')
    or v_standard_stock_quantity is null or v_standard_stock_quantity not between 1 and 1000000 then
    raise exception 'INVALID_PRODUCT_DETAILS' using errcode='22023';
  end if;
  select * into v_classification from public.stock_product_classifications
    where id=v_classification_id and is_active for share;
  if not found or v_classification.inventory_asset_type is null then
    raise exception 'PRODUCT_CLASSIFICATION_TYPE_REQUIRED' using errcode='22023';
  end if;
  select * into v_product from public.stock_products where id=p_product_id for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND' using errcode='P0002'; end if;
  update public.stock_products set
    product_category=v_classification.name,classification_id=v_classification.id,product_code=v_code,
    product_name=trim(p_details->>'product_name'),specification=coalesce(p_details->>'specification',''),
    material=coalesce(p_details->>'material',''),color=coalesce(p_details->>'color',''),
    unit=p_details->>'unit',standard_stock_quantity=v_standard_stock_quantity,
    product_type=trim(coalesce(p_details->>'product_type',''))
  where id=p_product_id returning * into v_product;
  if not found then raise exception 'PRODUCT_NOT_FOUND' using errcode='P0002'; end if;
  return to_jsonb(v_product);
end;
$$;
revoke all on function public.update_stock_product(uuid,jsonb) from public,anon;
grant execute on function public.update_stock_product(uuid,jsonb) to authenticated;

create or replace view public.stock_summary with (security_invoker = true) as
with movements as (
  select product_id,
    coalesce(sum(quantity) filter(where kind='opening'),0) as opening_quantity,
    coalesce(sum(amount) filter(where kind='opening'),0) as opening_amount,
    coalesce(sum(quantity) filter(where kind='receipt'),0) as receipt_quantity,
    coalesce(sum(amount) filter(where kind='receipt'),0) as receipt_amount,
    coalesce(sum(quantity) filter(where kind='issue'),0) as issue_quantity,
    coalesce(sum(amount) filter(where kind='issue'),0) as issue_amount
  from public.stock_movements group by product_id
), stock as (
  select product_id,sum(remaining_quantity) as stock_quantity,sum(remaining_quantity*unit_cost) as stock_amount
  from public.stock_lots group by product_id
)
select p.id,p.product_category,p.product_code,p.product_name,p.specification,p.material,p.storage_location,p.supplier,p.created_at,
  m.opening_quantity,coalesce(m.opening_amount/nullif(m.opening_quantity,0),0) as opening_unit_cost,m.opening_amount,
  m.receipt_quantity,coalesce(m.receipt_amount/nullif(m.receipt_quantity,0),0) as receipt_unit_cost,m.receipt_amount,
  m.issue_quantity,coalesce(m.issue_amount/nullif(m.issue_quantity,0),0) as issue_unit_cost,m.issue_amount,
  coalesce(s.stock_quantity,0) as stock_quantity,
  case when coalesce(c.value_management_disabled,false) then 0::numeric else coalesce(s.stock_amount/nullif(s.stock_quantity,0),0) end as stock_unit_cost,
  case when coalesce(c.value_management_disabled,false) then 0::numeric else coalesce(s.stock_amount,0) end as stock_amount,
  p.color,p.unit,p.standard_stock_quantity,
  p.classification_id,c.name as classification_name,c.inventory_asset_type,
  coalesce(c.quantity_management_disabled,false) as quantity_management_disabled,
  coalesce(c.value_management_disabled,false) as value_management_disabled,
  coalesce(c.shortage_control_enabled,true) as shortage_control_enabled,
  coalesce(c.is_set_item,false) as is_set_item,
  p.created_by_name,p.product_type
from public.stock_products p left join movements m on m.product_id=p.id
  left join stock s on s.product_id=p.id left join public.stock_product_classifications c on c.id=p.classification_id;
revoke all on public.stock_summary from anon;
grant select on public.stock_summary to authenticated;

create or replace function public.set_input_box_setting(p_box_key text,p_title text,p_apply_to_existing boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_row public.input_box_settings%rowtype;
begin
  if not public.inventory_access_allowed() then raise exception 'ACCOUNT_DISABLED' using errcode='42501'; end if;
  if p_box_key is null or p_box_key !~ '^[a-z_]{1,40}$'
    or p_title is null or char_length(trim(p_title)) not between 1 and 40
    or p_apply_to_existing is null then
    raise exception 'INVALID_INPUT_BOX' using errcode='22023';
  end if;
  insert into public.input_box_settings(box_key,title,apply_to_existing,decided_by)
  values(p_box_key,trim(p_title),p_apply_to_existing,auth.uid())
  on conflict (box_key) do nothing returning * into v_row;
  if not found then select * into v_row from public.input_box_settings where box_key=p_box_key; end if;
  return to_jsonb(v_row);
end;
$$;
revoke all on function public.set_input_box_setting(text,text,boolean) from public,anon;
grant execute on function public.set_input_box_setting(text,text,boolean) to authenticated;

-- 처리 데이터(수불부·재고 로트·수주·발주 라인)에도 품번의 제품유형을 보관합니다.
alter table public.stock_movements add column if not exists product_type text not null default ''
  check (char_length(product_type)<=120);
alter table public.stock_lots add column if not exists product_type text not null default ''
  check (char_length(product_type)<=120);
alter table public.sales_orders add column if not exists product_type text not null default ''
  check (char_length(product_type)<=120);
alter table public.purchase_order_lines add column if not exists product_type text not null default ''
  check (char_length(product_type)<=120);

update public.stock_movements t set product_type=p.product_type
  from public.stock_products p where p.id=t.product_id and t.product_type is distinct from p.product_type;
update public.stock_lots t set product_type=p.product_type
  from public.stock_products p where p.id=t.product_id and t.product_type is distinct from p.product_type;
update public.sales_orders t set product_type=p.product_type
  from public.stock_products p where p.id=t.product_id and t.product_type is distinct from p.product_type;
update public.purchase_order_lines t set product_type=p.product_type
  from public.stock_products p where p.id=t.product_id and t.product_type is distinct from p.product_type;

-- 새로 저장되는 처리 데이터는 연결된 품번의 제품유형을 자동으로 따릅니다.
create or replace function public.sync_processed_product_type()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.product_type:=coalesce((select p.product_type from public.stock_products p where p.id=new.product_id),'');
  return new;
end;
$$;
revoke all on function public.sync_processed_product_type() from public,anon,authenticated;

drop trigger if exists stock_movements_sync_product_type on public.stock_movements;
create trigger stock_movements_sync_product_type before insert or update on public.stock_movements
  for each row execute function public.sync_processed_product_type();
drop trigger if exists stock_lots_sync_product_type on public.stock_lots;
create trigger stock_lots_sync_product_type before insert or update on public.stock_lots
  for each row execute function public.sync_processed_product_type();
drop trigger if exists sales_orders_sync_product_type on public.sales_orders;
create trigger sales_orders_sync_product_type before insert or update on public.sales_orders
  for each row execute function public.sync_processed_product_type();
drop trigger if exists purchase_order_lines_sync_product_type on public.purchase_order_lines;
create trigger purchase_order_lines_sync_product_type before insert or update on public.purchase_order_lines
  for each row execute function public.sync_processed_product_type();

-- 품목 수정으로 제품유형이 바뀌면 같은 품번의 기존 처리 데이터에도 반영합니다.
create or replace function public.propagate_stock_product_type()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.stock_movements set product_type=new.product_type where product_id=new.id;
  update public.stock_lots set product_type=new.product_type where product_id=new.id;
  update public.sales_orders set product_type=new.product_type where product_id=new.id;
  update public.purchase_order_lines set product_type=new.product_type where product_id=new.id;
  return null;
end;
$$;
revoke all on function public.propagate_stock_product_type() from public,anon,authenticated;

drop trigger if exists stock_product_type_propagate on public.stock_products;
create trigger stock_product_type_propagate after update of product_type on public.stock_products
  for each row when (old.product_type is distinct from new.product_type)
  execute function public.propagate_stock_product_type();

commit;

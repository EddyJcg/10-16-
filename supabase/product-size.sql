-- Run after supabase/product-type-and-edit-rules.sql.
begin;

alter table public.stock_products
  add column if not exists size text not null default '';
alter table public.stock_products drop constraint if exists stock_products_size_length;
alter table public.stock_products add constraint stock_products_size_length
  check (char_length(size)<=120);

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
    or char_length(trim(coalesce(p_details->>'size','')))>120
    or coalesce(p_details->>'unit','') not in ('EA(개)','벌','Set(세트)','M','Cm','mm','Box','Kg','g','L','mL','봉','식')
    or v_standard_stock_quantity is null or v_standard_stock_quantity not between 0 and 1000 then
    raise exception 'INVALID_PRODUCT_DETAILS' using errcode='22023';
  end if;
  insert into public.stock_products
    (classification_id,product_category,product_code,product_name,specification,material,color,unit,standard_stock_quantity,product_type,size)
  values
    (v_class.id,v_class.name,v_code,trim(p_details->>'product_name'),coalesce(p_details->>'specification',''),
      coalesce(p_details->>'material',''),coalesce(p_details->>'color',''),p_details->>'unit',v_standard_stock_quantity,
      trim(coalesce(p_details->>'product_type','')),trim(coalesce(p_details->>'size','')))
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
    or char_length(trim(coalesce(p_details->>'size','')))>120
    or p_details->>'unit' not in ('EA(개)','벌','Set(세트)','M','Cm','mm','Box','Kg','g','L','mL','봉','식')
    or v_standard_stock_quantity is null or v_standard_stock_quantity not between 0 and 1000 then
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
    product_type=trim(coalesce(p_details->>'product_type','')),size=trim(coalesce(p_details->>'size',''))
  where id=p_product_id returning * into v_product;
  if not found then raise exception 'PRODUCT_NOT_FOUND' using errcode='P0002'; end if;
  return to_jsonb(v_product);
end;
$$;
revoke all on function public.update_stock_product(uuid,jsonb) from public,anon;
grant execute on function public.update_stock_product(uuid,jsonb) to authenticated;

-- size is appended as the last column because create or replace view cannot reorder existing columns.
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
  p.created_by_name,p.product_type,p.size
from public.stock_products p left join movements m on m.product_id=p.id
  left join stock s on s.product_id=p.id left join public.stock_product_classifications c on c.id=p.classification_id;
revoke all on public.stock_summary from anon;
grant select on public.stock_summary to authenticated;

commit;

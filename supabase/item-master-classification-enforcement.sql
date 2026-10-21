-- Run after fifo.sql, item-asset-classification.sql, and procurement-schema.sql.
-- Product master rows store only their selected classification ID. Inventory
-- policies are always read from stock_product_classifications.
begin;

create or replace function public.fill_stock_product_classification()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_class public.stock_product_classifications%rowtype;
begin
  if new.classification_id is null then
    select * into v_class from public.stock_product_classifications
      where lower(btrim(name))=lower(btrim(new.product_category)) and is_active;
  else
    select * into v_class from public.stock_product_classifications
      where id=new.classification_id and is_active;
  end if;
  if not found or v_class.name<>trim(new.product_category) then
    raise exception 'PRODUCT_CLASSIFICATION_REQUIRED' using errcode='22023';
  end if;
  if v_class.inventory_asset_type is null then
    raise exception 'PRODUCT_CLASSIFICATION_TYPE_REQUIRED' using errcode='22023';
  end if;
  new.classification_id:=v_class.id;
  new.product_category:=v_class.name;
  return new;
end;
$$;
revoke all on function public.fill_stock_product_classification() from public,anon,authenticated;
drop trigger if exists stock_product_classification_fill on public.stock_products;
create trigger stock_product_classification_fill
  before insert or update of product_category,classification_id on public.stock_products
  for each row execute function public.fill_stock_product_classification();

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
    or coalesce(p_details->>'unit','') not in ('EA(개)','벌','Set(세트)','M','Cm','mm','Box','Kg','g','L','mL','봉','식')
    or v_standard_stock_quantity is null or v_standard_stock_quantity not between 1 and 1000000 then
    raise exception 'INVALID_PRODUCT_DETAILS' using errcode='22023';
  end if;
  insert into public.stock_products
    (classification_id,product_category,product_code,product_name,specification,material,color,unit,standard_stock_quantity)
  values
    (v_class.id,v_class.name,v_code,trim(p_details->>'product_name'),coalesce(p_details->>'specification',''),
      coalesce(p_details->>'material',''),coalesce(p_details->>'color',''),p_details->>'unit',v_standard_stock_quantity)
  on conflict (product_code) do nothing returning * into v_product;
  if not found then raise exception 'PRODUCT_CODE_ALREADY_EXISTS' using errcode='23505'; end if;
  return to_jsonb(v_product);
end;
$$;
revoke all on function public.register_stock_product(jsonb) from public,anon;
grant execute on function public.register_stock_product(jsonb) to authenticated;

-- Purchase lines reference the registered product master by a non-null FK.
-- All stock movements still pass through post_stock_movement, which rejects
-- unknown products and applies the selected classification's quantity/value
-- policy before writing the inventory ledger.
do $$
begin
  if to_regclass('public.purchase_order_lines') is null then
    raise exception 'Run supabase/procurement-schema.sql before this migration';
  end if;
end $$;

commit;

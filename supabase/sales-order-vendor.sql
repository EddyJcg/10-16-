-- Run after supabase/fifo.sql, supabase/edit-records.sql, and supabase/vendor-management.sql.
begin;

alter table public.sales_orders
  add column if not exists vendor_id uuid references public.business_partners(id) on delete set null,
  add column if not exists vendor_name text,
  add column if not exists vendor_contact text;
create index if not exists sales_orders_vendor_id on public.sales_orders(vendor_id);

drop function if exists public.register_sales_order(text,text,text,text,text,integer,numeric,date,text,text,text);
drop function if exists public.register_sales_order(text,text,text,text,text,integer,numeric,date,text,text,text,date);
drop function if exists public.register_sales_order(text,text,text,text,text,integer,numeric,date,text,text,text,date,uuid);
create function public.register_sales_order(
  p_order_number text,p_order_type text,p_product_name text,p_specification text,p_unit text,
  p_quantity integer,p_unit_price numeric,p_due_date date,p_delivery_method text,p_address text,p_notes text,
  p_order_date date default null,p_vendor_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_order public.sales_orders%rowtype;
  v_vendor public.business_partners%rowtype;
  v_vendor_name text;
  v_vendor_contact text;
begin
  if not public.inventory_access_allowed() then raise exception 'ACCOUNT_DISABLED' using errcode='42501'; end if;
  if p_order_number is null or char_length(trim(p_order_number)) not between 1 and 80
    or p_order_type not in ('온라인 수주','오프라인 수주')
    or p_product_name is null or char_length(trim(p_product_name)) not between 1 and 120
    or char_length(coalesce(p_specification,'')) > 200
    or p_unit not in ('EA(개)','벌','Set(세트)','M','Cm','mm','Box','Kg','g','L','mL','봉','식')
    or p_quantity is null or p_quantity not between 1 and 1000000
    or p_unit_price is null or p_unit_price not between 0 and 1000000000 or p_unit_price <> round(p_unit_price,2)
    or p_due_date is null or p_due_date < date '1900-01-01'
    or p_order_date < date '1900-01-01'
    or char_length(coalesce(p_delivery_method,'')) > 120
    or char_length(coalesce(p_address,'')) > 1000
    or char_length(coalesce(p_notes,'')) > 2000 then
    raise exception 'INVALID_SALES_ORDER' using errcode='22023';
  end if;
  if p_vendor_id is not null then
    select bp.* into v_vendor from public.business_partners bp where bp.id=p_vendor_id;
    if not found then raise exception 'SALES_ORDER_VENDOR_NOT_FOUND' using errcode='23503'; end if;
    v_vendor_name:=v_vendor.legal_name;
    v_vendor_contact:=nullif(concat_ws(' / ',
      coalesce(nullif(trim(v_vendor.profile->>'contact_person'),''),nullif(trim(v_vendor.profile->>'sales_manager'),'')),
      coalesce(nullif(trim(v_vendor.profile->>'manager_phone'),''),nullif(trim(v_vendor.profile->>'contact_mobile'),''),nullif(trim(v_vendor.profile->>'phone'),''))), '');
  end if;
  insert into public.sales_orders(
    order_number,order_type,product_name,specification,unit,quantity,unit_price,amount,due_date,
    delivery_method,address,notes,order_date,created_by,vendor_id,vendor_name,vendor_contact
  ) values(
    trim(p_order_number),p_order_type,trim(p_product_name),coalesce(p_specification,''),p_unit,p_quantity,p_unit_price,
    p_quantity*p_unit_price,p_due_date,coalesce(p_delivery_method,''),coalesce(p_address,''),coalesce(p_notes,''),
    coalesce(p_order_date,(now() at time zone 'Asia/Seoul')::date),auth.uid(),p_vendor_id,v_vendor_name,v_vendor_contact
  ) returning * into v_order;
  return to_jsonb(v_order);
end;
$$;
revoke all on function public.register_sales_order(text,text,text,text,text,integer,numeric,date,text,text,text,date,uuid) from public,anon;
grant execute on function public.register_sales_order(text,text,text,text,text,integer,numeric,date,text,text,text,date,uuid) to authenticated;

drop function if exists public.update_sales_order(uuid,date,text,text,text,text,text,integer,numeric,date,text,text,text);
drop function if exists public.update_sales_order(uuid,date,text,text,text,text,text,integer,numeric,date,text,text,text,uuid);
create function public.update_sales_order(
  p_order_id uuid,p_order_date date,p_order_number text,p_order_type text,p_product_name text,
  p_specification text,p_unit text,p_quantity integer,p_unit_price numeric,p_due_date date,
  p_delivery_method text,p_address text,p_notes text,p_vendor_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_order public.sales_orders%rowtype;
  v_vendor public.business_partners%rowtype;
  v_vendor_name text;
  v_vendor_contact text;
begin
  if not public.inventory_access_allowed() then raise exception 'ACCOUNT_DISABLED' using errcode='42501'; end if;
  if p_order_id is null or p_order_number is null or char_length(trim(p_order_number)) not between 1 and 80
    or p_order_type not in ('온라인 수주','오프라인 수주')
    or p_product_name is null or char_length(trim(p_product_name)) not between 1 and 120
    or char_length(coalesce(p_specification,''))>200
    or p_unit not in ('EA(개)','벌','Set(세트)','M','Cm','mm','Box','Kg','g','L','mL','봉','식')
    or p_quantity is null or p_quantity not between 1 and 1000000
    or p_unit_price is null or p_unit_price not between 0 and 1000000000 or p_unit_price<>round(p_unit_price,2)
    or p_due_date is null or p_due_date<date '1900-01-01'
    or p_order_date is null or p_order_date<date '1900-01-01'
    or char_length(coalesce(p_delivery_method,''))>120
    or char_length(coalesce(p_address,''))>1000
    or char_length(coalesce(p_notes,''))>2000 then
    raise exception 'INVALID_SALES_ORDER' using errcode='22023';
  end if;
  select * into v_order from public.sales_orders where id=p_order_id for update;
  if not found then raise exception 'SALES_ORDER_NOT_FOUND' using errcode='P0002'; end if;
  if v_order.shipped_quantity>0 and (
    v_order.shipped_quantity>p_quantity or v_order.product_name<>trim(p_product_name)
    or v_order.specification<>coalesce(p_specification,'') or v_order.unit<>p_unit
  ) then raise exception 'SALES_ORDER_HAS_SHIPMENTS' using errcode='22023'; end if;
  if p_vendor_id is not null then
    select bp.* into v_vendor from public.business_partners bp where bp.id=p_vendor_id;
    if not found then raise exception 'SALES_ORDER_VENDOR_NOT_FOUND' using errcode='23503'; end if;
    v_vendor_name:=v_vendor.legal_name;
    v_vendor_contact:=nullif(concat_ws(' / ',
      coalesce(nullif(trim(v_vendor.profile->>'contact_person'),''),nullif(trim(v_vendor.profile->>'sales_manager'),'')),
      coalesce(nullif(trim(v_vendor.profile->>'manager_phone'),''),nullif(trim(v_vendor.profile->>'contact_mobile'),''),nullif(trim(v_vendor.profile->>'phone'),''))), '');
  end if;
  update public.sales_orders set order_date=p_order_date,order_number=trim(p_order_number),order_type=p_order_type,
    product_name=trim(p_product_name),specification=coalesce(p_specification,''),unit=p_unit,quantity=p_quantity,
    unit_price=p_unit_price,amount=p_quantity*p_unit_price,due_date=p_due_date,
    delivery_method=coalesce(p_delivery_method,''),address=coalesce(p_address,''),notes=coalesce(p_notes,''),
    vendor_id=case when p_vendor_id is null then v_order.vendor_id else p_vendor_id end,
    vendor_name=case when p_vendor_id is null then v_order.vendor_name else v_vendor_name end,
    vendor_contact=case when p_vendor_id is null then v_order.vendor_contact else v_vendor_contact end
  where id=p_order_id returning * into v_order;
  return to_jsonb(v_order);
end;
$$;
revoke all on function public.update_sales_order(uuid,date,text,text,text,text,text,integer,numeric,date,text,text,text,uuid) from public,anon;
grant execute on function public.update_sales_order(uuid,date,text,text,text,text,text,integer,numeric,date,text,text,text,uuid) to authenticated;

commit;

-- Run after supabase/fifo.sql, supabase/edit-records.sql, and supabase/sales-order-vendor.sql.
begin;

alter table public.sales_orders
  add column if not exists order_group_id uuid not null default gen_random_uuid(),
  add column if not exists product_code text not null default '';
create index if not exists sales_orders_order_group_id on public.sales_orders(order_group_id);

create or replace function public.sales_order_product_code_ready()
returns boolean language sql security definer set search_path = '' as $$
  select public.inventory_access_allowed();
$$;
revoke all on function public.sales_order_product_code_ready() from public,anon;
grant execute on function public.sales_order_product_code_ready() to authenticated;

create or replace function public.register_sales_order_group(
  p_order_date date,p_order_number text,p_order_type text,p_vendor_name text,
  p_vendor_contact text,p_delivery_method text,p_lines jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_group_id uuid:=gen_random_uuid();
  v_line jsonb;
  v_order public.sales_orders%rowtype;
  v_orders jsonb:='[]'::jsonb;
  v_quantity integer;
  v_unit_price numeric;
  v_due_date date;
  v_name text;
  v_specification text;
  v_unit text;
begin
  if not public.inventory_access_allowed() then raise exception 'ACCOUNT_DISABLED' using errcode='42501'; end if;
  if p_order_date is null or p_order_date<date '1900-01-01'
    or p_order_number is null or char_length(trim(p_order_number)) not between 1 and 80
    or p_order_type is null or p_order_type not in ('온라인 수주','오프라인 수주')
    or p_vendor_name is null or char_length(trim(p_vendor_name)) not between 1 and 160
    or char_length(coalesce(p_vendor_contact,''))>120
    or char_length(coalesce(p_delivery_method,''))>120
    or p_lines is null or jsonb_typeof(p_lines)<>'array'
    or jsonb_array_length(p_lines) not between 1 and 100 then
    raise exception 'INVALID_SALES_ORDER' using errcode='22023';
  end if;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_name:=trim(coalesce(v_line->>'product_name',''));
    v_specification:=coalesce(v_line->>'specification','');
    v_unit:=v_line->>'unit';
    if char_length(trim(coalesce(v_line->>'product_code','')))>80
      or char_length(v_name) not between 1 and 120 or char_length(v_specification)>200
      or v_unit is null or v_unit not in ('EA(개)','벌','Set(세트)','M','Cm','mm','Box','Kg','g','L','mL','봉','식')
      or coalesce(v_line->>'quantity','') !~ '^[0-9]{1,7}$'
      or coalesce(v_line->>'unit_price','') !~ '^[0-9]{1,10}(\.[0-9]{1,2})?$'
      or coalesce(v_line->>'due_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'INVALID_SALES_ORDER_LINE' using errcode='22023';
    end if;
    v_quantity:=(v_line->>'quantity')::integer;
    v_unit_price:=(v_line->>'unit_price')::numeric;
    v_due_date:=(v_line->>'due_date')::date;
    if v_quantity not between 1 and 1000000 or v_unit_price not between 0 and 1000000000
      or v_due_date<date '1900-01-01' then
      raise exception 'INVALID_SALES_ORDER_LINE' using errcode='22023';
    end if;
    insert into public.sales_orders(
      order_group_id,order_date,order_number,order_type,vendor_id,vendor_name,vendor_contact,
      product_code,product_name,specification,unit,quantity,unit_price,amount,due_date,delivery_method,
      address,notes,created_by
    ) values(
      v_group_id,p_order_date,trim(p_order_number),p_order_type,null,trim(p_vendor_name),
      nullif(trim(coalesce(p_vendor_contact,'')),''),trim(coalesce(v_line->>'product_code','')),v_name,v_specification,v_unit,v_quantity,
      v_unit_price,v_quantity*v_unit_price,v_due_date,coalesce(p_delivery_method,''),left(trim(coalesce(v_line->>'address','')),300),'',auth.uid()
    ) returning * into v_order;
    v_orders:=v_orders||jsonb_build_array(to_jsonb(v_order));
  end loop;
  return jsonb_build_object('group_id',v_group_id,'orders',v_orders);
end;
$$;

create or replace function public.update_sales_order_group(
  p_group_id uuid,p_order_date date,p_order_number text,p_order_type text,p_vendor_name text,
  p_vendor_contact text,p_delivery_method text,p_lines jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_line jsonb;
  v_order public.sales_orders%rowtype;
  v_current public.sales_orders%rowtype;
  v_orders jsonb:='[]'::jsonb;
  v_kept_ids uuid[]:='{}'::uuid[];
  v_seen_ids uuid[]:='{}'::uuid[];
  v_line_id uuid;
  v_quantity integer;
  v_unit_price numeric;
  v_due_date date;
  v_name text;
  v_specification text;
  v_unit text;
begin
  if not public.inventory_access_allowed() then raise exception 'ACCOUNT_DISABLED' using errcode='42501'; end if;
  if p_group_id is null or p_order_date is null or p_order_date<date '1900-01-01'
    or p_order_number is null or char_length(trim(p_order_number)) not between 1 and 80
    or p_order_type is null or p_order_type not in ('온라인 수주','오프라인 수주')
    or p_vendor_name is null or char_length(trim(p_vendor_name)) not between 1 and 160
    or char_length(coalesce(p_vendor_contact,''))>120
    or char_length(coalesce(p_delivery_method,''))>120
    or p_lines is null or jsonb_typeof(p_lines)<>'array'
    or jsonb_array_length(p_lines) not between 1 and 100 then
    raise exception 'INVALID_SALES_ORDER' using errcode='22023';
  end if;
  perform 1 from public.sales_orders where order_group_id=p_group_id for update;
  if not found then raise exception 'SALES_ORDER_NOT_FOUND' using errcode='P0002'; end if;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_name:=trim(coalesce(v_line->>'product_name',''));
    v_specification:=coalesce(v_line->>'specification','');
    v_unit:=v_line->>'unit';
    if char_length(trim(coalesce(v_line->>'product_code','')))>80
      or char_length(v_name) not between 1 and 120 or char_length(v_specification)>200
      or v_unit is null or v_unit not in ('EA(개)','벌','Set(세트)','M','Cm','mm','Box','Kg','g','L','mL','봉','식')
      or coalesce(v_line->>'quantity','') !~ '^[0-9]{1,7}$'
      or coalesce(v_line->>'unit_price','') !~ '^[0-9]{1,10}(\.[0-9]{1,2})?$'
      or coalesce(v_line->>'due_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'INVALID_SALES_ORDER_LINE' using errcode='22023';
    end if;
    v_quantity:=(v_line->>'quantity')::integer;
    v_unit_price:=(v_line->>'unit_price')::numeric;
    v_due_date:=(v_line->>'due_date')::date;
    if v_quantity not between 1 and 1000000 or v_unit_price not between 0 and 1000000000
      or v_due_date<date '1900-01-01' then
      raise exception 'INVALID_SALES_ORDER_LINE' using errcode='22023';
    end if;
    v_line_id:=nullif(v_line->>'line_id','')::uuid;
    if v_line_id is not null then
      if v_line_id=any(v_seen_ids) then raise exception 'DUPLICATE_SALES_ORDER_LINE' using errcode='22023'; end if;
      v_seen_ids:=array_append(v_seen_ids,v_line_id);
      select * into v_current from public.sales_orders
        where id=v_line_id and order_group_id=p_group_id for update;
      if not found then raise exception 'SALES_ORDER_LINE_NOT_FOUND' using errcode='P0002'; end if;
      if v_current.shipped_quantity>0 and (
        v_current.shipped_quantity>v_quantity or v_current.product_name<>v_name
        or v_current.specification<>v_specification or v_current.unit<>v_unit
      ) then raise exception 'SALES_ORDER_HAS_SHIPMENTS' using errcode='22023'; end if;
      update public.sales_orders set
        order_date=p_order_date,order_number=trim(p_order_number),order_type=p_order_type,
        vendor_id=null,vendor_name=trim(p_vendor_name),vendor_contact=nullif(trim(coalesce(p_vendor_contact,'')),''),
        product_code=case when v_line ? 'product_code' then trim(coalesce(v_line->>'product_code','')) else v_current.product_code end,
        product_name=v_name,specification=v_specification,unit=v_unit,quantity=v_quantity,
        unit_price=v_unit_price,amount=v_quantity*v_unit_price,due_date=v_due_date,
        delivery_method=coalesce(p_delivery_method,''),
        address=case when v_line ? 'address' then left(trim(coalesce(v_line->>'address','')),300) else v_current.address end
      where id=v_line_id returning * into v_order;
    else
      insert into public.sales_orders(
        order_group_id,order_date,order_number,order_type,vendor_id,vendor_name,vendor_contact,
        product_code,product_name,specification,unit,quantity,unit_price,amount,due_date,delivery_method,
        address,notes,created_by
      ) values(
        p_group_id,p_order_date,trim(p_order_number),p_order_type,null,trim(p_vendor_name),
        nullif(trim(coalesce(p_vendor_contact,'')),''),trim(coalesce(v_line->>'product_code','')),v_name,v_specification,v_unit,v_quantity,
        v_unit_price,v_quantity*v_unit_price,v_due_date,coalesce(p_delivery_method,''),left(trim(coalesce(v_line->>'address','')),300),'',auth.uid()
      ) returning * into v_order;
    end if;
    v_kept_ids:=array_append(v_kept_ids,v_order.id);
  end loop;

  for v_current in select * from public.sales_orders where order_group_id=p_group_id for update
  loop
    if not (v_current.id=any(v_kept_ids)) then
      if v_current.shipped_quantity>0 then raise exception 'SALES_ORDER_HAS_SHIPMENTS' using errcode='22023'; end if;
      delete from public.sales_orders where id=v_current.id;
    end if;
  end loop;
  select coalesce(jsonb_agg(to_jsonb(o) order by o.sequence_id), '[]'::jsonb)
    into v_orders from public.sales_orders o where o.order_group_id=p_group_id;
  return jsonb_build_object('group_id',p_group_id,'orders',v_orders);
end;
$$;

create or replace function public.delete_sales_order_line(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_order public.sales_orders%rowtype;
  v_group_id uuid;
begin
  if not public.inventory_access_allowed() then raise exception 'ACCOUNT_DISABLED' using errcode='42501'; end if;
  if p_order_id is null then raise exception 'INVALID_SALES_ORDER' using errcode='22023'; end if;
  select order_group_id into v_group_id from public.sales_orders where id=p_order_id;
  if not found then raise exception 'SALES_ORDER_NOT_FOUND' using errcode='P0002'; end if;
  perform 1 from public.sales_orders where order_group_id=v_group_id order by id for update;
  select * into v_order from public.sales_orders where id=p_order_id and order_group_id=v_group_id;
  if not found then raise exception 'SALES_ORDER_NOT_FOUND' using errcode='P0002'; end if;
  if exists(
    select 1 from public.sales_orders so
    where so.order_group_id=v_group_id
      and (so.shipped_quantity>0 or to_jsonb(so)->>'sales_progress_status'='완료'
        or to_jsonb(so)->>'sales_status'='매출완료'
        or exists(select 1 from public.stock_movements m where m.sales_order_id=so.id))
  ) then raise exception 'SALES_ORDER_HAS_SHIPMENTS' using errcode='22023'; end if;
  delete from public.sales_orders where id=p_order_id;
  return jsonb_build_object('id',v_order.id,'order_group_id',v_group_id);
end;
$$;
revoke all on function public.delete_sales_order_line(uuid) from public,anon;
grant execute on function public.delete_sales_order_line(uuid) to authenticated;

revoke all on function public.register_sales_order_group(date,text,text,text,text,text,jsonb) from public,anon;
grant execute on function public.register_sales_order_group(date,text,text,text,text,text,jsonb) to authenticated;
revoke all on function public.update_sales_order_group(uuid,date,text,text,text,text,text,jsonb) from public,anon;
grant execute on function public.update_sales_order_group(uuid,date,text,text,text,text,text,jsonb) to authenticated;

commit;

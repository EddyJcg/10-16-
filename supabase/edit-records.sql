-- Run after supabase/fifo.sql and supabase/item-asset-classification.sql.
begin;

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
  if v_product.unit<>p_details->>'unit'
    and exists(select 1 from public.stock_movements where product_id=p_product_id) then
    raise exception 'PRODUCT_HAS_LEDGER_HISTORY' using errcode='22023';
  end if;
  if (v_product.product_name<>trim(p_details->>'product_name')
    or v_product.specification<>coalesce(p_details->>'specification',''))
    and exists(select 1 from public.stock_movements m where m.product_id=p_product_id and m.sales_order_id is not null) then
    raise exception 'PRODUCT_HAS_LINKED_SHIPMENTS' using errcode='22023';
  end if;
  update public.stock_products set
    product_category=v_classification.name,classification_id=v_classification.id,product_code=v_code,
    product_name=trim(p_details->>'product_name'),specification=coalesce(p_details->>'specification',''),
    material=coalesce(p_details->>'material',''),color=coalesce(p_details->>'color',''),
    unit=p_details->>'unit',standard_stock_quantity=v_standard_stock_quantity
  where id=p_product_id returning * into v_product;
  if not found then raise exception 'PRODUCT_NOT_FOUND' using errcode='P0002'; end if;
  return to_jsonb(v_product);
end;
$$;
revoke all on function public.update_stock_product(uuid,jsonb) from public,anon;
grant execute on function public.update_stock_product(uuid,jsonb) to authenticated;

create or replace function public.update_sales_order(
  p_order_id uuid,p_order_date date,p_order_number text,p_order_type text,p_product_name text,
  p_specification text,p_unit text,p_quantity integer,p_unit_price numeric,p_due_date date,
  p_delivery_method text,p_address text,p_notes text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_order public.sales_orders%rowtype;
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
  update public.sales_orders set order_date=p_order_date,order_number=trim(p_order_number),order_type=p_order_type,
    product_name=trim(p_product_name),specification=coalesce(p_specification,''),unit=p_unit,quantity=p_quantity,
    unit_price=p_unit_price,amount=p_quantity*p_unit_price,due_date=p_due_date,
    delivery_method=coalesce(p_delivery_method,''),address=coalesce(p_address,''),notes=coalesce(p_notes,'')
  where id=p_order_id returning * into v_order;
  return to_jsonb(v_order);
end;
$$;
revoke all on function public.update_sales_order(uuid,date,text,text,text,text,text,integer,numeric,date,text,text,text) from public,anon;
grant execute on function public.update_sales_order(uuid,date,text,text,text,text,text,integer,numeric,date,text,text,text) to authenticated;

create or replace function public.edit_stock_movement(
  p_movement_id uuid,p_date date,p_quantity integer,p_unit_cost numeric,p_sales_order_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_movement public.stock_movements%rowtype;
  v_product public.stock_products%rowtype;
  v_row public.stock_movements%rowtype;
  v_lot public.stock_lots%rowtype;
  v_order public.sales_orders%rowtype;
  v_left integer;
  v_take integer;
  v_amount numeric(24,2);
  v_old_order_id uuid;
begin
  if not public.inventory_access_allowed() then raise exception 'ACCOUNT_DISABLED' using errcode='42501'; end if;
  if p_movement_id is null or p_date is null or p_date<date '1900-01-01'
    or p_date>(now() at time zone 'Asia/Seoul')::date
    or p_quantity is null or p_quantity not between 1 and 1000000
    or p_unit_cost is null or p_unit_cost<0 or p_unit_cost>1000000000 or p_unit_cost<>round(p_unit_cost,2) then
    raise exception 'INVALID_INPUT' using errcode='22023';
  end if;
  select * into v_movement from public.stock_movements where id=p_movement_id;
  if not found then raise exception 'MOVEMENT_NOT_FOUND' using errcode='P0002'; end if;
  select * into v_product from public.stock_products where id=v_movement.product_id for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND' using errcode='P0002'; end if;
  select * into v_movement from public.stock_movements where id=p_movement_id for update;
  if not found or v_movement.product_id<>v_product.id then raise exception 'MOVEMENT_NOT_FOUND' using errcode='P0002'; end if;
  v_old_order_id:=v_movement.sales_order_id;
  if v_movement.kind<>'issue' and p_sales_order_id is not null then
    raise exception 'INVALID_SALES_ORDER_LINK' using errcode='22023';
  end if;
  update public.stock_movements set movement_date=p_date,quantity=p_quantity,
    unit_cost=case when kind='issue' then 0 else p_unit_cost end,
    amount=case when kind='issue' then amount else p_quantity*p_unit_cost end,
    sales_order_id=p_sales_order_id,
    request_payload=jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(request_payload,'{date}',to_jsonb(p_date),true),
          '{quantity}',to_jsonb(p_quantity),true),
        '{unit_cost}',to_jsonb(case when kind='issue' then 0 else p_unit_cost end),true),
      '{details,sales_order_id}',to_jsonb(coalesce(p_sales_order_id::text,'')),true)
  where id=p_movement_id returning * into v_movement;

  if p_sales_order_id is not null and p_sales_order_id is distinct from v_old_order_id then
    select * into v_order from public.sales_orders where id=p_sales_order_id for update;
    if not found then raise exception 'SALES_ORDER_NOT_FOUND' using errcode='P0002'; end if;
    if v_order.sales_status='매출완료' and v_order.shipped_quantity=0 then
      raise exception 'SALES_ORDER_QUANTITY_EXCEEDED' using errcode='22023';
    end if;
    if trim(v_order.product_name)<>trim(v_product.product_name)
      or trim(v_order.specification)<>trim(v_product.specification) or v_order.unit<>v_product.unit then
      raise exception 'SALES_ORDER_PRODUCT_MISMATCH' using errcode='22023';
    end if;
  end if;

  delete from public.stock_allocations where issue_id in
    (select id from public.stock_movements where product_id=v_product.id and kind='issue');
  delete from public.stock_lots where product_id=v_product.id;
  for v_row in select * from public.stock_movements where product_id=v_product.id
    order by movement_date,sequence_id for update loop
    if v_row.kind in ('opening','receipt') then
      insert into public.stock_lots(product_id,movement_id,received_date,quantity,remaining_quantity,unit_cost)
      values(v_product.id,v_row.id,v_row.movement_date,v_row.quantity,v_row.quantity,v_row.unit_cost);
    else
      v_left:=v_row.quantity;v_amount:=0;
      for v_lot in select * from public.stock_lots
        where product_id=v_product.id and remaining_quantity>0 and received_date<=v_row.movement_date
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

  for v_order in select so.* from public.sales_orders so
    where so.id in (v_old_order_id,p_sales_order_id) and so.id is not null order by so.id for update loop
    if coalesce((select sum(m.quantity) from public.stock_movements m where m.sales_order_id=v_order.id),0)>v_order.quantity then
      raise exception 'SALES_ORDER_QUANTITY_EXCEEDED' using errcode='22023';
    end if;
    update public.sales_orders so set
      shipped_quantity=coalesce((select sum(m.quantity) from public.stock_movements m where m.sales_order_id=so.id),0),
      shipped_date=(select max(m.movement_date) from public.stock_movements m where m.sales_order_id=so.id),
      sales_status=case when exists(select 1 from public.stock_movements m where m.sales_order_id=so.id)
        then case when (select sum(m.quantity) from public.stock_movements m where m.sales_order_id=so.id)>=so.quantity
          then '매출완료' else '매출미완료' end
        else '매출미완료' end
    where so.id=v_order.id;
  end loop;
  select * into v_movement from public.stock_movements where id=p_movement_id;
  return to_jsonb(v_movement);
end;
$$;
revoke all on function public.edit_stock_movement(uuid,date,integer,numeric,uuid) from public,anon;
grant execute on function public.edit_stock_movement(uuid,date,integer,numeric,uuid) to authenticated;

commit;

-- Run after supabase/item-asset-classification.sql.
-- Replaces the classification save RPC to allow value-management changes
-- without rewriting historical transaction values. Quantity policy remains
-- protected when stock movements already exist.
begin;

do $$ begin
  if to_regclass('public.stock_product_classifications') is null
    or to_regprocedure('public.save_stock_product_classification(jsonb)') is null then
    raise exception 'Run supabase/item-asset-classification.sql first';
  end if;
end $$;

create or replace function public.save_stock_product_classification(p_details jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_name text;
  v_type text;
  v_quantity_disabled boolean;
  v_value_disabled boolean;
  v_shortage_control boolean;
  v_set_item boolean;
  v_lot_default boolean;
  v_notes text;
  v_row public.stock_product_classifications%rowtype;
begin
  if not public.inventory_access_allowed() then raise exception 'ACCOUNT_DISABLED' using errcode='42501'; end if;
  if p_details is null or jsonb_typeof(p_details)<>'object' then raise exception 'INVALID_CLASSIFICATION'; end if;
  v_name:=trim(coalesce(p_details->>'name',''));
  v_type:=nullif(trim(coalesce(p_details->>'inventory_asset_type','')),'');
  v_notes:=coalesce(p_details->>'notes','');
  if v_name ~ '[()]' then raise exception 'CLASSIFICATION_PARENTHESES_NOT_ALLOWED' using errcode='22023'; end if;
  if char_length(v_name) not between 1 and 80 or char_length(v_notes)>500
    or (v_type is not null and v_type not in ('원자재','상품','제품','서비스','부자재','소모자재','포장재','sample','재공품','반제품','저장품'))
    or coalesce(p_details->>'quantity_management_disabled','false') not in ('true','false')
    or coalesce(p_details->>'value_management_disabled','false') not in ('true','false')
    or coalesce(p_details->>'shortage_control_enabled','false') not in ('true','false')
    or coalesce(p_details->>'is_set_item','false') not in ('true','false') then
    raise exception 'INVALID_CLASSIFICATION' using errcode='22023';
  end if;
  v_quantity_disabled:=coalesce((p_details->>'quantity_management_disabled')::boolean,false);
  v_value_disabled:=coalesce((p_details->>'value_management_disabled')::boolean,false);
  v_shortage_control:=coalesce((p_details->>'shortage_control_enabled')::boolean,false);
  v_set_item:=coalesce((p_details->>'is_set_item')::boolean,false);
  v_lot_default:=coalesce((p_details->>'lot_management_default')::boolean,false);
  begin v_id:=nullif(p_details->>'id','')::uuid;
  exception when invalid_text_representation then raise exception 'INVALID_CLASSIFICATION' using errcode='22023'; end;
  if exists(select 1 from public.stock_product_classifications c where lower(btrim(c.name))=lower(v_name) and c.id is distinct from v_id) then
    raise exception 'CLASSIFICATION_NAME_EXISTS' using errcode='23505';
  end if;
  if v_id is null then
    if v_type is null then raise exception 'CLASSIFICATION_TYPE_REQUIRED' using errcode='22023'; end if;
    insert into public.stock_product_classifications
      (name,inventory_asset_type,quantity_management_disabled,value_management_disabled,shortage_control_enabled,is_set_item,lot_management_default,notes,sort_order,created_by)
    values(v_name,v_type,v_quantity_disabled,v_value_disabled,v_shortage_control,v_set_item,v_lot_default,v_notes,
      coalesce((select max(sort_order)+1 from public.stock_product_classifications),1),auth.uid())
    returning * into v_row;
  else
    select * into v_row from public.stock_product_classifications where id=v_id for update;
    if not found then raise exception 'CLASSIFICATION_NOT_FOUND' using errcode='P0002'; end if;
    if v_type is null then raise exception 'CLASSIFICATION_TYPE_REQUIRED' using errcode='22023'; end if;
    if v_row.quantity_management_disabled is distinct from v_quantity_disabled
      and exists(select 1 from public.stock_products p join public.stock_movements m on m.product_id=p.id where p.classification_id=v_id) then
      raise exception 'CLASSIFICATION_HAS_LEDGER_HISTORY' using errcode='22023',
        detail='재고수량관리 안함 설정은 거래 이력이 있는 분류에서 변경할 수 없습니다.';
    end if;
    update public.stock_product_classifications set name=v_name,inventory_asset_type=v_type,
      quantity_management_disabled=v_quantity_disabled,value_management_disabled=v_value_disabled,
      shortage_control_enabled=v_shortage_control,is_set_item=v_set_item,lot_management_default=v_lot_default,notes=v_notes,updated_at=clock_timestamp()
      where id=v_id returning * into v_row;
    update public.stock_products set product_category=v_name where classification_id=v_id;
  end if;
  return to_jsonb(v_row);
exception when unique_violation then
  raise exception 'CLASSIFICATION_NAME_EXISTS' using errcode='23505';
end;
$$;
revoke all on function public.save_stock_product_classification(jsonb) from public,anon;
grant execute on function public.save_stock_product_classification(jsonb) to authenticated;

commit;

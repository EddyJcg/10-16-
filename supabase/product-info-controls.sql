-- Run after item-asset-classification.sql and edit-records.sql.
begin;

alter table public.stock_products
  add column if not exists created_by uuid;
alter table public.stock_products
  add column if not exists created_by_name text;
update public.stock_products
set created_by_name='기존 등록자'
where created_by_name is null;
alter table public.stock_products
  alter column created_by_name set not null;

create or replace function public.set_stock_product_creator()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_claims jsonb:=coalesce(auth.jwt(),'{}'::jsonb);
  v_user_metadata jsonb:=coalesce(v_claims->'user_metadata','{}'::jsonb);
begin
  if tg_op='INSERT' then
    new.created_by:=coalesce(auth.uid(),new.created_by);
    new.created_by_name:=coalesce(
      nullif(btrim(v_user_metadata->>'full_name'),''),
      nullif(btrim(v_user_metadata->>'name'),''),
      nullif(btrim(v_user_metadata->>'preferred_username'),''),
      nullif(btrim(v_claims->>'email'),''),
      '알 수 없음'
    );
  else
    new.created_by:=old.created_by;
    new.created_by_name:=old.created_by_name;
  end if;
  return new;
end;
$$;
revoke all on function public.set_stock_product_creator() from public,anon,authenticated;
drop trigger if exists stock_product_creator on public.stock_products;
create trigger stock_product_creator
  before insert or update on public.stock_products
  for each row execute function public.set_stock_product_creator();

create or replace function public.enforce_stock_product_info_rules()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.product_code is distinct from old.product_code
    or (new.product_category is distinct from old.product_category and not exists(
      select 1 from public.stock_product_classifications c
      where c.id=new.classification_id and c.name=new.product_category
    ))
    or new.product_name is distinct from old.product_name
    or new.unit is distinct from old.unit
    or new.standard_stock_quantity is distinct from old.standard_stock_quantity
    or new.created_by is distinct from old.created_by
    or new.created_by_name is distinct from old.created_by_name
    or (nullif(btrim(old.specification),'') is not null and new.specification is distinct from old.specification)
    or (nullif(btrim(old.material),'') is not null and new.material is distinct from old.material)
    or (nullif(btrim(old.color),'') is not null and new.color is distinct from old.color)
    or (old.classification_id is not null and new.classification_id is distinct from old.classification_id) then
    raise exception 'PRODUCT_INFO_ALREADY_ASSIGNED' using errcode='22023';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_stock_product_info_rules() from public,anon,authenticated;
drop trigger if exists stock_product_info_immutable on public.stock_products;
create trigger stock_product_info_immutable
  before update on public.stock_products
  for each row execute function public.enforce_stock_product_info_rules();

do $$
declare v_specification text;
begin
  select min(btrim(specification)) into v_specification
  from public.stock_products
  where nullif(btrim(specification),'') is not null
  group by lower(btrim(specification))
  having count(*)>1
  limit 1;
  if v_specification is not null then
    raise exception '이미 중복된 규격이 있습니다 (예: %). 품목정보를 정리한 뒤 다시 실행하세요.',v_specification;
  end if;
end;
$$;

create unique index if not exists stock_products_specification_normalized_key
  on public.stock_products(lower(btrim(specification)))
  where nullif(btrim(specification),'') is not null;

create or replace function public.enforce_unique_stock_product_specification()
returns trigger language plpgsql set search_path = '' as $$
begin
  if nullif(btrim(new.specification),'') is not null and exists(
    select 1 from public.stock_products p
    where lower(btrim(p.specification))=lower(btrim(new.specification))
      and p.id is distinct from new.id
  ) then
    raise exception 'PRODUCT_SPECIFICATION_ALREADY_EXISTS'
      using errcode='23505',constraint='stock_products_specification_normalized_key';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_unique_stock_product_specification() from public,anon,authenticated;
drop trigger if exists stock_product_specification_unique on public.stock_products;
create trigger stock_product_specification_unique
  before insert or update of specification on public.stock_products
  for each row execute function public.enforce_unique_stock_product_specification();

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
  p.created_by_name
from public.stock_products p left join movements m on m.product_id=p.id
  left join stock s on s.product_id=p.id left join public.stock_product_classifications c on c.id=p.classification_id;
revoke all on public.stock_summary from anon;
grant select on public.stock_summary to authenticated;

commit;

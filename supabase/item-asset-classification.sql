-- Run after supabase/fifo.sql. Creates the item asset classification setup and applies its stock policies.
begin;

create table if not exists public.stock_product_classifications (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(trim(name)) between 1 and 80),
  inventory_asset_type text check (inventory_asset_type is null or inventory_asset_type in
    ('원자재','상품','제품','서비스','부자재','소모자재','포장재','sample','재공품','반제품','저장품')),
  quantity_management_disabled boolean not null default false,
  value_management_disabled boolean not null default false,
  shortage_control_enabled boolean not null default false,
  is_set_item boolean not null default false,
  lot_management_default boolean not null default false,
  is_active boolean not null default true,
  notes text not null default '' check (char_length(notes)<=500),
  sort_order integer not null default 1000,
  created_by uuid,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

-- Upgrade the earlier version of this table if the previous classification
-- migration was already run. Keep its rows and translate its column names.
do $$
begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='stock_product_classifications' and column_name='product_asset_class')
     and not exists(select 1 from information_schema.columns where table_schema='public' and table_name='stock_product_classifications' and column_name='name') then
    alter table public.stock_product_classifications rename column product_asset_class to name;
  end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='stock_product_classifications' and column_name='stock_quantity_unmanaged')
     and not exists(select 1 from information_schema.columns where table_schema='public' and table_name='stock_product_classifications' and column_name='quantity_management_disabled') then
    alter table public.stock_product_classifications rename column stock_quantity_unmanaged to quantity_management_disabled;
  end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='stock_product_classifications' and column_name='stock_amount_unmanaged')
     and not exists(select 1 from information_schema.columns where table_schema='public' and table_name='stock_product_classifications' and column_name='value_management_disabled') then
    alter table public.stock_product_classifications rename column stock_amount_unmanaged to value_management_disabled;
  end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='stock_product_classifications' and column_name='stock_shortage_control')
     and not exists(select 1 from information_schema.columns where table_schema='public' and table_name='stock_product_classifications' and column_name='shortage_control_enabled') then
    alter table public.stock_product_classifications rename column stock_shortage_control to shortage_control_enabled;
  end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='stock_product_classifications' and column_name='is_set_product')
     and not exists(select 1 from information_schema.columns where table_schema='public' and table_name='stock_product_classifications' and column_name='is_set_item') then
    alter table public.stock_product_classifications rename column is_set_product to is_set_item;
  end if;
end $$;

alter table public.stock_product_classifications add column if not exists id uuid default gen_random_uuid();
alter table public.stock_product_classifications add column if not exists name text;
alter table public.stock_product_classifications add column if not exists inventory_asset_type text;
alter table public.stock_product_classifications add column if not exists quantity_management_disabled boolean not null default false;
alter table public.stock_product_classifications add column if not exists value_management_disabled boolean not null default false;
alter table public.stock_product_classifications add column if not exists shortage_control_enabled boolean not null default false;
alter table public.stock_product_classifications add column if not exists is_set_item boolean not null default false;
alter table public.stock_product_classifications add column if not exists lot_management_default boolean not null default false;
alter table public.stock_product_classifications add column if not exists is_active boolean not null default true;
alter table public.stock_product_classifications add column if not exists notes text not null default '';
alter table public.stock_product_classifications add column if not exists sort_order integer not null default 1000;
alter table public.stock_product_classifications add column if not exists created_by uuid;
alter table public.stock_product_classifications add column if not exists created_at timestamptz not null default clock_timestamp();
alter table public.stock_product_classifications add column if not exists updated_at timestamptz not null default clock_timestamp();
update public.stock_product_classifications set id=gen_random_uuid() where id is null;
update public.stock_product_classifications set name='기존분류_'||id::text where name is null or trim(name)='';
update public.stock_product_classifications set inventory_asset_type='제품' where inventory_asset_type='프로젝트 제품';
alter table public.stock_product_classifications alter column id set not null;
alter table public.stock_product_classifications alter column name set not null;
alter table public.stock_product_classifications alter column inventory_asset_type drop not null;

do $$
declare v_constraint record; v_type text;
begin
  for v_constraint in
    select conname from pg_constraint where conrelid='public.stock_product_classifications'::regclass and contype='c'
      and pg_get_constraintdef(oid) ilike '%inventory_asset_type%'
  loop execute format('alter table public.stock_product_classifications drop constraint %I',v_constraint.conname); end loop;
  for v_constraint in
    select conname from pg_constraint where conrelid='public.stock_product_classifications'::regclass and contype='c'
      and pg_get_constraintdef(oid) ilike '%lot_management_default%'
  loop execute format('alter table public.stock_product_classifications drop constraint %I',v_constraint.conname); end loop;
  select data_type into v_type from information_schema.columns where table_schema='public' and table_name='stock_product_classifications' and column_name='lot_management_default';
  if v_type in ('smallint','integer','bigint','numeric','decimal') then
    alter table public.stock_product_classifications alter column lot_management_default drop default;
    alter table public.stock_product_classifications alter column lot_management_default type boolean using coalesce(lot_management_default::numeric,0)>0;
  end if;
end $$;
alter table public.stock_product_classifications alter column lot_management_default set default false;
create unique index if not exists stock_product_classifications_id_key on public.stock_product_classifications(id);
create unique index if not exists stock_product_classifications_name_key on public.stock_product_classifications(name);
alter table public.stock_product_classifications drop constraint if exists stock_product_classifications_name_length_check;
alter table public.stock_product_classifications add constraint stock_product_classifications_inventory_asset_type_check
  check (inventory_asset_type is null or inventory_asset_type in ('원자재','상품','제품','서비스','부자재','소모자재','포장재','sample','재공품','반제품','저장품'));
alter table public.stock_product_classifications add constraint stock_product_classifications_name_length_check
  check (char_length(trim(name)) between 1 and 80);

insert into public.stock_product_classifications
  (name,inventory_asset_type,quantity_management_disabled,value_management_disabled,shortage_control_enabled,is_set_item,sort_order)
values
  ('제품','제품',false,true,false,false,1),
  ('원자재','원자재',false,false,true,false,2),
  ('소모자재','소모자재',true,true,false,false,3),
  ('외주가공비_제작인건비',null,true,true,false,false,4),
  ('경비_항공료',null,true,true,false,false,5),
  ('경비_숙박비',null,true,true,false,false,6),
  ('경비_출장비',null,true,true,false,false,7),
  ('경비_교통비',null,true,true,false,false,8),
  ('경비_식대',null,true,true,false,false,9),
  ('기타_기타',null,true,true,false,false,10),
  ('포장비',null,true,true,false,false,11),
  ('운반비_운송비',null,true,true,false,false,12),
  ('운반비_도비비',null,true,true,false,false,13),
  ('경상연구개발비',null,true,true,false,false,14),
  ('운반비_특송비',null,true,true,false,false,15),
  ('운반비_지게차',null,true,true,false,false,16),
  ('포장자재',null,true,true,false,false,17),
  ('수선비',null,true,true,false,false,18),
  ('비품',null,true,true,false,false,19)
on conflict (name) do nothing;

alter table public.stock_products
  add column if not exists classification_id uuid references public.stock_product_classifications(id) on delete restrict;
create index if not exists stock_products_classification on public.stock_products(classification_id);

-- Hide parenthesized labels and normalized duplicate names from the selectable list.
update public.stock_product_classifications
set is_active=false,updated_at=clock_timestamp()
where is_active and name ~ '[()]';

with ranked as (
  select c.id,row_number() over (
    partition by lower(btrim(c.name))
    order by exists(select 1 from public.stock_products p where p.classification_id=c.id) desc,c.created_at,c.id
  ) as duplicate_rank
  from public.stock_product_classifications c
  where c.is_active
)
update public.stock_product_classifications c
set is_active=false,updated_at=clock_timestamp()
from ranked r
where r.id=c.id and r.duplicate_rank>1;

create unique index if not exists stock_product_classifications_active_normalized_name_key
  on public.stock_product_classifications(lower(btrim(name))) where is_active;


alter table public.stock_product_classifications enable row level security;
revoke all on public.stock_product_classifications from anon,authenticated;
grant select on public.stock_product_classifications to authenticated;
drop policy if exists stock_product_classifications_read on public.stock_product_classifications;
create policy stock_product_classifications_read on public.stock_product_classifications
  for select to authenticated using ((select public.inventory_access_allowed()));

create or replace function public.list_stock_product_classifications()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_rows jsonb;
begin
  if not public.inventory_access_allowed() then raise exception 'ACCOUNT_DISABLED' using errcode='42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.sort_order,c.name),'[]'::jsonb)
    into v_rows from public.stock_product_classifications c where c.is_active;
  return v_rows;
end;
$$;
revoke all on function public.list_stock_product_classifications() from public,anon;
grant execute on function public.list_stock_product_classifications() to authenticated;

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
    if (v_row.quantity_management_disabled is distinct from v_quantity_disabled
      or v_row.value_management_disabled is distinct from v_value_disabled)
      and exists(select 1 from public.stock_products p join public.stock_movements m on m.product_id=p.id where p.classification_id=v_id) then
      raise exception 'CLASSIFICATION_HAS_LEDGER_HISTORY' using errcode='22023';
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

create or replace function public.fill_stock_product_classification()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_class public.stock_product_classifications%rowtype;
begin
  if new.classification_id is null then
    select * into v_class from public.stock_product_classifications where name=trim(new.product_category);
  else
    select * into v_class from public.stock_product_classifications where id=new.classification_id;
  end if;
  if not found or v_class.name<>trim(new.product_category) then raise exception 'PRODUCT_CLASSIFICATION_REQUIRED' using errcode='22023'; end if;
  if v_class.inventory_asset_type is null then raise exception 'PRODUCT_CLASSIFICATION_TYPE_REQUIRED' using errcode='22023'; end if;
  new.classification_id:=v_class.id;
  new.product_category:=v_class.name;
  return new;
end;
$$;
revoke all on function public.fill_stock_product_classification() from public,anon,authenticated;
drop trigger if exists stock_product_classification_fill on public.stock_products;
create trigger stock_product_classification_fill before insert or update of product_category,classification_id
  on public.stock_products for each row execute function public.fill_stock_product_classification();

create or replace function public.apply_stock_product_movement_policy()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_quantity_disabled boolean; v_value_disabled boolean;
begin
  select coalesce(c.quantity_management_disabled,false),coalesce(c.value_management_disabled,false)
    into v_quantity_disabled,v_value_disabled
    from public.stock_products p left join public.stock_product_classifications c on c.id=p.classification_id
    where p.id=new.product_id;
  if not found then raise exception 'PRODUCT_NOT_FOUND' using errcode='P0002'; end if;
  if v_quantity_disabled then raise exception 'QUANTITY_MANAGEMENT_DISABLED' using errcode='22023'; end if;
  if v_value_disabled then new.unit_cost:=0;new.amount:=0; end if;
  return new;
end;
$$;
revoke all on function public.apply_stock_product_movement_policy() from public,anon,authenticated;
drop trigger if exists stock_movement_classification_policy on public.stock_movements;
create trigger stock_movement_classification_policy before insert or update of product_id,unit_cost,amount
  on public.stock_movements for each row execute function public.apply_stock_product_movement_policy();

create or replace function public.apply_stock_lot_value_policy()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.stock_products p join public.stock_product_classifications c on c.id=p.classification_id
    where p.id=new.product_id and c.value_management_disabled) then new.unit_cost:=0; end if;
  return new;
end;
$$;
revoke all on function public.apply_stock_lot_value_policy() from public,anon,authenticated;
drop trigger if exists stock_lot_classification_policy on public.stock_lots;
create trigger stock_lot_classification_policy before insert or update of product_id,unit_cost
  on public.stock_lots for each row execute function public.apply_stock_lot_value_policy();

create or replace function public.apply_stock_allocation_value_policy()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.stock_movements m join public.stock_products p on p.id=m.product_id
    join public.stock_product_classifications c on c.id=p.classification_id where m.id=new.issue_id and c.value_management_disabled) then
    new.unit_cost:=0;new.amount:=0;
  end if;
  return new;
end;
$$;
revoke all on function public.apply_stock_allocation_value_policy() from public,anon,authenticated;
drop trigger if exists stock_allocation_classification_policy on public.stock_allocations;
create trigger stock_allocation_classification_policy before insert or update of issue_id,unit_cost,amount
  on public.stock_allocations for each row execute function public.apply_stock_allocation_value_policy();

-- Recreate these views so prior attempted migrations with extra trailing columns
-- or incompatible numeric column types do not make CREATE OR REPLACE fail.
drop view if exists public.stock_aging;
drop view if exists public.stock_summary;

create view public.stock_summary with (security_invoker = true) as
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
  coalesce(c.is_set_item,false) as is_set_item
from public.stock_products p left join movements m on m.product_id=p.id
  left join stock s on s.product_id=p.id left join public.stock_product_classifications c on c.id=p.classification_id;
revoke all on public.stock_summary from anon;
grant select on public.stock_summary to authenticated;

create view public.stock_aging with (security_invoker = true) as
select l.id as lot_id,l.product_id,l.movement_id,m.sequence_id,m.movement_date::text as received_date,
  m.created_at as received_at,l.remaining_quantity,l.unit_cost,
  l.remaining_quantity*l.unit_cost as amount,p.product_category,p.product_code,p.product_name,
  p.specification,p.material,p.color,p.unit,p.storage_location,p.supplier,
  coalesce(c.quantity_management_disabled,false) as quantity_management_disabled
from public.stock_lots l join public.stock_movements m on m.id=l.movement_id
join public.stock_products p on p.id=l.product_id
left join public.stock_product_classifications c on c.id=p.classification_id;
revoke all on public.stock_aging from anon;
grant select on public.stock_aging to authenticated;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='stock_product_classifications') then
    alter publication supabase_realtime add table public.stock_product_classifications;
  end if;
end $$;
commit;

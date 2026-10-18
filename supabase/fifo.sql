-- 기존 schema.sql 적용 후 실행하세요. 기존 inventory_items 데이터는 변경하지 않습니다.
begin;
create table if not exists public.stock_products (
  id uuid primary key default gen_random_uuid(),
  product_category text not null check (char_length(product_category) between 1 and 80),
  product_code text not null unique check (char_length(product_code) between 1 and 80),
  product_name text not null check (char_length(product_name) between 1 and 120),
  specification text not null default '' check (char_length(specification) <= 200),
  material text not null default '' check (char_length(material) <= 120),
  storage_location text not null default '' check (char_length(storage_location) <= 120),
  supplier text not null default '' check (char_length(supplier) <= 120),
  created_at timestamptz not null default clock_timestamp()
);
alter table public.stock_products
  add column if not exists color text not null default '' check (char_length(color) <= 120);
create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  sequence_id bigint generated always as identity unique,
  request_id uuid not null unique,
  request_payload jsonb not null,
  product_id uuid not null references public.stock_products(id),
  kind text not null check (kind in ('opening','receipt','issue')),
  movement_date date not null,
  quantity integer not null check (quantity between 1 and 1000000),
  unit_cost numeric(18,2) not null check (unit_cost >= 0),
  amount numeric(24,2) not null check (amount >= 0),
  created_by uuid not null,
  created_at timestamptz not null default clock_timestamp()
);
create unique index if not exists stock_one_opening on public.stock_movements(product_id) where kind = 'opening';
create index if not exists stock_movements_product_date on public.stock_movements(product_id,movement_date,sequence_id);
create table if not exists public.stock_lots (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.stock_products(id),
  movement_id uuid not null unique references public.stock_movements(id),
  received_date date not null,
  quantity integer not null check (quantity > 0),
  remaining_quantity integer not null check (remaining_quantity >= 0 and remaining_quantity <= quantity),
  unit_cost numeric(18,2) not null check (unit_cost >= 0)
);
create index if not exists stock_lots_fifo on public.stock_lots(product_id,received_date,id) where remaining_quantity > 0;
create table if not exists public.stock_allocations (
  id bigint generated always as identity primary key,
  issue_id uuid not null references public.stock_movements(id),
  lot_id bigint not null references public.stock_lots(id),
  quantity integer not null check (quantity > 0),
  unit_cost numeric(18,2) not null,
  amount numeric(24,2) not null,
  unique(issue_id,lot_id)
);

-- 잔량 및 원장을 임의 수정하지 못하게 하고, 쓰기는 아래 트랜잭션 함수로만 허용합니다.
do $$
declare t text;
begin
  foreach t in array array['stock_products','stock_movements','stock_lots','stock_allocations'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('drop policy if exists stock_read on public.%I',t);
    execute format('create policy stock_read on public.%I for select to authenticated using ((select public.inventory_access_allowed()))',t);
  end loop;
end;
$$;

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
  coalesce(s.stock_amount/nullif(s.stock_quantity,0),0) as stock_unit_cost,coalesce(s.stock_amount,0) as stock_amount,p.color
from public.stock_products p left join movements m on m.product_id=p.id left join stock s on s.product_id=p.id;
revoke all on public.stock_summary from anon;
grant select on public.stock_summary to authenticated;

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
      or char_length(coalesce(p_details->>'storage_location','')) > 120
      or char_length(coalesce(p_details->>'supplier','')) > 120 then raise exception 'INVALID_PRODUCT_DETAILS'; end if;
    insert into public.stock_products(product_category,product_code,product_name,specification,material,color,storage_location,supplier)
    values(trim(p_details->>'product_category'),v_code,trim(p_details->>'product_name'),coalesce(p_details->>'specification',''),coalesce(p_details->>'material',''),coalesce(p_details->>'color',''),coalesce(p_details->>'storage_location',''),coalesce(p_details->>'supplier',''))
    on conflict (product_code) do nothing;
  end if;
  -- 같은 품목의 입출고를 직렬 처리합니다. 부족하면 함수 전체가 롤백됩니다.
  select * into v_product from public.stock_products where product_code=v_code for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
  select * into v_existing from public.stock_movements where request_id=p_request_id;
  if found then
    if v_existing.created_by <> auth.uid() or v_existing.request_payload <> v_payload then raise exception 'REQUEST_CONFLICT'; end if;
    return to_jsonb(v_existing);
  end if;
  if p_kind <> 'issue' and (
    v_product.product_category <> trim(p_details->>'product_category') or v_product.product_name <> trim(p_details->>'product_name')
    or v_product.specification <> coalesce(p_details->>'specification','') or v_product.material <> coalesce(p_details->>'material','')
    or v_product.color <> coalesce(p_details->>'color','')
    or v_product.storage_location <> coalesce(p_details->>'storage_location','') or v_product.supplier <> coalesce(p_details->>'supplier','')
  ) then raise exception 'PRODUCT_DETAILS_CONFLICT'; end if;
  if p_kind='opening' and exists(select 1 from public.stock_movements where product_id=v_product.id) then raise exception 'OPENING_ALREADY_STARTED'; end if;
  -- 이미 확정한 출고의 원가를 바꿀 수 있는 과거 입고는 허용하지 않습니다.
  select max(movement_date) into v_last_date from public.stock_movements
    where product_id=v_product.id and (p_kind='issue' or kind='issue');
  if p_date < v_last_date then raise exception 'BACKDATE_CONFLICT'; end if;
  if p_kind='issue' and coalesce((select sum(remaining_quantity) from public.stock_lots where product_id=v_product.id and received_date<=p_date),0) < p_quantity then
    raise exception 'INSUFFICIENT_STOCK';
  end if;
  insert into public.stock_movements(request_id,request_payload,product_id,kind,movement_date,quantity,unit_cost,amount,created_by)
  values(p_request_id,v_payload,v_product.id,p_kind,p_date,p_quantity,case when p_kind='issue' then 0 else p_unit_cost end,case when p_kind='issue' then 0 else p_quantity*p_unit_cost end,auth.uid()) returning id into v_id;
  if p_kind in ('opening','receipt') then
    insert into public.stock_lots(product_id,movement_id,received_date,quantity,remaining_quantity,unit_cost)
    values(v_product.id,v_id,p_date,p_quantity,p_quantity,p_unit_cost);
  else
    v_left := p_quantity;
    for v_lot in select * from public.stock_lots where product_id=v_product.id and remaining_quantity>0 and received_date<=p_date order by received_date,id for update loop
      v_take := least(v_left,v_lot.remaining_quantity);
      update public.stock_lots set remaining_quantity=remaining_quantity-v_take where id=v_lot.id;
      insert into public.stock_allocations(issue_id,lot_id,quantity,unit_cost,amount) values(v_id,v_lot.id,v_take,v_lot.unit_cost,v_take*v_lot.unit_cost);
      v_amount := v_amount + v_take*v_lot.unit_cost;
      v_left := v_left-v_take;
      exit when v_left=0;
    end loop;
    if v_left<>0 then raise exception 'INSUFFICIENT_STOCK'; end if;
    update public.stock_movements set amount=v_amount,unit_cost=round(v_amount/p_quantity,2) where id=v_id;
  end if;
  select * into v_existing from public.stock_movements where id=v_id;
  return to_jsonb(v_existing);
end;
$$;
revoke all on function public.post_stock_movement(uuid,text,date,jsonb,integer,numeric) from public, anon;
grant execute on function public.post_stock_movement(uuid,text,date,jsonb,integer,numeric) to authenticated;

do $$
declare t text;
begin
  if not exists(select 1 from pg_publication where pubname='supabase_realtime') then create publication supabase_realtime; end if;
  foreach t in array array['stock_products','stock_movements','stock_lots'] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I',t);
    end if;
  end loop;
end;
$$;
commit;

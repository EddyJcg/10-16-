-- Future purchasing workflow schema. Run after supabase/fifo.sql.

begin;

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),sequence_id bigint generated always as identity unique,
  order_number text not null unique check (char_length(trim(order_number)) between 1 and 80),
  supplier text not null default '' check (char_length(supplier)<=120),
  order_date date not null default ((now() at time zone 'Asia/Seoul')::date) check (order_date>=date '1900-01-01'),
  expected_date date check (expected_date is null or expected_date>=date '1900-01-01'),
  status text not null default '작성중' check (status in ('작성중','발주완료','부분입고','입고완료','취소')),
  notes text not null default '' check (char_length(notes)<=2000),created_by uuid not null,
  created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp()
);
create table if not exists public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),purchase_order_id uuid not null references public.purchase_orders(id) on delete restrict,
  line_number integer not null check (line_number>0),product_id uuid not null references public.stock_products(id),
  quantity integer not null check (quantity between 1 and 1000000),
  unit_cost numeric(18,2) check (unit_cost is null or unit_cost between 0 and 1000000000),
  received_quantity integer not null default 0 check (received_quantity between 0 and quantity),
  expected_date date check (expected_date is null or expected_date>=date '1900-01-01'),
  notes text not null default '' check (char_length(notes)<=1000),created_at timestamptz not null default clock_timestamp(),
  unique(purchase_order_id,line_number)
);
create index if not exists purchase_orders_status_date on public.purchase_orders(status,order_date desc,sequence_id desc);
create index if not exists purchase_order_lines_product on public.purchase_order_lines(product_id,purchase_order_id);
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_lines enable row level security;
revoke all on public.purchase_orders,public.purchase_order_lines from anon,authenticated;
grant select on public.purchase_orders,public.purchase_order_lines to authenticated;
drop policy if exists purchase_orders_read on public.purchase_orders;
create policy purchase_orders_read on public.purchase_orders for select to authenticated using ((select public.inventory_access_allowed()));
drop policy if exists purchase_order_lines_read on public.purchase_order_lines;
create policy purchase_order_lines_read on public.purchase_order_lines for select to authenticated using ((select public.inventory_access_allowed()));

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='purchase_orders') then alter publication supabase_realtime add table public.purchase_orders; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='purchase_order_lines') then alter publication supabase_realtime add table public.purchase_order_lines; end if;
end $$;
commit;

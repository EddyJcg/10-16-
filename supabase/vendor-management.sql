-- Run after supabase/schema.sql so inventory_access_allowed() is available.
begin;

create table if not exists public.business_partners (
  id uuid primary key default gen_random_uuid(),
  partner_number text,
  legal_name text not null check (char_length(trim(legal_name)) between 1 and 160),
  vendor_name text not null check (char_length(trim(vendor_name)) between 1 and 160),
  status text not null default '정상' check (status in ('정상','거래중지','휴면')),
  country_scope text not null default '국내' check (country_scope in ('국내','해외')),
  credit_grade text not null default 'A' check (char_length(credit_grade)<=20),
  country text not null default '대한민국' check (char_length(country)<=80),
  currency text not null default 'KRW' check (char_length(currency)<=12),
  selected_type_ids uuid[] not null default '{}',
  profile jsonb not null default '{}'::jsonb,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create unique index if not exists business_partners_number_unique
  on public.business_partners(partner_number) where nullif(trim(partner_number),'') is not null;
create index if not exists business_partners_name_search
  on public.business_partners using gin (to_tsvector('simple',legal_name||' '||vendor_name));

create table if not exists public.vendor_master_options (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('name_alias','vendor_type','vendor_category','payment_account')),
  code text not null check (char_length(trim(code)) between 1 and 80),
  name text not null check (char_length(trim(name)) between 1 and 160),
  details jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(category,code)
);

alter table public.business_partners enable row level security;
alter table public.vendor_master_options enable row level security;
revoke all on public.business_partners,public.vendor_master_options from anon;
grant select,insert,update,delete on public.business_partners,public.vendor_master_options to authenticated;
drop policy if exists business_partners_access on public.business_partners;
create policy business_partners_access on public.business_partners
  for all to authenticated
  using ((select public.inventory_access_allowed()))
  with check ((select public.inventory_access_allowed()));
drop policy if exists vendor_master_options_access on public.vendor_master_options;
create policy vendor_master_options_access on public.vendor_master_options
  for all to authenticated
  using ((select public.inventory_access_allowed()))
  with check ((select public.inventory_access_allowed()));

create or replace function public.touch_vendor_master_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at:=clock_timestamp();
  return new;
end;
$$;
drop trigger if exists business_partners_touch_updated_at on public.business_partners;
create trigger business_partners_touch_updated_at before update on public.business_partners
  for each row execute function public.touch_vendor_master_updated_at();
drop trigger if exists vendor_master_options_touch_updated_at on public.vendor_master_options;
create trigger vendor_master_options_touch_updated_at before update on public.vendor_master_options
  for each row execute function public.touch_vendor_master_updated_at();
revoke all on function public.touch_vendor_master_updated_at() from public,anon,authenticated;

insert into public.vendor_master_options(category,code,name,details,sort_order) values
  ('vendor_type','domestic-sales','국내매출거래처','{"transaction":"매출","businessNumberRequired":true}',1),
  ('vendor_type','overseas-sales','해외매출거래처','{"transaction":"매출"}',2),
  ('vendor_type','domestic-purchase','국내매입거래처','{"transaction":"매입","businessNumberRequired":true}',3),
  ('vendor_type','overseas-purchase','해외매입거래처','{"transaction":"매입"}',4),
  ('vendor_type','outsourcing','외주가공거래처','{"transaction":"일반","businessNumberRequired":true}',5),
  ('vendor_type','expense','비용거래처','{"transaction":"일반"}',6),
  ('vendor_type','government','관공서','{"transaction":"일반"}',7),
  ('vendor_type','individual','개인','{"transaction":"일반","residentNumberRequired":true}',8),
  ('vendor_type','other','기타','{"transaction":"일반"}',9),
  ('vendor_type','manufacturer','제조사','{"transaction":"매입"}',10)
on conflict(category,code) do update set name=excluded.name,details=excluded.details,sort_order=excluded.sort_order,is_active=true;

commit;

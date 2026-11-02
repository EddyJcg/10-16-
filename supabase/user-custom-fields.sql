-- Run after supabase/item-asset-classification.sql and supabase/edit-records.sql.
-- Field names and values are private to the authenticated user.
begin;

create table if not exists public.inventory_custom_field_profiles (
  user_id uuid not null references auth.users(id) on delete cascade,
  form_key text not null check (form_key in ('product','classification','sales-order','movement')),
  field_names jsonb not null default '["","","","",""]'::jsonb
    check (jsonb_typeof(field_names)='array' and jsonb_array_length(field_names)=5),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id,form_key)
);

create table if not exists public.inventory_custom_field_values (
  user_id uuid not null references auth.users(id) on delete cascade,
  form_key text not null check (form_key in ('product','classification','sales-order','movement')),
  record_id uuid not null,
  field_values jsonb not null
    check (jsonb_typeof(field_values)='array' and jsonb_array_length(field_values)=5),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id,form_key,record_id)
);

alter table public.inventory_custom_field_profiles enable row level security;
alter table public.inventory_custom_field_values enable row level security;
revoke all on public.inventory_custom_field_profiles,public.inventory_custom_field_values from anon,authenticated;
grant select on public.inventory_custom_field_profiles,public.inventory_custom_field_values to authenticated;

drop policy if exists inventory_custom_field_profiles_read on public.inventory_custom_field_profiles;
create policy inventory_custom_field_profiles_read on public.inventory_custom_field_profiles
  for select to authenticated using (user_id=(select auth.uid()) and (select public.inventory_access_allowed()));
drop policy if exists inventory_custom_field_values_read on public.inventory_custom_field_values;
create policy inventory_custom_field_values_read on public.inventory_custom_field_values
  for select to authenticated using (user_id=(select auth.uid()) and (select public.inventory_access_allowed()));

create or replace function public.save_inventory_custom_fields(
  p_form_key text,p_record_id uuid,p_field_names jsonb,p_field_values jsonb
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_index integer;
  v_name text;
  v_value text;
  v_field_names jsonb:='[]'::jsonb;
  v_field_values jsonb:='[]'::jsonb;
  v_user_id uuid:=auth.uid();
begin
  if v_user_id is null or not public.inventory_access_allowed() then
    raise exception 'ACCOUNT_DISABLED' using errcode='42501';
  end if;
  if p_form_key is null or p_form_key not in ('product','classification','sales-order','movement') or p_record_id is null
    or jsonb_typeof(p_field_names) is distinct from 'array'
    or jsonb_typeof(p_field_values) is distinct from 'array' then
    raise exception 'INVALID_CUSTOM_FIELDS' using errcode='22023';
  end if;
  if jsonb_array_length(p_field_names)<>5 or jsonb_array_length(p_field_values)<>5 then
    raise exception 'INVALID_CUSTOM_FIELDS' using errcode='22023';
  end if;
  for v_index in 0..4 loop
    if jsonb_typeof(p_field_names->v_index) is distinct from 'string'
      or jsonb_typeof(p_field_values->v_index) is distinct from 'string' then
      raise exception 'INVALID_CUSTOM_FIELDS' using errcode='22023';
    end if;
    v_name:=btrim(p_field_names->>v_index);
    v_value:=btrim(p_field_values->>v_index);
    if char_length(v_name)>80 or char_length(v_value)>2000
      or (v_name='' and v_value<>'') then
      raise exception 'INVALID_CUSTOM_FIELDS' using errcode='22023';
    end if;
    v_field_names:=v_field_names||jsonb_build_array(v_name);
    v_field_values:=v_field_values||jsonb_build_array(v_value);
  end loop;

  insert into public.inventory_custom_field_profiles(user_id,form_key,field_names,updated_at)
  values(v_user_id,p_form_key,v_field_names,clock_timestamp())
  on conflict(user_id,form_key) do update
    set field_names=excluded.field_names,updated_at=excluded.updated_at;
  insert into public.inventory_custom_field_values(user_id,form_key,record_id,field_values,updated_at)
  values(v_user_id,p_form_key,p_record_id,v_field_values,clock_timestamp())
  on conflict(user_id,form_key,record_id) do update
    set field_values=excluded.field_values,updated_at=excluded.updated_at;
end;
$$;
revoke all on function public.save_inventory_custom_fields(text,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.save_inventory_custom_fields(text,uuid,jsonb,jsonb) to authenticated;

commit;

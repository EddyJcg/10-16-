-- supabase/item-asset-classification.sql 및 supabase/user-admins.sql 실행 후에 실행하세요.
-- 품번 항목(코드표)을 저장하고, 등록·수정은 관리자만 가능하도록 합니다.
begin;

create table if not exists public.product_code_entries (
  id uuid primary key default gen_random_uuid(),
  group_key text not null check (group_key in ('name_prefix','name_part','product_type','size','color')),
  code text not null check (code ~ '^[A-Z0-9]{2}$'),
  label text not null check (char_length(label) between 1 and 120),
  created_at timestamptz not null default now(),
  constraint product_code_entries_group_code_key unique (group_key, code),
  constraint product_code_entries_group_label_key unique (group_key, label)
);

alter table public.product_code_entries enable row level security;
drop policy if exists product_code_entries_select on public.product_code_entries;
create policy product_code_entries_select on public.product_code_entries
  for select to authenticated using (true);
revoke insert, update, delete on public.product_code_entries from public, anon, authenticated;

create or replace function public.register_product_code_entry(p_group_key text, p_code text, p_label text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_label text := btrim(coalesce(p_label, ''));
begin
  if auth.uid() is not null and not public.inventory_admin_allowed() then
    raise exception 'CLASSIFICATION_ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if exists (select 1 from public.product_code_entries
             where group_key = p_group_key and (code = v_code or label = v_label)) then
    raise exception 'PRODUCT_CODE_ENTRY_DUPLICATE' using errcode = '23505';
  end if;
  insert into public.product_code_entries (group_key, code, label)
  values (p_group_key, v_code, v_label);
  return jsonb_build_object('group_key', p_group_key, 'code', v_code, 'label', v_label);
end;
$$;
revoke all on function public.register_product_code_entry(text, text, text) from public, anon;
grant execute on function public.register_product_code_entry(text, text, text) to authenticated;

-- 품명 1·2자리 (B·C열)
insert into public.product_code_entries (group_key, code, label) values
  ('name_prefix','TS','T-SHIRT'),('name_prefix','KT','KNIT'),('name_prefix','HT','HOOD T'),
  ('name_prefix','ST','SKIRT'),('name_prefix','BP','Back Pack'),('name_prefix','WL','Wallet'),
  ('name_prefix','CP','Cap'),('name_prefix','PC','Pouch'),('name_prefix','EB','Eco Bag')
on conflict do nothing;

-- 품명 3·4자리 제품명1 (D·E열)
insert into public.product_code_entries (group_key, code, label) values
  ('name_part','HL','Heart Lace'),('name_part','ND','Nabi Dance'),('name_part','DH','Dot Hug Fleece'),
  ('name_part','FH','Flower Hug Fleece'),('name_part','FR','Flower Reversible'),('name_part','RD','Rose Dot'),
  ('name_part','BK','Bloom Knee'),('name_part','BC','Ball Cap'),('name_part','TH','Trucker Hat'),
  ('name_part','BH','Bucket Hat'),('name_part','PH','Panama Hat'),('name_part','FD','Fedora'),
  ('name_part','BO','Boater Hat'),('name_part','SV','Sun Visor'),('name_part','CP','Cosmetic Pouch'),
  ('name_part','GG','Gadget'),('name_part','PP','Pencil Pouch'),('name_part','TP','Travel Pouch'),
  ('name_part','FP','Flat Pouch'),('name_part','DP','Drawstring Pouch'),('name_part','ZP','Zip Pouch'),
  ('name_part','WP','Wristlet Pouch'),('name_part','CE','Canvas Eco-bag'),('name_part','ME','Muslin Eco-bag'),
  ('name_part','PE','Nylon/Polyester Eco-bag'),('name_part','LE','Linen Eco-bag'),
  ('name_part','BE','Velvet/Corduroy Eco-bag'),('name_part','LW','Love Walk')
on conflict do nothing;

-- 제품유형 6·7자리 (G·H열)
insert into public.product_code_entries (group_key, code, label) values
  ('product_type','OO','Unspecified'),('product_type','ZU','Zip up'),('product_type','DT','Dot type'),
  ('product_type','SH','Shoulder type'),('product_type','TW','2-WAY'),('product_type','JK','Top'),
  ('product_type','PT','Bottom')
on conflict do nothing;

-- SIZE 8·9자리 (I·J열)
insert into public.product_code_entries (group_key, code, label) values
  ('size','FS','Free Size'),('size','2X','2XL Size'),('size','XL','XL Size'),
  ('size','MS','Medium Size'),('size','SS','Small Size')
on conflict do nothing;

-- 색상 10·11자리 (K·L열)
insert into public.product_code_entries (group_key, code, label) values
  ('color','01','Ash'),('color','02','Baltic'),('color','03','Beige'),('color','04','Black'),
  ('color','05','Deep Blue'),('color','06','Brown'),('color','07','Caramel'),('color','08','Charcoal'),
  ('color','09','Chermic'),('color','10','Chocolate'),('color','11','Citrone'),('color','12','Coronie Blue'),
  ('color','13','Cream'),('color','14','Dark Blue'),('color','15','Dark Gray'),('color','16','Eggplant'),
  ('color','17','Forest'),('color','18','Gray'),('color','19','Green'),('color','20','Ice'),
  ('color','21','Ice Green'),('color','22','Ivory'),('color','23','Mocha'),('color','24','Navy'),
  ('color','25','Olive'),('color','26','Orange'),('color','27','Orchid'),('color','28','Peach'),
  ('color','29','Pearl'),('color','30','Pink'),('color','31','Purple'),('color','32','Red'),
  ('color','33','Scarlet'),('color','34','Sky Blue'),('color','35','Stone Blue'),('color','36','Storm'),
  ('color','37','Sunset Gold'),('color','38','Tarp'),('color','39','White'),('color','40','Wine'),
  ('color','41','Yellow'),('color','42','Blue')
on conflict do nothing;

commit;

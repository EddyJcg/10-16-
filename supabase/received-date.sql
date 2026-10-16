-- 기존 재고와 접근 권한을 유지하면서 입고일자 열만 추가합니다.
alter table public.inventory_items add column if not exists received_date date;

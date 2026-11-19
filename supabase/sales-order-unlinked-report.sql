-- 품번으로 품목에 연결되지 않은 수주 조회 (읽기 전용)
-- product_id가 없는 수주를 보여주며, 품명·규격·단위가 같은 품목 후보와 품번 입력 여부를 함께 표시합니다.
-- 품번이 없는 수주는 수주 수정에서 품번을 입력해야 매출 등록할 수 있습니다.
select so.id,so.order_date,so.order_number,so.vendor_name,so.product_code,
  so.product_name,so.specification,so.unit,so.quantity,so.shipped_quantity,so.sales_status,
  case when trim(coalesce(so.product_code,''))='' then '품번 없음' else '품번 불일치' end as reason,
  (select string_agg(p.product_code,', ' order by p.product_code) from public.stock_products p
    where trim(p.product_name)=trim(so.product_name) and trim(p.specification)=trim(so.specification)
      and p.unit=so.unit) as candidate_product_codes
from public.sales_orders so
where so.product_id is null
order by so.order_date,so.order_number,so.sequence_id;

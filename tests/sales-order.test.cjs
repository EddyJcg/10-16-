const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {PRODUCT_UNITS,validOrderDueDate}=require('../inventory-model.js');

test('sales order dialog contains all requested fields and choices',()=>{
  const html=fs.readFileSync('inventory.html','utf8');
  const form=html.match(/<form id="sales-order-form" novalidate>([\s\S]*?)<\/form>/)?.[1]||'';
  assert.ok(form);
  for(const [id,label] of [
    ['sales_order_number','수주번호'],['sales_order_type','수주형태'],['sales_product_name','품명'],
    ['sales_specification','규격'],['sales_unit','단위'],['sales_quantity','수량'],
    ['sales_unit_price','단가'],['sales_amount','수주금액'],['sales_due_date','납기일자'],
    ['sales_delivery_method','배송방법'],['sales_address','주소'],['sales_notes','기타사항']
  ]){
    assert.match(form,new RegExp(`id="${id}"`),id);
    assert.ok(form.includes('>'+label+'</label>'),label);
  }
  assert.match(form,/id="sales_order_type" required><option value="">선택하세요<\/option><option value="온라인 수주">온라인 수주<\/option><option value="오프라인 수주">오프라인 수주<\/option>/);
  assert.match(form,/id="sales_amount" readonly/);
  assert.match(html,/id="sales-order-items"/);
  assert.match(html,/<th>일련번호<\/th><th>수주일자<\/th><th>수주번호<\/th>/);
  assert.match(fs.readFileSync('inventory-app.js','utf8'),/String\(order\.order_date\)\.slice\(0,10\)/);
});

test('sales order amount updates from quantity and unit price',()=>{
  const fields={sales_quantity:{value:'3'},sales_unit_price:{value:'1250.5'},sales_amount:{value:''}};
  const context=vm.createContext({document:{getElementById:id=>fields[id]},money:value=>Number(value).toLocaleString('ko-KR',{maximumFractionDigits:2})});
  vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),context);
  vm.runInContext('updateSalesAmount()',context);
  assert.equal(fields.sales_amount.value,'3,751.5원');
  fields.sales_quantity.value='0';
  vm.runInContext('updateSalesAmount()',context);
  assert.equal(fields.sales_amount.value,'');
});

test('sales order due dates accept valid historical and future dates',()=>{
  assert.equal(validOrderDueDate('2026-12-31'),true);
  assert.equal(validOrderDueDate('2026-02-29'),false);
  assert.equal(validOrderDueDate('1899-12-31'),false);
});

test('sales order dialog is connected to the authenticated database save flow',()=>{
  const html=fs.readFileSync('inventory.html','utf8');
  const script=fs.readFileSync('inventory-app.js','utf8');
  const sql=fs.readFileSync('supabase/fifo.sql','utf8');
  assert.match(html,/id="sales-order-button"/);
  assert.match(html,/<dialog id="sales-order-dialog"/);
  assert.match(script,/function showSalesOrder\(\)/);
  assert.match(script,/function saveSalesOrder\(event\)/);
  assert.match(script,/client\.rpc\('register_sales_order'/);
  assert.match(script,/sales-order-form'\)\.addEventListener\('submit',saveSalesOrder\)/);
  assert.match(sql,/create table if not exists public\.sales_orders/);
  assert.match(sql,/create or replace function public\.register_sales_order/);
});

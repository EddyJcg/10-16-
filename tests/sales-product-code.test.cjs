const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ExcelJS=require('exceljs');
const {parseSalesOrderImportWorkbook}=require('../inventory-import.js');

test('품번 입력은 배송방법 다음에 위치하고 품목별 가수주와 수정에 유지된다',()=>{
  const html=fs.readFileSync('inventory.html','utf8');
  assert.match(html,/id="sales_delivery_method"[^>]*><\/div>\s*<div class="field"><label for="sales_product_code">품번<\/label><input id="sales_product_code" required maxlength="80"/);
  const elements=new Map();
  const element=id=>{
    if(!elements.has(id))elements.set(id,{value:'',textContent:'',focus(){}});
    return elements.get(id);
  };
  const context=vm.createContext({document:{getElementById:element},validOrderDueDate:()=>true});
  vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),context);
  context.renderSalesDraftLines=()=>{};
  for(const [id,value] of Object.entries({
    sales_order_date:'2026-11-01',sales_order_number:'SO-1',sales_order_type:'온라인 수주',sales_vendor_name:'거래처',
    sales_product_code:' SKU-1 ',sales_product_name:'품목',sales_specification:'규격',sales_unit:'EA(개)',
    sales_quantity:'2',sales_unit_price:'30',sales_due_date:'2026-12-01'
  }))element(id).value=value;
  vm.runInContext('addSalesOrderLine()',context);
  assert.equal(vm.runInContext('salesDraftLines[0].product_code',context),'SKU-1');
  assert.equal(element('sales_product_code').value,'');
  assert.equal(vm.runInContext("salesOrderRecordPayload({id:'1',product_code:'SKU-1',due_date:'2026-12-01'}).product_code",context),'SKU-1');
  vm.runInContext(`salesOrders=[{id:'1',order_group_id:'g',product_code:'SKU-2',product_name:'품목',
    specification:'',unit:'EA(개)',quantity:2,unit_price:30,due_date:'2026-12-01'}];
    salesOrderDownstreamReason=()=>'';editSalesOrder('1')`,context);
  assert.equal(vm.runInContext('salesDraftLines[0].product_code',context),'SKU-2');
});

test('등록된 품번 입력과 선택으로 품목정보를 채우고 다른 값에는 기존 자동입력을 해제한다',()=>{
  const elements=new Map();
  const element=id=>{
    if(!elements.has(id))elements.set(id,{value:'',textContent:'',children:[],
      replaceChildren(){this.children=[];},append(child){this.children.push(child);}});
    return elements.get(id);
  };
  const context=vm.createContext({document:{getElementById:element,createElement:()=>({})}});
  vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),context);
  vm.runInContext(`items=[
    {product_code:'SKU-1',product_name:'품목 1',specification:'규격 1',unit:'Box'},
    {product_code:'SKU-2',product_name:'품목 2',specification:'',unit:'EA(개)',quantity_management_disabled:true}
  ];populateSalesProductCodes()`,context);
  assert.deepEqual(element('sales-product-codes').children.map(option=>option.value),['SKU-1','SKU-2']);
  element('sales_product_code').value=' sku-1 ';
  vm.runInContext('populateSalesProductDetails()',context);
  assert.equal(element('sales_product_name').value,'품목 1');
  assert.equal(element('sales_specification').value,'규격 1');
  assert.equal(element('sales_unit').value,'Box');
  element('sales_specification').value='직접 수정';
  element('sales_product_code').value='UNKNOWN';
  vm.runInContext('populateSalesProductDetails(true)',context);
  assert.equal(element('sales_product_name').value,'');
  assert.equal(element('sales_specification').value,'직접 수정');
  assert.equal(element('sales_unit').value,'');
  assert.match(element('sales-product-code-message').textContent,/등록된 품번이 아닙니다/);
  element('sales_product_code').value='sku-2';
  vm.runInContext('populateSalesProductDetails(true)',context);
  assert.equal(element('sales_product_code').value,'SKU-2');
  assert.equal(element('sales_product_name').value,'품목 2');
  assert.equal(element('sales_specification').value,'');
  assert.equal(element('sales_unit').value,'EA(개)');
  assert.equal(element('sales-product-code-message').textContent,'');
  element('sales_product_code').value='';
  vm.runInContext('populateSalesProductDetails()',context);
  assert.equal(element('sales_product_name').value,'');
  assert.equal(element('sales_unit').value,'');
  const html=fs.readFileSync('inventory.html','utf8'),app=fs.readFileSync('inventory-app.js','utf8');
  assert.match(html,/id="sales_product_code"[^>]*list="sales-product-codes"/);
  assert.match(app,/sales_product_code'\)\.addEventListener\('input',\(\)=>populateSalesProductDetails\(\)\)/);
  assert.match(app,/sales_product_code'\)\.addEventListener\('change',\(\)=>populateSalesProductDetails\(true\)\)/);
});

test('품번 저장 설정이 없으면 수주 저장 전에 오류를 알린다',async()=>{
  const context=vm.createContext({document:{getElementById:()=>({})}});
  vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),context);
  context.testClient={rpc:async()=>({data:null,error:{code:'PGRST202'}})};
  vm.runInContext('client=testClient',context);
  await assert.rejects(vm.runInContext("ensureSalesOrderProductCodeReady([{product_code:'SKU'}])",context),/sales-order-groups\.sql/);
  await vm.runInContext("ensureSalesOrderProductCodeReady([{product_code:''}])",context);
});

test('수주 엑셀의 선택 품번 열을 읽고 길이를 검증한다',()=>{
  const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('수주');
  sheet.addRow(['품번','품명','규격','단위','수량','단가','납기일자']);
  sheet.addRow([' SKU-1 ','품목','','EA(개)',1,100,'2026-12-01']);
  let result=parseSalesOrderImportWorkbook(workbook,['EA(개)']);
  assert.deepEqual(result.errors,[]);
  assert.equal(result.rows[0].product_code,'SKU-1');
  sheet.getRow(2).getCell(1).value='A'.repeat(81);
  result=parseSalesOrderImportWorkbook(workbook,['EA(개)']);
  assert.match(result.errors[0],/품번은 80자/);
});

test('수주 DB는 품목별 품번을 저장하고 기존 호출과 수정 시 보존한다',async()=>{
  const {PGlite}=await import('@electric-sql/pglite');
  const db=new PGlite();
  try{
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
      create function public.inventory_access_allowed() returns boolean language sql as $$ select true $$;
      create table public.sales_orders (
        id uuid primary key default gen_random_uuid(), sequence_id bigint generated always as identity,
        order_date date,order_number text,order_type text,vendor_id uuid,vendor_name text,vendor_contact text,
        product_name text,specification text,unit text,quantity integer,unit_price numeric,amount numeric,due_date date,
        delivery_method text,address text,notes text,created_by uuid,shipped_quantity integer not null default 0
      );
      create table public.stock_movements (sales_order_id uuid references public.sales_orders(id));`);
    const sql=fs.readFileSync('supabase/sales-order-groups.sql','utf8');
    await db.exec(sql);await db.exec(sql);
    const line={product_code:' SKU-1 ',product_name:'품목',specification:'',unit:'EA(개)',quantity:2,unit_price:30,due_date:'2026-12-01'};
    const args=['2026-11-01','SO-1','온라인 수주','거래처','','',[line]];
    const registered=(await db.query('select public.register_sales_order_group($1,$2,$3,$4,$5,$6,$7) as result',args)).rows[0].result;
    assert.equal(registered.orders[0].product_code,'SKU-1');
    const id=registered.orders[0].id;
    const changed={...line,line_id:id,product_code:'SKU-2'};
    const update=[registered.group_id,...args.slice(0,6),[changed]];
    let updated=(await db.query('select public.update_sales_order_group($1,$2,$3,$4,$5,$6,$7,$8) as result',update)).rows[0].result;
    assert.equal(updated.orders[0].product_code,'SKU-2');
    delete changed.product_code;
    updated=(await db.query('select public.update_sales_order_group($1,$2,$3,$4,$5,$6,$7,$8) as result',update)).rows[0].result;
    assert.equal(updated.orders[0].product_code,'SKU-2');
    await assert.rejects(db.query('select public.register_sales_order_group($1,$2,$3,$4,$5,$6,$7)',
      [...args.slice(0,6),[{...line,product_code:'A'.repeat(81)}]]),/INVALID_SALES_ORDER_LINE/);
    const additional={...line,product_code:'SKU-3',product_name:'두번째'};
    const group=(await db.query('select public.register_sales_order_group($1,$2,$3,$4,$5,$6,$7)',
      [...args.slice(0,6),[line,additional]])).rows[0].register_sales_order_group;
    await db.query('insert into public.stock_movements(sales_order_id) values($1)',[group.orders[1].id]);
    await assert.rejects(db.query('select public.delete_sales_order_line($1)',[group.orders[0].id]),/SALES_ORDER_HAS_SHIPMENTS/);
    await db.query('delete from public.stock_movements where sales_order_id=$1',[group.orders[1].id]);
    await db.query('update public.sales_orders set shipped_quantity=1 where id=$1',[group.orders[1].id]);
    await assert.rejects(db.query('select public.delete_sales_order_line($1)',[group.orders[0].id]),/SALES_ORDER_HAS_SHIPMENTS/);
    await db.query('update public.sales_orders set shipped_quantity=0 where id=$1',[group.orders[1].id]);
    await db.exec("alter table public.sales_orders add column sales_progress_status text");
    await db.query("update public.sales_orders set sales_progress_status='완료' where id=$1",[group.orders[1].id]);
    await assert.rejects(db.query('select public.delete_sales_order_line($1)',[group.orders[0].id]),/SALES_ORDER_HAS_SHIPMENTS/);
    await db.query("update public.sales_orders set sales_progress_status='진행' where id=$1",[group.orders[1].id]);
    const deleted=(await db.query('select public.delete_sales_order_line($1) as result',[group.orders[0].id])).rows[0].result;
    assert.equal(deleted.id,group.orders[0].id);
    assert.equal((await db.query('select count(*)::int as count from public.sales_orders where order_group_id=$1',[group.group_id])).rows[0].count,1);
    await assert.rejects(db.query('select public.delete_sales_order_line($1)',[group.orders[0].id]),/SALES_ORDER_NOT_FOUND/);
  }finally{await db.close();}
});

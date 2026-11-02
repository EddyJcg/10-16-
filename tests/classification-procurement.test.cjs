const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const {randomUUID}=require('node:crypto');
const {currentStockRows,isStockLedgerManaged,stockRiskItems,nextPurchaseOrderNumber}=require('../inventory-model.js');

test('classification management flags remove items from inventory reports',()=>{
  const managed={stock_quantity:0,standard_stock_quantity:10,shortage_control_enabled:true};
  assert.equal(isStockLedgerManaged(managed),true);
  assert.equal(isStockLedgerManaged({...managed,quantity_management_disabled:true}),false);
  assert.equal(isStockLedgerManaged({...managed,value_management_disabled:true}),false);
  assert.equal(stockRiskItems([{...managed,quantity_management_disabled:true},{...managed,value_management_disabled:true}]).length,0);
  assert.equal(currentStockRows([
    {...managed,stock_quantity:2},
    {...managed,stock_quantity:2,quantity_management_disabled:true},
    {...managed,stock_quantity:2,value_management_disabled:true}
  ]).length,1);
});

test('purchase order numbers increment by order date and reset daily',()=>{
  const orders=[
    {order_number:'ISPO20261102-0001'},
    {order_number:'ISPO20261102-0003'},
    {order_number:'ISPO20261101-0008'},
    {order_number:'PO-LEGACY'}
  ];
  assert.equal(nextPurchaseOrderNumber('2026-11-02',orders),'ISPO20261102-0004');
  assert.equal(nextPurchaseOrderNumber('2026-11-03',orders),'ISPO20261103-0001');
  assert.equal(nextPurchaseOrderNumber('invalid',orders),'');
  assert.equal(nextPurchaseOrderNumber('2026-11-02',[{order_number:'ISPO20261102-9999'}]),'');
});

test('classification and procurement UI permits incomplete classification selection and separates unmanaged receipts',()=>{
  const app=readFileSync('inventory-app.js','utf8'),html=readFileSync('inventory.html','utf8'),importer=readFileSync('inventory-import.js','utf8');
  const style=readFileSync('inventory.css','utf8'),purchaseStyle=readFileSync('purchase-order.css','utf8');
  const workflow=readFileSync('supabase/classification-procurement-workflow.sql','utf8');
  assert.match(app,/option\.textContent=classification\.name\+\(classification\.inventory_asset_type\?/);
  assert.doesNotMatch(app,/option\.disabled=!classification\.inventory_asset_type/);
  assert.match(app,/if\(!selectedClassification\?\.inventory_asset_type\)/);
  assert.match(html,/id="purchase-entry-button"/);
  assert.match(html,/id="purchase-query-button"/);
  assert.match(html,/id="purchase-order-number" required maxlength="17" readonly/);
  assert.match(html,/id="purchase-order-date" type="date" required/);
  assert.match(html,/id="purchase-order-supplier" required><option value="">등록 거래처 선택<\/option><\/select>/);
  assert.match(html,/id="purchase-line-product" required><option value="">품목정보 등록에서 선택<\/option><\/select>/);
  assert.match(html,/<div class="dialog-footer"><button type="button" id="add-purchase-line" class="primary">품목 추가<\/button><button id="save-purchase-order" class="primary">발주 저장<\/button><\/div>/);
  const purchaseLineForm=html.match(/<div class="form-grid purchase-order-line-form">([\s\S]*?)<\/div>\s*<div class="purchase-product-details"/)?.[1]||'';
  assert.ok(purchaseLineForm);
  assert.doesNotMatch(purchaseLineForm,/id="add-purchase-line"/);
  assert.match(app,/async function loadRegisteredVendors\(\)[\s\S]*from\('business_partners'\)/);
  assert.match(app,/function populatePurchaseProductOptions\(\)[\s\S]*items\.forEach\(item=>\{[\s\S]*option\.value=item\.id/);
  assert.match(app,/if\(!items\.some\(item=>item\.id===productId\)\)\{\$\('purchase-order-status'\)\.textContent='등록된 품목을 선택하세요\.'/);
  assert.match(app,/async function loadPurchaseOrderVendors\(\)[\s\S]*populatePurchaseOrderVendorOptions\(\)/);
  assert.match(app,/const supplier=String\(selectedVendor\?\.legal_name\|\|selectedVendor\?\.vendor_name\|\|''\)\.trim\(\)/);
  assert.match(app,/p_order_number:orderNumber,p_supplier:supplier/);
  assert.match(app,/async function showPurchaseOrders\(mode='entry'\)[\s\S]*purchase-order-entry'\)\.hidden=isQuery[\s\S]*purchase-order-view'\)\.hidden=!isQuery/);
  assert.match(app,/\$\('purchase-entry-button'\)\.addEventListener\('click',\(\)=>showPurchaseOrders\('entry'\)\)/);
  assert.match(app,/\$\('purchase-query-button'\)\.addEventListener\('click',\(\)=>showPurchaseOrders\('query'\)\)/);
  assert.match(app,/function updatePurchaseOrderNumber\(\)[\s\S]*nextPurchaseOrderNumber\(\$\('purchase-order-date'\)\.value,purchaseOrders\)/);
  assert.match(app,/\$\('purchase-order-date'\)\.addEventListener\('change'/);
  assert.match(app,/orderDate<todayDate\(\)/);
  assert.match(workflow,/p_order_date<\(now\(\) at time zone 'Asia\/Seoul'\)::date[\s\S]*PURCHASE_ORDER_DATE_IN_PAST/);
  assert.match(workflow,/pg_advisory_xact_lock\(hashtext\('purchase-order-number'\),hashtext\(p_order_date::text\)\)/);
  assert.match(workflow,/v_order_number:='ISPO'\|\|to_char\(p_order_date,'YYYYMMDD'\)\|\|'-'\|\|lpad\(v_next_order_number::text,4,'0'\)/);
  assert.match(html,/id="purchase-draft-items"/);
  assert.match(html,/id="purchase-product-category" readonly/);
  assert.match(html,/id="purchase-inventory-asset-type" readonly/);
  assert.match(html,/id="purchase-product-unit" readonly/);
  assert.match(html,/id="purchase-product-material" readonly/);
  assert.match(html,/id="purchase-product-color" readonly/);
  assert.match(app,/function updatePurchaseProductDetails\(\)[\s\S]*item\?\.classification_name\|\|item\?\.product_category[\s\S]*item\?\.inventory_asset_type[\s\S]*item\?\.unit[\s\S]*item\?\.material[\s\S]*item\?\.color/);
  assert.match(app,/\$\('purchase-line-product'\)\.addEventListener\('change',updatePurchaseProductDetails\)/);
  assert.match(purchaseStyle,/\.purchase-order-line-form>button\{height:42px;margin-bottom:16px/);
  assert.match(purchaseStyle,/#purchase-order-entry \.field>label\{font-size:18\.72px\}/);
  assert.match(purchaseStyle,/#purchase-order-entry>h3\{font-size:18\.2px\}/);
  assert.match(html,/purchase-order\.css\?v=20261102-purchase-entry-label-size/);
  assert.match(purchaseStyle,/\.purchase-order-dialog \.dialog-footer #add-purchase-line,[\s\S]*#save-purchase-order\{[\s\S]*width:160px;height:48px[\s\S]*transform:scale\(\.8\)/);
  assert.match(purchaseStyle,/\.purchase-product-details\{display:grid;grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(purchaseStyle,/@media\(max-width:520px\)\{\.purchase-product-details\{grid-template-columns:1fr\}\}/);
  assert.match(html,/id="purchase-receive-form"/);
  assert.match(app,/client\.rpc\('create_purchase_order'/);
  assert.match(app,/client\.rpc\('receive_purchase_order_line'/);
  assert.match(importer,/item\.quantity_management_disabled===true\|\|item\.value_management_disabled===true/);
  assert.match(html,/<th>재고수량관리 안함<\/th><th>재고금액관리 안함<\/th><th>재고부족통제<\/th><th>세트품목<\/th><th>Lot관리기본값<\/th>/);
  assert.match(app,/function classificationFlag\(value\)[\s\S]*value===true\|\|value===1\|\|value==='1'\|\|value==='true'/);
  assert.match(style,/#asset-classification-dialog \.asset-classification-form \.form-grid \.field > label\{font-size:18\.72px\}/);
  assert.match(style,/classification-checkboxes input\[type="checkbox"\]\{transform:scaleX\(1\.5\) scaleY\(1\.3\)/);
  assert.match(style,/dialog-footer>#save-asset-classification\{transform:scale\(\.81\)/);
  assert.match(html,/inventory\.css\?v=20261022-login-input-font-120-targeted-classification-label-size/);
  assert.doesNotMatch(html,/선택하면 원자재 수불부에 반영하지 않습니다|변경해도 기존 거래의 단가·금액은 수정되지 않습니다|선택 시 적정재고 미달 품목을 품절위험 목록에 표시합니다/);
});

test('purchase order supplier options are limited to registered business partners',()=>{
  const supplier={value:'',options:[],disabled:true,replaceChildren(...options){this.options=options;},add(option){this.options.push(option);},focus(){}};
  const context=vm.createContext({
    document:{getElementById:id=>id==='purchase-order-supplier'?supplier:null},
    Option:function(text,value){return {textContent:text,value};}
  });
  vm.runInContext(readFileSync('inventory-app.js','utf8'),context);
  vm.runInContext(`purchaseOrderVendors=[
    {id:'partner-1',legal_name:'상호 A',vendor_name:'등록 거래처 A'},
    {id:'partner-2',legal_name:'등록 거래처 B',vendor_name:'등록 거래처 B'}
  ];purchaseOrderVendorsLoaded=true;populatePurchaseOrderVendorOptions()`,context);
  assert.equal(supplier.disabled,false);
  assert.deepEqual(supplier.options.map(option=>option.value),['','partner-1','partner-2']);
  assert.deepEqual(supplier.options.map(option=>option.textContent),['등록 거래처 선택','상호 A · 등록 거래처 A','등록 거래처 B']);
  supplier.value='partner-2';
  vm.runInContext('populatePurchaseOrderVendorOptions()',context);
  assert.equal(supplier.value,'partner-2','repopulating options preserves a still-registered selection');
  vm.runInContext('purchaseOrderVendors=[];purchaseOrderVendorsLoaded=false;populatePurchaseOrderVendorOptions()',context);
  assert.equal(supplier.disabled,true);
  assert.deepEqual(supplier.options.map(option=>option.value),['']);
});

test('purchase order receipts update stock only for fully managed products',async()=>{
  const {PGlite}=await import('@electric-sql/pglite');
  const db=new PGlite();
  try{
    await db.exec(`create role anon; create role authenticated; create schema auth;
      grant usage on schema public,auth to anon,authenticated;
      create function auth.uid() returns uuid language sql as $$ select '00000000-0000-4000-8000-000000000001'::uuid $$;
      create function public.inventory_access_allowed() returns boolean language sql as $$ select true $$;`);
    await db.exec(readFileSync('supabase/fifo.sql','utf8'));
    await db.exec(readFileSync('supabase/item-asset-classification.sql','utf8'));
    await db.exec(readFileSync('supabase/classification-value-management-edit.sql','utf8'));
    await db.exec(readFileSync('supabase/procurement-schema.sql','utf8'));
    const workflow=readFileSync('supabase/classification-procurement-workflow.sql','utf8');
    await db.exec(workflow);await db.exec(workflow);
    const orderDate=(await db.query("select (now() at time zone 'Asia/Seoul')::date::text as today")).rows[0].today;

    const registerClass=async(name,quantityDisabled,valueDisabled)=>(
      await db.query(`insert into public.stock_product_classifications
        (name,inventory_asset_type,quantity_management_disabled,value_management_disabled)
        values($1,'원자재',$2,$3) returning id`,[name,quantityDisabled,valueDisabled])
    ).rows[0].id;
    const registerProduct=async(code,name,classificationId)=>(
      await db.query('select public.register_stock_product($1) as result',[{
        product_category:name,classification_id:classificationId,product_code:code,product_name:code,
        specification:'규격',material:'재질',color:'색상',unit:'EA(개)',standard_stock_quantity:5
      }])
    ).rows[0].result;
    const managedId=await registerClass('수량금액관리',false,false);
    const quantityOffId=await registerClass('수량관리안함',true,false);
    const valueOffId=await registerClass('금액관리안함',false,true);
    const managed=await registerProduct('TRACKED','수량금액관리',managedId);
    const quantityOff=await registerProduct('NO-QTY','수량관리안함',quantityOffId);
    const valueOff=await registerProduct('NO-VALUE','금액관리안함',valueOffId);
    const order=(await db.query(`select public.create_purchase_order($1,$2,$3,$4,$5,$6::jsonb) as result`,[
      'IGNORED-CLIENT-NUMBER','납품업체',orderDate,orderDate,'검증',
      JSON.stringify([
        {product_id:managed.id,quantity:3,unit_cost:100,expected_date:'2026-01-10'},
        {product_id:quantityOff.id,quantity:2,unit_cost:20},
        {product_id:valueOff.id,quantity:4,unit_cost:30}
      ])
    ])).rows[0].result;
    assert.equal(order.status,'발주완료');
    assert.equal(order.order_number,`ISPO${orderDate.replaceAll('-','')}-0001`);
    const secondOrder=(await db.query(`select public.create_purchase_order($1,$2,$3,$4,$5,$6::jsonb) as result`,[
      'IGNORED-CLIENT-NUMBER','납품업체',orderDate,null,'검증',
      JSON.stringify([{product_id:managed.id,quantity:1,unit_cost:100}])
    ])).rows[0].result;
    assert.equal(secondOrder.order_number,`ISPO${orderDate.replaceAll('-','')}-0002`);
    const lines=(await db.query('select * from public.purchase_order_lines where purchase_order_id=$1 order by line_number',[order.id])).rows;
    const receive=async(line,quantity,cost,date='2026-01-03',requestId=randomUUID())=>(
      await db.query('select public.receive_purchase_order_line($1,$2,$3,$4,$5) as result',[requestId,line.id,date,quantity,cost])
    ).rows[0].result;

    const trackedResult=await receive(lines[0],2,100);
    assert.equal(trackedResult.stock_tracked,true);
    assert.equal((await db.query(`select count(*)::int as count from public.stock_movements m
      join public.stock_products p on p.id=m.product_id where p.product_code='TRACKED' and m.kind='receipt'`)).rows[0].count,1);
    const trackedSummary=(await db.query(`select receipt_quantity,stock_quantity from public.stock_summary where product_code='TRACKED'`)).rows[0];
    assert.equal(Number(trackedSummary.receipt_quantity),2);
    assert.equal(Number(trackedSummary.stock_quantity),2);

    const saveClassification=async(valueDisabled,quantityDisabled=false)=>(
      await db.query('select public.save_stock_product_classification($1::jsonb) as result',[JSON.stringify({
        id:managedId,name:'수량금액관리',inventory_asset_type:'원자재',
        quantity_management_disabled:quantityDisabled,value_management_disabled:valueDisabled,
        shortage_control_enabled:true,is_set_item:false,lot_management_default:false,notes:''
      })])
    ).rows[0].result;
    const turnedOff=await saveClassification(true);
    assert.equal(turnedOff.value_management_disabled,true);
    const turnedOn=await saveClassification(false);
    assert.equal(turnedOn.value_management_disabled,false);
    const persistedFlags=(await db.query('select value_management_disabled from public.stock_product_classifications where id=$1',[managedId])).rows[0];
    assert.equal(persistedFlags.value_management_disabled,false,'the table receives the value-management change after saving');
    await assert.rejects(saveClassification(false,true),/CLASSIFICATION_HAS_LEDGER_HISTORY/);

    const quantityResult=await receive(lines[1],2,20);
    const valueResult=await receive(lines[2],4,30);
    assert.equal(quantityResult.stock_tracked,false);
    assert.equal(valueResult.stock_tracked,false);
    const unmanagedSummary=(await db.query(`select product_code,receipt_quantity,issue_quantity,stock_quantity,stock_amount
      from public.stock_summary where product_code in ('NO-QTY','NO-VALUE') order by product_code`)).rows;
    assert.deepEqual(unmanagedSummary.map(row=>[row.product_code,Number(row.receipt_quantity),Number(row.issue_quantity),Number(row.stock_quantity),Number(row.stock_amount)]),
      [['NO-QTY',0,0,0,0],['NO-VALUE',0,0,0,0]]);
    assert.equal((await db.query(`select count(*)::int as count from public.purchase_order_receipts where not stock_tracked`)).rows[0].count,2);
    assert.equal((await db.query(`select count(*)::int as count from public.stock_movements m
      join public.stock_products p on p.id=m.product_id where p.product_code in ('NO-QTY','NO-VALUE')`)).rows[0].count,0);
    await assert.rejects(db.query(`select public.post_stock_movement($1,'receipt','2026-01-04',$2,1,1)`,[
      randomUUID(),{product_category:'수량관리안함',product_code:'NO-QTY',product_name:'NO-QTY',specification:'규격',material:'재질',color:'색상',unit:'EA(개)'}
    ]),/STOCK_LEDGER_DISABLED/);
    await assert.rejects(db.query(`select public.post_stock_movement($1,'receipt','2026-01-04',$2,1,1)`,[
      randomUUID(),{product_category:'금액관리안함',product_code:'NO-VALUE',product_name:'NO-VALUE',specification:'규격',material:'재질',color:'색상',unit:'EA(개)'}
    ]),/STOCK_LEDGER_DISABLED/);
    await assert.rejects(receive(lines[0],2,100),/PURCHASE_RECEIPT_EXCEEDS_ORDER/);
    const complete=await receive(lines[0],1,100);
    assert.equal(complete.order.status,'입고완료');
    const retry=await db.query(`select public.receive_purchase_order_line($1,$2,$3,$4,$5) as result`,[
      trackedResult.receipt.request_id,lines[0].id,'2026-01-03',2,100
    ]);
    assert.equal(retry.rows[0].result.idempotent,true);
    assert.equal((await db.query('select received_quantity from public.purchase_order_lines where id=$1',[lines[0].id])).rows[0].received_quantity,3);
    await assert.rejects(db.query(`select public.create_purchase_order($1,$2,$3,$4,$5,$6::jsonb)`,[
      'PO-INVALID','업체',orderDate,null,'',JSON.stringify([{product_id:randomUUID(),quantity:1,unit_cost:1}])
    ]),/PRODUCT_INFO_REQUIRED/);
    assert.equal((await db.query(`select count(*)::int as count from public.purchase_orders where order_number='PO-INVALID'`)).rows[0].count,0);
    const pastDate=(await db.query("select ((now() at time zone 'Asia/Seoul')::date-1)::text as yesterday")).rows[0].yesterday;
    await assert.rejects(db.query(`select public.create_purchase_order($1,$2,$3,$4,$5,$6::jsonb)`,[
      'IGNORED-CLIENT-NUMBER','업체',pastDate,null,'',JSON.stringify([{product_id:managed.id,quantity:1,unit_cost:1}])
    ]),/PURCHASE_ORDER_DATE_IN_PAST/);
  }finally{await db.close();}
});

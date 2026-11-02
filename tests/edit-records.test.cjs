const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');

test('record editing preserves product, sales and FIFO ledger consistency',async()=>{
  const {PGlite}=await import('@electric-sql/pglite');
  const db=new PGlite();
  try{
    await db.exec(`create role anon; create role authenticated; create schema auth;
      grant usage on schema public,auth to anon,authenticated;
      create function auth.uid() returns uuid language sql as $$ select '00000000-0000-4000-8000-000000000001'::uuid $$;
      create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
      create function public.inventory_access_allowed() returns boolean language sql as $$ select current_setting('test.active',true) is distinct from 'false' $$;`);
    await db.exec(readFileSync('supabase/fifo.sql','utf8'));
    await db.exec(readFileSync('supabase/item-asset-classification.sql','utf8'));
    await db.exec(readFileSync('supabase/vendor-management.sql','utf8'));
    const editMigration=readFileSync('supabase/edit-records.sql','utf8');
    await db.exec(editMigration);
    await db.exec(editMigration);
    const legacyClassification=(await db.query(`select id,name from public.stock_product_classifications
      where inventory_asset_type is not null limit 1`)).rows[0];
    await db.query('select public.register_stock_product($1)',[{
      product_category:legacyClassification.name,classification_id:legacyClassification.id,product_code:'LEGACY-ITEM',
      product_name:'기존 품목',specification:'과거 규격',material:'',color:'',unit:'EA(개)',standard_stock_quantity:1
    }]);
    await db.exec(readFileSync('supabase/product-info-controls.sql','utf8'));
    assert.equal((await db.query(`select created_by_name from public.stock_products where product_code='LEGACY-ITEM'`)).rows[0].created_by_name,'기존 등록자');
    await db.query(`select set_config('request.jwt.claims',$1,false)`,[JSON.stringify({
      sub:'00000000-0000-4000-8000-000000000001',email:'tester@example.com',user_metadata:{full_name:'테스트 등록자'}
    })]);
    const vendorMigration=readFileSync('supabase/sales-order-vendor.sql','utf8');
    await db.exec(vendorMigration);
    await db.exec(vendorMigration);
    const salesGroupsMigration=readFileSync('supabase/sales-order-groups.sql','utf8');
    await db.exec(salesGroupsMigration);
    await db.exec(salesGroupsMigration);
    const salesStatusMigration=readFileSync('supabase/sales-status-workflow.sql','utf8');
    await db.exec(salesStatusMigration);
    await db.exec(salesStatusMigration);

    const classification=(await db.query(`select id,name from public.stock_product_classifications
      where inventory_asset_type is not null and not quantity_management_disabled
        and not value_management_disabled limit 1`)).rows[0];
    const productDetails={
      product_category:classification.name,classification_id:classification.id,product_code:'EDIT-ME',
      product_name:'Original item',specification:'Original spec',material:'Cotton',color:'Navy',
      unit:'EA(개)',standard_stock_quantity:5
    };
    const product=(await db.query('select public.register_stock_product($1) as result',[productDetails])).rows[0].result;
    assert.equal(product.created_by_name,'테스트 등록자');
    const unchangedProduct=(await db.query(`select public.update_stock_product($1,$2) as result`,[product.id,productDetails])).rows[0].result;
    assert.equal(unchangedProduct.product_code,'EDIT-ME');
    for(const changed of [
      {...productDetails,product_code:'EDITED'},
      {...productDetails,product_name:'Changed item'},
      {...productDetails,specification:'Changed spec'},
      {...productDetails,material:'Changed material'},
      {...productDetails,color:'Changed color'},
      {...productDetails,unit:'Kg'},
      {...productDetails,standard_stock_quantity:8}
    ])await assert.rejects(db.query(`select public.update_stock_product($1,$2)`,[product.id,changed]),/PRODUCT_INFO_ALREADY_ASSIGNED/);
    await assert.rejects(db.query('select public.register_stock_product($1)',[{
      ...productDetails,product_code:'DUPLICATE-SPEC'
    }]),/PRODUCT_SPECIFICATION_ALREADY_EXISTS/);

    const blankDetails={
      ...productDetails,product_code:'FILL-ONLY',product_name:'Fill only',specification:'',material:'',color:''
    };
    const blankProduct=(await db.query('select public.register_stock_product($1) as result',[blankDetails])).rows[0].result;
    await db.query('select public.register_stock_product($1)',[{
      ...blankDetails,product_code:'ANOTHER-BLANK-SPEC',product_name:'Another blank specification'
    }]);
    const completedProduct=(await db.query(`select public.update_stock_product($1,$2) as result`,[blankProduct.id,{
      ...blankDetails,specification:'New unique spec',material:'Wool',color:'Blue'
    }])).rows[0].result;
    assert.equal(completedProduct.specification,'New unique spec');
    assert.equal(completedProduct.material,'Wool');
    assert.equal(completedProduct.color,'Blue');
    await assert.rejects(db.query(`select public.update_stock_product($1,$2)`,[blankProduct.id,{
      ...blankDetails,specification:'Changed spec',material:'Wool',color:'Blue'
    }]),/PRODUCT_HAS_LEDGER_HISTORY|PRODUCT_INFO_ALREADY_ASSIGNED/);
    await assert.rejects(db.query('select public.register_stock_product($1)',[{
      ...blankDetails,product_code:'DUPLICATE-NEW-SPEC',specification:' new UNIQUE SPEC '
    }]),/PRODUCT_SPECIFICATION_ALREADY_EXISTS/);

    const vendor=(await db.query(`insert into public.business_partners(legal_name,vendor_name,profile)
      values('테스트 거래처','테스트 거래처', '{"contact_person":"담당자","manager_phone":"010-1234-5678"}')
      returning id`)).rows[0];
    const order=(await db.query(`select public.register_sales_order($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) as result`,
      ['SO-EDIT','온라인 수주','Original item','Original spec','EA(개)',10,50,'2026-12-31','','','', '2026-01-01',vendor.id])).rows[0].result;
    assert.equal(order.vendor_id,vendor.id);
    assert.equal(order.vendor_name,'테스트 거래처');
    assert.equal(order.vendor_contact,'담당자 / 010-1234-5678');
    await assert.rejects(db.query(`select public.register_sales_order($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      ['SO-INVALID-VENDOR','온라인 수주','Original item','Original spec','EA(개)',1,1,'2026-12-31','','','', '2026-01-01','00000000-0000-4000-8000-000000000099']),/SALES_ORDER_VENDOR_NOT_FOUND/);
    const changedOrder=(await db.query(`select public.update_sales_order($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) as result`,
      [order.id,'2026-01-02','SO-EDIT-2','온라인 수주','Original item','Original spec','EA(개)',10,75,'2026-12-31','택배','서울','변경'])).rows[0].result;
    assert.equal(changedOrder.order_number,'SO-EDIT-2');
    assert.equal(Number(changedOrder.amount),750);
    assert.equal(changedOrder.vendor_id,vendor.id,'legacy update calls preserve the saved vendor');
    await db.query(`update public.business_partners set profile='{"contact_person":"새 담당자","manager_phone":"010-5678-1234"}' where id=$1`,[vendor.id]);
    const changedVendorOrder=(await db.query(`select public.update_sales_order($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) as result`,
      [order.id,'2026-01-02','SO-EDIT-2','온라인 수주','Original item','Original spec','EA(개)',10,75,'2026-12-31','택배','서울','변경',vendor.id])).rows[0].result;
    assert.equal(changedVendorOrder.vendor_contact,'새 담당자 / 010-5678-1234');

    const groupedOrder=(await db.query(`select public.register_sales_order_group($1,$2,$3,$4,$5,$6,$7) as result`,
      ['2026-02-01','SO-MULTI','오프라인 수주','개인 고객','010-9876-5432','택배',[
        {product_name:'Shirt',specification:'Blue',unit:'EA(개)',quantity:2,unit_price:25.5,due_date:'2026-02-20'},
        {product_name:'Pants',specification:'M',unit:'벌',quantity:1,unit_price:40,due_date:'2026-02-25'}
      ]])).rows[0].result;
    assert.equal(groupedOrder.orders.length,2);
    assert.equal(groupedOrder.orders[0].order_group_id,groupedOrder.group_id);
    assert.equal(groupedOrder.orders[1].order_group_id,groupedOrder.group_id);
    assert.notEqual(groupedOrder.orders[0].id,groupedOrder.orders[1].id);
    assert.equal(groupedOrder.orders[0].vendor_name,'개인 고객');
    assert.equal(groupedOrder.orders[0].vendor_contact,'010-9876-5432');
    assert.equal(groupedOrder.orders[0].vendor_id,null);
    const updatedGroup=(await db.query(`select public.update_sales_order_group($1,$2,$3,$4,$5,$6,$7,$8) as result`,
      [groupedOrder.group_id,'2026-02-02','SO-MULTI-2','온라인 수주','수정 고객','010-0000-0000','직접 배송',[
        {line_id:groupedOrder.orders[0].id,product_name:'Shirt',specification:'Blue',unit:'EA(개)',quantity:3,unit_price:30,due_date:'2026-02-22'},
        {product_name:'Hat',specification:'Free',unit:'EA(개)',quantity:2,unit_price:10,due_date:'2026-02-23'}
      ]])).rows[0].result;
    assert.equal(updatedGroup.orders.length,2);
    assert.equal(updatedGroup.orders[0].id,groupedOrder.orders[0].id);
    assert.equal(updatedGroup.orders[0].order_number,'SO-MULTI-2');
    assert.equal(Number(updatedGroup.orders[0].amount),90);
    assert.ok(updatedGroup.orders.every(line=>line.vendor_name==='수정 고객'&&line.vendor_id===null));
    assert.equal((await db.query('select count(*)::int as count from public.sales_orders where id=$1',
      [groupedOrder.orders[1].id])).rows[0].count,0,'removed, unshipped lines are deleted');
    await assert.rejects(db.query(`select public.register_sales_order_group($1,$2,$3,$4,$5,$6,$7)`,
      ['2026-02-01','SO-EMPTY','온라인 수주','고객','','',[]]),/INVALID_SALES_ORDER/);

    const post=async(kind,quantity,cost,date,link=null)=> (await db.query(
      'select public.post_stock_movement($1,$2,$3,$4,$5,$6) as result',
      [require('node:crypto').randomUUID(),kind,date,{...productDetails,...(link?{sales_order_id:link}:{})},quantity,cost]
    )).rows[0].result;
    const opening=await post('opening',5,10,'2026-01-03');
    const receipt=await post('receipt',5,20,'2026-01-04');
    const issue=await post('issue',6,0,'2026-01-05',order.id);
    assert.equal(Number(issue.amount),70);
    const changedReceipt=(await db.query(`select public.edit_stock_movement($1,$2,$3,$4,$5) as result`,
      [receipt.id,'2026-01-04',5,15,null])).rows[0].result;
    assert.equal(Number(changedReceipt.amount),75);
    const changedIssue=(await db.query(`select public.edit_stock_movement($1,$2,$3,$4,$5) as result`,
      [issue.id,'2026-01-05',8,0,order.id])).rows[0].result;
    assert.equal(Number(changedIssue.amount),95);
    const state=(await db.query('select shipped_quantity,sales_status from public.sales_orders where id=$1',[order.id])).rows[0];
    assert.equal(state.shipped_quantity,8);
    assert.equal(state.sales_status,'매출미완료');
    const summary=(await db.query(`select stock_quantity,issue_amount,created_by_name from public.stock_summary where product_code='EDIT-ME'`)).rows[0];
    assert.equal(Number(summary.stock_quantity),2);
    assert.equal(Number(summary.issue_amount),95);
    assert.equal(summary.created_by_name,'테스트 등록자');
    await assert.rejects(db.query(`select public.update_sales_order($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [order.id,'2026-01-02','SO-EDIT-2','온라인 수주','Changed name','Updated spec','EA(개)',10,75,'2026-12-31','택배','서울','변경']),/SALES_ORDER_HAS_SHIPMENTS/);
    await assert.rejects(db.query(`select public.update_stock_product($1,$2)`,[product.id,{
      ...productDetails,unit:'Kg'
    }]),/PRODUCT_HAS_LEDGER_HISTORY|PRODUCT_INFO_ALREADY_ASSIGNED/);
    await assert.rejects(db.query(`select public.edit_stock_movement($1,$2,$3,$4,$5)`,
      [issue.id,'2026-01-05',11,0,order.id]),/INSUFFICIENT_STOCK|SALES_ORDER_QUANTITY_EXCEEDED/);
    const unchanged=(await db.query('select quantity from public.stock_movements where id=$1',[issue.id])).rows[0];
    assert.equal(unchanged.quantity,8);
    assert.ok(opening.id);
  }finally{await db.close();}
});

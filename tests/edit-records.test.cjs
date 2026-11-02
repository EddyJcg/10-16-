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
      create function public.inventory_access_allowed() returns boolean language sql as $$ select current_setting('test.active',true) is distinct from 'false' $$;`);
    await db.exec(readFileSync('supabase/fifo.sql','utf8'));
    await db.exec(readFileSync('supabase/item-asset-classification.sql','utf8'));
    const editMigration=readFileSync('supabase/edit-records.sql','utf8');
    await db.exec(editMigration);
    await db.exec(editMigration);

    const classification=(await db.query(`select id,name from public.stock_product_classifications
      where inventory_asset_type is not null and not quantity_management_disabled
        and not value_management_disabled limit 1`)).rows[0];
    const productDetails={
      product_category:classification.name,classification_id:classification.id,product_code:'EDIT-ME',
      product_name:'Original item',specification:'Original spec',material:'Cotton',color:'Navy',
      unit:'EA(개)',standard_stock_quantity:5
    };
    const product=(await db.query('select public.register_stock_product($1) as result',[productDetails])).rows[0].result;
    const updatedProduct=(await db.query(`select public.update_stock_product($1,$2) as result`,[product.id,{
      ...productDetails,product_code:'EDITED',product_name:'Updated item',specification:'Updated spec',standard_stock_quantity:8
    }])).rows[0].result;
    assert.equal(updatedProduct.product_code,'EDITED');
    assert.equal(updatedProduct.product_name,'Updated item');
    assert.equal(Number(updatedProduct.standard_stock_quantity),8);

    const order=(await db.query(`select public.register_sales_order($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) as result`,
      ['SO-EDIT','온라인 수주','Updated item','Updated spec','EA(개)',10,50,'2026-12-31','','','', '2026-01-01'])).rows[0].result;
    const changedOrder=(await db.query(`select public.update_sales_order($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) as result`,
      [order.id,'2026-01-02','SO-EDIT-2','온라인 수주','Updated item','Updated spec','EA(개)',10,75,'2026-12-31','택배','서울','변경'])).rows[0].result;
    assert.equal(changedOrder.order_number,'SO-EDIT-2');
    assert.equal(Number(changedOrder.amount),750);

    const post=async(kind,quantity,cost,date,link=null)=> (await db.query(
      'select public.post_stock_movement($1,$2,$3,$4,$5,$6) as result',
      [require('node:crypto').randomUUID(),kind,date,{...productDetails,product_code:'EDITED',product_name:'Updated item',specification:'Updated spec',...(link?{sales_order_id:link}:{})},quantity,cost]
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
    const summary=(await db.query(`select stock_quantity,issue_amount from public.stock_summary where product_code='EDITED'`)).rows[0];
    assert.equal(Number(summary.stock_quantity),2);
    assert.equal(Number(summary.issue_amount),95);
    await assert.rejects(db.query(`select public.update_sales_order($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [order.id,'2026-01-02','SO-EDIT-2','온라인 수주','Changed name','Updated spec','EA(개)',10,75,'2026-12-31','택배','서울','변경']),/SALES_ORDER_HAS_SHIPMENTS/);
    await assert.rejects(db.query(`select public.update_stock_product($1,$2)`,[product.id,{
      ...productDetails,product_code:'EDITED',product_name:'Updated item',specification:'Updated spec',unit:'Kg',standard_stock_quantity:8
    }]),/PRODUCT_HAS_LEDGER_HISTORY/);
    await assert.rejects(db.query(`select public.edit_stock_movement($1,$2,$3,$4,$5)`,
      [issue.id,'2026-01-05',11,0,order.id]),/INSUFFICIENT_STOCK|SALES_ORDER_QUANTITY_EXCEEDED/);
    const unchanged=(await db.query('select quantity from public.stock_movements where id=$1',[issue.id])).rows[0];
    assert.equal(unchanged.quantity,8);
    assert.ok(opening.id);
  }finally{await db.close();}
});

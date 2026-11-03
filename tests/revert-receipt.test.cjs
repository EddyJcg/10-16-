const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {randomUUID}=require('node:crypto');

test('receipt list adds a delete button right of edit that reverts the receipt',()=>{
  const app=readFileSync('inventory-app.js','utf8');
  assert.match(app,/edit\.textContent='수정'[\s\S]*?action\.append\(edit\);\s*if\(movement\.kind==='receipt'\)\{[\s\S]*?remove\.textContent='삭제'[\s\S]*?action\.append\(remove\)/);
  assert.match(app,/client\.rpc\('revert_stock_receipt',\{p_movement_id:id\}\)/);
  assert.match(app,/data-delete-receipt-id/);
});

test('revert_stock_receipt restores purchase lines to not received and blocks used lots',async()=>{
  const {PGlite}=await import('@electric-sql/pglite');
  const db=new PGlite();
  try{
    await db.exec(`create role anon; create role authenticated; create schema auth;
      grant usage on schema public,auth to anon,authenticated;
      create function auth.uid() returns uuid language sql as $$ select '00000000-0000-4000-8000-000000000001'::uuid $$;
      create function public.inventory_access_allowed() returns boolean language sql as $$ select true $$;`);
    for(const file of ['fifo','item-asset-classification','classification-value-management-edit','procurement-schema','classification-procurement-workflow'])
      await db.exec(readFileSync(`supabase/${file}.sql`,'utf8'));
    await db.exec(readFileSync('supabase/revert-stock-receipt.sql','utf8'));
    const today=(await db.query("select (now() at time zone 'Asia/Seoul')::date::text as d")).rows[0].d;
    const classId=(await db.query(`insert into public.stock_product_classifications(name,inventory_asset_type)
      values('관리','원자재') returning id`)).rows[0].id;
    const product=(await db.query('select public.register_stock_product($1) as r',[{
      product_category:'관리',classification_id:classId,product_code:'P1',product_name:'P1',
      specification:'규격',material:'재질',color:'색상',unit:'EA(개)',standard_stock_quantity:5
    }])).rows[0].r;
    const order=(await db.query('select public.create_purchase_order($1,$2,$3,$4,$5,$6::jsonb) as r',
      ['X','업체',today,null,'',JSON.stringify([{product_id:product.id,quantity:3,unit_cost:100}])])).rows[0].r;
    const line=(await db.query('select * from public.purchase_order_lines where purchase_order_id=$1',[order.id])).rows[0];
    const receive=async(quantity)=>(await db.query('select public.receive_purchase_order_line($1,$2,$3,$4,$5) as r',
      [randomUUID(),line.id,'2026-01-03',quantity,100])).rows[0].r;
    const state=async()=>({
      line:(await db.query('select received_quantity from public.purchase_order_lines where id=$1',[line.id])).rows[0].received_quantity,
      status:(await db.query('select status from public.purchase_orders where id=$1',[order.id])).rows[0].status,
      stock:Number((await db.query(`select stock_quantity from public.stock_summary where product_code='P1'`)).rows[0].stock_quantity),
      lots:(await db.query('select count(*)::int as c from public.stock_lots')).rows[0].c
    });

    const first=await receive(2);
    const second=await receive(1);
    assert.deepEqual(await state(),{line:3,status:'입고완료',stock:3,lots:2});
    await db.query('select public.revert_stock_receipt($1)',[second.receipt.stock_movement_id]);
    assert.deepEqual(await state(),{line:2,status:'부분입고',stock:2,lots:1});
    await db.query('select public.revert_stock_receipt($1)',[first.receipt.stock_movement_id]);
    assert.deepEqual(await state(),{line:0,status:'발주완료',stock:0,lots:0});
    assert.equal((await db.query('select count(*)::int as c from public.purchase_order_receipts')).rows[0].c,0);
    assert.equal((await db.query('select count(*)::int as c from public.stock_movements')).rows[0].c,0);

    const third=await receive(3);
    await db.query('select public.post_stock_movement($1,$2,$3,$4::jsonb,$5,$6)',
      [randomUUID(),'issue','2026-01-04',JSON.stringify({product_code:'P1',product_name:'P1',specification:'규격',unit:'EA(개)'}),2,0]);
    await assert.rejects(db.query('select public.revert_stock_receipt($1)',[third.receipt.stock_movement_id]),/INSUFFICIENT_STOCK/);
    assert.deepEqual(await state(),{line:3,status:'입고완료',stock:1,lots:1});
  }finally{await db.close();}
});

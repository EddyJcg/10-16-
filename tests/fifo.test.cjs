const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {randomUUID} = require('node:crypto');

test('PostgreSQL FIFO ledger, permissions and transaction guarantees',async t => {
  const {PGlite} = await import('@electric-sql/pglite');
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      grant usage on schema public,auth to anon,authenticated;
      create function auth.uid() returns uuid language sql as $$ select '00000000-0000-4000-8000-000000000001'::uuid $$;
      create function public.inventory_access_allowed() returns boolean language sql as $$ select current_setting('test.active',true) is distinct from 'false' $$;`);
    const migration = readFileSync('supabase/fifo.sql','utf8');
    await db.exec(migration); await db.exec(migration);
    const details = (code,color='자연색',unit='EA(개)') => ({product_category:'BAG',product_code:code,product_name:'Eco Bag',specification:'450*300 자연색',material:'니나리찌',color,unit,standard_stock_quantity:10,storage_location:'A-1-3-1',supplier:'종로가방'});
    const register = async productDetails => (await db.query('select public.register_stock_product($1) as result',[productDetails])).rows[0].result;
    const ensureProduct = async productDetails => {
      const existing=await db.query('select exists(select 1 from public.stock_products where product_code=upper(trim($1))) as found',[productDetails.product_code]);
      if(!existing.rows[0].found)await register(productDetails);
    };
    const post = async (code,kind,quantity,cost,date,request = randomUUID(),productDetails = details(code)) => {
      if(kind!=='issue')await ensureProduct(productDetails);
      const result = await db.query('select public.post_stock_movement($1,$2,$3,$4,$5,$6) as result',[request,kind,date,productDetails,quantity,cost]);
      return result.rows[0].result;
    };
    const summary = async code => (await db.query('select * from public.stock_summary where product_code=$1',[code])).rows[0];

    await t.test('sales orders save all fields with generated serial number and calculated amount',async()=>{
      const result=await db.query(`select public.register_sales_order($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) as result`,
        ['SO-2026-001','온라인 수주','Eco Bag','450 x 300','EA(개)',3,1250.5,'2026-12-31','택배','서울시 중구','선물 포장']);
      const order=result.rows[0].result;
      assert.ok(Number(order.sequence_id)>0);
      assert.equal(order.order_number,'SO-2026-001');
      assert.equal(order.order_type,'온라인 수주');
      assert.equal(order.product_name,'Eco Bag');
      assert.equal(order.specification,'450 x 300');
      assert.equal(order.unit,'EA(개)');
      assert.equal(order.quantity,3);
      assert.equal(Number(order.unit_price),1250.5);
      assert.equal(Number(order.amount),3751.5);
      assert.match(order.order_date,/^\d{4}-\d{2}-\d{2}$/);
      assert.equal(order.sales_status,'매출미완료');
      assert.equal(String(order.due_date).slice(0,10),'2026-12-31');
      assert.equal(order.delivery_method,'택배');
      assert.equal(order.address,'서울시 중구');
      assert.equal(order.notes,'선물 포장');
      const completed=(await db.query('select public.set_sales_order_status($1,$2) as result',[order.id,'매출완료'])).rows[0].result;
      assert.equal(completed.sales_status,'매출완료');
      assert.equal((await db.query('select sales_status from public.sales_orders where id=$1',[order.id])).rows[0].sales_status,'매출완료');
      await assert.rejects(db.query('select public.set_sales_order_status($1,$2)',[order.id,'진행중']),/INVALID_SALES_STATUS/);
      await assert.rejects(db.query(`select public.register_sales_order($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        ['SO-BAD','방문','Item','','EA(개)',1,100,'2026-12-31','','','']),/INVALID_SALES_ORDER/);
    });

    await t.test('sales registration stores the selected order date and preserves legacy defaults',async()=>{
      const args=['SO-DATED','온라인 수주','Item','','EA(개)',1,100,'2026-12-31','','','','2020-02-29'];
      const query='select public.register_sales_order($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) as result';
      const order=(await db.query(query,args)).rows[0].result;
      assert.equal(String(order.order_date).slice(0,10),'2020-02-29');
      const legacy=(await db.query('select order_date::text as order_date from public.sales_orders where order_number=$1',['SO-2026-001'])).rows[0];
      assert.match(String(legacy.order_date),/^\d{4}-\d{2}-\d{2}/);
      await assert.rejects(db.query(query,[...args.slice(0,11),'1899-12-31']),/INVALID_SALES_ORDER/);
    });

    await t.test('linked issues update shipped dates and complete orders only at the full cumulative quantity',async()=>{
      const product=details('LINKED');
      await post('LINKED','opening',10,100,'2020-01-01');
      const registerOrder=async(number,quantity)=> (await db.query('select public.register_sales_order($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) as result',
        [number,'온라인 수주',product.product_name,product.specification,product.unit,quantity,200,'2020-12-31','','','','2020-01-01'])).rows[0].result;
      const order=await registerOrder('SO-LINKED',3),linked={...product,sales_order_id:order.id};
      const state=async id=>(await db.query('select to_jsonb(s) as result from public.sales_orders s where id=$1',[id])).rows[0].result;
      const request=randomUUID();
      const first=await post('LINKED','issue',1,0,'2020-02-01',request,linked);
      assert.equal(first.sales_order_id,order.id);
      assert.equal((await state(order.id)).shipped_quantity,1);
      assert.equal((await state(order.id)).shipped_date,'2020-02-01');
      assert.equal((await state(order.id)).sales_status,'매출미완료');
      await post('LINKED','issue',1,0,'2020-02-01',request,linked);
      assert.equal((await state(order.id)).shipped_quantity,1,'retry must not double count');
      await assert.rejects(db.query('select public.set_sales_order_status($1,$2)',[order.id,'매출완료']),/SHIPMENT_STATUS_LOCKED/);
      await assert.rejects(post('LINKED','issue',3,0,'2020-02-02',randomUUID(),linked),/SALES_ORDER_QUANTITY_EXCEEDED/);
      await post('LINKED','issue',2,0,'2020-02-02',randomUUID(),linked);
      assert.equal((await state(order.id)).shipped_quantity,3);
      assert.equal((await state(order.id)).shipped_date,'2020-02-02');
      assert.equal((await state(order.id)).sales_status,'매출완료');
      await db.exec(migration);
      assert.equal((await state(order.id)).shipped_quantity,3,'migration preserves shipping history');
      const tooLarge=await registerOrder('SO-SHORTAGE',20);
      await assert.rejects(post('LINKED','issue',15,0,'2020-02-03',randomUUID(),{...product,sales_order_id:tooLarge.id}),/INSUFFICIENT_STOCK/);
      assert.equal((await state(tooLarge.id)).shipped_quantity,0,'failed issue must roll back the order update');
      assert.equal((await state(tooLarge.id)).shipped_date,null);
      assert.equal(Number((await summary('LINKED')).stock_quantity),7);
      const unrelated=(await db.query('select id from public.sales_orders where order_number=$1',['SO-DATED'])).rows[0];
      await assert.rejects(post('LINKED','issue',1,0,'2020-02-03',randomUUID(),{...product,sales_order_id:unrelated.id}),/SALES_ORDER_PRODUCT_MISMATCH/);
      await assert.rejects(post('LINKED','receipt',1,100,'2020-02-03',randomUUID(),linked),/INVALID_SALES_ORDER_LINK/);
    });

    await t.test('product master must be registered before opening stock or receipt',async () => {
      const product=details('UNREGISTERED');
      await assert.rejects(db.query('select public.post_stock_movement($1,$2,$3,$4,$5,$6)',[randomUUID(),'receipt','2020-01-01',product,1,100]),/PRODUCT_INFO_REQUIRED/);
      const saved=await register(product);
      assert.equal(saved.product_code,'UNREGISTERED');
      assert.equal(saved.unit,'EA(개)');
      assert.equal(saved.standard_stock_quantity,10);
      assert.equal(Number((await summary('UNREGISTERED')).stock_quantity),0);
      assert.equal(Number((await summary('UNREGISTERED')).standard_stock_quantity),10);
      await assert.rejects(register(product),/PRODUCT_CODE_ALREADY_EXISTS/);
      await assert.rejects(register({...product,product_code:'unregistered'}),/PRODUCT_CODE_ALREADY_EXISTS/);
      assert.equal(Number((await db.query("select count(*) as count from public.stock_products where product_code='UNREGISTERED'")).rows[0].count),1);
      await assert.rejects(register({...product,color:'빨강'}),/PRODUCT_CODE_ALREADY_EXISTS/);
      await assert.rejects(register({...product,unit:'Kg'}),/PRODUCT_CODE_ALREADY_EXISTS/);
      await assert.rejects(register({...product,unit:'invalid'}),/INVALID_PRODUCT_DETAILS/);
      await assert.rejects(register({...product,product_code:'NO-STANDARD',standard_stock_quantity:0}),/INVALID_PRODUCT_DETAILS/);
      await assert.rejects(register({...product,product_code:'DECIMAL-STANDARD',standard_stock_quantity:1.5}),/INVALID_PRODUCT_DETAILS/);
      await post('UNREGISTERED','receipt',1,100,'2020-01-01');
      assert.equal(Number((await summary('UNREGISTERED')).stock_quantity),1);
      const aged=(await db.query("select * from public.stock_aging where product_code='UNREGISTERED'")).rows[0];
      assert.equal(String(aged.received_date).slice(0,10),'2020-01-01');
      assert.equal(Number(aged.remaining_quantity),1);
      assert.equal(Number(aged.amount),100);
      assert.equal(aged.product_name,'Eco Bag');
      assert.equal(aged.material,'니나리찌');
      assert.equal(aged.color,'자연색');
      assert.ok(aged.received_at);
      const updated=await db.query('select public.set_stock_product_standard_stock_quantity($1,$2) as result',['UNREGISTERED',25]);
      assert.equal(updated.rows[0].result.product_name,'Eco Bag');
      assert.equal(Number(updated.rows[0].result.standard_stock_quantity),25);
      assert.equal(Number((await summary('UNREGISTERED')).standard_stock_quantity),25);
      await assert.rejects(db.query('select public.set_stock_product_standard_stock_quantity($1,$2)',['UNREGISTERED',0]),/INVALID_PRODUCT_DETAILS/);
      await assert.rejects(db.query('select public.set_stock_product_standard_stock_quantity($1,$2)',['MISSING',25]),/PRODUCT_NOT_FOUND/);
    });
    await t.test('selected unit is persisted and cannot change for an existing product',async () => {
      const product=details('WEIGHT','','Kg');
      const saved=await register(product);
      assert.equal(saved.unit,'Kg');
      assert.equal((await summary('WEIGHT')).unit,'Kg');
      const receipt=await post('WEIGHT','receipt',2,25,'2020-01-01',randomUUID(),product);
      assert.equal(receipt.quantity,2);
      await assert.rejects(db.query('select public.post_stock_movement($1,$2,$3,$4,$5,$6)',[randomUUID(),'receipt','2020-01-02',{...product,unit:'g'},1,25]),/PRODUCT_DETAILS_CONFLICT/);
      await assert.rejects(db.query('select public.post_stock_movement($1,$2,$3,$4,$5,$6)',[randomUUID(),'issue','2020-01-02',{...product,unit:'g'},1,0]),/PRODUCT_DETAILS_CONFLICT/);
    });
    await t.test('Excel sample reconciles exactly with FIFO',async () => {
      await post('SAMPLE','opening',1,28000,'2020-01-01');
      await post('SAMPLE','receipt',1,30000,'2020-01-02');
      await post('SAMPLE','issue',1,0,'2020-01-03');
      const row = await summary('SAMPLE');
      assert.equal(Number(row.issue_amount),28000);
      assert.equal(Number(row.stock_quantity),1);
      assert.equal(Number(row.stock_unit_cost),30000);
      assert.equal(Number(row.stock_amount),30000);
    });
    await t.test('one issue consumes multiple lots in date order',async () => {
      await post('MULTI','opening',3,100,'2020-01-01');
      await post('MULTI','receipt',5,200,'2020-01-02');
      const issue = await post('MULTI','issue',6,0,'2020-01-03');
      assert.equal(Number(issue.amount),900);
      const allocations = await db.query('select quantity,unit_cost from public.stock_allocations where issue_id=$1 order by id',[issue.id]);
      assert.deepEqual(allocations.rows.map(row => [row.quantity,Number(row.unit_cost)]),[[3,100],[3,200]]);
      assert.equal(Number((await summary('MULTI')).stock_amount),400);
    });
    await t.test('same-day receipts use registration order',async () => {
      await post('TIE','receipt',1,30,'2020-01-01');
      await post('TIE','receipt',1,80,'2020-01-01');
      const issue = await post('TIE','issue',1,0,'2020-01-01');
      assert.equal(Number(issue.amount),30);
    });
    await t.test('each saved movement receives an increasing serial number',async () => {
      const opening = await post('SERIAL','opening',2,100,'2020-01-01');
      const receipt = await post('SERIAL','receipt',3,120,'2020-01-02');
      assert.ok(Number(opening.sequence_id)>0);
      assert.ok(Number(receipt.sequence_id)>Number(opening.sequence_id));
    });
    await t.test('product color is stored and cannot conflict across movements',async () => {
      await post('COLOR','opening',2,100,'2020-01-01',randomUUID(),details('COLOR','남색'));
      assert.equal((await summary('COLOR')).color,'남색');
      await assert.rejects(post('COLOR','receipt',1,100,'2020-01-02',randomUUID(),details('COLOR','빨강')),/PRODUCT_DETAILS_CONFLICT/);
    });
    await t.test('insufficient stock rolls back all movement and allocation changes',async () => {
      const before = await summary('MULTI');
      const count = await db.query('select count(*) as count from public.stock_movements');
      await assert.rejects(post('MULTI','issue',3,0,'2020-01-04'),/INSUFFICIENT_STOCK/);
      assert.equal(Number((await summary('MULTI')).stock_quantity),Number(before.stock_quantity));
      assert.equal((await db.query('select count(*) as count from public.stock_movements')).rows[0].count,count.rows[0].count);
    });
    await t.test('request retry is idempotent and altered payload is rejected',async () => {
      const id = randomUUID();
      const first = await post('RETRY','receipt',2,50,'2020-01-01',id);
      const second = await post('RETRY','receipt',2,50,'2020-01-01',id);
      assert.equal(first.id,second.id);
      assert.equal(first.sequence_id,second.sequence_id);
      assert.equal(Number((await summary('RETRY')).stock_quantity),2);
      await assert.rejects(post('RETRY','receipt',3,50,'2020-01-01',id),/REQUEST_CONFLICT/);
    });
    await t.test('backdated receipts cannot rewrite an already-issued cost',async () => {
      await assert.rejects(post('SAMPLE','receipt',1,100,'2020-01-01'),/BACKDATE_CONFLICT/);
      await assert.rejects(post('SAMPLE','issue',1,0,'2020-01-02'),/BACKDATE_CONFLICT/);
      await assert.rejects(post('SAMPLE','opening',1,100,'2020-01-04'),/OPENING_ALREADY_STARTED/);
    });
    await t.test('historical receipt dates before any issue are sorted by date',async () => {
      await post('PAST','receipt',1,300,'2020-01-03');
      await post('PAST','receipt',1,100,'2020-01-01');
      assert.equal(Number((await post('PAST','issue',1,0,'2020-01-04')).amount),100);
    });
    await t.test('competing issues never make stock negative',async () => {
      await post('RACE','opening',5,100,'2020-01-01');
      const outcomes = await Promise.allSettled([post('RACE','issue',4,0,'2020-01-02'),post('RACE','issue',4,0,'2020-01-02')]);
      assert.equal(outcomes.filter(result => result.status === 'fulfilled').length,1);
      assert.equal(Number((await summary('RACE')).stock_quantity),1);
    });
    await t.test('invalid or unauthorized writes are rejected',async () => {
      await assert.rejects(post('BAD','receipt',0,100,'2020-01-01'),/INVALID_INPUT/);
      await assert.rejects(post('BAD','receipt',1,-1,'2020-01-01'),/INVALID_INPUT/);
      await db.exec("set test.active='false'");
      await assert.rejects(post('BAD','receipt',1,100,'2020-01-01'),/ACCOUNT_DISABLED/);
      await db.exec("set test.active='true'; set role authenticated");
      await assert.rejects(db.exec("update public.stock_lots set remaining_quantity=999"),/permission denied/);
      await post('RPC','receipt',1,10,'2020-01-01');
      await db.exec('set role anon');
      await assert.rejects(db.exec('select * from public.stock_summary'),/permission denied/);
      await assert.rejects(post('BAD','receipt',1,100,'2020-01-01'),/permission denied/);
      await db.exec('reset role');
    });
  } finally { await db.close(); }
});

const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {randomUUID}=require('node:crypto');

test('receipt list adds a delete button right of edit that reverts the receipt',()=>{
  const app=readFileSync('inventory-app.js','utf8');
  assert.match(app,/edit\.textContent='수정'[\s\S]*?action\.append\(edit\);\s*if\(movement\.kind==='receipt'\|\|movement\.kind==='opening'\)\{[\s\S]*?remove\.textContent='삭제'[\s\S]*?action\.append\(remove\)/);
  assert.match(app,/client\.rpc\('revert_stock_receipt',\{p_movement_id:id\}\)/);
  assert.match(app,/data-delete-receipt-id/);
});

test('opening and receipt rows render delete immediately after edit, but issue rows do not',()=>{
  const vm=require('node:vm');
  const app=readFileSync('inventory-app.js','utf8');
  const element=()=>({
    children:[],dataset:{},append(...nodes){this.children.push(...nodes);},
    replaceChildren(...nodes){this.children=nodes;},setAttribute(){},addEventListener(){}
  });
  const body=element();
  const context=vm.createContext({
    document:{createElement:element},$:()=>body,items:[],
    filteredMovementListRows:()=>['opening','receipt','issue'].map(kind=>({id:kind,kind,quantity:1})),
    makeCell:element,number:String,money:String,MODE_LABELS:{}
  });
  vm.runInContext(app.slice(app.indexOf('function renderMovementList()'),app.indexOf('async function revertReceipt')),context);
  context.renderMovementList();
  for(const [index,kind] of ['opening','receipt','issue'].entries()){
    const buttons=body.children[index].children.at(-1).children;
    assert.equal(buttons[0].textContent,'수정');
    assert.equal(buttons.length,kind==='issue'?1:2);
    if(kind!=='issue'){
      assert.equal(buttons[1].textContent,'삭제');
      assert.equal(buttons[1].dataset.deleteReceiptId,kind);
    }
  }
});

test('opening deletion confirms, blocks downstream use and reports database errors',async()=>{
  const vm=require('node:vm');
  const app=readFileSync('inventory-app.js','utf8');
  const alerts=[],confirmations=[],calls=[],status={textContent:''};
  let used=false,lookupError=null,rpcError=null,confirmed=true,refreshes=0,renders=0;
  const opening={id:'o1',kind:'opening',product_id:'p1',quantity:3};
  const context=vm.createContext({
    window:{alert:message=>alerts.push(message),confirm:message=>{confirmations.push(message);return confirmed;}},
    currentUser:{},busy:false,authGeneration:1,number:String,
    items:[{id:'p1',product_code:'OPEN',product_name:'기초품목',unit:'EA(개)'}],
    movementListRows:[opening],
    client:{
      from:()=>({select:()=>({eq:async()=>({data:[{quantity:3,remaining_quantity:used?2:3}],error:lookupError})})}),
      rpc:async(name,args)=>{calls.push([name,args]);return {error:rpcError};}
    },
    readAll:async()=>[],renderMovementList:()=>{renders++;},
    loadStock:async()=>{refreshes++;},loadPurchaseOrders:async()=>{},
    $:()=>status,errorText:error=>error.message
  });
  vm.runInContext(app.slice(app.indexOf('function alertBlocked'),app.indexOf('function salesOrderDownstreamReason')),context);
  vm.runInContext(app.slice(app.indexOf('async function revertReceipt'),app.indexOf('async function showMovementList')),context);
  used=true;
  assert.equal(await context.revertReceipt('o1'),false);
  assert.match(alerts.at(-1),/먼저 이후 프로세스의 data를 삭제/);
  assert.equal(confirmations.length,0);
  assert.equal(calls.length,0);
  used=false;lookupError=new Error('조회 실패');
  assert.equal(await context.revertReceipt('o1'),false);
  assert.match(alerts.at(-1),/삭제를 진행하지 않습니다/);
  assert.equal(calls.length,0);
  lookupError=null;confirmed=false;
  assert.equal(await context.revertReceipt('o1'),false);
  assert.equal(calls.length,0);
  confirmed=true;rpcError={message:'OPENING_USED_DOWNSTREAM'};
  assert.equal(await context.revertReceipt('o1'),undefined);
  assert.match(alerts.at(-1),/먼저 이후 프로세스의 data를 삭제/);
  assert.equal(renders,0);
  rpcError={message:'NOT_A_RECEIPT'};
  await context.revertReceipt('o1');
  assert.match(alerts.at(-1),/최신 supabase\/revert-stock-receipt.sql/);
  rpcError={message:'DB 실패'};
  await context.revertReceipt('o1');
  assert.match(alerts.at(-1),/기초재고 내역을 삭제하지 못했습니다.*DB 실패/);
  rpcError=null;
  assert.equal(await context.revertReceipt('o1'),true);
  assert.match(confirmations.at(-1),/^기초재고 .*삭제하시겠습니까/);
  assert.doesNotMatch(confirmations.at(-1),/미입고/);
  assert.equal(JSON.stringify(calls.at(-1)),JSON.stringify(['revert_stock_receipt',{p_movement_id:'o1'}]));
  assert.equal(status.textContent,'기초재고 내역을 삭제했습니다.');
  assert.equal(context.movementListRows.length,0);
  assert.equal(refreshes,1);
  assert.equal(renders,1);
  assert.equal(context.busy,false);
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

    const openingDetails={product_category:'관리',classification_id:classId,product_code:'OPEN',
      product_name:'기초품목',specification:'기초규격',unit:'EA(개)',standard_stock_quantity:1};
    const openingProduct=(await db.query('select public.register_stock_product($1) as r',[openingDetails])).rows[0].r;
    const post=async(kind,date,quantity)=>(await db.query(
      'select public.post_stock_movement($1,$2,$3,$4::jsonb,$5,$6) as r',
      [randomUUID(),kind,date,JSON.stringify(openingDetails),quantity,kind==='issue'?0:100])).rows[0].r;
    const openingId=async()=>(await db.query(
      "select id from public.stock_movements where product_id=$1 and kind='opening'",[openingProduct.id])).rows[0]?.id;
    await post('opening','2026-01-01',3);
    await db.query('select public.revert_stock_receipt($1)',[await openingId()]);
    assert.equal(await openingId(),undefined);
    assert.equal((await db.query('select count(*)::int as c from public.stock_lots where product_id=$1',[openingProduct.id])).rows[0].c,0);
    assert.equal((await db.query('select count(*)::int as c from public.stock_products where id=$1',[openingProduct.id])).rows[0].c,1);
    await post('opening','2026-01-01',3);
    const usedOpeningId=await openingId();
    await post('receipt','2026-01-02',5);
    await post('issue','2026-01-03',2);
    const before=(await db.query('select * from public.stock_lots where product_id=$1 order by id',[openingProduct.id])).rows;
    await assert.rejects(db.query('select public.revert_stock_receipt($1)',[usedOpeningId]),/OPENING_USED_DOWNSTREAM/);
    assert.deepEqual((await db.query('select * from public.stock_lots where product_id=$1 order by id',[openingProduct.id])).rows,before,
      'used opening cannot be removed even when another receipt could cover the issue');
    assert.equal(await openingId(),usedOpeningId);
    const issueId=(await db.query("select id from public.stock_movements where product_id=$1 and kind='issue'",[openingProduct.id])).rows[0].id;
    await assert.rejects(db.query('select public.revert_stock_receipt($1)',[issueId]),/NOT_A_RECEIPT/);
    await db.query('delete from public.stock_allocations where issue_id=$1',[issueId]);
    await db.query('delete from public.stock_movements where id=$1',[issueId]);
    await db.query('update public.stock_lots set remaining_quantity=quantity where movement_id=$1',[usedOpeningId]);
    await db.query('select public.revert_stock_receipt($1)',[usedOpeningId]);
    assert.equal(await openingId(),undefined,'opening can be deleted after downstream data is removed');
    assert.equal(Number((await db.query("select stock_quantity from public.stock_summary where product_code='OPEN'")).rows[0].stock_quantity),5);
  }finally{await db.close();}
});

const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {randomUUID}=require('node:crypto');

test('revert_stock_issue restores FIFO lot quantities and removes only that issue',async()=>{
  const {PGlite}=await import('@electric-sql/pglite');
  const db=new PGlite();
  try{
    await db.exec(`create role anon; create role authenticated; create schema auth;
      grant usage on schema public,auth to anon,authenticated;
      create function auth.uid() returns uuid language sql as $$ select '00000000-0000-4000-8000-000000000001'::uuid $$;
      create function public.inventory_access_allowed() returns boolean language sql as $$ select true $$;`);
    for(const file of ['fifo','item-asset-classification','classification-value-management-edit','procurement-schema','classification-procurement-workflow'])
      await db.exec(readFileSync(`supabase/${file}.sql`,'utf8'));
    await db.exec(readFileSync('supabase/revert-stock-issue.sql','utf8'));
    const classId=(await db.query(`insert into public.stock_product_classifications(name,inventory_asset_type)
      values('관리','원자재') returning id`)).rows[0].id;
    const details={product_category:'관리',classification_id:classId,product_code:'ISS',product_name:'출고품목',
      specification:'규격',unit:'EA(개)',standard_stock_quantity:1};
    const product=(await db.query('select public.register_stock_product($1) as r',[details])).rows[0].r;
    const post=async(kind,date,quantity)=>(await db.query(
      'select public.post_stock_movement($1,$2,$3,$4::jsonb,$5,$6) as r',
      [randomUUID(),kind,date,JSON.stringify(details),quantity,kind==='issue'?0:100])).rows[0].r;
    const stock=async()=>Number((await db.query("select stock_quantity from public.stock_summary where product_code='ISS'")).rows[0].stock_quantity);
    const lotRemaining=async()=>Number((await db.query(
      'select coalesce(sum(remaining_quantity),0) as r from public.stock_lots where product_id=$1',[product.id])).rows[0].r);
    const issueIds=async()=>(await db.query(
      "select id from public.stock_movements where product_id=$1 and kind='issue' order by sequence_id",[product.id])).rows.map(row=>row.id);

    await post('opening','2026-01-01',3);
    await post('issue','2026-01-02',2);
    const [issueId]=await issueIds();
    assert.equal(await stock(),1);
    assert.equal(await lotRemaining(),1);

    await db.query('select public.revert_stock_issue($1)',[issueId]);
    assert.equal(await stock(),3);
    assert.equal(await lotRemaining(),3);
    assert.deepEqual(await issueIds(),[]);
    assert.equal((await db.query('select count(*)::int as c from public.stock_allocations')).rows[0].c,0);

    await post('issue','2026-01-03',3);
    assert.equal(await stock(),0);
    const openingRows=(await db.query("select id from public.stock_movements where kind='opening'")).rows;
    assert.equal(openingRows.length,1,'opening movement is never removed by issue revert');
    await assert.rejects(db.query('select public.revert_stock_issue($1)',[openingRows[0].id]),/NOT_AN_ISSUE/);
  }finally{await db.close();}
});

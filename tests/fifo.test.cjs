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
    const details = code => ({product_category:'BAG',product_code:code,product_name:'Eco Bag',specification:'450*300 자연색',material:'니나리찌',storage_location:'A-1-3-1',supplier:'종로가방'});
    const post = async (code,kind,quantity,cost,date,request = randomUUID()) => {
      const result = await db.query('select public.post_stock_movement($1,$2,$3,$4,$5,$6) as result',[request,kind,date,details(code),quantity,cost]);
      return result.rows[0].result;
    };
    const summary = async code => (await db.query('select * from public.stock_summary where product_code=$1',[code])).rows[0];

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

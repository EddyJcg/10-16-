const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');

test('vendor registration screen wires toolbar, type checkboxes and settings',()=>{
  const html=readFileSync('inventory.html','utf8'),script=readFileSync('vendor-management.js','utf8'),style=readFileSync('vendor-management.css','utf8');
  for(const id of ['vendor-dialog','vendor-form','vendor-entry-button','vendor-status-button','vendor-toolbar','vendor-type-items','vendor-list-dialog','vendor-option-dialog'])
    assert.ok(html.includes(`id="${id}"`),`${id} should exist`);
  for(const action of ['new','query','save','copy','remove-types','delete'])
    assert.ok(html.includes(`data-vendor-action="${action}"`),`${action} toolbar action should exist`);
  for(const category of ['name_alias','vendor_type','vendor_category','payment_account'])
    assert.ok(html.includes(`data-vendor-option="${category}"`),`${category} settings action should exist`);
  assert.match(script,/async function saveVendor\(event,copy=false\)/);
  assert.match(script,/async function openVendorList\(\)/);
  assert.match(script,/function clearSelectedVendorTypes\(\)/);
  assert.match(script,/async function saveVendorOption\(event\)/);
  assert.match(script,/async function deleteVendorOption\(id\)/);
  assert.match(script,/type='checkbox'/);
  assert.match(style,/\.vendor-main-grid\{display:grid/);
});

test('vendor lookup matches the query toolbar, conditions and wide result grid',()=>{
  const html=readFileSync('inventory.html','utf8'),script=readFileSync('vendor-management.js','utf8'),style=readFileSync('vendor-management.css','utf8');
  for(const action of ['search','tax-history','payment-account'])
    assert.ok(html.includes(`data-vendor-list-action="${action}"`),`${action} lookup action should exist`);
  for(const id of ['vendor-filter-transaction','vendor-filter-type','vendor-filter-currency','vendor-filter-status',
    'vendor-filter-name','vendor-filter-number','vendor-filter-business-number','vendor-filter-representative',
    'vendor-filter-date-from','vendor-filter-date-to','vendor-filter-creator','vendor-filter-category',
    'vendor-filter-category-value','vendor-filter-phone','vendor-filter-email','vendor-filter-contact','vendor-filter-manager-phone'])
    assert.ok(html.includes(`id="${id}"`),`${id} lookup condition should exist`);
  for(const column of ['거래처번호','상호','거래처상태','사업자번호','대표자성명','법인번호','주민등록번호',
    '업태','종목','전화번호','세무사업자주소','팩스번호','이메일','홈페이지','첨부파일',
    '거래처 대표담당자','담당자 연락처','담당자 핸드폰번호'])
    assert.ok(html.includes(`<th>${column}</th>`),`${column} result column should exist`);
  assert.match(script,/function populateVendorQueryFilters\(\)/);
  assert.match(script,/function vendorRecordDate\(record\)/);
  assert.match(script,/date>=query\.dateFrom/);
  assert.match(script,/profile\.classification_id===query\.category/);
  assert.match(style,/#vendor-list-dialog\[open\]\{display:flex;flex-direction:column\}/);
  assert.match(style,/\.vendor-query-grid\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(style,/\.vendor-list-dialog table\{width:max-content;min-width:1780px/);
});

test('vendor database migration provides protected records and default vendor types',async()=>{
  const {PGlite}=await import('@electric-sql/pglite');
  const db=new PGlite();
  try{
    await db.exec(`create role anon; create role authenticated; create schema auth;
      grant usage on schema public,auth to anon,authenticated;
      create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
      create function public.inventory_access_allowed() returns boolean language sql as $$ select true $$;`);
    await db.exec(`create table public.vendor_master_options (
      id uuid primary key default gen_random_uuid(),
      category text not null,
      code text not null,
      name text not null,
      details jsonb not null default '{}'::jsonb,
      is_active boolean not null default true,
      sort_order integer not null default 0,
      created_by uuid not null default auth.uid(),
      created_at timestamptz not null default clock_timestamp(),
      updated_at timestamptz not null default clock_timestamp(),
      unique(category,code)
    );`);
    await db.exec(readFileSync('supabase/vendor-management.sql','utf8'));
    const seeded=(await db.query("select count(*)::int as count from public.vendor_master_options where category='vendor_type' and is_active")).rows[0].count;
    assert.equal(seeded,10);
    assert.equal((await db.query("select count(*)::int as count from public.vendor_master_options where created_by is null")).rows[0].count,10);
    await db.exec("create or replace function auth.uid() returns uuid language sql as $$ select '00000000-0000-4000-8000-000000000001'::uuid $$;");
    const typeId=(await db.query("select id from public.vendor_master_options where category='vendor_type' and code='domestic-sales'")).rows[0].id;
    const saved=(await db.query(`insert into public.business_partners
      (partner_number,legal_name,vendor_name,selected_type_ids,profile)
      values('V-001','테스트 상호','테스트 거래처',array[$1::uuid],$2::jsonb) returning *`,
      [typeId,JSON.stringify({business_registration_number:'123-45-67890',email:'vendor@example.com'})])).rows[0];
    assert.equal(saved.legal_name,'테스트 상호');
    assert.deepEqual(saved.selected_type_ids,[typeId]);
    assert.equal(saved.profile.business_registration_number,'123-45-67890');
    await db.query("update public.business_partners set status='거래중지' where id=$1",[saved.id]);
    assert.equal((await db.query("select status from public.business_partners where id=$1",[saved.id])).rows[0].status,'거래중지');
    await db.query("delete from public.business_partners where id=$1",[saved.id]);
    assert.equal((await db.query('select count(*)::int as count from public.business_partners')).rows[0].count,0);
    await db.exec(readFileSync('supabase/vendor-management.sql','utf8'));
    assert.equal((await db.query("select count(*)::int as count from public.vendor_master_options where category='vendor_type'")).rows[0].count,10);
  }finally{await db.close();}
});

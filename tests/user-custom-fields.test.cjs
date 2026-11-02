const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');

const USER_A='00000000-0000-4000-8000-000000000001';
const USER_B='00000000-0000-4000-8000-000000000002';

test('custom fields are private per user and stored by form and record',async()=>{
  const {PGlite}=await import('@electric-sql/pglite');
  const db=new PGlite();
  try{
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      insert into auth.users(id) values ('${USER_A}'),('${USER_B}');
      grant usage on schema public,auth to anon,authenticated;
      grant select on auth.users to authenticated;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
      $$;
      create function public.inventory_access_allowed() returns boolean language sql stable as $$ select true $$;`);
    const migration=readFileSync('supabase/user-custom-fields.sql','utf8');
    await db.exec(migration);
    await db.exec(migration);

    await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[USER_A]);
    await db.query(`select public.save_inventory_custom_fields($1,$2,$3::jsonb,$4::jsonb)`,
      ['sales-order','10000000-0000-4000-8000-000000000001',
        JSON.stringify(['고객 메모','','','','']),JSON.stringify(['전용 값','','','',''])]);
    const profile=(await db.query(`select field_names from public.inventory_custom_field_profiles
      where user_id=$1 and form_key='sales-order'`,[USER_A])).rows[0];
    assert.deepEqual(profile.field_names,['고객 메모','','','','']);

    await db.exec('set role authenticated');
    await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[USER_B]);
    const hidden=(await db.query(`select record_id from public.inventory_custom_field_values
      where form_key='sales-order'`)).rows;
    assert.equal(hidden.length,0);
    await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[USER_A]);
    const visible=(await db.query(`select field_values from public.inventory_custom_field_values
      where form_key='sales-order'`)).rows;
    assert.deepEqual(visible[0].field_values,['전용 값','','','','']);
    await db.exec('reset role');
    await assert.rejects(db.query(`select public.save_inventory_custom_fields($1,$2,$3::jsonb,$4::jsonb)`,
      ['movement','10000000-0000-4000-8000-000000000002','["이름"]','["값"]']),/INVALID_CUSTOM_FIELDS/);
    await assert.rejects(db.query(`select public.save_inventory_custom_fields($1,$2,$3::jsonb,$4::jsonb)`,
      ['movement','10000000-0000-4000-8000-000000000002','["","","","",""]','["값","","","",""]']),/INVALID_CUSTOM_FIELDS/);
  }finally{await db.close();}
});

test('business entry windows expose five user-specific custom field pairs and list columns',()=>{
  const html=readFileSync('inventory.html','utf8');
  const app=readFileSync('inventory-app.js','utf8');
  const migration=readFileSync('supabase/user-custom-fields.sql','utf8');
  const forms=[...html.matchAll(/data-user-custom-fields="([^"]+)"/g)].map(match=>match[1]);
  assert.deepEqual(forms,['product','classification','sales-order','movement']);
  assert.match(app,/for\(let index=0;index<5;index\+\+\)/);
  assert.match(app,/data-custom-field-name/);
  assert.match(app,/data-custom-field-value/);
  assert.match(app,/save_inventory_custom_fields/);
  assert.match(app,/\.eq\('user_id',userId\)/);
  assert.match(migration,/user_id=\(select auth\.uid\(\)\)/);
  assert.match(migration,/form_key in \('product','classification','sales-order','movement'\)/);
  assert.doesNotMatch(readFileSync('admin.html','utf8'),/data-user-custom-fields/);
});

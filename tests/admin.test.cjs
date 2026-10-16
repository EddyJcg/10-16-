const {test} = require('node:test');
const assert = require('node:assert/strict');
const ADMIN = '1a5b77e2-e8b2-4f7f-980d-e1974834be5c';
const USER = '00000000-0000-4000-8000-000000000001';
const env = {SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'test-server-secret',ADMIN_USER_IDS:ADMIN};

async function invoke({method='GET',body,actor=ADMIN,headers={authorization:'Bearer test-token'},config=env,authError=false,banned=false} = {}) {
  const {createAdminHandler} = await import('../server/user-admin.mjs');
  const calls = [];
  const client = {auth:{
    getUser:async token => ({data:{user:authError ? null : {id:actor}},error:authError ? {} : null}),
    admin:{
      getUserById:async id => ({data:{user:{id,banned_until:banned ? '2099-01-01T00:00:00Z' : null}},error:null}),
      listUsers:async () => {calls.push(['list']);return {data:{users:[{id:USER,email:'user@example.com',encrypted_password:'must-not-leak',app_metadata:{private:'hidden'}}]},error:null};},
      createUser:async attributes => {calls.push(['create',attributes]);return {data:{user:{id:USER,email:attributes.email}},error:null};},
      updateUserById:async (id,attributes) => {calls.push(['update',id,attributes]);return {data:{user:{id,email:'user@example.com'}},error:null};}
    }
  }};
  const handler = createAdminHandler({createClient:() => client,env:config});
  const response = {headers:{},setHeader(key,value){this.headers[key] = value;},status(value){this.code = value;return this;},json(value){this.body = value;return this;}};
  await handler({method,body,headers,query:{}},response);
  return {response,calls};
}

test('admin endpoint rejects requests without a verified token',async () => {
  assert.equal((await invoke({headers:{}})).response.code,401);
  assert.equal((await invoke({authError:true})).response.code,401);
});
test('ordinary users cannot list or create accounts',async () => {
  const result = await invoke({method:'POST',actor:USER,body:{email:'new@example.com',password:'test-password-123'}});
  assert.equal(result.response.code,403); assert.equal(result.calls.length,0);
});
test('disabled admins cannot manage accounts',async () => {
  const result = await invoke({banned:true});
  assert.equal(result.response.code,403); assert.equal(result.calls.length,0);
});
test('list response exposes only the required user information',async () => {
  const {response} = await invoke();
  assert.equal(response.code,200);
  assert.equal(response.headers['Cache-Control'],'no-store');
  assert.equal(response.body.users[0].email,'user@example.com');
  assert.equal(JSON.stringify(response.body).includes('encrypted_password'),false);
  assert.equal(JSON.stringify(response.body).includes('app_metadata'),false);
});
test('admin can create confirmed email accounts',async () => {
  const {response,calls} = await invoke({method:'POST',body:{email:'new@example.com',password:'test-password-123'}});
  assert.equal(response.code,201); assert.equal(calls[0][1].email_confirm,true);
  assert.equal(calls[0][1].app_metadata.inventory_access,true);
  assert.equal(JSON.stringify(response.body).includes('test-password-123'),false);
});
test('admin password reset does not accept privilege metadata',async () => {
  const good = await invoke({method:'PATCH',body:{id:USER,password:'new-password-123'}});
  assert.equal(good.response.code,200); assert.equal(good.calls[0][2].password,'new-password-123');
  const bad = await invoke({method:'PATCH',body:{id:USER,app_metadata:{role:'admin'}}});
  assert.equal(bad.response.code,400); assert.equal(bad.calls.length,0);
});
test('account disable and reactivate use Supabase bans',async () => {
  const disabled = await invoke({method:'PATCH',body:{id:USER,disabled:true}});
  assert.equal(disabled.calls[0][2].ban_duration,'876000h');
  const enabled = await invoke({method:'PATCH',body:{id:USER,disabled:false}});
  assert.equal(enabled.calls[0][2].ban_duration,'none');
  assert.equal(enabled.calls[0][2].app_metadata.inventory_access,true);
});
test('admin accounts cannot be disabled',async () => {
  const {response,calls} = await invoke({method:'PATCH',body:{id:ADMIN,disabled:true}});
  assert.equal(response.code,400); assert.equal(calls.length,0);
});
test('missing server configuration fails closed',async () => {
  assert.equal((await invoke({config:{}})).response.code,503);
});

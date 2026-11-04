const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ADMIN = '1a5b77e2-e8b2-4f7f-980d-e1974834be5c';
const USER = '00000000-0000-4000-8000-000000000001';
const env = {SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'test-server-secret'};

async function invoke({method='POST',body={event_type:'login'},actor=USER,actorEmail='user@example.com',admin=false,banned=false,headers={authorization:'Bearer verified-token'},query={},config=env,activityError=null}={}) {
  const {createUserActivityHandler} = await import('../server/user-activity.mjs');
  const calls=[];
  const result={data:activityError?null:[{id:'event-1',user_id:USER,email:'user@example.com',event_type:'login',occurred_at:'2026-11-04T00:00:00Z'}],error:activityError};
  const builder=(table)=>({
    insert(value){calls.push(['insert',value]);return this;},
    select(value){calls.push(['select',value]);return this;},
    single:async()=>({data:result.data?.[0] ?? null,error:result.error}),
    order(column,options){calls.push(['order',column,options]);return this;},
    range(start,end){calls.push(['range',start,end]);return this;},
    ilike(column,value){calls.push(['ilike',column,value]);return this;},
    eq(column,value){calls.push(['eq',column,value]);return this;},
    then(resolve,reject){return Promise.resolve(table==='inventory_admins'
      ?{data:[{user_id:ADMIN,slot:1}],error:null}:result).then(resolve,reject);}
  });
  const client={
    auth:{
      getUser:async()=>({data:{user:{id:actor,email:actorEmail}},error:null}),
      admin:{getUserById:async id=>({data:{user:{
        id,email:actorEmail,banned_until:banned?'2099-01-01T00:00:00Z':null,
        deleted_at:null,app_metadata:{inventory_access:admin||actor===ADMIN||actor===USER}
      }},error:null})}
    },
    from:table=>{calls.push(['from',table]);return builder(table);}
  };
  const handler=createUserActivityHandler({createClient:()=>client,env:config});
  const response={headers:{},setHeader(key,value){this.headers[key]=value;},status(value){this.code=value;return this;},json(value){this.body=value;return this;}};
  await handler({method,body,headers,query},response);
  return {response,calls};
}

test('authenticated users can record only their own login and logout events',async()=>{
  const {response,calls}=await invoke({body:{event_type:'logout'}});
  assert.equal(response.code,201);
  assert.equal(response.headers['Cache-Control'],'no-store');
  assert.deepEqual(calls.find(([name])=>name==='insert')[1],{
    user_id:USER,email:'user@example.com',event_type:'logout'
  });
});

test('activity writes reject invalid event types and forged user fields',async()=>{
  for(const body of [{event_type:'delete'},{event_type:'login',user_id:ADMIN},{event_type:'login',email:'other@example.com'}]){
    const {response,calls}=await invoke({body});
    assert.equal(response.code,400);
    assert.equal(calls.some(([name])=>name==='insert'),false);
  }
});

test('activity writes reject missing, disabled, or unprivileged sessions',async()=>{
  assert.equal((await invoke({headers:{}})).response.code,401);
  assert.equal((await invoke({banned:true})).response.code,403);
  assert.equal((await invoke({actor:'00000000-0000-4000-8000-000000000002',admin:false})).response.code,403);
});

test('only active admins can search activity and email search is escaped',async()=>{
  assert.equal((await invoke({method:'GET',actor:USER})).response.code,403);
  assert.equal((await invoke({method:'GET',actor:ADMIN,banned:true})).response.code,403);
  const {response,calls}=await invoke({
    method:'GET',actor:ADMIN,admin:true,query:{page:'2',user:'alice%_@example.com'}
  });
  assert.equal(response.code,200);
  assert.equal(response.body.events.length,1);
  assert.deepEqual(calls.find(([name])=>name==='range'),['range',100,199]);
  assert.deepEqual(calls.find(([name])=>name==='ilike'),['ilike','email','%alice\\%\\_@example.com%']);
});

test('admins can filter activity by login or logout and missing migration errors identify the SQL file',async()=>{
  const filtered=await invoke({method:'GET',actor:ADMIN,admin:true,query:{event_type:'logout'}});
  assert.equal(filtered.response.code,200);
  assert.deepEqual(filtered.calls.find(([name])=>name==='eq'),['eq','event_type','logout']);
  const invalid=await invoke({method:'GET',actor:ADMIN,admin:true,query:{event_type:'delete'}});
  assert.equal(invalid.response.code,400);
  const missing=await invoke({method:'GET',actor:ADMIN,admin:true,activityError:{code:'PGRST205'}});
  assert.equal(missing.response.code,503);
  assert.match(missing.response.body.error,/supabase\/user-auth-activity\.sql/);
  const missingOnWrite=await invoke({body:{event_type:'login'},activityError:{code:'PGRST205'}});
  assert.equal(missingOnWrite.response.code,503);
  assert.match(missingOnWrite.response.body.error,/supabase\/user-auth-activity\.sql/);
});

test('user management shows searchable activity history and login/logout forms record events',()=>{
  const html=fs.readFileSync('admin.html','utf8');
  const adminScript=fs.readFileSync('admin.js','utf8');
  const appScript=fs.readFileSync('inventory-app.js','utf8');
  const sql=fs.readFileSync('supabase/user-auth-activity.sql','utf8');
  assert.match(html,/id="activity-title">사용자 로그인\/로그아웃 내역/);
  assert.match(html,/id="activity-search-field"/);
  assert.match(html,/id="activity-user-search" type="search"/);
  assert.match(html,/id="activity-event-type"/);
  assert.match(html,/id="activity-rows"/);
  assert.match(adminScript,/activitySearch = searchField === 'email'/);
  assert.match(adminScript,/params\.set\('event_type',activityEventType\)/);
  assert.match(adminScript,/user\.is_admin \? '관리자 해제' : '관리자 지정'/);
  assert.match(adminScript,/adminCount >= maxAdmins/);
  assert.match(adminScript,/recordActivity\('login'\)/);
  assert.match(adminScript,/recordActivity\('logout'\)/);
  assert.match(appScript,/recordUserAuthActivity\('login',data\.session\)/);
  assert.match(appScript,/recordUserAuthActivity\('logout'\)/);
  assert.match(sql,/create table if not exists public\.user_auth_activity/);
  assert.match(sql,/where occurred_at < now\(\) - interval '1 year'/);
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const {createClient}=require('@supabase/supabase-js');

async function boot(file){
  const values=new Map(),elements=new Map(),alerts=[];let options;
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const element=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',hidden:false,disabled:false,handlers:{},addEventListener(event,handler){this.handlers[event]=handler;},querySelectorAll(){return[];},replaceChildren(){},reset(){},classList:{toggle(){}}});return elements.get(id);};
  const context=vm.createContext({
    SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'test-key',
    document:{getElementById:element,querySelectorAll(){return[];},addEventListener(){}},
    window:{sessionStorage:storage,supabase:{createClient:(url,key,value)=>{options=value;return {auth:{onAuthStateChange(){}},removeAllChannels(){}};}},addEventListener(){},alert:message=>alerts.push(message)},
    render(){},renderHeaders(){},setInterval(){return 1;},clearInterval(){},clearTimeout(){},setTimeout(){return 1;}
  });
  await vm.runInContext(readFileSync(file,'utf8'),context);
  if(file==='inventory-app.js')await vm.runInContext('startApp()',context);
  return {options,storage,values,context,element,alerts};
}

for(const file of ['inventory-app.js','admin.js'])test(file+' restores login after reload and clears it on logout',async()=>{
  const {options}=await boot(file);
  const user={id:'00000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',email:'qa@example.test',app_metadata:{},user_metadata:{},created_at:'2020-01-01T00:00:00Z'};
  const token=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.local-test';
  const fakeFetch=async url=>String(url).includes('/logout')?new Response(null,{status:204}):new Response(JSON.stringify(String(url).includes('/token')?{access_token:token,refresh_token:'test-refresh',expires_in:3600,token_type:'bearer',user}:user),{status:200,headers:{'Content-Type':'application/json'}});
  const makeClient=()=>createClient('https://example.supabase.co','test-key',{...options,global:{fetch:fakeFetch}});
  const first=makeClient();let restored,afterLogout;
  try{
    const signedIn=await first.auth.signInWithPassword({email:user.email,password:'local-test-password'});assert.equal(signedIn.error,null);
    restored=makeClient();const session=await restored.auth.getSession();
    assert.equal(session.data.session?.user.id,user.id,'Reload must restore the signed-in user');
    const logout=await restored.auth.signOut({scope:'local'});assert.equal(logout.error,null);
    afterLogout=makeClient();assert.equal((await afterLogout.auth.getSession()).data.session,null);
  }finally{for(const client of [first,restored,afterLogout])if(client)await client.auth.stopAutoRefresh();}
});

test('inventory screen omits the manual stock refresh button',async()=>{
  const app=await boot('inventory-app.js');
  assert.doesNotMatch(readFileSync('inventory.html','utf8'),/id="refresh"/);
  assert.equal(app.element('refresh').handlers.click,undefined);
});

test('main screen title identifies sales and inventory management',()=>{
  const html=readFileSync('inventory.html','utf8');
  assert.match(html,/<title>Isummerly 매출\/재고관리<\/title>/);
  assert.match(html,/<h1><img src="\/isummerly-logo\.png" alt="회사 로고">Isummerly 매출\/재고관리<\/h1>/);
});

test('unknown receipt item displays the required product information alert',async()=>{
  const app=await boot('inventory-app.js');
  assert.match(readFileSync('inventory.html','utf8'),/<form id="movement-form" novalidate>/);
  vm.runInContext('currentUser={id:"user"};items=[{product_code:"KNOWN"}];mode="receipt";$("product_code").value="UNKNOWN";',app.context);
  await vm.runInContext('saveMovement({preventDefault(){}})',app.context);
  assert.deepEqual(app.alerts,['품목정보를 입력해 주세요!']);
});

test('all stock and product-info forms bind SKU and specification autofill',async()=>{
  const app=await boot('inventory-app.js');
  for(const id of ['product_code','specification','info_product_code','info_specification'])
    assert.equal(typeof app.element(id).handlers.input,'function',id+' should trigger product lookup');
});

test('issue quantity and date changes validate stock availability',async()=>{
  const app=await boot('inventory-app.js');
  for(const id of ['movement_quantity','movement_date'])
    assert.equal(typeof app.element(id).handlers.change,'function',id+' should validate available stock');
});

test('dashboard stock risk button opens the risk list dialog',async()=>{
  const app=await boot('inventory-app.js');
  assert.equal(typeof app.element('stock-risk-button').handlers.click,'function');
  assert.equal(typeof app.element('close-stock-risk').handlers.click,'function');
});

test('dashboard long-stock button opens and closes the detail dialog',async()=>{
  const app=await boot('inventory-app.js');
  assert.equal(typeof app.element('long-stock-button').handlers.click,'function');
  assert.equal(typeof app.element('close-long-stock').handlers.click,'function');
});

test('sales order menu opens its dialog and binds save and amount calculation',async()=>{
  const app=await boot('inventory-app.js');
  assert.equal(typeof app.element('sales-order-button').handlers.click,'function');
  assert.equal(typeof app.element('close-sales-order').handlers.click,'function');
  assert.equal(typeof app.element('sales-order-form').handlers.submit,'function');
  assert.equal(typeof app.element('sales_quantity').handlers.input,'function');
  assert.equal(typeof app.element('sales_unit_price').handlers.input,'function');
});

test('sales status menu opens its list and binds searches and status updates',async()=>{
  const app=await boot('inventory-app.js');
  assert.equal(typeof app.element('sales-status-button').handlers.click,'function');
  assert.equal(typeof app.element('close-sales-status').handlers.click,'function');
  assert.equal(typeof app.element('apply-sales-status-search').handlers.click,'function');
  assert.equal(typeof app.element('clear-sales-status-search').handlers.click,'function');
  assert.equal(typeof app.element('sales-status-items').handlers.change,'function');
});

test('sales and inventory lists bind their Excel download buttons',async()=>{
  const app=await boot('inventory-app.js');
  for(const id of ['export-sales-status','export-current-stock','export-product-list','export-movement-list'])
    assert.equal(typeof app.element(id).handlers.click,'function',id);
});

test('inventory and admin use the same tab session without another sign-in',async()=>{
  const inventory=await boot('inventory-app.js'),admin=await boot('admin.js');
  assert.equal(admin.options.auth.storageKey,inventory.options.auth.storageKey);
  assert.equal(inventory.options.auth.storageKey,'inventory-note-stock-session');
});

test('admin link stays hidden unless the server verifies the current user as admin',async()=>{
  const app=await boot('inventory-app.js');
  app.context.fetch=async()=>({ok:true,json:async()=>({is_admin:true})});
  vm.runInContext('currentUser={id:"admin"};client.auth.getSession=async()=>({data:{session:{access_token:"verified-token"}}});',app.context);
  await vm.runInContext('refreshAdminAccess()',app.context);assert.equal(app.element('admin-link').hidden,false);
  assert.equal(app.element('admin-folder').hidden,false);
  app.context.fetch=async()=>({ok:true,json:async()=>({is_admin:false})});
  await vm.runInContext('refreshAdminAccess()',app.context);assert.equal(app.element('admin-link').hidden,true);
  assert.equal(app.element('admin-folder').hidden,true);
  app.context.fetch=async()=>{throw new Error('offline');};
  await vm.runInContext('refreshAdminAccess()',app.context);assert.equal(app.element('admin-link').hidden,true);
});

test('direct admin visit by an ordinary user hides panels and returns to inventory',async()=>{
  const admin=await boot('admin.js');let destination;
  admin.context.window.location={replace:path=>{destination=path;}};
  vm.runInContext('loadUsers=async()=>{const error=new Error("관리자만 사용할 수 있습니다.");error.status=403;throw error;}',admin.context);
  await vm.runInContext('onSession({user:{email:"ordinary@example.test"}})',admin.context);
  assert.equal(admin.element('admin-panel').hidden,true);assert.equal(admin.element('login-panel').hidden,true);assert.equal(destination,'/');
});

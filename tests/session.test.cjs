const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const {createClient}=require('@supabase/supabase-js');

async function boot(file){
  const values=new Map(),elements=new Map();let options;
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const element=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',hidden:false,disabled:false,handlers:{},addEventListener(event,handler){this.handlers[event]=handler;},querySelectorAll(){return[];},reset(){},classList:{toggle(){}}});return elements.get(id);};
  const context=vm.createContext({
    SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'test-key',
    document:{getElementById:element,querySelectorAll(){return[];},addEventListener(){}},
    window:{sessionStorage:storage,supabase:{createClient:(url,key,value)=>{options=value;return {auth:{onAuthStateChange(){}},removeAllChannels(){}};}},addEventListener(){}},
    render(){},renderHeaders(){},setInterval(){return 1;},clearInterval(){},clearTimeout(){},setTimeout(){return 1;}
  });
  await vm.runInContext(readFileSync(file,'utf8'),context);
  if(file==='inventory-app.js')await vm.runInContext('startApp()',context);
  return {options,storage,values,context,element};
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

test('stock refresh updates data without clearing the current login',async()=>{
  const app=await boot('inventory-app.js');
  vm.runInContext('currentUser={id:"signed-in"};loadStock=async()=>{items=[{product_code:"UPDATED"}]};',app.context);
  await app.element('refresh').handlers.click();
  assert.equal(vm.runInContext('currentUser.id',app.context),'signed-in');
  assert.equal(vm.runInContext('items[0].product_code',app.context),'UPDATED');
});

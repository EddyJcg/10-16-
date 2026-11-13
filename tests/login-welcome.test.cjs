const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');

function boot(signIn=async()=>({data:{session:{user:{id:'test-user'}}},error:null})){
  const nodes=new Map(),calls=[],notices=[],timers=new Map();
  let now=0,nextTimer=0;
  const element=id=>{
    if(!nodes.has(id))nodes.set(id,{
      value:'',disabled:false,open:false,hidden:false,handlers:{},contentWindow:{},
      addEventListener(type,handler){this.handlers[type]=handler;},
      showModal(){this.open=true;},
      close(){this.open=false;this.handlers.close?.();},
      classList:{toggle(){}},setAttribute(){}
    });
    return nodes.get(id);
  };
  element('login-welcome-frame').contentWindow={};
  const context=vm.createContext({
    document:{getElementById:element},
    window:{handlers:{},addEventListener(type,handler){this.handlers[type]=handler;}},
    testClient:{auth:{signInWithPassword:async credentials=>{
      calls.push({...credentials,welcomeOpen:element('login-welcome-dialog').open});return signIn();
    }},
      removeAllChannels(){}},
    notices,activities:[],
    setTimeout(callback,delay){const id=++nextTimer;timers.set(id,{callback,at:now+delay});return id;},
    clearTimeout(id){timers.delete(id);}
  });
  vm.runInContext(readFileSync('inventory-app.js','utf8'),context);
  vm.runInContext(`client=testClient;notify=(message,error)=>notices.push({message,error});
    render=renderSalesOrders=renderSalesStatus=renderSalesRegister=renderSalesBalance=updateSupplierOptions=populatePurchaseOrderVendorOptions=()=>{};
    loadStock=loadAssetClassifications=loadSalesOrders=refreshAdminAccess=async()=>{};
    subscribeToChanges=()=>{};
    recordUserAuthActivity=async(type,session)=>activities.push({type,session});
    installLoginWelcome();`,context);
  element('email').value=' test@example.test ';
  element('password').value='test-password';
  element('workspace').hidden=true;
  const submit=()=>element('login-form').handlers.submit({preventDefault(){}});
  const encourage=()=>context.window.handlers.message({source:element('login-welcome-frame').contentWindow,data:{type:'login-welcome-confirm'}});
  const advance=async milliseconds=>{
    now+=milliseconds;
    for(const [id,timer] of [...timers])if(timer.at<=now){timers.delete(id);await timer.callback();}
  };
  return {element,context,calls,notices,submit,encourage,advance};
}

test('welcome stays open until encouragement is clicked, then signs in once',async()=>{
  let finish;
  const app=boot(()=>new Promise(resolve=>{finish=resolve;}));
  app.submit();
  assert.equal(app.element('login-welcome-dialog').open,true);
  assert.match(app.element('login-welcome-frame').src,/mode=login/);
  await app.advance(10000);
  assert.equal(app.element('login-welcome-dialog').open,true);
  assert.equal(app.element('workspace').hidden,true);
  assert.equal(app.calls.length,0);
  app.submit();
  const login=app.encourage();
  assert.equal(app.calls.length,1);
  assert.equal(app.calls[0].welcomeOpen,false);
  assert.equal(app.element('login-button').disabled,true);
  app.submit();
  app.encourage();
  assert.equal(app.calls.length,1);
  assert.equal(app.calls[0].email,'test@example.test');
  assert.equal(app.calls[0].password,'test-password');
  finish({data:{session:{user:{id:'test-user',email:'test@example.test'}}},error:null});
  await login;
  assert.equal(app.element('login-panel').hidden,true);
  assert.equal(app.element('workspace').hidden,false);
  assert.equal(app.element('password').value,'');
  assert.equal(vm.runInContext('activities[0].type',app.context),'login');
});

test('cancelling the welcome does not sign in and a retry waits for a click',async()=>{
  const app=boot();
  app.submit();
  app.element('login-welcome-dialog').close();
  await app.advance(10000);
  assert.equal(app.calls.length,0);
  assert.equal(app.element('login-button').disabled,false);
  assert.equal(app.element('login-panel').hidden,false);
  assert.equal(app.element('workspace').hidden,true);
  app.submit();
  await app.advance(10000);
  assert.equal(app.calls.length,0);
  await app.encourage();
  assert.equal(app.calls.length,1);
  assert.equal(app.element('workspace').hidden,false);
});

test('invalid credentials, network errors, and missing sessions return to the login screen',async()=>{
  for(const signIn of [
    async()=>({data:{},error:{message:'invalid'}}),
    async()=>{throw new Error('offline');},
    async()=>({data:{session:null},error:null})
  ]){
    const app=boot(signIn);
    app.submit();
    await app.encourage();
    assert.equal(app.element('login-welcome-dialog').open,false);
    assert.equal(app.element('login-panel').hidden,false);
    assert.equal(app.element('workspace').hidden,true);
    assert.equal(app.element('login-button').disabled,false);
    assert.equal(app.element('password').value,'');
    assert.equal(app.notices.at(-1).error,true);
    app.submit();
    assert.equal(app.element('login-welcome-dialog').open,true);
  }
});

test('confirmation messages from other windows are ignored',async()=>{
  const app=boot();
  app.submit();
  app.context.window.handlers.message({source:{},data:{type:'login-welcome-confirm'}});
  assert.equal(app.element('login-welcome-dialog').open,true);
  assert.equal(app.calls.length,0);
  app.encourage();
  assert.equal(app.calls.length,1);
});

test('welcome HTML shows only the message card in login mode',()=>{
  const nodes=new Map(),posted=[],bodyClasses=[];
  const element=id=>{
    if(!nodes.has(id))nodes.set(id,{textContent:'',hidden:false,
      addEventListener(type,handler){this[type]=handler;}});
    return nodes.get(id);
  };
  const context=vm.createContext({
    document:{getElementById:element,body:{classList:{add(name){bodyClasses.push(name);}}}},
    window:{location:{search:'?mode=login',origin:'http://localhost'},parent:{postMessage(message){posted.push(message);},matchMedia:()=>({matches:false})}},
    URLSearchParams
  });
  const html=readFileSync('로그인 환영인사.html','utf8');
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);
  assert.equal(bodyClasses.length,1);
  assert.equal(bodyClasses[0],'popup-only');
  assert.equal(element('btn').hidden,false);
  assert.ok(element('message').textContent);
  assert.doesNotMatch(element('count').textContent,/3초|자동/);
  element('btn').click();
  assert.equal(posted.length,1);
  assert.equal(posted[0].type,'login-welcome-confirm');
});

test('welcome card is enlarged only on wide screens',()=>{
  const bodyClasses=[];
  const element=()=>({textContent:'',hidden:false,addEventListener(){}});
  const context=vm.createContext({
    document:{getElementById:element,body:{classList:{add(name){bodyClasses.push(name);}}}},
    window:{location:{search:'?mode=login',origin:'http://localhost'},parent:{postMessage(){},matchMedia:()=>({matches:true})}},
    URLSearchParams
  });
  const html=readFileSync('로그인 환영인사.html','utf8');
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);
  assert.deepEqual(bodyClasses,['popup-only','popup-large']);
});

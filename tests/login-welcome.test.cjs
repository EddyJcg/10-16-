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
      contentDocument:{URL:'http://localhost/welcome',getElementById:()=>({})},
      addEventListener(type,handler){this.handlers[type]=handler;},
      showModal(){this.open=true;},
      close(){this.open=false;this.handlers.close?.();},
      classList:{toggle(){}},setAttribute(){}
    });
    return nodes.get(id);
  };
  const context=vm.createContext({
    document:{getElementById:element},
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
  const loaded=()=>element('login-welcome-frame').handlers.load();
  const advance=async milliseconds=>{
    now+=milliseconds;
    for(const [id,timer] of [...timers])if(timer.at<=now){timers.delete(id);await timer.callback();}
  };
  return {element,context,calls,notices,submit,loaded,advance};
}

test('one login click displays the loaded welcome for 3000ms and closes it before signing in',async()=>{
  let finish;
  const app=boot(()=>new Promise(resolve=>{finish=resolve;}));
  app.submit();
  assert.equal(app.element('login-welcome-dialog').open,true);
  assert.match(app.element('login-welcome-frame').src,/mode=login/);
  assert.equal(app.calls.length,0);
  assert.equal(app.element('workspace').hidden,true);
  await app.advance(3000);
  assert.equal(app.calls.length,0,'loading time must not count toward the welcome display');
  app.loaded();
  await app.advance(2999);
  assert.equal(app.element('login-welcome-dialog').open,true);
  assert.equal(app.calls.length,0);
  app.loaded();
  app.submit();
  const login=app.advance(1);
  assert.equal(app.calls.length,1);
  assert.equal(app.calls[0].welcomeOpen,false,'welcome must close before the authentication request');
  assert.equal(app.element('login-button').disabled,true);
  app.submit();
  assert.equal(app.calls.length,1);
  assert.equal(app.calls[0].email,'test@example.test');
  assert.equal(app.calls[0].password,'test-password');
  finish({data:{session:{user:{id:'test-user',email:'test@example.test'}}},error:null});
  await login;
  assert.equal(app.element('login-welcome-dialog').open,false);
  assert.equal(app.element('login-panel').hidden,true);
  assert.equal(app.element('workspace').hidden,false);
  assert.equal(app.element('password').value,'');
  assert.equal(vm.runInContext('activities[0].type',app.context),'login');
});

test('cancellation clears the countdown and a retry starts a fresh three-second display',async()=>{
  const app=boot();
  app.submit();
  app.loaded();
  await app.advance(2000);
  assert.equal(app.calls.length,0);
  app.element('close-login-welcome').handlers.click();
  await app.advance(3000);
  assert.equal(app.calls.length,0);
  assert.equal(app.element('login-button').disabled,false);
  assert.equal(app.element('login-panel').hidden,false);
  assert.equal(app.element('workspace').hidden,true);
  app.submit();
  app.loaded();
  await app.advance(2999);
  assert.equal(app.element('login-welcome-dialog').open,true);
  assert.equal(app.calls.length,0);
  await app.advance(1);
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
    app.loaded();
    await app.advance(3000);
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

test('failed welcome loading reports an error without scheduling authentication',async()=>{
  const app=boot();
  app.submit();
  const frame=app.element('login-welcome-frame');
  frame.contentDocument={URL:'about:blank'};
  frame.handlers.load();
  assert.equal(app.element('login-welcome-dialog').open,true);
  frame.contentDocument={URL:'http://localhost/missing',getElementById:()=>null};
  frame.handlers.load();
  assert.equal(app.element('login-welcome-dialog').open,false);
  assert.equal(app.element('login-button').disabled,false);
  assert.equal(app.calls.length,0);
  assert.equal(app.notices.at(-1).error,true);
  await app.advance(3000);
  assert.equal(app.calls.length,0);
});

test('welcome HTML greets immediately in login mode without requiring a button click',()=>{
  const nodes=new Map();
  const element=id=>{
    if(!nodes.has(id))nodes.set(id,{textContent:'',disabled:false,
      addEventListener(type,handler){this[type]=handler;}});
    return nodes.get(id);
  };
  const context=vm.createContext({
    document:{getElementById:element},
    window:{location:{search:'?mode=login',origin:'http://localhost'},
      parent:{}},
    URLSearchParams
  });
  const html=readFileSync('로그인 환영인사.html','utf8');
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);
  assert.equal(element('btn').hidden,true);
  assert.ok(element('message').textContent);
  assert.match(element('count').textContent,/3초 후 자동으로 로그인/);
  element('btn').click();
});

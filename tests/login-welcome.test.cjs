const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');

function boot(signIn=async()=>({data:{session:{user:{id:'test-user'}}},error:null})){
  const nodes=new Map(),handlers={},calls=[],notices=[];
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
    window:{location:{origin:'http://localhost'},addEventListener:(type,handler)=>{handlers[type]=handler;}},
    testClient:{auth:{signInWithPassword:async credentials=>{calls.push(credentials);return signIn();}},
      removeAllChannels(){}},
    notices,activities:[],clearTimeout(){}
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
  const confirm=(overrides={})=>handlers.message({
    origin:'http://localhost',source:element('login-welcome-frame').contentWindow,
    data:{type:'inventory-login-welcome-confirm'},...overrides
  });
  return {element,context,calls,notices,submit,confirm};
}

test('form submission waits for one welcome click before signing in and closes both screens',async()=>{
  let finish;
  const app=boot(()=>new Promise(resolve=>{finish=resolve;}));
  app.submit();
  assert.equal(app.element('login-welcome-dialog').open,true);
  assert.match(app.element('login-welcome-frame').src,/mode=login/);
  assert.equal(app.calls.length,0);
  assert.equal(app.element('workspace').hidden,true);
  const login=app.confirm();
  await app.confirm();
  app.element('close-login-welcome').handlers.click();
  let prevented=false;
  app.element('login-welcome-dialog').handlers.cancel({preventDefault(){prevented=true;}});
  assert.equal(prevented,true);
  assert.equal(app.element('login-welcome-dialog').open,true);
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

test('cancellation and messages from other frames or origins never sign in',async()=>{
  const app=boot();
  app.submit();
  await app.confirm({origin:'https://other.example'});
  await app.confirm({source:{}});
  await app.confirm({data:{type:'other'}});
  assert.equal(app.calls.length,0);
  app.element('close-login-welcome').handlers.click();
  await app.confirm();
  assert.equal(app.calls.length,0);
  assert.equal(app.element('login-button').disabled,false);
  assert.equal(app.element('login-panel').hidden,false);
  assert.equal(app.element('workspace').hidden,true);
  app.submit();
  assert.equal(app.element('login-welcome-dialog').open,true);
});

test('invalid credentials, network errors, and missing sessions return to the login screen',async()=>{
  for(const signIn of [
    async()=>({data:{},error:{message:'invalid'}}),
    async()=>{throw new Error('offline');},
    async()=>({data:{session:null},error:null})
  ]){
    const app=boot(signIn);
    app.submit();
    await app.confirm();
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

test('failed welcome loading reports an error without submitting credentials',()=>{
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
});

test('welcome HTML greets immediately in login mode and sends confirmation only once',()=>{
  const nodes=new Map(),sent=[];
  const element=id=>{
    if(!nodes.has(id))nodes.set(id,{textContent:'',disabled:false,
      addEventListener(type,handler){this[type]=handler;}});
    return nodes.get(id);
  };
  const context=vm.createContext({
    document:{getElementById:element},
    window:{location:{search:'?mode=login',origin:'http://localhost'},
      parent:{postMessage:(data,origin)=>sent.push({data,origin})}},
    URLSearchParams
  });
  const html=readFileSync('로그인 환영인사.html','utf8');
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);
  assert.equal(element('btn').textContent,'로그인하기');
  assert.ok(element('message').textContent);
  element('btn').click();
  element('btn').click();
  assert.equal(sent.length,1);
  assert.equal(sent[0].data.type,'inventory-login-welcome-confirm');
  assert.equal(sent[0].origin,'http://localhost');
});

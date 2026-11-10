const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');

function setup(storage=new Map()){
  const fields=new Map(),calls=[],alerts=[];
  const field=id=>{
    if(!fields.has(id))fields.set(id,{value:'',textContent:'',open:false,
      reset(){},showModal(){this.open=true;},close(){this.open=false;},replaceChildren(){},append(){}});
    return fields.get(id);
  };
  const context=vm.createContext({
    document:{getElementById:field,createElement:()=>({})},
    window:{alert:message=>alerts.push(message),localStorage:{
      getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)
    }},
    crypto:{randomUUID:()=> 'request'},calls
  });
  vm.runInContext(readFileSync('inventory-model.js','utf8'),context);
  vm.runInContext(readFileSync('inventory-app.js','utf8'),context);
  vm.runInContext(`currentUser={id:'u1'};items=[
    {id:'p1',product_code:'SKU1',product_name:'품목1',unit:'EA(개)'},
    {id:'p2',product_code:'SKU2',product_name:'품목2',unit:'EA(개)'}
  ];client={rpc:async(name,args)=>{calls.push({name,args});return {data:{sequence_id:1,quantity:args.p_quantity,amount:args.p_quantity*args.p_unit_cost},error:null};}};
  loadStock=async()=>{};notify=()=>{};`,context);
  return {context,field,storage,calls,alerts,run:code=>vm.runInContext(code,context)};
}

test('opening accepts unit cost first and saves a durable user/product draft without a stock RPC',async()=>{
  const s=setup();
  s.run("openMovement('opening')");
  assert.equal(s.field('movement_quantity').required,false);
  assert.equal(s.field('save-movement').textContent,'단가 임시 저장');
  s.field('product_code').value='SKU1';s.run('populateProduct()');
  s.field('movement_cost').value='1234.56';
  await s.run('saveMovement({preventDefault(){}})');
  assert.equal(s.calls.length,0);
  assert.equal(s.storage.get('inventory-opening-cost-draft:u1:p1'),'1234.56');
  assert.match(s.field('form-message').textContent,/재고에는 반영되지 않았습니다/);
  assert.equal(s.field('movement-dialog').open,true);

  const reopened=setup(s.storage);
  reopened.run("openMovement('opening')");
  reopened.field('product_code').value='SKU1';reopened.run('populateProduct()');
  assert.equal(reopened.field('movement_cost').value,'1234.56');
  assert.match(reopened.field('form-message').textContent,/불러왔습니다/);
  reopened.field('product_code').value='SKU2';reopened.run('populateProduct()');
  assert.equal(reopened.field('movement_cost').value,'0','another item never inherits the saved price');
  reopened.run("currentUser={id:'u2'};openMovement('opening')");
  reopened.field('product_code').value='SKU1';reopened.run('populateProduct()');
  assert.equal(reopened.field('movement_cost').value,'0','another account never inherits the draft');
});

test('positive quantity posts real opening stock and clears draft only after success',async()=>{
  const s=setup(new Map([['inventory-opening-cost-draft:u1:p1','12.50']]));
  s.run("openMovement('opening')");s.field('product_code').value='SKU1';s.run('populateProduct()');
  s.field('movement_quantity').value='2';s.run('updateAmounts()');
  assert.equal(s.field('save-movement').textContent,'저장');
  assert.equal(s.field('movement_amount').value,'25');
  await s.run('saveMovement({preventDefault(){}})');
  assert.equal(s.calls.length,1);
  assert.equal(s.calls[0].name,'post_stock_movement');
  assert.equal(s.calls[0].args.p_quantity,2);
  assert.equal(s.calls[0].args.p_unit_cost,12.5);
  assert.equal(s.storage.size,0);
  assert.equal(s.field('movement-dialog').open,false);
});

test('failed formal posting preserves saved unit cost for retry',async()=>{
  const s=setup(new Map([['inventory-opening-cost-draft:u1:p1','12.50']]));
  s.run("openMovement('opening')");s.field('product_code').value='SKU1';s.run('populateProduct()');
  s.field('movement_quantity').value='2';
  s.run("client.rpc=async()=>({error:{message:'OPENING_ALREADY_STARTED'}})");
  await s.run('saveMovement({preventDefault(){}})');
  assert.equal(s.storage.get('inventory-opening-cost-draft:u1:p1'),'12.50');
  assert.equal(s.field('movement-dialog').open,true);
});

test('draft rejects invalid prices, reports storage errors and preserves receipt/issue quantity rules',async()=>{
  const s=setup();s.run("openMovement('opening')");
  s.field('product_code').value='SKU1';s.run('populateProduct()');
  for(const value of ['','-1','1.001','1000000001','NaN']){
    s.field('movement_cost').value=value;
    await s.run('saveMovement({preventDefault(){}})');
    assert.match(s.field('form-message').textContent,/기초단가를 확인/);
    assert.equal(s.storage.size,0);
  }
  s.field('movement_cost').value='5';
  s.run("window.localStorage.setItem=()=>{throw new Error('저장 공간 부족')}");
  await s.run('saveMovement({preventDefault(){}})');
  assert.match(s.field('form-message').textContent,/임시 저장하지 못했습니다.*저장 공간 부족/);
  s.run("window.localStorage.getItem=()=>{throw new Error('읽기 실패')};selectedCode='';populateProduct()");
  assert.match(s.field('form-message').textContent,/불러오지 못했습니다.*읽기 실패/);
  for(const mode of ['receipt','issue']){
    s.run(`mode='${mode}'`);s.field('movement_quantity').value='';
    await s.run('saveMovement({preventDefault(){}})');
    assert.match(s.field('form-message').textContent,/수량은 양의 정수/);
  }
  s.run("mode='opening';editingMovementId='existing'");s.field('movement_quantity').value='';
  await s.run('saveMovement({preventDefault(){}})');
  assert.match(s.field('form-message').textContent,/수량은 양의 정수/);
  assert.equal(s.calls.length,0);
});

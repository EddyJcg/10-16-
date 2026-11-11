const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

test('저장된 수주 표는 품목별 수정·삭제 버튼을 표시한다',()=>{
  class Element{
    constructor(){this.children=[];this.dataset={};this.classList={toggle(){}};}
    append(...children){this.children.push(...children);}
    replaceChildren(...children){this.children=children;}
    setAttribute(){}
  }
  const body=new Element();
  const context=vm.createContext({
    document:{getElementById:()=>body,createElement:()=>new Element()},
    makeCell:value=>({textContent:String(value)}),number:String,money:String
  });
  vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),context);
  vm.runInContext(`salesOrders=[{id:'one',sequence_id:1,order_date:'2026-01-01',due_date:'2026-12-01',
    order_number:'SO-1',product_name:'품목'}];renderSalesOrders()`,context);
  const buttons=body.children[0].children[17].children;
  assert.deepEqual(buttons.map(button=>button.textContent),['수정','삭제']);
  assert.equal(buttons[0].dataset.salesOrderId,'one');
  assert.equal(buttons[1].dataset.deleteSalesOrderId,'one');
});

test('삭제 확인 후 선택한 저장 수주만 제거하고 다른 수주는 보존한다',async()=>{
  const elements=new Map(),calls=[];
  const element=id=>{
    if(!elements.has(id))elements.set(id,{textContent:'',disabled:false});
    return elements.get(id);
  };
  const context=vm.createContext({
    document:{getElementById:element},window:{confirm:()=>true,alert(){}},salesOrderStatus:()=> '진행',
    testClient:{rpc:async(name,args)=>{calls.push([name,args]);return {data:{id:args.p_order_id},error:null};}}
  });
  vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),context);
  vm.runInContext(`client=testClient;currentUser={id:'u'};authGeneration=1;salesDraftGroupId='group';
    salesOrders=[{id:'one',order_group_id:'group',order_number:'SO',product_name:'품목',shipped_quantity:0},
    {id:'two',order_group_id:'group',order_number:'SO',product_name:'다른 품목',shipped_quantity:0}];
    renderSalesOrders=()=>{};renderSalesStatus=()=>{};renderSalesRegister=()=>{};
    renderSalesBalance=()=>{};updateIssueSalesOrders=()=>{};updateSalesOrderSaveButton=()=>{};`,context);
  await vm.runInContext("deleteSalesOrder('one')",context);
  assert.equal(calls[0][0],'delete_sales_order_line');
  assert.equal(calls[0][1].p_order_id,'one');
  assert.equal(vm.runInContext('salesOrders.length',context),1);
  assert.equal(vm.runInContext('salesOrders[0].id',context),'two');
  assert.equal(vm.runInContext('salesDraftGroupId',context),'group');
  assert.match(element('sales-order-status').textContent,/삭제했습니다/);
  await vm.runInContext("deleteSalesOrder('two')",context);
  assert.equal(vm.runInContext('salesDraftGroupId',context),'');
});

test('출고된 수주와 설정되지 않은 삭제 RPC는 명확히 안내한다',async()=>{
  const elements=new Map(),alerts=[];
  const element=id=>{
    if(!elements.has(id))elements.set(id,{textContent:'',disabled:false});
    return elements.get(id);
  };
  const context=vm.createContext({document:{getElementById:element},
    window:{confirm:()=>true,alert:message=>alerts.push(message)},salesOrderStatus:()=> '진행',
    testClient:{rpc:async()=>({data:null,error:{code:'PGRST202'}})}});
  vm.runInContext(fs.readFileSync('inventory-app.js','utf8'),context);
  vm.runInContext(`client=testClient;currentUser={id:'u'};salesOrders=[
    {id:'one',order_group_id:'group',order_number:'SO',product_name:'품목',shipped_quantity:1}];
    renderSalesOrders=()=>{};updateSalesOrderSaveButton=()=>{};`,context);
  await vm.runInContext("deleteSalesOrder('one')",context);
  assert.match(alerts[0],/출고 처리/);
  vm.runInContext('salesOrders[0].shipped_quantity=0',context);
  await vm.runInContext("deleteSalesOrder('one')",context);
  assert.match(element('sales-order-status').textContent,/sales-order-groups\.sql/);
  assert.equal(vm.runInContext('salesOrders.length',context),1);
});
